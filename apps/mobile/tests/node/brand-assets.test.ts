import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { palettes } from '../../src/theme/tokens';

/**
 * The icon and splash images are drawn by `scripts/brand-assets.mjs`, and the
 * stores and operating systems are strict about their shape in ways nothing
 * else in the repository checks: a wrong one surfaces as a rejected upload or
 * a flash of the wrong colour at launch.
 */

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const appConfig = readFileSync(root('app.config.ts'), 'utf8');

const PNG_SIGNATURE = '89504e470d0a1a0a';
/** PNG colour types that carry an alpha channel. */
const WITH_ALPHA = new Set([4, 6]);

function png(name: string) {
  const bytes = readFileSync(root(`assets/images/${name}`));
  expect(bytes.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
  // The IHDR chunk always comes first: width, height, bit depth, colour type.
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    hasAlpha: WITH_ALPHA.has(bytes.readUInt8(25)),
  };
}

function configured(pattern: RegExp, what: string): string {
  const match = appConfig.match(pattern);
  if (!match) throw new Error(`app.config.ts no longer declares ${what}`);
  return match[1].toUpperCase();
}

describe('app icon', () => {
  it('is 1024 square with no alpha channel, which the App Store rejects', () => {
    expect(png('icon.png')).toEqual({ width: 1024, height: 1024, hasAlpha: false });
  });

  it.each(['android-icon-foreground.png', 'android-icon-monochrome.png'])(
    'has a transparent 1024 square Android layer in %s',
    (name) => {
      expect(png(name)).toEqual({ width: 1024, height: 1024, hasAlpha: true });
    },
  );

  it('sits on the ink the Android foreground was drawn for', () => {
    const background = configured(
      /adaptiveIcon: \{\s*backgroundColor: '(#[0-9A-Fa-f]{6})'/,
      'an adaptive icon background colour',
    );
    expect(background).toBe(palettes.light.surfaceInverse.toUpperCase());
  });
});

describe('splash screen', () => {
  it('shows a transparent square image, so the wordmark sits on the configured colour', () => {
    expect(png('splash-icon.png')).toEqual({ width: 1024, height: 1024, hasAlpha: true });
  });

  it('uses the page background, so the first screen does not change colour as it appears', () => {
    const background = configured(
      /'expo-splash-screen',\s*\{\s*backgroundColor: '(#[0-9A-Fa-f]{6})'/,
      'a splash background colour',
    );
    expect(background).toBe(palettes.light.background.toUpperCase());
  });
});
