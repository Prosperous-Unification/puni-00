# Kubernetes dependency observation transport — B1 verification

Base: `278957849f7e204b87ddb228b8c4c885d9c10877`, isolated clone `/tmp/puni-b1-observation`.

This packet adds observation transport only. The release state machine, schema Jobs, migration capture, rollback, exposure and journal transitions are unchanged. Task 10.2 remains open for B2 storage fencing and B3 atomic admission/exposure/recovery integration. No deployment, activation or live Kubernetes runtime acceptance is claimed.

## TDD and source execution

Initial command/decoder and observation tests failed with missing-module errors before implementation (exit 1). The subsequent fresh-Job fixture and injected stale/foreign/replaced evidence cases passed after implementation. Adapter tests exercise `kubectlEffects` through a subprocess API fixture; those fixtures do not enforce Kubernetes mounts or run an actual image digest. Exact emitted command tests execute the real argument-free backend capability executable with inherited `DB_PATH` and verify no database creation. Store tests run all real migrations, then execute the emitted coordinator scanner against the source family. A committed dormant transition held only in retained WAL is observed; source main/WAL/SHM bytes and directory entries stay identical. ENABLED-empty, historical, absent, unreadable and malformed sources refuse. Non-root UID is asserted for unreadability.

## Watched failures

Each mutation was applied alone to production code, the named tests were observed to fail with exit 1, then the original source was restored. Tests were rerun green after restoration. The commands use `bun test --preload ../test/scratch/preload.ts --timeout=10000 src/k8s/dependency-observation.test.ts -t '<filter>'` from `tools/tool-deploy` unless stated otherwise. These prove local transport rejection, not cluster enforcement.

| Omitted production check     | Test filter                                 | Observed failing tests |
| ---------------------------- | ------------------------------------------- | ---------------------- |
| `effective-pod-spec`         | `observation refuses (job-command           | pod-command            | pod-image               | volume        | env          | security     | fs-group      | sidecar      | init        | ephemeral   | device      | token | service-account | node-selector | env-from)$ | store refuses (recursive-spec | source-writable)$` | 17 (exit 1) |
| `job-uid`                    | `observation refuses job-uid$`              | 1 (exit 1)             |
| `pod-uid`                    | `observation refuses pod-uid$`              | 1 (exit 1)             |
| `fresh-create-only`          | `observation refuses stale$`                | 1 (exit 1)             |
| `post-log-readback`          | `observation refuses (pod-uid               | after-logs)$`          | 2 (exit 1)              |
| `pod-owner`                  | `observation refuses owner$`                | 1 (exit 1)             |
| `task-image-digest`          | `observation refuses image-id$`             | 1 (exit 1)             |
| `task-exit`                  | `observation refuses failed$`               | 1 (exit 1)             |
| `task-reason`                | `observation refuses termination-reason$`   | 1 (exit 1)             |
| `runtime-recursive-readonly` | `store refuses (recursive-status            | readonly-status        | missing-mount-status)$` | 3 (exit 1)    |
| `owned-pod-cardinality`      | `observation refuses extra-pod$`            | 1 (exit 1)             |
| `workload-labels`            | `observation refuses (job-label             | template-label         | pod-label)$`            | 3 (exit 1)    |
| `job-status-failure`         | `observation refuses job-failed$`           | 1 (exit 1)             |
| `job-status-conditions`      | `observation refuses job-failed-condition$` | 1 (exit 1)             |
| `job-count-validation`       | `observation refuses job-count$`            | 1 (exit 1)             |
| `exact-manifest-fields`      | `observation refuses (job-protocol          | job-kind               | job-name                | job-namespace | job-selector | job-deadline | pod-namespace | status-image | status-name | restarts)$` | 10 (exit 1) |
| `required-record-evidence`   | `observation refuses (status                | job-status             | termination)$`          | 3 (exit 1)    |
| `required-string-identities` | `observation refuses (job-uid-missing       | pod-uid-missing        | pod-name-missing)$`     | 3 (exit 1)    |
| `job-completion-evidence`    | `observation refuses job-incomplete$`       | 1 (exit 1)             |
| `bounded-stdout`             | `observation refuses oversize$`             | 1 (exit 1)             |

