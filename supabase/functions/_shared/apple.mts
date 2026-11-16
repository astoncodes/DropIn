/**
 * Sign in with Apple's server-side endpoints: trading a sign-in authorization
 * code for a refresh token, and revoking that token when the account is
 * deleted. Apple authenticates the app with a short-lived JWT signed by the
 * team's Sign in with Apple key rather than a static secret.
 */

const APPLE_AUTH = 'https://appleid.apple.com/auth';
const SECRET_LIFETIME_SECONDS = 300;

export type AppleConfig = {
  teamId: string;
  keyId: string;
  /** The native app's bundle identifier, which Apple treats as its client ID. */
  clientId: string;
  /** The downloaded `.p8` key, PEM encoded. */
  privateKeyPem: string;
};

export type AppleClient = {
  /** Trades a sign-in authorization code (valid for five minutes, once) for the refresh token revocation needs. */
  exchangeCode(code: string): Promise<{ refreshToken: string; subject: string }>;
  /** Resolves once Apple no longer honours the token, including when it already did not. */
  revoke(refreshToken: string): Promise<void>;
};

export class AppleRequestError extends Error {
  readonly step: 'exchange' | 'revoke';
  readonly status: number;
  /** Apple's `error` field, such as `invalid_grant` or `invalid_client`. */
  readonly code: string | null;
  constructor(step: 'exchange' | 'revoke', status: number, code: string | null) {
    super(`Apple ${step} failed with ${status}${code ? ` ${code}` : ''}`);
    this.name = 'AppleRequestError';
    this.step = step;
    this.status = status;
    this.code = code;
  }
}

const SETTINGS = ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_CLIENT_ID', 'APPLE_PRIVATE_KEY'] as const;

/**
 * Reads the Apple settings. Null when none is set, so a deployment without
 * Sign in with Apple keeps working; an error when only some are, so a typo
 * cannot silently disable revocation.
 */
export function appleConfigFromEnv(get: (name: string) => string | undefined): AppleConfig | null {
  const values = SETTINGS.map((name) => get(name)?.trim() ?? '');
  const present = values.filter(Boolean).length;
  if (present === 0) return null;
  if (present < SETTINGS.length) throw new Error(`Set all of ${SETTINGS.join(', ')}, or none.`);
  const [teamId, keyId, clientId, privateKey] = values;
  // Secrets stores keep the key on one line with escaped line breaks.
  return { teamId, keyId, clientId, privateKeyPem: privateKey.replace(/\\n/g, '\n') };
}

const encoder = new TextEncoder();

function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64(text: string): Uint8Array {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function jwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Malformed token.');
  return JSON.parse(new TextDecoder().decode(fromBase64(payload)));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return crypto.subtle.importKey(
    'pkcs8',
    fromBase64(body),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * The `client_secret` Apple expects: an ES256 JWT from the team to Apple about
 * the app. Web Crypto's ECDSA signature is already the raw r||s form JWS uses.
 */
export async function appleClientSecret(
  config: AppleConfig,
  now: () => number = Date.now,
): Promise<string> {
  const issuedAt = Math.floor(now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }));
  const payload = base64url(
    JSON.stringify({
      iss: config.teamId,
      iat: issuedAt,
      exp: issuedAt + SECRET_LIFETIME_SECONDS,
      aud: 'https://appleid.apple.com',
      sub: config.clientId,
    }),
  );
  const key = await importPrivateKey(config.privateKeyPem);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

export function createAppleClient(
  config: AppleConfig,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): AppleClient {
  async function post(
    step: 'exchange' | 'revoke',
    path: string,
    fields: Record<string, string>,
  ): Promise<Record<string, unknown> | null> {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: await appleClientSecret(config, now),
      ...fields,
    });
    const response = await fetchImpl(`${APPLE_AUTH}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await response.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      const code = json && typeof json.error === 'string' ? json.error : null;
      throw new AppleRequestError(step, response.status, code);
    }
    return json;
  }

  return {
    async exchangeCode(code) {
      const json = await post('exchange', 'token', { code, grant_type: 'authorization_code' });
      if (typeof json?.refresh_token !== 'string' || typeof json?.id_token !== 'string') {
        throw new AppleRequestError('exchange', 200, 'missing_token');
      }
      // The identity token arrived from Apple over TLS in answer to our own
      // authenticated request, so its subject can be read without verifying
      // the signature again.
      const subject = jwtPayload(json.id_token).sub;
      if (typeof subject !== 'string')
        throw new AppleRequestError('exchange', 200, 'missing_subject');
      return { refreshToken: json.refresh_token, subject };
    },
    async revoke(refreshToken) {
      try {
        await post('revoke', 'revoke', { token: refreshToken, token_type_hint: 'refresh_token' });
      } catch (error) {
        // A token Apple no longer recognises is already revoked.
        if (error instanceof AppleRequestError && error.code === 'invalid_grant') return;
        throw error;
      }
    },
  };
}
