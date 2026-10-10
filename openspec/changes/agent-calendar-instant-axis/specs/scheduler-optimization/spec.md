## ADDED Requirements

### Requirement: The solver plans in minutes with per-slice calendars

The solver request SHALL carry durations in minutes (quantum 1) and each slice's calendar as
forbidden intervals or none; the preflight SHALL refuse a horizon above the signed 32-bit bound
in minutes as `horizon-overflow`; the result revalidation SHALL refuse a windowed slice
occupying a forbidden interval as `invalid-output`. The scheduler contract version, the cache
DTO version and the solver wire version SHALL be allocated at packet time, and both engines
SHALL agree on every corpus case.

#### Scenario: a forbidden interval is never occupied

- **GIVEN** a solver result placing a `human` slice across 17:00–09:00
- **WHEN** it is revalidated
- **THEN** it is refused as `invalid-output` and the Fast baseline is served

#### Scenario: a minute horizon overflows loudly

- **GIVEN** a plan whose legal slices sum past the signed 32-bit minute horizon
- **WHEN** the request is built
- **THEN** the preflight refuses `horizon-overflow` and nothing is sent to the solver

#### Scenario: both engines agree

- **GIVEN** every golden corpus case with one step set `agent`
- **WHEN** Fast and the solver schedule it
- **THEN** the solver's result revalidates against the same calendars and both report the
  same day boundaries for every windowed slice
