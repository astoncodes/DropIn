import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Keyboard, View } from 'react-native';

import { ListRow, ListSection } from '../../components/ui/list-row';
import { Notice } from '../../components/ui/notice';
import { AppText, Button } from '../../components/ui/primitives';
import { TextField } from '../../components/ui/text-field';
import { loadPhase } from '../../lib/load-phase';
import { supabase } from '../../lib/supabase';
import { space } from '../../theme';

/**
 * Picks an existing venue for a session. The list opens with active venues in
 * published regions and narrows only when the player submits a name, as place
 * search does, so typing does not send a request per keystroke.
 */
export function VenueSearch({ onSelect }: { onSelect: (venueId: string) => void }) {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState('');
  const options = useQuery({
    queryKey: ['session-venues', submitted],
    queryFn: async () => {
      let query = supabase
        .from('venues')
        .select('id,name,address_text,regions!inner(is_published)')
        .eq('status', 'active')
        .eq('regions.is_published', true)
        .order('name')
        .limit(50);
      if (submitted) query = query.ilike('name', `%${submitted}%`);
      const result = await query;
      if (result.error) throw result.error;
      return result.data;
    },
  });
  const phase = loadPhase(options);
  const searchable = text.trim() !== submitted;
  function search() {
    if (!searchable) return;
    Keyboard.dismiss();
    setSubmitted(text.trim());
  }
  return (
    <View style={{ gap: space.sm }}>
      <TextField
        label="Search venues"
        value={text}
        onChangeText={setText}
        placeholder="Court, gym or park name"
        autoCorrect={false}
        maxLength={160}
        returnKeyType="search"
        onSubmitEditing={search}
      />
      <Button
        label="Search venues"
        icon="magnify"
        tone="neutral"
        variant="soft"
        disabled={!searchable}
        loading={options.isFetching}
        onPress={search}
      />
      {phase === 'loading' ? (
        <AppText tone="muted">Loading venues…</AppText>
      ) : phase === 'failed' ? (
        <Notice
          tone="error"
          message="Could not load venues. Check your connection and try again."
          action={
            <Button
              label="Try again"
              size="sm"
              variant="outline"
              loading={options.isFetching}
              onPress={() => void options.refetch()}
            />
          }
        />
      ) : options.data?.length ? (
        <ListSection>
          {options.data.map((place) => (
            <ListRow
              key={place.id}
              title={place.name}
              subtitle={place.address_text ?? undefined}
              onPress={() => onSelect(place.id)}
            />
          ))}
        </ListSection>
      ) : (
        <AppText tone="muted">
          {submitted
            ? 'No venue matches that name.'
            : 'No venues are listed yet. Drop a pin to meet anywhere.'}
        </AppText>
      )}
    </View>
  );
}
