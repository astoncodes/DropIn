/**
 * Turns a thrown sign-in failure into something a player can act on.
 *
 * Apple, Google and Supabase all throw different shapes, and most of them mean
 * "this build is misconfigured" rather than "your network is down". Reporting
 * every failure as a connection problem sends people to their wifi settings for
 * a missing entitlement, so each recognised cause gets its own message and
 * anything unrecognised stays honest about not knowing.
 *
 * The raw cause is never shown to a player — see `logSignInFailure` for the
 * developer-facing half.
 */

export const SIGN_IN_FALLBACK_MESSAGE =
  'Something went wrong signing you in. Please try again in a moment.';

const NETWORK_MESSAGE = 'Could not connect. Check your connection and try again.';

const UNSUPPORTED_BUILD_MESSAGE =
  'This sign-in method is not available in this build of the app. Use your email address instead.';

const MISCONFIGURED_MESSAGE =
  'Sign-in is not set up correctly for this build. Please use your email address, or contact support.';

/** Error codes both providers use for "the person backed out". */
const CANCELLED_CODES = new Set([
  'ERR_REQUEST_CANCELED',
  'ERR_REQUEST_CANCELLED',
  'SIGN_IN_CANCELLED',
  '-5',
  '12501',
]);

/**
 * Codes meaning the app binary lacks the native configuration the provider
 * needs — a missing Apple entitlement, an unregistered Google URL scheme, a
 * bundle ID that does not match the one registered with the provider.
 */
const MISCONFIGURED_CODES = new Set([
  'ERR_APPLE_AUTHENTICATION_REQUEST_FAILED',
  'ERR_REQUEST_NOT_HANDLED',
  'ERR_REQUEST_UNKNOWN',
  'DEVELOPER_ERROR',
  '10',
]);

/** Codes meaning the provider cannot run on this device or platform at all. */
const UNSUPPORTED_CODES = new Set([
  'ERR_APPLE_AUTHENTICATION_UNAVAILABLE',
  'PLAY_SERVICES_NOT_AVAILABLE',
  '-8',
  '2',
]);

function errorCode(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return null;
  const { code } = cause as { code: unknown };
  return typeof code === 'string' || typeof code === 'number' ? String(code) : null;
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  if (typeof cause === 'object' && cause !== null && 'message' in cause) {
    const { message } = cause as { message: unknown };
    if (typeof message === 'string') return message;
  }
  return '';
}

/**
 * True when the throw came from a native module that is not in the binary.
 *
 * This is the signature of an `ios/` or `android/` directory generated before
 * the provider was added to app.config.ts — the JavaScript is present and
 * imports fine, and the bridge underneath it is empty.
 */
function isMissingNativeModule(message: string): boolean {
  return (
    /cannot find native module/i.test(message) ||
    /native module.*(not found|doesn't exist|is null)/i.test(message) ||
    /turbomodule/i.test(message) ||
    /requirenativemodule/i.test(message)
  );
}

function isNetworkFailure(message: string): boolean {
  return (
    /network request failed/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /network ?error/i.test(message) ||
    /econnrefused|enotfound|etimedout/i.test(message)
  );
}

/** True when the player dismissed the provider's sheet rather than failing. */
export function isCancellation(cause: unknown): boolean {
  const code = errorCode(cause);
  if (code && CANCELLED_CODES.has(code)) return true;
  return /\b(cancell?ed|dismissed|user ?canceled)\b/i.test(errorMessage(cause));
}

/**
 * The message to show the player. Never returns an empty string, and never
 * returns a provider's raw text, which tends to name internal APIs.
 */
export function describeSignInFailure(cause: unknown): string {
  const code = errorCode(cause);
  const message = errorMessage(cause);

  if (code && UNSUPPORTED_CODES.has(code)) return UNSUPPORTED_BUILD_MESSAGE;
  if (code && MISCONFIGURED_CODES.has(code)) return MISCONFIGURED_MESSAGE;
  if (isMissingNativeModule(message)) return UNSUPPORTED_BUILD_MESSAGE;
  if (isNetworkFailure(message)) return NETWORK_MESSAGE;

  return SIGN_IN_FALLBACK_MESSAGE;
}

/**
 * Keeps the real failure where a developer can find it.
 *
 * `describeSignInFailure` deliberately discards provider internals on the way to
 * the screen; without this, a misconfigured build is indistinguishable from a
 * flaky network in a bug report.
 */
export function logSignInFailure(provider: 'apple' | 'google' | 'email', cause: unknown): void {
  console.error(`[auth] ${provider} sign-in failed`, cause);
}
