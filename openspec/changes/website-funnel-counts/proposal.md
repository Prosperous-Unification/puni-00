# Website funnel counts

## Why

WBS 060.06.3 asks for funnel analytics with verified conversion events, and 080.24.06 accepts
that unknown usage is settled at the full reservation, so recorded spend may over-count. The
operator today sees only today's draft and proposal caps and today's spend; nobody can tell how
many visitors reached a conversation, a brief or a proposal request, or by how much the spend
figure over-counts.

## What Changes

- **Funnel counts**: `GET /operator/funnel` (operator session, `Cache-Control: no-store`) returns,
  per UTC day for the last 30 days, counts derived only from stored rows: drafts, conversations
  started, briefs captured, exhausted conversations by reason, proposal requests split into
  manual and from-chat, and ceiling-settled operations.
- **Ceiling-settled visibility**: `GET /operator/guardrails` gains
  `ceilingSettledToday: { count, microUsd }`.
- **Operator page**: a Funnel panel below Guardrails with thirty day rows and the from-chat share;
  a ceiling-settled line in the Guardrails panel.

## Non-Goals

No browser analytics, beacon or third-party script; no new table or migration; no sign-in events
(prospect sign-in is being retired); no reconciliation of ceiling-settled operations; no export.

## Constraints

Counts only: the response never carries a description, brief, email, claim, source hash or
message text. A verified conversion is a `proposal_submission` row. Reads write nothing, so blue
and green may both serve the route. Every new check has a watched negative (R5). Public
repository; Bun and Nx; the h2puni gate.

## Capabilities

### New Capabilities

- `funnel-counts`: per-UTC-day funnel counts and ceiling-settled visibility on the operator
  overview.

### Modified Capabilities

None in `openspec/specs/`. The sentence on aggregate funnel events in the unarchived
`puni-website-funnel` delta is rewritten by the batch 10 scope slice (S1), not here.