The completion-condition negative includes both Complete and FailureTarget flags so removal of the failure guard is not hidden by an unrelated incomplete-Job timeout. The task deadline negatives return valid support after the injected stall, and assert elapsed time, so a late decoder failure cannot masquerade as deadline enforcement.

## Commands and results

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: exit 0, 1801 installs checked across 1648 packages. Initial install without the temp override failed on a read-only temporary directory.
- Final focused source/adapter suites: `cd tools/tool-deploy && bun test --preload ../test/scratch/preload.ts --timeout=10000 src/k8s/dependency-observation.test.ts src/k8s/execute-adapter.test.ts`: exit 0, 152 passed, 0 failed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:test --outputStyle=stream`: sandbox run failed at local HTTP/socket fixtures; authorized outside-sandbox rerun exited 0, 916 tests passed, 0 failed at that checkpoint. Later edits add independent image/diagnostic tests and proof comments; final focused source/adapter checks cover those changes.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-remote-scripts:test --outputStyle=stream`: sandbox prerequisite failed on Docker socket access; authorized outside-sandbox rerun exited 0, 896 tests passed, 2 skipped, 0 failed, including the pinned Caddy prerequisite.
- Both Nx lint targets passed after project-graph generation. A preliminary direct ESLint invocation lacked the Nx project graph and was superseded by these target checks.

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many --targets=typecheck,build --projects=tool-deploy,tool-remote-scripts --outputStyle=stream`: exit 0, both projects and their seven prerequisite tasks passed.
- `bunx openspec validate cross-project-dependencies --json`: exit 0, valid.

- The remote target skipped its two opt-in real-Docker managed-solver cleanup cases: `removes a merely created container when timer setup fails` and `waits and removes after the real container has already stopped`. They are unrelated to B1 and are not claimed verified.
- Final shared source checks: `bun test tools/tool-remote-scripts/src/lib/dependency-capability.test.ts tools/tool-remote-scripts/src/lib/dependency-preflight.test.ts tools/tool-remote-scripts/src/lib/dependency-inventory.test.ts tools/tool-remote-scripts/src/lib/sqlite-probe.test.ts`: exit 0, 90 passed, 0 failed.
- `bunx openspec validate --all --json`: exit 0; the focused change reports valid with four requirement-length warnings.

## Explicitly unverified/deferred

`tool-deploy:test:k3s` with a B1 scenario, actual image execution attribution, Kubernetes API defaulting compatibility and effective recursive-readonly enforcement are deferred to B2/B3 integration. The current lab does not call these transport methods; running it would not establish those B1 facts. The transport deliberately refuses missing/unsupported runtime mount evidence, and unexpected defaulted security-relevant fields rather than widening acceptance without rehearsal. The h2puni/h4claw full integrated-SHA gate is not run for this isolated review commit. No live deployment or activation occurred.

## Shared and adapter production mutations

- `capability-protocol`: `bun test --timeout=10000 tools/tool-remote-scripts/src/lib/dependency-preflight.test.ts -t refuses independent malformed capability` from `/tmp/puni-b1-observation` observed 2 named failures, exit 1; restored source afterward.
- `capability-version`: `bun test --timeout=10000 tools/tool-remote-scripts/src/lib/dependency-preflight.test.ts -t refuses independent malformed capability` from `/tmp/puni-b1-observation` observed 2 named failures, exit 1; restored source afterward.
- `capability-role`: `bun test --timeout=10000 tools/tool-remote-scripts/src/lib/dependency-preflight.test.ts -t refuses independent malformed capability` from `/tmp/puni-b1-observation` observed 2 named failures, exit 1; restored source afterward.
- `capability-closed-keys`: `bun test --timeout=10000 tools/tool-remote-scripts/src/lib/dependency-preflight.test.ts -t refuses independent malformed capability` from `/tmp/puni-b1-observation` observed 2 named failures, exit 1; restored source afterward.
- `capability-duplicates`: `bun test --timeout=10000 tools/tool-remote-scripts/src/lib/dependency-preflight.test.ts -t refuses independent malformed capability` from `/tmp/puni-b1-observation` observed 2 named failures, exit 1; restored source afterward.
- `capability-semantics`: `bun test --timeout=10000 tools/tool-remote-scripts/src/lib/dependency-preflight.test.ts -t refuses independent malformed capability` from `/tmp/puni-b1-observation` observed 2 named failures, exit 1; restored source afterward.
- `omit-previous-invocation`: `bun test --timeout=10000 src/k8s/execute-adapter.test.ts -t independently invokes equal images` from `/tmp/puni-b1-observation/tools/tool-deploy` observed 1 named failures, exit 1; restored source afterward.
- `substitute-candidate-for-previous`: `bun test --timeout=10000 src/k8s/execute-adapter.test.ts -t pins distinct candidate` from `/tmp/puni-b1-observation/tools/tool-deploy` observed 1 named failures, exit 1; restored source afterward.
- `omit-source-wal`: `bun test --timeout=10000 src/k8s/dependency-observation.test.ts -t exact emitted scanner preserves` from `/tmp/puni-b1-observation/tools/tool-deploy` observed 1 named failures, exit 1; restored source afterward.
- `omit-observation-call-deadline`: `bun test --timeout=10000 src/k8s/execute-adapter.test.ts -t refuses independent stalled` from `/tmp/puni-b1-observation/tools/tool-deploy` observed 2 named failures, exit 1; restored source afterward.

- Evidence persistence mutation: omitting the production `writeFileSync(..., {flag: 'wx'})` made `refuses a lost evidence directory before creating the observation Job` fail with `Received: resolved`, exit 1. Restored source; the unmodified missing-directory case refuses with ENOENT before create.

## Review follow-up: Kubernetes service-account alias

Astra High identified that ordinary Kubernetes PodSpec conversion repeats `serviceAccountName` in the deprecated JSON `serviceAccount` alias. The original closed comparison rejected that extra field in the Job create response before Pod polling. The comparator now removes only an alias that equals the pinned `serviceAccountName`; every other field still goes through the unchanged closed comparison. An absent alias remains valid. The design description now records this bounded normalization.

- RED: `cd tools/tool-deploy && bun test --preload ../test/scratch/preload.ts --timeout=10000 src/k8s/dependency-observation.test.ts -t 'accepts matching serviceAccount alias'` against the pre-fix comparator: exit 1, three positive cases failed (Job create response, Pod GET response and both).
- GREEN: the same test file filtered by `serviceAccount alias`: exit 0, five cases passed, including foreign aliases independently rejected at create response and Pod GET.
- Watched R5 mutation: remove only `assertEqual(spec['serviceAccount'], expected.serviceAccountName, 'serviceAccount alias')`, retaining alias deletion. The two `refuses mismatched serviceAccount alias` cases both failed with `Received: resolved`, exit 1. Restored the check and added the adjacent Proof comment.
- The subprocess kubectl adapter now emits the normal matching alias in both created Job templates and Pod GET specs, so its existing successful observation paths exercise real conversion shape rather than an alias-free fixture.
- Focused source/adapter command above without `-t`: exit 0, 157 passed, 0 failed. Shared command/decoder/scanner suites: exit 0, 90 passed, 0 failed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many --targets=lint,typecheck,build --projects=tool-deploy,tool-remote-scripts --outputStyle=stream`: exit 0; both projects and seven prerequisite tasks passed (10/13 tasks cached).

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:test --outputStyle=stream`: authorized outside-sandbox run exited 0, 928 passed, 0 failed across 33 files.
- `bunx openspec validate --all --json`: exit 0, 268/268 entries valid.
- The full remote-scripts target was not repeated for this Kubernetes-only fix; the shared suites and both projects’ configured lint/typecheck/build checks above were rerun. Live k3s and integrated host gates remain deferred.

This fixes the known alias defaulting mismatch; live Kubernetes API/defaulting acceptance, recursive-readonly enforcement and the B1 k3s scenario remain unverified/deferred as above. There is no migration, rollout, rollback or activation authorization change.
