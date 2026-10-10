## ADDED Requirements

### Requirement: The solver plans in minutes with per-slice calendars, proven first

Before any engine slice of this change is implemented, a proof script beside
`prove_dependencies.py` SHALL show a mixed-calendar plan — a windowed human slice, a
continuous agent slice and a human successor — solving `OPTIMAL` or `FEASIBLE` in OR-Tools
with the successor at the next working instant, and its output SHALL be pasted into
`verify.md`. The solver request SHALL then carry durations in minutes (quantum 1) and each
slice's calendar as forbidden intervals or none; the preflight SHALL refuse a horizon above
the signed 32-bit bound in minutes as `horizon-overflow`; the result revalidation SHALL refuse
a windowed slice occupying a forbidden interval. The scheduler contract version, the cache
DTO version and the solver wire version SHALL be allocated at packet time, and both engines
SHALL agree on every corpus case.

#### Scenario: the proof precedes the code

- **GIVEN** `verify.md` without the proof script's output
- **WHEN** a slice 2–5 task is opened
- **THEN** it is refused by the packet's own task order; the gate is the paste

#### Scenario: a forbidden interval is never occupied

- **GIVEN** a solver result placing a `human` slice across 17:00–09:00
- **WHEN** it is revalidated
- **THEN** it is refused as `invalid-output` and the Fast baseline is served

#### Scenario: both engines agree

- **GIVEN** every golden corpus case with one step set `agent`
- **WHEN** Fast and the solver schedule it
- **THEN** the solver's result revalidates against the same calendars and both report the
  same day boundaries for every windowed slice
