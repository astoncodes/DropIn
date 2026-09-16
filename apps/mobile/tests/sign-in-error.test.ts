import { describe, expect, it } from 'vitest';

import {
  SIGN_IN_FALLBACK_MESSAGE,
  describeSignInFailure,
  isCancellation,
} from '../src/features/auth/sign-in-error';

/**
 * The bug this guards against: every thrown sign-in failure used to be reported
 * as "Could not connect. Check your connection and try again." A build missing
 * the Apple entitlement and a phone in a tunnel produced identical UI, which
 * sends people to their wifi settings for a problem no player can fix.
 *
 * These assert the *classification*, not the exact wording — the messages may be
 * rewritten, but a misconfigured build must never be called a network problem.
 */

const NETWORK_TEXT = /could not connect/i;
const BUILD_TEXT = /not available in this build/i;
const SETUP_TEXT = /not set up correctly/i;

describe('describeSignInFailure', () => {
  describe('never blames the network for a configuration fault', () => {
    it('reports a missing Apple entitlement as a build problem, not a connection problem', () => {
      // What iOS raises when com.apple.developer.applesignin is absent.
      const message = describeSignInFailure(
        Object.assign(new Error('The operation couldn’t be completed.'), {
          code: 'ERR_APPLE_AUTHENTICATION_REQUEST_FAILED',
        }),
      );
      expect(message).toMatch(SETUP_TEXT);
      expect(message).not.toMatch(NETWORK_TEXT);
    });

    it('reports an unregistered Google URL scheme as a build problem', () => {
      // DEVELOPER_ERROR is Google's code for bundle ID / client ID mismatch.
      const message = describeSignInFailure(
        Object.assign(new Error('DEVELOPER_ERROR'), { code: 'DEVELOPER_ERROR' }),
      );
      expect(message).toMatch(SETUP_TEXT);
      expect(message).not.toMatch(NETWORK_TEXT);
    });

    it('accepts Google status codes that arrive as numbers', () => {
      expect(describeSignInFailure(Object.assign(new Error('failed'), { code: 10 }))).toMatch(
        SETUP_TEXT,
      );
    });

    it('reports a native module missing from the binary as unsupported, not offline', () => {
      const message = describeSignInFailure(
        new Error("Cannot find native module 'ExpoAppleAuthentication'"),
      );
      expect(message).toMatch(BUILD_TEXT);
      expect(message).not.toMatch(NETWORK_TEXT);
    });

    it('recognises the TurboModule phrasing of the same failure', () => {
      expect(
        describeSignInFailure(new Error('TurboModuleRegistry.getEnforcing: RNGoogleSignin')),
      ).toMatch(BUILD_TEXT);
    });

    it('treats Play Services being absent as a device limitation', () => {
      const message = describeSignInFailure(
        Object.assign(new Error('play services not available'), {
          code: 'PLAY_SERVICES_NOT_AVAILABLE',
        }),
      );
      expect(message).toMatch(BUILD_TEXT);
    });

    it('treats Apple sign-in being unavailable as a device limitation', () => {
      expect(
        describeSignInFailure(
          Object.assign(new Error('unavailable'), {
            code: 'ERR_APPLE_AUTHENTICATION_UNAVAILABLE',
          }),
        ),
      ).toMatch(BUILD_TEXT);
    });
  });

  describe('still names a network failure when it really is one', () => {
    it('recognises React Native’s fetch failure', () => {
      expect(describeSignInFailure(new TypeError('Network request failed'))).toMatch(NETWORK_TEXT);
    });

    it('recognises the browser’s fetch failure', () => {
      expect(describeSignInFailure(new TypeError('Failed to fetch'))).toMatch(NETWORK_TEXT);
    });

    it('recognises a refused connection', () => {
      expect(describeSignInFailure(new Error('connect ECONNREFUSED 127.0.0.1:443'))).toMatch(
        NETWORK_TEXT,
      );
    });
  });

  describe('stays honest about what it does not recognise', () => {
    it('falls back rather than guessing at a cause', () => {
      expect(describeSignInFailure(new Error('something entirely new'))).toBe(
        SIGN_IN_FALLBACK_MESSAGE,
      );
    });

    it('survives a thrown value that is not an Error', () => {
      expect(describeSignInFailure('a bare string')).toBe(SIGN_IN_FALLBACK_MESSAGE);
      expect(describeSignInFailure(null)).toBe(SIGN_IN_FALLBACK_MESSAGE);
      expect(describeSignInFailure(undefined)).toBe(SIGN_IN_FALLBACK_MESSAGE);
      expect(describeSignInFailure(42)).toBe(SIGN_IN_FALLBACK_MESSAGE);
      expect(describeSignInFailure({ nope: true })).toBe(SIGN_IN_FALLBACK_MESSAGE);
    });

    it('reads a message from a plain object that carries one', () => {
      expect(describeSignInFailure({ message: 'Network request failed' })).toMatch(NETWORK_TEXT);
    });

    it('ignores a code that is neither string nor number', () => {
      expect(describeSignInFailure({ code: { nested: true }, message: 'odd' })).toBe(
        SIGN_IN_FALLBACK_MESSAGE,
      );
    });

    it('always returns something showable', () => {
      for (const cause of [new Error(''), {}, [], 0, false, Symbol('x')]) {
        expect(describeSignInFailure(cause).length).toBeGreaterThan(0);
      }
    });
  });

  describe('never leaks provider internals to a player', () => {
    it('does not echo a raw stack-shaped message back to the screen', () => {
      const raw = 'RCTFatal: -[RNGoogleSignin signIn:] unrecognized selector at 0x7f8';
      expect(describeSignInFailure(new Error(raw))).not.toContain('RNGoogleSignin');
    });

    it('does not echo an internal Supabase URL', () => {
      const raw = 'POST https://abc.supabase.co/auth/v1/token?grant_type=id_token 400';
      expect(describeSignInFailure(new Error(raw))).not.toContain('supabase.co');
    });
  });

  describe('code classification takes priority over message text', () => {
    it('prefers the misconfiguration code even when the message mentions the network', () => {
      const message = describeSignInFailure(
        Object.assign(new Error('Network request failed'), { code: 'DEVELOPER_ERROR' }),
      );
      expect(message).toMatch(SETUP_TEXT);
    });
  });
});

describe('isCancellation', () => {
  it('recognises Apple’s cancellation code', () => {
    expect(isCancellation({ code: 'ERR_REQUEST_CANCELED' })).toBe(true);
  });

  it('recognises both spellings of cancelled', () => {
    expect(isCancellation({ code: 'ERR_REQUEST_CANCELLED' })).toBe(true);
  });

  it('recognises Google’s cancellation codes on both platforms', () => {
    expect(isCancellation({ code: 'SIGN_IN_CANCELLED' })).toBe(true);
    expect(isCancellation({ code: '12501' })).toBe(true);
    expect(isCancellation({ code: '-5' })).toBe(true);
  });

  it('recognises a cancellation described only in the message', () => {
    expect(isCancellation(new Error('The user canceled the sign-in flow'))).toBe(true);
  });

  it('does not mistake a real failure for a cancellation', () => {
    expect(isCancellation(new Error('Network request failed'))).toBe(false);
    expect(isCancellation({ code: 'DEVELOPER_ERROR' })).toBe(false);
    expect(isCancellation(null)).toBe(false);
  });

  it('does not treat a cancelled *account* as a cancelled request', () => {
    // Guards the word-boundary in the message check.
    expect(isCancellation(new Error('subscription cancellation is not supported'))).toBe(false);
  });
});
