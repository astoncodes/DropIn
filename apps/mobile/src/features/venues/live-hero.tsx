import { StyleSheet, View } from 'react-native';

import { LivePulse } from '../../components/ui/activity';
import { AppText, Button, PressableSurface } from '../../components/ui/primitives';
import { distanceLabel, relativeTime } from '../../lib/format';
import { elevation, radius, space, usePalette } from '../../theme';
import type { NearbyVenue } from './api';

/**
 * The busiest venue right now, as the one object the Live list leads with:
 * its count in green at hero size on ink, and the way to join it. It renders
 * only when somebody is actually there, so the screen's heaviest element is
 * also its only promise of a game.
 */
export function LiveHero({
  venue,
  onOpen,
  onCheckIn,
}: {
  venue: NearbyVenue;
  onOpen: () => void;
  onCheckIn: () => void;
}) {
  const colors = usePalette();
  const meta = [distanceLabel(venue.distance_m), (venue.sport_names ?? []).slice(0, 2).join(', ')]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.card, elevation.floating, { backgroundColor: colors.surfaceInverse }]}>
      <PressableSurface
        onPress={onOpen}
        accessibilityLabel={`${venue.name}, ${venue.here_now} here now. Opens venue details`}
      >
        <View style={styles.top}>
          <View style={styles.figure}>
            <AppText variant="hero" style={{ color: colors.live }} numberOfLines={1}>
              {venue.here_now}
            </AppText>
            <View style={styles.liveLabel}>
              <LivePulse />
              <AppText variant="label" style={{ color: colors.live }}>
                Here now
              </AppText>
            </View>
          </View>
          <View style={styles.copy}>
            <AppText variant="heading" tone="inverse" numberOfLines={2}>
              {venue.name}
            </AppText>
            <AppText variant="caption" tone="inverseMuted" numberOfLines={1}>
              {meta}
            </AppText>
            <AppText variant="micro" tone="inverseMuted">
              Updated {relativeTime(venue.last_activity_at).toLowerCase()}
            </AppText>
          </View>
        </View>
      </PressableSurface>
      <View style={styles.actions}>
        <Button
          label="Check in here"
          icon="map-marker-check"
          tone="live"
          size="sm"
          onPress={onCheckIn}
        />
        <Button label="Open" size="sm" variant="outline" inverse onPress={onOpen} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.xl,
    marginBottom: space.md,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  figure: { alignItems: 'flex-start', gap: space.xs },
  liveLabel: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  copy: { flex: 1, gap: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
