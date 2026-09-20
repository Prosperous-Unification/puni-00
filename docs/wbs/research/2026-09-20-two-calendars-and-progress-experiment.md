# R6: two calendars and a progress-aware schedule — model experiment

Owner: Dany. Covers work item R6 of `docs/superpowers/plans/2026-09-20-wbs-agentic-planning-research.md`
(questions E1–E3, E7, P3–P4, T1–T4), building on desk research R2/R3
(`docs/wbs/research/2026-09-20-sub-day-estimates-calendars-measures.md`,
`docs/wbs/research/2026-09-20-step-status-and-timestamps.md`). Run on 2026-09-20 in a throwaway Bun project outside the Nx workspace; the
sources are kept beside the planning files, not in this repository.

## What was run

`bun --version` → `1.4.2`. `bun init -y`; `bun add --exact fast-check` →
`fast-check@4.10.2`. `bun test` → 8 pass, 0 fail, about 2,800 `expect()` calls
across 4 files, on the final (unbroken) source (the count varies with the
generated cases; the planner's own rerun gave 2,786). No npm/pnpm/yarn.

Copied verbatim from `libs/wbs/domain/domain/src/workday.ts` (`IsoDate`,
`addWorkdays`, `firstWorkdayOf`, `lastWorkdayOf`, `snapWorkdays`, `isWeekend`,
`isoDateOfInstant`, `workdaysBetween`), from `schedule.ts` (the `topological`
Kahn's-algorithm function and `ScheduleCycleError`), and the `SOLVER_QUANTUM
= 48` constant from `solver-quantum.ts`. Everything below the `IsoDate`
boundary — instants, the agent calendar, quota windows, the two-calendar
scheduler, progress facts — is new, because `workday.ts` is calendar-day
granularity only, "no time, no zone" by its own doc comment; it has no
concept of a clock hour to build on.

## The model, in brief

One instant axis (epoch ms). `HumanCalendar` wraps a project-start `IsoDate`
and an **assumed** 09:00–17:00 UTC working window (not in the product —
`workday.ts` names no hours, only weekends; flagged per E3/E4). `AgentCalendar`
is continuous, optionally bounded by a quota `{windowMinutes, capMinutes}`
tracked in a ledger. Three rounding regimes were compared: `adr0011AsIfAllHuman`
(today's actual shape — no agent calendar exists in the product, so every
step, agent-kind included, is ceil-rounded to a whole human workday and runs
on the one human calendar); `none` (exact minutes/days, two calendars); and
`byKind` (agent steps ceil to the 30-minute quantum on the agent calendar,
human steps keep ADR 0011's whole-day ceiling, unchanged). The scheduler is
deliberately narrower than the real `schedule.ts`: one worker per calendar,
no capacity pools — so the diamond plan's two "parallel" agent steps
**serialize** on the one agent calendar below. That is a real limitation of
this experiment, not a finding about the product.

## Part A.2 — chain and diamond, three regimes

Chain: agent implement (40 min) → human review (0.25 workday) → agent fix (25 min).
Diamond: agent A (25 min) + agent B (90 min) → human review (0.25 workday).
Project start Monday 2026-09-21, 09:00.

| Plan    | Regime                | End (UTC)              |
| ------- | --------------------- | ---------------------- |
| Chain   | `adr0011AsIfAllHuman` | 2026-09-23 17:00 (Wed) |
| Chain   | `none`                | 2026-09-21 12:05 (Mon) |
| Chain   | `byKind`              | 2026-09-22 10:30 (Tue) |
| Diamond | `adr0011AsIfAllHuman` | 2026-09-23 17:00 (Wed) |
| Diamond | `none`                | 2026-09-21 12:55 (Mon) |
| Diamond | `byKind`              | 2026-09-22 11:00 (Tue) |

Whole-day rounding turns a 105-minute chain of real work into 3 calendar
days — the same order of magnitude as the plan's own field evidence (36.5
PERT days → a day and a half of wall clock). `byKind` recovers most of that:
the agent steps cost minutes, and the one remaining day of slack is entirely
the human review's own ADR 0011 ceiling, not agent overhead.

## Part A.3 — what breaks, and the smallest fix

| Case                                                         | Observed                                                                                                                                                                                                                                          | Smallest fix                                                                                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent step shorter than the quantum (12 min)                 | `none`: 00:00→00:12 exact. `byKind`: ceil'd to 30 min (00:00→00:30), 2.5× inflation.                                                                                                                                                              | Round only where an integer axis needs it (the quota ledger / a future CP-SAT call), never at storage.                                                                                   |
| Agent finishes 03:10 at night, human review next             | Review rolls forward to 09:00 the same calendar day, then runs 2h to 11:00.                                                                                                                                                                       | `nextWorkingInstant`-style roll-forward; already required, not new.                                                                                                                      |
| Agent finishes Saturday 14:00                                | Review rolls to Monday 09:00 (two days later).                                                                                                                                                                                                    | Same roll-forward, weekend-aware; already required.                                                                                                                                      |
| Quota window (300 min window, 240 min cap) exhausts mid-plan | A 200-min step uses 200/240; the next (80 min) needs more than the 40 min left, so it waits the full 100 min for a fresh window rather than using the 40 and resuming later.                                                                      | Quantise agent steps and re-check the ledger per quantum tick — the same per-unit treatment `solver-quantum.ts` already gives the CP-SAT capacity axis (`durationUnits`), not per-step.  |
| Instant-level floating-point drift (found, not staged)       | `nextWorkingInstant` reconstructed an in-window instant from `Math.round(minutesIntoDay)`, discarding sub-minute precision from an agent step's finish; an A1 property test caught a successor starting 1ms before its predecessor's true finish. | Preserve millisecond precision whenever the instant is already inside a window; round only when rolling to a new day/window boundary. Fixed in this experiment (see `src/calendars.ts`). |

**Floating-point drift, fractional days vs. integer minutes (E1).** Summing
`1/3` workday 10,000 times in floating-point days: `3333.3333333337314`
days, i.e. `1,600,000.0000001912` minutes when projected through the 480
min/day window — versus `1,600,000` minutes exactly from summing `160`
(`480/3`, exact) minutes directly 10,000 times. Drift: `1.9115e-7` minutes ≈
`3.98e-10` workdays. That is **under** `workday.ts`'s own `DRIFT = 1e-9`
snap window even at 10,000 additions — far more than any real plan's step
count — so the existing snap machinery already absorbs this case. Minutes
still avoid the _category_ of bug (no drift window needed at all for an
integer unit), but this measurement does not show the existing day-fraction
snap failing at plan-realistic scale.

## Part B — progress-aware schedule

Same chain plan, `byKind` regime. Baseline (no facts) ends 2026-09-22 10:30.

| Fact fed to `implement`                                    | Projected end                |
| ---------------------------------------------------------- | ---------------------------- |
| none (baseline)                                            | 2026-09-22 10:30             |
| `done`, on time (start/finish = baseline)                  | 2026-09-22 10:30 (identical) |
| `done`, late (+90 min past baseline finish)                | 2026-09-22 12:00 (+90 min)   |
| `inProgress`, 5 min remaining (of a 60-min quantised plan) | 2026-09-22 10:00 (−30 min)   |

A done step's actual span is placed verbatim, never recomputed; today's
`schedule.ts` reads neither progress nor facts, so a finished plan's dates
never move — this is the change P4 asks about, modeled directly.

One robustness gap was seen and not chased: given a negative "time still
available today", the placement loop spins instead of throwing. A model built
on this one needs that input refused at its boundary, with its own negative.

## Injected faults (R5 proofs)

Four safety properties, each broken by a one-line or one-token change, run,
observed failing, then restored. `git`-free scratch, so each row is a
literal edit-then-revert pair against `src/calendars.ts` / `src/scheduler.ts`.

| #   | Property (test)                                                                   | Fault                                                                            | Failing test                                                                      | Shrunk counterexample                                               |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | A2: human step never occupies non-working time                                    | Commented out the `while (isWeekend(date))` roll-forward in `nextWorkingInstant` | `A2 … the working-hours overlap of [start, finish) equals the requested duration` | `[0, 2401]` (a 2,401-minute step placed straight through a weekend) |
| 2   | A3: agent step never occupies an exhausted quota window                           | `used + durationMinutes <= cal.capMinutes` → `<= cal.capMinutes * 2`             | `A3 … a chain of agent steps never pushes a window over its cap`                  | `[[18, 26, 197]]` (three durations overrunning the 240-min cap)     |
| 3   | A5: `byKind`/whole-day placement matches the `addWorkdays`/`lastWorkdayOf` oracle | `placeHumanStep(…, days * WORK_MINUTES_PER_DAY)` → `… - 1`                       | `A5 … matches addWorkdays/lastWorkdayOf directly`                                 | `[[1]]` (a single one-day step, off by the missing minute)          |
| 4   | B1: a done step's placement equals its facts                                      | `if (fact?.state === 'done')` → `if (fact?.state === 'done' && false)`           | `B1 … for any done start/finish pair, the scheduler places it exactly there`      | `[0, 0]` (project-start instant, zero-minute step)                  |

All four restored; `bun test` returns to 8/8 pass afterward (verified).

## Implications for the CP-SAT solver's quantum (not run)

Not run — only its intake was read (`solver-quantum.ts`'s `durationUnits`,
which multiplies `durationOf(slice)` by `SOLVER_QUANTUM = 48` and ceils,
snapped against the same `DRIFT` window). Two implications follow from this
experiment without running the solver: (a) an agent calendar's own quota
windows are a **second** discrete axis the solver does not see today — a
quantised duration that is feasible against `SOLVER_QUANTUM` alone can still
be infeasible against a quota window, so a solver-facing model would need
either a second integer axis per agent or the quota folded into a
capacity-pool-shaped constraint, the same shape `schedule.ts` already uses
for team pools; (b) the instant-level sub-minute drift found in Part A.3 has
no analogue in `SOLVER_QUANTUM`'s all-integer axis — CP-SAT's own inputs are
already discrete, so this class of fault is specific to the instant-axis
model this experiment adds, not to the solver.

## Recommendations (judgement, not fact)

- **E1** (smallest unit / storage): store minutes for agent steps. The
  measured drift did not exceed the existing snap window at 10,000×
  accumulation, so this is about avoiding a second unit-conversion layer and
  an invented working-hours convention (E4), not about fixing an observed
  failure.
- **E2** (does ADR 0011's ceiling hold for agent steps): no. The chain plan's
  regime table shows whole-day rounding costing 3 days against 105 minutes
  of real work; rounding should become a step-kind property, human unchanged.
- **E3** (agent calendar): yes, continuous and quota-bounded, per the field
  evidence this plan already cites ("agents ran through the night and the
  weekend"). This experiment's quota model is non-preemptive by
  construction (Part A.3, the quota row) — a known simplification, not a
  recommendation to ship non-preemptive quota handling.
- **P4** (scheduler reads progress): yes, on the evidence in Part B — a
  `done` fact placed verbatim and an `inProgress` fact with remaining work
  both moved the projected end in the expected direction, with no change to
  the no-facts case (B3).
- **T2** (instant vs. zoned/date-only fact): instants, at least for agent
  steps and for anything progress-aware — `IsoDate`'s "no time, no zone" is
  exactly what this experiment had to build past to answer P4 and E3 at all.
