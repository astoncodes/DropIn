import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Keyboard, TextInput, View } from 'react-native';

import { AppText, Button } from '../../components/ui/primitives';
import { radius, space, usePalette } from '../../theme';
import { searchPlaces } from './geoapify';
import type { GeocodingResult } from './geoapify';
import { userMessage } from '../../lib/errors';

export function PlaceSearch({ onSelect }: { onSelect: (place: GeocodingResult) => void }) {
  const colors = usePalette();
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const results = useQuery({
    queryKey: ['session-place-search', submitted],
    queryFn: ({ signal }) => searchPlaces(submitted, signal),
    enabled: submitted.length >= 3,
    staleTime: 300000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const visible = submitted.length >= 3 && text.trim() === submitted;
  function search() {
    if (text.trim().length < 3) return;
    Keyboard.dismiss();
    if (submitted === text.trim()) void results.refetch();
    else setSubmitted(text.trim());
  }
  return (
    <View style={{ gap: space.sm }}>
      <AppText>Search for a location</AppText>
      <TextInput
        value={text}
        onChangeText={(value) => {
          setText(value);
          setSubmitted('');
        }}
        accessibilityLabel="Search session location"
        placeholder="Park, address or place in Canada"
        placeholderTextColor={colors.textFaint}
        autoCorrect={false}
        maxLength={160}
        returnKeyType="search"
        onSubmitEditing={search}
        style={{
          color: colors.text,
          backgroundColor: colors.surface,
          padding: space.md,
          borderRadius: radius.md,
        }}
      />
      <Button
        label="Search locations"
        icon="magnify"
        tone="neutral"
        variant="soft"
        disabled={text.trim().length < 3}
        loading={visible && results.isFetching}
        onPress={search}
      />
      {visible && results.isError && (
        <View accessibilityRole="alert">
          <AppText tone="alert">
            {userMessage(results.error, 'Place search is unavailable right now.')}
          </AppText>
          <AppText variant="caption">Try searching again, or choose a spot on the map.</AppText>
        </View>
      )}
      {visible && results.isSuccess && !results.isFetching && results.data.length === 0 && (
        <AppText>No locations found. Try adding a city or street name.</AppText>
      )}
      {visible &&
        results.data?.map((place) => (
          <Button
            key={place.id}
            label={place.label}
            icon="map-marker-outline"
            tone="neutral"
            variant="outline"
            onPress={() => {
              Keyboard.dismiss();
              onSelect(place);
              setSubmitted('');
              setText('');
            }}
          />
        ))}
    </View>
  );
}
