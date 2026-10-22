import type { AuthenticatedUser } from '@wbs/contracts';

import { AnnouncementCollector } from '../../ports/announcement-collector';
import type { CommandCaller } from '../../ports/command-access';
import type { ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectService } from '../project/project.resource';
import type { StepService } from '../step/step.resource';
import type { AuthorityRefusal } from './plan-commands.feature';

/** The two route writes that validate the combined dependency graph before they write. */
export interface AdmittedServices {
  readonly projects: Pick<ProjectService, 'updateWithin'>;
  readonly steps: Pick<StepService, 'removeWithin'>;
}

export type AdmittedWriteDecision<T> = { commit: true; value: T } | { commit: false; value: T };

/** One admitted route write over a mapped graph, with no source capability. */
export interface AdmittedWriteTransaction {
  run<T>(
    projectId: string,
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
 * A project `depReach` change and a step removal, each run as one unit of work.
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
    projectId: string,
    actor: AuthenticatedUser,
    expectedAccess: ResourceAccess,
    act: (graph: AdmittedServices, access: ResourceAccess) => Promise<T>,
  ): Promise<T | AuthorityRefusal> => {
    // Proof: removing this guard made direct read-only project update and bare step removal commit (command-current-authority.controller.db.test.ts).
    if (!actor.scopes.includes('write')) return { ok: false, error: 'insufficient_scope' };
    const collector = new AnnouncementCollector(options.announcements);
    const outcome = await options.transaction.run<T>(
      projectId,
      { kind: 'human', principal: actor, expectedAccess },
      collector,
      async (graph, access) => {
        const value = await act(graph, access);
        return value.ok ? { commit: true, value } : { commit: false, value };
      },
    );
    if (outcome.ok) await collector.send();
    return outcome;
  };
  return {
    updateProjectWithin: (
      projectId: string,
      actor: AuthenticatedUser,
      patch: Parameters<ProjectService['updateWithin']>[2],
      expectedAccess: ResourceAccess,
    ) =>
      admit(projectId, actor, expectedAccess, (graph, access) =>
        graph.projects.updateWithin(projectId, actor.id, patch, access),
      ),
    removeStepWithin: (
      projectId: string,
      stepId: string,
      actor: AuthenticatedUser,
      cascade: boolean,
      expectedAccess: ResourceAccess,
    ) =>
      admit(projectId, actor, expectedAccess, (graph, access) =>
        graph.steps.removeWithin(projectId, stepId, actor.id, cascade, access),
      ),
  };
}
