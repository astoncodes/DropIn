import { describe, expect, it } from 'vitest';

import { resolvePostSignInPath } from '../src/features/auth/resolve-post-sign-in-path';

/**
 * Both the magic-link callback and native Apple/Google sign-in land here once
 * a session exists — this is the one place that decides whether a fresh
 * account still needs onboarding before it can reach the rest of the app.
 */
describe('resolvePostSignInPath', () => {
  it('sends a profile that has never completed onboarding to /onboarding', () => {
    expect(resolvePostSignInPath(null)).toBe('/onboarding');
  });

  it('sends a profile that has completed onboarding to /profile', () => {
    expect(resolvePostSignInPath('2026-01-01T00:00:00.000Z')).toBe('/profile');
  });
});
