import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, LoadError, Skeleton } from '../../components/ui/activity';
import { Avatar } from '../../components/ui/avatar';
import { AppText, IconButton, PressableSurface } from '../../components/ui/primitives';
import { dayLabel, relativeTime, timeOfDay } from '../../lib/format';
import { loadPhase } from '../../lib/load-phase';
import { useSession } from '../../providers/auth-context';
import { radius, space, usePalette } from '../../theme';
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
        // Inside a session the surrounding screen already provides the gutter.
        paddingHorizontal: sessionId ? 0 : space.lg,
        paddingBottom: insets.bottom + space.xl,
        maxWidth: 760,
        width: '100%',
        alignSelf: 'center',
      }}
      refreshControl={
        <RefreshControl
          refreshing={feed.isRefetching}
          onRefresh={() => feed.refetch()}
          tintColor={colors.text}
        />
      }
    >
      {phase === 'loading' ? (
        <View style={styles.skeletons}>
          {[0, 1].map((key) => (
            <Skeleton key={key} height={320} />
          ))}
        </View>
      ) : phase === 'failed' ? (
        <LoadError
          title="Could not load moments"
          onRetry={() => void feed.refetch()}
          retrying={feed.isFetching}
        />
      ) : feed.data?.length ? (
        <View>
          {feed.data.map((post) => {
            const firstMedia = post.media[0];
            return (
              <View key={post.id} style={[styles.post, { borderBottomColor: colors.border }]}>
                <View style={styles.authorRow}>
                  <Avatar name={post.authorName} size={36} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong">{post.authorName}</AppText>
                    <AppText variant="caption" tone="muted">
                      {relativeTime(post.created_at)}
                    </AppText>
                  </View>
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
                  <View style={[styles.mediaFrame, { backgroundColor: colors.surfaceMuted }]}>
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

                {post.caption && <AppText variant="body">{post.caption}</AppText>}
                <PressableSurface
                  onPress={() => router.push(`/session/${post.session.id}`)}
                  accessibilityLabel={`Open ${post.sessionTitle}`}
                >
                  <View style={styles.sessionLink}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText variant="label" tone="muted">
                        {post.sportName} · {dayLabel(post.session.starts_at)}{' '}
                        {timeOfDay(post.session.starts_at)}
                      </AppText>
                      <AppText variant="heading" numberOfLines={1}>
                        {post.sessionTitle}
                      </AppText>
                      <AppText variant="caption" tone="muted" numberOfLines={1}>
                        {post.venueName}
                      </AppText>
                    </View>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={22}
                      color={colors.textFaint}
                    />
                  </View>
                </PressableSurface>
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyState
          title={sessionId ? 'No photos from this session yet' : 'No moments yet'}
          body="Photos and short clips that players share from their sessions appear here."
        />
      )}
      <ModerationSheet subject={moderationSubject} onClose={() => setModerationSubject(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  skeletons: { gap: space.lg, paddingTop: space.lg },
  post: { gap: space.md, paddingVertical: space.lg, borderBottomWidth: 1 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mediaFrame: { aspectRatio: 4 / 3, borderRadius: radius.lg, overflow: 'hidden' },
  sessionLink: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
