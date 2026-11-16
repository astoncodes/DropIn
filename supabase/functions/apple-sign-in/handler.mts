import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';
import { AppleRequestError } from '../_shared/apple.mts';
import type { AppleClient } from '../_shared/apple.mts';
import { createRequestGate } from '../_shared/player-request.mts';

const CODE_MESSAGE = 'Send the Apple authorization code.';
// Apple's codes are under 200 characters; the limit sits inside the body limit.
const MAX_CODE_LENGTH = 512;

/**
 * Keeps the refresh token behind a Sign in with Apple session so that deleting
 * the account can revoke Apple's authorization, as App Review requires. The
 * app calls this right after the identity-token sign-in, while the one-time
 * authorization code is still valid.
 */
export function createAppleSignInHandler(
  admin: SupabaseClient,
  apple: AppleClient | null,
  allowedOrigins: string[] = [],
) {
  const accept = createRequestGate(admin, allowedOrigins);
  return async (request: Request) => {
    const gate = await accept(request, { invalidBodyMessage: CODE_MESSAGE });
    if (!gate.ok) return gate.response;
    const { user, body, reply } = gate;
    const code = body.authorizationCode;
    if (
      typeof code !== 'string' ||
      !code ||
      code.length > MAX_CODE_LENGTH ||
      Object.keys(body).some((key) => key !== 'authorizationCode')
    ) {
      return reply({ error: CODE_MESSAGE }, 400);
    }
    const identity = user.identities?.find((entry) => entry.provider === 'apple');
    if (!identity) return reply({ error: 'This account did not sign in with Apple.' }, 400);
    if (!apple) {
      console.error('[apple-sign-in] APPLE_* settings are missing; nothing kept for revocation');
      return reply({ error: 'Apple sign-in is not fully set up.' }, 503);
    }
    let exchanged;
    try {
      exchanged = await apple.exchangeCode(code);
    } catch (error) {
      if (error instanceof AppleRequestError && error.code === 'invalid_grant') {
        return reply({ error: 'That Apple sign-in has expired. Sign in again.' }, 400);
      }
      console.error('[apple-sign-in] the code exchange failed');
      return reply({ error: 'Apple could not be reached. Try again later.' }, 503);
    }
    // The code must belong to the Apple identity on this account; a token for
    // someone else's authorization would revoke the wrong person at deletion.
    if (exchanged.subject !== identity.id) {
      return reply({ error: 'That Apple sign-in belongs to a different account.' }, 400);
    }
    const stored = await admin.from('apple_refresh_tokens').upsert({
      user_id: user.id,
      refresh_token: exchanged.refreshToken,
      updated_at: new Date().toISOString(),
    });
    if (stored.error) {
      console.error('[apple-sign-in] storing the token failed');
      return reply({ error: 'Could not keep the Apple sign-in. Try again later.' }, 503);
    }
    return reply({ stored: true });
  };
}
