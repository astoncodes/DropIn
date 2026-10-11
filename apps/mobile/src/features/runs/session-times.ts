/**
 * Calendar and clock arithmetic for the session form.
 *
 * A session is stored as a calendar date and two wall-clock times in the
 * session's own time zone, and the database interprets them there. So the days
 * and times the form offers are worked out in that zone — "today" for a
 * session in Halifax is Halifax's today, whatever the phone thinks — and plain
 * `HH:MM` strings are added and compared without ever becoming instants, which
 * keeps daylight-saving changes from moving them.
 */

export type SessionDay = {
  /** `YYYY-MM-DD`, as the database takes it. */
  date: string;
  /** Short weekday name for the day tile. */
  weekday: string;
  dayOfMonth: string;
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LAST_MINUTE = 23 * 60 + 59;

const pad = (value: number) => String(value).padStart(2, '0');

/** The wall-clock date and time of `instant` in `timezone`. */
function wallClock(instant: Date, timezone: string) {
  const formatter = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatter(timezone).formatToParts(instant);
  } catch {
    // The zone is typed by a person in one place, so it can be one this device
    // does not know. UTC keeps the form usable; the database has the final say.
    parts = formatter('UTC').formatToParts(instant);
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    minutes: part('hour') * 60 + part('minute'),
  };
}

function minutesOf(time: string): number | null {
  const match = TIME.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const timeOf = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** `count` consecutive days starting from today in the session's time zone. */
export function upcomingDays(now: Date, timezone: string, count: number): SessionDay[] {
  const today = wallClock(now, timezone);
  return Array.from({ length: count }, (_, offset) => {
    // A calendar date has the same weekday everywhere, so it is stepped and
    // named in UTC, where no day is ever 23 or 25 hours long.
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    return {
      date: `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`,
      weekday: day.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
      dayOfMonth: String(day.getUTCDate()),
    };
  });
}

/** The time of day right now in the session's time zone, as `HH:MM`. */
export function currentTime(now: Date, timezone: string): string {
  return timeOf(wallClock(now, timezone).minutes);
}

/** Start times offered, every half hour from early morning to late evening. */
export function timeSlots(): string[] {
  const slots: string[] = [];
  for (let minutes = 6 * 60; minutes <= 23 * 60 + 30; minutes += 30) slots.push(timeOf(minutes));
  return slots;
}

/**
 * The wall-clock time `minutes` after `start`, or null when that is not a time
 * on the same day. A session has one date, so it cannot run past midnight.
 */
export function addMinutes(start: string, minutes: number): string | null {
  const from = minutesOf(start);
  if (from === null) return null;
  const end = from + minutes;
  return end > LAST_MINUTE ? null : timeOf(end);
}

/** Minutes from `start` to `end` on one day; zero or less when `end` is not later. */
export function minutesBetween(start: string, end: string): number {
  const from = minutesOf(start);
  const to = minutesOf(end);
  return from === null || to === null ? Number.NaN : to - from;
}

/** How a slot is shown, in the device's own 12- or 24-hour convention. */
export function timeLabel(time: string): string {
  const minutes = minutesOf(time);
  if (minutes === null) return time;
  return new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toLocaleTimeString(
    undefined,
    { hour: 'numeric', minute: '2-digit' },
  );
}

const EVENING = '19:00';
/** After this, tonight is too close to plan a session for. */
const PLAN_TONIGHT_UNTIL = 18 * 60;

/** The day and time the form opens on: this evening, or tomorrow's if that is too soon. */
export function defaultSessionStart(now: Date, timezone: string): { date: string; start: string } {
  const [today, tomorrow] = upcomingDays(now, timezone, 2);
  const tonight = wallClock(now, timezone).minutes < PLAN_TONIGHT_UNTIL;
  return { date: (tonight ? today : tomorrow)!.date, start: EVENING };
}
