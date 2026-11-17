import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { appleConfigFromEnv, createAppleClient } from '../_shared/apple.mts';
import { parseAllowedOrigins } from '../_shared/player-request.mts';
import { createDeleteAccountHandler } from './handler.mts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const appleConfig = appleConfigFromEnv((name) => Deno.env.get(name));
Deno.serve(
  createDeleteAccountHandler(
    admin,
    parseAllowedOrigins(Deno.env.get('ALLOWED_WEB_ORIGINS') ?? ''),
    appleConfig && createAppleClient(appleConfig),
  ),
);
