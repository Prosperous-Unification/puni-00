import { canWriteInOrganization, type OrganizationScope } from '@wbs/domain';

import type { EditAdmission } from '../../ports/edit-admission';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectCrossReferenceKind, RecoveryAuditDetail } from '../../ports/project-values';
import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
import { createWorkingPlan } from './working-plan.resource';

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
 * What an admitted act wants done with its writes: the unit of work's
 * `Decision`, with the rollback repair handed an {@link AdmittedScope} over the
 * surviving state instead of that state's stores.
 */
export type AdmittedDecision<T> =
  | { commit: true; value: T }
  | { commit: false; value: T; afterRollback?: (scope: AdmittedScope) => Promise<void> };

/** A batch's Working plan, open until {@link OpenWorkingPlan.close}. */
export interface OpenWorkingPlan {
  /** The admitted scope whose stores are the Working plan's retained reads and writes. */
  readonly scope: AdmittedScope;
  /** Permanently refuses the Working plan's retained reads; see `createWorkingPlan`. */
  close(): void;
}

/**
 * One admitted unit of work's scope, as Plan commands' feature holds it.
 *
 * The stores stay inside: the feature builds its graph over this scope, opens
 * a Working plan on it, and asks the organization questions an admission
 * needs, and never names a repository port.
 */
export class AdmittedScope {
  constructor(private readonly scope: Scope) {}

  /** The graph `factory` builds over this scope. */
  graphOf<G>(
    factory: AdmittedGraphFactory<G>,
    broadcast: Broadcaster,
    admission: EditAdmission,
  ): G {
    return factory(this.scope, broadcast, admission);
  }

  /** Opens one project's Working plan over this scope. */
  openWorkingPlan(projectId: string): OpenWorkingPlan {
    const plan = createWorkingPlan(this.scope, projectId);
    return {
      scope: new AdmittedScope({ stores: plan.stores }),
      close: () => {
        plan.close();
      },
    };
  }

  /**
   * The kind of every reference that leaves the project or its organization,
   * in the order the source reports them.
   */
  async listCrossReferenceKinds(
    projectId: string,
    organizationId: string,
  ): Promise<ProjectCrossReferenceKind[]> {
    const crossing = await this.scope.stores.projects.findCrossReferences(
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
    const admitted = await this.scope.stores.projects.admitEditInOrganization(
      projectId,
      organization.organizationId,
      actorId,
      detail,
    );
    if (admitted === null) return 'not_found';
    // Proof: skipping this refusal made `refuses a viewer every batch, undo
    // and redo` and `refuses a super-admin removed or demoted before the batch`
    // in `command-organization.controller.db.test.ts` answer 200; watched
    // 2026-09-28.
    if (admitted === 'forbidden') return 'forbidden';
    const kinds = await this.listCrossReferenceKinds(projectId, organization.organizationId);
    // Proof: skipping this check made `fails closed on a project that already
    // crosses its organization` in `command-organization.controller.db.test.ts`
    // answer 200 instead of 500; watched 2026-09-27.
    if (kinds.length > 0) {
      throw new Error(
        `project "${projectId}" holds references outside its organization: ${[...new Set(kinds)].sort().join(', ')}`,
      );
    }
    return null;
  }
}

/**
 * Runs `act` as one unit of work over an {@link AdmittedScope}, translating a
 * rollback repair so it too receives the surviving state as an admitted scope.
 *
 * The raw scope never leaves this function and the scope's own methods.
 */
export function runAdmitted<T>(
  uow: UnitOfWork,
  act: (scope: AdmittedScope) => Promise<AdmittedDecision<T>>,
): Promise<T> {
  return uow.run<T>(async (scope) => {
    const decision = await act(new AdmittedScope(scope));
    if (decision.commit) return decision;
    const { afterRollback } = decision;
    return afterRollback === undefined
      ? { commit: false, value: decision.value }
      : {
          commit: false,
          value: decision.value,
          afterRollback: async (repair) => {
            await afterRollback(new AdmittedScope(repair));
          },
        };
  });
}
