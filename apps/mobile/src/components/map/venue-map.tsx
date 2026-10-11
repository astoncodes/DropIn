import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Mapbox, { Camera, MapView, PointAnnotation, UserLocation } from '@rnmapbox/maps';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';

import { env } from '../../lib/env';
import { fonts, palettes } from '../../theme/tokens';
import { AppText, sportIcon } from '../ui/primitives';
import { MAP_STYLE_URL, PIN } from './types';
import type { MapRegion, VenueMapProps } from './types';

if (env.mapboxAccessToken) Mapbox.setAccessToken(env.mapboxAccessToken);

export default function VenueMap({
  region,
  recenterRequest,
  markers,
  onSelectMarker,
  onMarkerDragEnd,
  onPressCoordinate,
  onRegionChange,
  userLocation,
  colorScheme,
  style,
}: VenueMapProps) {
  const colors = palettes[colorScheme];
  const [fontsLoaded] = useFonts(MaterialCommunityIcons.font);
  const camera = useRef<Camera>(null);
  const zoom = useRef(Math.log2(360 / Math.max(region.longitudeDelta, 0.0001)));
  const lastReported = useRef<MapRegion | null>(null);
  const lastRequest = useRef(recenterRequest);
  const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
  useEffect(() => {
    const reported = lastReported.current;
    const requested = lastRequest.current !== recenterRequest;
    lastRequest.current = recenterRequest;
    // Picker screens echo viewport changes back as props. Do not animate that echo.
    if (
      !requested &&
      reported &&
      reported.latitude === latitude &&
      reported.longitude === longitude &&
      reported.latitudeDelta === latitudeDelta &&
      reported.longitudeDelta === longitudeDelta
    )
      return;
    camera.current?.setCamera({
      centerCoordinate: [longitude, latitude],
      zoomLevel: requested ? zoom.current : Math.log2(360 / Math.max(longitudeDelta, 0.0001)),
      animationDuration: 250,
    });
  }, [latitude, longitude, latitudeDelta, longitudeDelta, recenterRequest]);

  if (!env.mapboxAccessToken)
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
          style,
        ]}
      >
        <AppText>Map unavailable. You can still browse the venue list.</AppText>
      </View>
    );

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={MAP_STYLE_URL}
        zoomEnabled
        onCameraChanged={(state) => {
          zoom.current = state.properties.zoom;
        }}
        compassEnabled={false}
        scaleBarEnabled={false}
        onPress={(event) => {
          if (event.geometry.type === 'Point')
            onPressCoordinate?.({
              latitude: event.geometry.coordinates[1],
              longitude: event.geometry.coordinates[0],
            });
        }}
        onMapIdle={(state) => {
          const next = {
            latitude: state.properties.center[1],
            longitude: state.properties.center[0],
            latitudeDelta: Math.abs(state.properties.bounds.ne[1] - state.properties.bounds.sw[1]),
            longitudeDelta: Math.abs(state.properties.bounds.ne[0] - state.properties.bounds.sw[0]),
          };
          lastReported.current = next;
          onRegionChange?.(next);
        }}
        accessibilityLabel="Map of nearby venues. The same venues are listed below."
      >
        <Camera
          ref={camera}
          minZoomLevel={2}
          maxZoomLevel={19}
          defaultSettings={{
            centerCoordinate: [longitude, latitude],
            zoomLevel: Math.log2(360 / Math.max(longitudeDelta, 0.0001)),
          }}
        />
        {markers.map((marker) => (
          <PointAnnotation
            key={`${marker.id}/${marker.selected}/${marker.count}/${marker.isPending}/${colorScheme}/${fontsLoaded}`}
            id={marker.id}
            coordinate={[marker.longitude, marker.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
            onSelected={() => onSelectMarker?.(marker.id)}
            draggable={marker.draggable}
            onDragEnd={(event) =>
              onMarkerDragEnd?.(marker.id, {
                latitude: event.geometry.coordinates[1],
                longitude: event.geometry.coordinates[0],
              })
            }
          >
            <View style={styles.box} collapsable={false} accessibilityLabel={marker.label}>
              <View
                style={[
                  styles.pin,
                  marker.kind === 'session'
                    ? { backgroundColor: colors.surface, borderColor: colors.text }
                    : { backgroundColor: colors.text, borderColor: colors.surface },
                  marker.selected && styles.selected,
                ]}
              >
                <MaterialCommunityIcons
                  name={marker.sportSlug ? sportIcon(marker.sportSlug) : 'map-marker-outline'}
                  size={PIN.glyph}
                  color={marker.kind === 'session' ? colors.text : colors.textInverse}
                />
              </View>
              {marker.count > 0 ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: colors.live, borderColor: colors.surface },
                  ]}
                >
                  <AppText style={[styles.count, { color: colors.textInverse }]}>
                    {Math.min(marker.count, 99)}
                  </AppText>
                </View>
              ) : marker.isPending && marker.kind !== 'session' ? (
                <View
                  style={[
                    styles.pending,
                    { backgroundColor: colors.soon, borderColor: colors.surface },
                  ]}
                />
              ) : null}
            </View>
          </PointAnnotation>
        ))}
        {userLocation && <UserLocation visible minDisplacement={5} />}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: PIN.box, height: PIN.box },
  pin: {
    position: 'absolute',
    left: (PIN.box - PIN.size) / 2,
    top: (PIN.box - PIN.size) / 2,
    width: PIN.size,
    height: PIN.size,
    borderRadius: PIN.radius,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { transform: [{ scale: 1.12 }] },
  badge: {
    position: 'absolute',
    right: 0,
    top: 0,
    minWidth: PIN.badge + 2,
    height: PIN.badge + 2,
    paddingHorizontal: 4,
    borderRadius: PIN.badge,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { fontFamily: fonts.display, fontSize: 15, lineHeight: 16 },
  pending: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
});
