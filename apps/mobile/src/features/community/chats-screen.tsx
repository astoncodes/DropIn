import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SportBadge } from '../../components/ui/brand';
import { EmptyState, LoadError, Skeleton } from '../../components/ui/activity';
import { AppText, Button, PressableSurface } from '../../components/ui/primitives';
import { ScreenHeader } from '../../components/ui/screen-header';
import { dayLabel, relativeTime, timeOfDay } from '../../lib/format';
import { loadPhase } from '../../lib/load-phase';
import { useSession } from '../../providers/auth-context';
import { space, usePalette } from '../../theme';
import { useJoinedSessions } from './api';

/** The chats of every session the player has joined, most recent session first. */
export function ChatsScreen() {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, isLoading } = useSession();
  const chats = useJoinedSessions(session?.user.id);
  const phase = loadPhase(chats);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
      refreshControl={
        session ? (
          <RefreshControl
            refreshing={chats.isRefetching}
            onRefresh={() => void chats.refetch()}
            tintColor={colors.text}
          />
        ) : undefined
      }
    >
      <ScreenHeader title="Chats" />

      {isLoading || (Boolean(session) && phase === 'loading') ? (
        <View style={styles.skeletons}>
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} height={56} />
          ))}
        </View>
      ) : !session ? (
        <EmptyState
          title="Sign in to see your chats"
          body="Each session has a chat that only the people who joined can read."
          action={<Button label="Sign in" size="sm" onPress={() => router.push('/sign-in')} />}
        />
      ) : phase === 'failed' ? (
        <LoadError
          title="Could not load chats"
          onRetry={() => void chats.refetch()}
          retrying={chats.isFetching}
        />
      ) : chats.data?.length ? (
        <View style={[styles.list, { borderTopColor: colors.border }]}>
          {chats.data.map((chat) => (
            <PressableSurface
              key={chat.id}
              onPress={() =>
                router.push({
                  pathname: '/session/[sessionId]',
                  params: { sessionId: chat.id, tab: 'chat' },
                })
              }
              accessibilityLabel={`Open ${chat.title} chat`}
            >
              <View style={[styles.row, { borderBottomColor: colors.border }]}>
                <SportBadge slug={chat.sportSlug} />
                <View style={styles.copy}>
                  {/* Sessions in one series share a title; the date tells them apart. */}
                  <AppText variant="label" tone="muted">
                    {dayLabel(chat.starts_at)} · {timeOfDay(chat.starts_at)}
                  </AppText>
                  <View style={styles.titleLine}>
                    <AppText variant="heading" numberOfLines={1} style={styles.title}>
                      {chat.title}
                    </AppText>
                    {chat.lastMessage && (
                      <AppText variant="micro" tone="faint">
                        {relativeTime(chat.lastMessage.created_at)}
                      </AppText>
                    )}
                  </View>
                  <AppText variant="caption" tone="muted" numberOfLines={1}>
                    {chat.cancelled_at ? 'Cancelled' : (chat.lastMessage?.body ?? chat.venueName)}
                  </AppText>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textFaint} />
              </View>
            </PressableSurface>
          ))}
        </View>
      ) : (
        <EmptyState
          title="No chats yet"
          body="Join a session and its chat appears here."
          action={<Button label="Browse sessions" size="sm" onPress={() => router.push('/feed')} />}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  skeletons: { gap: space.md, paddingTop: space.lg },
  list: { marginTop: space.md, borderTopWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  copy: { flex: 1, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  title: { flex: 1 },
});
