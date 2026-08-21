import env from '../config/env.js';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

export const getGithubAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: env.GITHUB_REDIRECT_URI,
    scope: 'read:user user:email',
  });
  return `${GITHUB_AUTH_URL}?${params.toString()}`;
};

export const exchangeGithubCode = async (code) => {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_REDIRECT_URI,
    }),
  });
  if (!res.ok) throw new Error('Failed to exchange GitHub code');
  const data = await res.json();
  return data.access_token;
};

export const getGithubProfile = async (accessToken) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
  };

  const userRes = await fetch(GITHUB_USER_URL, { headers });
  if (!userRes.ok) throw new Error('Failed to fetch GitHub profile');
  const profile = await userRes.json();

  if (!profile.email) {
    const emailsRes = await fetch(GITHUB_EMAILS_URL, { headers });
    if (emailsRes.ok) {
      const emails = await emailsRes.json();
      const primary = emails.find((e) => e.primary) || emails[0];
      if (primary) profile.email = primary.email;
    }
  }

  return profile;
};