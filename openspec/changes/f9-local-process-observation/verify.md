# Verification Report

Change: `f9-local-process-observation`. Verified 2026-10-16 in isolated clone
`/tmp/f9-process-sampler-e7201df`, based exactly on draft #516 head
`e7201df07f7e72f5a791a6f8546fe213ea320aeb`. This is local fixture evidence for the
bounded diagnostic slice. The coordinating agent will arrange Astra review.

## Scope and implementation signal

The local command reads the selected cgroup and /proc only. No actual host process
sampling, remote sampler, lab provisioning, teardown, checker mutation or live acceptance
was run. No raw argv is returned. Historical cold OOM attribution and complete F9 remain open.
The implementation, artifacts and receipts are committed together on `f9-process-identity`;
no push or merge is authorized in this slice.

The explicit local boundary was approved by the coordinating agent after the combined
brainstorming/grilling/domain-modeling design discussion, with the adjustment to omit raw
argv. No project-specific glossary term or irreversible decision was introduced.

## Task completion and spec coverage

All three tasks are implemented. The stable-local-observations requirement maps to
`observeProcesses`, the Vite/secret fixture, the stable-identity/exec/membership fixtures,
and the independent unreadable/absent-state fixtures. Finite-bounds requirements map to
invalid-bound, byte/process-limit, path/symlink, FIFO, stalled-read, pause and CLI fixtures.
The emission fixture preserves only completed samples when a later sample refuses.
The additive delta remains unsynced for review; no archive or main-spec sync was requested.

## Scoped checks

- Focused Bun fixtures: **58 pass, 0 fail**, including 21 sampler cases and the existing
  37 HTTP/recovery cases: [actual output](evidence/focused-tests.log).
  Command: `bun test tools/tool-devsync/src/k3s/forge-process-observation.test.ts tools/tool-devsync/src/k3s/forge-http-observation.test.ts tools/tool-devsync/src/k3s/forge-recovery-check.test.ts`.
  The first combined run's loopback listeners were denied by the sandbox (`EPERM`).
  The same offline fixtures were rerun with loopback access; no external service was used.
