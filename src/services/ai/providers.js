/**
 * LLM provider adapters.
 *
 * Two wire formats cover almost every free-tier API:
 *   - "gemini"  → Google Generative Language API (native format)
 *   - "openai"  → OpenAI-compatible /chat/completions (Groq, OpenRouter, Cerebras, Mistral, …)
 *
 * Every adapter throws a ProviderError with a normalized `kind`, so the router can decide
 * what to do (cool the slot down, disable a bad key, or just try the next one) without
 * knowing anything about a specific vendor.
 */

export class ProviderError extends Error {
  /**
   * @param {string} message
   * @param {{status?: number, kind?: string, retryAfterMs?: number}} [opts]
   * kind: rate_limit | quota_daily | auth | not_found | too_large | blocked | empty |
   *       server | timeout | network | bad_request
   */
  constructor(message, { status = 0, kind = 'server', retryAfterMs = 0 } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

// ─── Error normalization ─────────────────────────────

const parseDurationMs = (text) => {
  if (!text) return 0;
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*(ms|s|m)\b/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 'ms') return Math.round(n);
  if (unit === 'm') return Math.round(n * 60_000);
  return Math.round(n * 1000);
};

const extractRetryAfterMs = (res, message, body) => {
  const header = res.headers?.get?.('retry-after');
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs)) return Math.round(secs * 1000);
  }
  // Groq: "Please try again in 7.5s"
  const fromMessage = parseDurationMs((message || '').match(/try again in ([\d.]+\s*(?:ms|s|m))/i)?.[1]);
  if (fromMessage) return fromMessage;
  // Gemini: error.details[].retryDelay = "34s"
  const details = body?.error?.details;
  if (Array.isArray(details)) {
    for (const d of details) {
      if (d?.retryDelay) {
        const ms = parseDurationMs(d.retryDelay);
        if (ms) return ms;
      }
    }
  }
  return 0;
};

const toProviderError = async (res) => {
  let bodyText = '';
  let body = null;
  try {
    bodyText = await res.text();
    body = JSON.parse(bodyText);
  } catch {
    /* non-JSON error body */
  }

  const message =
    body?.error?.message || body?.message || bodyText?.slice(0, 200) || `HTTP ${res.status}`;
  const retryAfterMs = extractRetryAfterMs(res, message, body);
  const status = res.status;

  if (status === 429) {
    const daily = /per[\s-]?day|daily|\bRPD\b|PerDay/i.test(`${message} ${bodyText}`);
    return new ProviderError(message, {
      status,
      kind: daily ? 'quota_daily' : 'rate_limit',
      retryAfterMs,
    });
  }
  if (status === 401 || status === 403) return new ProviderError(message, { status, kind: 'auth' });
  if (status === 404) return new ProviderError(message, { status, kind: 'not_found' });
  if (status === 413) return new ProviderError(message, { status, kind: 'too_large' });
  if (status === 400) {
    // Gemini reports an invalid / expired key as a 400 "API key not valid".
    if (/api key|api_key/i.test(message)) return new ProviderError(message, { status, kind: 'auth' });
    return new ProviderError(message, { status, kind: 'bad_request' });
  }
  return new ProviderError(message, { status, kind: 'server', retryAfterMs });
};

const wrapNetworkError = (err) => {
  if (err instanceof ProviderError) return err;
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
    return new ProviderError('Request timed out', { kind: 'timeout' });
  }
  return new ProviderError(err?.message || 'Network error', { kind: 'network' });
};

// ─── Gemini ──────────────────────────────────────────

