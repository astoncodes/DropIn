import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion } from '../../lib/accessibility';
import { elevation, motion, radius, space, usePalette } from '../../theme';
import { AppText, IconButton } from './primitives';

/**
 * A panel that rises from the bottom edge for choices tied to something on
 * screen — a post's actions, a report form. It floats above the home
 * indicator rather than hugging the edge, and caps its width so it reads as a
 * panel, not a page, on tablets and the web.
 *
 * Entry rises 32pt with ease-out while the backdrop fades; exit is the faster
 * system fade. Reduce Motion keeps only the fade.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  dismissible = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dismissible?: boolean;
}) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    progress.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.slow,
      easing: Easing.bezier(...motion.easeOut),
      useNativeDriver: true,
    }).start();
  }, [visible, reduceMotion, progress]);

  const close = () => {
    if (dismissible) onClose();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
        onPress={close}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              marginBottom: Math.max(insets.bottom, space.md),
              transform: [
                {
                  translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }),
                },
              ],
            },
            elevation.floating,
          ]}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }} accessibilityRole="header">
              <AppText variant="heading">{title}</AppText>
            </View>
            <IconButton icon="close" label="Close" onPress={close} disabled={!dismissible} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body}
            bounces={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.xl,
    paddingRight: space.sm,
    paddingTop: space.sm,
  },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },
});
