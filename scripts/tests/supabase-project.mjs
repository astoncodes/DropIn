import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Checks how the hosted scripts find their credentials, without a network or a
// real .env: an empty directory stands in for the repository and the home
// folder, and `fetch` is replaced by a recorder.

const empty = mkdtempSync(join(tmpdir(), 'dropin-project-'));
process.chdir(empty);
process.env.HOME = empty;
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';

const { adminKey, hostedProject } = await import('../supabase-project.mjs');

const ACCESS_TOKEN = `sbp_${'0123456789abcdef'.repeat(2)}01234567`;
const realFetch = globalThis.fetch;
const requests = [];
function answer(status, body) {
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), authorization: init?.headers?.Authorization });
    return new Response(JSON.stringify(body), { status });
  };
}
function credentials({ token, secret }) {
  requests.length = 0;
  delete process.env.SUPABASE_ACCESS_TOKEN;
  delete process.env.SUPABASE_SECRET_KEY;
  if (token) process.env.SUPABASE_ACCESS_TOKEN = token;
  if (secret) process.env.SUPABASE_SECRET_KEY = secret;
}

try {
  // The project is read from the public URL, and a real access token is passed on.
  credentials({ token: ACCESS_TOKEN });
  assert.deepEqual(hostedProject(), { ref: 'abcdefghijklmnopqrst', token: ACCESS_TOKEN });

  // With neither, the token is left for the CLI's own login to supply.
  credentials({});
  assert.equal(hostedProject().token, undefined);

  // A project key in the access-token variable is named as the mistake it is,
  // instead of failing later as an unexplained refusal.
  for (const projectKey of ['sb_secret_abcdefghijklmnop', 'eyJhbGciOiJIUzI1NiJ9.e30.signature']) {
    credentials({ token: projectKey });
    assert.throws(hostedProject, (error) => {
      assert.match(error.message, /SUPABASE_ACCESS_TOKEN/);
      assert.match(error.message, /SUPABASE_SECRET_KEY/);
      assert.ok(!error.message.includes(projectKey), 'the message repeats the key');
      return true;
    });
  }

  // The project's own secret key is used as given, with no request made.
  credentials({ secret: 'sb_secret_abcdefghijklmnop' });
  answer(500, {});
  assert.equal(await adminKey(hostedProject()), 'sb_secret_abcdefghijklmnop');
  assert.deepEqual(requests, []);

  // Without it, the key is looked up with the access token.
  credentials({ token: ACCESS_TOKEN });
  answer(200, [
    { name: 'anon', api_key: 'public' },
    { name: 'service_role', api_key: 'looked-up' },
  ]);
  assert.equal(await adminKey(hostedProject()), 'looked-up');
  assert.deepEqual(requests, [
    {
      url: 'https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/api-keys',
      authorization: `Bearer ${ACCESS_TOKEN}`,
    },
  ]);

  // A refused token says so, and which status came back.
  answer(401, { message: 'Unauthorized' });
  await assert.rejects(adminKey(hostedProject()), /refused[^]*401/);

  // With no credential at all, both ways of supplying one are named.
  credentials({});
  answer(200, []);
  await assert.rejects(adminKey(hostedProject()), (error) => {
    assert.match(error.message, /SUPABASE_SECRET_KEY/);
    assert.match(error.message, /SUPABASE_ACCESS_TOKEN/);
    return true;
  });
  assert.deepEqual(requests, [], 'a lookup was attempted without a token');
} finally {
  globalThis.fetch = realFetch;
}

console.log(
  'PASS: project credentials: secret key used directly, token lookup, refused and missing credentials explained, misplaced project key named.',
);
