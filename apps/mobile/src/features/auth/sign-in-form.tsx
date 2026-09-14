import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button } from '../../components/ui/primitives';
import { supabase } from '../../lib/supabase';
import { radius, space, useIsDark, usePalette } from '../../theme';
import { signInWithApple } from './apple-sign-in';
import { signInWithGoogle } from './google-sign-in';
import { authRedirectUrl } from './redirect';

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string };

export function SignInForm() {
  const colors = usePalette();
  const isDark = useIsDark();
  const [email, setEmail] = useState('');
  const sending = useRef(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  /** Shared by email, Apple, and Google — only one sign-in attempt at a time. */
  async function runSignIn(action: () => Promise<{ error: string | null }>, onSuccess: () => void) {
    if (sending.current) return;
    sending.current = true;
    setStatus({ kind: 'sending' });
    try {
      const { error } = await action();
      if (error) setStatus({ kind: 'error', message: error });
      else onSuccess();
    } catch {
      setStatus({
        kind: 'error',
        message: 'Could not connect. Check your connection and try again.',
      });
    } finally {
      sending.current = false;
    }
  }

  function sendLink() {
    const normalized = email.trim().toLocaleLowerCase('en-CA');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setStatus({
        kind: 'error',
        message: 'Enter a valid email address to get your sign-in link.',
      });
      return;
    }
    void runSignIn(
      () =>
        supabase.auth
          .signInWithOtp({
            email: normalized,
            options: { emailRedirectTo: authRedirectUrl(), shouldCreateUser: true },
          })
          .then(({ error }) => ({ error: error?.message ?? null })),
      () => setStatus({ kind: 'sent', email: normalized }),
    );
  }

  const handleApple = () => void runSignIn(signInWithApple, () => setStatus({ kind: 'idle' }));
  const handleGoogle = () => void runSignIn(signInWithGoogle, () => setStatus({ kind: 'idle' }));

  if (status.kind === 'sent') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppText variant="heading">Check your email</AppText>
        <AppText variant="body" tone="muted">
          We sent a secure sign-in link to {status.email}. The link signs you in and returns you to
          Drop In.
        </AppText>
        <Button
          label="Use a different email"
          tone="neutral"
          variant="outline"
          onPress={() => setStatus({ kind: 'idle' })}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      <AppText variant="bodyStrong">Your email address</AppText>
      <TextInput
        value={email}
        editable={status.kind !== 'sending'}
        onChangeText={setEmail}
        onSubmitEditing={sendLink}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        returnKeyType="send"
        placeholder="you@example.com"
        placeholderTextColor={colors.textFaint}
        accessibilityLabel="Email address"
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      />
      {status.kind === 'error' && <AppText tone="alert">{status.message}</AppText>}
      <Button
        label="Continue with email"
        icon="email-fast-outline"
        onPress={sendLink}
        loading={status.kind === 'sending'}
        disabled={!email.trim()}
      />
      <AppText variant="caption" tone="faint">
        No password required. The link expires and can only be used to access your account.
      </AppText>

      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <AppText variant="caption" tone="faint">
          or
        </AppText>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      {appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            isDark
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={radius.md}
          style={styles.appleButton}
          onPress={handleApple}
        />
      )}
      <Button
        label="Continue with Google"
        icon="google"
        tone="neutral"
        variant="outline"
        onPress={handleGoogle}
        loading={status.kind === 'sending'}
        disabled={status.kind === 'sending'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    fontSize: 16,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.lg,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  appleButton: {
    height: 48,
    width: '100%',
  },
});
