/** Tabs that need an account. Signed out, the tab bar hides them. */
export const ACCOUNT_TABS: ReadonlySet<string> = new Set(['feed', 'scheduled', 'chats']);

/**
 * Whether a signed-out visitor on this route must sign in first, from the
 * focused route's segments. Only an account tab qualifies. Screens stacked
 * above the tabs, such as a venue or a session, keep the tabs layout mounted
 * but are open to visitors, so the global path alone cannot decide this.
 */
export function needsSignInForTab(segments: readonly string[]): boolean {
  return segments[0] === '(tabs)' && ACCOUNT_TABS.has(segments[1] ?? '');
}
