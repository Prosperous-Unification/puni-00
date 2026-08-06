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

/**
 * The subscription name carrying a project's edits.
 *
 * One function rather than a template literal at each call site: be-01 records
 * events under this name, gw-01 matches sockets against it, and fe-01 subscribes
 * with it. Three spellings of the same string is a silent no-op, not an error.
 */
export function subscriptionFor(projectId: string): string {
  return `project:${projectId}`;
}

export interface Broadcaster {
  publish(projectId: string, event: ProjectEvent): Promise<void>;
  /**
   * Where the project's event stream has reached, or `-1` for a project that has
   * never been edited.
   *
   * It lives on the broadcaster rather than on a second collaborator because the
   * broadcaster is what advances the sequence; a reader that asked something else
   * could be told a number the publisher had already moved past.
   */
  latestSeq(projectId: string): Promise<number>;
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
