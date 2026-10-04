import { AnnouncementCollector } from '../../ports/announcement-collector';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectService } from '../project/project.resource';
import type { StepService } from '../step/step.resource';

/** The two route writes that validate the combined dependency graph before they write. */
export interface AdmittedServices {
  readonly projects: Pick<ProjectService, 'updateWithin'>;
  readonly steps: Pick<StepService, 'removeWithin'>;
}

export type AdmittedWriteDecision<T> = { commit: true; value: T } | { commit: false; value: T };

/** One admitted route write over a mapped graph, with no source capability. */
export interface AdmittedWriteTransaction {
  run<T>(
    broadcast: Broadcaster,
    act: (services: AdmittedServices) => Promise<AdmittedWriteDecision<T>>,
  ): Promise<T>;
}

/** The mapped transaction and broadcaster supplied to the route-write feature. */
export interface AdmittedWriteOptions {
  readonly transaction: AdmittedWriteTransaction;
  readonly announcements: Broadcaster;
}

/**
 * A project `depReach` change and a step removal, each run as one unit of work.
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
    act: (graph: AdmittedServices) => Promise<T>,
  ): Promise<T> => {
    const collector = new AnnouncementCollector(options.announcements);
    const outcome = await options.transaction.run<T>(collector, async (graph) => {
      const value = await act(graph);
      return value.ok ? { commit: true, value } : { commit: false, value };
    });
    if (outcome.ok) await collector.send();
    return outcome;
  };
  return {
    updateProjectWithin: (...args: Parameters<ProjectService['updateWithin']>) =>
      admit((graph) => graph.projects.updateWithin(...args)),
    removeStepWithin: (...args: Parameters<StepService['removeWithin']>) =>
      admit((graph) => graph.steps.removeWithin(...args)),
  };
}
