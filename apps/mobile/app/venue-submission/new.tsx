import { RequiredLocation } from '../../src/features/location/required-location';
import { VenueSubmissionForm } from '../../src/features/submissions/venue-submission-form';

export default function NewVenueSubmissionScreen() {
  return (
    <RequiredLocation
      insetTop={false}
      reason="Drop In starts the venue map at your location so you can place the pin."
    >
      <VenueSubmissionForm />
    </RequiredLocation>
  );
}
