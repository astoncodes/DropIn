import assert from 'node:assert/strict';
import { developmentEnvironment } from '../dev-environment.mjs';

const production = 'aaaaaaaaaaaaaaaaaaaa';
const development = 'bbbbbbbbbbbbbbbbbbbb';
const base = {
  SUPABASE_PROJECT_REF: production,
  SUPABASE_TEST_PROJECT_REF: development,
  EXPO_PUBLIC_SUPABASE_URL: `https://${production}.supabase.co`,
  VITE_SUPABASE_URL: `https://${production}.supabase.co`,
  EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: 'public-map-token',
  SUPABASE_DB_URL: 'private-database-credential',
};
const profile = {
  DEV_SUPABASE_URL: `https://${development}.supabase.co`,
  DEV_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_test_key',
};
const result = developmentEnvironment(base, profile, {
  PATH: '/bin',
  SUPABASE_ACCESS_TOKEN: 'private-management-token',
  SUPABASE_DB_URL: 'private-database-credential',
});
assert.equal(result.ref, development);
assert.equal(result.env.EXPO_PUBLIC_SUPABASE_URL, profile.DEV_SUPABASE_URL);
assert.equal(result.env.VITE_SUPABASE_URL, profile.DEV_SUPABASE_URL);
assert.equal(result.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, result.env.VITE_SUPABASE_ANON_KEY);
assert.equal(result.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN, 'public-map-token');
assert.equal(result.env.PATH, '/bin');
assert.equal(result.env.SUPABASE_ACCESS_TOKEN, undefined);
assert.equal(result.env.SUPABASE_DB_URL, undefined);
assert.equal(base.SUPABASE_PROJECT_REF, production);
assert.throws(
  () =>
    developmentEnvironment(base, { ...profile, DEV_SUPABASE_URL: base.EXPO_PUBLIC_SUPABASE_URL }),
  /must not target/,
);
assert.throws(
  () =>
    developmentEnvironment(base, {
      ...profile,
      DEV_SUPABASE_URL: 'https://cccccccccccccccccccc.supabase.co',
    }),
  /isolated test/,
);
assert.throws(
  () => developmentEnvironment(base, { ...profile, DEV_SUPABASE_PUBLISHABLE_KEY: '' }),
  /Set DEV/,
);
assert.throws(
  () =>
    developmentEnvironment(base, {
      ...profile,
      DEV_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_wrong_key',
    }),
  /publishable key/,
);
const jwt = (role, ref) =>
  `header.${Buffer.from(JSON.stringify({ role, ref })).toString('base64url')}.signature`;
assert.throws(
  () =>
    developmentEnvironment(base, {
      ...profile,
      DEV_SUPABASE_PUBLISHABLE_KEY: jwt('service_role', development),
    }),
  /publishable key/,
);
assert.throws(
  () =>
    developmentEnvironment(base, {
      ...profile,
      DEV_SUPABASE_PUBLISHABLE_KEY: jwt('anon', production),
    }),
  /matching legacy/,
);
assert.equal(
  developmentEnvironment(base, {
    ...profile,
    DEV_SUPABASE_PUBLISHABLE_KEY: jwt('anon', development),
  }).ref,
  development,
);
assert.throws(
  () =>
    developmentEnvironment(base, {
      ...profile,
      DEV_SUPABASE_URL: `${profile.DEV_SUPABASE_URL}/rest/v1`,
    }),
  /exact hosted/,
);
console.log('PASS: dev target isolation, matching client configuration and credential filtering.');
