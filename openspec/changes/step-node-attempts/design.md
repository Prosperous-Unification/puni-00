# design — `step-node-attempts`

Rationale lives in
[ADR 0045](../../../docs/adr/0045-an-attempt-is-the-unit-of-execution-history.md).
Interview: `puni-plan/batch-10/interviews/020.10-answers.md` Q1–Q6, Q8, Q9. This file is the
shape.

## Allocated numbers — allocated at packet time

Same procedure as `estimate-units/design.md`: slice 2 allocates the stamp, slice 5 the
document and schema versions, each rechecked against `origin/main` and the integration queue
and recorded in `verify.md`. Pins on `a3b1526b`: `PLAN_DOCUMENT_VERSION` 6,
`CANONICAL_PLAN_INPUT_SCHEMA_VERSION` 4, `SCHEDULER_CONTRACT_VERSION` 15 (unchanged: the
engines read no attempt), newest stamp `20261005110000_add_shared_people`. Versions taken by
`estimate-units` or `measures-vocabulary-and-size-templates` first push this change to the next.

## D1 — Storage

```
step_node_attempt (
  work_item_id       → work_item ON DELETE CASCADE,
  step_id            → step,
  attempt_number     INTEGER NOT NULL CHECK (attempt_number >= 1),
  started_at         INTEGER NOT NULL,              -- epoch ms, UTC
  ended_at           INTEGER,                       -- null while running
  outcome            TEXT CHECK (outcome IN ('succeeded','failed','cancelled')),
  executor_person_id → person (nullable),
  reference          TEXT,                          -- URL or label
  note               TEXT,
  audit columns (ADR 0012),
  PRIMARY KEY (work_item_id, step_id, attempt_number),
  CHECK ((ended_at IS NULL) = (outcome IS NULL)),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
)
INDEX step_node_attempt_by_step (step_id)
UNIQUE INDEX step_node_attempt_running (work_item_id, step_id) WHERE ended_at IS NULL
```

`project.timezone TEXT NOT NULL DEFAULT 'UTC'`. The two checks make "running" one state
(`ended_at` and `outcome` both null) and an end before its start unrepresentable; the
unique partial index makes a second running attempt per node unrepresentable too, so the `409
attempt_running` refusal is the modeled face of a constraint the database also holds. Nothing prunes this
table. `ATTEMPT_OUTCOMES` joins `stored-vocabularies.ts` and the migration's `CHECK`
enumerates it.

## D2 — Commands

Three new kinds in `definitions.ts` (the registry count moves by three):

- `startAttempt { …step address, at?: epochMs, executorPersonId?, reference?, note? }`.
  Inside the write transaction: the node's statement `done` → `409 node_done`; a running
  attempt on the node → `409 attempt_running`; `at` after the write stamp → `422
attempt_in_future`; else `attempt_number = max + 1` for the node and the row is inserted
  with `started_at = at ?? stamp.at`. Inverse: `removeAttempt` of that number.
- `endAttempt { …step address, outcome, at?, reference?, note? }`. No running attempt →
  `409 no_running_attempt`; `at` after the stamp → `422 attempt_in_future`; `at` before the
  running row's `started_at` → `422 attempt_ends_before_start`; else the row gains
  `ended_at`, `outcome` and any reference or note given. Inverse: the row's prior values
  verbatim (a patch, not a delete).
- `removeAttempt { …step address, attemptNumber }`: a correction path; `404 unknown_attempt`
  when absent. Inverse: the row re-inserted verbatim with its number. A later
  `startAttempt` takes `max + 1`, so a removed number is never reused.

None of the three writes `step_progress`. `setStatus done` on a node with a running attempt
leaves it running (the readings packet shows the contradiction; `endAttempt` corrects it).
`setStatus` keeps a kind count of its own and gains no field.

## D3 — Project timezone

`project.timezone` is an IANA zone validated at the PATCH boundary against
`Intl.supportedValuesOf('timeZone')` plus the literal `UTC` (the list is canonical zones and
Bun's JavaScriptCore list includes `UTC`; the test asserts both `UTC` and `Europe/Kyiv` pass and `Kyiv` is refused
`422 invalid_timezone`). Settings shows it in the project section, chosen from the **server's** list: `GET
/api/timezones` returns the zones this be-01 validates against, so the select can never offer a
zone the server refuses (a browser's `Intl` list may differ). `isoDateOfInstantIn(zone,
epochMs)` in `workday.ts` is the one zoned day function (`Intl.DateTimeFormat` with
`timeZone`, `en-CA` parts); `isoDateOfInstant` becomes `isoDateOfInstantIn('UTC', …)` and a
test pins the two equal for every stamp in the corpus.

## D4 — Derived spans and fills

`spanOfAttempts(attempts)`: `{ start: first started_at, end: last ended_at | null (open) }`
or absent with no attempts; a leaf's span is the same fold over its nodes. The work-item read
adds `attempts: { [stepId]: Attempt[] }` (ascending number) and `spans: { [stepId]: Span }`
plus the leaf's `span`. Fill rules in `setStatus` (`work-item.resource.ts`, one clock read):
`done` on a leaf with `factEnd null` and at least one ended attempt → the project-zone day of
the last `ended_at`; `in_progress` or `done` with `factStart null` and at least one attempt →
the project-zone day of the first `started_at`; otherwise `isoDateOfInstantIn(zone, stamp.at)`.
A typed day is never overwritten; an explicit `on`/`factStart` wins as today.

## D5 — Documents

Plan document: each leaf's `attempts` by step code (number, instants, outcome, executor by
directory name, reference, note) and `settings.timezone`. Import from earlier versions reads
no attempts and `UTC`; from the new version it refuses `invalid_body` an unknown outcome, an
end before its start, a running attempt that is not the node's highest number, an unknown
zone, or two running attempts on one node. Saved plans: `settings.timezone` joins the
canonical settings; attempts are not captured (as facts are not); the upgrade writes `UTC`.

## D6 — Rollback and swap

`down.sql` refuses while any `step_node_attempt` row exists, naming
`step-node-attempt-rollback-cli.ts save|remove|restore` (same shape as the status-facts
CLI), then drops the table and `project.timezone` (a zone is a planner's setting, lost as
readiness is; the refusal comment says so). `attempt-outcomes-cli.ts` prints
`ATTEMPT_OUTCOMES`; `ATTEMPT_OUTCOMES_VOCABULARY` joins `STORED_VOCABULARIES`
(`StoredVocabulary.key` widens with `'outcome'`) with the stored command `SELECT outcome, count(*) FROM step_node_attempt WHERE outcome IS NOT NULL GROUP BY
outcome`. An image without the CLI reads as supporting no outcomes, so a swap to it aborts
over any ended attempt and passes over none. The timezone has no vocabulary: an older image
never reads the column.

## D7 — fe-01

The step cell card lists the node's attempts newest first (`#3 failed · 14:02–14:41 · Kat ·
PR #12`), instants in the project zone, with `Start attempt` and, while one runs, `End
attempt` offering the three outcomes and a reference box; both go through the batch. The
project settings' project section shows the timezone as a searchable select over the list `GET /api/timezones`
returns. The glyph and the reading word belong to
`step-node-readings`.
