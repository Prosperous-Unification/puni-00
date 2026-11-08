import {
  type PlanInputNormaliseFailure,
  readSavedConnectedScheduleBody,
  readSavedPlanInput,
  SavedHistoryError,
  validateSavedConnectedHistory,
  validateSavedConnectedTarget,
} from '@wbs/domain';

import type { Digest } from '../../ports/runtime';

/** Which of a saved plan's two sides a refusal is about. */
export type SavedPlanBodyKind = 'input' | 'schedule';

/** The UTF-8 byte length stored in saved-plan headers and used by quotas. */
export function bodyByteLength(bytes: string): number {
  return new TextEncoder().encode(bytes).length;
}

/**
 * Why a stored saved plan could not be handed back.
 *
 * Every case names the saved plan **and** the body, because the caller that
 * surfaces this has one plan open and two sides in front of it, and "this saved
 * plan is corrupt" tells a reader nothing about which half to distrust.
 *
 * These are refusals rather than repairs on purpose (R5): a hash that disagrees
 * with its bytes is not a value to fix up, and re-deriving either side would
 * produce a plan the product calls saved and nobody ever saved.
 */
export type SavedPlanIntegrityRefusal =
  | SavedPlanBodyInvalid
  | {
      readonly reason: 'body_missing';
      readonly savedPlanId: string;
      readonly body: SavedPlanBodyKind;
    }
  | {
      readonly reason: 'body_hash_mismatch';
      readonly savedPlanId: string;
      readonly body: SavedPlanBodyKind;
      /** The header's hash, as written beside the bytes. */
      readonly stored: string;
      /** SHA-256 over the bytes actually read back. */
      readonly recomputed: string;
    }
  | {
      /**
       * The stored dates were computed from an input that is not this record's.
       *
       * Distinct from `body_hash_mismatch` because **both bodies may be
       * perfectly intact**: each hashes to its own header column, and the fault
       * is in the *link* between them. A reader told "the schedule body is
       * corrupt" would go looking for damaged bytes that are not damaged.
       */
      readonly reason: 'schedule_input_mismatch';
      readonly savedPlanId: string;
      readonly body: 'schedule';
      /** The input hash the saved dates were computed from. */
      readonly scheduleInputSha256: string;
      /** The input hash this record actually holds. */
      readonly inputSha256: string;
    }
  | {
      /**
       * The input's bytes are intact and this reader cannot bring them forward.
       *
       * The fourth reason a stored plan cannot be handed back, and the only one
       * that is not about damage: every hash agrees, and
       * `normalisePlanInputForward` still refuses because the stored
       * `input_schema_version` is unparseable, newer than this build, or has no
       * upgrade step to the current one. It threw `PlanInputVersionError` out of
       * the compare path and Elysia answered **500** — an unmodelled crash for a
       * database state the code already anticipates, which R5 forbids. Gemini
       * F-02 on PR 202.
       *
       * `versionReason` is `PlanInputVersionError.reason` verbatim, because the
       * three cases are different operational facts: `from-the-future` means a
       * newer node wrote it and this one should be upgraded, `no-upgrade-path`
       * means the migration chain has a hole, and `not-a-version` means the
       * column holds something that was never a version.
       */
      readonly reason: 'input_version_unreadable';
      readonly savedPlanId: string;
      readonly body: 'input';
      /** The version stored beside the bytes. */
      readonly storedVersion: number;
      /** The version this build reads. */
      readonly readerVersion: number;
      readonly versionReason: PlanInputNormaliseFailure;
    };

/**
 * SHA-256 over a body's stored bytes, in the one encoding the writer used.
 *
 * The encoding is the **adapter's** to name, and both of them name `utf8` for
 * the reason `bodyByteLength` does: a digest taken over a different encoding of
 * the same string is a different digest, and a reader that guessed would refuse
 * every plan ever written.
 *
 * Asynchronous because the port is, and the port is because a browser's
 * `crypto.subtle.digest` is — see {@link Digest}.
 */
export function bodySha256(digest: Digest, bytes: string): Promise<string> {
  return digest.sha256(bytes);
}

