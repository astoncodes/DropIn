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
import { HeroHeader } from '../../components/ui/hero-header';
import { useToast } from '../../components/ui/toast';
import { userMessage } from '@dropin/shared';
import { loadPhase } from '../../lib/load-phase';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/auth-context';
import { space, usePalette } from '../../theme';
import { PresenceCard } from '../presence/presence-card';
import { useAccountProfile, useOwnActivityCounts } from './api';
import { DeleteAccountDialog, useAccountDeletionStatus } from './delete-account';
import { ProfileForm } from './profile-form';

export function ProfileAccountScreen() {
  const router = useRouter();
  const { session, isLoading } = useSession();

  return (
    <Screen
      header={
        <HeroHeader title="Profile">
          {session && <ProfileHero userId={session.user.id} email={session.user.email ?? ''} />}
        </HeroHeader>
      }
    >
      <PresenceCard />
      {isLoading ? (
        <Skeleton height={180} />
      ) : session ? (
        <SignedInProfile userId={session.user.id} />
      ) : (
        <Card>
          <EmptyState
            title="Your people are out there"
            body="Sign in to join sessions, chat with players and keep your sports in one place."
            action={
              <Button label="Sign in or create account" onPress={() => router.push('/sign-in')} />
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
        <BrandMark size={22} />
        <AppText variant="caption" tone="faint">
          Version {Constants.expoConfig?.version ?? 'unknown'}
        </AppText>
      </View>
    </Screen>
  );
}

/** Who the player is and what they have done, inside the ink header. */
function ProfileHero({ userId, email }: { userId: string; email: string }) {
  const colors = usePalette();
  const profile = useAccountProfile(userId);
  const counts = useOwnActivityCounts(userId);
  const name = profile.data?.display_name ?? 'Your profile';
  const figure = (value: number | undefined, label: string) => (
    <View style={styles.figure} accessible accessibilityLabel={`${value ?? 0} ${label}`}>
      <AppText variant="score" tone="inverse">
        {value ?? '–'}
      </AppText>
      <AppText variant="label" tone="inverseMuted">
        {label}
      </AppText>
    </View>
  );
  return (
    <View style={styles.hero}>
      <View style={styles.identity}>
        <Avatar name={name} size={64} inverse />
        <View style={styles.identityCopy}>
          <AppText variant="heading" tone="inverse" numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="caption" tone="inverseMuted" numberOfLines={1}>
            {email}
          </AppText>
        </View>
      </View>
      <View style={[styles.figures, { borderTopColor: colors.inkSoft }]}>
        {figure(counts.data?.checkIns, 'Check-ins')}
        {figure(counts.data?.sessions, 'Sessions')}
        {figure(counts.data?.venues, 'Venues')}
      </View>
    </View>
  );
}

function SignedInProfile({ userId }: { userId: string }) {
  const router = useRouter();
  const showToast = useToast();
  const profile = useAccountProfile(userId);
  const deletion = useAccountDeletionStatus(userId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

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
          <View style={styles.identityCopy}>
            <AppText variant="heading">Your name and sports</AppText>
            <AppText variant="caption" tone="muted">
              What other players see on your sessions and check-ins.
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
  hero: { gap: space.lg, paddingTop: space.sm },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  identityCopy: { flex: 1, gap: 2 },
  figures: { flexDirection: 'row', gap: space.lg, paddingTop: space.lg, borderTopWidth: 1 },
  figure: { flex: 1, gap: 2 },
  footer: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
});
