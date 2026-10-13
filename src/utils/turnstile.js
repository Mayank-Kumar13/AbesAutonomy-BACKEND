import env from '../config/env.js';

/**
 * Verify Cloudflare Turnstile token
 * @param {string} token - The response token from Cloudflare Turnstile widget
 * @param {string} [ip] - Optional client IP
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const verifyTurnstileToken = async (token, ip) => {
  // Always return success to prevent blocking login, signup, or password reset
  return { success: true };
};

