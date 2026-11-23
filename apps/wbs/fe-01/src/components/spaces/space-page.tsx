import { Link } from '@tanstack/react-router';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CONTROL_HEIGHT,
  FIELD_LABEL_CLASS,
  FORM_CLASS,
  SELECT_CLASS,
} from '@ui/saas-01';
import {
  addSpaceProject,
  type ClientReply,
  listProjects,
  moveSpaceProject,
  readSpace,
  readSpaceRollUps,
  removeSpaceProject,
} from '@wbs/contracts';
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppHeader } from '@/components/chrome/app-header';
import { CredentialRefusalState } from '@/components/organization/credential-refusal-state';
import type { AccessLoss } from '@/components/organization/organization-access';
import { OrganizationAccessLoss } from '@/components/organization/organization-access-loss';
import { ScopedSteps } from '@/components/organization/scoped-steps';
import { STATUS_GLYPH, STATUS_LABEL } from '@/components/wbs/status-cell';
import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient, useResourceScope } from '@/runtime/organization-resources';

import { InProgressList, type InProgressState, readInProgress } from './in-progress-list';
import { singleFlight } from './single-flight';
import { type RefusedView, refusedView, spaceRefusal } from './space-access';
import {
  ALERT_CLASS,
  FIELD_CLASS,
  LINK_CLASS,
  MAIN_CLASS,
  NOTE_CLASS,
  STATUS_CLASS,
} from './space-chrome';
import { type SpaceGanttInput, spaceGanttLanesOf } from './space-gantt';
import { SpaceMembers } from './space-members';
import { useSpacesPolling } from './use-spaces-polling';

const CLIENT_SHAPES = [
  readSpace,
  readSpaceRollUps,
  addSpaceProject,
  removeSpaceProject,
  moveSpaceProject,
  listProjects,
] as const;

type SpaceRead = Extract<ClientReply<typeof readSpace>, { kind: 'success' }>['body'];
type ProjectGroup = SpaceRead['projects'][number];
interface Row {
  readonly workPackage: ProjectGroup['workPackages'][number];
}

type ProjectFigures = Extract<
  ClientReply<typeof readSpaceRollUps>,
  { kind: 'success' }
>['body']['projects'][number];
type ProjectEntry = Extract<
  ClientReply<typeof listProjects>,
  { kind: 'success' }
>['body']['projects'][number];
type View = { kind: 'loading' } | RefusedView | { kind: 'ready'; read: SpaceRead };
/** Where the keyboard goes once a write's re-read has drawn. */
type FocusTarget = { kind: 'control'; label: string } | { kind: 'heading' };
/** One row's roll-up as the table shows it while chunks arrive. */
type RollUpState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'changed' }
  | ProjectFigures['rollUp']
  | ProjectFigures['workPackages'][number]['rollUp'];
type ProjectState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'changed' }
  | { kind: 'ready'; value: ProjectFigures };
interface ProjectRowView {
  readonly project: ProjectGroup['project'];
  readonly position: number;
  readonly rollUp: RollUpState;
  readonly workPackages: readonly {
    readonly workPackage: Row['workPackage'];
    readonly rollUp: RollUpState;
  }[];
}

/** Each ready parent and all its children share one captured group; stale groups withhold figures. */
function projectRowsOf(
  projects: readonly ProjectGroup[],
  figures: Readonly<Partial<Record<string, ProjectState>>>,
): ProjectRowView[] {
  return projects.map((group) => {
    const state = figures[group.project.id] ?? { kind: 'loading' as const };
    if (state.kind === 'ready') return state.value;
    return {
      project: group.project,
      position: group.position,
      rollUp: state,
      workPackages:
        state.kind === 'changed'
          ? []
          : group.workPackages.map((workPackage) => ({ workPackage, rollUp: state })),
    };
  });
}

/** Validates the addressed remote group boundary before any figures become visible. */
function checkFigures(groups: readonly ProjectFigures[], requested: readonly string[]): void {
  const expected = new Set(requested),
    projects = new Set<string>(),
    packages = new Set<string>();
  for (const group of groups) {
    if (!expected.has(group.project.id) || projects.has(group.project.id))
      throw new Error('Rollup returned an unexpected project identity');
    projects.add(group.project.id);
    for (const child of group.workPackages) {
      if (child.workPackage.projectId !== group.project.id || packages.has(child.workPackage.id))
        throw new Error('Rollup returned contradictory child membership');
      packages.add(child.workPackage.id);
    }
  }
  if (projects.size !== expected.size) throw new Error('Rollup omitted an addressed project');
}

