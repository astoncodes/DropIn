import assert from 'node:assert/strict';
import { AppleRequestError } from '../../supabase/functions/_shared/apple.mts';
import { createAppleSignInHandler } from '../../supabase/functions/apple-sign-in/handler.mts';

const APPLE_SUBJECT = '001234.apple-subject';

function fixture({
  identities = [{ id: APPLE_SUBJECT, provider: 'apple' }],
  exchange = { refreshToken: 'refresh-abc', subject: APPLE_SUBJECT },
  storeFails = false,
  configured = true,
} = {}) {
  const calls = [];
  const admin = {
    auth: {
      getUser: async (token) => {
        calls.push(['verify', token]);
        return { data: { user: { id: 'verified-user', identities } }, error: null };
      },
    },
    from: (table) => ({
      upsert: async (row) => {
        calls.push(['upsert', table, row]);
        return { error: storeFails ? new Error('Unavailable') : null };
      },
    }),
  };
  const apple = configured
    ? {
        exchangeCode: async (code) => {
          calls.push(['exchange', code]);
          if (exchange instanceof Error) throw exchange;
          return exchange;
        },
        revoke: async () => {
          throw new Error('Sign-in never revokes.');
        },
      }
    : null;
  return { handler: createAppleSignInHandler(admin, apple), calls };
}
const request = (body, token = 'valid-session') =>
  new Request('https://example.test/apple-sign-in', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {},
    body: JSON.stringify(body),
  });
const stored = (calls) => calls.find(([kind]) => kind === 'upsert');

// --- Stores the refresh token for the signed-in Apple identity ----------------
const success = fixture();
const response = await success.handler(request({ authorizationCode: 'code-123' }));
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { stored: true });
assert.deepEqual(success.calls[1], ['exchange', 'code-123']);
const row = stored(success.calls);
assert.equal(row[1], 'apple_refresh_tokens');
assert.equal(row[2].user_id, 'verified-user');
assert.equal(row[2].refresh_token, 'refresh-abc');
assert.match(row[2].updated_at, /^\d{4}-\d{2}-\d{2}T/);

// --- Refusals that store nothing ----------------------------------------------
const signedOut = fixture();
assert.equal((await signedOut.handler(request({ authorizationCode: 'code' }, null))).status, 401);
assert.equal(signedOut.calls.length, 0);

for (const body of [null, [], {}, { authorizationCode: '' }, { authorizationCode: 7 }]) {
  const bad = fixture();
  assert.equal((await bad.handler(request(body))).status, 400);
  assert.equal(stored(bad.calls), undefined);
}
const extraField = fixture();
assert.equal(
  (await extraField.handler(request({ authorizationCode: 'code', userId: 'other' }))).status,
  400,
);
assert.equal(stored(extraField.calls), undefined);
const hugeCode = fixture();
assert.equal((await hugeCode.handler(request({ authorizationCode: 'x'.repeat(600) }))).status, 400);

const emailAccount = fixture({ identities: [{ id: 'verified-user', provider: 'email' }] });
const notApple = await emailAccount.handler(request({ authorizationCode: 'code' }));
assert.equal(notApple.status, 400);
assert.equal((await notApple.json()).error, 'This account did not sign in with Apple.');
assert.equal(emailAccount.calls.length, 1, 'no exchange for a non-Apple account');

const someoneElse = fixture({ exchange: { refreshToken: 'theirs', subject: '009999.other' } });
assert.equal((await someoneElse.handler(request({ authorizationCode: 'code' }))).status, 400);
assert.equal(stored(someoneElse.calls), undefined, 'a token for another identity is not kept');

const staleCode = fixture({ exchange: new AppleRequestError('exchange', 400, 'invalid_grant') });
const stale = await staleCode.handler(request({ authorizationCode: 'used' }));
assert.equal(stale.status, 400);
assert.equal((await stale.json()).error, 'That Apple sign-in has expired. Sign in again.');

const appleDown = fixture({ exchange: new AppleRequestError('exchange', 503, null) });
assert.equal((await appleDown.handler(request({ authorizationCode: 'code' }))).status, 503);

const unconfigured = fixture({ configured: false });
assert.equal((await unconfigured.handler(request({ authorizationCode: 'code' }))).status, 503);
assert.equal(unconfigured.calls.length, 1);

const storeDown = fixture({ storeFails: true });
assert.equal((await storeDown.handler(request({ authorizationCode: 'code' }))).status, 503);

console.log("PASS: Apple sign-in stores the verified identity's token and refuses the rest.");
