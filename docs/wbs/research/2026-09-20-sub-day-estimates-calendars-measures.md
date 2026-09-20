# Sub-day estimates, calendars, measures and conversion

Desk research, 2026-09-20. Covers E1–E9 and, for Gantt density, T5 and T7 of
`docs/superpowers/plans/2026-09-20-wbs-agentic-planning-research.md`.

## What the WBS does today

`ThreePointEstimate` (`libs/wbs/domain/domain/src/estimate.ts`) accepts any
non-negative fraction of a day at the type level, but `finalDays` rounds
each step's combined figure under a project's `EstimateRounding` (`ceil`
unless set otherwise) before summing —
`docs/adr/0011-final-days-are-whole-days-rounded-per-step.md`. Past that
point everything runs on `workday.ts`: `addWorkdays`, `firstWorkdayOf`,
`lastWorkdayOf` and `wholeDaysCovering` floor or ceil at whole-workday
boundaries (drift-snapped at 1e-9), and `IsoDate` is "no time, no zone" by
design. An unestimated slice gets `ASSUMED_SLICE_WORKDAYS = 2`
(`assumed-duration.ts`), a scheduling assumption, never an estimate.
Measures (`MEASURE_METRICS = ['token_estimate','token_actual','hours_actual']`,
`stored-vocabularies.ts`) are stored per work item and step, rolled up one
metric at a time (`roll-up.ts`), API/MCP only, absent never zero, read by
no scheduler — `token-tracking` records an empty diff on `schedule.ts`.
The Gantt axis (`gantt-panel.tsx`) is a three-rung ladder in pixels per
**workday** — `DAY_SCALES = [28, 12, 4]` — that only zooms out (days →
weeks → months); nothing draws below one workday, and a day's figure
displays rounded to one decimal (`showDay`, `plan-number-format.ts`). One
fact outside the plan's own surfaces: the optimized solver already cuts a
workday into 48 units, a half hour, on its own internal axis
(`solver-quantum.ts`, `SOLVER_QUANTUM`) — a resolution no estimate,
calendar or chart in the product can reach.

## E1. Smallest duration and storage unit

