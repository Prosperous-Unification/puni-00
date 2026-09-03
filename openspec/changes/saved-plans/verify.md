# Verification

This file states what will be measured and how each check will be proved to fail,
so the plan is judged with its evidence obligations rather than after them. Every
row below is filled in with observed output before either successor task is
called done — a check with no observed failure is not done.

**Status, 2026-09-03.** The opening line here used to read "Nothing in
`tasks.md` has been implemented yet", written at the TASK-230 planning gate. That
is now stale: TASK-231 has landed slices 1 and 2 and tasks 3.0 through 3.3, and
four rows below carry observed output. An `Observed` cell names the date and the
**exact head** the observation was made at, because a fault watched at one head
says nothing about a later one. A cell that relays an earlier run's log rather
than re-observing says so.

## What is measured, not asserted

Two of these are measurements rather than exit codes, because an exit code has
already lied here once (`steps-schema-rename` shipped a `REFERENCES` clause
SQLite had not applied, and the check written for it passed against the broken
database):

1. **The tables exist as declared** — `migrate-cli.ts` against a fresh file, then
   `pragma table_info` and `pragma foreign_key_list` read back for `saved_plan`
   and `saved_plan_body`, and a write **through** the cascade, not just its
   declaration.
   **Observed 2026-09-03 at head `345e2d11`, h2puni, on a fresh
   `/tmp/t231-rehearse.db`:** `migrate-cli.ts` exit 0, `migrations applied`.
   `pragma table_info` → `saved_plan` **14 columns** (`id, project_id, name,
   created_by, created_at, input_schema_version, input_bytes, input_sha256,
   schedule_schema_version, schedule_bytes, schedule_sha256,
   schedule_input_sha256, scheduler_algorithm_id, schedule_absent_reason`),
   `saved_plan_body` **3** (`saved_plan_id, kind, bytes`). `pragma
   foreign_key_list` → `project_id -> project ON DELETE CASCADE` and
   `saved_plan_id -> saved_plan ON DELETE CASCADE`, both **applied by SQLite**,
   which is the half of this row that `steps-schema-rename` got wrong.
   **Still owed:** the write *through* the cascade. The declaration is read back;
   a project deleted and both tables re-read is 2.3's own row below and has not
   been run.
2. **The rollback runs** — `migrate-down-cli.ts` to the preceding migration, then
   `pragma table_info` showing both tables gone.
   **Observed 2026-09-03 at head `345e2d11`, same file:**
   `migrate-down-cli.ts --to=20260902120000_add_lookup_indexes` exit 0, then the
   same probe returns **0 columns and no foreign keys for both tables** — they
   are gone, not merely emptied. Run immediately after check 1 on the file
   check 1 built, so this is the real reverse of the real forward migration.
3. **A body's size against a real plan** (task 9.1) — the serialized byte length
   of the largest real project's plan-input body, printed, against the 8 MiB
   limit. This is A-3's falsifier and a number, not a verdict.

## Watched negatives

Each row's check is written first, then the named fault is injected on the
production call path and the failure watched, per R5. `Observed` stays empty
until it has been.

