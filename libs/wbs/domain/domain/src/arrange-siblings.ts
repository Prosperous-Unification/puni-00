import { POSITION_STEP } from './place-sibling';
import { siblingGroupsOf, treeOrder, type TreePlacement } from './tree-order';

/**
 * What an arrangement reads off a schedule: when each work item's first bar
 * begins, in the engine's fractional workdays.
 *
 * A map of projections rather than of bare numbers, so `Schedule['workItems']`
 * is passed straight in and nothing in between re-derives a start. Read-only
 * and structural, so the caller keeps the map the read already built.
 */
export type ScheduleStarts = ReadonlyMap<string, { readonly earliestStart: number }>;

/** One work item, at the position an arrangement gives it. */
export interface Repositioned {
  id: string;
  parentId: string | null;
  position: number;
}

/** What one press of `Arrange by schedule` writes. */
export interface Arrangement {
  /**
   * Every work item of every sibling group whose order changed, at its new
   * position — including the ones whose place in the group is unchanged, which
   * are respaced with the rest so one group is written as one set.
   *
   * Empty when the project already reads in schedule order, and that is the
   * whole of the no-op: no write, no journal entry, no broadcast.
   */
  placements: Repositioned[];
  /**
   * The ids whose **place among their siblings** changed — a strict subset of
   * {@link placements}.
   *
   * The two are separate for the reason `move` already separates them: a
   * position is storage detail and carries no `revision`, so respacing a
   * sibling that stayed put must not bump its revision and must not refuse a
   * peer's pending undo of something else on that row.
   */
  moved: string[];
}

/**
 * Every sibling group put in the order its bars start, at every depth.
 *
 * Pure, and given the whole project at once, because "which sibling starts
 * first" is a question about a group rather than about a work item. Groups
 * already in schedule order contribute nothing at all — the caller writes,
 * journals and announces only when something came back.
 *
 * **The sort is stable, and that is the tie rule.** Two siblings whose bars
 * start on the same day keep the order they already read in: they are equally
 * "next", and a second key — finish, slack, name — would move rows for a reason
 * the control's name does not state. `Array#sort` is stable by specification,
 * so the tie is kept by *not* adding a comparison rather than by making one.
 *
 * **Frozen work items are arranged like any other** (ADR 0023). A frozen number
 * is a name; it travels with its row and its unfrozen siblings step around the
 * label, which is {@link deriveNumbers}' business rather than this function's.
 *
 * Starts are compared exactly, in fractional workdays, never rounded: two bars
 * a fifth of a day apart are genuinely in an order, and rounding them together
 * would hand the tie rule a pair that is not tied.
 *
 * @throws if a work item has no scheduled start. be-01 cannot produce that
 * today — `projectOntoWorkItems` answers for every row or throws itself — but a
 * partial map is exactly the argument that would sort half a project to the
 * front under a default, and an absent start is not a start of zero.
 * @throws if a work item is unreachable from any root, through
 * {@link treeOrder}, which is also what makes the groups' own order the order
 * the project is drawn in rather than the caller's argument order.
 */
export function arrangeBySchedule(
  placements: readonly TreePlacement[],
  starts: ScheduleStarts,
): Arrangement {
  const order = treeOrder(placements);
  const groups = siblingGroupsOf(placements);

  const startOf = (id: string): number => {
    const projection = starts.get(id);
    if (projection === undefined) throw new Error(`no scheduled start for work item ${id}`);
    return projection.earliestStart;
  };
  // Roots first, then each parent where the project draws it, so one project
  // yields one arrangement whatever order its rows arrived in. Without this the
  // groups come back in `placements` order and the journal step — which is an
  // array — would differ between two callers holding the same plan.
  const placeOfParent = (parentId: string | null): number => {
    if (parentId === null) return -1;
    const place = order.get(parentId);
    if (place === undefined) throw new Error(`no tree place for parent ${parentId}`);
    return place;
  };

  const arrangement: Arrangement = { placements: [], moved: [] };
  const parents = [...groups.keys()].sort(
    (left, right) => placeOfParent(left) - placeOfParent(right),
  );

  for (const parentId of parents) {
    const group = groups.get(parentId) ?? [];
    const wanted = [...group].sort((left, right) => startOf(left.id) - startOf(right.id));
    if (wanted.every((each, at) => each.id === group[at]?.id)) continue;

    wanted.forEach((each, at) => {
      arrangement.placements.push({
        id: each.id,
        parentId: each.parentId,
        position: (at + 1) * POSITION_STEP,
      });
      if (each.id !== group[at]?.id) arrangement.moved.push(each.id);
    });
  }
  return arrangement;
}

