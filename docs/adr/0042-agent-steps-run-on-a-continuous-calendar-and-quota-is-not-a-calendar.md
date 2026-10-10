---
status: proposed
---

# Agent steps run on a continuous calendar, and quota is not a calendar

Assumed by Fable 5.1 on 2026-10-11 under Dany's 2026-10-10 `/goal`; veto sheet
`puni-plan/batch-10/interviews/VETO-SHEET.md` (lines `09-Q0`, `09-Q3b`, `09-Q3c`). Change:
`openspec/changes/agent-calendar-instant-axis`.

Field data shows agents "ran through the night and the weekend" while the only calendar the
WBS has is Monday–Friday whole days. We give the schedule one **instant axis** on which
human-kind and either-kind slices occupy a per-project **working window** (start hour, end
hour, in the **project timezone**; 09:00–17:00 unless set; weekends off) and agent-kind
slices run continuously, with both engines reading the same axis and CP-SAT's quantum
restated in minutes. Which calendar a step runs on is its **executor kind**
(`human | agent | either`, a step column, `either` unless set). Provider quota is modelled as
the existing capacity pools (a team of agent-kind people with N slots), never as a calendar.

## Considered Options

- **Quota windows as part of the agent calendar.** Rejected: R6's non-preemptive ledger
  failed its own case (a 300/240-minute window waiting 100 minutes for a 40-minute
  shortfall), and rate limits are "a rate over a moving window" — a second discrete axis the
  solver does not see. A solver-facing quota must take the capacity-pool shape anyway.
- **No new calendar, only a smaller unit.** Rejected: it is exactly what the field evidence
  argues against.
- **Working window from the viewer's browser zone.** Rejected: a reader's zone would move
  every plan's days — the fault ADR 0024 refused a time of day for.
- **Kind inferred from the assignee's person kind.** Rejected: CONTEXT **Agent** says the
  person kind is a label reports read, and an unassigned step would have no kind.

## Consequences

- A CP-SAT proof script beside `cpsat-proof/prove_dependencies.py` must show a
  mixed-calendar plan solving before this change's engine slices are specified (Dany,
  2026-09-26: model it in OR-Tools and make it pretty).
- The default window is 480 minutes, so plans placed under ADR 0041's constant are
  byte-identical under the default; the live-plan identity oracles prove it.
- Successors of agent work can start at night; the human successor rolls forward to the next
  working instant, which R6 found already required.
- `forecast-remaining-work` (done nodes at zero remaining duration placed at their attempts'
  span) is this change's last slice, not an earlier one.
