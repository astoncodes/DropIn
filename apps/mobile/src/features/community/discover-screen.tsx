import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, LoadError, Skeleton } from '../../components/ui/activity';
import { Button, Chip, IconButton, sportIcon } from '../../components/ui/primitives';
import { Notice } from '../../components/ui/notice';
import { ScreenHeader } from '../../components/ui/screen-header';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { TextField } from '../../components/ui/text-field';
import { useSession } from '../../providers/auth-context';
import { space, usePalette } from '../../theme';
import { useUpcomingRuns, useSports } from '../venues/api';
import type { UpcomingRun } from '../venues/api';
import { useJoinSession, useRunAttendance } from './api';
import { MomentsFeed } from './feed-screen';
import { SessionRow } from './session-row';
import { userMessage } from '@dropin/shared';
import { loadPhase } from '../../lib/load-phase';

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
  const runsPhase = loadPhase(runs);
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
      setError(userMessage(cause, 'Could not join this session. Please try again.'));
    }
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + space.md }}
    >
      <View
        style={{
          paddingHorizontal: space.lg,
          gap: space.md,
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
        }}
      >
        <ScreenHeader
          title="Discover"
          actions={
            <>
              <IconButton
                icon={showSearch ? 'close' : 'magnify'}
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
                filled
                onPress={() => router.push('/run/new')}
              />
            </>
          }
        />
        <SegmentedControl
          segments={[
            { value: 'sessions', label: 'Sessions' },
            { value: 'moments', label: 'Moments' },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityLabel="Discover sections"
        />
        {showSearch && (
          <TextField
            autoFocus
            label="Search sessions"
            labelHidden
            value={search}
            onChangeText={setSearch}
            placeholder="Search a sport, session, or venue"
            returnKeyType="search"
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
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
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
              paddingHorizontal: space.lg,
              paddingBottom: space.xxl,
              width: '100%',
              maxWidth: 760,
              alignSelf: 'center',
            }}
          >
            {!!error && <Notice tone="error" message={error} />}
            {runsPhase === 'loading' ? (
              <View style={{ gap: space.md, paddingTop: space.md }}>
                <Skeleton height={72} />
                <Skeleton height={72} />
                <Skeleton height={72} />
              </View>
            ) : runsPhase === 'failed' ? (
              <LoadError
                title="Could not load sessions"
                onRetry={() => void runs.refetch()}
                retrying={runs.isFetching}
              />
            ) : matching.length ? (
              <>
                {matching.map((item) => {
                  const response = responses.get(`${item.run_series_id}-${item.occurrence_date}`);
                  return (
                    <SessionRow
                      key={`${item.run_series_id}-${item.occurrence_date}`}
                      item={item}
                      response={response}
                      showDescription
                      hosting={item.organizer_id === session?.user.id}
                      attendanceUnavailable={loadPhase(attendance) !== 'ready'}
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
                title={search || selectedSports.length ? 'No matching sessions' : 'No sessions yet'}
                body={
                  search || selectedSports.length
                    ? 'Try another search or clear your sport filters.'
                    : 'Nothing is scheduled in the next two weeks. Start one and it shows up here.'
                }
                action={
                  <Button
                    label={search || selectedSports.length ? 'Clear filters' : 'Create a session'}
                    size="sm"
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
