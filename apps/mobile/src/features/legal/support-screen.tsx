import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Screen } from '../../components/screen';
import { ListRow, ListSection } from '../../components/ui/list-row';
import { Notice } from '../../components/ui/notice';
import { AppText } from '../../components/ui/primitives';
import { space } from '../../theme';
import { LEGAL } from './legal-config';

const QUESTIONS = [
  {
    question: 'How do I sign in?',
    answer:
      'Enter your email address to get a one-time sign-in link, or continue with Apple on iPhone or with Google. There is no password to remember.',
  },
  {
    question: 'Why does Drop In ask for my location?',
    answer:
      'To show venues and games near you, start maps where you are, and confirm you are at a venue when you check in. If you decline, you can still browse sessions, chat with your sessions and manage your account.',
  },
  {
    question: 'How do I report or block someone?',
    answer:
      'Tap ⋯ on a post or session, or press and hold a chat message. Report sends it to our moderators; Block hides that player’s posts, photos and messages from you. Manage blocked players from Profile.',
  },
  {
    question: 'A venue is missing or wrong',
    answer:
      'Add a missing venue from the Live map with the add-venue button — moderators review every submission. For a mistake in a listed venue, email us.',
  },
  {
    question: 'How do I delete my account?',
    answer:
      'Go to Profile → Delete account. The Delete your account page explains exactly what is removed.',
  },
] as const;

export function SupportScreen() {
  const router = useRouter();
  const [mailFailed, setMailFailed] = useState(false);
  const email = LEGAL.supportEmail;

  return (
    <Screen insetTop={false}>
      <View style={styles.intro}>
        <View accessibilityRole="header">
          <AppText variant="title">Help & support</AppText>
        </View>
        <AppText tone="muted">
          Questions, problems or feedback — we read everything and usually reply{' '}
          {LEGAL.supportReplyTarget}.
        </AppText>
      </View>
      <ListSection title="Contact">
        {email ? (
          <ListRow
            icon="email-outline"
            title="Email support"
            subtitle={email}
            external
            onPress={() => {
              setMailFailed(false);
              void Linking.openURL(`mailto:${email}`).catch(() => setMailFailed(true));
            }}
          />
        ) : (
          <ListRow
            icon="email-outline"
            title="Email support"
            subtitle="Our support address will be published here before launch"
          />
        )}
      </ListSection>
      {mailFailed && email && (
        <Notice tone="error" message={`Couldn’t open your mail app. Write to us at ${email}.`} />
      )}
      <Notice
        tone="warning"
        title="In an emergency"
        message="If anyone is in immediate danger, call 911 or your local emergency number."
      />
      <View style={styles.questions}>
        <View accessibilityRole="header">
          <AppText variant="heading">Common questions</AppText>
        </View>
        {QUESTIONS.map((item) => (
          <View key={item.question} style={styles.question}>
            <AppText variant="bodyStrong">{item.question}</AppText>
            <AppText tone="muted">{item.answer}</AppText>
          </View>
        ))}
      </View>
      <ListSection title="Policies">
        <ListRow
          icon="shield-account-outline"
          title="Privacy policy"
          onPress={() => router.push('/privacy')}
        />
        <ListRow
          icon="file-document-outline"
          title="Terms of use"
          subtitle="Including the community guidelines"
          onPress={() => router.push('/terms')}
        />
        <ListRow
          icon="account-remove-outline"
          title="Delete your account"
          onPress={() => router.push('/delete-account')}
        />
      </ListSection>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm, paddingBottom: space.sm },
  questions: { gap: space.lg, paddingVertical: space.md },
  question: { gap: space.xs },
});
