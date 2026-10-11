import { StyleSheet, Text, View } from 'react-native';

import { space, typeScale, usePalette } from '../../theme';
import { PressableSurface } from './primitives';

export type Segment<T extends string> = { value: T; label: string };

/**
 * Switches between views of the same content — Upcoming/Past, Details/Chat.
 * Not for filters (use Chip) or actions (use Button).
 *
 * Drawn as text tabs on a rule, with the selected one underlined in ink. A
 * boxed, pill-shaped control would read as a setting; this reads as sections
 * of one page, which is what it switches between.
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
      style={[styles.track, { borderBottomColor: colors.border }]}
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
          >
            <View
              style={[
                styles.segment,
                { borderBottomColor: selected ? colors.text : 'transparent' },
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={[
                  typeScale.heading,
                  styles.label,
                  { color: selected ? colors.text : colors.textFaint },
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
  track: { flexDirection: 'row', gap: space.xl, borderBottomWidth: 1 },
  segment: {
    minHeight: 44,
    justifyContent: 'center',
    // Sits on the track's rule, so the selected tab's underline replaces it.
    marginBottom: -1,
    borderBottomWidth: 2,
  },
  label: { fontSize: 20, lineHeight: 24 },
});
