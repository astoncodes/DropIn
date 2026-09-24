import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import {
  CHECK_IN_DURATION,
  CHECK_IN_NOTE_MAX_LENGTH,
  DUPLICATE_DISTANCE_METRES,
  PARTY_SIZE,
  RUN_SERIES,
} from '@dropin/shared';
import { describe, expect, it } from 'vitest';

/**
 * `packages/shared` mirrors database constraints so a form can set `maxLength`
 * before the server rejects the input. It does not own those rules — the
 * migrations do (CLAUDE.md §Where the rules live).
 *
 * A mirror nobody checks stops being a mirror. These read the constraints out
 * of the migrations themselves, so changing `check_ins_party_size_range` to 30
 * without updating PARTY_SIZE fails here rather than in a user's face, as a
 * form that accepts a value the database then refuses.
 *
 * When one of these fails, the database is right and the constant is the bug.
 */

// Read every migration and search the lot, rather than naming files. The
// migration set gets restructured — it was consolidated into a baseline once
// already — and a test that hardcodes filenames fails for the wrong reason when
// that happens, which teaches people to delete the test.
const migrationsDir = fileURLToPath(new URL('../../../../supabase/migrations', import.meta.url));
const schema = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(`${migrationsDir}/${name}`, 'utf8'))
  .join('\n');

/** Collapse whitespace so a reformatted constraint still matches. */
const flat = (sql: string) => sql.replace(/\s+/g, ' ');

describe('check-in limits mirror the database', () => {
  it('caps party size where check_ins_party_size_range does', () => {
    const match = /party_size between (\d+) and (\d+)/.exec(flat(schema));
    expect(match, 'check_ins_party_size_range not found in any migration').not.toBeNull();

    const [, min, max] = match!;
    expect(PARTY_SIZE.min).toBe(Number(min));
    expect(PARTY_SIZE.max).toBe(Number(max));
  });

  it('keeps the default party size inside the permitted range', () => {
    expect(PARTY_SIZE.default).toBeGreaterThanOrEqual(PARTY_SIZE.min);
    expect(PARTY_SIZE.default).toBeLessThanOrEqual(PARTY_SIZE.max);
  });

  it('caps the note where check_ins_note_length does', () => {
    const match =
      /check_ins_note_length check \(note is null or char_length\(note\) <= (\d+)\)/.exec(
        flat(schema),
      );
    expect(match, 'check_ins_note_length not found in any migration').not.toBeNull();
    expect(CHECK_IN_NOTE_MAX_LENGTH).toBe(Number(match![1]));
  });

  it('caps the active window where check_ins_max_window does', () => {
    const match =
      /check_ins_max_window check \(expires_at <= started_at \+ interval '(\d+) hours'\)/.exec(
        flat(schema),
      );
    expect(match, 'check_ins_max_window not found in any migration').not.toBeNull();
    expect(CHECK_IN_DURATION.maxMinutes).toBe(Number(match![1]) * 60);
  });

  it('keeps the default and minimum duration inside that window', () => {
    expect(CHECK_IN_DURATION.minMinutes).toBeLessThanOrEqual(CHECK_IN_DURATION.defaultMinutes);
    expect(CHECK_IN_DURATION.defaultMinutes).toBeLessThanOrEqual(CHECK_IN_DURATION.maxMinutes);
  });
});

describe('run limits mirror the database', () => {
  it('expires a series where run_series_max_12_weeks does', () => {
    const match = /valid_until <= starts_on \+ interval '(\d+) weeks'/.exec(flat(schema));
    expect(match, 'run_series_max_12_weeks not found in any migration').not.toBeNull();
    expect(RUN_SERIES.maxWeeksValid).toBe(Number(match![1]));
  });

  it('keeps the upcoming window shorter than a series lifetime', () => {
    expect(RUN_SERIES.upcomingWindowDays).toBeLessThan(RUN_SERIES.maxWeeksValid * 7);
  });

  it('caps upcoming_runs at the personal schedule window', () => {
    // upcoming_runs is redefined across migrations; the last definition is live.
    const caps = [
      ...flat(schema).matchAll(
        /least\(make_interval\(days => greatest\(p_days, 1\)\), interval '(\d+) weeks'\)/g,
      ),
    ];
    expect(caps, 'upcoming_runs p_days cap not found in any migration').not.toHaveLength(0);
    expect(RUN_SERIES.personalScheduleWindowDays).toBe(Number(caps.at(-1)![1]) * 7);
  });
});

describe('duplicate distances mirror the database', () => {
  it('matches the radius find_duplicate_candidates actually defaults to', () => {
    // Scoped to this function on purpose: nearby_venues declares p_radius_m too,
    // defaulting to 8 km, and matching that one would silently assert nothing.
    const signature =
      /create or replace function public\.find_duplicate_candidates\(([^)]*)\)/.exec(schema);
    expect(signature, 'find_duplicate_candidates not found in any migration').not.toBeNull();

    const match = /p_radius_m\s+double precision default (\d+)/.exec(signature![1]);
    expect(match, 'find_duplicate_candidates has no p_radius_m default').not.toBeNull();
    expect(DUPLICATE_DISTANCE_METRES.candidateSearch).toBe(Number(match![1]));
  });

  it('orders the three distances by the job each one does', () => {
    // Prevention is shown before submitting and casts the widest net; the
    // high-confidence review band is the tightest. Distance never decides a
    // merge on its own — see find_duplicate_candidates() and merge_venues().
    expect(DUPLICATE_DISTANCE_METRES.submissionPrevention).toBeGreaterThan(
      DUPLICATE_DISTANCE_METRES.candidateSearch,
    );
    expect(DUPLICATE_DISTANCE_METRES.candidateSearch).toBeGreaterThan(
      DUPLICATE_DISTANCE_METRES.highConfidenceReview,
    );
  });
});

describe('the mobile submission form uses the shared mirror', () => {
  it('does not restate the prevention radius as a literal', () => {
    const form = readFileSync(
      fileURLToPath(
        new URL('../../src/features/submissions/venue-submission-form.tsx', import.meta.url),
      ),
      'utf8',
    );

    expect(form).toContain('DUPLICATE_DISTANCE_METRES');
    expect(form).not.toMatch(
      new RegExp(`\\b${DUPLICATE_DISTANCE_METRES.submissionPrevention}\\b(?!\\s*\\})`),
    );
  });
});
