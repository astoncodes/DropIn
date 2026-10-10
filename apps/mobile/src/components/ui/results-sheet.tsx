import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useReduceMotion } from '../../lib/accessibility';
import { elevation, radius, space, usePalette } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LivePulse } from './activity';
import { AppText, IconButton } from './primitives';

/**
 * The results panel over the map. Two snap points: peek and expanded.
 *
 * Dragged with a spring rather than a duration, so an interrupted gesture keeps
 * its velocity instead of restarting from zero. Under Reduce Motion the snap is
 * instant — the position still changes, it just does not travel.
 *
 * On wide viewports the sheet becomes a fixed side panel: dragging a panel that
 * occupies a third of a desktop screen is a phone gesture applied where it does
 * not belong.
 */
export function ResultsSheet({
  children,
  title,
  live = false,
}: {
  children: ReactNode;
  title: string;
  /** Marks the title with the live pulse: the list below has players in it now. */
  live?: boolean;
}) {
  const colors = usePalette();
  const reduceMotion = useReduceMotion();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 900;
  const insets = useSafeAreaInsets();
  const availableHeight = windowHeight - 64 - insets.bottom;

  // Preserve more of the map on phones while keeping one venue card visible;
  // the higher expanded stop leaves room for the floating map header.
  const peekOffset = Math.round(availableHeight * 0.6);
  const expandedOffset = Math.min(insets.top + 160, Math.round(availableHeight * 0.4));

  const [translateY] = useState(() => new Animated.Value(peekOffset));
  const [expanded, setExpanded] = useState(false);

  const snapTo = (offset: number) => {
    setExpanded(offset === expandedOffset);
    if (reduceMotion) {
      translateY.setValue(offset);
      return;
    }
    Animated.spring(translateY, {
      toValue: offset,
      useNativeDriver: true,
      damping: 22,
      stiffness: 240,
      mass: 0.9,
    }).start();
  };

  useEffect(() => {
    if (isWide) return;
    // Reposition on rotation/resize without touching state: the sheet is
    // already in the right logical mode, only the pixel offset moved.
    translateY.setValue(expanded ? expandedOffset : peekOffset);
  }, [peekOffset, expandedOffset, isWide, expanded, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, move) => Math.abs(move.dy) > 6,

        // Gesture accumulation lives inside Animated rather than in a React
        // ref. extractOffset() folds the current position into an offset so
        // each move is a plain delta — no mutable value is read during render,
        // and no per-frame state update triggers a re-render.
        onPanResponderGrant: () => translateY.extractOffset(),

        onPanResponderMove: (_event, move) => translateY.setValue(move.dy),

        onPanResponderRelease: (_event, move) => {
          translateY.flattenOffset();

          // stopAnimation hands back the settled value, which is the only
          // read needed and it happens in an event, never during render.
          translateY.stopAnimation((current: number) => {
            const midpoint = (peekOffset + expandedOffset) / 2;

            // A decisive flick wins over distance: a short fast swipe should
            // not have to cross the halfway mark to count.
            if (move.vy < -0.5) return snapTo(expandedOffset);
            if (move.vy > 0.5) return snapTo(peekOffset);
            snapTo(current < midpoint ? expandedOffset : peekOffset);
          });
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [peekOffset, expandedOffset, reduceMotion, translateY],
  );

  const header = (
    <View style={styles.header}>
      {live && <LivePulse />}
      <View accessibilityRole="header" style={{ flex: 1 }}>
        <AppText variant="heading">{title}</AppText>
      </View>
      {!isWide && (
        <IconButton
          icon={expanded ? 'chevron-down' : 'chevron-up'}
          label={expanded ? 'Collapse venue list' : 'Expand venue list'}
          onPress={() => snapTo(expanded ? peekOffset : expandedOffset)}
        />
      )}
    </View>
  );

  if (isWide) {
    return (
      <View
        style={[
          styles.panel,
          { backgroundColor: colors.surface, borderColor: colors.border },
          elevation.floating,
        ]}
      >
        {header}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: availableHeight - (expanded ? expandedOffset : peekOffset),
          backgroundColor: colors.surface,
          borderColor: colors.border,
          transform: [{ translateY }],
        },
        elevation.floating,
      ]}
    >
      {/* No web `cursor: grab`: React Native's CursorValue only admits auto
          and pointer, and casting around the type to style a hint that the
          grabber already conveys is not worth it. */}
      <View {...panResponder.panHandlers} style={styles.grabArea}>
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={expanded ? 'Collapse venue list' : 'Expand venue list'}
          accessibilityHint="Drag up or down to resize the list"
          style={[styles.grabber, { backgroundColor: colors.borderStrong }]}
        />
        {header}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  panel: {
    position: 'absolute',
    top: space.lg,
    right: space.lg,
    bottom: space.lg,
    width: 400,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  grabArea: {
    paddingTop: space.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    marginBottom: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingLeft: space.lg,
    paddingRight: space.sm,
  },
});
