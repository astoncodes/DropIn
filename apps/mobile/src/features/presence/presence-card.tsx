import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button } from '../../components/ui/primitives';
import { timeOfDay } from '../../lib/format';
import { useSession } from '../../providers/auth-context';
import { radius, space, usePalette } from '../../theme';
import { useVenueDetail } from '../venues/api';
import { useOwnPresence, usePresenceAction, usePresenceClock } from './api';
import { userMessage } from '@dropin/shared';

export function PresenceCard({ venueId }: { venueId?: string }) {
  const { session } = useSession();
  const own = useOwnPresence(session?.user.id);
  const now = usePresenceClock();
  const checkIn = own.data?.checkIn;
  const arrival = own.data?.arrival;
  return (
    <>
      {checkIn &&
        Date.parse(checkIn.expires_at) > now &&
        (!venueId || checkIn.venue_id === venueId) && (
          <PresenceStatus active={checkIn} checkIn={checkIn} showVenue={!venueId} />
        )}
      {arrival &&
        Date.parse(arrival.expires_at) > now &&
        (!venueId || arrival.venue_id === venueId) && (
          <PresenceStatus active={arrival} showVenue={!venueId} />
        )}
    </>
  );
}

function PresenceStatus({
  active,
  checkIn,
  showVenue,
}: {
  active: { id: string; venue_id: string; expires_at: string };
  checkIn?: { started_at: string; expires_at: string };
  showVenue: boolean;
}) {
  const action = usePresenceAction();
  const colors = usePalette();
  const router = useRouter();
  const [error, setError] = useState('');
  const venue = useVenueDetail(active.venue_id);

  async function change(kind: 'checkout' | 'extend' | 'cancel-arrival') {
    if (!active || action.isPending) return;
    setError('');
    try {
      await action.mutateAsync({ kind, id: active.id });
    } catch (cause) {
      setError(userMessage(cause, 'Could not update your status. Try again.'));
    }
  }
  const canExtend =
    checkIn &&
    Date.parse(checkIn.expires_at) + 30 * 60_000 <= Date.parse(checkIn.started_at) + 240 * 60_000;
  return (
    <View
      style={{
        padding: space.lg,
        gap: space.sm,
        borderRadius: radius.xl,
        backgroundColor: colors.liveSoft,
      }}
    >
      <AppText variant="heading">{checkIn ? "You're checked in" : "You're on your way"}</AppText>
      <AppText>
        {venue.data?.name ?? 'Your venue'} · until {timeOfDay(active.expires_at)}
      </AppText>
      {!!error && <AppText tone="alert">{error}</AppText>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {checkIn ? (
          <>
            <Button
              label="Check out"
              size="sm"
              onPress={() => void change('checkout')}
              loading={action.isPending && action.variables?.kind === 'checkout'}
              disabled={action.isPending}
            />
            {canExtend && (
              <Button
                label="Stay 30 min longer"
                size="sm"
                tone="neutral"
                variant="outline"
                onPress={() => void change('extend')}
                loading={action.isPending && action.variables?.kind === 'extend'}
                disabled={action.isPending}
              />
            )}
          </>
        ) : (
          <>
            <Button
              label="I've arrived · check in"
              size="sm"
              onPress={() =>
                router.push({
                  pathname: '/check-in/[venueId]',
                  params: { venueId: active.venue_id },
                })
              }
            />
            <Button
              label="Cancel arrival"
              size="sm"
              tone="neutral"
              variant="outline"
              onPress={() => void change('cancel-arrival')}
              loading={action.isPending}
            />
          </>
        )}
      </View>
      {showVenue && (
        <Button
          label="Open venue"
          size="sm"
          tone="neutral"
          variant="outline"
          onPress={() => router.push(`/venue/${active.venue_id}`)}
        />
      )}
    </View>
  );
}
