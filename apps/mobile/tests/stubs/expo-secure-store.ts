/**
 * Stands in for expo-secure-store.
 *
 * An in-memory keychain plus a switch for making it throw, so the adapter's
 * degraded paths can be exercised without a device. `failWith` reproduces the
 * real failure: iOS raises a KeyChainException when the build carries no
 * keychain entitlement.
 */

const store = new Map<string, string>();

let failure: Error | null = null;

export function failWith(error: Error | null): void {
  failure = error;
}

export function reset(): void {
  store.clear();
  failure = null;
}

/** Everything currently held, for asserting that nothing was left behind. */
export function contents(): Record<string, string> {
  return Object.fromEntries(store);
}

function check(): void {
  if (failure) throw failure;
}

export async function getItemAsync(key: string): Promise<string | null> {
  check();
  return store.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  check();
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  check();
  store.delete(key);
}
