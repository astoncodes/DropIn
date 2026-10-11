import type { Enums } from '@dropin/database-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { UserFacingError } from '@dropin/shared';
import { supabase } from '../../lib/supabase';

export type ReportTarget = Enums<'report_target'>;
export type ReportReason = Enums<'report_reason'>;

/** What a report is about, and who wrote it. */
export type ModerationSubject = {
  kind: ReportTarget;
  id: string;
  authorId: string;
  authorName: string;
};

/**
 * Report reasons in the order people scan for them: the common problems first,
 * safety-critical ones next, the catch-all last.
 */
export const REPORT_REASONS: readonly { value: ReportReason; label: string; detail: string }[] = [
  { value: 'spam', label: 'Spam or scam', detail: 'Advertising, fake offers or repeated junk' },
  {
    value: 'harassment',
    label: 'Harassment or bullying',
    detail: 'Targeting, insulting or intimidating someone',
  },
  { value: 'hate', label: 'Hate speech', detail: 'Attacks on people for who they are' },
  {
    value: 'sexual_content',
    label: 'Sexual content or nudity',
    detail: 'Explicit images, messages or requests',
  },
  { value: 'violence', label: 'Violence or threats', detail: 'Threats, or glorifying violence' },
  { value: 'self_harm', label: 'Self-harm or suicide', detail: 'Someone may be at risk' },
  { value: 'illegal', label: 'Illegal activity', detail: 'Drugs, weapons or other crimes' },
  {
    value: 'impersonation',
    label: 'Impersonation',
    detail: 'Pretending to be someone else',
  },
  { value: 'other', label: 'Something else', detail: 'Anything else that breaks the guidelines' },
];

/** How each kind of content is named in report copy: "Report this post". */
export const REPORT_TARGET_NOUN: Record<ReportTarget, string> = {
  session_post: 'post',
  session_message: 'message',
  run_session: 'session',
  profile: 'profile',
};

/** Every query that renders another player's content and must refetch after a block. */
const CONTENT_QUERIES = ['community-feed', 'session-messages', 'joined-sessions'] as const;

export function useBlockedPlayers(userId: string | undefined) {
  return useQuery({
    queryKey: ['blocked-players', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const blocks = await supabase
        .from('user_blocks')
        .select('blocked_id, created_at')
        .order('created_at', { ascending: false });
      if (blocks.error) throw blocks.error;
      const ids = (blocks.data ?? []).map((block) => block.blocked_id);
      if (ids.length === 0) return [];
      const profiles = await supabase.from('profiles').select('id, display_name').in('id', ids);
      if (profiles.error) throw profiles.error;
      const names = new Map(
        (profiles.data ?? []).map((profile) => [profile.id, profile.display_name]),
      );
      return (blocks.data ?? []).map((block) => ({
        playerId: block.blocked_id,
        name: names.get(block.blocked_id) ?? 'Drop In player',
        blockedAt: block.created_at,
      }));
    },
  });
}

export function useBlockPlayer(userId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (playerId: string) => {
      if (!userId) throw new UserFacingError('Sign in to block players.');
      const { error } = await supabase
        .from('user_blocks')
        .upsert(
          { blocker_id: userId, blocked_id: playerId },
          { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
        );
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all(
        [...CONTENT_QUERIES, 'blocked-players'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

export function useUnblockPlayer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (playerId: string) => {
      const { error } = await supabase.from('user_blocks').delete().eq('blocked_id', playerId);
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all(
        [...CONTENT_QUERIES, 'blocked-players'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

export function useReportContent() {
  return useMutation({
    mutationFn: async (input: {
      subject: ModerationSubject;
      reason: ReportReason;
      details: string;
    }) => {
      const { data, error } = await supabase.rpc('report_content', {
        p_target_kind: input.subject.kind,
        p_target_id: input.subject.id,
        p_reason: input.reason,
        p_details: input.details.trim() || undefined,
      });
      if (error) throw error;
      return data;
    },
  });
}
