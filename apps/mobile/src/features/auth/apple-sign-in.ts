import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { UserFacingError } from '@dropin/shared';
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
export async function signInWithApple(): Promise<{ error: Error | null }> {
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
    return {
      error: new UserFacingError('Apple did not return a usable sign-in token. Try again.'),
    };
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) return { error };

  await keepAppleAuthorization(credential.authorizationCode);
  return { error: null };
}

/**
 * Hands the one-time authorization code to the server so deleting the account
 * can revoke Apple's authorization later, as App Review requires. The code is
 * valid for five minutes, so this runs before anything else. The player is
 * already signed in: a failure here is logged for the developer and does not
 * undo the sign-in, and deletion then has nothing to revoke.
 */
async function keepAppleAuthorization(authorizationCode: string | null): Promise<void> {
  if (!authorizationCode) {
    console.warn('[auth] Apple returned no authorization code; nothing kept for revocation');
    return;
  }
  const { error } = await supabase.functions.invoke('apple-sign-in', {
    body: { authorizationCode },
  });
  if (error) {
    // The function's answer names the cause without any token or personal data.
    console.warn('[auth] Apple authorization was not kept for revocation', error.message);
  }
}