export const callGemini = async ({
  apiKey,
  model,
  system,
  messages,
  maxTokens,
  temperature,
  signal,
  fetchImpl = fetch,
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
}) => {
  const generationConfig = { temperature, maxOutputTokens: maxTokens };
  // 2.5 Flash / Flash-Lite "think" by default, which burns output tokens and quota on a task
  // that doesn't need it. (2.5 Pro can't disable thinking, so it is excluded.)
  if (/^gemini-2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig,
  };

  let res;
  try {
    res = await fetchImpl(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw wrapNetworkError(err);
  }
  if (!res.ok) throw await toProviderError(res);

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw wrapNetworkError(err);
  }

  if (data?.promptFeedback?.blockReason) {
    throw new ProviderError(`Blocked: ${data.promptFeedback.blockReason}`, { kind: 'blocked' });
  }
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((p) => p?.text || '')
    .join('')
    .trim();
  if (!text) {
    const reason = candidate?.finishReason || 'no content';
    throw new ProviderError(`Empty response (${reason})`, {
      kind: /SAFETY|RECITATION|BLOCK/i.test(reason) ? 'blocked' : 'empty',
    });
  }
  return { text, tokens: data?.usageMetadata?.totalTokenCount || 0 };
};

// ─── OpenAI-compatible (Groq, OpenRouter, …) ─────────

export const callOpenAICompatible = async ({
  apiKey,
  model,
  system,
  messages,
  maxTokens,
  temperature,
  signal,
  fetchImpl = fetch,
  baseUrl,
  extraHeaders = {},
}) => {
  const body = {
    model,
    messages: [{ role: 'system', content: system }, ...messages],
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  // GPT-OSS on Groq is a reasoning model: by default it can spend most of the token budget
  // "thinking" and return little or no answer. Low effort keeps answers fast and cheap.
  if (/groq\.com/.test(baseUrl) && /^openai\/gpt-oss/.test(model)) body.reasoning_effort = 'low';

  let res;
  try {
    res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw wrapNetworkError(err);
  }
  if (!res.ok) throw await toProviderError(res);

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw wrapNetworkError(err);
  }

  // OpenRouter can return HTTP 200 with an `error` object when the upstream model failed.
  if (data?.error && !data?.choices?.length) {
    const code = Number(data.error.code) || 0;
    throw new ProviderError(data.error.message || 'Upstream error', {
      status: code,
      kind: code === 429 ? 'rate_limit' : code === 401 || code === 403 ? 'auth' : 'server',
    });
  }

  const choice = data?.choices?.[0];
  const text = (choice?.message?.content || '').trim();
  if (!text) {
    throw new ProviderError(`Empty response (${choice?.finish_reason || 'no content'})`, {
      kind: choice?.finish_reason === 'content_filter' ? 'blocked' : 'empty',
    });
  }
  return { text, tokens: data?.usage?.total_tokens || 0 };
};

export const ADAPTERS = {
  gemini: callGemini,
  openai: callOpenAICompatible,
};

// ─── Config from environment ─────────────────────────

const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Build the provider list from env-style config.
 * A provider is only enabled when it has at least one API key AND at least one model.
 *
 * @param {Record<string, string>} cfg  (usually the `env` object from config/env.js)
 */
export const loadProvidersFromConfig = (cfg) => {
  const defs = {
    gemini: {
      type: 'gemini',
      keys: splitList(cfg.GEMINI_API_KEYS || cfg.GEMINI_API_KEY),
      models: splitList(cfg.GEMINI_MODELS || 'gemini-3.8-flash,gemini-3.5-flash-lite'),
    },
    groq: {
      type: 'openai',
      baseUrl: 'https://api.groq.com/openai/v1',
      keys: splitList(cfg.GROQ_API_KEYS || cfg.GROQ_API_KEY),
      models: splitList(cfg.GROQ_MODELS || 'openai/gpt-oss-120b,openai/gpt-oss-20b'),
    },
    openrouter: {
      type: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      keys: splitList(cfg.OPENROUTER_API_KEYS || cfg.OPENROUTER_API_KEY),
      models: splitList(cfg.OPENROUTER_MODELS || 'meta-llama/llama-3.3-70b-instruct:free'),
      extraHeaders: { 'X-Title': 'ABES Autonomy' },
    },
  };

  const order = splitList(cfg.AI_PROVIDER_ORDER || 'gemini,groq,openrouter');
  const providers = [];
  for (const name of order) {
    const def = defs[name];
    if (!def) continue;
    if (def.keys.length === 0 || def.models.length === 0) continue;
    providers.push({ name, ...def });
  }
  return providers;
};
