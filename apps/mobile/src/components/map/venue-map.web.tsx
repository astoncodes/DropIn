import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import { useEffect, useRef } from 'react';
import { sportIcon } from '../ui/primitives';
import { palettes, sportColor } from '../../theme/tokens';
import type { ThemeName } from '../../theme/tokens';
import { env } from '../../lib/env';
import type { MapMarker, VenueMapProps } from './types';

function markerHtml(marker: MapMarker, scheme: ThemeName): string {
  const colors = palettes[scheme];
  const session = marker.kind === 'session';
  const fill = sportColor(marker.sportSlug);
  const ring = marker.selected ? colors.text : '#FFFFFF';
  const glyph =
    MaterialCommunityIcons.glyphMap[
      marker.sportSlug ? sportIcon(marker.sportSlug) : 'map-marker-outline'
    ];
  const badge =
    marker.count > 0
      ? `<span style="position:absolute;right:-3px;top:-4px;min-width:16px;height:16px;padding:0 3px;box-sizing:border-box;border-radius:8px;background:${colors.live};color:white;font:700 10px/16px system-ui;text-align:center;border:1px solid white">${Math.min(marker.count, 99)}</span>`
      : '';
  return `<div style="position:relative;width:48px;height:${session ? 56 : 44}px">
    <div style="position:absolute;left:6px;top:6px;width:36px;height:36px;box-sizing:border-box;background:${fill};border:2px solid ${ring};border-radius:${session ? '50% 50% 3px 50%' : '10px'};transform:${session ? 'rotate(45deg)' : 'none'};box-shadow:0 4px 10px #102B2640"></div>
    <span style="position:absolute;left:11px;top:11px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${session ? '#FFFFFF' : 'transparent'};color:${session ? fill : '#FFFFFF'};font:20px '${MaterialCommunityIcons.getFontFamily()}';">&#${glyph};</span>
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
      style: 'mapbox://styles/mapbox/streets-v12',
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
      const pin = new mapboxgl.Marker({
        element,
        anchor: marker.kind === 'session' ? 'bottom' : 'center',
        offset: marker.kind === 'session' ? [0, 7] : [0, -2],
        draggable: marker.draggable,
      })
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
