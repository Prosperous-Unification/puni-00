import {
  isWorkItemFieldGroup,
  WORK_ITEM_FIELD_GROUPS,
  type WorkItemFieldGroup,
  type workItemRow,
  type WorkItemTree,
} from '@wbs/contracts';
import { WORK_ITEM_STATUSES, type WorkItemStatus } from '@wbs/domain';

import {
  encodeCursor,
  isCursorOf,
  isUpdatedSince,
  nameMatches,
  type PageQuery,
} from './list-query';

/** The deepest `depth` a work-item page takes. */
const DEPTH_MAX = 64;

type TreeWorkItem = WorkItemTree['workItems'][number];
type TreeSlice = WorkItemTree['slices'][number];
export type WorkItemRow = (typeof workItemRow)['infer'];

/** The parameters only a work-item page takes, as its query schema admits them. */
export interface WorkItemPageInput {
  status?: string;
  parentId?: string;
  depth?: string;
  fields?: string;
}

/** A work-item page query after every grammar check. */
export interface WorkItemPageQuery extends Omit<PageQuery, 'cursor'> {
  after: string | null;
  statuses: ReadonlySet<WorkItemStatus> | null;
  parentId: string | null;
  depth: number | null;
  groups: ReadonlySet<WorkItemFieldGroup>;
}

const isStatus = (name: string): name is WorkItemStatus =>
  WORK_ITEM_STATUSES.some((status) => status === name);

/**
 * The comma-separated names of `raw`, or null when one is empty or fails
 * `admits`. Duplicates collapse; order does not matter.
 */
function namesOf<N extends string>(
  raw: string,
  admits: (name: string) => name is N,
): Set<N> | null {
  const names = new Set<N>();
  for (const name of raw.split(',')) {
    if (!admits(name)) return null;
    names.add(name);
  }
  return names;
}

/**
 * The work-item page's own parameters on top of the common ones, or null when
 * any is outside its grammar: an unknown status or field group, a `depth` that
 * is not 1 to 64, an empty `parentId`, or a cursor that is not
 * `{ v: 1, after: <id> }`.
 *
 * Proof, observed 2026-09-29: with the status names unchecked, `refuses every
 * value outside the grammar` in `work-item-page.test.ts` admitted
 * `status=in_progress,finished`; with the group names unchecked it admitted
 * `fields=notes,cost`; with the depth bound removed it admitted `depth=65`.
 */
export function workItemPageQueryOf(
  common: PageQuery,
  input: WorkItemPageInput,
): WorkItemPageQuery | null {
  const { cursor, ...rest } = common;
  let after: string | null = null;
  if (cursor !== null) {
    if (!isCursorOf(cursor, ['after'])) return null;
    const id: unknown = cursor['after'];
    if (typeof id !== 'string' || id === '') return null;
    after = id;
  }
  const statuses = input.status === undefined ? null : namesOf(input.status, isStatus);
  if (input.status !== undefined && statuses === null) return null;
  const groups =
    input.fields === undefined
      ? new Set<WorkItemFieldGroup>()
      : namesOf(input.fields, isWorkItemFieldGroup);
  if (groups === null) return null;
  if (input.parentId === '') return null;
  let depth: number | null = null;
  if (input.depth !== undefined) {
    if (!/^[0-9]{1,3}$/.test(input.depth)) return null;
    depth = Number(input.depth);
    if (depth < 1 || depth > DEPTH_MAX) return null;
  }
  return { ...rest, after, statuses, parentId: input.parentId ?? null, depth, groups };
}

/** A work item as its page row: the outline, then each named group. */
function rowOf(
  workItem: TreeWorkItem,
  updatedAt: number | null,
  slices: readonly TreeSlice[],
  groups: ReadonlySet<WorkItemFieldGroup>,
): WorkItemRow {
  const grouped: Partial<TreeWorkItem> = {};
  for (const group of groups) {
    if (group === 'slices') continue;
    for (const field of WORK_ITEM_FIELD_GROUPS[group])
      Object.assign(grouped, { [field]: workItem[field] });
  }
  return {
    ...grouped,
    id: workItem.id,
    projectId: workItem.projectId,
    parentId: workItem.parentId,
    number: workItem.number,
    name: workItem.name,
    status: workItem.status,
    dates: workItem.dates,
    revision: workItem.revision,
    updatedAt,
    ...(groups.has('slices') ? { slices: [...slices] } : {}),
  };
}

