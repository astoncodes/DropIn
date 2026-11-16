import assert from 'node:assert/strict';
import { parseAllowedOrigins } from '../../supabase/functions/_shared/player-request.mts';
import { createDeleteAccountHandler } from '../../supabase/functions/delete-account/handler.mts';

function fixture({
  invalidToken = false,
  storageFails = false,
  manyBatches = false,
  origins = [],
  /** The stored Sign in with Apple refresh token, if the account has one. */
  appleToken = null,
  /** Whether the function was deployed with the APPLE_* settings. */
  appleConfigured = true,
  revokeFails = null,
} = {}) {
  const calls = [];
  let files = true;
  const admin = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            calls.push(['read', table]);
            return { data: appleToken ? { refresh_token: appleToken } : null, error: null };
          },
        }),
      }),
      delete: () => ({
        eq: async (column, value) => {
          calls.push(['forget', table, value]);
          return { error: null };
        },
      }),
    }),
    auth: {
      getUser: async (token) => {
        calls.push(['verify', token]);
        return { data: { user: invalidToken ? null : { id: 'verified-user' } }, error: null };
      },
      admin: {
        deleteUser: async (id) => {
          calls.push(['delete', id]);
          return { error: null };
        },
      },
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'account_deletion_objects')
        return {
          data: files ? [{ storage_path: 'verified-user/post/photo.jpg' }] : [],
          error: null,
        };
      if (name === 'ack_account_deletion_objects') files = manyBatches;
      return { error: null };
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          calls.push(['remove', bucket, paths]);
          return { error: storageFails ? new Error('Unavailable') : null };
        },
      }),
    },
  };
  const apple = appleConfigured
    ? {
        revoke: async (token) => {
          calls.push(['revoke', token]);
          if (revokeFails) throw revokeFails;
        },
        exchangeCode: async () => {
          throw new Error('Deletion never exchanges a code.');
        },
      }
    : null;
  return { handler: createDeleteAccountHandler(admin, origins, apple), calls };
}
const request = (body, token = 'valid-session') =>
  new Request('https://example.test/delete-account', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {},
    body: JSON.stringify(body),
  });
const missing = fixture();
assert.equal((await missing.handler(request({ confirmation: 'DELETE' }, null))).status, 401);
assert.equal(missing.calls.length, 0);
const invalid = fixture({ invalidToken: true });
assert.equal(
  (await invalid.handler(request({ confirmation: 'DELETE' }, 'forged-token'))).status,
  401,
);
assert.equal(invalid.calls.length, 1);
const wrongTarget = fixture();
assert.equal(
  (await wrongTarget.handler(request({ confirmation: 'DELETE', userId: 'someone-else' }))).status,
  400,
);
assert(!wrongTarget.calls.some(([kind]) => kind === 'prepare_account_deletion'));
const success = fixture();
assert.deepEqual(await (await success.handler(request({ confirmation: 'DELETE' }))).json(), {
  deleted: true,
});
assert(
  success.calls.findIndex(([kind]) => kind === 'remove') <
    success.calls.findIndex(([kind]) => kind === 'delete'),
);
assert.deepEqual(
  success.calls.find(([kind]) => kind === 'delete'),
  ['delete', 'verified-user'],
);
const failed = fixture({ storageFails: true });
assert.equal((await failed.handler(request({ confirmation: 'DELETE' }))).status, 503);
assert(
  !failed.calls.some(([kind]) => kind === 'delete' || kind === 'ack_account_deletion_objects'),
);
const large = fixture({ manyBatches: true });
assert.equal((await large.handler(request({ confirmation: 'DELETE' }))).status, 202);
assert.equal(large.calls.filter(([kind]) => kind === 'remove').length, 10);
assert(!large.calls.some(([kind]) => kind === 'delete'));

