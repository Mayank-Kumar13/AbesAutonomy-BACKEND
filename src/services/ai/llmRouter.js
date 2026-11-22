/**
 * LLM router — spreads traffic across several providers / models / API keys and fails over
 * automatically, so one exhausted free-tier quota never takes the AI assistant down.
 *
 * How a request is served:
 *   1. Provider order is rotated per request ("rotate" strategy), so each free tier only
 *      receives roughly 1/N of the traffic. ("failover" strategy always starts at the first.)
 *   2. Within a provider: models are tried in the configured order (best first); for each
 *      model, the API key that goes first is rotated. Attempts are interleaved across providers
 *      (A1, B1, A2, B2…) so one exhausted provider can't burn the whole attempt budget.
 *   3. Any slot (provider+model+key) that recently failed is skipped until its cooldown ends:
 *        rate limit  → Retry-After if the API gave one, else 60 s
 *        daily quota → 1 h
 *        bad key     → that key is disabled for 6 h (all models)
 *        404 model   → that model is disabled for 6 h
 *        5xx/timeout → 30 s
 *   4. At most `maxAttempts` upstream calls are made per request, so latency stays bounded.
 */

import { ADAPTERS, ProviderError } from './providers.js';

export class AllProvidersFailedError extends Error {
  constructor(message, { attempts = [], retryAfterMs = 0, notConfigured = false } = {}) {
    super(message);
    this.name = 'AllProvidersFailedError';
    this.attempts = attempts;
    this.retryAfterMs = retryAfterMs;
    this.notConfigured = notConfigured;
  }
}

const MIN = 60_000;
const HOUR = 60 * MIN;

const COOLDOWNS = {
  rate_limit: { slot: 60_000, useRetryAfter: true },
  quota_daily: { slot: HOUR, useRetryAfter: false },
  server: { slot: 30_000, useRetryAfter: true },
  timeout: { slot: 30_000, useRetryAfter: false },
  network: { slot: 30_000, useRetryAfter: false },
  not_found: { slot: 6 * HOUR, useRetryAfter: false },
  // These say something about the request, not the slot: just move on, no cooldown.
  too_large: { slot: 0, useRetryAfter: false },
  blocked: { slot: 0, useRetryAfter: false },
  empty: { slot: 0, useRetryAfter: false },
  bad_request: { slot: 0, useRetryAfter: false },
};
const KEY_DISABLE_MS = 6 * HOUR;

const rotate = (arr, offset) => {
  if (arr.length <= 1) return arr.slice();
  const n = offset % arr.length;
  return arr.slice(n).concat(arr.slice(0, n));
};

/**
 * @param {object} options
 * @param {Array<{name:string,type:'gemini'|'openai',baseUrl?:string,keys:string[],models:string[],extraHeaders?:object}>} options.providers
 * @param {'rotate'|'failover'} [options.strategy]
 * @param {number} [options.timeoutMs]       per upstream call
 * @param {number} [options.maxAttempts]     upstream calls per request
 * @param {Function} [options.fetchImpl]
 * @param {() => number} [options.now]
 * @param {{warn:Function}} [options.log]
 */
