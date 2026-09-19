import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { useReduceMotion } from '../../lib/accessibility';
import { motion, radius, space, sportColor, typeScale, usePalette } from '../../theme';

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
}: {
  children: ReactNode;
  variant?: TypeVariant;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
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
      // Respects the OS text-size setting rather than locking the layout to
      // one font size, but capped so a card cannot grow past its container.
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
  style,
  disabled,
  selected,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  selected?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link' | 'tab';
}) {
  const { scale, reduceMotion, onPressIn, onPressOut } = usePressFeedback();

  return (
    <Pressable
      onPress={onPress}
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
        { opacity: disabled ? 0.5 : reduceMotion && pressed ? 0.75 : 1 },
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

export type ButtonTone = 'live' | 'soon' | 'neutral' | 'alert';

export function Button({
  label,
  onPress,
  icon,
  tone = 'live',
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
  variant?: 'solid' | 'soft' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const colors = usePalette();

  const toneMap = {
    live: { solid: colors.live, soft: colors.liveSoft, text: colors.liveText },
    soon: { solid: colors.soon, soft: colors.soonSoft, text: colors.soonText },
    neutral: { solid: colors.surfaceInverse, soft: colors.surfaceMuted, text: colors.text },
    alert: { solid: colors.alert, soft: colors.alertSoft, text: colors.alert },
  }[tone];

  const heights = { sm: 44, md: 48, lg: 56 };
  const background =
    variant === 'solid' ? toneMap.solid : variant === 'soft' ? toneMap.soft : 'transparent';
  const foreground =
    variant === 'solid'
      ? tone === 'neutral'
        ? colors.textInverse
        : tone === 'live'
          ? colors.textInverse
          : '#FFFFFF'
      : variant === 'soft'
        ? toneMap.text
        : colors.text;

  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={style}
    >
      <View
        style={[
          styles.button,
          {
            minHeight: heights[size],
            paddingVertical: space.sm,
            backgroundColor: background,
            borderRadius: radius.md,
            borderWidth: variant === 'outline' ? 1 : 0,
            borderColor: colors.borderStrong,
            paddingHorizontal: size === 'sm' ? space.md : space.xl,
          },
        ]}
      >
        {loading && <ActivityIndicator color={foreground} size="small" />}
        {icon && !loading && (
          <MaterialCommunityIcons name={icon} size={size === 'sm' ? 16 : 19} color={foreground} />
        )}
        <Text
          maxFontSizeMultiplier={1.4}
          style={[
            size === 'sm' ? typeScale.caption : typeScale.bodyStrong,
            { color: foreground, fontWeight: '700' },
          ]}
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
  size = 44,
  tone = 'neutral',
  style,
  disabled,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  size?: number;
  tone?: 'neutral' | 'live';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const colors = usePalette();
  return (
    <PressableSurface
      onPress={onPress}
      accessibilityLabel={label}
      style={style}
      disabled={disabled}
    >
      <View
        style={{
          // Never below 44: anything smaller is a target people miss.
          width: Math.max(size, 44),
          height: Math.max(size, 44),
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tone === 'live' ? colors.live : 'transparent',
        }}
      >
        <MaterialCommunityIcons
          name={icon}
          size={22}
          color={tone === 'live' ? '#FFFFFF' : colors.text}
        />
      </View>
    </PressableSurface>
  );
}

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

export function Chip({
  label,
  icon,
  selected,
  onPress,
  tone = 'neutral',
  compact,
}: {
  label: string;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'neutral' | 'live' | 'soon' | 'alert' | 'info';
  compact?: boolean;
}) {
  const colors = usePalette();

  const tones = {
    neutral: { bg: colors.surfaceMuted, fg: colors.textMuted },
    live: { bg: colors.liveSoft, fg: colors.liveText },
    soon: { bg: colors.soonSoft, fg: colors.soonText },
    alert: { bg: colors.alertSoft, fg: colors.alert },
    info: { bg: colors.infoSoft, fg: colors.info },
  }[tone];

  const background = selected ? colors.live : tones.bg;
  const foreground = selected ? colors.textInverse : tones.fg;

  const content = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: background,
          borderRadius: radius.pill,
          paddingVertical: compact ? 5 : 9,
          paddingHorizontal: compact ? space.sm : space.lg,
          minHeight: onPress ? 44 : undefined,
        },
      ]}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={compact ? 13 : 16}
          color={
            !selected && Object.values(SPORT_ICONS).includes(icon)
              ? sportColor(Object.keys(SPORT_ICONS).find((key) => SPORT_ICONS[key] === icon))
              : foreground
          }
        />
      )}
      <Text
        maxFontSizeMultiplier={1.3}
        style={[
          compact ? typeScale.micro : typeScale.caption,
          { color: foreground, fontWeight: '700' },
        ]}
      >
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
    >
      {content}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
