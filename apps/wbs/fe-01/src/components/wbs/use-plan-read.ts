import type { DependencyReach } from '@wbs/domain/dependency-reach';
import type * as React from 'react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { ALL_RESOURCES, type DirectoryRead, type RefreshResource } from '@/lib/plan-refresh';
import type { ProjectStream } from '@/lib/project-stream';
import type { AssignedPersonView } from '@/lib/wbs-api';
import {
  DEFAULT_PERT_WEIGHTS_VIEW,
  type EstimateMethod,
  type EstimateRoundingView,
  type PertWeightsView,
  type PlanOptimizationView,
  type ProjectApi,
  type SliceView,
  type StepView,
} from '@/lib/wbs-api';
import { calendarMarkersForReader } from '@/modules/calendar-markers/composition';
import type { CalendarMarkerRefusal } from '@/modules/calendar-markers/contract';
import { type Channel, createChannel } from '@/modules/channel';
import { planFeedForReader } from '@/modules/plan-feed/composition';
import type { PlanFeed, PlanFeedRefusal } from '@/modules/plan-feed/contract';
import {
  createDeliveredPlan,
  type DeliveredPlan,
  type DeliveredPlanStore,
} from '@/modules/plan-feed/delivered-plan-store';
import { type BusyWrites, createBusy } from '@/modules/plan-writer/busy-store';
import type { PlanWriteRefusal } from '@/modules/plan-writer/contract';
import { createPlanWriter } from '@/modules/plan-writer/plan-writer.feature';

import { type CellCards } from './cell-card-store';
import type { FocusIntent } from './live-editing';
import { forgetRefusedDrafts } from './live-editing';
import { NOTHING_TO_REDO, NOTHING_TO_UNDO, refusalSentence } from './plan-refusal';
import { type Toast, type ToastStackApi } from './toasts';
import { useChannelListener } from './use-channel-listener';
import { dropDrafts, rowOfCellKey, stepOfCellKey, stepOfDraftKey } from './use-estimate-drafts';
import type { PlanImportControl } from './use-plan-import';
import { useSnapshotChanges } from './use-snapshot-changes';
import { toTree, type TreeRow } from './wbs-rows';

export interface WbsTableProps {
  projectId: string;
  api: ProjectApi;
  /** Page-owned archival import lifecycle; absent in isolated table tests. */
  planImport?: PlanImportControl;
  /** Page-owned production toast lifetime; absent in isolated table tests. */
  toastApi?: ToastStackApi;
  /**
   * What this project is called, for the export's header and its filename.
   *
   * Optional for the reason `subscribe` is: the table is driven by a fake in
   * tests and the picker that holds the name is not on screen there. Supplied
   * in the app — see {@link UNNAMED_PROJECT} for what an export says without it.
   */
  projectName?: string;
  /**
   * Opens a live subscription. Optional so the table can be tested without a
   * socket; supplied in the app.
   */
  subscribe?: (
    projectId: string,
    handlers: SubscriptionHandlers,
    baseline: number,
  ) => ProjectStream;
  /**
   * The saved-plan shelf, for the phone's `Plan actions` sheet — and rendered
   * **only** there, in the `cards` arm below.
   *
   * A `ReactNode` the page hands down rather than a component this file builds:
   * the shelf needs the checkpoint routes and the project the picker has open,
   * and both live in `ProjectPage`. Threading them here would give the table
   * two more props it never reads.
   *
   * Optional because the table is driven by a fake in tests and mounted on its
   * own in several of them. Absent, the sheet is exactly what it was.
   */
  savedPlansShelf?: ReactNode;
}

export interface SubscriptionHandlers {
  /** See `ProjectStreamOptions.onChange`: what the frame said changed, or `null`. */
  onChange: (changed?: string | null, seq?: number) => void;
  onConnectionChange: (connected: boolean) => void;
}

