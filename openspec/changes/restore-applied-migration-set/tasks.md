# Ordered TDD slices

Planning only. Astra owns architecture/review; Sol owns implementation and execution. Read
[design.md](design.md) and the delta spec before applying. No checkbox is earned by this draft.
While the #259 restamp is not independently cleared, complete this packet before integrating
that candidate. Use a main-based isolated implementation branch and preserve its original
migration identity. No dependency on host enrollment or completion of 070.09.

## 1. Capture and exact-set CLI

- [x] 1.1 Add a failing real-CLI regression for an older newly introduced migration after a
      newer baseline, then implement versioned capture and exact-set rollback beside
      `libs/wbs/adapters/store-sqlite/src/migrate-down.ts` and in the stable backend migration
      CLIs. Reuse existing per-migration transactions. Tests:
      `apps/wbs/be-01/src/migration-cli.db.test.ts` and
      `libs/wbs/adapters/store-sqlite/src/migrate-down.db.test.ts` cases `restores an older newly introduced migration`, `preserves an older migration already captured`, and
      `restores an explicit empty set`. Compare schema, complete name/hash ledger and sentinel
      rows; preserve legacy `--to=` behavior. Negative: reintroduce timestamp-cutoff selection
      and watch the actual CLI leave the older migration/table behind.
- [x] 1.2 Test then enforce capture/script/ledger integrity and bounded recovery in the same
      runner/CLI: `refuses missing capture`, `refuses unreadable capture`, `refuses malformed or duplicate identities`, `refuses another attempt`, `refuses an unexpected addition`,
      `refuses changed baseline identity`, `refuses changed forward or down bytes before any reversal`, `resumes after one committed reversal`, and `rolls back a failed down script with its ledger deletion`. Also cover partial forward application and repeated no-op
      recovery. Remove each safety comparison separately and record the corresponding
      production-path failure; unreadability uses a nonprivileged subprocess, not root mode bits.

## 2. Deployment callers

- [x] 2.1 Test then integrate durable capture in
      `tools/tool-remote-scripts/src/swap.ts`, its migration command builders and `swap.test.ts`.
      Add `refuses migration when capture cannot be persisted/read back` and `aborted swap restores an older candidate migration` using the actual backend CLIs against disposable
      SQLite at the command adapter boundary. Test `zero-exit rollback with changed ledger is not success` and `manual recovery command remains usable after candidate cleanup`.
      Remove capture-before-migrate and final equality separately to observe failures. Update
      `docs/runbook-prod-deploy.md`; do not alter routing/serving or snapshot-restore policy.
- [x] 2.2 Test then carry complete capture through
      `tools/tool-deploy/src/k8s/{release,execute,journal}.ts`, `BACKEND_TASK_SCRIPT`, schema Job
      rendering and manual recovery. Tests in `release.test.ts`, `execute.test.ts` and journal
      tests: older-stamp restore, hash mismatch, wrong attempt, crash/resume, and unsupported
      legacy capture without record mutation. Keep writer/Lease/Flux assertions. Execute the
      generated backend script against real SQLite; removing capture transport or restored
      identity comparison must make the production-path tests fail. Update
      `docs/infra/deployment.md`, preserving F8/F11's remaining live acceptance work.

## 3. Integrated failure proof and delivery

- [ ] 3.1 Extend the existing disposable k3s release rehearsal with a separately named older
      candidate migration and a newer pre-applied baseline, fail health, and prove exact
      ledger/schema restoration plus preserved baseline rows. Do not change LAB_MIGRATION or
      reopen 070.01. Prove rollback-failed retains its writer fence and usable manual command
      when a down script fails. Run `bunx nx run tool-deploy:test:k3s --skip-nx-cache` under
      the supported heavy-lock workflow; retain identities and outputs in verify.md.
      Pre-live fixtures and local proofs are prepared; this task remains open until the
      heavy-locked k3s scenarios pass and cleanup is verified.
- [x] 3.2a Before implementing the capability handshake, retain the observed generated-script
      RED for an old `--to`-only candidate in `execute-adapter.test.ts`: capture currently
      succeeds and creates a snapshot. Add backend contract tests in
      `apps/wbs/be-01/src/migration-cli.db.test.ts`, then implement
      `apps/wbs/be-01/src/migrate-capabilities-cli.ts` with the exact DB-free response in
      design.md. Tests: `advertises capture-v1 and restore-v1-sha256 without a database`,
      `refuses unexpected capability arguments`, and `advertised protocol completes exact-set restoration and refuses altered bytes`.
      Use the real status/down CLIs and disposable SQLite for the last test; a constant-value
      assertion alone is insufficient. Prove the DB-free boundary with DB_PATH unset and a
      nonexistent DB path that remains absent; fault an attempted DB/config dependency and
      watch the advertised-capability test fail. Record the restored positive and adjacent proof.
- [x] 3.2b Test then require that protocol at the start of Kubernetes capture in
      `BACKEND_TASK_SCRIPT`, without adding another SQLite observation. Use the actual generated
      script and candidate subprocess boundary in `execute-adapter.test.ts`. Cover missing and
      unreadable executable, nonzero exit, malformed/legacy stdout, wrong protocol/version,
      unknown fields, duplicate/unknown capabilities, and each missing required capability;
      a fake capability executable may return each fault while the surrounding script remains
      production code. Assert no SQLite open, snapshot creation or forward migration on refusal;
      use an absent or malformed database to distinguish capability refusal from later DB access.
      Add a coordinator refusal case in `execute.test.ts` proving no `state-captured` journal
      promotion or migration call, with existing rollback/fence handling retained. Separately
      remove the invocation, response validation and required-capability checks and observe
      the watched production tests fail; restore and annotate each check. Preserve the successful
      generated-script round trip and the advertised real-CLI contract from 3.2a.
      These offline preparations may run while 3.1 waits, but require fresh 3.1 live evidence
      on the integrated candidate before completion of 3.2.
- [ ] 3.2 After 3.1 and 3.2a/3.2b, review against every delta scenario, record watched R5 faults and restored positives,
      validate OpenSpec and affected format/test/lint/typecheck/build targets, then run
      `bin/h2puni-gate.sh <exact-implementation-sha>` and required CI. Update AGENTS' migration
      CLI reference and runbooks to the implemented interface without changing the invariant.
      Review legacy in-flight deployment compatibility before adoption. Only then claim the
      repair complete and unblock #259 on this route; planning-artifact validation alone is
      not implementation or deployment evidence.
