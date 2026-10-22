import type {
  AuthorityReceipt,
  CredentialPair,
  RuntimeAuthorityRequest,
  RuntimeClaim,
  RuntimeClaimInventory,
  RuntimeObservation,
  RuntimeOperation,
  RuntimeReadRefusal,
  RuntimeReceipt,
  RuntimeReply,
  RuntimeScope,
  RuntimeState as RuntimeStateValue,
} from '@wbs/contracts';
import type { Claim } from '@wbs/domain';

import type { ResourceAccess } from '../../ports/organization-access';
import type { Digest } from '../../ports/runtime';
import type {
  RuntimeCommandStore,
  StoredRuntimeAcceptance,
} from '../../ports/runtime-command-store';
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
  readonly projectId: string;
  readonly personId: string;
  readonly actorId: string;
  readonly credential: CredentialPair | null;
}

/** Narrow borrowed capabilities; no public capture or nested unit of work. */
export interface RuntimeAdmission {
  readonly scope: RuntimeScope;
  readonly actorId: string;
  readonly commands: RuntimeCommandStore;
  readonly access: ResourceAccess;
  readonly credential: CredentialPair | null;
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

function matchesScope(left: RuntimeScope, right: RuntimeScope): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.projectId === right.projectId &&
    left.personId === right.personId
  );
}
/** Exact immutable target/execution equality for both binding admission and trusted receipt correspondence. */
export function matchesRuntimeClaim(left: RuntimeClaim, right: RuntimeClaim): boolean {
  return (
    // Proof: P5-08–15 omitted each comparison; the isolated corrupt borrowed-binding production request accepted.
    left.claimId === right.claimId &&
    left.workItemId === right.workItemId &&
    left.stepId === right.stepId &&
    left.parentClaimId === right.parentClaimId &&
    left.execution.storeId === right.execution.storeId &&
    left.execution.runId === right.execution.runId &&
    left.execution.attemptId === right.execution.attemptId &&
    left.execution.sessionId === right.execution.sessionId
  );
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
      const retained = await admitted.commands.readAcceptance(admitted.scope, request.commandId);
      if (retained !== null) {
        await verifyRuntimeAcceptance(retained, ledger.ledgerId, this.digest);
        // Proof: P3-05 removed byte comparison; changed-owner retry received the old acceptance.
        if (retained.canonicalRequest !== canonicalRequest)
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
        admitted.scope,
        request.expectedGeneration,
        request.ownerId,
      );
      if (authority === null)
        return { commit: false, value: { ok: false, reason: 'runtime_generation_conflict' } };
      const requestDigest = await this.digest.sha256(canonicalRequest);
      const receipt: AuthorityReceipt = {
        schemaVersion: 1,
        ledgerId: ledger.ledgerId,
        scope: admitted.scope,
        commandId: request.commandId,
        requestDigest,
        actorId: admitted.actorId,
        acceptance: { kind: 'authority', authority },
      };
      await admitted.commands.insertAcceptance({
        schemaVersion: 1,
        scope: admitted.scope,
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
      const retained = await admitted.commands.readAcceptance(admitted.scope, request.commandId);
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
      const authority = await admitted.commands.readAuthority(admitted.scope);
      if (authority === null) await admitted.commands.assertAbsentHistory();
      const observation = await admitted.observe();
      const basis = await digestRuntimeBasis(
        {
          ledgerId: ledger.ledgerId,
          organizationId: admitted.scope.organizationId,
          projectId: admitted.scope.projectId,
          projectRevision: observation.projectRevision,
          workItems: observation.workItems,
        },
        this.digest,
      );
      const claims: RuntimeClaimInventory[] = [];
      for (const claim of await admitted.listClaims()) {
        // Proof: P3-11 omitted the person filter; the inventory included another person's claim.
        if (claim.personId !== admitted.scope.personId) continue;
        const binding = await admitted.commands.readBinding(admitted.scope, claim.id);
        if (binding === null) claims.push({ kind: 'ordinary', claim });
        else {
          claims.push({ kind: 'runtime', claim, binding });
        }
      }
      return {
        commit: true,
        value: {
          ok: true,
          value: {
            schemaVersion: 1,
            ledgerId: ledger.ledgerId,
            scope: admitted.scope,
            basis,
            facts: {
              projectRevision: observation.projectRevision,
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
  const request = canonical.operation;
  // Proof: P3-09 removed correspondence; five canonical scope/command/ledger corruptions resolved.
  if (
    request.expectedLedgerId !== ledgerId ||
    request.commandId !== stored.commandId ||
    !matchesScope(canonical.scope, stored.scope)
  )
    throw new Error('runtime canonical receipt identity mismatch');
  // Proof: P3-07 removed this comparison; otherwise-consistent wrong-digest acquisition resolved.
  if ((await digest.sha256(stored.canonicalRequest)) !== stored.requestDigest)
    throw new Error('runtime canonical request digest mismatch');
  // Proof: P3-10 removed this check; corrupted authority and final claim/write receipt fixtures resolved.
  if (!matchesAcceptance(request, stored.receipt))
    throw new Error('runtime request acceptance mismatch');
}

function matchesAcceptance(request: RuntimeOperation, receipt: RuntimeReceipt): boolean {
  const accepted = receipt.acceptance;
  if ('kind' in request)
    return (
      accepted.kind === 'authority' &&
      accepted.authority.ownerId === request.ownerId &&
      accepted.authority.generation ===
        (request.expectedGeneration === null ? 1 : request.expectedGeneration + 1)
    );
  if (
    accepted.kind === 'authority' ||
    accepted.kind !== request.action.kind ||
    accepted.authority.ownerId !== request.authority.ownerId ||
    accepted.authority.generation !== request.authority.generation
  )
    return false;
  const action = request.action;
  if (action.kind === 'claim')
    return matchesRuntimeClaim(
      {
        claimId: accepted.claim.claimId,
        workItemId: action.workItemId,
        stepId: action.stepId,
        parentClaimId: action.parentClaimId,
        execution: action.execution,
      },
      accepted.claim,
    );
  return (
    accepted.kind === 'write' &&
    matchesRuntimeClaim(action.claim, accepted.claim) &&
    accepted.applied.length === action.commands.length &&
    accepted.applied.every(
      (command, index) => command.index === index && command.kind === action.commands[index]?.kind,
    )
  );
}
