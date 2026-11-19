import type {
  AuthorityReceipt,
  CredentialAuthentication,
  CredentialPin,
  RuntimeAuthorityRequest,
  RuntimeClaimInventory,
  RuntimeObservation,
  RuntimeReadRefusal,
  RuntimeReceipt,
  RuntimeReply,
  RuntimeScope,
  RuntimeState as RuntimeStateValue,
} from '@wbs/contracts';
import { encodeRuntimeRequestAtVersion } from '@wbs/contracts';
import { matchesRuntimeReceipt, matchesRuntimeScope } from '@wbs/contracts';
import type { Claim } from '@wbs/domain';

import { readRuntimeAcceptanceScope } from '../../ports/runtime-command-records';

export { matchesRuntimeClaim } from '@wbs/contracts';

import type { ResourceAccess } from '../../ports/organization-access';
import type { Digest } from '../../ports/runtime';
import type { StoredRuntimeAcceptance } from '../../ports/runtime-command-values';
import type { RuntimeCommands } from './runtime-commands.resource';
import {
  canonicalRuntimeRequest,
  parseCanonicalRuntimeRequest,
  parseRuntimeAuthorityRequest,
  parseRuntimeLookup,
  parseRuntimeStateRequest,
} from './runtime-request';
import { digestRuntimeBasis, type RuntimeContext } from './runtime-state';

/** Detached authentication identities, captured synchronously before entering the UoW queue. */
export interface RuntimeAdmissionIdentity {
  readonly organizationId: string;
  readonly workPackageId: string;
  readonly personId: string;
  readonly actorId: string;
  /**
   * Detached verifier metadata captured before queuing; explicit undefined preserves
   * direct-context compatibility. Fresh admission applies its role policy before work package classification.
   */
  readonly authentication: CredentialAuthentication | undefined;
  readonly credential: CredentialPin | null;
}

/** Narrow borrowed capabilities; no public capture or nested unit of work. */
export interface RuntimeAdmission {
  readonly scope: RuntimeScope;
  readonly actorId: string;
  readonly commands: RuntimeCommands;
  readonly access: ResourceAccess;
  readonly credential: CredentialPin | null;
  observe(): Promise<RuntimeObservation>;
  listClaims(): Promise<Claim[]>;
  findClaim(claimId: string): Promise<Claim | null>;
}

export type RuntimeDecision<T> =
  Readonly<{ commit: true; value: T }> | Readonly<{ commit: false; value: T }>;

/** Composition resolves current permission/person/credential before invoking any receiver work. */
export interface RuntimeTransaction {
  run<T>(
    context: RuntimeContext,
    act: (admitted: RuntimeAdmission) => Promise<RuntimeDecision<T>>,
  ): Promise<T | RuntimeReadRefusal>;
}

/**
 * Reconciles accepted commands in the same admitted transaction as receiver CAS.
 * A historical success proves acceptance only; current grants come from readRuntimeState.
 */
export class RuntimeReceiver {
  constructor(
    private readonly transaction: RuntimeTransaction,
    private readonly digest: Digest,
  ) {}

