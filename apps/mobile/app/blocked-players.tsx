import { BlockedPlayersScreen } from '../src/features/moderation/blocked-players-screen';
import { SignedInOnly } from '../src/features/auth/signed-in-only';
export default function BlockedPlayersRoute() {
  return (
    <SignedInOnly>
      <BlockedPlayersScreen />
    </SignedInOnly>
  );
}
