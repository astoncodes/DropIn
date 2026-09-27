import { CHECK_IN_DURATION, CHECK_IN_NOTE_MAX_LENGTH, PARTY_SIZE } from '@dropin/shared';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '../../components/screen';
import { SportBadge } from '../../components/ui/brand';
import { Notice } from '../../components/ui/notice';
import { AppText, Button, Chip, IconButton, sportIcon } from '../../components/ui/primitives';
import { TextField } from '../../components/ui/text-field';
import { useSession } from '../../providers/auth-context';
import { space } from '../../theme';
import { useDeviceLocation } from '../location/use-device-location';
import { useSports, useVenueDetail } from '../venues/api';
import { useOwnPresence, usePresenceAction } from './api';
import { UserFacingError, userMessage } from '../../lib/errors';

export function CheckInScreen({
  venueId,
  initialArrival = false,
}: {
  venueId: string;
  initialArrival?: boolean;
}) {
  const router = useRouter();
  const { session, isLoading } = useSession();
  const venue = useVenueDetail(venueId);
  const sports = useSports();
  const own = useOwnPresence(session?.user.id);
  const action = usePresenceAction();
  const location = useDeviceLocation();
  const [arrival, setArrival] = useState(initialArrival);
  const [sportId, setSportId] = useState<number>();
  const [minutes, setMinutes] = useState<number>(CHECK_IN_DURATION.defaultMinutes);
  const [eta, setEta] = useState(30);
  const [party, setParty] = useState<number>(PARTY_SIZE.default);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const available = (sports.data ?? []).filter(
    (sport) => venue.data?.sport_slugs?.includes(sport.slug) && sport.is_active,
  );
  const selected = available.find((sport) => sport.id === sportId) ?? available[0];

  async function submit() {
    if (!session || !selected || !venue.data || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (arrival) {
        await action.mutateAsync({
          kind: 'arrive',
          venueId: venue.data.venue_id,
          sportId: selected.id,
          minutes: eta,
        });
      } else {
        const coords = await location.request();
        if (!coords)
          throw new UserFacingError(
            'Location is needed to check in. Enable location access and try again, or share that you are on your way.',
          );
        if (coords.accuracyM == null)
          throw new UserFacingError(
            'Your device could not report location accuracy. Try again outdoors.',
          );
        await action.mutateAsync({
          kind: 'check-in',
          venueId: venue.data.venue_id,
          sportId: selected.id,
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracyM,
          observedAt: coords.observedAt,
          minutes,
          partySize: party,
          note,
        });
      }
      router.replace(`/venue/${venue.data.venue_id}`);
    } catch (cause) {
      setError(userMessage(cause, 'Could not update your status. Please try again.'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (isLoading || venue.isPending)
    return (
      <Screen insetTop={false}>
        <AppText>Loading your venue…</AppText>
      </Screen>
    );
  if (!session)
    return (
      <Screen insetTop={false}>
        <AppText variant="display">Meet you on the court.</AppText>
        <AppText tone="muted">Sign in to check in or let players know you are on your way.</AppText>
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
      </Screen>
    );
  if (!venue.data)
    return (
      <Screen insetTop={false}>
        <AppText variant="heading">This venue is unavailable.</AppText>
        <Button label="Back to map" onPress={() => router.replace('/')} />
      </Screen>
    );
  return (
    <Screen insetTop={false}>
      <SportBadge slug={selected?.slug} size={56} />
      <AppText variant="display">{arrival ? 'See you soon.' : 'Make it a game.'}</AppText>
      <AppText tone="muted">{venue.data.name}</AppText>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip
          label="I'm here"
          selected={!arrival}
          tone="live"
          onPress={
            busy
              ? undefined
              : () => {
                  setArrival(false);
                  setError('');
                }
          }
        />
        <Chip
          label="On my way"
          selected={arrival}
          tone="live"
          onPress={
            busy
              ? undefined
              : () => {
                  setArrival(true);
                  setError('');
                }
          }
        />
      </View>
      <AppText variant="heading">What are you playing?</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {available.map((sport) => (
          <Chip
            key={sport.id}
            label={sport.name}
            icon={sportIcon(sport.slug)}
            selected={selected?.id === sport.id}
            onPress={busy ? undefined : () => setSportId(sport.id)}
          />
        ))}
      </View>
      {sports.isError && (
        <Button label="Retry sports" variant="outline" onPress={() => void sports.refetch()} />
      )}
      {!sports.isPending && !available.length && (
        <AppText tone="muted">This venue has no active sports available for check-in yet.</AppText>
      )}
      <AppText variant="heading">{arrival ? 'Arriving in' : 'How long are you staying?'}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {(arrival ? [15, 30, 60] : [30, 60, 90, 120, 180, 240]).map((value) => (
          <Chip
            key={value}
            label={value < 60 ? `${value} min` : `${value / 60} hr`}
            selected={(arrival ? eta : minutes) === value}
            onPress={busy ? undefined : () => (arrival ? setEta(value) : setMinutes(value))}
          />
        ))}
      </View>
      {!arrival && (
        <>
          <AppText variant="heading">Players, including you</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <IconButton
              icon="minus"
              label="Fewer players"
              onPress={() => setParty((value) => Math.max(PARTY_SIZE.min, value - 1))}
              disabled={busy || party === PARTY_SIZE.min}
            />
            <AppText variant="heading">{party}</AppText>
            <IconButton
              icon="plus"
              label="More players"
              onPress={() => setParty((value) => Math.min(PARTY_SIZE.max, value + 1))}
              disabled={busy || party === PARTY_SIZE.max}
            />
          </View>
          <TextField
            label="A quick note (optional)"
            accessibilityLabel="Check-in note"
            placeholder="Bringing a ball. All levels welcome."
            value={note}
            onChangeText={setNote}
            maxLength={CHECK_IN_NOTE_MAX_LENGTH}
            showCount
            editable={!busy}
          />
          <AppText variant="caption" tone="muted">
            Check in within 250 metres with location accuracy of 100 metres or better. Your name,
            sport, party size and note are visible until your check-in ends. We keep the distance
            and accuracy, not your coordinates.
          </AppText>
          {!!own.data?.checkIn && (
            <AppText tone="muted">This will replace your current check-in.</AppText>
          )}
        </>
      )}
      {arrival && (
        <AppText tone="muted">
          Your arrival status disappears after {eta} minutes. Check in when you get there to appear
          in the live player count.
        </AppText>
      )}
      {!!error && <Notice tone="error" message={error} />}
      <Button
        label={arrival ? "I'm on my way" : 'Check in now'}
        icon={arrival ? 'walk' : 'map-marker-check'}
        onPress={() => void submit()}
        loading={busy}
        disabled={!selected || busy}
      />
    </Screen>
  );
}
