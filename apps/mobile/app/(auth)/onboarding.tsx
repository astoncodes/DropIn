import { useRouter } from 'expo-router';

import { Body, Screen, Title } from '../../src/components/screen';
import { Button } from '../../src/components/ui/primitives';
import { ProfileForm } from '../../src/features/account/profile-form';
import { useSession } from '../../src/providers/auth-context';

export default function OnboardingScreen() {
  const router = useRouter();
  const { session, isLoading } = useSession();

  return (
    <Screen insetTop={false}>
      <Title>Pick your sports</Title>
      <Body>What you choose here becomes your default filter on the map.</Body>
      {!isLoading && !session && (
        <Button label="Sign in to continue" onPress={() => router.replace('/sign-in')} />
      )}
      {session && (
        <ProfileForm
          userId={session.user.id}
          submitLabel="Finish account setup"
          onSaved={() => router.replace('/profile')}
        />
      )}
    </Screen>
  );
}
