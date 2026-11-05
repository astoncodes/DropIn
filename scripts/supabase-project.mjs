import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';

/** Personal access tokens, the only kind the Management API and the CLI take. */
const ACCESS_TOKEN = /^sbp_/;

export function hostedProject() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const inferred = url
    ? new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1]
    : undefined;
  const ref = process.env.SUPABASE_PROJECT_REF || inferred;
  if (!ref || !/^[a-z0-9]+$/.test(ref))
    throw new Error('Set SUPABASE_PROJECT_REF or a hosted EXPO_PUBLIC_SUPABASE_URL.');
  let token = process.env.SUPABASE_ACCESS_TOKEN;
  const saved = `${homedir()}/.supabase/access-token`;
  if (!token && existsSync(saved)) token = readFileSync(saved, 'utf8').trim();
  // A project's own key here is refused by everything that asks for a token,
  // with messages that never say why, so it is caught where it is read.
  if (token && !ACCESS_TOKEN.test(token))
    throw new Error(
      'SUPABASE_ACCESS_TOKEN is not a personal access token; those start with "sbp_" and come ' +
        "from the dashboard's Account → Access Tokens page. A project's secret key belongs in " +
        'SUPABASE_SECRET_KEY instead.',
    );
  // A missing token file does not mean "not signed in": the CLI keeps its login in
  // the OS keyring on macOS and Windows, where we cannot read it. Leave the token
  // undefined in that case and let the CLI authenticate itself.
  return { ref, token };
}

/**
 * The key that lets a script act as the project's administrator: create and
 * remove temporary accounts, and read what row-level security hides.
 *
 * `SUPABASE_SECRET_KEY` is used as given. It opens one project, so it is the
 * narrower credential and the one to prefer. Without it the key is looked up
 * with a personal access token, which can reach every project in the account.
 */
export async function adminKey({ ref, token }) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (secret) return secret;
  if (!token)
    throw new Error(
      "Set SUPABASE_SECRET_KEY to the project's secret key (dashboard → Project settings → " +
        'API keys), or SUPABASE_ACCESS_TOKEN to a personal access token. See .env.example.',
    );
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      `Supabase refused the access token when asked for this project's keys (HTTP ${response.status}). ` +
        'Check that the token is current and that its account can open the project.',
    );
  const key = (await response.json()).find((item) => item.name === 'service_role')?.api_key;
  if (!key) throw new Error('The project returned no service_role key.');
  return key;
}
