#!/usr/bin/env node
/**
 * Fails if a server-side credential reached a client bundle.
 *
 * Checklist item: "No service credential is reachable from mobile/admin client
 * bundles." A grep for the string "service_role" cannot do this job — the
 * Supabase client library legitimately contains that text in its own key-format
 * detection, so a naive check cries wolf on every build and gets ignored.
 *
 * This checks two things instead:
 *
 *   1. Literal values. Variables outside the public prefixes and explicit native-key
 *      allowlist are treated as server-side. Their actual values must not
 *      appear in any bundle. This is exact, and it stays correct as .env grows.
 *
 *   2. Shapes. Patterns that are credentials regardless of where they came
 *      from, in case a secret was pasted into source instead of .env.
 *
 *   scripts/check-client-bundles.mjs [--self-test]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Directories holding built client output. Add to this as apps gain builds. */
const BUNDLE_DIRS = ['apps/admin/dist', 'apps/mobile/dist'];

/** Prefixes that mark a variable as intentionally public. */
const PUBLIC_PREFIXES = ['VITE_', 'EXPO_PUBLIC_'];
/**
 * Variables a native build is expected to embed, so finding one in a bundle is
 * not evidence of a leak.
 *
 * Empty on purpose. Maps are served by `@rnmapbox/maps`, whose token arrives
 * through `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` and is covered by the public prefix
 * rule above. Add a key here only when a plugin genuinely writes it into a
 * manifest, and say which plugin.
 */
const PUBLIC_NATIVE_KEYS = new Set();

/** Values too short or generic to be meaningful evidence of a leak. */
const MIN_SECRET_LENGTH = 12;

const SHAPE_RULES = [
  {
    name: 'Supabase secret key',
    // Requires real characters after the prefix, so the library's own
    // `startsWith('sb_secret_')` check does not match.
    pattern: /sb_secret_[A-Za-z0-9_-]{12,}/,
  },
  {
    name: 'Postgres connection string with credentials',
    pattern: /postgres(?:ql)?:\/\/[^\s'"`]+:[^\s'"`]+@/,
  },
  {
    name: 'JWT carrying the service_role claim',
    // The payload segment of a service_role JWT base64-decodes to text
    // containing "service_role"; base64 of that substring is stable.
    pattern: /InNlcnZpY2Vfcm9sZSI|c2VydmljZV9yb2xl/,
  },
];

function readEnvSecrets() {
  const envPath = join(repoRoot, '.env');
  let contents;
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch {
    return [];
  }

  const secrets = [];
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line
      .slice(0, separator)
      .trim()
      .replace(/^export\s+/, '');
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }

    if (!value || value.length < MIN_SECRET_LENGTH) continue;
    if (PUBLIC_NATIVE_KEYS.has(key)) continue;
    if (PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;

    secrets.push({ key, value });
  }
  return secrets;
}

/**
 * Extensions where regex shape rules are meaningful.
 *
 * Compiled Hermes bytecode (.hbc) is excluded on purpose. Its string table
 * packs constants end to end, so a regex reads across the boundary between two
 * unrelated strings: the literal "sb_secret_" inside supabase-js's own key
 * detection sits directly before "PresenceAdapter", and a shape rule happily
 * reports `sb_secret_PresenceAdapte` as a leaked key.
 *
 * Exact literal matching has no such problem, so bytecode is still checked
 * against real .env values — which is the case that actually matters.
 */
const SHAPE_RULE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.map', '.txt'];

function isTextBundle(label) {
  return SHAPE_RULE_EXTENSIONS.some((extension) => label.endsWith(extension));
}

function collectFiles(dir) {
  const absolute = join(repoRoot, dir);
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const path = join(absolute, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(relative(repoRoot, path)));
    } else if (statSync(path).isFile()) {
      files.push(path);
    }
  }
  return files;
}

function scan({ extraContent = null, secrets = readEnvSecrets() } = {}) {
  const findings = [];

  const targets = BUNDLE_DIRS.flatMap(collectFiles).map((path) => ({
    label: relative(repoRoot, path),
    content: readFileSync(path, 'utf8'),
  }));

  if (extraContent) targets.push(extraContent);

  for (const target of targets) {
    // Exact matching against real .env values — reliable on any file, text or
    // compiled, and the check that catches an actual leak.
    for (const secret of secrets) {
      if (target.content.includes(secret.value)) {
        findings.push(`${target.label}: contains the value of ${secret.key}`);
      }
    }

    // Heuristics, for a secret pasted into source rather than sourced from
    // .env. Text bundles only — see SHAPE_RULE_EXTENSIONS.
    if (!isTextBundle(target.label)) continue;

    for (const rule of SHAPE_RULES) {
      const match = target.content.match(rule.pattern);
      if (match) {
        findings.push(`${target.label}: matches ${rule.name} (${match[0].slice(0, 24)}…)`);
      }
    }
  }

  return { findings, secretCount: secrets.length, fileCount: targets.length };
}

// --self-test plants a fake credential and confirms the scanner catches it. A
// security check nobody has seen fail is a security check nobody should trust.
if (process.argv.includes('--self-test')) {
  // Always exercise literal matching, including on CI where no real .env exists.
  const secrets = [{ key: 'SELF_TEST_SECRET', value: 'synthetic-bundle-scanner-secret-12345' }];
  const failures = [];

  // Path 1: a shape rule catching a pasted key in a text bundle.
  const shapePlant = {
    label: '<self-test>.js',
    content: 'const key = "sb_secret_AAAAAAAAAAAAAAAAAAAAAAAA"; // planted',
  };
  if (
    !scan({ extraContent: shapePlant, secrets }).findings.some((f) => f.startsWith('<self-test>'))
  ) {
    failures.push('shape rule did not catch a pasted secret key in a .js bundle');
  }

  // Path 2: exact matching catching a synthetic secret inside compiled
  // bytecode, where shape rules deliberately do not run.
  const bytecodePlant = {
    label: '<self-test>.hbc',
    content: `garbage${secrets[0].value}garbage`,
  };
  if (
    !scan({ extraContent: bytecodePlant, secrets }).findings.some((f) =>
      f.startsWith('<self-test>'),
    )
  ) {
    failures.push('exact matching did not catch a synthetic secret inside .hbc bytecode');
  }

  // Path 3: the known false positive must NOT fire. This is the regression
  // that made the check trustworthy in the first place.
  const falsePositive = {
    label: '<self-test>.hbc',
    content: 'sb_secret_PresenceAdapterConcatenatedStringTable',
  };
  if (
    scan({ extraContent: falsePositive, secrets }).findings.some((f) => f.startsWith('<self-test>'))
  ) {
    failures.push('adjacent bytecode strings were misreported as a leaked key');
  }

  if (failures.length > 0) {
    console.error('Self-test FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log('Self-test passed: leaks detected in both text and bytecode, no false positive.');
  process.exit(0);
}

const { findings, secretCount, fileCount } = scan();

if (findings.length > 0) {
  console.error('Server-side credentials found in client bundles:\n');
  for (const finding of findings) console.error(`  ${finding}`);
  console.error('\nMove the value out of the bundle. Only VITE_ / EXPO_PUBLIC_ variables');
  console.error('may be referenced from client code — see .env.example.');
  process.exit(1);
}

if (fileCount === 0) {
  console.log('No built bundles found — build first (npm run build --workspace apps/admin).');
  process.exit(0);
}

console.log(
  `Clean: ${fileCount} bundle file(s) checked against ${secretCount} server-side secret(s).`,
);
