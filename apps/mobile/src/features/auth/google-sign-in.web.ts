import { supabase } from '../../lib/supabase';
import { authRedirectUrl } from './redirect';

/**
 * Web build of Google sign-in.
 *
 * The native SDK in `google-sign-in.ts` has no browser implementation — it
 * bridges to Google Play Services and to Google's iOS framework — so the web
 * bundle takes Supabase's hosted OAuth redirect instead. The browser leaves the
 * app, returns to `/callback?code=…`, and `AuthCallback` completes the PKCE
 * exchange exactly as it does for a magic link.
 *
 * Resolving with a null error here means "the redirect is under way", not "you
 * are signed in". The session arrives on the callback screen.
 */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectUrl() },
  });
  return { error: error?.message ?? null };
}
