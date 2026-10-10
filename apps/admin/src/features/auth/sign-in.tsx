import { userMessage } from '@dropin/shared';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { supabase } from '../../lib/supabase';
import { Brand } from '../../components/brand';

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
      if (error) throw error;
      setStatus({ kind: 'sent', email: trimmed });
    } catch (error) {
      console.error('[admin] Could not send the sign-in link', error);
      setStatus({
        kind: 'error',
        message: userMessage(error, 'Could not send your sign-in link. Try again.'),
      });
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-entry" aria-label="Admin sign in">
        <Brand />
        {status.kind === 'sent' ? (
          <div className="auth-form" role="status">
            <h1>Check your email</h1>
            <p className="auth-description">
              A sign-in link is on its way to <strong>{status.email}</strong>. If you don’t see it,
              check your spam folder.
            </p>
            <button type="button" className="secondary" onClick={() => setStatus({ kind: 'idle' })}>
              Use a different address
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit} aria-busy={status.kind === 'sending'}>
            <h1>Admin sign in</h1>
            <p className="auth-description">
              We’ll email you a link to sign in. There is no password.
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
            </button>
          </form>
        )}
        <p className="auth-footer">
          For authorized Drop In admins. Access is checked after you sign in.
        </p>
      </section>
    </div>
  );
}
