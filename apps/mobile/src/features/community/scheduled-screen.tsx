import { userMessage } from '@dropin/shared';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, LoadError, Skeleton } from '../../components/ui/activity';
import { SportBadge } from '../../components/ui/brand';
import { Notice } from '../../components/ui/notice';
import { AppText, Button, IconButton, PressableSurface, Tag } from '../../components/ui/primitives';
import { ScreenHeader } from '../../components/ui/screen-header';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { dayLabel, timeOfDay } from '../../lib/format';
import { combineLoadPhases, loadPhase } from '../../lib/load-phase';
import { useSession } from '../../providers/auth-context';
import { space, usePalette } from '../../theme';
import { useUpcomingRuns } from '../venues/api';
import type { UpcomingRun } from '../venues/api';
import { useJoinedSessions, useJoinSession, useRunAttendance } from './api';
import { SessionRow } from './session-row';

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
  // Upcoming needs each run's attendance to know which ones are the player's;
  // with no runs there is nothing to look attendance up for.
  const phase =
    tab === 'past'
      ? loadPhase(history)
      : combineLoadPhases(loadPhase(runs), runs.data?.length ? loadPhase(attendance) : 'ready');
  const retrying = tab === 'past' ? history.isFetching : runs.isFetching || attendance.isFetching;
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
      setError(userMessage(cause, 'Could not open session. Try again.'));
    }
  }
  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + space.md }}
    >
      <View style={styles.top}>
        <ScreenHeader
          title="Scheduled"
          actions={
            <IconButton
              icon="plus"
              filled
              label="Create session"
              onPress={() => router.push('/run/new')}
            />
          }
        />
        <SegmentedControl
          segments={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityLabel="Schedule views"
        />
      </View>
      <ScrollView
        refreshControl={
          session ? (
            <RefreshControl
              refreshing={runs.isRefetching || history.isRefetching}
              onRefresh={refresh}
              tintColor={colors.text}
            />
          ) : undefined
        }
        contentContainerStyle={styles.content}
      >
        {!!error && <Notice tone="error" message={error} />}
        {isLoading ? (
          <View style={styles.skeletons}>
            <Skeleton height={72} />
          </View>
        ) : !session ? (
          <EmptyState
            title="Your sessions, in one place"
            body="Sign in to see the sessions you host, are going to, or marked Maybe."
            action={<Button label="Sign in" size="sm" onPress={() => router.push('/sign-in')} />}
          />
        ) : phase === 'failed' ? (
          <LoadError title="Could not load your schedule" onRetry={refresh} retrying={retrying} />
        ) : phase === 'loading' ? (
          <View style={styles.skeletons}>
            <Skeleton height={72} />
            <Skeleton height={72} />
          </View>
        ) : tab === 'past' ? (
          past.length ? (
            past.map((item) => (
              <PressableSurface
                key={item.id}
                onPress={() => router.push(`/session/${item.id}`)}
                accessibilityLabel={`Open ${item.title}`}
              >
                <View style={[styles.pastRow, { borderBottomColor: colors.border }]}>
                  <SportBadge slug={item.sportSlug} />
                  <View style={styles.pastCopy}>
                    <AppText variant="label" tone="muted">
                      {dayLabel(item.starts_at)} · {timeOfDay(item.starts_at)}
                    </AppText>
                    <AppText variant="heading" numberOfLines={2}>
                      {item.title}
                    </AppText>
                    <AppText variant="caption" tone="muted" numberOfLines={1}>
                      {item.venueName}
                    </AppText>
                    {item.cancelled_at && (
                      <View style={styles.tags}>
                        <Tag label="Cancelled" tone="alert" />
                      </View>
                    )}
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textFaint} />
                </View>
              </PressableSurface>
            ))
          ) : (
            <EmptyState
              title="Nothing played yet"
              body="Sessions you joined stay here afterwards, with their chat and photos."
            />
          )
        ) : mine.length ? (
          mine.map((item) => {
            const response = responses.get(`${item.run_series_id}-${item.occurrence_date}`);
            return (
              <SessionRow
                key={`${item.run_series_id}-${item.occurrence_date}`}
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
          })
        ) : (
          <EmptyState
            title="Nothing scheduled"
            body="Join a session in Discover, or start one, and it appears here."
            action={
              <Button label="Browse sessions" size="sm" onPress={() => router.push('/feed')} />
            }
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: space.lg,
    gap: space.md,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  skeletons: { gap: space.md, paddingTop: space.lg },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.lg,
    borderBottomWidth: 1,
  },
  pastCopy: { flex: 1, gap: space.xs },
  tags: { flexDirection: 'row', paddingTop: 2 },
});
