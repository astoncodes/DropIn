import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Body, Screen, Title } from '../../components/screen';
import { AppText, Button, Chip } from '../../components/ui/primitives';
import { useSports, useVenueDetail } from '../venues/api';
import { useRequiredLocation } from '../location/required-location';
import VenueMap from '../../components/map/venue-map';
import type { MapCoordinate, MapRegion } from '../../components/map/types';
import { PlaceSearch } from '../geocoding/place-search';
import { useDeviceLocation } from '../location/use-device-location';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/auth-context';
import { radius, space, usePalette, useThemeName } from '../../theme';
import { UserFacingError, userMessage } from '../../lib/errors';

export function NewRunScreen() {
  const initialLocation = useRequiredLocation();
  const { venueId: initialVenueId } = useLocalSearchParams<{ venueId?: string }>();
  const [selectedVenueId, setSelectedVenueId] = useState<string>();
  const [venueSearch, setVenueSearch] = useState('');
  const [locationMode, setLocationMode] = useState<'pin' | 'venue'>(
    initialVenueId ? 'venue' : 'pin',
  );
  const venueId = locationMode === 'venue' ? (selectedVenueId ?? initialVenueId) : undefined;
  const [pin, setPin] = useState<MapCoordinate | null>(null);
  const [mapRegion, setMapRegion] = useState<MapRegion>({
    ...initialLocation,
    latitudeDelta: 0.025,
    longitudeDelta: 0.025,
  });
  const [locationName, setLocationName] = useState('');
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );
  const deviceLocation = useDeviceLocation();
  const scheme = useThemeName();
  function movePin(point: MapCoordinate) {
    setPin(point);
    setMapRegion((current) => ({ ...current, ...point }));
  }
  const router = useRouter();
  const client = useQueryClient();
  const colors = usePalette();
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
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('19:00');
  const [end, setEnd] = useState('20:00');
  const [weeks, setWeeks] = useState(1);
  const [sportId, setSportId] = useState<number>();
  const create = useMutation({
    mutationFn: async () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new UserFacingError('Enter a date as YYYY-MM-DD.');
      if (![start, end].every((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value))) {
        throw new UserFacingError('Enter times as HH:MM using the 24-hour clock.');
      }
      const common = {
        p_sport_id: sportId!,
        p_starts_on: date,
        p_start_time: start,
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
              p_timezone: timezone.trim(),
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
      <Screen>
        <Title>Sign in to organize</Title>
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  if (locationMode === 'venue' && !venueId)
    return (
      <Screen>
        <Title>Create session</Title>
        <Body>Choose an existing venue or drop your own session pin.</Body>
        <Button
          label="Drop a pin instead"
          icon="map-marker-plus-outline"
          onPress={() => setLocationMode('pin')}
        />
        <TextInput
          value={venueSearch}
          onChangeText={setVenueSearch}
          accessibilityLabel="Search venues"
          placeholder="Search venues"
          autoCorrect={false}
          placeholderTextColor={colors.textFaint}
          style={{
            color: colors.text,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            padding: space.md,
          }}
        />
        {venueOptions.isPending ? (
          <Body>Loading venues…</Body>
        ) : venueOptions.isError ? (
          <>
            <AppText tone="alert">
              {userMessage(venueOptions.error, 'Could not load venues. Try again.')}
            </AppText>
            <Button label="Try again" onPress={() => void venueOptions.refetch()} />
          </>
        ) : venueOptions.data?.length ? (
          venueOptions.data.map((place) => (
            <View key={place.id} style={{ gap: space.xs }}>
              <Button
                label={place.name}
                tone="neutral"
                variant="outline"
                onPress={() => setSelectedVenueId(place.id)}
              />
              {place.address_text && <Body>{place.address_text}</Body>}
            </View>
          ))
        ) : (
          <Body>
            {venueSearch.trim()
              ? 'No matching venues. Try another name.'
              : 'No saved venues yet. Drop a pin to create your session immediately.'}
          </Body>
        )}
        <Button
          label="Add a venue"
          icon="map-marker-plus-outline"
          tone="neutral"
          variant="soft"
          onPress={() => router.push('/venue-submission/new')}
        />
      </Screen>
    );
  if (locationMode === 'venue' && (venue.isPending || zone.isPending))
    return (
      <Screen>
        <Body>Loading venue…</Body>
      </Screen>
    );
  if (locationMode === 'venue' && (!venue.data || zone.isError))
    return (
      <Screen>
        <Body>Couldn’t load the venue. Go back and try again.</Body>
      </Screen>
    );
  const available = (sports.data ?? []).filter(
    (sport) =>
      sport.is_active && (locationMode === 'pin' || venue.data?.sport_slugs.includes(sport.slug)),
  );
  const fields = [
    {
      label: 'Session title',
      value: title,
      change: setTitle,
      placeholder: 'Tuesday basketball',
      max: 80,
    },
    {
      label: 'First date (YYYY-MM-DD)',
      value: date,
      change: setDate,
      placeholder: '2026-09-15',
      max: 10,
    },
    { label: 'Start time (24-hour)', value: start, change: setStart, placeholder: '19:00', max: 5 },
    { label: 'End time (24-hour)', value: end, change: setEnd, placeholder: '20:00', max: 5 },
  ];
  return (
    <Screen>
      <Title>Create session</Title>
      {locationMode === 'pin' ? (
        <>
          <Body>Search for a location or drop a pin for this session.</Body>
          <PlaceSearch
            onSelect={(place) => {
              movePin({ latitude: place.latitude, longitude: place.longitude });
              setLocationName(place.label.slice(0, 120));
            }}
          />
          <TextInput
            accessibilityLabel="Meeting spot name"
            placeholder="Meeting spot, e.g. east side of the park"
            value={locationName}
            onChangeText={setLocationName}
            maxLength={120}
            placeholderTextColor={colors.textFaint}
            style={{
              color: colors.text,
              backgroundColor: colors.surface,
              padding: space.md,
              borderRadius: radius.md,
            }}
          />
          <View
            style={{
              height: 260,
              position: 'relative',
              borderRadius: radius.md,
              overflow: 'hidden',
            }}
          >
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
                        sportSlug: sports.data?.find((sport) => sport.id === sportId)?.slug ?? null,
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
          <Body>
            {pin
              ? `Meeting pin: ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}. Drag to adjust.`
              : 'Tap the map to place your session pin, or use your location.'}
          </Body>
          <Button
            label="Use my location"
            icon="crosshairs-gps"
            loading={deviceLocation.state.status === 'requesting'}
            tone="neutral"
            variant="soft"
            onPress={() => {
              void deviceLocation.request().then((point) => {
                if (point) movePin(point);
              });
            }}
          />
          {deviceLocation.state.status === 'denied' && (
            <Body>Enable location services and allow access to continue.</Body>
          )}
          {deviceLocation.state.status === 'unavailable' && (
            <Body>{deviceLocation.state.message}</Body>
          )}
          <AppText>Time zone</AppText>
          <TextInput
            accessibilityLabel="Session time zone"
            value={timezone}
            onChangeText={setTimezone}
            autoCapitalize="none"
            placeholder="America/Toronto"
            style={{
              color: colors.text,
              backgroundColor: colors.surface,
              padding: space.md,
              borderRadius: radius.md,
            }}
          />
          <Button
            label="Use an existing venue instead"
            tone="neutral"
            variant="outline"
            onPress={() => setLocationMode('venue')}
          />
        </>
      ) : (
        <>
          <Body>
            {venue.data?.name} · Times in {zone.data}
          </Body>
          <Button
            label="Drop a different pin"
            tone="neutral"
            variant="outline"
            onPress={() => setLocationMode('pin')}
          />
        </>
      )}
      {fields.map((field) => (
        <View key={field.label} style={{ gap: space.xs }}>
          <AppText>{field.label}</AppText>
          <TextInput
            accessibilityLabel={field.label}
            value={field.value}
            onChangeText={field.change}
            placeholder={field.placeholder}
            maxLength={field.max}
            autoCapitalize="none"
            placeholderTextColor={colors.textFaint}
            style={{
              color: colors.text,
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              padding: space.md,
            }}
          />
        </View>
      ))}
      <AppText>Sport</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {available.map((sport) => (
          <Chip
            key={sport.id}
            label={sport.name}
            selected={sport.id === sportId}
            onPress={() => setSportId(sport.id)}
          />
        ))}
      </View>
      <AppText>Repeat weekly</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {[1, 4, 8, 12].map((count) => (
          <Chip
            key={count}
            label={count === 1 ? 'Just once' : `${count} weeks`}
            selected={weeks === count}
            onPress={() => setWeeks(count)}
          />
        ))}
      </View>
      {create.isError && (
        <AppText tone="alert">
          {userMessage(create.error, 'Could not create this session. Try again.')}
        </AppText>
      )}
      <Button
        label="Create session and open chat"
        loading={create.isPending}
        disabled={
          !sportId ||
          title.trim().length < 2 ||
          !date ||
          (locationMode === 'pin' && (!pin || locationName.trim().length < 2))
        }
        onPress={() => create.mutate()}
      />
    </Screen>
  );
}
