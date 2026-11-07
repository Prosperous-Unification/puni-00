# Private PostgreSQL lifecycle — whole-branch review

**Spec compliance: Approved for the private prerequisite. Task quality: Approved. No Critical, Important or Minor findings identified.**

**Ready to merge: Yes, conditional on successful current-head hosted CI, the required exact-source host gate, and root-owned fixture cleanup evidence. Those conditions are still pending; this review does not claim them passed.**

Reviewed base `89b2c2ebf9d12721315c87a37ab39fc1da8190a2` through head `f1790d53052f6cae9f5f14fadc87d456b0d1b651` in `/home/df/.codex/worktrees/3abd/puni-00`, using the supplied 49-path diff `review-89b2c2ebf..f1790d530.diff`. A final read-only HEAD check returned the stated head. Requirements were ADR0069, lifecycle-design.md, lifecycle-tasks.md, the provider delta spec, parent tasks.md and the publication record. The task reviews and ledger rulings supplied historical review/proof context.

## Strengths and cross-component assessment

- `apps/twilight-structure/twilight-dash/cli/src/runs/postgres/session.ts:77` validates every explicit timer budget before creating resources. Opening owns both reservation promises, observes writer identity through the reserved observer before callback admission, and attempts both pools' independent cleanups after failure. The late-reservation test verifies eventual reservation disposal after the caller's finite opening/cleanup observation has already rejected.
- `session.ts:167` keeps write lock acquisition separate from subsequent trusted callback reads under READ COMMITTED. Snapshot callbacks run in read-only REPEATABLE READ. `session.ts:191` awaits native COMMIT and validates its command tag; a real ROLLBACK tag, missing/unreadable metadata or transport ambiguity cannot publish the callback value or authorize semantic retry. The real-driver tests distinguish successful native persistence from an unavailable acknowledgement.
- `session.ts:239` separates caller completion from actual transaction settlement. `session.ts:155` fences immediately and rejects queued calls; the drain also checks the fence before invoking queued work. `session.ts:222` retains original/rollback cleanup causes when the caller has already timed out, and `session.ts:291` exposes available retained aggregates through sticky close. Ordinary errors with acknowledged rollback and rollback failures already reported through the operation retain their documented separate outcome.
- `session.ts:272` orders actual drain, writer disposal, fresh writer observation and final observer disposal under one close deadline. Reservation and pool cleanup are independent attempts. Timeout cannot certify cancellation or release; unsuccessful observation/disposal remains a sticky rejection. The observer survives writer disposal and its local final close is not represented as remote OS-process reaping or resolution of an unanswered COMMIT.
- `observer.ts:127` prepares one fixed SELECT containing the marker and complete activity inspection. Each EXECUTE validates observer identity, role and read-only continuity before interpreting the catalog. Exact PID/start registrations, startup cookies and parallel ancestry are considered together; retained supersession prevents an old PID registration from reappearing as an ownership root after observed replacement. Missing visibility, unresolved/cyclic ancestry, changed identity and lost/replaced probes reject rather than establish absence. No public arbitrary-SQL observer API or new production monitoring credential is introduced.
- `observer.db.test.ts:217` queries captured worker PIDs without leader/cookie/state/backend-type absence filters, validates complete start identities and positively waits under a finite bound. `observer.db.test.ts:442` preserves explicit null-link rejection and the live-worker pending assertion, ends observation with the exact controlled abort before native cancellation, then restores the complete probe and performs a fresh wait on the same reserved observer. The retained F3 test makes the fixture barrier independently falsifiable.
- `lifecycle-design.md:23` and the session JSDoc correctly constrain the callback/factory seam to private trusted adapter code and direct same-role connections. This is a prerequisite for later integration, not a general safe SQL callback surface. The supplied diff changes no existing RunStore/ArtifactStore port, SQLite implementation, production selector, migration or deployment path. A targeted caller search outside the new PostgreSQL directory found no lifecycle imports or invocations.

## Evidence and claim review

Read all seven new source/test files in bounded supplied-diff chunks. Read the current requirements and publication boundaries, all three final task reviews, ledger rulings, operation-map review, and historical publication/research context. This review did not repeat the existing source-map semantic audit or re-review every archived SDK implementation; their historical and source-only limits remain explicit.

Fresh read-only Bun checks verified compressed packet lengths/hashes and every decoded entry's length/SHA-256, unique relative paths and absence of traversal for:

| Packet                   | Entries | Original bytes |
| ------------------------ | ------: | -------------: |
| Observer                 |     150 |         386551 |
| Session                  |     412 |         658933 |
| Parallel fixture         |      78 |         191620 |
| Current-main integration |      46 |         396422 |

All current production module hashes match their published checkpoints. Session tests match the session checkpoint; the final observer fixture matches Task 3. The older observer packet's fixture hash differs as expected because it predates the explicitly documented fixture correction. The operation-map compressed and uncompressed hashes/lengths also match. A scan of the 22 changed Markdown files checked 60 local links and found no missing target.

Read the integration packet's original native suite stream: **54 pass / 0 fail across the four explicitly named source files**, with Bun 1.4.4. Its retained receipts and native outputs record uncached project lint/typecheck, complete `nx format:check --all`, and OpenSpec **328 valid / 0 failed** at integrated code `438243f5fc918455dd90197f44626bf7852b6629`. The complete-tree audit records 12921 entries, 37 feature paths, 198 incoming paths, no overlap and comparison of modes/types/blobs. These are inspected retained execution/composition records, not newly executed tests or a fresh independent recomputation of the entire merge tree.

The task reviews support the named production-path controls and exact restoration; this review checked their integration with the current implementation rather than replaying healthy campaigns. The historical Task 1 Python orchestration violation and missing earliest streams remain disclosed. Task 2 surviving/masked attempts remain uncredited. The original 52-pass/1-fail observer run remains evidence, and its missing raw catalog means the cancellation-transition explanation remains unproven. Neither the fixture correction nor subsequent passing runs are presented as proof of that original cause.

## Issues

### Critical

None identified.

### Important

None identified.

### Minor

None identified.

## Remaining acceptance and limits

Current-head hosted CI, the canonical exact-source host gate and positively owned fixture cleanup must still be recorded before merge acceptance. No full project tests/build were run locally according to the publication, and none were run by this reviewer. Unconfigured database tests visibly skip only when both fixture variables are absent; malformed/provided configuration rejects. Optional-profile local/CI success does not replace the retained configured real-server evidence or the later full-provider service integration requirement.

Physical-store namespace/lock/bootstrap binding, schema/migration/down identities, durable-settings admission, all 26+2 PostgreSQL operations, unchanged shared conformance, complete uncertainty/restart proofs, paused-writer transfer and production provider selection remain open in the parent tasks. Other adapters, automatic business mapping, physical continuation and S7a remain part of the unfinished full-thread goal. Approving this reversible private component does not redefine that goal or approve an operator-store migration or production deployment.

No tests, compilers, gates, database/Docker/network actions, archived-runner execution, new checkout, source/index/HEAD mutation or subagent delegation occurred during this review. Packet decoding was data-only. The sole write is this report in root metadata. The initial login-shell read emitted unrelated dconf permission warnings; subsequent reads used a non-login shell, and no verification credit derives from those warnings.

The component is coherent and mergeable once the outstanding acceptance conditions pass. No code correction is requested by this review.
