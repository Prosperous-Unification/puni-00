import { Link } from '@tanstack/react-router';
import {
  addSpaceProject,
  type ClientReply,
  listProjects,
  moveSpaceProject,
  readSpace,
  readSpaceRollUps,
  removeSpaceProject,
} from '@wbs/contracts';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppHeader } from '@/components/chrome/app-header';
import { STATUS_GLYPH, STATUS_LABEL } from '@/components/wbs/status-cell';
import { browserClient, failureMessage, unreachable } from '@/lib/http';

import { singleFlight } from './single-flight';
import { spaceRefusal } from './space-access';
import { useSpacesPolling } from './use-spaces-polling';

const client = browserClient([
  readSpace,
  readSpaceRollUps,
  addSpaceProject,
  removeSpaceProject,
  moveSpaceProject,
  listProjects,
]);

type SpaceRead = Extract<ClientReply<typeof readSpace>, { kind: 'success' }>['body'];
type Row = SpaceRead['rows'][number];
type RollUp = Extract<
  ClientReply<typeof readSpaceRollUps>,
  { kind: 'success' }
>['body']['rollUps'][string];
type ProjectEntry = Extract<
  ClientReply<typeof listProjects>,
  { kind: 'success' }
>['body']['projects'][number];
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'refused'; message: string }
  | { kind: 'ready'; read: SpaceRead };
/** Where the keyboard goes once a write's re-read has drawn. */
type FocusTarget = { kind: 'control'; label: string } | { kind: 'heading' };
/** One row's roll-up as the table shows it while chunks arrive. */
type RollUpState = { kind: 'loading' } | { kind: 'failed' } | RollUp;

/** How many roll-ups one request asks for, so rows fill in as chunks land (design memo §8). */
export const ROLL_UP_CHUNK = 20;

/**
 * One space, at `/spaces/$spaceId` (`all` included): its projects in order,
 * each with its roll-up as it arrives. Members and above reorder, remove and
 * add projects; the handles appear only when the read says `writable`, so a
 * viewer never sees a control a write would refuse. A project links to
 * `/?project=<id>`, which opens it on the plan page.
 */
