## 1. Browser capacity repair

- [x] 1.1 Update `runs every browser shard and makes the stable pixels check depend on them` for eight shards, watch it fail on the four-shard production workflow, then update the workflow and pass; negative: remove shard 8 from the production matrix and observe the same test fail.
- [x] 1.2 Preserve organization coverage and the required aggregate, verify unchanged parsed configuration beyond shard scheduling, and record hosted timing and real Playwright partition evidence.

## 2. Focused verification

- [x] 2.1 Run the focused workflow suites, configured tool-git-hooks lint/typecheck, changed-file formatting, OpenSpec validation and normal commit hooks; record results and unavailable full hosted evidence in `verify.md`.

## 3. Bounded CI delivery amendment

- [x] 3.1 Pin the 35-minute timeout and exactly one cross-project browser command on shard 4 in the production workflow oracle; watch the original workflow fail, implement, and watch independent command removal, duplicate command, condition inversion and 25-minute restoration fail.
- [x] 3.2 Run focused workflow tests, lint/typecheck, format and OpenSpec checks; record the bounded receipt and every unavailable check. Hosted completion remains pending.
