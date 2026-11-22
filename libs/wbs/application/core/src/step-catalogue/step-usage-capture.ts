import type { StepTypeState, WorkPackageChain } from '@wbs/domain';

import type { StepFactKind } from '../ports/step-catalogue';
import { readCatalogueId, type StepIdentity } from './step-catalogue';
import type {
  StepUsageEndpoint,
  StepUsageFact,
  StepUsagePackage,
  StepUsageWorkItem,
} from './step-usage';

export interface StepUsageWorkItemRecord {
  readonly id: unknown;
  readonly workPackageId: unknown;
  readonly parentId: unknown;
  readonly name: unknown;
  readonly position: unknown;
}
export interface StepUsageTypeRecord {
  readonly workItemId: unknown;
  readonly typeId: unknown;
  readonly actualTypeId: unknown;
  readonly organizationId: unknown;
  readonly actualOrganizationId: unknown;
}
export interface StepUsageFactRecord {
  readonly kind: StepFactKind;
  readonly scope: unknown;
  readonly workPackageId: unknown;
  readonly workItemId: unknown;
  readonly stepId: unknown;
}
export function encodeStepUsageLink(workPackageId: string, stepId: string): string {
  return JSON.stringify([workPackageId, stepId]);
}

/** Decodes actual noninherited type memberships and tree scalars once; no absent type becomes an arbitrary selected type. */
export function readStepUsagePackages(
  chains: readonly WorkPackageChain[],
  rows: readonly StepUsageWorkItemRecord[],
  memberships: readonly StepUsageTypeRecord[],
): readonly StepUsagePackage[] {
  const packages = new Map(chains.map((chain) => [chain.workPackageId, chain]));
  if (packages.size !== chains.length) throw new Error('step usage duplicate captured package');
  const workItemsById = new Map<
    string,
    { readonly row: StepUsageWorkItemRecord; readonly chain: WorkPackageChain }
  >();
  for (const row of rows) {
    const id = readCatalogueId(row.id, 'usage work item');
    const chain = packages.get(readCatalogueId(row.workPackageId, 'usage work item package'));
    if (chain === undefined) throw new Error('step usage work item package is absent');
    if (workItemsById.has(id)) throw new Error('step usage duplicate captured work item');
    workItemsById.set(id, { row, chain });
  }
  const types = new Map<string, Set<string>>();
  for (const membership of memberships) {
    const id = readCatalogueId(membership.workItemId, 'typed work item');
    const workItemCapture = workItemsById.get(id);
    if (workItemCapture === undefined) throw new Error('step usage typed work item is absent');
    const typeId = readCatalogueId(membership.typeId, 'work item type');
    const organizationId = readCatalogueId(membership.organizationId, 'type organization');
    if (
      membership.actualTypeId !== typeId ||
      membership.actualOrganizationId !== organizationId ||
      organizationId !== workItemCapture.chain.organizationId
    )
      throw new Error('step usage work item type ownership is inconsistent');
    const held = types.get(id);
    if (held === undefined) types.set(id, new Set([typeId]));
    else {
      if (held.has(typeId)) throw new Error('step usage duplicate type membership');
      held.add(typeId);
    }
  }
  const workItems = new Map<string, StepUsageWorkItem[]>();
  for (const chain of chains) workItems.set(chain.workPackageId, []);
  for (const [id, { row, chain }] of workItemsById) {
    if (typeof row.position !== 'number' || !Number.isFinite(row.position))
      throw new Error('step usage work item position is malformed');
    const stated = types.get(id);
    const typeIds = stated === undefined ? [] : [...stated].sort(compareStepUsageIds);
    let typeState: StepTypeState;
    if (typeIds.length === 0) typeState = { kind: 'untyped' };
    else if (typeIds.length === 1) {
      const typeId = typeIds.at(0);
      if (typeId === undefined) throw new Error('step usage selected type is absent');
      typeState = { kind: 'typed', typeId };
    } else typeState = { kind: 'conflict', typeIds };
    const held = workItems.get(chain.workPackageId);
    if (held === undefined) throw new Error('step usage captured package disappeared');
    if (typeof row.name !== 'string') throw new Error('step usage work item name is malformed');
    held.push({
      id,
      name: row.name,
      parentId: row.parentId === null ? null : readCatalogueId(row.parentId, 'work item parent'),
      position: row.position,
      typeState,
    });
  }
  return chains.map((chain) => {
    const held = workItems.get(chain.workPackageId);
    if (held === undefined) throw new Error('step usage captured package disappeared');
    return { chain: structuredClone(chain), workItems: held };
  });
}

