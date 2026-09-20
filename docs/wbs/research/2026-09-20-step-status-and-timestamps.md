# Step status models, evidence, history, and start/end as instants

Desk research, date 2026-09-20, covering questions P1–P8 and T1–T4, T6 of
`docs/superpowers/plans/2026-09-20-wbs-agentic-planning-research.md` (work item R3).

## What the WBS does today

- A step's **progress** is `in_progress` or `done`, one row per (work item, step) in
  `step_progress`; absence means unknown. `blocked`/`cancelled` were refused on purpose
  (`progress.ts`): each extra state is a question the engine must answer, unread today.
- A work item's **status** folds from its leaves' steps on every read (`agree`, `statusOf`),
  never stored; `done` is unanimous.
- `setProgress` writes one (work item, step) statement, refused `rolled_up` on a parent and
  `unknown_step` off the project's steps; `setStatus` writes/clears every step under a leaf
  or parent in one journal entry.
- `step_progress.stated_at`, `actual.recorded_at`, `measure.recorded_at` are already
  epoch-ms instants, but record when somebody spoke, not when work happened.
- `work_item.fact_start`/`fact_end` are `IsoDate` text, "no time, no zone", per **work
  item**, not per step. `setStatus done` fills an empty `fact_end` with the UTC day of the
  write stamp; a typed day is never overwritten. `unknown` clears both facts on every item
  that read `done` before the act (ADR 0024: the chart draws the fact, the scheduler reads
  only the forecast).
- No attempt/retry concept exists in the domain. `plan_event` is a per-project, append-only,
  365-day log of every command including `set_progress`/`setStatus`, carrying
  `work_item_id`, `step_id`, `before`, `after`, `created_at` — not read as a per-step
  history today.
- Open changes fixed a glyph language (`○` unknown, `◐` in progress, `✓` done, a status
  strip, a completion prompt for a day; `status-from-the-menu` widens it to a start and end
  day) that new step states must read inside.

## P1. What states does a step need?

| System                      | States                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Airflow `TaskInstanceState` | removed, scheduled, queued, running, success, restarting, failed, up_for_retry, up_for_reschedule, upstream_failed, skipped, deferred, awaiting_input |
| Argo `NodePhase`            | Pending, Running, Succeeded, Skipped, Failed, Error, Omitted                                                                                          |
| Temporal                    | workflow Running…TimedOut/Paused; activity Scheduled→Started→{Completed,Failed,TimedOut,Canceled}                                                     |
| GitHub Actions              | queued/in_progress/completed; conclusion success/failure/neutral/cancelled/skipped/timed_out/action_required                                          |

All split waiting-external / running / finished(success, fail, skip); three of four keep
"did not run because upstream failed" distinct from the step's own failure. Airflow alone
has a standalone retry-pending state and a built-in human-wait state (`awaiting_input`,
3.x); Temporal gets both from an attempt counter and Signal code, not a state.

Issue trackers converge smaller: a closed set of **categories** an open set of named
statuses maps into. Jira's every custom status carries a fixed `statusCategory` of
new/indeterminate/done. Linear has six built-in **state types**, several sharing one — "In
Progress," "In Review," "Ready to Merge" all `Started`. GitHub Projects' Status is a plain
single-select, no category concept. Atlassian argues restraint, no number; no vendor
publishes a maximum.

Field evidence's asks are each attested — waiting for a person, failed and redone, skipped —
but none lets these states move a critical path on their own, narrowing but not closing
`progress.ts`'s engine-question refusal.

Options:

- Keep two states; field evidence's workarounds (whole items standing in for a step)
  continue.
- Add `waiting`, `failed`, `skipped` flat to today's enum. Cost: `agree`'s fold becomes
  N-state (P5).
- A small closed set of _meanings_ (Jira-style categories) with named variants underneath.
  Cost: more structure than today's flat enum.

## P2. Who may state a step's status, and does it carry evidence?

`setProgress`/`setStatus` take `actorId` → `WriteStamp {at, by}` (`ports/clock.ts`, ADR
0012 — one stamp per act). A directory `Person` separately has `kind: 'person' | 'agent'`
(`PERSON_KINDS`) — a label the reader sees, not a rule the engine follows. Nothing links the
_acting account_ to a _directory person_'s kind: an MCP-authenticated agent calling
`setStatus` is indistinguishable from a person at the write-stamp level. GitHub's
`github-actions[bot]` actor is the closest analogue — a kind on the account, not a field.

