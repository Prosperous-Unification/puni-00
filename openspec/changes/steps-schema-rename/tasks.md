<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. Precondition

- [ ] 0.1 **Blocked on `steps-not-phases` merging.** This change deletes a boundary comment that change writes; applied first it renames a schema no code reads by the new name.

## 1. The prod-release gate

- [ ] 1.1 `bin/assert-no-prod-release.sh`: reads the recorded release state; a named colour fails with the D2 path printed, an absent/unreadable file fails as unreadable, only an explicit never-deployed state passes — test: `tools/` spec `refuses a recorded colour`, `refuses an unreadable state file`, `passes on a never-deployed state`; negative: the unreadable arm replaced by a `|| echo ''` default, watched failing on `refuses an unreadable state file`. This is R5's exact recurring fault; the negative is the point of the slice.
- [ ] 1.2 The migration lint's allowlist entry for this migration requires 1.1 to pass — test: the lint refuses the migration with the gate script absent; negative: the requirement removed, watched failing.

## 2. The migration

- [ ] 2.1 `migration.sql`: `role`→`step`, `role_progress`→`step_progress`, `role_id`→`step_id` on `estimate`, `actual`, `step_progress`, `assignment`, `token_estimate` and the event-log projection. `down.sql`: the exact inverse, statement for statement.
- [ ] 2.2 `migrate-down.test.ts` round trip: apply, roll back, compare the full schema **and** every table's row count and contents — test: `the step rename rolls back to the schema it found`; negative: one `RENAME COLUMN` omitted from `down.sql`, watched failing **on the schema comparison** (a count-only assertion cannot see it — design D3).

## 3. The schema and the boundary comment

- [ ] 3.1 `schema.ts`: `sqliteTable('step', …)`, `text('step_id')`, `stepProgress`; the boundary JSDoc `steps-not-phases` added is **deleted** — test: existing repository tests green unchanged; one assertion that no schema comment mentions a physical/domain disagreement.

## 4. Gate

- [ ] 4.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, migration lint, `CI=1` Playwright on shifted ports.
- [ ] 4.2 A dev deploy that restarts be-01 (the migration is read at startup — `docs/runbook-dev-deploy.md`), with the applied set read back and quoted in `verify.md`.
