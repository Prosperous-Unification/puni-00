## Scope

Base: published #520 `bb83cea2129e904b9de26e23a0c8ea77e49c7547`, initially clean isolated
`/tmp/f9-source-memory-sol`. Implements the approved current local runtime observation shape;
no runtime, remote node, cluster or lab was contacted. The fixture is an actual spawned local
executable named crictl, reading a private plan and fake proc/cgroup files. No raw external
JSON is cast into source memory evidence.

The [initial red](evidence/initial-red.log) records the stable-source consuming test failing
against the throwing implementation stub. Negatives later added were checked with production
faults before completion. The observer uses the versioned primary runtime contract linked in
[design.md](design.md); no installed containerd/crictl version is asserted.

## Watched production faults

Each fault changes the observer, runs a named consuming test with
`bun test --timeout=2000 -t '<selection>' tools/tool-devsync/src/k3s/forge-source-memory-observation.test.ts`,
checks a nonzero exit, and restores the original production source in `finally`. Identity and
bounds negatives capture either `{ rejected: true }` or `{ evidence: <returned value> }`; their
fault receipts show actual forbidden evidence, without asserting error wording.

| Removed enforcement                  | Observed forbidden behavior                                                                       | Receipt                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Both executable basename checks      | Docker-named working fixture returned evidence                                                    | [executable](evidence/fault-executable-name.log)        |
| Absolute executable selection        | Relative working fixture returned evidence                                                        | [absolute](evidence/fault-absolute-executable.log)      |
| Unix endpoint scheme                 | Remote endpoint selection returned evidence                                                       | [endpoint](evidence/fault-endpoint-selection.log)       |
| Window upper bound                   | 30001ms selection returned evidence                                                               | [window](evidence/fault-window-upper-bound.log)         |
| Full returned container ID match     | Foreign and short runtime IDs returned evidence                                                   | [ID](evidence/fault-runtime-id.log)                     |
| Pod UID match                        | Foreign Pod returned evidence                                                                     | [UID](evidence/fault-runtime-uid.log)                   |
| Source metadata name match           | Foreign/missing name returned evidence                                                            | [name](evidence/fault-runtime-name.log)                 |
| Running state                        | Exited runtime state returned evidence                                                            | [running](evidence/fault-runtime-running.log)           |
| Host PID greater than one            | Otherwise consistent host PID1 returned evidence                                                  | [host PID1](evidence/fault-host-pid1.log)               |
| Namespace PID1                       | Initial and final namespace PID2 returned evidence                                                | [namespace](evidence/fault-namespace-pid1.log)          |
| Runtime init PID recheck             | Runtime-switched init returned evidence                                                           | [runtime recheck](evidence/fault-runtime-reinspect.log) |
| Starttime recheck                    | Reused PID returned evidence                                                                      | [starttime](evidence/fault-starttime-recheck.log)       |
| Parent recheck                       | Changed parent returned evidence                                                                  | [parent](evidence/fault-parent-recheck.log)             |
| Membership recheck                   | Post-sample sibling membership returned evidence                                                  | [membership](evidence/fault-membership-recheck.log)     |
| Directory identity recheck           | Replacement directory returned evidence                                                           | [directory](evidence/fault-directory-recheck.log)       |
| Combined stdout/stderr cap           | Oversized valid response and stderr returned evidence                                             | [output](evidence/fault-output-cap.log)                 |
| Init file byte cap                   | Oversized valid final status returned evidence                                                    | [read cap](evidence/fault-read-cap.log)                 |
| No-follow init reads                 | Final symlink to valid status returned evidence                                                   | [no-follow](evidence/fault-no-follow.log)               |
| Local ceiling (delayed to 60000ms)   | Stalled fixture exceeded the external test timeout                                                | [deadline](evidence/fault-deadline.log)                 |
| Deadline and final child termination | Spawned fixture survived the bounded post-failure poll; test then killed that fixture for cleanup | [termination](evidence/fault-child-termination.log)     |
| Error sanitization                   | ENOENT error exposed a synthetic credential-bearing path                                          | [sanitization](evidence/fault-sanitize.log)             |

The two executable basename checks are a redundant enforcement path; the fault removes both.
Initial process shape, cgroup containment/directory checks and non-2Gi sample rejection also
have downstream enforcement in the existing sampler/validator. Their prior watched proofs
remain in [sampler verification](../f9-local-process-observation/verify.md) and
[validator verification](../f9-source-memory-evidence/verify.md); no independent necessity of
each redundant type/shape check is claimed. Current consuming tests separately distinguish
ENOENT and EACCES for all required init files. Fixtures include malformed stat/status/membership,
nonregular and symlink files, non-2Gi samples, invalid UTF-8/JSON, missing executable, secret
runtime config/argv and final missing init state.

## Final checks

- `FORCE_COLOR=1 bun test tools/tool-devsync/src/k3s/forge-source-memory-observation.test.ts tools/tool-devsync/src/k3s/forge-process-observation.test.ts tools/tool-devsync/src/k3s/forge-source-memory-evidence.test.ts tools/tool-devsync/src/k3s/forge-recovery-check.test.ts tools/tool-devsync/src/k3s/forge-recovery-lab.test.ts`: **194 passed, 0 failed, 348 assertions**, [focused output](evidence/focused-tests.log).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck build -p tool-devsync --skip-nx-cache --output-style=static`: **passed all three targets and six prerequisites**, [scoped output](evidence/nx-scoped.log). The explicit settings avoid sandbox socket fallbacks; an earlier daemon-default invocation returned without running targets and was not credited. Initial import-sort/optional-chain lint failures were corrected before the final run.
- `bunx prettier --check` on both new TypeScript files, local runbook, and new proposal/design/tasks/verify/spec Markdown: **passed**, [format output](evidence/format.log).
- `bun /tmp/puni-ci-repair-openspec-tool/node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json`: **225 passed, 0 failed**, [OpenSpec output](evidence/openspec.json).
- `git diff --check`: **passed**. Receipt line endings and trailing whitespace were normalized. The handoff records the committed SHA/tree and clean checkout.

Dependencies are reused through the existing
node_modules symlink; no frozen install is claimed. Full-tree/host gates and publication are
owned by the PM. Full tool-devsync tests, unchanged HTTP loopback tests, full-tree formatting,
live observation, provisioning, lifecycle operations, remote execution, push, merge and
deployment were not run here. Historical first cold-start OOM attribution and F9 acceptance
remain unresolved.
