import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { loadPhase } from '../../lib/load-phase';
import { useAccountProfile } from '../account/api';
import { resolvePostSignInPath } from './resolve-post-sign-in-path';

/**
 * Sends a signed-in player on from the sign-in screen, and reports when the
 * destination could not be decided.
 *
 * Deciding needs the player's profile. A session can exist while that lookup
 * fails — the connection drops just after Apple or Google hands back a token —
 * and the sign-in screen has nothing else to draw for a signed-in player, so
 * the failure is reported with a retry instead of leaving the screen empty.
 */
export function usePostSignInRouting(userId: string | undefined) {
  const router = useRouter();
  const profile = useAccountProfile(userId);
  const destination = profile.data
    ? resolvePostSignInPath(profile.data.onboarding_completed_at)
    : null;

  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  return {
    failed: loadPhase(profile) === 'failed',
    retrying: profile.isFetching,
    retry: () => void profile.refetch(),
  };
}