/**
 * Recomputes one body's hash over the bytes read back and compares it.
 *
 * The comparison is against the bytes **this read obtained**, never against a
 * second rendering of a parsed value — a check that re-serialized first would
 * pass over a body whose stored bytes had been rewritten into something that
 * happens to parse the same way, which is most of what a partial write leaves
 * behind.
 *
 * An absent body is its own refusal rather than a mismatch against the empty
 * string: `saved_plan_body` has no row to be empty, so the two states are
 * distinguishable at the source and folding them would report a hash fault for
 * a row that a cascade deleted.
 */
export async function verifyBody(
  digest: Digest,
  savedPlanId: string,
  body: SavedPlanBodyKind,
  bytes: string | null,
  stored: string,
): Promise<SavedPlanIntegrityRefusal | null> {
  if (bytes === null) return { reason: 'body_missing', savedPlanId, body };
  const recomputed = await bodySha256(digest, bytes);
  if (recomputed === stored) return null;
  return { reason: 'body_hash_mismatch', savedPlanId, body, stored, recomputed };
}

/**
 * Checks that the saved dates were computed from the input stored beside them.
 *
 * Task 5.2. Two hashes that both verify against their own bytes still leave one
 * question open — whether these dates are *this plan's* dates — and the writer
 * answers it by storing the input hash it scheduled over. A reader that
 * rendered the schedule without checking would show a user dates belonging to
 * an input they can no longer see, which is worse than showing none.
 *
 * **This comparison only means anything because 2.4 makes both header columns
 * unrewritable.** If `schedule_input_sha256` could be `UPDATE`d, one statement
 * satisfies this check for a schedule computed from something else, and the
 * check becomes a comment about a column rather than a fact about the record.
 */
export function verifyScheduleLink(
  savedPlanId: string,
  scheduleInputSha256: string,
  inputSha256: string,
): SavedPlanIntegrityRefusal | null {
  if (scheduleInputSha256 === inputSha256) return null;
  return {
    reason: 'schedule_input_mismatch',
    savedPlanId,
    body: 'schedule',
    scheduleInputSha256,
    inputSha256,
  };
}

/**
 * The versions of each body this build knows how to read.
 *
 * A **set per side**, not the current constant, because the two clauses of task
 * 5.5 pull in opposite directions: a body written at version *n* has to keep
 * reading after the reader moves to *n+1*, and a version the reader has never
 * heard of has to fail loudly. Comparing against
 * `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` alone would satisfy the second clause by
 * breaking the first — every record written before the bump becomes unreadable
 * the moment the constant moves, which is the opposite of what a saved plan is
 * for. So the current constant is one member of these lists and a bump adds to
 * them rather than replacing them; removing a member is a deliberate decision
 * about records that already exist (design.md, "Cross-version diffs normalise
 * forward only").
 */
// Proof: omitting schema8 refused the real save/read module regression (regression-first.txt), 2026-10-17.
// Proof: omitting schema 9 made `saved plan compare names a change in a trio, a
// budget, a basis and the factor` (measure-export.controller.db.test.ts) answer
// 501 unsupported_body_version; watched 2026-10-23.
// Proof: omitting input10 made the mounted connected save/read return unsupported_body_version (2026-10-24).
export const SUPPORTED_INPUT_BODY_VERSIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const SUPPORTED_SCHEDULE_BODY_VERSIONS: readonly number[] = [1, 2];

/**
 * A stored body written under a schema version this build does not know.
 *
 * A **throw**, where 5.1b and 5.2 are typed refusals in the outcome union, and
 * the asymmetry is deliberate: those are facts about one record — this plan's
 * bytes are damaged, this plan's dates belong elsewhere — and a route maps them
 * to an answer about that plan. An unknown version is a fact about the *build*:
 * every record at that version is unreadable here, and the honest report is
 * that this reader is too old, not that one saved plan is broken. R5's rule
 * covers both: malformed trusted data is never defaulted away.
 */
export class UnknownSavedPlanBodyVersionError extends Error {
  constructor(
    readonly savedPlanId: string,
    readonly body: SavedPlanBodyKind,
    readonly version: number,
    readonly supported: readonly number[],
  ) {
    super(
      `saved plan ${savedPlanId}: ${body} body is at schema version ${String(version)}, ` +
        `which this reader does not know (knows ${supported.map(String).join(', ')})`,
    );
    this.name = 'UnknownSavedPlanBodyVersionError';
  }
}

