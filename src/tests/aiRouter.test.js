import test from 'node:test';
import assert from 'node:assert';
import { createLLMRouter, AllProvidersFailedError } from '../services/ai/llmRouter.js';
import { loadProvidersFromConfig } from '../services/ai/providers.js';
import { chunkPages, buildIndex, selectContext, search, isSummaryIntent } from '../services/ai/retrieval.js';

// ─── helpers ─────────────────────────────────────────

const geminiOk = (text = 'gemini says hi') =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 42 } }), {
    status: 200,
  });
const openaiOk = (text = 'groq says hi') =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { total_tokens: 33 } }), { status: 200 });
const errRes = (status, message, headers = {}) =>
  new Response(JSON.stringify({ error: { message } }), { status, headers });

const silent = { warn() {} };
const REQ = { system: 'sys', messages: [{ role: 'user', content: 'q' }] };

const twoProviders = () => [
  { name: 'gemini', type: 'gemini', keys: ['g1', 'g2'], models: ['gem-a', 'gem-b'] },
  { name: 'groq', type: 'openai', baseUrl: 'https://groq.test/v1', keys: ['q1'], models: ['llama-a'] },
];

// ─── router ──────────────────────────────────────────

test('rotate strategy alternates the first provider tried', async () => {
  const hits = [];
  const fetchImpl = async (url) => {
    hits.push(url.includes('generativelanguage') ? 'gemini' : 'groq');
    return url.includes('generativelanguage') ? geminiOk() : openaiOk();
  };
  const r = createLLMRouter({ providers: twoProviders(), fetchImpl, log: silent });
  await r.generate(REQ);
  await r.generate(REQ);
  await r.generate(REQ);
  await r.generate(REQ);
  assert.deepStrictEqual(hits, ['gemini', 'groq', 'gemini', 'groq']);
});

test('failover strategy always starts with the first provider', async () => {
  const hits = [];
  const fetchImpl = async (url) => {
    hits.push(url.includes('generativelanguage') ? 'gemini' : 'groq');
    return geminiOk();
  };
  const r = createLLMRouter({ providers: twoProviders(), strategy: 'failover', fetchImpl, log: silent });
  await r.generate(REQ);
  await r.generate(REQ);
  assert.deepStrictEqual(hits, ['gemini', 'gemini']);
});

test('API keys rotate within a provider', async () => {
  const keys = [];
  const fetchImpl = async (url, opts) => {
    keys.push(opts.headers['x-goog-api-key']);
    return geminiOk();
  };
  const r = createLLMRouter({
    providers: [twoProviders()[0]],
    strategy: 'failover',
    fetchImpl,
    log: silent,
  });
  await r.generate(REQ);
  await r.generate(REQ);
  await r.generate(REQ);
  assert.deepStrictEqual(keys, ['g1', 'g2', 'g1']);
});

test('429 on one provider fails over to the next and the slot is skipped afterwards', async () => {
  let geminiCalls = 0;
  const fetchImpl = async (url) => {
    if (url.includes('generativelanguage')) {
      geminiCalls++;
      return errRes(429, 'Resource has been exhausted (e.g. check quota).', { 'retry-after': '30' });
    }
    return openaiOk('from groq');
  };
  let t = 1_000_000;
  const providers = [
    { name: 'gemini', type: 'gemini', keys: ['g1'], models: ['gem-a'] },
    { name: 'groq', type: 'openai', baseUrl: 'https://groq.test/v1', keys: ['q1'], models: ['llama-a'] },
  ];
  const r = createLLMRouter({ providers, strategy: 'failover', fetchImpl, now: () => t, log: silent });

  const first = await r.generate(REQ);
  assert.strictEqual(first.provider, 'groq');
  assert.strictEqual(first.text, 'from groq');
  assert.strictEqual(geminiCalls, 1);

  // Within the cooldown window gemini isn't touched again
  t += 10_000;
  await r.generate(REQ);
  assert.strictEqual(geminiCalls, 1);

  // After Retry-After (30 s) expires it is probed again
  t += 25_000;
  await r.generate(REQ);
  assert.strictEqual(geminiCalls, 2);
});

test('an exhausted provider with many slots cannot starve a healthy one (interleaved plan)', async () => {
  const order = [];
  const fetchImpl = async (url) => {
    const name = url.includes('generativelanguage') ? 'gemini' : 'groq';
    order.push(name);
    return name === 'gemini' ? errRes(429, 'quota') : openaiOk('groq to the rescue');
  };
  // gemini has 2 keys x 2 models = 4 slots; default budget is 4 attempts
  const r = createLLMRouter({ providers: twoProviders(), strategy: 'failover', fetchImpl, log: silent });
  const out = await r.generate(REQ);
  assert.strictEqual(out.provider, 'groq');
  assert.deepStrictEqual(order, ['gemini', 'groq']);
});

