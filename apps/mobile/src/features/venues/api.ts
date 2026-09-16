import type { FunctionReturns, Tables } from '@dropin/database-types';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import { runWindowDays } from './run-window';
import type { RunWindow } from './run-window';

/**
 * Read access for venues and live activity.
 *
 * Every aggregate comes from a database function rather than being assembled
 * client-side. Two clients counting players from raw rows is two clients that
 * will eventually disagree about how many people are on a court.
 */

export type NearbyVenue = FunctionReturns<'nearby_venues'>[number];
export type VenueDetail = FunctionReturns<'venue_details'>[number];
export type VenueActivity = FunctionReturns<'venue_activity'>[number];
export type UpcomingRun = FunctionReturns<'upcoming_runs'>[number];
export type Sport = Tables<'sports'>;

export function useSports() {
  return useQuery({
    queryKey: ['sports'],
    // Sports change when the owners decide to add one, not during a session.
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Sport[]> => {
      const { data, error } = await supabase.from('sports').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useNearbyVenues(params: {
  latitude: number;
  longitude: number;
  sportIds: number[];
  radiusM?: number;
  enabled?: boolean;
}) {
  const { latitude, longitude, sportIds, radiusM = 8000, enabled = true } = params;

  return useQuery({
    // Coordinates are rounded into the key so panning the map by a few metres
    // does not refetch on every frame.
    queryKey: [
      'nearby-venues',
      latitude.toFixed(3),
      longitude.toFixed(3),
      radiusM,
      [...sportIds].sort().join(','),
    ],
    enabled,
    // Mutation invalidation refreshes own actions; polling reconciles other
    // players and expiry without depending on a cleanup job.
    staleTime: 20_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<NearbyVenue[]> => {
      const { data, error } = await supabase.rpc('nearby_venues', {
        p_lat: latitude,
        p_lon: longitude,
        p_radius_m: radiusM,
        p_sport_ids: sportIds.length > 0 ? sportIds : undefined,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useVenueDetail(venueId: string | undefined) {
  return useQuery({
    queryKey: ['venue', venueId],
    refetchInterval: 15_000,
    enabled: Boolean(venueId),
    staleTime: 20_000,
    queryFn: async (): Promise<VenueDetail | null> => {
      const { data, error } = await supabase.rpc('venue_details', { p_venue_id: venueId! });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useVenueActivity(venueId: string | undefined) {
  return useQuery({
    queryKey: ['venue-activity', venueId],
    enabled: Boolean(venueId),
    staleTime: 15_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<VenueActivity[]> => {
      const { data, error } = await supabase.rpc('venue_activity', { p_venue_id: venueId! });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useVenueConditions(venueId: string | undefined) {
  return useQuery({
    queryKey: ['venue-conditions', venueId],
    enabled: Boolean(venueId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_conditions')
        .select('id, kind, note, expires_at, created_at')
        .eq('venue_id', venueId!)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpcomingRuns(params: {
  sportIds?: number[];
  venueId?: string;
  days?: number;
  /** Which bound applies. Defaults to the public discovery window. */
  window?: RunWindow;
  enabled?: boolean;
}) {
  const { sportIds = [], venueId, days, window = 'discovery', enabled = true } = params;
  const boundedDays = runWindowDays(window, days);

  return useQuery({
    queryKey: ['upcoming-runs', venueId ?? 'all', [...sportIds].sort().join(','), boundedDays],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<UpcomingRun[]> => {
      const { data, error } = await supabase.rpc('upcoming_runs', {
        p_sport_ids: sportIds.length > 0 ? sportIds : undefined,
        p_venue_id: venueId,
        p_days: boundedDays,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
