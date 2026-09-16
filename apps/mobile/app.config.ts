import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ExpoConfig } from 'expo/config';

/**
 * Reads the repository-root `.env`.
 *
 * Expo loads .env from the app directory, but this monorepo keeps a single
 * .env at the root so there is one file to gitignore and one .env.example to
 * keep honest. Values are passed through `extra` rather than injected into
 * process.env, so what the app receives is explicit and inspectable rather
 * than depending on bundler substitution order.
 */
function loadRootEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '../../.env');

  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch {
    return {};
  }

  const values: Record<string, string> = {};
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line
      .slice(0, separator)
      .trim()
      .replace(/^export\s+/, '');
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

const rootEnv = loadRootEnv();

/**
 * One identifier for both platforms.
 *
 * Sign in with Apple binds to the App ID and Google's iOS OAuth client binds to
 * the bundle ID, so this string must match what is registered in the Apple
 * Developer portal and in Google Cloud. It is defined once because a value that
 * differs per platform is a mismatch nobody notices until sign-in fails with an
 * error that never mentions the identifier.
 *
 * Changing it requires `npx expo prebuild --clean` — config plugins write it
 * into the native project, and an existing ios/ directory keeps the old value.
 */
const APP_IDENTIFIER = 'com.playdropin.app';

/** Real environment wins over the .env file, so CI can override without a file. */
function read(name: string): string {
  return process.env[name] ?? rootEnv[name] ?? '';
}

const config: ExpoConfig = {
  name: 'Drop In',
  slug: 'drop-in',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'dropin',
  // Light-only: the dark palette and the appearance picker were removed, so
  // honouring the system setting would leave dark-mode devices rendering a
  // light palette against a dark chrome. See docs/product-rules.md §Appearance.
  userInterfaceStyle: 'light',

  ios: {
    supportsTablet: true,
    bundleIdentifier: APP_IDENTIFIER,
    usesAppleSignIn: true,
  },

  android: {
    package: APP_IDENTIFIER,
    adaptiveIcon: {
      backgroundColor: '#F7F7F2',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },

  web: {
    // 'single' (SPA), not 'static'. Static prerendering runs this bundle in
    // Node, and a map library that touches `window` at import time cannot
    // survive that. Nothing here benefits from prerendered HTML — every screen
    // is behind a live query.
    output: 'single',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',
    'expo-image',
    'expo-secure-store',
    'expo-web-browser',
    'expo-video',
    'expo-apple-authentication',
    [
      '@react-native-google-signin/google-signin',
      {
        // Reversed form of the iOS OAuth client ID, so Google's SDK can
        // receive its redirect back into the app during native sign-in. The
        // plugin throws on an empty string, so builds fall back to a
        // placeholder until it's set — Google sign-in itself still fails
        // cleanly at runtime via env.ts until the real client IDs are in .env.
        iosUrlScheme:
          read('EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME') || 'com.googleusercontent.apps.unconfigured',
      },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission: 'Drop In uses your camera to take photos at your sports session.',
        photosPermission: 'Drop In lets you choose photos and clips to share from your session.',
        microphonePermission: false,
      },
    ],
    '@rnmapbox/maps',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Drop In uses your location to show nearby sports sessions help you choose a meeting spot, and confirm you are nearby when sharing session photos.',
        locationAlwaysPermission: false,
        locationAlwaysAndWhenInUsePermission: false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F7F7F2',
        image: './assets/images/splash-icon.png',
        imageWidth: 140,
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  // Only the publishable (anon) key belongs here — `extra` ships inside the
  // app binary and is readable by anyone who unpacks it. RLS is what makes
  // that safe. Never put the service-role key or a database URL in `extra`.
  extra: {
    supabaseUrl: read('EXPO_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: read('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
    geoapifyApiKey: read('EXPO_PUBLIC_GEOAPIFY_API_KEY'),
    mapboxAccessToken: read('EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN'),
    googleWebClientId: read('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
    googleIosClientId: read('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'),
  },
};

export default config;
