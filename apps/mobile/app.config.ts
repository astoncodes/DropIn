import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

import type { ExpoConfig } from 'expo/config';

/**
 * Reads the repository-root `.env`.
 *
 * Expo loads .env from the app directory; this monorepo's default file lives
 * at the root. The dev launcher overrides it through process variables.
 * Values are passed through `extra` rather than injected into
 * process.env, so what the app receives is explicit and inspectable rather
 * than depending on bundler substitution order.
 */
function loadRootEnv(): Record<string, string | undefined> {
  const envPath = resolve(__dirname, '../../.env');

  let contents: string;
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch {
    return {};
  }

  return parseEnv(contents);
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

/**
 * Public values a store build cannot work without. Development builds start
 * without them and explain what is missing; a production binary would instead
 * ship broken (an empty Supabase URL crashes at launch, a missing Google URL
 * scheme breaks sign-in), so production builds fail here instead.
 */
export const RELEASE_REQUIRED_CONFIG = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME',
  'EXPO_PUBLIC_SUPPORT_EMAIL',
] as const;

export function missingReleaseConfig(lookup: (name: string) => string): string[] {
  return RELEASE_REQUIRED_CONFIG.filter((name) => lookup(name).trim() === '');
}

// EAS sets EAS_BUILD_PROFILE while it evaluates this file, locally and on its
// build machines. The root .env is gitignored, so it never reaches EAS: these
// values must be EAS environment variables (docs/release.md).
if (process.env.EAS_BUILD_PROFILE === 'production') {
  const missing = missingReleaseConfig(read);
  if (missing.length > 0) {
    throw new Error(
      `Production build is missing ${missing.join(', ')}. ` +
        'Add them as EAS environment variables for the production environment; see docs/release.md.',
    );
  }
}

const config: ExpoConfig = {
  name: 'Drop In',
  slug: 'drop-in',
  owner: 'tomiwaadewumi',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'dropin',
  // Light-only: there is no dark palette, so honouring the system setting would
  // leave dark-mode devices rendering a light palette against a dark chrome.
  userInterfaceStyle: 'light',

  ios: {
    supportsTablet: true,
    bundleIdentifier: APP_IDENTIFIER,
    // Expo SDK 57's native modules are built for iOS 17 and newer. Keep the
    // generated app target aligned so Swift can import the Expo module.
    deploymentTarget: '17.0',
    usesAppleSignIn: true,
    // Only the operating system's HTTPS is used, which is exempt from export
    // compliance documentation. Declaring it skips the question on every upload.
    config: { usesNonExemptEncryption: false },
  },

  android: {
    package: APP_IDENTIFIER,
    adaptiveIcon: {
      backgroundColor: '#0F1A16',
      foregroundImage: './assets/images/android-icon-foreground.png',
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
          'Drop In uses your location to show nearby venues and sessions, start the map where you are when you place a meeting spot, and confirm you are nearby when you check in or share session photos.',
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
        backgroundColor: '#FFFFFF',
        image: './assets/images/splash-icon.png',
        // The size of Android's splash image box, which crops anything larger.
        // The wordmark spans a little over half of the square image.
        imageWidth: 288,
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
    eas: {
      projectId: 'c540d540-4f74-4f65-b0e5-0423e06bb6c7',
    },
    supabaseUrl: read('EXPO_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: read('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
    geoapifyApiKey: read('EXPO_PUBLIC_GEOAPIFY_API_KEY'),
    mapboxAccessToken: read('EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN'),
    googleWebClientId: read('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
    googleIosClientId: read('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'),
    supportEmail: read('EXPO_PUBLIC_SUPPORT_EMAIL'),
    operatorName: read('EXPO_PUBLIC_OPERATOR_NAME'),
    siteUrl: read('EXPO_PUBLIC_SITE_URL'),
  },
};

export default config;
