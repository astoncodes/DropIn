import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { supabase } from '../../lib/supabase';

export function MfaGate({ children }: { children?: ReactNode }) {
  // This gate controls rendering; is_admin() independently enforces AAL2 in
  // Postgres. QR secrets stay in component state and disappear on unmount.
  const client = useQueryClient();
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(
    null,
  );
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assurance = useQuery({
    queryKey: ['admin-mfa'],
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const result = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (result.error) throw result.error;
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      return { ...result.data, factors: factors.data.totp };
    },
  });

  async function enroll() {
    setBusy(true);
    setError('');
    try {
      const result = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'Drop In Admin',
      });
      if (result.error) throw result.error;
      setEnrollment({
        id: result.data.id,
        qr: result.data.totp.qr_code,
        secret: result.data.totp.secret,
      });
    } catch {
      setError('Could not set up an authenticator. Try again or contact the project owner.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    const selected = enrollment?.id || factorId || assurance.data?.factors[0]?.id;
    if (!selected || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError('');
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId: selected, code });
      if (result.error) throw result.error;
      setEnrollment(null);
      setCode('');
      // Drop all AAL1-era cached authorization results and admin data.
      client.clear();
      await assurance.refetch();
    } catch {
      setCode('');
      setError('Verification failed. Check your authenticator code and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      const result = await supabase.auth.signOut();
      if (result.error) throw result.error;
      setEnrollment(null);
      client.clear();
    } catch {
      setError('Could not sign out. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (
    !assurance.isError &&
    !assurance.isPending &&
    assurance.data?.currentLevel === 'aal2' &&
    assurance.data.nextLevel === 'aal2'
  )
    return children;
  const factors = assurance.data?.factors ?? [];
  return (
    <main className="shell">
      <section className="card access-card" aria-label="Admin two-step verification">
        <h1>Protect your admin access</h1>
        <p>Admin access requires an authenticator app as well as your sign-in link.</p>
        {assurance.isPending && <p role="status">Checking verification…</p>}
        {assurance.isError && (
          <>
            <p role="alert">Could not check verification. Access remains locked.</p>
            <button onClick={() => void assurance.refetch()} disabled={assurance.isFetching}>
              Retry
            </button>
          </>
        )}
        {assurance.data && !factors.length && !enrollment && (
          <button onClick={() => void enroll()} disabled={busy}>
            Set up authenticator
          </button>
        )}
        {enrollment && (
          <>
            <p>Scan this QR code with your authenticator. Keep the setup key private.</p>
            <img
              src={
                enrollment.qr.startsWith('data:image/svg+xml')
                  ? enrollment.qr
                  : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qr)}`
              }
              width="220"
              height="220"
              alt="Authenticator setup QR code"
            />
            <details>
              <summary>Enter setup key manually</summary>
              <code>{enrollment.secret}</code>
            </details>
          </>
        )}
        {(enrollment || factors.length > 0) && (
          <form onSubmit={(event) => void verify(event)}>
            {!enrollment && factors.length > 1 && (
              <label>
                Authenticator
                <select
                  value={factorId || factors[0]?.id}
                  onChange={(event) => setFactorId(event.target.value)}
                  disabled={busy}
                >
                  {factors.map((factor, index) => (
                    <option key={factor.id} value={factor.id}>
                      {factor.friendly_name || `Authenticator ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label htmlFor="mfa-code">Six-digit code</label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={busy}
            />
            <button disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify'}</button>
          </form>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <p>
          Lost access to your authenticator? Contact the project owner for identity-verified
          recovery.
        </p>
        <button className="secondary" onClick={() => void signOut()} disabled={busy}>
          Sign out
        </button>
      </section>
    </main>
  );
}
