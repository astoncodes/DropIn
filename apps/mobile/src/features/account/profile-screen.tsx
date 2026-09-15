import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Screen, Title } from '../../components/screen';
import { BrandMark } from '../../components/ui/brand';
import { EmptyState, Skeleton } from '../../components/ui/activity';
import { AppText, Button } from '../../components/ui/primitives';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/auth-context';
import { radius, space, usePalette } from '../../theme';
import { useAccountProfile } from './api';
import { ProfileForm } from './profile-form';
import { DeleteAccount } from './delete-account';
import { PresenceCard } from '../presence/presence-card';

export function ProfileAccountScreen() {
  const router = useRouter();
  const colors = usePalette();
  const { session, isLoading } = useSession();
  const profile = useAccountProfile(session?.user.id);
  const [editing, setEditing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setEditing(false);
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Could not sign out. Try again.');
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <Screen>
      <Title>Profile</Title>
      <PresenceCard />
      {isLoading && <Skeleton height={180} />}
      {!isLoading && !session && (
        <EmptyState
          icon="account-outline"
          title="Your people are out there"
          body="Join a game, save your favourite sports, and make your next session happen."
          action={
            <Button
              label="Sign in or create account"
              icon="arrow-right"
              onPress={() => router.push('/sign-in')}
            />
          }
        />
      )}
      {session && (
        <>
          <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: colors.liveSoft,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: space.sm,
              }}
            >
              {profile.data?.display_name ? (
                <AppText variant="display" tone="live">
                  {profile.data.display_name.slice(0, 1).toUpperCase()}
                </AppText>
              ) : (
                <MaterialCommunityIcons name="account" size={42} color={colors.live} />
              )}
            </View>
            <AppText variant="title">{profile.data?.display_name ?? 'Your profile'}</AppText>
            <AppText variant="caption" tone="muted">
              {session.user.email}
            </AppText>
          </View>
          <Button
            label={editing ? 'Close editor' : 'Edit profile'}
            icon="pencil-outline"
            onPress={() => setEditing(!editing)}
          />
          {editing && (
            <View
              style={{
                backgroundColor: colors.surface,
                padding: space.lg,
                borderRadius: radius.xl,
              }}
            >
              <ProfileForm userId={session.user.id} onSaved={() => setEditing(false)} />
            </View>
          )}
          <Button
            label="Your venue submissions"
            icon="map-marker-outline"
            variant="outline"
            onPress={() => router.push('/venue-submission')}
          />
        </>
      )}
      {session && (
        <>
          {signOutError && <AppText tone="alert">{signOutError}</AppText>}
          <Button
            label="Sign out"
            icon="logout"
            tone="neutral"
            variant="outline"
            onPress={signOut}
            loading={isSigningOut}
          />
          <DeleteAccount userId={session.user.id} />
        </>
      )}
      <View style={{ alignItems: 'center', paddingVertical: space.xl }}>
        <BrandMark size={24} showTagline />
      </View>
    </Screen>
  );
}
