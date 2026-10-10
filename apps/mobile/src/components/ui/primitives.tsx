import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Insets, StyleProp, TextStyle, ViewStyle } from 'react-native';

import { useReduceMotion } from '../../lib/accessibility';
import { motion, radius, space, typeScale, usePalette } from '../../theme';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * One icon family across the whole app. MaterialCommunityIcons is the only set
 * that has a real glyph for every sport we support — volleyball and pickleball
 * have no Ionicons equivalent, and substituting a circle for them would make
 * the sport filters unreadable at a glance.
 */
export const SPORT_ICONS: Record<string, IconName> = {
  basketball: 'basketball',
  soccer: 'soccer',
  volleyball: 'volleyball',
  tennis: 'tennis',
  pickleball: 'racquetball',
  badminton: 'badminton',
  'ice-hockey': 'hockey-sticks',
};

export function sportIcon(slug: string | null | undefined): IconName {
  return (slug && SPORT_ICONS[slug]) || 'trophy-outline';
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type TypeVariant = keyof typeof typeScale;
type TextTone = 'default' | 'muted' | 'faint' | 'inverse' | 'live' | 'soon' | 'alert';

export function AppText({
  children,
  variant = 'body',
  tone = 'default',
  style,
  numberOfLines,
  onPress,
  accessibilityRole,
}: {
  children: ReactNode;
  variant?: TypeVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** For an inline link inside running text; pair with accessibilityRole="link". */
  onPress?: () => void;
  accessibilityRole?: 'link';
}) {
  const colors = usePalette();
  const toneColor: Record<TextTone, string> = {
    default: colors.text,
    muted: colors.textMuted,
    faint: colors.textFaint,
    inverse: colors.textInverse,
    live: colors.liveText,
    soon: colors.soonText,
    alert: colors.alert,
  };

  return (
    <Text
      numberOfLines={numberOfLines}
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      // Respects the OS text-size setting rather than locking the layout to
      // one font size, but capped so a row cannot grow past its container.
      maxFontSizeMultiplier={1.6}
      style={[typeScale[variant], { color: toneColor[tone] }, style]}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Pressable feedback
// ---------------------------------------------------------------------------

/**
 * Scale-on-press, shared by every tappable surface.
 *
 * 0.97 is deliberately small: enough that the interface visibly acknowledges
 * the touch, not enough that anyone consciously notices it. Under Reduce
 * Motion it falls back to an opacity change, which conveys the same "heard
 * you" without moving anything.
 */
function usePressFeedback() {
  const [scale] = useState(() => new Animated.Value(1));
  const reduceMotion = useReduceMotion();

  const animate = (to: number) =>
    Animated.timing(scale, {
      toValue: to,
      duration: motion.instant,
      useNativeDriver: true,
    }).start();

  return {
    scale,
    reduceMotion,
    onPressIn: () => !reduceMotion && animate(motion.pressScale),
    onPressOut: () => !reduceMotion && animate(1),
  };
}

export function PressableSurface({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  selected,
  hitSlop,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  dimWhenDisabled = true,
}: {
  children: ReactNode;
  onPress?: () => void;
  /** Secondary actions for touch; always offer the same actions another way too. */
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** False for a control that draws its own disabled state. */
  dimWhenDisabled?: boolean;
  selected?: boolean;
  hitSlop?: Insets;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link' | 'tab';
}) {
  const { scale, reduceMotion, onPressIn, onPressOut } = usePressFeedback();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={hitSlop}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, selected }}
      aria-disabled={!!disabled}
      aria-pressed={accessibilityRole === 'button' ? selected : undefined}
      aria-selected={accessibilityRole === 'tab' ? selected : undefined}
      style={({ pressed }) => [
        { opacity: disabled && dimWhenDisabled ? 0.45 : reduceMotion && pressed ? 0.75 : 1 },
        style,
      ]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

/**
 * `neutral` is ink and is the default. `live` is green and is for the actions
 * that put a player on a court — checking in, going to a session — so that the
 * one green button on a screen is always that action. `alert` is destructive.
 */
export type ButtonTone = 'neutral' | 'live' | 'alert';

const BUTTON_HEIGHT = { sm: 44, md: 50, lg: 56 } as const;

export function Button({
  label,
  onPress,
  icon,
  tone = 'neutral',
  variant = 'solid',
  size = 'md',
  disabled,
  loading,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  tone?: ButtonTone;
  /**
   * `solid` for the screen's primary action, `outline` for the alternative
   * beside it, `soft` for quiet actions inside content, and `ghost` for the
   * least important one, such as Cancel.
   */
  variant?: 'solid' | 'soft' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const colors = usePalette();

  const fill = { neutral: colors.surfaceInverse, live: colors.live, alert: colors.alert }[tone];
  const softFill = {
    neutral: colors.surfaceMuted,
    live: colors.liveSoft,
    alert: colors.alertSoft,
  }[tone];
  const ink = { neutral: colors.text, live: colors.liveText, alert: colors.alertText }[tone];

  // A faded ink button reads as a grey button that still works, so a solid
  // button that cannot be pressed is redrawn as a muted block instead. A
  // loading one keeps its colour: it is busy, not unavailable.
  const unavailable = variant === 'solid' && disabled && !loading;
  const background = unavailable
    ? colors.surfaceMuted
    : variant === 'solid'
      ? fill
      : variant === 'soft'
        ? softFill
        : 'transparent';
  const foreground = unavailable
    ? colors.textFaint
    : variant === 'solid'
      ? colors.textInverse
      : ink;

  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled || loading}
      dimWhenDisabled={variant !== 'solid'}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={style}
    >
      <View
        style={[
          styles.button,
          {
            minHeight: BUTTON_HEIGHT[size],
            backgroundColor: background,
            borderWidth: variant === 'outline' ? 1.5 : 0,
            borderColor: tone === 'neutral' ? colors.text : ink,
            paddingHorizontal: variant === 'ghost' ? space.sm : size === 'sm' ? space.lg : space.xl,
          },
        ]}
      >
        {loading && <ActivityIndicator color={foreground} size="small" />}
        {icon && !loading && (
          <MaterialCommunityIcons name={icon} size={size === 'sm' ? 17 : 19} color={foreground} />
        )}
        <Text
          maxFontSizeMultiplier={1.4}
          style={[typeScale.button, size === 'sm' && styles.smallLabel, { color: foreground }]}
        >
          {label}
        </Text>
      </View>
    </PressableSurface>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  filled = false,
  style,
  disabled,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  /** Ink-filled, for the one primary action in a header. */
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const colors = usePalette();
  const unavailable = filled && disabled;
  return (
    <PressableSurface
      onPress={onPress}
      accessibilityLabel={label}
      style={style}
      disabled={disabled}
      dimWhenDisabled={!filled}
    >
      <View
        style={[
          styles.iconButton,
          {
            backgroundColor: unavailable
              ? colors.surfaceMuted
              : filled
                ? colors.surfaceInverse
                : 'transparent',
          },
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={22}
          color={unavailable ? colors.textFaint : filled ? colors.textInverse : colors.text}
        />
      </View>
    </PressableSurface>
  );
}

// ---------------------------------------------------------------------------
// Chip and Tag
// ---------------------------------------------------------------------------

/**
 * A choice among several: sport filters, durations, repeat options. Selected
 * is ink, so a row of chips reads as one control with one answer.
 */
export function Chip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
}) {
  const colors = usePalette();
  const foreground = selected ? colors.textInverse : colors.text;

  const content = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.surfaceInverse : colors.surface,
          borderColor: selected ? colors.surfaceInverse : colors.borderStrong,
        },
      ]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={17} color={foreground} />}
      <Text maxFontSizeMultiplier={1.3} style={[styles.chipLabel, { color: foreground }]}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <PressableSurface
      onPress={onPress}
      accessibilityLabel={label}
      selected={selected}
      accessibilityRole="button"
      accessibilityHint={selected ? 'Selected' : 'Select this option'}
      // The chip is 38pt tall so a row of them stays compact; the slop restores
      // a 44pt target.
      hitSlop={{ top: 3, bottom: 3 }}
    >
      {content}
    </PressableSurface>
  );
}

export type TagTone = 'neutral' | 'live' | 'soon' | 'alert';

/**
 * A small-capitals label for a state: GOING, HOSTING, CANCELLED. Never
 * tappable, and never more than one or two beside a title — a row of tags is a
 * sign the row is trying to say too much.
 */
export function Tag({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: TagTone;
  icon?: IconName;
}) {
  const colors = usePalette();
  const palette = {
    neutral: { bg: colors.surfaceMuted, fg: colors.text },
    live: { bg: colors.liveSoft, fg: colors.liveText },
    soon: { bg: colors.soonSoft, fg: colors.soonText },
    alert: { bg: colors.alertSoft, fg: colors.alertText },
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: palette.bg }]}>
      {icon && <MaterialCommunityIcons name={icon} size={12} color={palette.fg} />}
      <Text maxFontSizeMultiplier={1.3} style={[typeScale.label, { color: palette.fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  smallLabel: { fontSize: 17, lineHeight: 20 },
  iconButton: {
    // Never below 44: anything smaller is a target people miss.
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  chipLabel: { ...typeScale.heading, fontSize: 17, lineHeight: 20 },
  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radius.xs,
  },
});
