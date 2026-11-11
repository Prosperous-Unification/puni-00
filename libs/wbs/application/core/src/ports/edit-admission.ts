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

/** Admits nobody: a graph whose writes no unit of work has authorized. */
export const NO_ADMISSION: EditAdmission = { admits: () => false };

/** An admission one unit of work granted, and how that unit of work ends it. */
export interface GrantedAdmission {
  readonly admission: EditAdmission;
  /** Ends the grant; every later question is refused. Called when the unit of work settles. */
  expire(): void;
}

/**
 * The authority a unit of work established for one actor's writes to one
 * project, after it checked the actual principal's current package permission
 * inside that transaction. Restricted recovery is only the explicit audited flag-clear.
 *
 * Admits `actorId` writing `projectId` and nothing else — another project or
 * another actor is refused — and nothing at all once expired, so a graph
 * retained past its unit of work cannot borrow the grant. The project the
 * services read is not changed: its creator and restriction stay as stored.
 */
export function grantAdmission(projectId: string, actorId: string): GrantedAdmission {
  let live = true;
  return {
    // Actor/project equalities remain exercised by the actual runner's
    // 'admits the granted actor on the granted project only while its unit of work runs'
    // (plan-command-admission.test.ts). The retired Step recovery slot is not authority.
    admission: {
      // Proof: live-writer-expiry; removed live writer expiry while its owner and grant remained open.
      // 'semantic source refuses an expired writer while its real owner and current package grant remain live' (cross-project-dependency-lifecycle.controller.db.test.ts) failed; restored GREEN, 2026-11-10.
      admits: (project, actor) => live && project.id === projectId && actor === actorId,
    },
    expire: () => {
      live = false;
    },
  };
}
