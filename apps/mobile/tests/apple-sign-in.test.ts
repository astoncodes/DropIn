import { beforeEach, describe, expect, it, vi } from 'vitest';

const credential = { identityToken: 'identity-token', authorizationCode: 'code-123' };
const signInAsync = vi.fn();
const signInWithIdToken = vi.fn();
const invoke = vi.fn();

vi.mock('expo-apple-authentication', () => ({
  signInAsync: (...args: unknown[]) => signInAsync(...args),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'raw-nonce',
  digestStringAsync: async () => 'hashed-nonce',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: { signInWithIdToken: (...args: unknown[]) => signInWithIdToken(...args) },
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

const { signInWithApple } = await import('../src/features/auth/apple-sign-in');

describe('signInWithApple', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    signInAsync.mockResolvedValue(credential);
    signInWithIdToken.mockResolvedValue({ error: null });
    invoke.mockResolvedValue({ data: { stored: true }, error: null });
  });

  it('establishes the session, then hands the authorization code to the server', async () => {
    expect(await signInWithApple()).toEqual({ error: null });
    expect(signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'identity-token',
      nonce: 'raw-nonce',
    });
    expect(invoke).toHaveBeenCalledWith('apple-sign-in', {
      body: { authorizationCode: 'code-123' },
    });
    expect(signInWithIdToken.mock.invocationCallOrder[0]).toBeLessThan(
      invoke.mock.invocationCallOrder[0],
    );
  });

  it('keeps the player signed in when the code cannot be kept', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Apple could not be reached.') });
    expect(await signInWithApple()).toEqual({ error: null });
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when Apple returned no code', async () => {
    signInAsync.mockResolvedValue({ ...credential, authorizationCode: null });
    expect(await signInWithApple()).toEqual({ error: null });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not send the code when the session was refused', async () => {
    const refused = new Error('Invalid token');
    signInWithIdToken.mockResolvedValue({ error: refused });
    expect(await signInWithApple()).toEqual({ error: refused });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reports a cancelled sheet as no error and sends nothing', async () => {
    signInAsync.mockRejectedValue(
      Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' }),
    );
    expect(await signInWithApple()).toEqual({ error: null });
    expect(signInWithIdToken).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});
