import { type ClientReply, readSpaceInProgress } from '@wbs/contracts';
import { useCallback, useEffect, useState } from 'react';

import { browserClient, failureMessage, unreachable } from '@/lib/http';

import { spaceRefusal } from './space-access';
import { useSpacesPolling } from './use-spaces-polling';

const client = browserClient([readSpaceInProgress]);

type InProgress = Extract<ClientReply<typeof readSpaceInProgress>, { kind: 'success' }>['body'];
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; answer: InProgress };

/**
 * "In progress now" across a space: the leaves whose status reads in
 * progress, soonest end first. Refreshes with the page's own cadence. Says
 * when the list was cut, and which projects' schedules could not be read.
 */
export function InProgressList({
  spaceId,
  projectNames,
}: {
  spaceId: string;
  /** Names for the projects `unavailable` lists, from the rows already read. */
  projectNames: ReadonlyMap<string, string>;
}): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [fault, setFault] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    const reply = await client['getApiSpacesByIdIn-progress']({
      params: { id: spaceId },
      query: {},
    });
    switch (reply.kind) {
      case 'success':
        setView({ kind: 'ready', answer: reply.body });
        return;
      case 'failure':
        setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      case 'refusal':
        setView({ kind: 'failure', message: spaceRefusal(reply.body.error).text });
        return;
      default:
        return unreachable(reply);
    }
  }, [spaceId]);

  const refreshSafely = useCallback(
    () =>
      refresh().catch((cause: unknown) => {
        setFault(new Error('Unexpected in-progress read failure', { cause }));
      }),
    [refresh],
  );

  useEffect(() => {
    void refreshSafely();
  }, [refreshSafely]);
  useSpacesPolling(refreshSafely);

  if (fault !== null) throw fault;

  return (
    <section aria-labelledby="in-progress-heading" className="mt-8">
      <h2 id="in-progress-heading" className="mb-2 text-xl font-semibold">
        In progress now
      </h2>
      {view.kind === 'loading' && <p>Loading work in progress…</p>}
      {view.kind === 'failure' && <p role="alert">{view.message}</p>}
      {view.kind === 'ready' && view.answer.items.length === 0 && (
        <p>Nothing is in progress in this space.</p>
      )}
      {view.kind === 'ready' && view.answer.items.length > 0 && (
        <ul aria-label="Work in progress" className="flex flex-col gap-1">
          {view.answer.items.map((item) => (
            <li key={`${item.projectId}/${item.workItemId}`}>
              <span className="text-muted-foreground">{item.projectName}</span> {item.number}{' '}
              {item.name}
              {item.step !== null && <span> · {item.step.name}</span>}
              {item.dates !== null && <span> · ends {item.dates.endsOn}</span>}
              {item.lateBy !== null && <span> · {item.lateBy} days late</span>}
              {item.assignees.length > 0 && (
                <span> · {item.assignees.map(({ name }) => name).join(', ')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {view.kind === 'ready' && view.answer.truncated && (
        <p className="text-muted-foreground text-sm">
          Showing the first {view.answer.items.length}.
        </p>
      )}
      {view.kind === 'ready' && view.answer.unavailable.length > 0 && (
        <p className="text-muted-foreground text-sm">
          Schedule unavailable for{' '}
          {view.answer.unavailable.map((id) => projectNames.get(id) ?? 'a project').join(', ')}.
        </p>
      )}
    </section>
  );
}
