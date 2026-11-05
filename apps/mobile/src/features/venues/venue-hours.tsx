import { StyleSheet, View } from 'react-native';

import { Notice } from '../../components/ui/notice';
import { AppText } from '../../components/ui/primitives';
import { closedReportLabel, relativeTime, reportedHoursLabel } from '../../lib/format';
import { loadPhase } from '../../lib/load-phase';
import { space } from '../../theme';
import { useVenueReportedHours } from './api';

const players = (count: number) => `${count} ${count === 1 ? 'player' : 'players'}`;

/**
 * "Can I get in?" — answered only by players. Hours come from when players were
 * actually there in the last eight weeks, and closed reports from players who
 * found the place shut. The database decides when there is enough evidence to
 * show anything; this only says what it returned.
 */
export function VenueHours({ venueId }: { venueId: string }) {
  const hours = useVenueReportedHours(venueId);
  const phase = loadPhase(hours);
  const data = hours.data;

  return (
    <View style={styles.section}>
      <AppText variant="label" tone="muted">
        Hours
      </AppText>
      {phase === 'loading' && <AppText tone="muted">Loading reported hours…</AppText>}
      {phase === 'failed' && (
        <AppText tone="muted">Reported hours are unavailable right now.</AppText>
      )}
      {phase === 'ready' && (
        <>
          {data?.closed_now && data.last_closed_at && (
            <Notice
              tone="error"
              message={`Reported closed ${relativeTime(data.last_closed_at).toLowerCase()} · ${players(data.last_closed_player_count ?? 1)}`}
            />
          )}
          {data?.open_from_hour != null && data.open_until_hour != null ? (
            <View>
              <AppText variant="bodyStrong">
                Players found it open{' '}
                {reportedHoursLabel(data.open_from_hour, data.open_until_hour)}
              </AppText>
              <AppText variant="caption" tone="muted">
                {players(data.open_player_count ?? 0)} · last 8 weeks
              </AppText>
            </View>
          ) : (
            <AppText tone="muted">No hours reported yet</AppText>
          )}
          {data?.last_closed_at && !data.closed_now && (
            <AppText variant="caption" tone="muted">
              {closedReportLabel(data.last_closed_at, data.last_closed_player_count ?? 1)}
            </AppText>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.xs },
});
