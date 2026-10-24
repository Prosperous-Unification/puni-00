# Bounded incident handdown review

Reviewed commit `1f58173211ba7a941c4afdb8511545f1fc3f7aaa`, against base `5cb98ca315b568029037f652a6e10b8a16e2b4ba`, in `/tmp/puni-incident-handdown`. Scope: first-child external incident handdown and compound compensation only. Read repository instructions/index, relevant OpenSpec design/spec/task 4.4, implementation diff, callers, tests, mutation scripts and retained evidence.

**Verdict: architecture and bounded implementation are acceptable, contingent on closing the P2 safety-evidence gap below. No demonstrated functional defect was found. This is not approval of full task 4.4 or the integrated release.**

## Severity-ranked findings

### P2 — Independently prove the final graph-result refusal branches

Location: `libs/wbs/application/core/src/service/incident-node-transition.ts:224–231`.

The new capability separately consumes `findEndpointConflict` and `findCycle`, returning a modeled refusal when either returns a non-null finding. The retained `final-graph-consumer` mutation substitutes `null` for the entire cycle read, and its production test injects a thrown delivery failure. That proves invocation of the read. The `final-graph-before-reattach` mutation proves its order relative to restoration. Neither proves the two new **result-handling predicates**: removing only `if (conflict !== null)` or only `if (cycle !== null)` leaves both existing fault oracles intact. The focused suite has no returned-conflict/cycle case at this final handdown boundary, and the packet's retained mutations contain no independent bypass of those predicates.

This is an R5 completeness defect, not evidence that the predicates currently behave incorrectly. Close it before declaring the bounded packet's safety checks proved or its integration review satisfied.

Smallest correction: extend `cross-project-dependency-lifecycle.controller.db.test.ts` using its existing `DependencyGraphGuard.prototype` seam and real `runSemantic`/SQLite unit of work. For each method, call the saved genuine method with `.call(this, projectId, change)`; only at the final call where `change === undefined`, after asserting all selected external identities have been restored, return a typed modeled finding. Endpoint example: `{ reason: 'node_on_parent', dependencyIds: ['incoming'] }`; cycle example: `{ kind: 'cycle', relationshipIds: ['incoming'] }` (also cover `self_node` reason mapping if convenient). Execute actual `service.create` after a preceding local patch, assert the expected modeled refusal and identical persisted tables/held announcements. Restore the prototype in `finally`.

Then independently bypass **only each non-null result refusal**, preserving the genuine graph call, and observe the production test fail on unsafe success or changed persisted state. Retain both failure logs and add adjacent accurate `Proof:` comments. These delivered-finding tests establish the consumer decisions; they must not be described as independent proof of the graph algorithm, which has separate domain/connected-graph tests.

### P3 — Committed evidence has trailing whitespace

`git diff --check 5cb98ca31..HEAD` reports six trailing-space lines: `memory-restore-duplicate.log:5` and `required-retention.log:5,294,583,872,1161`, under `evidence/task-4-incident-handdown-proofs/`. A clean-tree `git diff --check` does not examine these committed changes. This is non-functional. Parent reports that the six whitespace bytes have already been corrected on its integration branch; that newer tree is outside this reviewed SHA.

## Findings supporting the bounded design

- Incident discovery uses both directions, selects only external `node` endpoints on the structural source row, and preserves whole/descendant attachments. Canonical comparisons include identity, successor owner, type and both complete endpoint addresses; creation timestamp and actor are checked separately. Raw restoration preserves legitimate null creation audit.
- Detach, local structure, restoration, completed-graph reads, retained-row refresh and recording share the admitted outer unit of work. The modeled structural refusal is exposed at the capability's top level so conventional `commit: outcome.ok` cannot commit the detached interval. Failure tests include an earlier local patch and compare all persisted tables.
- Structural before/after checks constrain the capability to the first-child mapping and its inverse. It is not a general remote writer. The bound actor/owner, command stamp and lifetime checks are present. Current endpoint access and organization evidence come through the admitted endpoint capability; ordinary foreign edits remain refused even when a restricted readable remote successor participates in derived handdown.
- Compound history retains exact directional receipts and remote revision before-images. Replay verifies receipt-set coverage, persisted relationship/audit equality, current remote revisions and current endpoint evidence. Local touched identities are partitioned by structural project. History stays in the structural owner's journal; the mixed regression verifies remote journals remain unchanged.
- Recursive reference, restored-address, subject, estimate-unit and touched-row handling carries the compound command through nested batches and neighboring undo/redo. The fresh suite includes two consecutive mappings in one collected command and the earliest remote before-image. The packet candidly identifies recursive bookkeeping branches without independent mutation observations; it does not claim full replay-workstream proof.
- Raw staging is excluded from the retained store facade. Owner refresh occurs after raw endpoint revision bumps and checks authority again after the await. The suspended-refresh test proves irreversible graph closure at that boundary.
- SQLite uses synchronous transaction callbacks for physical staging under the existing outer writer. Memory adds creation-evidence snapshot/commit support, validates endpoint owner/step/leaf/organization at source restoration and bumps the old/new endpoint union. Fresh adapter cases exercise commit, rollback, audit preservation, stale receipt refusal and duplicate restoration.