/**
 * How much of the plan a read has to fetch.
 *
 * The coordinator owns tree, steps, grouped directory and calendar markers.
 * These scopes adapt existing plan mutation callers to resource obligations;
 * marker mutations invalidate their separate resource directly.
 *
 * `'all'` is the default and the answer to anything this side does not
 * recognise. The two narrower scopes are claims about be-01's events, and each
 * is only sound because of something be-01 guarantees:
 *
 * - `'tree'` skips the vocabularies because a plan batch that mints a person or
 *   a tag holds the directory service's own announcement and sends it after the
 *   commit (`plan-commands.ts`: `announcements.hold` then `send(pending)`), so
 *   the directory change announces itself and is not folded silently into a
 *   `tree_replaced`.
 * - `'tree-and-steps'` adds the steps because that is what the three step
 *   events change, as `ProjectEvent`'s own JSDoc says.
 *
 * `directory_changed` and the capacity events are deliberately **not** narrowed:
 * a removed team takes its assignments and labels out of the tree with it, so
 * they are full reads.
 */
export type PlanReadScope = 'all' | 'tree' | 'tree-and-steps';

/**
 * One read of the tree, as far as the chart is concerned: the slices, the steps
 * they were placed under, and the names of everybody on them.
 *
 * All three arrive on the same request, and this type is what keeps them
 * arriving together — see {@link GanttPlan} for what happens to a drawing whose
 * parts came from different moments.
 */
export interface ChartRead {
  slices: SliceView[];
  steps: StepView[];
  people: AssignedPersonView[];
  /**
   * How far into a predecessor this plan's dependencies reach.
   *
   * Here rather than in a `useState` of its own for the reason `roles` is: the
   * chart draws each arrow out of the slice this names, so a reach from one
   * moment against slices from another draws an arrow the engine never placed.
   * They arrive in one payload and they are held as one.
   */
  depReach: DependencyReach;
  /**
   * The arithmetic the plan's days were computed with — the PERT coefficients
   * and the rounding one step's figure is charged at.
   *
   * Here for exactly the reason {@link ChartRead.depReach} is: the figures in
   * `slices` were produced by *these* weights and *this* rounding, and a
   * settings panel seeded from another moment would offer to "change" a value
   * the table is not showing. They arrive in one payload and are held as one.
   */
  pertWeights: PertWeightsView;
  estimateRounding: EstimateRoundingView;
  /** The optimizer state returned with the schedule, when the runtime is wired. */
  optimization?: PlanOptimizationView;
  /**
   * Which read this is: the coordinator's installed tree generation, and 0 before any has
   * landed.
   *
   * Carried here rather than kept in a ref because it is what
   * {@link GanttFaultBoundary} resets on — a fault caught while drawing one
   * read must clear when the next one arrives, and only a value that renders
   * can say a new one has.
   */
  generation: number;
}

/**
 * No read has landed yet: no slices, no roles, nobody, and no generation.
 *
 * The reach is the column's own default, which is what a project has unless it
 * asks otherwise — and with no slices to draw there is no arrow for it to place
 * either way.
 */
export const NO_CHART_READ: ChartRead = {
  slices: [],
  steps: [],
  people: [],
  depReach: 'whole-item',
  // The column defaults, which are what a project has unless it asks
  // otherwise — 1/4/1 and `ceil`, the same figures `libs/wbs/domain/domain`'s
  // `DEFAULT_ESTIMATE_RULE` carries. With no slices to draw, nothing has been
  // computed with them either way.
  pertWeights: DEFAULT_PERT_WEIGHTS_VIEW,
  estimateRounding: 'ceil',
  generation: 0,
};

/**
 * A refusal one of this project's services announces: the feed's and the
 * markers' as a cause, the writer's as the sentence it already chose.
 *
 * The words for a cause are built by the table's listener and nowhere else, for
 * the reason `PlanFeedDelivery` gives: a service that imported the refusal
 * vocabulary would be importing upward out of `components/`.
 */
export type PlanRefusal = PlanFeedRefusal | CalendarMarkerRefusal | PlanWriteRefusal;

/**
 * The project-owned stores and ports this table's services write through.
 *
 * Built once per mount, which is one project: `ProjectPage` keys the table by
 * the selected project. A lazy state initializer is safe here only because none
 * of them holds a resource or needs closing — StrictMode's discarded second
 * initializer leaks nothing. The project runtime of OpenSpec task 10 builds them
 * instead, and then this function goes.
 */
function openProjectPorts() {
  return {
    plan: createDeliveredPlan(),
    busy: createBusy(),
    refusals: createChannel<PlanRefusal>(),
    commandsIssued: createChannel<undefined>(),
  };
}

