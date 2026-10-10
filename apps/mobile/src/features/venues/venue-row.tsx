import { StyleSheet, View } from 'react-native';

import { SportBadge } from '../../components/ui/brand';
import { ConditionChip, Stat } from '../../components/ui/activity';
import { AppText, PressableSurface, Tag } from '../../components/ui/primitives';
import {
  CONDITION_ICON,
  CONDITION_IS_BLOCKING,
  CONDITION_LABEL,
  PULSE_LABEL,
  PULSE_TONE,
  activitySummary,
  distanceLabel,
  relativeFuture,
  relativeTime,
} from '../../lib/format';
import { space, usePalette } from '../../theme';
import type { IconName } from '../../components/ui/primitives';
import type { NearbyVenue } from './api';

const SETTING_LABEL = { indoor: 'Indoor', outdoor: 'Outdoor', unknown: null } as const;

/**
 * One venue as a line on the scoreboard.
 *
 * The right-hand figure answers the question the list exists for — is anybody
 * there — and is the only place a count appears. Under the name: how far, what
 * kind of place, which sports. A live count is followed by how old it is,
 * because a count with no timestamp is a claim nobody can check.
 */
export function VenueRow({ venue, onPress }: { venue: NearbyVenue; onPress: () => void }) {
  const colors = usePalette();

  const summary = activitySummary({
    hereNow: venue.here_now,
    headingThere: venue.heading_there,
    nextRunAt: venue.next_run_at,
  });
  const blockingConditions = (venue.condition_kinds ?? []).filter(
    (kind) => CONDITION_IS_BLOCKING[kind],
  );
  const meta = [
    distanceLabel(venue.distance_m),
    SETTING_LABEL[venue.indoor_state],
    (venue.sport_names ?? []).slice(0, 3).join(', '),
  ].filter(Boolean);

  return (
    <PressableSurface
      onPress={onPress}
      accessibilityLabel={`${venue.name}. ${summary.label}. ${distanceLabel(venue.distance_m)} away.`}
      accessibilityHint="Opens venue details"
    >
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <SportBadge slug={venue.sport_slugs?.[0]} />
        <View style={styles.copy}>
          <AppText variant="heading" numberOfLines={2}>
            {venue.name}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {meta.join(' · ')}
          </AppText>
          {venue.pulse && <Tag label={PULSE_LABEL[venue.pulse]} tone={PULSE_TONE[venue.pulse]} />}
          {blockingConditions.map((kind) => (
            <ConditionChip
              key={kind}
              icon={CONDITION_ICON[kind] as IconName}
              label={CONDITION_LABEL[kind]}
              blocking
            />
          ))}
          {venue.here_now > 0 && (
            <AppText variant="micro" tone="faint">
              Updated {relativeTime(venue.last_activity_at).toLowerCase()}
            </AppText>
          )}
        </View>
        {venue.here_now > 0 ? (
          <Stat value={venue.here_now} label="Here now" tone="live" align="right" />
        ) : venue.heading_there > 0 ? (
          <Stat value={venue.heading_there} label="On the way" tone="soon" align="right" />
        ) : venue.next_run_at ? (
          <View style={styles.next}>
            <AppText variant="heading">{relativeFuture(venue.next_run_at)}</AppText>
            <AppText variant="label" tone="muted">
              Next game
            </AppText>
          </View>
        ) : null}
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.lg,
    borderBottomWidth: 1,
  },
  copy: { flex: 1, gap: space.xs },
  next: { alignItems: 'flex-end', gap: 2 },
});
