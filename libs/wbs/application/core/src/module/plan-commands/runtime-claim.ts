import type { ClaimReceipt, RuntimeClaimRequest, RuntimeReply } from '@wbs/contracts';

import type { Digest } from '../../ports/runtime';
import { type RuntimeAdmission, verifyRuntimeAcceptance } from './runtime-authority';
import { canonicalRuntimeRequest } from './runtime-request';
import { digestRuntimeBasis } from './runtime-state';

/** Receipt work retained only for a newly admitted claim in its command transaction. */
export interface PendingRuntimeClaim {
  readonly admitted: RuntimeAdmission;
  finishClaim(
    alreadyHeld: boolean,
  ): Promise<ClaimReceipt | Extract<RuntimeReply<ClaimReceipt>, { ok: false }>>;
}

/** Hashes the complete current borrowed observation; callers choose the pre/post-apply point. */
async function readBasis(admitted: RuntimeAdmission, ledgerId: string, digest: Digest) {
  const observation = await admitted.observe();
  return digestRuntimeBasis(
    {
      ledgerId,
      organizationId: admitted.scope.organizationId,
      projectId: admitted.scope.projectId,
      projectRevision: observation.projectRevision,
      workItems: observation.workItems,
    },
    digest,
  );
}

/** Pure replay and conditional guards precede all ordinary command admission effects. */
export async function prepareRuntimeClaim(
  admitted: RuntimeAdmission,
  request: RuntimeClaimRequest,
  digest: Digest,
): Promise<RuntimeReply<ClaimReceipt> | PendingRuntimeClaim> {
  const ledger = await admitted.commands.inspectLedger();
  // Proof: P4-01 omitted the pin; the fresh wrong-ledger production request accepted.
  if (ledger.ledgerId !== request.expectedLedgerId)
    return { ok: false, reason: 'runtime_ledger_mismatch' };
  const canonicalRequest = canonicalRuntimeRequest(admitted.scope, request);
  const retained = await admitted.commands.readAcceptance(admitted.scope, request.commandId);
  if (retained !== null) {
    await verifyRuntimeAcceptance(retained, ledger.ledgerId, digest);
    // Proof: P4-08 omitted byte equality; changed-target retry received historical success.
    if (retained.canonicalRequest !== canonicalRequest)
      return { ok: false, reason: 'runtime_command_conflict' };
    const receipt = retained.receipt;
    if (receipt.acceptance.kind !== 'claim') throw new Error('runtime claim receipt kind mismatch');
    return { ok: true, value: { ...receipt, acceptance: receipt.acceptance } };
  }
  await admitted.commands.assertAbsentHistory();
  const authority = await admitted.commands.readAuthority(admitted.scope);
  // Proof: P4-02/P4-03 omitted owner/generation comparisons separately; each stale production request accepted.
  if (
    authority?.ownerId !== request.authority.ownerId ||
    authority.generation !== request.authority.generation
  )
    return { ok: false, reason: 'runtime_authority_stale' };
  // Proof: P4-04 omitted this comparison; the production request accepted after a competing ordinary claim.
  if ((await readBasis(admitted, ledger.ledgerId, digest)) !== request.expectedBasis)
    return { ok: false, reason: 'runtime_revision_conflict' };
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
    finishClaim: async (alreadyHeld) => {
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
      const basisAfter = await readBasis(admitted, ledger.ledgerId, digest);
      const requestDigest = await digest.sha256(canonicalRequest);
      const receipt: ClaimReceipt = {
        schemaVersion: 1,
        ledgerId: ledger.ledgerId,
        scope: admitted.scope,
        commandId: request.commandId,
        requestDigest,
        actorId: admitted.actorId,
        acceptance: { kind: 'claim', authority: request.authority, claim, basisAfter },
      };
      // Proof: P4-23 omitted the actual INSERT; the staged-write receipt-fault test resolved instead of rolling back.
      await admitted.commands.insertAcceptance({
        schemaVersion: 1,
        scope: admitted.scope,
        commandId: request.commandId,
        canonicalRequest,
        requestDigest,
        receipt,
      });
      return receipt;
    },
  };
}
