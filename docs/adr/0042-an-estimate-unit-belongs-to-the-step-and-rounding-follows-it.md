---
status: proposed
---

# An estimate unit belongs to the step, and rounding follows the unit

Assumed by Fable 5.1 on 2026-10-11 under Dany's 2026-10-10 `/goal`; veto sheet
`puni-plan/batch-10/interviews/VETO-SHEET.md` (lines `09-Q1`, `09-Q2`, `09-Q3a`). Change:
`openspec/changes/estimate-units`.

Agent-executed steps are estimated in minutes and human steps in workdays, and both live in
one project. We put the **estimate unit** (`workdays | minutes`) on the project **step**, not
on the estimate row and not on the step's executor kind; a minute-unit trio is three whole
minutes in the same three columns, and the charge is `ceil` to the minute after the
allowance, while workday-unit steps keep ADR 0011's per-step project rounding unchanged.
ADR 0011 stays accepted with its scope narrowed to workday-unit steps.

## Considered Options

- **Unit on the estimate row.** Rejected: during a blue/green swap the outgoing colour writes
  trios with no unit, so the incoming reader must default the blank (R5 forbids) or throw on a
  row the old colour legitimately wrote. A step column with `DEFAULT 'workdays'` records a
  fact (the only unit that ever existed) and an old writer cannot change it.
- **Unit derived from executor kind.** Rejected: a human "Approve" step is honestly a
  30-minute step and an agent batch job is honestly a two-day one; tying unit to kind forces
  the first into fractional days under project-wide `exact`, moving every other human
  estimate's rounding too. Kind decides the calendar; unit decides the arithmetic.
- **Everything in minutes.** Rejected: rewrites every human estimate and invents an
  hours-per-workday convention at storage.
- **Everything in fractional days.** Rejected: an agent's 40 minutes becomes `0.0833…` of a
  day nobody defined, and R6's drift measurement shows the gain is avoiding that conversion
  layer, not fixing a snap failure.
- **Reuse the solver quantum (a 48th of a workday, 10 minutes at 480) as the grain.** Rejected:
  a solver-width coincidence; R6 A.3 showed a 12-minute step inflated when ceil'd to the quantum
  at storage. The quantum stays at the CP-SAT boundary, where the `horizon-overflow` preflight
  guards the 32-bit axis.

## Consequences

- Changing a step's unit while it holds estimates is refused with the count; nothing is ever
  converted. `MAX_ESTIMATE_MINUTES = MAX_ESTIMATE_DAYS × 480` keeps the 32-bit solver axis.
- Until the instant axis (ADR 0043) a minute slice is placed as `minutes / 480` fractional
  workdays, exact, with 480 a domain constant.
- One `showDuration` formats both units everywhere, so the table and the chart cannot
  disagree on the unit — the fault ADR 0011 exists to prevent, moved to the unit.
- An older image reads a minute trio as days, so rollback and the swap refuse code that
  cannot read a stored `minutes` unit, exactly as they refuse an unreadable hold (ADR 0032).
