import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View, TextInput, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, Skeleton } from '../../components/ui/activity';
import { AppText, Button, Chip, IconButton, sportIcon } from '../../components/ui/primitives';
import { useSession } from '../../providers/auth-context';
import { radius, space, usePalette } from '../../theme';
import { useUpcomingRuns, useSports } from '../venues/api';
import type { UpcomingRun } from '../venues/api';
import { useJoinSession, useRunAttendance } from './api';
import { MomentsFeed } from './feed-screen';
import { SessionCard } from './session-card';

export function DiscoverScreen() {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const [tab, setTab] = useState<'sessions' | 'moments'>('sessions');
  const [selectedSports, setSelectedSports] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [error, setError] = useState('');
  const runs = useUpcomingRuns({ sportIds: selectedSports, window: 'discovery' });
  const sports = useSports();
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
  const matching = (runs.data ?? []).filter((item) =>
    `${item.title ?? ''} ${item.sport_name} ${item.venue_name}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );

  async function respond(item: UpcomingRun, response: 'going' | 'maybe') {
    if (!session) return router.push('/sign-in');
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
      setError(
        (cause as { message?: string })?.message ??
          'Could not join this session. Please try again.',
      );
    }
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + space.lg }}
    >
      <View
        style={{
          paddingHorizontal: space.xl,
          gap: space.md,
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="display">Discover</AppText>
            <AppText tone="muted">A good game is closer than you think.</AppText>
          </View>
          <IconButton
            icon="magnify"
            label={showSearch ? 'Hide search' : 'Search sessions'}
            onPress={() => {
              setShowSearch(!showSearch);
              setTab('sessions');
              setSearch('');
            }}
          />
          <IconButton
            icon="plus"
            label="Create session"
            tone="live"
            onPress={() => router.push('/run/new')}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Chip
            label="Sessions"
            icon="calendar-outline"
            selected={tab === 'sessions'}
            onPress={() => setTab('sessions')}
          />
          <Chip
            label="Moments"
            icon="image-outline"
            selected={tab === 'moments'}
            onPress={() => setTab('moments')}
          />
        </View>
        {showSearch && (
          <TextInput
            autoFocus
            value={search}
            onChangeText={setSearch}
            placeholder="Search a sport, session, or venue"
            accessibilityLabel="Search sessions"
            placeholderTextColor={colors.textFaint}
            style={{
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              minHeight: 48,
              borderRadius: radius.md,
              paddingHorizontal: space.lg,
              fontSize: 16,
            }}
          />
        )}
      </View>
      {tab === 'moments' ? (
        <MomentsFeed />
      ) : (
        <>
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: space.xl,
                paddingVertical: space.lg,
                gap: space.sm,
              }}
            >
              <Chip
                label="All"
                selected={selectedSports.length === 0}
                onPress={() => setSelectedSports([])}
              />
              {(sports.data ?? [])
                .filter((sport) => sport.is_active)
                .map((sport) => (
                  <Chip
                    key={sport.id}
                    label={sport.name}
                    icon={sportIcon(sport.slug)}
                    selected={selectedSports.includes(sport.id)}
                    onPress={() =>
                      setSelectedSports((current) =>
                        current.includes(sport.id)
                          ? current.filter((id) => id !== sport.id)
                          : [...current, sport.id],
                      )
                    }
                  />
                ))}
            </ScrollView>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={runs.isRefetching}
                tintColor={colors.live}
                onRefresh={() => {
                  void runs.refetch();
                  void attendance.refetch();
                }}
              />
            }
            contentContainerStyle={{
              paddingHorizontal: space.xl,
              paddingBottom: space.xxl,
              gap: space.lg,
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
            {runs.isPending ? (
              <>
                <Skeleton height={220} />
                <Skeleton height={220} />
              </>
            ) : runs.isError ? (
              <EmptyState
                icon="wifi-off"
                title="Could not load sessions"
                body="Check your connection and try again."
                action={<Button label="Try again" onPress={() => void runs.refetch()} />}
              />
            ) : matching.length ? (
              <>
                <AppText variant="heading">Coming up</AppText>
                {matching.map((item) => {
                  const response = responses.get(`${item.run_series_id}-${item.occurrence_date}`);
                  return (
                    <SessionCard
                      key={`${item.run_series_id}-${item.occurrence_date}`}
                      item={item}
                      response={response}
                      hosting={item.organizer_id === session?.user.id}
                      attendanceUnavailable={attendance.isError || attendance.isPending}
                      pending={
                        join.isPending &&
                        join.variables?.runSeriesId === item.run_series_id &&
                        join.variables?.occurrenceDate === item.occurrence_date
                      }
                      onRespond={(value) => void respond(item, value)}
                      onOpen={
                        response?.session_id
                          ? () => router.push(`/session/${response.session_id}`)
                          : undefined
                      }
                    />
                  );
                })}
              </>
            ) : (
              <EmptyState
                icon="basketball"
                title={
                  search || selectedSports.length
                    ? 'No matching sessions'
                    : 'Be the first to get a game going'
                }
                body={
                  search || selectedSports.length
                    ? 'Try another search or clear your sport filters.'
                    : 'Choose a place, pick a time, and invite your community to play.'
                }
                action={
                  <Button
                    label={search || selectedSports.length ? 'Clear filters' : 'Create a session'}
                    icon={search || selectedSports.length ? 'filter-remove-outline' : 'plus'}
                    onPress={() => {
                      if (search || selectedSports.length) {
                        setSearch('');
                        setSelectedSports([]);
                      } else router.push('/run/new');
                    }}
                  />
                }
              />
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}
