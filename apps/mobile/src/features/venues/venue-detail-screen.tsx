import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VenueMap from '../../components/map/venue-map';
import { SportBadge } from '../../components/ui/brand';
import { ConditionChip, EmptyState, ScoreStat, Skeleton } from '../../components/ui/activity';
import { AppText, Button, Chip, sportIcon } from '../../components/ui/primitives';
import { useUpcomingRuns, useVenueActivity, useVenueConditions, useVenueDetail } from './api';
import {
  CONDITION_ICON,
  CONDITION_IS_BLOCKING,
  CONDITION_LABEL,
  PULSE_LABEL,
  PULSE_TONE,
  relativeTime,
} from '../../lib/format';
import { useSession } from '../../providers/auth-context';
import { elevation, radius, space, usePalette, useThemeName } from '../../theme';
import { PresenceCard } from '../presence/presence-card';
import { usePresenceClock } from '../presence/api';
import { SessionCard } from '../community/session-card';
import { useJoinSession, useRunAttendance } from '../community/api';
import type { UpcomingRun } from './api';
import type { IconName } from '../../components/ui/primitives';

/**
 * Venue detail — "what is actually happening here, and can I join?"
 *
 * Here-now and heading-there are shown as two separate figures and never added
 * together. A verified check-in means somebody's device confirmed they were at
 * the venue; an arrival intent means somebody tapped a button. Merging them
 * would make the stronger signal worthless.
 */
