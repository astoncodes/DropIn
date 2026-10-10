import type { Database } from '@dropin/database-types';

type VenuePulse = Database['public']['Enums']['venue_pulse'];
type ConditionKind = Database['public']['Enums']['venue_condition_kind'];

/**
 * Human phrasing for freshness and state.
 *
 * Every live signal in this app has to say how old it is. A count with no
 * timestamp is a claim the user cannot check, and the moment one of those
 * turns out to be wrong they stop believing all of them.
 */

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'No recent activity';

  const deltaMs = now - new Date(iso).getTime();
  const minutes = Math.round(deltaMs / 60_000);

  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours === 1) return '1 hr ago';
  if (hours < 24) return `${hours} hrs ago`;

  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

/** "in 25 min" / "in 2 hrs". Used for arrival ETAs and upcoming runs. */
export function relativeFuture(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';

  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hr${hours === 1 ? '' : 's'}`;

  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/** Remaining time on a check-in, phrased for a countdown. */
export function remainingTime(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000));
  if (minutes === 0) return 'Expiring now';
  if (minutes < 60) return `${minutes} min left`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr left` : `${hours} hr ${rest} min left`;
}

export function distanceLabel(metres: number | null | undefined): string {
  if (metres == null) return '';
  if (metres < 100) return `${Math.round(metres / 10) * 10} m`;
  if (metres < 1000) return `${Math.round(metres / 50) * 50} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

export const PULSE_LABEL: Record<VenuePulse, string> = {
  need_players: 'Need players',
  game_on: 'Game on',
  full_next_game: 'Full · next game',
  wrapping_up: 'Wrapping up',
};

export const PULSE_TONE: Record<VenuePulse, 'live' | 'soon' | 'neutral'> = {
  need_players: 'soon',
  game_on: 'live',
  full_next_game: 'neutral',
  wrapping_up: 'neutral',
};

export const CONDITION_LABEL: Record<ConditionKind, string> = {
  lights_on: 'Lights on',
  lights_off: 'Lights off',
  wet_surface: 'Wet surface',
  locked: 'Locked',
  crowded: 'Crowded',
  equipment_issue: 'Equipment issue',
};

export const CONDITION_ICON: Record<ConditionKind, string> = {
  lights_on: 'lightbulb-on',
  lights_off: 'lightbulb-off',
  wet_surface: 'water',
  locked: 'lock',
  crowded: 'account-group',
  equipment_issue: 'wrench',
};

/** Conditions that mean "do not travel here right now". */
export const CONDITION_IS_BLOCKING: Record<ConditionKind, boolean> = {
  lights_on: false,
  lights_off: true,
  wet_surface: true,
  locked: true,
  crowded: false,
  equipment_issue: true,
};

/**
 * The one-line summary of what is happening at a venue.
 *
 * Ordered by what a player actually wants to know: people here beats people
 * coming, which beats something scheduled, which beats silence.
 */
export function activitySummary(input: {
  hereNow: number;
  headingThere: number;
  nextRunAt: string | null;
}): { label: string; tone: 'live' | 'soon' | 'info' | 'quiet' } {
  if (input.hereNow > 0) {
    return { label: `${input.hereNow} here now`, tone: 'live' };
  }
  if (input.headingThere > 0) {
    return {
      label: `${input.headingThere} heading over`,
      tone: 'soon',
    };
  }
  if (input.nextRunAt) {
    return { label: `Run ${relativeFuture(input.nextRunAt)}`, tone: 'info' };
  }
  return { label: 'Quiet', tone: 'quiet' };
}

/** Whole calendar days from `now` to `iso` on the device's calendar: 0 is today. */
function calendarDaysAhead(iso: string, now: Date): number {
  const date = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
}

/** The day a session is on, as a player would say it: "Today", "Tomorrow", "Sat 12 Oct". */
export function dayLabel(iso: string, now = new Date()): string {
  const dayDiff = calendarDaysAhead(iso, now);

  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
