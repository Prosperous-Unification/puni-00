import { patchWorkPackageStepValues } from '@wbs/contracts';

import type {
  AuthorityRefusal,
  PlanCommandRunner,
} from '../module/plan-commands/plan-commands.feature';
import { runCommandBatchAfter } from '../module/plan-commands/run-command-batch';
import type { PackageStepUnitOutcome, StepService } from '../module/step/step.resource';
import type { OrganizationAccess } from '../ports/organization-access';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';
import { type RecoveryWriteBoundary, runRecoveryWrite } from './recovery-write';

/** Preserves each current package-value refusal's named authority and wire status. */
function valuesReply(
  outcome: PackageStepUnitOutcome | AuthorityRefusal,
): HttpReply<typeof patchWorkPackageStepValues> {
  if ('refusal' in outcome) return organizationRefusal(outcome);
  if ('error' in outcome) return { ok: false, status: 403, body: { error: outcome.error } };
  if (outcome.ok) return { ok: true, status: 200, body: { step: outcome.value } };
  switch (outcome.reason) {
    case 'not_found':
      return { ok: false, status: 404, body: { error: 'not_found' } };
    case 'forbidden':
      return {
        ok: false,
        status: 403,
        body: {
          error: 'forbidden',
          ...(outcome.permission === undefined ? {} : { permission: outcome.permission }),
        },
      };
    case 'estimates_present':
      return { ok: false, status: 409, body: { error: 'estimates_present', count: outcome.count } };
  }
}

/**
 * Current package values only. Definition creation, renaming and retirement no
 * longer have package routes. Closed request validation admits integer basis
 * points once; the journalled allowance command receives their exact percentage.
 * Unit-only edits use the actual settings writer. Combined edits use a nonempty
 * allowance batch and a same-writer unit prelude, so refusal rolls both back.
 */
export function packageStepValuesRoutes(
  steps: Pick<StepService, 'findPackageValuesWithin' | 'setPackageUnitWithin'>,
  commands: Pick<PlanCommandRunner, 'runAfterWithin'>,
  organizations: OrganizationAccess,
  recovery: RecoveryWriteBoundary,
) {
  return [
    bind(
      patchWorkPackageStepValues,
      async ({
        params,
        body,
        principal,
      }): Promise<HttpReply<typeof patchWorkPackageStepValues>> => {
        const { allowanceBps, estimateUnit } = body;
        const workPackageId = params.id,
          stepId = params.stepId,
          actorId = principal.id;
        const resolved = await organizations.resolve(principal);
        if (!resolved.ok) return organizationRefusal(resolved);
        if (allowanceBps === undefined) {
          if (estimateUnit === undefined)
            return { ok: false, status: 422, body: { error: 'invalid_body' } };
          return valuesReply(
            await runRecoveryWrite(
              recovery,
              resolved.access,
              workPackageId,
              principal,
              { step: 'values' },
              (services, access, actorId) =>
                services.steps.setPackageUnitWithin(
                  workPackageId,
                  stepId,
                  actorId,
                  estimateUnit,
                  access,
                ),
              (reason, permission): PackageStepUnitOutcome => ({
                ok: false,
                reason,
                ...(permission === undefined ? {} : { permission }),
              }),
            ),
          );
        }
        const outcome = await runCommandBatchAfter(
          commands,
          {
            workPackageId: workPackageId,
            actor: principal,
            access: resolved.access,
            commands: [
              { kind: 'setStepAllowance', stepId: stepId, allowancePercent: allowanceBps / 100 },
            ],
          },
          async (graph, access) => {
            const prepared =
              estimateUnit === undefined
                ? await graph.steps.findPackageValuesWithin(workPackageId, stepId, actorId, access)
                : await graph.steps.setPackageUnitWithin(
                    workPackageId,
                    stepId,
                    actorId,
                    estimateUnit,
                    access,
                  );
            return prepared.ok ? null : prepared;
          },
        );
        if ('prelude' in outcome) return valuesReply(outcome.prelude);
        if ('error' in outcome) return { ok: false, status: 403, body: { error: outcome.error } };
        if ('refusal' in outcome) {
          if (outcome.refusal !== 'not_found' && outcome.refusal !== 'forbidden')
            return organizationRefusal(outcome);
          return outcome.refusal === 'not_found'
            ? { ok: false, status: 404, body: { error: 'not_found' } }
            : {
                ok: false,
                status: 403,
                body: {
                  error: 'forbidden',
                  ...(outcome.permission === undefined ? {} : { permission: outcome.permission }),
                },
              };
        }
        if (!outcome.ok) {
          switch (outcome.reason) {
            case 'not_found':
              return { ok: false, status: 404, body: { error: 'not_found' } };
            case 'forbidden':
              return {
                ok: false,
                status: 403,
                body: {
                  error: 'forbidden',
                  ...('permission' in outcome ? { permission: outcome.permission } : {}),
                },
              };
            case 'calendar_range':
              return { ok: false, status: 422, body: { error: 'calendar_range' } };
            default:
              throw new Error(
                `setStepAllowance refused with an unmodelled reason: ${outcome.reason}`,
              );
          }
        }
        return valuesReply(
          await steps.findPackageValuesWithin(workPackageId, stepId, actorId, resolved.access),
        );
      },
    ),
  ] as const;
}