  /** Only successful CAS and its immutable receipt commit; refusals never reserve an ID. */
  acquireRuntimeAuthority(
    context: RuntimeContext,
    candidate: RuntimeAuthorityRequest,
  ): Promise<RuntimeReply<AuthorityReceipt>> {
    // Proof: P3-12 omitted the copy; queued caller mutation redirected the pinned acquisition.
    const request = { ...parseRuntimeAuthorityRequest(candidate) };
    // Proof: P3-17 removed this check; a read-only credential received historical acquisition success.
    if (!context.actor.scopes.includes('write'))
      return Promise.resolve({ ok: false, error: 'insufficient_scope' });
    return this.transaction.run<RuntimeReply<AuthorityReceipt>>(context, async (admitted) => {
      const ledger = await admitted.commands.inspectLedger();
      // Proof: P3-02 removed this pin check; wrong-ledger replay became command conflict.
      if (ledger.ledgerId !== request.expectedLedgerId)
        return { commit: false, value: { ok: false, reason: 'runtime_ledger_mismatch' } };
      const canonicalRequest = canonicalRuntimeRequest(admitted.scope, {
        ...request,
        kind: 'authority',
      });
      const retained = await admitted.commands.readAcceptance(request.commandId);
      if (retained !== null) {
        await verifyRuntimeAcceptance(retained, ledger.ledgerId, this.digest);
        // Proof: P3-05 removed byte comparison; changed-owner retry received the old acceptance.
        // Proof: runtime-authority-changed-identity-refusal omitted retained authority byte equality; changed retry returned the old success; 'mounted migrated runtime1 changed command conflicts without rewriting original identity' failed and restored GREEN.
        // Proof: dash-native-changed-authority-identity: omitting exact retained authority request-byte equality.
        // 'native original1 changed grant requires exact identity conflict after cold deletion' failed; exact restoration passed.
        // The first mutant assertion is success versus refusal; restored cases check exact409/body/no-effects.
        if (
          retained.canonicalRequest !==
          // Proof: runtime-authority-retry-retained-format encoded a valid legacy authority retry as current2; 'mounted migrated runtime1 grant replay and lookup return original receipt without effects' failed and restored GREEN.
          encodeRuntimeRequestAtVersion(retained.schemaVersion, admitted.scope, {
            ...request,
            kind: 'authority',
          })
        )
          return { commit: false, value: { ok: false, reason: 'runtime_command_conflict' } };
        const receipt = retained.receipt;
        return {
          commit: true,
          value: {
            ok: true,
            value: {
              ...receipt,
              acceptance: { kind: 'authority', authority: receipt.acceptance.authority },
            },
          },
        };
      }
      await admitted.commands.assertAbsentHistory();
      // Proof: P3-06 removed the borrowed SQLite CAS guard; both racing initializations accepted.
      const authority = await admitted.commands.compareAuthority(
        request.expectedGeneration,
        request.ownerId,
      );
      if (authority === null)
        return { commit: false, value: { ok: false, reason: 'runtime_generation_conflict' } };
      const requestDigest = await this.digest.sha256(canonicalRequest);
      // Proof: runtime-authority-current-emission emitted authority receipt1; the current-only insertion boundary refused it; 'mounted current runtime authority writes canonical acceptance and receipt2 while body stays1' failed and restored GREEN.
      const receipt: AuthorityReceipt = {
        schemaVersion: 2,
        ledgerId: ledger.ledgerId,
        scope: admitted.scope,
        commandId: request.commandId,
        requestDigest,
        actorId: admitted.actorId,
        acceptance: { kind: 'authority', authority },
      };
      await admitted.commands.insertAcceptance({
        schemaVersion: 2,
        commandId: request.commandId,
        canonicalRequest,
        requestDigest,
        receipt,
      });
      return { commit: true, value: { ok: true, value: receipt } };
    });
  }

  /** Current authorization and the pinned intact ledger precede positive or absent reconciliation. */
  lookupRuntimeReceipt(
    context: RuntimeContext,
    candidate: Readonly<{ commandId: string; expectedLedgerId: string }>,
  ): Promise<RuntimeReply<RuntimeReceipt>> {
    // Proof: P3-18 omitted the copy; queued lookup used the caller's changed ID/pin.
    const request = { ...parseRuntimeLookup(candidate) };
    return this.transaction.run<RuntimeReply<RuntimeReceipt>>(context, async (admitted) => {
      const ledger = await admitted.commands.inspectLedger();
      // Proof: P3-03 removed this pin check; wrong-ledger lookup returned historical success.
      if (ledger.ledgerId !== request.expectedLedgerId)
        return { commit: false, value: { ok: false, reason: 'runtime_ledger_mismatch' } };
      const retained = await admitted.commands.readAcceptance(request.commandId);
      if (retained === null) {
        await admitted.commands.assertAbsentHistory();
        return { commit: false, value: { ok: false, reason: 'runtime_receipt_not_found' } };
      }
      await verifyRuntimeAcceptance(retained, ledger.ledgerId, this.digest);
      return { commit: true, value: { ok: true, value: retained.receipt } };
    });
  }

