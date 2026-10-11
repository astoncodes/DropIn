import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../../theme';
import { AppText } from './primitives';

/**
 * The title at the top of a tab. One per screen, marked as the page heading so
 * screen-reader users can jump to it. It names the screen and nothing more: a
 * line of encouragement under every title is noise people learn to skip.
 */
export function ScreenHeader({
  title,
  actions,
}: {
  title: string;
  /** Icon buttons for the screen's actions, right-aligned. */
  actions?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View accessibilityRole="header" style={styles.title}>
        <AppText variant="display">{title}</AppText>
      </View>
      {actions && <View style={styles.actions}>{actions}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  title: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
