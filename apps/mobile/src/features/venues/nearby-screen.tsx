import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VenueMap from '../../components/map/venue-map';
import { isAwayFromLocation } from '../../components/map/location-distance';
import type { MapRegion } from '../../components/map/types';
import { EmptyState, Skeleton } from '../../components/ui/activity';
import { AdaptiveGlassSurface } from '../../components/ui/glass-surface';
import {
  AppText,
  Button,
  Chip,
  IconButton,
  PressableSurface,
  sportIcon,
} from '../../components/ui/primitives';
import { BrandMark } from '../../components/ui/brand';
import { ResultsSheet } from '../../components/ui/results-sheet';
import { usePublicSessionPins } from '../community/api';
import { useAccountSports } from '../account/api';
import { useRequiredLocation } from '../location/required-location';
import { useNearbyVenues, useSports } from './api';
import { VenueCard } from './venue-card';
import { useSession } from '../../providers/auth-context';
import { radius, space, useThemeName, usePalette } from '../../theme';
import type { IconName } from '../../components/ui/primitives';

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

  const showRecenter = view === 'map' && isAwayFromLocation(visibleCenter, deviceLocation);
  const sports = useSports();
  const sessionPins = usePublicSessionPins(selectedSportIds);
  const venues = useNearbyVenues({
    latitude: visibleCenter.latitude,
    longitude: visibleCenter.longitude,
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

  const liveCount = (venues.data ?? []).filter((v) => v.here_now > 0).length;

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
      contentContainerStyle={{
        padding: space.lg,
        paddingBottom: space.xl,
        gap: space.md,
      }}
      showsVerticalScrollIndicator={false}
      refreshing={venues.isRefetching}
      onRefresh={() => void venues.refetch()}
      renderItem={({ item }) => (
        <VenueCard venue={item} onPress={() => router.push(`/venue/${item.venue_id}`)} />
      )}
      ListEmptyComponent={
        venues.isPending ? (
          <View style={{ gap: space.md }}>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} height={148} />
            ))}
          </View>
        ) : venues.isError ? (
          <EmptyState
            icon="wifi-off"
            title="Can't reach Drop In"
            body="Check your connection, then try again."
            action={
              <Button label="Try again" variant="soft" onPress={() => void venues.refetch()} />
            }
          />
        ) : (
          <EmptyState
            icon="map-search-outline"
            title="Nothing nearby yet"
            body={
              selectedSportIds.length > 0
                ? 'No venues match these sports in this area. Try clearing a filter or moving the map.'
                : 'No venues in range. Move the map, or add a spot you know about.'
            }
          />
        )
      }
    />
  );

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

      {/* --- Floating chrome. Glass here, never on the content cards. --- */}
      <View
        style={[
          styles.chrome,
          { paddingTop: insets.top + space.sm, maxWidth: isWide ? 460 : undefined },
        ]}
        pointerEvents="box-none"
      >
        <AdaptiveGlassSurface style={styles.header} borderRadius={radius.xl}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <BrandMark size={30} />
              <View style={styles.regionRow}>
                <MaterialCommunityIcons name="map-marker" size={12} color={colors.textMuted} />
                <AppText variant="caption" tone="muted">
                  Near you
                </AppText>
              </View>
            </View>

            <IconButton
              icon="plus"
              label="Create session"
              tone="live"
              onPress={() => router.push('/run/new')}
            />
            <IconButton
              icon="map-marker-plus-outline"
              label="Add a venue"
              onPress={() => router.push('/venue-submission/new')}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
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
                icon={sportIcon(sport.slug) as IconName}
                selected={selectedSportIds.includes(sport.id)}
                onPress={() => toggleSport(sport.id)}
              />
            ))}
          </ScrollView>
        </AdaptiveGlassSurface>
      </View>

      {/* --- Right-hand floating controls --- */}
      <View
        style={[
          styles.sideControls,
          { top: insets.top + 144, right: isWide && view === 'map' ? 432 : space.md },
        ]}
        pointerEvents="box-none"
      >
        <AdaptiveGlassSurface borderRadius={radius.pill} style={styles.controlStack}>
          <PressableSurface
            onPress={() => setView(view === 'map' ? 'list' : 'map')}
            accessibilityLabel={view === 'map' ? 'Show list view' : 'Show map view'}
          >
            <View style={styles.controlButton}>
              <MaterialCommunityIcons
                name={view === 'map' ? 'format-list-bulleted' : 'map-outline'}
                size={20}
                color={colors.text}
              />
            </View>
          </PressableSurface>

          {showRecenter && (
            <>
              <View style={[styles.controlDivider, { backgroundColor: colors.glassBorder }]} />
              <PressableSurface
                onPress={() => {
                  setCenter(deviceLocation);
                  setVisibleCenter(deviceLocation);
                  setRecenterRequest((current) => current + 1);
                }}
                accessibilityLabel="Centre the map on my location"
              >
                <View style={styles.controlButton}>
                  <MaterialCommunityIcons name="crosshairs-gps" size={20} color={colors.info} />
                </View>
              </PressableSurface>
            </>
          )}
        </AdaptiveGlassSurface>
      </View>

      {view === 'map' ? (
        <ResultsSheet
          title={
            venues.isPending
              ? 'Finding venues…'
              : liveCount > 0
                ? `${liveCount} active now`
                : `${venues.data?.length ?? 0} nearby`
          }
          subtitle={liveCount > 0 ? 'Find your next game' : 'Your next game starts here'}
        >
          {listContent}
        </ResultsSheet>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top + 208 }}>{listContent}</View>
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
    paddingHorizontal: space.md,
    zIndex: 20,
  },
  header: { paddingBottom: space.sm },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.xs,
  },
  regionRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chipRow: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  sideControls: { position: 'absolute', right: space.md, zIndex: 20 },
  controlStack: { alignItems: 'center' },
  controlButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  controlDivider: { height: StyleSheet.hairlineWidth, width: 28 },
});