/** A package moved across chunk epochs invalidates the older whole project, never its arithmetic alone. */
function mergeFigures(
  projects: readonly ProjectGroup[],
  current: Readonly<Partial<Record<string, ProjectState>>>,
  incoming: readonly ProjectFigures[],
): Partial<Record<string, ProjectState>> {
  const next = { ...current },
    updated = new Set(incoming.map((group) => group.project.id));
  for (const group of incoming) {
    for (const child of group.workPackages)
      for (const previous of projects) {
        if (updated.has(previous.project.id)) continue;
        const state = next[previous.project.id];
        const held =
          state?.kind === 'ready'
            ? state.value.workPackages.map((entry) => entry.workPackage)
            : state?.kind === 'changed'
              ? []
              : previous.workPackages;
        if (held.some((entry) => entry.id === child.workPackage.id))
          next[previous.project.id] = { kind: 'changed' };
      }
    next[group.project.id] = { kind: 'ready', value: group };
  }
  return next;
}

/** A space table cell: room around figures and project controls. */
const CELL_CLASS = 'px-3 py-2 align-middle first:pl-6 last:pr-6';

/** A Work packages column heading, quieter than the figures under it. */
const HEAD_CELL_CLASS = `${CELL_CLASS} text-xs font-medium whitespace-nowrap`;

/**
 * The Work package column, held at the left while a phone scrolls the figures
 * under it, with a hairline marking where the scrolled columns slide beneath.
 * A shadow rather than a border: under `border-collapse` a sticky cell's
 * border stays where the column was.
 */
const PINNED_CELL_CLASS = 'bg-card sticky left-0 z-10 max-sm:shadow-[inset_-1px_0_0_var(--border)]';

/** An arrow handle: square, a fingertip on a phone and the chrome's 36px from `sm`. */
const ARROW_CLASS = `${CONTROL_HEIGHT} w-11 px-0 sm:w-9`;

/** How many roll-ups one request asks for, so rows fill in as chunks land (design memo §8). */
export const ROLL_UP_CHUNK = 20;

