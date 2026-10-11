import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '../../components/screen';
import { EmptyState, LoadError, Skeleton } from '../../components/ui/activity';
import { Avatar } from '../../components/ui/avatar';
import { ConfirmDialog } from '../../components/ui/dialog';
import { ListSection, ListRow } from '../../components/ui/list-row';
import { AppText, Button } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/toast';
import { relativeTime } from '../../lib/format';
import { userMessage } from '@dropin/shared';
import { loadPhase } from '../../lib/load-phase';
import { useSession } from '../../providers/auth-context';
import { useBlockedPlayers, useUnblockPlayer } from './api';

/** Players the signed-in player has blocked, each with a confirmed unblock. */
export function BlockedPlayersScreen() {
  const router = useRouter();
  const showToast = useToast();
  const { session, isLoading } = useSession();
  const blocked = useBlockedPlayers(session?.user.id);
  const phase = loadPhase(blocked);
  const unblock = useUnblockPlayer();
  const [pending, setPending] = useState<{ playerId: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirmUnblock() {
    if (!pending) return;
    setError(null);
    try {
      await unblock.mutateAsync(pending.playerId);
      showToast(`Unblocked ${pending.name}`);
      setPending(null);
    } catch (cause) {
      setError(userMessage(cause, `Could not unblock ${pending.name}. Try again.`));
    }
  }

  return (
    <Screen insetTop={false}>
      <AppText tone="muted">
        You don’t see posts, photos or chat messages from players you block. They aren’t told.
      </AppText>
      {isLoading || (session && phase === 'loading') ? (
        <Skeleton height={120} />
      ) : !session ? (
        <EmptyState
          title="Sign in to manage blocks"
          body="Blocks belong to your account."
          action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />}
        />
      ) : phase === 'failed' ? (
        <LoadError
          title="Could not load blocked players"
          onRetry={() => void blocked.refetch()}
          retrying={blocked.isFetching}
        />
      ) : blocked.data?.length ? (
        <ListSection>
          {blocked.data.map((player) => (
            <ListRow
              key={player.playerId}
              leading={<Avatar name={player.name} size={36} />}
              title={player.name}
              subtitle={`Blocked ${relativeTime(player.blockedAt).toLowerCase()}`}
              trailing={
                <Button
                  label="Unblock"
                  size="sm"
                  variant="outline"
                  tone="neutral"
                  accessibilityHint={`Shows ${player.name}’s posts and messages again`}
                  onPress={() => setPending({ playerId: player.playerId, name: player.name })}
                />
              }
            />
          ))}
        </ListSection>
      ) : (
        <EmptyState
          title="No one is blocked"
          body="To block someone, open the menu on their post or press and hold one of their messages."
        />
      )}
      <ConfirmDialog
        visible={pending !== null}
        title={`Unblock ${pending?.name ?? ''}?`}
        message="Their posts, photos and chat messages will show again. They won’t be told."
        confirmLabel="Unblock"
        confirmTone="neutral"
        busy={unblock.isPending}
        error={error}
        onConfirm={() => void confirmUnblock()}
        onCancel={() => {
          setPending(null);
          setError(null);
        }}
      />
    </Screen>
  );
}
