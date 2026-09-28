import type { Digest } from '../../ports/runtime';
import type { PlanInputReads, SavedPlanCaptureStore } from '../../ports/saved-plan-capture-store';
import type {
  SavedPlanPrincipals,
  SavedPlanStore,
  SavedPlanTouchOutcome,
  SavedPlanWrite,
  SavedPlanWriteOutcome,
  StoredSavedPlan,
} from '../../ports/saved-plan-store';
import type { SavedPlanQuota, SavedPlanQuotaRefusal } from '../../service/saved-plan-quota';
import { holdingRefusal } from '../../service/saved-plan-quota';
import type { SavedPlanIntegrityRefusal } from './saved-plan-integrity';
import {
  assertKnownBodyVersion,
  SUPPORTED_INPUT_BODY_VERSIONS,
  SUPPORTED_SCHEDULE_BODY_VERSIONS,
  verifyBody,
  verifyScheduleLink,
} from './saved-plan-integrity';
import type {
  SavedPlanListEntry,
  SavedPlanReadOutcome,
  SavedPlanReadSchedule,
  SavedPlanTouchResult,
} from './saved-plan-values';

/**
 * The repository's answer, in this layer's vocabulary.
 *
 * One function rather than a mapping written out at each of the two call sites,
 * because `no_such_plan` and `not_found` are the same fact under two names and a
 * second copy is how one of them ends up answering `snapshot_busy` as a 404.
 */
function touchResultOf(outcome: SavedPlanTouchOutcome, projectId: string): SavedPlanTouchResult {
  if (outcome === 'no_such_plan') return { outcome: 'not_found' };
  return outcome === 'touched' ? { outcome, projectId } : { outcome };
}

/**
 * Whether `actorId` may rename or delete the plan those principals describe.
 *
 * **Creator or project owner** (task 6.1, design.md A-8), written as the plain
 * disjunction it is. The "falls back to the project owner" half of A-8 is not a
 * second branch and must not be written as one: `createdById` is `null` exactly
 * when no live account claims the plan, `null` matches no actor id, and the
 * owner arm is then the only one that can be true. A ternary that chose *which*
 * id to compare would say something different and worse — it would stop the
 * owner touching a plan somebody else saved on their project.
 *
 * Exported for its test and for 6.2's matrix. It reads `createdById` and never
 * `createdBy`: the latter is a display name, and an actor id compared against a
 * display name is not a permission check — it is two accounts called "Ada"
 * sharing a right.
 */
export function mayTouchSavedPlan(principals: SavedPlanPrincipals, actorId: string): boolean {
  return principals.createdById === actorId || principals.projectOwnerId === actorId;
}

/** Repository scopes and reading rules for a saved plan. */
export interface SavedPlanResourceOptions {
  readonly capture: SavedPlanCaptureStore;
  readonly plans: SavedPlanStore;
  readonly digest: Digest;
}

/** Saved-plan persistence, integrity and touch authorization over one source. */
export class SavedPlanResource {
  constructor(private readonly opts: SavedPlanResourceOptions) {}

  /** Capture one detached and coherent live plan input. */
  capturePlan(projectId: string): Promise<PlanInputReads | null> {
    return this.opts.capture.readPlanInput(projectId);
  }

  /** Read and verify saved bytes, preserving typed corruption refusals. */
  async readPlan(savedPlanId: string): Promise<SavedPlanReadOutcome> {
    const stored = await this.opts.plans.readOf(savedPlanId);
    // Proof (2026-09-27): forcing this guard false failed `reports a plan that
    // was never saved as absent, not as corrupt` (0 pass, 1 fail).
    if (stored === null) return { outcome: 'not_found' };
    return readOfStored(this.opts.digest, stored);
  }

  /** Check project scope from the header before reading or verifying bodies. */
  async readPlanForProject(projectId: string, savedPlanId: string): Promise<SavedPlanReadOutcome> {
    const principals = await this.opts.plans.principalsOf(savedPlanId);
    // Proof (2026-09-27): bypassing this scope guard made the mounted corrupt
    // foreign-plan comparison answer 422 instead of 404 (0 pass, 1 fail).
    if (principals?.projectId !== projectId) return { outcome: 'not_found' };
    return this.readPlan(savedPlanId);
  }

  /** List headers in repository order without reading or checking bodies. */
  async listPlans(projectId: string): Promise<SavedPlanListEntry[]> {
    const rows = await this.opts.plans.listOf(projectId);
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

  /** Keep the holding-quota check inside the repository write transaction. */
  writePlan(
    plan: SavedPlanWrite,
    quota: SavedPlanQuota,
  ): Promise<SavedPlanWriteOutcome<SavedPlanQuotaRefusal>> {
    return this.opts.plans.write<SavedPlanQuotaRefusal>(
      plan,
      // Proof (2026-09-27): replacing this refusal with null made the
      // concurrent last-slot retry answer `saved` instead of `refused`
      // (`admits only one of two concurrent saves`, 0 pass, 1 fail).
      (holding, incoming) => Promise.resolve(holdingRefusal(holding, incoming, quota)),
    );
  }

  /** The project a saved plan belongs to, read off its immutable header; null for an absent plan. */
  async projectOfPlan(savedPlanId: string): Promise<string | null> {
    return (await this.opts.plans.principalsOf(savedPlanId))?.projectId ?? null;
  }

  /** Authorize from principal headers, so corrupt plans remain renameable. */
  async renamePlan(
    savedPlanId: string,
    actorId: string,
    name: string,
  ): Promise<SavedPlanTouchResult> {
    const checked = await this.refuseUnauthorisedTouch(savedPlanId, actorId);
    if ('refused' in checked) return checked.refused;
    return touchResultOf(
      await this.opts.plans.renameTo(savedPlanId, name),
      checked.principals.projectId,
    );
  }

  /** Authorize from principal headers, so corrupt plans remain deletable. */
  async deletePlan(savedPlanId: string, actorId: string): Promise<SavedPlanTouchResult> {
    const checked = await this.refuseUnauthorisedTouch(savedPlanId, actorId);
    if ('refused' in checked) return checked.refused;
    return touchResultOf(await this.opts.plans.deleteOf(savedPlanId), checked.principals.projectId);
  }

  /** Read the immutable principals once for both touch authorization and announcement scope. */
  private async refuseUnauthorisedTouch(
    savedPlanId: string,
    actorId: string,
  ): Promise<{ refused: SavedPlanTouchResult } | { principals: SavedPlanPrincipals }> {
    const principals = await this.opts.plans.principalsOf(savedPlanId);
    // Proof (2026-09-27): forcing this guard false failed `answers not_found
    // for a plan that is not there` (0 pass, 1 fail).
    if (principals === null) return { refused: { outcome: 'not_found' } };
    // Proof (2026-09-27): bypassing this guard failed `refuses a third party,
    // and writes nothing` in the SQLite touch suite (0 pass, 1 fail).
    if (!mayTouchSavedPlan(principals, actorId)) return { refused: { outcome: 'forbidden' } };
    return { principals };
  }
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
): Promise<SavedPlanReadOutcome> {
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

  return {
    outcome: 'read',
    plan: {
      id: header.id,
      projectId: header.projectId,
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
