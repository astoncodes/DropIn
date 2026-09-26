import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Children, Fragment, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, space, usePalette } from '../../theme';
import { AppText, PressableSurface } from './primitives';
import type { IconName } from './primitives';

/**
 * A titled group of rows on one surface — the settings-list pattern people
 * already know from their phone. Dividers are inserted between rows here so
 * no row has to know whether it is first or last.
 */
export function ListSection({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const colors = usePalette();
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View style={styles.section}>
      {title && (
        <AppText variant="micro" tone="muted" style={styles.sectionTitle}>
          {title.toUpperCase()}
        </AppText>
      )}
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
            {row}
          </Fragment>
        ))}
      </View>
      {footer && (
        <AppText variant="caption" tone="muted" style={styles.footer}>
          {footer}
        </AppText>
      )}
    </View>
  );
}

/**
 * One row in a ListSection. Rows with `onPress` get a chevron (or an external
 * link glyph for `external`) so it is obvious which rows lead somewhere.
 */
export function ListRow({
  icon,
  leading,
  title,
  subtitle,
  value,
  onPress,
  external,
  tone = 'default',
  trailing,
  disabled,
  accessibilityHint,
}: {
  icon?: IconName;
  /** Custom leading content, such as an Avatar, in place of `icon`. */
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  /** Opens outside the app (browser, mail); shows an external-link glyph. */
  external?: boolean;
  tone?: 'default' | 'alert';
  trailing?: ReactNode;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const colors = usePalette();
  const foreground = tone === 'alert' ? colors.alert : colors.text;
  const content = (
    <View style={styles.row}>
      {leading}
      {icon && !leading && (
        <View
          style={[
            styles.icon,
            { backgroundColor: tone === 'alert' ? colors.alertSoft : colors.surfaceMuted },
          ]}
        >
          <MaterialCommunityIcons name={icon} size={18} color={foreground} />
        </View>
      )}
      <View style={styles.copy}>
        <AppText variant="body" style={{ color: foreground }}>
          {title}
        </AppText>
        {subtitle && (
          <AppText variant="caption" tone="muted">
            {subtitle}
          </AppText>
        )}
      </View>
      {value && (
        <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      )}
      {trailing}
      {onPress && (
        <MaterialCommunityIcons
          name={external ? 'open-in-new' : 'chevron-right'}
          size={external ? 18 : 22}
          color={colors.textFaint}
        />
      )}
    </View>
  );

  if (!onPress) return content;
  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
    >
      {content}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  sectionTitle: { paddingHorizontal: space.xs },
  group: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  value: { maxWidth: '45%' },
  footer: { paddingHorizontal: space.xs },
});
