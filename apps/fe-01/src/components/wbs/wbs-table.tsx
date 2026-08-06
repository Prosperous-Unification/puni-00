import {
  createColumnHelper,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ProjectStream } from '@/lib/project-stream';
import type { PersonView, TeamView } from '@/lib/wbs-api';
import {
  type Days,
  type EstimateMethod,
  isEstimateMethod,
  type ProjectApi,
  type RoleView,
} from '@/lib/wbs-api';

import { type CellElement, CellInput } from './cell-input';
import { type Caret, type CellRef, nextCell } from './cell-navigation';
import { CreatablePicker } from './creatable-picker';
import { pickerEntries, type PickerEntry } from './dep-picker';
import { parseDependencies, unknownMessage } from './depends-input';
import { type DropRefusal, type DropZone, planMove, zoneFor } from './drag-drop';
import {
  isTrioEmpty,
  parseTrioShorthand,
  type Point,
  POINTS,
  sendableTrio,
  trioProblem,
  type TypedTrio,
} from './estimate-draft';
import { NotesPreview } from './notes-preview';
import { describeGaps, findEstimateGaps } from './plan-completeness';
import { indentFor, pinnedCellStyle, STICKY_HEADER_CELL, TABLE_FRAME } from './table-frame';
import { searchTree } from './tree-search';
import { toTree, type TreeRow } from './wbs-rows';

export interface WbsTableProps {
  projectId: string;
  api: ProjectApi;
  /**
   * Opens a live subscription. Optional so the table can be tested without a
   * socket; supplied in the app.
   */
  subscribe?: (projectId: string, handlers: SubscriptionHandlers) => ProjectStream;
}

export interface SubscriptionHandlers {
  onChange: () => void;
  onConnectionChange: (connected: boolean) => void;
}

const showDays = (days: Days | undefined, point: Point): string =>
  days === undefined ? '' : String(days[point]);

/** A role's final figure, or nothing at all when no estimate under this row mentions it. */
const showFinal = (days: number | undefined): string => (days === undefined ? '' : showDay(days));

/** The key one estimate box's draft is held under: one row, one role, one point. */
const draftKey = (rowId: string, roleId: string, point: Point): string =>
  `${rowId}::${roleId}::${point}`;

/**
 * The key the folded cell's `o/r/p` draft is held under: one row, one role.
 *
 * The same `drafts` record as the boxes, because there is one pending
 * estimate per row and role however it was typed — see
 * {@link commitCombinedEstimate} for the rule that keeps it one. `combined`
 * cannot collide with a {@link Point}, which is what makes one record safe.
 */
const combinedDraftKey = (rowId: string, roleId: string): string => `${rowId}::${roleId}::combined`;

/** What the folded cell says about itself when there is nothing to complain about. */
const SHORTHAND_HELP =
  'Days as optimistic/realistic/pessimistic — 2/3/8. One number means all three. Empty clears it.';

/**
 * The drafts record without the named keys.
 *
 * Rebuilt rather than copied and `delete`d: `delete` on a computed key is
 * banned here, and filtering says the same thing without reaching into the
 * object twice.
 */
const dropDrafts = (
  drafts: Readonly<Record<string, string>>,
  gone: ReadonlySet<string>,
): Record<string, string> =>
  Object.fromEntries(Object.entries(drafts).filter(([key]) => !gone.has(key)));

/** Every key one row-and-role's pending estimate can be held under. */
const estimateDraftKeys = (rowId: string, roleId: string): ReadonlySet<string> =>
  new Set([
    ...POINTS.map((point) => draftKey(rowId, roleId, point)),
    combinedDraftKey(rowId, roleId),
  ]);

/**
 * The one sentence a frozen row's refusal says, however the move was asked for.
 *
 * Named rather than reached for through {@link REFUSAL_MESSAGES}: that record is
 * `Partial`, so every read of it is a `string | undefined` the keyboard path
 * would have to invent a fallback for — and two spellings of one refusal is how
 * a drag and a keystroke come to disagree about the same rule.
 */
const FROZEN_REFUSAL = 'That row’s number is frozen. Unfreeze it before moving it.';

/**
 * What a refused drop says out loud.
 *
 * `unchanged` is absent deliberately: dropping a row back where it was is not a
 * mistake anyone needs telling about, and a message for it would fire constantly.
 */
const REFUSAL_MESSAGES: Partial<Record<DropRefusal, string>> = {
  frozen: FROZEN_REFUSAL,
  cycle: 'A row cannot be moved inside itself.',
  not_found: 'That row is no longer here — the table has been refreshed.',
};

/**
 * What a greyed entry in the Depends on list says about itself.
 *
 * The refusal be-01 would answer with, in the words of the table it is being
 * read in: the reader is looking at rows and asking why this one is out, not
 * reading an API's vocabulary. `— would loop` is the whole of the cycle
 * explanation on purpose; the loop can run through any number of rows and
 * naming them in a dropdown entry is a paragraph nobody reads.
 *
 * Exhaustive rather than `Partial`: a new refusal must not reach the list as a
 * silently unexplained grey row.
 */
const REFUSAL_SUFFIX: Record<NonNullable<PickerEntry['refusal']>, string> = {
  ancestor: 'contains this row',
  descendant: 'inside this row',
  cycle: 'would loop',
};

/**
 * Opens `rowId`, whatever shape the expansion state is currently in.
 *
 * TanStack models "everything is open" as the boolean `true`, and a specific set
 * as a record. Dropping into a branch that is closed has to open it — a row that
 * lands somewhere invisible reads as a move that did nothing.
 */
function expandBranch(current: ExpandedState, rowId: string): ExpandedState {
  if (current === true) return true;
  return { ...current, [rowId]: true };
}

/** What a row matching the Find box is tinted, so a hit reads apart from its context. */
const MATCH_TINT = '#fff3bf';

/**
 * Where this browser remembers which of one project's branches are open.
 *
 * Per project, because the shape being remembered is that project's tree.
 * Per browser, like the chosen project beside it (`project-page.tsx`): my
 * collapsing must not reshuffle anybody else's table.
 */
const expansionKey = (projectId: string): string => `wbs.expanded.${projectId}`;

/**
 * Whether a value read back out of storage is an expansion this table can use.
 *
 * TanStack models expansion as `true` — everything open — or a record of the
 * rows that are open. Nothing else is one; `false` in particular is not, since
 * the all-closed state is the empty record.
 */
function isExpansion(value: unknown): value is ExpandedState {
  if (value === true) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((open) => typeof open === 'boolean');
}

/** `stored` as JSON, or nothing at all when it is not JSON. */
function parsedOrNothing(stored: string): unknown {
  try {
    const claimed: unknown = JSON.parse(stored);
    return claimed;
  } catch {
    // Nothing but this component writes the key, so the only way here is a
    // hand-edited store. Recovered from below rather than rethrown.
    return undefined;
  }
}

/**
 * The expansion this browser last saved for `projectId`, or everything open
 * when it has never saved one.
 *
 * The stored value is a claim, not a fact. It is user-editable storage read at
 * a boundary, so it is validated here and dropped — key and all — when it is
 * not an expansion, the same posture `project-page.tsx` takes to a remembered
 * project the list no longer holds. Deliberately not the "unknown is not OK"
 * throw: the alternative is a table that cannot be opened at all until somebody
 * clears storage by hand, over a preference about which triangles point down.
 *
 * Two things the remembered record does **not** do, both verified against
 * `getExpandedRowModel` and `RowExpanding`'s `getIsExpanded`:
 *
 * - Ids naming rows that have since been deleted are harmless. Expansion is
 *   read per row id, so a key nothing asks about is never looked at.
 * - **A row created since the save arrives collapsed** while a record is in
 *   force, because an absent key reads as closed (`expanded?.[row.id]`). Under
 *   `true` — the state of a browser that has never collapsed anything — it
 *   arrives open. That is TanStack's own rule, adopted rather than papered
 *   over: the alternative is a fourth state to keep in step with the other
 *   three.
 */
function rememberedExpansion(projectId: string): ExpandedState {
  const stored = localStorage.getItem(expansionKey(projectId));
  if (stored === null) return true;
  const claimed = parsedOrNothing(stored);
  if (isExpansion(claimed)) return claimed;
  localStorage.removeItem(expansionKey(projectId));
  return true;
}

function rememberExpansion(projectId: string, expanded: ExpandedState): void {
  localStorage.setItem(expansionKey(projectId), JSON.stringify(expanded));
}

/** Whether two role lists say the same thing, so an equal one can be discarded. */
function sameRoles(a: readonly RoleView[], b: readonly RoleView[]): boolean {
  return (
    a.length === b.length && a.every((role, i) => role.id === b[i]?.id && role.name === b[i]?.name)
  );
}

/** Whether an event target is one of the two elements a cell can be. */
function isCellElement(node: unknown): node is CellElement {
  return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement;
}

/** What one Alt+arrow does to the focused row's place in the tree. */
type AltMove = 'up' | 'down' | 'outdent' | 'indent';

/**
 * The structural move an arrow means when Alt is held, or null for any other key.
 *
 * A function rather than a lookup record: indexing a record by an arbitrary
 * `event.key` is exactly the unchecked access `noUncheckedIndexedAccess` exists
 * to stop, and four cases read as well as four entries.
 */
function altMoveFor(key: string): AltMove | null {
  switch (key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'outdent';
    case 'ArrowRight':
      return 'indent';
    default:
      return null;
  }
}

/** The `data-cell` value for one editable cell, and the selector that finds it. */
const cellKey = (rowId: string, columnId: string): string => `${rowId}::${columnId}`;

/**
 * What the caret in an input is doing, for `nextCell` to decide on.
 *
 * `selectionStart`/`selectionEnd` are `null` on inputs that do not support them;
 * treated as "not at either end", which leaves the key to the browser rather
 * than guessing a jump nobody asked for.
 */
function caretOf(input: CellElement): Caret {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (start === null || end === null) {
    return { atStart: false, atEnd: false, hasSelection: false };
  }
  return { atStart: start === 0, atEnd: end === input.value.length, hasSelection: start !== end };
}

/**
 * A day offset as a person should read it.
 *
 * PERT is `(O + 4R + P) / 6`, so a perfectly ordinary estimate produces
 * `3.3333333333333335` and a column full of those is unreadable. Rounded to one
 * decimal **for display only** — the schedule keeps its fractions, because
 * rounding inside the computation compounds across a chain of forty work items
 * into days that never existed.
 */
const showDay = (days: number): string => String(Math.round(days * 10) / 10);

/**
 * Every editable cell in the committed table, paired with the input that is it.
 *
 * Kept as pairs, so the cell a move names and the input it focuses cannot
 * drift apart — an index into two separately filtered lists is one dropped
 * entry away from focusing the wrong box. Read from the DOM at the moment a
 * key arrives, never from a ref written during render: the committed DOM is
 * the only thing that cannot be ahead of itself.
 */
function editableGrid(table: HTMLTableElement): { input: CellElement; cell: CellRef }[] {
  return [...table.querySelectorAll<CellElement>('[data-cell]:not([readonly])')]
    .map((input) => ({ input, parts: (input.dataset['cell'] ?? '').split('::') }))
    .flatMap(({ input, parts }) => {
      // A `data-cell` that is not `row::column` is markup this component did
      // not write. Skipped rather than guessed at, and not thrown on: a
      // keystroke is not the moment to take the table down.
      const [row, column] = parts;
      if (parts.length !== 2 || row === '' || column === '') return [];
      return [{ input, cell: { rowId: row, columnId: column } satisfies CellRef }];
    });
}

