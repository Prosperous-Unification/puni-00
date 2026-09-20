# WBS for agentic development: research plan

Status: plan for research, written 2026-09-20 at Dany's request. Nothing here is decided. The research ends in decisions (ADRs), glossary terms and OpenSpec changes; this page says what to find out, how, and in what order.

## Intent

**Problem.** The WBS plans work the way a team of people does it: a step is a name in one project-wide order, an estimate is three numbers of working days, and a work item is either done or not. Work is now done mostly by agents. On 2026-09-19 and 2026-09-20 one planner agent and thirty executor attempts took eight items of the "PUNI platform plan" from start to merged in about a day and a half, against 36.5 PERT days on the plan. The plan could not say which steps an agent does and which wait for a person, could not show a step shorter than a day, could not hold an estimate in tokens where the schedule could use it, and could not show that an item's planning was done while its implementation was running.

**Outcome.** Three researched, decided and specified changes, each small enough to build after the WBS refactoring:

1. Steps form a directed acyclic graph, and a step says whether an agent does it, a person does it, or it is optional.
2. Estimates can be shorter than a day, the UI can show that, and an item can be estimated in other measures: tokens, story points, sizes.
3. Every step of a work item has its own status.

**Non-goals.** Running agents from the WBS: that is Twilight Dash's. Replacing three-point estimates or the PERT fold. A general workflow engine. Changing how dependencies between work items work, except where a step graph forces it.

**Constraints.** The WBS is detached, so changes land here directly. Forward migrations are additive, because blue and green share SQLite mid-swap. `CONTEXT.md` owns the terms. Every safety check needs its production-path negative (R5). Implementation waits for the refactoring where files collide (see "When this can be built").

## What exists today

Mapped on 2026-09-20; paths are relative to the repository root.

| Area                       | Today                                                                                                                                                                                               | Where                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step                       | A name and a position per project. No kind, no owner class, no optional flag, no relation to another step, no reorder.                                                                              | `libs/wbs/adapters/store-sqlite/src/schema.ts` (table `step`), `libs/wbs/application/core/src/ports/step-store.ts`, `libs/wbs/application/core/src/service/step.service.ts` |
| Step order in the schedule | One slice per leaf and step; a leaf's slices form an unconditional chain in step order. Floor kind `stepOrder`.                                                                                     | `libs/wbs/domain/domain/src/slice-edges.ts` (`sliceEdgesOf`), `schedule.ts`, `slice-groups.ts`                                                                              |
| Estimate                   | `ThreePointEstimate` in days, fractions allowed, but the default rounding `ceil` makes a step at least one whole day, rounded per step before summing (ADR 0011).                                   | `libs/wbs/domain/domain/src/estimate.ts`, `docs/adr/0011-final-days-are-whole-days-rounded-per-step.md`                                                                     |
| Calendar                   | Everything after the estimate is working days. An unestimated slice is assumed to take two. The Gantt axis is in working days and the table shows one decimal.                                      | `libs/wbs/domain/domain/src/workday.ts`, `assumed-duration.ts`, `apps/wbs/fe-01/src/components/wbs/gantt-geometry.ts`, `plan-number-format.ts`                              |
| Measures                   | `token_estimate`, `token_actual`, `hours_actual` per work item and step, rolled up like estimates. API and MCP only: **no column in the UI**, and the schedule never reads them.                    | `libs/wbs/domain/domain/src/stored-vocabularies.ts` (`MEASURE_METRICS`), table `step_measure`, archived change `2026-08-30-token-tracking`                                  |
| Step progress              | `in_progress` or `done` per work item and step; absence means unknown. `blocked` and `cancelled` were refused on purpose.                                                                           | `libs/wbs/domain/domain/src/progress.ts`, table `step_progress`                                                                                                             |
| Item status                | Derived, never stored: done only when every step is done (ADR 0024). `setStatus done` writes `done` on every step of every leaf under the item. Facts (`fact_start`, `fact_end`) are per work item. | `work-item.service.ts` (`setStatus`), `docs/adr/0024-a-done-work-item-draws-its-facts-not-its-slices.md`                                                                    |
| What the scheduler reads   | Neither progress nor facts. They change drawing only.                                                                                                                                               | `schedule.ts`, `canonical-schedule-input.ts`, `gantt-geometry.ts`                                                                                                           |
| Per-step status in the UI  | None. Only the folded item status has a face.                                                                                                                                                       | `apps/wbs/fe-01/src/components/wbs/plan-columns/status.tsx`, `folded-step-card.tsx`                                                                                         |
| Agents                     | `PERSON_KINDS = ['person', 'agent']`, a directory label: "a fact the reader can see, not a rule the engine follows".                                                                                | `stored-vocabularies.ts`, `CONTEXT.md`                                                                                                                                      |

