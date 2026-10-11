import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import VenueMap from '../../components/map/venue-map';
import { ActionBar } from '../../components/ui/action-bar';
import { EmptyState, LoadError, Skeleton, Stat } from '../../components/ui/activity';
import { ConfirmDialog } from '../../components/ui/dialog';
import { ListRow, ListSection } from '../../components/ui/list-row';
import { Notice } from '../../components/ui/notice';
import { AppText, Button, IconButton } from '../../components/ui/primitives';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { dayLabel, timeOfDay } from '../../lib/format';
import { useSession } from '../../providers/auth-context';
import { radius, space, usePalette, useThemeName } from '../../theme';
import { ModerationSheet } from '../moderation/moderation-sheet';
import type { ModerationSubject } from '../moderation/api';
import {
  useJoinSession,
  useRunAttendance,
  useSessionControls,
  useSendMessage,
  useSessionMessages,
  useSessionOverview,
} from './api';

import { SessionPhotoComposer } from './session-photo-composer';
import { MomentsFeed } from './feed-screen';
import { SessionEditForm } from './session-edit-form';
import { SessionMessageList } from './session-chat';
import { userMessage } from '@dropin/shared';
import { loadPhase } from '../../lib/load-phase';
import { uuidParam } from '../../lib/route-params';

type SessionTab = 'details' | 'chat' | 'photos';

const TABS = [
  { value: 'details', label: 'Details' },
  { value: 'chat', label: 'Chat' },
  { value: 'photos', label: 'Photos' },
] as const;

const CONFIRM_COPY = {
  cancel: {
    title: 'Cancel this session?',
    message:
      'It is cancelled for everyone who joined. Other weeks stay scheduled. This cannot be undone.',
    confirm: 'Cancel session',
  },
  leave: {
    title: 'Leave this session?',
    message: 'You will lose access to the chat. Your existing messages and posts stay.',
    confirm: 'Leave session',
  },
} as const;

export function SessionScreen() {
  const { sessionId, tab } = useLocalSearchParams<{ sessionId: string; tab?: string }>();
  const id = uuidParam(sessionId);
  // An id that cannot name a session is "unavailable" without a request.
  if (!id) return <SessionUnavailable />;
  return <SessionContent sessionId={id} initialTab={tab === 'chat' ? 'chat' : 'details'} />;
}

/** Leaves the session screen, which has no navigation header of its own. */
function useLeaveSession() {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/feed'));
}

/**
 * The screen while there is no session to show. It always carries the way
 * back, because a loading or failed session has no other control on it.
 */
function SessionFrame({ children }: { children: ReactNode }) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const leave = useLeaveSession();
  return (
    <View
      style={[
        styles.frame,
        { backgroundColor: colors.background, paddingTop: insets.top + space.lg },
      ]}
    >
      <View style={styles.headerBar}>
        <IconButton icon="arrow-left" label="Go back" onPress={leave} />
      </View>
      {children}
    </View>
  );
}

function SessionUnavailable() {
  const router = useRouter();
  return (
    <SessionFrame>
      <EmptyState
        title="Session unavailable"
        body="This session may have been removed, or the link is out of date."
        action={<Button label="Back to Discover" onPress={() => router.replace('/feed')} />}
      />
    </SessionFrame>
  );
}

