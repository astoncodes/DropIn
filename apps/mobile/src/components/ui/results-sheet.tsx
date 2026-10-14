import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useReduceMotion } from '../../lib/accessibility';
import { elevation, radius, space, usePalette } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LivePulse } from './activity';
import { AppText } from './primitives';

/**
 * The results panel over the map. Three snap points: compact, peek and expanded.
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
  expandable = true,
  headerAction,
}: {
  children: ReactNode;
  title: string;
  /** Marks the title with the live pulse: the list below has players in it now. */
  live?: boolean;
  /** Whether the sheet has content that can be expanded above its default height. */
  expandable?: boolean;
  /** A primary list action shown beside the result count. */
  headerAction?: ReactNode;
}) {
  const colors = usePalette();
  const reduceMotion = useReduceMotion();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 900;
  const insets = useSafeAreaInsets();
  const availableHeight = windowHeight - 64 - insets.bottom;

  const expandedOffset = Math.min(insets.top + 160, Math.round(availableHeight * 0.4));
  // Peek exposes the empty-state actions or first result. Compact leaves only
  // the handle and heading so the map can still be viewed almost unobstructed.
  const compactOffset = Math.max(expandedOffset + 112, availableHeight - 112);
  const peekOffset = Math.min(
    compactOffset - 72,
    Math.max(expandedOffset + 72, availableHeight - 260),
  );

  const [translateY] = useState(() => new Animated.Value(peekOffset));
  const [snap, setSnap] = useState<'compact' | 'peek' | 'expanded'>('peek');
  // New map results must not move the sheet beneath the user's hand. If an
  // expanded list becomes empty, keep its position until the next gesture.
  const minimumOffset = expandable || snap === 'expanded' ? expandedOffset : peekOffset;
  const displayedTranslateY = useMemo(
    () =>
      translateY.interpolate({
        inputRange: [minimumOffset, compactOffset],
        outputRange: [minimumOffset, compactOffset],
        extrapolate: 'clamp',
      }),
    [translateY, minimumOffset, compactOffset],
  );

  const snapTo = (next: 'compact' | 'peek' | 'expanded') => {
    const offset =
      next === 'expanded' ? expandedOffset : next === 'compact' ? compactOffset : peekOffset;
    setSnap(next);
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
      overshootClamping: true,
    }).start();
  };

  const reposition = useEffectEvent(() => {
    if (isWide) return;
    // Only reset for geometry changes. Updating the snap state during
    // a release must not cancel the spring animation with setValue().
    translateY.setValue(
      snap === 'expanded'
        ? expandedOffset
        : snap === 'compact'
          ? compactOffset
          : peekOffset,
    );
  });

  useEffect(() => {
    reposition();
  }, [peekOffset, compactOffset, expandedOffset, isWide]);

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
            // A decisive flick wins over distance: a short fast swipe should
            // not have to cross a midpoint to reach the next stop.
            if (move.vy < -0.5) {
              return snapTo(snap === 'compact' || !expandable ? 'peek' : 'expanded');
            }
            if (move.vy > 0.5) return snapTo(snap === 'expanded' ? 'peek' : 'compact');

            const snapPoints: readonly (readonly [
              'compact' | 'peek' | 'expanded',
              number,
            ])[] = expandable
              ? [
                  ['expanded', expandedOffset],
                  ['peek', peekOffset],
                  ['compact', compactOffset],
                ]
              : [
                  ['peek', peekOffset],
                  ['compact', compactOffset],
                ];
            const nearest = snapPoints.reduce((best, candidate) =>
              Math.abs(candidate[1] - current) < Math.abs(best[1] - current) ? candidate : best,
            );
            snapTo(nearest[0]);
          });
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [peekOffset, compactOffset, expandedOffset, expandable, reduceMotion, snap, translateY],
  );

  const header = (
    <View style={styles.header}>
      {live && <LivePulse />}
      <View accessibilityRole="header" style={{ flex: 1 }}>
        <AppText variant="heading">{title}</AppText>
      </View>
      {headerAction}
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
          // Keep one fully formed sheet and move it between stops. Changing
          // height at the start of the animation made the background expand
          // as a rectangle before the sheet itself finished sliding.
          height: availableHeight - expandedOffset,
          // Do not visually overshoot an unavailable position while dragging.
          // Empty results can move down, but pulling upward leaves the sheet
          // exactly at its normal resting height.
          transform: [{ translateY: displayedTranslateY }],
        },
        elevation.floating,
      ]}
    >
      <View
        style={[
          styles.sheetSurface,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {/* No web `cursor: grab`: React Native's CursorValue only admits auto
            and pointer, and casting around the type to style a hint that the
            grabber already conveys is not worth it. */}
        <View {...panResponder.panHandlers} style={styles.grabArea}>
          <View
            accessibilityRole="adjustable"
            accessibilityLabel={snap === 'expanded' ? 'Collapse venue list' : 'Expand venue list'}
            accessibilityHint="Drag up or down to resize the list"
            style={[styles.grabber, { backgroundColor: colors.borderStrong }]}
          />
          {header}
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
  },
  sheetSurface: {
    flex: 1,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
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
