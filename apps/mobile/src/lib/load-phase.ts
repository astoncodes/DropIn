/**
 * Which of its three states a screen should draw for a query.
 *
 * `isPending` cannot answer this. React Query returns a query that has no data
 * to `pending`, with its error cleared, at the start of every fetch — including
 * background polls and the refetch on returning to the app. A screen that drew a
 * skeleton for `isPending` would drop its error and "Try again" each time that
 * happened, and a screen that drew its error for `isError` would replace
 * content it had already loaded when one refresh failed.
 *
 * So the phase is decided by what the screen has to show:
 *   ready    there is data, however the latest refresh went
 *   failed   there is no data and an attempt has failed; later attempts may be
 *            running, and success moves the screen to `ready` by itself
 *   loading  there is no data and nothing has failed yet
 */
export type LoadPhase = 'loading' | 'failed' | 'ready';

/** The parts of a React Query result that decide the phase. */
export type LoadSnapshot = {
  /** `undefined` until a fetch succeeds. `null` is data: a lookup that found nothing. */
  data: unknown;
  /** How many attempts have ended in an error. Not reset when a new attempt starts. */
  errorUpdateCount: number;
};

export function loadPhase(query: LoadSnapshot): LoadPhase {
  if (query.data !== undefined) return 'ready';
  return query.errorUpdateCount > 0 ? 'failed' : 'loading';
}

/**
 * The phase of a screen that cannot draw until several queries have data. A
 * failure outranks loading so the retry is offered as soon as one part fails,
 * rather than after the slowest part gives up.
 */
export function combineLoadPhases(...phases: LoadPhase[]): LoadPhase {
  if (phases.includes('failed')) return 'failed';
  return phases.includes('loading') ? 'loading' : 'ready';
}
