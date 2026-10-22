import type {
  CommandGraphAuthority,
  DependencyContext,
  ServiceDependencyContext,
} from '../ports/dependency-context';
import { findProjectWithin, LEGACY_ACCESS } from '../ports/organization-access';
import {
  ConnectedDependencyGraphReader,
  type ConnectedDependencyGraphReads,
} from './connected-dependency-graph';
import { createEndpointEvidence } from './dependency-endpoint-evidence';
import { DependencyGraphGuard } from './dependency-graph';

type DependencyReads = ConnectedDependencyGraphReads & Parameters<typeof createEndpointEvidence>[0];

/** One graph lifetime nested inside the admitted writer observation. */
export interface OpenDependencyContext {
  readonly context: DependencyContext;
  close(): void;
}

/**
 * Builds from raw admitted stores before any retained owner projection exists.
 * Graph closure and observation closure are independent, irreversible guards.
 * Directory authority receives concrete rejecting project capabilities.
 */
export function createDependencyContext(
  reads: DependencyReads,
  authority: CommandGraphAuthority,
  assertObservation: () => void,
): OpenDependencyContext {
  return openContext(
    reads,
    authority.projectId,
    authority.actorId,
    authority.access,
    assertObservation,
    false,
  );
}

function openContext(
  reads: DependencyReads,
  projectId: string | null,
  actorId: string,
  access: CommandGraphAuthority['access'],
  assertObservation: () => void,
  localOnly: boolean,
): OpenDependencyContext {
  if (
    (projectId !== null && (typeof projectId !== 'string' || projectId.length === 0)) ||
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
      typeof access.scope.organizationId !== 'string' ||
      access.scope.organizationId.length === 0)
  )
    throw new Error('dependency context actor does not match current access');
  let open = true;
  const assertActive = () => {
    assertObservation();
    if (!open) throw new Error('dependency context is closed');
    if (projectId === null) throw new Error('directory dependency context cannot access a project');
  };
  const inspectLocalIncidents = async () => {
    assertActive();
    if (projectId === null) throw new Error('directory dependency context has no owner');
    const incident = await reads.typedDependencies.listIncident([projectId]);
    assertActive();
    for (const dependency of incident) {
      if (dependency.projectId !== dependency.successor.projectId)
        throw new Error('local dependency incident has malformed ownership');
      // Proof: local-incident-failclosed bypass failed `local service owner admission precedes`'s selected assertion
      // (actual service with memory stores; watched 2026-10-22).
      if (
        dependency.predecessor.projectId !== projectId ||
        dependency.successor.projectId !== projectId
      )
        throw new Error('local dependency context cannot inspect external incidents');
    }
  };
  const requireProject = async (required: string) => {
    assertActive();
    if (localOnly || access.kind === 'legacy') {
      if (required !== projectId)
        throw new Error('local dependency context cannot inspect another project');
      await inspectLocalIncidents();
    }
    const project = await findProjectWithin(reads.projects, required, access);
    assertActive();
    if (project === null)
      throw new Error(`required dependency project ${required} is not readable`);
    if (project.id !== required) throw new Error('dependency project identity mismatch');
  };
  const reader = new ConnectedDependencyGraphReader(reads, { assertActive, requireProject });
  const endpoints =
    projectId === null
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
            projectId,
            actorId,
            access,
            assertActive,
            kind: 'local-only',
            inspectLocalIncidents,
          })
        : createEndpointEvidence(reads, {
            projectId,
            actorId,
            access,
            assertActive,
            kind: 'scoped',
          });
  const context: DependencyContext = {
    endpoints,
    graph: new DependencyGraphGuard(reader, projectId, assertActive),
    assertUsable: (owner, actor) => {
      assertActive();
      // Proof: context-owner-actor bypass failed `actual service cannot borrow`'s selected assertion
      // (actual service with memory stores; watched 2026-10-22).
      if (owner !== projectId || actor !== actorId)
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
    withContext: async (projectId, actorId, act) => {
      const opened = openContext(stores, projectId, actorId, LEGACY_ACCESS, () => undefined, true);
      try {
        opened.context.assertUsable(projectId, actorId);
        const value = await act(opened.context);
        opened.context.assertUsable(projectId, actorId);
        return value;
      } finally {
        opened.close();
      }
    },
  };
}