| Check | Fault injected | Observed |
| ----- | -------------- | -------- |
| Canonical serialization is order-stable (1.3) | work-item sort dropped from `canonicalisePlanInput` | **2026-09-03, run 1, head `ed8354bd`** (relayed from the task log, not re-observed since). Committed as a standing assertion rather than injected once: the byte comparison is run against a copy of the fold with exactly the work-item sort removed and asserted to differ, which is the only thing that catches a dropped sort — the value stays perfectly well-typed |
| No `UPDATE` targets `saved_plan_body` (2.4) | an `update(savedPlanBody)` call added in `repository/` | |
| No `UPDATE` targets a `saved_plan` column but `name` (2.4) | an `update(savedPlan).set({ inputSha256 })` call added | |
| Every read checks bytes against their hash (5.1b) | one byte of a stored body flipped with raw SQL | |
| Rename is permissioned like delete (6.2) | rename given the project's ordinary write rule — the third-party case must fail | |
| The concurrency refusal is SQLite-visible (4.4) | the mechanism replaced with an in-memory in-flight set, watched on two connections | |
| The quota check runs inside the write transaction (4.6) | the count check moved outside `BEGIN IMMEDIATE`, two saves at 99/100 | |
| `schedule()` runs outside the read snapshot (3.3) | `schedule()` called inside the snapshot — the liveness assertion must fail | **2026-09-03, head `c8f0bd4d`, watched red: 1 fail / 3 pass.** `readPlanInput` given the scheduler and calling it immediately before `tx.commit()`. `holds no connection open while the plan is scheduled` failed on `sampled` being `[1]` where `[0]` is owed — one handle live at the instant of the call. **Which three stayed green is the row's real finding:** `schedules every leaf from the captured values alone` samples the count only *after* the call returns and passed against the fault, which is exactly why 3.3's assertion is sampled from inside the scheduling call and not around it. Run as a watched red and reverted on both checkouts, not committed |
| The save never blocks on a single acquire (4.5) | the bounded retry replaced with one 60 s blocking acquire | |
| The stored schedule is deep-equal to `schedule()`'s return (3.4) | `resourcePredecessorId` dropped from the writer — the equality must name the key | |
| Project delete cascades to headers and bodies (2.3) | the `ON DELETE CASCADE` clause removed from the migration | |
| Capture is one read snapshot (3.2) | ~~the shared read transaction replaced with a connection per read~~ — retired, `bun:sqlite` has no pool, so that fault could only ever have been staged. Replaced by: the capture run on the **shared process handle** with a stranger's `UPDATE tag` interleaved | **2026-09-03, head `92cad22b`.** One scenario run twice, differing only in the connection handed to the capture. Own connection: the stranger's rename survives the capture's rollback, a third connection reads `renamed`. Process handle: the same write is inside the capture's transaction, the rollback revokes it, the third connection reads the pre-edit `urgent`. Both green; the pair is the assertion |
| Every capture-only read rides that snapshot too (3.2) | the registry and junction reads moved outside the transaction with the twelve left inside, then a `tag.name` rename interleaved — the registry-rename case must fail while every projection-boundary assertion still passes | **2026-09-03, head `cacf9e1b`, watched red: 17 fail / 1151 pass.** `tx.commit()` moved above `listTags`. Failures: the enclosure test and boundaries **2–17**, every other `be-01` test green. **The prediction in the middle column is wrong in the guard's favour** — one edit spanning both halves tears at every boundary from 2 up, not only the registry one. Boundary 1 stays green by construction: the write lands before the snapshot is taken, so the whole capture is legitimately post-edit. Run as a watched red rather than committed — a second implementation would prove things about itself |
| The compare route carries the project read rule (7.3b) | the route mounted without the read rule — 6.2's anonymous and third-party cases must fail | |
| The diff names every differing canonical field (7.2b) | `frozen_number`, then a tag id, dropped from `diffPlans`' comparison | |
| The diff names every differing schedule field (7.2c) | `diffPlans` built over the plan inputs alone — every schedule mutation must report "no change" | |
| `current` carries a live schedule, not an absent reason (7.3a) | `projectCurrentPlan()` returns the absent reason `unavailable` for `current` — the saved-vs-current date test must fail while 7.2b and 7.2c stay green | |
| `current`'s schedule runs outside the read snapshot (7.3a) | `schedule()` called inside 7.3's held `BEGIN DEFERRED` — 3.3's handle-liveness assertion must fail on this path too | |
| The other side survives an absent side (7.3a second case) | the comparison suppresses the other side's schedule whenever one side has none — 7.3a's second assertion must fail | |
| A successful retry captures a new read snapshot (4.5) | the retry reuses the refused attempt's detached values — the interleaved live edit must be missing from the stored input | |
| Immutability, asserted by hash (4.2) | one captured field dropped from the writer — the hash must move even though every asserted field is still present | |
| Save writes nothing on failure (4.3) | a throw injected between the header and the input body | |
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
| Peer | `anthropic/claude-fable-5` (Sol seat unavailable) | 2, 4, 5, 6, 7, 8 | recorded in the task log |
| Gemini | `openrouter/google/gemini-3.1-pro-preview` (agy and direct google failed) | 3, 4, 5, 6, 7, 8 | recorded in the task log |

Every round's full verdict is a verified artifact under `queue/reviews/` in the
ops workspace, with its byte length and SHA-256 recorded in the task log beside
the findings it produced and their dispositions. Rounds 3 and later are listed
here so a reader at archive time does not take the gate to have stopped at
round 2. The `openai/gpt-5.6-sol` seat was attempted at the head of every round
from 4 on and refused in under a second each time with the same Codex
harness tool-policy error, so the peer column names the model that actually
read the artifacts rather than the one the routing policy prefers.
