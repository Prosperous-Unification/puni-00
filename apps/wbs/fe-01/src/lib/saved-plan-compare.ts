import type {
  PlanDiffCategoryView,
  PlanDifferenceView,
  PlanDiffView,
  SavedPlanSideRef,
} from './saved-plan-api';

/** Whether both picker selections name the same plan. */
export function sameSide(left: SavedPlanSideRef, right: SavedPlanSideRef): boolean {
  if (left === 'current' || right === 'current') return left === right;
  return left.saved === right.saved;
}

/** The panel asks comparisons only between distinct selections. */
export function compareRefusal(
  left: SavedPlanSideRef,
  right: SavedPlanSideRef,
): 'same_side' | null {
  return sameSide(left, right) ? 'same_side' : null;
}

export const COMPARE_SAME_SIDE = 'Pick two different plans to compare.';

/**
 * Where a category sits in the rendered list.
 *
 * A `Record` over the union rather than an array, so a category added to
 * `PlanDiffCategory` in `libs/wbs/domain/domain` is a **type error here** rather than a
 * difference that silently sorts to the end. The order is structure first
 * (what rows exist, then how they are arranged), then the numbers, then the
 * labels, then everything a plan carries about who and when, with `other` last
 * because it is the one bucket whose contents are not known in advance.
 */
const CATEGORY_RANK: Record<PlanDiffCategoryView, number> = {
  added: 0,
  removed: 1,
  renamed: 2,
  reparented: 3,
  reordered: 4,
  estimates: 5,
  uncertainty: 6,
  actuals: 7,
  progress: 8,
  measures: 9,
  dates: 10,
  dependencies: 11,
  'max-parallel': 12,
  'start-no-earlier-than': 13,
  freeze: 14,
  priority: 15,
  'priority-bands': 16,
  ownership: 17,
  'service-assignment': 18,
  capacity: 19,
  type: 20,
  tags: 21,
  registry: 22,
  settings: 23,
  'external-references': 24,
  notes: 25,
  other: 26,
};

/** Every category this build renders, in rendered order. Derived, never written twice. */
export const CATEGORY_ORDER: readonly PlanDiffCategoryView[] = Object.keys(CATEGORY_RANK)
  .map((category) => category as PlanDiffCategoryView)
  .sort((a, b) => CATEGORY_RANK[a] - CATEGORY_RANK[b]);

/** One rendered group: a category and the differences filed under it. */
export interface DiffCategoryGroup {
  readonly category: PlanDiffCategoryView;
  readonly differences: readonly PlanDifferenceView[];
}

/**
 * The differences of one half, grouped by category in {@link CATEGORY_ORDER}.
 *
 * Empty categories are dropped rather than rendered as "no changes": a
 * comparison of two plans that differ in three fields should be three lines,
 * not three lines inside twenty-six headings. Within a group the differences
 * keep the order the diff produced them in, which is the walk order of the
 * side — stable across two calls over the same bytes.
 *
 * A category outside the union cannot occur (be-01 emits the union), but if one
 * ever did it would sort *before* `added` under a `?? -1` and lead the list. It
 * is filed under `other` instead, which is the bucket that already means "this
 * differed and we have no better heading for it".
 */
export function groupByCategory(
  differences: readonly PlanDifferenceView[],
): readonly DiffCategoryGroup[] {
  const byCategory = new Map<PlanDiffCategoryView, PlanDifferenceView[]>();
  for (const difference of differences) {
    const category = Object.hasOwn(CATEGORY_RANK, difference.category)
      ? difference.category
      : 'other';
    const bucket = byCategory.get(category);
    if (bucket === undefined) byCategory.set(category, [difference]);
    else bucket.push(difference);
  }
  return CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
    category,
    differences: byCategory.get(category) ?? [],
  }));
}

/** True when a comparison found nothing in either half — mirrors `planDiffIsEmpty`. */
export function diffIsEmpty(diff: PlanDiffView): boolean {
  return diff.input.length === 0 && diff.schedule.length === 0;
}

/** Longest a single side's text may run before it is clipped. */
const MAX_VALUE_CHARS = 80;

const clip = (text: string): string =>
  text.length <= MAX_VALUE_CHARS ? text : `${text.slice(0, MAX_VALUE_CHARS)}…`;

/** `no fields` / `1 field` / `4 fields`, without an English plural rule at each call site. */
const countWords = (count: number, one: string, many: string): string => {
  if (count === 0) return `no ${many}`;
  return `${String(count)} ${count === 1 ? one : many}`;
};

/**
 * One side of a difference, as a phrase short enough to sit on the line beside
 * its path.
 *
 * `PlanDifference.left` and `.right` are `unknown` because `diffPlans` walks the
 * two sides structurally: a leaf is whatever the plan stored there, and an
 * `added`/`removed` row is the whole row object. So this has to answer for four
 * kinds of value, and the rule is **scalars exactly, composites by shape**.
 *
 * - A scalar is the thing the reader came for. `workItems[w1].name` is only
 *   worth rendering because `"Design" → "Design v2"` is the change; the path on
 *   its own names a field and reports nothing about it.
 * - A composite is rendered as `4 fields` / `2 entries` rather than as its JSON.
 *   A serialised work item is longer than the panel and would push every other
 *   difference off the screen, and a JSON string clipped mid-object is worse
 *   than a count: it looks like data and is not parseable as any. The category
 *   heading already says `added` or `removed` and the path already names the
 *   row, so the count is the only part not said twice. Naming a composite's own
 *   changed fields is a different feature — the walk would have to descend, and
 *   `diffPlans` deliberately does not descend into an added row.
 *
 * **`absent` and `none` are two different facts, not one hedged one.** A field
 * missing from a side reads `absent` (`undefined`: the row does not carry it,
 * which is every `added`/`removed` counterpart and every field one side never
 * had); a field the side carries with an empty value reads `none` (`null`, which
 * `scheduleAbsentReason` and friends store on purpose). Collapsing them would
 * report a deleted field and a cleared field as the same change.
 *
 * Long strings are clipped at {@link MAX_VALUE_CHARS} with an ellipsis INSIDE
 * the quotes, so a clipped note cannot be read as the whole stored note.
 */
export function diffValueWords(value: unknown): string {
  if (value === undefined) return 'absent';
  if (value === null) return 'none';
  if (typeof value === 'string') return `"${clip(value)}"`;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) return countWords(value.length, 'entry', 'entries');
  if (typeof value === 'object') return countWords(Object.keys(value).length, 'field', 'fields');
  // Nothing a JSON body can hold reaches here; a function or a symbol would.
  // Said rather than thrown: a comparison must still draw its other rows.
  return 'a value';
}
