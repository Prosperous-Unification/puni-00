## ADDED Requirements

### Requirement: Funnel counts derived from stored rows

The operator overview SHALL report, per UTC day for the last 30 days, counts derived only from
stored rows: drafts, conversations started, briefs captured, exhausted conversations by reason,
proposal requests split into manual and from-chat, and ceiling-settled operations. The response
SHALL carry counts only. `GET /operator/funnel` SHALL require an operator session, answer 401
`operator_unauthorized` without one, and send `Cache-Control: no-store`. A proposal request
SHALL be counted only from a `proposal_submission` row; it is from-chat when its draft's
conversation is `handed_off`, otherwise manual. No analytics script or event beacon SHALL run in
the browser.

#### Scenario: One day's rows

- **WHEN** today holds 3 drafts, 2 conversations with operations, 1 captured brief, 1 conversation
  exhausted on `turns`, and 2 proposal requests of which 1 comes from a handed-off conversation
- **THEN** today's row of `GET /operator/funnel` reads drafts 3, conversations started 2, briefs
  captured 1, exhausted `turns` 1, proposals manual 1 and from-chat 1, and thirty rows are returned

#### Scenario: Draft without a proposal

- **WHEN** a draft has no `proposal_submission` row
- **THEN** it is counted as a draft and never as a proposal request

#### Scenario: No content in the response

- **WHEN** the stored description, brief, email and message carry a canary phrase
- **THEN** the funnel response contains no canary text, email, claim or source hash

#### Scenario: Without an operator session

- **WHEN** `GET /operator/funnel` is requested without an operator session
- **THEN** the API answers 401 and returns no counts

### Requirement: Ceiling-settled operations are visible

`GET /operator/guardrails` SHALL report `ceilingSettledToday: { count, microUsd }`, the number of
today's conversation operations settled at their full reservation (`unknown`) and the micro-USD
recorded for them, and the operator Guardrails panel SHALL show both.

#### Scenario: Two stops and one completion today

- **WHEN** today has two `unknown` operations reserved at 3,000 and 2,000 micro-USD and one
  completed operation
- **THEN** `ceilingSettledToday` is `{ count: 2, microUsd: 5000 }`, and yesterday's `unknown`
  operations are not counted
