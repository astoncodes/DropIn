import { describe, expect, it } from 'vitest';

import { tabTitle } from '../src/lib/tab-titles';

/**
 * The root stack names the tabs group after its focused tab, and a screen opened
 * from a tab shows that name on its back button. Whatever the input, the answer
 * is a tab's title: never the group's folder name, "(tabs)".
 */

describe('tabTitle', () => {
  it('names the focused tab', () => {
    expect(tabTitle('index')).toBe('Live');
    expect(tabTitle('profile')).toBe('Profile');
  });

  it('names Live before the tab navigator has a focused route', () => {
    expect(tabTitle(undefined)).toBe('Live');
  });

  it.each([
    ['a route group', '(tabs)'],
    ['an inherited object key', 'toString'],
  ])('names Live for %s, which is not a tab', (_, routeName) => {
    expect(tabTitle(routeName)).toBe('Live');
  });
});
