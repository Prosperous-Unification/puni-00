import { addStep, removeStep, renameStep } from '@wbs/contracts';

import type { Step } from '../ports/step-store';
import type { StepOutcome, StepService } from '../service/step.service';
import { bind, EMPTY, type HttpReply } from './endpoint';

/** Keeps each named-step domain refusal paired with its existing wire status. */
function namedReply(
  outcome:
    | { ok: true; value: Step }
    | { ok: false; reason: 'not_found' | 'forbidden' | 'taken' | 'name_required' },
): HttpReply<typeof renameStep> {
  if (outcome.ok) return { ok: true, status: 200, body: { step: outcome.value } };
  switch (outcome.reason) {
    case 'not_found':
      return { ok: false, status: 404, body: { error: outcome.reason } };
    case 'forbidden':
      return { ok: false, status: 403, body: { error: outcome.reason } };
    case 'taken':
      return { ok: false, status: 409, body: { error: outcome.reason } };
    case 'name_required':
      return { ok: false, status: 422, body: { error: outcome.reason } };
  }
}

/** {@link namedReply}, plus the refusals only a chosen code can earn. */
function addedReply(outcome: StepOutcome): HttpReply<typeof addStep> {
  if (outcome.ok) return namedReply(outcome);
  switch (outcome.reason) {
    case 'invalid_code':
    case 'reserved_code':
      return { ok: false, status: 422, body: { error: outcome.reason } };
    case 'code_taken':
      return { ok: false, status: 409, body: { error: outcome.reason } };
    default:
      return namedReply({ ok: false, reason: outcome.reason });
  }
}

/** A rename keeps the step's code, so no code refusal can reach it. */
function renamedReply(outcome: StepOutcome): HttpReply<typeof renameStep> {
  if (outcome.ok) return namedReply(outcome);
  switch (outcome.reason) {
    case 'invalid_code':
    case 'reserved_code':
    case 'code_taken':
      throw new Error(`a rename answered ${outcome.reason}, which only a chosen code can earn`);
    default:
      return namedReply({ ok: false, reason: outcome.reason });
  }
}

/**
 * Binds the project's three step mutations to their shared wire declarations.
 * Identity and structural validation belong to the mounted shape; names remain
 * untrimmed until StepService applies its domain refusal. Reading steps stays
 * on GET /api/projects/:id, without introducing a second list endpoint.
 */
export function stepRoutes(steps: Pick<StepService, 'add' | 'rename' | 'remove'>) {
  return [
    bind(addStep, async ({ params, body, principal }) =>
      // Proof: catching the store failure as not_found returned a refusal object
      // instead of the original error in step.routes.test.ts's outage case.
      addedReply(await steps.add(params.id, principal.id, body.name, body.code)),
    ),
    bind(renameStep, async ({ params, body, principal }) =>
      renamedReply(await steps.rename(params.id, params.stepId, principal.id, body.name)),
    ),
    bind(removeStep, async ({ params, query, principal }) => {
      // Proof: truthy cascade deleted on cascade=1 (204 instead of409); reading
      // the first raw duplicate deleted on true&false (204 instead of409), both
      // observed in step.controller.db.test.ts before restoring this comparison.
      const outcome = await steps.remove(
        params.id,
        params.stepId,
        principal.id,
        query.cascade === 'true',
      );
      if (outcome.ok) return { ok: true, status: 204, body: EMPTY };
      switch (outcome.reason) {
        case 'in_use':
          // Proof: omitting measures failed response validation,500 instead of
          //409 in the mounted usage-count case (step.controller.db.test.ts).
          return { ok: false, status: 409, body: { error: outcome.reason, inUse: outcome.inUse } };
        case 'referenced_by_dependency':
          return {
            ok: false,
            status: 409,
            body: { error: outcome.reason, dependencyIds: outcome.dependencyIds },
          };
        case 'dependency_cycle':
          return { ok: false, status: 409, body: { error: outcome.reason } };
        case 'not_found':
          return { ok: false, status: 404, body: { error: outcome.reason } };
        case 'forbidden':
          return { ok: false, status: 403, body: { error: outcome.reason } };
      }
    }),
  ] as const;
}
