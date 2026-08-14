# verify — `chart-clamp-words`

Branch `change/chart-clamp-words`, cut from `main` @ `60172be` (#59, #61, #60 all
merged) on 2026-08-14. PR: filled in below, with the CI run that judged it.

**Run under the PoC-mode contract of 2026-08-14** — Dany's call that delivery,
not testing, is what has been slow. No `design.md`, no citation table, no
watched red per behaviour for copy, and **CI is the gate of record** rather than
a full local run. What follows is deliberately short; §"What the lighter
contract cost" at the end is the experiment's own data.

## Wall clock

| moment                     | UTC                     |
| -------------------------- | ----------------------- |
| branch cut, first read     | 2026-08-14 12:54        |
| code and tests written     | 2026-08-14 13:00        |
| first `nx affected` run    | 2026-08-14 13:02 (red)  |
| green `nx affected` run    | 2026-08-14 13:06        |
| PR open                    | 2026-08-14 13:1x        |

**Branch cut to PR open: 16 minutes.** Roughly 7 of them were code and tests
(the two functions, the two panel tests, the `docs/capacity.md` paragraph), and
roughly 9 were record and gate — `proposal.md`, `tasks.md`, the delta spec, this
file, and the two h2puni runs. The single largest cost was neither: it was
**reading** `gantt-panel.tsx`, `gantt-geometry.ts`, `work-item.service.ts` and
`docs/capacity.md` far enough to know that `width` **is** the team's size
wherever the new line prints.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` on **h2puni**, in
`/home/puni1/wd/puni/wt-chart-clamp` (a worktree of `/home/puni1/wbs-reds`),
bun 1.2.20. Nothing was compiled or tested on h1claw.

| run                                       | result                                                     |
| ----------------------------------------- | ---------------------------------------------------------- |
| affected projects (`nx show projects`)     | **fe-01** alone                                            |
| `nx affected -t test lint typecheck` (1st) | **1 failed, 1339 passed** — see the red below              |
| `nx affected -t test lint typecheck` (2nd) | **1340 passed, 52 files**, lint and typecheck clean, 61.0s |
| `nx format:check --base=origin/main`       | clean, exit 0                                              |
| `openspec validate --all`                  | **47 items, 47 passed, 0 failed**                          |

be-01 is not affected and was not run: nothing outside `apps/fe-01`, `docs/` and
`openspec/` is touched. The **full** gate (`run-many`, e2e, secrets, doc caps)
was not run here by contract — CI below is the gate of record.

## CI

_Written after the run; this section is the gate of record._

## The one red, watched

Not injected. The first `nx affected` run caught it, and it is a real payload
gap this change's own line exposed:

| test                                                                   | what it did                                                                                                    | observed                                                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `redraws the open chart when a not-before edit moves the schedule` | `clampWords` reached a bar whose `maxParallel` is `undefined` — the fake omits the field — and formatted it | **1 failed, 1339 passed.** `TypeError: Cannot read properties of undefined (reading 'toFixed')` at `daysNumber` ← `clampWords` ← `barFacts`, the `GanttFaultBoundary` replacing the whole chart, and `expected undefined to be '11'` |

`apiWithMovableFloor` in `wbs-table.test.tsx` builds a `workItems[0]` with no
`maxParallel`, against a `WorkItemView.maxParallel: number` that be-01 always
sends — the exact trap the fake's own `teamCapacities` comment warns about, two
fields over. `parallelWords` has been quietly silent on that payload since C3
(`undefined > 1` is false); this line was not, because `width >= undefined` is
false too and the format then ran.

**The fix taken:** `clampWords` declines to print where `maxParallel` is not a
finite number. A missing hover line is proportionate to a missing number; a
thrown chart is not. **The fix not taken:** `maxParallel: 1` in the fake.
`wbs-table.tsx` and its test were another agent's file this afternoon (the width
budget), and this branch was told not to touch them. **Whoever lands there
next should add it** — with the field present the guard is dead code, and dead
is the right state for it.

That red is also this change's negative test for that check: struck, the run
above is what it produces.

## The wording, and the two rejected

The line is **`The team may have 2 at work at once — 3 in parallel not applied`**.
It is the delta spec's own phrase for a capacity ("how many of a team may be at
work at once") in front of the clause `parallelWords` already uses verbatim for
the other override, so the two sentences rhyme where they belong side by side. It
names no team, because `teamWords` names it one line above and the two nameless
label states (`unresolved`, `none`) would each need words this sentence has no
business owning. **Rejected: `Platform may have 2 at work at once — …`** — the
team named twice on one card, plus those two states to answer for. **Rejected:
folding it into the compressed line, `2 people in parallel — 6 days of work in 3,
of the 3 asked for`** — two facts on one line, and at width 1 there is no
compressed line at all, which is precisely the case that had no account of itself
anywhere on the chart. **Not considered defensible: any sentence naming the
team's size as a stored number** — the payload carries no such field; the number
is legitimate only because `min(maxParallel, slots) < maxParallel` proves the
answer was `slots`.

## C3's other P3: the over-bar `{team} ×{n}` label **stays**

Recorded, not applied, and the verdict is that it is the intended behaviour
rather than a defect — with one reservation written down below.

**The evidence.**

1. **The label is true on any plan.** `poolLabelFor` prints the effective team
   and `width`. On a plan with no capacity, `width` is `maxParallel` unclamped,
   so `Platform ×3` states a fact the reader typed and cannot get from anywhere
   else on the chart. Nothing about it is conditional on a capacity existing.
2. **The chart cannot know whether a plan states one.** `ServiceTeamLabel` is
   `none | named | inherited | unresolved` and carries no size. Narrowing to
   "plans that state a capacity" means putting the capacity on the payload, and
   the payload is assembled in `wbs-table.tsx` (`effectiveTeamLabelOf`, the
   `GanttPlan` rows) — the file this change was told not to touch. There is no
   route to the narrowing from inside `gantt-panel.tsx`.
3. **The delta spec asks for the team on every surface**, not for the team on
   capacity plans: _"A client SHALL show the **effective** team on every surface
   that names one — the table, the chart, the cards and the export."_ The bar
   label is how the chart names one for an unassigned bar.

**The reservation.** At `width === 1` the label is the team's name alone, and
this codebase's own repeated bargain — the blank `∥` cell at 1, the absent
`Priority —` line, the absent `1 person in parallel` line — is that a constant
repeated on every row is furniture rather than a fact. A `width > 1` gate would
remove it from every plan that never set a parallelism, which is every plan
written before capacity existed. **It was considered and rejected here**: the
gate is orthogonal to the axis the P3 is actually about, and it would take the
label off width-1 bars on plans where the pool genuinely decides the dates —
losing signal where it matters to remove noise where it does not. The honest
narrowing is by capacity, and that needs the payload change above.

`docs/capacity.md` never claimed this gap, so no page is left lying by leaving
it: the only prose gap that page stated was the clamp, and the clamp is now the
line this change adds.

## What the lighter contract cost

Named because the experiment asks for it, not as a complaint.

- **Skipping `design.md` cost nothing.** There was one shape decision (own line
  versus clause) and it fits in a JSDoc paragraph.
- **Skipping the citation table cost nothing here** and would have cost
  something on a doc-heavy change. This one edits four sentences of prose whose
  source is one function I read in full.
- **The gate narrowing is where the discomfort is.** `nx affected` never ran
  be-01, the e2e suite, the secrets scan or the doc caps, so between the local
  run and CI going green this branch had **no** local evidence that it had not
  broken a browser-level layout. It had not, and CI said so — but a red there
  would have arrived ten minutes later than a full local run would have found
  it, and on a change that touched a rendered string, that is a real bet.
- **The one thing I would not skip again:** the first `nx affected` run is what
  found the `undefined` payload. A contract that let a copy change go straight
  to CI on the strength of "it is only a string" would have shipped a fault
  boundary over the entire chart into a test suite, and the string was never the
  risk.
