# Task 118 independent source review

Spec compliance: PASS for the bounded conditional source deliverable.
Task quality: PASS WITH NONBLOCKING EVIDENCE LIMITS.
Disposition: DONE_WITH_CONCERNS. No blocking or actionable code defect found in this review. This is not a whole-branch, merge, gate, native-operation or deployment approval.

## Scope and findings

Requirements were read before the diff: private task-118-brief.md, the complete public failed-repair-source-consumption.md, and the delta requirement including legacy no-relabel. Reviewed the complete six-file package against base 9034be7a2301f1944f30b524ada8f1a0303a7818, including the complete new recovery test. Package independently verified: 132484 bytes, SHA256 2f4c35f0d37d2c79bf06f7a9109627e80d2077fa3882e14ae6c22714c570c2ed. No git, test campaigns, source/index/HEAD edits, services, retained operations or subagents were used.

- No high/medium-severity code finding. The closed v2 bootstrap and semantic route preserve v1 encoding and the disjoint settlement transport. Historical v1 pins remain history; current six-role verification remains separate. The external exact capture is a derived finite role, not a directory-wide exception.
- `read_failed_relation` and `check_exact_failure` join the independently typed exact capture to the original request/reservation/ready/failure and the separate settlement terminal capture via `SettlementContext.read_history`. `read_failed_source` additionally requires the complete actual ledger credit and retained K. The implementation does not pretend settlement v2 committed the new capture hashes.
- `observe_failed_source` is invoked independently in worker readiness, coordinator readiness, and worker pre-write. Through `check_input_descriptors` it rechecks current executable/source identities, held evidence and the actual worker flock. It makes current map/snapshot and original-terminal observations. Only the coordinator captures PendingAttempt; it checks full debt/capacity and publishes the reservation before ACK. The worker reads the published full ledger after ACK and observes again before O_RDWR.
- `open_evidence` now closes the same-byte replacement window between pre-hash identity and retained FD capture. The selected metadata FDs remain part of the existing durability protocol. No seventh repair role or tenth settlement record is introduced.
- `check_repair_origin` prevents a marked or stripped legacy request from bypassing pending or settled failed history for the same inode. The selected tests exercise all three cases with watched omissions. Continuation uses the successor before-snapshot while inherited postboot remains bound to the predecessor; failed-successor tests retain new G plus K and prove the second-settlement refusal before consumption.

## Evidence assessment

Independently verified every final-freeze entry against the current file bytes and all 58 test-log-index hashes. Read the main final cohort and its failed-case rechecks. The accurate aggregate is 99 distinct selected passing cases: 91 passes and seven failures in the first 98-case cohort; six file-invocation instrumentation failures then passed; the pending-only fixture initially still failed with undefined `fault`, was corrected, then passed; one additional bootstrap capture-selection proof passed. These were harness/fixture repairs, not evidence that the initial cohort itself was green.

Independently reconstructed the cohort repair source by removing exactly the sole 98-byte Proof comment. It matches SHA256 0055da8a566800c9d91cb455d0b8133a1b6e8547a4360486d65821f7c87d9ca9 and 123967 bytes. Both the full entry AST with the independently checked embedded bootstrap normalized, and the embedded bootstrap AST itself, are equal to the final source. This supports production-code continuity; it is not a claim that every final test file was rerun together. No blind repetition is warranted by that comment-only production difference.

Final format and Python AST logs were read; indexed lint/whitespace logs are empty and their hashes match. Their exit success and exact frozen Fleet typing success are supplied by root, not independently rerun here. No full h2/h4 gate, full Fleet/browser/application suite or native campaign was performed or implied.

The supplied measured conditional budget is inside unchanged caps: repair 124065 bytes, worker 117435, six-role aggregate 446197; request 11236; 26 held metadata files / 40418 bytes, largest 7675; 27 selected metadata paths; ready frame 9754; peak measured descriptors 42 including instrumentation, maximum descriptor 41, cap64; outside physical bytes618496. The source sizes were independently verified. The remaining measurements are fixture evidence, not a proof of worst-case native heap, startup, physical or FD usage.

## Named limitations and concerns

Nonblocking evidence limitation: ordinary conditional fixtures substitute environmental prerequisites and native-size/runtime/service conditions. The physical audit records Python3.14.7, 256 audited launches and no physical3.12 attempts. The fixtures exercise the production control flow and real tiny-file FIEMAP/FD/lock/publication boundaries, but cannot qualify the native Python3.12/service closure or authorize actual operations.

Cannot verify from this package: historical observer executable/launch provenance; continuous staging-lock exclusion since the old observation; completed whole-launch input/consumer/outside qualification; actual native strict settlement and retained G release; actual fresh retained-inode/native/map/capacity admission; native resource ceilings; runtime4/11/Task97 or full observability acceptance. These remain explicitly open under the binding contract. The production qualifier still refuses before recovery verify_inputs performs the accesses that require qualification. Old booleans and revisions are not promoted to current authority.

Outside-diff inspection was limited to named concrete risks: `verify_inputs` tail and seed `read_pinned_json` for finite-role enforcement and stable metadata reads; `check_input_descriptors`, `check_lock`, `check_evidence` for actual flock/FD/source refresh; `read_repair_accounting`, `read_repair_namespace`, `read_settlement_namespace`, and `SettlementContext.read_history/observe_terminal` for complete namespace credit, K, distinct capture identity joins, and successor-history behavior. Those reads resolved the risks without additional tests. Source117 fixture files and root-owned public documentation were excluded from source review.
