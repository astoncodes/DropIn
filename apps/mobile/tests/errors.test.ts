import { describe, expect, it } from 'vitest';

import { CONNECTION_MESSAGE, UserFacingError, isNetworkError, userMessage } from '@dropin/shared';

const FALLBACK = 'Could not save. Try again.';

/** The shape supabase-js hands back for a failed query or RPC. */
const postgrestError = (code: string, message: string) => ({
  code,
  message,
  details: null,
  hint: null,
});

/** The shape supabase-js throws for a failed Auth request. */
const authError = (code: string, status: number, message = 'raw auth text') =>
  Object.assign(new Error(message), { name: 'AuthApiError', code, status, __isAuthError: true });

describe('userMessage', () => {
  it('handles backend rate limits without exposing server details', () => {
    expect(userMessage(postgrestError('PT429', 'private server details'), FALLBACK)).toBe(
      'Too many requests. Please try again later.',
    );
  });
  describe('passes through business-rule messages written for players', () => {
    it('keeps an invalid-parameter message raised by a database function', () => {
      expect(
        userMessage(
          postgrestError('22023', 'Move within 250 metres of the venue to check in.'),
          FALLBACK,
        ),
      ).toBe('Move within 250 metres of the venue to check in.');
    });

    it('keeps a not-allowed message raised by a database function', () => {
      expect(
        userMessage(postgrestError('42501', 'Only the organizer can edit this session'), FALLBACK),
      ).toBe('Only the organizer can edit this session.');
    });

    it('tidies lowercase function messages into a sentence', () => {
      expect(userMessage(postgrestError('42501', 'authentication required'), FALLBACK)).toBe(
        'Authentication required.',
      );
    });

    it('keeps messages the app itself marked as safe', () => {
      expect(userMessage(new UserFacingError('Add a caption or a photo to share.'), FALLBACK)).toBe(
        'Add a caption or a photo to share.',
      );
    });
  });

  describe('never shows internals', () => {
    it('hides a row-level security violation even though it shares SQLSTATE 42501', () => {
      expect(
        userMessage(
          postgrestError(
            '42501',
            'new row violates row-level security policy for table "session_messages"',
          ),
          FALLBACK,
        ),
      ).toBe(FALLBACK);
    });

    it('hides a table permission failure', () => {
      expect(
        userMessage(postgrestError('42501', 'permission denied for table admin_users'), FALLBACK),
      ).toBe(FALLBACK);
    });

    it('hides constraint names', () => {
      expect(
        userMessage(
          postgrestError(
            '23505',
            'duplicate key value violates unique constraint "user_blocks_pkey"',
          ),
          FALLBACK,
        ),
      ).toBe(FALLBACK);
    });

    it('hides PostgREST protocol errors', () => {
      expect(
        userMessage(
          postgrestError('PGRST116', 'JSON object requested, multiple (or no) rows returned'),
          FALLBACK,
        ),
      ).toBe(FALLBACK);
    });

    it('hides plain errors thrown by libraries', () => {
      expect(userMessage(new Error('undefined is not an object (evaluating x.y)'), FALLBACK)).toBe(
        FALLBACK,
      );
    });

    it('hides unexplained values', () => {
      expect(userMessage(undefined, FALLBACK)).toBe(FALLBACK);
      expect(userMessage('SQLSTATE 42P01', FALLBACK)).toBe(FALLBACK);
      expect(userMessage({ message: 42 }, FALLBACK)).toBe(FALLBACK);
    });

    it('hides a business-rule code whose text is suspiciously long', () => {
      expect(userMessage(postgrestError('22023', 'x'.repeat(400)), FALLBACK)).toBe(FALLBACK);
    });
  });

  describe('explains connection problems as connection problems', () => {
    it.each([
      'Network request failed',
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource.',
    ])('recognises "%s"', (text) => {
      expect(userMessage(new TypeError(text), FALLBACK)).toBe(CONNECTION_MESSAGE);
    });

    it('recognises Auth retryable fetch failures', () => {
      const error = Object.assign(new Error('Failed to fetch'), {
        name: 'AuthRetryableFetchError',
        status: 0,
      });
      expect(isNetworkError(error)).toBe(true);
      expect(userMessage(error, FALLBACK)).toBe(CONNECTION_MESSAGE);
    });

    it('does not call a validation failure a network failure', () => {
      expect(isNetworkError(postgrestError('22023', 'Choose an active sport'))).toBe(false);
    });
  });

  describe('maps Auth failures to actionable text', () => {
    it('tells people to wait when email sending is rate limited', () => {
      expect(userMessage(authError('over_email_send_rate_limit', 429), FALLBACK)).toMatch(/wait/i);
    });

    it('treats any 429 as rate limiting', () => {
      expect(userMessage(authError('something_new', 429), FALLBACK)).toMatch(/wait/i);
    });

    it('explains an expired sign-in link', () => {
      expect(userMessage(authError('otp_expired', 403), FALLBACK)).toMatch(/expired/i);
    });

    it('asks for a valid email address', () => {
      expect(userMessage(authError('email_address_invalid', 400), FALLBACK)).toMatch(
        /valid email/i,
      );
    });

    it('asks people to sign in again when the session is gone', () => {
      expect(userMessage(authError('session_not_found', 403), FALLBACK)).toMatch(/sign in again/i);
    });

    it('does not leak unmapped Auth text', () => {
      expect(userMessage(authError('unexpected_failure', 500, 'Database error'), FALLBACK)).toBe(
        FALLBACK,
      );
    });
  });

  describe('maps storage upload failures', () => {
    it('explains a file that is too large', () => {
      const error = Object.assign(new Error('The object exceeded the maximum allowed size'), {
        name: 'StorageApiError',
        statusCode: '413',
      });
      expect(userMessage(error, FALLBACK)).toMatch(/too large/i);
    });
  });
});
