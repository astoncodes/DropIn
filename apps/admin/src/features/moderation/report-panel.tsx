import { MODERATION, userMessage } from '@dropin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { supabase } from '../../lib/supabase';
import { Panel } from '../console/panel';
import { date, label } from '../console/console-shared';
import { REMOVAL_EFFECT, TARGET_LABEL } from './report-groups';
import type { ReportGroup } from './report-groups';

type Decision = 'remove' | 'dismiss';

/**
 * One reported item: what was reported, every report about it, and the
 * decision. Removing a post deletes its database rows first, then its files
 * through the Storage API; if the file step fails the content is already gone
 * from the app, and the panel stays open with a retry for the files.
 */
export function ReportPanel({
  group,
  names,
  close,
  onSaved,
}: {
  group: ReportGroup;
  names: Map<string, string>;
  close: () => void;
  onSaved: (message: string) => void;
}) {
  const client = useQueryClient();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [filesLeft, setFilesLeft] = useState<string[]>([]);
  const open = group.reports.some((report) => report.status === 'open');
  const author = names.get(group.targetUserId) ?? 'Unknown player';

  const media = useQuery({
    queryKey: ['admin', 'report-media', group.targetId],
    enabled: group.targetKind === 'session_post',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_media')
        .select('id, kind, storage_path')
        .eq('post_id', group.targetId);
      if (error) throw error;
      return data.map((item) => ({
        ...item,
        url: item.storage_path
          ? supabase.storage.from('session-media').getPublicUrl(item.storage_path).data.publicUrl
          : null,
      }));
    },
  });

  const resolve = useMutation({
    mutationFn: async (chosen: Decision) => {
      const { data, error } = await supabase.rpc('admin_resolve_reports', {
        p_target_kind: group.targetKind,
        p_target_id: group.targetId,
        p_action: chosen,
        p_note: note.trim() || undefined,
      });
      if (error) throw error;
      const paths = (data ?? []).map((row) => row.storage_path).filter(Boolean);
      if (paths.length === 0) return [];
      const removed = await supabase.storage.from('session-media').remove(paths);
      return removed.error ? paths : [];
    },
    onSuccess: async (remaining, chosen) => {
      await client.invalidateQueries({ queryKey: ['admin'] });
      if (remaining.length > 0) {
        setFilesLeft(remaining);
        return;
      }
      onSaved(chosen === 'remove' ? 'Content removed and reports closed.' : 'Reports dismissed.');
      close();
    },
  });

  const retryFiles = useMutation({
    mutationFn: async () => {
      const removed = await supabase.storage.from('session-media').remove(filesLeft);
      if (removed.error) throw removed.error;
    },
    onSuccess: () => {
      onSaved('Content removed and its files deleted.');
      close();
    },
  });

  return (
    <Panel title="Review report" close={close}>
      <span className="badge">{TARGET_LABEL[group.targetKind]}</span>
      <h3 className="subject">
        {group.reports.length} {group.reports.length === 1 ? 'report' : 'reports'} about {author}’s{' '}
        {TARGET_LABEL[group.targetKind].toLowerCase()}
      </h3>
      <small>First reported {date(group.firstReportedAt)}</small>

      <div className="card">
        <strong>What the reporter saw</strong>
        <p className="reported-content">{group.snapshot || 'No text — see media below.'}</p>
        {media.data?.map((item) =>
          item.url ? (
            item.kind === 'video' ? (
              <video key={item.id} className="reported-media" src={item.url} controls muted />
            ) : (
              <img
                key={item.id}
                className="reported-media"
                src={item.url}
                alt="Reported upload"
                loading="lazy"
              />
            )
          ) : null,
        )}
        {media.error && (
          <p className="error" role="alert">
            {userMessage(media.error, 'Could not load the post’s media. Try again.')}
          </p>
        )}
      </div>

      <h3>Reports</h3>
      {group.reports.map((report) => (
        <div className="card" key={report.id}>
          <strong>{label(report.reason)}</strong>
          {report.details && <p>“{report.details}”</p>}
          <small>
            {report.reporter_id
              ? (names.get(report.reporter_id) ?? 'Unknown player')
              : 'Deleted account'}{' '}
            · {date(report.created_at)}
          </small>
          {!open && (
            <small>
              {label(report.status)}
              {report.resolved_at ? ` ${date(report.resolved_at)}` : ''}
              {report.resolution_note ? ` · ${report.resolution_note}` : ''}
            </small>
          )}
        </div>
      ))}

      {filesLeft.length > 0 ? (
        <div className="card error" role="alert">
          <p>
            The content is removed from Drop In, but {filesLeft.length} file
            {filesLeft.length === 1 ? '' : 's'} could not be deleted from storage. Retry so the file
            links stop working.
          </p>
          {retryFiles.error && (
            <p>{userMessage(retryFiles.error, 'The files could not be deleted. Try again.')}</p>
          )}
          <button onClick={() => retryFiles.mutate()} disabled={retryFiles.isPending}>
            {retryFiles.isPending ? 'Deleting files…' : 'Retry file deletion'}
          </button>
        </div>
      ) : open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (decision) resolve.mutate(decision);
          }}
        >
          <fieldset>
            <legend>Decision</legend>
            <div className="decision-options">
              <label>
                <input
                  type="radio"
                  name="decision"
                  value="remove"
                  checked={decision === 'remove'}
                  onChange={() => setDecision('remove')}
                />
                Remove content
              </label>
              <label>
                <input
                  type="radio"
                  name="decision"
                  value="dismiss"
                  checked={decision === 'dismiss'}
                  onChange={() => setDecision('dismiss')}
                />
                Dismiss reports
              </label>
            </div>
          </fieldset>
          <p className="hint">
            {decision === 'remove'
              ? `${REMOVAL_EFFECT[group.targetKind]} Every open report on it is closed.`
              : decision === 'dismiss'
                ? 'Keeps the content and closes every open report on it. Use this when it does not break the community guidelines.'
                : 'Choose whether this breaks the community guidelines.'}{' '}
            Reporters are never named to the player. Decisions are final and recorded in activity.
          </p>
          <label>
            Moderator note (optional)
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={MODERATION.resolutionNoteMaxLength}
              rows={3}
            />
          </label>
          {resolve.error && (
            <p className="error" role="alert">
              {userMessage(resolve.error, 'Could not save this decision. Try again.')}
            </p>
          )}
          <button
            className={decision === 'remove' ? 'danger' : undefined}
            disabled={!decision || resolve.isPending}
          >
            {resolve.isPending
              ? 'Saving decision…'
              : decision === 'remove'
                ? 'Remove content'
                : 'Confirm decision'}
          </button>
        </form>
      ) : null}
    </Panel>
  );
}
