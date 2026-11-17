import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, PressableSurface, Tag, sportIcon } from '../../components/ui/primitives';
import { dayLabel, timeOfDay } from '../../lib/format';
import { elevation, radius, space, usePalette } from '../../theme';
import type { UpcomingRun } from '../venues/api';
import type { useRunAttendance } from './api';

type Attendance = NonNullable<ReturnType<typeof useRunAttendance>['data']>[number];

/**
 * One dated session as a card in a schedule: the day as a calendar tile, then
 * what, where, and how many are going. The same card is used wherever
 * sessions are listed, so the same session never looks like two different
 * things. A session today gets an ink tile, so tonight's games stand out of
 * the week.
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
  const day = dayLabel(item.starts_at);
  const today = day === 'Today';
  const when = `${day} · ${timeOfDay(item.starts_at)} – ${timeOfDay(item.ends_at)}`;
  const going = attendanceUnavailable ? null : `${response?.going_count ?? 0} going`;
  const mine = hosting || Boolean(response?.my_response);

  const summary = (
    <View style={styles.summary}>
      <DateTile iso={item.starts_at} today={today} />
      <View style={styles.copy}>
        <AppText variant="label" tone={today ? 'default' : 'muted'}>
          {when}
        </AppText>
        <AppText variant="heading" numberOfLines={2}>
          {title}
        </AppText>
        <View style={styles.meta}>
          <MaterialCommunityIcons
            name={sportIcon(item.sport_slug)}
            size={15}
            color={colors.textMuted}
          />
          <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.venue}>
            {item.venue_name}
          </AppText>
          {going && (
            <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.going}>
              {` · ${going}`}
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
    <View
      style={[
        styles.row,
        elevation.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
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

/** The day as a calendar tile: weekday over the day of the month. */
function DateTile({ iso, today }: { iso: string; today: boolean }) {
  const colors = usePalette();
  const date = new Date(iso);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.tile,
        { backgroundColor: today ? colors.surfaceInverse : colors.surfaceMuted },
      ]}
    >
      <AppText variant="label" tone={today ? 'inverseMuted' : 'muted'}>
        {date.toLocaleDateString(undefined, { weekday: 'short' })}
      </AppText>
      <AppText
        variant="score"
        style={[styles.tileDay, { color: today ? colors.textInverse : colors.text }]}
      >
        {date.getDate()}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
    marginBottom: space.sm,
  },
  fill: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  tile: {
    width: 56,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  tileDay: { fontSize: 30, lineHeight: 32 },
  copy: { flex: 1, gap: space.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  venue: { flexShrink: 1 },
  going: { flexShrink: 0 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 2 },
});
