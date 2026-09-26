import type { Tables } from '@dropin/database-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import { UserFacingError } from '../../lib/errors';

type RunSession = Tables<'run_sessions'>;
type SessionPost = Tables<'session_posts'>;
type SessionMedia = Tables<'session_media'>;
type SessionMessage = Tables<'session_messages'>;

export type FeedPost = SessionPost & {
  authorName: string;
  media: (SessionMedia & { url: string })[];
  session: RunSession;
  sessionTitle: string;
  venueName: string;
  sportName: string;
  sportSlug: string;
};

export type JoinedSession = RunSession & {
  title: string;
  venueName: string;
  sportName: string;
  sportSlug: string;
  lastMessage: SessionMessage | null;
};

function publicMediaUrl(item: SessionMedia) {
  if (item.remote_url) return item.remote_url;
  return supabase.storage.from('session-media').getPublicUrl(item.storage_path!).data.publicUrl;
}

async function sessionLabels(sessions: RunSession[]) {
  const seriesIds = [...new Set(sessions.map((item) => item.run_series_id))];
  const venueIds = [
    ...new Set(sessions.map((item) => item.venue_id).filter((id): id is string => id !== null)),
  ];
  const sportIds = [...new Set(sessions.map((item) => item.sport_id))];
  const [series, venues, sports] = await Promise.all([
    supabase.from('run_series').select('id,title,organizer_id,timezone').in('id', seriesIds),
    venueIds.length
      ? supabase.from('venues').select('id,name').in('id', venueIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('sports').select('id,name,slug').in('id', sportIds),
  ]);
  if (series.error) throw series.error;
  if (venues.error) throw venues.error;
  if (sports.error) throw sports.error;

  return {
    series: new Map((series.data ?? []).map((item) => [item.id, item])),
    venues: new Map((venues.data ?? []).map((item) => [item.id, item.name])),
    sports: new Map((sports.data ?? []).map((item) => [item.id, item])),
  };
}

export function useCommunityFeed(regionId?: number, sessionId?: string) {
  return useQuery({
    queryKey: ['community-feed', regionId ?? 'all', sessionId ?? 'all'],
    staleTime: 30_000,
    queryFn: async (): Promise<FeedPost[]> => {
      let postsQuery = supabase
        .from('session_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (sessionId) postsQuery = postsQuery.eq('session_id', sessionId);
      const postsResult = await postsQuery;
      if (postsResult.error) throw postsResult.error;
      const posts = postsResult.data ?? [];
      if (posts.length === 0) return [];

      const sessionResult = await supabase
        .from('run_sessions')
        .select('*')
        .in('id', [...new Set(posts.map((post) => post.session_id))]);
      if (sessionResult.error) throw sessionResult.error;
      const sessions = (sessionResult.data ?? []).filter(
        (item) => regionId == null || item.region_id === regionId,
      );
      const sessionById = new Map(sessions.map((item) => [item.id, item]));
      const visiblePosts = posts.filter((post) => sessionById.has(post.session_id));
      if (visiblePosts.length === 0) return [];

      const [mediaResult, profilesResult, labels] = await Promise.all([
        supabase
          .from('session_media')
          .select('*')
          .in(
            'post_id',
            visiblePosts.map((post) => post.id),
          ),
        supabase
          .from('profiles')
          .select('id,display_name')
          .in('id', [...new Set(visiblePosts.map((post) => post.author_id))]),
        sessionLabels(sessions),
      ]);
      if (mediaResult.error) throw mediaResult.error;
      if (profilesResult.error) throw profilesResult.error;
      const profileById = new Map(
        (profilesResult.data ?? []).map((profile) => [profile.id, profile.display_name]),
      );

      return visiblePosts.map((post) => {
        const session = sessionById.get(post.session_id)!;
        const sport = labels.sports.get(session.sport_id);
        return {
          ...post,
          authorName: profileById.get(post.author_id) ?? 'Drop In player',
          media: (mediaResult.data ?? [])
            .filter((item) => item.post_id === post.id)
            .map((item) => ({ ...item, url: publicMediaUrl(item) })),
          session,
          sessionTitle:
            session.title ?? labels.series.get(session.run_series_id)?.title ?? 'Pickup session',
          venueName:
            session.location_name ??
            (session.venue_id ? labels.venues.get(session.venue_id) : null) ??
            'Meeting spot',
          sportName: sport?.name ?? 'Sport',
          sportSlug: sport?.slug ?? '',
        };
      });
    },
  });
}

export function useJoinedSessions(userId?: string) {
  return useQuery({
    queryKey: ['joined-sessions', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<JoinedSession[]> => {
      const memberships = await supabase
        .from('session_memberships')
        .select('session_id')
        .eq('user_id', userId!);
      if (memberships.error) throw memberships.error;
      const ids = (memberships.data ?? []).map((item) => item.session_id);
      if (ids.length === 0) return [];

      const [sessionsResult, messagesResult] = await Promise.all([
        supabase.from('run_sessions').select('*').in('id', ids).order('starts_at'),
        supabase
          .from('session_messages')
          .select('*')
          .in('session_id', ids)
          .order('created_at', { ascending: false }),
      ]);
      if (sessionsResult.error) throw sessionsResult.error;
      if (messagesResult.error) throw messagesResult.error;
      const sessions = sessionsResult.data ?? [];
      const labels = await sessionLabels(sessions);

      return sessions.map((session) => {
        const sport = labels.sports.get(session.sport_id);
        return {
          ...session,
          title:
            session.title ?? labels.series.get(session.run_series_id)?.title ?? 'Pickup session',
          venueName:
            session.location_name ??
            (session.venue_id ? labels.venues.get(session.venue_id) : null) ??
            'Meeting spot',
          sportName: sport?.name ?? 'Sport',
          sportSlug: sport?.slug ?? '',
          lastMessage:
            (messagesResult.data ?? []).find((item) => item.session_id === session.id) ?? null,
        };
      });
    },
  });
}

export function useSessionMessages(sessionId?: string) {
  return useQuery({
    queryKey: ['session-messages', sessionId],
    enabled: Boolean(sessionId),
    refetchInterval: 8_000,
    queryFn: async () => {
      const messages = await supabase
        .from('session_messages')
        .select('*')
        .eq('session_id', sessionId!)
        .order('created_at');
      if (messages.error) throw messages.error;
      const authorIds = [...new Set((messages.data ?? []).map((item) => item.user_id))];
      const profiles = authorIds.length
        ? await supabase.from('profiles').select('id,display_name').in('id', authorIds)
        : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      const names = new Map((profiles.data ?? []).map((item) => [item.id, item.display_name]));
      return (messages.data ?? []).map((message) => ({
        ...message,
        authorName: names.get(message.user_id) ?? 'Player',
      }));
    },
  });
}

export function useSessionOverview(sessionId?: string, userId?: string) {
  return useQuery({
    queryKey: ['session-overview', sessionId, userId],
    enabled: Boolean(sessionId),
    refetchInterval: 8_000,
    queryFn: async () => {
      const result = await supabase.from('run_sessions').select('*').eq('id', sessionId!).single();
      if (result.error) throw result.error;
      const labels = await sessionLabels([result.data]);
      const sport = labels.sports.get(result.data.sport_id);
      let isMember = false;
      let attendance: string | null = null;
      if (userId) {
        const membership = await supabase
          .from('session_memberships')
          .select('session_id,attendance')
          .eq('session_id', sessionId!)
          .eq('user_id', userId)
          .maybeSingle();
        if (membership.error) throw membership.error;
        isMember = Boolean(membership.data);
        attendance = membership.data?.attendance ?? null;
      }
      return {
        ...result.data,
        title:
          result.data.title ??
          labels.series.get(result.data.run_series_id)?.title ??
          'Pickup session',
        isOrganizer: labels.series.get(result.data.run_series_id)?.organizer_id === userId,
        timezone: labels.series.get(result.data.run_series_id)?.timezone ?? 'UTC',
        venueName:
          result.data.location_name ??
          (result.data.venue_id ? labels.venues.get(result.data.venue_id) : null) ??
          'Meeting spot',
        sportName: sport?.name ?? 'Sport',
        sportSlug: sport?.slug ?? '',
        isMember,
        attendance,
      };
    },
  });
}

export function useJoinSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      runSeriesId: string;
      occurrenceDate: string;
      attendance?: 'going' | 'maybe';
    }) => {
      const { data, error } = await supabase.rpc('set_run_attendance', {
        p_run_series_id: input.runSeriesId,
        p_occurrence_date: input.occurrenceDate,
        p_attendance: input.attendance ?? 'going',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['joined-sessions'] }),
        client.invalidateQueries({ queryKey: ['run-attendance'] }),
        client.invalidateQueries({ queryKey: ['session-overview'] }),
      ]);
    },
  });
}

