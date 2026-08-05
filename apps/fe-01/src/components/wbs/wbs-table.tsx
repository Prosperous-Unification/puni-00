import {
  createColumnHelper,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Days, ProjectApi, RoleView } from '@/lib/wbs-api';

import { toTree, type TreeRow } from './wbs-rows';

export interface WbsTableProps {
  projectId: string;
  api: ProjectApi;
  /**
   * Opens a live subscription and returns the unsubscribe. Optional so the
   * table can be tested without a socket; supplied in the app.
   */
  subscribe?: (projectId: string, onChange: () => void) => () => void;
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
  const focusNext = useRef<string | null>(null);

  const latestRefresh = useRef(0);

  const refresh = useCallback(async () => {
    // Every mutation and every socket event starts a refresh, and they can
    // finish out of order — an earlier one landing last would replace the table
    // with a tree older than what is on screen, with nothing guaranteed to
    // arrive afterwards and repair it. Only the newest request may write.
    const generation = latestRefresh.current + 1;
    latestRefresh.current = generation;
    const [tree, loadedRoles] = await Promise.all([api.tree(projectId), api.roles(projectId)]);
    if (generation !== latestRefresh.current) return;
    setWorkItems(toTree(tree));
    setRoles(loadedRoles);
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
    return subscribe(projectId, () => {
      void refresh().catch(() => {
        // A failed refresh leaves the last good tree on screen. Clearing it
        // would lose the user's place over a blip.
      });
    });
  }, [subscribe, projectId, refresh]);

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

  const columns = useMemo(
    () => [
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
            onBlur={(e) => void run(() => api.patch(row.original.id, { name: e.target.value }))}
            onKeyDown={(e) => {
              onKeyDown(e, row.original);
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
                  void run(() => api.setEstimate(row.original.id, role.id, days));
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
            onBlur={(e) => void run(() => api.patch(row.original.id, { notes: e.target.value }))}
          />
        ),
      }),
      column.display({
        id: 'actions',
        header: () => <span aria-label="Row actions" />,
        cell: ({ row }) =>
          row.original.frozenNumber !== null ? (
            <button type="button" onClick={() => void run(() => api.unfreeze(row.original.id))}>
              Unfreeze
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                void run(() =>
                  api.remove(row.original.id, {
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
    // `busy` is deliberately absent. `flexRender` renders each `cell` function as
    // a component type, so rebuilding these definitions gives every cell a new
    // type and React unmounts and remounts the lot — losing focus, selection and
    // any half-typed value. The toolbar buttons outside the table still disable;
    // the row buttons do not, and a double-click on a deleted row just 404s.
    [api, onKeyDown, roles, run],
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
            <tr key={row.id} data-frozen={row.original.frozenNumber !== null ? 'true' : 'false'}>
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
