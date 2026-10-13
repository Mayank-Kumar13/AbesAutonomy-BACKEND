import env from '../config/env.js';

/**
 * Verify Cloudflare Turnstile token
 * @param {string} token - The response token from Cloudflare Turnstile widget
 * @param {string} [ip] - Optional client IP
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const verifyTurnstileToken = async (token, ip) => {
  const secretKey =
    env.CLOUDFLARE_TURNSTILE_SECRET_KEY ||
    process.env.TURNSTILE_SECRET_KEY ||
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ||
    '0x4AAAAAAFV46cU3qYmuapfAVNysIf0YnIA';

  if (!token) {
    return { success: false, error: 'Please complete the security check.' };
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
      error: 'Security verification failed. Please try again.',
    };
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return { success: true };
  }
};


