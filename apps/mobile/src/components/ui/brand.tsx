import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View } from 'react-native';

import { fonts, radius, usePalette } from '../../theme';
import { AppText, sportIcon } from './primitives';

/**
 * The wordmark. The full stop is the only green in it: the same green that
 * marks a live venue, so the name carries the product's one idea.
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  const colors = usePalette();
  return (
    <AppText
      style={{ fontFamily: fonts.display, fontSize: size, lineHeight: Math.round(size * 1.05) }}
    >
      Drop In
      <AppText style={{ fontFamily: fonts.display, fontSize: size, color: colors.live }}>.</AppText>
    </AppText>
  );
}

/**
 * A sport's glyph in ink. Sports are told apart by shape, not by colour, so
 * colour stays free to mean "live".
 */
export function SportBadge({ slug, size = 40 }: { slug?: string | null; size?: number }) {
  const colors = usePalette();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <MaterialCommunityIcons
        name={slug ? sportIcon(slug) : 'map-marker-outline'}
        size={Math.round(size * 0.55)}
        color={colors.text}
      />
    </View>
  );
}
