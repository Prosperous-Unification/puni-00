import { assumedAssignee } from './assumed-assignee';
import { effectiveTeamsOf, type TeamsLabelled } from './effective-team';
import { formatStepNodeId } from './step-node';

/** How a node names its person; assumption retains the one authored source step. */
export type NodeAssignment =
  | { kind: 'unassigned' }
  | { kind: 'explicit'; personId: string }
  | { kind: 'assumed'; personId: string; fromStepId: string };

/** Effective labels, including teams with no project capacity statement. */
export type NodeTeams =
  | { kind: 'unstated' }
  | {
      kind: 'stated';
      fromWorkItemId: string;
      entries: { teamId: string; capacity: number | null }[];
    };

/** Live derived resources of one retained leaf step, using {@link resolveStepResources}; never a persisted fact. */
export interface NodeResources {
  nodeId: string;
  assignment: NodeAssignment;
  teams: NodeTeams;
  maxParallel: number;
  width: number;
}

/**
 * Which pools one row's slices spend slots in, and the **narrowest** of their
 * sizes — read off the row's effective **team** set.
 *
 * Three rules, and the first two are today's, unchanged by the arity:
 *
 * 1. **No team, no pool.** An empty set states nothing, so the slice is
 *    unconstrained.
 * 2. **An unsized team labels the work and constrains nothing.** A team this
 *    project has stated no capacity for is absent from `teamSizes`, so it is
 *    absent from `poolIds` too — which is what keeps the engine's `no size for
 *    pool` throw a caller-fault assertion rather than ordinary control flow. It
 *    contributes no clamp either: an unstated capacity is not a capacity of
 *    zero, and reading it as one would move dates nobody typed.
 * 3. **Every sized team is a pool, and the block spends its whole width in
 *    each** (Dany, 2026-08-13, decision 3). `slots` is therefore the
 *    **minimum** of their sizes: a block wider than the narrowest of its pools
 *    can never be placed in that pool, so without the min
 *    `CapacityTooNarrowError` — an invariant about the caller and these sizes
 *    coming apart — becomes reachable from ordinary data.
 *
 * Rule 3 replaces `team-sets`' refusal, which threw on a second team because
 * the engine took one pool per slice. It takes several now.
 *
 * The order of `poolIds` is the effective set's order, which is the store's:
 * the joint search's answer does not depend on it (it is a max over the pools'
 * answers, and the union of their blocking sets), and the binding team's tie is
 * broken on the pool id rather than on placement, so nothing here needs sorting
 * to be deterministic.
 *
 * Shared by scheduler slicing and live node resource projection.
 */
export function poolsFor(
  teamIds: readonly string[],
  teamSizes: ReadonlyMap<string, number>,
): { poolIds: string[]; slots: number | undefined } {
  const poolIds: string[] = [];
  let slots: number | undefined;
  for (const teamId of teamIds) {
    const size = teamSizes.get(teamId);
    // Proof: treating an unsized label as a pool failed both mounted resource
    // parity cases with positive estimates (500 vs 200); watched 2026-10-15.
    if (size === undefined) continue;
    poolIds.push(teamId);
    // Proof: written as `Math.max` and `clamps a work item’s parallelism down
    // to the narrowest of its teams` failed with `width: 3` where 1 was owed —
    // a block claiming three of a team that holds one, which the engine then
    // refuses outright with `CapacityTooNarrowError`; watched 2026-08-14.
    // Proof: min -> max also failed the new inherited-team domain assertion
    // (width 3 vs 2) and mounted isolated/shared reads; watched 2026-10-15.
    slots = slots === undefined ? size : Math.min(slots, size);
  }
  return { poolIds, slots };
}

/**
 * The shared slicing and live-read resource rule. Explicit assignment wins;
 * exactly one authored assignment covers other steps. Named work has width
 * one; unnamed work is clamped by the narrowest sized team. Pool order is the
 * stating row's order, including when a stepless scheduler slice calls this.
 */
export function resolveStepResources(
  maxParallel: number,
  stepId: string | null,
  byStep: Readonly<Record<string, string>>,
  teamIds: readonly string[],
  teamSizes: ReadonlyMap<string, number>,
): { assignment: NodeAssignment; personId: string | null; width: number; poolIds: string[] } {
  const explicit = stepId === null ? undefined : byStep[stepId];
  // Proof: removing fallback failed both mounted resource parity cases;
  // counting distinct people instead of assignments failed `two assignments
  // to the same person disable assumption`; watched 2026-10-15.
  const assumed = assumedAssignee(byStep);
  let assignment: NodeAssignment = { kind: 'unassigned' };
  if (explicit !== undefined) assignment = { kind: 'explicit', personId: explicit };
  else if (assumed !== null) {
    for (const fromStepId of Object.keys(byStep)) {
      assignment = { kind: 'assumed', personId: assumed, fromStepId };
      break;
    }
  }
  const personId = explicit ?? assumed;
  const { poolIds, slots } = poolsFor(teamIds, teamSizes);
  // Proof: named width changed to maxParallel failed both mounted parity
  // cases; omitting the stored-number clamp failed `does not widen stored
  // parallelism to a larger team capacity`; watched 2026-10-15.
  const width = personId !== null ? 1 : Math.min(maxParallel, slots ?? maxParallel);
  return { assignment, personId, width, poolIds };
}

/**
 * Each retained leaf's resource readings, before hold reduction or page
 * filtering. Parents have no entry; stepless leaves have an empty record.
 * Inheritance uses the complete tree and capacities are captured project
 * statements, with null preserving an unsized team rather than inventing zero.
 */
export function nodeResourcesOf(
  rows: readonly (TeamsLabelled & { maxParallel: number })[],
  stepIds: readonly string[],
  assigneesOf: ReadonlyMap<string, Readonly<Record<string, string>>>,
  teamSizes: ReadonlyMap<string, number>,
): Map<string, Record<string, NodeResources>> {
  const parents = new Set(rows.map((row) => row.parentId));
  // Proof: stripping ancestry failed both mounted inherited-capacity reads;
  // a filtered parent cannot supply its labels; watched 2026-10-15.
  const effective = effectiveTeamsOf(rows);
  const resources = new Map<string, Record<string, NodeResources>>();
  for (const row of rows) {
    // Proof: emitting parents failed the mounted absent-parent-field
    // assertions in isolated and shared mode; watched 2026-10-15.
    if (parents.has(row.id)) continue;
    const stated = effective.get(row.id);
    const teams: NodeTeams =
      stated === undefined
        ? { kind: 'unstated' }
        : {
            kind: 'stated',
            fromWorkItemId: stated.fromId,
            entries: stated.teamIds.map((teamId) => ({
              teamId,
              capacity: teamSizes.get(teamId) ?? null,
            })),
          };
    const byStep = assigneesOf.get(row.id) ?? {};
    resources.set(
      row.id,
      Object.fromEntries(
        stepIds.map((stepId) => {
          const { assignment, width } = resolveStepResources(
            row.maxParallel,
            stepId,
            byStep,
            stated?.teamIds ?? [],
            teamSizes,
          );
          return [
            stepId,
            {
              nodeId: formatStepNodeId({ workItemId: row.id, stepId }),
              assignment,
              teams,
              maxParallel: row.maxParallel,
              width,
            },
          ];
        }),
      ),
    );
  }
  return resources;
}
