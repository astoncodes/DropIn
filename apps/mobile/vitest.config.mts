import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

const stub = (name: string) => fileURLToPath(new URL(`./tests/stubs/${name}.ts`, import.meta.url));

/**
 * These tests cover pure logic, so they run in plain Node rather than a React
 * Native runtime. The aliases below stand in for the native modules that the
 * modules under test import at load time — without them, importing a formatter
 * would drag in the whole Expo runtime.
 *
 * Keep the stubs minimal. A stub that grows behaviour is a test asserting
 * against itself; anything that needs a real native module belongs in a device
 * check on the release checklist instead.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'expo-constants': stub('expo-constants'),
      'expo-linking': stub('expo-linking'),
      'expo-secure-store': stub('expo-secure-store'),
      'react-native-url-polyfill/auto': stub('url-polyfill'),
      'react-native': stub('react-native'),
    },
  },
});