/**
 * Throws unless the version is one this reader knows.
 *
 * `supported` is a parameter rather than read off the constants inside, so that
 * the rule itself — an older member passes, a stranger throws — is testable
 * without inventing a schema version that does not exist yet. The production
 * call sites pass the two lists above.
 */
export function assertKnownBodyVersion(
  savedPlanId: string,
  body: SavedPlanBodyKind,
  version: number,
  supported: readonly number[],
): void {
  if (supported.includes(version)) return;
  throw new UnknownSavedPlanBodyVersionError(savedPlanId, body, version, supported);
}

/** Intact bytes whose required captured structure or cross-body evidence is invalid. */
export interface SavedPlanBodyInvalid {
  readonly reason: 'body_invalid';
  readonly savedPlanId: string;
  readonly body: SavedPlanBodyKind;
  readonly path: string;
  readonly code: string;
}

/**
 * Semantic validation after hash/link checks. Legacy bodies retain their historical readers.
 * The resource invokes this only after stored hashes and schedule linkage have passed.
 */
export function verifySavedPlanBodies(
  savedPlanId: string,
  projectId: string,
  input: { readonly version: number; readonly bytes: string },
  schedule:
    | {
        readonly present: true;
        readonly version: number;
        readonly bytes: string;
        readonly algorithmId: string;
      }
    | { readonly present: false; readonly absentReason: string },
): SavedPlanIntegrityRefusal | null {
  assertKnownBodyVersion(savedPlanId, 'input', input.version, SUPPORTED_INPUT_BODY_VERSIONS);
  if (schedule.present)
    assertKnownBodyVersion(
      savedPlanId,
      'schedule',
      schedule.version,
      SUPPORTED_SCHEDULE_BODY_VERSIONS,
    );
  if (input.version < 10 && (!schedule.present || schedule.version === 1)) return null;
  let body: SavedPlanBodyKind = 'input';
  try {
    const parsed = readSavedPlanInput(JSON.parse(input.bytes), input.version);
    if (parsed.project.id !== projectId) throw new SavedHistoryError('target', '$.project.id');
    body = 'schedule';
    if (parsed.dependencyHistory.kind === 'connected' && schedule.present && schedule.version !== 2)
      throw new SavedHistoryError('connected_schedule_version', '$.version');
    const connected =
      schedule.present && schedule.version === 2
        ? readSavedConnectedScheduleBody(JSON.parse(schedule.bytes))
        : null;
    // Proof: omitting algorithm equality returned 200 for a mismatched retired header in mounted read/compare (2026-10-22).
    if (connected !== null && schedule.present && connected.algorithmId !== schedule.algorithmId)
      throw new SavedHistoryError('algorithm_identity', '$.algorithmId');
    // Proof: bypassing cross-body validation returned 200 for the mounted local-input/
    // connected-schedule fault (omit-cross-body-validation.log.txt).
    validateSavedConnectedHistory(
      parsed.dependencyHistory,
      connected === null ? null : connected.connection,
    );
    if (parsed.dependencyHistory.kind === 'connected' && !schedule.present) {
      const placement = parsed.dependencyHistory.placementState;
      const reason = placement.kind === 'unavailable' ? 'infeasible' : 'unavailable';
      // Proof: omission admitted cycle/unavailable and missing-calendar/infeasible header contradictions in mounted read/compare (2026-10-22).
      if (schedule.absentReason !== reason)
        throw new SavedHistoryError('absence_reason', '$.placementState');
    }
    // Proof: bypassing target validation returned 200 for missing target membership and
    // altered target placement in the mounted DB suite (omit-target-validation.log.txt).
    if (connected !== null && parsed.dependencyHistory.kind === 'connected')
      validateSavedConnectedTarget(parsed.dependencyHistory, connected, parsed.project.startDate);
    return null;
  } catch (cause) {
    if (cause instanceof SavedHistoryError)
      return { reason: 'body_invalid', savedPlanId, body, path: cause.path, code: cause.code };
    if (cause instanceof SyntaxError)
      return { reason: 'body_invalid', savedPlanId, body, path: '$', code: 'json' };
    throw cause;
  }
}
