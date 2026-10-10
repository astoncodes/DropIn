import { Stack } from 'expo-router';
import { fonts, usePalette } from '../../src/theme';

export default function AuthLayout() {
  const colors = usePalette();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.displayMedium, fontSize: 20 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      <Stack.Screen name="onboarding" options={{ title: 'Pick your sports' }} />
      <Stack.Screen name="callback" options={{ title: 'Signing in', headerBackVisible: false }} />
    </Stack>
  );
}
