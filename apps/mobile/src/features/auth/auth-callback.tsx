import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppText, Button } from '../../components/ui/primitives';
import { supabase } from '../../lib/supabase';
import { space, usePalette } from '../../theme';
import { routeAfterSignIn } from './route-after-sign-in';
import { UserFacingError, userMessage } from '../../lib/errors';

const EXPIRED_LINK = 'This sign-in link is invalid or has expired. Request a new one.';

export function AuthCallback() {
  const colors = usePalette();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const handled = useRef(false);
  // The provider's error_description is never displayed: anyone can craft a
  // callback link, so its text is not ours to show.
  const [error, setError] = useState<string | null>(params.error_description ? EXPIRED_LINK : null);

  useEffect(() => {
    if (handled.current || error) return;
    handled.current = true;

    async function finishSignIn() {
      if (params.code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
        if (exchangeError) throw exchangeError;
      } else {
        const { data } = await supabase.auth.getSession();
        if (!data.session) throw new UserFacingError(EXPIRED_LINK);
      }

      await routeAfterSignIn(router);
    }

    void finishSignIn().catch((callbackError: unknown) =>
      setError(userMessage(callbackError, EXPIRED_LINK)),
    );
  }, [error, params.code, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
      {error ? (
        <>
          <AppText variant="heading">Couldn’t sign you in</AppText>
          <AppText variant="body" tone="alert" style={{ textAlign: 'center' }}>
            {error}
          </AppText>
          <Button label="Request another link" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.live} />
          <AppText variant="body" tone="muted">
            Finishing sign-in…
          </AppText>
        </>
      )}
    </View>
  );
}
