import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createDeleteAccountHandler, parseAllowedOrigins } from './handler.mts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
Deno.serve(
  createDeleteAccountHandler(admin, parseAllowedOrigins(Deno.env.get('ALLOWED_WEB_ORIGINS') ?? '')),
);
