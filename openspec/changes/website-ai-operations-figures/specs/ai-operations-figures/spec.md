## ADDED Requirements

### Requirement: In-flight calls and daily spend are visible

`GET /operator/guardrails` SHALL report `inflightToday` as the count of today's `inflight`
conversation operations and the sum of their reservations. Each `GET /operator/funnel` day SHALL
report `spendMicroUsd`, the day's recorded site spend: settled amounts, and reservations still in
flight. The operator panels SHALL show both, and a body without either SHALL be refused at the
browser boundary.

#### Scenario: Calls in flight

- **WHEN** two of today's operations are `inflight` with reservations of 4,000 and 6,000 micro-USD
- **THEN** `inflightToday` is `{ count: 2, reservedMicroUsd: 10000 }` and an operation of another
  day or state is not counted

#### Scenario: Spend per day

- **WHEN** a day has three completed operations settled at 900 and one stop settled at its 3,000
  ceiling
- **THEN** that day's `spendMicroUsd` is 5,700

### Requirement: Recovery keeps the day's spend

A restart SHALL settle every in-flight call at its full reservation, and neither a restart nor a
pause and resume SHALL lower the day's recorded site spend.

#### Scenario: Restart and resume

- **WHEN** today's spend is 7,000 micro-USD including a 6,000 in-flight reservation and the API
  restarts, then an operator pauses and resumes
- **THEN** today's spend is still 7,000 and no call is in flight
