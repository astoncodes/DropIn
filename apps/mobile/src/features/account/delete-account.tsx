import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { AppText, Button } from '../../components/ui/primitives';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/auth-context';
import { radius, space, usePalette } from '../../theme';
import { UserFacingError, userMessage } from '../../lib/errors';

export function DeleteAccount({ userId }: { userId: string }) {
  const colors = usePalette();
  const router = useRouter();
  const { clearDeletedAccount } = useSession();
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const status = useQuery({
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

  return (
    <View
      style={{ gap: space.md, borderTopWidth: 1, borderColor: colors.border, paddingTop: space.lg }}
    >
      {expanded || pending ? (
        <>
          <AppText variant="heading">
            {pending ? 'Finish account deletion' : 'Delete your account?'}
          </AppText>
          <AppText tone="muted">
            This permanently removes your profile, check-ins, messages, posts, uploads and venue
            submissions. Sessions you host, including their conversations and participants’ posts
            and uploads, are also removed. Approved public venues remain.
          </AppText>
          <AppText tone="muted">
            This cannot be undone. If deletion is interrupted, return here to finish removing your
            files.
          </AppText>
          <TextInput
            accessibilityLabel="Type DELETE to confirm"
            placeholder="Type DELETE to confirm"
            placeholderTextColor={colors.textFaint}
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            style={{
              padding: space.md,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              color: colors.text,
              fontSize: 16,
            }}
          />
          {!!error && <AppText tone="alert">{error}</AppText>}
          <Button
            label={pending ? 'Continue deletion' : 'Permanently delete account'}
            tone="alert"
            disabled={confirmation !== 'DELETE' || busy}
            loading={busy}
            onPress={() => void remove()}
          />
          {!pending && (
            <Button
              label="Keep my account"
              tone="neutral"
              variant="outline"
              disabled={busy}
              onPress={() => {
                setExpanded(false);
                setConfirmation('');
                setError('');
              }}
            />
          )}
        </>
      ) : (
        <Button
          label="Delete account"
          tone="alert"
          variant="outline"
          onPress={() => setExpanded(true)}
        />
      )}
    </View>
  );
}
