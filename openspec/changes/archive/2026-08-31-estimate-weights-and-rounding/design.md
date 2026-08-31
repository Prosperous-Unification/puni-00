# design — `estimate-weights-and-rounding`

Seven decisions. The one that is hard to reverse — whole days, rounded per step —
is `docs/adr/0011-final-days-are-whole-days-rounded-per-step.md`; its rationale
is not repeated here.

## D1 — One value carries the whole arithmetic: `EstimateRule`

`finalDays(estimate, method)` becomes `finalDays(estimate, rule)`, where the
rule is `{ method, pertWeights, rounding }`. Three parameters would let a caller
pass a project's method with another project's weights, and the compiler would
say nothing; one value cannot be assembled wrong by accident, and the two
production call sites (`slicesOf`'s per-slice days and `finalsOf`'s per-step
figure) build it once from the project they are already holding.

`Project` keeps `estimateMethod` as its own field rather than becoming
`estimateRule: EstimateRule`. The method is on the wire, in the export header,
in the toolbar's `Plan with` control and in three identity fixtures; folding it
into a nested object is a rename across a surface this change has no business
touching, and the two new fields sit beside it as two more stored answers.

## D2 — A parent totals its descendants' rounded figures

Reverses the note beside `finalsOf`, which read: _"A parent's final figure is
its rolled-up totals put through the same method, not the sum of its children's
finals. For PERT the two agree (the weighting is linear)."_ That agreement is
what rounding ends. Two children each holding half a day are charged one day
each; their parent's summed triple is one day and would combine and round to
**1** while the two rows beneath it show 1 and 1, and while the chart draws two
whole days of work.

So `rollUpFinals` folds the per-step **rounded** figure with `+` through the
same `foldByStep` every other roll-up uses — one recursion, tested once. The
parent's `estimates` (its rolled-up trio) is unchanged and still the sum of the
triples: it is what its descendants **said**, and the final figure is what the
plan **charges**. The two now differ for a parent, and that is the honest
reading of a plan whose steps are billed whole.

## D3 — Four columns, not one JSON blob

`pert_weight_optimistic`, `pert_weight_realistic`, `pert_weight_pessimistic`
(REAL, defaulted 1/4/1) and `estimate_rounding` (TEXT, defaulted `ceil`). The
defaults are the migration: every existing row reads as the arithmetic it
already had for the weights, and as `ceil` for the rounding, which is the change
Dany asked for. A JSON column would need parsing on every read to answer "what
is the optimistic weight", and `estimate_method`'s own comment already records
why text a human can read beats an opaque encoding in this table.

## D4 — The drift snap runs before the rounding, not after

`(0.4 + 4×1.1 + 1.2) / 6` is exactly 1 and computes to `1.0000000000000002`.
`Math.ceil` of that is 2 — a day minted from the bits a division left behind,
on a plan whose author typed nothing like it. `snapWorkdays` (the same 1e-9
window `schedule-floor-and-drift` put on the calendar boundaries, and the same
reasoning: eight orders below a sixth of a day) runs first. It is the only new
guard on the arithmetic path and it has the negative to match — the estimate
above, watched.

## D5 — Where the setting is edited

Beside the steps, in `ProjectSettingsModal` — not beside the toolbar's `Plan
with` select. The evidence is `dep-reach-whole-item`, three weeks old: a
project-wide statement about **how the plan is computed** went into a settings
section rather than onto the toolbar, whose width is the scarce resource
(`project-config-modal`'s D5) and which already folded three such controls away.
The weights are a detail of a method, not a per-read choice, and a project sets
them once.

**The panel is written and tested; it is not mounted.** `EstimatingPanel` is
`PrioritiesPanel`'s shape — drafts for the three weights saved as one triple,
radios for the rounding that land on the click, `onDirtyChange`/`onDone` — and
`estimating-panel.test.tsx` covers it. What is missing is the two-file wiring:
`ProjectSettingsModal` gains a fourth section, and `wbs-table.tsx` passes it one
block of props. This change was forbidden to edit `wbs-table.tsx` — another
session held it open all evening — so task 8.2 is blocked rather than skipped,
and `verify.md` carries the exact patch.

## D6 — Two boundaries validate the weights, and the domain does not

The HTTP body takes three numbers with `minimum: 0`. That stops a negative
weight, and — **measured, not assumed** — it stops `1e999` too: TypeBox's number
is a finite one, so the only non-finite value JSON can express is refused as a
shape error rather than reaching the service. What no shape rule can say is "not
all three zero", which has no divisor at all, so `ProjectService.update` refuses
that as `bad_pert_weights` (422). `toProject` refuses the same triples coming
**out** of the database, where they are malformed trusted data and throw (R5),
beside the two refusals `estimate_method` and `dep_reach` already make there.

Both halves are asserted in `project.controller.test.ts` rather than reasoned
about, because a hand-written `>= 0` accepts `Infinity` and this codebase has
already paid for that once (`T1 column-widths-drag`).

`expectedDays` itself does **not** re-check its divisor. A throw there could
only fire on weights both boundaries refuse, which is a check whose negative
cannot be written on a production path — the fault class `AGENTS.md` counts
eighteen of. The precondition is on the type instead: `PertWeights` is parsed at
each boundary, and the JSDoc says where.

## D7 — A fourth rounding, `exact`, which nobody asked for

Dany named three roundings. A fourth value exists, and the reason is written
here rather than left to be discovered: `exact` charges the figure the method
produced, which is the arithmetic every plan in this tool had until this change.

It was added while slice 4 was being tested, and by the tests. Three identity
differentials replay captured oracles whose durations are `4.666666666666667`,
and no rounding reproduces those — replaying them on `ceil` would have measured
this change with a differential written about `capacity-per-project`,
`priority-bands` and a live plan. `anchor-slice` is the same shape of answer for
`DependencyReach`, one change earlier: the old rule stays expressible and the
oracle replays on it.

The second reason is R5's. Every guard below the schedule that exists for
fractional days — `snapWorkdays`, `firstWorkdayOf`, `lastWorkdayOf`, and the six
calendar tests `schedule-floor-and-drift` wrote — is reachable only by a plan
that carries a fraction. With three roundings and no fourth, no project could
carry one, and a shipped guard with its proofs would have become a check nothing
can fail. That is the fault this repo counts eighteen of.

And it is what a project that genuinely plans in half days keeps.
