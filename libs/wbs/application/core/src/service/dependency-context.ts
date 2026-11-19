import type { AccessDecisions } from '../ports/access-decisions';
import type {
  AuthorizeTypedWrites,
  CommandGraphAuthority,
  DependencyContext,
  ServiceDependencyContext,
} from '../ports/dependency-context';
import { NO_ADMISSION } from '../ports/edit-admission';
import type { IncidentRetention } from '../ports/incident-node-transition';
import { findWorkPackageWithin, LEGACY_ACCESS } from '../ports/organization-access';
import type { TypedDependencyStore } from '../ports/typed-dependency-store';
import { authorizePackageAt } from './authorize';
import {
  ConnectedDependencyGraphReader,
  type ConnectedDependencyGraphReads,
} from './connected-dependency-graph';
import { createEndpointEvidence } from './dependency-endpoint-evidence';
import { DependencyGraphGuard } from './dependency-graph';
import { createIncidentNodeTransition } from './incident-node-transition';

type DependencyReads = ConnectedDependencyGraphReads &
  Parameters<typeof createEndpointEvidence>[0] & {
    readonly typedDependencies: TypedDependencyStore;
    readonly accessDecisions?: AccessDecisions;
  };

/** One graph lifetime nested inside the admitted writer observation. */
export interface OpenDependencyContext {
  readonly context: DependencyContext;
  close(): void;
}

/**
 * Builds from raw admitted stores before any retained owner projection exists.
 * Graph closure and observation closure are independent, irreversible guards.
 * Directory authority receives concrete rejecting work package capabilities.
 */
export function createDependencyContext(
  reads: DependencyReads,
  authority: CommandGraphAuthority,
  assertObservation: () => void,
  retention: IncidentRetention,
): OpenDependencyContext {
  // Proof: independently missing all/capture/detach/restore and malformed retention failed construction when their guards were bypassed, 2026-10-22.
  const persistence: unknown = reads.typedDependencies.incidents;
  if (
    typeof persistence !== 'object' ||
    persistence === null ||
    !('capture' in persistence) ||
    typeof persistence.capture !== 'function' ||
    !('detach' in persistence) ||
    typeof persistence.detach !== 'function' ||
    !('restore' in persistence) ||
    typeof persistence.restore !== 'function'
  )
    throw new Error('incident persistence is missing');
  const boundary: unknown = retention;
  if (
    typeof boundary !== 'object' ||
    boundary === null ||
    !('kind' in boundary) ||
    (boundary.kind !== 'raw' &&
      (boundary.kind !== 'owner' ||
        !('refresh' in boundary) ||
        typeof boundary.refresh !== 'function'))
  )
    throw new Error('incident retention is malformed');
  return openContext(
    reads,
    authority.workPackageId,
    authority.actorId,
    authority.access,
    assertObservation,
    false,
    authority.admission,
    retention,
  );
}

