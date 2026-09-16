import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the failure that broke Apple and Google sign-in: `ios/` was generated
 * before the providers were configured, so the entitlement and the Google URL
 * scheme were simply absent from the binary. Because `ios/` is gitignored, no
 * diff, review or CI run could show it — the only signal was sign-in failing on
 * a device with a message about the network.
 *
 * `ios/` does not exist in CI, so these checks skip there and bite where the
 * problem actually lives: a developer's machine with a stale prebuild. Run
 * `npx expo prebuild --clean -p ios` to regenerate.
 */

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

const appConfig = readFileSync(root('app.config.ts'), 'utf8');

const INFO_PLIST = root('ios/DropIn/Info.plist');
const ENTITLEMENTS = root('ios/DropIn/DropIn.entitlements');
const PBXPROJ = root('ios/DropIn.xcodeproj/project.pbxproj');

const hasNativeProject = existsSync(PBXPROJ);
const describeNative = hasNativeProject ? describe : describe.skip;

function declaredIdentifier(): string {
  const match = appConfig.match(/const APP_IDENTIFIER = '([^']+)'/);
  if (!match) throw new Error('app.config.ts no longer declares APP_IDENTIFIER');
  return match[1];
}

describe('app.config.ts identifier', () => {
  it('declares one identifier used by both platforms', () => {
    expect(declaredIdentifier()).toMatch(/^[a-z][a-z0-9.]+$/);
    // Both platforms must read the same constant, never a literal of their own.
    expect(appConfig).toMatch(/bundleIdentifier: APP_IDENTIFIER/);
    expect(appConfig).toMatch(/package: APP_IDENTIFIER/);
  });

  it('keeps Sign in with Apple declared, which is what generates the entitlement', () => {
    expect(appConfig).toMatch(/usesAppleSignIn: true/);
  });

  it('passes a Google URL scheme through from the environment', () => {
    expect(appConfig).toMatch(/iosUrlScheme:/);
    expect(appConfig).toMatch(/EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME/);
  });
});

describeNative('generated iOS project matches app.config.ts', () => {
  it('builds the identifier app.config.ts declares', () => {
    const pbxproj = readFileSync(PBXPROJ, 'utf8');
    const built = [...pbxproj.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) =>
      m[1].trim(),
    );
    expect(built.length).toBeGreaterThan(0);
    for (const identifier of built) {
      expect(identifier.replace(/"/g, '')).toBe(declaredIdentifier());
    }
  });

  it('carries the Sign in with Apple entitlement', () => {
    // Without this key iOS rejects the authorization request outright, and the
    // thrown error says nothing about entitlements.
    expect(readFileSync(ENTITLEMENTS, 'utf8')).toContain('com.apple.developer.applesignin');
  });

  it('registers the reversed Google client ID as a URL scheme', () => {
    // Google's SDK returns to the app through this scheme. Without it the
    // provider sheet completes and the app never hears back.
    expect(readFileSync(INFO_PLIST, 'utf8')).toMatch(/com\.googleusercontent\.apps\./);
  });

  it('keeps the deep-link scheme the auth callback relies on', () => {
    expect(readFileSync(INFO_PLIST, 'utf8')).toContain('<string>dropin</string>');
  });
});
