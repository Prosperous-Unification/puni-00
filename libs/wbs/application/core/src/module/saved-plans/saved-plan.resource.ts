import { holdingRefusal, type SavedPlanQuota, type SavedPlanQuotaRefusal } from '@wbs/domain';

import type { Digest } from '../../ports/runtime';
import type {
  ResolvedPlanInputReads,
  SavedPlanCaptureStore,
} from '../../ports/saved-plan-capture-store';
import type {
  SavedPlanPrincipals,
  SavedPlanRow,
  SavedPlanStore,
  SavedPlanTouchOutcome,
  SavedPlanWrite,
  SavedPlanWriteOutcome,
  ScopedSavedPlanWrite,
  StoredSavedPlan,
} from '../../ports/saved-plan-store';
import { retainSavedPlanTouch, type SavedPlanTouchWrite } from '../../ports/saved-plan-store';
import type { SavedPlanIntegrityRefusal } from './saved-plan-integrity';
import {
  assertKnownBodyVersion,
  SUPPORTED_INPUT_BODY_VERSIONS,
  SUPPORTED_SCHEDULE_BODY_VERSIONS,
  verifyBody,
  verifySavedPlanBodies,
  verifyScheduleLink,
} from './saved-plan-integrity';
import type {
  SavedPlanListEntry,
  SavedPlanReadOutcome,
  SavedPlanReadSchedule,
  SavedPlanTouchResult,
  VerifiedSavedPlanOutcome,
} from './saved-plan-values';

/**
 * The repository's answer, in this layer's vocabulary.
 *
 * One function rather than a mapping written out at each of the two call sites,
 * because `no_such_plan` and `not_found` are the same fact under two names and a
 * second copy is how one of them ends up answering `snapshot_busy` as a 404.
 */
function touchResultOf(
  outcome: SavedPlanTouchOutcome,
  workPackageId: string,
): SavedPlanTouchResult {
  if (typeof outcome === 'object') return outcome;
  if (outcome === 'no_such_plan') return { outcome: 'not_found' };
  return outcome === 'touched' ? { outcome, workPackageId } : { outcome };
}

/** Legacy touches retain only the saved plan author's identity; package creator metadata grants no authority. */
export function mayTouchSavedPlan(principals: SavedPlanPrincipals, actorId: string): boolean {
  return principals.createdById === actorId;
}

/** Repository scopes and reading rules for a saved plan. */
export interface SavedPlanResourceOptions {
  readonly capture: SavedPlanCaptureStore;
  readonly plans: SavedPlanStore;
  readonly digest: Digest;
}

/** Projects detached headers in supplied order without reading bodies, rehashing or applying an integrity verdict. */
export function projectSavedPlanList(rows: readonly SavedPlanRow[]): SavedPlanListEntry[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    inputBytes: row.inputBytes,
    scheduleBytes: row.scheduleBytes,
    scheduleAbsentReason: row.scheduleAbsentReason,
  }));
}

/** Saved-plan persistence, integrity and touch authorization over one source. */
export class SavedPlanResource {
  constructor(private readonly opts: SavedPlanResourceOptions) {}

  /** Capture one detached and coherent live plan input. */
  capturePlan(workPackageId: string): Promise<ResolvedPlanInputReads | null> {
    return this.opts.capture.readPlanInput(workPackageId);
  }

  /** Read and verify saved bytes, preserving typed corruption refusals. */
  async readPlan(savedPlanId: string): Promise<SavedPlanReadOutcome> {
    return unwrapVerifiedPlan(await this.verifyPlan(savedPlanId));
  }

  /** Fetch once and verify original bytes once, retaining current identity evidence internally. */
  private async verifyPlan(savedPlanId: string): Promise<VerifiedSavedPlanOutcome> {
    const stored = await this.opts.plans.readOf(savedPlanId);
    // Proof (2026-09-27): forcing this guard false failed `reports a plan that
    // was never saved as absent, not as corrupt` (0 pass, 1 fail).
    if (stored === null) return { outcome: 'not_found' };
    return this.verifyStoredPlan(stored);
  }

  /** Verifies already detached exact stored bytes without acquiring a reader or revisiting authority. */
  async readStoredPlan(
    stored: StoredSavedPlan,
  ): Promise<Exclude<SavedPlanReadOutcome, { readonly outcome: 'not_found' }>> {
    const found = await this.verifyStoredPlan(stored);
    return found.outcome === 'verified' ? { outcome: 'read', plan: found.verified.plan } : found;
  }

  /** Original integrity/version validation precedes any identity projection; no reader is reacquired. */
  async verifyStoredPlan(
    stored: StoredSavedPlan,
  ): Promise<Exclude<VerifiedSavedPlanOutcome, { readonly outcome: 'not_found' }>> {
    const stepIdentity = structuredClone(stored.stepIdentity);
    const found = await readOfStored(this.opts.digest, stored);
    return found.outcome === 'read'
      ? { outcome: 'verified', verified: { plan: found.plan, stepIdentity } }
      : found;
  }