/** The adjacent IEEE-754 value; infinities remain visible for the final allocation refusal. */
function advancePosition(position: number, isHigher: boolean): number {
  if (position === 0) return isHigher ? Number.MIN_VALUE : -Number.MIN_VALUE;
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, position);
  const bits = bytes.getBigUint64(0);
  bytes.setBigUint64(0, bits + (position > 0 === isHigher ? 1n : -1n));
  return bytes.getFloat64(0);
}

/** Check the actual reader ordering, including ADR 0016's valid position ties. */
function preservesSlots(wanted: readonly TreePlacement[]): boolean {
  const sorted = [...siblingGroupsOf(wanted).values()].flat();
  // Proof: removing finiteness admitted infinite placements beside both extreme
  // held anchors in arrange-siblings-in-slots.test.ts (2026-10-23).
  return wanted.every((row, at) => Number.isFinite(row.position) && sorted[at]?.id === row.id);
}

/**
 * Arrange eligible siblings within their slots in the complete tree. Ineligible
 * rows keep both their position and their ordinal place. Unique original positions
 * are reused exactly. Valid duplicate positions first reuse slots, then allocate
 * movable runs at the closest representable keys around immutable anchors, using
 * the reader's (position, id) ordering. Finite keys cannot represent every desired
 * permutation between equal anchors, so refusal is an expected, unwritten outcome.
 *
 * The ordinary {@link arrangeBySchedule} retains its legacy respacing semantics.
 * @throws for the same malformed eligible tree or absent starts as that function.
 */
export function arrangeInSlots(
  rows: readonly TreePlacement[],
  eligible: readonly TreePlacement[],
  starts: ScheduleStarts,
): { readonly ok: true; readonly arrangement: Arrangement } | { readonly ok: false } {
  const arrangement = arrangeBySchedule(eligible, starts);
  const eligibleIds = new Set(eligible.map((row) => row.id));
  const placements: TreePlacement[] = [];
  for (const [parentId, group] of siblingGroupsOf(rows)) {
    const desired = arrangement.placements.filter((row) => row.parentId === parentId);
    if (desired.length === 0) continue;
    const slots = group.filter((row) => eligibleIds.has(row.id));
    let ordinal = 0;
    const wanted = group.map((row) => {
      if (!eligibleIds.has(row.id)) return { ...row };
      const at = ordinal++;
      // Proof: retaining legacy respaced positions failed all three mounted
      // sparse/fractional/ID-tie slot cases (2026-10-23).
      return { ...desired[at], position: slots[at].position };
    });
    if (!preservesSlots(wanted)) {
      let start = 0;
      while (start < wanted.length) {
        if (!eligibleIds.has(wanted[start].id)) {
          start++;
          continue;
        }
        let end = start;
        while (end < wanted.length && eligibleIds.has(wanted[end].id)) end++;
        if (start > 0) {
          for (let at = start; at < end; at++) {
            const previous = wanted[at - 1];
            wanted[at].position =
              wanted[at].id > previous.id
                ? previous.position
                : advancePosition(previous.position, true);
          }
        } else if (end < wanted.length) {
          for (let at = end - 1; at >= start; at--) {
            const following = wanted[at + 1];
            wanted[at].position =
              wanted[at].id < following.id
                ? following.position
                : advancePosition(following.position, false);
          }
        } else {
          for (let at = start; at < end; at++) wanted[at].position = at + 1;
        }
        start = end;
      }
    }
    // Proof: removing this validation made the mounted equal-held-anchor case
    // return 200 instead of typed 409 and write an incorrect order (2026-10-23).
    if (!preservesSlots(wanted)) return { ok: false };
    placements.push(...wanted.filter((row) => eligibleIds.has(row.id)));
  }
  return { ok: true, arrangement: { placements, moved: arrangement.moved } };
}
