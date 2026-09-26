import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';

import { useReduceMotion } from '../../lib/accessibility';
import { elevation, motion, radius, space, usePalette } from '../../theme';
import { Notice } from './notice';
import { AppText, Button } from './primitives';
import type { ButtonTone } from './primitives';

/**
 * A centred modal for a decision that needs a deliberate answer.
 *
 * The backdrop fades (the Modal's own animation) while the card settles from
 * 96% with ease-out, so it arrives rather than pops. Under Reduce Motion only
 * the fade remains. While `dismissible` is false — a destructive action in
 * flight — neither the backdrop nor the system back gesture can abandon it.
 */
export function Dialog({
  visible,
  onClose,
  title,
  description,
  children,
  actions,
  dismissible = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
  dismissible?: boolean;
}) {
  const colors = usePalette();
  const reduceMotion = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    progress.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.base,
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
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          onPress={close}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.card,
            { backgroundColor: colors.surface },
            elevation.floating,
            {
              opacity: progress,
              transform: [
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
          ]}
        >
          <View accessibilityRole="header">
            <AppText variant="heading">{title}</AppText>
          </View>
          {description && <AppText tone="muted">{description}</AppText>}
          {children}
          {actions && <View style={styles.actions}>{actions}</View>}
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * Yes/no confirmation for an action with consequences. The confirm button is
 * first and carries the tone; Cancel is quieter and disabled while busy.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  confirmTone = 'alert',
  cancelLabel = 'Cancel',
  busy = false,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  confirmTone?: ButtonTone;
  cancelLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog
      visible={visible}
      onClose={onCancel}
      title={title}
      description={message}
      dismissible={!busy}
      actions={
        <>
          <Button label={confirmLabel} tone={confirmTone} loading={busy} onPress={onConfirm} />
          <Button
            label={cancelLabel}
            tone="neutral"
            variant="ghost"
            disabled={busy}
            onPress={onCancel}
          />
        </>
      }
    >
      {children}
      {error ? <Notice tone="error" message={error} /> : null}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    padding: space.xl,
    gap: space.md,
  },
  actions: { gap: space.sm, marginTop: space.sm },
});
