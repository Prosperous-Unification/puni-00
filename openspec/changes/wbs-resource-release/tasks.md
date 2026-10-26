## Design scope

These are the broader architecture slices, not claims of implemented behavior. The current
local rollout is tracked in `../wbs-resource-release-tracking/tasks.md` and
`../dash-resource-cleanup/tasks.md`; their verification records define delivered coverage.
Runtime reservation authority belongs in Dash, not in a second WBS ledger.

## 1. Resource uses and reservation settlement

- [ ] 1.1 Add immutable resource-use identity, attribution, charged reservation entries,
      dependencies and per-use lifecycle to Dash's Task 4 domain/store interfaces.
      Prove two physical copies on one leaf count twice, and transfers count the same
      physical use once. Model-test that only verified release reduces held entries.
- [ ] 1.2 Persist creation intent before the provider effect. Test crash before creation,
      timeout after creation and reconciled never-created release. Remove intent ordering
      in the production path and observe the orphan-resource assertion fail.
- [ ] 1.3 Integrate canonical host-pool admission across projects and aliases. Race two
      requests for one unit; removing the atomic reservation guard must start both and
      fail the independent launch counter. Keep logical WBS occupancy unchanged.

## 2. Mandatory cleanup lifecycle

- [ ] 2.1 Wire success, failure, cancellation, claim expiry, credential revocation and
      restart into durable cleanup requests under controller authority. Test each path
      without a live worker and with the worker credential revoked.
- [ ] 2.2 Seal the creation manifest after fencing creation; distinguish empty from missing.
      Prove an old writer cannot add an unmanaged resource after seal.
- [ ] 2.3 Implement deadlines, bounded retry/backoff, explicit blocked/unknown states and
      reserved cleanup capacity. Remove the unresolved-hold guard and watch a pending
      checkout incorrectly admit a replacement.

## 3. Local/SSH resource adapter

- [ ] 3.1 Implement inspect, preserve, exclude-writers, remove/return and verify operations
      for owned processes, temporary directories and Git checkouts. Test real process
      identity reuse, locator replacement, symlink escape and deleted-but-open files.
- [ ] 3.2 Preserve dirty/staged/untracked source and unique Git objects with a restore check.
      Make the destination unreadable and inject a late writer; each must block deletion.
- [ ] 3.3 Exercise alternates, registered Git worktrees, dependency symlinks and shared
      storage in disposable fixtures. Disabling dependency checks must break the retained
      checkout's independent Git/read oracle.
- [ ] 3.4 Add explicit retention and accepted transfer; account for backups and reusable
      pool storage. Watch disabled charge transfer falsely make disk available.

## 4. Durable history and recovery

- [ ] 4.1 Commit release event, exact reservation settlement and publication outbox atomically.
      Kill after removal/before commit and after commit/before acknowledgment; reconcile to
      one release with a surviving replacement canary.
- [ ] 4.2 Enforce use incarnation, cleanup generation, authority epoch and expected revision.
      Replay a stale owner after takeover and remove each fence to witness its negative.
- [ ] 4.3 Preserve unresolved state through runtime restart and authority recovery.
      Distinguish verified released units, retained bytes and unknown measured reclaim.

## 5. WBS storage, reporting and commands

- [ ] 5.1 Add guarded additive migrations for current uses, immutable release history and
      durable cleanup requests. Extend memory/SQLite conformance with replay and conflict
      cases. Allocate migration and API vocabulary identifiers against current integration
      state at implementation time.
- [ ] 5.2 Implement event ingestion scoped to a registered reporting authority with sequence,
      schema, identity and evidence checks. Add negatives for cross-tenant access, ordinary
      worker impersonation, sequence gaps and conflicting duplicate event ids.
- [ ] 5.3 Implement paginated project/organization reads and request delivery/acknowledgment
      as one end-to-end slice. Persisted WBS request reaches Dash, Dash emits an event, WBS
      shows the result; offline transport leaves the request pending.
- [ ] 5.4 Preserve history on attempt/step/work-item removal, hand-down, undo/redo, credential
      revocation and project deletion; refuse provider/resource cascade with unresolved uses.
      Verify no mutation of schedule input/hash or legacy claim behavior.
- [ ] 5.5 Specify additive route shapes and generated MCP descriptors for authorized reads
      and requests. Release certification remains restricted to the bound runtime reporter.

## 6. UI and operator recovery

- [ ] 6.1 Render separate work outcome and cleanup status, resource-use details and release
      history with actors, reasons, times, evidence, retained ownership and source freshness.
      UI cases: success/pending, success/blocked, settled/retained, released, stale and untracked.
- [ ] 6.2 Expose retry/cleanup requests and audited recovery dispositions with expected revision.
      Retention requires owner, reason and review deadline; unknown state cannot be dismissed
      as physically released. Reusable return never claims storage deletion.
- [ ] 6.3 Prove request-accepted is not rendered release-complete and transfer is not rendered
      reclaimed disk. Remove each rendering predicate and observe the wrong-label negative.

## 7. Managed rollout and release gate

- [ ] 7.1 Enroll managed roots and both harness creation paths, including subagents and review
      copies. Inventory legacy paths as untracked and test verified adoption.
- [ ] 7.2 Run the local end-to-end fixture: parallel implementation/review, forced worker
      death, unique work preservation, shared Git dependency, partial cleanup, WBS outage,
      controller restart, idempotent history delivery and retained-to-released follow-up.
- [ ] 7.3 Run required repository checks, record fresh production-path fault proofs in
      verify.md and validate OpenSpec. Report provider/harness coverage precisely.
      Container/volume support requires its own adapter proof slice before enrollment.
