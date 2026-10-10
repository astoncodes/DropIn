import { useRouter } from 'expo-router';

import { Button } from '../../src/components/ui/primitives';
import { RequiredLocation } from '../../src/features/location/required-location';
import { NearbyScreen } from '../../src/features/venues/nearby-screen';

export default function LiveTab() {
  const router = useRouter();
  return (
    <RequiredLocation
      alternative={
        <Button
          label="Browse upcoming sessions"
          icon="compass-outline"
          tone="neutral"
          variant="outline"
          onPress={() => router.push('/feed')}
        />
      }
    >
      <NearbyScreen />
    </RequiredLocation>
  );
}
