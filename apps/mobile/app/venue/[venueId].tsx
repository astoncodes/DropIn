import { VenueDetailScreen } from '../../src/features/venues/venue-detail-screen';
import { SignedInOnly } from '../../src/features/auth/signed-in-only';

export default function VenueRoute() {
  return (
    <SignedInOnly>
      <VenueDetailScreen />
    </SignedInOnly>
  );
}
