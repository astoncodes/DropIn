// Supabase's client relies on a WHATWG-compliant URL implementation that React
// Native does not fully provide. Must be imported before createClient runs.
import 'react-native-url-polyfill/auto';

import type { Database } from '@dropin/database-types';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { env } from './env';
import { secureStorage } from './secure-storage';

/**
 * The one Supabase client for the mobile app.
 *
 * Typed with the generated `Database` schema — regenerate after every migration
 * with `npm run db:types`. This client holds a normal user session and is
 * subject to RLS exactly like any other caller.
 */
export const AUTH_STORAGE_KEY = `sb-${new URL(env.supabaseUrl).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  // React Query retries failed reads (see the QueryClient in providers). The
  // client's own retry of GET requests would run inside each of those attempts
  // — eight requests and about fifteen seconds before a screen can say that a
  // read failed — so retrying is left to the one layer the screens observe.
  db: { retry: false },
  auth: {
    storage: secureStorage,
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'pkce',
    // A mobile app receives its auth callback through a deep link, not through
    // a URL the bundle happens to be loaded at.
    detectSessionInUrl: false,
  },
});

/**
 * Refresh tokens only while the app is actually in front of the user.
 *
 * Supabase's auto-refresh timer keeps firing in the background otherwise,
 * which burns battery and produces failed requests the moment the OS suspends
 * the network. Recommended by Supabase's React Native guidance.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