  /** Facts, basis, current grant and the requested person's claims share one coherent admission. */
  readRuntimeState(
    context: RuntimeContext,
    candidate: Readonly<{ expectedLedgerId?: string }>,
  ): Promise<RuntimeReply<RuntimeStateValue>> {
    // Proof: P3-19 omitted the copy; queued state read used the caller's changed ledger pin.
    const request = { ...parseRuntimeStateRequest(candidate) };
    return this.transaction.run<RuntimeReply<RuntimeStateValue>>(context, async (admitted) => {
      const ledger = await admitted.commands.inspectLedger();
      // Proof: P3-04 removed this pin check; wrong-ledger state returned local facts.
      if (request.expectedLedgerId !== undefined && ledger.ledgerId !== request.expectedLedgerId)
        return { commit: false, value: { ok: false, reason: 'runtime_ledger_mismatch' } };
      const authority = await admitted.commands.readAuthority();
      if (authority === null) await admitted.commands.assertAbsentHistory();
      const observation = await admitted.observe();
      const basis = await digestRuntimeBasis(
        {
          ledgerId: ledger.ledgerId,
          organizationId: admitted.scope.organizationId,
          workPackageId: admitted.scope.workPackageId,
          workPackageRevision: observation.workPackageRevision,
          workItems: observation.workItems,
        },
        this.digest,
      );
      const claims: RuntimeClaimInventory[] = [];
      for (const claim of await admitted.listClaims()) {
        // Proof: P3-11 omitted the person filter; the inventory included another person's claim.
        if (claim.personId !== admitted.scope.personId) continue;
        const binding = await admitted.commands.readBinding(claim.id);
        if (binding === null) claims.push({ kind: 'ordinary', claim });
        else {
          claims.push({ kind: 'runtime', claim, binding });
        }
      }
      return {
        commit: true,
        value: {
          ok: true,
          // Proof: runtime-state-current-emission emitted state1 with current fields; response consistency refused it; 'mounted current runtime state2 emits renamed scope with no retained writes' failed and restored GREEN.
          value: {
            schemaVersion: 2,
            ledgerId: ledger.ledgerId,
            scope: admitted.scope,
            basis,
            facts: {
              workPackageRevision: observation.workPackageRevision,
              workItems: observation.workItems,
              steps: observation.steps,
            },
            authority:
              authority === null ? { kind: 'uninitialized' } : { kind: 'held', ...authority },
            claims,
          },
        },
      };
    });
  }
}

/** Stored structure, canonical bytes, digest and request-derived success fields must agree. */
export async function verifyRuntimeAcceptance(
  stored: StoredRuntimeAcceptance,
  ledgerId: string,
  digest: Digest,
): Promise<void> {
  const canonical = parseCanonicalRuntimeRequest(stored.canonicalRequest);
  // Proof: 'receiver refuses runtime2 grant carrying canonical1 despite a matching original digest' accepted the coherent mismatch before this exact format correspondence; the inverse format has its own reached control.
  // Proof: runtime-receiver-format-correspondence omitted original envelope/canonical format correspondence in both directions; 'receiver refuses runtime2 grant carrying canonical1 despite a matching original digest'; 'receiver refuses runtime1 grant carrying canonical2 before receipt projection' failed and restored GREEN.
  if (
    encodeRuntimeRequestAtVersion(stored.schemaVersion, canonical.scope, canonical.operation) !==
    stored.canonicalRequest
  )
    throw new Error('runtime canonical acceptance format mismatch');
  const retainedScope = readRuntimeAcceptanceScope(stored);
  const request = canonical.operation;
  // Proof: P3-09 removed correspondence; five canonical scope/command/ledger corruptions resolved.
  if (
    request.expectedLedgerId !== ledgerId ||
    request.commandId !== stored.commandId ||
    !matchesRuntimeScope(canonical.scope, retainedScope)
  )
    throw new Error('runtime canonical receipt identity mismatch');
  // Proof: P3-07 removed this comparison; otherwise-consistent wrong-digest acquisition resolved.
  // Proof: runtime-receiver-original-string-digest hashed a current re-encoding instead of original retained bytes; 'receiver verifies genuine runtime1 grant using original bytes and original receipt' failed and restored GREEN.
  // Proof: runtime-receiver-digest-guard omitted original-string digest equality; 'receiver checks runtime1 grant digest against the original string' failed and restored GREEN.
  if ((await digest.sha256(stored.canonicalRequest)) !== stored.requestDigest)
    throw new Error('runtime canonical request digest mismatch');
  // Proof: P3-10 removed this check; corrupted authority and final claim/write receipt fixtures resolved.
  // Proof: bypassing this shared call made retained owner/generation/kind corruption resolve in the real receiver.
  if (!matchesRuntimeReceipt(canonical.scope, request, stored.requestDigest, stored.receipt))
    throw new Error('runtime request acceptance mismatch');
}
