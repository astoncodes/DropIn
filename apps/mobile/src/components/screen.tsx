import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space as spacing, usePalette } from '../theme';
import { AppText } from './ui/primitives';

/**
 * Standard page frame: safe-area aware, scrollable, themed.
 *
 * Pass `insetTop={false}` for a screen shown under a navigation header — the
 * header already clears the status bar, and adding the inset again leaves a
 * blank band above the content.
 */
export function Screen({
  children,
  insetTop = true,
  header,
}: {
  children: ReactNode;
  insetTop?: boolean;
  /** A full-bleed block above the content, such as a HeroHeader, which clears the status bar itself. */
  header?: ReactNode;
}) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
    >
      {header}
      <View
        style={[
          styles.content,
          {
            paddingTop: (insetTop && !header ? insets.top : 0) + spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
      >
        {children}
      </View>
    </ScrollView>
  );
}

/** Supporting copy at the top of a Screen. */
export function Body({ children }: { children: ReactNode }) {
  return <AppText tone="muted">{children}</AppText>;
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing.md,
  },
});
