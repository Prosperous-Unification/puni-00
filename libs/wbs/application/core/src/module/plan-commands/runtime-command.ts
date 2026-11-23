import type {
  ClaimReceipt,
  RuntimeCommandRequest,
  RuntimeReceipt2,
  RuntimeReply,
  WriteReceipt,
} from '@wbs/contracts';
import { encodeRuntimeRequestAtVersion } from '@wbs/contracts';

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
      workPackageId: admitted.scope.workPackageId,
      workPackageRevision: observation.workPackageRevision,
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
  const retained = await admitted.commands.readAcceptance(request.commandId);
  if (retained !== null) {
    await verifyRuntimeAcceptance(retained, ledger.ledgerId, digest);
    // Proof: P4-08/P5-26 omitted byte equality; altered claim/write retries received historical success.
    // Proof: runtime-mutation-changed-identity-refusal omitted retained claim/write byte equality; changed retries returned old successes; 'mounted migrated runtime1 changed claim conflicts without rewriting original identity'; 'mounted migrated runtime1 changed write conflicts without rewriting original identity' failed and restored GREEN.
    // Proof: dash-native-changed-mutation-identity: omitting exact retained mutation request-byte equality.
    // 'native original1 changed claim requires exact identity conflict after cold deletion' failed; exact restoration passed.
    // 'native original1 changed write requires exact identity conflict after cold deletion' failed; exact restoration passed.
    // Claim and write are independently selected. First mutant assertions are success versus refusal; restored cases check409/body/no-effects.
    if (
      retained.canonicalRequest !==
      // Proof: runtime-mutation-retry-retained-format encoded valid legacy claim/write retries as current2; 'mounted migrated runtime1 claim replay and lookup return original receipt without effects'; 'mounted migrated runtime1 write replay and lookup return original receipt without effects' failed and restored GREEN.
      encodeRuntimeRequestAtVersion(retained.schemaVersion, admitted.scope, request)
    )
      return { ok: false, reason: 'runtime_command_conflict' };
    const receipt = retained.receipt;
    if (receipt.acceptance.kind === 'authority')
      throw new Error('runtime command receipt kind mismatch');
    return receipt.acceptance.kind === 'claim'
      ? { ok: true, value: { ...receipt, acceptance: receipt.acceptance } }
      : { ok: true, value: { ...receipt, acceptance: receipt.acceptance } };
  }
  await admitted.commands.assertAbsentHistory();
  const authority = await admitted.commands.readAuthority();
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
  T extends Exclude<RuntimeReceipt2['acceptance'], { kind: 'authority' }>,
>(
  admitted: RuntimeAdmission,
  request: RuntimeCommandRequest,
  digest: Digest,
  prepared: { ledgerId: string; canonicalRequest: string },
  acceptance: T,
): Promise<RuntimeReceipt2 & { acceptance: T }> {
  const requestDigest = await digest.sha256(prepared.canonicalRequest);
  const receipt = {
    // Proof: runtime-mutation-current-emission emitted receipt1; the shared test reached claim first and the current-only insertion boundary refused it; 'mounted current claim and write persist only runtime2 then replay without new rows' failed and restored GREEN.
    schemaVersion: 2 as const,
    ledgerId: prepared.ledgerId,
    scope: admitted.scope,
    commandId: request.commandId,
    requestDigest,
    actorId: admitted.actorId,
    acceptance,
  };
  // Proof: P4-23/P5-28 omitted the actual INSERT; staged claim/write receipt-fault tests resolved instead of rolling back.
  await admitted.commands.insertAcceptance({
    schemaVersion: 2,
    commandId: request.commandId,
    canonicalRequest: prepared.canonicalRequest,
    requestDigest,
    receipt,
  });
  return receipt;
}
