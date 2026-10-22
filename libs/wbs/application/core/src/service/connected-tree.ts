import {
  deriveNumbers,
  type ElsewhereHolder,
  indexTree,
  type RelationshipType,
  sliceKey,
} from '@wbs/domain';

import type { PlanInputReads } from '../ports/saved-plan-capture-values';
import type { ElsewhereHolderLabel } from '../ports/shared-people-values';
import type { LivePlanRead } from '../ports/shared-people-values';
import {
  type ConnectedTreeEndpoint,
  createConnectedEndpointProjector,
  validateConnectedMetadata,
} from './connected-endpoints';
export type { ConnectedTreeEndpoint } from './connected-endpoints';
import type { ConnectedOptimizationSelection } from './connected-optimization';
import {
  type ConnectedOptimizationView,
  projectConnectedOptimization,
} from './connected-optimization-view';
import { selectConnectedProject } from './connected-plan-projection';
import type { ConnectedReadiness } from './connected-readiness';

type ConnectedRead = Extract<LivePlanRead, { kind: 'connected' }>;
type ConnectedMetadata =
  ConnectedRead['metadataByProject'] extends ReadonlyMap<string, infer M> ? M : never;

/** Authored incident links include outgoing constraints without leaking unrelated component edges. */
export interface ConnectedTreeDependency {
  readonly id: string;
  readonly projectId: string;
  readonly type: RelationshipType;
  readonly predecessor: ConnectedTreeEndpoint;
  readonly successor: ConnectedTreeEndpoint;
}

/**
 * Resolved semantic input to the ordinary row presenter. Accounting and row folds
 * use reads plus live metadata; readiness and placement must not be re-derived
 * from the target's rows. Unavailable placement retains the graph and readings.
 */
export interface ConnectedTreeProjection {
  readonly kind: 'connected';
  readonly reads: PlanInputReads;
  readonly metadata: ConnectedMetadata;
  readonly readiness: ConnectedReadiness;
  readonly placement: ReturnType<typeof selectConnectedProject>;
  /** Exact target boundary and objective comparisons; final dates still come only from placement. */
  readonly optimization: ConnectedOptimizationSelection | null;
  /** Detached public-view prerequisite; not attached to the HTTP tree yet. */
  readonly optimizationView: ConnectedOptimizationView | null;
  readonly dependencies: readonly ConnectedTreeDependency[];
  /** Checked display holders by target slice; numerical placement remains unchanged. */
  readonly foreignPersonHolders: ReadonlyMap<string, ElsewhereHolder>;
  readonly elsewhereHolders: readonly ElsewhereHolderLabel[];
}

function requireEvidence<T>(value: T | undefined, name: string): T {
  // Proof: removing this guard made `refuses absent row status` return an undefined status instead of refusing.
  if (value === undefined) throw new Error(`missing connected tree ${name}`);
  return value;
}

function requireLabel(value: string | null | undefined, name: string): string {
  // Proof: removing null refusal made all three `refuses null endpoint ... evidence` cases accept malformed labels.
  if (value === null) throw new Error(`missing connected tree ${name}`);
  return requireEvidence(value, name);
}

/**
 * Select a detached target without IO, scheduling or optimization admission.
 * Component readings keep their remote blockers and root identities. Labels use
 * each endpoint's captured live rows and step ordering.
 *
 * @throws for missing target placement, member metadata, row/node evidence or
 * endpoint facts. The producer owns authorization and observation lifetime;
 * this function accepts no capability with which to reread either.
 */
