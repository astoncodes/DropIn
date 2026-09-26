import type { FunctionReturns } from '@dropin/database-types';
import type { IndoorState } from '@dropin/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import { UserFacingError } from '../../lib/errors';

export type VenueSubmissionInput = {
  name: string;
  latitude: number;
  longitude: number;
  sportIds: number[];
  indoorState: IndoorState;
  addressText?: string;
};

export type VenueSubmissionResult = FunctionReturns<'submit_venue'>[number];

export function useSubmitVenue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: VenueSubmissionInput): Promise<VenueSubmissionResult> => {
      const { data, error } = await supabase.rpc('submit_venue', {
        p_name: input.name,
        p_lat: input.latitude,
        p_lon: input.longitude,
        p_sport_ids: input.sportIds,
        p_indoor_state: input.indoorState,
        p_address_text: input.addressText,
      });
      if (error) throw error;
      if (!data?.[0]) throw new UserFacingError('The submission did not return a confirmation.');
      return data[0];
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['own-venue-submissions'] }),
  });
}

export function useOwnVenueSubmissions(userId?: string) {
  const pageSize = 25;
  return useInfiniteQuery({
    queryKey: ['own-venue-submissions', userId],
    enabled: Boolean(userId),
    initialPageParam: 0,
    refetchInterval: 30_000,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase
        .from('venue_candidates')
        .select('id,proposed_name,status,created_at,reviewed_at,review_note,published_venue_id')
        .eq('submitted_by', userId!)
        .order('created_at', { ascending: false })
        .order('id')
        .range(pageParam, pageParam + pageSize - 1);
      if (error) throw error;
      return data;
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === pageSize ? pages.length * pageSize : undefined,
  });
}
