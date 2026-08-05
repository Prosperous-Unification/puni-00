import type { NumberedWorkItem } from './work-item.service';

/**
 * What subscribers to `project:<id>` receive.
 *
 * Two shapes rather than one because they cost differently. A cell edit touches
 * one work item and its ancestors' totals, and that is a small patch worth
 * computing. A structural change can renumber a large slice of the project —
 * every sibling after an insertion, every child of a repadded parent — and
 * working out the minimal set is fiddly code that would be wrong in rare cases.
 * A work breakdown is hundreds of rows and structural edits are rare, so sending
 * the tree is the cheaper mistake.
 */
export type ProjectEvent =
  | { type: 'work_items_changed'; workItems: NumberedWorkItem[] }
  | { type: 'tree_replaced'; workItems: NumberedWorkItem[] };

export interface Broadcaster {
  publish(projectId: string, event: ProjectEvent): Promise<void>;
}

/** The work item and every ancestor above it, whose roll-ups its change moved. */
export function withAncestors(
  workItems: readonly NumberedWorkItem[],
  id: string,
): NumberedWorkItem[] {
  const byId = new Map(workItems.map((w) => [w.id, w]));
  const chain: NumberedWorkItem[] = [];
  // `string | null`, not `| undefined`: a parentId is null at the root and never
  // absent. The `byId` lookup below is the one that can genuinely miss.
  let cursor: string | null = id;
  while (cursor !== null) {
    const found = byId.get(cursor);
    if (found === undefined) break;
    chain.push(found);
    cursor = found.parentId;
  }
  return chain;
}
