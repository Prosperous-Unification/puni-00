# Final days are whole days, rounded per step

Until 2026-08-30 a step's **final days** was a fraction — `2/3/10` was 4 days and `1/2/4`
was `13/6` — and `expectedDays`' own comment defended it: "Rounding here would compound
across a chain of forty work items into days that never existed." Dany's call that evening
is the opposite, and it is about what a plan **charges** rather than about what an estimate
**means**: a project now holds an **estimate rounding**, `ceil` unless it says otherwise,
applied to one step's combined figure — after the method has combined that step's three
points, and before anything is summed. A project also holds its own **PERT weights**, whose
sum is the divisor, so 1/4/1 is the textbook `/6` and 1/1/1 is a plain average.

## Considered Options

- **Round only for display.** Rejected: the schedule would then run on fractions the table
  does not show, and the whole point of one `finalDays` is that the bar the chart draws and
  the figure beside the trio are the same number. A table that disagrees with the dates
  printed next to it is the fault this codebase has spent two changes preventing.
- **Round the work item's total instead of each step.** Rejected by the request itself, and
  it is the weaker rule: two half-day steps are two days of somebody's week, and charging
  them as one is a plan that cannot be run. It is also the only order in which the answer
  depends on how the steps happen to be cut.
- **Three roundings and no way back to fractions.** Rejected after the tests were written.
  A fourth value, `exact`, keeps the arithmetic every plan had until this change: a team
  that genuinely plans in half days keeps its plan, the three identity oracles have an arm
  to replay on (as `anchor-slice` is for `DependencyReach`), and `snapWorkdays` and the
  calendar-boundary guards stay reachable by a real project rather than becoming checks
  nothing can fail.

## Consequences

- **Every existing project's numbers move on the release that carries this**, because the
  column default is `ceil` and reaches every stored row. That is the intent, not a
  migration accident, exactly as `dep_reach`'s default was.
- **A parent's final days is the sum of its descendants' charged figures**, not its
  rolled-up triple put through the method once (`rollUpFinals`). The two agreed while days
  were fractional — PERT is linear — and part company the moment a step is rounded: two
  children holding half a day each are charged a day apiece, and the old path would have
  said one day for the pair while both rows below it said one and the chart drew two.
- **A parent's rolled-up estimate and its final days are now different questions.** The
  trio is what its descendants _said_; the figure is what the plan _charges_. Both are on
  the wire, side by side, and a reader who adds the trio up by hand will not always get the
  figure.
- **The drift snap moved into the arithmetic.** A weighted average is a division, and
  `(0.4 + 4×1.1 + 1.2) / 6` is exactly 1 in arithmetic and `1.0000000000000002` in doubles.
  `ceil` of that is two days out of nothing, so `snapWorkdays` runs before the rounding —
  the same 1e-9 window `schedule-floor-and-drift` put on the calendar boundaries.
- **Weights are refused rather than defaulted, at both boundaries.** A triple that cannot
  average one — negative, non-finite, summing to zero — is a 422 on a request and a throw
  on a stored row, beside the refusals `estimate_method` and `dep_reach` already make
  there.
