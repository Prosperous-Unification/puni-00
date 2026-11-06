# Task 115 scoped specification and quality review

**Final specification verdict: approved for the conditional source scope. Final quality verdict: approved after fix round 1.** The original P2 is addressed; no new actionable finding was identified in the fix diff. Fresh parent-owned Fleet typing remains separately pending at this review update. All operational limits below remain in force.

Reviewed the frozen package `/tmp/puni-task115-review-package.md`, SHA256 `9b00a7db83cbd43a931d33c2cca5833f0d682c2d4ce516744dd69fc795cd8f84`, against baseline `d19f34c182255f61438a3a48837e62edf432bd04`, the Task 115 brief/report, binding OpenSpec additions, and necessary unchanged coordinator/accounting/profile/cleanup callers. No source or repository documentation was edited.

## Initial specification verdict (superseded by round 1 below)

The implementation conforms to the reviewed conditional runtime design. No runtime correctness blocker was identified in this scoped inspection. Final Task 115 verification approval is withheld for the R5 evidence gap below.

- `SettlementPrerequisites.qualify` and `outside_bytes` remain unconditional refusal. Actual production entry reaches qualification before the latch or publication.
- The private weak-key registry issues authority only after checked native original-FD SETFLAGS to exact `0x80080`, same-FD fullsync success, and the before/after context, source, identity, mode, flags and selected-profile checks. The binding includes PID, exact context, original FD/identity/path, canonical request and reservation, request digest and source. Reader reconstruction, context copying, fork and positive flag observations do not grant authority.
- Normal and both failure publication calls check the live grant. The fixed publisher accepts only the two explicit historical/latched parent specializations and requires the new file to inherit the captured exact flags before allocation. Historical records remain exact `0x80000`; the allocation inspector remains unchanged.
- Full accounting observes every repair directory's flags. NOATIME O-only state requires the original namespace, counts as consumed, retains G plus K, and blocks a later setter/create through global admission. The successful-v1 route remains outside the strict failed/latched specialization. Qualified accepted settlement credits only selected oldG and retains K.
- Six roles total 414575 bytes, maximum 115650; all remain within 131072 each and 786432 aggregate. The nine names, K 33554432, surplus 5537792, worker/FD/time/memory/physical floors and historical native control are unchanged in the reviewed diff.

## Initial quality verdict: changes requested (P2 addressed in round 1)

### P2 — Add the missing watched proof for the attempt-consumption guards

Location: `tools/tool-fleet/src/lab-repair-worker.py:339–346`; coverage gap at `tools/tool-fleet/src/lab-settlement-consumption.test.ts:299–342` and `:360–380`.

Both new `settlement-attempt-consumed` checks protect repeat consumption and the exact initial namespace/flags. The suite has guarded `repeat-consume`, `initial-index` and `initial-extra` cases, but runs them only with `omission='none'`. No current test or retained log removes `settlement-attempt-consumed`; the watched vector list never names it. The adjacent `Proof:` comments therefore establish refusal cases, not the required watched breakability of these new checks. Other barriers can independently refuse the same faults, so those negative cases cannot demonstrate this guard's contribution.

Add focused production-path guard/dependency omissions for these new admission checks, explicitly grouping overlapping barriers where necessary while retaining native/expression evaluation. The repeat case should observe the forbidden additional setter, not merely a first create that a legitimate completed consumption would already permit. Capture the guarded refusal and actual forbidden mutation witness, and update the adjacent `Proof:` comments and evidence record. This is an R5/Task 115 verification blocker, not a demonstrated bypass in the guarded implementation. It does not require rerunning unrelated passing campaigns.

## Evidence assessment and limits

Fresh read-only verification checked all 47 entries in `hashindex.json`, all five frozen source/test hashes, all six role hashes and sizes, unchanged-role comparisons against the baseline, and the exact final fixture amendment against `mixed-only.diff`. `git diff --check` returned zero. The supplied full suite log records 175 pass / 1 isolated mixed-fixture failure, including all 42 new consumption tests passing; the corrected mixed test records 1 pass / 0 fail / 6 assertions. The amended block only initializes the disposable foreign historical release's flags and does not clear the original-directory latch. This is not described as a new all-green full-suite run.

