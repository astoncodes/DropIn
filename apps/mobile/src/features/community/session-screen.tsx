import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { EmptyState, Skeleton } from '../../components/ui/activity';
import { ConfirmDialog } from '../../components/ui/dialog';
import { Notice } from '../../components/ui/notice';
import { AppText, Button, Chip, IconButton } from '../../components/ui/primitives';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { timeOfDay, weekdayName } from '../../lib/format';
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
import { userMessage } from '../../lib/errors';

type SessionTab = 'details' | 'chat' | 'photos';

const TABS = [
  { value: 'details', label: 'Details', icon: 'information-outline' },
  { value: 'chat', label: 'Chat', icon: 'chat-outline' },
  { value: 'photos', label: 'Photos', icon: 'image-outline' },
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
  const [activeTab, setActiveTab] = useState<SessionTab>(tab === 'chat' ? 'chat' : 'details');
  const [moderationSubject, setModerationSubject] = useState<ModerationSubject | null>(null);
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
      setActiveTab('chat');
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

  if (overview.isPending) {
    return (
      <View
        style={[
          styles.loading,
          { backgroundColor: colors.background, paddingTop: insets.top + space.lg },
        ]}
      >
        <Skeleton height={150} />
        <Skeleton height={300} />
      </View>
    );
  }

  if (!overview.data) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="calendar-remove"
          title="Session unavailable"
          body="This session may have been removed, or your connection was interrupted."
          action={<Button label="Back to Discover" onPress={() => router.replace('/feed')} />}
        />
      </View>
    );
  }

  const item = overview.data;
  const counts = attendance.data?.find(
    (response) =>
      response.run_series_id === item.run_series_id &&
      response.occurrence_date === item.occurrence_date,
  );
  const cancelled = Boolean(item.cancelled_at);
  const ended = new Date(item.ends_at).getTime() <= now;
  const busy = controls.cancel.isPending || controls.leave.isPending || controls.edit.isPending;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + space.lg,
          paddingBottom: item.isMember && activeTab === 'chat' ? 110 : insets.bottom + space.xl,
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
        }}
      >
        <View style={styles.header}>
          <View style={styles.headerBar}>
            <IconButton
              icon="arrow-left"
              label="Go back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/feed'))}
            />
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
          <Chip label={item.sportName} compact />
          <AppText variant={activeTab === 'details' ? 'display' : 'heading'}>{item.title}</AppText>
          <AppText variant="body" tone="muted">
            {item.venueName} · {weekdayName(item.starts_at)} at {timeOfDay(item.starts_at)}
          </AppText>
          <View accessibilityLiveRegion="polite">
            <AppText variant="body" tone="muted">
              {attendance.isPending
                ? 'Loading attendance…'
                : attendance.isError
                  ? 'Attendance counts unavailable'
                  : `${counts?.going_count ?? 0} going · ${counts?.maybe_count ?? 0} maybe`}
            </AppText>
          </View>
        </View>

        <View style={styles.tabs}>
          <SegmentedControl
            segments={TABS}
            value={activeTab}
            onChange={setActiveTab}
            accessibilityLabel="Session sections"
          />
        </View>
        {!!actionError && (
          <View style={styles.notice}>
            <Notice tone="error" message={actionError} />
          </View>
        )}
        {activeTab === 'details' && (
          <View>
            {cancelled && (
              <View style={styles.notice}>
                <Notice
                  tone="warning"
                  title="Session cancelled"
                  message="This session is no longer happening. Its chat and posts are kept for reference."
                />
              </View>
            )}

            {!cancelled && !ended && item.isMember && (
              <View style={styles.attendance} accessibilityLabel="Your attendance">
                {(['going', 'maybe'] as const).map((response) => {
                  const selected = item.attendance === response;
                  return (
                    <Button
                      key={response}
                      label={response === 'going' ? 'Going' : 'Maybe'}
                      icon={selected ? 'check' : undefined}
                      tone={selected ? 'live' : 'neutral'}
                      variant={selected ? 'solid' : 'outline'}
                      onPress={() => handleJoin(response)}
                      disabled={join.isPending}
                      style={{ flex: 1 }}
                    />
                  );
                })}
              </View>
            )}
            <View style={{ padding: space.lg, gap: space.sm }}>
              {item.isOrganizer && !cancelled && !ended && (
                <>
                  {new Date(item.starts_at).getTime() > now && (
                    <Button
                      label="Edit session"
                      icon="pencil"
                      tone="neutral"
                      variant="soft"
                      disabled={busy}
                      onPress={() => {
                        setEditing(!editing);
                        setConfirmAction(null);
                      }}
                    />
                  )}
                  <Button
                    label="Cancel session"
                    icon="calendar-remove"
                    tone="neutral"
                    variant="soft"
                    disabled={busy}
                    onPress={() => {
                      setConfirmAction('cancel');
                      setConfirmError(null);
                      setEditing(false);
                    }}
                  />
                </>
              )}
              {item.isMember && !cancelled && (!item.isOrganizer || cancelled || ended) && (
                <Button
                  label="Leave session"
                  icon="exit-to-app"
                  tone="neutral"
                  variant="soft"
                  disabled={busy}
                  onPress={() => {
                    setConfirmAction('leave');
                    setConfirmError(null);
                  }}
                />
              )}
            </View>
            {editing && item.isOrganizer && !cancelled && (
              <SessionEditForm
                item={item}
                pending={controls.edit.isPending}
                onSave={controls.edit.mutateAsync}
                onClose={() => setEditing(false)}
              />
            )}

            {item.latitude !== null && item.longitude !== null && (
              <View style={{ padding: space.lg, gap: space.sm }}>
                <View
                  style={{
                    height: 180,
                    position: 'relative',
                    borderRadius: radius.md,
                    overflow: 'hidden',
                  }}
                >
                  <VenueMap
                    colorScheme={scheme}
                    region={{
                      latitude: item.latitude,
                      longitude: item.longitude,
                      latitudeDelta: 0.012,
                      longitudeDelta: 0.012,
                    }}
                    markers={[
                      {
                        id: item.id,
                        latitude: item.latitude,
                        longitude: item.longitude,
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
                <Button
                  label="Directions to meeting spot"
                  icon="directions"
                  tone="neutral"
                  variant="soft"
                  onPress={() => {
                    void Linking.openURL(
                      `https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}&dir_action=navigate`,
                    ).catch(reportError);
                  }}
                />
              </View>
            )}
          </View>
        )}
        {!item.isMember ? (
          !cancelled && !ended ? (
            <View style={styles.joinBlock}>
              <EmptyState
                icon="message-lock-outline"
                title="Join to open the chat"
                body="Only people joining this dated session can read or send messages."
              />
              <Button
                label={session ? 'Join session' : 'Sign in to join'}
                icon="account-plus"
                onPress={() => void handleJoin('going').catch(reportError)}
                loading={join.isPending}
              />
            </View>
          ) : null
        ) : (
          <>
            {activeTab === 'photos' && !cancelled && (
              <View style={styles.tools}>
                <SessionPhotoComposer
                  sessionId={sessionId}
                  userId={session?.user.id ?? ''}
                  onPublished={() => router.push('/feed')}
                />
              </View>
            )}
            {activeTab === 'photos' && <MomentsFeed sessionId={sessionId} />}
            {activeTab === 'chat' && (
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
            )}
          </>
        )}
      </ScrollView>

      {item.isMember && !cancelled && activeTab === 'chat' && (
        <View
          style={[
            styles.composer,
            {
              backgroundColor: colors.surface,
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
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceMuted }]}
          />
          <Button
            label="Send"
            icon="send"
            size="sm"
            onPress={() => void handleSend().catch(reportError)}
            disabled={!body.trim()}
            loading={send.isPending}
          />
        </View>
      )}
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
  loading: { flex: 1, padding: space.lg, gap: space.md },
  header: { paddingHorizontal: space.lg, gap: space.sm },
  headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tabs: { paddingHorizontal: space.lg, paddingTop: space.lg },
  notice: { paddingHorizontal: space.lg, paddingTop: space.lg },
  attendance: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  joinBlock: { padding: space.lg, gap: space.lg },
  tools: { paddingHorizontal: space.lg, paddingVertical: space.lg, gap: space.sm },
  messages: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  composer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 15,
  },
});
