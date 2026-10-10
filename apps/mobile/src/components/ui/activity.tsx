import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useReduceMotion } from '../../lib/accessibility';
import { radius, space, typeScale, usePalette } from '../../theme';
import { AppText, Button } from './primitives';
import type { IconName } from './primitives';

export type ActivityTone = 'live' | 'soon' | 'info' | 'quiet';

/**
 * A slow expanding ring behind a solid dot — the visual shorthand for
 * "happening right now".
 *
 * Two rules keep it from becoming noise: it only ever renders when something
 * is genuinely live, and it stops completely under Reduce Motion. A pulse that
 * animates on an empty court would be the most damaging kind of decoration,
 * because it would imply activity that is not there.
 */
export function LivePulse({ color, size = 10 }: { color: string; size?: number }) {
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
    <View
      style={{
        width: size * 2.6,
        height: size * 2.6,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {!reduceMotion && (
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: color,
            opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) },
            ],
          }}
        />
      )}
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

/**
 * The headline activity signal on a card or venue header.
 *
 * The count reads at scoreboard weight because it is the single most useful
 * number on the screen; everything else is supporting detail.
 */
export function ActivityBadge({
  label,
  tone,
  count,
  style,
}: {
  label: string;
  tone: ActivityTone;
  count?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = usePalette();

  const tones: Record<ActivityTone, { bg: string; fg: string; dot: string }> = {
    live: { bg: colors.liveSoft, fg: colors.liveText, dot: colors.live },
    soon: { bg: colors.soonSoft, fg: colors.soonText, dot: colors.soon },
    info: { bg: colors.infoSoft, fg: colors.info, dot: colors.info },
    quiet: { bg: colors.surfaceMuted, fg: colors.textMuted, dot: colors.textFaint },
  };
  const t = tones[tone];

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={count != null ? `${count} ${label}` : label}
      style={[styles.badge, { backgroundColor: t.bg, borderRadius: radius.pill }, style]}
    >
      {tone === 'live' ? (
        <LivePulse color={t.dot} size={8} />
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 8, backgroundColor: t.dot }} />
      )}
      <AppText variant="caption" style={{ color: t.fg, fontWeight: '700' }}>
        {label}
      </AppText>
    </View>
  );
}

/** Big scoreboard-weight number with a label underneath. */
export function ScoreStat({
  value,
  label,
  tone = 'live',
}: {
  value: number | string;
  label: string;
  tone?: ActivityTone;
}) {
  const colors = usePalette();
  const color = {
    live: colors.live,
    soon: colors.soon,
    info: colors.info,
    quiet: colors.textFaint,
  }[tone];

  return (
    <View style={{ alignItems: 'flex-start', gap: 2 }}>
      <AppText variant="score" style={{ color }}>
        {value}
      </AppText>
      <AppText variant="micro" tone="muted" style={{ textTransform: 'uppercase' }}>
        {label}
      </AppText>
    </View>
  );
}

export function ConditionChip({
  icon,
  label,
  blocking,
}: {
  icon: IconName;
  label: string;
  blocking: boolean;
}) {
  const colors = usePalette();
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: blocking ? colors.alertSoft : colors.surfaceMuted,
          borderRadius: radius.pill,
          paddingVertical: 5,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={13}
        color={blocking ? colors.alert : colors.textMuted}
      />
      <AppText
        variant="micro"
        style={{ color: blocking ? colors.alert : colors.textMuted, fontWeight: '700' }}
      >
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
            : shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.85] }),
        },
        style,
      ]}
    />
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  const colors = usePalette();
  return (
    <View style={styles.empty}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name={icon} size={26} color={colors.textMuted} />
      </View>
      <AppText variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText variant="body" tone="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
        {body}
      </AppText>
      {action}
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
  secondaryAction?: React.ReactNode;
}) {
  return (
    <EmptyState
      icon="wifi-off"
      title={title}
      body={body}
      action={
        <>
          <Button label="Try again" variant="soft" loading={retrying} onPress={onRetry} />
          {secondaryAction}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: space.md,
    alignSelf: 'flex-start',
  },
  empty: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
  },
});

export { typeScale };
