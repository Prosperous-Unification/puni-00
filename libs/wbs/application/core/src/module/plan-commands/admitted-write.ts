import { AnnouncementCollector } from '../../ports/announcement-collector';
import type { Broadcaster } from '../../ports/project-event';
import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
import type { ProjectService } from '../../service/project.service';
import type { StepService } from '../../service/step.service';

/** The two route writes that validate the combined dependency graph before they write. */
export interface AdmittedServices {
  readonly projects: Pick<ProjectService, 'updateWithin'>;
  readonly steps: Pick<StepService, 'removeWithin'>;
}

/** What a host supplies: the source's unit of work, the per-scope graph and the direct broadcaster. */
export interface AdmittedWriteSource {
  readonly uow: UnitOfWork;
  readonly batch: (scope: Scope, broadcast: Broadcaster) => AdmittedServices;
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
export function admittedWrites(source: AdmittedWriteSource) {
  const admit = async <T extends { ok: boolean }>(
    act: (graph: AdmittedServices) => Promise<T>,
  ): Promise<T> => {
    const collector = new AnnouncementCollector(source.announcements);
    const outcome = await source.uow.run<T>(async (scope) => {
      const value = await act(source.batch(scope, collector));
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
