import { SignIn } from './features/auth/sign-in';
import { AdminConsole } from './features/console/admin-console';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from './lib/auth-context';
import { supabase } from './lib/supabase';
import { useIsAdmin } from './lib/use-is-admin';
import { Brand, Icon } from './components/brand';

/**
 * The protected shell.
 *
 * Three gates in order: is the session loaded, is there a session, is that user
 * an admin. Database permissions enforce access to every operation.
 */
export default function App() {
  const client = useQueryClient();
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    setSignOutError('');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) setSignOutError(error.message);
      else client.clear();
    } catch (error) {
      setSignOutError(
        error instanceof Error ? error.message : 'Unable to sign out. Please try again.',
      );
    } finally {
      setSigningOut(false);
    }
  }
  const { session, isLoading: isSessionLoading } = useSession();
  const {
    data: isAdmin,
    isPending: isAdminPending,
    error: adminError,
    refetch: checkAccess,
    isFetching: checkingAccess,
  } = useIsAdmin();

  if (isSessionLoading) {
    return (
      <main className="loading-shell" role="status">
        <Brand />
        <span className="spinner" />
        <p>Loading administration…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="shell">
        <SignIn />
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="bar">
        <span className="bar-title">
          <Icon name="shield" /> Drop In administration
        </span>
        <span className="account-email">{session.user.email}</span>
        <button
          type="button"
          className="secondary"
          onClick={() => void signOut()}
          disabled={signingOut}
        >
          <Icon name="logout" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </header>

      {signOutError && (
        <p className="error" role="alert">
          {signOutError}
        </p>
      )}
      {isAdminPending && (
        <div className="card access-card" role="status">
          <span className="spinner" />
          Checking workspace access…
        </div>
      )}

      {adminError && (
        <div className="card access-card error" role="alert">
          <h1>Let’s try that again.</h1>
          {adminError.message}
          <button
            className="secondary"
            onClick={() => void checkAccess()}
            disabled={checkingAccess}
          >
            Try again
          </button>
        </div>
      )}

      {isAdmin === false && (
        <div className="card access-card">
          <span className="auth-symbol">
            <Icon name="shield" />
          </span>
          <p className="eyebrow">DROP IN ADMIN</p>
          <h1>Admin access required</h1>
          <p>
            This account does not have admin access yet. Once the project owner grants access, check
            again to open your workspace.
          </p>
          <button onClick={() => void checkAccess()} disabled={checkingAccess}>
            {checkingAccess ? 'Checking…' : 'Check access again'}
          </button>
        </div>
      )}

      {isAdmin === true && <AdminConsole key={session.user.id} />}
    </main>
  );
}
