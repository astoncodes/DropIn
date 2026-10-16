import { userMessage } from '@dropin/shared';

import { SignIn } from './features/auth/sign-in';
import { AdminConsole } from './features/console/admin-console';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from './lib/auth-context';
import { supabase } from './lib/supabase';
import { useIsAdmin } from './lib/use-is-admin';
import { Brand } from './components/brand';
import { MfaGate } from './features/auth/mfa-gate';

/**
 * The protected shell.
 *
 * Three gates in order: is the session loaded, is there a session, is that user
 * an admin. Database permissions enforce access to every operation.
 */
export default function App() {
  const { session } = useSession();
  return session ? (
    <MfaGate key={session.user.id}>
      <AdminWorkspace />
    </MfaGate>
  ) : (
    <AdminWorkspace />
  );
}

function AdminWorkspace() {
  const client = useQueryClient();
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    setSignOutError('');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      client.clear();
    } catch (error) {
      console.error('[admin] Could not sign out', error);
      setSignOutError(userMessage(error, 'Could not sign out. Try again.'));
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
        <a className="bar-home" href="#dashboard">
          <Brand />
          <span className="label">Admin</span>
        </a>
        <span className="account-email">{session.user.email}</span>
        <button
          type="button"
          className="secondary"
          onClick={() => void signOut()}
          disabled={signingOut}
        >
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
          <p>Checking workspace access…</p>
        </div>
      )}

      {adminError && (
        <div className="card access-card" role="alert">
          <h1>Could not check your access</h1>
          <p>{userMessage(adminError, 'Try again in a moment.')}</p>
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
