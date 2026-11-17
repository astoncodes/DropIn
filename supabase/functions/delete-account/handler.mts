import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';
import type { AppleClient } from '../_shared/apple.mts';
import { createRequestGate } from '../_shared/player-request.mts';

const CONFIRMATION_MESSAGE = 'Confirm account deletion by typing DELETE.';

/**
 * Apple requires an app to revoke its Sign in with Apple authorization when
 * the account is deleted. The refresh token was stored at sign-in; players who
 * signed in another way have no row, and nothing to revoke means nothing to do.
 */
async function revokeAppleAuthorization(
  admin: SupabaseClient,
  apple: AppleClient | null,
  userId: string,
): Promise<void> {
  const stored = await admin
    .from('apple_refresh_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle();
  if (stored.error) throw stored.error;
  if (!stored.data) return;
  if (!apple) throw new Error('Apple revocation is not configured.');
  await apple.revoke(stored.data.refresh_token);
  const forgotten = await admin.from('apple_refresh_tokens').delete().eq('user_id', userId);
  if (forgotten.error) throw forgotten.error;
}

export function createDeleteAccountHandler(
  admin: SupabaseClient,
  allowedOrigins: string[] = [],
  apple: AppleClient | null = null,
) {
  const accept = createRequestGate(admin, allowedOrigins);
  return async (request: Request) => {
    const gate = await accept(request, { invalidBodyMessage: CONFIRMATION_MESSAGE });
    if (!gate.ok) return gate.response;
    const { user, body, reply } = gate;
    if (body.confirmation !== 'DELETE' || Object.keys(body).some((key) => key !== 'confirmation')) {
      return reply({ error: CONFIRMATION_MESSAGE }, 400);
    }
    let step = 'apple-revocation';
    try {
      await revokeAppleAuthorization(admin, apple, user.id);
      step = 'staging';
      const staged = await admin.rpc('prepare_account_deletion', { p_user_id: user.id });
      if (staged.error) throw staged.error;
      // Bound each invocation; large accounts resume safely from the saved queue.
      for (let batch = 0; batch < 10; batch++) {
        step = 'storage';
        const pending = await admin.rpc('account_deletion_objects', { p_user_id: user.id });
        if (pending.error) throw pending.error;
        const paths = (pending.data ?? []).map((row: { storage_path: string }) => row.storage_path);
        if (!paths.length) {
          step = 'auth';
          const result = await admin.auth.admin.deleteUser(user.id);
          if (result.error && result.error.code !== 'user_not_found') throw result.error;
          return reply({ deleted: true });
        }
        const removed = await admin.storage.from('session-media').remove(paths);
        if (removed.error) throw removed.error;
        const acknowledged = await admin.rpc('ack_account_deletion_objects', {
          p_user_id: user.id,
          p_paths: paths,
        });
        if (acknowledged.error) throw acknowledged.error;
      }
      return reply({ pending: true }, 202);
    } catch {
      // The step name is enough to diagnose; never log JWTs, personal data or
      // provider error details. The persisted marker, the file queue and the
      // forgotten Apple token make an explicit retry safe after partial progress.
      console.error(`[delete-account] failed during ${step}`);
      return reply({ error: 'Deletion could not finish. Please retry to complete it.' }, 503);
    }
  };
}
