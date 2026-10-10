import { describe, expect, it } from 'vitest';

import {
  activitySummary,
  distanceLabel,
  relativeFuture,
  relativeTime,
  remainingTime,
  timeOfDay,
  tomorrowDate,
  weekdayGroup,
  weekdayName,
} from '../src/lib/format';

/**
 * Freshness phrasing is a trust surface, not decoration: every live count in
 * this app is shown next to a claim about how old it is. These lock the
 * boundaries, because rounding is where that phrasing goes wrong — "1 hrs ago"
 * or a count that says "Just now" an hour later is the kind of thing users
 * notice once and then stop believing the rest.
 */

const NOW = Date.parse('2026-09-07T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it('names the absence of data rather than implying freshness', () => {
    expect(relativeTime(null, NOW)).toBe('No recent activity');
    expect(relativeTime(undefined, NOW)).toBe('No recent activity');
  });

  it('collapses anything under a minute to "Just now"', () => {
    expect(relativeTime(ago(0), NOW)).toBe('Just now');
    expect(relativeTime(ago(29_000), NOW)).toBe('Just now');
  });

  it('singularises at exactly one unit', () => {
    expect(relativeTime(ago(MINUTE), NOW)).toBe('1 min ago');
    expect(relativeTime(ago(HOUR), NOW)).toBe('1 hr ago');
    expect(relativeTime(ago(DAY), NOW)).toBe('Yesterday');
  });

  it('crosses from minutes to hours to days', () => {
    expect(relativeTime(ago(59 * MINUTE), NOW)).toBe('59 min ago');
    expect(relativeTime(ago(2 * HOUR), NOW)).toBe('2 hrs ago');
    expect(relativeTime(ago(23 * HOUR), NOW)).toBe('23 hrs ago');
    expect(relativeTime(ago(3 * DAY), NOW)).toBe('3 days ago');
  });

  it('rounds to nearest, so 90 seconds is not "Just now"', () => {
    expect(relativeTime(ago(90_000), NOW)).toBe('2 min ago');
  });
});

describe('relativeFuture', () => {
  it('returns empty for a missing time, so callers render nothing', () => {
    expect(relativeFuture(null, NOW)).toBe('');
    expect(relativeFuture(undefined, NOW)).toBe('');
  });

  it('treats a past or present time as "now" rather than counting backwards', () => {
    expect(relativeFuture(ago(HOUR), NOW)).toBe('now');
    expect(relativeFuture(ahead(0), NOW)).toBe('now');
  });

  it('pluralises hours and days but never minutes', () => {
    expect(relativeFuture(ahead(25 * MINUTE), NOW)).toBe('in 25 min');
    expect(relativeFuture(ahead(HOUR), NOW)).toBe('in 1 hr');
    expect(relativeFuture(ahead(2 * HOUR), NOW)).toBe('in 2 hrs');
    expect(relativeFuture(ahead(DAY), NOW)).toBe('in 1 day');
    expect(relativeFuture(ahead(3 * DAY), NOW)).toBe('in 3 days');
  });
});

describe('remainingTime', () => {
  it('never counts below zero once a check-in has lapsed', () => {
    expect(remainingTime(ago(HOUR), NOW)).toBe('Expiring now');
    expect(remainingTime(ahead(0), NOW)).toBe('Expiring now');
  });

  it('shows minutes, then hours, then hours and minutes', () => {
    expect(remainingTime(ahead(45 * MINUTE), NOW)).toBe('45 min left');
    expect(remainingTime(ahead(2 * HOUR), NOW)).toBe('2 hr left');
    expect(remainingTime(ahead(90 * MINUTE), NOW)).toBe('1 hr 30 min left');
  });

  it('truncates rather than rounds the hour, so time left is never overstated', () => {
    expect(remainingTime(ahead(119 * MINUTE), NOW)).toBe('1 hr 59 min left');
  });
});

describe('distanceLabel', () => {
  it('renders nothing when distance is unknown', () => {
    expect(distanceLabel(null)).toBe('');
    expect(distanceLabel(undefined)).toBe('');
  });

  it('coarsens as distance grows, since precision stops being useful', () => {
    expect(distanceLabel(0)).toBe('0 m');
    expect(distanceLabel(42)).toBe('40 m');
    expect(distanceLabel(99)).toBe('100 m');
    expect(distanceLabel(120)).toBe('100 m');
    expect(distanceLabel(175)).toBe('200 m');
    expect(distanceLabel(1500)).toBe('1.5 km');
    expect(distanceLabel(12_000)).toBe('12 km');
  });
});

describe('weekdayGroup', () => {
  const on = (iso: string) => new Date(iso);

  it('groups by calendar day, not by elapsed hours', () => {
    // 23:00 and 01:00 the next day are two hours apart but different days.
    expect(weekdayGroup('2026-09-07T23:00:00', on('2026-09-07T21:00:00'))).toBe('today');
    expect(weekdayGroup('2026-09-08T01:00:00', on('2026-09-07T23:00:00'))).toBe('tomorrow');
  });

  it('treats anything already past as today, so nothing renders as overdue', () => {
    expect(weekdayGroup('2026-09-05T10:00:00', on('2026-09-07T10:00:00'))).toBe('today');
  });

  it('falls through to the week bucket beyond tomorrow', () => {
    expect(weekdayGroup('2026-09-09T10:00:00', on('2026-09-07T10:00:00'))).toBe('week');
  });

  it('crosses a month boundary without arithmetic drift', () => {
    expect(weekdayGroup('2026-10-01T09:00:00', on('2026-09-30T21:00:00'))).toBe('tomorrow');
  });
});

describe('timeOfDay and weekdayName', () => {
  it('formats a local time and the weekday it falls on', () => {
    // Locale output varies by environment, so assert shape, not exact glyphs.
    expect(timeOfDay('2026-09-07T14:30:00')).toMatch(/2.30|14.30/);
    expect(weekdayName('2026-09-07T14:30:00')).toBe('Monday');
  });
});

describe('activitySummary', () => {
  it('prefers people present over people coming over something scheduled', () => {
    expect(activitySummary({ hereNow: 4, headingThere: 9, nextRunAt: ahead(HOUR) })).toEqual({
      label: '4 here now',
      tone: 'live',
    });
    expect(activitySummary({ hereNow: 0, headingThere: 2, nextRunAt: ahead(HOUR) })).toEqual({
      label: '2 heading over',
      tone: 'soon',
    });
  });

  it('falls back to the next run, then to silence', () => {
    expect(activitySummary({ hereNow: 0, headingThere: 0, nextRunAt: ahead(HOUR) })).toMatchObject({
      tone: 'info',
    });
    expect(activitySummary({ hereNow: 0, headingThere: 0, nextRunAt: null })).toEqual({
      label: 'Quiet',
      tone: 'quiet',
    });
  });
});

describe('tomorrowDate', () => {
  it('uses the local calendar and pads month and day', () => {
    expect(tomorrowDate(new Date(2026, 8, 26, 23, 30))).toBe('2026-09-27');
  });

  it('rolls over months and years', () => {
    expect(tomorrowDate(new Date(2026, 11, 31, 9, 0))).toBe('2027-01-01');
  });
});
