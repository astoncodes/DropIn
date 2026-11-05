import { describe, expect, it } from 'vitest';

import { needsSignInForTab } from '../src/lib/tab-access';

/**
 * Signed out, the account tabs are hidden and opening one leads to sign-in.
 * Everything else stays open to visitors, including screens such as a venue or
 * a session, which are stacked above the tabs and keep the tabs layout mounted.
 */

describe('needsSignInForTab', () => {
  it.each([['feed'], ['scheduled'], ['chats']])(
    'sends a visitor at the %s tab to sign-in',
    (tab) => {
      expect(needsSignInForTab(['(tabs)', tab])).toBe(true);
    },
  );

  it('keeps the live map open', () => {
    expect(needsSignInForTab(['(tabs)'])).toBe(false);
    expect(needsSignInForTab(['(tabs)', 'index'])).toBe(false);
  });

  it('keeps the profile tab open, which offers sign-in itself', () => {
    expect(needsSignInForTab(['(tabs)', 'profile'])).toBe(false);
  });

  it.each([
    ['a venue', ['venue', '[venueId]']],
    ['a session', ['session', '[sessionId]']],
    ['the terms', ['terms']],
  ])('keeps %s open when it is stacked above the tabs', (_, segments) => {
    expect(needsSignInForTab(segments)).toBe(false);
  });
});