export function useSendMessage(sessionId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const result = await supabase
        .from('session_messages')
        .insert({ session_id: sessionId, user_id: userId, body: body.trim() });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['session-messages', sessionId] });
      await client.invalidateQueries({ queryKey: ['joined-sessions'] });
    },
  });
}

export type PhotoLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  observedAt: string;
};

export async function checkSessionPhotoLocation(sessionId: string, location: PhotoLocation) {
  const result = await supabase.rpc('check_session_photo_location', {
    p_session_id: sessionId,
    p_lat: location.latitude,
    p_lon: location.longitude,
    p_accuracy: location.accuracy,
    p_observed_at: location.observedAt,
  });
  if (result.error) throw result.error;
}

export async function publishSessionPost(input: {
  sessionId: string;
  userId: string;
  caption: string;
  location: PhotoLocation;
  asset?: {
    uri: string;
    kind: 'image' | 'video';
    mimeType: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
  };
}) {
  const caption = input.caption.trim();
  if (!caption && !input.asset) throw new UserFacingError('Add a caption or a photo to share.');
  if (caption.length > 500) throw new UserFacingError('Keep captions under 500 characters.');
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
  };
  let body: ArrayBuffer | undefined;
  if (input.asset) {
    if (
      !extensions[input.asset.mimeType] ||
      !input.asset.mimeType.startsWith(`${input.asset.kind}/`)
    ) {
      throw new UserFacingError('Choose a JPEG, PNG, WebP image, or an MP4 or MOV clip.');
    }
    if (
      input.asset.kind === 'video' &&
      (!Number.isFinite(input.asset.durationSeconds) ||
        (input.asset.durationSeconds ?? 0) <= 0 ||
        input.asset.durationSeconds! > 30)
    ) {
      throw new UserFacingError('Clips must be between 1 and 30 seconds long.');
    }
    body = await fetch(input.asset.uri).then((response) => response.arrayBuffer());
    if (!body || body.byteLength === 0 || body.byteLength > 25 * 1024 * 1024) {
      throw new UserFacingError('Choose a non-empty file no larger than 25 MB.');
    }
  }

  const post = await supabase.rpc('create_session_photo_post', {
    p_session_id: input.sessionId,
    p_caption: caption,
    p_lat: input.location.latitude,
    p_lon: input.location.longitude,
    p_accuracy: input.location.accuracy,
    p_observed_at: input.location.observedAt,
  });
  if (post.error) throw post.error;
  if (!input.asset || !body) return post.data;

  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${input.userId}/${post.data}/${uniqueName}.${extensions[input.asset.mimeType]}`;
  try {
    const upload = await supabase.storage
      .from('session-media')
      .upload(path, body, { contentType: input.asset.mimeType, upsert: false });
    if (upload.error) throw upload.error;

    const media = await supabase.from('session_media').insert({
      post_id: post.data,
      uploader_id: input.userId,
      kind: input.asset.kind,
      storage_path: path,
      width: input.asset.width,
      height: input.asset.height,
      duration_seconds: input.asset.kind === 'video' ? input.asset.durationSeconds : undefined,
    });
    if (media.error) throw media.error;
    return post.data;
  } catch (error) {
    // Best-effort compensation: preserve the original error if cleanup also fails.
    await Promise.allSettled([
      supabase.storage.from('session-media').remove([path]),
      supabase.from('session_posts').delete().eq('id', post.data),
    ]);
    throw error;
  }
}

export function usePublishSessionPost(sessionId: string, userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      caption: string;
      location: PhotoLocation;
      asset?: {
        uri: string;
        kind: 'image' | 'video';
        mimeType: string;
        width?: number;
        height?: number;
        durationSeconds?: number;
      };
    }) => publishSessionPost({ ...input, sessionId, userId }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['community-feed'] }),
  });
}

export function useRunAttendance(seriesIds: string[], userId?: string) {
  const ids = [...new Set(seriesIds)].sort();
  return useQuery({
    queryKey: ['run-attendance', ids, userId],
    enabled: ids.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('run_attendance', { p_series_ids: ids });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Public session pins, separate from the canonical venue directory. */
export function usePublicSessionPins(sportIds: number[]) {
  return useQuery({
    queryKey: ['public-session-pins', [...sportIds].sort().join(',')],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      let query = supabase
        .from('run_sessions')
        .select('id,title,location_name,latitude,longitude,sport_id,starts_at,run_series(title)')
        .is('cancelled_at', null)
        .is('venue_id', null)
        .gte('ends_at', new Date().toISOString())
        .lte('starts_at', new Date(Date.now() + 14 * 86400000).toISOString())
        .order('starts_at')
        .limit(100);
      if (sportIds.length) query = query.in('sport_id', sportIds);
      const result = await query;
      if (result.error) throw result.error;
      return result.data;
    },
  });
}

export type EditSessionInput = {
  p_session_id: string;
  p_title: string;
  p_date: string;
  p_start_time: string;
  p_end_time: string;
  p_timezone: string;
  p_location_name?: string;
  p_lat?: number;
  p_lon?: number;
};

export function useSessionControls(sessionId: string) {
  const client = useQueryClient();
  async function refresh() {
    // Cancel in-flight reads before removing private chat cached before leaving.
    await client.cancelQueries({ queryKey: ['session-messages', sessionId] });
    client.removeQueries({ queryKey: ['session-messages', sessionId] });
    await Promise.all(
      [
        'session-overview',
        'joined-sessions',
        'run-attendance',
        'upcoming-runs',
        'public-session-pins',
        'community-feed',
      ].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
  }
  const edit = useMutation({
    mutationFn: async (input: EditSessionInput) => {
      const result = await supabase.rpc('edit_run_session', input);
      if (result.error) throw result.error;
    },
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: async () => {
      const result = await supabase.rpc('cancel_run_session', { p_session_id: sessionId });
      if (result.error) throw result.error;
    },
    onSuccess: refresh,
  });
  const leave = useMutation({
    mutationFn: async () => {
      const result = await supabase.rpc('leave_run_session', { p_session_id: sessionId });
      if (result.error) throw result.error;
    },
    onSuccess: refresh,
  });
  return { edit, cancel, leave };
}
