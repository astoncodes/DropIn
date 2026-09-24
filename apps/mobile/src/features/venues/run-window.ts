import { RUN_SERIES } from '@dropin/shared';

/**
 * Bounds how far ahead an occurrence query may look.
 *
 * `upcoming_runs()` materialises a row per occurrence per series and caps
 * `p_days` at 12 weeks, the longest a series may run, which is the personal
 * schedule's window. Public discovery commits to a narrower window (§Recurring
 * runs), and the database cannot tell the two callers apart, so the per-window
 * ceilings live here, at the one place every caller passes through.
 */

export type RunWindow = 'discovery' | 'personal';

const CEILING: Record<RunWindow, number> = {
  /** §Recurring runs — "public queries return a bounded window". */
  discovery: RUN_SERIES.upcomingWindowDays,
  /** Occurrences the player already hosts or joined; see RUN_SERIES. */
  personal: RUN_SERIES.personalScheduleWindowDays,
};

export function runWindowDays(window: RunWindow, requested?: number): number {
  const ceiling = CEILING[window];
  if (requested === undefined) return ceiling;
  if (!Number.isFinite(requested)) return ceiling;
  return Math.min(Math.max(Math.trunc(requested), 1), ceiling);
}
