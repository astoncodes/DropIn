import type { Database } from '@dropin/database-types';

/**
 * Types and display helpers shared by the console shell and its review panels.
 *
 * Row types come from the generated database types rather than being restated —
 * a hand-written copy drifts silently the first time a migration adds a column.
 */

export type Candidate = Database['public']['Tables']['venue_candidates']['Row'];
export type Venue = Database['public']['Tables']['venues']['Row'];
export type Sport = Database['public']['Tables']['sports']['Row'];

export type Page = 'Overview' | 'Review queue' | 'Venues' | 'Regions & sports' | 'Audit history';

export const pages: Page[] = [
  'Overview',
  'Review queue',
  'Venues',
  'Regions & sports',
  'Audit history',
];

/** Turns an enum value such as `possible_duplicate` into readable text. */
export const label = (value: string) => value.replaceAll('_', ' ');

/** Reviewer-facing timestamp in the reviewer's own locale and zone. */
export const date = (value: string) => new Date(value).toLocaleString();
