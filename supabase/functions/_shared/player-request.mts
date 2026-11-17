import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2.112.3';

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

/** Answers with a JSON body and the headers the request's origin earned. */
export type Reply = (body: unknown, status?: number) => Response;

export type PlayerRequest =
  | { ok: true; user: User; body: Record<string, unknown>; reply: Reply }
  | { ok: false; response: Response };

/**
 * The checks every player-facing function makes before doing any work: the
 * browser origin allow-list, the method, a verified user and a small JSON
 * object body. Native clients send no Origin and still need a verified JWT;
 * browsers fail closed, including sandboxed `Origin: null` requests.
 */
export function createRequestGate(admin: SupabaseClient, allowedOrigins: string[]) {
  const origins = new Set(parseAllowedOrigins(allowedOrigins.join(',')));
  return async (
    request: Request,
    options: { invalidBodyMessage: string },
  ): Promise<PlayerRequest> => {
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
    const reply: Reply = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    const refuse = (response: Response): PlayerRequest => ({ ok: false, response });
    if (origin !== null && !allowed) return refuse(reply({ error: 'Origin not allowed.' }, 403));
    if (request.method === 'OPTIONS') {
      return refuse(new Response(null, { status: 204, headers: cors }));
    }
    if (request.method !== 'POST') return refuse(reply({ error: 'Use POST.' }, 405));
    const jwt = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!jwt) return refuse(reply({ error: 'Sign in to continue.' }, 401));
    if (
      request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    ) {
      return refuse(reply({ error: 'Use application/json.' }, 415));
    }
    // Never accept a user ID from the body or trust decoded JWT claims alone.
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(jwt);
    if (authError || !user) {
      return refuse(reply({ error: 'Your session expired. Sign in again.' }, 401));
    }
    let body: unknown;
    try {
      body = JSON.parse(await readBody(request));
    } catch (error) {
      if (error instanceof RangeError)
        return refuse(reply({ error: 'Request body too large.' }, 413));
      return refuse(reply({ error: options.invalidBodyMessage }, 400));
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return refuse(reply({ error: options.invalidBodyMessage }, 400));
    }
    return { ok: true, user, body: body as Record<string, unknown>, reply };
  };
}
