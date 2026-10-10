import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, usePalette } from '../../theme';

/**
 * The actions a detail screen exists for, pinned above the home indicator.
 *
 * A venue or session page is long, and its point — check in, join — used to
 * sit at the bottom of the scroll among other buttons of the same weight.
 * Pinned here, the primary action is always one reach away, and everything in
 * the scroll above it can be content. Give it one solid button and at most one
 * outlined alternative.
 */
export function ActionBar({ children }: { children: ReactNode }) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, space.md),
        },
      ]}
    >
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 1, paddingTop: space.md, paddingHorizontal: space.lg },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    width: '100%',
    maxWidth: 728,
    alignSelf: 'center',
  },
});