Options:

- Leave `actorId` alone; agent-vs-person inferred out of band.
- Add `kind` to the write stamp. Cost: touches every one of ADR 0012's ~67 write sites again.
- Add an evidence reference (URL, external ref id). Cost: ties the write to that ref's own
  lifecycle.

## P3. Do facts move to the step?

ADR 0024 refused per-step facts on purpose: "the planner records when a task started and
finished, not when Dev handed to QA." Field evidence argues the opposite for an agent step:
010.5's attempt dispatched at 21:22:24Z, returned twelve minutes later — the only fact held
was "began 2026-09-19, finished 2026-09-20" for all eight items alike. Airflow, Argo,
Temporal all timestamp at the task/activity grain by default.

Options:

- Keep facts on the work item only; a step graph (theme S) narrows the gap for single-step
  items, not multi-step ones.
- Move facts to `step_progress`, work-item facts derived (first start/last end). Cost: ADR
  0024's refusal must be revisited; the done-bar span needs a roll-up rule.
- Keep both grains. Cost: two spellings of one fact, a shape this codebase avoids elsewhere.

## P4. Does the scheduler start reading progress?

Unchanged: `schedule.ts` reads neither progress nor facts. Airflow/Argo/Temporal gate
_execution_ on state, but none computes float or leveling from it — no precedent for a
resource-constrained Gantt engine.

Options:

- No change: a finished plan still shows its original forecast dates.
- Done steps' remaining duration zero, running steps pin to their recorded start —
  `actual-days` D3's named next step. Cost: `live-plan-identity.test.ts` and the capacity
  oracle, built to prove reporting-only changes move no dates, must be re-baselined.
- Progress-aware scheduling for agent steps only. Cost: two rules keyed on a step-kind
  concept that does not exist yet.

## P5. How does item status fold with optional and skipped steps?

Today's `agree`: equal stays itself, else `in_progress`; `done` is unanimous. A `skipped`
state must not keep an item `in_progress` forever, nor silently count as `done`. GitHub: a
`skipped` step "reports its status as Success" for branch protection — folds toward passing.
Argo keeps `Omitted` (unmet `depends`) distinct from `Skipped` (`when:` false) and both from
`Failed`.

Options:

- Extend `agree` three-way: `done`/`skipped` both count toward "finished," item reads `done`
  only if some step said `done`. Cost: `agree`'s proofs must be redone.
- Drop skipped steps from "steps with work on the row," `role-progress`'s existing move.
  Cost: conflates "nobody spoke" with "explicitly skipped."
- A step graph (theme S) makes skipped steps absent from the walk entirely — graph-time, not
  a status value. Unanswered here.

## P6. What does `setStatus done` mean when some steps beneath a parent are human?

Today it writes `done` on every step of every leaf, agent or human alike. None of the P1
engines has a "human step" concept: `awaiting_input` is a state a task enters, not a
property of who marks it.

Options:

- No change: a human step's `done` is trusted exactly as an agent step's. The "human step
  hid as a work item" problem is theme S's to fix, not P's.
- Refuse or warn if a human step beneath the parent has no statement. Cost: couples P to S
  before S is decided; reintroduces a `rolled_up`-style refusal `setStatus` avoids.
- Flag (not refuse) a human step's `done` written by an `agent`-kind account. Cost: depends
  on P2's kind-on-stamp option.

## P7. What is the face of per-step status, within the glyph language already set?

`○`/`◐`/`✓`, a strip, a done tint, a completion prompt are fixed. A per-step face must reuse
these glyphs per step, or add new ones for P1's states, without breaking the row-level fold
shown at the same time — a folded step cell already shows a trio.

Options:

- One more glyph per new state, per step column. Cost: as many columns as a project has
  steps, inside the pinned-glyph budget (`STATUS_COLUMN_WIDTH = 28`) already stated.
- Per-step status lives only in the folded step cell's hover/detail. Cost: click-to-reveal,
  weaker than field evidence's "status could not say planned, now implementing."
- Colour a Gantt slice by its step's status instead of a table column. Ties P7 to T6.

