import { describe, expect, it } from 'vitest';

import { RELEASE_REQUIRED_CONFIG, missingReleaseConfig } from '../../app.config';

/**
 * A production binary built without these values ships broken, so the EAS
 * production build must refuse to start. These pin which values count.
 */
describe('production build configuration', () => {
  const complete = Object.fromEntries(
    RELEASE_REQUIRED_CONFIG.map((name) => [name, `value-for-${name}`]),
  ) as Record<string, string>;

  it('accepts a complete configuration', () => {
    expect(missingReleaseConfig((name) => complete[name] ?? '')).toEqual([]);
  });

  it('names every missing or blank value', () => {
    const values: Record<string, string> = {
      ...complete,
      EXPO_PUBLIC_SUPABASE_URL: '',
      EXPO_PUBLIC_SUPPORT_EMAIL: '  ',
    };
    expect(missingReleaseConfig((name) => values[name] ?? '')).toEqual([
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPPORT_EMAIL',
    ]);
  });

  it('requires the backend, maps, Google sign-in and a support contact', () => {
    expect(RELEASE_REQUIRED_CONFIG).toEqual(
      expect.arrayContaining([
        'EXPO_PUBLIC_SUPABASE_URL',
        'EXPO_PUBLIC_SUPABASE_ANON_KEY',
        'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
        'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME',
        'EXPO_PUBLIC_SUPPORT_EMAIL',
      ]),
    );
  });
});
