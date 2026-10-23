import type { ScopedDependencyEndpoint } from '@wbs/domain/typed-dependency';

import type { TypedDependencyEndpoint, TypedDependencyView } from '@/lib/wbs-api';
import type { AddressCandidate, AddressProject } from '@/modules/dependency-lookup/contract';

import type { PickerEntry } from './dep-picker';

export type DependencySelection =
  | { kind: 'local'; endpoint: ScopedDependencyEndpoint }
  | {
      kind: 'remote';
      endpoint: ScopedDependencyEndpoint;
      project: AddressProject;
      addressRevision: string;
      candidate: AddressCandidate;
    };
export type DependencyOption =
  | { kind: 'project'; key: string; project: AddressProject }
  | {
      kind: 'endpoint';
      key: string;
      selection: DependencySelection;
      label: string;
      detail: string;
      refusal?: PickerEntry['refusal'];
      status?: PickerEntry['status'];
    };
export type EndpointOption = Extract<DependencyOption, { kind: 'endpoint' }>;

/** Stable coordinates identify options even when projects reuse a number or display code. */
export function encodeDependencyEndpoint(endpoint: ScopedDependencyEndpoint): string {
  // Proof: removing projectId blocked the second project's pending write; removing scope erased the distinct node option beside descendant-step (mounted autocomplete/search tests, 2026-10-22).
  return JSON.stringify([
    endpoint.projectId,
    endpoint.workItemId,
    endpoint.scope,
    endpoint.scope === 'whole' ? null : endpoint.stepId,
  ]);
}

/** A bounded address observation retains its project and revision through the entire gesture. */
export function buildRemoteDependencyOption(
  project: AddressProject,
  addressRevision: string,
  candidate: AddressCandidate,
): EndpointOption {
  const endpoint = { ...candidate.endpoint, projectId: candidate.projectId };
  const label =
    candidate.reference ??
    `${project.abbreviation}.${candidate.number} · ${candidate.step?.name ?? candidate.name}${candidate.endpoint.scope === 'descendant-step' ? ' (all descendants)' : ''}`;
  return {
    kind: 'endpoint',
    key: encodeDependencyEndpoint(endpoint),
    selection: { kind: 'remote', endpoint, project, addressRevision, candidate },
    label: `${label} - ${candidate.name}`,
    detail: candidate.name,
  };
}

/** Preserves remote stable pairs; compact local node syntax remains compatible with existing writers. */
export function serializeDependencyEndpoint(
  endpoint: ScopedDependencyEndpoint,
  ownerProjectId: string,
): TypedDependencyEndpoint {
  if (endpoint.projectId !== ownerProjectId) return endpoint;
  switch (endpoint.scope) {
    case 'whole':
      return { scope: 'whole', workItemId: endpoint.workItemId };
    case 'node':
      return { scope: 'node', stepNodeId: `sn1.${endpoint.workItemId}.${endpoint.stepId}` };
    case 'descendant-step':
      return { scope: 'descendant-step', workItemId: endpoint.workItemId, stepId: endpoint.stepId };
  }
}

/**
 * Serializes a persisted endpoint without discovering or widening its scope.
 * Older local reads may omit projectId; captured foreign coordinates stay explicit.
 */
export function serializePersistedDependencyEndpoint(
  endpoint: TypedDependencyView['predecessor'],
  ownerProjectId: string,
): TypedDependencyEndpoint {
  const coordinate = endpoint.captured?.endpoint ?? endpoint;
  // Proof: substituting the owner project failed the mounted remote node SS exact-payload case (2026-10-23).
  const projectId = coordinate.projectId ?? ownerProjectId;
  if (coordinate.scope === 'whole')
    return serializeDependencyEndpoint(
      { projectId, scope: 'whole', workItemId: coordinate.workItemId },
      ownerProjectId,
    );
  // Proof: removing this guard made the missing persisted step identity test produce a write instead of throwing (2026-10-23).
  if (coordinate.stepId === undefined)
    throw new Error('Missing persisted dependency step identity');
  return serializeDependencyEndpoint(
    {
      projectId,
      scope: coordinate.scope,
      workItemId: coordinate.workItemId,
      stepId: coordinate.stepId,
    },
    ownerProjectId,
  );
}
