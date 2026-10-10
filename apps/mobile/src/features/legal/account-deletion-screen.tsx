import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '../../components/screen';
import { Card } from '../../components/ui/card';
import { AppText, Button } from '../../components/ui/primitives';
import { useSession } from '../../providers/auth-context';
import { space } from '../../theme';
import { LegalBlockView } from './legal-document-screen';
import { LEGAL } from './legal-config';

const STEPS = [
  {
    title: 'In the app',
    detail: 'Open Profile, choose Delete account, and type DELETE to confirm.',
  },
  {
    title: 'On the web',
    detail:
      'Sign in on this site with the same email, Apple or Google account, open Profile, and choose Delete account.',
  },
  {
    title: 'By email',
    detail: LEGAL.supportEmail
      ? `Can’t sign in? Email ${LEGAL.supportEmail} from the address on your account and ask us to delete it. We confirm and complete the deletion within 30 days.`
      : 'Can’t sign in? Contact us from the address on your account — see Help & support — and ask us to delete it. We confirm and complete the deletion within 30 days.',
  },
] as const;

/**
 * The public account-deletion page. Google Play requires a web address where
 * people can learn how to delete their account without reinstalling the app;
 * this route is that page on the web build and a help screen in the app.
 */
export function AccountDeletionScreen() {
  const router = useRouter();
  const { session } = useSession();

  return (
    <Screen insetTop={false}>
      <View style={styles.intro}>
        <View accessibilityRole="header">
          <AppText variant="title">Delete your Drop In account</AppText>
        </View>
        <AppText tone="muted">
          You can permanently delete your account and the information connected to it at any time.
        </AppText>
      </View>
      {STEPS.map((step, index) => (
        <Card key={step.title}>
          <AppText variant="bodyStrong">
            {index + 1}. {step.title}
          </AppText>
          <AppText tone="muted">{step.detail}</AppText>
        </Card>
      ))}
      <Button
        label={session ? 'Go to account deletion' : 'Sign in to delete your account'}
        icon="arrow-right"
        onPress={() => router.push(session ? '/profile' : '/sign-in')}
      />
      <View style={styles.section}>
        <View accessibilityRole="header">
          <AppText variant="heading">What is deleted</AppText>
        </View>
        <LegalBlockView
          block={{
            kind: 'list',
            items: [
              'Your profile, display name and sports',
              'Your check-ins and “on my way” statuses',
              'Your chat messages, posts, photos and clips',
              'Your venue submissions',
              'Sessions you organise, including other players’ messages and posts in them',
            ],
          }}
        />
      </View>
      <View style={styles.section}>
        <View accessibilityRole="header">
          <AppText variant="heading">What is kept</AppText>
        </View>
        <LegalBlockView
          block={{
            kind: 'list',
            items: [
              'Approved venues stay listed, because they are public places rather than your data.',
              'Reports you filed are kept without your identity so moderation records stay complete.',
              'Encrypted backups may hold deleted data for a limited time before they are overwritten.',
            ],
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm, paddingBottom: space.sm },
  section: { gap: space.sm, paddingTop: space.md },
});