So each of the three requests has a seed already planted, and each seed stops short of the schedule and the screen.

## Field evidence: two days as an agent using this plan

Observed while planning and executing batch 1 through the MCP facade. Each line is something the research must explain or remove.

- **Steps were not a chain.** The plan's steps are Plan, Impl, Review in that order. The real flow was Plan, review of the plan, revise (up to three rounds), implement in slices, planner verification after each slice, then integration and a host gate. Review came before implementation and again after it, and "implementation" was several attempts.
- **Human steps hid as work items.** Publishing a package, registering nodes and three decisions are whole work items only because a step cannot say "a person does this". Two agent items (030, 050) are blocked behind one of them.
- **Optional steps exist in the rules already.** `design.md` is written "only for non-trivial technical shape"; a third review round happens only when the second refuses. The plan cannot say either.
- **Days were the wrong size.** Eight items estimated at 36.5 PERT days finished in about a day and a half of wall-clock. The shortest real unit was an executor attempt: 10 to 40 minutes.
- **Agents do not keep working days.** Executors ran through the night and the weekend. The schedule snaps everything to working days.
- **Token estimates lived in notes as text**, as three keys per item, because nothing else could hold a planning, an implementation and a review figure. `setMeasure` would have held them per step; the planner did not find that out until it was refused with `unknown_metric` for a name it invented.
- **The estimates were far off, and nothing could show it.** Executor tokens actually used against the implementation estimate in the notes:

  | Item  | Size | PERT days | Estimated tokens | Actual tokens | Estimate ÷ actual |
  | ----- | ---- | --------- | ---------------- | ------------- | ----------------- |
  | 010.5 | S    | 2.2       | 2,500,000        | 168,731       | 14.8              |
  | 020.1 | S    | 2.2       | 2,500,000        | 178,720       | 14.0              |
  | 010.3 | DOC  | 3.2       | 3,000,000        | 348,973       | 8.6               |
  | 110.5 | DOC  | 3.2       | 3,000,000        | 657,790       | 4.6               |
  | 020.8 | M    | 4.3       | 9,000,000        | 1,186,639     | 7.6               |
  | 040.6 | M    | 4.3       | 9,000,000        | 964,458       | 9.3               |
  | 010.4 | L    | 8.5       | 22,000,000       | 914,392       | 24.1              |
  | 040.3 | L    | 8.5       | 22,000,000       | 539,452       | 40.8              |

  The actual figure is what the executor's command-line tool printed as "tokens used"; whether that counts cached input the way the estimate meant is itself a research question (E6).

- **Status could not say "planned, now implementing".** `setProgress` per step exists and the planner used it once, for 060.1's Plan step; the UI has nowhere to show it. For the other eight the only honest moment to write anything was the end.
- **An agent cannot stay connected.** Access tokens last five minutes with no refresh, and a client registration ten. That is a gateway finding, outside this research, but per-step status is only as fresh as the agent's ability to write it.

## Research questions

### S. Steps as a graph, with kinds

