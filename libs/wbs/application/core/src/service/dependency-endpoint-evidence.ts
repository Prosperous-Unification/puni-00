import { deriveNumbers, type ScopedDependencyEndpoint } from '@wbs/domain';

import type {
  DependencyEndpointEvidence,
  ScopedRevision,
  WorkItemAddress,
} from '../ports/dependency-context';
import type { ResourceAccess } from '../ports/organization-access';
import { findWorkPackageWithin } from '../ports/organization-access';
import type { WorkItemStore } from '../ports/work-item-store';
import type { WorkItem } from '../ports/work-item-values';
import type { WorkPackageStore } from '../ports/work-package-store';

/** Raw transaction reads; scoped work package ownership always precedes endpoint facts. */
export interface EndpointEvidenceReads {
  readonly workPackages: Pick<WorkPackageStore, 'findById' | 'findInOrganization' | 'stepsOf'>;
  readonly workItems: Pick<WorkItemStore, 'findById'> & {
    listByWorkPackage(workPackageId: string): Promise<readonly WorkItem[]>;
  };
}

/** Captured authority; local-only observations cannot read proposed remote endpoints. */
interface EndpointAuthority {
  readonly workPackageId: string;
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
 * work packages need readable same-organization ownership, never edit admission.
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
    if (authority.kind === 'local-only' && address.workPackageId !== authority.workPackageId)
      return { ok: false, reason: 'forbidden' } as const;
    // Proof: scoped-work-package-evidence bypass failed `mounted foreign-organization`'s selected assertion
    // (actual SQLite boundary; watched 2026-10-22).
    // Proof: bypassing this scoped read during external redo turned the concealed
    // work-package-read refusal into a later graph-read throw; all-table rollback is
    // checked by `external redo revalidates work-package-read delivery` (2026-10-22).
    const workPackage = await checked(() =>
      findWorkPackageWithin(reads.workPackages, address.workPackageId, authority.access),
    );
    if (workPackage === null) return { ok: false, reason: 'not_found' } as const;
    if (workPackage.id !== address.workPackageId)
      throw new Error('endpoint work package identity mismatch');
    const row = await checked(() => reads.workItems.findById(address.workItemId));
    // Proof: bypassing this consumer failed `mounted absent-row`
    // at its real SQLite refusal assertion; zero partial effects also checked (2026-10-22).
    if (row === null) return { ok: false, reason: 'not_found' } as const;
    // Proof: removing this check let `external redo revalidates wrong-identity
    // delivery` restore its subtree and external link from misdelivered facts
    // instead of throwing; watched against real SQLite, 2026-10-22.
    // Proof: removing only this equality made mounted external redo wrong-identity
    // return HTTP 200, replay the local patch/link and consume its journal (2026-10-23).
    if (row.id !== address.workItemId) throw new Error('endpoint row identity mismatch');
    // Proof: exact-row-work-package-evidence bypass failed `mounted wrong-row-work-package`'s selected assertion
    // (actual SQLite boundary; watched 2026-10-22).
    // Proof: removing this check let `external redo revalidates foreign-work-package
    // delivery` restore its subtree and external link instead of returning
    // concealed not_found; watched against real SQLite, 2026-10-22.
    // Proof: removing only this equality made mounted external redo wrong-owner
    // return HTTP 200, replay the local patch/link and consume its journal (2026-10-23).
    if (row.workPackageId !== address.workPackageId)
      return { ok: false, reason: 'not_found' } as const;
    return { ok: true, workPackage, row } as const;
  };
  return {
    readEndpoint: async (endpoint: ScopedDependencyEndpoint) => {
      const found = await readRow(endpoint);
      if (!found.ok) return found;
      const rows = await checked(() => reads.workItems.listByWorkPackage(endpoint.workPackageId));
      if (rows.some((row) => row.workPackageId !== endpoint.workPackageId))
        throw new Error('endpoint tree contains a foreign row');
      const numbers = deriveNumbers(rows);
      const workItemNumber = numbers.get(endpoint.workItemId);
      if (workItemNumber === undefined)
        throw new Error('endpoint row is absent from its complete tree');
      let step = null;
      if (endpoint.scope !== 'whole') {
        const steps = await checked(() => reads.workPackages.stepsOf(endpoint.workPackageId));
        // Proof: independently dropping step id/work-package equality failed admitted
        // step-identity/step-work-package misdelivery tests: the graph threw missing-step
        // and the storage tripwire fired respectively (2026-10-22).
        const selected = steps.find(
          (candidate) =>
            candidate.id === endpoint.stepId && candidate.workPackageId === endpoint.workPackageId,
        );
        if (selected === undefined)
          return {
            ok: false,
            reason:
              endpoint.workPackageId === authority.workPackageId ? 'unknown_step' : 'not_found',
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
          workPackageAbbreviation: found.workPackage.abbreviation,
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
        const key = JSON.stringify([address.workPackageId, address.workItemId]);
        if (seen.has(key)) continue;
        seen.add(key);
        const found = await readRow(address);
        if (!found.ok) return found;
        revisions.push({
          workPackageId: address.workPackageId,
          workItemId: address.workItemId,
          revision: found.row.revision,
        });
      }
      await inspect();
      return { ok: true, revisions };
    },
  };
}