/**
 * The rows each delivered tree draws, built once per tree however many places
 * ask: the table's render and the settling of the hover card below read the
 * same array.
 */
const drawnRows = new WeakMap<DeliveredTree, TreeRow[]>();

/** One delivered tree, as the delivered plan holds it. */
type DeliveredTree = NonNullable<DeliveredPlan['tree']>;

function rowsOf(tree: DeliveredTree): TreeRow[] {
  const drawn = drawnRows.get(tree);
  if (drawn !== undefined) return drawn;
  const rows = toTree(tree.value.workItems);
  drawnRows.set(tree, rows);
  return rows;
}

/** A directory before the first read of one has landed: every list empty. */
function emptyDirectory(): DirectoryRead {
  return { teams: [], tags: [], services: [], workItemTypes: [], externalSystems: [], people: [] };
}

/**
 * What a plan read holds while it is in flight, and after it has landed: the
 * rows, the chart's slices, the vocabularies, the undo stack and whether any
 * of it is stale.
 *
 * **Selected, never set.** The plan feed writes every publication into the
 * project's delivered plan (`modules/plan-feed/delivered-plan-store.ts`), and
 * every value below is derived from that one snapshot, so a render never sees
 * two publications at once and nothing here hands a setter to anybody. Each
 * derived value keeps its identity until the member it comes from changes,
 * which is what the table's memos were already relying on.
 *
 * A store rather than a query cache because this table has one project on
 * screen and a socket telling it when to read again — see {@link usePlanRead}
 * for the reading itself.
 */
