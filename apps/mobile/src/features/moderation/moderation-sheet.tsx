import { MODERATION, userMessage } from '@dropin/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ListRow, ListSection } from '../../components/ui/list-row';
import { Notice } from '../../components/ui/notice';
import { AppText, Button } from '../../components/ui/primitives';
import { Sheet } from '../../components/ui/sheet';
import { TextField } from '../../components/ui/text-field';
import { useToast } from '../../components/ui/toast';
import { useSession } from '../../providers/auth-context';
import { space } from '../../theme';
import {
  REPORT_REASONS,
  REPORT_TARGET_NOUN,
  useBlockPlayer,
  useBlockedPlayers,
  useReportContent,
} from './api';
import type { ModerationSubject, ReportReason } from './api';

/**
 * Report and block, from wherever another player's content appears.
 *
 * Pass the content as `subject` to open the sheet and set it back to null to
 * close it. Each opening starts fresh; the last subject stays rendered while
 * the sheet fades out so the content does not vanish mid-animation.
 */
export function ModerationSheet({
  subject,
  onClose,
}: {
  subject: ModerationSubject | null;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<{ subject: ModerationSubject; token: number } | null>(null);
  if (subject && subject !== shown?.subject) {
    setShown({ subject, token: (shown?.token ?? 0) + 1 });
  }
  if (!shown) return null;
  return (
    <ModerationFlow
      key={shown.token}
      subject={shown.subject}
      visible={subject !== null}
      onClose={onClose}
    />
  );
}

type Step = 'menu' | 'reason' | 'details' | 'sent' | 'confirm-block';

function ModerationFlow({
  subject,
  visible,
  onClose,
}: {
  subject: ModerationSubject;
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const showToast = useToast();
  const { session } = useSession();
  const viewerId = session?.user.id;
  const blocked = useBlockedPlayers(viewerId);
  const report = useReportContent();
  const block = useBlockPlayer(viewerId);
  const [step, setStep] = useState<Step>('menu');
  const [returnStep, setReturnStep] = useState<Step>('menu');
  const [reportSubject, setReportSubject] = useState(subject);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);

  const name = subject.authorName;
  const noun = REPORT_TARGET_NOUN[reportSubject.kind];
  const alreadyBlocked = Boolean(blocked.data?.some((item) => item.playerId === subject.authorId));
  const busy = report.isPending || block.isPending;
  const selectedReason = REPORT_REASONS.find((item) => item.value === reason);

  const titles: Record<Step, string> = {
    menu: `${capitalise(REPORT_TARGET_NOUN[subject.kind])} options`,
    reason: `Report ${noun}`,
    details: `Report ${noun}`,
    sent: 'Report sent',
    'confirm-block': `Block ${name}?`,
  };

  function startReport(target: ModerationSubject) {
    setReportSubject(target);
    setReason(null);
    setError(null);
    setStep('reason');
  }

  function askToBlock(from: Step) {
    setReturnStep(from);
    setError(null);
    setStep('confirm-block');
  }

  async function sendReport() {
    if (!reason || busy) return;
    setError(null);
    try {
      await report.mutateAsync({ subject: reportSubject, reason, details });
      setStep('sent');
    } catch (cause) {
      setError(userMessage(cause, 'Could not send your report. Try again.'));
    }
  }

  async function confirmBlock() {
    if (busy) return;
    setError(null);
    try {
      await block.mutateAsync(subject.authorId);
      showToast(`Blocked ${name}`);
      onClose();
    } catch (cause) {
      setError(userMessage(cause, `Could not block ${name}. Try again.`));
    }
  }

  let content;
  if (!viewerId) {
    content = (
      <>
        <AppText tone="muted">
          Sign in to report content or block players. Reports go to Drop In moderators.
        </AppText>
        <Button
          label="Sign in"
          onPress={() => {
            onClose();
            router.push('/sign-in');
          }}
        />
      </>
    );
  } else if (step === 'menu') {
    content = (
      <ListSection>
        <ListRow
          icon="flag-outline"
          title={`Report this ${REPORT_TARGET_NOUN[subject.kind]}`}
          subtitle="A moderator reviews every report"
          onPress={() => startReport(subject)}
        />
        {subject.kind !== 'profile' ? (
          <ListRow
            icon="account-alert-outline"
            title={`Report ${name}’s profile`}
            subtitle="For an offensive or impersonating name"
            onPress={() =>
              startReport({
                kind: 'profile',
                id: subject.authorId,
                authorId: subject.authorId,
                authorName: name,
              })
            }
          />
        ) : null}
        {alreadyBlocked ? (
          <ListRow icon="account-cancel-outline" title={`${name} is blocked`} value="Blocked" />
        ) : (
          <ListRow
            icon="account-cancel-outline"
            title={`Block ${name}`}
            subtitle="Hide their posts, photos and messages"
            tone="alert"
            onPress={() => askToBlock('menu')}
          />
        )}
      </ListSection>
    );
  } else if (step === 'reason') {
    content = (
      <>
        <AppText tone="muted">Why are you reporting this {noun}?</AppText>
        <ListSection>
          {REPORT_REASONS.map((item) => (
            <ListRow
              key={item.value}
              title={item.label}
              subtitle={item.detail}
              onPress={() => {
                setReason(item.value);
                setStep('details');
              }}
            />
          ))}
        </ListSection>
        <Button label="Back" tone="neutral" variant="ghost" onPress={() => setStep('menu')} />
      </>
    );
  } else if (step === 'details') {
    content = (
      <>
        <AppText variant="bodyStrong">{selectedReason?.label}</AppText>
        {(reason === 'self_harm' || reason === 'violence') && (
          <Notice
            tone="warning"
            message="If someone is in immediate danger, call 911 or your local emergency number now."
          />
        )}
        <TextField
          label="Add details (optional)"
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={MODERATION.reportDetailsMaxLength}
          showCount
          editable={!busy}
          hint="Moderators see the reported content and these details. The player is not told who reported them."
        />
        {error && <Notice tone="error" message={error} />}
        <Button label="Send report" icon="send" loading={report.isPending} onPress={sendReport} />
        <Button
          label="Back"
          tone="neutral"
          variant="ghost"
          disabled={busy}
          onPress={() => setStep('reason')}
        />
      </>
    );
  } else if (step === 'sent') {
    content = (
      <>
        <Notice
          tone="success"
          title="Thanks for telling us"
          message="A moderator will review your report and remove anything that breaks the community guidelines."
        />
        {!alreadyBlocked && (
          <Button
            label={`Block ${name}`}
            icon="account-cancel-outline"
            tone="alert"
            variant="soft"
            onPress={() => askToBlock('sent')}
          />
        )}
        <Button label="Done" tone="neutral" variant="ghost" onPress={onClose} />
      </>
    );
  } else {
    content = (
      <>
        <AppText tone="muted">
          You won’t see {name}’s posts, photos or chat messages, including in sessions you share.
          They won’t be told. You can unblock them from Profile at any time.
        </AppText>
        {error && <Notice tone="error" message={error} />}
        <Button
          label={`Block ${name}`}
          tone="alert"
          loading={block.isPending}
          onPress={confirmBlock}
        />
        <Button
          label="Cancel"
          tone="neutral"
          variant="ghost"
          disabled={busy}
          onPress={() => setStep(returnStep)}
        />
      </>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={titles[step]} dismissible={!busy}>
      <View style={{ gap: space.md }}>{content}</View>
    </Sheet>
  );
}

function capitalise(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
