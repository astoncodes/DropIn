import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { elevation, radius, space, usePalette } from '../../theme';
import { PressableSurface } from './primitives';

const PADDING = { none: 0, sm: space.md, md: space.lg, lg: space.xl } as const;

/**
 * A white surface on the off-white page. Cards group content that belongs
 * together; they are not decoration, so a screen of plain text needs none.
 *
 * Pass `onPress` for a card that opens something — the whole surface then
 * becomes one target with a single accessible label.
 */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  padding = 'md',
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  padding?: keyof typeof PADDING;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = usePalette();
  const surface = (
    <View
      style={[
        styles.card,
        { padding: PADDING[padding], backgroundColor: colors.surface, borderColor: colors.border },
        elevation.card,
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return surface;
  return (
    <PressableSurface
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      {surface}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.md,
  },
});
