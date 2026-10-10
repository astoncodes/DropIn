import { Notice } from '../../components/ui/notice';
import { Button } from '../../components/ui/primitives';
import { loadPhase } from '../../lib/load-phase';
import type { useSports } from './api';

/**
 * Explains an empty sport picker. Without it a form whose sports could not be
 * loaded shows a heading with nothing under it and a submit button that never
 * enables. Renders nothing unless the list has failed to load.
 */
export function SportsUnavailableNotice({ sports }: { sports: ReturnType<typeof useSports> }) {
  if (loadPhase(sports) !== 'failed') return null;
  return (
    <Notice
      tone="error"
      message="Could not load the sports list. Check your connection and try again."
      action={
        <Button
          label="Try again"
          size="sm"
          tone="neutral"
          variant="soft"
          loading={sports.isFetching}
          onPress={() => void sports.refetch()}
        />
      }
    />
  );
}
