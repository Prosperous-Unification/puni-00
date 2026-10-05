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

- [ ] 2.1 Test then integrate durable capture in
      `tools/tool-remote-scripts/src/swap.ts`, its migration command builders and `swap.test.ts`.
      Add `refuses migration when capture cannot be persisted/read back` and `aborted swap restores an older candidate migration` using the actual backend CLIs against disposable
      SQLite at the command adapter boundary. Test `zero-exit rollback with changed ledger is not success` and `manual recovery command remains usable after candidate cleanup`.
      Remove capture-before-migrate and final equality separately to observe failures. Update
      `docs/runbook-prod-deploy.md`; do not alter routing/serving or snapshot-restore policy.
- [ ] 2.2 Test then carry complete capture through
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
- [ ] 3.2 Review against every delta scenario, record watched R5 faults and restored positives,
      validate OpenSpec and affected format/test/lint/typecheck/build targets, then run
      `bin/h2puni-gate.sh <exact-implementation-sha>` and required CI. Update AGENTS' migration
      CLI reference and runbooks to the implemented interface without changing the invariant.
      Review legacy in-flight deployment compatibility before adoption. Only then claim the
      repair complete and unblock #259 on this route; planning-artifact validation alone is
      not implementation or deployment evidence.
