import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useReduceMotion } from '../../lib/accessibility';
import { radius, space, usePalette } from '../../theme';
import { AppText, Button } from './primitives';
import type { IconName } from './primitives';

/**
 * A slow expanding ring behind a solid dot — the visual shorthand for
 * "happening right now".
 *
 * Two rules keep it from becoming noise: it only ever renders when something
 * is genuinely live, and it stops completely under Reduce Motion. A pulse that
 * animates on an empty court would be the most damaging kind of decoration,
 * because it would imply activity that is not there.
 */
export function LivePulse({ size = 8 }: { size?: number }) {
  const colors = usePalette();
  const [progress] = useState(() => new Animated.Value(0));
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {!reduceMotion && (
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: colors.live,
            opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] }) },
            ],
          }}
        />
      )}
      <View
        style={{ width: size, height: size, borderRadius: size, backgroundColor: colors.live }}
      />
    </View>
  );
}

export type StatTone = 'live' | 'soon' | 'default' | 'quiet';

/**
 * One figure on a scoreboard: a large number or time over a small-capitals
 * label. `live` is the only tone that uses green, and only for a count of
 * people who are present right now.
 */
export function Stat({
  value,
  label,
  tone = 'default',
  align = 'left',
}: {
  value: number | string;
  label: string;
  tone?: StatTone;
  align?: 'left' | 'right';
}) {
  const colors = usePalette();
  const color = {
    live: colors.live,
    soon: colors.soon,
    default: colors.text,
    quiet: colors.textFaint,
  }[tone];

  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 2 }}
    >
      <AppText variant="score" numberOfLines={1} style={{ color }}>
        {value}
      </AppText>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

/** A short-lived fact about a venue: lights on, wet surface, locked. */
export function ConditionChip({
  icon,
  label,
  blocking,
}: {
  icon: IconName;
  label: string;
  /** True when the condition is a reason not to travel there. */
  blocking: boolean;
}) {
  const colors = usePalette();
  const color = blocking ? colors.alert : colors.textMuted;
  return (
    <View style={styles.condition}>
      <MaterialCommunityIcons name={icon} size={16} color={color} />
      <AppText variant="caption" style={{ color, fontWeight: blocking ? '600' : '400' }}>
        {label}
      </AppText>
    </View>
  );
}

/** Loading placeholder. Shape-matched to the content it stands in for. */
export function Skeleton({
  height,
  width,
  style,
}: {
  height: number;
  width?: number | string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = usePalette();
  const [shimmer] = useState(() => new Animated.Value(0));
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer, reduceMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          height,
          width: (width as number) ?? '100%',
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceMuted,
          opacity: reduceMotion
            ? 0.6
            : shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] }),
        },
        style,
      ]}
    />
  );
}

/**
 * What a list or screen says when it has nothing to show: what is missing, in
 * plain words, and the one thing to do about it. Left-aligned like the content
 * it stands in for, with no illustration — an empty list is not an occasion.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View accessibilityRole="header">
        <AppText variant="heading">{title}</AppText>
      </View>
      {body && <AppText tone="muted">{body}</AppText>}
      {action && <View style={styles.emptyActions}>{action}</View>}
    </View>
  );
}

/**
 * Stands in for content that could not be loaded (the `failed` load phase).
 *
 * It stays on screen while later attempts run, so the retry does not move or
 * vanish under someone's thumb; `retrying` shows that an attempt is in flight.
 * Screens without a navigation header pass a way out as `secondaryAction`.
 */
export function LoadError({
  title,
  body = 'Check your connection and try again.',
  onRetry,
  retrying = false,
  secondaryAction,
}: {
  title: string;
  body?: string;
  onRetry: () => void;
  retrying?: boolean;
  secondaryAction?: ReactNode;
}) {
  return (
    <EmptyState
      title={title}
      body={body}
      action={
        <>
          <Button
            label="Try again"
            variant="outline"
            size="sm"
            loading={retrying}
            onPress={onRetry}
          />
          {secondaryAction}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  condition: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { gap: space.sm, paddingVertical: space.xl },
  emptyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.sm,
  },
});
