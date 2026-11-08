import {
  deriveNumbers,
  formatStepNodeId,
  formatStepReference,
  type ScopedDependencyEndpoint,
} from '@wbs/domain';

import type { EndpointEvidence } from '../ports/dependency-context';
import type { LivePlanRead } from '../ports/shared-people-values';

type ConnectedRead = Extract<LivePlanRead, { kind: 'connected' }>;

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

function requireEndpointEvidence<T>(value: T | undefined, name: string): T {
  // Proof: bypassing row refusal changes the missing-row endpoint test to an uncontextualized TypeError; mounted save proof remains pending.
  if (value === undefined) throw new Error(`missing connected tree ${name}`);
  return value;
}

function requireEndpointLabel(value: string | null | undefined, name: string): string {
  // Proof: removing null refusal after extraction made all three tree `refuses null endpoint ... evidence` tests fail (2026-10-22).
  // Proof: removing null refusal also admitted malformed transitive root step names outside incident links (2026-10-23).
  if (value === null) throw new Error(`missing connected tree ${name}`);
  return requireEndpointEvidence(value, name);
}

/**
 * Label selectors from detached component metadata without IO, scheduling or optimizer projection.
 * Numbers and step positions belong to each endpoint's own captured project.
 * @throws when a captured project, row, step or required label is absent.
 */
export function createConnectedEndpointProjector(
  metadataByProject: ConnectedRead['metadataByProject'],
  numbersByProject = new Map<string, ReadonlyMap<string, string>>(),
): (endpoint: ScopedDependencyEndpoint) => ConnectedTreeEndpoint {
  return (endpoint) => {
    const own = requireEndpointEvidence(
      metadataByProject.get(endpoint.projectId),
      `metadata ${endpoint.projectId}`,
    );
    const row = requireEndpointEvidence(
      own.workItems.find((candidate) => candidate.id === endpoint.workItemId),
      `endpoint row ${endpoint.workItemId}`,
    );
    let numbers = numbersByProject.get(endpoint.projectId);
    if (numbers === undefined) {
      numbers = deriveNumbers(own.workItems);
      numbersByProject.set(endpoint.projectId, numbers);
    }
    const workItemNumber = requireEndpointEvidence(
      numbers.get(row.id),
      `endpoint number ${row.id}`,
    );
    // Proof: undefined abbreviation and row-name injections were accepted before these refusals; both `refuses absent endpoint ... evidence` cases failed.
    const abbreviation = requireEndpointLabel(
      own.project.abbreviation,
      `endpoint abbreviation ${endpoint.projectId}`,
    );
    const name = requireEndpointLabel(row.name, `endpoint row name ${row.id}`);
    const steps = [...own.steps].sort((left, right) => left.position - right.position);
    const step =
      endpoint.scope === 'whole'
        ? null
        : requireEndpointEvidence(
            steps.find((candidate) => candidate.id === endpoint.stepId),
            `endpoint step ${endpoint.projectId}.${endpoint.stepId}`,
          );
    if (step !== null) {
      // Proof: undefined step-name and step-code injections were accepted as endpoint evidence before these refusals; both named absence cases failed.
      requireEndpointLabel(step.name, `endpoint step name ${step.id}`);
      requireEndpointEvidence(step.code, `endpoint step code ${step.id}`);
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
}

/** Cross-check complete captured member identities before projecting labels or historical facts. */
export function validateConnectedMetadata(captured: ConnectedRead): void {
  for (const member of captured.projection.capture.projects) {
    const metadata = requireEndpointEvidence(
      captured.metadataByProject.get(member.projectId),
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
}
