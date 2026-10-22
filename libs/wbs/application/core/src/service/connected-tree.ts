import {
  deriveNumbers,
  formatStepNodeId,
  formatStepReference,
  indexTree,
  type RelationshipType,
  type ScopedDependencyEndpoint,
  sliceKey,
} from '@wbs/domain';

import type { EndpointEvidence } from '../ports/dependency-context';
import type { PlanInputReads } from '../ports/saved-plan-capture-values';
import type { LivePlanRead } from '../ports/shared-people-values';
import { selectConnectedProject } from './connected-plan-projection';
import type { ConnectedReadiness } from './connected-readiness';

type ConnectedRead = Extract<LivePlanRead, { kind: 'connected' }>;
type ConnectedMetadata =
  ConnectedRead['metadataByProject'] extends ReadonlyMap<string, infer M> ? M : never;

/**
 * Node references name individual leaf steps; descendant-step references name
 * the parent address and retain scope/step identity as a selector. Uncoded nodes
 * retain stable navigation identities without a printable step reference.
 */
export interface ConnectedTreeEndpoint extends EndpointEvidence {
  readonly qualifiedReference: string | null;
  readonly stepReference: string | null;
  readonly stepNodeId: string | null;
}

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
  readonly dependencies: readonly ConnectedTreeDependency[];
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
  for (const member of projection.capture.projects) {
    const metadata = requireEvidence(
      metadataByProject.get(member.projectId),
      `metadata ${member.projectId}`,
    );
    const rowIds = new Set(member.reads.workItems.map((row) => row.id));
    const stepIds = new Set(member.reads.steps.map((step) => step.id));
    // Proof: removing this guard failed all five `refuses corrupted ... metadata identities` cases; missing steps and foreign owners were accepted.
    if (
      metadata.project.id !== member.projectId ||
      metadata.workItems.length !== rowIds.size ||
      metadata.steps.length !== stepIds.size ||
      metadata.workItems.some(
        (row) => row.projectId !== member.projectId || !rowIds.delete(row.id),
      ) ||
      metadata.steps.some((step) => step.projectId !== member.projectId || !stepIds.delete(step.id))
    )
      throw new Error(`inconsistent connected tree metadata identities ${member.projectId}`);
  }
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
  const projectEndpoint = (endpoint: ScopedDependencyEndpoint): ConnectedTreeEndpoint => {
    const own = requireEvidence(
      metadataByProject.get(endpoint.projectId),
      `metadata ${endpoint.projectId}`,
    );
    const row = requireEvidence(
      own.workItems.find((candidate) => candidate.id === endpoint.workItemId),
      `endpoint row ${endpoint.workItemId}`,
    );
    let numbers = numbersByProject.get(endpoint.projectId);
    if (numbers === undefined) {
      numbers = deriveNumbers(own.workItems);
      numbersByProject.set(endpoint.projectId, numbers);
    }
    const workItemNumber = requireEvidence(numbers.get(row.id), `endpoint number ${row.id}`);
    // Proof: undefined abbreviation and row-name injections were accepted before these refusals; both `refuses absent endpoint ... evidence` cases failed.
    const abbreviation = requireLabel(
      own.project.abbreviation,
      `endpoint abbreviation ${endpoint.projectId}`,
    );
    const name = requireLabel(row.name, `endpoint row name ${row.id}`);
    const steps = [...own.steps].sort((left, right) => left.position - right.position);
    const step =
      endpoint.scope === 'whole'
        ? null
        : requireEvidence(
            steps.find((candidate) => candidate.id === endpoint.stepId),
            `endpoint step ${endpoint.projectId}.${endpoint.stepId}`,
          );
    if (step !== null) {
      // Proof: undefined step-name and step-code injections were accepted as endpoint evidence before these refusals; both named absence cases failed.
      requireLabel(step.name, `endpoint step name ${step.id}`);
      requireEvidence(step.code, `endpoint step code ${step.id}`);
    }
    const stepReference =
      // Proof: replacing workItemNumber with '010' failed the remote own-number assertion in `projects incoming and outgoing incident labels`.
      // Proof: restoring non-whole single-step formatting failed `labels a descendant-step selector` on its null step reference and parent address.
      endpoint.scope !== 'node' || step?.code == null
        ? null
        : formatStepReference(workItemNumber, step.code, steps.indexOf(step) + 1, steps.length);
    const reference = endpoint.scope === 'node' ? stepReference : workItemNumber;
    return {
      endpoint: { ...endpoint },
      isLeaf: !own.workItems.some((candidate) => candidate.parentId === row.id),
      revision: row.revision,
      name,
      projectAbbreviation: abbreviation,
      workItemNumber,
      step:
        step === null
          ? null
          : { id: step.id, name: step.name, code: step.code, position: step.position },
      stepReference,
      qualifiedReference: reference === null ? null : `${abbreviation}.${reference}`,
      stepNodeId: endpoint.scope === 'node' ? formatStepNodeId(endpoint) : null,
    };
  };
  return {
    kind: 'connected',
    reads: member.reads,
    metadata,
    readiness: targetReadiness,
    placement,
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
