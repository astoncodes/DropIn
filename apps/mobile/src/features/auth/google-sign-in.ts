import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { env } from '../../lib/env';
import { supabase } from '../../lib/supabase';

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: env.googleWebClientId,
    iosClientId: env.googleIosClientId,
  });
  configured = true;
}

/**
 * Signs in with the native Google SDK and exchanges the ID token for a
 * Supabase session. Resolves with `null` if the user cancelled, so callers
 * can tell "cancelled" apart from "failed" without a thrown error.
 */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  if (response.type !== 'success') return { error: null };

  const idToken = response.data.idToken;
  if (!idToken) {
    return { error: 'Google did not return a usable sign-in token. Try again.' };
  }

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  return { error: error?.message ?? null };
}