assert.deepEqual(parseAllowedOrigins(' https://app.example.test,https://admin.example.test '), [
  'https://app.example.test',
  'https://admin.example.test',
]);
for (const origin of [
  '*',
  'null',
  'http://app.example.test',
  'https://app.example.test/path',
  'https://user:pass@app.example.test',
]) {
  assert.throws(() => parseAllowedOrigins(origin));
}
for (const origin of ['https://evil.example', 'null', 'https://app.example.test.evil.example']) {
  const blocked = fixture({ origins: ['https://app.example.test'] });
  const req = request({ confirmation: 'DELETE' });
  req.headers.set('Origin', origin);
  const response = await blocked.handler(req);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(blocked.calls.length, 0);
}
const browser = fixture({ origins: ['https://app.example.test'] });
const preflight = await browser.handler(
  new Request('https://example.test/delete-account', {
    method: 'OPTIONS',
    headers: { Origin: 'https://app.example.test' },
  }),
);
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://app.example.test');
assert.equal(preflight.headers.get('Vary'), 'Origin');
assert.equal(browser.calls.length, 0);
const browserRequest = request({ confirmation: 'DELETE' });
browserRequest.headers.set('Origin', 'https://app.example.test');
const browserResponse = await browser.handler(browserRequest);
assert.equal(browserResponse.status, 200);
assert.equal(browserResponse.headers.get('X-Content-Type-Options'), 'nosniff');
assert.equal(browserResponse.headers.get('Cache-Control'), 'no-store');

const tooBig = fixture();
assert.equal(
  (await tooBig.handler(request({ confirmation: 'DELETE', padding: 'x'.repeat(2048) }))).status,
  413,
);
assert(!tooBig.calls.some(([kind]) => kind === 'prepare_account_deletion'));
const wrongType = fixture();
const plain = request({ confirmation: 'DELETE' });
plain.headers.set('Content-Type', 'text/plain');
assert.equal((await wrongType.handler(plain)).status, 415);
assert.equal(wrongType.calls.length, 0);

// Enforce the actual stream size, not a missing or attacker-supplied length.
for (const declaredLength of [undefined, '1']) {
  const streamed = fixture();
  const headers = { Authorization: 'Bearer valid-session', 'Content-Type': 'application/json' };
  if (declaredLength) headers['Content-Length'] = declaredLength;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"confirmation":"DELETE","padding":"'));
      controller.enqueue(new TextEncoder().encode('x'.repeat(1100)));
      controller.enqueue(new TextEncoder().encode('"}'));
      controller.close();
    },
  });
  const response = await streamed.handler(
    new Request('https://example.test/delete-account', {
      method: 'POST',
      headers,
      body: stream,
      duplex: 'half',
    }),
  );
  assert.equal(response.status, 413);
  assert(!streamed.calls.some(([kind]) => kind === 'prepare_account_deletion'));
}
for (const body of [null, [], {}, { confirmation: 'delete' }]) {
  const badBody = fixture();
  assert.equal((await badBody.handler(request(body))).status, 400);
  assert(!badBody.calls.some(([kind]) => kind === 'prepare_account_deletion'));
}
// --- Sign in with Apple revocation ------------------------------------------
assert(!success.calls.some(([kind]) => kind === 'revoke'), 'no token means nothing to revoke');
const appleUser = fixture({ appleToken: 'refresh-abc' });
assert.deepEqual(await (await appleUser.handler(request({ confirmation: 'DELETE' }))).json(), {
  deleted: true,
});
const order = appleUser.calls.map(([kind]) => kind);
assert(
  order.indexOf('revoke') < order.indexOf('prepare_account_deletion'),
  'Apple is revoked before any data is removed',
);
assert.deepEqual(
  appleUser.calls.find(([kind]) => kind === 'revoke'),
  ['revoke', 'refresh-abc'],
);
assert.deepEqual(
  appleUser.calls.find(([kind]) => kind === 'forget'),
  ['forget', 'apple_refresh_tokens', 'verified-user'],
  'a revoked token is forgotten so a retry does not revoke it again',
);
const appleDown = fixture({ appleToken: 'refresh-abc', revokeFails: new Error('503') });
assert.equal((await appleDown.handler(request({ confirmation: 'DELETE' }))).status, 503);
assert(
  !appleDown.calls.some(([kind]) =>
    ['forget', 'prepare_account_deletion', 'delete'].includes(kind),
  ),
  'a failed revocation leaves the account intact for a retry',
);
const unconfigured = fixture({ appleToken: 'refresh-abc', appleConfigured: false });
assert.equal((await unconfigured.handler(request({ confirmation: 'DELETE' }))).status, 503);
assert(
  !unconfigured.calls.some(([kind]) => kind === 'prepare_account_deletion'),
  'missing Apple settings never skip the revocation silently',
);
const emailOnly = fixture({ appleConfigured: false });
assert.deepEqual(await (await emailOnly.handler(request({ confirmation: 'DELETE' }))).json(), {
  deleted: true,
});

console.log(
  'PASS: deletion identity, ownership, Apple revocation, cleanup, CORS allowlist, body limits, content type and response headers.',
);
