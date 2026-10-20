/**
 * The grouping every projection of a plan's slices starts from: one leaf, its
 * own slices, in the order the caller handed them over.
 *
 * Here rather than inside `schedule()` for `slice-edges.ts`'s reason. An edge
 * this file's neighbour emits names its ends by leaf and **position**, and the
 * solver request builder turns a position into a `sliceKey` by reading the
 * slice at it — so the builder and `schedule()` must group identically or the
 * two disagree about which slice an edge touches, silently, in a request Bun
 * itself wrote. One grouping, called by both.
 *
 * `schedule()` still owns the running `offsets` it builds on top of this: those
 * are `durationOf`'s, which is the calendar's arithmetic, and the wire carries
 * `durationUnits` instead.
 */

/**
 * The half of a `Slice` the grouping reads.
 *
 * Named structurally rather than imported, for `leaf-constraints.ts`'s reason:
 * `Slice` is `schedule.ts`'s type and `schedule.ts` imports this module.
 */
export interface GroupableSlice {
  readonly workItemId: string;
  readonly width: number;
  /** `Slice.demands`: each resource once, in id order, at whole units from 1. */
  readonly demands?: readonly { readonly resourceId: string; readonly units: number }[];
}

/**
 * The slices grouped by the leaf they belong to, in the order they were handed
 * over — which is the project's step order, and therefore the order they run in.
 *
 * Throws on a slice for something that is not a leaf of `rows`. A parent has no
 * work of its own and a work item from another project has no place in this
 * graph at all; scheduling either would be answering a question about a plan
 * that was not asked for. R5: this is malformed input, not a missing default.
 *
 * Proof: with the check removed, `refuses a slice for a work item that is not a
 * leaf` gets a schedule back in which the parent has become a node of its own
 * and its span no longer covers its children; watched 2026-08-09.
 *
 * Generic over the slice type only so the caller gets its own back — the two
 * refusals read `workItemId` and `width` and nothing else.
 */
export function groupSlicesByLeaf<S extends GroupableSlice>(
  leafIds: readonly string[],
  slices: readonly S[],
): Map<string, S[]> {
  const leaves = new Set(leafIds);
  const grouped = new Map<string, S[]>();
  for (const slice of slices) {
    if (!leaves.has(slice.workItemId)) {
      throw new Error(`slice for ${slice.workItemId}, which is not a leaf of this project`);
    }
    // A width is people, and the smallest number of people that can do work is
    // one. Refused **here**, at the boundary the slices enter the engine
    // through, because `durationOf` divides by it: a width of 0 is `Infinity`
    // days for a slice with effort and `NaN` for one without, and neither is
    // refused anywhere downstream — `windowFor` short-circuits on a zero width
    // and reserves nothing, `CapacityTooNarrowError` does not fire because
    // `0 > 0` is false, and the plan comes back with every date `Infinity` and
    // nothing to say why. R5: malformed trusted data throws rather than being
    // divided by.
    //
    // Unreachable through the API as of this change — both write paths refuse a
    // 0 — which is exactly why it is here rather than nowhere: this engine
    // refuses the impossible at its own boundary, and a validation that is the
    // *only* guard is one schema edit away from not being one. Named as the
    // open P2 of PR #48's cross-review.
    //
    // Proof: this check deleted and `refuses a slice claiming no people at all`
    // failed — the plan came back with `duration: Infinity`,
    // `earliestFinish: Infinity`, `latestStart: NaN` and `float: NaN`, and no
    // refusal anywhere. Deleted again for `refuses a width that is not a whole
    // number of people`, which came back with `duration: 2.4` — six days over
    // two and a half people. Both watched 2026-08-12.
    if (!Number.isInteger(slice.width) || slice.width < 1) {
      throw new Error(
        `slice for ${slice.workItemId} claims a width of ${String(slice.width)}: ` +
          `a width is people, and duration is effort divided by it`,
      );
    }
    refuseMalformedDemands(slice);
    const group = grouped.get(slice.workItemId);
    if (group === undefined) grouped.set(slice.workItemId, [slice]);
    else group.push(slice);
  }
  return grouped;
}

/**
 * Refuses a slice's demand vector unless every resource appears once, in byte
 * order of its id, at a whole number of units from 1 (`wbs-resources` R5).
 *
 * Here for the width check's reason: this is the boundary both `schedule()`
 * and the canonicalizer read slices through, so a vector the engine refuses
 * never gets a cache key. A unit below 1 would reserve nothing and wait for
 * nothing — a demand silently not applied — and a resource named twice would
 * be charged twice by the reservation and once by the canonical string. The
 * order is required rather than sorted here because the canonical string
 * carries the vector as given, and two orders of one set would be two hashes
 * of one plan.
 *
 * Proof: with the call removed, `refuses a demand below one unit, a resource
 * named twice and an unsorted vector` (schedule-resources.test.ts) failed on
 * `Received function did not throw`; watched 2026-10-20.
 */
function refuseMalformedDemands(slice: GroupableSlice): void {
  let previous: string | null = null;
  for (const { resourceId, units } of slice.demands ?? []) {
    if (!Number.isInteger(units) || units < 1) {
      throw new Error(
        `slice for ${slice.workItemId} demands ${String(units)} of resource ${resourceId}: ` +
          `a demand is whole units from 1`,
      );
    }
    if (previous !== null && !(previous < resourceId)) {
      throw new Error(
        `slice for ${slice.workItemId} names resource ${resourceId} out of order or twice: ` +
          `a demand vector is each resource once, in id order`,
      );
    }
    previous = resourceId;
  }
}