export const createLLMRouter = ({
  providers,
  strategy = 'rotate',
  timeoutMs = 15_000,
  maxAttempts = 4,
  fetchImpl = (...args) => globalThis.fetch(...args), // resolved lazily, at call time
  now = Date.now,
  log = console,
}) => {
  const slotCooldownUntil = new Map(); // slotId → ts
  const keyDisabledUntil = new Map(); //  `${provider}#${keyIndex}` → ts
  const keyCursor = new Map(); //          `${provider}:${model}` → counter
  let providerCursor = 0;

  const slotId = (p, model, keyIndex) => `${p.name}:${model}#${keyIndex}`;
  const keyId = (p, keyIndex) => `${p.name}#${keyIndex}`;

  const isAvailable = (p, model, keyIndex) => {
    const t = now();
    return (
      (slotCooldownUntil.get(slotId(p, model, keyIndex)) || 0) <= t &&
      (keyDisabledUntil.get(keyId(p, keyIndex)) || 0) <= t
    );
  };

  const isConfigured = () => providers.length > 0;

  /**
   * Ordered list of slots to try for one request.
   *
   * Each provider gets its own ordered slot list (models best-first; keys rotated per model).
   * The final plan INTERLEAVES those lists — A1, B1, C1, A2, B2, … — so a provider that is out
   * of quota can never use up the whole attempt budget before a healthy one is reached.
   */
  const buildPlan = () => {
    const start = strategy === 'rotate' ? providerCursor++ % Math.max(providers.length, 1) : 0;
    const ordered = rotate(providers, start);

    const lists = ordered.map((p) => {
      const slots = [];
      for (const model of p.models) {
        const cursorKey = `${p.name}:${model}`;
        const c = keyCursor.get(cursorKey) || 0;
        keyCursor.set(cursorKey, c + 1);
        for (const keyIndex of rotate(p.keys.map((_, i) => i), c)) slots.push({ p, model, keyIndex });
      }
      return slots;
    });

    const plan = [];
    const longest = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < longest; i++) {
      for (const list of lists) if (list[i]) plan.push(list[i]);
    }
    return plan;
  };

  const earliestRetryMs = () => {
    const t = now();
    let min = Infinity;
    for (const p of providers) {
      for (const model of p.models) {
        for (let i = 0; i < p.keys.length; i++) {
          const until = Math.max(
            slotCooldownUntil.get(slotId(p, model, i)) || 0,
            keyDisabledUntil.get(keyId(p, i)) || 0
          );
          min = Math.min(min, Math.max(0, until - t));
        }
      }
    }
    return Number.isFinite(min) ? min : 0;
  };

  const registerFailure = (p, model, keyIndex, err) => {
    const rule = COOLDOWNS[err.kind] || COOLDOWNS.server;
    if (err.kind === 'auth') {
      keyDisabledUntil.set(keyId(p, keyIndex), now() + KEY_DISABLE_MS);
      return;
    }
    if (rule.slot > 0) {
      const ms = rule.useRetryAfter && err.retryAfterMs > 0 ? err.retryAfterMs : rule.slot;
      // Cap runaway Retry-After values (e.g. "wait 12 hours") at 1 hour; we re-probe after that.
      slotCooldownUntil.set(slotId(p, model, keyIndex), now() + Math.min(ms, HOUR));
    }
  };

  /**
   * @param {{system:string, messages:{role:'user'|'assistant',content:string}[], maxTokens?:number, temperature?:number}} req
   * @returns {Promise<{text:string, provider:string, model:string, tokens:number, attempts:object[]}>}
   */
  const generate = async ({ system, messages, maxTokens = 700, temperature = 0.2 }) => {
    if (!isConfigured()) {
      throw new AllProvidersFailedError('No AI providers configured', { notConfigured: true });
    }

    const attempts = [];
    let made = 0;

    for (const { p, model, keyIndex } of buildPlan()) {
      if (made >= maxAttempts) break;
      if (!isAvailable(p, model, keyIndex)) continue;

      made += 1;
      const started = now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const adapter = ADAPTERS[p.type];
        const out = await adapter({
          apiKey: p.keys[keyIndex],
          model,
          system,
          messages,
          maxTokens,
          temperature,
          signal: controller.signal,
          fetchImpl,
          baseUrl: p.baseUrl,
          extraHeaders: p.extraHeaders,
        });
        attempts.push({ provider: p.name, model, ok: true, ms: now() - started });
        return { ...out, provider: p.name, model, attempts };
      } catch (raw) {
        const err = raw instanceof ProviderError ? raw : new ProviderError(raw?.message, { kind: 'server' });
        attempts.push({
          provider: p.name,
          model,
          ok: false,
          kind: err.kind,
          status: err.status,
          ms: now() - started,
        });
        registerFailure(p, model, keyIndex, err);
        // Never log the key; message from the vendor is safe and useful for operators.
        log.warn(`[AI] ${p.name}/${model} key#${keyIndex} failed (${err.kind}${err.status ? ' ' + err.status : ''}): ${String(err.message).slice(0, 160)}`);
      } finally {
        clearTimeout(timer);
      }
    }

    throw new AllProvidersFailedError('All AI providers are currently unavailable', {
      attempts,
      retryAfterMs: earliestRetryMs(),
    });
  };

  /** Snapshot for diagnostics (never includes keys). */
  const getStatus = () => {
    const t = now();
    return providers.map((p) => ({
      provider: p.name,
      keys: p.keys.length,
      models: p.models.map((model) => ({
        model,
        slots: p.keys.map((_, i) => ({
          key: i,
          available: isAvailable(p, model, i),
          cooldownSec: Math.ceil(
            Math.max(
              0,
              (slotCooldownUntil.get(slotId(p, model, i)) || 0) - t,
              (keyDisabledUntil.get(keyId(p, i)) || 0) - t
            ) / 1000
          ),
        })),
      })),
    }));
  };

  /** Forget all cooldowns / disabled keys (e.g. after rotating keys, or in tests). */
  const reset = () => {
    slotCooldownUntil.clear();
    keyDisabledUntil.clear();
    keyCursor.clear();
    providerCursor = 0;
  };

  return { generate, getStatus, isConfigured, reset };
};
