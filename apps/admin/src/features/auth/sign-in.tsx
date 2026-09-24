import { useState } from 'react';
import type { FormEvent } from 'react';

import { supabase } from '../../lib/supabase';
import { Brand, Icon } from '../../components/brand';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string };

/** Passwordless email sign-in through the hosted project. */
export function SignIn() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus({ kind: 'sending' });

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: window.location.origin },
      });
      setStatus(
        error ? { kind: 'error', message: error.message } : { kind: 'sent', email: trimmed },
      );
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unable to connect. Please try again.',
      });
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-entry" aria-label="Admin sign in">
        <Brand />
        {status.kind === 'sent' ? (
          <div className="auth-form" role="status">
            <span className="auth-symbol">
              <Icon name="mail" />
            </span>
            <p className="eyebrow">ONE MORE STEP</p>
            <h1>Check your email</h1>
            <p className="auth-description">
              A sign-in link is on its way to <strong>{status.email}</strong>.
            </p>
            <p className="hint">
              Open the link to continue to your workspace. If you don’t see it, check your spam
              folder.
            </p>
            <button type="button" className="secondary" onClick={() => setStatus({ kind: 'idle' })}>
              Use a different address
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit} aria-busy={status.kind === 'sending'}>
            <span className="auth-symbol">
              <Icon name="shield" />
            </span>
            <p className="eyebrow">DROP IN / ADMIN</p>
            <h1>Admin sign in</h1>
            <p className="auth-description">
              Sign in to approve new locations, manage published places, and review admin activity.
            </p>

            <div className="auth-field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                placeholder="you@example.com"
                disabled={status.kind === 'sending'}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            {status.kind === 'error' && (
              <p className="error" role="alert">
                {status.message}
              </p>
            )}

            <button type="submit" disabled={status.kind === 'sending'}>
              {status.kind === 'sending' ? 'Sending your link…' : 'Email me a sign-in link'}
              <Icon name="arrow" />
            </button>
            <p className="auth-security">
              <Icon name="shield" /> Secure sign-in. No password to remember.
            </p>
          </form>
        )}
        <p className="auth-footer">
          This workspace is for authorized community admins.
          <br />
          Your access is checked securely after signing in.
        </p>
      </section>
    </div>
  );
}
