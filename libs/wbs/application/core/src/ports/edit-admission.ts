import { canEditProject } from '@wbs/domain';

import type { Project } from './project-store';

/**
 * Who may write one project's plan through the services one graph builds.
 *
 * Injected into every writing service that gates a project write
 * (`WorkItemService`, `CapacityService`, `PriorityBandService`) instead of
 * each asking {@link canEditProject} itself, so that a batch graph can carry
 * an authority its own unit of work established — an audited recovery — while
 * the project it reads stays truthful: an admission never changes what
 * `ProjectStore.findById` answers about the creator or the restriction.
 *
 * Invariant: an admission is bound to the graph it was built for. A graph
 * installed without one does not compile; nothing falls back to the creator
 * rule on its own.
 */
export interface EditAdmission {
  /** Whether `actorId` may write `project`'s plan in this graph. */
  admits(project: Project, actorId: string): boolean;
}

/**
 * The deployment-wide rule every graph used before organizations: exactly
 * {@link canEditProject}, the creator rule for a restricted project.
 */
export const CREATOR_ADMISSION: EditAdmission = {
  admits: (project, actorId) => canEditProject(project, actorId),
};
