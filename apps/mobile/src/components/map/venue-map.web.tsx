import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect, useRef } from 'react';
import { sportIcon } from '../ui/primitives';
import { fonts, palettes } from '../../theme/tokens';
import type { ThemeName } from '../../theme/tokens';
import { env } from '../../lib/env';
import { MAP_STYLE_URL, PIN } from './types';
import type { MapMarker, VenueMapProps } from './types';

function markerHtml(marker: MapMarker, scheme: ThemeName): string {
  const colors = palettes[scheme];
  const session = marker.kind === 'session';
  const inset = (PIN.box - PIN.size) / 2;
  const glyph =
    MaterialCommunityIcons.glyphMap[
      marker.sportSlug ? sportIcon(marker.sportSlug) : 'map-marker-outline'
    ];
  const body = session
    ? `background:${colors.surface};color:${colors.text};border:2px solid ${colors.text}`
    : `background:${colors.text};color:${colors.textInverse};border:2px solid ${colors.surface}`;
  const ring = marker.selected
    ? `outline:3px solid ${colors.borderStrong};outline-offset:2px;`
    : '';
  const badgeBase = `position:absolute;right:0;top:0;box-sizing:border-box;border:2px solid ${colors.surface}`;
  const badge =
    marker.count > 0
      ? `<span style="${badgeBase};min-width:${PIN.badge + 2}px;height:${PIN.badge + 2}px;padding:0 4px;border-radius:${PIN.badge}px;background:${colors.live};color:${colors.textInverse};font:15px/${PIN.badge - 2}px '${fonts.display}';text-align:center">${Math.min(marker.count, 99)}</span>`
      : marker.isPending && !session
        ? `<span style="${badgeBase};width:12px;height:12px;border-radius:6px;background:${colors.soon}"></span>`
        : '';
  return `<div style="position:relative;width:${PIN.box}px;height:${PIN.box}px">
    <div style="position:absolute;left:${inset}px;top:${inset}px;width:${PIN.size}px;height:${PIN.size}px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:${PIN.radius}px;${body};${ring}box-shadow:0 3px 8px rgba(15,26,22,.28);font:${PIN.glyph}px '${MaterialCommunityIcons.getFontFamily()}'">&#${glyph};</div>
    ${badge}
  </div>`;
}

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
  const [fontsLoaded] = useFonts(MaterialCommunityIcons.font);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const callbacks = useRef({ onRegionChange, onPressCoordinate });
  useEffect(() => {
    callbacks.current = { onRegionChange, onPressCoordinate };
  }, [onRegionChange, onPressCoordinate]);

  useEffect(() => {
    if (!containerRef.current || !env.mapboxAccessToken) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: env.mapboxAccessToken,
      minZoom: 2,
      maxZoom: 19,
      scrollZoom: true,
      touchZoomRotate: true,
      style: MAP_STYLE_URL,
      center: [region.longitude, region.latitude],
      zoom: Math.log2(360 / Math.max(region.longitudeDelta, 0.0001)),
    });
    mapRef.current = map;
    map.on('moveend', () => {
      const center = map.getCenter();
      const bounds = map.getBounds();
      if (bounds)
        callbacks.current.onRegionChange?.({
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: bounds.getNorth() - bounds.getSouth(),
          longitudeDelta: bounds.getEast() - bounds.getWest(),
        });
    });
    map.on('click', (event) =>
      callbacks.current.onPressCoordinate?.({
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
      }),
    );
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Camera changes are handled without replacing the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pins = markers.map((marker) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.setAttribute('aria-label', marker.label);
      element.title = marker.label;
      element.style.cssText = 'padding:0;border:0;background:transparent;cursor:pointer';
      element.innerHTML = markerHtml(marker, colorScheme);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelectMarker?.(marker.id);
      });
      const pin = new mapboxgl.Marker({ element, anchor: 'center', draggable: marker.draggable })
        .setLngLat([marker.longitude, marker.latitude])
        .addTo(map);
      pin.on('dragend', () => {
        const point = pin.getLngLat();
        onMarkerDragEnd?.(marker.id, { latitude: point.lat, longitude: point.lng });
      });
      return pin;
    });
    return () => pins.forEach((pin) => pin.remove());
  }, [markers, colorScheme, fontsLoaded, onSelectMarker, onMarkerDragEnd]);

  useEffect(() => {
    if (!mapRef.current || !userLocation) return;
    const element = document.createElement('div');
    element.setAttribute('aria-label', 'Your live location');
    element.style.cssText =
      'width:20px;height:20px;border-radius:50%;background:#2685F5;border:3px solid white;box-shadow:0 0 0 8px #2685F530;pointer-events:none';
    const dot = new mapboxgl.Marker({ element })
      .setLngLat([userLocation.longitude, userLocation.latitude])
      .addTo(mapRef.current);
    return () => {
      dot.remove();
    };
  }, [userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    if (
      Math.abs(center.lat - region.latitude) < 1e-8 &&
      Math.abs(center.lng - region.longitude) < 1e-8
    )
      return;
    map.easeTo({ center: [region.longitude, region.latitude], duration: 250 });
  }, [region.latitude, region.longitude, recenterRequest]);

  return (
    <View style={{ width: '100%', height: '100%', ...style }}>
      <div
        ref={containerRef}
        role="application"
        aria-label="Map of nearby venues. The same venues are listed below."
        style={{ width: '100%', height: '100%' }}
      >
        {!env.mapboxAccessToken && (
          <p role="status">Map unavailable. You can still browse the venue list.</p>
        )}
      </div>
    </View>
  );
}
