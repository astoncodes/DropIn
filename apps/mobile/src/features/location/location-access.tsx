import * as Location from 'expo-location';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { useDeviceLocation } from './use-device-location';
import type { LocationState } from './use-device-location';

type LocationAccess = ReturnType<typeof useDeviceLocation>;

const LocationAccessContext = createContext<LocationAccess | null>(null);

/**
 * One app-wide view of foreground location permission and the live position.
 *
 * It never blocks rendering. Screens that cannot work without a real position
 * (the live map, placing a session pin, submitting a venue) wrap themselves in
 * `RequiredLocation`; everything else — signing in, Discover, chats, Profile and
 * account deletion — stays usable when someone declines location. Nothing is
 * requested until a screen that needs location asks.
 *
 * Permission can change outside the app (Settings, a browser site setting), so
 * after the first request this re-checks on foreground, on the browser's
 * permission-change event, and every few seconds while access is missing.
 */
export function LocationAccessProvider({ children }: { children: ReactNode }) {
  const { state, request } = useDeviceLocation({ live: true });
  const currentState = useRef<LocationState>(state);
  useEffect(() => {
    currentState.current = state;
  }, [state]);

  const asked = state.status !== 'idle';
  useEffect(() => {
    if (!asked) return;
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
      // Polling only catches access being granted while the prompt screen is
      // up. Revocation always arrives through the AppState listener above or,
      // on web, the permission change event below.
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
  }, [asked, request]);

  const value = useMemo(() => ({ state, request }), [state, request]);
  return <LocationAccessContext value={value}>{children}</LocationAccessContext>;
}

export function useLocationAccess(): LocationAccess {
  const access = useContext(LocationAccessContext);
  if (!access) throw new Error('useLocationAccess must be used inside LocationAccessProvider.');
  return access;
}
