import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Chip, PressableSurface } from '../../components/ui/primitives';
import { radius, space, usePalette } from '../../theme';
import {
  addMinutes,
  currentTime,
  minutesBetween,
  timeLabel,
  timeSlots,
  upcomingDays,
} from './session-times';

/** When a session happens: its date, its start, and how long it runs. */
export type SessionTimes = { date: string; start: string; minutes: number };

const LENGTHS = [60, 90, 120, 180];
/** A series may run for twelve weeks, so a dated session can be that far ahead. */
const FURTHEST_DAY = 85;
const DAYS_SHOWN = 14;
/** The end time for a session, or null when it would run past midnight. */
export function sessionEnd(times: SessionTimes): string | null {
  return addMinutes(times.start, times.minutes);
}

/** The length of a session that already has a start and an end, for editing it. */
export function sessionLength(start: string, end: string): number {
  const minutes = minutesBetween(start, end);
  return minutes > 0 ? minutes : LENGTHS[0]!;
}

function lengthLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/**
 * Picks a session's day, start and length by tapping, in the session's own
 * time zone. Days are a strip of the coming fortnight, starts are half-hour
 * slots, and the end is a length rather than a second clock time, so nobody
 * types a date or converts to a 24-hour clock.
 */
export function SessionTimeFields({
  timezone,
  value,
  onChange,
  disabled = false,
}: {
  timezone: string;
  value: SessionTimes;
  onChange: (next: SessionTimes) => void;
  disabled?: boolean;
}) {
  const colors = usePalette();
  // One reading of the clock per visit, so the choices do not shift mid-tap.
  const [now] = useState(() => new Date());
  const slotScroller = useRef<ScrollView>(null);
  const positioned = useRef(false);

  const allDays = upcomingDays(now, timezone, FURTHEST_DAY);
  const selectedDay = allDays.findIndex((day) => day.date === value.date);
  const days = allDays.slice(0, Math.max(DAYS_SHOWN, selectedDay + 1));

  // Earlier today is not offered; a start already chosen always is.
  const earliest = value.date === allDays[0]?.date ? currentTime(now, timezone) : '00:00';
  const slots = [
    ...new Set([...timeSlots().filter((slot) => slot > earliest), value.start]),
  ].sort();
  const lengths = LENGTHS.includes(value.minutes)
    ? LENGTHS
    : [...LENGTHS, value.minutes].sort((a, b) => a - b);
  const end = sessionEnd(value);

  return (
    <View style={styles.fields} pointerEvents={disabled ? 'none' : 'auto'}>
      <View style={styles.field}>
        <AppText variant="caption" style={styles.label}>
          Day
        </AppText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {days.map((day, index) => {
            const selected = day.date === value.date;
            return (
              <PressableSurface
                key={day.date}
                onPress={() => onChange({ ...value, date: day.date })}
                selected={selected}
                accessibilityLabel={index === 0 ? 'Today' : `${day.weekday} ${day.dayOfMonth}`}
              >
                <View
                  style={[
                    styles.day,
                    {
                      backgroundColor: selected ? colors.surfaceInverse : colors.surface,
                      borderColor: selected ? colors.surfaceInverse : colors.borderStrong,
                    },
                  ]}
                >
                  <AppText variant="label" tone={selected ? 'inverse' : 'muted'}>
                    {index === 0 ? 'Today' : day.weekday}
                  </AppText>
                  <AppText variant="heading" tone={selected ? 'inverse' : 'default'}>
                    {day.dayOfMonth}
                  </AppText>
                </View>
              </PressableSurface>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.field}>
        <AppText variant="caption" style={styles.label}>
          Starts
        </AppText>
        <ScrollView
          ref={slotScroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {slots.map((slot) => (
            <View
              key={slot}
              onLayout={
                slot === value.start
                  ? (event) => {
                      // Open with the chosen start in view rather than at 6 a.m.
                      if (positioned.current) return;
                      positioned.current = true;
                      slotScroller.current?.scrollTo({
                        x: Math.max(0, event.nativeEvent.layout.x - space.xxl),
                        animated: false,
                      });
                    }
                  : undefined
              }
            >
              <Chip
                label={timeLabel(slot)}
                selected={slot === value.start}
                onPress={() => onChange({ ...value, start: slot })}
              />
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.field}>
        <AppText variant="caption" style={styles.label}>
          Length
        </AppText>
        <View style={styles.wrap}>
          {lengths.map((minutes) => (
            <Chip
              key={minutes}
              label={lengthLabel(minutes)}
              selected={minutes === value.minutes}
              onPress={() => onChange({ ...value, minutes })}
            />
          ))}
        </View>
        <AppText variant="caption" tone={end ? 'muted' : 'alert'}>
          {end
            ? `Ends at ${timeLabel(end)}. Times are in ${timezone}.`
            : 'That runs past midnight. Choose an earlier start or a shorter length.'}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: space.lg },
  field: { gap: space.sm },
  label: { fontWeight: '600' },
  strip: { gap: space.sm, paddingRight: space.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  day: {
    width: 62,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
