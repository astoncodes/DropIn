import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen } from '../../components/screen';
import { Notice } from '../../components/ui/notice';
import { AppText, Button } from '../../components/ui/primitives';
import { space, usePalette } from '../../theme';

/**
 * What the sign-in screen shows once somebody is signed in: progress while
 * their destination is worked out, or a retry when it could not be.
 */
export function SignedInRouting({
  failed,
  retrying,
  onRetry,
}: {
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const colors = usePalette();
  const router = useRouter();

  if (!failed) {
    return (
      <Screen insetTop={false}>
        <View style={styles.progress} accessibilityRole="progressbar">
          <ActivityIndicator size="large" color={colors.live} />
          <AppText tone="muted">Signing you in…</AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen insetTop={false}>
      <Notice
        tone="error"
        title="You’re signed in, but we couldn’t load your profile"
        message="Check your connection and try again."
      />
      <Button label="Try again" loading={retrying} onPress={onRetry} />
      <Button
        label="Continue to the app"
        tone="neutral"
        variant="outline"
        onPress={() => router.replace('/')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxxl },
});