  /** Check work package scope from the header before reading or verifying bodies. */
  async readPlanForWorkPackage(
    workPackageId: string,
    savedPlanId: string,
  ): Promise<SavedPlanReadOutcome> {
    return unwrapVerifiedPlan(await this.verifyPlanForWorkPackage(workPackageId, savedPlanId));
  }

  /** Legacy comparison retains scope-before-bytes and the same single verifier as observed reads. */
  async verifyPlanForWorkPackage(
    workPackageId: string,
    savedPlanId: string,
  ): Promise<VerifiedSavedPlanOutcome> {
    const principals = await this.opts.plans.principalsOf(savedPlanId);
    // Proof (2026-09-27): bypassing this scope guard made the mounted corrupt
    // foreign-plan comparison answer 422 instead of 404 (0 pass, 1 fail).
    if (principals?.workPackageId !== workPackageId) return { outcome: 'not_found' };
    return this.verifyPlan(savedPlanId);
  }

  /** List headers in repository order without reading or checking bodies. */
  async listPlans(workPackageId: string): Promise<SavedPlanListEntry[]> {
    const rows = await this.opts.plans.listOf(workPackageId);
    return projectSavedPlanList(rows);
  }

  /** Keep the holding-quota check inside the repository write transaction. */
  writePlan(
    plan: SavedPlanWrite,
    quota: SavedPlanQuota,
    scoped?: ScopedSavedPlanWrite,
  ): Promise<SavedPlanWriteOutcome<SavedPlanQuotaRefusal>> {
    return this.opts.plans.write<SavedPlanQuotaRefusal>(
      plan,
      // Proof (2026-09-27): replacing this refusal with null made the
      // concurrent last-slot retry answer `saved` instead of `refused`
      // (`admits only one of two concurrent saves`, 0 pass, 1 fail).
      (holding, incoming) => Promise.resolve(holdingRefusal(holding, incoming, quota)),
      scoped,
    );
  }

  /** The work package a saved plan belongs to, read off its immutable header; null for an absent plan. */
  async workPackageOfPlan(savedPlanId: string): Promise<string | null> {
    return (await this.opts.plans.principalsOf(savedPlanId))?.workPackageId ?? null;
  }

  /** Check legacy principals here; a scoped writer rechecks them in its write transaction. */
  async renamePlan(
    savedPlanId: string,
    actorId: string,
    name: string,
    touch: SavedPlanTouchWrite,
  ): Promise<SavedPlanTouchResult> {
    touch = retainSavedPlanTouch(touch, 'rename', name);
    if (touch.actorId !== actorId)
      throw new Error('saved-plan touch actor differs from its caller');
    const scoped = 'kind' in touch ? undefined : touch;
    const checked = await this.refuseUnauthorisedTouch(savedPlanId, actorId, scoped);
    if ('refused' in checked) return checked.refused;
    return touchResultOf(
      await this.opts.plans.renameTo(savedPlanId, name, touch),
      checked.principals.workPackageId,
    );
  }

  /** Check legacy principals here; a scoped writer rechecks them in its write transaction. */
  async deletePlan(
    savedPlanId: string,
    actorId: string,
    touch: SavedPlanTouchWrite,
  ): Promise<SavedPlanTouchResult> {
    touch = retainSavedPlanTouch(touch, 'delete');
    if (touch.actorId !== actorId)
      throw new Error('saved-plan touch actor differs from its caller');
    const scoped = 'kind' in touch ? undefined : touch;
    const checked = await this.refuseUnauthorisedTouch(savedPlanId, actorId, scoped);
    if ('refused' in checked) return checked.refused;
    return touchResultOf(
      await this.opts.plans.deleteOf(savedPlanId, touch),
      checked.principals.workPackageId,
    );
  }

  /** Read immutable principals for announcement scope and legacy authorization. */
  private async refuseUnauthorisedTouch(
    savedPlanId: string,
    actorId: string,
    scoped?: ScopedSavedPlanWrite,
  ): Promise<{ refused: SavedPlanTouchResult } | { principals: SavedPlanPrincipals }> {
    const principals = await this.opts.plans.principalsOf(savedPlanId);
    // Proof (2026-09-27): forcing this guard false failed `answers not_found
    // for a plan that is not there` (0 pass, 1 fail).
    if (principals === null) return { refused: { outcome: 'not_found' } };
    // Proof (2026-09-27): bypassing this guard failed `refuses a third party,
    // and writes nothing` in the SQLite touch suite (0 pass, 1 fail).
    if (scoped === undefined && !mayTouchSavedPlan(principals, actorId))
      return { refused: { outcome: 'forbidden' } };
    return { principals };
  }
}

/** Keep the internal identity roster off raw detail and compatibility wire values. */
function unwrapVerifiedPlan(found: VerifiedSavedPlanOutcome): SavedPlanReadOutcome {
  return found.outcome === 'verified' ? { outcome: 'read', plan: found.verified.plan } : found;
}

