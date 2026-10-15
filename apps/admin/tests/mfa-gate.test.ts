import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MfaGate } from '../src/features/auth/mfa-gate';

const state = vi.hoisted(() => ({ query: {} as Record<string, unknown> }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => state.query,
  useQueryClient: () => ({ clear: vi.fn() }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: {} }));

function render(query: Record<string, unknown>) {
  state.query = query;
  return renderToStaticMarkup(createElement(MfaGate, null, 'SECRET ADMIN WORKSPACE'));
}

describe('admin MFA rendering boundary', () => {
  it.each([
    { isPending: true },
    { isError: true },
    { isError: true, data: { currentLevel: 'aal2', nextLevel: 'aal2', factors: [] } },
    { data: { currentLevel: 'aal1', nextLevel: 'aal1', factors: [] } },
    { data: { currentLevel: 'aal1', nextLevel: 'aal2', factors: [{ id: 'factor' }] } },
    { data: { currentLevel: 'aal2', nextLevel: 'aal1', factors: [] } },
  ])('does not render admin content until MFA is verified: %j', (query) => {
    expect(render(query)).not.toContain('SECRET ADMIN WORKSPACE');
  });
  it('renders content only with current and next AAL2', () => {
    expect(
      render({ data: { currentLevel: 'aal2', nextLevel: 'aal2', factors: [{ id: 'factor' }] } }),
    ).toContain('SECRET ADMIN WORKSPACE');
  });
  it('offers enrollment when no authenticator exists', () => {
    expect(render({ data: { currentLevel: 'aal1', nextLevel: 'aal1', factors: [] } })).toContain(
      'Set up authenticator',
    );
  });
  it('offers a code challenge for enrolled authenticators', () => {
    expect(
      render({ data: { currentLevel: 'aal1', nextLevel: 'aal2', factors: [{ id: 'factor' }] } }),
    ).toContain('Six-digit code');
  });
});