function openContext(
  reads: DependencyReads,
  workPackageId: string | null,
  actorId: string,
  access: CommandGraphAuthority['access'],
  assertObservation: () => void,
  localOnly: boolean,
  admission: CommandGraphAuthority['admission'],
  retention: IncidentRetention,
): OpenDependencyContext {
  if (
    (workPackageId !== null && (typeof workPackageId !== 'string' || workPackageId.length === 0)) ||
    typeof actorId !== 'string' ||
    actorId.length === 0
  )
    throw new Error('dependency context authority is malformed');
  switch (access.kind) {
    case 'legacy':
    case 'scoped':
      break;
    default:
      throw new Error('dependency context access is malformed');
  }
  if (
    access.kind === 'scoped' &&
    (access.scope.userId !== actorId ||
      access.principal.id !== actorId ||
      typeof access.scope.organizationId !== 'string' ||
      access.scope.organizationId.length === 0)
  )
    throw new Error('dependency context actor does not match current access');
  access = structuredClone(access);
  let open = true;
  const assertActive = () => {
    assertObservation();
    if (!open) throw new Error('dependency context is closed');
    if (workPackageId === null)
      throw new Error('directory dependency context cannot access a work package');
  };
  const inspectLocalIncidents = async () => {
    assertActive();
    if (workPackageId === null) throw new Error('directory dependency context has no owner');
    const incident = await reads.typedDependencies.listIncident([workPackageId]);
    assertActive();
    for (const dependency of incident) {
      if (dependency.workPackageId !== dependency.successor.workPackageId)
        throw new Error('local dependency incident has malformed ownership');
      // Proof: local-incident-failclosed bypass failed `local service owner admission precedes`'s selected assertion
      // (actual service with memory stores; watched 2026-10-22).
      if (
        dependency.predecessor.workPackageId !== workPackageId ||
        dependency.successor.workPackageId !== workPackageId
      )
        throw new Error('local dependency context cannot inspect external incidents');
    }
  };
  const requireWorkPackage = async (required: string) => {
    assertActive();
    if (localOnly || access.kind === 'legacy') {
      if (required !== workPackageId)
        throw new Error('local dependency context cannot inspect another work package');
      await inspectLocalIncidents();
    }
    const workPackage = await findWorkPackageWithin(reads.workPackages, required, access);
    assertActive();
    if (workPackage === null)
      throw new Error(`required dependency work package ${required} is not readable`);
    if (workPackage.id !== required) throw new Error('dependency work package identity mismatch');
  };
  const reader = new ConnectedDependencyGraphReader(reads, { assertActive, requireWorkPackage });
  const endpoints =
    workPackageId === null
      ? {
          readEndpoint: () => {
            assertActive();
            return Promise.reject(new Error('directory endpoint evidence rejected'));
          },
          readRevisions: () => {
            assertActive();
            return Promise.reject(new Error('directory revision evidence rejected'));
          },
        }
      : localOnly || access.kind === 'legacy'
        ? createEndpointEvidence(reads, {
            workPackageId,
            actorId,
            access,
            assertActive,
            kind: 'local-only',
            inspectLocalIncidents,
          })
        : createEndpointEvidence(reads, {
            workPackageId,
            actorId,
            access,
            assertActive,
            kind: 'scoped',
          });
  const graph = new DependencyGraphGuard(reader, workPackageId, assertActive);
  const authorizeTypedWrites: AuthorizeTypedWrites = async (relationships) => {
    // Proof: removing this fence failed 'refuses typed write authorization after context closes at before-call'; fault/restored pass, 2026-11-09.
    assertActive();
    if (access.kind === 'legacy') return null;
    const packageIds = new Set(
      relationships.flatMap((relationship) => [
        relationship.predecessor.workPackageId,
        relationship.successor.workPackageId,
      ]),
    );
    for (const workPackageId of packageIds) {
      const decisions = reads.accessDecisions;
      if (decisions === undefined) throw new Error('the catalog carries no access decisions');
      const workPackage = await decisions.packageTargetOf(
        workPackageId,
        access.scope.organizationId,
      );
      // Proof: removing this fence read grants after closure in the ownership-read lifetime test; fault/restored pass, 2026-11-09.
      assertActive();
      if (workPackage === null) return { ok: false, reason: 'not_found', authorization: true };
      const decision = await authorizePackageAt(
        decisions,
        access,
        workPackage,
        actorId,
        'package.write',
      );
      // Proof: removing this fence returned authority after closure in the grant-read lifetime test; fault/restored pass, 2026-11-09.
      assertActive();
      if (!decision.ok)
        return decision.reason === 'not_found'
          ? { ok: false, reason: 'not_found', authorization: true }
          : { ok: false, reason: 'forbidden', permission: 'package.write', authorization: true };
    }
    return null;
  };
  const context: DependencyContext = {
    authorizeTypedWrites,
    incidents: createIncidentNodeTransition(
      reads,
      { workPackageId, actorId, access, admission },
      endpoints,
      graph,
      assertActive,
      retention,
      localOnly,
      authorizeTypedWrites,
    ),
    endpoints,
    graph,
    assertUsable: (owner, actor) => {
      assertActive();
      // Proof: context-owner-actor bypass failed `actual service cannot borrow`'s selected assertion
      // (actual service with memory stores; watched 2026-10-22).
      if (owner !== workPackageId || actor !== actorId)
        throw new Error('dependency context owner or actor mismatch');
    },
  };
  return {
    context,
    close: () => {
      open = false;
    },
  };
}

/**
 * Explicit compatibility for local process/legacy operations. Existing service
 * owner admission remains mandatory; this factory grants no remote authority
 * and opens no transaction. Every operation gets its own short-lived context.
 */
export function createLocalDependencyContext(stores: DependencyReads): ServiceDependencyContext {
  return {
    kind: 'local-only',
    withContext: async (workPackageId, actorId, act) => {
      const opened = openContext(
        stores,
        workPackageId,
        actorId,
        LEGACY_ACCESS,
        () => undefined,
        true,
        NO_ADMISSION,
        { kind: 'raw' },
      );
      try {
        opened.context.assertUsable(workPackageId, actorId);
        const value = await act(opened.context);
        opened.context.assertUsable(workPackageId, actorId);
        return value;
      } finally {
        opened.close();
      }
    },
  };
}
