import {
  type ConnectedGraph,
  findStepNodeCycle,
  formatScopedDependencyKey,
  indexCapturedLeafSteps,
  type LeafStepOrder,
  resolveConnectedGraph,
  type ScopedTypedDependency,
  type StepNodeCycle,
} from '@wbs/domain';

import type { StoredTypedDependency, TypedDependencyStore } from '../ports/typed-dependency-store';
import type { WorkItemDirectTypes, WorkItemStepProjection } from '../ports/work-item-store';
import { type DependencyGraphState, resolveDependencyGraphContext } from './dependency-graph';

/** Minimal authored-graph evidence; no schedule, calendar, holds reduction or cache. */
export interface ConnectedDependencyGraphState {
  readonly workPackages: readonly {
    readonly workPackageId: string;
    readonly state: DependencyGraphState;
  }[];
  readonly external: readonly ScopedTypedDependency[];
}

/**
 * Authority already admitted by the caller's current write observation.
 * Both methods must be bound to that observation's lifetime. requireWorkPackage
 * throws unless its current same-organization ownership and read authority
 * permit this work package, including restricted readable work packages. Existence alone
 * is insufficient. It must not read labels or trees before checking ownership.
 * The caller owns the transaction; this capability never opens or closes it.
 */
export interface ConnectedGraphReadAuthority {
  assertActive(): void;
  requireWorkPackage(workPackageId: string): Promise<void>;
}

/**
 * Required read-only capabilities bound to the same admitted transaction.
 * List methods return complete work package facts, not search pages. Incident reads
 * include incoming as well as successor-owned rows; no owned-empty shortcut is
 * valid. Implementations must reject reads after their owning scope settles.
 */
export interface ConnectedDependencyGraphReads {
  readonly workPackages: {
    findById(
      workPackageId: string,
    ): Promise<{ readonly id: string; readonly depReach: DependencyGraphState['reach'] } | null>;
    stepsOf(workPackageId: string): Promise<DependencyGraphState['steps']>;
  };
  readonly workItems: {
    listByWorkPackage(workPackageId: string): Promise<DependencyGraphState['rows']>;
    resolveStepOrders(
      workPackageId: string,
      projection: WorkItemStepProjection,
    ): Promise<readonly LeafStepOrder[]>;
  };
  readonly estimates: {
    listByWorkPackage(workPackageId: string): Promise<DependencyGraphState['estimates']>;
  };
  readonly dependencies: {
    listByWorkPackage(workPackageId: string): Promise<DependencyGraphState['legacy']>;
  };
  readonly typedDependencies: Pick<TypedDependencyStore, 'listIncident'>;
}

/**
 * Complete replacements for explicit work-package-local graph facts. Omission keeps
 * stored evidence; an empty collection explicitly removes it. typed replaces
 * this successor owner's entire authored set, including local and external rows.
 * Proposed endpoints must already have passed modeled admission before this
 * trusted-state boundary. Staged after-write checks need no overrides.
 */
export interface ConnectedDependencyGraphChange extends Partial<
  Omit<DependencyGraphState, 'typed' | 'stepOrder'>
> {
  readonly workPackageId: string;
  readonly typed?: readonly StoredTypedDependency[];
  readonly directTypes?: readonly WorkItemDirectTypes[];
}

/** Omission proposes no direct type replacements; malformed explicit null never becomes absence. */
function selectDirectTypes(
  replacements: readonly WorkItemDirectTypes[] | undefined,
): readonly WorkItemDirectTypes[] {
  switch (replacements) {
    case undefined:
      return [];
    default:
      return replacements;
  }
}

/** Prepares every local context once and invokes the shared domain expansion. */
export function resolveConnectedDependencyGraph(
  state: ConnectedDependencyGraphState,
): ConnectedGraph {
  return resolveConnectedGraph({
    workPackages: state.workPackages.map((workPackage) =>
      resolveDependencyGraphContext(workPackage.workPackageId, workPackage.state),
    ),
    external: state.external,
  });
}

/**
 * Captures authored dependency closure from the caller's current observation.
 * Each evaluation starts fresh, so staged graph edits cannot reuse old facts.
 * Traversal follows both external directions, including old and proposed-new
 * components. Reads never authorize another work package's writes. Missing/corrupt
 * trusted evidence throws; actual node cycles are returned by findCycle.
 */
export class ConnectedDependencyGraphReader {
  constructor(
    private readonly reads: ConnectedDependencyGraphReads,
    private readonly authority: ConnectedGraphReadAuthority,
  ) {}

