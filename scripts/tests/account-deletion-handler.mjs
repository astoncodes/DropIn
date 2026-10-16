import assert from 'node:assert/strict';
import {
  createDeleteAccountHandler,
  parseAllowedOrigins,
} from '../../supabase/functions/delete-account/handler.mts';

function fixture({
  invalidToken = false,
  storageFails = false,
  manyBatches = false,
  origins = [],
} = {}) {
  const calls = [];
  let files = true;
  const admin = {
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
  return { handler: createDeleteAccountHandler(admin, origins), calls };
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
console.log(
  'PASS: deletion identity, ownership, cleanup, CORS allowlist, body limits, content type and response headers.',
);
