import { describe, expect, it } from 'vitest';

import { orderFeedByLocation } from '../src/features/community/feed-order';

const charlottetown = { latitude: 46.2382, longitude: -63.1311 };

function post(id: string, createdAt: string, latitude: number | null, longitude: number | null) {
  return { id, created_at: createdAt, session: { latitude, longitude } };
}

describe('orderFeedByLocation', () => {
  it('shows nearby events before newer distant events, then keeps each group newest-first', () => {
    const ordered = orderFeedByLocation(
      [
        post('distant-new', '2026-10-15T12:00:00Z', 43.6532, -79.3832),
        post('nearby-old', '2026-10-15T10:00:00Z', 46.25, -63.12),
        post('nearby-new', '2026-10-15T11:00:00Z', 46.24, -63.13),
        post('unknown', '2026-10-15T13:00:00Z', null, null),
      ],
      charlottetown,
    );

    expect(ordered.map((item) => item.id)).toEqual([
      'nearby-new',
      'nearby-old',
      'unknown',
      'distant-new',
    ]);
  });

  it('preserves the server order when location is unavailable', () => {
    const posts = [
      post('first', '2026-10-15T10:00:00Z', 46.24, -63.13),
      post('second', '2026-10-15T11:00:00Z', 43.65, -79.38),
    ];
    expect(orderFeedByLocation(posts)).toBe(posts);
  });
});
