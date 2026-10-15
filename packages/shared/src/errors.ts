/**
 * Turns whatever a query, mutation or native call throws into text a player
 * can act on. The admin site uses it the same way for moderators.
 *
 * Database functions raise business-rule failures as readable sentences with
 * SQLSTATE 22023 (invalid parameter) or 42501 (not allowed) — "Move within 250
 * metres of the venue to check in." Those were written for players and pass
 * through. Everything else — RLS violations (which share 42501), constraint
 * names, PostgREST protocol errors, Auth internals, library stack text — names
 * implementation details and is replaced by the caller's fallback.
 *
 * App code that throws its own validation message uses `UserFacingError` so the
 * message is shown verbatim; a plain `Error` is treated as untrusted.
 */

/** A message written for players, safe to show exactly as thrown. */
export class UserFacingError extends Error {
  override name = 'UserFacingError';
}

export const CONNECTION_MESSAGE = 'Could not connect. Check your connection and try again.';
const RATE_LIMIT_MESSAGE = 'Too many attempts. Wait a minute, then try again.';
const EXPIRED_LINK_MESSAGE =
  'This sign-in link has expired or was already used. Request a new one.';
const SESSION_EXPIRED_MESSAGE = 'Your session expired. Sign in again to continue.';

/** SQLSTATEs the database functions use for messages addressed to players. */
const BUSINESS_RULE_CODES = new Set(['22023', '42501', 'P0001', 'P0002']);

/** Text that only ever comes from the database engine or a library, never a person. */
const INTERNAL_TEXT =
  /row[- ]level security|permission denied|violates|constraint|relation\s|column\s|does not exist|syntax error|jwt|duplicate key|null value|invalid input|schema|pgrst|sqlstate|function\s|operator\s|undefined|stack/i;

const AUTH_MESSAGES: Record<string, string> = {
  over_email_send_rate_limit: RATE_LIMIT_MESSAGE,
  over_request_rate_limit: RATE_LIMIT_MESSAGE,
  over_sms_send_rate_limit: RATE_LIMIT_MESSAGE,
  email_address_invalid: 'Enter a valid email address.',
  validation_failed: 'Enter a valid email address.',
  otp_expired: EXPIRED_LINK_MESSAGE,
  flow_state_expired: EXPIRED_LINK_MESSAGE,
  flow_state_not_found: EXPIRED_LINK_MESSAGE,
  bad_code_verifier: EXPIRED_LINK_MESSAGE,
  session_expired: SESSION_EXPIRED_MESSAGE,
  session_not_found: SESSION_EXPIRED_MESSAGE,
  refresh_token_not_found: SESSION_EXPIRED_MESSAGE,
  refresh_token_already_used: SESSION_EXPIRED_MESSAGE,
  bad_jwt: SESSION_EXPIRED_MESSAGE,
  user_banned: 'This account cannot sign in. Contact support if you think this is a mistake.',
  signup_disabled: 'New accounts cannot be created right now.',
  email_provider_disabled: 'Email sign-in is not available right now.',
  provider_disabled: 'This sign-in method is not available right now.',
};

function field(error: unknown, key: string): unknown {
  return typeof error === 'object' && error !== null && key in error
    ? (error as Record<string, unknown>)[key]
    : undefined;
}

function text(error: unknown): string {
  if (typeof error === 'string') return error;
  const message = field(error, 'message');
  return typeof message === 'string' ? message : '';
}

/** True when the request never reached the server, whatever library made it. */
export function isNetworkError(error: unknown): boolean {
  const name = field(error, 'name');
  if (name === 'AuthRetryableFetchError' || name === 'FunctionsFetchError') return true;
  return /network request failed|failed to fetch|load failed|networkerror|network error|econnrefused|enotfound|etimedout/i.test(
    text(error),
  );
}

/** Ends a sentence the way the rest of the interface does. */
function sentence(message: string): string {
  const trimmed = message.trim();
  const capitalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

function authMessage(error: unknown): string | null {
  const isAuthError =
    field(error, '__isAuthError') === true || /^Auth/.test(String(field(error, 'name') ?? ''));
  if (!isAuthError) return null;
  if (field(error, 'status') === 429) return RATE_LIMIT_MESSAGE;
  const code = field(error, 'code');
  return typeof code === 'string' ? (AUTH_MESSAGES[code] ?? null) : null;
}

function storageMessage(error: unknown): string | null {
  const status = String(field(error, 'statusCode') ?? '');
  if (status === '413') return 'That file is too large. Choose one under 25 MB.';
  if (status === '415') return 'That file type is not supported. Choose a photo or MP4/MOV clip.';
  return null;
}

/**
 * The message to show for `error`. Never empty, and never raw engine or library
 * text: anything unrecognised becomes `fallback`, which should say what failed
 * and what to do next ("Could not send your message. Try again.").
 */
export function userMessage(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message;
  if (isNetworkError(error)) return CONNECTION_MESSAGE;

  const auth = authMessage(error);
  if (auth) return auth;

  const storage = storageMessage(error);
  if (storage) return storage;

  const code = field(error, 'code');
  const message = text(error);
  if (code === 'PT429') return 'Too many requests. Please try again later.';
  if (
    typeof code === 'string' &&
    BUSINESS_RULE_CODES.has(code) &&
    message.trim().length > 0 &&
    message.length <= 200 &&
    !INTERNAL_TEXT.test(message)
  ) {
    return sentence(message);
  }

  return fallback;
}
