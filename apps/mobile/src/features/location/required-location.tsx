import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';

import { Screen } from '../../components/screen';
import { BrandMark } from '../../components/ui/brand';
import { AppText, Button } from '../../components/ui/primitives';
import { space, usePalette } from '../../theme';
import { useLocationAccess } from './location-access';
import type { LocationState } from './use-device-location';

type Coordinates = Extract<LocationState, { status: 'granted' }>['coords'];
const RequiredLocationContext = createContext<Coordinates | null>(null);

export function useRequiredLocation() {
  const location = useContext(RequiredLocationContext);
  if (!location) throw new Error('Location-dependent screens must be inside RequiredLocation.');
  return location;
}

/**
 * Gate for a screen that cannot work without a real device position.
 *
 * There is deliberately no fallback location: a map centred on a guessed city
 * would show someone games they cannot reach. Until a fix arrives, the screen is
 * replaced by an explanation and a way to grant access, plus an optional
 * `alternative` that leads somewhere useful without location.
 */
export function RequiredLocation({
  children,
  reason = 'Drop In uses your location to show nearby venues and games.',
  alternative,
  insetTop = true,
}: {
  children: ReactNode;
  /** One sentence on why this screen needs a position. */
  reason?: string;
  alternative?: ReactNode;
  /** False when the gated screen sits under a navigation header. */
  insetTop?: boolean;
}) {
  const { state, request } = useLocationAccess();
  const colors = usePalette();
  const [settingsError, setSettingsError] = useState(false);

  useEffect(() => {
    if (state.status === 'idle') void request();
  }, [state.status, request]);

  if (state.status === 'granted') {
    return <RequiredLocationContext value={state.coords}>{children}</RequiredLocationContext>;
  }

  const mustUseSettings = state.status === 'denied' && !state.canAskAgain;
  const openLocationSettings = () => {
    setSettingsError(false);
    void Linking.openSettings().catch(() => setSettingsError(true));
  };
  const loading = state.status === 'idle' || state.status === 'requesting';
  return (
    <Screen insetTop={insetTop}>
      <View style={{ gap: space.lg, paddingVertical: space.xxl }}>
        <BrandMark size={40} />
        <AppText variant="display">
          {loading ? 'Finding your location' : 'Enable location to play'}
        </AppText>
        <AppText tone="muted">
          {reason} Turn on location services and allow access to continue.
        </AppText>
        {loading ? (
          <ActivityIndicator color={colors.live} accessibilityLabel="Finding your location" />
        ) : (
          <>
            {state.status === 'unavailable' && (
              <AppText tone="alert">
                We couldn’t get a location. Check that location services are on, then try again.
              </AppText>
            )}
            {Platform.OS === 'web' && (
              <AppText variant="caption" tone="muted">
                Allow location in your browser’s site settings, then try again.
              </AppText>
            )}
            <Button
              label={
                mustUseSettings
                  ? 'Open location settings'
                  : state.status === 'denied'
                    ? 'Enable location'
                    : 'Try location again'
              }
              icon="crosshairs-gps"
              onPress={mustUseSettings ? openLocationSettings : () => void request()}
            />
            {Platform.OS !== 'web' && !mustUseSettings && (
              <Button label="Open settings" variant="outline" onPress={openLocationSettings} />
            )}
            {settingsError && (
              <AppText tone="alert">
                Open your device settings and allow location for Drop In.
              </AppText>
            )}
            {alternative}
          </>
        )}
      </View>
    </Screen>
  );
}
