/**
 * Cross-app constants shared by the mobile and admin clients.
 *
 * BOUNDARY — read before adding anything here.
 *
 * Postgres is the source of truth for business rules (docs/architecture.md).
 * The values below are *mirrors* of database constraints, and they exist for
 * one reason: a form needs `maxLength` before the server can reject the input.
 * Enforcement lives in migrations and database functions. If a value here ever
 * disagrees with the database, the database is right and this file is a bug.
 *
 * Do NOT put in this package:
 *   - merge, dedup, or check-in validation logic (lives in database functions)
 *   - anything derived from data (sports, regions — those are queried)
 *   - React components (see packages/ui, which is deliberately not created yet)
 *
 * Section references are to docs/product-rules.md.
 */

/** Check-in duration bounds, in minutes. §Check-ins */
export const CHECK_IN_DURATION = {
  defaultMinutes: 90,
  minMinutes: 30,
  /** Total active window may not exceed this without a fresh location check. */
  maxMinutes: 240,
} as const;

/** §Check-ins — party_size includes the checked-in user. */
export const PARTY_SIZE = {
  min: 1,
  default: 1,
  max: 20,
} as const;

/** §Check-ins — optional, plain text. Never rendered as HTML. */
export const CHECK_IN_NOTE_MAX_LENGTH = 120;

/**
 * §Location gating. An anti-abuse friction control, not proof of presence.
 * Tunable: raise if legitimate check-ins fail, lower if abuse appears.
 */
export const LOCATION_GATE = {
  maxDistanceMetres: 250,
  maxAccuracyMetres: 100,
} as const;

/**
 * §Duplicate ranking — three distances, three different jobs. Distance alone
 * never decides a merge; see find_duplicate_candidates() and merge_venues().
 */
export const DUPLICATE_DISTANCE_METRES = {
  /** Shown to a user before they submit: "is it one of these?" */
  submissionPrevention: 150,
  /** Server-side candidate search when a submission arrives. */
  candidateSearch: 100,
  /** High-confidence review band, calibrated on the Charlottetown import. */
  highConfidenceReview: 40,
} as const;

/** §Recurring runs — a series must be renewed rather than living forever. */
export const RUN_SERIES = {
  maxWeeksValid: 12,
  /** Public discovery queries are bounded to this window. */
  upcomingWindowDays: 14,
  /**
   * A player's own schedule may look ahead as far as a series can legally run,
   * because those occurrences are ones they already host or joined. This is a
   * deliberately different window from public discovery, not a relaxation of
   * it — keep it equal to `maxWeeksValid` weeks.
   */
  personalScheduleWindowDays: 84,
} as const;

/** Publication state. Distinct from verification — see VerificationState. */
export type VenueStatus = 'active' | 'merged' | 'removed';

/** Trust signal. Distinct from publication state — see VenueStatus. */
export type VerificationState = 'unverified' | 'admin_verified' | 'community_verified';

export type IndoorState = 'indoor' | 'outdoor' | 'unknown';

export type VenueCandidateStatus =
  'pending' | 'possible_duplicate' | 'approved' | 'merged' | 'rejected';

/** IANA timezone for the launch region. Stored per-region, not hardcoded. */
export const DEFAULT_REGION_TIMEZONE = 'America/Halifax';