export function usePlanReadState({ projectId }: { projectId: string }) {
  /**
   * The project this render belongs to, readable by work that outlives the
   * render which started it.
   *
   * Updated during render rather than in an effect: a click can land on the
   * newly rendered project before effects run, and stale work must already
   * know it no longer owns this table by then.
   */
  const activeProject = useRef(projectId);

  activeProject.current = projectId;

  const [ports] = useState(openProjectPorts);
  const delivered = useSyncExternalStore(ports.plan.subscribe, ports.plan.snapshot);
  const tree = delivered.tree;

  const workItems = useMemo(() => (tree === null ? [] : rowsOf(tree)), [tree]);

  /** The project whose whole tree most recently completed a successful read. */
  const treeReadProject = useRef<string | null>(null);

  /**
   * Everything the chart is drawn from, as **one** read delivered it.
   *
   * Replaced whole on every refetch, never patched, for the reason the rows
   * are: one edit can move slices of work items this component never touched —
   * a person freed here starts something over there — and guessing which would
   * be a second implementation of the engine.
   *
   * One value and not three, and that is the fix rather than a tidy-up.
   * `layOutGantt` refuses a payload whose slices name a step or a person it has
   * not got, which is exactly what this client held while the slices came from
   * `tree()` and the steps and names came from `steps()` and `listPeople()`:
   * four requests, four moments, and a peer deleting a step in between left a
   * chart that threw. Derived from one delivered tree, they cannot disagree.
   *
   * The separate reads stay for what they are actually about: {@link steps}
   * heads the estimate columns and the steps dialog edits it, and
   * {@link people} is who the assignee picker can offer.
   */
  const chartRead = useMemo<ChartRead>(
    () =>
      // On the same read as the rows and behind the same generation check: a
      // superseded read must not leave its slices under another read's rows.
      // Proof: written as `setSlices((current) => current.length === 0 ?
      // tree.slices : current)` — the refetch leaving the slices where the first
      // read put them — and `replaces the slices on every refetch, as it replaces
      // the rows` failed on `expected '2' to be '1'`: a second row on screen with
      // the one-row plan's slices still behind it; watched 2026-08-09.
      tree === null
        ? NO_CHART_READ
        : {
            slices: tree.value.slices,
            steps: tree.value.steps,
            people: tree.value.assignedPeople,
            depReach: tree.value.depReach,
            pertWeights: tree.value.pertWeights,
            estimateRounding: tree.value.estimateRounding,
            ...(tree.value.optimization === undefined
              ? {}
              : { optimization: tree.value.optimization }),
            generation: tree.generation,
          },
    [tree],
  );

  const steps = delivered.steps;

  /**
   * Whether the last refetch failed, leaving the tree on screen possibly
   * behind what be-01 holds.
   *
   * A state, so a banner rather than a toast, and it is the counterpart to
   * keeping the last good tree on screen: rows that may be stale and no way to
   * tell are worse than an empty table. Cleared by any refresh that lands —
   * the retry button's, an edit's, or a peer's change event.
   */
  const treeMayBeStale = delivered.staleResources.length > 0;
  const treeFailure = delivered.treeFailure;
  // Proof: suppressing this failure text left the peer-refetch window on
  // “the last refresh failed”, expected the named optimizer-unavailable
  // message while the previously installed plan stayed on screen.
  const treeFailureText = useMemo(
    // Proof: on 2026-09-24, this function written as `() => null`, `keeps the installed plan and
    // names an unavailable peer refetch` failed on `expected 'This plan may be out of date — the
    // la…' to contain 'Optimized scheduling is unavailable i…'`.
    () => (treeFailure === null ? null : refusalSentence(treeFailure.cause)),
    [treeFailure],
  );

  // Selected, never set here: the gestures raise and lower it through `busyWrites`.
  const busy = useSyncExternalStore(ports.busy.subscribe, ports.busy.snapshot);
  const busyWrites: BusyWrites = ports.busy;

  const connected = delivered.connected;

  const scheduleError = tree === null ? null : tree.value.scheduleError;

  // Proof: renaming the shared response field to `planningMethod` made this
  // production screen fail with TS2339: `estimateMethod` does not exist on PlanRead.
  const estimateMethod: EstimateMethod = tree === null ? 'pert' : tree.value.estimateMethod;

  /**
   * Whether this reader has anything to undo or redo, as of the last tree read.
   *
   * Read off the tree rather than tracked here. Both halves of the stack are
   * be-01's — a refused step throws its entry away, and a change of this
   * reader's own clears their redo branch — so a count kept in the browser
   * would be a second answer to a question that has one, and it would be wrong
   * in exactly the cases that matter.
   */
  const stack = useMemo(
    () =>
      tree === null
        ? { undoable: false, redoable: false }
        : { undoable: tree.value.undoable, redoable: tree.value.redoable },
    [tree],
  );

  /** The project's start date, or null while the plan is not on a calendar. */
  const startDate = tree === null ? null : tree.value.startDate;

  /**
   * The global directory: every team and every person on this deployment, the
   * tag and service vocabularies, the work item types and the external systems.
   *
   * Global rather than per project — Dany's ask — so it is loaded once beside
   * the tree rather than filtered by anything. The services label the third
   * dimension's facet and its cell picker; a facet that offers ids instead of
   * names is a filter nobody can aim. The external systems are loaded with the
   * others and never added to: be-01 seeds them with exactly the names
   * `systemOfUrl` can answer and offers no create, so a page that has read them
   * once has read all of them.
   */
  const directory = useMemo(() => delivered.directory ?? emptyDirectory(), [delivered.directory]);
  const { teams, tags, services, workItemTypes, externalSystems, people } = directory;

  /**
   * How many of each team this plan may have at work at once, as be-01 sent it
   * with the tree.
   *
   * Off the tree read and not a request of its own: the dates on screen were
   * computed from these numbers, and a separately-fetched capacity could put a
   * number beside bars it does not explain. `wbs-api.ts` has the argument.
   */
  const teamCapacities = useMemo(() => (tree === null ? [] : tree.value.teamCapacities), [tree]);

  /**
   * What this plan calls its priority numbers — five rungs, most important first.
   *
   * Off the tree read for {@link teamCapacities}' reason and one of its own: no
   * date here was computed from the ladder, but every face draws every priority
   * through it, so a ladder fetched at a second moment would paint the wrong
   * label on every row rather than on one. `DEFAULT_PRIORITY_BANDS` is be-01's
   * answer for a plan nobody has configured, so this is empty only before the
   * first read has landed — which is the same moment the rows are empty.
   */
  const priorityBands = useMemo(() => (tree === null ? [] : tree.value.priorityBands), [tree]);

  /**
   * The calendar markers on this project — the list `GanttPanel` draws.
   *
   * **Its own member off its own read**, and not a member of `chartRead`, which
   * is `ProjectApi.listCalendarMarkers`'s own argument turned around: a marker
   * moves nothing in the schedule (task 4, axis-1), so folding it into the plan
   * would make every marker write a full tree reread and every tree reread
   * carry markers the table never looks at. The delivered plan keeps the same
   * array until a new one arrives, so `GanttPanel`'s memo on it holds.
   */
  const markers = delivered.markers;
  return {
    plan: ports.plan,
    markers,
    activeProject,
    workItems,
    treeReadProject,
    chartRead,
    steps,
    treeMayBeStale,
    treeFailureText,
    busy,
    busyWrites,
    refusals: ports.refusals,
    commandsIssued: ports.commandsIssued,
    connected,
    scheduleError,
    estimateMethod,
    stack,
    startDate,
    teams,
    tags,
    services,
    workItemTypes,
    externalSystems,
    teamCapacities,
    priorityBands,
    people,
  };
}

