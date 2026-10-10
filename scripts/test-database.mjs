import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import postgres from 'postgres';

function validateTarget(ref, connection, appRefs) {
  if (!ref || !/^[a-z0-9]{20}$/.test(ref) || !connection)
    throw new Error(
      'Set SUPABASE_TEST_PROJECT_REF and SUPABASE_TEST_DB_URL for a separate, migrated test project with supabase/tests/fixtures/seed.sql loaded.',
    );
  if (!appRefs.some(Boolean))
    throw new Error(
      'Configure the app project reference before selecting a separate test project.',
    );
  let url;
  try {
    url = new URL(connection);
  } catch {
    throw new Error('Invalid test database connection string.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || appRefs.includes(ref))
    throw new Error('Database tests must target a separate test project, never the app project.');
  if (
    url.hostname !== `db.${ref}.supabase.co` &&
    !(
      url.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(url.username) === `postgres.${ref}`
    )
  )
    throw new Error(
      'Test connection must identify SUPABASE_TEST_PROJECT_REF in its hostname or pooler username.',
    );
}
function verifyTap(lines) {
  const plan = lines.find((line) => /^1\.\.\d+$/.test(line));
  const results = lines.filter((line) => /^(not )?ok\b/.test(line));
  if (
    !plan ||
    Number(plan.slice(3)) !== results.length ||
    results.some((line) => line.startsWith('not ok'))
  )
    throw new Error('pgTAP assertions failed or the test plan was incomplete.');
  return results.length;
}

/** Driver and SQLSTATE codes raised before any test SQL has run. */
const CONNECTION_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  '57P03',
]);

function isConnectionFailure(code, message) {
  return (
    CONNECTION_CODES.has(code) ||
    // Class 08 is "connection exception"; class 28 is "invalid authorization".
    /^(08|28)/.test(code) ||
    // The pooler answers with a generic internal error when it does not know the project.
    (code === 'XX000' && /tenant/i.test(message))
  );
}

/**
 * What to print when a run fails. A database that cannot be reached and a
 * database that is missing a migration need different actions, so they get
 * different advice. The message comes from the server or the driver; the
 * connection password is removed in case either one echoes the connection string.
 */
function describeFailure(error, { file, connection } = {}) {
  const code = String(error?.code ?? '');
  let message = typeof error?.message === 'string' ? error.message : String(error);
  if (connection) {
    const { password } = new URL(connection);
    for (const secret of new Set([password, decodeURIComponent(password)])) {
      if (secret) message = message.replaceAll(secret, '[password removed]');
    }
  }
  const detail = `${message}${code ? ` [${code}]` : ''}`;
  if (isConnectionFailure(code, message))
    return (
      `Could not connect to the test database: ${detail}\n` +
      'No test ran. Check the project status with `npx supabase projects list`: a free-plan ' +
      'project is paused after a week without activity (status INACTIVE) and must be restored ' +
      'from its dashboard. Otherwise check SUPABASE_TEST_DB_URL and your network.'
    );
  return (
    `Database checks failed${file ? ` in ${file}` : ''}: ${detail}\n` +
    'Verify the isolated test project has migrations and fixtures applied.'
  );
}

if (process.argv.includes('--self-test')) {
  const test = 'abcdefghijklmnopqrst',
    app = 'zyxfymvtijudbenqxzyf';
  assert.throws(() =>
    validateTarget(app, `postgres://postgres:password@db.${app}.supabase.co/postgres`, [app]),
  );
  assert.throws(() =>
    validateTarget(test, `postgres://postgres:password@db.${app}.supabase.co/postgres`, [app]),
  );
  assert.throws(() => validateTarget('', '', [app]));
  validateTarget(test, `postgres://postgres:password@db.${test}.supabase.co/postgres`, [app]);
  assert.equal(verifyTap(['1..2', 'ok 1 - owner', 'ok 2 - outsider']), 2);
  assert.throws(() => verifyTap(['1..2', 'ok 1', 'not ok 2']));
  assert.throws(() => verifyTap(['1..2', 'ok 1']));

  const paused = describeFailure({
    code: 'XX000',
    message: `(ENOTFOUND) tenant/user postgres.${test} not found`,
  });
  assert.match(paused, /Could not connect to the test database/);
  assert.match(paused, new RegExp(`tenant/user postgres\\.${test} not found`));
  assert.match(paused, /paused/);
  assert.doesNotMatch(paused, /migrations and fixtures/);
  assert.match(
    describeFailure({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND db.example' }),
    /Could not connect/,
  );
  assert.match(
    describeFailure({ code: '28P01', message: 'password authentication failed' }),
    /Could not connect/,
  );

  const missing = describeFailure(
    { code: '42883', message: 'function public.merge_venues() does not exist' },
    { file: '017_merge.sql' },
  );
  assert.match(missing, /017_merge\.sql/);
  assert.match(missing, /function public\.merge_venues\(\) does not exist/);
  assert.match(missing, /migrations and fixtures/);
  assert.doesNotMatch(missing, /paused/);

  const connection = `postgres://user:${encodeURIComponent('p@ss w0rd')}@host/db`;
  for (const echoed of [connection, 'password "p@ss w0rd" was rejected']) {
    const described = describeFailure(
      { code: '08006', message: `could not connect: ${echoed}` },
      { connection },
    );
    assert.doesNotMatch(described, /p%40ss|p@ss w0rd/);
    assert.match(described, /\[password removed\]/);
  }
  console.log('PASS: test-target isolation, pgTAP result validation and failure diagnostics.');
} else {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const ref = process.env.SUPABASE_TEST_PROJECT_REF;
  const connection = process.env.SUPABASE_TEST_DB_URL;
  const appRefs = [
    process.env.SUPABASE_PROJECT_REF,
    process.env.EXPO_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1],
    existsSync('supabase/.temp/project-ref')
      ? readFileSync('supabase/.temp/project-ref', 'utf8').trim()
      : undefined,
  ];
  validateTarget(ref, connection, appRefs);
  const sql = postgres(connection, {
    max: 1,
    ssl: 'require',
    prepare: false,
    connect_timeout: 15,
    onnotice: () => {},
  });
  let file;
  try {
    let assertions = 0;
    for (file of readdirSync('supabase/tests')
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const results = await sql.unsafe(readFileSync(`supabase/tests/${file}`, 'utf8')).simple();
      const lines = [];
      function collect(value) {
        if (typeof value === 'string') lines.push(...value.split('\n'));
        else if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === 'object') Object.values(value).forEach(collect);
      }
      collect(results);
      try {
        assertions += verifyTap(lines);
      } catch (error) {
        console.error(file, lines.filter((line) => /^(not ok|#)/.test(line)).join('\n'));
        throw error;
      }
      console.log(`PASS: ${file}`);
    }
    console.log(`PASS: ${assertions} database assertions.`);
  } catch (error) {
    console.error(describeFailure(error, { file, connection }));
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
