import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ProcessPayload = {
  videoId?: string;
  bucket?: string;
  path?: string;
  size?: number;
  mimeType?: string;
  transcodeWebhook?: string;
};

const jsonResponse = (body: Record<string, unknown>, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });

const getEnvNumber = (key: string, fallback?: number) => {
  const raw = Deno.env.get(key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

async function fetchFileMetadata(client: ReturnType<typeof createClient>, bucket: string, path: string) {
  const parts = path.split('/');
  const fileName = parts.pop() ?? '';
  const prefix = parts.join('/');
  const { data, error } = await client.storage.from(bucket).list(prefix, {
    limit: 200,
    search: fileName,
  });
  if (error) throw error;
  return (data ?? []).find((item) => item.name === fileName) ?? null;
}

async function updateVideoStatus(client: ReturnType<typeof createClient>, videoId: string, status: string) {
  await client.from('videos').update({ status }).eq('id', videoId);
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

  let payload: ProcessPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const videoId = payload.videoId;
  const bucket = payload.bucket || Deno.env.get('VIDEO_BUCKET') || 'videos';
  const path = payload.path;
  const mimeType = payload.mimeType || 'video/mp4';

  if (!videoId || !path) {
    return jsonResponse({ error: 'videoId and path are required' }, { status: 400 });
  }

  const maxFileSize = getEnvNumber('VIDEO_MAX_FILE_SIZE', 300 * 1024 * 1024);
  const transcodeWebhook = payload.transcodeWebhook || Deno.env.get('TRANSCODE_WEBHOOK_URL') || '';

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  });

  try {
    await updateVideoStatus(client, videoId, 'verifying');

    let fileSize = typeof payload.size === 'number' ? payload.size : undefined;
    if (!fileSize) {
      try {
        const metadata = await fetchFileMetadata(client, bucket, path);
        const metaSize = metadata?.metadata?.size ?? metadata?.metadata?.ContentLength ?? metadata?.size;
        if (metaSize && Number.isFinite(metaSize)) {
          fileSize = Number(metaSize);
        }
      } catch (metadataError) {
        console.error('metadata lookup failed', metadataError);
      }
    }

    if (fileSize && maxFileSize && fileSize > maxFileSize) {
      await updateVideoStatus(client, videoId, 'failed');
      return jsonResponse({ error: 'File exceeds allowed size.' }, { status: 400 });
    }

    if (!fileSize || fileSize <= 0) {
      await updateVideoStatus(client, videoId, 'failed');
      return jsonResponse({ error: 'Missing or invalid file size.' }, { status: 400 });
    }

    const allowedMime = ['video/mp4', 'video/x-m4v', 'video/quicktime'];
    if (!allowedMime.includes(mimeType)) {
      await updateVideoStatus(client, videoId, 'failed');
      return jsonResponse({ error: 'Unsupported media type.' }, { status: 400 });
    }

    const extension = path.split('.').pop()?.toLowerCase();
    if (extension && !['mp4', 'm4v', 'mov'].includes(extension)) {
      await updateVideoStatus(client, videoId, 'failed');
      return jsonResponse({ error: 'Unsupported file extension.' }, { status: 400 });
    }

    const isLikelyCorrupted = fileSize < 256 * 1024; // 256KB
    if (isLikelyCorrupted) {
      await updateVideoStatus(client, videoId, 'failed');
      return jsonResponse({ error: 'File too small to be a valid video.' }, { status: 400 });
    }

    await updateVideoStatus(client, videoId, 'transcoding');

    if (transcodeWebhook) {
      const response = await fetch(transcodeWebhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          videoId,
          bucket,
          path,
          size: fileSize,
          mimeType,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        await updateVideoStatus(client, videoId, 'failed');
        return jsonResponse(
          { error: 'Transcode trigger failed', detail },
          { status: 502 },
        );
      }
    }

    await updateVideoStatus(client, videoId, 'pending');
    return jsonResponse({ status: 'pending' });
  } catch (error) {
    console.error('process-video edge function error', error);
    try {
      await updateVideoStatus(client, videoId, 'failed');
    } catch (statusError) {
      console.error('status update failed', statusError);
    }
    return jsonResponse({ error: 'Internal server error' }, { status: 500 });
  }
});
