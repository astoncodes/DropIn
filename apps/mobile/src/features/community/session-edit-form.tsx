import { useState } from 'react';
import { View } from 'react-native';

import VenueMap from '../../components/map/venue-map';
import { Notice } from '../../components/ui/notice';
import { AppText, Button } from '../../components/ui/primitives';
import { TextField } from '../../components/ui/text-field';
import { space, useThemeName } from '../../theme';
import type { EditSessionInput, useSessionOverview } from './api';
import { userMessage } from '@dropin/shared';

type Session = NonNullable<ReturnType<typeof useSessionOverview>['data']>;

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
  const [date, setDate] = useState(localFields(item.starts_at, item.timezone).date);
  const [start, setStart] = useState(localFields(item.starts_at, item.timezone).time);
  const [end, setEnd] = useState(localFields(item.ends_at, item.timezone).time);
  const [name, setName] = useState(item.venueName);
  const [pin, setPin] = useState({ latitude: item.latitude ?? 0, longitude: item.longitude ?? 0 });
  const [error, setError] = useState('');
  async function save() {
    setError('');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) ||
      start >= end ||
      title.trim().length < 2
    ) {
      setError('Enter a title, date as YYYY-MM-DD, and 24-hour times with end after start.');
      return;
    }
    try {
      await onSave({
        p_session_id: item.id,
        p_title: title,
        p_date: date,
        p_start_time: start,
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
  const fields = [
    { label: 'Session title', value: title, change: setTitle, max: 80 },
    { label: 'Date (YYYY-MM-DD)', value: date, change: setDate, max: 10 },
    { label: 'Start (24-hour HH:MM)', value: start, change: setStart, max: 5 },
    { label: 'End (24-hour HH:MM)', value: end, change: setEnd, max: 5 },
    ...(item.venue_id === null
      ? [{ label: 'Meeting spot', value: name, change: setName, max: 120 }]
      : []),
  ];
  return (
    <View style={{ padding: space.lg, gap: space.md }}>
      <AppText variant="heading">Edit this session</AppText>
      <AppText variant="caption" tone="muted">
        Only this occurrence changes. Times are in {item.timezone}.
      </AppText>
      {fields.map((field) => (
        <TextField
          key={field.label}
          label={field.label}
          value={field.value}
          onChangeText={field.change}
          editable={!pending}
          maxLength={field.max}
          autoCapitalize="none"
        />
      ))}
      {item.venue_id === null && (
        <>
          <AppText variant="caption">Tap the map or drag the pin to move the meeting spot.</AppText>
          <View
            style={{ height: 220, position: 'relative' }}
            pointerEvents={pending ? 'none' : 'auto'}
          >
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
      <Button label="Save changes" loading={pending} onPress={() => void save()} />
      <Button
        label="Discard changes"
        tone="neutral"
        variant="soft"
        disabled={pending}
        onPress={onClose}
      />
    </View>
  );
}
