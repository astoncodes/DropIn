import { RUN_SERIES } from '@dropin/shared';
import { describe, expect, it } from 'vitest';

import { runWindowDays } from '../src/features/venues/run-window';

/**
 * §Recurring runs commits to a bounded public window. `upcoming_runs()` caps
 * `p_days` only at a series' 12-week lifetime, so this clamp is what holds
 * public discovery to its narrower window.
 */

describe('runWindowDays', () => {
  describe('discovery — the public window', () => {
    it('defaults to the documented public window', () => {
      expect(runWindowDays('discovery')).toBe(RUN_SERIES.upcomingWindowDays);
    });

    it('refuses to look further ahead than the public window', () => {
      expect(runWindowDays('discovery', 28)).toBe(RUN_SERIES.upcomingWindowDays);
      expect(runWindowDays('discovery', 84)).toBe(RUN_SERIES.upcomingWindowDays);
      expect(runWindowDays('discovery', 10_000)).toBe(RUN_SERIES.upcomingWindowDays);
    });

    it('allows a caller to ask for less', () => {
      expect(runWindowDays('discovery', 1)).toBe(1);
      expect(runWindowDays('discovery', 7)).toBe(7);
    });
  });

  describe('personal — the player’s own schedule', () => {
    it('defaults to a full series lifetime', () => {
      expect(runWindowDays('personal')).toBe(RUN_SERIES.personalScheduleWindowDays);
    });

    it('is capped at what a series can legally run for', () => {
      expect(runWindowDays('personal', 365)).toBe(RUN_SERIES.personalScheduleWindowDays);
    });

    it('never looks further ahead than a series may be valid', () => {
      // A series cannot outlive maxWeeksValid, so a longer window is always
      // empty space that the database still has to generate rows across.
      expect(RUN_SERIES.personalScheduleWindowDays).toBe(RUN_SERIES.maxWeeksValid * 7);
    });
  });

  describe('rejects values that would unbound the query', () => {
    it('floors at a single day rather than zero or negative', () => {
      expect(runWindowDays('discovery', 0)).toBe(1);
      expect(runWindowDays('discovery', -30)).toBe(1);
    });

    it('falls back to the ceiling for values that are not finite numbers', () => {
      expect(runWindowDays('discovery', Number.NaN)).toBe(RUN_SERIES.upcomingWindowDays);
      expect(runWindowDays('discovery', Number.POSITIVE_INFINITY)).toBe(
        RUN_SERIES.upcomingWindowDays,
      );
      expect(runWindowDays('personal', Number.NEGATIVE_INFINITY)).toBe(
        RUN_SERIES.personalScheduleWindowDays,
      );
    });

    it('truncates a fractional day rather than passing it to Postgres', () => {
      expect(runWindowDays('discovery', 7.9)).toBe(7);
    });
  });

  describe('the two windows stay distinct and ordered', () => {
    it('never lets public discovery see further than a personal schedule', () => {
      expect(RUN_SERIES.upcomingWindowDays).toBeLessThan(RUN_SERIES.personalScheduleWindowDays);
    });

    it('bounds every window inside a series lifetime', () => {
      for (const window of ['discovery', 'personal'] as const) {
        expect(runWindowDays(window)).toBeLessThanOrEqual(RUN_SERIES.maxWeeksValid * 7);
        expect(runWindowDays(window)).toBeGreaterThan(0);
      }
    });
  });
});
