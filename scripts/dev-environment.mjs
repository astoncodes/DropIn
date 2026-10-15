import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function projectRef(value) {
  const url = new URL(value);
  const ref = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname)?.[1];
  if (
    url.protocol !== 'https:' ||
    !ref ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Use an exact hosted Supabase HTTPS URL for development.');
  }
  return ref;
}

/** Both clients must select the same non-production project in a single step. */
export function developmentEnvironment(base, profile, inherited = process.env) {
  const url = profile.DEV_SUPABASE_URL?.trim();
  const key = profile.DEV_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key)
    throw new Error('Set DEV_SUPABASE_URL and DEV_SUPABASE_PUBLISHABLE_KEY in .env.dev.');
  const ref = projectRef(url);
  const appRefs = [
    base.SUPABASE_PROJECT_REF,
    ...[base.EXPO_PUBLIC_SUPABASE_URL, base.VITE_SUPABASE_URL].filter(Boolean).map(projectRef),
  ];
  if (!appRefs.some(Boolean))
    throw new Error('Configure the app project in .env so development can verify isolation.');
  if (appRefs.includes(ref))
    throw new Error('Development must not target the app project configured in .env.');
  if (base.SUPABASE_TEST_PROJECT_REF && ref !== base.SUPABASE_TEST_PROJECT_REF) {
    throw new Error('The dev profile must target the configured isolated test project.');
  }
  if (!key.startsWith('sb_publishable_')) {
    let payload;
    try {
      payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString());
    } catch {
      /* Invalid keys fail below. */
    }
    if (payload?.role !== 'anon' || payload.ref !== ref) {
      throw new Error(
        'Use the development project publishable key or its matching legacy anon key.',
      );
    }
  }

  // Preserve map/provider configuration without forwarding database passwords
  // or management credentials to client development processes.
  const env = { ...inherited };
  for (const name of Object.keys(env)) {
    if (/^(SUPABASE_|DEV_SUPABASE_)/.test(name)) delete env[name];
  }
  for (const [name, value] of Object.entries(base)) {
    if (/^(EXPO_PUBLIC_|VITE_)/.test(name)) env[name] = value;
  }
  return {
    ref,
    env: {
      ...env,
      SUPABASE_PROJECT_REF: ref,
      EXPO_PUBLIC_SUPABASE_URL: url,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: key,
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_ANON_KEY: key,
      // Expo must not reload a different .env after we select the profile.
      EXPO_NO_DOTENV: '1',
    },
  };
}

export function launchDevelopment(action, args = []) {
  const commands = {
    web: ['run', 'dev:web', '--workspace', 'apps/mobile', '--', ...args],
    mobile: ['run', 'start', '--workspace', 'apps/mobile', '--', ...args],
    admin: ['run', 'dev', '--workspace', 'apps/admin', '--', ...args],
  };
  if (action !== 'check' && !Object.hasOwn(commands, action)) {
    throw new Error(
      'Usage: node scripts/dev-environment.mjs web|mobile|admin|check [server options]',
    );
  }
  const profile = join(root, '.env.dev');
  if (!existsSync(profile))
    throw new Error(
      'Copy .env.dev.example to .env.dev and fill in the development publishable key.',
    );
  const base = existsSync(join(root, '.env'))
    ? parseEnv(readFileSync(join(root, '.env'), 'utf8'))
    : {};
  const selected = developmentEnvironment(base, parseEnv(readFileSync(profile, 'utf8')));
  console.log(`Development backend: ${selected.ref} (isolated test/dev project)`);
  if (action === 'check') return;
  const child = spawn('npm', commands[action], { cwd: root, env: selected.env, stdio: 'inherit' });
  child.on('error', () => {
    console.error('Could not start the development process.');
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    launchDevelopment(process.argv[2], process.argv.slice(3));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
