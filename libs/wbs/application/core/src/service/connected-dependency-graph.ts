import {
  type ConnectedGraph,
  findStepNodeCycle,
  formatScopedDependencyKey,
  resolveConnectedGraph,
  type ScopedTypedDependency,
  type StepNodeCycle,
} from '@wbs/domain';

import type { StoredTypedDependency, TypedDependencyStore } from '../ports/typed-dependency-store';
import { type DependencyGraphState, resolveDependencyGraphContext } from './dependency-graph';

/** Minimal authored-graph evidence; no schedule, calendar, holds reduction or cache. */
export interface ConnectedDependencyGraphState {
  readonly projects: readonly {
    readonly projectId: string;
    readonly state: DependencyGraphState;
  }[];
  readonly external: readonly ScopedTypedDependency[];
}

/**
 * Authority already admitted by the caller's current write observation.
 * Both methods must be bound to that observation's lifetime. requireProject
 * throws unless its current same-organization ownership and read authority
 * permit this project, including restricted readable projects. Existence alone
 * is insufficient. It must not read labels or trees before checking ownership.
 * The caller owns the transaction; this capability never opens or closes it.
 */
export interface ConnectedGraphReadAuthority {
  assertActive(): void;
  requireProject(projectId: string): Promise<void>;
}

/**
 * Required read-only capabilities bound to the same admitted transaction.
 * List methods return complete project facts, not search pages. Incident reads
 * include incoming as well as successor-owned rows; no owned-empty shortcut is
 * valid. Implementations must reject reads after their owning scope settles.
 */
export interface ConnectedDependencyGraphReads {
  readonly projects: {
    findById(
      projectId: string,
    ): Promise<{ readonly id: string; readonly depReach: DependencyGraphState['reach'] } | null>;
    stepsOf(projectId: string): Promise<DependencyGraphState['steps']>;
  };
  readonly workItems: { listByProject(projectId: string): Promise<DependencyGraphState['rows']> };
  readonly estimates: {
    listByProject(projectId: string): Promise<DependencyGraphState['estimates']>;
  };
  readonly dependencies: {
    listByProject(projectId: string): Promise<DependencyGraphState['legacy']>;
  };
  readonly typedDependencies: Pick<TypedDependencyStore, 'listIncident'>;
}

/**
 * Complete replacements for explicit project-local graph facts. Omission keeps
 * stored evidence; an empty collection explicitly removes it. typed replaces
 * this successor owner's entire authored set, including local and external rows.
 * Proposed endpoints must already have passed modeled admission before this
 * trusted-state boundary. Staged after-write checks need no overrides.
 */
export interface ConnectedDependencyGraphChange extends Partial<
  Omit<DependencyGraphState, 'typed'>
> {
  readonly projectId: string;
  readonly typed?: readonly StoredTypedDependency[];
}

/** Prepares every local context once and invokes the shared domain expansion. */
export function resolveConnectedDependencyGraph(
  state: ConnectedDependencyGraphState,
): ConnectedGraph {
  return resolveConnectedGraph({
    projects: state.projects.map((project) =>
      resolveDependencyGraphContext(project.projectId, project.state),
    ),
    external: state.external,
  });
}

/**
 * Captures authored dependency closure from the caller's current observation.
 * Each evaluation starts fresh, so staged graph edits cannot reuse old facts.
 * Traversal follows both external directions, including old and proposed-new
 * components. Reads never authorize another project's writes. Missing/corrupt
 * trusted evidence throws; actual node cycles are returned by findCycle.
 */
export class ConnectedDependencyGraphReader {
  constructor(
    private readonly reads: ConnectedDependencyGraphReads,
    private readonly authority: ConnectedGraphReadAuthority,
  ) {}

