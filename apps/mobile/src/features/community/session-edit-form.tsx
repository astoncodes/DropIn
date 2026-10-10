import { userMessage } from '@dropin/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import VenueMap from '../../components/map/venue-map';
import { Notice } from '../../components/ui/notice';
import { AppText, Button } from '../../components/ui/primitives';
import { TextField } from '../../components/ui/text-field';
import { radius, space, useThemeName } from '../../theme';
import { SessionTimeFields, sessionEnd, sessionLength } from '../runs/session-time-fields';
import type { SessionTimes } from '../runs/session-time-fields';
import type { EditSessionInput, useSessionOverview } from './api';

type Session = NonNullable<ReturnType<typeof useSessionOverview>['data']>;

/** The session's wall-clock date and time in its own zone, as the form edits them. */
function localFields(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

export function SessionEditForm({
  item,
  pending,
  onSave,
  onClose,
}: {
  item: Session;
  pending: boolean;
  onSave: (input: EditSessionInput) => Promise<void>;
  onClose: () => void;
}) {
  const scheme = useThemeName();
  const [title, setTitle] = useState(item.title);
  const [times, setTimes] = useState<SessionTimes>(() => {
    const starts = localFields(item.starts_at, item.timezone);
    return {
      date: starts.date,
      start: starts.time,
      minutes: sessionLength(starts.time, localFields(item.ends_at, item.timezone).time),
    };
  });
  const [name, setName] = useState(item.venueName);
  const [pin, setPin] = useState({ latitude: item.latitude ?? 0, longitude: item.longitude ?? 0 });
  const [error, setError] = useState('');
  async function save() {
    setError('');
    const end = sessionEnd(times);
    if (title.trim().length < 2) {
      setError('Give the session a name of at least two characters.');
      return;
    }
    if (!end) {
      setError('That runs past midnight. Choose an earlier start or a shorter length.');
      return;
    }
    try {
      await onSave({
        p_session_id: item.id,
        p_title: title,
        p_date: times.date,
        p_start_time: times.start,
        p_end_time: end,
        p_timezone: item.timezone,
        ...(item.venue_id === null
          ? { p_location_name: name, p_lat: pin.latitude, p_lon: pin.longitude }
          : {}),
      });
      onClose();
    } catch (cause) {
      setError(userMessage(cause, 'Could not save. Try again.'));
    }
  }
  return (
    <View style={styles.form}>
      <View accessibilityRole="header">
        <AppText variant="heading">Edit this session</AppText>
      </View>
      <AppText variant="caption" tone="muted">
        Only this date changes. Other weeks in the series stay as they are.
      </AppText>
      <TextField
        label="Session name"
        value={title}
        onChangeText={setTitle}
        editable={!pending}
        maxLength={80}
      />
      <SessionTimeFields
        timezone={item.timezone}
        value={times}
        onChange={setTimes}
        disabled={pending}
      />
      {item.venue_id === null && (
        <>
          <TextField
            label="Meeting spot name"
            value={name}
            onChangeText={setName}
            editable={!pending}
            maxLength={120}
          />
          <AppText variant="caption" tone="muted">
            Tap the map or drag the pin to move the meeting spot.
          </AppText>
          <View style={styles.map} pointerEvents={pending ? 'none' : 'auto'}>
            <VenueMap
              colorScheme={scheme}
              region={{ ...pin, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
              markers={[
                {
                  id: item.id,
                  ...pin,
                  label: name,
                  sportSlug: item.sportSlug,
                  count: 0,
                  isLive: false,
                  isPending: true,
                  kind: 'session' as const,
                  draggable: true,
                },
              ]}
              onPressCoordinate={setPin}
              onMarkerDragEnd={(_, coordinate) => setPin(coordinate)}
            />
          </View>
        </>
      )}
      {error ? <Notice tone="error" message={error} /> : null}
      <View style={styles.actions}>
        <Button
          label="Save changes"
          loading={pending}
          style={styles.action}
          onPress={() => void save()}
        />
        <Button label="Discard" variant="ghost" disabled={pending} onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  map: { height: 220, borderRadius: radius.lg, overflow: 'hidden' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  action: { flex: 1 },
});
