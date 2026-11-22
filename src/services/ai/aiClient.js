import env from '../../config/env.js';
import { createLLMRouter } from './llmRouter.js';
import { loadProvidersFromConfig } from './providers.js';

const providers = loadProvidersFromConfig(env);

if (providers.length === 0) {
  console.warn('[AI] No AI providers configured (set GEMINI_API_KEYS and/or GROQ_API_KEYS). PDF chat is disabled.');
} else {
  const summary = providers.map((p) => `${p.name}(${p.keys.length} key, ${p.models.length} model)`).join(', ');
  console.info(`[AI] PDF chat providers: ${summary} — strategy: ${env.AI_STRATEGY}`);
}

/** Shared router instance — keeps cooldown state across requests. */
export const llm = createLLMRouter({
  providers,
  strategy: env.AI_STRATEGY,
  timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
});
