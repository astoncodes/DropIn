import { userMessage } from '@dropin/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { supabase } from '../../lib/supabase';
import { date, label } from '../console/console-shared';
import { ReportPanel } from './report-panel';
import { TARGET_LABEL, groupReports } from './report-groups';
import type { Report, ReportGroup } from './report-groups';

/** Largest queue fetched at once; the oldest reports come first. */
const QUEUE_LIMIT = 500;

type StatusFilter = Report['status'];

const STATUS_OPTIONS: [StatusFilter, string][] = [
  ['open', 'Open reports'],
  ['actioned', 'Content removed'],
  ['dismissed', 'Dismissed'],
];

/**
 * The moderation queue: reported content grouped by what it is, oldest
 * first, each opening a panel to remove it or dismiss the reports.
 */
export function ReportsPage({ onSaved }: { onSaved: (message: string) => void }) {
  const [status, setStatus] = useState<StatusFilter>('open');
  const [selected, setSelected] = useState<ReportGroup | null>(null);

  const reports = useQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_reports')
        .select('*')
        .eq('status', status)
        .order('created_at')
        .limit(QUEUE_LIMIT);
      if (error) throw error;
      return data;
    },
  });
  const groups = useMemo(() => groupReports(reports.data ?? []), [reports.data]);

  const playerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const report of reports.data ?? []) {
      ids.add(report.target_user_id);
      if (report.reporter_id) ids.add(report.reporter_id);
    }
    return [...ids].sort();
  }, [reports.data]);
  const people = useQuery({
    queryKey: ['admin', 'report-people', playerIds],
    enabled: playerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', playerIds);
      if (error) throw error;
      return new Map(data.map((profile) => [profile.id, profile.display_name]));
    },
  });
  const names = people.data ?? new Map<string, string>();

  return (
    <>
      <div className="filters">
        <select
          aria-label="Report status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as StatusFilter);
            setSelected(null);
          }}
        >
          {STATUS_OPTIONS.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </div>
      {reports.isPending && (
        <div className="card" role="status">
          Loading reports…
        </div>
      )}
      {reports.error && (
        <div className="card error" role="alert">
          <p>{userMessage(reports.error, 'Could not load reports. Try again.')}</p>
          <button className="secondary" onClick={() => void reports.refetch()}>
            Try again
          </button>
        </div>
      )}
      {reports.data && (
        <section className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Reported content</th>
                <th>Reasons</th>
                <th>Reports</th>
                <th>First reported</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.key}>
                  <td>
                    <strong>
                      {TARGET_LABEL[group.targetKind]} by{' '}
                      {names.get(group.targetUserId) ?? 'Unknown player'}
                    </strong>
                    <small className="snapshot">{group.snapshot || 'No text'}</small>
                  </td>
                  <td>{group.reasons.map(label).join(', ')}</td>
                  <td>{group.reports.length}</td>
                  <td>{date(group.firstReportedAt)}</td>
                  <td>
                    <button className="secondary" onClick={() => setSelected(group)}>
                      {status === 'open' ? 'Review' : 'View decision'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {groups.length === 0 && (
            <div className="empty">
              <h2>{status === 'open' ? 'No open reports' : 'Nothing here yet'}</h2>
              <p>
                {status === 'open'
                  ? 'Reports from players appear here. Aim to review each within a day.'
                  : 'Resolved reports appear here with their decision.'}
              </p>
            </div>
          )}
          {reports.data.length === QUEUE_LIMIT && (
            <p className="hint">Showing the oldest {QUEUE_LIMIT} reports. Resolve these first.</p>
          )}
        </section>
      )}
      {selected && (
        <ReportPanel
          key={selected.key}
          group={selected}
          names={names}
          close={() => setSelected(null)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

/** Open-report count for the dashboard, so moderation work is never out of sight. */
export function OpenReportsSummary({ onOpen }: { onOpen: () => void }) {
  const count = useQuery({
    queryKey: ['admin', 'open-report-count'],
    queryFn: async () => {
      const { count: total, error } = await supabase
        .from('content_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open');
      if (error) throw error;
      return total ?? 0;
    },
  });
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <h2>Player reports</h2>
          <p className="hint">
            {count.isPending
              ? 'Checking for open reports…'
              : count.error
                ? 'Could not load the report count.'
                : count.data === 0
                  ? 'No open reports. Reported posts, messages, sessions and names appear here.'
                  : `${count.data} open ${count.data === 1 ? 'report needs' : 'reports need'} review.`}
          </p>
        </div>
        <button className={count.data ? undefined : 'secondary'} onClick={onOpen}>
          Review reports
        </button>
      </div>
    </section>
  );
}
