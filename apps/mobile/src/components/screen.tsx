import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
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
export function Screen({ children, insetTop = true }: { children: ReactNode; insetTop?: boolean }) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: (insetTop ? insets.top : 0) + spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
        },
      ]}
    >
      {children}
    </ScrollView>
  );
}

/** Supporting copy at the top of a Screen. */
export function Body({ children }: { children: ReactNode }) {
  return <AppText tone="muted">{children}</AppText>;
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing.md,
  },
});
