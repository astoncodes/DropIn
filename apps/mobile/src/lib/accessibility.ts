import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * The Reduce Motion preference, read live rather than once at startup.
 *
 * It can be toggled while the app is open — somebody turning it on because our
 * pulse animation is making them ill should not have to restart. It is an
 * external mutable source, so it is read with `useSyncExternalStore` rather
 * than mirrored into state inside an effect, which would tear during
 * concurrent rendering.
 *
 * Every entry point is feature-detected, because react-native-web does not
 * implement all of AccessibilityInfo and an unguarded call crashes the web app
 * on first render. A missing API means "this platform cannot express the
 * preference" — different from "the user has not set it", but both resolve to
 * the same safe default.
 */

type Store = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
};

function createPreferenceStore(
  read: (() => Promise<boolean>) | undefined,
  nativeEvent: 'reduceMotionChanged',
  mediaQuery: string,
): Store {
  let value = false;
  const listeners = new Set<() => void>();

  const publish = (next: boolean) => {
    if (next === value) return;
    value = next;
    for (const listener of listeners) listener();
  };

  // Seed the value once. Until it resolves the answer is `false`, which is the
  // correct default: assume no preference rather than degrade for everyone.
  if (typeof read === 'function') {
    read()
      .then(publish)
      .catch(() => undefined);
  }

  if (typeof AccessibilityInfo.addEventListener === 'function' && typeof read === 'function') {
    AccessibilityInfo.addEventListener(nativeEvent, publish);
  }

  // react-native-web does not forward the preference, so the media query is
  // read directly rather than the setting being silently ignored on web.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
    const query = window.matchMedia(mediaQuery);
    publish(query.matches);
    query.addEventListener('change', (event) => publish(event.matches));
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getSnapshot: () => value,
  };
}

const reduceMotionStore = createPreferenceStore(
  typeof AccessibilityInfo.isReduceMotionEnabled === 'function'
    ? () => AccessibilityInfo.isReduceMotionEnabled()
    : undefined,
  'reduceMotionChanged',
  '(prefers-reduced-motion: reduce)',
);

/** True when the user has asked for less movement. Fade, don't slide. */
export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    reduceMotionStore.subscribe,
    reduceMotionStore.getSnapshot,
    () => false,
  );
}
