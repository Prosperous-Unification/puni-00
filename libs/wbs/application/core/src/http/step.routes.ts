import { addStep, removeStep, renameStep } from '@wbs/contracts';
import { allowancePercentOf, NO_ALLOWANCE } from '@wbs/domain';

import type { PlanCommandRunner } from '../module/plan-commands/plan-commands.feature';
import { runCommandBatch } from '../module/plan-commands/run-command-batch';
import type { OrganizationAccess } from '../ports/organization-access';
import type { ResourceAccess } from '../ports/organization-access';
import type { Step } from '../ports/step-store';
import type { StepOutcome, StepService } from '../service/step.service';
import { bind, EMPTY, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';
import { type RecoveryWriteBoundary, runRecoveryWrite } from './recovery-write';

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
 * Every step route resolves organization access before any lookup.
 * Proof: bypassing the resolution in any one of the three routes alone failed
 * `refuses an unbound session and a removed member before any lookup` in
 * `step-marker-organization.controller.db.test.ts`; watched 2026-09-27.
 *
 * An allowance edit is not StepService's: it runs as the `setStepAllowance`
 * command through `commands`, so HTTP, a command batch and MCP share one
 * journalled mutation and one undo.
 */
export function stepRoutes(
  steps: Pick<StepService, 'addWithin' | 'findWithin' | 'removeWithin' | 'renameWithin'>,
  commands: Pick<PlanCommandRunner, 'runWithin' | 'runDirectoryWithin'>,
  organizations: OrganizationAccess,
  recovery?: RecoveryWriteBoundary,
) {
  /** Runs a scoped dependent write in the transaction that records its recovery. */
  const write = <T extends { readonly ok: boolean }>(
    access: ResourceAccess,
    projectId: string,
    actorId: string,
    detail: { readonly step: 'add' | 'rename' | 'remove' },
    perform: (service: typeof steps) => Promise<T>,
    refuse: (reason: 'not_found' | 'forbidden') => T,
  ): Promise<T> => {
    if (access.kind === 'legacy') return perform(steps);
    if (recovery === undefined) throw new Error('scoped step write has no recovery boundary');
    return runRecoveryWrite(
      recovery,
      access,
      projectId,
      actorId,
      detail,
      (services) => perform(services.steps),
      refuse,
    );
  };
  return [
    bind(addStep, async ({ params, body, principal }): Promise<HttpReply<typeof addStep>> => {
      const allowance =
        body.allowancePercent === undefined
          ? NO_ALLOWANCE
          : allowancePercentOf(body.allowancePercent);
      // Proof: with this refusal removed, `adds a step with the allowance it
      // names, and refuses one with three decimals` stored the step.
      if (allowance === null)
        return { ok: false, status: 422, body: { error: 'invalid_allowance' } };
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      // Proof: catching the store failure as not_found returned a refusal object
      // instead of the original error in step.routes.test.ts's outage case.
      return addedReply(
        await write(
          resolved.access,
          params.id,
          principal.id,
          { step: 'add' },
          (service) =>
            service.addWithin(
              params.id,
              principal.id,
              body.name,
              allowance,
              body.code,
              resolved.access,
            ),
          (reason): StepOutcome => ({ ok: false, reason }),
        ),
      );
    }),
    bind(renameStep, async ({ params, body, principal }): Promise<HttpReply<typeof renameStep>> => {
      const allowance =
        body.allowancePercent === undefined ? undefined : allowancePercentOf(body.allowancePercent);
      // Proof: with this refusal bypassed, `a patched allowance runs as the one
      // journalled setStepAllowance command` got a reply other than 422
      // invalid_allowance for -1%.
      if (allowance === null)
        return { ok: false, status: 422, body: { error: 'invalid_allowance' } };
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      if (allowance === undefined) {
        if (body.name === undefined) {
          return { ok: false, status: 422, body: { error: 'invalid_body' } };
        }
        const name = body.name;
        return renamedReply(
          await write(
            resolved.access,
            params.id,
            principal.id,
            { step: 'rename' },
            (service) =>
              service.renameWithin(params.id, params.stepId, principal.id, name, resolved.access),
            (reason): StepOutcome => ({ ok: false, reason }),
          ),
        );
      }
      // The project, the step and the caller's role are checked here first,
      // through the caller's access, before the rename or the command writes
      // anything; the command batch then holds itself to the same access.
      // Proof: skipping this check made `refuses an allowance edit of a foreign
      // step or project, changing nothing` in
      // `step-marker-organization.controller.db.test.ts` change B's step
      // allowance from 0 to 25 before the command batch was scoped; since it
      // is, the same fault answers 500 instead of 404 for B's step under A's
      // project, the batch's `unknown_step` being no reply this route models;
      // watched 2026-09-27.
      const admitted = await steps.findWithin(
        params.id,
        params.stepId,
        principal.id,
        resolved.access,
      );
      if (!admitted.ok) return renamedReply(admitted);
      if (body.name !== undefined) {
        const renamed = await steps.renameWithin(
          params.id,
          params.stepId,
          principal.id,
          body.name,
          resolved.access,
        );
        if (!renamed.ok) return renamedReply(renamed);
      }
      const outcome = await runCommandBatch(commands, {
        projectId: params.id,
        actor: principal,
        commands: [
          { kind: 'setStepAllowance', stepId: params.stepId, allowancePercent: allowance },
        ],
        access: resolved.access,
      });
      // The shape's write-scope policy refused this before the handler ran.
      if ('error' in outcome) return { ok: false, status: 403, body: { error: outcome.error } };
      if ('refusal' in outcome) {
        return outcome.refusal === 'not_found'
          ? { ok: false, status: 404, body: { error: 'not_found' } }
          : { ok: false, status: 403, body: { error: 'forbidden' } };
      }
      if (!outcome.ok) {
        if (outcome.reason === 'forbidden')
          return { ok: false, status: 403, body: { error: 'forbidden' } };
        if (outcome.reason === 'not_found')
          return { ok: false, status: 404, body: { error: 'not_found' } };
        throw new Error(`setStepAllowance refused with an unmodelled reason: ${outcome.reason}`);
      }
      return renamedReply(
        await steps.findWithin(params.id, params.stepId, principal.id, resolved.access),
      );
    }),
    bind(
      removeStep,
      async ({ params, query, principal }): Promise<HttpReply<typeof removeStep>> => {
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved.refusal);
        // Proof: truthy cascade deleted on cascade=1 (204 instead of409); reading
        // the first raw duplicate deleted on true&false (204 instead of409), both
        // observed in step.controller.db.test.ts before restoring this comparison.
        const outcome = await write(
          resolved.access,
          params.id,
          principal.id,
          { step: 'remove' },
          (service) =>
            service.removeWithin(
              params.id,
              params.stepId,
              principal.id,
              query.cascade === 'true',
              resolved.access,
            ),
          (reason) => ({ ok: false, reason }) as const,
        );
        if (outcome.ok) return { ok: true, status: 204, body: EMPTY };
        switch (outcome.reason) {
          case 'in_use':
            // Proof: omitting measures failed response validation,500 instead of
            //409 in the mounted usage-count case (step.controller.db.test.ts).
            return {
              ok: false,
              status: 409,
              body: { error: outcome.reason, inUse: outcome.inUse },
            };
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
      },
    ),
  ] as const;
}
