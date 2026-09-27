# verify — address-step-nodes

## Spec-time commands

Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` on 2026-09-27, after the Astra high review fixes on branch `batch-9/step-nodes-spec`, reported 129 items, 129 passed, 0 failed; this change was valid. File-scoped `bunx prettier --check` on every touched file reported all files use Prettier style. No application behavior is verified by this packet; the h2puni gate result is recorded in the PR.

## Failure-proof table — pending implementation

| Check                      | Fault to inject                    | Test that must fail               | Result                                            |
| -------------------------- | ---------------------------------- | --------------------------------- | ------------------------------------------------- |
| Parent step node           | Accept a parent work item          | mounted parent refusal            | Pending                                           |
| Same-project step node     | Skip the project check             | mounted cross-project refusal     | Pending                                           |
| Unknown step node          | Accept an unknown step ID          | mounted unknown-node refusal      | Pending                                           |
| Reserved step code         | Drop the `s<digits>` check         | mounted step-create refusal       | Pending                                           |
| Swap backfill              | Swap ignores backfill exit status  | swap failure test                 | Failed on `Expected path: "message"` (2026-09-27) |
| Stale step reference       | Skip the revision comparison       | stale-reference resolve test      | Pending                                           |
| Single address form        | Accept both address forms          | mounted command refusal           | Pending                                           |
| Workflow edges             | Drop one workflow edge in the seam | Fast golden                       | Pending                                           |
| Node identity through undo | Omit the journaled mapping         | mounted undo identity test        | Pending                                           |
| Assignment hand-down       | Skip the assignment move           | mounted assignment hand-down test | Pending                                           |
| Duplicate code import      | Accept duplicate codes             | import refusal test               | Pending                                           |
| Reserved code import       | Accept a reserved code             | import refusal test               | Pending                                           |
| Uncoded export             | Export with an uncoded step        | export refusal test               | Pending                                           |
| Canonical reference shown  | Render the ordinal alias           | fe-01 step cell component test    | Pending                                           |

## Pending checks

- **Done (2026-09-27, migration PR):** `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` on `20260927150000_add_step_code/{migration,down}.sql` exited 0. `step-code-migration.db.test.ts` (5 pass) applies the migration, inserts through the outgoing release's three-column `INSERT` and reads `code` NULL, refuses a duplicate code in one project while allowing it in another, rolls back to `20260912120000_add_work_item_facts` and re-applies. Every reversal list in the store's migration tests names the new folder (185 pass across those files).
- **Proof (unique within a project):** with `CREATE UNIQUE INDEX` made `CREATE INDEX` in `migration.sql`, `refuses a code already held in the project, and allows it in another project` failed on `Received function did not throw`; restored.
- **Proof (strict rollback):** with `IF EXISTS` restored on the `DROP INDEX` in `down.sql`, `refuses to roll back a schema whose code index is already gone` failed on `Received function did not throw`; restored.
- **Pending:** uncoded read through the store after an old-writer insert (lands with the contracts' uncoded union).
- **Done (2026-09-27, backfill PR):** `suggestStepCode`/`suggestStepCodes` (`step-code.test.ts`, 14 pass); `backfillStepCodes` codes NULL rows per project in step order in one `IMMEDIATE` transaction, bumps each changed project's revision once and is idempotent (`step-code-backfill.db.test.ts`, 4 pass); `backfill-step-codes-cli.ts` codes an old-writer step, codes nothing on a rerun and exits non-zero on an unmigrated file (`migration-cli.db.test.ts`); the swap plans `backfill-step-codes` for be after `stop-blue` (or directly before `commit` on a first deploy) and `runStepCodeBackfill` fails naming `docker exec <container> bun run src/backfill-step-codes-cli.ts` (`reconcile.test.ts`, `step-code-backfill.test.ts`); a self-migrating boot codes old-writer steps (`boot.db.test.ts`).
- **Not wired:** the k8s lab release path (`tools/tool-deploy/src/k8s`) does not run the backfill; its steps stay uncoded there until the CLI is run by hand or that path gains the step.
- **Deferred to the contracts slice:** the backfill records no live event. Codes are not on the step wire shape yet, so no client can observe them; when they are, the backfill must announce what it coded.
- **Pending:** Unchanged Fast and solver goldens and request hashes through the new seam.
- **Pending:** Format, lint, typecheck, build, OpenSpec validation and the h2puni gate for the implementation.
