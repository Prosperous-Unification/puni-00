import { type ClientReply, readSpaceInProgress } from '@wbs/contracts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { browserClient, failureMessage, unreachable } from '@/lib/http';

import { spaceRefusal } from './space-access';
import { ALERT_CLASS, LIST_CLASS, NOTE_CLASS, STATUS_CLASS } from './space-chrome';

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
    <section aria-labelledby="in-progress-heading">
      <Card className="border-border">
        <CardHeader>
          <CardTitle id="in-progress-heading">In progress now</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          {state.kind === 'loading' && <p className={STATUS_CLASS}>Loading work in progress…</p>}
          {state.kind === 'failure' && (
            <p role="alert" className={ALERT_CLASS}>
              {state.message}
            </p>
          )}
          {state.kind === 'ready' && state.answer.items.length === 0 && (
            <p className={NOTE_CLASS}>Nothing is in progress in this space.</p>
          )}
          {state.kind === 'ready' && state.answer.items.length > 0 && (
            <ul aria-label="Work in progress" className={`${LIST_CLASS} -my-2 text-sm`}>
              {state.answer.items.map((leaf) => (
                <li
                  key={`${leaf.projectId}/${leaf.workItemId}`}
                  className="py-2 [overflow-wrap:anywhere]"
                >
                  <span className="text-muted-foreground">{leaf.projectName}</span>{' '}
                  <span className="tabular-nums">{leaf.number}</span>{' '}
                  <span className="font-medium">{leaf.name}</span>
                  {leaf.step !== null && <span> · {leaf.step.name}</span>}
                  {leaf.dates !== null && <span> · ends {leaf.dates.endsOn}</span>}
                  {leaf.lateBy !== null && (
                    <span className="text-destructive">
                      {' '}
                      · {leaf.lateBy === 1 ? '1 day' : `${String(leaf.lateBy)} days`} late
                    </span>
                  )}
                  {leaf.assignees.length > 0 && (
                    <span> · {leaf.assignees.map(({ name }) => name).join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {state.kind === 'ready' && state.answer.truncated && (
            <p className={NOTE_CLASS}>Showing the first {state.answer.items.length}.</p>
          )}
          {state.kind === 'ready' && state.answer.unavailable.length > 0 && (
            <p className={NOTE_CLASS}>
              Schedule unavailable for{' '}
              {state.answer.unavailable.map((id) => projectNames.get(id) ?? 'a project').join(', ')}
              .
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
