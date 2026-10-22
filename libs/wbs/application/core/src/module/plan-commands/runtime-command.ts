import type {
  ClaimReceipt,
  RuntimeCommandRequest,
  RuntimeReceipt,
  RuntimeReply,
  WriteReceipt,
} from '@wbs/contracts';

import type { Digest } from '../../ports/runtime';
import type { AppliedCommand } from './plan-commands.feature';
import { type RuntimeAdmission, verifyRuntimeAcceptance } from './runtime-authority';
import { canonicalRuntimeRequest } from './runtime-request';
import { digestRuntimeBasis } from './runtime-state';

export type RuntimeMutationReceipt = ClaimReceipt | WriteReceipt;
/** Borrowed completion inside the existing command transaction, after its journal writes. */
export interface PendingRuntimeCommands {
  readonly admitted: RuntimeAdmission;
  finishCommands(
    applied: readonly AppliedCommand[],
  ): Promise<RuntimeMutationReceipt | Extract<RuntimeReply<RuntimeMutationReceipt>, { ok: false }>>;
}
/** Hashes the complete current borrowed observation; callers choose the pre/post-apply point. */
export async function readRuntimeBasis(
  admitted: RuntimeAdmission,
  ledgerId: string,
  digest: Digest,
) {
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

/** Shared conditional preflight exits on historical acceptance before ordinary effects. */
export async function prepareRuntimeCommand(
  admitted: RuntimeAdmission,
  request: RuntimeCommandRequest,
  digest: Digest,
): Promise<RuntimeReply<RuntimeMutationReceipt> | { ledgerId: string; canonicalRequest: string }> {
  const ledger = await admitted.commands.inspectLedger();
  // Proof: P4-01/P5-22 omitted the pin; fresh wrong-ledger claim/write production requests accepted.
  if (ledger.ledgerId !== request.expectedLedgerId)
    return { ok: false, reason: 'runtime_ledger_mismatch' };
  const canonicalRequest = canonicalRuntimeRequest(admitted.scope, request);
  const retained = await admitted.commands.readAcceptance(admitted.scope, request.commandId);
  if (retained !== null) {
    await verifyRuntimeAcceptance(retained, ledger.ledgerId, digest);
    // Proof: P4-08/P5-26 omitted byte equality; altered claim/write retries received historical success.
    if (retained.canonicalRequest !== canonicalRequest)
      return { ok: false, reason: 'runtime_command_conflict' };
    const receipt = retained.receipt;
    if (receipt.acceptance.kind === 'authority')
      throw new Error('runtime command receipt kind mismatch');
    return receipt.acceptance.kind === 'claim'
      ? { ok: true, value: { ...receipt, acceptance: receipt.acceptance } }
      : { ok: true, value: { ...receipt, acceptance: receipt.acceptance } };
  }
  await admitted.commands.assertAbsentHistory();
  const authority = await admitted.commands.readAuthority(admitted.scope);
  // Proof: P4-02/03 and P5-23/24 omitted owner/generation comparisons separately; isolated stale production requests accepted.
  if (
    authority?.ownerId !== request.authority.ownerId ||
    authority.generation !== request.authority.generation
  )
    return { ok: false, reason: 'runtime_authority_stale' };
  // Proof: P4-04/P5-25 omitted the comparison; stale claim/ref replacement requests accepted.
  if ((await readRuntimeBasis(admitted, ledger.ledgerId, digest)) !== request.expectedBasis)
    return { ok: false, reason: 'runtime_revision_conflict' };

  return { ledgerId: ledger.ledgerId, canonicalRequest };
}
/** Inserts the exact immutable receipt in the borrowed transaction after all mutations. */
export async function retainRuntimeReceipt<
  T extends Exclude<RuntimeReceipt['acceptance'], { kind: 'authority' }>,
>(
  admitted: RuntimeAdmission,
  request: RuntimeCommandRequest,
  digest: Digest,
  prepared: { ledgerId: string; canonicalRequest: string },
  acceptance: T,
): Promise<RuntimeReceipt & { acceptance: T }> {
  const requestDigest = await digest.sha256(prepared.canonicalRequest);
  const receipt = {
    schemaVersion: 1 as const,
    ledgerId: prepared.ledgerId,
    scope: admitted.scope,
    commandId: request.commandId,
    requestDigest,
    actorId: admitted.actorId,
    acceptance,
  };
  // Proof: P4-23/P5-28 omitted the actual INSERT; staged claim/write receipt-fault tests resolved instead of rolling back.
  await admitted.commands.insertAcceptance({
    schemaVersion: 1,
    scope: admitted.scope,
    commandId: request.commandId,
    canonicalRequest: prepared.canonicalRequest,
    requestDigest,
    receipt,
  });
  return receipt;
}
