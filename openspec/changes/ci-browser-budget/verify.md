## Planning evidence,2026-10-22

Internal candidate only; no CI source change or local completion yet. PR 660 remains
at3fdc85cdcffa41e57936764c8de62a2557cf166b. Native worktree/baseline, implementation,
R5 negatives, reviews and cohesive exact-SHA gate/CI have not run for this correction.

Current CI run39840405151 browser2 original job120040011975 cancelled at 25 minutes
(19:29:26–19:54:46UTC). System package fetch22.7MB took11min27s. Layout logged
133/150successes and no completed failed testcase row before cancellation.

Its single bounded unchanged retry job120066754415 also cancelled at 25 minutes
(20:21:25–20:46:46UTC). Install20:21:45–20:32:46, including23.7MB package fetch
10min40s; Layout20:32:46–20:46:41 logged103/150successes, no completed failed
testcase row, and no final suite verdict. Both timeout annotations name the 25-minute
job bound. No third unchanged-head retry. Transport diagnostics remain in raw logs;
no complete application/root-cause or flaky/fixed claim.

The four original shards declare164/150/163/148cases (625total). Shard1 completed
163passed/1skipped in21.4 minutes, then2organization checks passed in23.2seconds.
Shard3 passed163 in9.9minutes; shard4 passed109/skipped39 in13.6minutes. Those skips
are retained, not new acceptance exemptions. Observed setup and layout maxima are
from different jobs; using them together is explicit budget planning, not a measured
single35-minute run or a guarantee every future run fits.

All original jobs used Ubuntu24.04 image20261012.334.1; retry used Ubuntu24.04
image20261018.339.1. The Ubuntu26 rollout notice does not establish the observed cause.
The same Azure Ubuntu mirror downloaded quickly in passing jobs and slowly in both
failed attempts. No mirror replacement or new base image is part of this correction.

Primary prior issue: [654](https://github.com/Prosperous-Unification/puni-00/issues/654),
open/unassigned when read; it records other25-minute cancellations and suggests35.
All 54 open PRs were searched for budget/timeout/pixels work and issue 654references;
none contained a budget correction. WBS MCP authentication remains unavailable, so
no new WBS claim or remote status update is asserted.

Raw log SHA256: original2
97ad492ed431e957e573cf8be18bfe4398757387659009a23fc6e7519631e390;
retry2 222aca466e8a162550e6e40355f8cd02755f3e02aa471c0853243c480e3f8267.
Hashes above are computed from retained bytes. Complete original/corrected analysis
and job/annotation captures remain in the parent limits-integration workspace.

Two diagnostic-analysis trials were corrected transparently: a Slow test file line
was initially counted as a test; an unanchored failure-glyph search then matched
multiplication signs in44×44 titles. Both prior analyses were retained. Final parser
extracts the leading status marker before testcase number, checked against success,
skip, failure and diagnostic probes. Neither timeout is presented as a complete pass.

## Isolated setup

Native worktree b8c9 (gitdir puni-0024), feat/agentic-ci-browser-budget, exactbase
3fdc85cdcffa41e57936764c8de62a2557cf166b, clean at setup. Native operation
fd9989fd-1d9a-499c-978c-79b27fd56c61 completed before use. Frozen install passed
1493packages (Bun summary673ms). Fresh exact workflow baseline passed6tests,35expect
calls,0fail in12ms. These initial checks are retained in the controller transcript;
no raw baseline file is invented. No production source change or R5 trial yet.

Parent3fdc canonical h2 host gate later completed exit0, but its browser CI remains
red after both25-minute cancellations. No unchanged-head third retry. Authority
source hold released after512RunStore tests; its clean e306f7e14 commit is under
independent read-only review while this separate task is the only implementation
writer. The first OpenSpec-skill lookup used a nonexistent global path; the actual
repo-owned skill was then read. That was navigation, not verification evidence.

## Implementation candidate

The actual pixels_shard YAML now declares35minutes, with four shards, every step,
scope, organization check, artifacts and required aggregate preserved. A new test in
the existing Bun.YAML workflow oracle pins that numeric field. The worker's TDD RED
read25instead of35:6pass/1fail/36expects; source change then passed7/0/36. Initial
RED/GREEN and permission-failed Nx attempts are controller/worker transcript evidence
only, not saved raw files. The report's initial claim that all failed raw logs were
retained was corrected explicitly; no missing bytes were reconstructed or invented.

| Check or fault                                | Observed outcome                                | Evidence limit                                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove actual pixels_shard timeout            | 6pass/1fail, receivedundefined; exactrestore7/0 | Parsed production workflow, no live service timeout                                                                                                 |
| Change35to36                                  | 6pass/1fail, received36; exactrestore7/0        | Same actual YAML field                                                                                                                              |
| Restore former25                              | 6pass/1fail, received25; exactrestore7/0        | Regression also refused                                                                                                                             |
| Uncached tool-git-hooks:typecheck             | PASS                                            | Earlier sandbox writes to .nx/dist denied; authorized escalation passed; Nx's historical flaky-task label is retained, not a source-flakiness claim |
| Uncached tool-git-hooks:lint                  | PASS                                            | Color-environment warning retained                                                                                                                  |
| Exact changed-file Prettier/focused test/diff | PASS;7tests/36expects                           | No browser/package/host/CI invoked                                                                                                                  |

Static commands used NX_DAEMON=false and task-specific NX_WORKSPACE_DATA_DIRECTORY,
NX_SOCKET_DIR and NX_CACHE_DIRECTORY under /tmp/ci-browser-budget-nx. Required native
worktree artifact writes used escalated access after the named sandbox failures;
repository configuration and generated outputs were not moved or changed to hide a
failure. Exact argv/durations/final logs remain in the ignored task evidence.

All three faults restore workflow SHA256
06cb96b79ec3449a2edd28fa920b8949e6713b9d900eb82ac36e8a51ec2fa160
before adjacent Proof comments. Root independently reconstructed that original and
all three mutant hashes from the completed source and matched all negative/restored
raw summaries. Final source SHA256:
workflow3483ed001b38c09d9dbec6034b73dc362f072134b25c94ed3aa0c8cfd1e2efcf;
testabda3c0f2bad4d7ad4c9758de7baeff20bd423eacb8d41692e9bcb59413041e5.

Root's present-state audit compared all11766staged mode/blob/path entries to the
immutable clean planningHEADf67d3ad6bb43340056742e15c4d53f9cda6857a1, all equal,
confirmed only the two authorized source paths dirty and compared complete parsed
before/after YAML structures: only the budget changed. The worker captured only two
index paths and a single raw-index hash, so no worker whole-index before/after freeze
or raw-byte invariance pass is claimed. Root's complete present-state comparison is
separate evidence and does not invent a historical capture.

Independent task and bounded whole-branch reviews remain pending. Task boxes remain
open until their specified behavior and required reviews are accepted. Final cohesive
exact-SHA canonical gate/applicable CI, actual35-minute hosted behavior and complete
browser verdict remain unverified at this new source. Original3fdcCI failures remain
unchanged. This internal correction is not independently published or activated.