Reviewed native, fork, O-only and missing-history RED records; guarded/omission/dependency vectors; actual process loss before and after fullsync; allocating create with no surviving name; reader flag controls; complete conditional chain and K-retention evidence. The syscall trace records original-FD ioctl return 0, same-FD fullsync return 0, then exclusive openat; original/new flags and original 0700 mode are checked. Fullsync omission/wrong-FD mutants demonstrate that a return-shaped replacement is insufficient durability evidence. Setter/reserve/serialization error results, security/profile facts, directory geometry and INDEX observation are explicitly modeled seams; these are not injected real kernel journal failures or target qualification.

Recorded publisher compatibility selection passed 22 tests, and the focused chain selection passed 5. Named Prettier output is successful; ESLint success is attributed to the implementation report because its retained log is empty. Parent reports successful owning typing before the sole embedded-Python fixture amendment. I did not rerun test campaigns, typing, lint, host gates, native/service operations, retained-state operations, or research. Existing cleanup ownership and compound failure propagation were inspected; newly opened accounting descriptors close in `finally`.

This review grants no operational authority, retained settlement/drain/debt credit, outside/bootstrap/runtime/security qualification, afterFailedRepair acceptance or full rehearsal completion. Task 97, runtime 4/11 and oldG 141754548224 remain pending. Independent Task 116 planning and read-only observations are outside this review and do not change those limits.

## Fix round 1 rereview

Scope was only `review1-only.diff` (SHA256 `2aa751660fe8a46b21fe64991393164eaa8bd91aa8ac8965d210345fb05cd413`), the appended fix report, and the new frozen/evidence records. The original whole-task review and passing campaigns were not repeated.

**Original P2: addressed.** Five guarded/omitted vectors now explicitly remove exactly the two `settlement-attempt-consumed` checks while evaluating their original predicates. They cover a repeated call after a checked modeled setter failure, an unsupported context subclass, changed initial flags, modeled INDEX and an occupied namespace. Every guarded vector records `settlement-attempt-consumed` with no actual setter; every omitted vector observes actual native SETFLAGS returning zero on the held original directory FD. The repeated-failure case proves the forbidden second setter invocation specifically, rather than relying on an otherwise legitimate first create. All vectors retain zero creates. Independent later type/profile refusals remain active and visible where reached. The two adjacent production `Proof:` comments now identify these witnesses.

The fault placement is appropriate: initial physical/accounting checks execute before the flags/INDEX/namespace fault is injected, isolating the subsequent exact-attempt guards without deleting unrelated protection. INDEX and the first failed setter remain explicitly modeled; the watched successful setter is actual native evaluation. The mutation selector asserts exactly two matching worker checks. Changes to the shared fixture add observation state and scenario-specific branches without changing the existing scenario paths' assertions or syscall effects. No new breakage was identified in this fix diff.

Fresh read-only checks verified all 13 round-1 hash-index entries, all five current frozen paths, the exact saved diff against its before-files, all six role hashes/caps, and worker AST equality. The production worker changes only two proof comments. Aggregate source size is now 414602 bytes; maximum remains 115650 and rounded role charge 425984. The other frozen source/test files remain unchanged from the initial review.

`review1-attempt-final.log` records 8 pass / 0 fail / 39 assertions in 2.91 seconds: five new guarded/omitted vectors plus the three directly relevant existing bounded cases. Named Prettier output is successful; named ESLint/AST/whitespace success is reported by the author, with the empty ESLint log retaining its prior evidence limitation. I did not rerun these tests or any previous campaign. Fresh parent-owned typing is pending because the fix adds TypeScript tests; the earlier typing result is not substituted for that check.

**Final specification verdict: approved. Final quality verdict: approved.** These verdicts cover the conditional implementation and scoped R5 correction, not completion of pending parent checks or any runtime/retained-operation qualification.
