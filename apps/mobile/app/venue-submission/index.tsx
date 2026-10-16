import { SubmissionsScreen } from '../../src/features/submissions/submissions-screen';
import { SignedInOnly } from '../../src/features/auth/signed-in-only';

export default function VenueSubmissionsRoute() {
  return (
    <SignedInOnly>
      <SubmissionsScreen />
    </SignedInOnly>
  );
}
