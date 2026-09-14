import Constants from 'expo-constants';

/**
 * Runtime configuration, supplied by app.config.ts from the repo-root `.env`.
 *
 * Everything here ships inside the app binary and can be read by anyone who
 * unpacks it. Supabase publishable keys rely on Row Level Security; public map keys
 * require provider restrictions and usage monitoring. The service-role key and the database URL
 * must never reach this file. See .env.example.
 */

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  geoapifyApiKey?: string;
  mapboxAccessToken?: string;
  googleWebClientId?: string;
  googleIosClientId?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function required(value: string | undefined, name: string): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing ${name}.\n\n` +
        'Copy .env.example to .env at the repository root and fill it in.\n' +
        'Copy the hosted project URL and publishable key from your Supabase dashboard.',
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required(extra.supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: required(extra.supabaseAnonKey, 'EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  geoapifyApiKey: extra.geoapifyApiKey?.trim() || '',
  mapboxAccessToken: extra.mapboxAccessToken?.trim() || '',
  googleWebClientId: extra.googleWebClientId?.trim() || '',
  googleIosClientId: extra.googleIosClientId?.trim() || '',
} as const;
