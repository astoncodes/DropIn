import { DUPLICATE_DISTANCE_METRES } from '@dropin/shared';
import type { IndoorState } from '@dropin/shared';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VenueMap from '../../components/map/venue-map';
import type { MapCoordinate, MapRegion } from '../../components/map/types';
import { Notice } from '../../components/ui/notice';
import { AppText, Button, Chip, PressableSurface, sportIcon } from '../../components/ui/primitives';
import { TextField } from '../../components/ui/text-field';
import { searchPlaces } from '../geocoding/geoapify';
import type { GeocodingResult } from '../geocoding/geoapify';
import { useNearbyVenues, useSports } from '../venues/api';
import { SportsUnavailableNotice } from '../venues/sports-unavailable-notice';
import { useSession } from '../../providers/auth-context';
import { elevation, radius, space, usePalette, useThemeName } from '../../theme';
import type { IconName } from '../../components/ui/primitives';
import { useSubmitVenue } from './api';
import { useDeviceLocation } from '../location/use-device-location';
import { useRequiredLocation } from '../location/required-location';
import { userMessage } from '../../lib/errors';
import { loadPhase } from '../../lib/load-phase';

export function VenueSubmissionForm() {
  const initialLocation = useRequiredLocation();
  const colors = usePalette();
  const scheme = useThemeName();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const sports = useSports();
  const submitVenue = useSubmitVenue();
  const { state: locationState, request: requestLocation } = useDeviceLocation();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchController = useRef<AbortController | null>(null);
  const [pin, setPin] = useState<MapCoordinate>(initialLocation);
  const [pinSelected, setPinSelected] = useState(false);
  const [region, setRegion] = useState<MapRegion>({
    ...initialLocation,
    latitudeDelta: 0.025,
    longitudeDelta: 0.025,
  });
  const [address, setAddress] = useState('');
  const [duplicateCheckAccepted, setDuplicateCheckAccepted] = useState(false);
  const [name, setName] = useState('');
  const [sportIds, setSportIds] = useState<number[]>([]);
  const [indoorState, setIndoorState] = useState<IndoorState>('unknown');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => () => searchController.current?.abort(), []);

  const nearby = useNearbyVenues({
    latitude: pin.latitude,
    longitude: pin.longitude,
    sportIds: [],
    radiusM: DUPLICATE_DISTANCE_METRES.submissionPrevention,
  });

  const nearbyPhase = loadPhase(nearby);

  const marker = useMemo(
    () => [
      {
        id: 'draft-location',
        latitude: pin.latitude,
        longitude: pin.longitude,
        sportSlug: null,
        count: 0,
        isLive: false,
        isPending: true,
        label: 'Proposed venue location. Drag to adjust.',
        selected: true,
        draggable: true,
      },
    ],
    [pin],
  );

  function movePin(coordinate: MapCoordinate) {
    setPin(coordinate);
    setPinSelected(true);
    setRegion((current) => ({ ...current, ...coordinate }));
    setDuplicateCheckAccepted(false);
  }

  async function useCurrentLocation() {
    const coordinate = await requestLocation();
    if (coordinate) {
      movePin(coordinate);
      setAddress('');
      setQuery('');
      setSearchResults([]);
    }
  }

  async function handleSearch() {
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearchError(null);
    setIsSearching(true);
    try {
      const results = await searchPlaces(query, controller.signal);
      setSearchResults(results);
      if (results.length === 0) setSearchError('No matching places found. Try a broader search.');
    } catch (error) {
      if ((error as Error).name !== 'AbortError')
        setSearchError(userMessage(error, 'Place search is unavailable right now.'));
    } finally {
      if (searchController.current === controller) setIsSearching(false);
    }
  }

  function chooseResult(result: GeocodingResult) {
    movePin({ latitude: result.latitude, longitude: result.longitude });
    setAddress(result.label.slice(0, 240));
    setQuery(result.label);
    setSearchResults([]);
  }

  async function handleSubmit() {
    setValidationError(null);
    if (!session) {
      router.push('/sign-in');
      return;
    }
    if (!pinSelected) {
      setValidationError('Choose the venue location on the map before submitting.');
      return;
    }
    if (name.trim().length < 2) {
      setValidationError('Enter a venue name of at least 2 characters.');
      return;
    }
    if (sportIds.length === 0) {
      setValidationError('Choose at least one sport.');
      return;
    }

    try {
      await submitVenue.mutateAsync({
        name: name.trim(),
        latitude: pin.latitude,
        longitude: pin.longitude,
        sportIds,
        indoorState,
        addressText: address.trim() || undefined,
      });
    } catch {
      // The mutation error is rendered below with the server-provided message.
    }
  }

  if (submitVenue.isSuccess) {
    return (
      <View style={[styles.successScreen, { backgroundColor: colors.background }]}>
        <MaterialCommunityIcons name="check-circle" size={54} color={colors.live} />
        <AppText variant="title">Submitted for review</AppText>
        <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
          Your pin and coordinates were saved. It will stay private until an admin reviews it.
        </AppText>
        {submitVenue.data.status === 'possible_duplicate' && (
          <AppText variant="caption" tone="soon" style={{ textAlign: 'center' }}>
            We flagged a possible nearby match for the reviewer. Nothing was merged automatically.
          </AppText>
        )}
        <Button label="Back to map" onPress={() => router.replace('/')} />
        <Button
          label="View your submissions"
          variant="outline"
          onPress={() => router.replace('/venue-submission')}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
        padding: space.lg,
        paddingBottom: insets.bottom + space.xxl,
        gap: space.lg,
      }}
    >
      <AppText variant="body" tone="muted">
        Search for a place or use your location, then adjust the pin to the exact spot. A moderator
        reviews every venue before it appears for other players.
      </AppText>

      <Button
        label="Use my location"
        icon="crosshairs-gps"
        onPress={useCurrentLocation}
        loading={locationState.status === 'requesting'}
      />
      {locationState.status === 'denied' && (
        <Notice
          tone="warning"
          message="Enable location services and allow access to use your location."
        />
      )}
      {locationState.status === 'unavailable' && (
        <Notice
          tone="warning"
          message="Could not find your location. Try again, search for a place or tap the map."
        />
      )}

      <View style={styles.searchRow}>
        <TextField
          label="Address or place"
          labelHidden
          containerStyle={{ flex: 1 }}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          placeholder="Address or place"
          maxLength={160}
          returnKeyType="search"
        />
        <Button label="Search" icon="magnify" onPress={handleSearch} loading={isSearching} />
      </View>

      <AppText variant="micro" tone="faint">
        Search is only sent when you press Search.{' '}
        <Text
          accessibilityRole="link"
          onPress={() =>
            void Linking.openURL('https://www.geoapify.com/').catch(() =>
              setSearchError('Could not open attribution link.'),
            )
          }
        >
          Powered by Geoapify
        </Text>
        {' · '}
        <Text
          accessibilityRole="link"
          onPress={() =>
            void Linking.openURL('https://www.openstreetmap.org/copyright').catch(() =>
              setSearchError('Could not open attribution link.'),
            )
          }
        >
          © OpenStreetMap contributors
        </Text>
      </AppText>
      {searchError && <Notice tone="error" message={searchError} />}

      {searchResults.length > 0 && (
        <View style={[styles.resultList, { borderColor: colors.border }]}>
          {searchResults.map((result) => (
            <PressableSurface
              key={result.id}
              onPress={() => chooseResult(result)}
              accessibilityLabel={`Use ${result.label}`}
            >
              <View style={[styles.result, { borderBottomColor: colors.border }]}>
                <MaterialCommunityIcons name="map-marker-outline" size={20} color={colors.info} />
                <AppText variant="caption" style={{ flex: 1 }}>
                  {result.label}
                </AppText>
              </View>
            </PressableSurface>
          ))}
        </View>
      )}

      <View style={[styles.mapFrame, { borderColor: colors.border }]}>
        <VenueMap
          region={region}
          markers={marker}
          colorScheme={scheme}
          onPressCoordinate={movePin}
          onMarkerDragEnd={(_id, coordinate) => movePin(coordinate)}
        />
      </View>
      <AppText variant="caption" tone="muted">
        {pinSelected
          ? `Tap the map or drag the pin to adjust it. Final coordinates: ${pin.latitude.toFixed(6)}, ${pin.longitude.toFixed(6)}`
          : 'Tap the map, search for a place or use your location to confirm the venue’s exact spot.'}
      </AppText>

      {!duplicateCheckAccepted ? (
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <AppText variant="heading">Is it one of these?</AppText>
          <AppText variant="caption" tone="muted">
            These are all existing venues within {DUPLICATE_DISTANCE_METRES.submissionPrevention}{' '}
            metres of your pin.
          </AppText>
          {nearbyPhase === 'loading' ? (
            <ActivityIndicator color={colors.live} />
          ) : nearbyPhase === 'failed' ? (
            <Notice
              tone="error"
              message="Nearby venues could not be checked. Try again."
              action={
                <Button
                  label="Retry nearby venues"
                  size="sm"
                  tone="neutral"
                  variant="soft"
                  loading={nearby.isFetching}
                  onPress={() => void nearby.refetch()}
                />
              }
            />
          ) : nearby.data?.length ? (
            nearby.data.map((venue) => (
              <PressableSurface
                key={venue.venue_id}
                onPress={() => router.push(`/venue/${venue.venue_id}`)}
                accessibilityLabel={`Open existing venue ${venue.name}`}
              >
                <View style={styles.nearbyRow}>
                  <MaterialCommunityIcons name="map-marker" size={20} color={colors.soon} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong">{venue.name}</AppText>
                    <AppText variant="caption" tone="muted">
                      {Math.round(venue.distance_m)} m away
                    </AppText>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textFaint} />
                </View>
              </PressableSurface>
            ))
          ) : (
            <AppText variant="caption" tone="muted">
              No existing venue is within {DUPLICATE_DISTANCE_METRES.submissionPrevention} metres.
            </AppText>
          )}
          <Button
            label="None of these — continue"
            onPress={() => setDuplicateCheckAccepted(true)}
            disabled={!pinSelected || nearbyPhase !== 'ready'}
          />
        </View>
      ) : (
        <View style={{ gap: space.lg }}>
          <View style={{ gap: space.md }}>
            <AppText variant="heading">Venue details</AppText>
            <TextField
              label="Venue name"
              value={name}
              onChangeText={setName}
              maxLength={120}
              placeholder="e.g. Victoria Park courts"
            />
            <TextField
              label="Address (optional)"
              accessibilityLabel="Address"
              value={address}
              onChangeText={setAddress}
              maxLength={240}
              placeholder="Street address, if it has one"
            />
          </View>

          <View style={{ gap: space.sm }}>
            <AppText variant="heading">Sports</AppText>
            <SportsUnavailableNotice sports={sports} />
            <View style={styles.chipRow}>
              {(sports.data ?? [])
                .filter((sport) => sport.is_active)
                .map((sport) => (
                  <Chip
                    key={sport.id}
                    label={sport.name}
                    icon={sportIcon(sport.slug) as IconName}
                    selected={sportIds.includes(sport.id)}
                    onPress={() =>
                      setSportIds((current) =>
                        current.includes(sport.id)
                          ? current.filter((id) => id !== sport.id)
                          : [...current, sport.id],
                      )
                    }
                  />
                ))}
            </View>
          </View>

          <View style={{ gap: space.sm }}>
            <AppText variant="heading">Setting</AppText>
            <View style={styles.chipRow}>
              {(['outdoor', 'indoor', 'unknown'] as const).map((value) => (
                <Chip
                  key={value}
                  label={
                    value === 'unknown' ? 'Not sure' : value === 'indoor' ? 'Indoor' : 'Outdoor'
                  }
                  selected={indoorState === value}
                  onPress={() => setIndoorState(value)}
                />
              ))}
            </View>
          </View>

          {!session && (
            <Notice tone="info" message="You’ll need to sign in before submitting this venue." />
          )}
          {validationError && <Notice tone="error" message={validationError} />}
          {submitVenue.isError && (
            <Notice
              tone="error"
              message={userMessage(submitVenue.error, 'Could not submit this venue. Try again.')}
            />
          )}
          <Button
            label={session ? 'Submit for review' : 'Sign in to submit'}
            icon={session ? 'send' : 'login'}
            onPress={handleSubmit}
            loading={submitVenue.isPending}
            disabled={locationState.status === 'requesting'}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  resultList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  result: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mapFrame: {
    height: 320,
    overflow: 'hidden',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.md,
    ...elevation.card,
  },
  nearbyRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  successScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xxl,
    gap: space.lg,
  },
});
