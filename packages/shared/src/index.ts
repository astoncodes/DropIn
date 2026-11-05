/**
 * Cross-app constants shared by the mobile and admin clients, and the mapping
 * from a thrown error to text that is safe to show (`./errors`).
 *
 * BOUNDARY — read before adding anything here.
 *
 * Postgres is the source of truth for business rules (docs/architecture.md).
 * The values below are *mirrors* of database constraints, and they exist for
 * one reason: a form needs `maxLength` before the server can reject the input.
 * Enforcement lives in migrations and database functions. If a value here ever
 * disagrees with the database, the database is right and this file is a bug.
 *
 * `./errors` is here for the same reason: it mirrors the SQLSTATE convention
 * the database functions use for messages written for people, and both clients
 * must read that convention the same way.
 *
 * Do NOT put in this package:
 *   - merge, dedup, or check-in validation logic (lives in database functions)
 *   - anything derived from data (sports, regions — those are queried)
 *   - React components (keep UI inside the owning app)
 *
 * Constraint names and values are verified in the clients' product-rules tests.
 */

export * from './errors';

/** Check-in duration bounds, in minutes. */
export const CHECK_IN_DURATION = {
  defaultMinutes: 90,
  minMinutes: 30,
  /** Total active window may not exceed this without a fresh location check. */
  maxMinutes: 240,
} as const;

/** party_size includes the checked-in user. */
export const PARTY_SIZE = {
  min: 1,
  default: 1,
  max: 20,
} as const;

/** Check-in notes are optional plain text and never rendered as HTML. */
export const CHECK_IN_NOTE_MAX_LENGTH = 120;

/**
 * Location gating is an anti-abuse friction control, not proof of presence.
 * Tunable: raise if legitimate check-ins fail, lower if abuse appears.
 */
export const LOCATION_GATE = {
  maxDistanceMetres: 250,
  maxAccuracyMetres: 100,
} as const;

/**
 * Duplicate ranking uses three distances for three different jobs. Distance alone
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

/**
 * Venue phone and website limits, mirroring private.is_venue_phone and
 * private.is_venue_website. The database enforces them on venues and venue
 * submissions; these let a form explain a problem before it submits.
 */
export const VENUE_CONTACT = {
  phoneMinDigits: 7,
  phoneMaxLength: 20,
  websiteMaxLength: 200,
} as const;

/** Trims a contact field. Blank means "no contact", as the database treats it. */
export function normaliseVenueContact(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Digits with the usual separators, and enough digits to be dialable. */
export function isVenuePhone(value: string): boolean {
  return (
    value.length <= VENUE_CONTACT.phoneMaxLength &&
    /^[0-9+().\- ]+$/.test(value) &&
    value.replace(/\D/g, '').length >= VENUE_CONTACT.phoneMinDigits
  );
}

/** An https address with a dotted host and no spaces. */
export function isVenueWebsite(value: string): boolean {
  return (
    value.length <= VENUE_CONTACT.websiteMaxLength &&
    /^https:\/\/[^\s/]+\.[^\s/]+(\/\S*)?$/.test(value)
  );
}

/** Recurring runs expire so a series needs a deliberate renewal. */
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

/**
 * Mirrors content_reports constraints so the report sheet and the
 * admin queue can cap input before report_content() or admin_resolve_reports()
 * refuses it.
 */
export const MODERATION = {
  reportDetailsMaxLength: 500,
  resolutionNoteMaxLength: 500,
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