/** Validates actual paired package/workItemCapture/definition/link identities before exposing typed endpoint shapes; whole and subtree nulls remain explicit. */
export function readStepUsageFacts(
  packages: readonly StepUsagePackage[],
  definitions: ReadonlyMap<string, StepIdentity>,
  links: ReadonlySet<string>,
  rows: readonly StepUsageFactRecord[],
): readonly StepUsageFact[] {
  const workItemsById = new Map(
    packages.flatMap(({ chain, workItems }) =>
      workItems.map((workItem) => [workItem.id, { chain, workItem }] as const),
    ),
  );
  const facts: StepUsageFact[] = [];
  for (const row of rows) {
    const workItemId = readCatalogueId(row.workItemId, 'fact work item');
    const workItemCapture = workItemsById.get(workItemId);
    const workPackageId = readCatalogueId(row.workPackageId, 'fact package');
    if (workItemCapture?.chain.workPackageId !== workPackageId)
      throw new Error('step usage fact work item/package is inconsistent');
    let endpoint: StepUsageEndpoint;
    if (row.scope === 'whole' || row.scope === 'subtree-claim') {
      if (row.stepId !== null) throw new Error('step usage nonstep endpoint carries a step');
      endpoint = { scope: row.scope, workPackageId, workItemId, stepId: null };
    } else {
      if (row.scope !== 'node' && row.scope !== 'descendant-step' && row.scope !== 'allocator')
        throw new Error('step usage endpoint scope is malformed');
      const stepId = readCatalogueId(row.stepId, 'fact step');
      const definition = definitions.get(stepId);
      if (
        definition?.organizationId !== workItemCapture.chain.organizationId ||
        !links.has(encodeStepUsageLink(workPackageId, stepId))
      )
        throw new Error('step usage fact definition/package link is absent or foreign');
      endpoint = { scope: row.scope, workPackageId, workItemId, stepId };
    }
    if (row.kind === 'attempt_issued') {
      if (endpoint.scope !== 'node' && endpoint.scope !== 'allocator')
        throw new Error('step usage allocator shape is inconsistent');
      facts.push({ kind: row.kind, endpoint });
    } else if (row.kind === 'claim') {
      if (endpoint.scope !== 'node' && endpoint.scope !== 'subtree-claim')
        throw new Error('step usage claim shape is inconsistent');
      facts.push({ kind: row.kind, endpoint });
    } else if (row.kind === 'typed_dependency' || row.kind === 'external_dependency') {
      if (endpoint.scope === 'subtree-claim' || endpoint.scope === 'allocator')
        throw new Error('step usage dependency shape is inconsistent');
      facts.push({ kind: row.kind, endpoint });
    } else {
      if (endpoint.scope !== 'node') throw new Error('step usage point fact shape is inconsistent');
      facts.push({ kind: row.kind, endpoint });
    }
  }
  return facts;
}

export interface StepUsageClaimRecord {
  readonly id: unknown;
  readonly workPackageId: unknown;
  readonly workItemId: unknown;
  readonly stepId: unknown;
  readonly parentClaimId: unknown;
  readonly personId: unknown;
  readonly actualPersonId: unknown;
  readonly personOrganizationId: unknown;
  readonly actualPersonOrganizationId: unknown;
  readonly accountId: unknown;
  readonly actualAccountId: unknown;
  readonly runId: unknown;
  readonly claimedAt: unknown;
  readonly leaseExpiresAt: unknown;
  readonly leaseRevokedAt: unknown;
}

