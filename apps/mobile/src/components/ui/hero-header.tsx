import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { elevation, radius, space, usePalette } from '../../theme';
import { AppText } from './primitives';

/**
 * The top of a tab: the title and its actions on an ink block that rounds
 * off above the page, with room for the controls that belong to the whole
 * screen, such as a SegmentedControl. It clears the status bar itself, so a
 * screen that uses it starts its content right under it.
 *
 * It is the one heavy element on a screen. Everything under it is white
 * cards on the grey page, which is what makes the block read as a header and
 * not as a theme.
 */
export function HeroHeader({
  title,
  actions,
  children,
}: {
  title: string;
  /** Inverse icon buttons for the screen's actions, right-aligned. */
  actions?: ReactNode;
  /** Controls for the whole screen, drawn inside the block. */
  children?: ReactNode;
}) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.block,
        elevation.floating,
        { backgroundColor: colors.surfaceInverse, paddingTop: insets.top + space.md },
      ]}
    >
      <View style={styles.inner}>
        <View style={styles.row}>
          <View accessibilityRole="header" style={styles.title}>
            <AppText variant="display" tone="inverse">
              {title}
            </AppText>
          </View>
          {actions && <View style={styles.actions}>{actions}</View>}
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    zIndex: 2,
  },
  inner: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  title: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
