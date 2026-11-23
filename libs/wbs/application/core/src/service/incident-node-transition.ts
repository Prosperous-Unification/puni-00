import type { ScopedDependencyEndpoint } from '@wbs/domain';

import type {
  AuthorizeTypedWrites,
  CommandGraphAuthority,
  DependencyEndpointEvidence,
  WorkItemAddress,
} from '../ports/dependency-context';
import type {
  IncidentNodeReceipt,
  IncidentNodeTransition,
  IncidentRetention,
} from '../ports/incident-node-transition';
import type { StoredTypedDependency, TypedDependencyStore } from '../ports/typed-dependency-store';
import type { WorkPackageStore } from '../ports/work-package-store';
import type { EndpointEvidenceReads } from './dependency-endpoint-evidence';
import type { DependencyGraphGuard } from './dependency-graph';

/** Canonical equality excludes object property order, never relationship fields. */
export function formatIncidentKey(relationship: StoredTypedDependency): string {
  const endpoint = (end: ScopedDependencyEndpoint) => [
    end.workPackageId,
    end.workItemId,
    end.scope,
    end.scope === 'whole' ? null : end.stepId,
  ];
  return JSON.stringify([
    relationship.id,
    relationship.workPackageId,
    relationship.type,
    endpoint(relationship.predecessor),
    endpoint(relationship.successor),
  ]);
}

/** Derives only this structural work package's exact node identity; scope and step remain authored. */
export function mapIncidentNode(
  relationship: StoredTypedDependency,
  workPackageId: string,
  from: string,
  to: string,
): StoredTypedDependency {
  const map = (endpoint: ScopedDependencyEndpoint): ScopedDependencyEndpoint =>
    endpoint.workPackageId === workPackageId &&
    endpoint.workItemId === from &&
    endpoint.scope === 'node'
      ? { ...endpoint, workItemId: to }
      : endpoint;
  return {
    ...relationship,
    predecessor: map(relationship.predecessor),
    successor: map(relationship.successor),
  };
}

/** Narrows the existing refusal discriminant without replacing the callback's payload. */
function isStructureRefused<T extends { readonly ok: boolean }>(
  value: T,
): value is T & { readonly ok: false } {
  return !value.ok;
}

