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

const resolveNumber = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const maxFileSizeBytes = resolveNumber(
  runtimeEnv.VIDEO_MAX_FILE_SIZE
    || runtimeEnv.VITE_VIDEO_MAX_FILE_SIZE
    || importEnv.VITE_VIDEO_MAX_FILE_SIZE,
);

let uploadChunkSize = resolveNumber(
  runtimeEnv.UPLOAD_CHUNK_SIZE
    || runtimeEnv.VITE_UPLOAD_CHUNK_SIZE
    || importEnv.VITE_UPLOAD_CHUNK_SIZE,
);

if (!uploadChunkSize) {
  const chunkSizeMb = resolveNumber(
    runtimeEnv.UPLOAD_CHUNK_SIZE_MB
      || runtimeEnv.VITE_UPLOAD_CHUNK_SIZE_MB
      || importEnv.VITE_UPLOAD_CHUNK_SIZE_MB,
  );
  if (chunkSizeMb) {
    uploadChunkSize = chunkSizeMb * 1024 * 1024;
  }
}

if (!uploadChunkSize || uploadChunkSize <= 0) {
  uploadChunkSize = 8 * 1024 * 1024;
}

const processFunctionName = runtimeEnv.SUPABASE_PROCESS_FUNCTION
  || runtimeEnv.VITE_SUPABASE_PROCESS_FUNCTION
  || importEnv.VITE_SUPABASE_PROCESS_FUNCTION
  || 'process-video';

export const APP_CONFIG = {
  supabaseUrl,
  supabaseAnonKey,
  supabaseAuthRedirectUrl,
  bucket,
  maxFileSize: maxFileSizeBytes && maxFileSizeBytes > 0 ? maxFileSizeBytes : 300 * 1024 * 1024,
  allowedMimeTypes: ['video/mp4'],
  uploadChunkSize,
  processFunctionName,
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
