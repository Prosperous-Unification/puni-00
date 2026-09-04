import { createHash } from 'node:crypto';

/** Which of a saved plan's two sides a refusal is about. */
export type SavedPlanBodyKind = 'input' | 'schedule';

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
    };

/**
 * SHA-256 over a body's stored bytes, in the one encoding the writer used.
 *
 * `utf8` is named here for the same reason `bodyByteLength` names it: a digest
 * taken over a different encoding of the same string is a different digest, and
 * a reader that guessed would refuse every plan ever written.
 */
export function bodySha256(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
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
export function verifyBody(
  savedPlanId: string,
  body: SavedPlanBodyKind,
  bytes: string | null,
  stored: string,
): SavedPlanIntegrityRefusal | null {
  if (bytes === null) return { reason: 'body_missing', savedPlanId, body };
  const recomputed = bodySha256(bytes);
  if (recomputed === stored) return null;
  return { reason: 'body_hash_mismatch', savedPlanId, body, stored, recomputed };
}
