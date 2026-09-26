import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';

import { elevation, radius, space, typeScale, usePalette } from '../../theme';
import { PressableSurface } from './primitives';
import type { IconName } from './primitives';

export type Segment<T extends string> = { value: T; label: string; icon?: IconName };

/**
 * Switches between views of the same content — Upcoming/Past, Details/Chat.
 * Not for filters (use Chip) or actions (use Button).
 *
 * The selected segment is a raised white surface rather than a coloured fill,
 * so the control reads as navigation and the app's green stays reserved for
 * actions and live activity.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
}: {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const colors = usePalette();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.surfaceMuted }]}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <PressableSurface
            key={segment.value}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityLabel={segment.label}
            selected={selected}
            // The track's padding would otherwise leave each segment 40pt tall.
            hitSlop={{ top: 3, bottom: 3 }}
            style={styles.segmentWrap}
          >
            <View
              style={[
                styles.segment,
                selected && [styles.selected, { backgroundColor: colors.surface }],
              ]}
            >
              {segment.icon && (
                <MaterialCommunityIcons
                  name={segment.icon}
                  size={16}
                  color={selected ? colors.text : colors.textMuted}
                />
              )}
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={[
                  typeScale.caption,
                  { color: selected ? colors.text : colors.textMuted, fontWeight: '700' },
                ]}
              >
                {segment.label}
              </Text>
            </View>
          </PressableSurface>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.md,
    gap: 3,
  },
  segmentWrap: { flex: 1 },
  segment: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.md - 3,
  },
  selected: { ...elevation.card, shadowOpacity: 0.08 },
});
