/**
 * Each tab's title, by route name. The tab bar labels its tabs with these.
 *
 * The root stack also gives the tabs group the focused tab's title, because a
 * screen opened from a tab names the screen it returns to on its back button:
 * iOS shows it beside the arrow and screen readers announce it. A group with no
 * title is named by its folder instead, so the button would read "(tabs)".
 */
export const TAB_TITLES = {
  index: 'Live',
  feed: 'Discover',
  scheduled: 'Scheduled',
  chats: 'Chats',
  profile: 'Profile',
} as const;

type TabRoute = keyof typeof TAB_TITLES;

function isTabRoute(name: string): name is TabRoute {
  return Object.hasOwn(TAB_TITLES, name);
}

/**
 * The title of the tab with this route name. Before the tab navigator first
 * renders there is no focused route, and the tabs open on Live.
 */
export function tabTitle(routeName: string | undefined): string {
  return routeName !== undefined && isTabRoute(routeName)
    ? TAB_TITLES[routeName]
    : TAB_TITLES.index;
}
