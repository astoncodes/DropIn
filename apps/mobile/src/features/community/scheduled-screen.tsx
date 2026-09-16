import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Skeleton } from '../../components/ui/activity';
import { SportBadge } from '../../components/ui/brand';
import {
  AppText,
  Button,
  Chip,
  IconButton,
  PressableSurface,
} from '../../components/ui/primitives';
import { useJoinedSessions, useJoinSession, useRunAttendance } from './api';
import { SessionCard } from './session-card';
import { useUpcomingRuns } from '../venues/api';
import type { UpcomingRun } from '../venues/api';
import { timeOfDay, weekdayName, weekdayGroup } from '../../lib/format';
import { radius, space, usePalette } from '../../theme';
import { useSession } from '../../providers/auth-context';

/** Only hosted, Going and Maybe sessions belong in the player's schedule. */
export function ScheduledScreen() {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, isLoading } = useSession();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const runs = useUpcomingRuns({ window: 'personal', enabled: Boolean(session) });
  const history = useJoinedSessions(session?.user.id);
  const attendance = useRunAttendance(
    (runs.data ?? []).map((run) => run.run_series_id),
    session?.user.id,
  );
  const join = useJoinSession();
  const responses = useMemo(
    () =>
      new Map(
        (attendance.data ?? []).map((item) => [
          `${item.run_series_id}-${item.occurrence_date}`,
          item,
        ]),
      ),
    [attendance.data],
  );
  const mine = (runs.data ?? []).filter(
    (run) =>
      session &&
      (run.organizer_id === session.user.id ||
        responses.get(`${run.run_series_id}-${run.occurrence_date}`)?.my_response),
  );
  const past = (history.data ?? [])
    .filter((item) => Boolean(item.cancelled_at) || new Date(item.ends_at).getTime() <= now)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const groups = [
    { id: 'today', title: 'Today' },
    { id: 'tomorrow', title: 'Tomorrow' },
    { id: 'week', title: 'Coming up' },
  ];
  const failed = tab === 'past' ? history.isError : runs.isError || attendance.isError;
  const pending =
    tab === 'past'
      ? history.isPending
      : runs.isPending || (!!runs.data?.length && attendance.isPending);
  function refresh() {
    void runs.refetch();
    void history.refetch();
    if (runs.data?.length) void attendance.refetch();
  }
  async function open(item: UpcomingRun, response: 'going' | 'maybe') {
    if (join.isPending) return;
    setError('');
    try {
      const id = await join.mutateAsync({
        runSeriesId: item.run_series_id,
        occurrenceDate: item.occurrence_date,
        attendance: response,
      });
      router.push(`/session/${id}`);
    } catch (cause) {
      setError((cause as { message?: string })?.message ?? 'Could not open session. Try again.');
    }
  }
  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + space.lg }}
    >
      <View
        style={{
          paddingHorizontal: space.xl,
          gap: space.lg,
          marginBottom: space.lg,
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="display">Scheduled</AppText>
            <AppText tone="muted">Make time for a little play.</AppText>
          </View>
          <IconButton
            icon="plus"
            tone="live"
            label="Create session"
            onPress={() => router.push('/run/new')}
          />
        </View>
        <View
          style={{
            flexDirection: 'row',
            gap: space.sm,
            backgroundColor: colors.surfaceMuted,
            padding: 4,
            borderRadius: radius.pill,
          }}
        >
          <Button
            label="Upcoming"
            size="sm"
            variant={tab === 'upcoming' ? 'solid' : 'soft'}
            tone={tab === 'upcoming' ? 'live' : 'neutral'}
            style={{ flex: 1 }}
            onPress={() => setTab('upcoming')}
          />
          <Button
            label="Past"
            size="sm"
            variant={tab === 'past' ? 'solid' : 'soft'}
            tone={tab === 'past' ? 'live' : 'neutral'}
            style={{ flex: 1 }}
            onPress={() => setTab('past')}
          />
        </View>
      </View>
      <ScrollView
        refreshControl={
          session ? (
            <RefreshControl
              refreshing={runs.isRefetching || history.isRefetching}
              onRefresh={refresh}
              tintColor={colors.live}
            />
          ) : undefined
        }
        contentContainerStyle={{
          paddingHorizontal: space.xl,
          paddingBottom: space.xxl,
          gap: space.md,
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
        }}
      >
        {!!error && (
          <View accessibilityRole="alert">
            <AppText tone="alert">{error}</AppText>
          </View>
        )}
        {isLoading ? (
          <Skeleton height={180} />
        ) : !session ? (
          <EmptyState
            icon="calendar-heart"
            title="Good things on your calendar"
            body="Sign in to keep track of sessions you host, join, or mark Maybe."
            action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />}
          />
        ) : failed ? (
          <EmptyState
            icon="wifi-off"
            title="Could not load your schedule"
            body="Check your connection and try again."
            action={<Button label="Try again" onPress={refresh} />}
          />
        ) : pending ? (
          <>
            <Skeleton height={120} />
            <Skeleton height={120} />
          </>
        ) : tab === 'past' ? (
          past.length ? (
            past.map((item) => (
              <PressableSurface
                key={item.id}
                onPress={() => router.push(`/session/${item.id}`)}
                accessibilityLabel={`Open ${item.title}`}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    backgroundColor: colors.surface,
                    padding: space.lg,
                    borderRadius: radius.xl,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <SportBadge slug={item.sportSlug} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <AppText variant="bodyStrong">{item.title}</AppText>
                    <AppText variant="caption" tone="muted">
                      {item.venueName}
                    </AppText>
                    <AppText variant="caption" tone="muted">
                      {weekdayName(item.starts_at)} · {timeOfDay(item.starts_at)}
                    </AppText>
                    <Chip
                      compact
                      label={item.cancelled_at ? 'Cancelled' : 'Played'}
                      tone={item.cancelled_at ? 'alert' : 'neutral'}
                    />
                  </View>
                </View>
              </PressableSurface>
            ))
          ) : (
            <EmptyState
              icon="calendar-check-outline"
              title="Your story starts here"
              body="Completed sessions will appear here so you can revisit their conversations and memories."
            />
          )
        ) : mine.length ? (
          groups.map((group) => {
            const items = mine.filter((item) => weekdayGroup(item.starts_at) === group.id);
            if (!items.length) return null;
            return (
              <View key={group.id} style={{ gap: space.md }}>
                <AppText variant="heading" style={{ marginTop: space.sm }}>
                  {group.title}
                </AppText>
                {items.map((item) => {
                  const response = responses.get(`${item.run_series_id}-${item.occurrence_date}`);
                  return (
                    <SessionCard
                      key={`${item.run_series_id}-${item.occurrence_date}`}
                      compact
                      item={item}
                      response={response}
                      hosting={item.organizer_id === session.user.id}
                      pending={join.isPending}
                      onRespond={(value) => void open(item, value)}
                      onOpen={
                        response?.session_id
                          ? () => router.push(`/session/${response.session_id}`)
                          : undefined
                      }
                    />
                  );
                })}
              </View>
            );
          })
        ) : (
          <EmptyState
            icon="calendar-plus"
            title="Room for a good game"
            body="Discover a session and choose Going or Maybe to add it here. Sessions you host appear here too."
            action={
              <Button
                label="Discover sessions"
                icon="arrow-right"
                onPress={() => router.push('/feed')}
              />
            }
          />
        )}
      </ScrollView>
    </View>
  );
}
