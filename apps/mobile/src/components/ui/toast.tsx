import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion } from '../../lib/accessibility';
import { elevation, motion, radius, space, usePalette } from '../../theme';
import { AppText } from './primitives';
import type { IconName } from './primitives';

type ToastTone = 'success' | 'info' | 'error';
type Toast = { id: number; message: string; tone: ToastTone };

const ICONS: Record<ToastTone, IconName> = {
  success: 'check-circle',
  info: 'information',
  error: 'alert-circle',
};

/** How long a toast stays readable. Long enough for two short sentences. */
const VISIBLE_MS = 4000;

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

/**
 * Brief, non-blocking confirmation of something that just happened — "Report
 * sent", "Player blocked". Never the only place an error is explained, and
 * never for anything that needs a decision.
 *
 * One toast at a time: a newer message replaces the current one instead of
 * stacking. It drops in from the top edge and leaves the same way, faster than
 * it arrived, and is announced to screen readers when shown.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const nextId = useRef(0);
  const show = useCallback((message: string, tone: ToastTone = 'success') => {
    nextId.current += 1;
    setToast({ id: nextId.current, message, tone });
  }, []);
  const dismiss = useCallback(() => setToast(null), []);

  return (
    <ToastContext value={show}>
      {children}
      {toast && <ToastView key={toast.id} toast={toast} onDone={dismiss} />}
    </ToastContext>
  );
}

function ToastView({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  useEffect(() => {
    if (typeof AccessibilityInfo.announceForAccessibility === 'function') {
      AccessibilityInfo.announceForAccessibility(toast.message);
    }
    const enter = Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? 0 : motion.base,
      easing: Easing.bezier(...motion.easeOut),
      useNativeDriver: true,
    });
    enter.start();
    const timer = setTimeout(() => {
      Animated.timing(progress, {
        toValue: 0,
        duration: motion.fast,
        easing: Easing.bezier(...motion.easeOut),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onDone();
      });
    }, VISIBLE_MS);
    return () => {
      enter.stop();
      clearTimeout(timer);
    };
  }, [toast, progress, reduceMotion, onDone]);

  // Tints light enough to read on the toast's ink background.
  const iconColor = {
    success: colors.liveSoft,
    info: colors.textInverse,
    error: colors.alertSoft,
  }[toast.tone];

  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + space.sm }]}>
      <Animated.View
        accessibilityRole={toast.tone === 'error' ? 'alert' : 'text'}
        style={[
          styles.toast,
          { backgroundColor: colors.surfaceInverse },
          elevation.floating,
          {
            opacity: progress,
            transform: reduceMotion
              ? []
              : [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-16, 0],
                    }),
                  },
                ],
          },
        ]}
      >
        <MaterialCommunityIcons name={ICONS[toast.tone]} size={20} color={iconColor} />
        <AppText variant="bodyStrong" tone="inverse" style={{ flex: 1 }}>
          {toast.message}
        </AppText>
      </Animated.View>
    </View>
  );
}

/** Returns `showToast(message, tone?)`. */
export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>.');
  return show;
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: space.lg,
    zIndex: 1000,
  },
  toast: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
  },
});
