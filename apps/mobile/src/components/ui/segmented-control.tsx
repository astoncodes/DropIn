import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { useReduceMotion } from '../../lib/accessibility';
import { elevation, motion, radius, space, typeScale, usePalette } from '../../theme';
import { PressableSurface } from './primitives';

export type Segment<T extends string> = { value: T; label: string };

const TRACK_PADDING = 3;

/**
 * Switches between views of the same content — Upcoming/Past, Details/Chat.
 * Not for filters (use Chip) or actions (use Button).
 *
 * A pill track with a white thumb that slides to the chosen segment. The slide
 * is short and eases out so the control answers the tap at once; under Reduce
 * Motion the thumb simply appears in place.
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
  const reduceMotion = useReduceMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const [offset] = useState(() => new Animated.Value(0));
  const index = Math.max(
    0,
    segments.findIndex((segment) => segment.value === value),
  );
  const segmentWidth = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / segments.length : 0;

  useEffect(() => {
    const to = index * segmentWidth;
    if (reduceMotion || segmentWidth === 0) {
      offset.setValue(to);
      return;
    }
    Animated.timing(offset, {
      toValue: to,
      duration: motion.base,
      useNativeDriver: true,
    }).start();
  }, [index, segmentWidth, offset, reduceMotion]);

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: colors.surfaceMuted }]}
    >
      {segmentWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            elevation.card,
            {
              width: segmentWidth,
              backgroundColor: colors.surface,
              transform: [{ translateX: offset }],
            },
          ]}
        />
      )}
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <PressableSurface
            key={segment.value}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityLabel={segment.label}
            selected={selected}
            style={styles.segment}
          >
            <View style={styles.segmentInner}>
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={[
                  typeScale.heading,
                  styles.label,
                  { color: selected ? colors.text : colors.textMuted },
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
    padding: TRACK_PADDING,
    borderRadius: radius.pill,
  },
  thumb: {
    position: 'absolute',
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    borderRadius: radius.pill,
  },
  segment: { flex: 1 },
  segmentInner: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  label: { fontSize: 18, lineHeight: 22 },
});
