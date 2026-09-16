import { RUN_SERIES } from '@dropin/shared';

/**
 * Bounds how far ahead an occurrence query may look.
 *
 * `upcoming_runs()` accepts any `p_days` and materialises a row per occurrence
 * per series, so an unbounded value is both a product-rule break (§Recurring
 * runs commits to a bounded public window) and an unbounded query. The database
 * does not cap this yet, so the clamp lives here, at the one place every caller
 * passes through.
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