## Fresh verification and limits

Executed the six-file focused command covering lifecycle, history, dependency context, memory source, memory typed fixture and SQLite external dependency migration. **119 passed, 0 failed, 1,132 assertions, 49.62 seconds**, exit 0. Full output: `/tmp/puni-incident-handdown-review-tests.log`. Working tree remained clean; no source edits were made during review.

Inspected the packet's mutation evidence, including the repaired missing anchor and previously masked work-item-owner case. Did not rerun mutations or independently verify every retained log. Several tests deliberately prove an earlier diagnostic/order while a later guard still prevents unsafe writes; the packet distinguishes these from unsafe-acceptance observations correctly. The P2 above is an additional explicit gap.

The existing broad optional legacy outside-edge undo failure is documented as reproduced on pristine base and is not attributed to this packet. I did not rerun that broad suite or pristine-base reproduction. No frozen dependency installation, full type/lint/build/CI gate, host SHA gate, secrets scan or migration lint ran in this review; their prior retained outputs are not fresh review verification.

The semantic positives use the real SQLite source, admitted endpoint context, retained working plan and service, but a test scheduler and collected announcements. They are not mounted command success/fanout proof. The old-base mounted positive is candidly recorded as committing and then returning HTTP 500 from the disconnected presenter. Parent now reports a mounted HTTP 200 with the endpoint moved on its combined branch; that integrated result is not independently verified by this review of `1f581732`.

Task 4.4 remains open. Predecessor/project deletion, successor deletion compensation, the remaining replay matrix, integrated mounted success/fanout and exact integrated SHA gate remain outside this bounded approval.

## P2 correction rereview — 9abd2dc46b4ee3044c8fc2fae3ecb0e1f09ba81b

**P2 is closed. The bounded first-child incident handdown packet is approved at this correction SHA. No remaining substantive finding was identified within the reviewed scope. Full task 4.4 and integrated release readiness remain outside this verdict.**

Reviewed only the correction atop `1f581732`, including the three new lifecycle cases, adjacent production proof comments, mutation script, both discriminating failure logs and updated evidence description. The tests use the existing real SQLite source/unit of work, retained owner projection and actual `WorkItemService.create` after a preceding patch. Each wrapper invokes the saved genuine graph method with its original receiver. Only the final call without a proposed-state override injects the returned finding, after checking that all expected external identities have been restored. The assertions require the exact modeled reason, unchanged complete persisted tables, a single final injection and the helper's empty held broadcaster; prototype methods are restored in `finally`. This is genuine production-path consumer coverage, with a deliberately synthetic graph finding rather than a claimed graph-algorithm proof.

`mutations-7.py.txt` independently disables only the endpoint-conflict non-null refusal and only the cycle non-null refusal. Both genuine graph reads remain in place. Each retained failure log shows its selected test receiving `outcome.ok: true` and `changed: true` instead of modeled refusal and atomic rollback; neither failed on setup, compilation or an unrelated later diagnostic. These observations close the two specific gaps in the original review. The intact third case also verifies `self_node` reason mapping.

Fresh rereview command: `bun test ./apps/wbs/be-01/src/controller/cross-project-dependency-lifecycle.controller.db.test.ts ./apps/wbs/be-01/src/controller/cross-project-dependency-history.controller.db.test.ts`. **41 passed, 0 failed, 658 assertions, 45.55 seconds**, exit 0. Output: `/tmp/puni-incident-handdown-rereview-tests.log`. `git diff --check 1f581732..9abd2dc46` passed; working tree was clean. No source edits were made. The retained mutations were inspected, not rerun, consistent with the no-source-edits review scope.

The earlier P3 applies to the original evidence commit; parent reports its integration branch already removes those six whitespace defects. The correction does not alter those logs. The parent's integrated mounted positive remains separately reported evidence, not a check rerun here. No additional type/lint/build/full-host/CI gate or frozen install was run for this rereview, and the original scope limitations remain in force.
