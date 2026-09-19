import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CONDITION_ICON,
  CONDITION_IS_BLOCKING,
  CONDITION_LABEL,
  PULSE_LABEL,
  PULSE_TONE,
} from '../../src/lib/format';
import { sportColors } from '../../src/theme/tokens';

/**
 * These are the drift checks. The database owns these enums; the maps below are
 * the app's rendering of them. Adding a value in a migration without adding it
 * here ships a venue chip with `undefined` as its label, so failing here is the
 * point — regenerate types, then handle the new value.
 */
describe('database enum coverage', () => {
  // Read the members straight out of the generated types rather than restating
  // them here: a hardcoded list would only ever assert against itself.
  const typesPath = fileURLToPath(
    new URL('../../../../packages/database-types/src/database.types.ts', import.meta.url),
  );
  const generated = readFileSync(typesPath, 'utf8');

  function databaseEnum(name: string): string[] {
    const match = new RegExp(`\\n\\s+${name}:((?:[^\\n]*)(?:\\n\\s+\\|[^\\n]*)*)`).exec(generated);
    if (!match) throw new Error(`enum ${name} is absent from the generated types`);
    return [...match[1].matchAll(/"([^"]+)"/g)].map(([, value]) => value).sort();
  }

  it('labels and tones every venue_pulse the database can return', () => {
    const pulses = databaseEnum('venue_pulse');
    expect(pulses.length).toBeGreaterThan(0);
    expect(Object.keys(PULSE_LABEL).sort()).toEqual(pulses);
    expect(Object.keys(PULSE_TONE).sort()).toEqual(pulses);
  });

  it('labels, ices and classifies every venue_condition_kind', () => {
    const kinds = databaseEnum('venue_condition_kind');
    expect(kinds.length).toBeGreaterThan(0);
    for (const map of [CONDITION_LABEL, CONDITION_ICON, CONDITION_IS_BLOCKING]) {
      expect(Object.keys(map).sort()).toEqual(kinds);
    }
  });

  it('treats a condition as blocking only when it means "do not travel"', () => {
    // Lights being on and a busy court are information; the rest are reasons
    // not to set out at all.
    expect(CONDITION_IS_BLOCKING.lights_on).toBe(false);
    expect(CONDITION_IS_BLOCKING.crowded).toBe(false);
    expect(CONDITION_IS_BLOCKING.locked).toBe(true);
    expect(CONDITION_IS_BLOCKING.wet_surface).toBe(true);
  });

  it('gives every label non-empty text', () => {
    for (const value of [...Object.values(PULSE_LABEL), ...Object.values(CONDITION_LABEL)]) {
      expect(value.trim()).not.toBe('');
    }
  });
});

/**
 * Sports are a table, not an enum, so they never reach the generated types the
 * checks above read. The migrations are therefore the source of truth here, and
 * these tests parse them for the same reason: a hardcoded slug list in a test
 * would be a second source of truth for the taxonomy, which is exactly what the
 * repository rules forbid.
 *
 * Both maps must cover every seeded sport exactly. A missing entry renders a
 * grey trophy where a sport badge belongs; an extra entry is a colour nothing
 * can ever look up.
 */
describe('sport identity coverage', () => {
  const migrationsDir = fileURLToPath(new URL('../../../../supabase/migrations', import.meta.url));

  function seededSportSlugs(): string[] {
    const slugs = new Set<string>();
    for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'))) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      for (const [, values] of sql.matchAll(
        /insert into public\.sports\s*\([^)]*\)\s*values([\s\S]*?);/g,
      )) {
        for (const [, slug] of values.matchAll(/\(\s*'([a-z0-9-]+)'\s*,\s*'[^']*'\s*,/g)) {
          slugs.add(slug);
        }
      }
    }
    return [...slugs].sort();
  }

  /**
   * primitives.tsx imports the native icon set at load time, so it cannot be
   * imported into these Node tests. Its map is read as text instead, the same
   * way native-config.test.ts reads app.config.ts.
   */
  function declaredIconSlugs(): string[] {
    const source = readFileSync(
      fileURLToPath(new URL('../../src/components/ui/primitives.tsx', import.meta.url)),
      'utf8',
    );
    const map = /export const SPORT_ICONS[^{]*\{([\s\S]*?)\n\};/.exec(source);
    if (!map) throw new Error('primitives.tsx no longer declares SPORT_ICONS as an object literal');
    return [...map[1].matchAll(/^\s*'?([a-z0-9-]+)'?\s*:/gm)].map(([, slug]) => slug).sort();
  }

  it('reads the seeded sports out of the migrations', () => {
    // Guards the parse itself: a regex that silently matches nothing would make
    // every assertion below vacuously true.
    expect(seededSportSlugs()).toContain('basketball');
    expect(seededSportSlugs().length).toBeGreaterThanOrEqual(6);
  });

  it('gives every seeded sport a colour', () => {
    expect(Object.keys(sportColors).sort()).toEqual(seededSportSlugs());
  });

  it('gives every seeded sport an icon', () => {
    expect(declaredIconSlugs()).toEqual(seededSportSlugs());
  });
});
