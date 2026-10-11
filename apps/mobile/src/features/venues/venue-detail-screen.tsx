import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { userMessage } from '@dropin/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';

import VenueMap from '../../components/map/venue-map';
import { ActionBar } from '../../components/ui/action-bar';
import { ConditionChip, EmptyState, LoadError, Skeleton, Stat } from '../../components/ui/activity';
import { Avatar } from '../../components/ui/avatar';
import { ListRow, ListSection } from '../../components/ui/list-row';
import { Notice } from '../../components/ui/notice';
import { AppText, Button, Tag } from '../../components/ui/primitives';
import type { IconName } from '../../components/ui/primitives';
import {
  CONDITION_ICON,
  CONDITION_IS_BLOCKING,
  CONDITION_LABEL,
  PULSE_LABEL,
  PULSE_TONE,
  dayLabel,
  relativeTime,
  timeOfDay,
} from '../../lib/format';
import { loadPhase } from '../../lib/load-phase';
import { uuidParam } from '../../lib/route-params';
import { useSession } from '../../providers/auth-context';
import { radius, space, usePalette, useThemeName } from '../../theme';
import { useJoinSession, useRunAttendance } from '../community/api';
import { SessionRow } from '../community/session-row';
import { usePresenceClock } from '../presence/api';
import { PresenceCard } from '../presence/presence-card';
import { useUpcomingRuns, useVenueActivity, useVenueConditions, useVenueDetail } from './api';
import type { UpcomingRun } from './api';

const SETTING_LABEL = { indoor: 'Indoor', outdoor: 'Outdoor', unknown: null } as const;

/**
 * Venue detail — "what is actually happening here, and can I join?"
 *
 * Here-now and on-the-way are shown as two separate figures and never added
 * together. A verified check-in means somebody's device confirmed they were at
 * the venue; an arrival intent means somebody tapped a button. Merging them
 * would make the stronger signal worthless.
 *
 * Checking in is the point of the screen, so it is pinned at the bottom rather
 * than left at the end of the scroll.
 */
