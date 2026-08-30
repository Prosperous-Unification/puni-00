# design — `estimate-weights-and-rounding`

Six decisions. The one that is hard to reverse — whole days, rounded per step —
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

**This half is not implemented here.** The panel is mounted by
`wbs-table.tsx`, which another session held open for the whole of this change;
task 8 carries the exact wiring and is the only slice left. Everything below the
wire — the columns, the arithmetic, the refusals, the payload and the client
method — is done and tested.

## D6 — Two boundaries validate the weights, and the domain does not

The HTTP body takes three numbers with `minimum: 0`, which stops a negative
weight; `1e999` parses to `Infinity`, passes that minimum, and is refused by
`ProjectService.update` as `bad_pert_weights` (422) together with three zeroes,
which have no divisor. `toProject` refuses the same values coming **out** of the
database, where they are malformed trusted data and throw (R5), beside the two
refusals `estimate_method` and `dep_reach` already make there.

`expectedDays` itself does **not** re-check its divisor. A throw there could
only fire on weights both boundaries refuse, which is a check whose negative
cannot be written on a production path — the fault class `AGENTS.md` counts
eighteen of. The precondition is on the type instead: `PertWeights` is parsed at
each boundary, and the JSDoc says where.
