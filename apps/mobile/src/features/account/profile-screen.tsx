import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '../../components/screen';
import { EmptyState, Skeleton } from '../../components/ui/activity';
import { Avatar } from '../../components/ui/avatar';
import { BrandMark } from '../../components/ui/brand';
import { Card } from '../../components/ui/card';
import { ListRow, ListSection } from '../../components/ui/list-row';
import { Notice } from '../../components/ui/notice';
import { AppText, Button } from '../../components/ui/primitives';
import { ScreenHeader } from '../../components/ui/screen-header';
import { useToast } from '../../components/ui/toast';
import { userMessage } from '@dropin/shared';
import { loadPhase } from '../../lib/load-phase';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/auth-context';
import { space } from '../../theme';
import { PresenceCard } from '../presence/presence-card';
import { useAccountProfile } from './api';
import { DeleteAccountDialog, useAccountDeletionStatus } from './delete-account';
import { ProfileForm } from './profile-form';

export function ProfileAccountScreen() {
  const router = useRouter();
  const { session, isLoading } = useSession();

  return (
    <Screen>
      <ScreenHeader title="Profile" />
      <PresenceCard />
      {isLoading ? (
        <Skeleton height={180} />
      ) : session ? (
        <SignedInProfile userId={session.user.id} email={session.user.email ?? ''} />
      ) : (
        <Card>
          <EmptyState
            icon="account-outline"
            title="Your people are out there"
            body="Sign in to join sessions, chat with players and keep your sports in one place."
            action={
              <Button
                label="Sign in or create account"
                icon="arrow-right"
                onPress={() => router.push('/sign-in')}
              />
            }
          />
        </Card>
      )}
      <ListSection title="Help & policies">
        <ListRow icon="lifebuoy" title="Help & support" onPress={() => router.push('/support')} />
        <ListRow
          icon="file-document-outline"
          title="Terms of use"
          subtitle="Including the community guidelines"
          onPress={() => router.push('/terms')}
        />
        <ListRow
          icon="shield-account-outline"
          title="Privacy policy"
          onPress={() => router.push('/privacy')}
        />
      </ListSection>
      <View style={styles.footer}>
        <BrandMark size={24} showTagline />
        <AppText variant="caption" tone="faint">
          Version {Constants.expoConfig?.version ?? 'unknown'}
        </AppText>
      </View>
    </Screen>
  );
}

function SignedInProfile({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const showToast = useToast();
  const profile = useAccountProfile(userId);
  const deletion = useAccountDeletionStatus(userId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const name = profile.data?.display_name ?? 'Your profile';

  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setSignOutError(userMessage(error, 'Could not sign out. Try again.'));
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <>
      {deletion.data && (
        <Notice
          tone="warning"
          title="Account deletion isn’t finished"
          message="Some of your files are still being removed. Finish deleting your account to remove everything."
          action={
            <Button
              label="Finish deletion"
              size="sm"
              tone="alert"
              variant="soft"
              onPress={() => setDeleting(true)}
            />
          }
        />
      )}
      {loadPhase(profile) === 'failed' && (
        <Notice
          tone="error"
          message="Could not load your profile. Check your connection and try again."
          action={
            <Button
              label="Try again"
              size="sm"
              tone="neutral"
              variant="soft"
              loading={profile.isFetching}
              onPress={() => void profile.refetch()}
            />
          }
        />
      )}
      <Card>
        <View style={styles.identity}>
          <Avatar name={name} size={56} />
          <View style={styles.identityCopy}>
            <AppText variant="heading" numberOfLines={1}>
              {name}
            </AppText>
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {email}
            </AppText>
          </View>
          <Button
            label={editing ? 'Close' : 'Edit'}
            size="sm"
            variant="outline"
            tone="neutral"
            accessibilityHint={editing ? 'Closes the profile editor' : 'Edit your name and sports'}
            onPress={() => setEditing(!editing)}
          />
        </View>
        {editing && (
          <ProfileForm
            userId={userId}
            onSaved={() => {
              setEditing(false);
              showToast('Profile saved');
            }}
          />
        )}
      </Card>
      <ListSection title="Your activity">
        <ListRow
          icon="map-marker-plus-outline"
          title="Your venue submissions"
          subtitle="Places you suggested and their review status"
          onPress={() => router.push('/venue-submission')}
        />
        <ListRow
          icon="account-cancel-outline"
          title="Blocked players"
          onPress={() => router.push('/blocked-players')}
        />
      </ListSection>
      <ListSection title="Account">
        <ListRow
          icon="logout"
          title={isSigningOut ? 'Signing out…' : 'Sign out'}
          disabled={isSigningOut}
          onPress={() => void signOut()}
        />
        <ListRow
          icon="account-remove-outline"
          title="Delete account"
          tone="alert"
          onPress={() => setDeleting(true)}
        />
      </ListSection>
      {signOutError && <Notice tone="error" message={signOutError} />}
      <DeleteAccountDialog userId={userId} visible={deleting} onClose={() => setDeleting(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  identityCopy: { flex: 1, gap: 2 },
  footer: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
});
