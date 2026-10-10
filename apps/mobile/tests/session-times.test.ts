import { describe, expect, it } from 'vitest';

import {
  addMinutes,
  defaultSessionStart,
  minutesBetween,
  timeSlots,
  upcomingDays,
} from '../src/features/runs/session-times';

/**
 * The session form offers days and times to pick from. What it sends to the
 * database is still a calendar date and two wall-clock times in the session's
 * time zone, so these helpers are checked against that zone, not the device's.
 */

describe('upcomingDays — the days offered for a session', () => {
  // 02:30 UTC on 10 October is still the evening of the 9th in Halifax (UTC-3).
  const lateEveningInHalifax = new Date('2026-10-10T02:30:00Z');

  it('starts from today in the session time zone, not the device or UTC date', () => {
    const [first] = upcomingDays(lateEveningInHalifax, 'America/Halifax', 3);

    expect(first?.date).toBe('2026-10-09');
  });

  it('starts from the UTC date when that is the session time zone', () => {
    const [first] = upcomingDays(lateEveningInHalifax, 'UTC', 3);

    expect(first?.date).toBe('2026-10-10');
  });

  it('returns consecutive calendar dates', () => {
    const days = upcomingDays(lateEveningInHalifax, 'America/Halifax', 4);

    expect(days.map((day) => day.date)).toEqual([
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
    ]);
  });

  it('crosses a month boundary', () => {
    const days = upcomingDays(new Date('2026-10-30T15:00:00Z'), 'America/Halifax', 4);

    expect(days.map((day) => day.date)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('does not skip or repeat a day when the clocks change', () => {
    // Clocks go back in Halifax on 1 November 2026, making that day 25 hours long.
    const days = upcomingDays(new Date('2026-10-31T12:00:00Z'), 'America/Halifax', 4);

    expect(days.map((day) => day.date)).toEqual([
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
  });

  it('labels each day with its weekday and day of the month', () => {
    const [friday] = upcomingDays(lateEveningInHalifax, 'America/Halifax', 1);

    expect(friday).toMatchObject({ weekday: 'Fri', dayOfMonth: '9' });
  });

  it('falls back to UTC for a time zone the device does not know', () => {
    const [first] = upcomingDays(lateEveningInHalifax, 'Not/AZone', 1);

    expect(first?.date).toBe('2026-10-10');
  });
});

describe('timeSlots — the start times offered', () => {
  it('steps in half hours across the playable day', () => {
    const slots = timeSlots();

    expect(slots[0]).toBe('06:00');
    expect(slots[1]).toBe('06:30');
    expect(slots.at(-1)).toBe('23:30');
    expect(slots).toHaveLength(36);
  });
});

describe('addMinutes — the end time for a start and a duration', () => {
  it('adds within the hour and across hours', () => {
    expect(addMinutes('19:00', 60)).toBe('20:00');
    expect(addMinutes('19:30', 90)).toBe('21:00');
    expect(addMinutes('09:05', 55)).toBe('10:00');
  });

  it('allows a session to end at the last minute of the day', () => {
    expect(addMinutes('22:00', 119)).toBe('23:59');
  });

  it('refuses an end at or past midnight, which the session date cannot express', () => {
    expect(addMinutes('23:00', 60)).toBeNull();
    expect(addMinutes('23:30', 120)).toBeNull();
  });

  it('refuses a start that is not a time', () => {
    expect(addMinutes('7pm', 60)).toBeNull();
    expect(addMinutes('25:00', 60)).toBeNull();
  });
});

describe('minutesBetween — how long an existing session runs', () => {
  it('measures a same-day session', () => {
    expect(minutesBetween('19:00', '20:30')).toBe(90);
  });

  it('is not positive when the end is not after the start', () => {
    expect(minutesBetween('20:00', '20:00')).toBe(0);
    expect(minutesBetween('20:00', '19:00')).toBeLessThan(0);
  });
});

describe('defaultSessionStart — what the form opens on', () => {
  it('offers this evening while there is still time to plan it', () => {
    // 14:00 in Halifax.
    expect(defaultSessionStart(new Date('2026-10-09T17:00:00Z'), 'America/Halifax')).toEqual({
      date: '2026-10-09',
      start: '19:00',
    });
  });

  it('offers tomorrow evening once this evening is too close', () => {
    // 18:30 in Halifax.
    expect(defaultSessionStart(new Date('2026-10-09T21:30:00Z'), 'America/Halifax')).toEqual({
      date: '2026-10-10',
      start: '19:00',
    });
  });
});
