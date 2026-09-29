import { type ClientReply, readSpaceInProgress } from '@wbs/contracts';

import { browserClient, failureMessage, unreachable } from '@/lib/http';

import { spaceRefusal } from './space-access';

const client = browserClient([readSpaceInProgress]);

type InProgress = Extract<ClientReply<typeof readSpaceInProgress>, { kind: 'success' }>['body'];

/** "In progress now" as the space page holds it between its reads. */
export type InProgressState =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; answer: InProgress };

/**
 * Reads a space's "In progress now" as the list shows it. A refusal or a
 * failure is a rendered state; only an unexpected throw escapes.
 */
export async function readInProgress(spaceId: string): Promise<InProgressState> {
  const reply = await client['getApiSpacesByIdIn-progress']({
    params: { id: spaceId },
    query: {},
  });
  switch (reply.kind) {
    case 'success':
      return { kind: 'ready', answer: reply.body };
    case 'failure':
      return { kind: 'failure', message: failureMessage(reply.failure) };
    case 'refusal':
      return { kind: 'failure', message: spaceRefusal(reply.body.error).text };
    default:
      return unreachable(reply);
  }
}

/**
 * "In progress now" across a space: the leaves whose status reads in
 * progress, soonest end first. The space page reads it with its rows, so a
 * poll, a focus and every write refresh both together. Says when the list
 * was cut, and which projects' schedules could not be read.
 */
export function InProgressList({
  state,
  projectNames,
}: {
  state: InProgressState;
  /** Names for the projects `unavailable` lists, from the rows already read. */
  projectNames: ReadonlyMap<string, string>;
}): React.JSX.Element {
  return (
    <section aria-labelledby="in-progress-heading" className="mt-8">
      <h2 id="in-progress-heading" className="mb-2 text-xl font-semibold">
        In progress now
      </h2>
      {state.kind === 'loading' && <p>Loading work in progress…</p>}
      {state.kind === 'failure' && <p role="alert">{state.message}</p>}
      {state.kind === 'ready' && state.answer.items.length === 0 && (
        <p>Nothing is in progress in this space.</p>
      )}
      {state.kind === 'ready' && state.answer.items.length > 0 && (
        <ul aria-label="Work in progress" className="flex flex-col gap-1">
          {state.answer.items.map((leaf) => (
            <li key={`${leaf.projectId}/${leaf.workItemId}`}>
              <span className="text-muted-foreground">{leaf.projectName}</span> {leaf.number}{' '}
              {leaf.name}
              {leaf.step !== null && <span> · {leaf.step.name}</span>}
              {leaf.dates !== null && <span> · ends {leaf.dates.endsOn}</span>}
              {leaf.lateBy !== null && (
                <span> · {leaf.lateBy === 1 ? '1 day' : `${String(leaf.lateBy)} days`} late</span>
              )}
              {leaf.assignees.length > 0 && (
                <span> · {leaf.assignees.map(({ name }) => name).join(', ')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {state.kind === 'ready' && state.answer.truncated && (
        <p className="text-muted-foreground text-sm">
          Showing the first {state.answer.items.length}.
        </p>
      )}
      {state.kind === 'ready' && state.answer.unavailable.length > 0 && (
        <p className="text-muted-foreground text-sm">
          Schedule unavailable for{' '}
          {state.answer.unavailable.map((id) => projectNames.get(id) ?? 'a project').join(', ')}.
        </p>
      )}
    </section>
  );
}
