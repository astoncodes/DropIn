import type { Database } from '@dropin/database-types';

export type Report = Database['public']['Tables']['content_reports']['Row'];
export type ReportTarget = Report['target_kind'];
export type ReportReason = Report['reason'];

/** Every report about one piece of content, which a moderator decides on once. */
export type ReportGroup = {
  key: string;
  targetKind: ReportTarget;
  targetId: string;
  targetUserId: string;
  reports: Report[];
  /** Distinct reasons, most reported first. */
  reasons: ReportReason[];
  firstReportedAt: string;
  /** The most recent copy of the content a reporter saw. */
  snapshot: string | null;
};

/**
 * Groups reports by what they are about. admin_resolve_reports() decides every
 * open report on a target together, so the queue shows targets, not reports.
 */
export function groupReports(reports: readonly Report[]): ReportGroup[] {
  const groups = new Map<string, Report[]>();
  for (const item of reports) {
    const key = `${item.target_kind}:${item.target_id}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()]
    .map(([key, items]) => {
      const byTime = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const first = byTime[0]!;
      const latest = byTime[byTime.length - 1]!;
      const counts = new Map<ReportReason, number>();
      for (const item of items) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
      return {
        key,
        targetKind: first.target_kind,
        targetId: first.target_id,
        targetUserId: first.target_user_id,
        reports: items,
        reasons: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([reason]) => reason),
        firstReportedAt: first.created_at,
        snapshot: latest.content_snapshot,
      };
    })
    .sort((a, b) => a.firstReportedAt.localeCompare(b.firstReportedAt));
}

/** How each kind of content is named to moderators. */
export const TARGET_LABEL: Record<ReportTarget, string> = {
  session_post: 'Post',
  session_message: 'Chat message',
  run_session: 'Session',
  profile: 'Profile name',
};

/** What "Remove" does for each kind, shown before the moderator confirms. */
export const REMOVAL_EFFECT: Record<ReportTarget, string> = {
  session_post: 'Deletes the post and its photos or clips for everyone.',
  session_message: 'Deletes the message from the session chat.',
  run_session:
    'Removes the session series from discovery and cancels its upcoming dates. Past chat stays for its members.',
  profile: 'Resets the display name to “Drop In player”.',
};
