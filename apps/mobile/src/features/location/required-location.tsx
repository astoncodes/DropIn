import * as Location from 'expo-location';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, View } from 'react-native';
import { Screen } from '../../components/screen';
import { BrandMark } from '../../components/ui/brand';
import { AppText, Button } from '../../components/ui/primitives';
import { space, usePalette } from '../../theme';
import { useDeviceLocation } from './use-device-location';
import type { LocationState } from './use-device-location';

type Coordinates = Extract<LocationState, { status: 'granted' }>['coords'];
const RequiredLocationContext = createContext<Coordinates | null>(null);

export function useRequiredLocation() {
  const location = useContext(RequiredLocationContext);
  if (!location) throw new Error('Location-dependent screens must be inside RequiredLocation.');
  return location;
}

export function RequiredLocation({ children }: { children: ReactNode }) {
  const { state, request } = useDeviceLocation({ live: true });
  const colors = usePalette();
  const currentState = useRef(state);
  useEffect(() => {
    currentState.current = state;
  }, [state]);
  const [settingsError, setSettingsError] = useState(false);

  useEffect(() => {
    void request();
    let disposed = false;
    let checking = false;
    let permission: PermissionStatus | undefined;
    const checkPermission = async () => {
      if (checking || currentState.current.status === 'requesting') return;
      checking = true;
      try {
        const [access, services] = await Promise.all([
          Location.getForegroundPermissionsAsync(),
          Location.hasServicesEnabledAsync(),
        ]);
        if (disposed) return;
        const wasGranted = currentState.current.status === 'granted';
        if (
          (wasGranted && (access.status !== 'granted' || !services)) ||
          (!wasGranted && access.status === 'granted' && services)
        )
          await request();
      } catch {
        if (!disposed) await request();
      } finally {
        checking = false;
      }
    };
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') void checkPermission();
    });
    const timer = setInterval(() => {
      // Polling exists to catch permission being granted while this screen is
      // up. Once granted, it can only be revoked from outside the app, which
      // always comes back through the AppState listener above or, on web, the
      // permissions change event below — so stop making two native calls every
      // five seconds for the remaining life of the app.
      if (currentState.current.status === 'granted') return;
      if (AppState.currentState === 'active' || AppState.currentState == null)
        void checkPermission();
    }, 5000);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.permissions) {
      void navigator.permissions
        .query({ name: 'geolocation' })
        .then((result) => {
          if (disposed) return;
          permission = result;
          permission.addEventListener('change', checkPermission);
        })
        .catch(() => {
          /* The foreground check also supports browsers without this API. */
        });
    }
    return () => {
      disposed = true;
      listener.remove();
      clearInterval(timer);
      permission?.removeEventListener('change', checkPermission);
    };
  }, [request]);

  const mustUseSettings = state.status === 'denied' && !state.canAskAgain;
  const openLocationSettings = () => {
    setSettingsError(false);
    void Linking.openSettings().catch(() => setSettingsError(true));
  };

  if (state.status === 'granted') {
    return <RequiredLocationContext value={state.coords}>{children}</RequiredLocationContext>;
  }
  const loading = state.status === 'idle' || state.status === 'requesting';
  return (
    <Screen>
      <View style={{ gap: space.lg, paddingVertical: space.xxl }}>
        <BrandMark size={40} />
        <AppText variant="display">
          {loading ? 'Finding your location' : 'Enable location to play'}
        </AppText>
        <AppText tone="muted">
          Drop In needs your location to show nearby venues and games. Turn on location services and
          allow access to continue.
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
          </>
        )}
      </View>
    </Screen>
  );
}
