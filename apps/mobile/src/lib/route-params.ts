const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A record id taken from the route, or `undefined` when it cannot be one.
 *
 * Route parameters come from links anyone can write. Every record a screen is
 * opened for has a UUID key, so a value in any other shape names nothing: the
 * screen shows "not found" without asking the API, where the same value would
 * come back as a type error indistinguishable from an outage.
 */
export function uuidParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && UUID.test(value) ? value : undefined;
}
