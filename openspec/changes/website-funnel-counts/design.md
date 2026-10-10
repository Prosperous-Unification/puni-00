# Design: website funnel counts

Decided in the batch 10 website scope decisions D3 and D6 (assumptions V3 and V6); this file
records the technical shape.

## Counting rules

`readFunnelCounts(database, now, days = 30)` in `libs/website/adapters/store-sqlite/src/funnel-store.ts`
returns one row per UTC day, newest first, every day present with zeros. Each figure is one
grouped `count(*)` over an existing table; nothing is written and no table is added.

| Figure                 | Rows                                                                              | Day taken from            |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------- |
| `drafts`               | `intake_draft`                                                                    | `created_at`              |
| `conversationsStarted` | `conversation` with at least one `conversation_operation`                         | `conversation.created_at` |
| `briefsCaptured`       | completed `brief`-stage `conversation_operation` with `brief_capture` not `empty` | operation `created_at`    |
| `exhausted[reason]`    | `conversation` in state `exhausted`, by `exhausted_reason`                        | `conversation.created_at` |
| `proposals.fromChat`   | `proposal_submission` whose draft's conversation is `handed_off`                  | submission `created_at`   |
| `proposals.manual`     | every other `proposal_submission`                                                 | submission `created_at`   |
| `ceilingSettled`       | `conversation_operation` in state `unknown`: count and `SUM(settled_micro_usd)`   | operation `utc_day`       |

- A conversation refused at its first admission (a source or site ceiling) is stored as
  `exhausted` without an operation: it counts as exhausted, not as started.
- Exhaustion has no timestamp, so it is attributed to the conversation's creation day (a cohort
  view). Adding an `exhausted_at` column was rejected: it needs a migration for a figure the
  operator reads as a trend.
- Draft retention erases expired unconsumed drafts with their conversations and completed
  operations, so a day past the retention cutoff is a lower bound for drafts, conversations and
  briefs. Proposals and `unknown` operations are retained.

`readCeilingSettled(database, utcDay)` in `guardrail-store.ts` is the one query for ceiling-settled
operations; the guardrail overview uses it for today as `ceilingSettledToday` and the funnel for
each day.

## API

`GET /operator/funnel` follows `GET /operator/guardrails`: operator session cookie or 401
`operator_unauthorized`, CORS for the app origin, `Cache-Control: no-store`, body
`{ days: FunnelDay[] }`. A GET needs no CSRF token. The route is counts only by construction: every
selected column is `count(*)`, a `SUM` of micro-USD or a day string.

## Operator page

`funnel-panel.tsx` validates the body at the boundary (`parseFunnelCounts` throws
`InvalidFunnelCounts`), then renders a summary line with the thirty-day totals and the from-chat
share of proposal requests, and a table of thirty rows inside a horizontally scrollable, focusable
region so the page itself never scrolls sideways at 320 px. Loading and a failed read are rendered
states. The Guardrails panel gains a "Ceiling-settled today" line.
