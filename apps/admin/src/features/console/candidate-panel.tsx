import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { coordinates } from '../../lib/location';
import { supabase } from '../../lib/supabase';
import { Panel } from './panel';
import { date, label } from './console-shared';
import type { Candidate } from './console-shared';

export function CandidatePanel({
  candidate: c,
  close,
  onSaved,
}: {
  candidate: Candidate;
  close: () => void;
  onSaved?: (message: string) => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(c.proposed_name);
  const [note, setNote] = useState('');
  const [target, setTarget] = useState('');
  const [decision, setDecision] = useState<'approve' | 'reject' | 'merge' | null>(null);
  const details = useQuery({
    queryKey: ['admin', 'candidate', c.id],
    queryFn: async () => {
      const [sports, matches, targets] = await Promise.all([
        supabase
          .from('venue_candidate_sports')
          .select('sport_id, sports(name)')
          .eq('candidate_id', c.id),
        supabase
          .from('venue_candidate_matches')
          .select('*, venues(name,address_text,status)')
          .eq('candidate_id', c.id)
          .order('score', { ascending: false }),
        supabase
          .from('venues')
          .select('id,name')
          .eq('region_id', c.region_id)
          .eq('status', 'active')
          .order('name')
          .limit(1000),
      ]);
      if (sports.error) throw sports.error;
      if (matches.error) throw matches.error;
      if (targets.error) throw targets.error;
      return { sports: sports.data, matches: matches.data, targets: targets.data };
    },
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error('Choose a decision');
      const { error } = await supabase.rpc('admin_review_candidate', {
        p_candidate_id: c.id,
        p_decision: decision,
        p_name: name.trim(),
        p_note: note.trim(),
        ...(decision === 'merge' ? { p_target_venue_id: target } : {}),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin'] });
      onSaved?.(
        decision === 'approve'
          ? 'Location approved and published.'
          : decision === 'merge'
            ? 'Submission linked to the existing location.'
            : 'Submission rejected.',
      );
      close();
    },
  });
  const point = coordinates(c.location);
  const pending = c.status === 'pending' || c.status === 'possible_duplicate';
  return (
    <Panel title="Review submission" close={close}>
      <span className="badge">{label(c.status)}</span>
      <h3>{c.proposed_name}</h3>
      <p>
        {c.address_text || 'No street address supplied'} · {label(c.indoor_state)}
      </p>
      <small>Submitted {date(c.created_at)}</small>
      {point ? (
        <div className="card wide">
          <strong>Submitted location</strong>
          <p>
            {point.lat.toFixed(6)}, {point.lon.toFixed(6)}
          </p>
          <a
            href={`https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lon}#map=18/${point.lat}/${point.lon}`}
            target="_blank"
            rel="noreferrer"
          >
            Inspect location on OpenStreetMap ↗
          </a>
        </div>
      ) : (
        <p className="error">
          Location could not be displayed. Check the submitted location before approving.
        </p>
      )}
      {details.isPending && <p role="status">Loading sports and duplicate evidence…</p>}
      {details.error && (
        <p className="error" role="alert">
          {details.error.message}
        </p>
      )}
      <p>{details.data?.sports.map((s) => s.sports?.name).join(' · ')}</p>
      <h3>Possible duplicates</h3>
      {details.data?.matches.length === 0 && (
        <p className="hint">
          No nearby matches were found when submitted. Compare existing venues before publishing.
        </p>
      )}
      {details.data?.matches.map((m) => (
        <div className="card wide" key={m.venue_id}>
          <strong>{m.venues?.name ?? m.venue_id}</strong>
          <p>
            {Math.round(m.distance_m)} m away · {m.shared_sport_count} shared sports ·{' '}
            {Math.round(m.name_similarity * 100)}% name similarity
          </p>
          <small>{m.venues?.address_text}</small>
          {pending && m.venues?.status === 'active' && (
            <button
              className="secondary"
              onClick={() => {
                setTarget(m.venue_id);
                setDecision('merge');
              }}
            >
              Use this venue
            </button>
          )}
        </div>
      ))}
      {!pending ? (
        <div className="card wide">
          <h3>Review outcome</h3>
          <p>{c.review_note || 'No review note'}</p>
          <small>{c.reviewed_at && date(c.reviewed_at)}</small>
          {c.published_venue_id && <small>Venue: {c.published_venue_id}</small>}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <label>
            Decision
            <select
              value={decision ?? ''}
              onChange={(e) => setDecision(e.target.value as typeof decision)}
              required
            >
              <option value="" disabled>
                Choose an action
              </option>
              <option value="approve">Approve new location</option>
              <option value="merge">Link existing location</option>
              <option value="reject">Reject submission</option>
            </select>
          </label>
          {decision === 'approve' && (
            <>
              <label>
                Published name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                />
              </label>
            </>
          )}
          {decision === 'merge' && (
            <label>
              Existing location
              <select required value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose a location</option>
                {details.data?.targets.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Review note {decision === 'reject' ? '(required)' : '(optional)'}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required={decision === 'reject'}
              maxLength={1000}
              rows={3}
            />
          </label>
          <p className="hint">
            {decision === 'approve'
              ? 'This publishes the location for players. Verify it separately after checking it.'
              : decision === 'merge'
                ? 'This adds the submitted name and sports to the selected location without creating a duplicate.'
                : decision === 'reject'
                  ? 'The submitter can see your reason. Explain what needs to change.'
                  : 'Choose how to handle this submission.'}{' '}
            Decisions are final and recorded in activity.
          </p>
          {mutation.error && (
            <p className="error" role="alert">
              {mutation.error.message}
            </p>
          )}
          <button
            disabled={
              mutation.isPending ||
              !decision ||
              !details.data ||
              (decision === 'approve' && (!point || name.trim().length < 2)) ||
              (decision === 'reject' && !note.trim()) ||
              (decision === 'merge' && !target)
            }
          >
            {mutation.isPending ? 'Saving decision…' : 'Confirm review decision'}
          </button>
        </form>
      )}
    </Panel>
  );
}
