import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';

const MAX_BODY_BYTES = 1024;

export function parseAllowedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const url = new URL(entry);
      if (url.origin !== entry || url.protocol !== 'https:') {
        throw new Error('Allowed origins must be exact HTTPS origins without paths.');
      }
      return entry;
    });
}

async function readBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError('Request body too large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export function createDeleteAccountHandler(admin: SupabaseClient, allowedOrigins: string[] = []) {
  const origins = new Set(parseAllowedOrigins(allowedOrigins.join(',')));
  return async (request: Request) => {
    const origin = request.headers.get('Origin');
    const allowed = origin !== null && origins.has(origin);
    const cors: Record<string, string> = {
      Vary: 'Origin',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(allowed
        ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers':
              'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
          }
        : {}),
    };
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    // Native clients do not send Origin; they still require verified user JWTs.
    // Browser callers fail closed, including sandboxed Origin: null requests.
    if (origin !== null && !allowed) return json({ error: 'Origin not allowed.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    const jwt = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!jwt) return json({ error: 'Sign in to delete your account.' }, 401);
    if (
      request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    ) {
      return json({ error: 'Use application/json.' }, 415);
    }
    // Never accept a user ID from the body or trust decoded JWT claims alone.
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(jwt);
    if (authError || !user) return json({ error: 'Your session expired. Sign in again.' }, 401);
    let body;
    try {
      body = JSON.parse(await readBody(request));
    } catch (error) {
      if (error instanceof RangeError) return json({ error: 'Request body too large.' }, 413);
      return json({ error: 'Confirm account deletion.' }, 400);
    }
    if (
      body?.confirmation !== 'DELETE' ||
      Object.keys(body).some((key) => key !== 'confirmation')
    ) {
      return json({ error: 'Confirm account deletion by typing DELETE.' }, 400);
    }
    try {
      const staged = await admin.rpc('prepare_account_deletion', { p_user_id: user.id });
      if (staged.error) throw staged.error;
      // Bound each invocation; large accounts resume safely from the saved queue.
      for (let batch = 0; batch < 10; batch++) {
        const pending = await admin.rpc('account_deletion_objects', { p_user_id: user.id });
        if (pending.error) throw pending.error;
        const paths = (pending.data ?? []).map((row: { storage_path: string }) => row.storage_path);
        if (!paths.length) {
          const result = await admin.auth.admin.deleteUser(user.id);
          if (result.error && result.error.code !== 'user_not_found') throw result.error;
          return json({ deleted: true });
        }
        const removed = await admin.storage.from('session-media').remove(paths);
        if (removed.error) throw removed.error;
        const acknowledged = await admin.rpc('ack_account_deletion_objects', {
          p_user_id: user.id,
          p_paths: paths,
        });
        if (acknowledged.error) throw acknowledged.error;
      }
      return json({ pending: true }, 202);
    } catch {
      // Do not log JWTs, personal data, or provider error details. The persisted
      // marker and file queue make an explicit retry safe after partial progress.
      return json({ error: 'Deletion could not finish. Please retry to complete it.' }, 503);
    }
  };
}
