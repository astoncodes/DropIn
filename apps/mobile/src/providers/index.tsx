import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import type { Session } from '@supabase/supabase-js';

import { AUTH_STORAGE_KEY, supabase } from '../lib/supabase';
import { secureStorage } from '../lib/secure-storage';
import type { AuthState } from './auth-context';
import { AuthContext } from './auth-context';

/**
 * Every provider the app needs, composed once.
 *
 * Session state lives here and nowhere else (docs/reference.md §14 Client state
 * and error behavior). There is deliberately no global state store — add one
 * only if state ever genuinely spans unrelated features.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Refetch stale data when a browser tab returns to the foreground.
      refetchOnWindowFocus: true,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queryClient.invalidateQueries();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let isActive = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (isActive) setSession(data.session);
      })
      .catch(() => {
        if (isActive) setSession(null);
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'SIGNED_OUT') queryClient.clear();
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void queryClient.invalidateQueries({ queryKey: ['account-profile'] });
        void queryClient.invalidateQueries({ queryKey: ['account-sports'] });
      }
    });

    return () => {
      isActive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const clearDeletedAccount = useCallback(async () => {
    // Auth has already deleted the account and refresh tokens. Clearing local
    // state must not depend on another network request succeeding afterward.
    await Promise.all([
      secureStorage.removeItem(AUTH_STORAGE_KEY),
      secureStorage.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`),
    ]);
    queryClient.clear();
    setSession(null);
  }, []);
  const auth = useMemo<AuthState>(
    () => ({ session, isLoading, clearDeletedAccount }),
    [session, isLoading, clearDeletedAccount],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext value={auth}>{children}</AuthContext>
    </QueryClientProvider>
  );
}
