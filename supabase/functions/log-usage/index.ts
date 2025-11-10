import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type UsagePayload = {
  eventType?: string;
  payload?: Record<string, unknown>;
  sessionId?: string;
};

const jsonResponse = (body: Record<string, unknown>, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });

function sanitizePayload(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object') return undefined;
  try {
    return JSON.parse(JSON.stringify(input));
  } catch {
    return undefined;
  }
}

async function forwardToLogflare(eventType: string, payload: Record<string, unknown> | undefined) {
  const sourceToken = Deno.env.get('LOGFLARE_SOURCE');
  const apiKey = Deno.env.get('LOGFLARE_API_KEY');
  if (!sourceToken || !apiKey) return;

  const body = {
    source: sourceToken,
    log_entry: { event_type: eventType, ...payload },
    metadata: payload,
  };

  try {
    await fetch('https://api.logflare.app/logs', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error('Logflare forward failed', error);
  }
}

async function persistEvent(
  client: ReturnType<typeof createClient>,
  eventType: string,
  payload: Record<string, unknown> | undefined,
  sessionId: string | undefined,
  userId: string | undefined,
) {
  const insertPayload: Record<string, unknown> = {
    event_type: eventType,
    event_payload: payload ?? null,
    session_id: sessionId ?? null,
    user_id: userId ?? null,
  };
  try {
    await client.from('usage_events').insert(insertPayload);
  } catch (error) {
    console.error('Usage event insert failed', error);
  }
}

async function maybeRefreshTrending(client: ReturnType<typeof createClient>, eventType: string) {
  if (eventType !== 'feed.video_opened') return;
  try {
    await client.rpc('rebuild_video_trending_stats');
  } catch (error) {
    console.error('Trending refresh failed', error);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase configuration' }, { status: 500 });
  }

  let payload: UsagePayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const eventType = payload.eventType?.toString().trim();
  if (!eventType) {
    return jsonResponse({ error: 'eventType is required' }, { status: 400 });
  }

  const sanitizedPayload = sanitizePayload(payload.payload);
  if (sanitizedPayload?.session_id) {
    delete sanitizedPayload.session_id;
  }
  const userId = typeof sanitizedPayload?.user_id === 'string' ? sanitizedPayload.user_id : undefined;
  if (sanitizedPayload?.user_id) {
    delete sanitizedPayload.user_id;
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  });

  await Promise.all([
    persistEvent(client, eventType, sanitizedPayload, payload.sessionId, userId),
    forwardToLogflare(eventType, sanitizedPayload),
  ]);

  await maybeRefreshTrending(client, eventType);

  return jsonResponse({ status: 'ok' });
});
