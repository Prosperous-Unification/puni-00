# Verification

**Nothing in `tasks.md` has been implemented yet.** This change is at its
planning gate (TASK-230); the slices are TASK-231 and TASK-232. This file states
what will be measured and how each check will be proved to fail, so the plan is
judged with its evidence obligations rather than after them. Every row below is
filled in with observed output before either successor task is called done —
a check with no observed failure is not done.

## What is measured, not asserted

Two of these are measurements rather than exit codes, because an exit code has
already lied here once (`steps-schema-rename` shipped a `REFERENCES` clause
SQLite had not applied, and the check written for it passed against the broken
database):

1. **The tables exist as declared** — `migrate-cli.ts` against a fresh file, then
   `pragma table_info` and `pragma foreign_key_list` read back for `saved_plan`
   and `saved_plan_body`, and a write **through** the cascade, not just its
   declaration.
2. **The rollback runs** — `migrate-down-cli.ts` to the preceding migration, then
   `pragma table_info` showing both tables gone.
3. **A body's size against a real plan** (task 9.1) — the serialized byte length
   of the largest real project's plan-input body, printed, against the 8 MiB
   limit. This is A-3's falsifier and a number, not a verdict.

## Watched negatives

Each row's check is written first, then the named fault is injected on the
production call path and the failure watched, per R5. `Observed` stays empty
until it has been.

| Check | Fault injected | Observed |
| ----- | -------------- | -------- |
| Canonical serialization is order-stable (1.3) | work-item sort dropped from `canonicalisePlanInput` | |
| No `UPDATE` targets `saved_plan_body` (2.4) | an `update(savedPlanBody)` call added in `repository/` | |
| No `UPDATE` targets a `saved_plan` column but `name` (2.4) | an `update(savedPlan).set({ inputSha256 })` call added | |
| Every read checks bytes against their hash (5.1b) | one byte of a stored body flipped with raw SQL | |
| Rename is permissioned like delete (6.2) | rename given the project's ordinary write rule — the third-party case must fail | |
| The concurrency refusal is SQLite-visible (4.4) | the mechanism replaced with an in-memory in-flight set, watched on two connections | |
| The quota check runs inside the write transaction (4.6) | the count check moved outside `BEGIN IMMEDIATE`, two saves at 99/100 | |
| The stored schedule is deep-equal to `schedule()`'s return (3.4) | `resourcePredecessorId` dropped from the writer — the equality must name the key | |
| Project delete cascades to headers and bodies (2.3) | the `ON DELETE CASCADE` clause removed from the migration | |
| Capture is one read snapshot (3.2) | the shared read transaction replaced with a connection per read | |
| The schedule body carries every field (3.4) | `resourcePredecessorId` dropped from the writer | |
| Immutability, asserted by hash (4.2) | one captured field dropped from the writer — the hash must move even though every asserted field is still present | |
| Save writes nothing on failure (4.3) | a throw injected between the header and the input body | |
| Save fails fast, never queues (4.5) | `busy_timeout` raised to 60 s — the live-edit assertion must fail | |
| Quota refuses before any write (4.6) | the quota check moved after the header insert | |
| The read never recomputes (5.1) | the reader re-derives dates from the stored settings — a date comparison would pass, the scheduler spy must not | |
| A schedule is refused against the wrong input (5.2) | the writer stores a mismatched `schedule_input_sha256` | |
| An absent schedule is not the live one (5.4) | the read falls back to the live scheduler | |
| An unknown body version throws (5.5) | the parser accepts an unrecognised version optimistically | |
| An old node's refusal is typed (6.4) | a bare 404 returned instead | |
| Normalising forward does not rewrite bytes (7.4) | the normaliser writes the upgraded body back | |
| An open comparison is not replaced (8.4) | the broadcast refetches into the open comparison | |

## The gate

`bunx nx run-many -t test lint typecheck` on **h2puni** — never on the ops box —
plus `bun x @fission-ai/openspec validate --all --json` on the exact pushed head.
Both outputs are pasted here verbatim when the slices land.

### Planning gate, TASK-230

| Seat | Model | Round | Verdict |
| ---- | ----- | ----- | ------- |
| OpenSpec validation | `@fission-ai/openspec validate --all --json`, h2puni | 1 | recorded in the task log |
| Peer | `openai/gpt-5.6-sol` | 2 | recorded in the task log |
| Gemini | per AGENTS.md seat order | 2 | recorded in the task log |
