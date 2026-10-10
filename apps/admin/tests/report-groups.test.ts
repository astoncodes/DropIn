import { describe, expect, it } from 'vitest';

import { groupReports } from '../src/features/moderation/report-groups';
import type { Report } from '../src/features/moderation/report-groups';

const report = (overrides: Partial<Report>): Report => ({
  id: 'r',
  reporter_id: 'reporter-1',
  target_kind: 'session_post',
  target_id: 'post-1',
  target_user_id: 'author-1',
  reason: 'spam',
  details: null,
  content_snapshot: 'Buy cheap shoes',
  status: 'open',
  created_at: '2026-09-26T10:00:00Z',
  resolved_at: null,
  resolved_by: null,
  resolution_note: null,
  ...overrides,
});

describe('groupReports', () => {
  it('puts every report about the same content in one group', () => {
    const groups = groupReports([
      report({ id: 'a', reason: 'spam' }),
      report({ id: 'b', reason: 'harassment', reporter_id: 'reporter-2' }),
      report({ id: 'c', target_kind: 'session_message', target_id: 'message-1' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.targetId === 'post-1')?.reports.map((r) => r.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('keeps the same id under different kinds apart', () => {
    const groups = groupReports([
      report({ id: 'a', target_kind: 'profile', target_id: 'author-1' }),
      report({ id: 'b', target_kind: 'run_session', target_id: 'author-1' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('lists each reason once, most reported first', () => {
    const [group] = groupReports([
      report({ id: 'a', reason: 'harassment' }),
      report({ id: 'b', reason: 'spam' }),
      report({ id: 'c', reason: 'spam' }),
    ]);
    expect(group?.reasons).toEqual(['spam', 'harassment']);
  });

  it('orders the queue oldest first so nothing waits forever', () => {
    const groups = groupReports([
      report({ id: 'new', target_id: 'post-2', created_at: '2026-09-26T12:00:00Z' }),
      report({ id: 'old', target_id: 'post-1', created_at: '2026-09-26T08:00:00Z' }),
    ]);
    expect(groups.map((g) => g.targetId)).toEqual(['post-1', 'post-2']);
  });

  it('shows the latest snapshot the moderators have', () => {
    const [group] = groupReports([
      report({ id: 'a', created_at: '2026-09-26T08:00:00Z', content_snapshot: 'first' }),
      report({ id: 'b', created_at: '2026-09-26T09:00:00Z', content_snapshot: 'edited' }),
    ]);
    expect(group?.snapshot).toBe('edited');
    expect(group?.firstReportedAt).toBe('2026-09-26T08:00:00Z');
  });
});
