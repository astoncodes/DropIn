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
 * Errors and warnings use the alert role so screen readers announce them the
 * moment they appear, without the player having to find them.
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
  const palette = {
    info: { bg: colors.infoSoft, fg: colors.info, text: colors.text },
    success: { bg: colors.liveSoft, fg: colors.liveText, text: colors.text },
    warning: { bg: colors.soonSoft, fg: colors.soonText, text: colors.soonText },
    error: { bg: colors.alertSoft, fg: colors.alert, text: colors.text },
  }[tone];
  const urgent = tone === 'error' || tone === 'warning';

  return (
    <View
      accessibilityRole={urgent ? 'alert' : 'summary'}
      accessibilityLiveRegion={urgent ? 'assertive' : 'polite'}
      style={[styles.notice, { backgroundColor: palette.bg }]}
    >
      <MaterialCommunityIcons name={ICONS[tone]} size={20} color={palette.fg} />
      <View style={styles.copy}>
        {title && (
          <AppText variant="bodyStrong" style={{ color: palette.text }}>
            {title}
          </AppText>
        )}
        <AppText variant="body" style={{ color: palette.text }}>
          {message}
        </AppText>
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
  },
  copy: { flex: 1, gap: space.xs },
});