/**
 * Focuses the grid cell `delta` places from `from`, selecting its text the
 * way the browser's own Tab leaves a field. False at the grid's edge — the
 * caller then leaves the key to the browser rather than eating it.
 */
function focusAdjacentCell(input: CellElement, from: CellRef, delta: 1 | -1): boolean {
  const table = input.closest('table');
  if (table === null) return false;
  const grid = editableGrid(table);
  const at = grid.findIndex(
    (g) => g.cell.rowId === from.rowId && g.cell.columnId === from.columnId,
  );
  if (at === -1) return false;
  // `.at(-1)` wraps to the far end, which would turn Shift+Tab in the first
  // cell into a jump to the last one instead of leaving the key alone.
  const next = at + delta < 0 ? undefined : grid.at(at + delta);
  if (next === undefined) return false;
  next.input.focus();
  next.input.select();
  return true;
}

const column = createColumnHelper<TreeRow>();

/**
 * The work breakdown: one grid that is a table and a nested list at once.
 *
 * TanStack Table owns exactly one thing here — which branches are open. Ordering
 * is not its job: be-01 returns rows already in the order they read, because the
 * numbering is built so a single lexicographic sort produces tree order across
 * every level. Sorting them again on the client would be a second implementation
 * of that, and the two would eventually disagree.
 *
 * Every edit is a request and the tree is refetched, never patched locally. A
 * create or a move can renumber rows this component never touched, and guessing
 * which would be a second implementation of the derivation as well.
 */
