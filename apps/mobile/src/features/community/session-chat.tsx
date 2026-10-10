import { Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, LoadError, Skeleton } from '../../components/ui/activity';
import { AppText } from '../../components/ui/primitives';
import { relativeTime } from '../../lib/format';
import { loadPhase } from '../../lib/load-phase';
import { radius, space, usePalette } from '../../theme';
import type { useSessionMessages } from './api';

type MessagesQuery = ReturnType<typeof useSessionMessages>;
type Message = NonNullable<MessagesQuery['data']>[number];

/**
 * The session conversation. Other players' messages open the report/block
 * sheet on a long press, and expose the same action to screen readers as a
 * named accessibility action, since a long press is not discoverable there.
 */
export function SessionMessageList({
  messages,
  viewerId,
  onModerate,
}: {
  messages: MessagesQuery;
  viewerId: string | undefined;
  onModerate: (message: Message) => void;
}) {
  const phase = loadPhase(messages);
  if (phase === 'failed') {
    return (
      <LoadError
        title="Couldn’t load chat"
        onRetry={() => void messages.refetch()}
        retrying={messages.isFetching}
      />
    );
  }
  if (phase === 'loading') return <Skeleton height={180} />;
  if (!messages.data?.length) {
    return (
      <EmptyState
        icon="message-outline"
        title="Start the conversation"
        body="Ask what to bring or where everyone is meeting."
      />
    );
  }
  return (
    <>
      {messages.data.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          mine={message.user_id === viewerId}
          onModerate={() => onModerate(message)}
        />
      ))}
    </>
  );
}

function MessageBubble({
  message,
  mine,
  onModerate,
}: {
  message: Message;
  mine: boolean;
  onModerate: () => void;
}) {
  const colors = usePalette();
  const meta = `${mine ? 'You' : message.authorName} · ${relativeTime(message.created_at)}`;
  const bubble = (
    <View
      style={[
        styles.bubble,
        mine
          ? { backgroundColor: colors.live, borderBottomRightRadius: radius.sm / 2 }
          : { backgroundColor: colors.surface, borderBottomLeftRadius: radius.sm / 2 },
        !mine && { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <AppText variant="body" tone={mine ? 'inverse' : 'default'}>
        {message.body}
      </AppText>
    </View>
  );

  return (
    <View style={[styles.row, mine && styles.mine]}>
      <AppText variant="micro" tone="muted">
        {meta}
      </AppText>
      {mine ? (
        <View style={styles.bubbleColumn}>{bubble}</View>
      ) : (
        <Pressable
          onLongPress={onModerate}
          delayLongPress={350}
          accessibilityLabel={`${message.authorName}: ${message.body}`}
          accessibilityHint="Press and hold to report or block"
          accessibilityActions={[{ name: 'moderate', label: 'Report or block' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'moderate') onModerate();
          }}
          style={({ pressed }) => [styles.bubbleColumn, { opacity: pressed ? 0.7 : 1 }]}
        >
          {bubble}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, alignItems: 'flex-start' },
  mine: { alignItems: 'flex-end' },
  bubbleColumn: { maxWidth: '84%' },
  bubble: {
    maxWidth: '100%',
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
  },
});
