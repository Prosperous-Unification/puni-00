import { addStep, removeStep, renameStep } from '@wbs/contracts';
import { allowancePercentOf, NO_ALLOWANCE } from '@wbs/domain';

import type { PlanCommandRunner } from '../module/plan-commands/plan-commands.feature';
import { runCommandBatch } from '../module/plan-commands/run-command-batch';
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
 *
 * An allowance edit is not StepService's: it runs as the `setStepAllowance`
 * command through `commands`, so HTTP, a command batch and MCP share one
 * journalled mutation and one undo.
 */
export function stepRoutes(
  steps: StepService,
  commands: Pick<PlanCommandRunner, 'run' | 'runDirectory'>,
) {
  return [
    bind(addStep, async ({ params, body, principal }) => {
      const allowance =
        body.allowancePercent === undefined
          ? NO_ALLOWANCE
          : allowancePercentOf(body.allowancePercent);
      // Proof: with this refusal removed, `adds a step with the allowance it
      // names, and refuses one with three decimals` stored the step.
      if (allowance === null)
        return { ok: false, status: 422, body: { error: 'invalid_allowance' } };
      // Proof: catching the store failure as not_found returned a refusal object
      // instead of the original error in step.routes.test.ts's outage case.
      return addedReply(await steps.add(params.id, principal.id, body.name, allowance, body.code));
    }),
    bind(renameStep, async ({ params, body, principal }) => {
      const allowance =
        body.allowancePercent === undefined ? undefined : allowancePercentOf(body.allowancePercent);
      // Proof: with this refusal bypassed, `a patched allowance runs as the one
      // journalled setStepAllowance command` got a reply other than 422
      // invalid_allowance for -1%.
      if (allowance === null)
        return { ok: false, status: 422, body: { error: 'invalid_allowance' } };
      if (allowance === undefined) {
        if (body.name === undefined) {
          return { ok: false, status: 422, body: { error: 'invalid_body' } };
        }
        return renamedReply(await steps.rename(params.id, params.stepId, principal.id, body.name));
      }
      if (body.name !== undefined) {
        const renamed = await steps.rename(params.id, params.stepId, principal.id, body.name);
        if (!renamed.ok) return renamedReply(renamed);
      }
      const outcome = await runCommandBatch(commands, {
        projectId: params.id,
        actor: principal,
        commands: [
          { kind: 'setStepAllowance', stepId: params.stepId, allowancePercent: allowance },
        ],
      });
      // The shape's write-scope policy refused this before the handler ran.
      if ('error' in outcome) return { ok: false, status: 403, body: { error: outcome.error } };
      if (!outcome.ok) {
        if (outcome.reason === 'forbidden')
          return { ok: false, status: 403, body: { error: 'forbidden' } };
        if (outcome.reason === 'not_found')
          return { ok: false, status: 404, body: { error: 'not_found' } };
        throw new Error(`setStepAllowance refused with an unmodelled reason: ${outcome.reason}`);
      }
      return renamedReply(await steps.find(params.id, params.stepId, principal.id));
    }),
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
        case 'not_found':
          return { ok: false, status: 404, body: { error: outcome.reason } };
        case 'forbidden':
          return { ok: false, status: 403, body: { error: outcome.reason } };
      }
    }),
  ] as const;
}
