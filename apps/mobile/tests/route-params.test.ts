import { describe, expect, it } from 'vitest';

import { uuidParam } from '../src/lib/route-params';

/**
 * Route parameters arrive from links anyone can write. An id that is not a UUID
 * can never match a row, and sending it to the API turns "this link is wrong"
 * into a database error that reads like an outage.
 */

describe('uuidParam', () => {
  it('returns a well-formed id unchanged', () => {
    expect(uuidParam('7f6b4c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b')).toBe(
      '7f6b4c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b',
    );
  });

  it('accepts upper-case hex, which Postgres also accepts', () => {
    expect(uuidParam('7F6B4C1E-2A3D-4E5F-8A9B-0C1D2E3F4A5B')).toBe(
      '7F6B4C1E-2A3D-4E5F-8A9B-0C1D2E3F4A5B',
    );
  });

  it.each([
    ['a word', 'not-a-uuid'],
    ['an empty string', ''],
    ['a truncated id', '7f6b4c1e-2a3d-4e5f-8a9b'],
    ['an id with trailing text', '7f6b4c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b/extra'],
    ['an id with surrounding space', ' 7f6b4c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b '],
    ['non-hex characters', '7f6b4c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5z'],
  ])('rejects %s', (_label, value) => {
    expect(uuidParam(value)).toBeUndefined();
  });

  it('rejects a missing parameter', () => {
    expect(uuidParam(undefined)).toBeUndefined();
  });

  it('rejects a repeated parameter, which the router delivers as a list', () => {
    expect(uuidParam(['7f6b4c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b'])).toBeUndefined();
  });
});