function readClaimInstant(value: unknown, nullable: boolean): void {
  if (nullable && value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('step usage claim instant is malformed');
}

/**
 * Retains every concrete claim regardless of lease state, and validates actual holder,
 * writer and delegation references on the same captured graph. A valid null-step claim
 * reserves only a parent subtree; it never fabricates descendant step facts. The stored
 * parent must be a strict ancestor reservation written by the same account, as decideClaim
 * admits; different delegated holders/runs remain valid. No current permission is inferred.
 */
export function readStepUsageClaims(
  packages: readonly StepUsagePackage[],
  rows: readonly StepUsageClaimRecord[],
): readonly StepUsageFactRecord[] {
  const workItems = new Map(
    packages.flatMap(({ chain, workItems }) =>
      workItems.map((workItem) => [workItem.id, { chain, workItem }] as const),
    ),
  );
  const parents = new Set(
    packages.flatMap(({ workItems }) =>
      workItems.flatMap(({ parentId }) => (parentId === null ? [] : [parentId])),
    ),
  );
  const claims = new Map<
    string,
    {
      readonly workPackageId: string;
      readonly workItemId: string;
      readonly stepId: string | null;
      readonly accountId: string;
      readonly parentClaimId: string | null;
    }
  >();
  for (const row of rows) {
    const id = readCatalogueId(row.id, 'claim identity');
    if (claims.has(id)) throw new Error('step usage duplicate claim identity');
    const workItemId = readCatalogueId(row.workItemId, 'claim work item'),
      workPackageId = readCatalogueId(row.workPackageId, 'claim package');
    const workItemCapture = workItems.get(workItemId);
    if (workItemCapture?.chain.workPackageId !== workPackageId)
      throw new Error('step usage claim work item/package is inconsistent');
    const personId = readCatalogueId(row.personId, 'claim holder'),
      accountId = readCatalogueId(row.accountId, 'claim writing account');
    if (
      row.actualPersonId !== personId ||
      row.actualAccountId !== accountId ||
      row.personOrganizationId !== workItemCapture.chain.organizationId ||
      row.actualPersonOrganizationId !== workItemCapture.chain.organizationId
    )
      throw new Error('step usage claim holder/account is absent or foreign');
    if (
      row.runId !== null &&
      (typeof row.runId !== 'string' || row.runId.length === 0 || row.runId.length > 256)
    )
      throw new Error('step usage claim run is malformed');
    readClaimInstant(row.claimedAt, false);
    readClaimInstant(row.leaseExpiresAt, true);
    readClaimInstant(row.leaseRevokedAt, true);
    const stepId = row.stepId === null ? null : readCatalogueId(row.stepId, 'claim step');
    if (stepId === null ? !parents.has(workItemId) : parents.has(workItemId))
      throw new Error('step usage claim subtree/leaf shape is inconsistent');
    claims.set(id, {
      workPackageId,
      workItemId,
      stepId,
      accountId,
      parentClaimId:
        row.parentClaimId === null ? null : readCatalogueId(row.parentClaimId, 'claim parent'),
    });
  }
  for (const claim of claims.values()) {
    if (claim.parentClaimId === null) continue;
    const parent = claims.get(claim.parentClaimId);
    if (
      parent?.stepId !== null ||
      parent.workPackageId !== claim.workPackageId ||
      parent.accountId !== claim.accountId
    )
      throw new Error('step usage claim delegation is absent or inconsistent');
    const seen = new Set<string>();
    const claimedWorkItem = workItems.get(claim.workItemId);
    if (claimedWorkItem === undefined) throw new Error('step usage claimed work item disappeared');
    let at = claimedWorkItem.workItem.parentId;
    let isAncestor = false;
    while (at !== null) {
      if (seen.has(at)) throw new Error('step usage claim ancestry is cyclic');
      seen.add(at);
      const ancestor = workItems.get(at);
      if (ancestor?.chain.workPackageId !== claim.workPackageId)
        throw new Error('step usage claim ancestor is absent or foreign');
      if (at === parent.workItemId) isAncestor = true;
      at = ancestor.workItem.parentId;
    }
    if (!isAncestor) throw new Error('step usage parent claim is not a strict ancestor');
  }
  return [...claims.values()].map(({ workPackageId, workItemId, stepId }) => ({
    kind: 'claim',
    scope: stepId === null ? 'subtree-claim' : 'node',
    workPackageId,
    workItemId,
    stepId,
  }));
}

/** Binary UTF8 ordering for adapter package/type collections. */
export function compareStepUsageIds(left: string, right: string): number {
  const encoder = new TextEncoder(),
    bytes = encoder.encode(left).values();
  for (const byte of encoder.encode(right)) {
    const next = bytes.next();
    if (next.done) return -1;
    if (next.value !== byte) return next.value - byte;
  }
  return bytes.next().done ? 0 : 1;
}
