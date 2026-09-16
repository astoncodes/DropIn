import * as SecureStore from 'expo-secure-store';

/**
 * A Supabase auth storage adapter backed by the device keychain/keystore.
 *
 * Why this is not a three-line wrapper: SecureStore is documented as unreliable
 * for values larger than 2048 bytes on Android, and a Supabase session — access
 * token, refresh token, user object — routinely exceeds that. Storing it
 * directly works in development and then fails on a real Android device, which
 * is the worst possible place to discover it.
 *
 * So values are split across numbered chunk keys, with a small manifest at the
 * original key recording how many there are. AsyncStorage would avoid the
 * problem entirely, but it writes tokens to disk in plain text.
 */

/** Comfortably below the 2048-byte limit, leaving room for key overhead. */
const CHUNK_SIZE = 1536;

const manifestKey = (key: string) => `${key}.manifest`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

/**
 * Keychain access can fail for reasons the app cannot fix: the device is
 * locked, or the build carries no keychain entitlement. Supabase reads this
 * adapter on the way to attaching an access token, so a rejection here does not
 * merely lose the session — it rejects every request that needed one, and the
 * UI reports a network problem it does not have.
 *
 * Every operation therefore degrades instead of throwing. A failed read reports
 * "no stored session", which is true and recoverable by signing in again; a
 * failed write is reported but cannot be retried usefully from here.
 */
type Operation = 'read' | 'write' | 'delete';

/** One log line per operation kind. The auth refresh timer retries on a loop. */
const reported = new Set<Operation>();

function reportFailure(operation: Operation, key: string, cause: unknown): void {
  if (reported.has(operation)) return;
  reported.add(operation);
  console.error(
    `[secure-storage] keychain ${operation} failed for "${key}". ` +
      'The session cannot be read or persisted, so you will be signed out. ' +
      'On a simulator build this usually means the app was built without ' +
      'entitlements (see README, "No code signing certificates").',
    cause,
  );
}

async function guard<T>(
  operation: Operation,
  key: string,
  fallback: T,
  action: () => Promise<T>,
): Promise<T> {
  try {
    const result = await action();
    reported.delete(operation);
    return result;
  } catch (cause) {
    reportFailure(operation, key, cause);
    return fallback;
  }
}

async function readChunkCount(key: string): Promise<number> {
  const manifest = await guard('read', key, null, () => SecureStore.getItemAsync(manifestKey(key)));
  if (!manifest) return 0;

  const count = Number.parseInt(manifest, 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function clearChunks(key: string, count: number): Promise<void> {
  const keys = [manifestKey(key), ...Array.from({ length: count }, (_, i) => chunkKey(key, i))];
  await guard('delete', key, undefined, async () => {
    await Promise.all(keys.map((name) => SecureStore.deleteItemAsync(name)));
  });
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await readChunkCount(key);
    if (count === 0) return null;

    const chunks = await guard('read', key, [], () =>
      Promise.all(
        Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))),
      ),
    );
    // A failed read yields no chunks, which the missing-chunk branch below
    // already treats as absent.
    if (chunks.length !== count) return null;

    // A missing chunk means a partial write — an interrupted save, or a value
    // written by an older build. Treat it as absent rather than returning
    // corrupt JSON that would fail to parse somewhere less obvious.
    if (chunks.some((chunk) => chunk === null)) {
      await clearChunks(key, count);
      return null;
    }

    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    // Remove any longer previous value first, or its trailing chunks would be
    // orphaned and could be resurrected by a later, shorter read.
    await clearChunks(key, await readChunkCount(key));

    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + CHUNK_SIZE));
    }

    const written = await guard('write', key, false, async () => {
      await Promise.all(
        chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)),
      );
      // Written last, so an interrupted save leaves no manifest and therefore
      // reads as absent rather than as a truncated session.
      await SecureStore.setItemAsync(manifestKey(key), String(chunks.length));
      return true;
    });

    // Leave nothing half-written behind. Without the manifest a later read
    // already reports absent, but orphaned chunks would linger in the keychain.
    if (!written) await clearChunks(key, chunks.length);
  },

  async removeItem(key: string): Promise<void> {
    await clearChunks(key, await readChunkCount(key));
  },
};