/** Each work item's slices, in the tree's slice order. */
export function slicesByWorkItem(slices: readonly TreeSlice[]): ReadonlyMap<string, TreeSlice[]> {
  const byWorkItem = new Map<string, TreeSlice[]>();
  for (const slice of slices) {
    const held = byWorkItem.get(slice.workItemId);
    if (held === undefined) byWorkItem.set(slice.workItemId, [slice]);
    else held.push(slice);
  }
  return byWorkItem;
}

/**
 * Each work item's depth, a top-level one being 1.
 *
 * @throws when a work item names a parent the tree does not hold: the tree
 * read answers whole projects, so that is corrupt trusted state.
 */
function depthsOf(workItems: readonly TreeWorkItem[]): ReadonlyMap<string, number> {
  const parents = new Map(workItems.map((workItem) => [workItem.id, workItem.parentId]));
  const depths = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    if (!parents.has(id)) throw new Error(`work item "${id}" is not in its project's tree`);
    const parentId = parents.get(id) ?? null;
    const depth = parentId === null ? 1 : depthOf(parentId) + 1;
    depths.set(id, depth);
    return depth;
  };
  for (const workItem of workItems) depthOf(workItem.id);
  return depths;
}

/** Whether `id` sits below `ancestorId`, never counting `id` itself. */
function isBelow(
  id: string,
  ancestorId: string,
  parents: ReadonlyMap<string, string | null>,
): boolean {
  let current = parents.get(id) ?? null;
  while (current !== null) {
    if (current === ancestorId) return true;
    current = parents.get(current) ?? null;
  }
  return false;
}

export type WorkItemPage =
  | { ok: true; rows: WorkItemRow[]; nextCursor: string | null }
  | { ok: false; refusal: 'stale_cursor' | 'unknown_parent' };

/**
 * One page of a project's work items (spec `list-reads`), in the tree read's
 * own order over the whole project, which the filters never reorder. Each
 * derived field is the tree's own, so a page shows the numbers and dates the
 * whole-tree read would.
 *
 * `instants` is read after the tree; a work item it lacks was deleted between
 * the two reads and is left out, the "missed under concurrent writes" case
 * the spec names. A cursor is resumed after its work item's current place;
 * one whose work item has left the tree is `stale_cursor`.
 *
 * Proof, observed 2026-09-29: resuming from the top instead of refusing a gone
 * cursor made `refuses a stale cursor and an unknown parent` in
 * `work-item-page.test.ts` answer a page; answering an empty page for an
 * unknown parent made the same test receive ok. Without the depth bound,
 * `parentId answers the rows below it to the depth asked` answered `010.1.1`
 * at `depth=1`; without the ancestry check it answered `010` and the rows
 * outside it; without the instant check, `leaves out a work item deleted
 * after the tree was read` answered `020`.
 */
export function pageWorkItems(
  tree: Pick<WorkItemTree, 'workItems' | 'slices'>,
  instants: ReadonlyMap<string, number | null>,
  query: WorkItemPageQuery,
): WorkItemPage {
  const { workItems } = tree;
  const parents = new Map(workItems.map((workItem) => [workItem.id, workItem.parentId]));
  let start = 0;
  if (query.after !== null) {
    const index = workItems.findIndex((workItem) => workItem.id === query.after);
    if (index === -1) return { ok: false, refusal: 'stale_cursor' };
    start = index + 1;
  }
  const { parentId } = query;
  if (parentId !== null && !parents.has(parentId)) return { ok: false, refusal: 'unknown_parent' };
  const depths = depthsOf(workItems);
  const floor = parentId === null ? 0 : (depths.get(parentId) ?? 0);
  const matching = workItems.slice(start).filter((workItem) => {
    const updatedAt = instants.get(workItem.id);
    if (updatedAt === undefined) return false;
    const depth = depths.get(workItem.id) ?? 0;
    return (
      (parentId === null || isBelow(workItem.id, parentId, parents)) &&
      (query.depth === null || depth - floor <= query.depth) &&
      (query.statuses === null || query.statuses.has(workItem.status)) &&
      (query.search === null || nameMatches(workItem.name, query.search)) &&
      isUpdatedSince(updatedAt, query.updatedSince)
    );
  });
  const page = matching.slice(0, query.limit);
  const slices = slicesByWorkItem(tree.slices);
  const last = page.at(-1);
  return {
    ok: true,
    rows: page.map((workItem) =>
      rowOf(
        workItem,
        instants.get(workItem.id) ?? null,
        slices.get(workItem.id) ?? [],
        query.groups,
      ),
    ),
    nextCursor:
      matching.length > query.limit && last !== undefined
        ? encodeCursor({ v: 1, after: last.id })
        : null,
  };
}