- Scoped Nx lint/typecheck/build: [actual output](evidence/nx-scoped.log).
  Command: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck build -p tool-devsync --skip-nx-cache --output-style=static`.
  Typecheck/build passed on the initial run; lint reported type-aware style issues, corrected
  before the recorded final run. Dependencies were reused through a node_modules symlink
  to the existing exact-head diagnostic checkout; no frozen install is claimed.
- Changed-file format passed: [actual output](evidence/format-scoped.log).
  Command: `bunx prettier --check tools/tool-devsync/src/k3s/forge-process-observation* docs/infra/local.md openspec/changes/f9-local-process-observation/*.md openspec/changes/f9-local-process-observation/specs/forge-process-observation/spec.md`.
- All OpenSpec validation: **223 passed, 0 failed**: [machine-readable output](evidence/openspec.json).
  CLI: `bun /tmp/puni-ci-repair-openspec-tool/node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json`.
  The already installed CLI is outside PATH; no replacement version was downloaded.

The full tool-devsync suite, full-tree formatting, raw full Nx gate and h2puni gate were
not run: the authorized scope is focused offline fixtures and project checks, with no host
gate. No CI or live F9 pass is claimed. Scoped build includes shellcheck and prerequisite
builds; this change has no deployment artifact.

## Watched failure proofs

Initial feature stubs produced 7 failures: [red output](evidence/initial-red.log).
Directory replacement and same-start-time exec changes were each added as failing
production-path tests before their checks: [directory red](evidence/directory-red.log),
[exec red](evidence/exec-red.log).

Each row below is an independent mutation of the actual collector, restored immediately
after the fixture run. Receipt text normalizes trailing whitespace from Bun source excerpts for git checks.
The receipts record assertion failures on production calls, not only
nonzero commands. [Summary](evidence/mutations.log); each exact diagnostic output is in
`evidence/fault-<name>.log`. EACCES is exercised independently from ENOENT. FIFO/deadline
fixtures own an external 1500ms child kill solely to contain a deliberately broken negative.
The watchdog fixture scales 30000ms timers to 40ms and stalls an actual required-read call;
it proves the local exit path, not a remote or kernel-level hard deadline.

| Injected fault/check removed | Observed failing fixture                                                                                                                                                                                                                                                                                                 | Outcome |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `nonblocking-read`           | rejects a FIFO required file without leaving a blocked reader [1507.92ms]                                                                                                                                                                                                                                                | exit 1  |
| `directory-type`             | refuses a nondirectory cgroup path before reading member files [19.53ms]                                                                                                                                                                                                                                                 | exit 1  |
| `exec-recheck`               | refuses exec changes within the same PID start time [47.32ms]                                                                                                                                                                                                                                                            | exit 1  |
| `number-validation`          | refuses missing required event counters and malformed process fields [24.27ms]                                                                                                                                                                                                                                           | exit 1  |
| `stat-validation`            | refuses missing required event counters and malformed process fields [18.92ms]                                                                                                                                                                                                                                           | exit 1  |
| `events-validation`          | refuses missing required event counters and malformed process fields [33.33ms]                                                                                                                                                                                                                                           | exit 1  |
| `required-events`            | refuses missing required event counters and malformed process fields [18.74ms]                                                                                                                                                                                                                                           | exit 1  |
| `regular-file`               | refuses nonregular required state [20.67ms]; rejects a FIFO required file without leaving a blocked reader [39.70ms]                                                                                                                                                                                                     | exit 1  |
| `identity-recheck`           | refuses identity and membership changes after command inspection [31.89ms]                                                                                                                                                                                                                                               | exit 1  |
| `membership-recheck`         | refuses identity and membership changes after command inspection [98.82ms]                                                                                                                                                                                                                                               | exit 1  |
| `directory-identity`         | refuses cgroup directory replacement during process inspection [47.02ms]                                                                                                                                                                                                                                                 | exit 1  |
| `library-deadline`           | deadline refuses an interval exceeding remaining budget [41.87ms]; library deadline rejects a stalled read and leaves no long pause running [1508.72ms]                                                                                                                                                                  | exit 1  |
| `cli-watchdog`               | CLI local watchdog exits during a stalled required read [76.13ms]                                                                                                                                                                                                                                                        | exit 1  |
| `pause-clamp`                | library deadline rejects a stalled read and leaves no long pause running [1103.06ms]                                                                                                                                                                                                                                     | exit 1  |
| `byte-limit`                 | refuses oversized files and more than 256 exact members [19.44ms]                                                                                                                                                                                                                                                        | exit 1  |
| `process-limit`              | refuses oversized files and more than 256 exact members [21.07ms]                                                                                                                                                                                                                                                        | exit 1  |
| `input-bounds`               | refuses invalid bounds before inspecting filesystem [15.22ms]                                                                                                                                                                                                                                                            | exit 1  |
| `path-containment`           | refuses foreign directories and symlink escapes [16.96ms]                                                                                                                                                                                                                                                                | exit 1  |
| `no-follow`                  | refuses foreign directories and symlink escapes [16.84ms]                                                                                                                                                                                                                                                                | exit 1  |
| `required-file`              | refuses absent and unreadable required memory state [27.40ms]; refuses foreign directories and symlink escapes [7.27ms]; refuses unreadable required state independently from absent state [3.55ms]; refuses nonregular required state [3.14ms]; rejects a FIFO required file without leaving a blocked reader [32.91ms] | exit 1  |
| `counter-validation`         | refuses malformed counters, PID identity, status and cgroup membership [21.19ms]; retains only complete emitted observations when a later sample fails [4.63ms]                                                                                                                                                          | exit 1  |
| `command-termination`        | refuses malformed counters, PID identity, status and cgroup membership [28.46ms]                                                                                                                                                                                                                                         | exit 1  |
| `launcher-position`          | unknown launcher arguments cannot impersonate the Vite launcher [4.02ms]                                                                                                                                                                                                                                                 | exit 1  |
| `executable-alphabet`        | refuses unsafe executable text instead of logging it [17.51ms]                                                                                                                                                                                                                                                           | exit 1  |
| `cli-argument-count`         | CLI rejects extra lifecycle arguments before reading files [27.80ms]                                                                                                                                                                                                                                                     | exit 1  |

All 25 mutations were restored before final tests and scoped checks. Adjacent `Proof:`
comments point to these fixtures. Byte bounds concern file contents; executable links are
bounded by the kernel and restricted to a safe basename alphabet before output.

## Review boundary

Ready for review of this local observation slice after the scoped receipts above. Exit zero
means requested observations completed; role hints cannot prove code authenticity or OOM
causality. Sequential snapshots can miss short-lived processes and are not atomic. Exact
member enumeration omits descendant cgroups even when their charges appear in memory
counters. Local deadline timing has scheduler tolerance and does not promise recovery from
kernel uninterruptible IO, remote termination, or global F9 acceptance.
