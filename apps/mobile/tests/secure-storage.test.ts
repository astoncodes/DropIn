import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The bug: every keychain call went out unguarded. When the keychain is
 * unreachable — a locked device, or a simulator build with no entitlements —
 * the rejection propagated through Supabase's storage adapter and rejected
 * every request that needed an access token. The UI then reported a connection
 * problem for what was a storage failure, across every screen at once.
 *
 * The contract now: reads report "no stored session", writes leave nothing
 * half-written, and nothing throws at the caller.
 *
 * The adapter dedupes its log per operation until the next success, so each
 * test loads a fresh copy of the module rather than inheriting that state from
 * whichever test happened to run first.
 */

const KEY = 'sb-project-auth-token';
const KEYCHAIN_ERROR = new Error("KeyChainException: A required entitlement isn't present.");

type Keychain = typeof import('./stubs/expo-secure-store');
type Adapter = typeof import('../src/lib/secure-storage');

let keychain: Keychain;
let secureStorage: Adapter['secureStorage'];

beforeEach(async () => {
  vi.resetModules();
  keychain = await import('./stubs/expo-secure-store');
  keychain.reset();
  ({ secureStorage } = await import('../src/lib/secure-storage'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('round-trips a session while the keychain works', () => {
  it('stores and returns a small value', async () => {
    await secureStorage.setItem(KEY, 'a short token');
    expect(await secureStorage.getItem(KEY)).toBe('a short token');
  });

  it('chunks and reassembles a value past the 2048-byte device limit', async () => {
    const long = 'x'.repeat(5000);
    await secureStorage.setItem(KEY, long);
    expect(await secureStorage.getItem(KEY)).toBe(long);
    // Proof it really was split rather than stored whole.
    expect(Object.keys(keychain.contents()).length).toBeGreaterThan(2);
  });

  it('reports absent for a key never written', async () => {
    expect(await secureStorage.getItem(KEY)).toBeNull();
  });

  it('does not resurrect trailing chunks when a longer value is replaced', async () => {
    await secureStorage.setItem(KEY, 'y'.repeat(5000));
    await secureStorage.setItem(KEY, 'short');
    expect(await secureStorage.getItem(KEY)).toBe('short');
  });

  it('removes everything it wrote', async () => {
    await secureStorage.setItem(KEY, 'z'.repeat(5000));
    await secureStorage.removeItem(KEY);
    expect(await secureStorage.getItem(KEY)).toBeNull();
    expect(keychain.contents()).toEqual({});
  });
});

describe('degrades instead of throwing when the keychain is unreachable', () => {
  it('reports no stored session rather than rejecting the read', async () => {
    keychain.failWith(KEYCHAIN_ERROR);
    await expect(secureStorage.getItem(KEY)).resolves.toBeNull();
  });

  it('does not reject a write', async () => {
    keychain.failWith(KEYCHAIN_ERROR);
    await expect(secureStorage.setItem(KEY, 'token')).resolves.toBeUndefined();
  });

  it('does not reject a removal, so sign-out still completes', async () => {
    keychain.failWith(KEYCHAIN_ERROR);
    await expect(secureStorage.removeItem(KEY)).resolves.toBeUndefined();
  });

  it('logs the cause rather than failing silently', async () => {
    keychain.failWith(KEYCHAIN_ERROR);
    await secureStorage.getItem(KEY);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('keychain read failed'),
      KEYCHAIN_ERROR,
    );
  });

  it('logs once per operation, because the auth refresh timer retries on a loop', async () => {
    keychain.failWith(KEYCHAIN_ERROR);
    for (let attempt = 0; attempt < 10; attempt += 1) await secureStorage.getItem(KEY);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('logs again after the keychain recovers and fails a second time', async () => {
    keychain.failWith(KEYCHAIN_ERROR);
    await secureStorage.getItem(KEY);
    keychain.failWith(null);
    await secureStorage.getItem(KEY);
    keychain.failWith(KEYCHAIN_ERROR);
    await secureStorage.getItem(KEY);
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});

describe('never leaves a partial session behind', () => {
  it('reports absent when a chunk has gone missing', async () => {
    await secureStorage.setItem(KEY, 'w'.repeat(5000));
    const [firstChunk] = Object.keys(keychain.contents()).filter((name) => /\.\d+$/.test(name));
    // Simulate an interrupted save by dropping one chunk.
    await keychain.deleteItemAsync(firstChunk);
    expect(await secureStorage.getItem(KEY)).toBeNull();
  });

  it('clears orphaned chunks when only the manifest write fails', async () => {
    const realSet = keychain.setItemAsync;
    const spy = vi.spyOn(keychain, 'setItemAsync');
    // The manifest is written last, so this reproduces a save that got most of
    // the way through and then lost keychain access.
    spy.mockImplementation(async (name: string, value: string) => {
      if (name.endsWith('.manifest')) throw KEYCHAIN_ERROR;
      return realSet(name, value);
    });

    await secureStorage.setItem(KEY, 'v'.repeat(5000));
    spy.mockRestore();

    // A later read must not be able to assemble the leftover chunks.
    expect(await secureStorage.getItem(KEY)).toBeNull();
    expect(keychain.contents()).toEqual({});
  });
});
