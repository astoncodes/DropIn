import assert from 'node:assert/strict';
import {
  AppleRequestError,
  appleClientSecret,
  appleConfigFromEnv,
  createAppleClient,
} from '../../supabase/functions/_shared/apple.mts';

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}
function fromBase64url(text) {
  return new Uint8Array(Buffer.from(text, 'base64url'));
}

/** A fresh Sign in with Apple key, as Apple's `.p8` download would hold it. */
async function generateKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString(
    'base64',
  );
  const lines = der.match(/.{1,64}/g).join('\n');
  return {
    publicKey: pair.publicKey,
    pem: `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`,
  };
}

const key = await generateKey();
const config = {
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  clientId: 'com.playdropin.app',
  privateKeyPem: key.pem,
};
const now = () => 1_800_000_000_000;

// --- The client secret is an ES256 JWT Apple can verify -----------------------
const secret = await appleClientSecret(config, now);
const [header, payload, signature] = secret.split('.');
assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), {
  alg: 'ES256',
  kid: 'KEY1234567',
});
assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), {
  iss: 'TEAM123456',
  iat: 1_800_000_000,
  exp: 1_800_000_300,
  aud: 'https://appleid.apple.com',
  sub: 'com.playdropin.app',
});
assert.equal(fromBase64url(signature).byteLength, 64, 'raw r||s signature, as JWS requires');
assert.ok(
  await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key.publicKey,
    fromBase64url(signature),
    new TextEncoder().encode(`${header}.${payload}`),
  ),
  "Apple can verify the secret with the key's public half",
);

// --- Settings -----------------------------------------------------------------
assert.equal(
  appleConfigFromEnv(() => undefined),
  null,
  'no settings means no Apple client',
);
assert.throws(
  () => appleConfigFromEnv((name) => (name === 'APPLE_TEAM_ID' ? 'TEAM' : undefined)),
  /Set all of/,
  'partial settings are a configuration error, not a silent skip',
);
const escaped = {
  APPLE_TEAM_ID: ' TEAM123456 ',
  APPLE_KEY_ID: 'KEY1234567',
  APPLE_CLIENT_ID: 'com.playdropin.app',
  APPLE_PRIVATE_KEY: key.pem.trim().replace(/\n/g, '\\n'),
};
const fromEnv = appleConfigFromEnv((name) => escaped[name]);
assert.equal(fromEnv.teamId, 'TEAM123456');
assert.equal(fromEnv.privateKeyPem, key.pem.trim(), 'escaped line breaks in a secret are restored');
await appleClientSecret(fromEnv, now);

// --- Exchange and revoke requests ---------------------------------------------
const idToken = `${base64url('{"alg":"RS256"}')}.${base64url(
  JSON.stringify({ sub: '001234.apple-subject', aud: 'com.playdropin.app' }),
)}.${base64url('signature')}`;
function fakeFetch(answers) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const fields = Object.fromEntries(new URLSearchParams(init.body));
    requests.push({ url, method: init.method, contentType: init.headers['Content-Type'], fields });
    const answer = answers[new URL(url).pathname];
    return new Response(answer.body === undefined ? '' : JSON.stringify(answer.body), {
      status: answer.status,
    });
  };
  return { requests, fetchImpl };
}

const ok = fakeFetch({
  '/auth/token': { status: 200, body: { refresh_token: 'refresh-abc', id_token: idToken } },
  '/auth/revoke': { status: 200 },
});
const client = createAppleClient(config, ok.fetchImpl, now);
assert.deepEqual(await client.exchangeCode('code-123'), {
  refreshToken: 'refresh-abc',
  subject: '001234.apple-subject',
});
await client.revoke('refresh-abc');
assert.equal(ok.requests.length, 2);
const [exchange, revoke] = ok.requests;
assert.equal(exchange.url, 'https://appleid.apple.com/auth/token');
assert.equal(exchange.method, 'POST');
assert.equal(exchange.contentType, 'application/x-www-form-urlencoded');
assert.deepEqual(
  { ...exchange.fields, client_secret: exchange.fields.client_secret.split('.').length },
  {
    client_id: 'com.playdropin.app',
    client_secret: 3,
    code: 'code-123',
    grant_type: 'authorization_code',
  },
);
assert.equal(revoke.url, 'https://appleid.apple.com/auth/revoke');
assert.deepEqual(
  { ...revoke.fields, client_secret: revoke.fields.client_secret.split('.').length },
  {
    client_id: 'com.playdropin.app',
    client_secret: 3,
    token: 'refresh-abc',
    token_type_hint: 'refresh_token',
  },
);

// --- Apple's refusals ---------------------------------------------------------
const usedCode = createAppleClient(
  config,
  fakeFetch({ '/auth/token': { status: 400, body: { error: 'invalid_grant' } } }).fetchImpl,
  now,
);
await assert.rejects(
  () => usedCode.exchangeCode('stale'),
  (error) =>
    error instanceof AppleRequestError &&
    error.step === 'exchange' &&
    error.status === 400 &&
    error.code === 'invalid_grant',
  "a used or expired code is reported with Apple's code",
);
const noToken = createAppleClient(
  config,
  fakeFetch({ '/auth/token': { status: 200, body: { access_token: 'only' } } }).fetchImpl,
  now,
);
await assert.rejects(
  () => noToken.exchangeCode('code'),
  (error) => error instanceof AppleRequestError && error.code === 'missing_token',
);
const alreadyRevoked = createAppleClient(
  config,
  fakeFetch({ '/auth/revoke': { status: 400, body: { error: 'invalid_grant' } } }).fetchImpl,
  now,
);
await alreadyRevoked.revoke('gone');
const misconfigured = createAppleClient(
  config,
  fakeFetch({ '/auth/revoke': { status: 400, body: { error: 'invalid_client' } } }).fetchImpl,
  now,
);
await assert.rejects(
  () => misconfigured.revoke('token'),
  (error) => error instanceof AppleRequestError && error.code === 'invalid_client',
  'a refused client is an error, not a revocation',
);
const outage = createAppleClient(
  config,
  fakeFetch({ '/auth/revoke': { status: 503 } }).fetchImpl,
  now,
);
await assert.rejects(
  () => outage.revoke('token'),
  (error) => error instanceof AppleRequestError && error.status === 503 && error.code === null,
);

console.log('PASS: Apple client secret, settings, code exchange, revocation and refusals.');
