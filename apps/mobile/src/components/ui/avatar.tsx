import { View } from 'react-native';

import { fonts, usePalette } from '../../theme';
import { AppText } from './primitives';

/** Up to two initials from a display name: "Sam Rivera" → "SR", "sam" → "S". */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toLocaleUpperCase() ?? '');
  return letters.join('') || '?';
}

/**
 * A player's initials. Drop In has no profile photos, so this is the only
 * avatar; it is hidden from screen readers because the name beside it is what
 * should be read.
 */
export function Avatar({
  name,
  size = 40,
  inverse = false,
}: {
  name: string;
  size?: number;
  /** On an ink surface. */
  inverse?: boolean;
}) {
  const colors = usePalette();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: inverse ? colors.inkSoft : colors.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <AppText
        style={{
          fontFamily: fonts.displayMedium,
          fontSize: Math.round(size * 0.44),
          lineHeight: Math.round(size * 0.52),
          color: inverse ? colors.textInverse : colors.text,
        }}
      >
        {initials(name)}
      </AppText>
    </View>
  );
}
