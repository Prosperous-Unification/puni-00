## Context

Three facts exist and do not meet. Claude Code writes one JSONL transcript per session
under `~/.claude/projects/<cwd-slug>/`, with `message.usage` on every assistant entry, the
model, the session id, the git branch and the request id; a streamed response repeats the
same usage on every content-block line of one request, so a naive sum overcounts
(measured 2026-10-22: 532 usage lines, 202 request ids; across the week's transcripts 584
repeats differed only in a growing `output_tokens`). Codex writes one rollout per session
under `~/.codex/sessions/`, with `session_meta.git.branch`, `turn_context.model` and
cumulative `token_count` events; across 4,808 rollouts 11,021 events were exact repeats and
15 restarted the counter, so the cumulative advance, not `last_token_usage`, is the usage. The repository's
`main` receives only merge commits whose subject names the pull request and head branch
(59 in the week to 2026-10-22; pull requests into plan branches arrive nested inside them).
Twilight Burokrat already defines `PriceIdentity`, `RawUsage` and charged micros for
experiment receipts; WBS already stores `token_actual` and nobody writes it.

## Goals / Non-Goals

**Goals:**

- One command that turns the period's logs into an efficiency breakdown an operator can
  hand to a client: money per accepted outcome with its evidence and its remainder.
- Numbers that a second person can recompute from the same files.

**Non-Goals:**

- Live or continuous collection, WBS writes, quota accounting, splitting ambiguous sessions.

## Decisions

Assumptions a careful colleague would take today, recorded so Dany can overturn them by id:

- **A1 Accepted outcome.** A first-parent merge commit on `main` whose subject names a pull
  request. A pull request merged into a plan branch is accepted when that branch's merge
  reaches `main`; its head branch is a member branch of that outcome. A WBS step stated done
  becomes a second outcome kind in a later change.
- **A2 Cost basis.** Provider list prices from a versioned rate card committed with the
  tool, one entry per model with per-million prices for `input`, `cacheWrite`,
  `cacheWriteExtended`, `cacheRead` and `output`, each with its source URL and access date.
  The breakdown states API-equivalent cost and names the rate card digest. Subscription
  discounts are not modelled. A model absent from the card leaves its rows unpriced; the
  unpriced token volume is a reported figure, never zero.
- **A3 Attribution.** Per usage row, in order: the session referenced exactly one accepted
  pull request number in tool output, by `github.com/<owner>/<repo>/pull/<n>`, then that
  outcome; else the row's branch equals an outcome's head or member branch, then that
  outcome; else unattributed with a reason: `on-default-branch`, `no-branch`,
  `branch-not-accepted`, `ambiguous-references`. Coverage is attributed cost over priced
  cost. The blended figure, total priced cost over accepted outcomes, needs no attribution
  and is always reported.
- **A4 Sources.** Claude Code transcripts, read recursively so subagent transcripts count,
  one row per request from the last line of that request (output grows while a response
  streams; input and cache counts never change, and a line that breaks that refuses). Codex
  rollouts, one row per `token_count` event from the advance of the cumulative counter per
  category (events repeat and the counter occasionally restarts; a category that falls
  without a restart refuses). A line that is not JSON is skipped and listed, because live
  sessions leave torn lines and a run that refused on them would never complete. Rows with
  zero tokens in every category are dropped. The harness version is recorded per row because
  the formats are internal.
- **A5 Home.** Twilight Dash, which owns execution facts, as `account-outcomes` under
  `src/ledger/`. Burokrat's `PriceIdentity` is reused for the rate card identity.
- **A6 Time.** `--since` and `--until` are required instants; Dash reads no clock.
- **A7 Human effort.** Out of scope; the breakdown carries no human-time figure rather than
  a zero.

## Risks / Trade-offs

- Transcript formats change between harness versions. Mitigation: boundary validation of
  the subset read, version per row, a refusal naming file and line, fixtures from real
  shapes.
- Branch attribution misses sessions that work in another worktree while their cwd stays
  on `main`. Mitigation: pull-request references take precedence; unattributed cost and its
  reasons are visible, so the gap is a measured figure, not a silent loss.
- List prices overstate subscription cost. Mitigation: the figure is labelled
  API-equivalent and the rate card is cited; the quota study in the private notes remains
  the place for actuals.