export function projectConnectedTree(
  captured: ConnectedRead,
  projectId: string,
): ConnectedTreeProjection {
  const { projection, readiness, metadataByProject } = captured;
  const placement = selectConnectedProject(projection, projectId);
  validateConnectedMetadata(captured);
  const member = requireEvidence(
    projection.capture.projects.find((candidate) => candidate.projectId === projectId),
    `member ${projectId}`,
  );
  const metadata = requireEvidence(metadataByProject.get(projectId), `metadata ${projectId}`);
  const rowIds = new Set(metadata.workItems.map((row) => row.id));
  const leaves = indexTree(metadata.workItems).leafIds;
  const targetReadiness: ConnectedReadiness = {
    statuses: new Map(
      metadata.workItems.map((row) => [
        row.id,
        requireEvidence(readiness.statuses.get(row.id), `status ${row.id}`),
      ]),
    ),
    nodes: {
      readings: new Map(
        leaves.map((id) => [
          id,
          requireEvidence(readiness.nodes.readings.get(id), `reading ${id}`),
        ]),
      ),
      causes: new Map(
        leaves.map((id) => [id, requireEvidence(readiness.nodes.causes.get(id), `cause ${id}`)]),
      ),
    },
    evidenceByNode: new Map(
      projection.authored.graph.nodes.flatMap((node) => {
        const id = node.kind === 'step' ? node.ref.workItemId : node.workItemId;
        if (!rowIds.has(id)) return [];
        const key = sliceKey(id, node.kind === 'step' ? node.ref.stepId : null);
        // Proof: replacing this required lookup with a raw `.get` made the
        // projector's missing-evidence case accept absent execution facts;
        // watched 2026-10-22.
        return [[key, requireEvidence(readiness.evidenceByNode.get(key), `evidence ${key}`)]];
      }),
    ),
    eligibilityByNode: new Map(
      projection.authored.graph.nodes.flatMap((node) => {
        const id = node.kind === 'step' ? node.ref.workItemId : node.workItemId;
        if (!rowIds.has(id)) return [];
        // Proof: removing these per-step checks made `refuses missing per-step readings and causes` accept an incomplete leaf.
        if (node.kind === 'step') {
          requireEvidence(
            readiness.nodes.readings.get(id)?.[node.ref.stepId],
            `reading ${id}.${node.ref.stepId}`,
          );
          requireEvidence(
            readiness.nodes.causes.get(id)?.[node.ref.stepId],
            `cause ${id}.${node.ref.stepId}`,
          );
        }
        const key = sliceKey(id, node.kind === 'step' ? node.ref.stepId : null);
        return [
          [
            key,
            requireEvidence(readiness.eligibilityByNode.get(key), `eligibility ${key}`),
          ] as const,
        ];
      }),
    ),
    predecessorIdsByLeaf: new Map(
      [...readiness.predecessorIdsByLeaf].filter(([id]) => rowIds.has(id)),
    ),
    orderByWorkItem: new Map(
      metadata.workItems.map((row) => [
        row.id,
        requireEvidence(readiness.orderByWorkItem.get(row.id), `order ${row.id}`),
      ]),
    ),
  };
  const numbersByProject = new Map<string, ReadonlyMap<string, string>>();
  const projectEndpoint = createConnectedEndpointProjector(metadataByProject, numbersByProject);
  const holders = projectPersonHolders(captured, projectId, numbersByProject);
  return {
    kind: 'connected',
    ...holders,
    reads: member.reads,
    metadata,
    readiness: targetReadiness,
    placement,
    optimization:
      projection.placement.kind === 'scheduled'
        ? (projection.placement.stages.find(
            (selection) => selection.stage.projectId === projectId,
          ) ?? null)
        : null,
    // Proof: replacing this call with null failed nine producer-path view tests
    // including scoped comparisons, terminal evidence and absent-label refusal.
    optimizationView: projectConnectedOptimization(captured, projectId),
    dependencies: projection.capture.relationships
      // Proof: replacing the incident predicate with true exposed unrelated bc to A and failed `projects incoming and outgoing incident labels`.
      .filter(
        (relationship) =>
          relationship.predecessor.projectId === projectId ||
          relationship.successor.projectId === projectId,
      )
      .map(({ id, projectId: ownerId, type, predecessor, successor }) => ({
        id,
        projectId: ownerId,
        type,
        predecessor: projectEndpoint(predecessor),
        successor: projectEndpoint(successor),
      })),
  };
}

