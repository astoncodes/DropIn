import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { readDevicePosition } from '../location/read-device-position';
import { useRef, useState } from 'react';
import { Image, Linking, Platform, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { AppText, Button } from '../../components/ui/primitives';
import { Notice } from '../../components/ui/notice';
import { TextField } from '../../components/ui/text-field';
import { radius, space } from '../../theme';
import { checkSessionPhotoLocation, usePublishSessionPost } from './api';
import type { PhotoLocation } from './api';
import { UserFacingError, userMessage } from '@dropin/shared';

function ClipPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} style={{ height: 220, width: '100%' }} nativeControls />;
}

export function SessionPhotoComposer({
  sessionId,
  userId,
  onPublished,
}: {
  sessionId: string;
  userId: string;
  onPublished: () => void;
}) {
  const publish = usePublishSessionPost(sessionId, userId);
  const [verified, setVerified] = useState(false);
  const verifiedAt = useRef(0);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setSettings(false);
    try {
      await action();
    } catch (cause) {
      setError(userMessage(cause, 'Could not share your photo. Please try again.'));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function verifyLocation(): Promise<PhotoLocation> {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setSettings(!permission.canAskAgain);
      throw new UserFacingError(
        'Allow location access to confirm you are within 500 metres of this session.',
      );
    }
    const position = await readDevicePosition();
    if (position.mocked)
      throw new UserFacingError('Turn off simulated location to share session photos.');
    if (position.coords.accuracy === null)
      throw new UserFacingError(
        'Could not confirm location accuracy. Enable precise location and try again.',
      );
    const location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      observedAt: new Date(position.timestamp).toISOString(),
    };
    await checkSessionPhotoLocation(sessionId, location);
    return location;
  }

  async function choose(camera: boolean) {
    if (Date.now() - verifiedAt.current > 120000) {
      setVerified(false);
      throw new UserFacingError(
        'Check your location again before opening the camera or choosing a photo.',
      );
    }
    // A separate button preserves the browser's user gesture after the GPS check.
    if (camera && Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setSettings(!permission.canAskAgain);
        throw new UserFacingError('Allow camera access to take a session photo.');
      }
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          allowsEditing: true,
          videoMaxDuration: 30,
          quality: 0.85,
        });
    if (result.canceled) return;
    const selected = result.assets[0];
    if (!selected) return;
    if ((selected.fileSize ?? 0) > 25 * 1024 * 1024)
      throw new UserFacingError('Choose a photo or clip smaller than 25 MB.');
    if (selected.type === 'video' && (!selected.duration || selected.duration > 30000))
      throw new UserFacingError('Choose a clip up to 30 seconds long.');
    setAsset(selected);
  }

  async function post() {
    if (!asset) return;
    // Refresh GPS at publication; a previous camera check cannot authorize a later upload.
    const location = await verifyLocation();
    const kind = asset.type === 'video' ? 'video' : 'image';
    await publish.mutateAsync({
      caption,
      location,
      asset: {
        uri: asset.uri,
        kind,
        mimeType: asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
        width: asset.width,
        height: asset.height,
        durationSeconds: kind === 'video' ? (asset.duration ?? 0) / 1000 : undefined,
      },
    });
    setAsset(null);
    setCaption('');
    setVerified(false);
    onPublished();
  }

  return (
    <View style={{ flex: 1, gap: space.sm }}>
      <AppText variant="heading">Share from this session</AppText>
      <AppText variant="caption" tone="muted">
        Join the session and be within 500 metres of its meeting spot. We check your location before
        you post. Photos and captions are visible to signed-in players.
      </AppText>
      {!verified ? (
        <Button
          label={busy ? 'Checking location…' : 'Check location to share'}
          icon="crosshairs-gps"
          loading={busy}
          onPress={() =>
            void run(async () => {
              await verifyLocation();
              verifiedAt.current = Date.now();
              setVerified(true);
            })
          }
        />
      ) : (
        <>
          {asset ? (
            <>
              {asset.type === 'video' ? (
                <ClipPreview uri={asset.uri} />
              ) : (
                <Image
                  source={{ uri: asset.uri }}
                  accessibilityLabel="Photo preview"
                  style={{ width: '100%', height: 220, borderRadius: radius.md }}
                  resizeMode="contain"
                />
              )}
              <TextField
                label="Caption (optional)"
                accessibilityLabel="Photo caption"
                value={caption}
                onChangeText={setCaption}
                maxLength={500}
                showCount
                multiline
                editable={!busy}
                placeholder="What happened on court?"
              />
              <Button
                label="Post to session feed"
                icon="send"
                loading={busy}
                onPress={() => void run(post)}
              />
              <Button
                label="Discard photo"
                tone="neutral"
                variant="soft"
                disabled={busy}
                onPress={() => {
                  setAsset(null);
                  setCaption('');
                  setError('');
                }}
              />
            </>
          ) : (
            <>
              <Button
                label="Take a photo"
                icon="camera"
                disabled={busy}
                onPress={() => void run(() => choose(true))}
              />
              <Button
                label="Choose photo or clip"
                icon="image-plus"
                tone="neutral"
                variant="soft"
                disabled={busy}
                onPress={() => void run(() => choose(false))}
              />
              <Button
                label="Cancel"
                tone="neutral"
                variant="soft"
                disabled={busy}
                onPress={() => {
                  setVerified(false);
                  setError('');
                }}
              />
            </>
          )}
        </>
      )}
      {error ? <Notice tone="error" message={error} /> : null}
      {settings &&
        (Platform.OS === 'web' ? (
          <AppText variant="caption">
            Allow camera and location in your browser’s site settings, then retry.
          </AppText>
        ) : (
          <Button
            label="Open settings"
            tone="neutral"
            onPress={() => void Linking.openSettings()}
          />
        ))}
    </View>
  );
}
