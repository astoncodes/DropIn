import { SessionScreen } from '../../src/features/community/session-screen';
import { SignedInOnly } from '../../src/features/auth/signed-in-only';

export default function SessionRoute() {
  return (
    <SignedInOnly>
      <SessionScreen />
    </SignedInOnly>
  );
}