## P8. Is a history of status changes kept, or only the latest statement?

Today only the latest. But `plan_event` already logs every `set_progress`/`setStatus` with
`work_item_id`, `step_id`, `before`, `after`, `created_at`, indexed per project and item — a
per-step attempt history is largely "read `plan_event` filtered," not "store more." Prior
art keeps attempts as a counter on the current execution — Airflow's `try_number`,
Temporal's `activity.info().attempt`, GitHub's `run_attempt` — none a full replay log.
Jira's changelog and Linear's activity feed record every transition by default; GitHub
Projects' custom fields have no changelog (a community answer, weaker than a doc page).
`plan_event` sits on the Jira/Linear side, though an _attempt_ is a count with its own
start/end, not merely a transition record.

Options:

- No new storage: expose `plan_event` filtered per step as history. Cost: pruned by age,
  ids not foreign keys — ties a live feature to a retention policy chosen elsewhere.
- A dedicated attempt table, one row per (work item, step, attempt). Cost: a new structural
  concept, plus P4/T1's actor question again.
- Keep only the latest statement. Cost: field evidence's complaint (dead runs, defects
  invisible in a start/end-only record) stays unaddressed.

## T1. Where do start and end live?

Field evidence: "040.3 took five attempts across one night." Every P1 system timestamps at
the attempt grain by construction — Temporal's Scheduled/Started fire per retry inside one
logical execution; Airflow's `TaskInstance` is one row per (task, run, `try_number`).

Options:

- Per work item only (today): dispatch/return granularity lost entirely.
- Per step, first-start/last-end only: cheaper, but discards the "two dead, six defective"
  signal a start/end-only record hides (`2026-09-20-batch-1-field-data.md`).
- Per attempt, keyed (work item, step, attempt number): richest, prior art's default shape;
  also what P8's dedicated-table option needs regardless.

## T2. What is stored: an instant, or a zoned timestamp?

OpenTelemetry's span start/end are UTC epoch nanoseconds, no timezone field — "local time"
is a display conversion, never wire data. RFC 3339's `date-time` structurally requires a UTC
offset, a grammar distinct from `full-date` (§5.6). TC39 Temporal names the same split:
`Instant` is "a single point in time... no time zone or calendar information"; `PlainDate`
is "independent of any time zone," for "an event... which happens during the whole day no
matter which time zone." This mirrors `workday.ts`'s own `IsoDate`, while
`stated_at`/`recorded_at` are already instants for a _different_ fact.

What breaks: RFC 5545 keeps `DATE` (§3.3.4) distinct from `DATE-TIME` (§3.3.5) so an all-day
event does not shift calendar day for a viewer in another zone; Google's Calendar API
enforces the same rule, `date` for all-day, `dateTime` for timed, never mixed.
`isoDateOfInstant` already projects a stamp down to its UTC day — the loss runs the other
way.

Options:

- `fact_start`/`fact_end` become epoch-ms instants, formatted to a day on display. Cost:
  every `IsoDate` caller — export, import, saved-plan comparison, the completion prompt,
  `setStatus`'s `on`/`factStart` — must decide instant or projected day.
- Keep `IsoDate` facts, add separate instant fields for agent steps needing sub-day
  resolution. Cost: two columns for one concept.
- Keep facts date-only always; sub-day detail lives only in `plan_event.created_at` as the
  when-_said_ fact. Cost: does not answer field evidence's ask for facts, only statements.

## T3. How do old day-only facts read beside new instants?

Migrations are additive (blue/green share SQLite mid-swap). No prior-art source addresses a
live day-to-instant migration directly — an internal consequence, not an external finding.
Reading an old day as an instant requires inventing a time of day, which ADR 0024 already
refused once.

Options:

- New instant columns, additive; old `IsoDate` columns stay, read where present, no row
  invents a time. Cost: two representations of one fact, side by side, indefinitely.
- Backfill old rows to midnight UTC instants at migration time. Cost: manufactures a time
  nobody stated, against ADR 0024's refused option.
- Old rows stay unconverted, instant nullable, never backfilled. Cost: every reader of the
  instant field must handle absence on an otherwise-complete plan.

## T4. Who states the instant?