export function VenueDetailScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const colors = usePalette();
  const scheme = useThemeName();
  const [directionError, setDirectionError] = useState('');
  const [joinError, setJoinError] = useState('');
  const now = usePresenceClock();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();

  const venue = useVenueDetail(venueId);
  const activity = useVenueActivity(venueId);
  const conditions = useVenueConditions(venueId);
  const runs = useUpcomingRuns({ venueId, window: 'discovery' });
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
      setJoinError((cause as { message?: string })?.message ?? 'Could not join. Please try again.');
    }
  }

  if (venue.isPending) {
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.background, padding: space.lg, gap: space.md }}
      >
        <Skeleton height={32} width="70%" />
        <Skeleton height={110} />
        <Skeleton height={80} />
      </View>
    );
  }

  if (venue.isError || !venue.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
        <EmptyState
          icon="map-marker-question-outline"
          title="Venue not found"
          body="This place may have been removed, or the link is out of date."
          action={
            <Button
              label="Back to map"
              tone="neutral"
              variant="soft"
              onPress={() => router.replace('/')}
            />
          }
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
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        padding: space.lg,
        paddingBottom: insets.bottom + space.xxl,
        width: '100%',
        maxWidth: 760,
        alignSelf: 'center',
        gap: space.lg,
      }}
    >
      {/* A merged venue resolves to its survivor rather than 404ing. Saying so
          avoids the confusion of tapping one name and landing on another. */}
      {data.was_merged && (
        <View style={[styles.notice, { backgroundColor: colors.infoSoft }]}>
          <AppText variant="caption" style={{ color: colors.info }}>
            This venue was merged into {data.name}, which is the one people check into.
          </AppText>
        </View>
      )}

      <View style={{ height: 220, borderRadius: radius.xl, overflow: 'hidden' }}>
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
      <View style={{ gap: space.sm }}>
        <SportBadge slug={data.sport_slugs?.[0]} />
        <AppText variant="display">{data.name}</AppText>

        <View style={styles.metaRow}>
          <MaterialCommunityIcons
            name={data.indoor_state === 'indoor' ? 'home-variant' : 'weather-sunny'}
            size={14}
            color={colors.textMuted}
          />
          <AppText variant="caption" tone="muted">
            {data.indoor_state === 'indoor'
              ? 'Indoor'
              : data.indoor_state === 'outdoor'
                ? 'Outdoor'
                : 'Indoor/outdoor unknown'}
          </AppText>

          {data.verification_state === 'admin_verified' && (
            <>
              <View style={[styles.dot, { backgroundColor: colors.textFaint }]} />
              <MaterialCommunityIcons name="check-decagram" size={14} color={colors.live} />
              <AppText variant="caption" style={{ color: colors.liveText }}>
                Verified
              </AppText>
            </>
          )}
        </View>

        {data.address_text && (
          <AppText variant="caption" tone="muted">
            {data.address_text}
          </AppText>
        )}

        <View style={styles.chipRow}>
          {(data.sport_slugs ?? []).map((slug, index) => (
            <Chip
              key={slug}
              label={(data.sport_names ?? [])[index] ?? slug}
              icon={sportIcon(slug) as IconName}
            />
          ))}
        </View>
      </View>

      <PresenceCard venueId={data.venue_id} />
      {/* --- Activity --- */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
          elevation.card,
        ]}
      >
        <View style={styles.statRow}>
          <ScoreStat value={hereNow} label="Here now" tone={hereNow > 0 ? 'live' : 'quiet'} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <ScoreStat
            value={headingThere}
            label="Heading there"
            tone={headingThere > 0 ? 'soon' : 'quiet'}
          />
        </View>

        {data.pulse && (
          <Chip
            label={PULSE_LABEL[data.pulse]}
            tone={PULSE_TONE[data.pulse]}
            icon="bullhorn-outline"
          />
        )}

        <AppText variant="micro" tone="faint">
          {hereNow > 0
            ? `Updated ${relativeTime(data.last_activity_at).toLowerCase()}`
            : 'No recent activity'}
        </AppText>

        {checkIns.length > 0 && (
          <View style={{ gap: space.sm }}>
            {checkIns.map((row, index) => (
              <View key={`${row.display_name}-${index}`} style={styles.playerRow}>
                <View style={[styles.avatar, { backgroundColor: colors.liveSoft }]}>
                  <AppText variant="caption" style={{ color: colors.liveText, fontWeight: '700' }}>
                    {row.display_name.slice(0, 1).toUpperCase()}
                  </AppText>
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">
                    {row.display_name}
                    {row.party_size > 1 ? ` +${row.party_size - 1}` : ''}
                  </AppText>
                  {row.note ? (
                    <AppText variant="caption" tone="muted">
                      {row.note}
                    </AppText>
                  ) : (
                    <AppText variant="caption" tone="muted">
                      {row.sport_slug} · {relativeTime(row.started_at).toLowerCase()}
                    </AppText>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {intents.length > 0 && (
          <View style={[styles.intentBlock, { borderColor: colors.border }]}>
            <AppText variant="micro" tone="soon" style={{ textTransform: 'uppercase' }}>
              On the way
            </AppText>
            {intents.map((row, index) => (
              <AppText key={index} variant="caption" tone="muted">
                {row.display_name} · {row.sport_slug}
              </AppText>
            ))}
          </View>
        )}
      </View>

      {liveConditions.length > 0 && (
        <View style={{ gap: space.sm }}>
          <AppText variant="heading">Conditions</AppText>
          <View style={styles.chipRow}>
            {liveConditions.map((condition) => (
              <ConditionChip
                key={condition.id}
                icon={CONDITION_ICON[condition.kind] as IconName}
                label={`${CONDITION_LABEL[condition.kind]} · ${relativeTime(condition.created_at).toLowerCase()}`}
                blocking={CONDITION_IS_BLOCKING[condition.kind]}
              />
            ))}
          </View>
        </View>
      )}

      {(runs.data ?? []).length > 0 && (
        <View style={{ gap: space.sm }}>
          <AppText variant="heading">Coming up here</AppText>
          {!!joinError && <AppText tone="alert">{joinError}</AppText>}
          {(runs.data ?? []).slice(0, 4).map((run) => {
            const response = attendance.data?.find(
              (row) =>
                row.run_series_id === run.run_series_id &&
                row.occurrence_date === run.occurrence_date,
            );
            return (
              <SessionCard
                key={`${run.run_series_id}-${run.occurrence_date}`}
                item={run}
                response={response}
                pending={join.isPending && join.variables?.runSeriesId === run.run_series_id}
                attendanceUnavailable={attendance.isError}
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

      <View style={{ gap: space.sm }}>
        <Button
          label="Check in here"
          icon="map-marker-check"
          onPress={() =>
            router.push({ pathname: '/check-in/[venueId]', params: { venueId: data.venue_id } })
          }
        />
        <Button
          label="I'm on my way"
          icon="walk"
          variant="outline"
          onPress={() =>
            router.push({
              pathname: '/check-in/[venueId]',
              params: { venueId: data.venue_id, arrival: 'true' },
            })
          }
        />
        <Button
          label="Create a session here"
          icon="calendar-plus"
          onPress={() => router.push({ pathname: '/run/new', params: { venueId } })}
        />
        {!session && (
          <Button
            label="Sign in to join"
            icon="login"
            variant="outline"
            tone="neutral"
            onPress={() => router.push('/sign-in')}
          />
        )}
        {!!directionError && <AppText tone="alert">{directionError}</AppText>}

        <Button
          label="Directions"
          icon="directions"
          tone="neutral"
          variant="soft"
          onPress={openDirections}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.md,
  },
  notice: { borderRadius: radius.lg, padding: space.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: space.xl },
  divider: { width: StyleSheet.hairlineWidth, height: 36 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intentBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, gap: 2 },
  dot: { width: 3, height: 3, borderRadius: 3 },
});
