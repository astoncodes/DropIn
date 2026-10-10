import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '../../src/components/screen';
import { BrandMark } from '../../src/components/ui/brand';
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
      <View style={styles.hero}>
        <BrandMark size={26} />
        <View accessibilityRole="header">
          <AppText variant="display" style={styles.headline}>
            Find a game.{'\n'}Meet your people.
          </AppText>
        </View>
        <AppText tone="muted">
          See where people are playing right now, and join the sessions coming up near you.
        </AppText>
      </View>
      <SignInForm />
      <AppText variant="caption" tone="muted">
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
        variant="ghost"
        onPress={() => router.replace('/')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.md, paddingTop: space.lg, paddingBottom: space.xl },
  headline: { fontSize: 46, lineHeight: 46, paddingTop: space.lg },
  link: { fontWeight: '600', textDecorationLine: 'underline' },
});
