import { createClient } from '@supabase/supabase-js';
import env from './env.js';

let supabase = null;

export const BUCKET_NAME = 'pdfs';

/**
 * Check if Supabase credentials are configured in backend environment
 */
export const isSupabaseConfigured = () => {
  if (!env.SUPABASE_URL || env.SUPABASE_URL.includes('your-project-ref')) {
    return false;
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) return false;
  try {
    new URL(env.SUPABASE_URL);
    return true;
  } catch {
    return false;
  }
};

/**
 * Get or initialize Supabase client on the backend.
 * Uses service role key if available for administrative operations,
 * otherwise falls back to the publishable key.
 */
export const getSupabase = () => {
  if (supabase) return supabase;

  if (!isSupabaseConfigured()) {
    return null;
  }

  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  const cleanUrl = env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

  supabase = createClient(cleanUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });


  const mode = env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'publishable';
  console.log(`✅ Supabase backend client initialized (${mode} mode)`);
  return supabase;
};

export default getSupabase;
