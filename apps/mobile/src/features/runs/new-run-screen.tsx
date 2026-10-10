import { UserFacingError, userMessage } from '@dropin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import VenueMap from '../../components/map/venue-map';
import type { MapCoordinate, MapRegion } from '../../components/map/types';
import { Screen } from '../../components/screen';
import { EmptyState } from '../../components/ui/activity';
import { ListRow, ListSection } from '../../components/ui/list-row';
import { Notice } from '../../components/ui/notice';
import { AppText, Button, Chip, sportIcon } from '../../components/ui/primitives';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { TextField } from '../../components/ui/text-field';
import { combineLoadPhases, loadPhase } from '../../lib/load-phase';
import { uuidParam } from '../../lib/route-params';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/auth-context';
import { radius, space, useThemeName } from '../../theme';
import { PlaceSearch } from '../geocoding/place-search';
import { useRequiredLocation } from '../location/required-location';
import { useDeviceLocation } from '../location/use-device-location';
import { useSports, useVenueDetail } from '../venues/api';
import { SportsUnavailableNotice } from '../venues/sports-unavailable-notice';
import { SessionTimeFields, sessionEnd } from './session-time-fields';
import type { SessionTimes } from './session-time-fields';
import { defaultSessionStart } from './session-times';

const REPEATS = [
  { weeks: 1, label: 'Just once' },
  { weeks: 4, label: '4 weeks' },
  { weeks: 8, label: '8 weeks' },
  { weeks: 12, label: '12 weeks' },
] as const;

/**
 * Create a session: what, when, where — in that order, because that is the
 * order somebody thinks of it in. Everything that can be tapped is tapped;
 * the only typing is the name of the session and of the meeting spot.
 */
