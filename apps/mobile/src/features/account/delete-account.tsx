import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { Dialog } from '../../components/ui/dialog';
import { Notice } from '../../components/ui/notice';
import { AppText, Button } from '../../components/ui/primitives';
import { TextField } from '../../components/ui/text-field';
import { UserFacingError, userMessage } from '../../lib/errors';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/auth-context';

/**
 * Whether an earlier deletion stopped part-way. The Edge Function records the
 * request before removing files, so an interrupted deletion stays visible here
 * until it is finished.
 */
export function useAccountDeletionStatus(userId: string) {
  return useQuery({
    queryKey: ['account-deletion', userId],
    queryFn: async () => {
      const result = await supabase
        .from('account_deletion_requests')
        .select('started_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
  });
}

/**
 * Permanent account deletion behind a typed confirmation. Deletion runs in
 * bounded batches on the server; this keeps calling until the function reports
 * the account gone, or tells the player to come back and finish.
 */
export function DeleteAccountDialog({
  userId,
  visible,
  onClose,
}: {
  userId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { clearDeletedAccount } = useSession();
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const status = useAccountDeletionStatus(userId);
  const pending = started || Boolean(status.data);

  async function remove() {
    if (locked.current || confirmation !== 'DELETE') return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      for (let batch = 0; batch < 6; batch++) {
        const result = await supabase.functions.invoke('delete-account', {
          body: { confirmation },
        });
        if (result.error) {
          const context = (result.error as { context?: Response }).context;
          const details =
            typeof context?.json === 'function' ? await context.json().catch(() => null) : null;
          // The function's own error text is written for players; transport failures are not.
          if (typeof details?.error === 'string') throw new UserFacingError(details.error);
          throw result.error;
        }
        if (result.data?.deleted) {
          await clearDeletedAccount();
          router.replace({ pathname: '/sign-in', params: { accountDeleted: 'true' } });
          return;
        }
        if (!result.data?.pending)
          throw new UserFacingError('Could not confirm deletion. Please retry.');
        setStarted(true);
      }
      setError('Your files are still being removed. Continue deletion to finish.');
    } catch (cause) {
      setError(userMessage(cause, 'Could not finish deletion. Please retry.'));
      void status.refetch();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setConfirmation('');
    setError('');
    onClose();
  }

  return (
    <Dialog
      visible={visible}
      onClose={close}
      dismissible={!busy}
      title={pending ? 'Finish deleting your account' : 'Delete your account?'}
      description="This permanently removes your profile, check-ins, messages, posts, photos, clips and venue submissions. Sessions you organise are removed too, including other players’ messages and posts in them. Approved public venues stay listed."
      actions={
        <>
          <Button
            label={pending ? 'Continue deletion' : 'Delete permanently'}
            tone="alert"
            disabled={confirmation !== 'DELETE'}
            loading={busy}
            onPress={() => void remove()}
          />
          <Button
            label={pending ? 'Not now' : 'Keep my account'}
            tone="neutral"
            variant="ghost"
            disabled={busy}
            onPress={close}
          />
        </>
      }
    >
      <AppText variant="bodyStrong">This cannot be undone.</AppText>
      <TextField
        label="Type DELETE to confirm"
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
        hint={
          pending
            ? 'If deletion is interrupted, return here to finish removing your files.'
            : undefined
        }
      />
      {!!error && <Notice tone="error" message={error} />}
    </Dialog>
  );
}
