import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Chip, sportIcon } from '../../components/ui/primitives';
import type { IconName } from '../../components/ui/primitives';
import { useSports } from '../venues/api';
import { radius, space, usePalette } from '../../theme';
import { useAccountProfile, useAccountSports, useUpdateAccount } from './api';
import { userMessage } from '../../lib/errors';

export function ProfileForm({
  userId,
  onSaved,
  submitLabel = 'Save profile',
}: {
  userId: string;
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const colors = usePalette();
  const profile = useAccountProfile(userId);
  const selectedSports = useAccountSports(userId);
  const sports = useSports();

  if (profile.isPending || selectedSports.isPending || sports.isPending) {
    return <ActivityIndicator size="large" color={colors.live} />;
  }

  const loadError = profile.error ?? selectedSports.error ?? sports.error;
  if (loadError)
    return (
      <AppText tone="alert">
        {userMessage(loadError, 'Could not load your profile. Pull to refresh and try again.')}
      </AppText>
    );

  return (
    <EditableProfileForm
      key={`${profile.data!.updated_at}:${selectedSports.data!.join(',')}`}
      userId={userId}
      initialDisplayName={profile.data!.display_name}
      initialSportIds={selectedSports.data!}
      availableSports={(sports.data ?? []).filter((sport) => sport.is_active)}
      submitLabel={submitLabel}
      onSaved={onSaved}
    />
  );
}

function EditableProfileForm({
  userId,
  initialDisplayName,
  initialSportIds,
  availableSports,
  submitLabel,
  onSaved,
}: {
  userId: string;
  initialDisplayName: string;
  initialSportIds: number[];
  availableSports: { id: number; name: string; slug: string }[];
  submitLabel: string;
  onSaved?: () => void;
}) {
  const colors = usePalette();
  const updateAccount = useUpdateAccount(userId);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [sportIds, setSportIds] = useState(initialSportIds);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function save() {
    const normalizedName = displayName.trim();
    setValidationError(null);
    if (normalizedName.length < 2) {
      setValidationError('Display name must be at least 2 characters.');
      return;
    }

    try {
      await updateAccount.mutateAsync({ displayName: normalizedName, sportIds });
      onSaved?.();
    } catch {
      // The server error is rendered below.
    }
  }

  return (
    <View style={{ gap: space.xl }}>
      <View style={{ gap: space.sm }}>
        <AppText variant="heading">Display name</AppText>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={40}
          autoComplete="name"
          placeholder="How other players see you"
          placeholderTextColor={colors.textFaint}
          accessibilityLabel="Display name"
          style={[
            styles.input,
            { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        />
      </View>

      <View style={{ gap: space.sm }}>
        <AppText variant="heading">Sports you play</AppText>
        <AppText variant="caption" tone="muted">
          These stay private and will become your default discovery filters.
        </AppText>
        <View style={styles.chips}>
          {availableSports.map((sport) => (
            <Chip
              key={sport.id}
              label={sport.name}
              icon={sportIcon(sport.slug) as IconName}
              selected={sportIds.includes(sport.id)}
              onPress={() =>
                setSportIds((current) =>
                  current.includes(sport.id)
                    ? current.filter((id) => id !== sport.id)
                    : [...current, sport.id],
                )
              }
            />
          ))}
        </View>
      </View>

      {validationError && <AppText tone="alert">{validationError}</AppText>}
      {updateAccount.isError && (
        <AppText tone="alert">
          {userMessage(updateAccount.error, 'Could not save your profile. Try again.')}
        </AppText>
      )}
      {updateAccount.isSuccess && !onSaved && (
        <AppText variant="caption" tone="live">
          Profile saved.
        </AppText>
      )}
      <Button
        label={submitLabel}
        icon="content-save-outline"
        onPress={save}
        loading={updateAccount.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
