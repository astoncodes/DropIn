import 'react-native-url-polyfill/auto';

import { env } from '../../lib/env';
import { UserFacingError } from '@dropin/shared';

export type GeocodingResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

type GeoapifyItem = {
  place_id?: string;
  formatted?: string;
  lat?: number;
  lon?: number;
};

const cache = new Map<string, GeocodingResult[]>();
let nextRequestAt = 0;

function abortError(): Error {
  const error = new Error('The search was cancelled.');
  error.name = 'AbortError';
  return error;
}

/** Explicit searches only; cache and space requests to conserve shared credits.
 * This limits one app instance, not aggregate project traffic.
 */
export async function searchPlaces(
  rawQuery: string,
  signal?: AbortSignal,
): Promise<GeocodingResult[]> {
  if (!env.geoapifyApiKey)
    throw new UserFacingError(
      'Place search is not configured. You can still place a pin on the map.',
    );
  const query = rawQuery.trim();
  if (query.length < 3) throw new UserFacingError('Enter at least 3 characters.');
  if (query.length > 160) throw new UserFacingError('Keep the search under 160 characters.');

  if (signal?.aborted) throw abortError();
  const cacheKey = query.toLocaleLowerCase('en-CA');
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (signal?.aborted) throw abortError();

  // Reserve a slot before waiting so concurrent searches cannot start together.
  const requestAt = Math.max(Date.now(), nextRequestAt);
  nextRequestAt = requestAt + 1_100;
  const waitMs = Math.max(0, requestAt - Date.now());
  if (waitMs > 0) {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timeout);
        reject(abortError());
      };
      const timeout = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, waitMs);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  if (signal?.aborted) throw abortError();

  const url = new URL('https://api.geoapify.com/v1/geocode/search');
  url.searchParams.set('text', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  url.searchParams.set('filter', 'countrycode:ca');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('apiKey', env.geoapifyApiKey);

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal, headers: { Accept: 'application/json' } });
  } catch {
    if (signal?.aborted) throw abortError();
    throw new UserFacingError('Place search is unavailable. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new UserFacingError(
      response.status === 429
        ? 'Place search has reached its usage limit. Try again later or place a pin manually.'
        : response.status === 401 || response.status === 403
          ? 'Place search could not authenticate. Check the Geoapify key and its restrictions.'
          : 'Place search is unavailable right now.',
    );
  }

  const payload: unknown = await response.json();
  const items = (payload as { results?: unknown } | null)?.results;
  if (!Array.isArray(items))
    throw new UserFacingError('Place search returned an unexpected response.');

  const results = items.flatMap<GeocodingResult>((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as GeoapifyItem;
    const latitude = candidate.lat;
    const longitude = candidate.lon;
    if (
      typeof candidate.formatted !== 'string' ||
      !candidate.formatted.trim() ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return [];
    }
    return [
      {
        id: String(candidate.place_id ?? `${latitude},${longitude}`),
        label: candidate.formatted,
        latitude,
        longitude,
      },
    ];
  });

  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, results);
  return results;
}
