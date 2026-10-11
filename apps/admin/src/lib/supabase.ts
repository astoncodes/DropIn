import type { Database } from '@dropin/database-types';
import { createClient } from '@supabase/supabase-js';

import { env } from './env';

/**
 * The one Supabase client for the admin app.
 *
 * Typed with the generated `Database` schema, so a query against a column that
 * does not exist fails at compile time rather than at 2am. Regenerate after
 * every migration with `npm run db:types`.
 *
 * This client authenticates as a real admin user and is subject to RLS like
 * any other caller. The admin capability comes from a row in admin_users,
 * checked server-side by is_admin() — never from anything this bundle asserts
 * about itself.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  // React Query retries failed reads (see the QueryClient in main.tsx). The
  // client's own retry of GET requests would run inside each of those attempts
  // and delay every error message by about fifteen seconds.
  db: { retry: false },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // The review tool is a normal browser app, so the URL is a legitimate place
    // to receive an auth callback from an emailed link.
    detectSessionInUrl: true,
  },
});
