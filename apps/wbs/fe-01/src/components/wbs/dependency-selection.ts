import type { ScopedDependencyEndpoint } from '@wbs/domain/typed-dependency';

import type { TypedDependencyEndpoint, TypedDependencyView } from '@/lib/wbs-api';
import type { AddressCandidate, AddressWorkPackage } from '@/modules/dependency-lookup/contract';

import type { PickerEntry } from './dep-picker';

export type DependencySelection =
  | { kind: 'local'; endpoint: ScopedDependencyEndpoint }
  | {
      kind: 'remote';
      endpoint: ScopedDependencyEndpoint;
      workPackage: AddressWorkPackage;
      addressRevision: string;
      candidate: AddressCandidate;
    };
export type DependencyOption =
  | { kind: 'work_package'; key: string; workPackage: AddressWorkPackage }
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

/** Stable coordinates identify options even when work packages reuse a number or display code. */
export function encodeDependencyEndpoint(endpoint: ScopedDependencyEndpoint): string {
  // Proof: removing workPackageId blocked the second work package's pending write; removing scope erased the distinct node option beside descendant-step (mounted autocomplete/search tests, 2026-10-22).
  return JSON.stringify([
    endpoint.workPackageId,
    endpoint.workItemId,
    endpoint.scope,
    endpoint.scope === 'whole' ? null : endpoint.stepId,
  ]);
}

/** A bounded address observation retains its work package and revision through the entire gesture. */
export function buildRemoteDependencyOption(
  workPackage: AddressWorkPackage,
  addressRevision: string,
  candidate: AddressCandidate,
): EndpointOption {
  const endpoint = { ...candidate.endpoint, workPackageId: candidate.workPackageId };
  const label =
    candidate.reference ??
    `${workPackage.abbreviation}.${candidate.number} · ${candidate.step?.name ?? candidate.name}${candidate.endpoint.scope === 'descendant-step' ? ' (all descendants)' : ''}`;
  return {
    kind: 'endpoint',
    key: encodeDependencyEndpoint(endpoint),
    selection: { kind: 'remote', endpoint, workPackage, addressRevision, candidate },
    label: `${label} - ${candidate.name}`,
    detail: candidate.name,
  };
}

/** Preserves remote stable pairs; compact local node syntax remains compatible with existing writers. */
export function serializeDependencyEndpoint(
  endpoint: ScopedDependencyEndpoint,
  ownerWorkPackageId: string,
): TypedDependencyEndpoint {
  if (endpoint.workPackageId !== ownerWorkPackageId) return endpoint;
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
 * Older local reads may omit workPackageId; captured foreign coordinates stay explicit.
 */
export function serializePersistedDependencyEndpoint(
  endpoint: TypedDependencyView['predecessor'],
  ownerWorkPackageId: string,
): TypedDependencyEndpoint {
  const coordinate = endpoint.captured?.endpoint ?? endpoint;
  // Proof: substituting the owner work package failed the mounted remote node SS exact-payload case (2026-10-23).
  const workPackageId = coordinate.workPackageId ?? ownerWorkPackageId;
  if (coordinate.scope === 'whole')
    return serializeDependencyEndpoint(
      { workPackageId, scope: 'whole', workItemId: coordinate.workItemId },
      ownerWorkPackageId,
    );
  // Proof: removing this guard made the missing persisted step identity test produce a write instead of throwing (2026-10-23).
  if (coordinate.stepId === undefined)
    throw new Error('Missing persisted dependency step identity');
  return serializeDependencyEndpoint(
    {
      workPackageId,
      scope: coordinate.scope,
      workItemId: coordinate.workItemId,
      stepId: coordinate.stepId,
    },
    ownerWorkPackageId,
  );
}
