import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type Days,
  depthOf,
  type ProjectApi,
  type RoleView,
  type WorkItemView,
} from '@/lib/wbs-api';

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
 * The work breakdown: one grid that is a table and a nested list at once.
 *
 * Rows arrive from be-01 already in tree order — the numbering is built so a
 * single lexicographic sort produces it — so this component never re-sorts and
 * never rebuilds the hierarchy. Depth comes from the number's dot count, which
 * means indentation cannot disagree with the number shown beside it.
 *
 * Every edit is a request; the tree is refetched from the response rather than
 * patched locally, because a create or move can renumber rows this component
 * never touched and guessing which would be a second implementation of the
 * derivation.
 */
export function WbsTable({ projectId, api, subscribe }: WbsTableProps) {
  const [workItems, setWorkItems] = useState<WorkItemView[]>([]);
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const focusNext = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const [tree, loadedRoles] = await Promise.all([api.tree(projectId), api.roles(projectId)]);
    setWorkItems(tree);
    setRoles(loadedRoles);
  }, [api, projectId]);

  useEffect(() => {
    void refresh().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'load_failed');
    });
  }, [refresh]);

  // Someone else's edit refetches rather than patching: a create or move can
  // renumber rows this client never touched, and reproducing that here would be
  // a second copy of the derivation.
  useEffect(() => {
    if (subscribe === undefined) return undefined;
    return subscribe(projectId, () => {
      void refresh().catch(() => {
        // A failed refresh after someone else's edit leaves the last good tree
        // on screen. Clearing it would lose the user's place over a blip.
      });
    });
  }, [subscribe, projectId, refresh]);

  // A newly created row is focused once it exists in the DOM, so Enter-Enter-
  // Enter types a list without touching the mouse.
  useEffect(() => {
    if (focusNext.current === null) return;
    const input = document.querySelector<HTMLInputElement>(
      `[data-name-input="${focusNext.current}"]`,
    );
    focusNext.current = null;
    input?.focus();
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

  const addSibling = (after: WorkItemView) =>
    run(async () => {
      const created = await api.create(projectId, {
        parentId: after.parentId,
        afterId: after.id,
        name: '',
      });
      focusNext.current = created.id;
    });

  /** Indent: the row becomes the last child of the sibling above it. */
  const indent = (row: WorkItemView) =>
    run(async () => {
      const siblings = workItems.filter((w) => w.parentId === row.parentId);
      const index = siblings.findIndex((w) => w.id === row.id);
      // A ternary rather than `siblings.at(index - 1)`: at index 0 there is no
      // row above to indent under, and `.at(-1)` would helpfully return the last
      // sibling — quietly moving the row to the wrong place.
      const newParent = index > 0 ? siblings[index - 1] : undefined;
      if (newParent === undefined) return;
      const lastChild = workItems.filter((w) => w.parentId === newParent.id).at(-1) ?? null;
      focusNext.current = row.id;
      await api.move(row.id, newParent.id, lastChild?.id ?? null);
    });

  /** Outdent: the row becomes the next sibling of its own parent. */
  const outdent = (row: WorkItemView) =>
    run(async () => {
      if (row.parentId === null) return;
      const parent = workItems.find((w) => w.id === row.parentId);
      if (parent === undefined) return;
      focusNext.current = row.id;
      await api.move(row.id, parent.parentId, parent.id);
    });

  const onKeyDown = (event: React.KeyboardEvent, row: WorkItemView) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void addSibling(row);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      void (event.shiftKey ? outdent(row) : indent(row));
    }
  };

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
                afterId: workItems.filter((w) => w.parentId === null).at(-1)?.id ?? null,
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
          <tr>
            <th scope="col">Number</th>
            <th scope="col">Name</th>
            {roles.map((role) => (
              <th key={role.id} scope="col" colSpan={POINTS.length}>
                {role.name}
              </th>
            ))}
            <th scope="col">Notes</th>
            <th scope="col" aria-label="Row actions" />
          </tr>
        </thead>
        <tbody>
          {workItems.map((row) => {
            const frozen = row.frozenNumber !== null;
            return (
              <tr key={row.id} data-frozen={frozen ? 'true' : 'false'}>
                <td style={{ paddingLeft: 8 + depthOf(row) * 16, whiteSpace: 'nowrap' }}>
                  {frozen && <span aria-label="Number is frozen">🔒 </span>}
                  {row.number}
                </td>
                <td>
                  <input
                    aria-label={`Name of ${row.number}`}
                    data-name-input={row.id}
                    value={row.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setWorkItems((current) =>
                        current.map((w) => (w.id === row.id ? { ...w, name } : w)),
                      );
                    }}
                    onBlur={(e) => void run(() => api.patch(row.id, { name: e.target.value }))}
                    onKeyDown={(e) => {
                      onKeyDown(e, row);
                    }}
                  />
                </td>
                {roles.flatMap((role) =>
                  POINTS.map((point) => (
                    <td key={`${role.id}-${point}`}>
                      <input
                        aria-label={`${role.name} ${point} for ${row.number}`}
                        // A parent's figures are sums of what is below it, so the
                        // cell is shown and not editable — greyed rather than
                        // blank, because the number is real and worth reading.
                        readOnly={row.rolledUp}
                        style={row.rolledUp ? { color: '#666', background: '#f4f4f4' } : undefined}
                        value={showDays(row.estimates[role.id], point)}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          const current = row.estimates[role.id] ?? {
                            optimistic: 0,
                            realistic: 0,
                            pessimistic: 0,
                          };
                          setWorkItems((items) =>
                            items.map((w) =>
                              w.id === row.id
                                ? {
                                    ...w,
                                    estimates: {
                                      ...w.estimates,
                                      [role.id]: { ...current, [point]: next },
                                    },
                                  }
                                : w,
                            ),
                          );
                        }}
                        onBlur={() => {
                          const days = workItems.find((w) => w.id === row.id)?.estimates[role.id];
                          if (days === undefined || row.rolledUp) return;
                          void run(() => api.setEstimate(row.id, role.id, days));
                        }}
                      />
                    </td>
                  )),
                )}
                <td>
                  <input
                    aria-label={`Notes for ${row.number}`}
                    value={row.notes}
                    onChange={(e) => {
                      const notes = e.target.value;
                      setWorkItems((current) =>
                        current.map((w) => (w.id === row.id ? { ...w, notes } : w)),
                      );
                    }}
                    onBlur={(e) => void run(() => api.patch(row.id, { notes: e.target.value }))}
                  />
                </td>
                <td>
                  {frozen ? (
                    <button
                      type="button"
                      onClick={() => void run(() => api.unfreeze(row.id))}
                      disabled={busy}
                    >
                      Unfreeze
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void run(() =>
                          api.remove(row.id, {
                            strategy: workItems.some((w) => w.parentId === row.id)
                              ? 'promote'
                              : undefined,
                          }),
                        )
                      }
                      disabled={busy}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
