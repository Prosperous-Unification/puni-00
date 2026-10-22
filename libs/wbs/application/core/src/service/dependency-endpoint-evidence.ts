import { deriveNumbers, type ScopedDependencyEndpoint } from '@wbs/domain';

import type {
  DependencyEndpointEvidence,
  ScopedRevision,
  WorkItemAddress,
} from '../ports/dependency-context';
import type { ResourceAccess } from '../ports/organization-access';
import { findProjectWithin } from '../ports/organization-access';
import type { ProjectStore } from '../ports/project-store';
import type { WorkItemStore } from '../ports/work-item-store';
import type { WorkItem } from '../ports/work-item-values';

/** Raw transaction reads; scoped project ownership always precedes endpoint facts. */
export interface EndpointEvidenceReads {
  readonly projects: Pick<ProjectStore, 'findById' | 'findInOrganization' | 'stepsOf'>;
  readonly workItems: Pick<WorkItemStore, 'findById'> & {
    listByProject(projectId: string): Promise<readonly WorkItem[]>;
  };
}

/** Captured authority; local-only observations cannot read proposed remote endpoints. */
interface EndpointAuthority {
  readonly projectId: string;
  readonly actorId: string;
  assertActive(): void;
}

export type EndpointReadAuthority = EndpointAuthority &
  (
    | { readonly kind: 'scoped'; readonly access: Extract<ResourceAccess, { kind: 'scoped' }> }
    | {
        readonly kind: 'local-only';
        readonly access: ResourceAccess;
        inspectLocalIncidents(): Promise<void>;
      }
  );

/**
 * Reads detached endpoint evidence in the supplied writer observation. Remote
 * projects need readable same-organization ownership, never edit admission.
 * Missing proposed facts are modeled; malformed trusted facts and expiry throw.
 */
export function createEndpointEvidence(
  reads: EndpointEvidenceReads,
  authority: EndpointReadAuthority,
): DependencyEndpointEvidence {
  const checked = async <T>(read: () => Promise<T>): Promise<T> => {
    authority.assertActive();
    // Proof: post-await-evidence-lifetime bypass failed `refusal suspended across command observation close`'s selected assertion
    // (actual SQLite boundary; watched 2026-10-22).
    const value = await read();
    authority.assertActive();
    return value;
  };
  const inspect = async () => {
    authority.assertActive();
    switch (authority.kind) {
      case 'local-only':
        await checked(() => authority.inspectLocalIncidents());
        break;
      case 'scoped':
        break;
      default:
        throw new Error('unknown endpoint authority');
    }
  };
  const readRow = async (address: WorkItemAddress) => {
    await inspect();
    if (authority.kind === 'local-only' && address.projectId !== authority.projectId)
      return { ok: false, reason: 'forbidden' } as const;
    // Proof: scoped-project-evidence bypass failed `mounted foreign-organization`'s selected assertion
    // (actual SQLite boundary; watched 2026-10-22).
    // Proof: bypassing this scoped read during external redo turned the concealed
    // project-read refusal into a later graph-read throw; all-table rollback is
    // checked by `external redo revalidates project-read delivery` (2026-10-22).
    const project = await checked(() =>
      findProjectWithin(reads.projects, address.projectId, authority.access),
    );
    if (project === null) return { ok: false, reason: 'not_found' } as const;
    if (project.id !== address.projectId) throw new Error('endpoint project identity mismatch');
    const row = await checked(() => reads.workItems.findById(address.workItemId));
    // Proof: bypassing this consumer failed `mounted absent-row`
    // at its real SQLite refusal assertion; zero partial effects also checked (2026-10-22).
    if (row === null) return { ok: false, reason: 'not_found' } as const;
    // Proof: removing this check let `external redo revalidates wrong-identity
    // delivery` restore its subtree and external link from misdelivered facts
    // instead of throwing; watched against real SQLite, 2026-10-22.
    if (row.id !== address.workItemId) throw new Error('endpoint row identity mismatch');
    // Proof: exact-row-project-evidence bypass failed `mounted wrong-row-project`'s selected assertion
    // (actual SQLite boundary; watched 2026-10-22).
    // Proof: removing this check let `external redo revalidates foreign-project
    // delivery` restore its subtree and external link instead of returning
    // concealed not_found; watched against real SQLite, 2026-10-22.
    if (row.projectId !== address.projectId) return { ok: false, reason: 'not_found' } as const;
    return { ok: true, project, row } as const;
  };
  return {
    readEndpoint: async (endpoint: ScopedDependencyEndpoint) => {
      const found = await readRow(endpoint);
      if (!found.ok) return found;
      const rows = await checked(() => reads.workItems.listByProject(endpoint.projectId));
      if (rows.some((row) => row.projectId !== endpoint.projectId))
        throw new Error('endpoint tree contains a foreign row');
      const numbers = deriveNumbers(rows);
      const workItemNumber = numbers.get(endpoint.workItemId);
      if (workItemNumber === undefined)
        throw new Error('endpoint row is absent from its complete tree');
      let step = null;
      if (endpoint.scope !== 'whole') {
        const steps = await checked(() => reads.projects.stepsOf(endpoint.projectId));
        // Proof: independently dropping step id/project equality failed admitted
        // step-identity/step-project misdelivery tests: the graph threw missing-step
        // and the storage tripwire fired respectively (2026-10-22).
        const selected = steps.find(
          (candidate) =>
            candidate.id === endpoint.stepId && candidate.projectId === endpoint.projectId,
        );
        if (selected === undefined)
          return {
            ok: false,
            reason: endpoint.projectId === authority.projectId ? 'unknown_step' : 'not_found',
          } as const;
        step = {
          id: selected.id,
          name: selected.name,
          code: selected.code,
          position: selected.position,
        };
      }
      await inspect();
      return {
        ok: true,
        evidence: {
          endpoint: { ...endpoint },
          isLeaf: !rows.some((row) => row.parentId === endpoint.workItemId),
          revision: found.row.revision,
          name: found.row.name,
          projectAbbreviation: found.project.abbreviation,
          workItemNumber,
          step,
        },
      } as const;
    },
    readRevisions: async (addresses) => {
      authority.assertActive();
      const seen = new Set<string>();
      const revisions: ScopedRevision[] = [];
      for (const address of addresses) {
        const key = JSON.stringify([address.projectId, address.workItemId]);
        if (seen.has(key)) continue;
        seen.add(key);
        const found = await readRow(address);
        if (!found.ok) return found;
        revisions.push({
          projectId: address.projectId,
          workItemId: address.workItemId,
          revision: found.row.revision,
        });
      }
      await inspect();
      return { ok: true, revisions };
    },
  };
}