/**
 * Reading the plan, and everything that decides **when** to read it again: the
 * socket's events, a write's own answer, and the project changing under the
 * component.
 *
 * `refresh` takes a scope rather than always reading everything, because a step
 * rename and a tree replacement are different amounts of work and the socket
 * says which happened.
 */
export function usePlanRead({
  setDrafts,
  projectId,
  activeProject,
  api,
  plan,
  treeReadProject,
  rowPlacements,
  cellCards,
  pushToast,
  subscribe,
  focusIntent,
  busyWrites,
  refusals,
  commandsIssued,
}: {
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  projectId: string;
  activeProject: React.RefObject<string>;
  api: ProjectApi;
  plan: DeliveredPlanStore;
  treeReadProject: React.RefObject<string | null>;
  rowPlacements: React.RefObject<ReadonlyMap<string, string>>;
  cellCards: CellCards;
  pushToast: (toast: Toast) => void;
  subscribe:
    | ((projectId: string, handlers: SubscriptionHandlers, baseline: number) => ProjectStream)
    | undefined;
  focusIntent: React.RefObject<FocusIntent>;
  busyWrites: BusyWrites;
  refusals: Channel<PlanRefusal>;
  commandsIssued: Channel<undefined>;
}) {
  const feedRef = useRef<PlanFeed | null>(null);
  const activeApi = useRef(api);
  activeApi.current = api;

  // Joined before the feed below starts reading, which is a passive effect of
  // this same commit: see `useChannelListener`.
  useChannelListener(refusals, (refusal) => {
    // Proof: on 2026-09-24, returning here for every refusal that carries a sentence failed `says a
    // refused rename in a toast, and puts nothing above the table` on `expected [] to deeply equal
    // [ Array(1) ]`.
    pushToast({
      kind: 'error',
      // Proof: using the bare failure code here left the unavailable-plan
      // fixture with no named toast and an unhandled refusal-code branch.
      // Proof: on 2026-09-24, the cause turned into its bare `String` here failed `names an
      // unavailable optimizer and offers no export before a plan is installed` on `expected [ Array(1) ]
      // to include 'Optimized scheduling is unavailable i…'`.
      text: 'sentence' in refusal ? refusal.sentence : refusalSentence(refusal.cause),
    });
  });
  // The table decides what a command issued means for the focus; the writer
  // only says that one was.
  useChannelListener(commandsIssued, () => {
    // Proof: on 2026-09-24, this listener made to do nothing failed `Cmd+Enter on the last row makes
    // one and lands in it` on `expected <textarea …(6)></textarea> to be <textarea …(6)></textarea>`:
    // the focus stayed on the old row.
    focusIntent.current.commandIssued();
  });

  /**
   * Settles this browser's own state against the steps be-01 just reported.
   *
   * A step that goes takes two things with it that are nobody's but this
   * client's, and be-01 can clean up neither:
   *
   * - the **estimate drafts**, keyed `rowId::stepId::point`. A half-typed trio
   *   for a step that has gone is a figure nobody can see, reach or finish,
   *   and it goes on counting as content — an otherwise empty row it belongs to
   *   can never be removed by Backspace again.
   * - the **held refusals**, keyed by cell, whose columns no longer exist —
   *   text nobody can ever resolve, held for the life of the page.
   *
   * `unfoldedSteps` is deliberately **not** settled here, and that is a finding
   * rather than an omission. The plan asked for it (agy #7) on the reading that
   * the set could hold a dead id; it can, and nothing can observe it,
   * because `columns` is built by mapping over `steps` and a dead id selects no
   * step to unfold. The sanitizer was written, its negative test watched
   * **passing** with the line deleted, and the line removed —
   * `openspec/changes/phases-ui/verify.md` has the run.
   *
   * The drafts sanitizer returns the object it was given when nothing changed.
   * `drafts` is not one of `columns`' dependencies, so this is about not
   * re-rendering every cell rather than about remounting them — but the rule is
   * the same one the delivered plan's `sameSteps` keeps, and stating it twice is
   * cheaper than the two of them drifting.
   *
   * A step change **does** cost the focus, and that is the accepted trade: the
   * columns really are different, the cells really are new elements, and the
   * person sees the caret leave the box at the moment the table changes shape.
   * What must not go with it is a draft be-01 refused, which is why the hold is
   * outside `CellInput` — see {@link refusedDrafts}.
   */
  const settleAgainstSteps = useCallback(
    (live: readonly StepView[]) => {
      const liveIds = new Set(live.map((step) => step.id));
      // Proof: this whole block deleted, `drops a half-typed figure for a step
      // that has gone` failed on `expected [ '010' ] to deeply equal []` — an
      // empty row nobody could remove, vetoed by a figure typed for a step that
      // was no longer there. Watched, 2026-08-09.
      setDrafts((current) => {
        const gone = new Set(
          Object.keys(current).filter((key) => {
            const stepId = stepOfDraftKey(key);
            return stepId !== null && !liveIds.has(stepId);
          }),
        );
        return gone.size === 0 ? current : dropDrafts(current, gone);
      });
      // Proof: this call deleted, `forgets a refusal held for a step that has
      // gone` failed on `expected '9' to be undefined`. Watched, 2026-08-09.
      forgetRefusedDrafts((cellKey) => {
        const stepId = stepOfCellKey(cellKey);
        return stepId !== null && !liveIds.has(stepId);
      });
    },
    [setDrafts],
  );

  /**
   * What a publication changes on screen beyond the values selected from it,
   * run inside the delivered plan's own notification — the pass the change was
   * made in, before the table renders it.
   *
   * Two settlings, each keyed on its member changing: a new tree records whose
   * tree it is and settles the open hover card against the rows that just
   * arrived; a new step list drops what only the gone steps held. A step list
   * that came back the same is kept as the same array by the delivered plan, so
   * it settles nothing, exactly as it rebuilt nothing before.
   */
  const settle = useCallback(
    (next: DeliveredPlan, previous: DeliveredPlan) => {
      if (next.tree !== null && next.tree !== previous.tree) {
        // Proof: on 2026-09-24, this line deleted, `offers the reset only while there is a width
        // to reset` failed on `Unable to find an accessible element with the role "button" and
        // name "Reset layout"`.
        treeReadProject.current = projectId;
        // The open hover card, settled against the rows that just arrived. The
        // previous placements are read into a local **before** the ref is replaced:
        // React may run the updater below after this call returns, and reading the
        // ref from inside it would compare the new tree against itself and never
        // close anything.
        // Proof: this pair deleted, `closes the card when a peer moves the row it
        // is anchored to` failed on `expected <div role="tooltip" …/> to be null`.
        // Watched, 2026-08-09.
        const placements = placementsOf(rowsOf(next.tree));
        const wasPlaced = rowPlacements.current;
        // Proof: on 2026-09-24, this pair replaced by `void` of both locals, `closes the card
        // when a peer moves the row it is anchored to` failed on `expected <div role="tooltip"
        // …(2)>…(2)</div> to be null`.
        rowPlacements.current = placements;
        cellCards.updateHovered((open) => hoveredCellAfterRefresh(open, wasPlaced, placements));
      }
      // Proof: on 2026-09-24, this line deleted, `drops a half-typed figure for a step that has
      // gone` failed on `expected [ '010' ] to deeply equal []`.
      if (next.steps !== previous.steps) settleAgainstSteps(next.steps);
    },
    [cellCards, projectId, rowPlacements, settleAgainstSteps, treeReadProject],
  );
  useSnapshotChanges(plan, settle);

  /**
   * This reader's feed: one project, one API, one refresh owner, one stream.
   *
   * Built in an effect and closed by its cleanup, which is what makes the
   * owner's lifetime the reader's. `feedRef` is how everything outside this
   * effect reaches it, and it is cleared before the feed is closed, so work
   * that outlives the reader — a gesture whose answer is still in flight —
   * finds no owner rather than a disposed one.
   */
  useEffect(() => {
    const feed = planFeedForReader({
      projectId,
      api,
      subscribe,
      isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
      plan,
      refusals,
    });
    feedRef.current = feed;
    return () => {
      if (feedRef.current === feed) feedRef.current = null;
      feed.close();
    };
  }, [activeProject, api, plan, projectId, refusals, subscribe]);

  /** Awaits this invalidation's covering outcome; failures remain in the owner snapshot. */
  const refreshResourcesOrMarkStale = useCallback(
    async (resources: readonly RefreshResource[]): Promise<void> => {
      const feed = feedRef.current;
      // The reader this callback was built for, and not whoever is on screen
      // now: a reread issued from a project or an API this reader has left must
      // not be spent against the feed that replaced it.
      if (feed === null || activeProject.current !== projectId || activeApi.current !== api) return;
      await feed.rereadResources(resources);
    },
    [activeProject, api, projectId],
  );

  /** Awaits this invalidation's covering outcome; failures remain in the owner snapshot. */
  const refreshOrMarkStale = useCallback(
    (scope: PlanReadScope = 'all'): Promise<void> =>
      refreshResourcesOrMarkStale(
        scope === 'tree'
          ? ['tree']
          : scope === 'tree-and-steps'
            ? ['tree', 'steps']
            : ALL_RESOURCES,
      ),
    [refreshResourcesOrMarkStale],
  );

  /**
   * This reader's calendar-marker gestures, rebuilt when the reader changes and
   * not otherwise.
   *
   * The dependency list is the one the callback it replaces carried, so the
   * four chart gestures built over it change identity on exactly the renders
   * they changed on before.
   */
  const markers = useMemo(
    () =>
      calendarMarkersForReader({
        projectId,
        api,
        readRefreshOwner: () => feedRef.current?.owner ?? null,
        isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
        // Proof: on 2026-09-24, `() => undefined` here failed `rereads a marker refused because a peer
        // already deleted it` on `the given combination of arguments (undefined and string) is invalid
        // for this assertion`: no toast was there to hold `no longer`.
        announceRefusal: refusals.publish,
      }),
    [activeProject, api, projectId, refusals],
  );

  /**
   * This reader's writer, rebuilt when the reader changes and not otherwise.
   *
   * The dependency list is the one the callback it replaces carried, so `run`'s
   * identity changes on exactly the renders it changed on before.
   */
  const writer = useMemo(
    () =>
      createPlanWriter({
        readRefreshOwner: () => feedRef.current?.owner ?? null,
        isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
        rereadResources: refreshResourcesOrMarkStale,
        busy: busyWrites,
        commandsIssued,
        refusals,
      }),
    [
      activeProject,
      api,
      busyWrites,
      commandsIssued,
      projectId,
      refreshResourcesOrMarkStale,
      refusals,
    ],
  );

  /**
   * One step along the undo stack, and the sentence that says what happened.
   *
   * Three outcomes, all of them said out loud, because a shortcut that
   * silently does nothing is worse than no shortcut. A step that worked is an
   * `info` — it is a fact to know, and it takes itself off. Both refusals are
   * errors that stay until they are read: the reader asked for something and
   * did not get it, and in the stale case somebody else's change is the reason.
   *
   * The tree is reread after a refusal too, not only after a success. be-01
   * throws away the entry it refused — it can never apply again — so what
   * there is left to undo has changed even though the plan has not.
   */
  const stepStack = useCallback(
    async (direction: 'undo' | 'redo') => {
      const owner = feedRef.current?.owner ?? null;
      const isCurrent = () =>
        owner !== null &&
        feedRef.current?.owner === owner &&
        activeProject.current === projectId &&
        activeApi.current === api;
      busyWrites.raise();
      try {
        let outcome;
        try {
          outcome = direction === 'undo' ? await api.undo(projectId) : await api.redo(projectId);
        } catch (thrown: unknown) {
          if (!isCurrent()) return;
          // The same register as `run`: be-01's two *modeled* refusals are read
          // out of the 409 below and get their own sentences; anything else is
          // a code, and a code is not a sentence.
          pushToast({ kind: 'error', text: refusalSentence(thrown) });
          return;
        }
        if (!isCurrent()) return;
        if (outcome.ok) {
          pushToast({
            kind: 'info',
            text: `${direction === 'undo' ? 'Undid' : 'Redid'}: ${outcome.done}${
              outcome.detail === null ? '' : ` — ${outcome.detail}`
            }`,
          });
        } else if (outcome.reason === 'nothing_to_undo') {
          pushToast({
            kind: 'error',
            text: direction === 'undo' ? NOTHING_TO_UNDO : NOTHING_TO_REDO,
          });
        } else {
          pushToast({
            kind: 'error',
            // be-01's own sentence about what moved, because a translation
            // here would be a second vocabulary for one set of refusals.
            text: `${direction === 'undo' ? 'That could not be undone' : 'That could not be put back'}: ${outcome.detail ?? 'the plan has changed since then.'}`,
          });
        }
        await refreshOrMarkStale();
      } finally {
        if (isCurrent()) busyWrites.lower();
      }
    },
    [activeProject, api, busyWrites, projectId, pushToast, refreshOrMarkStale],
  );
  return { refreshOrMarkStale, run: writer.run, stepStack, markers };
}

