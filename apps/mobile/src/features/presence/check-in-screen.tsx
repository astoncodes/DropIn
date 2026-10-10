import {
  CHECK_IN_DURATION,
  CHECK_IN_NOTE_MAX_LENGTH,
  PARTY_SIZE,
  UserFacingError,
  userMessage,
} from '@dropin/shared';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '../../components/screen';
import { EmptyState, LoadError } from '../../components/ui/activity';
import { Notice } from '../../components/ui/notice';
import { AppText, Button, Chip, IconButton, sportIcon } from '../../components/ui/primitives';
import { SegmentedControl } from '../../components/ui/segmented-control';
import { TextField } from '../../components/ui/text-field';
import { useSession } from '../../providers/auth-context';
import { radius, space, usePalette } from '../../theme';
import { useDeviceLocation } from '../location/use-device-location';
import { useSports, useVenueDetail } from '../venues/api';
import { SportsUnavailableNotice } from '../venues/sports-unavailable-notice';
import { useOwnPresence, usePresenceAction } from './api';
import { loadPhase } from '../../lib/load-phase';

export function CheckInScreen({
  venueId,
  initialArrival = false,
}: {
  /** Undefined when the link did not carry a usable venue id. */
  venueId: string | undefined;
  initialArrival?: boolean;
}) {
  const router = useRouter();
  const colors = usePalette();
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
  const venuePhase = venueId ? loadPhase(venue) : 'ready';

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

  if (isLoading || venuePhase === 'loading')
    return (
      <Screen insetTop={false}>
        <AppText>Loading your venue…</AppText>
      </Screen>
    );
  if (!session)
    return (
      <Screen insetTop={false}>
        <EmptyState
          title="Sign in to check in"
          body="Checking in shows other players your name, so it needs an account."
          action={<Button label="Sign in" size="sm" onPress={() => router.push('/sign-in')} />}
        />
      </Screen>
    );
  if (venuePhase === 'failed')
    return (
      <Screen insetTop={false}>
        <LoadError
          title="Could not load this venue"
          onRetry={() => void venue.refetch()}
          retrying={venue.isFetching}
        />
      </Screen>
    );
  if (!venue.data)
    return (
      <Screen insetTop={false}>
        <EmptyState
          title="This venue is unavailable."
          action={<Button label="Back to map" size="sm" onPress={() => router.replace('/')} />}
        />
      </Screen>
    );
  return (
    <Screen insetTop={false}>
      <View accessibilityRole="header">
        <AppText variant="title">{venue.data.name}</AppText>
      </View>
      <SegmentedControl
        segments={[
          { value: 'here', label: 'I’m here' },
          { value: 'coming', label: 'On my way' },
        ]}
        value={arrival ? 'coming' : 'here'}
        onChange={(mode) => {
          if (busy) return;
          setArrival(mode === 'coming');
          setError('');
        }}
        accessibilityLabel="Check in or share that you are on your way"
      />
      <AppText variant="caption" style={{ fontWeight: '600' }}>
        Sport
      </AppText>
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
      <SportsUnavailableNotice sports={sports} />
      {loadPhase(sports) === 'ready' && !available.length && (
        <AppText tone="muted">This venue has no active sports available for check-in yet.</AppText>
      )}
      <AppText variant="caption" style={{ fontWeight: '600' }}>
        {arrival ? 'Arriving in' : 'Staying for'}
      </AppText>
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
          <AppText variant="caption" style={{ fontWeight: '600' }}>
            Players, including you
          </AppText>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: colors.borderStrong,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
            }}
          >
            <IconButton
              icon="minus"
              label="Fewer players"
              onPress={() => setParty((value) => Math.max(PARTY_SIZE.min, value - 1))}
              disabled={busy || party === PARTY_SIZE.min}
            />
            <AppText variant="heading" style={{ minWidth: 36, textAlign: 'center' }}>
              {party}
            </AppText>
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
        tone={arrival ? 'neutral' : 'live'}
        onPress={() => void submit()}
        loading={busy}
        disabled={!selected || busy}
      />
    </Screen>
  );
}