/**
 * Verifies one stored saved plan and shapes it, or refuses it.
 *
 * A free function over {@link StoredSavedPlan} rather than a method, so the
 * whole verification is testable by handing it bytes — including the states a
 * database cannot easily be made to produce — while the service method above
 * stays the one line that fetches.
 *
 * The header decides which sides exist and the bodies are checked against it:
 * `schedule_sha256` is null exactly when no schedule was saved (the
 * `saved_plan_schedule_all_or_nothing` check makes that an invariant of the
 * table, not a hope), so an absent schedule is read off the header rather than
 * inferred from a missing body row. Inferring it the other way would turn a
 * body a cascade half-deleted into a legitimately schedule-less plan.
 */
async function readOfStored(
  digest: Digest,
  stored: StoredSavedPlan,
): Promise<Exclude<SavedPlanReadOutcome, { readonly outcome: 'not_found' }>> {
  const header = stored.header;
  // Task 5.5, and **before** the hash check on purpose: a body this reader
  // cannot parse is unreadable whether or not its bytes are intact, and
  // recomputing a digest first would answer a question nobody can act on.
  assertKnownBodyVersion(
    header.id,
    'input',
    header.inputSchemaVersion,
    SUPPORTED_INPUT_BODY_VERSIONS,
  );
  const inputRefusal = await verifyBody(
    digest,
    header.id,
    'input',
    stored.bodies.input,
    header.inputSha256,
  );
  // Proof (2026-09-27): bypassing this refusal made `refuses a body whose
  // stored bytes no longer hash to the header` answer `read` instead of
  // `corrupt` (0 pass, 1 fail).
  if (inputRefusal !== null) return { outcome: 'corrupt', refusal: inputRefusal };
  // Narrowed by the check above rather than asserted: `verifyBody` returns a
  // `body_missing` refusal for null, so reaching here means the bytes are there.
  const inputBytes = stored.bodies.input ?? '';

  const schedule = await scheduleOfStored(digest, stored);
  if (schedule.outcome === 'corrupt') return schedule;

  // Proof: omitting this call returned 200 for nine correctly hashed malformed-history
  // cases in saved-plan.controller.db.test.ts (omit-resource-validation.log.txt).
  const shapeRefusal = verifySavedPlanBodies(
    header.id,
    header.workPackageId,
    { version: header.inputSchemaVersion, bytes: inputBytes },
    schedule.schedule.present
      ? {
          present: true,
          version: schedule.schedule.body.schemaVersion,
          bytes: schedule.schedule.body.bytes,
          algorithmId: schedule.schedule.algorithmId,
        }
      : { present: false, absentReason: schedule.schedule.absentReason },
  );
  if (shapeRefusal !== null) return { outcome: 'corrupt', refusal: shapeRefusal };

  return {
    outcome: 'read',
    plan: {
      id: header.id,
      workPackageId: header.workPackageId,
      name: header.name,
      createdBy: header.createdBy,
      createdAt: header.createdAt,
      input: {
        schemaVersion: header.inputSchemaVersion,
        bytes: inputBytes,
        sha256: header.inputSha256,
      },
      schedule: schedule.schedule,
    },
  };
}

/** The schedule half of {@link readOfStored}, verified the same way. */
async function scheduleOfStored(
  digest: Digest,
  stored: StoredSavedPlan,
): Promise<
  | { outcome: 'ok'; schedule: SavedPlanReadSchedule }
  | { outcome: 'corrupt'; refusal: SavedPlanIntegrityRefusal }
> {
  const header = stored.header;
  if (
    header.scheduleSha256 === null ||
    header.scheduleSchemaVersion === null ||
    header.scheduleInputSha256 === null ||
    header.schedulerAlgorithmId === null
  ) {
    return {
      outcome: 'ok',
      // The check constraint makes this non-null whenever the four above are
      // null. `?? 'unavailable'` is the one default in this file and it is for
      // a row that could not have been written by this code; a reader that
      // threw here would refuse a plan over a reason string rather than over
      // anything about the plan's own bytes.
      schedule: { present: false, absentReason: header.scheduleAbsentReason ?? 'unavailable' },
    };
  }
  assertKnownBodyVersion(
    header.id,
    'schedule',
    header.scheduleSchemaVersion,
    SUPPORTED_SCHEDULE_BODY_VERSIONS,
  );
  const refusal = await verifyBody(
    digest,
    header.id,
    'schedule',
    stored.bodies.schedule,
    header.scheduleSha256,
  );
  if (refusal !== null) return { outcome: 'corrupt', refusal };
  // Task 5.2, and it runs **after** the byte check rather than instead of it:
  // the two answer different questions — whether the schedule body is the one
  // that was written, and whether the dates in it belong to this plan's input —
  // and a record can fail either with the other intact.
  const link = verifyScheduleLink(header.id, header.scheduleInputSha256, header.inputSha256);
  if (link !== null) return { outcome: 'corrupt', refusal: link };
  return {
    outcome: 'ok',
    schedule: {
      present: true,
      body: {
        schemaVersion: header.scheduleSchemaVersion,
        bytes: stored.bodies.schedule ?? '',
        sha256: header.scheduleSha256,
      },
      inputSha256: header.scheduleInputSha256,
      algorithmId: header.schedulerAlgorithmId,
    },
  };
}