  async read(
    projectIds: readonly string[],
    changes: readonly ConnectedDependencyGraphChange[] = [],
  ): Promise<ConnectedDependencyGraphState> {
    // Proof: removing this lifetime boundary independently failed `checks lifetime for an empty observation and immediately after every awaited boundary` (2026-10-22).
    this.authority.assertActive();
    // Proof: retaining incidents across evaluations let the staged reverse link escape; retaining the whole capture let estimate/reach changes escape. Both freshness tests failed on missing cycle (2026-10-22).
    const overrides = new Map<string, ConnectedDependencyGraphChange>();
    for (const change of changes) {
      // Proof: bypassing duplicate-owner refusal made `rejects duplicate overrides` accept ambiguous replacements (2026-10-22).
      if (overrides.has(change.projectId))
        throw new Error(`duplicate graph override for ${change.projectId}`);
      overrides.set(change.projectId, change);
      for (const dependency of change.typed ?? []) {
        // Proof: bypassing each owner equality separately made `rejects each proposed ownership mismatch independently` accept its isolated malformed set (2026-10-22).
        if (
          dependency.projectId !== change.projectId ||
          dependency.successor.projectId !== change.projectId
        )
          throw new Error(`proposed owner mismatch for ${dependency.id}`);
      }
    }
    const admitted = new Set<string>();
    const requireProject = async (projectId: string): Promise<void> => {
      if (!admitted.has(projectId)) {
        // Proof: skipping authority admitted unreadable b and read its tree; `requires reached-project authority` failed (2026-10-22).
        await this.authority.requireProject(projectId);
        // Proof: removing this lifetime boundary independently failed `checks lifetime for an empty observation and immediately after every awaited boundary` (2026-10-22).
        this.authority.assertActive();
        admitted.add(projectId);
      }
    };
    const incidents = new Map<string, readonly StoredTypedDependency[]>();
    const identities = new Map<string, StoredTypedDependency>();
    const register = (dependency: StoredTypedDependency): void => {
      // Proof: bypassing stored owner equality made `rejects malformed owner` accept the inconsistent row (2026-10-22).
      if (dependency.projectId !== dependency.successor.projectId)
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
    const readIncident = async (projectId: string): Promise<readonly StoredTypedDependency[]> => {
      await requireProject(projectId);
      const cached = incidents.get(projectId);
      if (cached !== undefined) return cached;
      const dependencies = await this.reads.typedDependencies.listIncident([projectId]);
      // Proof: removing this lifetime boundary independently failed `checks lifetime for an empty observation and immediately after every awaited boundary` (2026-10-22).
      this.authority.assertActive();
      for (const dependency of dependencies) {
        // Proof: bypassing incident membership made `rejects malformed owner, unrelated incident rows` accept an unrelated component edge (2026-10-22).
        if (
          dependency.predecessor.projectId !== projectId &&
          dependency.successor.projectId !== projectId
        )
          throw new Error(`non-incident relationship ${dependency.id} returned for ${projectId}`);
        register(dependency);
      }
      incidents.set(projectId, dependencies);
      return dependencies;
    };
    const seeds = new Set(projectIds);
    for (const change of changes) {
      seeds.add(change.projectId);
      if (change.typed === undefined) continue;
      const old = await readIncident(change.projectId);
      for (const dependency of [
        ...old.filter((dependency) => dependency.projectId === change.projectId),
        ...change.typed,
      ]) {
        // Proof: omitting old/new predecessor seeds lost b from `replaces complete successor-owned sets and seeds both old and new components` (2026-10-22).
        seeds.add(dependency.predecessor.projectId);
        seeds.add(dependency.successor.projectId);
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
    for (const projectId of pending) {
      if (visited.has(projectId)) continue;
      visited.add(projectId);
      const stored = await readIncident(projectId);
      for (const dependency of stored) {
        if (overrides.get(dependency.projectId)?.typed === undefined) addEffective(dependency);
      }
      for (const dependency of effective.values()) {
        // Proof: disabling either incident traversal direction separately lost required projects in `walks incoming and outgoing incidents once` (2026-10-22).
        if (dependency.predecessor.projectId === projectId)
          pending.push(dependency.successor.projectId);
        if (dependency.successor.projectId === projectId)
          pending.push(dependency.predecessor.projectId);
      }
    }
    const relationships = [...effective.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const projects: { projectId: string; state: DependencyGraphState }[] = [];
    for (const projectId of [...visited].sort()) {
      await requireProject(projectId);
      const project = await this.reads.projects.findById(projectId);
      // Proof: removing this lifetime boundary independently failed `checks lifetime for an empty observation and immediately after every awaited boundary` (2026-10-22).
      this.authority.assertActive();
      // Proof: ignoring identity mismatch accepted a foreign project in `rejects a required project read`. Ignoring null instead reached a later missing-facts failure (diagnostic only); both watched 2026-10-22.
      if (project?.id !== projectId)
        throw new Error(`required project ${projectId} missing or mismatched`);
      const [rows, steps, estimates, legacy] = await Promise.all([
        this.reads.workItems.listByProject(projectId),
        this.reads.projects.stepsOf(projectId),
        this.reads.estimates.listByProject(projectId),
        this.reads.dependencies.listByProject(projectId),
      ]);
      // Proof: removing this lifetime boundary independently failed `checks lifetime for an empty observation and immediately after every awaited boundary` (2026-10-22).
      this.authority.assertActive();
      const change = overrides.get(projectId);
      const state: DependencyGraphState = {
        rows: change?.rows ?? rows,
        steps: change?.steps ?? steps,
        estimates: change?.estimates ?? estimates,
        legacy: change?.legacy ?? legacy,
        // Proof: forcing every project to anchor-slice changed B legacy attachment from 1 to 0 in `reads each project with its own reach` (2026-10-22).
        reach: change?.reach ?? project.depReach,
        typed: relationships.filter(
          (dependency) =>
            dependency.predecessor.projectId === projectId &&
            dependency.successor.projectId === projectId,
        ),
      };
      for (const row of state.rows) {
        // Proof: bypassing row ownership made `throws for missing required projects, unreadable facts and foreign work-item rows` accept the foreign row (2026-10-22).
        if (row.projectId !== projectId)
          throw new Error(`work item ${row.id} does not belong to project ${projectId}`);
      }
      projects.push({ projectId, state });
    }
    return {
      projects,
      external: relationships.filter(
        (dependency) => dependency.predecessor.projectId !== dependency.successor.projectId,
      ),
    };
  }

  /** The actual node-cycle decision, with no project-level cycle approximation. */
  async findCycle(
    projectIds: readonly string[],
    changes: readonly ConnectedDependencyGraphChange[] = [],
  ): Promise<StepNodeCycle | null> {
    return findStepNodeCycle(
      resolveConnectedDependencyGraph(await this.read(projectIds, changes)).graph,
    );
  }

  /** Incident references matching both the endpoint project and stable step identity. */
  async findStepReferences(projectId: string, stepId: string): Promise<string[]> {
    const captured = await this.read([projectId]);
    const connected = resolveConnectedDependencyGraph(captured);
    return [...connected.relationships.values()]
      .filter((dependency) =>
        [dependency.predecessor, dependency.successor].some(
          (endpoint) =>
            endpoint.projectId === projectId &&
            endpoint.scope !== 'whole' &&
            endpoint.stepId === stepId,
        ),
      )
      .map((dependency) => dependency.id)
      .sort();
  }
}
