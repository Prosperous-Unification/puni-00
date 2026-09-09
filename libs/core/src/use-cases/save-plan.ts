import type { AuthenticatedUser } from '../service/auth.service';
import type { Broadcaster } from '../service/broadcast';
import { canEdit, type ProjectService } from '../service/project.service';
import type {
  SavedPlanSaveOutcome,
  SavedPlanSaveRequest,
  SavedPlanService,
} from '../service/saved-plan.service';

export interface SavePlanGraph {
  readonly projects: Pick<ProjectService, 'read'>;
  readonly plans: Pick<SavedPlanService, 'save'>;
  readonly announcements: Pick<Broadcaster, 'publish'>;
}

export interface SavePlanInput {
  readonly projectId: string;
  readonly actor: AuthenticatedUser;
  readonly name?: string;
}

export type SavedPlanUseCaseOutcome =
  SavedPlanSaveOutcome | { readonly outcome: 'not_found' | 'forbidden' | 'insufficient_scope' };

/** Saves and announces a plan after transport-independent admission succeeds. */
export async function savePlan(
  graph: SavePlanGraph,
  input: SavePlanInput,
): Promise<SavedPlanUseCaseOutcome> {
  if (!input.actor.scopes.includes('write')) return { outcome: 'insufficient_scope' };
  const found = await graph.projects.read(input.projectId);
  if (found === null) return { outcome: 'not_found' };
  if (!canEdit(found.project, input.actor.id)) return { outcome: 'forbidden' };
  const request: SavedPlanSaveRequest = {
    projectId: input.projectId,
    ...(input.name === undefined ? {} : { name: input.name }),
    createdBy: input.actor.username,
    createdById: input.actor.id,
  };
  const outcome = await graph.plans.save(request);
  if (outcome.outcome === 'saved') {
    await graph.announcements.publish(input.projectId, { type: 'saved_plans_changed' });
  }
  return outcome;
}