- S1. Where does the graph live: one per project (as the order is today), one per work item type, or one per work item with a project default? What do the other two cost?
- S2. What are the kinds? Candidates: agent, human, either; and separately required or optional. Is "optional" a property of the step, or of a step on a particular work item ("skipped here")?
- S3. How do review loops fit a graph that must stay acyclic? Candidates: a bounded repeat count on an edge, rounds as recorded attempts of one step (status history, not graph shape), or an explicit rework step.
- S4. What does a human step mean to the schedule? It needs a person's calendar; an agent step does not. Does an unassigned human step block, warn, or float?
- S5. What is a gate? A human approval between two agent steps is the commonest shape in agent pipelines. Is it a step with zero duration, or an edge property?
- S6. How do work item dependencies reach into a step graph? Today `DependencyReach` (ADR 0010) picks which slice a dependency waits on in a chain. What is "first" and "last" in a graph?
- S7. What happens to existing projects: is a chain simply the graph with one edge per neighbour, so nothing migrates?
- S8. How is a graph edited and shown in a table whose step columns are one ordered list?

### E. Estimates: shorter than a day, and in other measures

- E1. What is the smallest duration the model should hold, and in what unit is it stored: fractional days as now, or minutes? What breaks in `workday.ts` either way?
- E2. ADR 0011 rounds every step up to a whole day on purpose. Which of its reasons still hold for an agent step, and should rounding become a property of the step kind or of the calendar, rather than of the project?
- E3. Do agents get a calendar of their own (continuous time, bounded by quota windows rather than working days)? How do a human step and an agent step share one Gantt axis?
- E4. What is the UI for sub-day time: axis zoom below a day, bar minimum width, the table's duration format?
- E5. Which measures, and what is each one for? Tokens (cost and quota), story points (relative size), sizes S/M/L/XL (a class, not a number), hours. Which are estimates, which are actuals, which are both? Today one table mixes them and the metric name says which.
- E6. What exactly is a token count: input, output, cached, per model? The batch 1 table above cannot be trusted until this is pinned. Quota is per provider and per window, and an earlier measurement of this project's own logs paired tokens with quota percent.
- E7. Does any alternative measure drive the schedule, and how? Candidates: never (measures are reporting only); by a per-project conversion (velocity: points per day; throughput: tokens per hour per model); by calibration from actuals. The batch 1 ratios, 4.6 to 40.8, are the first calibration data.
- E8. Is a size class an estimate at all, or a template that fills in a trio and a token figure?
- E9. How do measures roll up when siblings are estimated in different measures?

### P. A status for every step

- P1. What states does a step need? Today: unknown, in progress, done. Field evidence asks for at least: waiting for a person, failed and being redone, skipped (the optional step not taken). `blocked` and `cancelled` were refused once, with reasons in `progress.ts`; read them first.
- P2. Who may state a step's status, and how is a statement by an agent told from one by a person? Does a status carry evidence (a commit, a gate run, a report)?
- P3. Do facts move to the step: a start and an end per step, from which the item's facts derive as status does today?
- P4. Does the scheduler start reading progress? A done step's remaining duration is zero and a running step has a known start. Today the schedule ignores both, which is why a finished plan still shows its original dates.
- P5. How does item status fold from a graph with optional and skipped steps? "Done is unanimous" needs restating.
- P6. What does `setStatus done` on a parent mean when some steps beneath it are human?
- P7. What is the face of per-step status in the table and on the Gantt, within the glyph language the open status changes already set?
- P8. Is a history of status changes kept (attempts, rounds), or only the latest statement?

## Prior art to read, and what to take from each

- Workflow engines with typed steps: GitHub Actions (`needs`, `if`, environments with required reviewers), Argo Workflows and Airflow (DAG tasks, skipped and upstream-failed states), Temporal (activities, signals for human input). Take: the state sets, how optional and skipped differ, how approval gates are modelled.
- Agent frameworks with human-in-the-loop: LangGraph interrupts and checkpoints. Take: how a graph pauses for a person and resumes.
- Planning tools: Linear and Jira workflow states and sub-task statuses; MS Project and Primavera resource calendars and task calendars; critical path with mixed calendars. Take: which status models people actually keep up to date, and how mixed calendars are drawn.
- Estimation: PERT and three-point practice below a day; story points and velocity; T-shirt sizing; reference-class forecasting as the argument for calibrating from actuals.
- This project's own records: the archived changes `role-progress`, `actual-days`, `token-tracking`, `estimate-weights-and-rounding`, `dep-waits-on-first-role`; ADRs 0010, 0011, 0016, 0024; the open status changes; the Codex and Claude quota measurement of 2026-09-13; batch 1's ledger of thirty attempts.