export function SpacePage({
  spaceId,
  nav,
  account,
}: {
  spaceId: string;
  nav: ReactNode;
  account: ReactNode;
}): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [rollUps, setRollUps] = useState<Readonly<Record<string, RollUpState>>>({});
  const [candidates, setCandidates] = useState<readonly ProjectEntry[]>([]);
  /** Why the add picker could not be filled, or null when it could. */
  const [candidatesProblem, setCandidatesProblem] = useState<string | null>(null);
  /** Where to give the keyboard back once a write's re-read has drawn; null when no write is pending. */
  const focusAfterWrite = useRef<FocusTarget | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const [chosen, setChosen] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [fault, setFault] = useState<Error | null>(null);

  const loadRollUps = useCallback(
    async (rows: readonly Row[]) => {
      const ids = rows.map(({ project }) => project.id);
      // A row keeps the figures it showed until its chunk answers: a poll, a
      // focus or a write redraws no row as loading. Only a new row starts so.
      // Proof, observed 2026-09-29: with every row reset to loading here,
      // `keeps the old figures until the new chunk answers` in
      // `space-page.test.tsx` failed on `expected 'p1Loading…' to contain
      // 'In progress'` while the refresh's chunk was still unanswered.
      setRollUps((current) =>
        Object.fromEntries(ids.map((id) => [id, current[id] ?? ({ kind: 'loading' } as const)])),
      );
      for (let at = 0; at < ids.length; at += ROLL_UP_CHUNK) {
        const chunk = ids.slice(at, at + ROLL_UP_CHUNK);
        const reply = await client['getApiSpacesByIdRoll-ups']({
          params: { id: spaceId },
          query: { projectIds: chunk.join(',') },
        });
        if (reply.kind === 'success') {
          setRollUps((current) => ({ ...current, ...reply.body.rollUps }));
        } else {
          // A chunk that fails marks its own rows and leaves the others; the
          // next poll reads them again.
          setRollUps((current) => ({
            ...current,
            ...Object.fromEntries(chunk.map((id) => [id, { kind: 'failed' } as const])),
          }));
        }
      }
    },
    [spaceId],
  );

  const refresh = useCallback(async () => {
    const reply = await client.getApiSpacesById({ params: { id: spaceId } });
    switch (reply.kind) {
      case 'success': {
        setView({ kind: 'ready', read: reply.body });
        if (reply.body.writable) {
          const listed = await client.getApiProjects({});
          const members = new Set(reply.body.rows.map(({ project }) => project.id));
          // Proof, observed 2026-09-29: with the failure arm ignored (the old
          // candidates kept silently), `says when the projects to add could
          // not be read` in `space-page.test.tsx` found no alert.
          if (listed.kind === 'success') {
            setCandidates(listed.body.projects.filter(({ id }) => !members.has(id)));
            setCandidatesProblem(null);
          } else {
            setCandidates([]);
            setCandidatesProblem(
              listed.kind === 'failure'
                ? `Your projects could not be read to add one: ${failureMessage(listed.failure)}`
                : 'Your projects could not be read to add one. Reload and try again.',
            );
          }
        }
        await loadRollUps(reply.body.rows);
        return;
      }
      case 'failure':
        setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      case 'refusal': {
        const outcome = spaceRefusal(reply.body.error);
        setView(
          outcome.kind === 'page'
            ? { kind: 'refused', message: outcome.text }
            : { kind: 'failure', message: outcome.text },
        );
        return;
      }
      default:
        return unreachable(reply);
    }
  }, [spaceId, loadRollUps]);

  /** The mount, the polls and every write's re-read share one read in flight. */
  const reads = useMemo(() => singleFlight(refresh), [refresh]);
  const joinSafely = useCallback(
    () =>
      reads.join().catch((cause: unknown) => {
        setFault(new Error('Unexpected space read failure', { cause }));
      }),
    [reads],
  );

  useEffect(() => {
    void joinSafely();
  }, [joinSafely]);
  useSpacesPolling(joinSafely);

  /**
   * Gives the keyboard back after a write's re-read: to the control named, if
   * it is still there and enabled, else to the page heading. A disabled
   * button would otherwise drop focus to the body.
   */
  useEffect(() => {
    const target = focusAfterWrite.current;
    if (sending || target === null) return;
    focusAfterWrite.current = null;
    const control =
      target.kind === 'control'
        ? [...document.querySelectorAll<HTMLButtonElement>('button[aria-label]')].find(
            (button) => button.getAttribute('aria-label') === target.label && !button.disabled,
          )
        : undefined;
    (control ?? heading.current)?.focus();
  }, [sending, view]);

  if (fault !== null) throw fault;

  /** Sends one membership write, says its refusal in place, and re-reads the space. */
  async function write(
    send: () => Promise<
      | ClientReply<typeof addSpaceProject>
      | ClientReply<typeof removeSpaceProject>
      | ClientReply<typeof moveSpaceProject>
    >,
    done: string,
  ) {
    setSending(true);
    setMessage('');
    try {
      const reply = await send();
      switch (reply.kind) {
        case 'success':
          setMessage(done);
          break;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          break;
        case 'refusal': {
          const outcome = spaceRefusal(reply.body.error);
          if (outcome.kind === 'page') {
            setView({ kind: 'refused', message: outcome.text });
            return;
          }
          setMessage(outcome.text);
          break;
        }
        default:
          unreachable(reply);
      }
      await reads.fresh();
    } catch (cause) {
      setFault(new Error('Unexpected space write failure', { cause }));
    } finally {
      setSending(false);
    }
  }

  const title =
    view.kind === 'ready' ? view.read.space.name : spaceId === 'all' ? 'All projects' : 'Space';
  return (
    <>
      <AppHeader nav={nav} account={account} />
      <main className="bg-background text-foreground mx-auto w-full max-w-5xl p-8 font-sans">
        <p className="mb-2">
          <Link to="/spaces">All spaces</Link>
        </p>
        <h1 ref={heading} tabIndex={-1} className="mb-6 text-2xl font-semibold">
          {title}
        </h1>
        {view.kind === 'loading' && <p>Loading space…</p>}
        {(view.kind === 'failure' || view.kind === 'refused') && <p role="alert">{view.message}</p>}
        {view.kind === 'ready' && view.read.rows.length === 0 && (
          <p>No projects in this space yet.</p>
        )}
        {view.kind === 'ready' && view.read.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table aria-label="Projects" className="w-full text-left">
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Status</th>
                  <th scope="col">Start</th>
                  <th scope="col">End</th>
                  <th scope="col">Days</th>
                  <th scope="col">Done</th>
                  {view.read.writable && <th scope="col">Arrange</th>}
                </tr>
              </thead>
              <tbody>
                {view.read.rows.map((row, index) => (
                  <ProjectRow
                    key={row.project.id}
                    row={row}
                    rollUp={rollUps[row.project.id] ?? { kind: 'loading' }}
                    handles={
                      view.read.writable
                        ? {
                            sending,
                            // Up: after the row two above, or first.
                            onUp:
                              index === 0
                                ? null
                                : () => {
                                    focusAfterWrite.current = {
                                      kind: 'control',
                                      label: `Move ${row.project.name} up`,
                                    };
                                    const anchor = view.read.rows[index - 2]?.project.id ?? null;
                                    void write(
                                      () =>
                                        client.postApiSpacesByIdProjectsByProjectIdMove({
                                          params: { id: spaceId, projectId: row.project.id },
                                          body: { afterProjectId: anchor },
                                        }),
                                      `Moved ${row.project.name} up.`,
                                    );
                                  },
                            onDown:
                              index === view.read.rows.length - 1
                                ? null
                                : () => {
                                    focusAfterWrite.current = {
                                      kind: 'control',
                                      label: `Move ${row.project.name} down`,
                                    };
                                    const anchor = view.read.rows[index + 1]?.project.id ?? null;
                                    void write(
                                      () =>
                                        client.postApiSpacesByIdProjectsByProjectIdMove({
                                          params: { id: spaceId, projectId: row.project.id },
                                          body: { afterProjectId: anchor },
                                        }),
                                      `Moved ${row.project.name} down.`,
                                    );
                                  },
                            onRemove: () => {
                              // The row is gone after the re-read: the heading.
                              focusAfterWrite.current = { kind: 'heading' };
                              void write(
                                () =>
                                  client.deleteApiSpacesByIdProjectsByProjectId({
                                    params: { id: spaceId, projectId: row.project.id },
                                  }),
                                `Removed ${row.project.name} from this space. The project is unchanged.`,
                              );
                            },
                          }
                        : null
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view.kind === 'ready' && view.read.writable && candidatesProblem !== null && (
          <p role="alert" className="mt-6">
            {candidatesProblem}
          </p>
        )}
        {view.kind === 'ready' && view.read.writable && candidates.length > 0 && (
          <form
            className="mt-6 flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const project = candidates.find(({ id }) => id === chosen);
              if (project === undefined) return;
              const last = view.read.rows.at(-1)?.project.id ?? null;
              setChosen('');
              void write(
                () =>
                  client.postApiSpacesByIdProjects({
                    params: { id: spaceId },
                    body: { projectId: project.id, afterProjectId: last },
                  }),
                `Added ${project.name}.`,
              );
            }}
          >
            <label htmlFor="add-project">Add a project</label>
            <select
              id="add-project"
              className="border p-2"
              value={chosen}
              onChange={(event) => {
                setChosen(event.target.value);
              }}
            >
              <option value="">Choose a project</option>
              {candidates.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={sending || chosen === ''}>
              Add
            </button>
          </form>
        )}
        {message !== '' && <p role="status">{message}</p>}
      </main>
    </>
  );
}

interface Handles {
  sending: boolean;
  onUp: (() => void) | null;
  onDown: (() => void) | null;
  onRemove: () => void;
}

/** One project's row; `handles` is null for a reader who may not arrange the space. */
function ProjectRow({
  row,
  rollUp,
  handles,
}: {
  row: Row;
  rollUp: RollUpState;
  handles: Handles | null;
}): React.JSX.Element {
  const { project } = row;
  return (
    <tr>
      <th scope="row">
        <a href={`/?project=${encodeURIComponent(project.id)}`}>{project.name}</a>
        {project.restricted && (
          <span className="text-muted-foreground ml-2 text-sm" title="Restricted">
            (restricted)
          </span>
        )}
      </th>
      <RollUpCells rollUp={rollUp} />
      {handles !== null && (
        <td>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={handles.sending || handles.onUp === null}
              aria-label={`Move ${project.name} up`}
              onClick={() => handles.onUp?.()}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={handles.sending || handles.onDown === null}
              aria-label={`Move ${project.name} down`}
              onClick={() => handles.onDown?.()}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={handles.sending}
              aria-label={`Remove ${project.name} from this space`}
              onClick={handles.onRemove}
            >
              Remove
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

/** The five roll-up cells: loading, a mark when unavailable, or the figures. */
function RollUpCells({ rollUp }: { rollUp: RollUpState }): React.JSX.Element {
  switch (rollUp.kind) {
    case 'loading':
      return <td colSpan={5}>Loading…</td>;
    case 'failed':
      return <td colSpan={5}>Could not load this project’s figures.</td>;
    case 'unavailable':
      return <td colSpan={5}>Schedule unavailable</td>;
    case 'rolled_up':
      return (
        <>
          <td>
            <span aria-hidden="true">{STATUS_GLYPH[rollUp.status]}</span>{' '}
            {STATUS_LABEL[rollUp.status]}
          </td>
          <td>{rollUp.dates?.startsOn ?? '—'}</td>
          <td>{rollUp.dates?.endsOn ?? '—'}</td>
          <td>{rollUp.finalTotal}</td>
          <td>
            {rollUp.counts.byStatus.done}/{rollUp.counts.leaves}
          </td>
        </>
      );
    default:
      return unreachable(rollUp);
  }
}