export function NewRunScreen() {
  const initialLocation = useRequiredLocation();
  const initialVenueId = uuidParam(useLocalSearchParams<{ venueId?: string }>().venueId);
  const [selectedVenueId, setSelectedVenueId] = useState(initialVenueId);
  const [venueSearch, setVenueSearch] = useState('');
  const [locationMode, setLocationMode] = useState<'pin' | 'venue'>(
    initialVenueId ? 'venue' : 'pin',
  );
  const venueId = locationMode === 'venue' ? selectedVenueId : undefined;
  const [pin, setPin] = useState<MapCoordinate | null>(null);
  const [mapRegion, setMapRegion] = useState<MapRegion>({
    ...initialLocation,
    latitudeDelta: 0.025,
    longitudeDelta: 0.025,
  });
  const [locationName, setLocationName] = useState('');
  const [pinTimezone, setPinTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );
  const [editingTimezone, setEditingTimezone] = useState(false);
  const deviceLocation = useDeviceLocation();
  const scheme = useThemeName();
  function movePin(point: MapCoordinate) {
    setPin(point);
    setMapRegion((current) => ({ ...current, ...point }));
  }
  const router = useRouter();
  const client = useQueryClient();
  const { session } = useSession();
  const venueOptions = useQuery({
    queryKey: ['session-venues', venueSearch.trim()],
    enabled: Boolean(session) && locationMode === 'venue' && !venueId,
    queryFn: async () => {
      let query = supabase
        .from('venues')
        .select('id,name,address_text,regions!inner(is_published)')
        .eq('status', 'active')
        .eq('regions.is_published', true)
        .order('name')
        .limit(50);
      if (venueSearch.trim()) query = query.ilike('name', `%${venueSearch.trim()}%`);
      const result = await query;
      if (result.error) throw result.error;
      return result.data;
    },
  });
  const venue = useVenueDetail(venueId);
  const sports = useSports();
  const zone = useQuery({
    queryKey: ['venue-timezone', venueId],
    enabled: Boolean(venueId),
    queryFn: async () => {
      const place = await supabase.from('venues').select('region_id').eq('id', venueId!).single();
      if (place.error) throw place.error;
      const region = await supabase
        .from('regions')
        .select('timezone')
        .eq('id', place.data.region_id)
        .single();
      if (region.error) throw region.error;
      return region.data.timezone;
    },
  });
  // A listed venue's sessions are timed in its region's zone; a pin's in the
  // zone its organiser names, which starts as the device's.
  const timezone = (venueId ? zone.data : undefined) ?? pinTimezone;
  const [title, setTitle] = useState('');
  const [times, setTimes] = useState<SessionTimes>(() => ({
    ...defaultSessionStart(new Date(), pinTimezone),
    minutes: 60,
  }));
  const [weeks, setWeeks] = useState(1);
  const [sportId, setSportId] = useState<number>();
  const create = useMutation({
    mutationFn: async () => {
      const end = sessionEnd(times);
      if (!end)
        throw new UserFacingError(
          'That runs past midnight. Choose an earlier start or a shorter length.',
        );
      const common = {
        p_sport_id: sportId!,
        p_starts_on: times.date,
        p_start_time: times.start,
        p_end_time: end,
        p_weeks: weeks,
        p_title: title.trim(),
      };
      if (locationMode === 'pin' && !pin)
        throw new UserFacingError('Tap the map to choose the meeting spot.');
      const result =
        locationMode === 'pin'
          ? await supabase.rpc('create_run_at_pin', {
              ...common,
              p_lat: pin!.latitude,
              p_lon: pin!.longitude,
              p_location_name: locationName.trim(),
              p_timezone: pinTimezone.trim(),
            })
          : await supabase.rpc('create_run', { ...common, p_venue_id: venueId! });
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: async (id) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['upcoming-runs'] }),
        client.invalidateQueries({ queryKey: ['joined-sessions'] }),
        client.invalidateQueries({ queryKey: ['public-session-pins'] }),
      ]);
      router.replace(`/session/${id}`);
    },
  });

  if (!session)
    return (
      <Screen insetTop={false}>
        <EmptyState
          title="Sign in to organize"
          body="Sessions belong to the player who starts them, so you need an account first."
          action={<Button label="Sign in" size="sm" onPress={() => router.push('/sign-in')} />}
        />
      </Screen>
    );

  // The form needs both the venue and the time zone its times are entered in.
  const venuePhase = venueId ? combineLoadPhases(loadPhase(venue), loadPhase(zone)) : 'ready';
  const venueOptionsPhase = loadPhase(venueOptions);
  const available = (sports.data ?? []).filter(
    (sport) => sport.is_active && (!venueId || venue.data?.sport_slugs.includes(sport.slug)),
  );
  const placed =
    locationMode === 'pin'
      ? pin !== null && locationName.trim().length >= 2
      : venuePhase === 'ready' && Boolean(venue.data);

  return (
    <Screen insetTop={false}>
      <TextField
        label="Session name"
        value={title}
        onChangeText={setTitle}
        placeholder="Tuesday basketball"
        maxLength={80}
      />

      <View style={styles.field}>
        <AppText variant="caption" style={styles.label}>
          Sport
        </AppText>
        <SportsUnavailableNotice sports={sports} />
        <View style={styles.wrap}>
          {available.map((sport) => (
            <Chip
              key={sport.id}
              label={sport.name}
              icon={sportIcon(sport.slug)}
              selected={sport.id === sportId}
              onPress={() => setSportId(sport.id)}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="label" tone="muted">
          When
        </AppText>
        <SessionTimeFields timezone={timezone} value={times} onChange={setTimes} />
        <View style={styles.field}>
          <AppText variant="caption" style={styles.label}>
            Repeats weekly for
          </AppText>
          <View style={styles.wrap}>
            {REPEATS.map((repeat) => (
              <Chip
                key={repeat.weeks}
                label={repeat.label}
                selected={weeks === repeat.weeks}
                onPress={() => setWeeks(repeat.weeks)}
              />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="label" tone="muted">
          Where
        </AppText>
        <SegmentedControl
          segments={[
            { value: 'pin', label: 'Drop a pin' },
            { value: 'venue', label: 'Listed venue' },
          ]}
          value={locationMode}
          onChange={setLocationMode}
          accessibilityLabel="Where the session meets"
        />

        {locationMode === 'pin' ? (
          <>
            <PlaceSearch
              onSelect={(place) => {
                movePin({ latitude: place.latitude, longitude: place.longitude });
                setLocationName(place.label.slice(0, 120));
              }}
            />
            <View style={styles.map}>
              <VenueMap
                region={mapRegion}
                onRegionChange={setMapRegion}
                colorScheme={scheme}
                onPressCoordinate={movePin}
                onMarkerDragEnd={(_, point) => movePin(point)}
                userLocation={
                  deviceLocation.state.status === 'granted' ? deviceLocation.state.coords : null
                }
                markers={
                  pin
                    ? [
                        {
                          id: 'session-pin',
                          ...pin,
                          label: locationName || 'Session meeting spot',
                          sportSlug:
                            sports.data?.find((sport) => sport.id === sportId)?.slug ?? null,
                          count: 0,
                          isLive: false,
                          isPending: true,
                          kind: 'session' as const,
                          draggable: true,
                          selected: true,
                        },
                      ]
                    : []
                }
              />
            </View>
            <View style={styles.mapFooter}>
              <AppText variant="caption" tone="muted" style={styles.fill}>
                {pin
                  ? `Meeting pin: ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}. Drag to adjust.`
                  : 'Tap the map to place the meeting pin.'}
              </AppText>
              <Button
                label="Use my location"
                icon="crosshairs-gps"
                size="sm"
                variant="ghost"
                loading={deviceLocation.state.status === 'requesting'}
                onPress={() => {
                  void deviceLocation.request().then((point) => {
                    if (point) movePin(point);
                  });
                }}
              />
            </View>
            {deviceLocation.state.status === 'denied' && (
              <Notice
                tone="warning"
                message="Enable location services and allow access to use your location."
              />
            )}
            {deviceLocation.state.status === 'unavailable' && (
              <Notice tone="warning" message={deviceLocation.state.message} />
            )}
            <TextField
              label="Meeting spot name"
              placeholder="East side of the park"
              hint="Everyone sees this name on the map."
              value={locationName}
              onChangeText={setLocationName}
              maxLength={120}
            />
            {editingTimezone ? (
              <TextField
                label="Time zone"
                accessibilityLabel="Session time zone"
                hint="Where the session happens, for example America/Halifax."
                value={pinTimezone}
                onChangeText={setPinTimezone}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="America/Halifax"
              />
            ) : (
              <Button
                label="Change time zone"
                size="sm"
                variant="ghost"
                style={styles.start}
                onPress={() => setEditingTimezone(true)}
              />
            )}
          </>
        ) : !venueId ? (
          <>
            <TextField
              label="Search venues"
              value={venueSearch}
              onChangeText={setVenueSearch}
              placeholder="Court, gym or park name"
              autoCorrect={false}
            />
            {venueOptionsPhase === 'loading' ? (
              <AppText tone="muted">Loading venues…</AppText>
            ) : venueOptionsPhase === 'failed' ? (
              <Notice
                tone="error"
                message="Could not load venues. Check your connection and try again."
                action={
                  <Button
                    label="Try again"
                    size="sm"
                    variant="outline"
                    loading={venueOptions.isFetching}
                    onPress={() => void venueOptions.refetch()}
                  />
                }
              />
            ) : venueOptions.data?.length ? (
              <ListSection>
                {venueOptions.data.map((place) => (
                  <ListRow
                    key={place.id}
                    title={place.name}
                    subtitle={place.address_text ?? undefined}
                    onPress={() => setSelectedVenueId(place.id)}
                  />
                ))}
              </ListSection>
            ) : (
              <AppText tone="muted">
                {venueSearch.trim()
                  ? 'No venue matches that name.'
                  : 'No venues are listed yet. Drop a pin to meet anywhere.'}
              </AppText>
            )}
            <Button
              label="Add a venue"
              icon="map-marker-plus-outline"
              size="sm"
              variant="ghost"
              style={styles.start}
              onPress={() => router.push('/venue-submission/new')}
            />
          </>
        ) : venuePhase === 'loading' ? (
          <AppText tone="muted">Loading venue…</AppText>
        ) : venuePhase === 'failed' ? (
          <Notice
            tone="error"
            message="Could not load this venue. Check your connection and try again."
            action={
              <Button
                label="Try again"
                size="sm"
                variant="outline"
                loading={venue.isFetching || zone.isFetching}
                onPress={() => {
                  void venue.refetch();
                  void zone.refetch();
                }}
              />
            }
          />
        ) : (
          <ListSection>
            <ListRow
              icon="map-marker-outline"
              title={venue.data?.name ?? 'This venue is unavailable'}
              subtitle={venue.data?.address_text ?? undefined}
              trailing={
                <Button
                  label="Change"
                  size="sm"
                  variant="ghost"
                  onPress={() => setSelectedVenueId(undefined)}
                />
              }
            />
          </ListSection>
        )}
      </View>

      {create.isError && (
        <Notice
          tone="error"
          message={userMessage(create.error, 'Could not create this session. Try again.')}
        />
      )}
      <Button
        label="Create session and open chat"
        loading={create.isPending}
        disabled={!sportId || title.trim().length < 2 || !placed || !sessionEnd(times)}
        onPress={() => create.mutate()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.lg, paddingTop: space.lg },
  field: { gap: space.sm },
  label: { fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  map: { height: 240, borderRadius: radius.lg, overflow: 'hidden' },
  mapFooter: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  fill: { flex: 1 },
  start: { alignSelf: 'flex-start' },
});
