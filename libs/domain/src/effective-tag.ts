import { effectiveLabelsOf } from './effective-label';

/**
 * A row of a plan, as far as the tags are concerned: its own id, its parent's,
 * and whatever tags somebody wrote on it.
 *
 * Structural rather than be-01's `LabelledWorkItem` or fe-01's `TreeRow`,
 * because the whole point of this module is that both read the same rule — the
 * argument `TeamsLabelled` makes, one dimension over.
 *
 * `tagIds` is a **set**, and an empty one is _unstated_ — the state that
 * inherits. There is deliberately no third "deliberately untagged" state, for
 * the reason there is none for teams (Dany, 2026-08-13, Q4): a second spelling
 * of "nobody has said" is a state every reader then has to handle twice.
 */
export interface TagsLabelled {
  id: string;
  parentId: string | null;
  tagIds: readonly string[];
}

/** What kind of thing a row is, and which row said so. */
export interface EffectiveTags {
  /**
   * The tags in force for this row, **whole**: the set the nearest stating row
   * carries, never a member of it.
   *
   * In the order the stating row carried them, which is the store's order —
   * `work_item_tag` is read by tag id, so two reads of an unchanged plan answer
   * the same array. Ordering for display belongs to whoever displays it.
   *
   * Never empty. A row with no non-empty set anywhere above it is absent from
   * the map instead, so "unstated" has one spelling here too.
   */
  tagIds: readonly string[];
  /**
   * The row that carries the set — this row itself, or the nearest ancestor
   * above it that states one.
   *
   * Carried rather than reduced to a boolean because the cell that shows an
   * inherited tag has to name where it came from: "regulatory — inherited from
   * 010 Compliance" is the sentence, and a `true` cannot say it. It is what
   * `plan-cards.tsx`'s `↳` chip reads.
   */
  fromId: string;
}

/** A `parentId` chain that runs in a circle, which is not a tree and has no ancestors. */
export class TagAncestryCycleError extends Error {
  override name = 'TagAncestryCycleError' as const;
  constructor(startedAt: string) {
    super(`the parent chain above ${startedAt} runs in a circle, so it has no nearest tag`);
  }
}

/**
 * Every row's effective tag set: its own, or the nearest ancestor's.
 *
 * The rule is `effectiveTeamsOf`'s, unchanged and deliberately so — R2's Q4,
 * confirmed there and not re-litigated here. Most-specific wins; override rather
 * than union; the ancestor's whole set rather than a member of it; unstated
 * spelled only as absence from the map. The walk is literally the same code, in
 * `effective-label.ts`, and every proof comment about its faults is there.
 *
 * **Per dimension, independently**, which is the property this function exists
 * to make true rather than to state: a row with tags and no teams inherits its
 * ancestor's teams and overrides its ancestor's tags, because the two dimensions
 * are two calls over two fields and neither reads the other.
 *
 * **What a tag is not:** nothing here is a pool and nothing here is a size. No
 * caller below `slicesOf` exists, `service/schedule.ts` has an empty diff in the
 * change that adds this, and a test wires the scheduler to read a tag and
 * watches every downstream date move to keep it that way. A team answers _who
 * does the work_ and the engine spends its capacity; a tag answers _what kind of
 * thing this is_ and the engine must never read it.
 *
 * @throws {TagAncestryCycleError} when the parent chain loops. Unknown is not
 * OK: a cycle has no nearest ancestor, so there is no set to fall back to and a
 * default would label a row with something nobody wrote on it.
 */
export function effectiveTagsOf(rows: readonly TagsLabelled[]): Map<string, EffectiveTags> {
  return effectiveLabelsOf(
    rows,
    (row) => row.tagIds,
    ({ labelIds, fromId }) => ({ tagIds: labelIds, fromId }),
    (startedAt) => new TagAncestryCycleError(startedAt),
  );
}
