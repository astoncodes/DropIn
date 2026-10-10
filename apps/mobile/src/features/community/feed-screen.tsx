import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, LoadError, Skeleton } from '../../components/ui/activity';
import { Avatar } from '../../components/ui/avatar';
import {
  AppText,
  Chip,
  IconButton,
  PressableSurface,
  sportIcon,
} from '../../components/ui/primitives';
import { relativeTime, timeOfDay, weekdayName } from '../../lib/format';
import { loadPhase } from '../../lib/load-phase';
import { useSession } from '../../providers/auth-context';
import { elevation, radius, space, usePalette } from '../../theme';
import { ModerationSheet } from '../moderation/moderation-sheet';
import type { ModerationSubject } from '../moderation/api';
import { useCommunityFeed } from './api';

function ClipPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = true;
  });
  return (
    <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls />
  );
}

export function MomentsFeed({ sessionId }: { sessionId?: string } = {}) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const feed = useCommunityFeed(undefined, sessionId);
  const phase = loadPhase(feed);
  const [moderationSubject, setModerationSubject] = useState<ModerationSubject | null>(null);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: space.lg,
        paddingBottom: insets.bottom + space.xl,
        maxWidth: 760,
        width: '100%',
        alignSelf: 'center',
      }}
      refreshControl={
        <RefreshControl refreshing={feed.isRefetching} onRefresh={() => feed.refetch()} />
      }
    >
      {phase === 'loading' ? (
        <View style={styles.list}>
          {[0, 1].map((key) => (
            <Skeleton key={key} height={390} />
          ))}
        </View>
      ) : phase === 'failed' ? (
        <LoadError
          title="Could not load moments"
          onRetry={() => void feed.refetch()}
          retrying={feed.isFetching}
        />
      ) : feed.data?.length ? (
        <View style={styles.list}>
          {feed.data.map((post) => {
            const firstMedia = post.media[0];
            return (
              <View
                key={post.id}
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  elevation.card,
                ]}
              >
                <View style={styles.authorRow}>
                  <Avatar name={post.authorName} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong">{post.authorName}</AppText>
                    <AppText variant="caption" tone="muted">
                      {relativeTime(post.created_at)}
                    </AppText>
                  </View>
                  <Chip label={post.sportName} icon={sportIcon(post.sportSlug)} compact />
                  {post.author_id !== session?.user.id && (
                    <IconButton
                      icon="dots-horizontal"
                      label={`Report or block ${post.authorName}`}
                      onPress={() =>
                        setModerationSubject({
                          kind: 'session_post',
                          id: post.id,
                          authorId: post.author_id,
                          authorName: post.authorName,
                        })
                      }
                    />
                  )}
                </View>

                {firstMedia && (
                  <View style={styles.mediaFrame}>
                    {firstMedia.kind === 'video' ? (
                      <ClipPlayer url={firstMedia.url} />
                    ) : (
                      <Image
                        source={{ uri: firstMedia.url }}
                        accessibilityLabel={post.caption || `Photo from ${post.sessionTitle}`}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={180}
                      />
                    )}
                  </View>
                )}

                <View style={styles.copy}>
                  {post.caption && <AppText variant="body">{post.caption}</AppText>}
                  <PressableSurface
                    onPress={() => router.push(`/session/${post.session.id}`)}
                    accessibilityLabel={`Open ${post.sessionTitle}`}
                  >
                    <View style={[styles.sessionCard, { backgroundColor: colors.surfaceMuted }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="bodyStrong">{post.sessionTitle}</AppText>
                        <AppText variant="caption" tone="muted">
                          {post.venueName} · {weekdayName(post.session.starts_at)} at{' '}
                          {timeOfDay(post.session.starts_at)}
                        </AppText>
                      </View>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={22}
                        color={colors.textMuted}
                      />
                    </View>
                  </PressableSurface>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <EmptyState
            icon="image-multiple-outline"
            title={sessionId ? 'No photos from this session yet' : 'No moments nearby yet'}
            body="Join a session and share a photo or short clip with your local sports community."
          />
        </View>
      )}
      <ModerationSheet subject={moderationSubject} onClose={() => setModerationSubject(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: space.lg, gap: 3, marginBottom: space.lg },
  list: { paddingHorizontal: space.md, gap: space.lg },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  mediaFrame: { height: 270, backgroundColor: '#D9E1DA' },
  copy: { padding: space.md, gap: space.md },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.lg,
    gap: space.sm,
  },
  empty: { padding: space.lg },
});
