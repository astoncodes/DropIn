import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VenueMap from '../../components/map/venue-map';
import { isAwayFromLocation } from '../../components/map/location-distance';
import type { MapRegion } from '../../components/map/types';
import { EmptyState, LoadError } from '../../components/ui/activity';
import {
  Button,
  Chip,
  IconButton,
  PressableSurface,
  sportIcon,
} from '../../components/ui/primitives';
import { ResultsSheet } from '../../components/ui/results-sheet';
import { usePublicSessionPins } from '../community/api';
import { useAccountSports } from '../account/api';
import { useRequiredLocation } from '../location/required-location';
import { useNearbyVenues, useSports } from './api';
import { VenueRow } from './venue-row';
import { loadPhase } from '../../lib/load-phase';
import { useSession } from '../../providers/auth-context';
import { elevation, radius, space, useThemeName, usePalette } from '../../theme';

/**
 * Live — "where can I play right now?"
 *
 * The map answers the question spatially and the list answers it in ranked
 * order; both read the same query, so they can never disagree. Venues with
 * people present sort first, because the nearest empty court does not answer
 * the question this screen exists for.
 */
export function NearbyScreen() {
  const deviceLocation = useRequiredLocation();
  const colors = usePalette();
  const scheme = useThemeName();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const { session } = useSession();
  const userId = session?.user.id;
  const preferredSports = useAccountSports(userId);
  const [filterOverride, setFilterOverride] = useState<{
    userId: string | null;
    sportIds: number[];
  } | null>(null);
  const selectedSportIds =
    filterOverride?.userId === (userId ?? null)
      ? filterOverride.sportIds
      : (preferredSports.data ?? []);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [center, setCenter] = useState<{ latitude: number; longitude: number }>(deviceLocation);

  const [visibleCenter, setVisibleCenter] = useState<{ latitude: number; longitude: number }>(
    deviceLocation,
  );
  const [recenterRequest, setRecenterRequest] = useState(0);
  const [searchCenter, setSearchCenter] = useState<{ latitude: number; longitude: number }>(
    deviceLocation,
  );

  // Several map-idle events can arrive during a pan. Search the settled
  // position so intermediate areas do not repeatedly replace the list.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearchCenter({ latitude: visibleCenter.latitude, longitude: visibleCenter.longitude });
    }, 300);
    return () => clearTimeout(timeout);
  }, [visibleCenter.latitude, visibleCenter.longitude]);

  const showRecenter = view === 'map' && isAwayFromLocation(visibleCenter, deviceLocation);
  const sports = useSports();
  const sessionPins = usePublicSessionPins(selectedSportIds);
  const venues = useNearbyVenues({
    latitude: searchCenter.latitude,
    longitude: searchCenter.longitude,
    sportIds: selectedSportIds,
    enabled: true,
  });

  const activeSports = useMemo(
    () => (sports.data ?? []).filter((sport) => sport.is_active),
    [sports.data],
  );

  const markers = useMemo(
    () =>
      (venues.data ?? []).map((venue) => ({
        id: venue.venue_id,
        latitude: venue.latitude,
        longitude: venue.longitude,
        sportSlug: venue.sport_slugs?.[0] ?? null,
        count: venue.here_now,
        isLive: venue.here_now > 0,
        isPending: venue.here_now === 0 && venue.heading_there > 0,
        label: `${venue.name}, ${venue.here_now} here now`,
      })),
    [venues.data],
  );

  const region: MapRegion = {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  const venuesPhase = loadPhase(venues);
  const liveCount = (venues.data ?? []).filter((v) => v.here_now > 0).length;
  const sheetExpandable = (venues.data?.length ?? 0) > 0;

  function toggleSport(id: number) {
    setFilterOverride({
      userId: userId ?? null,
      sportIds: selectedSportIds.includes(id)
        ? selectedSportIds.filter((value) => value !== id)
        : [...selectedSportIds, id],
    });
  }

  const listContent = (
    <FlatList
      data={venues.data ?? []}
      keyExtractor={(venue) => venue.venue_id}
      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.md }]}
      showsVerticalScrollIndicator={false}
      // The sheet translates over the map; native clipping can briefly hide
      // rows while their parent's position changes.
      removeClippedSubviews={false}
      renderItem={({ item }) => (
        <VenueRow venue={item} onPress={() => router.push(`/venue/${item.venue_id}`)} />
      )}
      ListEmptyComponent={
        venuesPhase === 'loading' ? null : venuesPhase === 'failed' ? (
          <LoadError
            title="Can't reach Drop In"
            body="Check your connection, then try again."
            onRetry={() => void venues.refetch()}
            retrying={venues.isFetching}
          />
        ) : (
          <EmptyState
            title="No venues here"
            style={styles.nearbyEmpty}
            body={
              selectedSportIds.length > 0
                ? 'Nothing in this area matches those sports. Clear a filter or move the map.'
                : 'Move the map to look somewhere else.'
            }
          />
        )
      }
    />
  );

  const panel = [
    styles.panel,
    { backgroundColor: colors.surface, borderColor: colors.border },
    elevation.floating,
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {view === 'map' && (
        <View style={StyleSheet.absoluteFill}>
          <VenueMap
            region={region}
            recenterRequest={recenterRequest}
            onRegionChange={setVisibleCenter}
            markers={[
              ...markers,
              ...(sessionPins.data ?? []).flatMap((pin) =>
                pin.latitude === null || pin.longitude === null
                  ? []
                  : [
                      {
                        id: `session/${pin.id}`,
                        latitude: pin.latitude,
                        longitude: pin.longitude,
                        sportSlug:
                          sports.data?.find((sport) => sport.id === pin.sport_id)?.slug ?? null,
                        count: 0,
                        isLive: false,
                        isPending: true,
                        kind: 'session' as const,
                        label:
                          pin.title ??
                          pin.run_series?.title ??
                          pin.location_name ??
                          'Sports session',
                      },
                    ],
              ),
            ]}
            colorScheme={scheme}
            onSelectMarker={(id) => {
              if (id.startsWith('session/')) {
                router.push(`/session/${id.slice('session/'.length)}`);
                return;
              }
              router.push(`/venue/${id}`);
            }}
            userLocation={deviceLocation}
          />
        </View>
      )}

      {/* Floating over the map: sport filters, then the one action. */}
      <View
        style={[
          styles.chrome,
          { paddingTop: insets.top + space.sm, maxWidth: isWide ? 520 : undefined },
        ]}
        pointerEvents="box-none"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filters}
          contentContainerStyle={styles.chipRow}
          accessibilityLabel="Filter by sport"
        >
          <Chip
            label="All"
            selected={selectedSportIds.length === 0}
            onPress={() => setFilterOverride({ userId: userId ?? null, sportIds: [] })}
          />
          {activeSports.map((sport) => (
            <Chip
              key={sport.id}
              label={sport.name}
              icon={sportIcon(sport.slug)}
              selected={selectedSportIds.includes(sport.id)}
              onPress={() => toggleSport(sport.id)}
            />
          ))}
        </ScrollView>
        <View style={[panel, styles.create]}>
          <IconButton
            icon="plus"
            label="Create session"
            filled
            onPress={() => router.push('/run/new')}
          />
        </View>
      </View>

      <View
        style={[
          styles.sideControls,
          { top: insets.top + 68, right: isWide && view === 'map' ? 432 : space.md },
        ]}
        pointerEvents="box-none"
      >
        <View style={panel}>
          <PressableSurface
            onPress={() => setView(view === 'map' ? 'list' : 'map')}
            accessibilityLabel={view === 'map' ? 'Show list view' : 'Show map view'}
          >
            <View style={styles.controlButton}>
              <MaterialCommunityIcons
                name={view === 'map' ? 'format-list-bulleted' : 'map-outline'}
                size={22}
                color={colors.text}
              />
            </View>
          </PressableSurface>

          {showRecenter && (
            <>
              <View style={[styles.controlDivider, { backgroundColor: colors.border }]} />
              <PressableSurface
                onPress={() => {
                  setCenter(deviceLocation);
                  setVisibleCenter(deviceLocation);
                  setRecenterRequest((current) => current + 1);
                }}
                accessibilityLabel="Centre the map on my location"
              >
                <View style={styles.controlButton}>
                  <MaterialCommunityIcons name="crosshairs-gps" size={22} color={colors.text} />
                </View>
              </PressableSurface>
            </>
          )}
        </View>
      </View>

      {view === 'map' ? (
        <ResultsSheet
          live={liveCount > 0}
          expandable={sheetExpandable}
          title={liveCount > 0 ? `${liveCount} live now` : `${venues.data?.length ?? 0} nearby`}
          headerAction={
            <Button
              label="Add venue"
              size="sm"
              variant="ghost"
              icon="map-marker-plus-outline"
              onPress={() => router.push('/venue-submission/new')}
            />
          }
        >
          {listContent}
        </ResultsSheet>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top + 68 }}>{listContent}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingRight: space.md,
    zIndex: 20,
  },
  filters: { flex: 1 },
  chipRow: { paddingLeft: space.md, paddingRight: space.sm, paddingVertical: 3, gap: space.sm },
  panel: { borderRadius: radius.md, borderWidth: 1 },
  create: { borderWidth: 0 },
  sideControls: { position: 'absolute', zIndex: 20 },
  controlButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  controlDivider: { height: 1, marginHorizontal: space.sm },
  list: { paddingHorizontal: space.lg },
  nearbyEmpty: { paddingBottom: space.sm },
});
