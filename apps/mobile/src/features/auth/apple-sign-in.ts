import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { supabase } from '../../lib/supabase';

/**
 * Signs in with Sign in with Apple and exchanges the identity token for a
 * Supabase session. Resolves with `null` if the user cancelled, so callers
 * can tell "cancelled" apart from "failed" without a thrown error.
 *
 * Apple requires the token request to carry a hashed nonce and the identity
 * token exchange to carry the raw nonce it was hashed from, so a replayed
 * identity token can't be used to establish a session on its own.
 */
export async function signInWithApple(): Promise<{ error: string | null }> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ERR_REQUEST_CANCELED') {
      return { error: null };
    }
    throw err;
  }

  if (!credential.identityToken) {
    return { error: 'Apple did not return a usable sign-in token. Try again.' };
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  return { error: error?.message ?? null };
}
