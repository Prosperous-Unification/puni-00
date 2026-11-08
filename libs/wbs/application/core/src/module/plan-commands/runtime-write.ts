import type { RuntimeReply, RuntimeWriteRequest } from '@wbs/contracts';

import type { Digest } from '../../ports/runtime';
import { matchesRuntimeClaim, type RuntimeAdmission } from './runtime-authority';
import {
  type PendingRuntimeCommands,
  prepareRuntimeCommand,
  readRuntimeBasis,
  retainRuntimeReceipt,
  type RuntimeMutationReceipt,
} from './runtime-command';

/** Exact live identity and retained binding fence ordinary target/person release compilation. */
export async function prepareRuntimeWrite(
  admitted: RuntimeAdmission,
  request: RuntimeWriteRequest,
  digest: Digest,
): Promise<RuntimeReply<RuntimeMutationReceipt> | PendingRuntimeCommands> {
  const prepared = await prepareRuntimeCommand(admitted, request, digest);
  if ('ok' in prepared) return prepared;
  const { claim, commands } = request.action;
  const live = await admitted.findClaim(claim.claimId);
  // Proof: P5-01–06 removed each live identity comparison; its isolated borrowed-field negative accepted.
  // Proof: P5-41 removed this whole guard; fresh-grant/basis stale A release deleted replacement B (observed null).
  if (
    live?.id !== claim.claimId ||
    live.workItemId !== claim.workItemId ||
    live.stepId !== claim.stepId ||
    live.personId !== admitted.scope.personId ||
    live.parentClaimId !== claim.parentClaimId ||
    live.runId !== claim.execution.sessionId
  )
    return { ok: false, reason: 'runtime_claim_mismatch' };
  const binding = await admitted.commands.readBinding(claim.claimId);
  // Proof: P5-07 removed binding admission; an absent-binding production request accepted.
  if (binding === null || !matchesRuntimeClaim(binding, claim))
    return { ok: false, reason: 'runtime_claim_mismatch' };
  for (const [index, command] of commands.entries()) {
    // Proof: P5-16/17/19 omitted target/step/count guards and accepted cross-target writes.
    // P5-18 exposed ordinary not_claimed_by as a backstop; P5-42 omission released another valid held step.
    if (
      command.workItemId !== claim.workItemId ||
      ((command.kind === 'setProgress' || command.kind === 'setMeasure') &&
        command.stepId !== claim.stepId) ||
      (command.kind === 'releaseWorkItem' &&
        (command.personId !== admitted.scope.personId ||
          command.steps.length !== 1 ||
          command.steps[0] !== claim.stepId))
    )
      return { ok: false, reason: 'runtime_command_target_mismatch' };
    // Proof: P5-21 omission accepted release→progress; repeated release instead reached ordinary not_claimed_by.
    if (command.kind === 'releaseWorkItem' && index !== commands.length - 1)
      return { ok: false, reason: 'runtime_command_not_supported' };
  }
  return {
    admitted,
    finishCommands: async () => {
      // Proof: P5-27 echoed the incoming basis; the committed-state comparison disagreed.
      const basisAfter = await readRuntimeBasis(admitted, prepared.ledgerId, digest);
      return retainRuntimeReceipt(admitted, request, digest, prepared, {
        kind: 'write',
        authority: request.authority,
        claim,
        basisAfter,
        applied: commands.map(({ kind }, index) => ({ index, kind })),
      });
    },
  };
}
