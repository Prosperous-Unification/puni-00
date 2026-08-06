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
import type { Days, ProjectApi, RoleView } from '@/lib/wbs-api';

import { type DropRefusal, type DropZone, planMove, zoneFor } from './drag-drop';
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

const POINTS = ['optimistic', 'realistic', 'pessimistic'] as const;
type Point = (typeof POINTS)[number];

const showDays = (days: Days | undefined, point: Point): string =>
  days === undefined ? '' : String(days[point]);

/**
 * The triple after one point was typed, with the other two nudged to keep
 * `optimistic <= realistic <= pessimistic`.
 *
 * be-01 enforces that ordering, so typing `5` into the optimistic cell of an
 * unestimated row used to send `5/0/0` and come back 400 — the row could never
 * be given its first estimate through the UI at all. Nudging the neighbours is
 * the least surprising resolution: the number you typed is the number you get,
 * and the others move only as far as they must.
 */
export function keepOrdered(current: Days, point: Point, value: number): Days {
  const next = { ...current, [point]: value };
  if (point === 'optimistic') {
    next.realistic = Math.max(next.realistic, next.optimistic);
    next.pessimistic = Math.max(next.pessimistic, next.realistic);
    return next;
  }
  if (point === 'realistic') {
    next.optimistic = Math.min(next.optimistic, next.realistic);
    next.pessimistic = Math.max(next.pessimistic, next.realistic);
    return next;
  }
  next.realistic = Math.min(next.realistic, next.pessimistic);
  next.optimistic = Math.min(next.optimistic, next.realistic);
  return next;
}

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
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ rowId: string; zone: DropZone } | null>(null);
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

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent, row: TreeRow) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void addSibling(row);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        void (event.shiftKey ? outdent(row) : indent(row));
      }
    },
    [addSibling, indent, outdent],
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
  const live = useRef({ api, projectId, run, onKeyDown, setDragging, setDropHint });
  live.current = { api, projectId, run, onKeyDown, setDragging, setDropHint };

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
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <input
            aria-label={`Name of ${row.original.number}`}
            data-name-input={row.original.id}
            // A callback ref rather than an effect: it fires exactly when this
            // node mounts, so the focus cannot be lost to a later render
            // arriving before the row does. That race is what
            // Enter-Enter-Enter depends on not losing.
            ref={(element) => {
              if (element === null || focusNext.current !== row.original.id) return;
              focusNext.current = null;
              element.focus();
            }}
            defaultValue={row.original.name}
            key={`${row.original.id}-${row.original.name}`}
            onBlur={(e) =>
              void live.current.run(() =>
                live.current.api.patch(row.original.id, { name: e.target.value }),
              )
            }
            onKeyDown={(e) => {
              live.current.onKeyDown(e, row.original);
            }}
          />
        ),
      }),
      ...roles.flatMap((role) =>
        POINTS.map((point) =>
          column.display({
            id: `${role.id}-${point}`,
            header: `${role.name} ${point}`,
            cell: ({ row }) => (
              <input
                aria-label={`${role.name} ${point} for ${row.original.number}`}
                // A parent's figures are sums of what is below it, so the cell is
                // shown and not editable — greyed rather than blank, because the
                // number is real and worth reading.
                readOnly={row.original.rolledUp}
                style={row.original.rolledUp ? { color: '#666', background: '#f4f4f4' } : undefined}
                defaultValue={showDays(row.original.estimates[role.id], point)}
                key={`${row.original.id}-${role.id}-${point}-${showDays(row.original.estimates[role.id], point)}`}
                onBlur={(e) => {
                  if (row.original.rolledUp) return;
                  const current = row.original.estimates[role.id] ?? {
                    optimistic: 0,
                    realistic: 0,
                    pessimistic: 0,
                  };
                  const days = keepOrdered(current, point, Number(e.target.value));
                  void live.current.run(() =>
                    live.current.api.setEstimate(row.original.id, role.id, days),
                  );
                }}
              />
            ),
          }),
        ),
      ),
      column.display({
        id: 'notes',
        header: 'Notes',
        cell: ({ row }) => (
          <input
            aria-label={`Notes for ${row.original.number}`}
            defaultValue={row.original.notes}
            key={`${row.original.id}-notes-${row.original.notes}`}
            onBlur={(e) =>
              void live.current.run(() =>
                live.current.api.patch(row.original.id, { notes: e.target.value }),
              )
            }
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
      </div>

      {error !== null && <p role="alert">{error}</p>}

      {/*
        Said out loud rather than left to be noticed. Someone else's edits stop
        arriving the moment the socket drops, and a table that looks exactly the
        same when it is no longer live is the failure this whole change exists
        to remove.
      */}
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
