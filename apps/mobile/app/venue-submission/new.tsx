import { RequiredLocation } from '../../src/features/location/required-location';
import { VenueSubmissionForm } from '../../src/features/submissions/venue-submission-form';
import { SignedInOnly } from '../../src/features/auth/signed-in-only';

export default function NewVenueSubmissionScreen() {
  return (
    <SignedInOnly>
      <RequiredLocation
        insetTop={false}
        reason="Drop In starts the venue map at your location so you can place the pin."
      >
        <VenueSubmissionForm />
      </RequiredLocation>
    </SignedInOnly>
  );
}
