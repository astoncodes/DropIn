import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';

import { SportBadge } from '../../components/ui/brand';
import { AppText, Button, PressableSurface, Tag } from '../../components/ui/primitives';
import { dayLabel, timeOfDay } from '../../lib/format';
import { space, usePalette } from '../../theme';
import type { UpcomingRun } from '../venues/api';
import type { useRunAttendance } from './api';

type Attendance = NonNullable<ReturnType<typeof useRunAttendance>['data']>[number];

/**
 * One dated session as a line in a schedule: when, what, where, and how many
 * are going. The same row is used wherever sessions are listed, so the same
 * session never looks like two different things.
 *
 * It carries at most one control. A session the player has not answered offers
 * Join; one they have answered shows their answer as a tag and opens when
 * tapped, and the choice between Going and Maybe is made on the session's own
 * screen rather than repeated as two buttons on every row.
 */
export function SessionRow({
  item,
  response,
  hosting = false,
  pending = false,
  attendanceUnavailable = false,
  showDescription = false,
  onRespond,
  onOpen,
}: {
  item: UpcomingRun;
  response?: Attendance;
  hosting?: boolean;
  pending?: boolean;
  attendanceUnavailable?: boolean;
  showDescription?: boolean;
  onRespond: (response: 'going' | 'maybe') => void;
  /** Present once the dated session exists; the row then opens it. */
  onOpen?: () => void;
}) {
  const colors = usePalette();
  const title = item.title ?? `${item.sport_name} session`;
  const when = `${dayLabel(item.starts_at)} · ${timeOfDay(item.starts_at)} – ${timeOfDay(item.ends_at)}`;
  const going = attendanceUnavailable ? null : `${response?.going_count ?? 0} going`;
  const mine = hosting || Boolean(response?.my_response);

  const summary = (
    <View style={styles.summary}>
      <SportBadge slug={item.sport_slug} />
      <View style={styles.copy}>
        <AppText variant="label">{when}</AppText>
        <AppText variant="heading" numberOfLines={2}>
          {title}
        </AppText>
        <View style={styles.meta}>
          <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.venue}>
            {item.venue_name}
          </AppText>
          {going && (
            <AppText variant="caption" tone="muted">
              {' · '}
              {going}
            </AppText>
          )}
        </View>
        {showDescription && item.description && (
          <AppText variant="caption" tone="muted" numberOfLines={2}>
            {item.description}
          </AppText>
        )}
        {(mine || item.is_rescheduled) && (
          <View style={styles.tags}>
            {hosting && <Tag label="Hosting" />}
            {response?.my_response === 'going' && <Tag label="Going" tone="live" />}
            {response?.my_response === 'maybe' && <Tag label="Maybe" tone="soon" />}
            {item.is_rescheduled && <Tag label="Rescheduled" tone="soon" />}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      {onOpen ? (
        <PressableSurface onPress={onOpen} accessibilityLabel={`Open ${title}`} style={styles.fill}>
          {summary}
        </PressableSurface>
      ) : (
        <View style={styles.fill}>{summary}</View>
      )}
      {!mine ? (
        <Button
          label="Join"
          size="sm"
          accessibilityHint={`Join ${title}`}
          onPress={() => onRespond('going')}
          loading={pending}
        />
      ) : onOpen ? (
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textFaint} />
      ) : (
        <Button
          label="Open"
          size="sm"
          variant="outline"
          accessibilityHint={`Open ${title}`}
          onPress={() => onRespond(response?.my_response === 'maybe' ? 'maybe' : 'going')}
          loading={pending}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.lg,
    borderBottomWidth: 1,
  },
  fill: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  copy: { flex: 1, gap: space.xs },
  meta: { flexDirection: 'row' },
  venue: { flexShrink: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 2 },
});