test('invalid API key disables that key for every model; the other key keeps working', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => {
    const key = opts.headers['x-goog-api-key'];
    seen.push(key);
    if (key === 'g1') return errRes(400, 'API key not valid. Please pass a valid API key.');
    return geminiOk('ok via g2');
  };
  const r = createLLMRouter({
    providers: [twoProviders()[0]],
    strategy: 'failover',
    fetchImpl,
    log: silent,
  });
  const a = await r.generate(REQ);
  assert.strictEqual(a.text, 'ok via g2');
  seen.length = 0;
  await r.generate(REQ);
  await r.generate(REQ);
  assert.ok(seen.every((k) => k === 'g2'), `g1 should never be retried, saw ${seen}`);
});

test('404 (model gone) disables only that model, not the provider', async () => {
  const models = [];
  const fetchImpl = async (url) => {
    const model = decodeURIComponent(url.match(/models\/([^:]+):/)[1]);
    models.push(model);
    if (model === 'gem-a') return errRes(404, 'models/gem-a is not found');
    return geminiOk();
  };
  const r = createLLMRouter({
    providers: [{ name: 'gemini', type: 'gemini', keys: ['g1'], models: ['gem-a', 'gem-b'] }],
    fetchImpl,
    log: silent,
  });
  const out = await r.generate(REQ);
  assert.strictEqual(out.model, 'gem-b');
  models.length = 0;
  await r.generate(REQ);
  assert.deepStrictEqual(models, ['gem-b']);
});

test('5xx and network errors fail over', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('generativelanguage')) return errRes(503, 'overloaded');
    return openaiOk('rescued');
  };
  const r = createLLMRouter({ providers: twoProviders(), strategy: 'failover', fetchImpl, log: silent, maxAttempts: 10 });
  assert.strictEqual((await r.generate(REQ)).text, 'rescued');

  const netFail = async (url) => {
    if (url.includes('generativelanguage')) throw new TypeError('fetch failed');
    return openaiOk('rescued2');
  };
  const r2 = createLLMRouter({ providers: twoProviders(), strategy: 'failover', fetchImpl: netFail, log: silent, maxAttempts: 10 });
  assert.strictEqual((await r2.generate(REQ)).text, 'rescued2');
});

test('a hung provider is aborted by the timeout and the next one answers', async () => {
  const fetchImpl = (url, opts) => {
    if (url.includes('generativelanguage')) {
      return new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return Promise.resolve(openaiOk('fast'));
  };
  const r = createLLMRouter({
    providers: twoProviders(),
    strategy: 'failover',
    fetchImpl,
    timeoutMs: 30,
    log: silent,
    maxAttempts: 10,
  });
  assert.strictEqual((await r.generate(REQ)).text, 'fast');
});

test('empty / safety-blocked answers move on without cooling the slot down', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    if (url.includes('generativelanguage')) {
      calls++;
      return new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }), { status: 200 });
    }
    return openaiOk('safe answer');
  };
  const r = createLLMRouter({ providers: twoProviders(), strategy: 'failover', fetchImpl, log: silent, maxAttempts: 10 });
  assert.strictEqual((await r.generate(REQ)).text, 'safe answer');
  const before = calls;
  await r.generate(REQ);
  assert.ok(calls > before, 'blocked responses are about the request, so the slot must stay available');
});

test('maxAttempts bounds the number of upstream calls', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return errRes(503, 'down');
  };
  const r = createLLMRouter({ providers: twoProviders(), fetchImpl, log: silent, maxAttempts: 2 });
  await assert.rejects(() => r.generate(REQ), AllProvidersFailedError);
  assert.strictEqual(calls, 2);
});

test('all slots exhausted → AllProvidersFailedError with retry hint; no calls while cooling down', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return errRes(429, 'rate limited', { 'retry-after': '45' });
  };
  let t = 0;
  const r = createLLMRouter({ providers: twoProviders(), fetchImpl, now: () => t, log: silent, maxAttempts: 20 });
  await assert.rejects(
    () => r.generate(REQ),
    (e) => e instanceof AllProvidersFailedError && e.retryAfterMs > 0 && e.retryAfterMs <= 45_000
  );
  const used = calls;
  await assert.rejects(() => r.generate(REQ), AllProvidersFailedError);
  assert.strictEqual(calls, used, 'must not hammer providers that are cooling down');
});

test('no providers configured → notConfigured error', async () => {
  const r = createLLMRouter({ providers: [], log: silent });
  assert.strictEqual(r.isConfigured(), false);
  await assert.rejects(() => r.generate(REQ), (e) => e.notConfigured === true);
});

