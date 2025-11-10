// Analytics and usage logging helpers
import { supabase, APP_CONFIG } from './config.js';

const SESSION_STORAGE_KEY = 'pofatlanitas.sessionId';
let cachedSessionId = null;

function ensureSessionId() {
  if (cachedSessionId) return cachedSessionId;
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      cachedSessionId = existing;
      return existing;
    }
  } catch (error) {
    console.warn('Session storage unavailable', error);
  }
  const generated = crypto.randomUUID();
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, generated);
  } catch {
    // Ignore write failures (e.g. private mode)
  }
  cachedSessionId = generated;
  return generated;
}

async function invokeUsageFunction(eventType, payload = {}) {
  if (!supabase || !APP_CONFIG.usageFunctionName) return;
  const sessionId = ensureSessionId();
  const body = {
    eventType,
    payload,
    sessionId,
  };
  try {
    await supabase.functions.invoke(APP_CONFIG.usageFunctionName, { body });
  } catch (error) {
    console.warn('Usage logging failed', error);
  }
}

export function logUsageEvent(eventType, payload = {}) {
  if (!eventType) return;
  void invokeUsageFunction(eventType, payload);
}

export function trackFeedRequest(context = {}) {
  logUsageEvent('feed.fetch', context);
}

export function trackVideoOpen(context = {}) {
  logUsageEvent('feed.video_opened', context);
}

export function trackPreferenceUpdate(context = {}) {
  logUsageEvent('preferences.updated', context);
}

export function trackSectionLoad(section, context = {}) {
  if (!section) return;
  logUsageEvent(`feed.section.${section}`, context);
}
