import env from '../config/env.js';

/**
 * Verify Cloudflare Turnstile token
 * @param {string} token - The response token from Cloudflare Turnstile widget
 * @param {string} [ip] - Optional client IP
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const verifyTurnstileToken = async (token, ip) => {
  const secretKey = env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

  // If secret key is not configured, bypass check gracefully
  if (!secretKey) {
    return { success: true };
  }

  if (!token) {
    return { success: false, error: 'Security verification token is required.' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const data = await response.json();
    if (data.success) {
      return { success: true };
    }

    return { 
      success: false, 
      error: data['error-codes'] ? data['error-codes'].join(', ') : 'Security verification failed.' 
    };
  } catch (error) {
    console.error('Turnstile verification error:', error);
    // On unexpected network error connecting to Cloudflare, fail open to avoid locking users out
    return { success: true };
  }
};
