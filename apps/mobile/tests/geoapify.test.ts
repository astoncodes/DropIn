import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Covers the search adapter with stubbed responses and a fake clock: input and
 * response validation, provider failures, caching, request spacing and cancellation.
 * This suite never contacts Geoapify or requires a provider key.
 *
 * Spacing matters because the Geoapify credits are shared across the whole
 * project. It throttles one app instance, not aggregate traffic — but a search
 * box that fires per keystroke would burn the budget on its own.
 */

// The signal is deliberately `unknown`: React Native and Node each declare
// their own AbortSignal, and these tests only ever check identity, never shape.
type FetchCall = { url: URL; signal?: unknown };

async function loadAdapter(apiKey: string, respond?: (call: FetchCall) => Response) {
  // Reset first, then seed: the adapter keeps its cache and next-slot time in
  // module scope, and resetting hands it a *fresh* expo-constants stub. Seeding
  // the old instance would leave env.ts with nothing to read.
  vi.resetModules();
  const { setExtra } = await import('./stubs/expo-constants');
  setExtra({
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'publishable-test-key',
    geoapifyApiKey: apiKey,
  });

  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const call = { url: new URL(input), signal: init?.signal };
    calls.push(call);
    return (
      respond?.(call) ??
      new Response(
        JSON.stringify({
          results: [{ formatted: 'Charlottetown, PE', lat: 46.24, lon: -63.13, place_id: 'pei' }],
        }),
      )
    );
  });

  const module = await import('../src/features/geocoding/geoapify');
  return { ...module, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('searchPlaces input bounds', () => {
  it('refuses a query too short to mean anything', async () => {
    const { searchPlaces, calls } = await loadAdapter('test-key');
    await expect(searchPlaces('ab')).rejects.toThrow(/at least 3 characters/);
    await expect(searchPlaces('   x   ')).rejects.toThrow(/at least 3 characters/);
    expect(calls).toHaveLength(0);
  });

  it('refuses an overlong query instead of forwarding it', async () => {
    const { searchPlaces, calls } = await loadAdapter('test-key');
    await expect(searchPlaces('x'.repeat(161))).rejects.toThrow(/under 160 characters/);
    expect(calls).toHaveLength(0);
  });

  it('accepts the boundary lengths', async () => {
    const { searchPlaces, calls } = await loadAdapter('test-key');
    await searchPlaces('abc');

    // The second search is uncached, so it waits for its slot before firing.
    const longest = searchPlaces('y'.repeat(160));
    await vi.advanceTimersByTimeAsync(1_100);
    await expect(longest).resolves.toBeDefined();
    expect(calls).toHaveLength(2);
  });

  it('explains that a pin is still possible when the key is absent', async () => {
    const { searchPlaces, calls } = await loadAdapter('');
    await expect(searchPlaces('Charlottetown')).rejects.toThrow(/still place a pin/);
    expect(calls).toHaveLength(0);
  });
});

describe('request shape', () => {
  it('searches the United States, Canada and Nigeria launch markets', async () => {
    const { searchPlaces, calls } = await loadAdapter('test-key');
    await searchPlaces('  Eastlink Centre  ');

    const { searchParams, hostname } = calls[0].url;
    expect(hostname).toBe('api.geoapify.com');
    expect(searchParams.get('text')).toBe('Eastlink Centre');
    expect(searchParams.get('filter')).toBe('countrycode:us,ca,ng');
    expect(searchParams.get('format')).toBe('json');
    expect(searchParams.get('limit')).toBe('5');
    expect(searchParams.get('lang')).toBe('en');
    expect(searchParams.get('apiKey')).toBe('test-key');
  });
});

describe('request spacing', () => {
  it('holds the second search back rather than firing both at once', async () => {
    const { searchPlaces, calls } = await loadAdapter('test-key');

    await searchPlaces('Charlottetown');
    expect(calls).toHaveLength(1);

    const second = searchPlaces('Summerside');
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1); // still waiting for its slot

    await vi.advanceTimersByTimeAsync(1_100);
    await second;
    expect(calls).toHaveLength(2);
  });

  it('reserves slots up front, so concurrent searches cannot collide', async () => {
    const { searchPlaces, calls } = await loadAdapter('test-key');

    const all = Promise.all([searchPlaces('one place'), searchPlaces('two place')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_100);
    await all;
    expect(calls).toHaveLength(2);
  });

  it('serves a repeat search from cache without spending a slot', async () => {
    const { searchPlaces, calls } = await loadAdapter('test-key');

    const first = await searchPlaces('Charlottetown');
    const repeat = await searchPlaces('CHARLOTTETOWN');

    expect(calls).toHaveLength(1);
    expect(repeat).toEqual(first);
  });
});

describe('cancellation', () => {
  it('rejects an already-aborted signal even when the result is cached', async () => {
    const { searchPlaces, calls } = await loadAdapter('test-key');
    await searchPlaces('Charlottetown');
    const controller = new AbortController();
    controller.abort();
    await expect(searchPlaces('Charlottetown', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(calls).toHaveLength(1);
  });
  it('rejects as AbortError when cancelled while waiting for its slot', async () => {
    const { searchPlaces, calls } = await loadAdapter('test-key');
    await searchPlaces('Charlottetown');

    const controller = new AbortController();
    const pending = searchPlaces('Summerside', controller.signal);
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(1);
  });

  it('passes the signal through to the request it does make', async () => {
    const { searchPlaces, calls } = await loadAdapter('test-key');
    const controller = new AbortController();
    await searchPlaces('Charlottetown', controller.signal);
    expect(calls[0].signal).toBe(controller.signal);
  });
});

describe('provider responses', () => {
  it('discards malformed places and retains valid coordinates', async () => {
    const { searchPlaces } = await loadAdapter(
      'test-key',
      () =>
        new Response(
          JSON.stringify({
            results: [
              { formatted: 'Charlottetown, PEI', lat: 46.24, lon: -63.13, place_id: 'pei' },
              { formatted: 'bad', lat: null, lon: 0 },
              { formatted: 'bad', lat: 91, lon: 0 },
              null,
            ],
          }),
        ),
    );
    const results = await searchPlaces('Charlottetown');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ latitude: 46.24, longitude: -63.13 });
  });

  it.each([
    [401, /authenticate/],
    [403, /authenticate/],
    [429, /usage limit/],
    [500, /unavailable/],
  ])('explains provider HTTP %s failures', async (status, message) => {
    const { searchPlaces } = await loadAdapter('test-key', () => new Response('{}', { status }));
    await expect(searchPlaces('Toronto')).rejects.toThrow(message);
  });

  it('rejects an unexpected response shape', async () => {
    const { searchPlaces } = await loadAdapter('test-key', () => new Response('{}'));
    await expect(searchPlaces('Toronto')).rejects.toThrow(/unexpected response/);
  });
});
