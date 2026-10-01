import type { AuthenticatedUser } from '@wbs/contracts';

import { mayEditProjectWithin, type ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { ProjectService } from '../project/project.resource';
import type {
  SavedPlanSaveOutcome,
  SavedPlanSaveRequest,
  SavedPlanService,
} from './saved-plans.feature';

export interface SavePlanGraph {
  readonly projects: Pick<ProjectService, 'readWithin'>;
  readonly plans: Pick<SavedPlanService, 'save'>;
  readonly announcements: Pick<Broadcaster, 'publish'>;
}

export interface SavePlanInput {
  readonly projectId: string;
  readonly actor: AuthenticatedUser;
  readonly name?: string;
  /** The caller's organization access, resolved before the save is admitted. */
  readonly access: ResourceAccess;
}

export type SavedPlanUseCaseOutcome =
  SavedPlanSaveOutcome | { readonly outcome: 'not_found' | 'forbidden' | 'insufficient_scope' };

/** Identifies a failure from the saved-plan write so transports classify only that boundary. */
export class SavedPlanWriteError extends Error {
  constructor(readonly writeCause: unknown) {
    super('Saved-plan write failed', { cause: writeCause });
    this.name = 'SavedPlanWriteError';
  }
}

/** Saves and announces a plan after transport-independent admission succeeds. */
export async function savePlan(
  graph: SavePlanGraph,
  input: SavePlanInput,
): Promise<SavedPlanUseCaseOutcome> {
  if (!input.actor.scopes.includes('write')) return { outcome: 'insufficient_scope' };
  // Proof: reading the project unscoped made `answers 404 alike for a foreign
  // and an absent project on every saved-plan and history route` in
  // `saved-plan-organization.controller.db.test.ts` save a plan of B's
  // project; watched 2026-09-27.
  const found = await graph.projects.readWithin(input.projectId, input.access);
  if (found === null) return { outcome: 'not_found' };
  if (
    !mayEditProjectWithin(found.project, input.actor.id, input.access) &&
    !(
      input.access.kind === 'scoped' &&
      input.access.scope.userId === input.actor.id &&
      input.access.scope.role === 'super_admin'
    )
  ) {
    return { outcome: 'forbidden' };
  }
  const request: SavedPlanSaveRequest = {
    projectId: input.projectId,
    ...(input.name === undefined ? {} : { name: input.name }),
    createdBy: input.actor.username,
    createdById: input.actor.id,
    ...(input.access.kind === 'scoped'
      ? {
          scoped: {
            organizationId: input.access.scope.organizationId,
            actorId: input.actor.id,
            operation: 'save' as const,
          },
        }
      : {}),
  };
  let outcome: SavedPlanSaveOutcome;
  try {
    outcome = await graph.plans.save(request);
  } catch (error) {
    throw new SavedPlanWriteError(error);
  }
  if (outcome.outcome === 'saved') {
    await graph.announcements.publish(input.projectId, { type: 'saved_plans_changed' });
  }
  return outcome;
}
