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
import {
  type Days,
  type EstimateMethod,
  isEstimateMethod,
  type ProjectApi,
  type RoleView,
} from '@/lib/wbs-api';

import { CellInput } from './cell-input';
import { type Caret, type CellRef, nextCell } from './cell-navigation';
import { pickerEntries } from './dep-picker';
import { parseDependencies, unknownMessage } from './depends-input';
import { type DropRefusal, type DropZone, planMove, zoneFor } from './drag-drop';
import { type Point, POINTS, sendableTrio, trioProblem, type TypedTrio } from './estimate-draft';
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
 * What a refused drop says out loud.
 *
 * `unchanged` is absent deliberately: dropping a row back where it was is not a
 * mistake anyone needs telling about, and a message for it would fire constantly.
 */
const REFUSAL_MESSAGES: Partial<Record<DropRefusal, string>> = {
  frozen: 'That row’s number is frozen. Unfreeze it before moving it.',
  cycle: 'A row cannot be moved inside itself.',
  not_found: 'That row is no longer here — the table has been refreshed.',
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

/** Whether two role lists say the same thing, so an equal one can be discarded. */
function sameRoles(a: readonly RoleView[], b: readonly RoleView[]): boolean {
  return (
    a.length === b.length && a.every((role, i) => role.id === b[i]?.id && role.name === b[i]?.name)
  );
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
function caretOf(input: HTMLInputElement): Caret {
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
function editableGrid(table: HTMLTableElement): { input: HTMLInputElement; cell: CellRef }[] {
  return [...table.querySelectorAll<HTMLInputElement>('[data-cell]:not([readonly])')]
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
function focusAdjacentCell(input: HTMLInputElement, from: CellRef, delta: 1 | -1): boolean {
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
  const [expanded, setExpanded] = useState<ExpandedState>(true);
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
  const focusNext = useRef<string | null>(null);

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
    const [tree, loadedRoles] = await Promise.all([api.tree(projectId), api.roles(projectId)]);
    if (generation !== latestRefresh.current) return;
    setWorkItems(toTree(tree.workItems));
    setScheduleError(tree.scheduleError);
    setEstimateMethod(tree.estimateMethod);
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

  const siblingsOf = useCallback(
    (parentId: string | null) => flat.filter((row) => row.parentId === parentId),
    [flat],
  );

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
        focusNext.current = created.id;
      }),
    [api, projectId, run],
  );

  /** Indent: the row becomes the last child of the sibling above it. */
  const indent = useCallback(
    (row: TreeRow) =>
      run(async () => {
        const siblings = siblingsOf(row.parentId);
        const index = siblings.findIndex((w) => w.id === row.id);
        // A ternary rather than `siblings.at(index - 1)`: at index 0 there is no
        // row above to indent under, and `.at(-1)` would return the last sibling
        // — quietly moving the row somewhere nobody asked for.
        const newParent = index > 0 ? siblings[index - 1] : undefined;
        if (newParent === undefined) return;
        const lastChild = newParent.subRows.at(-1) ?? null;
        focusNext.current = row.id;
        await api.move(row.id, newParent.id, lastChild?.id ?? null);
      }),
    [api, run, siblingsOf],
  );

  /** Outdent: the row becomes the next sibling of its own parent. */
  const outdent = useCallback(
    (row: TreeRow) =>
      run(async () => {
        if (row.parentId === null) return;
        const parent = flat.find((w) => w.id === row.parentId);
        if (parent === undefined) return;
        focusNext.current = row.id;
        await api.move(row.id, parent.parentId, parent.id);
      }),
    [api, flat, run],
  );

  /** Removes a wholly empty row, landing the focus on the row above it. */
  const removeEmptyRow = useCallback(
    (row: TreeRow) =>
      run(async () => {
        const at = flat.findIndex((w) => w.id === row.id);
        // A ternary rather than `flat.at(at - 1)`: removing the first row has
        // no row above, and `.at(-1)` would send the focus to the last one.
        const above = at > 0 ? flat[at - 1] : undefined;
        focusNext.current = above?.id ?? null;
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
        if (!(input instanceof HTMLInputElement)) return;
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
        if (!(input instanceof HTMLInputElement)) return;
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
    (event: React.KeyboardEvent<HTMLInputElement>, rowId: string, columnId: string) => {
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

  /** The rows the picker may offer `forRow`, narrowed by what is typed. */
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
   * Takes a typed estimate box: holds it as a draft, and sends the trio if the
   * trio can now stand on its own.
   *
   * Nothing is repaired and nothing is sent until all three read sensibly —
   * that is the whole of Dany's "never edit estimates". The drafts for the
   * trio are cleared only once be-01 has the figures, so a refused request
   * leaves what was typed on screen to be corrected rather than swallowed.
   */
  const commitEstimate = useCallback(
    (row: TreeRow, roleId: string, point: Point, typed: string) => {
      const next = { ...typedTrio(row, roleId), [point]: typed };
      setDrafts((current) => ({ ...current, [draftKey(row.id, roleId, point)]: typed }));
      const days = sendableTrio(next);
      if (days === null) return;
      void run(async () => {
        await api.setEstimate(row.id, roleId, days);
        // Rebuilt without this trio's keys rather than deleted from a copy:
        // `delete` on a computed key is banned here, and filtering says the
        // same thing without reaching into the object twice.
        const gone = new Set(POINTS.map((each) => draftKey(row.id, roleId, each)));
        setDrafts((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => !gone.has(key))),
        );
      });
    },
    [api, run, typedTrio],
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
  });
  live.current = {
    api,
    projectId,
    run,
    onKeyDown,
    onArrowKey,
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
          <span style={{ paddingLeft: row.depth * 16, whiteSpace: 'nowrap' }}>
            {row.getCanExpand() ? (
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
        id: 'depends',
        header: 'Depends on',
        cell: ({ row }) => {
          const numbers = live.current.numbersOf(row.original.dependsOn);
          // This cell's picker, or null while it is closed or under another row.
          const picker =
            live.current.depPicker?.rowId === row.original.id ? live.current.depPicker : null;
          const entries =
            picker === null ? [] : live.current.depEntriesFor(row.original, picker.typed);
          // Resolved by id at render, so a highlight whose row has left the
          // list is simply nothing rather than somebody else's row.
          const activeOption =
            picker?.highlightId == null
              ? undefined
              : entries.find((entry) => entry.id === picker.highlightId);
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
                      : live.current.depEntriesFor(row.original, typed)[0];
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
                      entries.map((entry) => entry.id),
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
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background: entry.id === activeOption?.id ? '#e8f0fe' : undefined,
                      }}
                      onClick={() => {
                        live.current.pickDependency(row.original.id, entry.id);
                      }}
                    >
                      {entry.number} {entry.name}
                    </li>
                  ))}
                </ul>
              )}
            </span>
          );
        },
      }),
      column.display({
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <CellInput
            aria-label={`Name of ${row.original.number}`}
            data-name-input={row.original.id}
            data-cell={cellKey(row.original.id, 'name')}
            // A callback ref rather than an effect: it fires exactly when this
            // node is attached, so the focus cannot be lost to a later render
            // arriving before the row does. That race is what
            // Enter-Enter-Enter depends on not losing. It fires on every render
            // rather than only the first, which the id check already tolerated.
            onAttach={(element) => {
              if (focusNext.current !== row.original.id) return;
              focusNext.current = null;
              element.focus();
            }}
            value={row.original.name}
            commit={(typed) => {
              void live.current.run(() => live.current.api.patch(row.original.id, { name: typed }));
            }}
            onKeyDown={(e) => {
              live.current.onKeyDown(e, row.original);
              live.current.onArrowKey(e, row.original.id, 'name');
            }}
          />
        ),
      }),
      ...roles.flatMap((role) => [
        ...POINTS.map((point) =>
          column.display({
            id: `${role.id}-${point}`,
            header: `${role.name} ${point}`,
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
                  title={wrong ? problem.message : undefined}
                  onKeyDown={(e) => {
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
          id: `${role.id}-final`,
          header: `${role.name} days`,
          cell: ({ row }) => (
            <span data-final={role.id} style={{ fontWeight: 600 }}>
              {showFinal(row.original.finalDays[role.id])}
            </span>
          ),
        }),
      ]),
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
        id: 'start',
        header: 'Starts (day)',
        cell: ({ row }) => (
          <span data-start>{live.current.showSchedule(row.original.schedule.earliestStart)}</span>
        ),
      }),
      column.display({
        id: 'finish',
        header: 'Ends (day)',
        cell: ({ row }) => (
          <span data-finish title={row.original.schedule.estimated ? undefined : 'No estimate yet'}>
            {live.current.showSchedule(row.original.schedule.earliestFinish)}
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
        cell: ({ row }) => (
          <CellInput
            aria-label={`Notes for ${row.original.number}`}
            data-cell={cellKey(row.original.id, 'notes')}
            onKeyDown={(e) => {
              live.current.onArrowKey(e, row.original.id, 'notes');
            }}
            value={row.original.notes}
            commit={(typed) => {
              void live.current.run(() =>
                live.current.api.patch(row.original.id, { notes: typed }),
              );
            }}
          />
        ),
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
    // Only `roles`, and only because a role's name is rendered in a header.
    // `flexRender` renders each `cell` function as a component type, so
    // rebuilding these definitions gives every cell a new type and React
    // unmounts and remounts the lot — losing focus, selection and any half-typed
    // value. Everything else the cells need is read through `live`, which is why
    // `api`, `run` and `onKeyDown` are absent rather than forgotten. The toolbar
    // buttons outside the table still disable; the row buttons do not, and a
    // double-click on a deleted row just 404s.
    [roles],
  );

  const table = useReactTable({
    data: workItems,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

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
              focusNext.current = created.id;
            })
          }
          disabled={busy}
        >
          Add work item
        </button>
        <label style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
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

      <table>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id} scope="col">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
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
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
