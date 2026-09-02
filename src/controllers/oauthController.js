import User from '../models/User.js';
import env from '../config/env.js';
import { generateToken } from '../middleware/auth.js';
import { sendLoginNotificationEmail } from '../services/emailService.js';
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
  getGoogleProfile,
} from '../services/googleOAuth.js';
import {
  getGithubAuthUrl,
  exchangeGithubCode,
  getGithubProfile,
} from '../services/githubOAuth.js';

const findOrCreateOAuthUser = async ({ provider, providerId, email, name, picture }) => {
  let user = await User.findOne({ provider, providerId });
  if (user) return user;

  user = await User.findOne({ email });
  if (user) {
    user.provider = provider;
    user.providerId = providerId;
    user.emailVerified = true;
    if (picture) user.profilePicture = picture;
    await user.save();
    return user;
  }

  user = await User.create({
    name: name || email,
    email,
    provider,
    providerId,
    profilePicture: picture || '',
    emailVerified: true,
  });
  return user;
};

const recordLogin = async (user) => {
  user.lastLogin = new Date();
  user.loginCount = (user.loginCount || 0) + 1;
  await user.save();
};

/**
 * GET /api/auth/google
 */
export const googleLogin = (req, res) => {
  res.redirect(getGoogleAuthUrl());
};

/**
 * GET /api/auth/google/callback
 */
export const googleCallback = async (req, res) => {
  try {
    const { code } = req.query;
    const accessToken = await exchangeGoogleCode(code);
    const profile = await getGoogleProfile(accessToken);

    const user = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });

    await recordLogin(user);

    sendLoginNotificationEmail(user.email, {
      provider: 'Google',
      time: new Date().toLocaleString(),
    }).catch((err) => console.error('Login email failed:', err.message));

    const token = generateToken(user);
    res.redirect(`${env.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (error) {
    console.error('Google OAuth error:', error.message);
    res.redirect(`${env.FRONTEND_URL}/login?error=google_oauth_failed`);
  }
};

/**
 * POST /api/auth/google/callback
 */
export const googleCallbackPost = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Authorization code is required' });
    }
    const accessToken = await exchangeGoogleCode(code);
    const profile = await getGoogleProfile(accessToken);

    const user = await findOrCreateOAuthUser({
      provider: 'google',
      providerId: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });

    await recordLogin(user);

    sendLoginNotificationEmail(user.email, {
      provider: 'Google',
      time: new Date().toLocaleString(),
    }).catch((err) => console.error('Login email failed:', err.message));

    const token = generateToken(user);
    res.json({ success: true, token, user });
  } catch (error) {
    console.error('Google OAuth error (POST):', error.message);
    res.status(500).json({ success: false, message: 'Google OAuth failed' });
  }
};

/**
 * GET /api/auth/github
 */
export const githubLogin = (req, res) => {
  res.redirect(getGithubAuthUrl());
};

/**
 * GET /api/auth/github/callback
 */
export const githubCallback = async (req, res) => {
  try {
    const { code } = req.query;
    const accessToken = await exchangeGithubCode(code);
    const profile = await getGithubProfile(accessToken);

    const user = await findOrCreateOAuthUser({
      provider: 'github',
      providerId: String(profile.id),
      email: profile.email,
      name: profile.name || profile.login,
      picture: profile.avatar_url,
    });

    await recordLogin(user);

    sendLoginNotificationEmail(user.email, {
      provider: 'GitHub',
      time: new Date().toLocaleString(),
    }).catch((err) => console.error('Login email failed:', err.message));

    const token = generateToken(user);
    res.redirect(`${env.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (error) {
    console.error('GitHub OAuth error:', error.message);
    res.redirect(`${env.FRONTEND_URL}/login?error=github_oauth_failed`);
  }
};

/**
 * POST /api/auth/github/callback
 */
export const githubCallbackPost = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Authorization code is required' });
    }
    const accessToken = await exchangeGithubCode(code);
    const profile = await getGithubProfile(accessToken);

    const user = await findOrCreateOAuthUser({
      provider: 'github',
      providerId: String(profile.id),
      email: profile.email,
      name: profile.name || profile.login,
      picture: profile.avatar_url,
    });

    await recordLogin(user);

    sendLoginNotificationEmail(user.email, {
      provider: 'GitHub',
      time: new Date().toLocaleString(),
    }).catch((err) => console.error('Login email failed:', err.message));

    const token = generateToken(user);
    res.json({ success: true, token, user });
  } catch (error) {
    console.error('GitHub OAuth error (POST):', error.message);
    res.status(500).json({ success: false, message: 'GitHub OAuth failed' });
  }
};