import { RequiredLocation } from '../../src/features/location/required-location';
import { NewRunScreen } from '../../src/features/runs/new-run-screen';

export default function NewRunRoute() {
  return (
    <RequiredLocation reason="Drop In starts the meeting-spot map at your location.">
      <NewRunScreen />
    </RequiredLocation>
  );
}