export function VenueDetailScreen() {
  const venueId = uuidParam(useLocalSearchParams<{ venueId: string }>().venueId);
  const colors = usePalette();
  const scheme = useThemeName();
  const [directionError, setDirectionError] = useState('');
  const [joinError, setJoinError] = useState('');
  const now = usePresenceClock();
  const router = useRouter();
  const { session } = useSession();

  const venue = useVenueDetail(venueId);
  const activity = useVenueActivity(venueId);
  const conditions = useVenueConditions(venueId);
  const runs = useUpcomingRuns({ venueId, window: 'discovery', enabled: Boolean(venueId) });
  const join = useJoinSession();
  const attendance = useRunAttendance(
    (runs.data ?? []).map((run) => run.run_series_id),
    session?.user.id,
  );
  async function respond(run: UpcomingRun, response: 'going' | 'maybe') {
    if (!session) return router.push('/sign-in');
    if (join.isPending) return;
    setJoinError('');
    try {
      const id = await join.mutateAsync({
        runSeriesId: run.run_series_id,
        occurrenceDate: run.occurrence_date,
        attendance: response,
      });
      router.push(`/session/${id}`);
    } catch (cause) {
      setJoinError(userMessage(cause, 'Could not join. Please try again.'));
    }
  }

  // An id that cannot name a venue is "not found" without a request.
  const phase = venueId ? loadPhase(venue) : 'ready';

  if (phase === 'loading') {
    return (
      <View style={[styles.state, { backgroundColor: colors.background }]}>
        <Skeleton height={180} />
        <Skeleton height={36} width="70%" />
        <Skeleton height={84} />
      </View>
    );
  }

  if (phase === 'failed') {
    return (
      <View style={[styles.state, { backgroundColor: colors.background }]}>
        <LoadError
          title="Could not load this venue"
          onRetry={() => void venue.refetch()}
          retrying={venue.isFetching}
        />
      </View>
    );
  }

  if (!venue.data) {
    return (
      <View style={[styles.state, { backgroundColor: colors.background }]}>
        <EmptyState
          title="Venue not found"
          body="This place may have been removed, or the link is out of date."
          action={<Button label="Back to map" size="sm" onPress={() => router.replace('/')} />}
        />
      </View>
    );
  }

  const data = venue.data;
  const checkIns = (activity.data ?? []).filter(
    (row) => row.kind === 'check_in' && Date.parse(row.expires_at) > now,
  );
  const intents = (activity.data ?? []).filter(
    (row) => row.kind === 'heading_there' && Date.parse(row.expires_at) > now,
  );
  const liveConditions = (conditions.data ?? []).filter((row) => Date.parse(row.expires_at) > now);
  const hereNow = activity.data
    ? checkIns.reduce((total, row) => total + row.party_size, 0)
    : data.here_now;
  const headingThere = activity.data ? intents.length : data.heading_there;
  const upcoming = (runs.data ?? []).slice(0, 4);
  const nextRun = upcoming[0];
  const sportNames = data.sport_names ?? [];
  const sportName = (slug: string) => sportNames[(data.sport_slugs ?? []).indexOf(slug)] ?? slug;

  function openDirections() {
    const label = encodeURIComponent(data.name);
    const url = Platform.select({
      ios: `maps://?q=${label}&ll=${data.latitude},${data.longitude}`,
      android: `geo:${data.latitude},${data.longitude}?q=${label}`,
      default: `https://www.openstreetmap.org/?mlat=${data.latitude}&mlon=${data.longitude}#map=17/${data.latitude}/${data.longitude}`,
    });
    setDirectionError('');
    void Linking.openURL(url).catch(() =>
      setDirectionError('Could not open directions. Please try again.'),
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* A merged venue resolves to its survivor rather than 404ing. Saying so
            avoids the confusion of tapping one name and landing on another. */}
        {data.was_merged && (
          <Notice
            tone="info"
            message={`This venue was merged into ${data.name}, which is the one people check into.`}
          />
        )}

        <View style={styles.map}>
          <VenueMap
            colorScheme={scheme}
            region={{
              latitude: data.latitude,
              longitude: data.longitude,
              latitudeDelta: 0.012,
              longitudeDelta: 0.012,
            }}
            markers={[
              {
                id: data.venue_id,
                latitude: data.latitude,
                longitude: data.longitude,
                label: data.name,
                sportSlug: data.sport_slugs?.[0] ?? null,
                count: hereNow,
                isLive: hereNow > 0,
                isPending: headingThere > 0,
              },
            ]}
          />
        </View>

        <View style={styles.identity}>
          <View accessibilityRole="header">
            <AppText variant="title">{data.name}</AppText>
          </View>
          <AppText tone="muted">
            {[SETTING_LABEL[data.indoor_state], sportNames.join(', ')].filter(Boolean).join(' · ')}
          </AppText>
          {data.address_text && (
            <AppText variant="caption" tone="muted">
              {data.address_text}
            </AppText>
          )}
          {data.verification_state === 'admin_verified' && (
            <View style={styles.inline}>
              <MaterialCommunityIcons name="check-decagram" size={15} color={colors.textMuted} />
              <AppText variant="caption" tone="muted">
                Checked by Drop In
              </AppText>
            </View>
          )}
        </View>

        <View style={styles.scoreboard}>
          <View style={[styles.board, { borderColor: colors.border }]}>
            {/* With a next game to show, the two counts take only the room they
                need so the time fits on one line beside them. */}
            <View style={nextRun ? styles.count : styles.stat}>
              <Stat value={hereNow} label="Here now" tone={hereNow > 0 ? 'live' : 'quiet'} />
            </View>
            <View
              style={[
                nextRun ? styles.count : styles.stat,
                styles.statDivided,
                { borderLeftColor: colors.border },
              ]}
            >
              <Stat
                value={headingThere}
                label="On the way"
                tone={headingThere > 0 ? 'soon' : 'quiet'}
              />
            </View>
            {nextRun && (
              <View style={[styles.stat, styles.statDivided, { borderLeftColor: colors.border }]}>
                <Stat
                  value={timeOfDay(nextRun.starts_at)}
                  label={`Next · ${dayLabel(nextRun.starts_at)}`}
                />
              </View>
            )}
          </View>
          {hereNow > 0 && (
            <AppText variant="micro" tone="faint">
              Updated {relativeTime(data.last_activity_at).toLowerCase()}
            </AppText>
          )}
          {data.pulse && <Tag label={PULSE_LABEL[data.pulse]} tone={PULSE_TONE[data.pulse]} />}
          {liveConditions.length > 0 && (
            <View style={styles.conditions}>
              {liveConditions.map((condition) => (
                <ConditionChip
                  key={condition.id}
                  icon={CONDITION_ICON[condition.kind] as IconName}
                  label={`${CONDITION_LABEL[condition.kind]} · ${relativeTime(condition.created_at).toLowerCase()}`}
                  blocking={CONDITION_IS_BLOCKING[condition.kind]}
                />
              ))}
            </View>
          )}
        </View>

        <PresenceCard venueId={data.venue_id} />

        {checkIns.length > 0 && (
          <View>
            <AppText variant="label" tone="muted">
              Here now
            </AppText>
            {checkIns.map((row, index) => (
              <View
                key={`${row.display_name}-${index}`}
                style={[styles.player, { borderBottomColor: colors.border }]}
              >
                <Avatar name={row.display_name} size={36} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">
                    {row.display_name}
                    {row.party_size > 1 && <AppText tone="muted"> +{row.party_size - 1}</AppText>}
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    {row.note ??
                      `${sportName(row.sport_slug)} · ${relativeTime(row.started_at).toLowerCase()}`}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        )}

        {intents.length > 0 && (
          <View>
            <AppText variant="label" tone="muted">
              On the way
            </AppText>
            {intents.map((row, index) => (
              <View key={index} style={[styles.player, { borderBottomColor: colors.border }]}>
                <Avatar name={row.display_name} size={36} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{row.display_name}</AppText>
                  <AppText variant="caption" tone="muted">
                    {sportName(row.sport_slug)}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        )}

        {upcoming.length > 0 && (
          <View>
            <AppText variant="label" tone="muted">
              Coming up here
            </AppText>
            {!!joinError && <Notice tone="error" message={joinError} />}
            {upcoming.map((run) => {
              const response = attendance.data?.find(
                (row) =>
                  row.run_series_id === run.run_series_id &&
                  row.occurrence_date === run.occurrence_date,
              );
              return (
                <SessionRow
                  key={`${run.run_series_id}-${run.occurrence_date}`}
                  item={run}
                  response={response}
                  hosting={run.organizer_id === session?.user.id}
                  pending={join.isPending && join.variables?.runSeriesId === run.run_series_id}
                  attendanceUnavailable={loadPhase(attendance) !== 'ready'}
                  onOpen={
                    response?.session_id
                      ? () => router.push(`/session/${response.session_id}`)
                      : undefined
                  }
                  onRespond={(value) => void respond(run, value)}
                />
              );
            })}
          </View>
        )}

        <ListSection>
          <ListRow icon="directions" title="Directions" external onPress={openDirections} />
          <ListRow
            icon="calendar-plus"
            title="Create a session here"
            onPress={() =>
              router.push({ pathname: '/run/new', params: { venueId: data.venue_id } })
            }
          />
        </ListSection>
        {!!directionError && <Notice tone="error" message={directionError} />}
      </ScrollView>

      <ActionBar>
        <Button
          label="Check in here"
          icon="map-marker-check"
          tone="live"
          style={styles.action}
          onPress={() =>
            router.push({ pathname: '/check-in/[venueId]', params: { venueId: data.venue_id } })
          }
        />
        <Button
          label="I'm on my way"
          variant="outline"
          style={styles.action}
          onPress={() =>
            router.push({
              pathname: '/check-in/[venueId]',
              params: { venueId: data.venue_id, arrival: 'true' },
            })
          }
        />
      </ActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  state: { flex: 1, padding: space.lg, gap: space.md },
  content: {
    padding: space.lg,
    paddingBottom: space.xxl,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    gap: space.xl,
  },
  map: { height: 180, borderRadius: radius.lg, overflow: 'hidden' },
  identity: { gap: space.xs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 },
  scoreboard: { gap: space.sm },
  board: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1 },
  stat: { flex: 1, paddingVertical: space.md },
  count: { paddingVertical: space.md, paddingRight: space.lg },
  statDivided: { borderLeftWidth: 1, paddingLeft: space.lg },
  conditions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  action: { flex: 1 },
});
