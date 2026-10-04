import { canWriteInOrganization, type OrganizationScope } from '@wbs/domain';

import type { EditAdmission } from '../../ports/edit-admission';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectCrossReferenceKind, RecoveryAuditDetail } from '../../ports/project-values';
import type { Scope } from '../../ports/unit-of-work';
import type { PlanCommandServices } from './plan-command-graph';

/**
 * Builds a batch's service graph over the scope its unit of work admitted,
 * publishing into `broadcast` and letting gated services write under `admission`.
 */
export type AdmittedGraphFactory<G> = (
  scope: Scope,
  broadcast: Broadcaster,
  admission: EditAdmission,
) => G;

/**
 * One admitted unit of work's scope, held privately by composition.
 *
 * The stores stay inside. Composition maps the command runner's callback to
 * specific graph and admission operations.
 */
export class AdmittedScope {
  readonly #scope: Scope;

  constructor(scope: Scope) {
    this.#scope = scope;
  }

  /**
   * The kind of every reference that leaves the project or its organization,
   * in the order the source reports them.
   *
   * Proof: answering none made `fails closed on a project that already crosses
   * its organization` and `fails closed on a project another project reaches
   * into, changing neither` in `command-organization.controller.db.test.ts`
   * fail (20 pass, 2 fail); watched 2026-09-29.
   */
  async listCrossReferenceKinds(
    projectId: string,
    organizationId: string,
  ): Promise<ProjectCrossReferenceKind[]> {
    const crossing = await this.#scope.stores.projects.findCrossReferences(
      projectId,
      organizationId,
    );
    return crossing.map(({ kind }) => kind);
  }

  /**
   * Why a scoped caller may not run a batch, undo or redo at all, checked in the
   * act's own unit of work: a project the organization does not own is
   * `not_found`, exactly as an absent one; a viewer, or anyone but the creator
   * of a restricted project other than a super-admin, is `forbidden`. A
   * directory batch needs only a writing role. The role and the project are
   * read inside the unit of work, and a super-admin's write to someone else's
   * restricted project is admitted as a recovery whose audit record (`detail`)
   * commits or rolls back with it.
   *
   * @throws when the project already references something outside the
   * organization: corrupt trusted state that activation should have refused,
   * never a base to write on.
   */
  async refuseOutsideScope(
    projectId: string | null,
    actorId: string,
    organization: OrganizationScope,
    detail: RecoveryAuditDetail,
  ): Promise<'not_found' | 'forbidden' | null> {
    if (projectId === null) return canWriteInOrganization(organization.role) ? null : 'forbidden';
    const admitted = await this.#scope.stores.projects.admitEditInOrganization(
      projectId,
      organization.organizationId,
      actorId,
      detail,
    );
    if (admitted === null) return 'not_found';
    // Proof: skipping this refusal made `refuses a viewer every batch, undo
    // and redo` and `refuses a super-admin removed or demoted before the batch`
    // in `command-organization.controller.db.test.ts` answer 200; watched
    // 2026-09-28, and again here on 2026-09-29 (19 pass, 3 fail).
    if (admitted === 'forbidden') return 'forbidden';
    const kinds = await this.listCrossReferenceKinds(projectId, organization.organizationId);
    // Proof: skipping this check made `fails closed on a project that already
    // crosses its organization` in `command-organization.controller.db.test.ts`
    // answer 200 instead of 500; watched 2026-09-27, and again here on
    // 2026-09-29 (20 pass, 2 fail).
    if (kinds.length > 0) {
      throw new Error(
        `project "${projectId}" holds references outside its organization: ${[...new Set(kinds)].sort().join(', ')}`,
      );
    }
    return null;
  }
}

/** The command graph and its scoped Working plan lifetime. */
export interface OpenCommandGraph {
  services: PlanCommandServices;
  close(): void;
}

/** Repository-free operations available to a command act. */
export interface CommandAdmission {
  refuseOutsideScope: AdmittedScope['refuseOutsideScope'];
  listCrossReferenceKinds: AdmittedScope['listCrossReferenceKinds'];
  openCommandGraph(
    projectId: string | null,
    broadcast: Broadcaster,
    admission: EditAdmission,
  ): OpenCommandGraph;
}

/** The sole repair operation a failed replay needs over surviving state. */
export interface CommandRepair {
  discardEntry(entryId: string, broadcast: Broadcaster): Promise<void>;
}

export type CommandDecision<T> =
  | { commit: true; value: T }
  | { commit: false; value: T; afterRollback?: (repair: CommandRepair) => Promise<void> };

/** A feature-owned decision over resources mapped privately by composition. */
export interface CommandTransaction {
  run<T>(act: (resources: CommandAdmission) => Promise<CommandDecision<T>>): Promise<T>;
}
