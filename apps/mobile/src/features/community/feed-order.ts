export type FeedLocation = { latitude: number; longitude: number };

type LocatableFeedItem = {
  created_at: string;
  session: { latitude: number | null; longitude: number | null };
};

function distanceMetres(from: FeedLocation, to: FeedLocation): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = radians(from.latitude);
  const lat2 = radians(to.latitude);
  const deltaLat = radians(to.latitude - from.latitude);
  const deltaLon = radians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Nearby moments lead; each group remains newest-first. */
export function orderFeedByLocation<T extends LocatableFeedItem>(
  posts: T[],
  location?: FeedLocation,
): T[] {
  if (!location) return posts;
  const localRadiusM = 50_000;
  return [...posts].sort((left, right) => {
    const leftDistance =
      left.session.latitude == null || left.session.longitude == null
        ? Number.POSITIVE_INFINITY
        : distanceMetres(location, {
            latitude: left.session.latitude,
            longitude: left.session.longitude,
          });
    const rightDistance =
      right.session.latitude == null || right.session.longitude == null
        ? Number.POSITIVE_INFINITY
        : distanceMetres(location, {
            latitude: right.session.latitude,
            longitude: right.session.longitude,
          });
    const localDifference =
      Number(rightDistance <= localRadiusM) - Number(leftDistance <= localRadiusM);
    if (localDifference !== 0) return localDifference;
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}
