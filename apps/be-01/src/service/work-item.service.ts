import type {
  EstimateStore,
  Project,
  ProjectStore,
  Reparented,
  WorkItem,
  WorkItemPatch,
  WorkItemStore,
} from '../repository';
import { deriveNumbers } from './derive-numbers';
import { placeAfter, POSITION_STEP, type Sibling } from './place-sibling';
import { canEdit } from './project.service';
import { type Days, rollUp } from './roll-up';

/**
 * A work item as a reader sees it: the stored row, the number derived for it and
 * its estimates by role — its own if it is a leaf, its descendants' sums if not.
 */
export interface NumberedWorkItem extends WorkItem {
  number: string;
  estimates: Record<string, Days>;
  /** True when the estimates above are sums and therefore not editable here. */
  rolledUp: boolean;
}

export type DeleteStrategy = 'cascade' | 'promote';

export type WorkItemRefusal =
  | 'not_found'
  | 'forbidden'
  | 'strategy_required'
  | 'cycle'
  | 'frozen'
  | 'rolled_up';

export type WorkItemOutcome<T> = { ok: true; result: T } | { ok: false; reason: WorkItemRefusal };

export interface CreateWorkItem {
  parentId: string | null;
  afterId: string | null;
  name?: string;
  notes?: string;
}

export interface MoveWorkItem {
  parentId: string | null;
  afterId: string | null;
}

export interface WorkItemServiceOptions {
  workItems: WorkItemStore;
  projects: ProjectStore;
  estimates: EstimateStore;
  newId?: () => string;
}

const asSibling = (workItem: WorkItem): Sibling => ({
  id: workItem.id,
  position: workItem.position,
});

/** Whether `candidateId` sits anywhere below `ancestorId`, walking parents upward. */
function descendsFrom(rows: readonly WorkItem[], candidateId: string, ancestorId: string): boolean {
  const parentOf = new Map(rows.map((w) => [w.id, w.parentId]));
  let cursor: string | null | undefined = candidateId;
  while (cursor !== null && cursor !== undefined) {
    if (cursor === ancestorId) return true;
    cursor = parentOf.get(cursor);
  }
  return false;
}

/** `rootId` and everything beneath it. */
function subtreeOf(rows: readonly WorkItem[], rootId: string): string[] {
  const childrenOf = new Map<string | null, WorkItem[]>();
  for (const row of rows) {
    const group = childrenOf.get(row.parentId) ?? [];
    group.push(row);
    childrenOf.set(row.parentId, group);
  }
  const collected: string[] = [];
  const visit = (id: string): void => {
    collected.push(id);
    for (const child of childrenOf.get(id) ?? []) visit(child.id);
  };
  visit(rootId);
  return collected;
}

export class WorkItemService {
  private readonly newId: () => string;

  constructor(private readonly opts: WorkItemServiceOptions) {
    this.newId = opts.newId ?? (() => crypto.randomUUID());
  }

