import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { useSession } from '../../providers/auth-context';

export function SignedInOnly({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSession();
  // Wait for Keychain/browser storage before redirecting a restored session.
  // Children must stay unmounted so private queries do not run during startup.
  if (isLoading) return null;
  if (!session) return <Redirect href="/sign-in" />;
  return children;
}