## Method and deliverables

1. **Desk research** (one note per theme under `docs/wbs/research/`, claims sourced, each ending in options rather than a recommendation).
2. **Field data.** Export batch 1's ledger into a table of attempts with wall-clock, tokens and outcome. Settle E6 on real logs.
3. **Model experiments.** Pure-domain prototypes in a scratch directory, not in the product: a step graph feeding `sliceEdgesOf`; a schedule with two calendars; status folds over a graph with skipped steps. Each with property tests. Throwaway code, kept only as evidence.
4. **One design interview** per theme, combining brainstorming, grilling and domain modelling as the repository's workflow prescribes; terms resolved into `CONTEXT.md` as they are settled.
5. **ADRs** for what is hard to reverse: the step graph's home (S1), the duration unit and rounding (E1, E2), the agent calendar (E3), the step state set (P1), whether the scheduler reads progress (P4).
6. **OpenSpec changes**, one per outcome, with testable delta specs and ordered TDD tasks, ready to be cut into work packets like batch 1's.

## Work items to schedule

Three-point estimates in days as the plan uses today, and tokens for a top model at high effort. All of R1 to R6 can start now: they touch no product file. R7 to R9 each need Dany for the interview's decisions.

| Ref | Item                                                                       | Depends on | Days (O / R / P) | Tokens    |
| --- | -------------------------------------------------------------------------- | ---------- | ---------------- | --------- |
| R1  | Desk research: step graphs, kinds, gates, loops                            | —          | 0.5 / 1 / 2      | 1,500,000 |
| R2  | Desk research: sub-day estimates, calendars, measures and conversion       | —          | 0.5 / 1 / 2      | 1,500,000 |
| R3  | Desk research: step state models, evidence, history                        | —          | 0.5 / 1 / 2      | 1,200,000 |
| R4  | Field data: batch 1 attempts table; pin what a token count is              | —          | 0.25 / 0.5 / 1   | 600,000   |
| R5  | Model experiment: step graph into slice edges, dependency reach on a graph | R1         | 0.5 / 1 / 2      | 2,000,000 |
| R6  | Model experiment: two calendars on one schedule; progress-aware schedule   | R2, R3     | 1 / 2 / 3        | 3,000,000 |
| R7  | Design interview, glossary and ADRs: steps                                 | R1, R5     | 0.5 / 1 / 2      | 1,500,000 |
| R8  | Design interview, glossary and ADRs: estimates and measures                | R2, R4, R6 | 0.5 / 1 / 2      | 1,500,000 |
| R9  | Design interview, glossary and ADRs: step status                           | R3, R6     | 0.5 / 1 / 2      | 1,500,000 |
| R10 | OpenSpec changes and packet-ready task lists for the three outcomes        | R7, R8, R9 | 1 / 2 / 4        | 4,000,000 |

## When this can be built

Research and specification collide with nothing and can run beside the refactoring. Building is different:

- The domain library (`estimate.ts`, `progress.ts`, `slice-edges.ts`, `schedule.ts`, `workday.ts`) is outside every refactoring lane. Model changes there can start as soon as R10 is accepted.
- `work-item.service.ts` and `step.service.ts` are inside 020.9 (split the backend core into modules). Service changes wait for it.
- The table, the step columns and the Gantt sit beside 040.4, 040.5 and 040.7. UI changes wait for 040.7.
- Migrations are additive and can land early, ahead of the code that reads them.

So the feature items should depend on R10, and then on 020.9 or 040.7 according to the files each touches, not on the Twilight Bureaucrat runs 030 and 050, which wait for the package to be published.

## Decisions this research will ask of Dany

Recorded so they are not a surprise; until answered, the research carries each as an assumption with its alternative.

1. Is the step graph per project, or may a work item type carry its own?
2. Do agents get their own calendar, and is quota part of it?
3. May an alternative measure drive dates, or are measures reporting only?
4. Does the scheduler read progress, so a finished step stops moving the dates?
5. Which step states beyond in progress and done are worth their upkeep?
