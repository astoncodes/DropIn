import { RequiredLocation } from '../../src/features/location/required-location';
import { NewRunScreen } from '../../src/features/runs/new-run-screen';
import { SignedInOnly } from '../../src/features/auth/signed-in-only';

export default function NewRunRoute() {
  return (
    <SignedInOnly>
      <RequiredLocation
        insetTop={false}
        reason="Drop In starts the meeting-spot map at your location."
      >
        <NewRunScreen />
      </RequiredLocation>
    </SignedInOnly>
  );
}
