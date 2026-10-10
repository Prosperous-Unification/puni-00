---
status: proposed
---

# Measures do not drive the schedule, yet

Assumed by Fable 5.1 on 2026-10-11 under Dany's 2026-10-10 `/goal`; veto sheet
`puni-plan/batch-10/interviews/VETO-SHEET.md` (lines `09-Q5`, `09-Q6a`, `09-Q6b`, `09-Q7`).
Change: `openspec/changes/measures-vocabulary-and-size-templates`.

Tokens, points and sizes are now first-class in the plan, and batch 1's ratios invite a
conversion factor. We keep every measure **reporting only**: time estimates in the step's
unit are the schedule's only input, calibration (estimate ÷ actual per size) is a report on
the project, and no per-project velocity or tokens-per-hour factor moves a date. "Yet" is
the word because the reference class is eight items from one harness, which cannot separate
model variance, task variance and estimation error; a later ADR may reverse this with a
larger class and a pinned token definition (total tokens processed: input including cached,
plus output including reasoning).

## Considered Options

- **Points as a fourth estimate unit the engine reads.** Rejected: the Scrum Guide has no
  story point; velocity would be a per-project conversion factor.
- **Throughput (tokens per hour per model) driving dates.** Rejected: expands `schedule.ts`
  from estimates-and-calendars to measures, against CONTEXT **Measure**, on eight points.
- **Sizes as an ordinal estimate unit rolled up by count.** Rejected: T-shirts do not add,
  and every roll-up and export would gain a non-numeric arm. A size is a template that writes
  ordinary numbers.
