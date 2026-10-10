import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { usePalette } from '../src/theme';

import { AppProviders } from '../src/providers';
import { ToastProvider } from '../src/components/ui/toast';
import { LocationAccessProvider } from '../src/features/location/location-access';

/**
 * Root layout.
 *
 * Route files assemble screens; they hold no data access or business rules
 * (CLAUDE.md §Keep routes thin). Location access is tracked app-wide but only
 * the screens that need a position require it (see RequiredLocation), so
 * signing in, browsing and account settings never depend on location consent.
 * Account authentication is separately required for actions such as checking
 * in, posting a run and submitting a venue.
 */
export default function RootLayout() {
  const colors = usePalette();
  return (
    <SafeAreaProvider>
      <AppProviders>
        <StatusBar style="dark" />
        <ToastProvider>
          <LocationAccessProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                headerStyle: { backgroundColor: colors.background },
                headerTintColor: colors.text,
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
              <Stack.Screen
                name="venue/[venueId]"
                options={{ headerShown: true, title: 'Venue' }}
              />
              <Stack.Screen name="session/[sessionId]" options={{ headerShown: false }} />
              <Stack.Screen
                name="check-in/[venueId]"
                options={{ headerShown: true, title: 'Check in', presentation: 'modal' }}
              />
              <Stack.Screen
                name="run/new"
                options={{ headerShown: true, title: 'Create session', presentation: 'modal' }}
              />
              <Stack.Screen
                name="venue-submission/index"
                options={{ headerShown: true, title: 'Your submissions' }}
              />
              <Stack.Screen
                name="venue-submission/new"
                options={{ headerShown: true, title: 'Add a venue', presentation: 'modal' }}
              />
              <Stack.Screen
                name="privacy"
                options={{ headerShown: true, title: 'Privacy policy' }}
              />
              <Stack.Screen name="terms" options={{ headerShown: true, title: 'Terms of use' }} />
              <Stack.Screen
                name="support"
                options={{ headerShown: true, title: 'Help & support' }}
              />
              <Stack.Screen
                name="delete-account"
                options={{ headerShown: true, title: 'Delete your account' }}
              />
              <Stack.Screen
                name="blocked-players"
                options={{ headerShown: true, title: 'Blocked players' }}
              />
            </Stack>
          </LocationAccessProvider>
        </ToastProvider>
      </AppProviders>
    </SafeAreaProvider>
  );
}
