import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '../../src/components/screen';
import { BrandMark } from '../../src/components/ui/brand';
import { CourtArt } from '../../src/components/ui/court-art';
import { Notice } from '../../src/components/ui/notice';
import { AppText, Button } from '../../src/components/ui/primitives';
import { SignInForm } from '../../src/features/auth/sign-in-form';
import { SignedInRouting } from '../../src/features/auth/signed-in-routing';
import { usePostSignInRouting } from '../../src/features/auth/use-post-sign-in-routing';
import { useSession } from '../../src/providers/auth-context';
import { space } from '../../src/theme';

export default function SignInScreen() {
  const router = useRouter();
  const { accountDeleted } = useLocalSearchParams<{ accountDeleted?: string }>();
  const { session } = useSession();
  // A session can arrive here from native Apple/Google sign-in (the form never
  // navigates away on its own) or from revisiting /sign-in with a session
  // already restored. Both need the onboarding check that an email link gets
  // on the callback screen.
  const routing = usePostSignInRouting(session?.user.id);

  if (session) {
    return (
      <SignedInRouting
        failed={routing.failed}
        retrying={routing.retrying}
        onRetry={routing.retry}
      />
    );
  }
  return (
    <Screen insetTop={false}>
      {accountDeleted === 'true' && (
        <Notice tone="success" message="Your account and its data have been deleted." />
      )}
      <View style={{ paddingVertical: space.md }}>
        <BrandMark size={36} showTagline />
      </View>
      <CourtArt height={220} />
      <View style={{ gap: space.sm, paddingVertical: space.md }}>
        <AppText variant="display">Good games.{'\n'}Great company.</AppText>
        <AppText tone="muted">
          Find local sports, join a session, and meet your people. Everyone starts somewhere.
        </AppText>
      </View>
      <SignInForm />
      <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
        By continuing, you agree to the{' '}
        <AppText
          variant="caption"
          accessibilityRole="link"
          onPress={() => router.push('/terms')}
          style={styles.link}
        >
          Terms of use
        </AppText>{' '}
        and community guidelines, and acknowledge the{' '}
        <AppText
          variant="caption"
          accessibilityRole="link"
          onPress={() => router.push('/privacy')}
          style={styles.link}
        >
          Privacy policy
        </AppText>
        .
      </AppText>
      <Button
        label="Explore without an account"
        icon="arrow-right"
        tone="neutral"
        variant="outline"
        onPress={() => router.replace('/')}
      />
      <AppText
        variant="caption"
        tone="muted"
        style={{ textAlign: 'center', paddingVertical: space.md }}
      >
        Local sports. Real people. Right now.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { fontWeight: '700', textDecorationLine: 'underline' },
});
