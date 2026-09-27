/** The part of a captured tree {@link withSnappedRollUps} reads. */
interface CapturedTree {
  workItems: {
    rolledUp?: boolean;
    finalDays?: Record<string, number>;
    finalTotal?: number;
  }[];
}

/**
 * The window a charged figure may differ by and still be the same number: the
 * one {@link snapWorkdays} uses, eight orders of magnitude below a sixth of a
 * day.
 */
const REASSOCIATION = 1e-9;

/**
 * The same document with every **parent's** charged days snapped to
 * {@link REASSOCIATION}.
 *
 * Applied to both sides, and it exists for one arithmetic fact.
 * `estimate-weights-and-rounding` (2026-08-30) made a parent's `finalDays` the
 * sum of its descendants' charged figures where it used to be the parent's
 * rolled-up triple combined once. Under `exact` — the arm these oracles replay
 * on — the two are the same number in real arithmetic and differ in the last
 * bit of a double: one row in the 2026-08-13 corpus reads `8.166666666666668`
 * where the capture recorded `8.166666666666666`.
 *
 * Only a rolled-up row is touched, and only these two fields. A leaf's figure is
 * one combine either way and is still compared verbatim, as are every duration,
 * every offset and every date — so a plan that genuinely moved cannot pass
 * through this: 1e-9 of a day is 0.09 milliseconds.
 */
export function withSnappedRollUps(tree: Record<string, unknown>): Record<string, unknown> {
  const held = tree as unknown as CapturedTree;
  const snap = (days: number): number => Math.round(days / REASSOCIATION) * REASSOCIATION;
  return {
    ...tree,
    workItems: held.workItems.map((row) =>
      row.rolledUp !== true
        ? row
        : {
            ...row,
            finalDays: Object.fromEntries(
              Object.entries(row.finalDays ?? {}).map(([stepId, days]) => [stepId, snap(days)]),
            ),
            finalTotal: snap(row.finalTotal ?? 0),
          },
    ),
  };
}
