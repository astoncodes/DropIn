import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { usePalette } from '../src/theme';

import { AppProviders } from '../src/providers';
import { RequiredLocation } from '../src/features/location/required-location';

/**
 * Root layout.
 *
 * Route files assemble screens; they hold no data access or business rules
 * (docs/architecture.md §Repository scaffold). Device location is required
 * before opening app routes. Account authentication is separately required for
 * actions such as checking in, posting a run and submitting a venue.
 */
export default function RootLayout() {
  const colors = usePalette();
  return (
    <SafeAreaProvider>
      <AppProviders>
        <StatusBar style="dark" />
        <RequiredLocation>
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
            <Stack.Screen name="venue/[venueId]" options={{ headerShown: true, title: 'Venue' }} />
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
          </Stack>
        </RequiredLocation>
      </AppProviders>
    </SafeAreaProvider>
  );
}
