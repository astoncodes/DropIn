// Direct weight imports keep unused font files out of Metro's asset graph.
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { fonts, usePalette } from '../src/theme';

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
 *
 * The splash screen stays up until the display typeface has loaded, so titles
 * never flash in the system font first. If it cannot be loaded the app still
 * opens; those styles fall back to the system font.
 */
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colors = usePalette();
  const [fontsLoaded, fontError] = useFonts({
    [fonts.display]: BarlowCondensed_700Bold,
    [fonts.displayMedium]: BarlowCondensed_600SemiBold,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
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
                headerTitleStyle: { fontFamily: fonts.displayMedium, fontSize: 20 },
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
