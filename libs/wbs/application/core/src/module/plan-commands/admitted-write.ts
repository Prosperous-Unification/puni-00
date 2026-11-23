import type { AuthenticatedUser } from '@wbs/contracts';

import { AnnouncementCollector } from '../../ports/announcement-collector';
import type { CommandCaller } from '../../ports/command-access';
import type { ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/work-package-event';
import type { StepService } from '../step/step.resource';
import type { WorkPackageService } from '../work-package/work-package.resource';
import type { AuthorityRefusal } from './plan-commands.feature';

/** The two route writes that validate the combined dependency graph before they write. */
export interface AdmittedServices {
  readonly workPackages: Pick<WorkPackageService, 'updateWithin' | 'createWithin'>;
  readonly steps: Pick<StepService, 'removeWithin'>;
}

export type AdmittedWriteDecision<T> = { commit: true; value: T } | { commit: false; value: T };

/** One admitted route write over a mapped graph, with no source capability. */
export interface AdmittedWriteTransaction {
  run<T>(
    workPackageId: string | null,
    caller: CommandCaller,
    broadcast: Broadcaster,
    act: (services: AdmittedServices, access: ResourceAccess) => Promise<AdmittedWriteDecision<T>>,
  ): Promise<T | AuthorityRefusal>;
}

/** The mapped transaction and broadcaster supplied to the route-write feature. */
export interface AdmittedWriteOptions {
  readonly transaction: AdmittedWriteTransaction;
  readonly announcements: Broadcaster;
}

/**
 * A work package `depReach` change and a step removal, each run as one unit of work.
 * Principals without write scope are refused before opening that unit of work.
 *
 * Both read the combined step-node graph and then write, outside any command
 * batch. Run as bare route writes, another write could land between the check
 * and the write and leave a cycle neither refused. Here the read, the check
 * and the write share the source's one turn and its transaction, a refusal
 * rolls back, and announcements leave only after the commit, exactly as
 * `PlanCommandRunner` does for a batch.
 */
export function admittedWrites(options: AdmittedWriteOptions) {
  const admit = async <T extends { ok: boolean }>(
    workPackageId: string | null,
    actor: AuthenticatedUser,
    expectedAccess: ResourceAccess,
    act: (graph: AdmittedServices, access: ResourceAccess, actorId: string) => Promise<T>,
  ): Promise<T | AuthorityRefusal> => {
    // Proof: removing this snapshot admitted substituted account grants in queued work package admission; named machine-provenance test fault/restored pass, 2026-11-09.
    actor = structuredClone(actor);
    expectedAccess = structuredClone(expectedAccess);
    // Proof: removing this guard made direct read-only work package update and bare step removal commit (command-current-authority.controller.db.test.ts).
    if (!actor.scopes.includes('write')) return { ok: false, error: 'insufficient_scope' };
    const collector = new AnnouncementCollector(options.announcements);
    const outcome = await options.transaction.run<T>(
      workPackageId,
      { kind: 'human', principal: actor, expectedAccess },
      collector,
      async (graph, access) => {
        const value = await act(graph, access, actor.id);
        return value.ok ? { commit: true, value } : { commit: false, value };
      },
    );
    if (outcome.ok) await collector.send();
    return outcome;
  };
  return {
    createWorkPackageWithin: (
      name: string,
      projectId: string,
      actor: AuthenticatedUser,
      expectedAccess: ResourceAccess,
      abbreviation?: string,
    ) =>
      admit(null, actor, expectedAccess, (graph, access, actorId) =>
        graph.workPackages.createWithin(name, projectId, actorId, access, abbreviation),
      ),
    updateWorkPackageWithin: (
      workPackageId: string,
      actor: AuthenticatedUser,
      patch: Parameters<WorkPackageService['updateWithin']>[2],
      expectedAccess: ResourceAccess,
    ) =>
      admit(workPackageId, actor, expectedAccess, (graph, access, actorId) =>
        graph.workPackages.updateWithin(workPackageId, actorId, patch, access),
      ),
    removeStepWithin: (
      workPackageId: string,
      stepId: string,
      actor: AuthenticatedUser,
      cascade: boolean,
      expectedAccess: ResourceAccess,
    ) =>
      admit(workPackageId, actor, expectedAccess, (graph, access, actorId) =>
        graph.steps.removeWithin(workPackageId, stepId, actorId, cascade, access),
      ),
  };
}
