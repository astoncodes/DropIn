import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../../theme';
import { AppText } from './primitives';

/**
 * The large title at the top of a tab. One per screen, marked as the page
 * heading so screen-reader users can jump to it.
 */
export function ScreenHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  /** Icon buttons for the screen's primary actions, right-aligned. */
  actions?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.copy}>
        <View accessibilityRole="header">
          <AppText variant="display">{title}</AppText>
        </View>
        {subtitle && <AppText tone="muted">{subtitle}</AppText>}
      </View>
      {actions && <View style={styles.actions}>{actions}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  copy: { flex: 1, gap: space.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