/** Uses raw stores in the existing UoW; callbacks never open a nested transaction or collector. */
export function createIncidentNodeTransition(
  stores: {
    readonly typedDependencies: TypedDependencyStore;
    readonly workPackages: Pick<WorkPackageStore, 'findById'>;
    readonly workItems: EndpointEvidenceReads['workItems'];
  },
  authority: CommandGraphAuthority,
  endpoints: DependencyEndpointEvidence,
  graph: DependencyGraphGuard,
  assertActive: () => void,
  retention: IncidentRetention,
  localOnly: boolean,
  authorizeTypedWrites: AuthorizeTypedWrites,
): IncidentNodeTransition {
  const assertAuthority = (workPackageId: string, actorId: string) => {
    assertActive();
    // Proof: independently removing owner or actor equality failed the real bound SQLite capability test, 2026-10-22.
    if (workPackageId !== authority.workPackageId || actorId !== authority.actorId)
      throw new Error('incident transition owner or actor mismatch');
  };
  return {
    run: async (workPackageId, actorId, request, stamp, structure) => {
      assertAuthority(workPackageId, actorId);
      // Proof: removing stamp actor equality failed the real bound SQLite capability test, 2026-10-22.
      if (
        stamp.by !== actorId ||
        request.fromWorkItemId.length === 0 ||
        request.toWorkItemId.length === 0 ||
        request.fromWorkItemId === request.toWorkItemId
      )
        throw new Error('incident transition mapping is malformed');
      // Proof: owned-only enumeration failed outgoing-only first-child creation (ok:false vs true), 2026-10-22.
      const incident = await stores.typedDependencies.listIncident([workPackageId]);
      assertAuthority(workPackageId, actorId);
      for (const relationship of incident) {
        if (
          relationship.workPackageId !== relationship.successor.workPackageId ||
          (relationship.predecessor.workPackageId !== workPackageId &&
            relationship.successor.workPackageId !== workPackageId)
        )
          // Proof: bypass changed wrong-owner/foreign-source delivery's required admission diagnostic; later raw checks still refused, 2026-10-22.
          throw new Error('incident enumeration returned inconsistent work package ownership');
      }
      const selected = incident.filter(
        (relationship) =>
          relationship.predecessor.workPackageId !== relationship.successor.workPackageId &&
          [relationship.predecessor, relationship.successor].some(
            (endpoint) =>
              endpoint.workPackageId === workPackageId &&
              endpoint.workItemId === request.fromWorkItemId &&
              endpoint.scope === 'node',
          ),
      );
      if (
        localOnly &&
        incident.some(
          (relationship) =>
            relationship.predecessor.workPackageId !== workPackageId ||
            relationship.successor.workPackageId !== workPackageId,
        )
      )
        throw new Error('local dependency context cannot transfer external incidents');
      if (request.kind === 'replay' && !Array.isArray(request.receipts))
        throw new Error('incident replay receipts are missing');
      let restoresChild = false;
      if (selected.length > 0 || request.kind === 'replay') {
        const before = await stores.workItems.listByWorkPackage(workPackageId);
        assertAuthority(workPackageId, actorId);
        const source = before.find((row) => row.id === request.fromWorkItemId);
        const destination = await stores.workItems.findById(request.toWorkItemId);
        assertAuthority(workPackageId, actorId);
        restoresChild = destination === null;
        if (
          source?.workPackageId !== workPackageId ||
          before.some((row) => row.parentId === request.fromWorkItemId) ||
          (!restoresChild &&
            (request.kind === 'fresh' ||
              destination?.workPackageId !== workPackageId ||
              source.parentId !== request.toWorkItemId))
        )
          // Proof: omitting this refusal let the structure callback run for existing/foreign destinations before the later refusal, 2026-10-22.
          throw new Error('incident mapping does not describe a first-child transition');
      }
      const receipts: IncidentNodeReceipt[] = [];
      const addresses = new Map<string, WorkItemAddress>();
      if (selected.length > 0) {
        const workPackage = await stores.workPackages.findById(workPackageId);
        assertAuthority(workPackageId, actorId);
        if (workPackage === null) return { ok: false, reason: 'not_found' };
        if (!authority.admission.admits(workPackage, actorId))
          return { ok: false, reason: 'forbidden' };
      }
      for (const relationship of selected) {
        for (const endpoint of [relationship.predecessor, relationship.successor]) {
          const read = await endpoints.readEndpoint(endpoint);
          assertAuthority(workPackageId, actorId);
          if (!read.ok) return read;
          if (endpoint.scope === 'node' && !read.evidence.isLeaf)
            throw new Error('incident node endpoint is not a leaf');
          if (endpoint.scope === 'descendant-step' && read.evidence.isLeaf)
            throw new Error('incident descendant endpoint is a leaf');
          if (endpoint.workPackageId !== workPackageId)
            addresses.set(JSON.stringify([endpoint.workPackageId, endpoint.workItemId]), endpoint);
        }
        // Proof: removing this lifecycle consumer restored mounted fresh/undo/redo
        // incident-restoration HTTP500 instead of modeled HTTP409 (2026-10-22).
        const isDeleting = await stores.typedDependencies.hasDeletingEndpoint(relationship);
        // Proof: removing this assertion returned a refusal after the injected
        // close in `incident pending-state read cannot return after its observation closes`.
        assertAuthority(workPackageId, actorId);
        if (isDeleting) return { ok: false, reason: 'work_package_deleting' };
        const from = await stores.typedDependencies.incidents.capture(relationship.id);
        assertAuthority(workPackageId, actorId);
        const to = {
          ...from,
          dependency: mapIncidentNode(
            relationship,
            workPackageId,
            request.fromWorkItemId,
            request.toWorkItemId,
          ),
        };
        if (request.kind === 'replay') {
          const recorded = request.receipts.find(
            (receipt) => receipt.from.dependency.id === relationship.id,
          );
          // Proof: bypassing stored row equality admitted a direct peer type edit without a revision bump; bypassing audit equality admitted altered creation evidence, 2026-10-22.
          if (
            recorded === undefined ||
            formatIncidentKey(recorded.from.dependency) !== formatIncidentKey(from.dependency) ||
            formatIncidentKey(recorded.to.dependency) !== formatIncidentKey(to.dependency) ||
            recorded.from.createdAt !== from.createdAt ||
            recorded.from.createdBy !== from.createdBy ||
            recorded.to.createdAt !== from.createdAt ||
            recorded.to.createdBy !== from.createdBy
          )
            return { ok: false, reason: 'stale_undo' };
        }
        receipts.push({ from, to });
      }
      // Proof: removing exact receipt-set coverage let undo succeed after an external row was physically removed, 2026-10-22.
      if (request.kind === 'replay' && request.receipts.length !== receipts.length)
        return { ok: false, reason: 'stale_undo' };
      const revisions = await endpoints.readRevisions([...addresses.values()]);
      assertAuthority(workPackageId, actorId);
      if (!revisions.ok) return revisions;
      const evidence = { receipts, externalBefore: revisions.revisions };
      // Proof: omitting old/new receipt authorization remapped an outgoing remote node with only read access; `remote write for implicit first-child-outgoing`
      // (command-permission.controller.db.test.ts) failed with the fault and passed restored, 2026-11-09.
      const authorization = await authorizeTypedWrites(
        receipts.flatMap((receipt) => [receipt.from.dependency, receipt.to.dependency]),
      );
      assertAuthority(workPackageId, actorId);
      if (authorization !== null) return authorization;
      for (const receipt of receipts) {
        await stores.typedDependencies.incidents.detach(receipt.from);
        assertAuthority(workPackageId, actorId);
      }
      const value = await structure(evidence);
      assertAuthority(workPackageId, actorId);
      // Proof: returning ok:true for a refused structure let a conventional UoW decision commit the detached interval; the real capability test observed it, 2026-10-22.
      if (isStructureRefused(value))
        return { ok: false, reason: 'structure_refused', value, evidence };
      if (receipts.length > 0) {
        const after = await stores.workItems.listByWorkPackage(workPackageId);
        assertAuthority(workPackageId, actorId);
        const source = after.find((row) => row.id === request.fromWorkItemId);
        const destination = after.find((row) => row.id === request.toWorkItemId);
        if (
          destination?.workPackageId !== workPackageId ||
          (restoresChild
            ? source === undefined || destination.parentId !== request.fromWorkItemId
            : source !== undefined || after.some((row) => row.parentId === request.toWorkItemId))
        )
          // Proof: bypass admitted an unrelated root as the node target in detached-child capability test, 2026-10-22.
          throw new Error('incident mapping structural completion disagrees');
      }
      for (const receipt of receipts) {
        await stores.typedDependencies.incidents.restore(
          receipt.to,
          receipt.from.dependency,
          stamp,
        );
        assertAuthority(workPackageId, actorId);
      }
      if (receipts.length > 0) {
        const conflict = await graph.findEndpointConflict(workPackageId);
        assertAuthority(workPackageId, actorId);
        // Proof: bypassing only this decision admitted returned node_on_parent and committed changed tables in the real SQLite final-result test, 2026-10-22.
        if (conflict !== null) return { ok: false, reason: conflict.reason };
        // Proof: skipping this genuine final read admitted the injected delivery failure; moving it before restore observed three missing external IDs, 2026-10-22.
        const cycle = await graph.findCycle(workPackageId);
        assertAuthority(workPackageId, actorId);
        // Proof: bypassing only this decision admitted a returned cycle and committed changed tables in the real SQLite final-result test, 2026-10-22.
        if (cycle !== null)
          return { ok: false, reason: cycle.kind === 'self_node' ? 'self_node' : 'cycle' };
        if (retention.kind === 'owner') {
          // Proof: omission lost current retained revisions and broke nested mixed undo; removing the next authority assertion returned after a suspended refresh crossed graph close, 2026-10-22.
          await retention.refresh([request.fromWorkItemId, request.toWorkItemId]);
          assertAuthority(workPackageId, actorId);
        }
      }
      return { ok: true, value, evidence };
    },
  };
}
