import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, Redirect, usePathname } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { TAB_TITLES } from '../../src/lib/tab-titles';
import { usePalette } from '../../src/theme';
import { useSession } from '../../src/providers/auth-context';

/**
 * Five focused mobile destinations: live map, nearby community moments,
 * scheduled runs, private session chats, and the player's account.
 *
 * Icons are supplied explicitly. React Navigation falls back to a placeholder
 * triangle when `tabBarIcon` is omitted, which renders as a broken-looking ▼ in
 * every tab — worse than having no icon at all.
 *
 * Outline when inactive, solid ink when focused: the platform convention, and
 * a second signal beyond colour. The active tab is ink rather than green
 * because green is reserved for live activity.
 */
export default function TabsLayout() {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session, isLoading } = useSession();
  const pathname = usePathname();
  if (isLoading) return null;
  if (!session && pathname !== '/') return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingHorizontal: Math.max(0, (width - 900) / 2),
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarItemStyle: { maxWidth: 180 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: TAB_TITLES.index,
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'map-marker' : 'map-marker-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: TAB_TITLES.feed,
          href: session ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'compass' : 'compass-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scheduled"
        options={{
          title: TAB_TITLES.scheduled,
          href: session ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'calendar' : 'calendar-blank-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: TAB_TITLES.chats,
          href: session ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'chat' : 'chat-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: session ? TAB_TITLES.profile : 'Sign in',
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'account' : 'account-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
