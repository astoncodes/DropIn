import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SignedInOnly } from '../src/features/auth/signed-in-only';

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  isLoading: false,
}));
vi.mock('../src/providers/auth-context', () => ({ useSession: () => state }));
vi.mock('expo-router', () => ({ Redirect: ({ href }: { href: string }) => `redirect:${href}` }));

function render() {
  return renderToStaticMarkup(createElement(SignedInOnly, { children: 'private content' }));
}
it('does not render private screens while loading', () => {
  state.isLoading = true;
  state.session = null;
  expect(render()).toBe('');
});
it('redirects signed-out deep links to sign-in', () => {
  state.isLoading = false;
  state.session = null;
  expect(render()).toBe('redirect:/sign-in');
});
it('renders private screens after sign-in and hides them after sign-out', () => {
  state.isLoading = false;
  state.session = { user: { id: 'test-user' } };
  expect(render()).toBe('private content');
  state.session = null;
  expect(render()).not.toContain('private content');
});
