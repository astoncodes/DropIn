import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, space, usePalette } from '../../theme';
import { AppText } from './primitives';
import type { IconName } from './primitives';

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

const ICONS: Record<NoticeTone, IconName> = {
  info: 'information-outline',
  success: 'check-circle-outline',
  warning: 'alert-outline',
  error: 'alert-circle-outline',
};

/**
 * An inline message about the screen it sits on: a failed save, a pending
 * state, a confirmation that stays until the screen changes. For a brief
 * confirmation that should not take up room, use a toast instead.
 *
 * The tone shows in the icon and the title only; the message stays ink on a
 * quiet grey, so a screen with a notice on it does not turn into a block of
 * colour. Errors and warnings use the alert role so screen readers announce
 * them the moment they appear, without the player having to find them.
 */
export function Notice({
  tone = 'info',
  title,
  message,
  action,
}: {
  tone?: NoticeTone;
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  const colors = usePalette();
  const accent = {
    info: colors.text,
    success: colors.live,
    warning: colors.soon,
    error: colors.alert,
  }[tone];
  const urgent = tone === 'error' || tone === 'warning';

  return (
    <View
      accessibilityRole={urgent ? 'alert' : 'summary'}
      accessibilityLiveRegion={urgent ? 'assertive' : 'polite'}
      style={[styles.notice, { backgroundColor: colors.surfaceMuted }]}
    >
      <MaterialCommunityIcons name={ICONS[tone]} size={20} color={accent} style={styles.icon} />
      <View style={styles.copy}>
        {title && (
          <AppText variant="bodyStrong" style={{ color: accent }}>
            {title}
          </AppText>
        )}
        <AppText variant="body">{message}</AppText>
        {action && <View style={styles.action}>{action}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
  },
  icon: { marginTop: 1 },
  copy: { flex: 1, gap: space.xs },
  action: { alignItems: 'flex-start', paddingTop: space.xs },
});
