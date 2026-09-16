/** Shared map boundary for native Mapbox and Mapbox GL JS on web. */

import type { ThemeName } from '../../theme/tokens';

export type MapMarker = {
  id: string;
  /** Locations and sessions retain distinct shapes regardless of activity. */
  kind?: 'venue' | 'session';
  latitude: number;
  longitude: number;
  /** Drives the pin glyph. */
  sportSlug: string | null;
  /** Players present now. Zero means a quiet venue, not a hidden one. */
  count: number;
  /** Highlights the activity badge only when someone is actually there. */
  isLive: boolean;
  /** Somebody is on their way but nobody has arrived. */
  isPending: boolean;
  label: string;
  selected?: boolean;
  /** Used by location pickers; venue markers are never draggable. */
  draggable?: boolean;
};

export type MapCoordinate = { latitude: number; longitude: number };

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type VenueMapProps = {
  region: MapRegion;
  /** Increment to recenter even when the target coordinates have not changed. */
  recenterRequest?: number;
  markers: MapMarker[];
  onSelectMarker?: (id: string) => void;
  onMarkerDragEnd?: (id: string, coordinate: MapCoordinate) => void;
  /** Optional map-tap handler used to position a draft pin. */
  onPressCoordinate?: (coordinate: MapCoordinate) => void;
  onRegionChange?: (region: MapRegion) => void;
  /** Blue dot for the user, when location permission has been granted. */
  userLocation?: { latitude: number; longitude: number } | null;
  colorScheme: ThemeName;
  style?: object;
};
