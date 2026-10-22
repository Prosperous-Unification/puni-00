import type { RuntimeClaimRequest, RuntimeReply } from '@wbs/contracts';

import type { Digest } from '../../ports/runtime';
import type { RuntimeAdmission } from './runtime-authority';
import {
  type PendingRuntimeCommands,
  prepareRuntimeCommand,
  readRuntimeBasis,
  retainRuntimeReceipt,
  type RuntimeMutationReceipt,
} from './runtime-command';

/** Claim-specific binding admission completes through the ordinary command path. */
export async function prepareRuntimeClaim(
  admitted: RuntimeAdmission,
  request: RuntimeClaimRequest,
  digest: Digest,
): Promise<RuntimeReply<RuntimeMutationReceipt> | PendingRuntimeCommands> {
  const prepared = await prepareRuntimeCommand(admitted, request, digest);
  if ('ok' in prepared) return prepared;
  const action = request.action;
  const bound = await admitted.commands.readAttemptBinding(
    admitted.scope,
    action.execution.storeId,
    action.execution.attemptId,
  );
  // Proof: P4-06 omission changed `never reuses an attempt binding` from typed refusal to SQLite UNIQUE fault; storage remains a backstop.
  if (bound !== null) return { ok: false, reason: 'runtime_attempt_bound' };
  return {
    admitted,
    finishCommands: async (applied) => {
      const command = applied.at(0);
      if (command?.kind !== 'claimWorkItem')
        throw new Error('runtime claim application reply is missing');
      const alreadyHeld = command.alreadyHeld;
      // Proof: P4-16–20 removed each exact-field comparison with that borrowed field corrupted; each production-path negative resolved instead of throwing.
      const claims = (await admitted.listClaims()).filter(
        (claim) =>
          claim.workItemId === action.workItemId &&
          claim.stepId === action.stepId &&
          claim.personId === admitted.scope.personId &&
          claim.runId === action.execution.sessionId &&
          claim.parentClaimId === action.parentClaimId,
      );
      const live = claims.at(0);
      if (live === undefined || claims.length !== 1)
        throw new Error('applied runtime claim target is missing or ambiguous');
      const binding = await admitted.commands.readBinding(admitted.scope, live.id);
      // Proof: P4-07 omission changed the same-person/session attempt-B test to runtime_claim_unmanaged; the later guard remains a backstop.
      if (binding !== null) return { ok: false, reason: 'runtime_claim_mismatch' };
      // Proof: P4-05 omission made `never adopts an unbound ordinary alreadyHeld claim` accept and persist a binding.
      if (alreadyHeld) return { ok: false, reason: 'runtime_claim_unmanaged' };
      const claim = {
        claimId: live.id,
        workItemId: action.workItemId,
        stepId: action.stepId,
        parentClaimId: action.parentClaimId,
        execution: action.execution,
      };
      // Proof: P4-22 omitted this insert; `binds precisely one step/session` read null for the retained binding.
      await admitted.commands.insertBinding(admitted.scope, claim);
      // Proof: P4-21 echoed expectedBasis; `binds precisely one step/session` disagreed with the real post-claim observation.
      const basisAfter = await readRuntimeBasis(admitted, prepared.ledgerId, digest);
      return retainRuntimeReceipt(admitted, request, digest, prepared, {
        kind: 'claim',
        authority: request.authority,
        claim,
        basisAfter,
      });
    },
  };
}
