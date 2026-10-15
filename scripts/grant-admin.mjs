#!/usr/bin/env node
/**
 * Grants admin capability to a user, by email.
 *
 *   npm run db:admin -- you@example.com
 *
 * There is deliberately no API path that does this. admin_users has no INSERT
 * policy for anyone — not for players, not for admins — so promotion requires a
 * privileged database connection and a human running this on purpose. That is
 * what keeps escalation auditable, and it is why supabase/tests/004 asserts
 * that even an admin cannot promote somebody through the API.
 *
 * Reads SUPABASE_DB_URL from .env, for the hosted project.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import postgres from 'postgres';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readEnv(name) {
  if (process.env[name]) return process.env[name];

  let contents;
  try {
    contents = readFileSync(join(repoRoot, '.env'), 'utf8');
  } catch {
    return undefined;
  }

  return parseEnv(contents)[name];
}

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('Usage: npm run db:admin -- you@example.com');
  process.exit(1);
}

const databaseUrl = readEnv('SUPABASE_DB_URL');
if (!databaseUrl) {
  console.error('SUPABASE_DB_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const sql = postgres(databaseUrl, { onnotice: () => {} });

try {
  const [user] = await sql`
    select id, email from auth.users where lower(email) = lower(${email}) limit 1
  `;

  if (!user) {
    console.error(`No account found for ${email}.`);
    console.error('Sign in through the app once first — the account is created on first sign-in.');
    process.exit(1);
  }

  await sql`
    insert into public.admin_users (user_id, note)
    values (${user.id}, 'granted via scripts/grant-admin.mjs')
    on conflict (user_id) do nothing
  `;

  const roster = await sql`
    select u.email
      from public.admin_users a
      join auth.users u on u.id = a.user_id
     order by u.email
  `;

  console.log(`${user.email} is now an admin.`);
  console.log(`\nCurrent admins (${roster.length}):`);
  for (const admin of roster) console.log(`  - ${admin.email}`);
} finally {
  await sql.end();
}
