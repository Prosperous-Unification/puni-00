import type { AuthenticatedUser } from '@wbs/contracts';
import type { Permission } from '@wbs/domain';
import { canEditLegacyWorkPackage } from '@wbs/domain';

import type { ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/work-package-event';
import type { WorkPackageObservation } from '../../ports/work-package-observation';
import type { WorkPackageService } from '../work-package/work-package.resource';
import { SavedPlanWriteError } from './saved-plan-write-error';
import type {
  SavedPlanObservedSaveOutcome,
  SavedPlanSaveOutcome,
  SavedPlanSaveRequest,
  SavedPlanService,
} from './saved-plans.feature';
import { SavedPlanCaptureRefusal } from './saved-plans.feature';
export { SavedPlanWriteError } from './saved-plan-write-error';

export interface SavePlanGraph {
  readonly workPackages: Pick<WorkPackageService, 'readWithin' | 'authorizeWrite'>;
  readonly plans: Pick<SavedPlanService, 'save'>;
  readonly announcements: Pick<Broadcaster, 'publish'>;
}

export interface SavePlanInput {
  readonly workPackageId: string;
  readonly actor: AuthenticatedUser;
  readonly name?: string;
  /** The caller's organization access, resolved before the save is admitted. */
  readonly access: ResourceAccess;
}

export type SavedPlanUseCaseOutcome =
  | SavedPlanSaveOutcome
  | {
      readonly outcome: 'not_found' | 'forbidden' | 'insufficient_scope';
      readonly permission?: Permission;
    }
  | { readonly outcome: 'access_refused'; readonly refusal: SavedPlanCaptureRefusal['refusal'] };

/** The mounted save uses its required Source purpose; no raw-resource fallback is selected. */
export async function saveObservedPlan(
  graph: {
    readonly plans: Pick<SavedPlanService, 'saveObserved'>;
    readonly observation: Pick<WorkPackageObservation, 'captureSavedPlan'>;
    readonly announcements: Pick<Broadcaster, 'publish'>;
  },
  input: SavePlanInput,
): Promise<SavedPlanObservedSaveOutcome | { readonly outcome: 'insufficient_scope' }> {
  input = structuredClone(input);
  if (!input.actor.scopes.includes('write')) return { outcome: 'insufficient_scope' };
  const outcome = await graph.plans.saveObserved(input, graph.observation);
  if (outcome.outcome === 'saved')
    await graph.announcements.publish(input.workPackageId, { type: 'saved_plans_changed' });
  return outcome;
}

/** Saves and announces a plan after transport-independent admission succeeds. */
export async function savePlan(
  graph: SavePlanGraph,
  input: SavePlanInput,
): Promise<SavedPlanUseCaseOutcome> {
  input = structuredClone(input);
  if (!input.actor.scopes.includes('write')) return { outcome: 'insufficient_scope' };
  // Proof: reading the work package unscoped made `answers 404 alike for a foreign
  // and an absent work package on every saved-plan and history route` in
  // `saved-plan-organization.controller.db.test.ts` save a plan of B's
  // work package; watched 2026-09-27.
  const found = await graph.workPackages.readWithin(input.workPackageId, input.access);
  if (found === null) return { outcome: 'not_found' };
  if (input.access.kind === 'scoped') {
    const decision = await graph.workPackages.authorizeWrite(
      input.workPackageId,
      input.actor.id,
      input.access,
    );
    if (!decision.ok)
      return {
        outcome: decision.reason,
        ...(decision.reason === 'forbidden' ? { permission: decision.permission } : {}),
      };
    // Proof: legacy-save-plan; bypassed the legacy creator refusal.
    // 'refuses read-only, wrong-owner, and absent-work-package calls before save' (admission.test.ts) failed; restored GREEN, 2026-11-10.
  } else if (!canEditLegacyWorkPackage(found.workPackage)) return { outcome: 'forbidden' };
  const request: SavedPlanSaveRequest = {
    workPackageId: input.workPackageId,
    ...(input.name === undefined ? {} : { name: input.name }),
    createdBy: input.actor.username,
    createdById: input.actor.id,
    access: input.access,
    ...(input.access.kind === 'scoped'
      ? {
          scoped: {
            organizationId: input.access.scope.organizationId,
            actorId: input.actor.id,
            principal: input.access.principal,
            operation: 'save' as const,
          },
        }
      : {}),
  };
  let outcome: SavedPlanSaveOutcome;
  try {
    outcome = await graph.plans.save(request);
  } catch (error) {
    if (error instanceof SavedPlanCaptureRefusal)
      return { outcome: 'access_refused', refusal: error.refusal };
    throw new SavedPlanWriteError(error);
  }
  if (outcome.outcome === 'saved') {
    await graph.announcements.publish(input.workPackageId, { type: 'saved_plans_changed' });
  }
  return outcome;
}
