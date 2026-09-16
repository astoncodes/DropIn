import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import { CandidatePanel } from './candidate-panel';
import { VenuePanel } from './venue-panel';
import { label, date, pages } from './console-shared';
import type { Candidate, Page, Venue } from './console-shared';

export function AdminConsole() {
  const [page, setPage] = useState<Page>('Overview');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('pending');
  const [venueFilter, setVenueFilter] = useState<'all' | 'active' | 'unverified'>('all');
  const [region, setRegion] = useState('');
  const [offset, setOffset] = useState(0);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const client = useQueryClient();
  const lookups = useQuery({
    queryKey: ['admin', 'lookups'],
    queryFn: async () => {
      const [regions, sports] = await Promise.all([
        supabase.from('regions').select('*').order('name'),
        supabase.from('sports').select('*').order('name'),
      ]);
      if (regions.error) throw regions.error;
      if (sports.error) throw sports.error;
      return { regions: regions.data, sports: sports.data };
    },
  });
  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const results = await Promise.all([
        supabase
          .from('venue_candidates')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'possible_duplicate']),
        supabase.from('venues').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase
          .from('venue_candidates')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'possible_duplicate'),
        supabase
          .from('venues')
          .select('id', { count: 'exact', head: true })
          .eq('verification_state', 'unverified')
          .eq('status', 'active'),
      ]);
      results.forEach((result) => {
        if (result.error) throw result.error;
      });
      return results.map((result) => result.count ?? 0);
    },
  });
  const candidates = useQuery({
    queryKey: ['admin', 'candidates', search, status, region, offset],
    enabled: page === 'Review queue',
    queryFn: async () => {
      let q = supabase
        .from('venue_candidates')
        .select('*', { count: 'exact' })
        .order('created_at')
        .order('id')
        .range(offset, offset + 24);
      if (status === 'pending') q = q.in('status', ['pending', 'possible_duplicate']);
      else if (status) q = q.eq('status', status as Candidate['status']);
      if (region) q = q.eq('region_id', Number(region));
      if (search.trim()) q = q.ilike('proposed_name', `%${search.trim()}%`);
      const result = await q;
      if (result.error) throw result.error;
      return result;
    },
  });
  const venues = useQuery({
    queryKey: ['admin', 'venues', search, region, offset, venueFilter],
    enabled: page === 'Venues',
    queryFn: async () => {
      let q = supabase
        .from('venues')
        .select('*', { count: 'exact' })
        .order('name')
        .order('id')
        .range(offset, offset + 24);
      if (region) q = q.eq('region_id', Number(region));
      if (search.trim()) q = q.ilike('name', `%${search.trim()}%`);
      if (venueFilter !== 'all') q = q.eq('status', 'active');
      if (venueFilter === 'unverified') q = q.eq('verification_state', 'unverified');
      const result = await q;
      if (result.error) throw result.error;
      return result;
    },
  });
  const audit = useQuery({
    queryKey: ['admin', 'audit', offset],
    enabled: page === 'Audit history',
    queryFn: async () => {
      const result = await supabase
        .from('admin_audit_log')
        .select('*', { count: 'exact' })
        .order('id', { ascending: false })
        .range(offset, offset + 24);
      if (result.error) throw result.error;
      return result;
    },
  });
  function navigate(next: Page) {
    setPage(next);
    setOffset(0);
    setSearch('');
    setVenueFilter('all');
    setCandidate(null);
    setVenue(null);
  }
  const active =
    page === 'Review queue'
      ? candidates
      : page === 'Venues'
        ? venues
        : page === 'Audit history'
          ? audit
          : null;
  const regionName = (id: number) => lookups.data?.regions.find((r) => r.id === id)?.name ?? '—';
  return (
    <div className="console">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('Overview');
          }}
        >
          <span className="brand-icon">D</span> Drop In <small>ADMIN</small>
        </a>
        <p className="eyebrow">WORKSPACE</p>
        <nav aria-label="Admin navigation">
          {pages.map((p) => (
            <button
              key={p}
              className={page === p ? 'nav-link selected' : 'nav-link'}
              onClick={() => navigate(p)}
              aria-current={page === p ? 'page' : undefined}
            >
              {p}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" /> Connected to Supabase
          <p>Every venue starts with a human review.</p>
        </div>
      </aside>
      <div className="workspace">
        <header className="page-heading">
          <div>
            <p className="eyebrow">DROP IN / OPERATIONS</p>
            <h1>{page}</h1>
            <p className="hint">
              {page === 'Overview'
                ? 'A clear view of your sports community.'
                : page === 'Review queue'
                  ? 'Review submissions and resolve possible duplicates.'
                  : page === 'Venues'
                    ? 'Keep published places accurate and useful.'
                    : page === 'Audit history'
                      ? 'A record of admin decisions and venue changes.'
                      : 'Configured coverage and the sports your community plays.'}
            </p>
          </div>
          <button
            className="secondary"
            onClick={() => void client.invalidateQueries({ queryKey: ['admin'] })}
          >
            Refresh data
          </button>
        </header>
        {lookups.error && (
          <p role="alert" className="error">
            {lookups.error.message}
          </p>
        )}
        {page === 'Overview' && (
          <>
            {stats.error && (
              <p className="error" role="alert">
                {stats.error.message}
              </p>
            )}
            <div className="stats">
              {['Awaiting review', 'Active venues', 'Possible duplicates', 'Unverified venues'].map(
                (title, i) => (
                  <button
                    className="stat"
                    key={title}
                    onClick={() => {
                      navigate(i % 2 === 0 ? 'Review queue' : 'Venues');
                      setStatus(i === 2 ? 'possible_duplicate' : 'pending');
                      if (i === 1 || i === 3) setVenueFilter(i === 3 ? 'unverified' : 'active');
                    }}
                  >
                    <span>{title}</span>
                    <strong>{stats.data?.[i] ?? '—'}</strong>
                    <small>View records ↗</small>
                  </button>
                ),
              )}
            </div>
            <section className="card wide welcome">
              <p className="eyebrow">MAKE ROOM FOR THE NEXT GAME</p>
              <h2>Good games need good places.</h2>
              <p>
                Check new submissions, compare nearby venues, and help players find a reliable place
                to play.
              </p>
              <button onClick={() => navigate('Review queue')}>Open review queue →</button>
            </section>
            <section className="card wide">
              <h2>Your workflow</h2>
              <div className="workflow">
                <p>
                  <b>01 · Review</b>
                  <br />
                  Check the submitted name, location, and sports.
                </p>
                <p>
                  <b>02 · Compare</b>
                  <br />
                  Inspect suggested duplicates before publishing.
                </p>
                <p>
                  <b>03 · Maintain</b>
                  <br />
                  Update venues and verify the places you know.
                </p>
              </div>
            </section>
          </>
        )}
        {(page === 'Review queue' || page === 'Venues') && (
          <div className="filters">
            <input
              aria-label="Search by name"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
            <select
              aria-label="Region"
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All regions</option>
              {lookups.data?.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {page === 'Venues' && (
              <select
                aria-label="Venue filter"
                value={venueFilter}
                onChange={(event) => {
                  setVenueFilter(event.target.value as 'all' | 'active' | 'unverified');
                  setOffset(0);
                }}
              >
                <option value="all">All venues</option>
                <option value="active">Active venues</option>
                <option value="unverified">Unverified active venues</option>
              </select>
            )}
            {page === 'Review queue' && (
              <select
                aria-label="Review status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setOffset(0);
                }}
              >
                {[
                  ['pending', 'Awaiting review'],
                  ['possible_duplicate', 'Possible duplicates'],
                  ['approved', 'Approved'],
                  ['merged', 'Merged'],
                  ['rejected', 'Rejected'],
                  ['', 'All submissions'],
                ].map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {active?.isPending && (
          <div className="card wide" role="status">
            Loading records…
          </div>
        )}
        {active?.error && (
          <div className="card wide error" role="alert">
            {active.error.message}
            <button className="secondary" onClick={() => void active.refetch()}>
              Try again
            </button>
          </div>
        )}
        {page === 'Review queue' && candidates.data && (
          <section className="card wide table-card">
            <table>
              <thead>
                <tr>
                  <th>Submission</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {candidates.data.data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.proposed_name}</strong>
                      <small>{c.address_text || 'No address provided'}</small>
                    </td>
                    <td>{regionName(c.region_id)}</td>
                    <td>
                      <span className={`badge ${c.status}`}>{label(c.status)}</span>
                    </td>
                    <td>{date(c.created_at)}</td>
                    <td>
                      <button className="secondary" onClick={() => setCandidate(c)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!candidates.data.data.length && (
              <div className="empty">
                <h2>No submissions here</h2>
                <p>New venue submissions will appear here. Try another filter.</p>
              </div>
            )}
          </section>
        )}
        {page === 'Venues' && venues.data && (
          <section className="card wide table-card">
            <table>
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Verification</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {venues.data.data.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.name}</strong>
                      <small>{v.address_text || label(v.indoor_state)}</small>
                    </td>
                    <td>{regionName(v.region_id)}</td>
                    <td>
                      <span className="badge">{v.status}</span>
                    </td>
                    <td>{label(v.verification_state)}</td>
                    <td>
                      <button className="secondary" onClick={() => setVenue(v)}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!venues.data.data.length && (
              <div className="empty">
                <h2>No venues found</h2>
                <p>Approve a submission to publish your first venue, or adjust your search.</p>
              </div>
            )}
          </section>
        )}
        {page === 'Regions & sports' && (
          <div className="reference-grid">
            <section className="card wide">
              <h2>Regions</h2>
              {lookups.isPending && <p>Loading…</p>}
              {lookups.data?.regions.map((r) => (
                <div className="reference-row" key={r.id}>
                  <div>
                    <strong>{r.name}</strong>
                    <small>{r.timezone}</small>
                  </div>
                  <span className="badge">{r.is_published ? 'Published' : 'Unpublished'}</span>
                </div>
              ))}
            </section>
            <section className="card wide">
              <h2>Sports</h2>
              {lookups.data?.sports.map((s) => (
                <div className="reference-row" key={s.id}>
                  <strong>{s.name}</strong>
                  <span className="badge">{s.is_active ? 'Active' : 'Inactive'}</span>
                </div>
              ))}
            </section>
          </div>
        )}
        {page === 'Audit history' && audit.data && (
          <section className="card wide">
            {!audit.data.data.length && (
              <div className="empty">
                <h2>No decisions yet</h2>
                <p>Review decisions and venue edits will be recorded here.</p>
              </div>
            )}
            {audit.data.data.map((a) => (
              <article className="audit-row" key={a.id}>
                <strong>{label(a.action)}</strong>
                <small>
                  {date(a.created_at)} · Actor {a.actor_id ?? 'Deleted account'}
                </small>
                <small>Record {a.entity_id}</small>
                <details>
                  <summary>Change details</summary>
                  <pre>{JSON.stringify(a.details, null, 2)}</pre>
                </details>
              </article>
            ))}
          </section>
        )}
        {active?.data && (
          <div className="pagination">
            <span>
              {active.data.count ?? 0} records · Page {offset / 25 + 1}
            </span>
            <button
              className="secondary"
              disabled={offset === 0}
              onClick={() => setOffset((n) => Math.max(0, n - 25))}
            >
              Previous
            </button>
            <button
              className="secondary"
              disabled={offset + 25 >= (active.data.count ?? 0)}
              onClick={() => setOffset((n) => n + 25)}
            >
              Next
            </button>
          </div>
        )}
      </div>
      {candidate && (
        <CandidatePanel key={candidate.id} candidate={candidate} close={() => setCandidate(null)} />
      )}
      {venue && lookups.data && (
        <VenuePanel
          key={venue.id}
          venue={venue}
          sports={lookups.data.sports}
          close={() => setVenue(null)}
        />
      )}
    </div>
  );
}
