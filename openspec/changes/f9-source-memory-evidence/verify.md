# Source memory evidence verification

Verified 2026-10-16 in isolated `/tmp/f9-source-memory-sol`, starting exactly at
corrected #518 head `904e610c0a44ee229e93c1e0c501ab8eb4b86511`.
No source checkout, historical receipt or running lab was changed.

## Boundary

`requireMemoryEvidence` now re-exports `validateSourceMemory`: its arguments are typed
in-process `CgroupObservation` samples, the expected first `PodObservation`, and an explicit
`SourceBinding`. The latter asserts Pod UID, full containerd ID, init PID/starttime and
exact cgroup path/device/inode. Every sample must match, include the bound init process,
have complete metrics and report exactly `2147483648` for memory.max.

The validator projects declared evidence fields and returns no verdict. It cannot establish
that an operator-supplied binding is authentic. Readiness, cold success, OOM attribution,
restored-checker success and acceptance remain separate. No JSON/file ingestion boundary
was needed or added: external JSON requires a separately validated adapter and must never be
cast into this API. Filesystem absence/unreadability tests remain in the sampler and recovery
suites; there is no new file reader here. `runRecoveryLab` stays disabled.

## Test first and watched negatives

The new tests first ran against the old text helper and failed because structured samples
were unsupported: [initial red](evidence/initial-red.log). After implementation the isolated
new suite passed: [initial typed green](evidence/typed-green.log). Final focused output below
includes the subsequently added missing-oom and process-completeness cases.

The initial mutation run removed production guards through the recovery module's public
`requireMemoryEvidence` export and restored the original file in a `finally` block.
Those receipts are retained below. Review found that the original binding negatives asserted
error text: some malformed bindings still failed at downstream guards. Their original failed
assertions therefore did not prove those specific malformed inputs could return evidence.
The revised behavioral proof below supersedes that part of the initial binding claim.

| Injected fault                                                                 | Observed failed negative tests                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [Source binding guard removed](evidence/fault-source-binding.log)              | Foreign/replacement/warm identity assertions; malformed-binding behavior superseded below |
| [Empty sample guard removed](evidence/fault-sample-count.log)                  | Empty samples                                                                             |
| [Exact cgroup guard removed](evidence/fault-exact-cgroup.log)                  | Sibling/prefix path, device and inode mismatch                                            |
| [Init member guard removed](evidence/fault-init-member.log)                    | Absent/replacement init PID and reused init starttime                                     |
| [Exact memory.max guard removed](evidence/fault-memory-limit.log)              | Missing, unlimited, malformed, other limit and noncanonical 2Gi                           |
| [Completeness guard removed](evidence/fault-completeness.log)                  | Missing metrics, event counters, RSS, invalid process fields and time                     |
| [Caller fields spread into all evidence](evidence/fault-output-projection.log) | Credential argv and injected restored/acceptance success                                  |
| [Caller source fields spread](evidence/fault-projection-source.log)            | Credential argv/injected acceptance success                                               |
| [Caller sample fields spread](evidence/fault-projection-sample.log)            | Credential argv/injected restored success                                                 |
| [Caller process fields spread](evidence/fault-projection-process.log)          | Credential argv                                                                           |

Adjacent `Proof:` comments name the faults and observed tests. No production fault remains.

## Review correction: independent rejection behavior

Binding-only tests now assert rejection without matching error wording. New co-mutated
negatives change both binding and sample cgroup/path/device/inode, or both expected Pod and
binding identity. No downstream mismatch can reject these fixtures. Each test records either
`{ rejected: true }` or the actual returned evidence, so a guard mutation must expose returned
evidence to fail its assertion.

- Removing the source binding guard caused **nine independent negatives to return evidence**:
  root, dot, relative and empty-segment cgroup paths; invalid device/inode; empty matching
  UID; matching short container ID; matching wrong-runtime container ID. Each test failed on
  its returned evidence object, without an error-message expectation:
  [behavioral binding receipt](evidence/fault-review-binding-behavior.log).
- Init shape validation in the source binding is **redundant** with complete-process shape
  validation when the bound init is present. Removing only that source check cannot establish
  an independent behavioral proof. Co-mutated init/sample fixtures now cover PID zero,
  unsafe integer PID and malformed starttime. Removing both the source guard and the process
  completeness guard, while retaining exact init membership, caused **all three negatives to
  return evidence**: [whole enforcement-path receipt](evidence/fault-review-init-enforcement.log).
  This proves the whole enforcement path, not necessity of each redundant guard separately.
- With production guards restored, all **60 source evidence tests passed**:
  [review typed green](evidence/review-typed-green.log). No production behavior changed in
  this review correction; tests, adjacent proof comments and this receipt account changed.

The fault runs used `bun test tools/tool-devsync/src/k3s/forge-source-memory-evidence.test.ts
--test-name-pattern '<pattern>'` with patterns `co-mutated malformed (binding|expected identity)`
and `co-mutated malformed init across enforcement path`, respectively. The mutation driver
checked nonzero exit, exactly nine/three failed tests and a returned `evidence` field before
restoring the production source in `finally`.

## Final checks

- `FORCE_COLOR=1 bun test tools/tool-devsync/src/k3s/forge-process-observation.test.ts tools/tool-devsync/src/k3s/forge-http-observation.test.ts tools/tool-devsync/src/k3s/forge-recovery-check.test.ts tools/tool-devsync/src/k3s/forge-recovery-lab.test.ts tools/tool-devsync/src/k3s/forge-source-memory-evidence.test.ts`: **141 passed, 0 failed, 299 assertions**; [review output](evidence/review-focused-tests.log). Approved loopback access was required for HTTP fixtures. The initial sandbox attempt failed on `listen` with `EPERM`: [retained refusal](evidence/focused-sandbox-refusal.log).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck build -p tool-devsync --skip-nx-cache --output-style=static`: **passed**, including six prerequisite tasks; [review output](evidence/review-nx-scoped.log). The [initial lint refusal](evidence/nx-initial-lint-refusal.log) was diagnosed by direct changed-file ESLint as one unnecessary test type assertion and fixed before the final run.
- `bunx prettier --check` on changed TypeScript files, the runbook and new change Markdown/spec artifacts: **passed**; [review output](evidence/review-format.log).
- `bun /tmp/puni-ci-repair-openspec-tool/node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json`: **224 passed, 0 failed**; [review output](evidence/review-openspec.json).
- `git diff --check`: **passed**. Final commit/tree and clean checkout are recorded in the handoff.

Receipt line endings and trailing whitespace were normalized for Git.
Dependencies were reused through the baseline node_modules symlink; no frozen install is
claimed. Full tool-devsync tests, full-tree formatting, host gate, live observations,
remote deadlines, lifecycle operations, push, merge and deployment were not run. Historical
first OOM cause and complete F9 acceptance remain unresolved.