PERT's arithmetic is scale-free: the Navy-era formula and PMI's own
description name no minimum grain — [PMI's Practice Standard for Scheduling](https://www.pmi.org/-/media/pmi/documents/public/pdf/certifications/practice-standard-scheduling.pdf)
and [AcqNotes on PERT](https://acqnotes.com/acqnote/tasks/pert-analysis) give optimistic/most-likely/pessimistic and
`(O+4M+P)/6` with no unit attached. The unit is this codebase's choice, not
the technique's, and the WBS already has an unused sub-day axis:
`SOLVER_QUANTUM = 48` (30 minutes) inside the optimized solver. Options: (a)
keep fractional days as the stored unit and thread a smaller floor/ceil unit
through `firstWorkdayOf`/`lastWorkdayOf`/`wholeDaysCovering` — touches four
proven, heavily-proofed functions and their drift window; (b) store minutes
(or solver units) directly, converting to days only at the PERT/rounding
boundary — avoids re-deriving those functions but adds a second unit
`MAX_ESTIMATE_DAYS`'s 32-bit solver-axis bound would need restating in; (c)
reuse `SOLVER_QUANTUM`'s 30-minute grain everywhere so the domain layer and
the solver finally agree — cheapest conceptually, but that constant is
justified by solver width arithmetic (it divides 2/3/4/6/8/12/16/24), not by
what a reader needs, so reusing it is a coincidence unless re-justified.

## E2. Whether ADR 0011's per-step ceiling still holds for an agent step

ADR 0011 rounds for one reason: the schedule and the printed figure must be
the same number, and rounding **before** summing — not after, not only for
display — keeps that true across a chain of steps. That argument is
unit-independent: it holds rounding to a half-hour as well as to a day.
What does not carry over is the reason to round _up_: `ceil`'s own doc says
it "says a step that needs any of a day occupies the day" — a claim about a
person's week with no analogue for an agent, whose work does not occupy
anyone's day by finishing early. Field evidence is the cost of applying it
anyway: 36.5 PERT days of `ceil`ed steps finished in a day and a half of
wall clock. Options: keep one project-wide rounding for every step kind (no
schema change, keeps the padding observed); make rounding a property of the
calendar or step kind — a dimension `EstimateRounding` lacks today,
reopening the invariant `estimate-weights-and-rounding` was built around;
or let a project opt into `exact` (the fourth, unrounded mode) for
agent-heavy plans, removing the padding project-wide rather than
selectively.

## E3. Whether agents get their own calendar

Two mature schedulers split "when does work happen" into more than one
calendar. MS Project's MSPDI schema defines elapsed duration as time that
"counts all time, including non-working time specified in the project,
resource, or task calendar" — `7ed` runs straight through weekends where
`7d` skips them ([`DurationFormat` element](<https://learn.microsoft.com/en-us/previous-versions/office/developer/office-2007/bb968637(v=office.12)>)). Ordinary tasks schedule at the intersection of
task and resource calendar, and a "Scheduling ignores resource calendars"
flag lets a task's calendar override an assigned resource's
([Task Calendar](https://support.microsoft.com/en-US/project/task-calendar-task-field), [Ignore Resource Calendar](https://support.microsoft.com/en-us/office/ignore-resource-calendar-task-field-a3d675e0-2a47-4435-a838-a353d5eda56e)). Primavera P6 keeps three calendar pools —
global, resource, project — and which governs an activity depends on its
type ([Oracle P6, "Working with Calendars"](https://docs.oracle.com/cd/G18296_01/English/User_Guides/p6_pro_user/calendars.htm)). The WBS has one calendar, project-wide
(`workday.ts`, Monday–Friday by design), no per-resource calendar —
`person.kind` (`agent`/`person`) carries no time-of-day meaning. Rate
limits and quota windows are calendar-like as recurring capacity but not in
shape: Anthropic's ITPM/OTPM replenish continuously while its spend cap
resets at 00:00 UTC monthly ([rate limits](https://platform.claude.com/docs/en/api/rate-limits)); OpenAI's RPM/TPM are per-minute
with per-day variants and spend tiers ([rate limits](https://developers.openai.com/api/docs/guides/rate-limits)) — neither is a
working/non-working day, both are a rate over a moving window. Options: an
agent calendar simply 24/7 (elapsed-duration style) — closest to field
evidence (agents "ran through the night and the weekend"); one bounded by
quota windows — needs a new primitive, `isWeekend`-style binary days cannot
express; or no new calendar, only a smaller duration unit on the existing
one — cheapest, and what field evidence argues against.

## E4. UI for sub-day time

Three surfaces need an answer, none has one today. Axis zoom: the ladder
(`DAY_SCALES`) stops at 28px/workday and its comment argues for discrete,
judgeable rungs over a slider — extending below a day means sub-day rungs,
not a slider. Bar minimum width: `PlacedBar.width` comes from
`startOf`/`endOf` offsets with no floor; a 12-minute slice at today's
finest rung draws a fraction of a pixel — T5 asks the same from the
clickability side. Duration format: `showDay` fixes one decimal of one unit
for every figure; Microsoft's `DurationFormat` carries eleven display units
per value, each with an elapsed twin, because one fixed unit cannot read
well across the orders of magnitude a sub-day estimate would now span.
Options: a unit-switching formatter (cost: every `showDay` caller and
snapshot test built on its contract); a fixed finer unit (always minutes)
at every scale (cost: a 22-day estimate reads as a five-digit number); or
format only, storage untouched, axis and table each choosing their own
unit (cost: the "table disagrees with the chart" fault ADR 0011 prevents,
now on the unit rather than the rounding).

## E5. Which measures, and what each is for

Today's three (`token_estimate`, `token_actual`, `hours_actual`) split into
one estimate and two facts (`token-tracking` D2, D5): a token estimate is
one number because nothing folds a range; hours are recorded, never
derived, because no token-to-hour or day-to-hour conversion is a fact about
the world. Story points and velocity are not Scrum: the
[official Scrum Guide](https://scrumguides.org/scrum-guide.html) itself has no mention of "story point" or "velocity";
its only line on sizing is "The Developers who will be doing the work are
responsible for the sizing." The practice is documented elsewhere: points
trace to Extreme Programming, where Ron Jeffries describes starting from
"ideal days" multiplied by a team's "load factor," then abstracting the day
into a unitless point to stop the day-arithmetic a reader would otherwise
do (["Story Points Revisited"](https://ronjeffries.com/articles/019-01ff/story-points/Index.html)); Mike Cohn's _Agile Estimating and Planning_ (2005)
popularized points and planning poker for Scrum, poker dating to James
Grenning's 2002 XP paper. Velocity (points per sprint, per team) turns
points back into a date — the nearest precedent for E7's "per-project
conversion." T-shirt sizing is widely practiced but has no canonical
specification the way PERT or the Scrum Guide does; treat specific claims
as **unverified**. The "recorded, never derived" question `hours_actual`
answers is open for points and sizes.

## E6. What exactly is a token count

Anthropic's Messages API reports `input_tokens` (tokens **after** the last
cache breakpoint), `cache_creation_input_tokens` (1.25× base for a
5-minute TTL, 2× for a 1-hour TTL) and `cache_read_input_tokens` (0.1×
base, 0.025× on Fable/Mythos); only uncached input and cache writes count
toward the ITPM rate limit
([token counting](https://platform.claude.com/docs/en/docs/build-with-claude/token-counting), [prompt caching](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching), [rate limits](https://platform.claude.com/docs/en/api/rate-limits)). The same docs state models from Opus 4.7 on use a
newer tokenizer counting "approximately 30 percent more tokens" than
earlier models — a count is tied to a tokenizer version, not just a
provider. OpenAI reports reasoning tokens separately, under
`output_tokens_details.reasoning_tokens`, billed as ordinary output tokens;
cached input on GPT-5.6+ is billed 0.1× with a 1,024-token minimum prefix
and a 30-minute reuse window ([reasoning](https://developers.openai.com/api/docs/guides/reasoning), [prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)). So "a token count" is a four-way
split (input, cache write, cache read, output-plus-reasoning) at different
prices, before asking which tokenizer produced it. The plan's
field-evidence table calls its figure "what the executor's command-line
tool printed as 'tokens used.'" Desk research cannot confirm which
components that sums or discards — that needs the tool itself, R4's job.

## E7. Whether an alternative measure ever drives the schedule

Today, never: `token-tracking`'s design record notes an empty diff on
`schedule.ts`, and CONTEXT.md's Roll-up and Measure entries both say
reporting only. The plan's three candidates are never / per-project
conversion (velocity, throughput) / calibration from actuals. Reference
class forecasting is the formal argument for the third: Kahneman and
Tversky's original framing (1979) and Flyvbjerg's applied literature argue
a project's own inside-view estimate is systematically optimistic, and
substituting outcomes from a reference class of comparable finished work
corrects it better than refining the estimate itself
([overview](https://en.wikipedia.org/wiki/Reference_class_forecasting), [Flyvbjerg in PMI's library](https://www.pmi.org/learning/library/nobel-project-management-reference-class-forecasting-8068); the Wikipedia link is a summary, the
mechanism is properly Kahneman/Tversky's and Flyvbjerg's own). The batch-1
table is a reference class of one project's first batch: eight items, one
harness, four sizes, ratios 14.0–14.8 (S), 4.6–8.6 (DOC), 7.6–9.3 (M),
24.1–40.8 (L). It supports a first-order claim that this plan's
PERT-derived token estimates overshoot by roughly an order of magnitude,
widening at larger sizes. It cannot support a per-size conversion factor:
eight points is too few to separate model variance, task variance and
estimation error; the actual figure is not pinned (E6); one project gives
no second reference class to check the first against.

## E8. Whether a size class is an estimate or a template

The batch-1 notes already answer this operationally: S/M/L/DOC each mapped
to a fixed PERT-day figure and token figure in the planner's own working
notes, a template expanded by hand, not a value estimated per item. Options: a size is a fourth estimate unit, ordinal, rolled up by
count rather than sum (T-shirts do not add); or a size is a template that
writes a trio (and optionally a token figure) into the row when chosen,
after which the row holds numbers and the size label is metadata about
their origin — the reading field evidence already shows happening without
product support.

## E9. How measures roll up when siblings use different measures

`rollUpMeasures` already refuses to mix units by construction: it takes one
metric per call, and a step nobody recorded that metric for is absent,
never zero, per row. A token figure is never summed with an hours figure —
the fold cannot do it, not by convention but by its type. Unresolved: a
parent whose children are estimated in different measures entirely. Each
metric's roll-up walks the same tree and reports only over children that
used it, so a parent with one child in days, one in tokens, one in points
gets three partial totals, not one, and nothing today says whether a card
should show three partial figures, the days figure alone, or a coverage
note.

## T5. How dense the Gantt timeline gets

The existing ladder is a ladder, not a zoom: `DAY_SCALES`'s comment argues
discrete rungs are individually judgeable, a slider's every value is not,
and `MARKER_BAND_MAX_PER_CELL` (3/2/1 chips) is tuned per rung on the same
argument. Two tracing tools drawing at sub-second resolution take the
opposite position. Perfetto's UI zooms continuously with WASD and
Ctrl+scroll from a whole trace to nanosecond slices, with a "fit to
viewport" command for spans too short to see otherwise
([Perfetto UI docs](https://perfetto.dev/docs/visualization/perfetto-ui)). Chrome DevTools' flame chart is likewise continuously
zoomable, with breadcrumbs for prior zoom levels
([Performance panel](https://developer.chrome.com/docs/devtools/performance)). GitHub Actions' own visualization is not a counter-example
worth copying: it is a dependency graph of jobs, not an axis scaled to
duration ([Using the visualization graph](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-the-visualization-graph)). So the two real sub-day precedents both use continuous
zoom — what this module's design comment rejected once already, for a
stated reason (testability of discrete rungs) unrelated to legibility at
fine grain. Options: extend the ladder with sub-day rungs (one zoom model,
its test discipline kept, coarsest fidelity, cheapest); add a second,
continuous zoom mode below one day (matches tracing-tool practice, reopens
the ladder's objection, two zoom models in one component); or keep one axis
unit and show sub-day facts as in-cell annotations (no second zoom model,
but cannot show two ten-minute attempts as separate bars, the reason T5 is
asked).

## T7. At what plan size a minute-level axis stops being drawable

The open change `wbs-scroll-smoothness` is the "large-plan scrolling work
that has just landed" the research plan refers to. Its scope defines "a lot
of items" as 500–2,000 rows and explicitly excludes the Gantt panel: "no
mobile work, no Gantt windowing," and "Gantt isolation or windowing remains
conditional on its component-scoped trace." Its causal analysis names the
Gantt panel mounting every row's label, hit surface and bar,
unconditionally, as one of four candidate jitter causes — one this change
does not fix. So T7's ceiling is a product of two unmeasured factors: row
count (the table already jitters at 500–2,000 rows before any Gantt-specific
fix exists), and marks per row (a minute-level axis draws roughly one bar
per executor attempt rather than one per step — field evidence shows up to
five attempts for one item's step in one night, a five-fold multiplier on
the rows such an axis would be turned on for). Desk research can name both
factors and confirm the Gantt panel has no windowing today; it cannot give
a number — that needs the UI experiment (R6b) against real ledger data.

## What desk research cannot settle

One item below was settled the same day by field data: the executor tool's printed "tokens used" is uncached input plus output, and total tokens processed for batch 1 were about forty times that, almost all cached input. See `docs/wbs/research/2026-09-20-batch-1-field-data.md`, which answers E6 in kind and leaves the choice of which count the WBS should name.

- E6's exact definition of the batch-1 executor's "tokens used" figure —
  needs the tool's own source or logs (R4), not documentation.
- E7's conversion factor, if any — needs more project history and a pinned
  actual figure before reference-class calibration is defensible.
- E3's choice between an agent calendar and a smaller duration unit alone —
  one of Dany's own decisions, modeled by R6.
- T5/T7's actual pixel and row thresholds — measurement questions for R6b
  against the batch-1 ledger, not something prior art fixes.
- E9's presentation of a parent with mixed-measure children — a design
  question, not a sourcing one.

## Sources

- PMI, [_Practice Standard for Scheduling_](https://www.pmi.org/-/media/pmi/documents/public/pdf/certifications/practice-standard-scheduling.pdf)
- AcqNotes, [PERT Analysis](https://acqnotes.com/acqnote/tasks/pert-analysis) (secondary)
- Microsoft, [`DurationFormat` element](<https://learn.microsoft.com/en-us/previous-versions/office/developer/office-2007/bb968637(v=office.12)>)
- Microsoft, [Task Calendar](https://support.microsoft.com/en-US/project/task-calendar-task-field)
- Microsoft, [Ignore Resource Calendar](https://support.microsoft.com/en-us/office/ignore-resource-calendar-task-field-a3d675e0-2a47-4435-a838-a353d5eda56e)
- Oracle, [Primavera P6 — Working with Calendars](https://docs.oracle.com/cd/G18296_01/English/User_Guides/p6_pro_user/calendars.htm)
- Anthropic, [Token counting](https://platform.claude.com/docs/en/docs/build-with-claude/token-counting), [Prompt caching](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching), [Rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- OpenAI, [Reasoning](https://developers.openai.com/api/docs/guides/reasoning), [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits)
- Scrum.org, [The Scrum Guide](https://scrumguides.org/scrum-guide.html)
- Ron Jeffries, [Story Points Revisited](https://ronjeffries.com/articles/019-01ff/story-points/Index.html)
- Wikipedia, [Reference class forecasting](https://en.wikipedia.org/wiki/Reference_class_forecasting) (summary; primary: Kahneman & Tversky 1979, Flyvbjerg's papers)
- PMI, [From Nobel Prize to Project Management](https://www.pmi.org/learning/library/nobel-project-management-reference-class-forecasting-8068)
- Google, [Perfetto UI docs](https://perfetto.dev/docs/visualization/perfetto-ui)
- Google, [Chrome DevTools Performance panel](https://developer.chrome.com/docs/devtools/performance)
- GitHub, [Using the visualization graph](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-the-visualization-graph)