Field evidence: `stated_at` already shows the gap — the executor ledger recorded
dispatch/return to the second while the UI's only honest moment to write was the end.
OpenTelemetry's spans are stamped "at a time of a calling of the corresponding API" by the
instrumented code, not reviewed later by a person.

Options:

- The agent (through MCP) states its own start/end instant when it acts, distinct from
  `stated_at`. Cost: a second instant field per write; no defined behaviour for a human
  typing the same fact, who has no API call to timestamp itself.
- The launching tool states start/end, bracketing an attempt regardless of the agent's own
  connectivity. Outside WBS control — the plan calls MCP token expiry "a gateway finding."
- The plan states the instant at write time, as today — the status quo T4 exists to move
  past.

## T6. Does a dense actual timeline sit on the planned rows, or a separate track?

ADR 0024 already answers this at the current grain: a done work item draws one bar over its
fact span "in place of its slices," same row — an internal consequence more than an
externally sourced answer; no Gantt-at-minute-density source was found in this pass.

Options:

- Same rows, ADR 0024's rule scaled down: a dense actual bar replaces its planned slice per
  step. Cost: at minute density a bar can be narrower than clickable (T5).
- A separate "what happened" track per step, beside the forecast. Cost: doubles vertical
  space per row, against the plan's recent large-plan scrolling concern (T7).
- Only the row-level done bar stays; per-step actuals, if stored (T1), never draw on the
  chart, only the table/hover surface (P7). Cheapest, but the chart stops being where
  per-step timing is legible.

## What desk research cannot settle

- Whether a fourth-plus step state (P1) is worth its upkeep is a design-interview decision —
  `progress.ts` argues a state shipped now is "a meaning nobody has agreed" — as is whether
  the write-stamp carries an actor kind (P2), the same interview as theme S's step-kind
  decision.
- Whether the scheduler reads progress at all (P4) is explicitly deferred by both
  `actual-days` and `role-progress`; this research does not decide it either.
- The per-step vs. per-attempt grain for T1/P3 needs the model experiment (R6): whether
  `sliceEdgesOf` accepts per-attempt input without a step graph (theme S) is untested.
- Whether readers want a dense timeline on the Gantt (T5/T6), versus a separate view, is
  R6b's UI experiment on batch 1 data to answer, not documentation reading.
- No vendor publishes a recommended or maximum status count; "states found necessary" counts
  what vendors built, not what teams keep current.

## Sources

- github.com/apache/airflow (`airflow/utils/state.py`); github.com/argoproj/argo-workflows
  (`workflow_types.go`); github.com/temporalio/api (`workflow.proto`); docs.temporal.io
  (activity-execution, references/events, retry-policies, resumable-activity).
- docs.github.com/en/rest/actions/workflow-jobs; .../using-conditions-to-control-job-execution.
- opentelemetry.io/docs/specs/otel/trace/api/; opentelemetry-proto `trace.proto`.
- RFC 3339 §5.6; RFC 5545 §§3.3.4, 3.3.5, 3.8.2.4.
- developers.google.com/workspace/calendar/api/concepts/events-calendars.
- github.com/tc39/proposal-temporal (`docs/instant.md`, `docs/plaindate.md`).
- support.atlassian.com (statusCategory JQL, workflow best practices, change history);
  linear.app/docs (workflows, triage, activity feed); docs.github.com/en/issues/
  planning-and-tracking-with-projects (quickstart, single-select-fields);
  github.com/orgs/community/discussions/196958 (community).
- `libs/wbs/domain/domain/src/{progress,workday,stored-vocabularies}.ts`;
  `libs/wbs/application/core/src/service/work-item.service.ts`, `ports/clock.ts`.
- `libs/wbs/adapters/store-sqlite/src/schema.ts` (`work_item`, `step_progress`, `actual`,
  `measure`, `plan_event`).
- `docs/adr/0012-a-write-carries-its-actor-as-an-argument.md`,
  `docs/adr/0024-a-done-work-item-draws-its-facts-not-its-slices.md`.
- `openspec/changes/archive/2026-08-30-{role-progress,actual-days}/design.md`;
  `openspec/changes/{work-item-status-and-facts,status-at-a-glance}/{proposal,design}.md`;
  `openspec/changes/{status-from-the-menu,status-polish}/proposal.md`.
- `docs/wbs/research/2026-09-20-batch-1-field-data.md`; `CONTEXT.md`.
