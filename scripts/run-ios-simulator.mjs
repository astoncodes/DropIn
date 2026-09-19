#!/usr/bin/env node
/**
 * Builds and launches the iOS app on a simulator without a signing identity.
 *
 * `expo run:ios` refuses to build when the project declares an entitlement from
 * its ENTITLEMENTS_THAT_REQUIRE_CODE_SIGNING list — `com.apple.developer.applesignin`
 * is on it — unless a development team is configured. That check runs for
 * simulator builds too, so on a machine with no Apple ID in Xcode it fails with
 * "No code signing certificates are available to use" before compiling anything.
 *
 * THIS BUILD CANNOT TEST AUTHENTICATION.
 *
 * `CODE_SIGNING_ALLOWED=NO` produces an ad-hoc, linker-signed binary with **no
 * entitlements applied at all** — verify with `codesign -d --entitlements -`.
 * Everything that depends on one therefore fails:
 *
 *   - Sign in with Apple needs `com.apple.developer.applesignin`, and does not
 *     work in a simulator regardless.
 *   - expo-secure-store needs keychain access, so Supabase session persistence
 *     throws "A required entitlement isn't present" and the auth auto-refresh
 *     tick fails on a loop.
 *   - Google sign-in fails for the same reason.
 *
 * Use this for maps, layout, navigation and other UI work only. Anything
 * touching auth or secure storage needs a properly signed build, and a free
 * Personal Team cannot produce one while `usesAppleSignIn: true` is set:
 * Sign in with Apple requires a paid Apple Developer Program membership. See
 * the iOS build section of the README for the two ways forward.
 *
 *   npm run ios:sim
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const iosDir = join(repoRoot, 'apps/mobile/ios');
const workspace = join(iosDir, 'DropIn.xcworkspace');

function run(file, args, options = {}) {
  return execFileSync(file, args, { encoding: 'utf8', ...options });
}

if (!existsSync(workspace)) {
  console.error(
    'No native project found. Generate one first:\n\n' +
      '  cd apps/mobile && npx expo prebuild --clean -p ios\n',
  );
  process.exit(1);
}

/** Prefer an already-booted simulator so repeat runs reuse the same device. */
function pickSimulator() {
  const devices = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', '--json'])).devices;
  const all = Object.values(devices)
    .flat()
    .filter((device) => device.isAvailable && /^iPhone/.test(device.name));
  if (all.length === 0) {
    console.error(
      'No available iPhone simulators. Install one from Xcode > Settings > Components.',
    );
    process.exit(1);
  }
  return all.find((device) => device.state === 'Booted') ?? all.at(-1);
}

const simulator = pickSimulator();
console.log(`> Simulator: ${simulator.name} (${simulator.udid})`);

if (simulator.state !== 'Booted') {
  console.log('> Booting…');
  run('xcrun', ['simctl', 'boot', simulator.udid]);
}
// Bring Simulator.app forward so the launch is visible rather than headless.
try {
  run('open', ['-a', 'Simulator']);
} catch {
  // A missing Simulator.app is not fatal; the install and launch still work.
}

console.log('> Building (this takes several minutes the first time)…');
run(
  'xcodebuild',
  [
    '-workspace',
    workspace,
    '-scheme',
    'DropIn',
    '-configuration',
    'Debug',
    '-destination',
    `platform=iOS Simulator,id=${simulator.udid}`,
    '-derivedDataPath',
    join(iosDir, 'build'),
    'CODE_SIGNING_ALLOWED=NO',
    'build',
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);

const app = join(iosDir, 'build/Build/Products/Debug-iphonesimulator/DropIn.app');
if (!existsSync(app)) {
  console.error(`Build reported success but ${app} is missing.`);
  process.exit(1);
}

const bundleId = run('/usr/libexec/PlistBuddy', [
  '-c',
  'Print :CFBundleIdentifier',
  join(app, 'Info.plist'),
]).trim();

console.log(`> Installing ${bundleId}…`);
run('xcrun', ['simctl', 'install', simulator.udid, app]);
run('xcrun', ['simctl', 'launch', simulator.udid, bundleId]);

console.log(
  `\nLaunched ${bundleId} on ${simulator.name}.\n` +
    'Start the bundler in another terminal if it is not already running:\n\n' +
    '  npm run mobile\n\n' +
    'NOTE: this build is unsigned and carries no entitlements, so authentication\n' +
    'does not work. Expect "A required entitlement isn\'t present" from\n' +
    'expo-secure-store and failures from Apple and Google sign-in. Use it for UI\n' +
    'and map work; test auth with a signed build (`npm run ios`) after adding an\n' +
    'Apple ID in Xcode > Settings > Accounts.\n',
);