function SessionContent({ sessionId, initialTab }: { sessionId: string; initialTab: SessionTab }) {
  const [activeTab, setActiveTab] = useState<SessionTab>(initialTab);
  const [moderationSubject, setModerationSubject] = useState<ModerationSubject | null>(null);
  const leave = useLeaveSession();
  const colors = usePalette();
  const scheme = useThemeName();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const overview = useSessionOverview(sessionId, session?.user.id);
  const attendance = useRunAttendance(
    overview.data ? [overview.data.run_series_id] : [],
    session?.user.id,
  );
  const messages = useSessionMessages(overview.data?.isMember ? sessionId : undefined);
  const join = useJoinSession();
  const send = useSendMessage(sessionId, session?.user.id ?? '');
  const [body, setBody] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const messageCount = messages.data?.length ?? 0;
  useEffect(() => {
    if (activeTab !== 'chat' || !messageCount) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
    return () => clearTimeout(timer);
  }, [messageCount, activeTab]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const controls = useSessionControls(sessionId);
  const [editing, setEditing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'leave' | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  async function confirmControl() {
    setConfirmError(null);
    try {
      if (confirmAction === 'cancel') await controls.cancel.mutateAsync();
      else if (confirmAction === 'leave') {
        await controls.leave.mutateAsync();
        setBody('');
      }
      setConfirmAction(null);
    } catch (error) {
      setConfirmError(userMessage(error, 'Could not update this session. Please try again.'));
    }
  }

  function reportError(error: unknown) {
    setActionError(userMessage(error, 'Could not complete that action. Please try again.'));
  }

  async function handleJoin(attendance: 'going' | 'maybe') {
    if (!session) return router.push('/sign-in');
    const item = overview.data;
    if (!item) return;
    try {
      await join.mutateAsync({
        runSeriesId: item.run_series_id,
        occurrenceDate: item.occurrence_date,
        attendance,
      });
      await overview.refetch();
      // Joining opens the chat it unlocks; changing an answer stays put.
      if (!item.isMember) setActiveTab('chat');
    } catch (error) {
      reportError(error);
    }
  }

  async function handleSend() {
    if (!body.trim() || send.isPending) return;
    setActionError('');
    await send.mutateAsync(body);
    setBody('');
  }

  const phase = loadPhase(overview);
  if (phase === 'loading') {
    return (
      <SessionFrame>
        <Skeleton height={150} />
        <Skeleton height={300} />
      </SessionFrame>
    );
  }

  if (phase === 'failed') {
    return (
      <SessionFrame>
        <LoadError
          title="Could not load this session"
          onRetry={() => void overview.refetch()}
          retrying={overview.isFetching}
        />
      </SessionFrame>
    );
  }

  if (!overview.data) return <SessionUnavailable />;

  const item = overview.data;
  const counts = attendance.data?.find(
    (response) =>
      response.run_series_id === item.run_series_id &&
      response.occurrence_date === item.occurrence_date,
  );
  const attendancePhase = loadPhase(attendance);
  const cancelled = Boolean(item.cancelled_at);
  const ended = new Date(item.ends_at).getTime() <= now;
  const upcoming = !cancelled && !ended;
  const busy = controls.cancel.isPending || controls.leave.isPending || controls.edit.isPending;
  const hasSpot = item.latitude !== null && item.longitude !== null;
  const chatting = item.isMember && !cancelled && activeTab === 'chat';
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}
      >
        <View style={styles.headerBar}>
          <IconButton icon="arrow-left" label="Go back" onPress={leave} />
          {item.organizerId && !item.isOrganizer && (
            <IconButton
              icon="dots-horizontal"
              label="Report or block"
              onPress={() =>
                setModerationSubject({
                  kind: 'run_session',
                  id: item.id,
                  authorId: item.organizerId!,
                  authorName: item.organizerName,
                })
              }
            />
          )}
        </View>

        <View style={styles.identity}>
          <AppText variant="label" tone="muted">
            {item.sportName} · {dayLabel(item.starts_at)}
          </AppText>
          <View accessibilityRole="header">
            <AppText variant="title">{item.title}</AppText>
          </View>
          <AppText tone="muted">
            {item.venueName} · {timeOfDay(item.starts_at)} – {timeOfDay(item.ends_at)}
          </AppText>
          <AppText variant="caption" tone="muted">
            Hosted by {item.isOrganizer ? 'you' : item.organizerName}
          </AppText>
        </View>

        <View
          accessibilityLiveRegion="polite"
          style={[styles.board, { borderColor: colors.border }]}
        >
          {attendancePhase === 'ready' ? (
            <>
              <View style={styles.count}>
                <Stat value={counts?.going_count ?? 0} label="Going" />
              </View>
              <View style={[styles.count, styles.countDivided, { borderLeftColor: colors.border }]}>
                <Stat value={counts?.maybe_count ?? 0} label="Maybe" tone="quiet" />
              </View>
            </>
          ) : (
            <AppText variant="caption" tone="muted" style={styles.boardNote}>
              {attendancePhase === 'loading'
                ? 'Loading attendance…'
                : 'Attendance counts unavailable'}
            </AppText>
          )}
        </View>

        <SegmentedControl
          segments={TABS}
          value={activeTab}
          onChange={setActiveTab}
          accessibilityLabel="Session sections"
        />
        {!!actionError && <Notice tone="error" message={actionError} />}

        {activeTab === 'details' && (
          <>
            {cancelled && (
              <Notice
                tone="warning"
                title="Session cancelled"
                message="This session is no longer happening. Its chat and posts are kept for reference."
              />
            )}
            {hasSpot && (
              <View style={styles.map}>
                <VenueMap
                  colorScheme={scheme}
                  region={{
                    latitude: item.latitude!,
                    longitude: item.longitude!,
                    latitudeDelta: 0.012,
                    longitudeDelta: 0.012,
                  }}
                  markers={[
                    {
                      id: item.id,
                      latitude: item.latitude!,
                      longitude: item.longitude!,
                      label: item.venueName,
                      sportSlug: item.sportSlug,
                      count: 0,
                      isLive: false,
                      isPending: true,
                      kind: 'session' as const,
                    },
                  ]}
                />
              </View>
            )}
            <ListSection>
              {hasSpot && (
                <ListRow
                  icon="directions"
                  title="Directions to meeting spot"
                  external
                  onPress={() => {
                    void Linking.openURL(
                      `https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}&dir_action=navigate`,
                    ).catch(reportError);
                  }}
                />
              )}
              {item.isOrganizer && upcoming && new Date(item.starts_at).getTime() > now && (
                <ListRow
                  icon="pencil-outline"
                  title="Edit session"
                  disabled={busy}
                  onPress={() => {
                    setEditing(!editing);
                    setConfirmAction(null);
                  }}
                />
              )}
              {item.isOrganizer && upcoming && (
                <ListRow
                  icon="calendar-remove-outline"
                  title="Cancel session"
                  tone="alert"
                  disabled={busy}
                  onPress={() => {
                    setConfirmAction('cancel');
                    setConfirmError(null);
                    setEditing(false);
                  }}
                />
              )}
              {item.isMember && !cancelled && (!item.isOrganizer || ended) && (
                <ListRow
                  icon="exit-to-app"
                  title="Leave session"
                  disabled={busy}
                  onPress={() => {
                    setConfirmAction('leave');
                    setConfirmError(null);
                  }}
                />
              )}
            </ListSection>
            {editing && item.isOrganizer && !cancelled && (
              <SessionEditForm
                item={item}
                pending={controls.edit.isPending}
                onSave={controls.edit.mutateAsync}
                onClose={() => setEditing(false)}
              />
            )}
          </>
        )}

        {activeTab === 'chat' &&
          (item.isMember ? (
            <View style={styles.messages}>
              <SessionMessageList
                messages={messages}
                viewerId={session?.user.id}
                onModerate={(message) =>
                  setModerationSubject({
                    kind: 'session_message',
                    id: message.id,
                    authorId: message.user_id,
                    authorName: message.authorName,
                  })
                }
              />
            </View>
          ) : (
            <EmptyState
              title="The chat is for people who joined"
              body="Only people joining this dated session can read or send messages."
            />
          ))}

        {activeTab === 'photos' &&
          (item.isMember ? (
            <>
              {!cancelled && (
                <SessionPhotoComposer
                  sessionId={sessionId}
                  userId={session?.user.id ?? ''}
                  onPublished={() => router.push('/feed')}
                />
              )}
              <MomentsFeed sessionId={sessionId} />
            </>
          ) : (
            <EmptyState
              title="Photos come from people who joined"
              body="Join this session to share a photo or a short clip from it."
            />
          ))}
      </ScrollView>

      {chatting ? (
        <View
          style={[
            styles.composer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, space.sm),
            },
          ]}
        >
          <TextInput
            value={body}
            accessibilityLabel="Message the session"
            editable={!send.isPending}
            onChangeText={setBody}
            placeholder="Message the session…"
            placeholderTextColor={colors.textFaint}
            maxLength={1000}
            multiline
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.borderStrong,
              },
            ]}
          />
          <IconButton
            icon="arrow-up"
            label="Send"
            filled
            onPress={() => void handleSend().catch(reportError)}
            disabled={!body.trim() || send.isPending}
          />
        </View>
      ) : upcoming ? (
        <ActionBar>
          {item.isMember ? (
            <>
              <Button
                label="Going"
                icon={item.attendance === 'going' ? 'check' : undefined}
                tone={item.attendance === 'going' ? 'live' : 'neutral'}
                variant={item.attendance === 'going' ? 'solid' : 'outline'}
                onPress={() => void handleJoin('going')}
                disabled={join.isPending}
                style={styles.action}
              />
              <Button
                label="Maybe"
                icon={item.attendance === 'maybe' ? 'check' : undefined}
                variant={item.attendance === 'maybe' ? 'solid' : 'outline'}
                onPress={() => void handleJoin('maybe')}
                disabled={join.isPending}
                style={styles.action}
              />
            </>
          ) : (
            <>
              <Button
                label={session ? 'Join session' : 'Sign in to join'}
                tone="live"
                onPress={() => void handleJoin('going')}
                loading={join.isPending}
                style={styles.action}
              />
              {session && (
                <Button
                  label="Maybe"
                  variant="outline"
                  onPress={() => void handleJoin('maybe')}
                  disabled={join.isPending}
                />
              )}
            </>
          )}
        </ActionBar>
      ) : null}
      <ConfirmDialog
        visible={confirmAction !== null}
        title={confirmAction ? CONFIRM_COPY[confirmAction].title : ''}
        message={confirmAction ? CONFIRM_COPY[confirmAction].message : undefined}
        confirmLabel={confirmAction ? CONFIRM_COPY[confirmAction].confirm : ''}
        cancelLabel="Keep session"
        busy={busy}
        error={confirmError}
        onConfirm={() => void confirmControl()}
        onCancel={() => setConfirmAction(null)}
      />
      <ModerationSheet subject={moderationSubject} onClose={() => setModerationSubject(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, padding: space.lg, gap: space.md },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginLeft: -space.sm,
  },
  content: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.lg,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  identity: { gap: space.xs },
  board: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1 },
  count: { paddingVertical: space.md, paddingRight: space.xl },
  countDivided: { borderLeftWidth: 1, paddingLeft: space.lg },
  boardNote: { paddingVertical: space.md },
  map: { height: 180, borderRadius: radius.lg, overflow: 'hidden' },
  messages: { gap: space.sm },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingTop: space.sm,
    paddingHorizontal: space.lg,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 16,
  },
  action: { flex: 1 },
});
