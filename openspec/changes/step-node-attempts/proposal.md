## Why

A step node's work is retried, reviewed in rounds and run overnight, and the only record is a
two-word statement plus a date-only pair on the work item (WBS 020.10). Batch 1's "two dead,
six defective" runs are invisible to a start/end pair, and no fact in the product carries a
time of day or a zone.

## What Changes

- An **attempt** is one row of `step_node_attempt` per `(work item, step, attempt number)`:
  start and end instants (end null while running), an **attempt outcome** of `succeeded`,
  `failed` or `cancelled` (null while running), an executor person, one reference, a note.
  Never pruned; moves with the node's facts on hand-down.
- Three journalled commands on HTTP, the batch and MCP: `startAttempt`, `endAttempt`,
  `removeAttempt`, each with a verbatim inverse. One running attempt per node; a done node
  refuses a new attempt; `at` defaults to now; a future `at` or an end before its start is
  refused. Attempts write no progress statement.
- A project gains a **project timezone** (IANA, `UTC` unless set, never the viewer's) in
  which instants are read as days.
- Node and leaf spans are derived from attempts, never stored. `setStatus` fills an empty fact
  end from the last attempt's end day and an empty fact start from the first attempt's start
  day; otherwise the day of the act, in the project zone.
- The step cell card lists attempts and offers start and end. The plan document carries
  attempts and the timezone. Rollback refuses over attempt rows; the swap checks the outcome
  vocabulary.

## Non-Goals

Node readings and glyphs (`step-node-readings`); attempt marks (`gantt-attempt-marks`); the
engines reading attempts (`forecast-remaining-work`); an actor kind on the write stamp;
participation and node holds (010.4.13.3, `configure-project-step-workflows`); backfilling old facts; a second clock beside `at`.

## Constraints

Additive migration; blue and green share SQLite. `step_progress`'s `CHECK` and `plan_event`'s
prune are untouched. Row facts stay date-only (ADR 0024). Under the default `UTC` every
existing fill, test and golden value is byte-identical. Versions and the stamp are allocated
at packet time (`design.md`). Depends on nothing in flight.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: attempts, outcomes, spans, project timezone, fact fills, the card.
- `plan-command-registry`: three new command kinds.
- `plan-import`: attempts and timezone in the plan document.
- `saved-plans`: timezone in the captured settings; no attempts.
- `deployment-pipeline`: guarded `down.sql`, rollback CLI, swap vocabulary.

## Domain Terms

Progress, Hours fact, Fact start, Fact end (rewritten); Attempt, Attempt outcome, Project
timezone — applied to `CONTEXT.md` by task 0.2 from the glossary delta.

## Decisions Recorded

[ADR 0045](../../../docs/adr/0045-an-attempt-is-the-unit-of-execution-history.md).

## Impact

`@wbs/domain`, `@wbs/core`, contracts and MCP, be-01 (migration, CLIs, settings route),
`tools/tool-remote-scripts` (swap), fe-01 (settings, step cell card).
