import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '../../components/screen';
import { AppText, Button, Tag } from '../../components/ui/primitives';
import type { TagTone } from '../../components/ui/primitives';
import { EmptyState, LoadError, Skeleton } from '../../components/ui/activity';
import { loadPhase } from '../../lib/load-phase';
import { useSession } from '../../providers/auth-context';
import { space, usePalette } from '../../theme';
import { useOwnVenueSubmissions } from './api';

const STATUS: Record<string, { label: string; tone: TagTone }> = {
  pending: { label: 'Under review', tone: 'soon' },
  possible_duplicate: { label: 'Under review', tone: 'soon' },
  approved: { label: 'Approved', tone: 'neutral' },
  merged: { label: 'Linked to an existing venue', tone: 'neutral' },
  rejected: { label: 'Not approved', tone: 'neutral' },
};

export function SubmissionsScreen() {
  const colors = usePalette();
  const router = useRouter();
  const { session, isLoading } = useSession();
  const submissions = useOwnVenueSubmissions(session?.user.id);
  const items = submissions.data?.pages.flat() ?? [];
  const phase = loadPhase(submissions);
  return (
    <Screen insetTop={false}>
      <AppText tone="muted">
        Follow the places you’ve suggested and see the reviewer’s decision.
      </AppText>
      {(isLoading || (session && phase === 'loading')) && <Skeleton height={160} />}
      {!isLoading && !session && (
        <EmptyState
          title="Keep track of your venues"
          body="Sign in to see the places you’ve submitted."
          action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />}
        />
      )}
      {session && (
        <>
          {phase === 'failed' && (
            <LoadError
              title="Could not load your submissions"
              onRetry={() => void submissions.refetch()}
              retrying={submissions.isFetching}
            />
          )}
          {phase === 'ready' && !items.length && (
            <EmptyState
              title="Know a great place to play?"
              body="Suggest a venue and its review status will appear here."
            />
          )}
          {items.map((item) => (
            <View
              key={item.id}
              style={{
                gap: space.xs,
                paddingVertical: space.lg,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Tag label={STATUS[item.status]!.label} tone={STATUS[item.status]!.tone} />
              <AppText variant="heading">{item.proposed_name}</AppText>
              <AppText variant="caption" tone="muted">
                Submitted {new Date(item.created_at).toLocaleDateString()}
                {item.status === 'pending' || item.status === 'possible_duplicate'
                  ? ' · Private until approved'
                  : ''}
              </AppText>
              {!!item.review_note && <AppText>{item.review_note}</AppText>}
              {!!item.published_venue_id && (
                <Button
                  label={`View venue: ${item.proposed_name}`}
                  variant="ghost"
                  size="sm"
                  style={{ alignSelf: 'flex-start' }}
                  onPress={() => router.push(`/venue/${item.published_venue_id}`)}
                />
              )}
            </View>
          ))}
          {submissions.hasNextPage && (
            <Button
              label="Load more submissions"
              loading={submissions.isFetchingNextPage}
              onPress={() => void submissions.fetchNextPage()}
            />
          )}
          <Button
            label="Suggest a venue"
            icon="map-marker-plus-outline"
            onPress={() => router.push('/venue-submission/new')}
          />
        </>
      )}
    </Screen>
  );
}
