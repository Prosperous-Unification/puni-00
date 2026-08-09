import type { Assignment, DirectoryUsageRows, WorkItem } from '../repository';
import { assumedAssignee } from './assumed-assignee';
import { deriveNumbers } from './derive-numbers';

/**
 * What removing a directory entry would do to one work item.
 *
 * Each arm names its kind **and what that kind does**, rather than a count a
 * reader would have to interpret: `label_nulled` says the label goes, and
 * `assumed_assignee_changed` says who the work reads as belonging to now and
 * who it would read as after.
 */
export type DirectoryEffect =
  | { kind: 'assignment_dropped'; role: { id: string; name: string } }
  | { kind: 'label_nulled' }
  | {
      kind: 'assumed_assignee_changed';
      /**
       * The **assumed assignee**'s name, or `null` — and `null` means
       * `unassigned`. A removal that takes a work item's sole assignee names
       * the flip rather than leaving it to be inferred from an absence.
       */
      assumedNow: string | null;
      assumedAfter: string | null;
    };

/** One work item a removal would touch, named as the plan shows it. */
export interface UsedWorkItem {
  id: string;
  /** The derived number the plan shows — `3.1`, not a row index. */
  number: string;
  name: string;
  effects: DirectoryEffect[];
}

export interface UsedProject {
  id: string;
  name: string;
  workItems: UsedWorkItem[];
}

/**
 * **Directory usage**: what removing a person or a team would take with it,
 * named rather than counted.
 *
 * Both halves are always present and never optional. A caller reading
 * `usage.members` has to be able to tell "nobody" from "this payload does not
 * say", and an absent key says the second while meaning the first.
 */
export interface DirectoryUsage {
  projects: UsedProject[];
  members: { id: string; name: string }[];
}

/** Who a work item's assignments name, keyed by role. */
function byRoleOn(assignments: readonly Assignment[], workItemId: string): Record<string, string> {
  const held: Record<string, string> = {};
  for (const each of assignments) {
    if (each.workItemId === workItemId) held[each.roleId] = each.personId;
  }
  return held;
}

/**
 * The usage assembled from `rows`, keeping only the work items `effectsOf`
 * found something to say about.
 *
 * Sorted — projects by name, work items by their derived number — because a
 * confirmation that lists the same impact in a different order each time reads
 * as a different answer.
 *
 * Proof: with the per-project grouping removed and every project's rows handed
 * to `deriveNumbers` at once, `names both projects a team is labelled in` fails
 * — the second project's only work item was named `020`, which is the number a
 * combined tree gives it and no screen anywhere shows. Watched 2026-08-09.
 */
function usageFrom(
  rows: DirectoryUsageRows,
  effectsOf: (row: WorkItem) => DirectoryEffect[],
): DirectoryUsage {
  // Per project, never across them. `deriveNumbers` numbers one tree, and two
  // projects' roots handed to it in one array become one numbering: the second
  // project's first row reads `020`, which is a number nobody's screen shows.
  const treeOf = new Map<string, WorkItem[]>();
  for (const row of rows.workItems) {
    treeOf.set(row.projectId, [...(treeOf.get(row.projectId) ?? []), row]);
  }
  const numbers = new Map<string, string>();
  for (const tree of treeOf.values()) {
    for (const [id, number] of deriveNumbers(tree)) numbers.set(id, number);
  }
  const byProject = new Map<string, UsedWorkItem[]>();
  for (const row of rows.workItems) {
    const effects = effectsOf(row);
    if (effects.length === 0) continue;
    const number = numbers.get(row.id);
    // Every work item here came out of the same read the numbers were derived
    // from, so a missing one is not a state to default past.
    if (number === undefined) throw new Error(`${row.id} was not numbered by its own project`);
    byProject.set(row.projectId, [
      ...(byProject.get(row.projectId) ?? []),
      { id: row.id, number, name: row.name, effects },
    ]);
  }
  const projects = rows.projects
    .filter((each) => byProject.has(each.id))
    .map((each) => ({
      id: each.id,
      name: each.name,
      workItems: (byProject.get(each.id) ?? []).sort((a, b) => (a.number < b.number ? -1 : 1)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { projects, members: rows.members.map((each) => ({ id: each.id, name: each.name })) };
}

/**
 * The directory usage of one person: the assignments that hold them, and every
 * work item whose **assumed assignee** would move once those assignments went.
 *
 * The flip is derived through {@link assumedAssignee} rather than written out
 * again, so the reading a confirmation shows and the reading the tree reports
 * cannot drift — a drift here would name the wrong people in a confirmation
 * somebody is about to agree to.
 */
export function directoryUsageOfPerson(rows: DirectoryUsageRows, personId: string): DirectoryUsage {
  const nameOf = new Map(rows.people.map((each) => [each.id, each.name]));
  const roleOf = new Map(rows.roles.map((each) => [each.id, each.name]));
  return usageFrom(rows, (row) => {
    const held = byRoleOn(rows.assignments, row.id);
    const dropped = Object.entries(held).filter(([, personOf]) => personOf === personId);
    if (dropped.length === 0) return [];
    const effects: DirectoryEffect[] = dropped
      .map(([roleId]) => roleId)
      .sort()
      .map((roleId) => ({
        kind: 'assignment_dropped' as const,
        role: { id: roleId, name: roleOf.get(roleId) ?? '' },
      }));
    const left = Object.fromEntries(
      Object.entries(held).filter(([, personOf]) => personOf !== personId),
    );
    const now = assumedAssignee(held);
    const after = assumedAssignee(left);
    if (now !== after) {
      effects.push({
        kind: 'assumed_assignee_changed',
        assumedNow: now === null ? null : (nameOf.get(now) ?? null),
        assumedAfter: after === null ? null : (nameOf.get(after) ?? null),
      });
    }
    return effects;
  });
}

/**
 * The directory usage of one team: every work item labelled with it, across
 * every project, and every person who belongs to it.
 *
 * No assignment moves — a team labels the work and a person does it, and the
 * two are deliberately unconnected — so `label_nulled` is the only effect a
 * team's removal has on a work item.
 */
export function directoryUsageOfTeam(rows: DirectoryUsageRows, teamId: string): DirectoryUsage {
  return usageFrom(rows, (row) => (row.serviceTeamId === teamId ? [{ kind: 'label_nulled' }] : []));
}
