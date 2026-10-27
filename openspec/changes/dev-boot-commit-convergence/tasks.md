## 1. Report the boot commit

- [x] 1.1 Add `bootCommit` to the health contract's 200 and 503 shapes and `RefusalDetail`, read it once at the start of `bootBe01`, and pass it to the endpoint. Tests: `names the commit its checkout is at, not one captured at startup` (boot.db.test.ts), the contract's health shape test and refusal type test. Negatives: strike the boot wiring; make `bootCommit` follow `commit`; strike the field from the 200 schema; strike it from `RefusalDetail`.

## 2. Converge on the boot commit after a reset

- [x] 2.1 Add `convergeBootCommits` with an injected clock, fake tiers and a single restart, and `bootCommitOf` for the `/health` body. Tests: boot-convergence.test.ts. Negatives: remove the commit comparison; remove the restart.
- [x] 2.2 Call it from `sync()` after the reset, restart and recreate checks, through `docker exec … curl` and `docker restart`. Tests: the two rehearsal cases in `boot-commit convergence after reset` (sync.test.ts) over a real git origin and a fake `docker`. Negatives: remove the call; make the docker restart a no-op.

## 3. Document

- [x] 3.1 Runbook section _Which commit dev runs_, the app-source row, ADR 0005 amendment, `LLM_README.md` dev line and the _Boot commit_ glossary term.
