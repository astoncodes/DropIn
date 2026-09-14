import type { useRouter } from 'expo-router';

import { supabase } from '../../lib/supabase';
import { resolvePostSignInPath } from './resolve-post-sign-in-path';

/** Reads the just-signed-in user's profile and routes them to the right screen. */
export async function routeAfterSignIn(router: ReturnType<typeof useRouter>): Promise<void> {
  const { data: profile, error } = await supabase.rpc('current_profile');
  if (error) throw error;
  router.replace(resolvePostSignInPath(profile?.onboarding_completed_at ?? null));
}
