## Why

PUNI cannot say what one accepted change costs. A week of local harness logs priced by hand
shows thousands of dollars against 59 merges to `main`, counts duplicated transcript lines
and ties no cost to any outcome. Clients buy outcomes, not tokens, so the value of agentic
delivery must be stated as money per accepted outcome, from evidence, before any pilot is
priced. The 2026-10-22 assessment rerun named this an unmeasured criterion.

## What Changes

**Measured consumption per outcome**

- From: token counts live only in each harness's private logs; nothing relates spend to a
  merge.
- To: Twilight Dash reads the operator's Claude Code transcripts and Codex rollouts for a
  stated period, deduplicates and prices them from a versioned rate card, attributes them to
  accepted outcomes and writes an efficiency breakdown: cost per accepted outcome, blended
  and per outcome, with coverage and an explicit unpriced and unattributed remainder.
- Impact: non-breaking; one new Dash command and one rate card file.

**Honest unknowns**

- From: a model with no price or a session with no owner would be summed as zero.
- To: both are reported as their own figures; a malformed log line refuses the run naming
  the file and line.

## Non-Goals

- WBS writes, a WBS `cost` metric, or any client invoice.
- Subscription or quota accounting; the breakdown states API-equivalent list cost.
- Human, review or gate time; WBS `hours_actual` and W14 own those.
- Splitting one session across several pull requests; it is reported as ambiguous.
- Other harnesses, and logs on other machines.

## Constraints

- Dash reads no ambient clock: the period is two explicit instants.
- Transcript formats are internal to their harnesses; every field read is validated at the
  boundary and the harness version is recorded per row.
- Every refusal ships with a production-path negative and a `Proof:` comment (R5).
- Bun and Nx only; offline except for `git` on a local repository.

## Capabilities

### New Capabilities

- `efficiency-breakdown`: cost per accepted outcome from harness usage, a rate card and the
  repository's merge history.

### Modified Capabilities

- none

## Domain Terms

Accepted outcome, Usage attribution (added to `docs/twilight-structure/CONTEXT.md`);
Rate card, Efficiency breakdown, Delivery charge (existing).

## Decisions Recorded

none; assumptions A1 to A7 are in design.md.

## Impact

`apps/twilight-structure/twilight-dash/cli`: `src/ledger/`, the `account-outcomes` command,
`rate-cards/2026-10-22-list-prices.json`, README; `docs/twilight-structure/CONTEXT.md`. No
deploy, migration or API change.
