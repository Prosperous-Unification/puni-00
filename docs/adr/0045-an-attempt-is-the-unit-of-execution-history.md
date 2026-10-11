---
status: proposed
---

# An attempt is the unit of execution history, and instants live on it

Assumed by Fable 5.1 on 2026-10-11 under Dany's 2026-10-10 `/goal`; veto sheet
`puni-plan/batch-10/interviews/VETO-SHEET.md` (lines `10-Q1` to `10-Q6`, `10-Q8`, `10-Q9`).
Change: `openspec/changes/step-node-attempts`.

A step node's work is retried, reviewed in rounds and run overnight, and the only record was
a two-word statement plus a date-only pair on the work item. We add **attempts** — one row
per `(work item, step, attempt number)` in `step_node_attempt`, with start and end
**instants**, an outcome, an executor and one reference — never pruned, written by
`startAttempt`/`endAttempt`/`removeAttempt`, at most one running per node. Attempts write
no progress statement; a node's and a leaf's spans are derived from them. Row facts stay
**date-only** (ADR 0024), displayed and filled in a per-project IANA **timezone** that
defaults to `UTC` and is never the viewer's; the engines read neither attempts nor progress.

## Considered Options

- **`plan_event` filtered per node as the history.** Rejected: pruned at 365 days, ids not
  foreign keys, and a transition is not an attempt (no own start, end or outcome).
- **Per-node first-start/last-end columns.** Rejected: discards the "two dead, six
  defective" signal batch 1 showed a start/end pair hides.
- **Facts become instants.** Rejected: every `IsoDate` caller — export, import, saved-plan
  comparison, the completion prompt — would decide instant or day for a fact the planner
  types as a day.
- **`endAttempt succeeded` marks the node done.** Rejected: one act, one meaning; a
  succeeded run is not an accepted node, and the derived reading already shows the attempt.
- **Viewer's timezone for display.** Rejected: a reader's zone would decide which day the
  work finished on (ADR 0024).
- **`failed`, `waiting` or `skipped` as stored progress states.** Rejected: `step_progress`'s
  CHECK cannot widen without a rebuild (ADR 0032), `agree` would become N-state, and the
  next attempt's `in_progress` would overwrite `failed`. Failed is an attempt outcome,
  waiting is a derived reading, skipped is participation.

## Consequences

- `setStatus done` on a leaf with no fact end and an ended attempt fills the fact from the
  last attempt's end day; `in_progress`/`done` with no fact start fills it from the first
  attempt's start day; otherwise the day of the act, in the project zone — byte-identical to
  today under the `UTC` default.
- `down.sql` refuses while attempt rows exist, naming the save/remove/restore CLI, as the
  statuses change does for holds; the swap's stored-vocabulary step checks the outcome set.
- Nobody "fixes" the frozen forecast in passing: a done node at zero remaining duration is
  `forecast-remaining-work`, the last slice of ADR 0043's change, because both engines must
  agree on an instant axis and the live-plan identity oracles exist to prove reporting-only
  changes move no dates.