test('getStatus never exposes API keys', () => {
  const r = createLLMRouter({ providers: twoProviders(), log: silent });
  const dump = JSON.stringify(r.getStatus());
  assert.ok(!dump.includes('g1') && !dump.includes('q1'));
});

// ─── config loading ──────────────────────────────────

test('providers without keys are skipped; GEMINI_API_KEY (singular) works; order is respected', () => {
  const p = loadProvidersFromConfig({
    AI_PROVIDER_ORDER: 'groq,gemini,openrouter',
    GEMINI_API_KEY: 'abc',
    GROQ_API_KEYS: 'k1, k2 ,',
  });
  assert.deepStrictEqual(p.map((x) => x.name), ['groq', 'gemini']);
  assert.deepStrictEqual(p[0].keys, ['k1', 'k2']);
  assert.ok(p[1].models.includes('gemini-2.5-flash'));
  assert.deepStrictEqual(loadProvidersFromConfig({}), []);
});

// ─── retrieval ───────────────────────────────────────

const pages = [
  'Chapter 1. Laplace transform definition. The Laplace transform of f(t) is the integral from zero to infinity of e to the minus st times f(t) dt. It converts differential equations into algebraic equations.',
  'Chapter 2. Fourier series. A periodic function can be written as a sum of sines and cosines. Dirichlet conditions must hold for convergence.',
  'Chapter 3. Eigenvalues and eigenvectors. A matrix A has eigenvalue lambda if Av equals lambda v. Characteristic polynomial determinant of A minus lambda I.',
];
const bigPages = Array.from({ length: 30 }, (_, i) =>
  i === 17
    ? 'Heat equation. The heat equation u_t = k u_xx models diffusion of temperature along a rod with fixed boundary conditions. Separation of variables gives exponentially decaying modes. '.repeat(3)
    : `Filler page ${i}. ` + 'Generic discussion of unrelated numerical recipes and notation conventions used throughout the booklet. '.repeat(4)
);

test('short documents are sent whole', () => {
  const idx = buildIndex(chunkPages(pages));
  const ctx = selectContext(idx, { question: 'what is eigenvalue?', maxChars: 7000 });
  assert.strictEqual(ctx.mode, 'full');
  assert.deepStrictEqual(ctx.pages, [1, 2, 3]);
});

test('long documents: retrieval picks the relevant page, not the whole book', () => {
  const idx = buildIndex(chunkPages(bigPages));
  assert.ok(idx.totalChars > 7000);
  const ctx = selectContext(idx, { question: 'How does separation of variables solve the heat equation?', maxChars: 3000 });
  assert.strictEqual(ctx.mode, 'retrieved');
  assert.ok(ctx.pages.includes(18), `expected page 18, got ${ctx.pages}`);
  const sent = ctx.selected.reduce((n, c) => n + c.text.length, 0);
  assert.ok(sent <= 3000 + 1400, 'context budget respected');
});

test('question with no overlap at all reports hasMatch=false (no API call needed)', () => {
  const idx = buildIndex(chunkPages(bigPages));
  const ctx = selectContext(idx, { question: 'Who won the cricket world cup?', maxChars: 3000 });
  assert.strictEqual(ctx.hasMatch, false);
  assert.strictEqual(ctx.selected.length, 0);
});

test('summary requests get evenly sampled coverage including the start', () => {
  const idx = buildIndex(chunkPages(bigPages));
  assert.ok(isSummaryIntent('Summarize this PDF'));
  assert.ok(isSummaryIntent('what are the key points?'));
  assert.ok(!isSummaryIntent('what is the heat equation'));
  const ctx = selectContext(idx, { question: 'Summarize this PDF', maxChars: 4000 });
  assert.strictEqual(ctx.mode, 'sampled');
  assert.strictEqual(ctx.pages[0], 1);
  assert.ok(ctx.pages.length > 3 && ctx.pages[ctx.pages.length - 1] > 10, `coverage too narrow: ${ctx.pages}`);
});

test('short follow-ups borrow the previous question for retrieval', () => {
  const idx = buildIndex(chunkPages(bigPages));
  const history = [
    { role: 'user', content: 'What does the heat equation model?' },
    { role: 'assistant', content: 'It models diffusion of temperature.' },
  ];
  const ctx = selectContext(idx, { question: 'explain more', history, maxChars: 3000 });
  assert.ok(ctx.hasMatch);
  assert.ok(ctx.pages.includes(18));
});

test('stemming lets "transforms" match "transform"', () => {
  const idx = buildIndex(chunkPages(pages));
  assert.ok(search(idx, 'transforms')[0]);
});
