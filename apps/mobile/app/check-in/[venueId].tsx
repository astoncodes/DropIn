import { useLocalSearchParams } from 'expo-router';

import { CheckInScreen } from '../../src/features/presence/check-in-screen';
import { uuidParam } from '../../src/lib/route-params';

export default function CheckInRoute() {
  const { venueId, arrival } = useLocalSearchParams<{ venueId: string; arrival?: string }>();
  return <CheckInScreen venueId={uuidParam(venueId)} initialArrival={arrival === 'true'} />;
}
