// [ADD]
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const importEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const runtimeEnv = window.__ENV__ || window.ENV || {};

const supabaseUrl = runtimeEnv.SUPABASE_URL || runtimeEnv.VITE_SUPABASE_URL || importEnv.VITE_SUPABASE_URL || '';
const supabaseAnonKey = runtimeEnv.SUPABASE_ANON_KEY || runtimeEnv.VITE_SUPABASE_ANON_KEY || importEnv.VITE_SUPABASE_ANON_KEY || '';
const supabaseAuthRedirectUrl = runtimeEnv.SUPABASE_AUTH_REDIRECT_URL
  || runtimeEnv.VITE_SUPABASE_AUTH_REDIRECT_URL
  || importEnv.VITE_SUPABASE_AUTH_REDIRECT_URL
  || '';
const bucket = runtimeEnv.VIDEO_BUCKET || runtimeEnv.VITE_VIDEO_BUCKET || importEnv.VITE_VIDEO_BUCKET || 'videos';

export const APP_CONFIG = {
  supabaseUrl,
  supabaseAnonKey,
  supabaseAuthRedirectUrl,
  bucket,
  maxFileSize: 300 * 1024 * 1024,
  allowedMimeTypes: ['video/mp4'],
};

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: true,
      },
    })
  : null;
// [END]
