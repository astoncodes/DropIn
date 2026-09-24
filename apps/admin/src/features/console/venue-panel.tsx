import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { supabase } from '../../lib/supabase';
import { Panel } from './panel';

import type { Sport, Venue } from './console-shared';

/**
 * Names the surviving venue rather than printing its UUID, which tells a
 * reviewer nothing. Merged venues are currently unreachable — nothing writes
 * `merged_into_venue_id` — so this renders only once a merge path exists.
 */
function MergedNotice({ venueId }: { venueId: string | null }) {
  const survivor = useQuery({
    queryKey: ['admin', 'venue-name', venueId],
    enabled: Boolean(venueId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venues')
        .select('name')
        .eq('id', venueId ?? '')
        .maybeSingle();
      if (error) throw error;
      return data?.name ?? null;
    },
  });
  if (!venueId) return <p>This venue is marked merged but names no target. It cannot be edited.</p>;
  if (survivor.isPending) return <p>This venue was merged. Loading the surviving venue…</p>;
  return (
    <p>
      This venue was merged into {survivor.data ?? 'another venue'} and cannot be edited. Edit that
      venue instead.
    </p>
  );
}

export function VenuePanel({
  venue: v,
  sports,
  close,
  onSaved,
}: {
  venue: Venue;
  sports: Sport[];
  close: () => void;
  onSaved?: (message: string) => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(v.name);
  const [address, setAddress] = useState(v.address_text ?? '');
  const [indoor, setIndoor] = useState(v.indoor_state);
  const [status, setStatus] = useState(v.status);
  const [verified, setVerified] = useState(v.verification_state === 'admin_verified');
  const [selected, setSelected] = useState<number[] | null>(null);
  const existing = useQuery({
    queryKey: ['admin', 'venue-sports', v.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_sports')
        .select('sport_id')
        .eq('venue_id', v.id);
      if (error) throw error;
      return data.map((s) => s.sport_id);
    },
  });
  const ids = selected ?? existing.data ?? [];
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_update_venue', {
        p_venue_id: v.id,
        p_name: name,
        p_address: address,
        p_indoor_state: indoor,
        p_status: status,
        p_verified: verified,
        p_sport_ids: ids,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin'] });
      onSaved?.('Location changes saved.');
      close();
    },
  });
  return (
    <Panel title="Manage venue" close={close}>
      {v.status === 'merged' ? (
        <MergedNotice venueId={v.merged_into_venue_id} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <label>
            Name
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Address
            <input maxLength={240} value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label>
            Setting
            <select value={indoor} onChange={(e) => setIndoor(e.target.value as typeof indoor)}>
              {['indoor', 'outdoor', 'unknown'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Publication
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="active">Active</option>
              <option value="removed">Removed from discovery</option>
            </select>
          </label>
          <fieldset>
            <legend>Sports</legend>
            {existing.isPending && <p>Loading…</p>}
            {existing.error && <p className="error">{existing.error.message}</p>}
            {sports.map((s) => (
              <label className="checkbox" key={s.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(s.id)}
                  onChange={(e) =>
                    setSelected(e.target.checked ? [...ids, s.id] : ids.filter((id) => id !== s.id))
                  }
                />
                {s.name}
              </label>
            ))}
          </fieldset>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            I have verified this venue
          </label>
          <p className="hint">
            Removing a venue hides it from venue discovery and preserves its history.
          </p>
          {mutation.error && (
            <p className="error" role="alert">
              {mutation.error.message}
            </p>
          )}
          <button disabled={mutation.isPending || !existing.data || !ids.length}>
            {mutation.isPending ? 'Saving…' : 'Save venue changes'}
          </button>
        </form>
      )}
    </Panel>
  );
}