export function WbsTable({ projectId, api, subscribe }: WbsTableProps) {
  const [workItems, setWorkItems] = useState<TreeRow[]>([]);
  const [roles, setRoles] = useState<RoleView[]>([]);
  /**
   * Which branches are open, as this browser last left them for this project.
   *
   * Read straight into the initial state rather than in an effect: an effect
   * would render the default first and collapse the tree a frame later, which
   * is the plan visibly rearranging itself under the reader on every load.
   */
  const [expanded, setExpanded] = useState<ExpandedState>(() => rememberedExpansion(projectId));
  /** Which project the expansion above belongs to, so a save cannot pair it with another. */
  const expansionProject = useRef(projectId);
  /**
   * Saves every change to the expansion, and swaps it whole for another
   * project's.
   *
   * The two are one effect because they are one rule: the state and the key it
   * is written under must always name the same project. Switching project
   * re-reads first and saves nothing — this component is not remounted between
   * projects (`project-page.tsx` renders it without a `key`), so without the
   * swap the first save after a switch would stamp the old project's collapsed
   * branches onto the new project's key.
   */
  useEffect(() => {
    if (expansionProject.current !== projectId) {
      expansionProject.current = projectId;
      setExpanded(rememberedExpansion(projectId));
      return;
    }
    // Proof: removed, `remembers a collapsed branch across a remount` failed
    // with the branch open again, and `drops a remembered expansion that is
    // not one` failed with the hand-edited value still in storage. Watched,
    // 2026-08-06.
    rememberExpansion(projectId, expanded);
  }, [projectId, expanded]);
  /**
   * What has been typed into the Find box.
   *
   * The narrowing itself is not state: it is {@link searchTree} of the rows on
   * screen and this string, re-derived every render. A remembered answer would
   * narrow to a plan that no longer exists — every edit by anybody refetches
   * the whole tree.
   */
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [scheduleError, setScheduleError] = useState<'cycle' | null>(null);
  const [estimateMethod, setEstimateMethod] = useState<EstimateMethod>('pert');
  /**
   * Estimate boxes whose typed value has not been accepted by be-01 yet, by
   * {@link draftKey}.
   *
   * These outlive the input they were typed into, on purpose. A trio is only
   * sent once all three read sensibly, so `5` typed into an empty row's
   * optimistic box is a number with nowhere to live until the other two
   * arrive — and holding it in the DOM alone would lose it to the next
   * refresh, which any peer's edit triggers. Cleared for the whole trio the
   * moment it is sent.
   */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** The row whose notes the pointer is over, so its rendered markdown can show. */
  const [hoveredNotes, setHoveredNotes] = useState<string | null>(null);
  /**
   * Roles whose columns are unfolded — the trio and the assignee, next to the
   * final figure that is always on screen.
   *
   * Folded by default, which is the point: two roles cost ten columns and the
   * dates fell off the screen. The final figure is what a plan is read by; the
   * three numbers it came from and who does the work are needed while the
   * plan is being written, which is when they are a click away. Local state, not
   * shared: my unfolding must not reshuffle anyone else's table.
   */
  const [unfoldedRoles, setUnfoldedRoles] = useState<readonly string[]>([]);

  const toggleRole = useCallback((roleId: string) => {
    setUnfoldedRoles((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId],
    );
  }, []);
  /** The project's start date, or null while the plan is not on a calendar. */
  const [startDate, setStartDate] = useState<string | null>(null);
  /**
   * The global directory: every team and every person on this deployment.
   *
   * Global rather than per project — Dany's ask — so it is loaded once beside
   * the tree rather than filtered by anything.
   */
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [people, setPeople] = useState<PersonView[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ rowId: string; zone: DropZone } | null>(null);
  /**
   * The Depends on picker: which row's cell it is open under, what has been
   * typed into it, and which entry is highlighted — by the entry's id, never
   * an index. A peer edit can reshuffle the list under an open picker, and an
   * index would silently move the highlight to a row the user never aimed at;
   * an id follows its row, or disappears with it (cross review #6).
   *
   * `highlightId: null` means nothing is highlighted, and it matters at
   * Enter: an empty cell whose list happens to be showing must not add the
   * first entry on a stray Enter. Typing highlights the narrowed-to entry —
   * that is what the typing was for — and the arrows move it.
   */
  const [depPicker, setDepPicker] = useState<{
    rowId: string;
    typed: string;
    highlightId: string | null;
  } | null>(null);
  /**
   * The cell a structural edit asked the focus to land in once the refetched
   * tree is on screen — a row **and a column**, because a row moved from an
   * estimate box has to come back under the same box.
   *
   * Two consumers, one rule between them. The Name cell claims its own arrival
   * in `onAttach`, which is the only way to win the race a newly created row
   * has (see the comment there); every other column is focused by the effect
   * below, from the committed DOM, once the tree it names is rendered. Creating
   * and deleting rows still name the Name column, because that is where typing
   * continues.
   */
  const focusNext = useRef<CellRef | null>(null);
  /**
   * Where the readiness walk has got to: the leaf it last put the focus in,
   * and the cell it asked for.
   *
   * The row rather than an index into the list of gaps, because that list is
   * rebuilt by every edit — estimating the row you were standing on takes it
   * out, and an index would then point at whichever row slid into its place. A
   * row that has left the list starts the walk again from the top.
   *
   * A fresh object on every click on purpose: it is what the effect below
   * fires on, so a plan with one gap left focuses that same cell again rather
   * than the button doing nothing.
   */
  const [gapVisit, setGapVisit] = useState<{ rowId: string; cell: CellRef } | null>(null);
  /** The rendered table, so the focus can be found in the DOM that is committed. */
  const tableElement = useRef<HTMLTableElement | null>(null);

  const latestRefresh = useRef(0);
  /**
   * The live subscription, so a refresh can tell it where the read landed.
   *
   * A ref rather than state: reporting the sequence must not re-render, and the
   * stream outlives every render between subscribe and unsubscribe.
   */
  const stream = useRef<ProjectStream | null>(null);

  const refresh = useCallback(async () => {
    // Every mutation and every socket event starts a refresh, and they can
    // finish out of order — an earlier one landing last would replace the table
    // with a tree older than what is on screen, with nothing guaranteed to
    // arrive afterwards and repair it. Only the newest request may write.
    const generation = latestRefresh.current + 1;
    latestRefresh.current = generation;
    const [tree, loadedRoles, loadedTeams, loadedPeople] = await Promise.all([
      api.tree(projectId),
      api.roles(projectId),
      api.listTeams(),
      api.listPeople(),
    ]);
    if (generation !== latestRefresh.current) return;
    setTeams(loadedTeams);
    setPeople(loadedPeople);
    setWorkItems(toTree(tree.workItems));
    setScheduleError(tree.scheduleError);
    setEstimateMethod(tree.estimateMethod);
    setStartDate(tree.startDate);
    // Replaced only when the roles actually differ. Every read returns a fresh
    // array, and `roles` is the one dependency `columns` still has — so a new
    // array on every refresh rebuilt every column definition, which is how a
    // stranger's edit used to take the focus of whoever was mid-word.
    setRoles((current) => (sameRoles(current, loadedRoles) ? current : loadedRoles));
    // Reported after the generation check, so a superseded read cannot move the
    // resume point to a moment whose rows were thrown away.
    stream.current?.seen(tree.seq);
  }, [api, projectId]);

  useEffect(() => {
    void refresh().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'load_failed');
    });
  }, [refresh]);

  // Someone else's edit refetches rather than patching: a create or move can
  // renumber rows this client never touched.
  useEffect(() => {
    if (subscribe === undefined) return undefined;
    const opened = subscribe(projectId, {
      onChange: () => {
        void refresh().catch(() => {
          // A failed refresh leaves the last good tree on screen. Clearing it
          // would lose the user's place over a blip.
        });
      },
      onConnectionChange: setConnected,
    });
    stream.current = opened;
    return () => {
      opened.unsubscribe();
      stream.current = null;
    };
  }, [subscribe, projectId, refresh]);

  /**
   * A drag does not survive the tree changing underneath it.
   *
   * Two things go wrong otherwise, and both reviewers found one each. The
   * browser does not reliably fire `dragend` on a source node that was replaced
   * mid-gesture, so `dragging` could stay set forever — after which merely
   * moving the pointer over the table drew drop markers, and a click moved a row
   * nobody had picked up. And `planMove` reads the *current* tree, so a peer who
   * reparents the target between pickup and release turns "below 010" into a
   * different move than the one on screen when the gesture started.
   *
   * Cancelling is the conservative answer to both: a drag lasts a second or two,
   * a concurrent edit inside it is rare, and being told to try again beats
   * either a stuck table or a row landing somewhere nobody aimed.
   */
  useEffect(() => {
    setDragging((current) => {
      if (current !== null) setError('The table changed while you were dragging — try again.');
      return null;
    });
    setDropHint(null);
  }, [workItems]);

  /**
   * Lands the focus on the cell {@link focusNext} names, once the tree that
   * holds it is on screen.
   *
   * Read from the committed DOM rather than from the render that asked for it:
   * a move is a request and a refetch, and the row it names does not exist in
   * this component's DOM until the refetched tree renders. A browser drops the
   * focus when React reorders the rows — the node is detached and reinserted —
   * so this is what puts it back, in the column the person was working in.
   *
   * The intent is cleared only once the cell is actually found. A refresh from
   * somebody else's edit can land between the request and its own refetch, and
   * clearing on that render would drop the focus on the floor rather than
   * carrying it to the tree that arrives next.
   */
  useEffect(() => {
    const wanted = focusNext.current;
    const table = tableElement.current;
    if (wanted === null || table === null) return;
    const arrived = editableGrid(table).find(
      (candidate) =>
        candidate.cell.rowId === wanted.rowId && candidate.cell.columnId === wanted.columnId,
    );
    if (arrived === undefined) return;
    focusNext.current = null;
    // Proof: left as a lookup that focuses nothing, both `lands in the same
    // column…` tests failed with the focus on the body. That is only visible
    // because those tests drop the focus first, the way a browser does — jsdom
    // keeps it on a node React moves, so without that the check could not fail.
    // Watched, 2026-08-06.
    arrived.input.focus();
  }, [workItems]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        await refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'request_failed');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  /** Every row in the order the table renders them, ignoring collapse. */
  const flat = useMemo(() => {
    const out: TreeRow[] = [];
    const walk = (rows: readonly TreeRow[]): void => {
      for (const row of rows) {
        out.push(row);
        walk(row.subRows);
      }
    };
    walk(workItems);
    return out;
  }, [workItems]);

  /**
   * What the Find box is asking for: which rows stay, which of them are hits,
   * and what has to be open to show them.
   *
   * A pure function of the rows on screen and the query, memoised only so the
   * table's own row model is not rebuilt on every unrelated render — never
   * cached across a change to either. A structural edit refetches the tree and
   * this narrows the tree that came back, which is why a row moved out of the
   * match set disappears from the narrowed view.
   */
  const search = useMemo(() => searchTree(flat, query), [flat, query]);
  /**
   * Whether a search is on — which is the query having something in it other
   * than spaces, and is exactly when {@link searchTree} hands back an overlay.
   *
   * One source of truth rather than a second trim beside it, which is how two
   * answers to one question start to disagree.
   */
  const searching = search.expandedOverlay !== null;

  const siblingsOf = useCallback(
    (parentId: string | null) => flat.filter((row) => row.parentId === parentId),
    [flat],
  );

  /**
   * What this plan is still short of, per leaf and per role.
   *
   * Recomputed from the tree on screen rather than tracked, for the reason
   * nothing here is patched locally: an estimate can arrive from anybody, and
   * a count kept alongside would be the second answer to a question that has
   * one.
   */
  const gaps = useMemo(() => findEstimateGaps(flat, roles), [flat, roles]);

  /**
   * The work items between `rowId` and the root, nearest first.
   *
   * Terminates because `flat` is built by walking the nested tree down from
   * its roots: every row in it is reachable from a root, so its parent chain
   * is finite. A `parentId` cycle leaves both rows out of the tree `toTree`
   * builds, and so out of `flat` and out of this.
   */
  const ancestorsOf = useCallback(
    (rowId: string): string[] => {
      const above: string[] = [];
      let next = flat.find((row) => row.id === rowId)?.parentId ?? null;
      while (next !== null) {
        // Copied to a `const` because the closure below reads it: TypeScript
        // drops the narrowing of a reassigned `let` inside a callback.
        const parentId = next;
        above.push(parentId);
        next = flat.find((row) => row.id === parentId)?.parentId ?? null;
      }
      return above;
    },
    [flat],
  );

  /**
   * Walks to the next leaf the plan has no estimate for, and asks for the
   * focus in the cell that estimates it.
   *
   * The readiness badge's only behaviour. It reads nothing and writes nothing:
   * a plan is judged complete or not by {@link findEstimateGaps}, and this
   * carries the eye there. The cell aimed at is the **first role that leaf is
   * missing** — a row costed for Dev and not QA is stood in front of its QA
   * cell, because pointing at the number that is already there would be the
   * tool asking for work that is done.
   *
   * The walk wraps, and a leaf inside a closed branch opens its ancestors on
   * the way: focusing a cell that is not on screen is a keystroke landing
   * somewhere nobody can see.
   */
  const walkToNextGap = useCallback(() => {
    if (gaps.leaves.length === 0) return;
    const at =
      gapVisit === null ? -1 : gaps.leaves.findIndex((leaf) => leaf.rowId === gapVisit.rowId);
    // `-1` is both "nothing visited yet" and "the row visited has since been
    // estimated, or deleted". Both start at the top, which is the only place
    // that is still true about the list as it now stands.
    // Proof: `-1` folded up to `0` instead, `starts again from the top when
    // the leaf it was on has been estimated` failed one row further down the
    // list than anybody asked for. Watched, 2026-08-06.
    //
    // The modulo wraps. Proof: replaced with a clamp to the last entry, `moves
    // on to the next leaf on the next click, and wraps at the end` failed on
    // the third click, which sat where it was. Watched, 2026-08-06.
    //
    // Both indexes below are in range without a guard: the list is not empty,
    // and `findEstimateGaps` never reports a leaf that is missing no role at
    // all. Guards for them were written and `no-unnecessary-condition` refused
    // them — dead branches, which is exactly the check that cannot fail.
    const next = gaps.leaves[(at + 1) % gaps.leaves.length];
    const roleId = next.missingRoleIds[0];
    // Which cell edits this role depends on the fold: the combined cell while
    // the role is folded, and the optimistic box while it is not, because
    // `combined-trio-entry` deliberately never shows both editors at once.
    // Proof: hard-coded to the folded cell, `lands in the first box while the
    // role is unfolded, where the trio is typed` failed with the focus left on
    // the body — the column it named is not an editable cell while the role is
    // open. Watched, 2026-08-06.
    const columnId = unfoldedRoles.includes(roleId) ? `${roleId}-optimistic` : `${roleId}-final`;
    // Proof: removed, `opens a collapsed branch rather than focusing a cell
    // nobody can see` failed with the child row still hidden. Watched,
    // 2026-08-06.
    setExpanded((current) => ancestorsOf(next.rowId).reduce(expandBranch, current));
    setGapVisit({ rowId: next.rowId, cell: { rowId: next.rowId, columnId } });
  }, [ancestorsOf, gapVisit, gaps, unfoldedRoles]);

  /**
   * Lands the focus on the cell the readiness walk asked for.
   *
   * An effect rather than a `focus()` in the click, because the click may have
   * opened a branch as well: the row it names is not in this component's DOM
   * until the render carrying that expansion is committed. Both state updates
   * are made in one handler, so they batch into one render and this runs after
   * it — reading the committed DOM, which is the only thing that cannot be
   * ahead of itself.
   *
   * A cell that is not there is left alone: a peer's refetch can remove the
   * row between the click and this, which is a modeled condition, and the next
   * click starts the walk from the top anyway.
   */
  useEffect(() => {
    const table = tableElement.current;
    if (gapVisit === null || table === null) return;
    const arrived = editableGrid(table).find(
      (candidate) =>
        candidate.cell.rowId === gapVisit.cell.rowId &&
        candidate.cell.columnId === gapVisit.cell.columnId,
    );
    if (arrived === undefined) return;
    // Proof: removed, five of this block's tests failed with the focus left
    // wherever the last created row had put it. Watched, 2026-08-06.
    arrived.input.focus();
    // Selected, the way every arrival at an estimate cell is: the value at
    // rest is a computed figure, and a caret dropped inside `4` turns the next
    // `2/3/8` into `2/3/84`.
    arrived.input.select();
  }, [gapVisit]);

  /**
   * Resolves a drop and sends the move, or refuses it out loud.
   *
   * The decision itself is `planMove`, which is pure and tested on its own; this
   * only turns the answer into a request or a sentence. Dropping into a
   * collapsed branch opens it, so the row is never moved somewhere invisible.
   */
  const dropOn = useCallback(
    (targetId: string, zone: DropZone, targetShowsChildren: boolean) => {
      const draggedId = dragging;
      setDragging(null);
      setDropHint(null);
      if (draggedId === null) return;

      // Whether the target's children are on screen changes what "below it"
      // means. The row that was dropped on knows; the planner is told rather
      // than left to guess, and stays pure.
      const plan = planMove(flat, draggedId, targetId, zone, targetShowsChildren);
      if (!plan.ok) {
        // `unchanged` says nothing: it is not a mistake, and a message for it
        // would fire every time someone put a row back.
        const message = REFUSAL_MESSAGES[plan.reason];
        if (message !== undefined) setError(message);
        return;
      }

      if (zone === 'into') setExpanded((current) => expandBranch(current, targetId));
      void run(() => api.move(draggedId, plan.parentId, plan.afterId));
    },
    [api, dragging, flat, run],
  );

  const addSibling = useCallback(
    (after: TreeRow) =>
      run(async () => {
        const created = await api.create(projectId, {
          parentId: after.parentId,
          afterId: after.id,
          name: '',
        });
        focusNext.current = { rowId: created.id, columnId: 'name' };
      }),
    [api, projectId, run],
  );

  /**
   * Indent: the row becomes the last child of the sibling above it.
   *
   * `landOn` is the column the focus should come back to. It defaults to the
   * Name cell, which is where Tab is pressed from and where typing continues;
   * an Alt+arrow passes the column it was pressed in instead.
   */
  const indent = useCallback(
    (row: TreeRow, landOn = 'name') =>
      run(async () => {
        const siblings = siblingsOf(row.parentId);
        const index = siblings.findIndex((w) => w.id === row.id);
        // A ternary rather than `siblings.at(index - 1)`: at index 0 there is no
        // row above to indent under, and `.at(-1)` would return the last sibling
        // — quietly moving the row somewhere nobody asked for.
        const newParent = index > 0 ? siblings[index - 1] : undefined;
        if (newParent === undefined) return;
        const lastChild = newParent.subRows.at(-1) ?? null;
        await api.move(row.id, newParent.id, lastChild?.id ?? null);
        // After the move, not before: a refused request then leaves the focus
        // where the person left it rather than sending it after a row that
        // never went anywhere.
        focusNext.current = { rowId: row.id, columnId: landOn };
      }),
    [api, run, siblingsOf],
  );

  /** Outdent: the row becomes the next sibling of its own parent. */
  const outdent = useCallback(
    (row: TreeRow, landOn = 'name') =>
      run(async () => {
        if (row.parentId === null) return;
        const parent = flat.find((w) => w.id === row.parentId);
        if (parent === undefined) return;
        await api.move(row.id, parent.parentId, parent.id);
        // After the move, for the reason `indent` gives.
        focusNext.current = { rowId: row.id, columnId: landOn };
      }),
    [api, flat, run],
  );

  /**
   * Alt+Up / Alt+Down: the row swaps places with the sibling above or below it.
   *
   * Siblings only, and no wrap: at either end of a group the key does nothing.
   * Reparenting is Alt+Left/Right's job and the drag's, and a key that silently
   * moved a row into a different parent because it ran out of siblings would be
   * the outliner equivalent of falling off the end of the page.
   *
   * The request carries **ids read from the tree this render was drawn from** —
   * the parent it stays under and the sibling it lands after — never a computed
   * position. A tree that has since changed then produces a stale-but-valid move
   * for be-01 to judge (it refuses an `afterId` that is not a sibling of the
   * group) rather than an invented place nobody aimed at.
   */
  const moveAmongSiblings = useCallback(
    (row: TreeRow, direction: 'up' | 'down', landOn: string) => {
      const siblings = siblingsOf(row.parentId);
      const at = siblings.findIndex((sibling) => sibling.id === row.id);
      // Not in the tree on screen: a peer deleted the row between the render and
      // the keystroke. A modeled condition, like an arrow key on a cell that has
      // gone — not a move to guess at.
      if (at === -1) return;
      const swapWith = direction === 'down' ? at + 1 : at - 1;
      // The ends. Decided here rather than inside `run` so a held key at the top
      // of a group is not a request and a refetch per repeat.
      // Proof: replaced with a wrap to the other end of the group, `at the first
      // sibling it moves nothing` and `at the last sibling it moves nothing`
      // both failed on a move that was sent. Watched, 2026-08-06.
      if (swapWith < 0 || swapWith >= siblings.length) return;
      // Down: after the sibling it is passing. Up: after that sibling's own
      // predecessor, which is `null` — first in the group — when there is none.
      const afterId =
        direction === 'down'
          ? (siblings[swapWith]?.id ?? null)
          : (siblings[swapWith - 1]?.id ?? null);
      void run(async () => {
        await api.move(row.id, row.parentId, afterId);
        // Asked for only once be-01 has taken the move: a refused request leaves
        // the focus where the person left it rather than chasing a row that did
        // not go anywhere.
        // Proof: `landOn` hard-coded to `name` here and in `indent`/`outdent`,
        // and both `lands in the same column…` tests failed — the Name cell took
        // the focus. Watched, 2026-08-06.
        focusNext.current = { rowId: row.id, columnId: landOn };
      });
    },
    [api, run, siblingsOf],
  );

  /** Removes a wholly empty row, landing the focus on the row above it. */
  const removeEmptyRow = useCallback(
    (row: TreeRow) =>
      run(async () => {
        const at = flat.findIndex((w) => w.id === row.id);
        // A ternary rather than `flat.at(at - 1)`: removing the first row has
        // no row above, and `.at(-1)` would send the focus to the last one.
        const above = at > 0 ? flat[at - 1] : undefined;
        focusNext.current = above === undefined ? null : { rowId: above.id, columnId: 'name' };
        await api.remove(row.id);
      }),
    [api, flat, run],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent, row: TreeRow) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void addSibling(row);
        return;
      }
      if (event.key === 'Tab') {
        const input = event.currentTarget;
        // Either element: the Name cell is a textarea so a long name wraps,
        // and both carry the selection fields `caretOf` reads.
        if (!isCellElement(input)) return;
        const caret = caretOf(input);
        // One rule for the structure keys: they fire at position zero, where
        // the key has no text meaning. Anywhere else — or over a selection —
        // Tab is what it is in any table: the next field, text selected the
        // way the browser's own Tab leaves it. At the grid's edge the key is
        // left to the browser rather than eaten.
        if (caret.atStart && !caret.hasSelection) {
          event.preventDefault();
          void (event.shiftKey ? outdent(row) : indent(row));
          return;
        }
        const moved = focusAdjacentCell(
          input,
          { rowId: row.id, columnId: 'name' },
          event.shiftKey ? -1 : 1,
        );
        if (moved) event.preventDefault();
        return;
      }
      if (event.key === 'Backspace') {
        // At position zero this key deletes nothing, so it is free — and
        // "backspace at the start of the line" is the outliner reflex for
        // "this does not belong under here". A selection keeps the key: the
        // user is deleting text, even when the selection touches the start.
        // Skipped rather than thrown on a non-input target, same as the grid.
        const input = event.currentTarget;
        if (!isCellElement(input)) return;
        const caret = caretOf(input);
        if (!caret.atStart || caret.hasSelection) return;
        if (row.parentId !== null) {
          event.preventDefault();
          void outdent(row);
          return;
        }
        // At root level outdenting has nowhere left to go, so this is Dany's
        // "backspace again": a wholly empty item is removed, the way the last
        // empty bullet of a list is. The Name is judged by the input rather
        // than the committed value — deleting every character and pressing
        // Backspace once more is one gesture, and blur has not happened yet.
        // Anything the item still holds vetoes the removal: content is only
        // ever deleted by the Delete button, never by a keystroke reflex.
        const empty =
          input.value === '' &&
          row.notes === '' &&
          row.subRows.length === 0 &&
          row.dependsOn.length === 0 &&
          Object.keys(row.estimates).length === 0 &&
          // A half-typed estimate is not stored yet — it is a draft waiting for
          // the rest of its trio — and deleting the row would take it with it
          // without ever having shown it as saved. Typing counts as content.
          !Object.keys(drafts).some((key) => key.startsWith(`${row.id}::`));
        if (!empty) return;
        event.preventDefault();
        void removeEmptyRow(row);
      }
    },
    [addSibling, drafts, indent, outdent, removeEmptyRow],
  );

  /**
   * Moves the focus between cells, or lets the browser have the key.
   *
   * The grid is read from the table's own DOM at the moment the key arrives, not
   * from a ref written during render. A ref written in render publishes rows
   * that React may not have committed — or may abandon — and a key pressed in
   * that window would look up a row the DOM does not have. Both reviewers found
   * that; the committed DOM is the only thing that cannot be ahead of itself.
   *
   * `:not([readonly])` is what keeps focus off a parent's rolled-up figures.
   * They are real numbers worth reading, and they are also numbers no keystroke
   * can change, which is the same reason the derived number column is not here.
   */
  const onArrowKey = useCallback(
    (event: React.KeyboardEvent<CellElement>, rowId: string, columnId: string) => {
      const table = event.currentTarget.closest('table');
      if (table === null) return;
      const grid = editableGrid(table);

      const move = nextCell(
        grid.map((g) => g.cell),
        { rowId, columnId },
        event.key,
        caretOf(event.currentTarget),
        {
          isComposing: event.nativeEvent.isComposing,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        },
      );
      if (move === null) return;

      const next = grid.find(
        (g) => g.cell.rowId === move.to.rowId && g.cell.columnId === move.to.columnId,
      )?.input;
      if (next === undefined) return;
      // Only now, and only because the move is happening: an unconditional
      // `preventDefault` would take the caret keys away from every input.
      event.preventDefault();
      next.focus();
      const caret = move.caretAt === 'start' ? 0 : next.value.length;
      next.setSelectionRange(caret, caret);
    },
    [],
  );

  /**
   * Alt and an arrow: restructure the row this cell belongs to.
   *
   * The four keys carry structure from **any** cell and **any** caret position,
   * which is what Tab and Backspace cannot do — those type, so they restructure
   * only at position zero of the Name cell where the keystroke has no text
   * meaning. Alt+arrow types nothing here: `nextCell` already leaves every
   * modified arrow to the browser, so the grid gives nothing up by taking these.
   *
   * `preventDefault` for every arrow this owns, including the edges and the
   * refusals. On macOS an un-prevented Alt+arrow jumps a word or a paragraph
   * and inserts a character into the field as well; a key handled halfway is
   * worse than either outcome. The trade — word-jump is no longer Alt's in
   * these cells — is stated in the change's proposal, and plain arrows and
   * Cmd+arrow still walk the caret.
   *
   * Not attached globally, and not to the dependency picker, the assignee
   * picker or the date inputs: it lives on the cells that already route their
   * own keys, which is where typing happens and where a row is being worked on.
   */
  const onAltMove = useCallback(
    (event: React.KeyboardEvent, row: TreeRow, columnId: string) => {
      // A second modifier is somebody else's shortcut, and an IME composition
      // is using the arrows to pick a candidate — the same rule `nextCell`
      // applies, for the same reason.
      // Proof: narrowed to `!event.altKey` alone, `leaves a composing alt arrow,
      // and one with a second modifier, alone` failed. Watched, 2026-08-06.
      if (!event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
      const move = altMoveFor(event.key);
      if (move === null) return;
      // Proof: removed, nine of this block's tests failed on a key the browser
      // would still have acted on. Watched, 2026-08-06.
      event.preventDefault();
      // A held arrow repeats, and each repeat is a request and a refetch.
      // Dropped rather than queued while one is in flight: the tree the next
      // press would be judged against has not come back yet.
      // Proof: removed, `drops a second alt+down while the first is in flight`
      // failed with two moves asked for. Watched, 2026-08-06.
      if (busy) return;
      // be-01 refuses this too, and is the authority. Refusing here is what
      // lets the reason be read — the drag's own sentence, so one rule does not
      // acquire two wordings.
      // Proof: removed, `refuses to move a frozen row and says why` failed on
      // the move it sent. Watched, 2026-08-06.
      if (row.frozenNumber !== null) {
        setError(FROZEN_REFUSAL);
        return;
      }
      if (move === 'up' || move === 'down') {
        moveAmongSiblings(row, move, columnId);
        return;
      }
      void (move === 'indent' ? indent(row, columnId) : outdent(row, columnId));
    },
    [busy, indent, moveAmongSiblings, outdent],
  );

  /**
   * The callbacks the cells use, read through a ref rather than closed over.
   *
   * `busy` was already kept out of the dependency list below, for the reason
   * that comment gives. It was not enough: `onKeyDown` reaches `flat` through
   * `indent` and `outdent`, and `flat` is rebuilt by every refresh — so every
   * edit by anyone else remounted every cell in the table and took the focus and
   * the half-typed value of whoever was mid-sentence. Two reviewers found it.
   *
   * Assigned during render on purpose, not in an effect: a cell can fire before
   * effects flush after a re-render, and a handler one render stale would act on
   * the tree that was on screen a moment ago.
   */
  /**
   * The numbers of the work items an id list names, in the order given.
   *
   * A dependency is stored by id and read by number, because an id is not
   * something anyone can look at. A row whose predecessor has since been deleted
   * simply drops out of the list rather than rendering a blank chip — the tree
   * refetches on every change, so this cannot be stale for long.
   */
  const numbersOf = useCallback(
    (ids: readonly string[]) =>
      ids.flatMap((id) => {
        const found = flat.find((row) => row.id === id);
        return found === undefined ? [] : [{ id, number: found.number }];
      }),
    [flat],
  );

  /**
   * Adds the dependencies a typed list of *numbers* names — several at once.
   *
   * Numbers, not ids: numbers are what is on screen, and a typo is then a number
   * nobody has rather than a 404 carrying a uuid that means nothing to whoever
   * is reading it.
   *
   * Several, because a row that waits for three things is ordinary and typing
   * `010, 020, 030` once beats three rounds of type-Enter. Each is still its own
   * request — be-01 judges every edge against the graph including the ones just
   * added, so asking it to take a batch would mean teaching it a second way to
   * do the same thing.
   *
   * Partial success is deliberate. A typo in the middle keeps the numbers around
   * it, and one refused as a cycle keeps the rest; what landed is visible in the
   * chips and what did not is named. All-or-nothing here would throw away four
   * correct entries over a fifth.
   */
  const dependOn = useCallback(
    (successorId: string, typed: string) => {
      const { found, unknown } = parseDependencies(typed, flat);
      const notThere = unknownMessage(unknown);
      if (found.length === 0) {
        if (notThere !== null) setError(notThere);
        return;
      }

      // Not routed through `run`, deliberately. `run` models all-or-nothing: it
      // clears the error, does one thing, refreshes, and reports a throw. Here a
      // partial success is a real outcome — some edges land, some are refused,
      // and both the new chips and the reasons have to survive. Through `run`
      // the first `setError` was wiped by its own reset, and a refusal skipped
      // the refresh that would have shown the edges that did land.
      void (async () => {
        setBusy(true);
        setError(null);
        const refused: string[] = [];
        try {
          for (const predecessor of found) {
            try {
              await api.addDependency(successorId, predecessor.id);
            } catch (e: unknown) {
              // Collected rather than rethrown, so one refusal does not abandon
              // the numbers after it. The reason is be-01's own word — `cycle`,
              // `ancestor` — beside the number it belongs to.
              refused.push(`${predecessor.number} (${e instanceof Error ? e.message : 'refused'})`);
            }
          }
          await refresh();
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'request_failed');
          setBusy(false);
          return;
        }
        const problems = [
          notThere,
          refused.length === 0
            ? null
            : `${refused.length === 1 ? 'Refused' : 'These were refused'}: ${refused.join(', ')}.`,
        ].filter((line): line is string => line !== null);
        if (problems.length > 0) setError(problems.join(' '));
        setBusy(false);
      })();
    },
    [api, flat, refresh],
  );

  /**
   * The rows the picker may offer `forRow`, narrowed by what is typed, each
   * marked with the refusal be-01 would answer with.
   *
   * Recomputed from `flat` on every render rather than remembered: a peer's
   * edit lands as a whole new tree, and a list that kept yesterday's marks
   * would grey a row that has since moved out of this one.
   */
  const depEntriesFor = useCallback(
    (forRow: { id: string; dependsOn: readonly string[] }, typed: string) =>
      pickerEntries(flat, forRow, typed),
    [flat],
  );

  /**
   * Adds the picked dependency and keeps the picker open, cleared, for the
   * next one — picking three predecessors is one visit, not three.
   */
  const pickDependency = useCallback(
    (successorId: string, predecessorId: string) => {
      setDepPicker((current) =>
        current === null ? null : { ...current, typed: '', highlightId: null },
      );
      void run(() => api.addDependency(successorId, predecessorId));
    },
    [api, run],
  );

  /** Moves the picker highlight by `delta` over `entryIds`, clamped. */
  const moveDepHighlight = useCallback(
    (rowId: string, delta: 1 | -1, entryIds: readonly string[]) => {
      if (entryIds.length === 0) return;
      setDepPicker((current) => {
        if (current?.rowId !== rowId) return current;
        const at = current.highlightId === null ? -1 : entryIds.indexOf(current.highlightId);
        // From nothing highlighted — or a highlight whose row left the list —
        // Down enters at the top and Up at the bottom.
        const from = at === -1 ? (delta === 1 ? -1 : entryIds.length) : at;
        const to = Math.min(entryIds.length - 1, Math.max(0, from + delta));
        return { ...current, highlightId: entryIds[to] ?? null };
      });
    },
    [],
  );

  // A roles change rebuilds the column definitions and remounts every cell —
  // the one remount this table still allows itself. React fires no blur on an
  // unmounted input, so an open picker would stay open under a fresh, unfocused
  // cell with no keyboard attached to it. Closed instead.
  useEffect(() => {
    setDepPicker(null);
  }, [roles]);

  /**
   * Whether the numbers in the schedule columns mean anything.
   *
   * When be-01 could not order the graph it sends every row the same zeroed
   * schedule, and printing those is a page of `0`s that reads as "everything
   * happens on day zero" — a confident wrong answer of exactly the kind the
   * banner above is there to prevent. A reviewer caught the columns still doing
   * it while `verify.md` claimed they did not.
   */
  /**
   * One trio as it currently reads: the draft where there is one, the stored
   * figure where there is not.
   *
   * The draft wins because it is what the person typed and has not been told
   * off about yet. A stored figure showing through under it would be the tool
   * quietly disagreeing with the box.
   */
  const typedTrio = useCallback(
    (row: TreeRow, roleId: string): TypedTrio => {
      const stored = row.estimates[roleId];
      const read = (point: Point): string =>
        drafts[draftKey(row.id, roleId, point)] ?? showDays(stored, point);
      return {
        optimistic: read('optimistic'),
        realistic: read('realistic'),
        pessimistic: read('pessimistic'),
      };
    },
    [drafts],
  );

  const estimateValue = useCallback(
    (row: TreeRow, roleId: string, point: Point): string => typedTrio(row, roleId)[point],
    [typedTrio],
  );

  /**
   * What is wrong with this row-and-role's trio, or null.
   *
   * A parent's figures are rolled up rather than typed, so they are never
   * anyone's mistake: complaining about a sum the tool computed would be the
   * tool telling somebody off for its own arithmetic.
   */
  const trioProblemFor = useCallback(
    (row: TreeRow, roleId: string) => (row.rolledUp ? null : trioProblem(typedTrio(row, roleId))),
    [typedTrio],
  );

  /**
   * Forgets every draft of one row-and-role — the three boxes' and the folded
   * cell's — once be-01 has the answer.
   *
   * All four together, whichever of them was typed: they are drafts of one
   * estimate, and leaving the others behind would put a stale entry back on
   * screen the moment the role was folded or unfolded.
   *
   * Rebuilt without those keys rather than deleted from a copy: `delete` on a
   * computed key is banned here, and filtering says the same thing without
   * reaching into the object twice.
   */
  const forgetEstimateDrafts = useCallback((rowId: string, roleId: string) => {
    setDrafts((current) => dropDrafts(current, estimateDraftKeys(rowId, roleId)));
  }, []);

  /**
   * Takes a typed estimate box: holds it as a draft, and either sends the trio
   * once it can stand on its own or clears the stored one it just emptied.
   *
   * Nothing is repaired and nothing partial is sent — that is the whole of
   * Dany's "never edit estimates", and emptying boxes does not weaken it. A
   * deletion is only all three boxes reading empty against a trio be-01
   * actually holds; one or two empty boxes is a half-filled trio and stays a
   * complaint. The drafts for the trio are dropped only once be-01 has
   * accepted the write, so a refused request leaves what was typed on screen
   * to be corrected rather than swallowed.
   *
   * Proof: making the clear fire on `!== null` drafts instead of an empty trio
   * — i.e. on one emptied box — fails `does not clear when only two of the
   * three boxes are emptied` in `wbs-table.test.tsx`; watched, 2026-08-06.
   */
  const commitEstimate = useCallback(
    (row: TreeRow, roleId: string, point: Point, typed: string) => {
      const next = { ...typedTrio(row, roleId), [point]: typed };
      setDrafts((current) => ({
        // A box edited last drops the folded cell's pending shorthand for this
        // trio: one row and role has one draft, whichever way it was typed.
        // Proof: left as `...current`, `lets a box replace what the folded cell
        // was holding` fails — the refused `8/3/2` came back over the box's
        // own complaint. Watched, 2026-08-06.
        ...dropDrafts(current, new Set([combinedDraftKey(row.id, roleId)])),
        [draftKey(row.id, roleId, point)]: typed,
      }));
      const days = sendableTrio(next);
      if (days === null) {
        // `hasOwn` rather than a truthiness test: what matters is whether
        // be-01 holds a trio for this row and role at all, and a stored
        // `0 / 0 / 0` is one.
        if (isTrioEmpty(next) && Object.hasOwn(row.estimates, roleId)) {
          void run(async () => {
            await api.clearEstimate(row.id, roleId);
            forgetEstimateDrafts(row.id, roleId);
          });
        }
        return;
      }
      void run(async () => {
        await api.setEstimate(row.id, roleId, days);
        forgetEstimateDrafts(row.id, roleId);
      });
    },
    [api, forgetEstimateDrafts, run, typedTrio],
  );

  /**
   * What the folded role column's cell reads: the pending shorthand if there
   * is one, and otherwise be-01's computed final figure.
   *
   * The one cell in the table whose value at rest is not what typing into it
   * takes. That is deliberate and it is the point: a plan is read by the final
   * figure, and the trio behind it is what an estimator types. The draft wins
   * while it exists for the same reason a box's does — it is what the person
   * typed and has not been told off about yet.
   */
  const combinedValue = useCallback(
    (row: TreeRow, roleId: string): string =>
      drafts[combinedDraftKey(row.id, roleId)] ?? showFinal(row.finalDays[roleId]),
    [drafts],
  );

  /**
   * What is wrong with what the folded column is showing for one row and role,
   * or null.
   *
   * Two sources, never both at once: the folded cell's own shorthand if
   * something is pending there, and otherwise the three boxes' trio — which is
   * the complaint `role-columns-fold` put on the figure so a fold could not
   * hide one. Precedence rather than a merge, because the draft that exists is
   * the one somebody typed last, and it is the only one they can correct
   * without unfolding.
   */
  const combinedProblem = useCallback(
    (row: TreeRow, roleId: string): string | null => {
      // `hasOwn` rather than a nullish test: an empty draft is a person having
      // just emptied the cell, and it is the entry that reads as a clear —
      // reading it as "nothing pending here" would show the stored figure back
      // over the emptying.
      // Proof: returning null instead of the boxes' complaint fails `a folded
      // role cannot hide a complaint`, `marks the folded cell when the boxes
      // hold a trio that saves nothing` and `lets a box replace what the
      // folded cell was holding`. Watched, 2026-08-06.
      const key = combinedDraftKey(row.id, roleId);
      if (!Object.hasOwn(drafts, key)) return trioProblemFor(row, roleId)?.message ?? null;
      const entry = parseTrioShorthand(drafts[key]);
      return entry.kind === 'problem' ? entry.message : null;
    },
    [drafts, trioProblemFor],
  );

  /**
   * Takes a whole trio typed into one cell as `o/r/p`, and sends it in one
   * request — or holds it as a draft and complains, exactly as a box does.
   *
   * The shorthand is the estimating loop's short path: the role stays folded,
   * one cell takes `2/3/8`, and be-01 is asked once rather than three times.
   * `5` means `5/5/5` because the person typed one number meaning three equal
   * ones; nothing here invents a figure, and a trio that runs backwards, has
   * the wrong count or is not a number is refused whole — see
   * {@link parseTrioShorthand}.
   *
   * Emptying the cell against a stored trio clears it through the same
   * `clearEstimate` the three emptied boxes use; emptying it against nothing
   * stored asks for nothing.
   *
   * Proof: made to send a two-number entry (`parseTrioShorthand` returning a
   * trio for `2/3`), `sends nothing for two numbers where three were needed`
   * in `wbs-table.test.tsx` fails; watched, 2026-08-06.
   */
  const commitCombinedEstimate = useCallback(
    (row: TreeRow, roleId: string, typed: string) => {
      const entry = parseTrioShorthand(typed);
      setDrafts((current) => ({
        // Last edit wins: this entry replaces whatever the three boxes were
        // holding unsent for the same trio. Translating it into three box
        // drafts instead would put figures into boxes nobody typed them into.
        // Proof: left as `...current`, `lets a folded entry replace what the
        // boxes were holding` fails — the box still held a `7` nobody could
        // see. Watched, 2026-08-06.
        ...dropDrafts(current, new Set(POINTS.map((point) => draftKey(row.id, roleId, point)))),
        [combinedDraftKey(row.id, roleId)]: typed,
      }));
      if (entry.kind === 'problem') return;
      if (entry.kind === 'empty') {
        // `hasOwn`, as above: a stored `0 / 0 / 0` is an estimate to clear.
        // Proof: inverted, `clears the stored trio when the cell is emptied`
        // and `asks for nothing when a cell with no estimate is emptied` both
        // fail — one clear lost, one deletion posted per cell tabbed through.
        // Watched, 2026-08-06.
        if (!Object.hasOwn(row.estimates, roleId)) return;
        void run(async () => {
          await api.clearEstimate(row.id, roleId);
          forgetEstimateDrafts(row.id, roleId);
        });
        return;
      }
      void run(async () => {
        await api.setEstimate(row.id, roleId, entry.days);
        forgetEstimateDrafts(row.id, roleId);
      });
    },
    [api, forgetEstimateDrafts, run],
  );

  /**
   * Sets or clears one work item's "not before" day.
   *
   * A floor rather than a pin, which be-01 enforces: everything that depends
   * on this row still moves with it, and a predecessor finishing later still
   * wins. Dany's call — it keeps the calendar and the dependency tree from
   * being able to contradict each other.
   */
  const setNotBefore = useCallback(
    (id: string, day: string | null) => {
      void run(() => api.patch(id, { startNoEarlierThan: day }));
    },
    [api, run],
  );

  /** Labels a work item with a team, or takes the label off. */
  const setTeamOf = useCallback(
    (id: string, serviceTeamId: string | null) => {
      void run(() => api.patch(id, { serviceTeamId }));
    },
    [api, run],
  );

  /** Adds a team nobody had yet and labels the work item with it, in one go. */
  const createTeamFor = useCallback(
    (id: string, name: string) => {
      void run(async () => {
        // be-01 is idempotent by name, so two browsers typing `Platform` at
        // once end up on one team rather than two.
        const team = await api.addTeam(name);
        await api.patch(id, { serviceTeamId: team.id });
      });
    },
    [api, run],
  );

  const assignTo = useCallback(
    (id: string, roleId: string, personId: string | null) => {
      void run(() => api.assign(id, roleId, personId));
    },
    [api, run],
  );

  /**
   * Adds a person and assigns them, joining them to the work item's team.
   *
   * A person typed in against a work item labelled `Billing` almost certainly
   * belongs to Billing, and saying so beats leaving every new person a free
   * agent for somebody to sort out later. Typed in against an unlabelled work
   * item, they are a free agent — which is the absence of a team rather than
   * membership of one.
   */
  const createPersonFor = useCallback(
    (row: TreeRow, roleId: string, name: string) => {
      void run(async () => {
        const person = await api.addPerson(
          name,
          row.serviceTeamId === null ? [] : [row.serviceTeamId],
        );
        await api.assign(row.id, roleId, person.id);
      });
    },
    [api, run],
  );

  /** Changes how the project turns its trios into one number, for everybody. */
  const chooseEstimateMethod = useCallback(
    (method: EstimateMethod) => {
      void run(() => api.setEstimateMethod(projectId, method));
    },
    [api, projectId, run],
  );

  const hasSchedule = useCallback(() => scheduleError === null, [scheduleError]);
  const showSchedule = useCallback(
    (days: number) => (scheduleError === null ? showDay(days) : '—'),
    [scheduleError],
  );

  const live = useRef({
    api,
    projectId,
    run,
    onKeyDown,
    onArrowKey,
    onAltMove,
    setDragging,
    setDropHint,
    numbersOf,
    dependOn,
    hasSchedule,
    showSchedule,
    depPicker,
    setDepPicker,
    depEntriesFor,
    pickDependency,
    moveDepHighlight,
    estimateValue,
    trioProblemFor,
    commitEstimate,
    combinedValue,
    combinedProblem,
    commitCombinedEstimate,
    hoveredNotes,
    setHoveredNotes,
    setNotBefore,
    startDate,
    teams,
    people,
    setTeamOf,
    createTeamFor,
    assignTo,
    createPersonFor,
    toggleRole,
    matchIds: search.matchIds,
    searching,
  });
  live.current = {
    api,
    projectId,
    run,
    onKeyDown,
    onArrowKey,
    onAltMove,
    setDragging,
    setDropHint,
    numbersOf,
    dependOn,
    hasSchedule,
    showSchedule,
    depPicker,
    setDepPicker,
    depEntriesFor,
    pickDependency,
    moveDepHighlight,
    estimateValue,
    trioProblemFor,
    commitEstimate,
    combinedValue,
    combinedProblem,
    commitCombinedEstimate,
    hoveredNotes,
    setHoveredNotes,
    setNotBefore,
    startDate,
    teams,
    people,
    setTeamOf,
    createTeamFor,
    assignTo,
    createPersonFor,
    toggleRole,
    matchIds: search.matchIds,
    searching,
  };

  const columns = useMemo(
    () => [
      column.display({
        id: 'drag',
        header: () => <span aria-label="Reorder" />,
        cell: ({ row }) => {
          // A frozen row keeps its handle, and says on it why the handle will
          // not help. Hiding it was the first attempt, and it made the refusal
          // unreachable: nothing could explain the freeze to someone who tried,
          // and the test that claimed to prove the refusal was proving only that
          // the handle was gone. Both reviewers found that test.
          const frozen = row.original.frozenNumber !== null;
          return (
            <span
              draggable
              role="button"
              tabIndex={-1}
              aria-disabled={frozen}
              aria-label={`Reorder ${row.original.number}`}
              title={
                frozen ? 'Frozen — unfreeze this row before moving it' : 'Drag to move this row'
              }
              style={{ cursor: frozen ? 'not-allowed' : 'grab' }}
              onDragStart={() => {
                live.current.setDragging(row.original.id);
              }}
              onDragEnd={() => {
                live.current.setDragging(null);
                live.current.setDropHint(null);
              }}
            >
              ⠿
            </span>
          );
        },
      }),
      column.display({
        id: 'number',
        header: 'Number',
        cell: ({ row }) => (
          <span style={{ paddingLeft: indentFor(row.depth), whiteSpace: 'nowrap' }}>
            {/*
              No triangles while a search is on. What is open during a search
              is the search's answer — every kept row, so no match can be
              hidden — and this control would have to either lie about that or
              close a branch holding a hit. Its state also lives in the
              reader's own expansion, which the search deliberately does not
              touch, so a click here would appear to do nothing.
            */}
            {row.getCanExpand() && !live.current.searching ? (
              <button
                type="button"
                aria-label={`${row.getIsExpanded() ? 'Collapse' : 'Expand'} ${row.original.number}`}
                onClick={row.getToggleExpandedHandler()}
              >
                {row.getIsExpanded() ? '▾' : '▸'}
              </button>
            ) : null}
            {row.original.frozenNumber !== null && <span aria-label="Number is frozen">🔒</span>}
            <span data-number>{row.original.number}</span>
          </span>
        ),
      }),
      column.display({
        id: 'name',
        header: 'Name',
        cell: ({ row }) => {
          // Why this row is on screen, at a glance: a hit is tinted, and every
          // other row in a narrowed table is context — an ancestor placing a
          // hit, or work underneath one. Read through `live` rather than closed
          // over, for the reason the dependency list below gives: `columns`
          // must not depend on anything that changes per keystroke.
          // Proof: hard-coded to false, `marks the row that matched, so the
          // rows around it read as context` and `shows the whole subtree under
          // a matched parent` failed — the second because it is the mark that
          // says the parent is the hit and the subtree is not. Watched,
          // 2026-08-06.
          const matched = live.current.matchIds.has(row.original.id);
          return (
            <CellInput
              aria-label={`Name of ${row.original.number}`}
              data-name-input={row.original.id}
              data-match={matched ? 'true' : undefined}
              data-cell={cellKey(row.original.id, 'name')}
              // A work item's name is a sentence, not a word, and an input
              // scrolls it out of sight one character at a time. A textarea
              // wraps, and `autoSize` is what stops it wrapping into a line
              // nobody can see: the box is as tall as its name, focused or not.
              // Enter is still "new work item" — the table preventDefaults it.
              multiline
              autoSize
              rows={1}
              maxRestRows={4}
              style={{
                width: '22em',
                resize: 'vertical',
                font: 'inherit',
                ...(matched ? { background: MATCH_TINT } : {}),
              }}
              // A callback ref rather than an effect: it fires exactly when this
              // node is attached, so the focus cannot be lost to a later render
              // arriving before the row does. That race is what
              // Enter-Enter-Enter depends on not losing. It fires on every render
              // rather than only the first, which the id check already tolerated.
              onAttach={(element) => {
                const wanted = focusNext.current;
                // The Name column only: any other column is a cell this one has
                // no business focusing, and it is landed on from the committed
                // DOM by the effect that reads `focusNext` after a refresh.
                if (wanted?.rowId !== row.original.id || wanted.columnId !== 'name') return;
                focusNext.current = null;
                element.focus();
              }}
              value={row.original.name}
              commit={(typed) => {
                void live.current.run(() =>
                  live.current.api.patch(row.original.id, { name: typed }),
                );
              }}
              onKeyDown={(e) => {
                live.current.onAltMove(e, row.original, 'name');
                live.current.onKeyDown(e, row.original);
                live.current.onArrowKey(e, row.original.id, 'name');
              }}
            />
          );
        },
      }),
      column.display({
        id: 'depends',
        header: 'Depends on',
        cell: ({ row }) => {
          const numbers = live.current.numbersOf(row.original.dependsOn);
          // This cell's picker, or null while it is closed or under another row.
          const picker =
            live.current.depPicker?.rowId === row.original.id ? live.current.depPicker : null;
          const entries =
            picker === null ? [] : live.current.depEntriesFor(row.original, picker.typed);
          // The entries a click or an Enter may actually take. A marked entry
          // is on screen to be read, not to be picked: be-01 would refuse it,
          // and the mark is this cell saying so before the click rather than
          // after it.
          const pickable = entries.filter((entry) => entry.refusal === undefined);
          // Resolved by id at render, so a highlight whose row has left the
          // list — or has since become one be-01 would refuse — is simply
          // nothing rather than somebody else's row.
          const activeOption =
            picker?.highlightId == null
              ? undefined
              : pickable.find((entry) => entry.id === picker.highlightId);
          const open = picker !== null && entries.length > 0;
          return (
            <span style={{ whiteSpace: 'nowrap', position: 'relative', display: 'inline-block' }}>
              {numbers.map(({ id, number }) => (
                <button
                  key={id}
                  type="button"
                  aria-label={`Stop ${row.original.number} waiting for ${number}`}
                  title="Remove this dependency"
                  onClick={() =>
                    void live.current.run(() =>
                      live.current.api.removeDependency(row.original.id, id),
                    )
                  }
                >
                  {number} ✕
                </button>
              ))}
              <input
                aria-label={`Add a dependency to ${row.original.number}`}
                role="combobox"
                aria-expanded={open}
                aria-controls={open ? `dep-options-${row.original.id}` : undefined}
                aria-activedescendant={
                  activeOption === undefined ? undefined : `dep-option-${activeOption.id}`
                }
                aria-autocomplete="list"
                placeholder="search, or 010, 020"
                title="Type to search by number or name, or a list of numbers separated by commas or spaces"
                size={14}
                data-depends-input={row.original.id}
                value={picker?.typed ?? ''}
                onFocus={() => {
                  live.current.setDepPicker({
                    rowId: row.original.id,
                    typed: '',
                    highlightId: null,
                  });
                }}
                onBlur={() => {
                  live.current.setDepPicker((current) =>
                    current?.rowId === row.original.id ? null : current,
                  );
                }}
                onChange={(e) => {
                  const typed = e.currentTarget.value;
                  // Typing is aiming at the narrowed-to entry; emptying the
                  // cell aims at nothing again.
                  const first =
                    typed.trim() === ''
                      ? undefined
                      : live.current
                          .depEntriesFor(row.original, typed)
                          .find((entry) => entry.refusal === undefined);
                  live.current.setDepPicker({
                    rowId: row.original.id,
                    typed,
                    highlightId: first?.id ?? null,
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    live.current.moveDepHighlight(
                      row.original.id,
                      e.key === 'ArrowDown' ? 1 : -1,
                      // The refused entries are not in this list, so the
                      // highlight steps over them: a highlight that could stop
                      // on one would be an Enter that does nothing, which is
                      // the click this change exists to prevent.
                      pickable.map((entry) => entry.id),
                    );
                    return;
                  }
                  if (e.key === 'Escape') {
                    live.current.setDepPicker(null);
                    return;
                  }
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (activeOption !== undefined) {
                    live.current.pickDependency(row.original.id, activeOption.id);
                    return;
                  }
                  // No highlight to take — the typed flow: one number or a
                  // separated list of them, exactly as this cell always worked.
                  const typed = picker?.typed ?? e.currentTarget.value;
                  if (typed.trim() === '') return;
                  live.current.dependOn(row.original.id, typed);
                  live.current.setDepPicker((current) =>
                    current === null ? null : { ...current, typed: '', highlightId: null },
                  );
                }}
              />
              {picker !== null && entries.length > 0 && (
                <ul
                  role="listbox"
                  id={`dep-options-${row.original.id}`}
                  aria-label={`Work items ${row.original.number} can depend on`}
                  // One preventDefault for the whole list — options included,
                  // by bubbling. A mousedown anywhere here must not take the
                  // input's focus: on an option, blur would close the list
                  // before the click could pick; on the scrollbar, the list
                  // unmounted under the pointer and everything past the fold
                  // was unpickable by mouse (cross review #6).
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    background: '#fff',
                    border: '1px solid #ccc',
                    maxHeight: 200,
                    overflowY: 'auto',
                    zIndex: 10,
                    minWidth: '100%',
                  }}
                >
                  {entries.map((entry) => (
                    // The ARIA combobox pattern is the boundary that makes this
                    // safe: options are not focusable, and the keyboard drives
                    // them from the input above through aria-activedescendant
                    // (ArrowUp/ArrowDown/Enter there).
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                    <li
                      key={entry.id}
                      id={`dep-option-${entry.id}`}
                      role="option"
                      aria-selected={entry.id === activeOption?.id}
                      // Shown and refused, rather than quietly absent: a row
                      // that vanishes from the list reads as a bug in the tool,
                      // and one that says why it cannot be picked teaches the
                      // shape of the plan.
                      aria-disabled={entry.refusal !== undefined}
                      // The list scrolls; the highlighted entry must be where
                      // the eye is. jsdom has no scrollIntoView, hence the
                      // typeof — that boundary is the test environment, not a
                      // browser this will meet.
                      ref={(element) => {
                        if (
                          entry.id === activeOption?.id &&
                          element !== null &&
                          typeof element.scrollIntoView === 'function'
                        ) {
                          element.scrollIntoView({ block: 'nearest' });
                        }
                      }}
                      style={{
                        padding: '2px 6px',
                        cursor: entry.refusal === undefined ? 'pointer' : 'default',
                        whiteSpace: 'nowrap',
                        color: entry.refusal === undefined ? undefined : '#999',
                        background: entry.id === activeOption?.id ? '#e8f0fe' : undefined,
                      }}
                      onClick={() => {
                        if (entry.refusal !== undefined) return;
                        live.current.pickDependency(row.original.id, entry.id);
                      }}
                    >
                      {entry.number} {entry.name}
                      {entry.refusal === undefined ? '' : ` — ${REFUSAL_SUFFIX[entry.refusal]}`}
                    </li>
                  ))}
                </ul>
              )}
            </span>
          );
        },
      }),
      column.display({
        id: 'team',
        header: 'Service/team',
        cell: ({ row }) => (
          <CreatablePicker
            label={`Service or team for ${row.original.number}`}
            placeholder="search or add"
            entries={live.current.teams}
            value={row.original.serviceTeamId}
            onChoose={(id) => {
              live.current.setTeamOf(row.original.id, id);
            }}
            onCreate={(name) => {
              live.current.createTeamFor(row.original.id, name);
            }}
            onClear={() => {
              live.current.setTeamOf(row.original.id, null);
            }}
          />
        ),
      }),
      ...roles.flatMap((role) => {
        const unfolded = unfoldedRoles.includes(role.id);
        return [
          column.display({
            id: `${role.id}-final`,
            // The toggle lives on the column that never goes away, so nothing
            // jumps when the group opens: it extends to the right of this one.
            header: () => (
              <button
                type="button"
                aria-expanded={unfolded}
                aria-label={`${unfolded ? 'Fold' : 'Unfold'} ${role.name} estimates`}
                title={
                  unfolded
                    ? 'Hide the three-point estimate and assignee'
                    : 'Show the three-point estimate and assignee'
                }
                onClick={() => {
                  live.current.toggleRole(role.id);
                }}
                style={{ font: 'inherit', fontWeight: 'inherit' }}
              >
                {role.name} {unfolded ? '▾' : '▸'}
              </button>
            ),
            cell: ({ row }) => {
              // A folded role must not be able to hide a complaint: a typed
              // trio that saves nothing stays visible as a mark on the figure
              // the fold leaves behind.
              const problem = unfolded ? null : live.current.combinedProblem(row.original, role.id);
              // The whole trio in one cell, but only where both halves of that
              // sentence hold: a folded role, so the three boxes are not on
              // screen to disagree with it, and a leaf, because a parent's
              // figure is a sum of what is below it and nothing to type into.
              const shorthand = !unfolded && !row.original.rolledUp;
              return (
                <span
                  data-final={role.id}
                  // On the wrapper as well as on the input below: the marker is
                  // its own hover target, and it is the half a reader of a
                  // folded plan sees first.
                  title={problem ?? undefined}
                  style={{ fontWeight: 600, color: problem === null ? undefined : '#c00' }}
                >
                  {shorthand ? (
                    <CellInput
                      aria-label={`${role.name} estimate for ${row.original.number}`}
                      // In the keyboard grid, which is what makes Down-type-
                      // Down-type work down a role's column. Proof: dropped,
                      // `is a cell of the keyboard grid, so a column can be
                      // typed down` fails. Watched, 2026-08-06.
                      data-cell={cellKey(row.original.id, `${role.id}-final`)}
                      size={7}
                      placeholder="o/r/p"
                      aria-invalid={problem !== null}
                      title={problem ?? SHORTHAND_HELP}
                      onKeyDown={(e) => {
                        live.current.onAltMove(e, row.original, `${role.id}-final`);
                        live.current.onArrowKey(e, row.original.id, `${role.id}-final`);
                      }}
                      // Selected on arrival, because the value at rest is a
                      // computed figure and the syntax is a trio: there is no
                      // sensible edit to make *inside* `4`, and a caret dropped
                      // into it turns `2/3/8` into `2/3/84`.
                      onFocus={(e) => {
                        e.currentTarget.select();
                      }}
                      style={{
                        width: '6em',
                        font: 'inherit',
                        fontWeight: 600,
                        ...(problem === null ? {} : { background: '#fde8e8', borderColor: '#c00' }),
                      }}
                      value={live.current.combinedValue(row.original, role.id)}
                      commit={(typed) => {
                        live.current.commitCombinedEstimate(row.original, role.id, typed);
                      }}
                    />
                  ) : (
                    showFinal(row.original.finalDays[role.id])
                  )}
                  {problem !== null && ' !'}
                </span>
              );
            },
          }),
          ...(!unfolded
            ? []
            : [
                ...POINTS.map((point) =>
                  column.display({
                    id: `${role.id}-${point}`,
                    // The role's name is on the group column; repeating it three
                    // times over is how the headers came to set the table's width.
                    header: point,
                    cell: ({ row }) => {
                      const problem = live.current.trioProblemFor(row.original, role.id);
                      const wrong = problem?.points.includes(point) ?? false;
                      return (
                        <CellInput
                          aria-label={`${role.name} ${point} for ${row.original.number}`}
                          data-cell={cellKey(row.original.id, `${role.id}-${point}`)}
                          // Narrow on purpose: these hold a number of days, and a box
                          // sized for a sentence reads as if it wants one.
                          size={5}
                          aria-invalid={wrong}
                          title={problem?.message}
                          onKeyDown={(e) => {
                            live.current.onAltMove(e, row.original, `${role.id}-${point}`);
                            live.current.onArrowKey(e, row.original.id, `${role.id}-${point}`);
                          }}
                          // A parent's figures are sums of what is below it, so the cell is
                          // shown and not editable — greyed rather than blank, because the
                          // number is real and worth reading.
                          readOnly={row.original.rolledUp}
                          style={
                            row.original.rolledUp
                              ? { color: '#666', background: '#f4f4f4', width: '4.5em' }
                              : wrong
                                ? { background: '#fde8e8', borderColor: '#c00', width: '4.5em' }
                                : { width: '4.5em' }
                          }
                          value={live.current.estimateValue(row.original, role.id, point)}
                          commit={(typed) => {
                            if (row.original.rolledUp) return;
                            live.current.commitEstimate(row.original, role.id, point, typed);
                          }}
                        />
                      );
                    },
                  }),
                ),
                column.display({
                  id: `${role.id}-assignee`,
                  header: 'by',
                  cell: ({ row }) => {
                    const assigned = row.original.assignees[role.id];
                    // Nobody on this role, and exactly one person on another: they are
                    // assumed to be doing this phase too, so the cell says so rather
                    // than reading as unassigned. Assigning anyone here ends the
                    // assumption by itself.
                    const assumed = assigned === undefined ? row.original.doesEveryPhase : null;
                    const nameOf = (id: string) =>
                      live.current.people.find((each) => each.id === id)?.name ?? '(unknown)';
                    return (
                      <span style={{ whiteSpace: 'nowrap' }}>
                        <CreatablePicker
                          label={`${role.name} assignee for ${row.original.number}`}
                          placeholder="search or add"
                          entries={live.current.people.map((each) => ({
                            id: each.id,
                            name: each.name,
                            detail:
                              each.teamIds.length === 0
                                ? 'free agent'
                                : each.teamIds
                                    .map(
                                      (id) =>
                                        live.current.teams.find((team) => team.id === id)?.name ??
                                        '?',
                                    )
                                    .join(', '),
                          }))}
                          value={assigned ?? null}
                          onChoose={(id) => {
                            live.current.assignTo(row.original.id, role.id, id);
                          }}
                          onCreate={(name) => {
                            live.current.createPersonFor(row.original, role.id, name);
                          }}
                          onClear={() => {
                            live.current.assignTo(row.original.id, role.id, null);
                          }}
                        />
                        {assumed !== null && (
                          <span
                            data-assumed={role.id}
                            title="Only one person is assigned, so they are assumed to do this phase too"
                            style={{ color: '#666', marginLeft: 4 }}
                          >
                            ({nameOf(assumed)})
                          </span>
                        )}
                      </span>
                    );
                  },
                }),
              ]),
        ];
      }),
      column.display({
        id: 'final-total',
        header: 'Total days',
        cell: ({ row }) => (
          <span data-final-total style={{ fontWeight: 600 }}>
            {showDay(row.original.finalTotal)}
          </span>
        ),
      }),
      column.display({
        id: 'not-before',
        header: 'Not before',
        cell: ({ row }) => (
          <input
            type="date"
            aria-label={`Earliest start for ${row.original.number}`}
            // Disabled without a project start date, because there is then no
            // day zero to count from and be-01 ignores the constraint
            // entirely. A date that saves and does nothing is worse than one
            // the field will not take.
            disabled={live.current.startDate === null}
            title={
              live.current.startDate === null
                ? 'Set the project start date first — without one there are no dates to constrain.'
                : 'This work item may not start before this day. Its dependencies can still push it later.'
            }
            data-not-before={row.original.id}
            style={{ font: 'inherit' }}
            value={row.original.startNoEarlierThan ?? ''}
            onChange={(e) => {
              // A date input reports '' when cleared, which is the caller
              // saying "no constraint" rather than "an empty date".
              const typed = e.target.value;
              live.current.setNotBefore(row.original.id, typed === '' ? null : typed);
            }}
          />
        ),
      }),
      column.display({
        id: 'start',
        // A bare `2.5` under "Starts" reads as a date that failed to load. The
        // header says which of the two it is.
        header: () => (live.current.startDate === null ? 'Starts (day)' : 'Starts'),
        cell: ({ row }) => (
          <span data-start>
            {row.original.dates?.startsOn ??
              live.current.showSchedule(row.original.schedule.earliestStart)}
          </span>
        ),
      }),
      column.display({
        id: 'finish',
        header: () => (live.current.startDate === null ? 'Ends (day)' : 'Ends'),
        cell: ({ row }) => (
          <span data-finish title={row.original.schedule.estimated ? undefined : 'No estimate yet'}>
            {row.original.dates?.endsOn ??
              live.current.showSchedule(row.original.schedule.earliestFinish)}
            {live.current.hasSchedule() && !row.original.schedule.estimated ? ' ?' : ''}
          </span>
        ),
      }),
      column.display({
        id: 'float',
        header: 'Slack (days)',
        cell: ({ row }) => (
          <span data-float>
            {!live.current.hasSchedule()
              ? '—'
              : row.original.schedule.critical
                ? '— critical'
                : showDay(row.original.schedule.float)}
          </span>
        ),
      }),
      column.display({
        id: 'notes',
        header: 'Notes',
        cell: ({ row }) => {
          const hovered = live.current.hoveredNotes === row.original.id;
          return (
            <span
              style={{ position: 'relative', display: 'inline-block' }}
              onMouseEnter={() => {
                live.current.setHoveredNotes(row.original.id);
              }}
              onMouseLeave={() => {
                live.current.setHoveredNotes((current) =>
                  current === row.original.id ? null : current,
                );
              }}
            >
              <CellInput
                aria-label={`Notes for ${row.original.number}`}
                data-cell={cellKey(row.original.id, 'notes')}
                // Markdown is written in paragraphs, so this is the cell that
                // most needs the room — one line at rest, several while it is
                // being written in.
                multiline
                rows={1}
                expandedRows={8}
                style={{ width: '18em', resize: 'vertical', font: 'inherit' }}
                onKeyDown={(e) => {
                  live.current.onAltMove(e, row.original, 'notes');
                  live.current.onArrowKey(e, row.original.id, 'notes');
                }}
                value={row.original.notes}
                commit={(typed) => {
                  void live.current.run(() =>
                    live.current.api.patch(row.original.id, { notes: typed }),
                  );
                }}
              />
              {/*
                The rendered note, on hover, and only when there is one. A
                popover over an empty note is a box of nothing that hides the
                row beneath it.
              */}
              {hovered && row.original.notes.trim() !== '' && (
                <NotesPreview notes={row.original.notes} number={row.original.number} />
              )}
            </span>
          );
        },
      }),
      column.display({
        id: 'actions',
        header: () => <span aria-label="Row actions" />,
        cell: ({ row }) =>
          row.original.frozenNumber !== null ? (
            <button
              type="button"
              onClick={() =>
                void live.current.run(() => live.current.api.unfreeze(row.original.id))
              }
            >
              Unfreeze
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                void live.current.run(() =>
                  live.current.api.remove(row.original.id, {
                    strategy: row.original.subRows.length > 0 ? 'promote' : undefined,
                  }),
                )
              }
            >
              Delete
            </button>
          ),
      }),
    ],
    // `roles` because a role's name is rendered in a header, and
    // `unfoldedRoles` because it decides which columns exist at all.
    // `flexRender` renders each `cell` function as a component type, so
    // rebuilding these definitions gives every cell a new type and React
    // unmounts and remounts the lot — losing focus, selection and any
    // half-typed value. For `roles` that is rare and tolerated; for the fold
    // it happens exactly on the click that asked for it, when the only focus
    // to lose is the button's own. Estimate drafts live in `drafts`, not in
    // the inputs, so a fold cannot swallow one. Everything else the cells need
    // is read through `live`, which is why `api`, `run` and `onKeyDown` are
    // absent rather than forgotten.
    [roles, unfoldedRoles],
  );

  const table = useReactTable({
    data: workItems,
    columns,
    // While a search is on, the expansion in force is the search's overlay:
    // every kept row open, so a hit inside a branch this reader had closed is
    // revealed rather than counted and hidden. The reader's own `expanded` is
    // not merged into and not written over — clearing the box puts the plan
    // back exactly as it was left, collapsed branches included.
    //
    // Proof: narrowed to the reader's own `expanded`, `reveals a match inside
    // a branch the reader had closed` failed with the hit counted and hidden.
    // And with the overlay committed into `expanded` on the way out — the
    // merge this avoids — `clearing the search puts the reader’s own collapse
    // back` failed with the whole plan open. Both watched, 2026-08-06.
    state: { expanded: search.expandedOverlay ?? expanded },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  /**
   * The rows this render puts on screen.
   *
   * The overlay above opens every kept row; this drops the ones a search did
   * not keep — the siblings that neither match nor sit on a match's line, which
   * are open branches' children and so still in the row model. With nothing
   * typed the kept set is every row and this filters nothing out.
   */
  const shownRows = table.getRowModel().rows.filter((row) => search.visibleIds.has(row.id));

  return (
    <section>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => void run(() => api.freeze(projectId))} disabled={busy}>
          Freeze numbering
        </button>
        <button
          type="button"
          onClick={() => void run(() => api.unfreezeProject(projectId))}
          disabled={busy}
        >
          Unfreeze all
        </button>
        <button
          type="button"
          onClick={() =>
            void run(async () => {
              const created = await api.create(projectId, {
                parentId: null,
                afterId: siblingsOf(null).at(-1)?.id ?? null,
                name: '',
              });
              focusNext.current = { rowId: created.id, columnId: 'name' };
            })
          }
          disabled={busy}
        >
          Add work item
        </button>
        {/*
          The two ends of the expansion, which is otherwise one triangle at a
          time — a forty-row plan takes forty clicks to fold. Both write the
          reader's own expansion, and it is remembered per project from there.

          Disabled while the Find box holds something, for the reason the
          triangles are hidden then: what is open during a search is the
          search's answer, and a button that appeared to do nothing would read
          as broken. Not disabled by `busy`, unlike the buttons above: neither
          asks be-01 for anything.
        */}
        <button
          type="button"
          disabled={searching}
          title={
            searching
              ? 'Clear the Find box first — a search opens whatever it has to.'
              : 'Close every branch'
          }
          onClick={() => {
            setExpanded({});
          }}
        >
          Collapse all
        </button>
        <button
          type="button"
          disabled={searching}
          title={
            searching
              ? 'Clear the Find box first — a search opens whatever it has to.'
              : 'Open every branch'
          }
          onClick={() => {
            setExpanded(true);
          }}
        >
          Expand all
        </button>
        {/*
          Find. Deliberately without `data-cell`: this is not a cell of the
          table's keyboard grid, and letting Tab and the arrows walk into it
          from the last cell of a row would put the caret somewhere no edit can
          be made.
        */}
        <input
          aria-label="Find"
          placeholder="Find…"
          size={14}
          title="Show work items whose name contains this, with the rows above and below them"
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            // Escape empties the box, which is how a search is left — and
            // leaving it puts every collapsed branch back, because the search
            // never wrote to the reader's own expansion.
            if (e.key !== 'Escape') return;
            e.preventDefault();
            setQuery('');
          }}
        />
        {searching && (
          <span role="status" style={{ alignSelf: 'center', color: '#555' }}>
            {shownRows.length} of {flat.length} rows
          </span>
        )}
        {/*
          Said out loud rather than left to an empty table, which reads as a
          plan that has been lost rather than a search that found nothing. The
          count beside it stays, so `0 of 12 rows` says the twelve are still
          there.
        */}
        {searching && search.matchIds.size === 0 && (
          <span style={{ alignSelf: 'center' }}>No matches for “{query}”</span>
        )}
        {/*
          How ready this plan is to be read, and the way to the rows that make
          it not ready. Absent entirely when every leaf is estimated for every
          role: a complete plan needs no badge, and a tick that is always there
          is a thing to stop seeing — this has to be noticed the day it appears.

          Not disabled while the table is busy, unlike the buttons beside it:
          it writes nothing, and a button that greys out during somebody else's
          refetch reads as broken.
        */}
        {gaps.leaves.length > 0 && (
          <button type="button" title={describeGaps(gaps)} onClick={walkToNextGap}>
            {gaps.leaves.length} unestimated
          </button>
        )}
        <label style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          Starts
          {/*
            The day the whole plan begins. Setting it moves every date at once,
            because every date is an offset from it — there is nothing stored
            per row to drag along.
          */}
          <input
            type="date"
            aria-label="Project start date"
            disabled={busy}
            value={startDate ?? ''}
            onChange={(e) => {
              const typed = e.target.value;
              void run(() => api.setStartDate(projectId, typed === '' ? null : typed));
            }}
          />
        </label>
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          Plan with
          {/*
            A project-wide setting rather than a per-reader preference: the
            dates below are computed from it, and two people reading different
            dates off one plan is the failure this must not have.
          */}
          <select
            aria-label="Final estimate"
            value={estimateMethod}
            disabled={busy}
            onChange={(e) => {
              const chosen = e.target.value;
              if (isEstimateMethod(chosen)) chooseEstimateMethod(chosen);
            }}
          >
            <option value="pert">PERT</option>
            <option value="optimistic">optimistic</option>
            <option value="realistic">realistic</option>
            <option value="pessimistic">pessimistic</option>
          </select>
        </label>
      </div>

      {error !== null && <p role="alert">{error}</p>}

      {/*
        Said out loud rather than left to be noticed. Someone else's edits stop
        arriving the moment the socket drops, and a table that looks exactly the
        same when it is no longer live is the failure this whole change exists
        to remove.
      */}
      {/*
        Not an error the user caused, and not one they can leave alone. The rows
        are all still here — only the dates are gone — so this says which, rather
        than letting a page of zeroes speak for itself.
      */}
      {scheduleError === 'cycle' && (
        <p role="alert">
          These dependencies run in a circle, so no dates can be worked out. Remove one to fix it.
        </p>
      )}

      {!connected && (
        <p role="status">Reconnecting — edits by other people may not be shown yet.</p>
      )}

      {/*
        The table scrolls inside this, in both directions, so the page never
        scrolls sideways and the toolbar and the alerts above stay where they
        were put. The heading row and the three identity columns are sticky
        against this box — see `table-frame.ts` for why it has to be the one
        that scrolls.
      */}
      <div data-table-frame style={TABLE_FRAME}>
        {/*
          `separate` with no spacing rather than the browser's default gap:
          the pinned columns' offsets are the running total of their widths,
          and two pixels between every pair of cells is two pixels the offsets
          do not know about.
        */}
        <table ref={tableElement} style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    style={{
                      ...STICKY_HEADER_CELL,
                      ...pinnedCellStyle(header.column.id, 'header'),
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {shownRows.map((row) => (
              <tr
                key={row.id}
                data-frozen={row.original.frozenNumber !== null ? 'true' : 'false'}
                data-drop={dropHint?.rowId === row.original.id ? dropHint.zone : undefined}
                // The handlers sit on the row rather than in a column definition:
                // `flexRender` renders each `cell` as a component *type*, so a
                // definition that changed with the drag would remount every cell
                // in the table on every pointer move.
                onDragOver={(event) => {
                  if (dragging === null) return;
                  // Without this the browser refuses the drop outright.
                  event.preventDefault();
                  const box = event.currentTarget.getBoundingClientRect();
                  setDropHint({
                    rowId: row.original.id,
                    zone: zoneFor(event.clientY - box.top, box.height),
                  });
                }}
                onDragLeave={() => {
                  setDropHint((current) => (current?.rowId === row.original.id ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  // The zone the last `dragover` worked out, not one recomputed
                  // here. That one is the marker the person was looking at when
                  // they let go, and a drop that lands somewhere other than where
                  // the line was drawn is the one thing drag must never do.
                  if (dropHint?.rowId !== row.original.id) return;
                  dropOn(
                    row.original.id,
                    dropHint.zone,
                    row.getIsExpanded() && row.subRows.length > 0,
                  );
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={pinnedCellStyle(cell.column.id, 'body')}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
