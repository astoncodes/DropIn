import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { combineLoadPhases, loadPhase } from '../src/lib/load-phase';

/**
 * React Query returns a query that has no data to `pending` at the start of
 * every fetch, background polls included. A screen that draws its skeleton for
 * `isPending` therefore drops its error and "Try again" each time a poll fires.
 * These tests drive a real query through that sequence rather than a hand-built
 * result object, so they fail if the library's behaviour is misread.
 */

type Attempt = { resolve: (value: unknown) => void; reject: (error: Error) => void };

const clients: QueryClient[] = [];

function observeQuery() {
  const attempts: Attempt[] = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const observer = new QueryObserver(client, {
    queryKey: ['subject'],
    queryFn: () =>
      new Promise<unknown>((resolve, reject) => {
        attempts.push({ resolve, reject });
      }),
  });
  observer.subscribe(() => {});
  return { attempts, observer, result: () => observer.getCurrentResult() };
}

async function settle(result: () => { isFetching: boolean }) {
  await vi.waitFor(() => expect(result().isFetching).toBe(false));
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

describe('loadPhase', () => {
  it('is loading until the first attempt finishes', () => {
    const { result } = observeQuery();

    expect(loadPhase(result())).toBe('loading');
  });

  it('is failed once the first attempt fails', async () => {
    const { attempts, result } = observeQuery();

    attempts[0]!.reject(new Error('offline'));
    await settle(result);

    expect(loadPhase(result())).toBe('failed');
  });

  it('stays failed while a later attempt is in flight', async () => {
    const { attempts, observer, result } = observeQuery();
    attempts[0]!.reject(new Error('offline'));
    await settle(result);

    void observer.refetch();
    await vi.waitFor(() => expect(attempts).toHaveLength(2));

    // The library reports a first load again here, which is what hid the error.
    expect(result().isPending).toBe(true);
    expect(result().error).toBeNull();
    expect(loadPhase(result())).toBe('failed');
  });

  it('becomes ready when a later attempt succeeds', async () => {
    const { attempts, observer, result } = observeQuery();
    attempts[0]!.reject(new Error('offline'));
    await settle(result);

    void observer.refetch();
    await vi.waitFor(() => expect(attempts).toHaveLength(2));
    attempts[1]!.resolve({ name: 'Victoria Park' });
    await settle(result);

    expect(loadPhase(result())).toBe('ready');
  });

  it('stays ready when a refresh fails after data has loaded', async () => {
    const { attempts, observer, result } = observeQuery();
    attempts[0]!.resolve({ name: 'Victoria Park' });
    await settle(result);

    void observer.refetch();
    await vi.waitFor(() => expect(attempts).toHaveLength(2));
    attempts[1]!.reject(new Error('offline'));
    await settle(result);

    expect(result().isError).toBe(true);
    expect(loadPhase(result())).toBe('ready');
  });

  it('treats a lookup that found nothing as ready, not as still loading', async () => {
    const { attempts, result } = observeQuery();

    attempts[0]!.resolve(null);
    await settle(result);

    expect(loadPhase(result())).toBe('ready');
  });
});

describe('combineLoadPhases — a screen that needs several queries', () => {
  it('is ready only when every part is ready', () => {
    expect(combineLoadPhases('ready', 'ready')).toBe('ready');
  });

  it('is loading while any part is still loading and none has failed', () => {
    expect(combineLoadPhases('ready', 'loading')).toBe('loading');
    expect(combineLoadPhases('loading', 'loading')).toBe('loading');
  });

  it('is failed as soon as any part has failed, so the retry is offered at once', () => {
    expect(combineLoadPhases('ready', 'failed')).toBe('failed');
    expect(combineLoadPhases('loading', 'failed')).toBe('failed');
    expect(combineLoadPhases('failed', 'loading', 'ready')).toBe('failed');
  });
});