/**
 * One space, at `/spaces/$spaceId` (`all` included): its projects’ readable work packages in order,
 * each child with its roll-up as it arrives. Permitted managers reorder, remove and
 * add projects, including empty projects; controls appear only when the read says `writable`.
 * People and teams retain scoped directory names and reread after membership writes.
 * Catalogue settings use their own scope write purpose. A work package links to
 * `/?workPackage=<id>`, which opens it on the plan page.
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
  const client = useResourceClient(CLIENT_SHAPES);
  const scope = useResourceScope();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [loss, setLoss] = useState<AccessLoss | null>(null);
  const [projectFigures, setProjectFigures] = useState<
    Readonly<Partial<Record<string, ProjectState>>>
  >({});
  /** "In progress now", kept between reads so a refresh never blanks it. */
  const [inProgress, setInProgress] = useState<InProgressState>({ kind: 'loading' });
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
    async (projects: readonly ProjectGroup[]) => {
      const ids = projects.map((group) => group.project.id);
      // A row keeps the figures it showed until its chunk answers: a poll, a
      // focus or a write redraws no row as loading. Only a new row starts so.
      // Proof, observed 2026-09-29: with every row reset to loading here,
      // `keeps the old figures until the new chunk answers` in
      // `space-page.test.tsx` failed on `expected 'p1Loading…' to contain
      // 'In progress'` while the refresh's chunk was still unanswered.
      setProjectFigures((current) =>
        Object.fromEntries(ids.map((id) => [id, current[id] ?? ({ kind: 'loading' } as const)])),
      );
      for (let at = 0; at < ids.length; at += ROLL_UP_CHUNK) {
        const chunk = ids.slice(at, at + ROLL_UP_CHUNK);
        const reply = await client['getApiSpacesByIdRoll-ups']({
          params: { id: spaceId },
          query: { projectIds: chunk.join(',') },
        });
        if (reply.kind === 'success') {
          checkFigures(reply.body.projects, chunk);
          setProjectFigures((current) => mergeFigures(projects, current, reply.body.projects));
        } else {
          if (reply.kind === 'refusal') {
            const outcome = spaceRefusal(reply.body);
            if (outcome.kind !== 'message') {
              setView(refusedView(outcome));
              return;
            }
          }
          // A chunk that fails marks its own rows and leaves the others; the
          // next poll reads them again.
          setProjectFigures((current) => ({
            ...current,
            ...Object.fromEntries(chunk.map((id) => [id, { kind: 'failed' } as const])),
          }));
        }
      }
    },
    [client, spaceId],
  );

  const refresh = useCallback(async () => {
    const reply = await client.getApiSpacesById({ params: { id: spaceId } });
    switch (reply.kind) {
      case 'success': {
        // Proof: omission failed the precise another-space fault case in scoped-step-settings.test.tsx.
        if (reply.body.space.id !== spaceId) throw new Error('Space read returned another space');
        // Proof: omission failed the precise contradictory-virtual-identity fault case in scoped-step-settings.test.tsx.
        if (reply.body.space.virtual !== (spaceId === 'all'))
          throw new Error('Space read returned contradictory virtual identity');
        setView({ kind: 'ready', read: reply.body });
        if (reply.body.writable) {
          const listed = await client.getApiProjects({});
          // Proof: omission offered an already displayed empty project from a later catalogue epoch (space-groups-fault-empty-members-v2).
          const members = new Set(reply.body.projects.map(({ project }) => project.id));
          // Proof, observed 2026-09-29: with the failure arm ignored (the old
          // candidates kept silently), `says when the workPackages to add could
          // not be read` in `space-page.test.tsx` found no alert.
          if (listed.kind === 'success') {
            setCandidates(
              listed.body.projects.filter(
                (project) =>
                  'organizationId' in project &&
                  project.spaceId === null &&
                  !members.has(project.id),
              ),
            );
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
        // In progress is read with the rows, so a write that adds or removes a
        // work package refreshes both.
        // Proof, observed 2026-09-29: with this read moved to a mount-only
        // effect, `refreshes in progress now after a remove` in
        // `space-page.test.tsx` never found `Nothing is in progress in this
        // space.`: the removed workPackage's leaf stayed listed.
        await Promise.all([
          loadRollUps(reply.body.projects),
          readInProgress(spaceId, scope).then(setInProgress),
        ]);
        return;
      }
      case 'failure':
        setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      case 'refusal': {
        setView(refusedView(spaceRefusal(reply.body)));
        return;
      }
      default:
        return unreachable(reply);
    }
  }, [client, scope, spaceId, loadRollUps]);

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
  // Proof: omitting withdrawal retained the named-space page after catalogue membership loss; scoped-step-settings.test.tsx failed.
  if (loss !== null)
    return (
      <>
        <AppHeader nav={nav} account={account} />
        <main className={MAIN_CLASS}>
          <OrganizationAccessLoss loss={loss} />
        </main>
      </>
    );

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
          const outcome = spaceRefusal(reply.body);
          if (outcome.kind !== 'message') {
            setView(refusedView(outcome));
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

  const projects = view.kind === 'ready' ? projectRowsOf(view.read.projects, projectFigures) : [];
  const rows = projects.flatMap((group) =>
    group.workPackages.map((child) => ({ workPackage: child.workPackage })),
  );
  const rollUps = Object.fromEntries(
    projects.flatMap((group) =>
      group.workPackages.map((child) => [child.workPackage.id, child.rollUp]),
    ),
  );
  const title =
    view.kind === 'ready' ? view.read.space.name : spaceId === 'all' ? 'All projects' : 'Space';
  return (
    <>
      <AppHeader nav={nav} account={account} />
      <main className={MAIN_CLASS}>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:p-8">
          <p className={STATUS_CLASS}>
            <Link to="/spaces" className={LINK_CLASS}>
              All spaces
            </Link>
          </p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-2xl font-semibold [overflow-wrap:anywhere]"
          >
            {title}
          </h1>
          {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading space…</p>}
          {(view.kind === 'failure' || view.kind === 'refused') && (
            <p role="alert" className={view.kind === 'failure' ? ALERT_CLASS : STATUS_CLASS}>
              {view.message}
            </p>
          )}
          {view.kind === 'credential' && <CredentialRefusalState refusal={view.refusal} />}
          {view.kind === 'ready' && (
            <Card className="border-border">
              <CardContent className="flex flex-col gap-4">
                {view.read.projects.length === 0 && (
                  <p className={NOTE_CLASS}>No projects in this space yet.</p>
                )}
                {view.read.projects.length > 0 && (
                  <div className="border-border -mx-6 -mt-6 overflow-x-auto border-b last:-mb-6 last:border-b-0">
                    <table
                      aria-label="Projects and work packages"
                      className="w-full border-collapse text-left text-sm"
                    >
                      <thead className="text-muted-foreground">
                        <tr className="border-border border-b">
                          <th scope="col" className={`${HEAD_CELL_CLASS} ${PINNED_CELL_CLASS}`}>
                            Project / work package
                          </th>
                          <th scope="col" className={HEAD_CELL_CLASS}>
                            Status
                          </th>
                          <th scope="col" className={HEAD_CELL_CLASS}>
                            Start
                          </th>
                          <th scope="col" className={HEAD_CELL_CLASS}>
                            End
                          </th>
                          <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                            Days
                          </th>
                          <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                            Done
                          </th>
                          {view.read.writable && (
                            <th scope="col" className={HEAD_CELL_CLASS}>
                              Arrange
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-border divide-y">
                        {projects.map((group, index) => (
                          <Fragment key={group.project.id}>
                            <ProjectRow
                              group={group}
                              rollUp={group.rollUp}
                              handles={
                                // Proof: omission exposed project controls to the viewer (space-groups-fault-viewer-controls-v2).
                                view.read.writable
                                  ? {
                                      sending,
                                      onUp:
                                        index === 0
                                          ? null
                                          : () => {
                                              focusAfterWrite.current = {
                                                kind: 'control',
                                                label: `Move ${group.project.name} up`,
                                              };
                                              const anchor =
                                                view.read.projects[index - 2]?.project.id ?? null;
                                              void write(
                                                () =>
                                                  client.postApiSpacesByIdProjectsByProjectIdMove({
                                                    params: {
                                                      id: spaceId,
                                                      projectId: group.project.id,
                                                    },
                                                    body: { afterProjectId: anchor },
                                                  }),
                                                `Moved ${group.project.name} up.`,
                                              );
                                            },
                                      onDown:
                                        index === view.read.projects.length - 1
                                          ? null
                                          : () => {
                                              focusAfterWrite.current = {
                                                kind: 'control',
                                                label: `Move ${group.project.name} down`,
                                              };
                                              const anchor =
                                                view.read.projects[index + 1]?.project.id ?? null;
                                              void write(
                                                () =>
                                                  client.postApiSpacesByIdProjectsByProjectIdMove({
                                                    params: {
                                                      id: spaceId,
                                                      projectId: group.project.id,
                                                    },
                                                    body: { afterProjectId: anchor },
                                                  }),
                                                `Moved ${group.project.name} down.`,
                                              );
                                            },
                                      onRemove: () => {
                                        focusAfterWrite.current = { kind: 'heading' };
                                        void write(
                                          () =>
                                            client.deleteApiSpacesByIdProjectsByProjectId({
                                              params: { id: spaceId, projectId: group.project.id },
                                            }),
                                          `Removed ${group.project.name} from this space. Its work packages are unchanged.`,
                                        );
                                      },
                                    }
                                  : null
                              }
                            />
                            {group.workPackages.map((child) => (
                              <WorkPackageRow
                                key={child.workPackage.id}
                                row={{ workPackage: child.workPackage }}
                                rollUp={child.rollUp}
                                arrange={view.read.writable}
                              />
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {view.read.writable && candidatesProblem !== null && (
                  <p role="alert" className={ALERT_CLASS}>
                    {candidatesProblem}
                  </p>
                )}
                {view.read.writable && candidates.length > 0 && (
                  <form
                    className={FORM_CLASS}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const project = candidates.find(({ id }) => id === chosen);
                      if (project === undefined) return;
                      const last = view.read.projects.at(-1)?.project.id ?? null;
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
                    <span className={FIELD_CLASS}>
                      <label htmlFor="add-project" className={FIELD_LABEL_CLASS}>
                        Add a project
                      </label>
                      <select
                        id="add-project"
                        className={`${SELECT_CLASS} w-full min-w-0`}
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
                    </span>
                    <Button
                      type="submit"
                      className={CONTROL_HEIGHT}
                      disabled={sending || chosen === ''}
                    >
                      Add
                    </Button>
                  </form>
                )}
                {message !== '' && (
                  <p role="status" className={STATUS_CLASS}>
                    {message}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {/* Proof: independent navigation-owner, virtual-space and organization-context omissions failed their membership UI cases (space-member-ui-fault-*-v1). */}
          {view.kind === 'ready' &&
            view.read.space.id === spaceId &&
            !view.read.space.virtual &&
            (scope.organization.kind === 'active' ? (
              <>
                <SpaceMembers
                  read={view.read}
                  kind="people"
                  onChanged={reads.fresh}
                  onAccessLost={setLoss}
                />
                <SpaceMembers
                  read={view.read}
                  kind="teams"
                  onChanged={reads.fresh}
                  onAccessLost={setLoss}
                />
              </>
            ) : (
              <p className={NOTE_CLASS}>Choose an organization to see people and teams.</p>
            ))}
          {/* Proof: independent omissions exposed controls on virtual all and inactive space contexts; both owner cases failed in scoped-step-settings.test.tsx. */}
          {view.kind === 'ready' &&
            !view.read.space.virtual &&
            scope.organization.kind === 'active' && (
              <ScopedSteps
                scope={{
                  scopeKind: 'space',
                  scopeId: view.read.space.id,
                  name: view.read.space.name,
                }}
                onChanged={() => {
                  void joinSafely();
                }}
                onAccessLost={setLoss}
              />
            )}
          {view.kind !== 'ready' && message !== '' && (
            <p role="status" className={STATUS_CLASS}>
              {message}
            </p>
          )}
          {view.kind === 'ready' && rows.length > 0 && <SpaceGantt rows={rows} rollUps={rollUps} />}
          {view.kind === 'ready' && (
            <InProgressList
              state={inProgress}
              workPackageNames={
                new Map(rows.map(({ workPackage }) => [workPackage.id, workPackage.name]))
              }
            />
          )}
        </div>
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

/** An actual project, including one with no readable children; controls act only on its identity. */
function ProjectRow({
  group,
  rollUp,
  handles,
}: {
  group: Pick<ProjectGroup, 'project'>;
  rollUp: RollUpState;
  handles: Handles | null;
}): React.JSX.Element {
  return (
    <tr className="bg-muted">
      <th
        scope="row"
        className={`${CELL_CLASS} ${PINNED_CELL_CLASS} font-medium [overflow-wrap:anywhere]`}
      >
        {group.project.name}
      </th>
      <RollUpCells rollUp={rollUp} />
      {handles !== null && <ProjectControls name={group.project.name} handles={handles} />}
    </tr>
  );
}

/** The named project's arrange controls retain keyboard focus across serialized writes and refreshes. */
function ProjectControls({ name, handles }: { name: string; handles: Handles }): React.JSX.Element {
  return (
    <td className={CELL_CLASS}>
      <div className="flex gap-1">
        <Button
          type="button"
          variant="outline"
          className={ARROW_CLASS}
          disabled={handles.sending || handles.onUp === null}
          aria-label={`Move ${name} up`}
          onClick={() => handles.onUp?.()}
        >
          ↑
        </Button>
        <Button
          type="button"
          variant="outline"
          className={ARROW_CLASS}
          disabled={handles.sending || handles.onDown === null}
          aria-label={`Move ${name} down`}
          onClick={() => handles.onDown?.()}
        >
          ↓
        </Button>
        <Button
          type="button"
          variant="outline"
          className={`text-destructive hover:text-destructive ${CONTROL_HEIGHT}`}
          disabled={handles.sending}
          aria-label={`Remove ${name} from this space`}
          onClick={handles.onRemove}
        >
          Remove
        </Button>
      </div>
    </td>
  );
}

/** One readable child keeps its own figures and plan link beneath the parent project. */
function WorkPackageRow({
  row,
  rollUp,
  arrange,
}: {
  row: Row;
  rollUp: RollUpState;
  arrange: boolean;
}): React.JSX.Element {
  const { workPackage } = row;
  return (
    <tr>
      <th
        scope="row"
        className={`${CELL_CLASS} ${PINNED_CELL_CLASS} min-w-36 font-normal sm:min-w-48`}
      >
        <span className="flex flex-wrap items-baseline gap-x-2 pl-4">
          <a href={`/?workPackage=${encodeURIComponent(workPackage.id)}`} className={LINK_CLASS}>
            {workPackage.name}
          </a>
          {workPackage.restricted && (
            <span className="text-muted-foreground text-sm" title="Restricted">
              (restricted)
            </span>
          )}
        </span>
      </th>
      <RollUpCells rollUp={rollUp} />
      {arrange && <td className={CELL_CLASS} />}
    </tr>
  );
}

/** The five roll-up cells: loading, a mark when unavailable, or the figures. */
function RollUpCells({ rollUp }: { rollUp: RollUpState }): React.JSX.Element {
  switch (rollUp.kind) {
    case 'empty':
      return (
        <td colSpan={5} className={`${CELL_CLASS} text-muted-foreground`}>
          No readable work packages
        </td>
      );
    case 'changed':
      return (
        <td colSpan={5} className={`${CELL_CLASS} text-muted-foreground`}>
          Project contents changed. Refresh to update its figures.
        </td>
      );
    case 'loading':
      return (
        <td colSpan={5} className={`${CELL_CLASS} text-muted-foreground`}>
          Loading…
        </td>
      );
    case 'failed':
      return (
        <td colSpan={5} className={`${CELL_CLASS} text-destructive`}>
          Could not load these figures.
        </td>
      );
    case 'unavailable':
      return (
        <td colSpan={5} className={`${CELL_CLASS} text-muted-foreground`}>
          Schedule unavailable
        </td>
      );
    case 'rolled_up':
      return (
        <>
          <td className={`${CELL_CLASS} whitespace-nowrap`}>
            <span aria-hidden="true">{STATUS_GLYPH[rollUp.status]}</span>{' '}
            {STATUS_LABEL[rollUp.status]}
          </td>
          <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums`}>
            {rollUp.dates?.startsOn ?? '—'}
          </td>
          <td className={`${CELL_CLASS} whitespace-nowrap tabular-nums`}>
            {rollUp.dates?.endsOn ?? '—'}
          </td>
          <td className={`${CELL_CLASS} text-right tabular-nums`}>{rollUp.finalTotal}</td>
          <td className={`${CELL_CLASS} text-right whitespace-nowrap tabular-nums`}>
            {rollUp.counts.byStatus.done}/{rollUp.counts.leaves}
          </td>
        </>
      );
    default:
      return unreachable(rollUp);
  }
}

/** What the Gantt draws for one row's roll-up: its dates, or why it has none. */
function scheduleOf(rollUp: RollUpState): SpaceGanttInput['schedule'] {
  switch (rollUp.kind) {
    case 'empty':
    case 'changed':
      return 'undated';
    case 'loading':
      return 'loading';
    case 'failed':
      return 'failed';
    case 'unavailable':
      return 'unavailable';
    case 'rolled_up':
      return rollUp.dates ?? 'undated';
    default:
      return unreachable(rollUp);
  }
}

/**
 * The space's read-only Gantt: one bar per work package over its roll-up's dates,
 * and a blank saying why for a work package undated, loading, unavailable or
 * whose figures failed.
 */
function SpaceGantt({
  rows,
  rollUps,
}: {
  rows: readonly Row[];
  rollUps: Readonly<Record<string, RollUpState>>;
}): React.JSX.Element {
  const lanes = spaceGanttLanesOf(
    rows.map(({ workPackage }) => ({
      workPackageId: workPackage.id,
      name: workPackage.name,
      // A row whose chunk has not landed has no entry yet: it reads as loading.
      schedule: scheduleOf(rollUps[workPackage.id] ?? { kind: 'loading' }),
    })),
  );
  return (
    <section aria-labelledby="space-gantt-heading">
      <Card className="border-border">
        <CardHeader>
          <CardTitle id="space-gantt-heading">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <ul aria-label="Work package timeline" className="m-0 flex list-none flex-col gap-2 p-0">
            {lanes.map((lane) => (
              <li key={lane.workPackageId} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate sm:w-48">{lane.name}</span>
                <span className="bg-muted relative min-h-5 min-w-0 flex-1 rounded-sm">
                  {lane.kind === 'bar' ? (
                    <span
                      role="img"
                      aria-label={lane.label}
                      data-space-gantt-bar
                      className="bg-primary absolute inset-y-0 rounded-sm"
                      style={{ left: `${String(lane.left)}%`, width: `${String(lane.width)}%` }}
                    />
                  ) : (
                    <span className="text-muted-foreground block px-2 py-0.5 text-xs break-words">
                      {lane.label}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
