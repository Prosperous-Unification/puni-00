import type { Assignment } from '../repository';

/**
 * Who a work item's assignments are taken to cover every role with, or nobody.
 *
 * Exactly one assignment means that person is doing the lot; two or more means
 * each is doing their own, and none means nobody has been named. Derived rather
 * than stored, so assigning a second role ends the assumption without anything
 * being rewritten — see `assignment` in `schema.ts`, and **assumed assignee** in
 * `CONTEXT.md`.
 *
 * One function rather than the rule written twice: the tree reports this as
 * `doesEveryPhase`, and removing a role asks what it would become. Two
 * implementations of it would drift, and the drift would show up as a
 * confirmation that named the wrong people.
 */
export function assumedAssignee(byRole: Readonly<Record<string, string>>): string | null {
  const named = Object.values(byRole);
  return named.length === 1 ? (named[0] ?? null) : null;
}

/** One work item whose assumed assignee a role's removal would change. */
export interface AssumedAssigneeFlip {
  workItemId: string;
  /** Who is assumed to be covering every phase now, or nobody. */
  assumedNow: string | null;
  /** Who would be, once the role and its assignments have gone. */
  assumedAfter: string | null;
}

/**
 * Every work item whose assumed assignee moves when `roleId` is removed.
 *
 * Removing a role deletes its assignments, which can leave a work item holding
 * exactly one — silently promoting somebody to covering every phase — or leave
 * it holding none, which takes the assumption away. Neither is a row anybody
 * wrote, so a removal that did not name them would change who the plan says is
 * doing the work without saying so.
 *
 * Takes **every** assignment in the project rather than the role's own: what a
 * work item is assumed to be is decided by what it holds for the other roles.
 *
 * Sorted by work item id, because a confirmation that lists the same work items
 * in a different order each time reads as a different answer.
 *
 * Proof: with the comparison dropped, so that every work item holding the role
 * is named, `leaves alone a work item that keeps its answer` fails — a work
 * item assumed by nobody before and after was reported as changing; watched
 * 2026-08-08.
 */
export function assumedAssigneeFlips(
  assignments: readonly Assignment[],
  roleId: string,
): AssumedAssigneeFlip[] {
  const byWorkItem = new Map<string, Record<string, string>>();
  for (const each of assignments) {
    byWorkItem.set(each.workItemId, {
      ...(byWorkItem.get(each.workItemId) ?? {}),
      [each.roleId]: each.personId,
    });
  }
  const flips: AssumedAssigneeFlip[] = [];
  for (const [workItemId, byRole] of byWorkItem) {
    const { [roleId]: removed, ...left } = byRole;
    // Untouched by this removal: it holds nothing for the role, so the reading
    // of its assignments cannot have moved.
    if (removed === undefined) continue;
    const assumedNow = assumedAssignee(byRole);
    const assumedAfter = assumedAssignee(left);
    if (assumedNow === assumedAfter) continue;
    flips.push({ workItemId, assumedNow, assumedAfter });
  }
  return flips.sort((a, b) => (a.workItemId < b.workItemId ? -1 : 1));
}