  /**
   * Every work item in the project, each carrying the number derived for it,
   * ordered as the tree reads.
   *
   * Sorting by the derived number rather than by position is what makes the
   * padding rules load-bearing: the numbers are built so that this one
   * lexicographic sort produces tree order across every level at once.
   */
  async tree(projectId: string): Promise<{ workItems: NumberedWorkItem[] } | null> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return null;
    const rows = await this.opts.workItems.listByProject(projectId);
    const numbers = deriveNumbers(rows);
    const totals = rollUp(rows, await this.opts.estimates.listByProject(projectId));
    const hasChildren = new Set(rows.map((row) => row.parentId).filter((id) => id !== null));
    const workItems = rows
      .map((row) => ({
        ...row,
        number: numbers.get(row.id) ?? '',
        estimates: Object.fromEntries(totals.get(row.id) ?? []),
        rolledUp: hasChildren.has(row.id),
      }))
      .sort((a, b) => (a.number < b.number ? -1 : a.number > b.number ? 1 : 0));
    return { workItems };
  }

  async create(
    projectId: string,
    actorId: string,
    input: CreateWorkItem,
  ): Promise<WorkItemOutcome<WorkItem>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };

    const rows = await this.opts.workItems.listByProject(projectId);
    const placed = placeAfter(this.groupUnder(rows, input.parentId), input.afterId);
    const workItem: WorkItem = {
      id: this.newId(),
      projectId,
      parentId: input.parentId,
      position: placed.position,
      name: input.name ?? '',
      notes: input.notes ?? '',
      frozenNumber: null,
    };
    await this.opts.workItems.insert(workItem, placed.renumbered);
    // A work item that had an estimate and now has a child no longer holds one:
    // the estimate described the work, and the work is the child now. Moving it
    // down keeps the total identical, which is what makes this safe to do
    // silently — the plan's numbers do not shift under the user.
    if (input.parentId !== null && !rows.some((row) => row.parentId === input.parentId)) {
      await this.opts.estimates.moveAll(input.parentId, workItem.id);
    }
    return { ok: true, result: workItem };
  }

  async patch(
    id: string,
    actorId: string,
    patch: WorkItemPatch,
  ): Promise<WorkItemOutcome<WorkItem>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const updated = await this.opts.workItems.patch(id, patch);
    if (updated === null) return { ok: false, reason: 'not_found' };
    return { ok: true, result: updated };
  }

  async move(id: string, actorId: string, input: MoveWorkItem): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.result;

    // A frozen number has left the tool — it is in someone's ticket. Moving the
    // row would either break that reference or quietly stop it meaning what it
    // said, so the freeze has to be lifted deliberately first.
    if (workItem.frozenNumber !== null) return { ok: false, reason: 'frozen' };

    // Moving a work item beneath itself detaches its whole subtree from every
    // root: the rows survive, no number can be derived for them, and the project
    // reads as though the work vanished.
    if (input.parentId !== null && descendsFrom(rows, input.parentId, id)) {
      return { ok: false, reason: 'cycle' };
    }

    const group = this.groupUnder(rows, input.parentId).filter((sibling) => sibling.id !== id);
    const placed = placeAfter(group, input.afterId);
    await this.opts.workItems.move(id, input.parentId, placed.position, placed.renumbered);
    return { ok: true, result: null };
  }

  async remove(
    id: string,
    actorId: string,
    strategy: DeleteStrategy | null,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.result;

    const children = rows
      .filter((row) => row.parentId === id)
      .sort((a, b) => a.position - b.position);
    // A parent carries work below it that the caller may not have on screen, so
    // which of the two things they meant is theirs to say.
    if (children.length > 0 && strategy === null) return { ok: false, reason: 'strategy_required' };

    if (children.length === 0 || strategy === 'cascade') {
      // The mirror of the rule in `create`: a parent losing its last child takes
      // the estimates back, so the work is still described somewhere.
      const parentId = workItem.parentId;
      if (parentId !== null && rows.filter((row) => row.parentId === parentId).length === 1) {
        await this.opts.estimates.moveAll(id, parentId);
      }
      await this.opts.workItems.remove(subtreeOf(rows, id), []);
      return { ok: true, result: null };
    }

    const formerGroup = rows
      .filter((row) => row.parentId === workItem.parentId)
      .sort((a, b) => a.position - b.position);
    const promoted: Reparented[] = formerGroup
      .flatMap((sibling) => (sibling.id === id ? children : [sibling]))
      .map((sibling, i) => ({
        id: sibling.id,
        parentId: workItem.parentId,
        position: (i + 1) * POSITION_STEP,
      }));
    await this.opts.workItems.remove([id], promoted);
    return { ok: true, result: null };
  }

  /**
   * Writes the currently derived number of every work item that has none stored.
   *
   * Work items added afterwards keep deriving, so a project can be frozen,
   * planned into further, and frozen again — each freeze pinning only what was
   * unpinned at the time. Numbers already stored are not rewritten, which is the
   * whole point: they are what left the tool.
   */
  async freeze(projectId: string, actorId: string): Promise<WorkItemOutcome<null>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };

    const rows = await this.opts.workItems.listByProject(projectId);
    const numbers = deriveNumbers(rows);
    const updates = rows
      .filter((row) => row.frozenNumber === null)
      .map((row) => ({ id: row.id, frozenNumber: numbers.get(row.id) ?? null }));
    await this.opts.workItems.setFrozenNumbers(updates);
    return { ok: true, result: null };
  }

  /** Returns one work item to deriving, which is what lets it move again. */
  async unfreeze(id: string, actorId: string): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    await this.opts.workItems.setFrozenNumbers([{ id, frozenNumber: null }]);
    return { ok: true, result: null };
  }

  async unfreezeProject(projectId: string, actorId: string): Promise<WorkItemOutcome<null>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };

    const rows = await this.opts.workItems.listByProject(projectId);
    await this.opts.workItems.setFrozenNumbers(
      rows
        .filter((row) => row.frozenNumber !== null)
        .map((row) => ({ id: row.id, frozenNumber: null })),
    );
    return { ok: true, result: null };
  }

  /**
   * Writes one work item's estimate for one role.
   *
   * Refused for a work item that has children: its figures are the sum of what
   * is below it, and a stored estimate there would either be ignored or
   * double-counted. Neither is visible to whoever typed it.
   */
  async setEstimate(
    id: string,
    actorId: string,
    roleId: string,
    days: Days,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { rows } = context.result;
    if (rows.some((row) => row.parentId === id)) return { ok: false, reason: 'rolled_up' };
    await this.opts.estimates.set({ workItemId: id, roleId, ...days });
    return { ok: true, result: null };
  }

  private groupUnder(rows: readonly WorkItem[], parentId: string | null): Sibling[] {
    return rows.filter((row) => row.parentId === parentId).map(asSibling);
  }

  /** The work item, its project and the project's rows — or the refusal that stops the caller. */
  private async contextFor(
    id: string,
    actorId: string,
  ): Promise<WorkItemOutcome<{ workItem: WorkItem; project: Project; rows: WorkItem[] }>> {
    const workItem = await this.opts.workItems.findById(id);
    if (workItem === null) return { ok: false, reason: 'not_found' };
    const project = await this.opts.projects.findById(workItem.projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!canEdit(project, actorId)) return { ok: false, reason: 'forbidden' };
    const rows = await this.opts.workItems.listByProject(workItem.projectId);
    return { ok: true, result: { workItem, project, rows } };
  }
}
