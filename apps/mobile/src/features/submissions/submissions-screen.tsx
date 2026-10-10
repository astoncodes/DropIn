import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '../../components/screen';
import { AppText, Button } from '../../components/ui/primitives';
import { EmptyState, LoadError, Skeleton } from '../../components/ui/activity';
import { loadPhase } from '../../lib/load-phase';
import { useSession } from '../../providers/auth-context';
import { radius, space, usePalette } from '../../theme';
import { useOwnVenueSubmissions } from './api';

const statusLabels = {
  pending: 'Under review',
  possible_duplicate: 'Under review',
  approved: 'Approved',
  merged: 'Linked to an existing venue',
  rejected: 'Not approved',
} as const;

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
          icon="map-marker-outline"
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
              icon="map-marker-plus-outline"
              title="Know a great place to play?"
              body="Suggest a venue and its review status will appear here."
            />
          )}
          {items.map((item) => (
            <View
              key={item.id}
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: radius.xl,
                padding: space.lg,
                gap: space.sm,
              }}
            >
              <AppText variant="heading">{item.proposed_name}</AppText>
              <AppText
                variant="bodyStrong"
                tone={item.status === 'approved' || item.status === 'merged' ? 'live' : 'muted'}
              >
                {statusLabels[item.status]}
              </AppText>
              <AppText variant="caption" tone="muted">
                Submitted {new Date(item.created_at).toLocaleDateString()}
              </AppText>
              {!!item.review_note && <AppText>{item.review_note}</AppText>}
              {item.status === 'pending' || item.status === 'possible_duplicate' ? (
                <AppText variant="caption" tone="muted">
                  Your submission is private until approved.
                </AppText>
              ) : null}
              {!!item.published_venue_id && (
                <Button
                  label={`View venue: ${item.proposed_name}`}
                  variant="outline"
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