  async read(
    workPackageIds: readonly string[],
    changes: readonly ConnectedDependencyGraphChange[] = [],
  ): Promise<ConnectedDependencyGraphState> {
    // Proof: removing this lifetime boundary independently failed `checks lifetime for an empty observation and immediately after every awaited boundary` (2026-10-22).
    this.authority.assertActive();
    // Proof: retaining incidents across evaluations let the staged reverse link escape; retaining the whole capture let estimate/reach changes escape. Both freshness tests failed on missing cycle (2026-10-22).
    const overrides = new Map<string, ConnectedDependencyGraphChange>();
    for (const change of changes) {
      // Proof: omission accepted the explicit-null override while actual own capture remained; protocol evidence only.
      if ('stepOrder' in change)
        throw new TypeError('current graph interpretation overrides are not allowed');
      // Proof: bypassing duplicate-owner refusal made `rejects duplicate overrides` accept ambiguous replacements (2026-10-22).
      if (overrides.has(change.workPackageId))
        throw new Error(`duplicate graph override for ${change.workPackageId}`);
      overrides.set(change.workPackageId, change);
      for (const dependency of change.typed ?? []) {
        // Proof: bypassing each owner equality separately made `rejects each proposed ownership mismatch independently` accept its isolated malformed set (2026-10-22).
        if (
          dependency.workPackageId !== change.workPackageId ||
          dependency.successor.workPackageId !== change.workPackageId
        )
          throw new Error(`proposed owner mismatch for ${dependency.id}`);
      }
    }
    const admitted = new Set<string>();
    const requireWorkPackage = async (workPackageId: string): Promise<void> => {
      if (!admitted.has(workPackageId)) {
        // Proof: skipping authority admitted unreadable b and read its tree; `requires reached-work-package authority` failed (2026-10-22).
        await this.authority.requireWorkPackage(workPackageId);
        // Proof: removing this lifetime boundary independently failed `checks lifetime for an empty observation and immediately after every awaited boundary` (2026-10-22).
        this.authority.assertActive();
        admitted.add(workPackageId);
      }
    };
    const incidents = new Map<string, readonly StoredTypedDependency[]>();
    const identities = new Map<string, StoredTypedDependency>();
    const register = (dependency: StoredTypedDependency): void => {
      // Proof: bypassing stored owner equality made `rejects malformed owner` accept the inconsistent row (2026-10-22).
      if (dependency.workPackageId !== dependency.successor.workPackageId)
        throw new Error(`owner mismatch for ${dependency.id}`);
      const previous = identities.get(dependency.id);
      // Proof: bypassing stored consistency accepted contradictory rows even with their owner removed; its dedicated test failed (2026-10-22).
      if (
        previous !== undefined &&
        formatScopedDependencyKey(previous) !== formatScopedDependencyKey(dependency)
      )
        throw new Error(`conflicting relationship ${dependency.id}`);
      identities.set(dependency.id, dependency);
    };
    const readIncident = async (
      workPackageId: string,
    ): Promise<readonly StoredTypedDependency[]> => {
      await requireWorkPackage(workPackageId);
      const cached = incidents.get(workPackageId);
      if (cached !== undefined) return cached;
      const dependencies = await this.reads.typedDependencies.listIncident([workPackageId]);
      // Proof: removing this lifetime boundary independently failed `checks lifetime for an empty observation and immediately after every awaited boundary` (2026-10-22).
      this.authority.assertActive();
      for (const dependency of dependencies) {
        // Proof: bypassing incident membership made `rejects malformed owner, unrelated incident rows` accept an unrelated component edge (2026-10-22).
        if (
          dependency.predecessor.workPackageId !== workPackageId &&
          dependency.successor.workPackageId !== workPackageId
        )
          throw new Error(
            `non-incident relationship ${dependency.id} returned for ${workPackageId}`,
          );
        register(dependency);
      }
      incidents.set(workPackageId, dependencies);
      return dependencies;
    };
    const seeds = new Set(workPackageIds);
    for (const change of changes) {
      seeds.add(change.workPackageId);
      if (change.typed === undefined) continue;
      const old = await readIncident(change.workPackageId);
      for (const dependency of [
        ...old.filter((dependency) => dependency.workPackageId === change.workPackageId),
        ...change.typed,
      ]) {
        // Proof: omitting old/new predecessor seeds lost b from `replaces complete successor-owned sets and seeds both old and new components` (2026-10-22).
        seeds.add(dependency.predecessor.workPackageId);
        seeds.add(dependency.successor.workPackageId);
      }
    }
    // Proposed identities are separate from stored identities: replacing one
    // relationship's endpoint is valid, contradictory stored rows are not.
    const effective = new Map<string, StoredTypedDependency>();
    const addEffective = (dependency: StoredTypedDependency): void => {
      const previous = effective.get(dependency.id);
      // Proof: bypassing effective consistency accepted the proposed/retained ID collision; its dedicated test failed (2026-10-22).
      if (
        previous !== undefined &&
        formatScopedDependencyKey(previous) !== formatScopedDependencyKey(dependency)
      )
        throw new Error(`conflicting relationship ${dependency.id}`);
      effective.set(dependency.id, dependency);
    };
    for (const change of changes)
      for (const dependency of change.typed ?? []) addEffective(dependency);
    const visited = new Set<string>();
    const pending = [...seeds];
    for (const workPackageId of pending) {
      if (visited.has(workPackageId)) continue;
      visited.add(workPackageId);
      const stored = await readIncident(workPackageId);
      for (const dependency of stored) {
        if (overrides.get(dependency.workPackageId)?.typed === undefined) addEffective(dependency);
      }
      for (const dependency of effective.values()) {
        // Proof: disabling either incident traversal direction separately lost required work packages in `walks incoming and outgoing incidents once` (2026-10-22).
        if (dependency.predecessor.workPackageId === workPackageId)
          pending.push(dependency.successor.workPackageId);
        if (dependency.successor.workPackageId === workPackageId)
          pending.push(dependency.predecessor.workPackageId);
      }
    }
    const relationships = [...effective.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const workPackages: { workPackageId: string; state: DependencyGraphState }[] = [];
    for (const workPackageId of [...visited].sort()) {
      await requireWorkPackage(workPackageId);
      const workPackage = await this.reads.workPackages.findById(workPackageId);
      // Proof: removing this lifetime boundary independently failed `checks lifetime for an empty observation and immediately after every awaited boundary` (2026-10-22).
      this.authority.assertActive();
      // Proof: ignoring identity mismatch accepted a foreign work package in `rejects a required workPackage read`. Ignoring null instead reached a later missing-facts failure (diagnostic only); both watched 2026-10-22.
      if (workPackage?.id !== workPackageId)
        throw new Error(`required work package ${workPackageId} missing or mismatched`);
      const [rows, steps, estimates, legacy] = await Promise.all([
        this.reads.workItems.listByWorkPackage(workPackageId),
        this.reads.workPackages.stepsOf(workPackageId),
        this.reads.estimates.listByWorkPackage(workPackageId),
        this.reads.dependencies.listByWorkPackage(workPackageId),
      ]);
      // Proof: removing this lifetime boundary independently failed `checks lifetime for an empty observation and immediately after every awaited boundary` (2026-10-22).
      this.authority.assertActive();
      const change = overrides.get(workPackageId);
      const projectedRows = change?.rows ?? rows;
      const projectedSteps = change?.steps ?? steps;
      for (const row of projectedRows) {
        // Proof: the retained row-ownership negative rejects foreign rows before resolving proposed metadata.
        if (row.workPackageId !== workPackageId)
          throw new Error(`work item ${row.id} does not belong to work package ${workPackageId}`);
      }
      const leafSteps = await this.reads.workItems.resolveStepOrders(workPackageId, {
        rows: projectedRows,
        directTypes: selectDirectTypes(change?.directTypes),
      });
      // Proof: omitting this boundary returned a graph after candidate capture expired its owning observation.
      this.authority.assertActive();
      const state: DependencyGraphState = {
        rows: projectedRows,
        steps: projectedSteps,
        estimates: change?.estimates ?? estimates,
        legacy: change?.legacy ?? legacy,
        // Proof: forcing every work package to anchor-slice changed B legacy attachment from 1 to 0 in `reads each workPackage with its own reach` (2026-10-22).
        reach: change?.reach ?? workPackage.depReach,
        stepOrder: {
          kind: 'leaf',
          byLeaf: indexCapturedLeafSteps(projectedRows, projectedSteps, leafSteps),
        },
        typed: relationships.filter(
          (dependency) =>
            dependency.predecessor.workPackageId === workPackageId &&
            dependency.successor.workPackageId === workPackageId,
        ),
      };
      workPackages.push({ workPackageId, state });
    }
    return {
      workPackages,
      external: relationships.filter(
        (dependency) => dependency.predecessor.workPackageId !== dependency.successor.workPackageId,
      ),
    };
  }

  /** The actual node-cycle decision, with no work-package-level cycle approximation. */
  async findCycle(
    workPackageIds: readonly string[],
    changes: readonly ConnectedDependencyGraphChange[] = [],
  ): Promise<StepNodeCycle | null> {
    return findStepNodeCycle(
      resolveConnectedDependencyGraph(await this.read(workPackageIds, changes)).graph,
    );
  }

  /** Incident references matching both the endpoint work package and stable step identity. */
  async findStepReferences(workPackageId: string, stepId: string): Promise<string[]> {
    const captured = await this.read([workPackageId]);
    const connected = resolveConnectedDependencyGraph(captured);
    return [...connected.relationships.values()]
      .filter((dependency) =>
        [dependency.predecessor, dependency.successor].some(
          (endpoint) =>
            endpoint.workPackageId === workPackageId &&
            endpoint.scope !== 'whole' &&
            endpoint.stepId === stepId,
        ),
      )
      .map((dependency) => dependency.id)
      .sort();
  }
}
