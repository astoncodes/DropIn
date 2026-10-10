import { describe, expect, it } from 'vitest';

import { date, label } from '../src/features/console/console-shared';

describe('date', () => {
  it('shows the time to the minute, leaving out seconds no review decision turns on', () => {
    const shown = date('2026-09-22T12:34:56Z');

    expect(shown).toMatch(/\d[:.]\d{2}/);
    expect(shown).not.toContain('56');
  });
});

describe('label', () => {
  it('reads a database value as a phrase a reviewer would write', () => {
    expect(label('possible_duplicate')).toBe('Possible duplicate');
    expect(label('admin_verified')).toBe('Admin verified');
  });

  it('leaves an empty value empty', () => {
    expect(label('')).toBe('');
  });
});
