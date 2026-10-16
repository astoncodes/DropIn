import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import type { AuthState } from './auth-context';
import { AuthContext } from './auth-context';
import { supabase } from './supabase';

/**
 * Holds the one piece of authentication state the app needs.
 *
 * Deliberately the only place session state lives (docs/architecture.md
 * §Client state). Components read it through `useSession` rather than calling
 * supabase.auth themselves, so there is a single answer to "am I signed in".
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isActive) return;
        setSession(data.session);
      })
      .catch(() => {
        if (isActive) setSession(null);
      })
      .finally(() => {
        if (!isActive) return;
        setIsLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Authorization and MFA results must not survive a session change.
      if (_event !== 'INITIAL_SESSION') queryClient.clear();
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      isActive = false;
      subscription.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthState>(() => ({ session, isLoading }), [session, isLoading]);

  return <AuthContext value={value}>{children}</AuthContext>;
}