/**
 * Where each row of a freshly read plan sits: `parentId::line`, by row id, where
 * the line is its position in the order the table draws.
 *
 * A walk of the tree rather than a count of siblings, and round 4's finding 10
 * is the reason. "First child of 020" is unchanged by a peer moving 020 itself
 * — the branch and everything in it goes somewhere else on screen while every
 * row inside it reports the same parent and the same place among its siblings,
 * so the card travelled with the branch and stayed open on a line the pointer
 * was never on. The line is the thing that actually moved, and no ancestor can
 * move without changing it.
 *
 * The parent stays in the pair as well, for the move that changes no line:
 * outdenting a row leaves it where it was and shifts it left by an indent. The
 * root's parent is spelled `''`, which no id can collide with.
 *
 * The tree, not the flat read, because the flat read is in this order only by
 * be-01's promise. Walking what the table is about to draw asks nothing of the
 * caller, and a fake that reorders less carefully than be-01 does cannot make
 * this quietly agree with itself.
 */
export function placementsOf(rows: readonly TreeRow[]): ReadonlyMap<string, string> {
  const placements = new Map<string, string>();
  let line = 0;
  const walk = (row: TreeRow): void => {
    placements.set(row.id, `${row.parentId ?? ''}::${String(line)}`);
    line += 1;
    for (const child of row.subRows) walk(child);
  };
  for (const root of rows) walk(root);
  return placements;
}

/**
 * The hovered cell a freshly read tree still supports, or null.
 *
 * A hover card is an absolutely positioned child of one cell and the hover is
 * remembered as a row id, so a refresh that moves that row takes the card with
 * it — to a line the pointer is not on — and one that deletes the row leaves a
 * key pointing at nothing. Neither is a card anybody asked for, and the pointer
 * will not say so: it has not moved, so no `mouseleave` is coming (codex round
 * 3, finding 3).
 *
 * Same parent and same position, rather than "still exists": a create above the
 * hovered row moves it down a line without touching it, and the card would
 * follow the row while the pointer stayed where it was.
 *
 * Unchanged is the common case and it is the one that must not close anything:
 * every edit anybody makes to this plan refetches, so clearing on each read
 * would be a card nobody could hold open long enough to read.
 */
export function hoveredCellAfterRefresh(
  open: string | null,
  was: ReadonlyMap<string, string>,
  now: ReadonlyMap<string, string>,
): string | null {
  if (open === null) return null;
  const placed = now.get(rowOfCellKey(open));
  return placed !== undefined && placed === was.get(rowOfCellKey(open)) ? open : null;
}