/** Resolve direct display blockers from complete detached placement, never from authored links. */
function projectPersonHolders(
  captured: ConnectedRead,
  projectId: string,
  numbersByProject: Map<string, ReadonlyMap<string, string>>,
): Pick<ConnectedTreeProjection, 'foreignPersonHolders' | 'elsewhereHolders'> {
  const foreignPersonHolders = new Map<string, ElsewhereHolder>();
  const labels = new Map<string, ElsewhereHolderLabel>();
  const { projection, metadataByProject } = captured;
  const placement = projection.placement;
  if (placement.kind !== 'scheduled') return { foreignPersonHolders, elsewhereHolders: [] };
  const target = requireEvidence(
    placement.byProject.get(projectId),
    `holder target schedule ${projectId}`,
  );
  const member = requireEvidence(
    projection.capture.projects.find((candidate) => candidate.projectId === projectId),
    `holder target member ${projectId}`,
  );
  for (const [key, slice] of target.slices) {
    // Proof: bypassing this membership check let the foreign-capacity fault's
    // blocker set escape; both captured projection and mounted HTTP500→200
    // negatives failed (2026-10-22).
    for (const prior of slice.capacityPredecessorIds)
      if (!target.slices.has(prior))
        throw new Error(`connected tree foreign or absent capacity predecessor ${prior}`);
    // Proof: removing this refusal admitted the missing person-predecessor
    // fault; its captured production projection test failed (2026-10-22).
    if (slice.boundBy === 'person' && slice.resourcePredecessorId === null)
      throw new Error(`connected tree person predecessor absent ${key}`);
    if (slice.resourcePredecessorId === null) continue;
    const predecessor = requireEvidence(
      placement.combined.slices.get(slice.resourcePredecessorId),
      `holder predecessor ${slice.resourcePredecessorId}`,
    );
    const ownerId = requireEvidence(
      placement.identities.projectIdByWorkItem.get(predecessor.workItemId),
      `holder ownership ${predecessor.workItemId}`,
    );
    // Proof: bypassing captured membership accepted an extra uncaptured owner
    // and its injected metadata; the named owner fault failed (2026-10-22).
    if (!projection.capture.projects.some((candidate) => candidate.projectId === ownerId))
      throw new Error(`connected tree holder project is not captured ${ownerId}`);
    const own = requireEvidence(metadataByProject.get(ownerId), `holder metadata ${ownerId}`);
    // Proof: choosing the first remote row instead failed exact holder IDs and
    // labels in the two-distinct-holders production projection test (2026-10-22).
    const row = requireEvidence(
      own.workItems.find((candidate) => candidate.id === predecessor.workItemId),
      `holder row ${predecessor.workItemId}`,
    );
    // Proof: removing this refusal accepted a local combined referent absent
    // from the target payload; the named local-reference fault failed (2026-10-22).
    if (ownerId === projectId && !target.slices.has(slice.resourcePredecessorId))
      throw new Error(
        `connected tree local holder is absent from target ${slice.resourcePredecessorId}`,
      );
    if (slice.boundBy === 'person') {
      // Proof: person mismatch, local capacity IDs, team, resource and existing
      // holder predicates removed independently each admitted its named fault
      // and failed the captured production projection test; omitting person match
      // also made the mounted mismatch answer HTTP200 instead of500 (2026-10-22).
      if (
        predecessor.personId !== slice.personId ||
        slice.capacityPredecessorIds.length !== 0 ||
        slice.capacityTeamId !== null ||
        slice.capacityResource !== undefined ||
        slice.elsewhereHolder !== undefined
      )
        throw new Error(`connected tree contradictory person blocker ${key}`);
      requireLabel(
        member.reads.people.find((person) => person.id === slice.personId)?.name,
        `holder assignee ${String(slice.personId)}`,
      );
    }
    if (ownerId === projectId) continue;
    // Proof: removing the floor and mode predicates independently accepted the
    // foreign-nonperson and isolated-foreign faults (2026-10-22).
    if (slice.boundBy !== 'person' || projection.capture.mode !== 'shared')
      throw new Error(`connected tree unsupported foreign blocker ${key}`);
    const holder = { projectId: ownerId, workItemId: row.id };
    foreignPersonHolders.set(key, holder);
    const labelKey = JSON.stringify([ownerId, row.id]);
    if (labels.has(labelKey)) continue;
    let numbers = numbersByProject.get(ownerId);
    if (numbers === undefined) {
      numbers = deriveNumbers(own.workItems);
      numbersByProject.set(ownerId, numbers);
    }
    labels.set(labelKey, {
      ...holder,
      projectName: requireLabel(own.project.name, `holder project name ${ownerId}`),
      number: requireEvidence(numbers.get(row.id), `holder number ${row.id}`),
      name: requireLabel(row.name, `holder row name ${row.id}`),
    });
  }
  return { foreignPersonHolders, elsewhereHolders: [...labels.values()] };
}
