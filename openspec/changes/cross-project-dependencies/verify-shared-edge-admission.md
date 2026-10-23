# Bounded shared edge owner admission prerequisite — 2026-10-23

This packet supplies source admission only. Parent tasks 10.1/10.2 remain open;
participant observation remains `activation: blocked`. No host was changed, owner
marker published, route mutated, container stopped/restarted or activation attempted.

The canonical `/home/puni1/wbs/state/edge.lock` covers source swap execution,
installed-poller source before reset, candidate loader before extraction, manual
dev deployment, standalone bootstrap/configure and devsync CLI. Lock order is
edge, optional poll, optional devsync, then selected deploy; existing backend and
gateway fences remain. Direct swap/devsync executors also reject retained state.
Every present owner JSON/pending path closes admission, even with malformed or
unreadable contents, a directory or dangling link. Absence preserves legacy
operation and establishes no fence or activation permission. The descriptor token
must name the canonical inode and obtain real flock; env alone grants nothing.

## Watched production-path failures

- Before shell implementation, all 12 real poller/loader/bootstrap/configure
  marker and concurrent-lock tests failed at later prerequisites instead of edge
  admission. Before swap/devsync integration, five additional real CLI negatives
  failed at later argument/environment preflight.
- Removing inherited descriptor verification made two forged numeric FD negatives
  and the separately opened FD against another process's lock fail (3 failures).
  Removing token syntax validation made the bogus-token CLI negative fail (1).
- Removing direct executor marker guards made the direct swap/devsync negatives
  fail (2); removing the manual launcher's outer lock restored fetch admission
  while another process owned edge.lock (1).
- Restored code admits a genuinely inherited kernel open description without
  self-deadlock. A real configure process parked at its first modeled external
  command excludes prod swap, dev swap and bootstrap entrypoints before effects.

## Scoped verification

- Real launcher and direct-executor admission tests exercise markers, orphan
  pending state, legacy absence, unreadable/directory/dangling owner paths,
  generic contention, actual configure contention, forged/independent descriptors,
  child inheritance and the shipped manual SSH command.
- Swap, writer barrier, devsync and Caddy provisioning regression tests pass.
- Dev poller tests: 26 passed, zero failed outside the filesystem sandbox. Inside
  the sandbox, two existing complete-tree tests failed because Git could not
  hardlink from the read-only mounted object store (`EXDEV`); rerunning the same
  suite outside that restriction passed. Candidate-race fixtures explicitly use
  independent host state roots; shared-host exclusion has its own launcher tests.
- Scoped ESLint, shellcheck, Bash syntax, format, remote-scripts/devsync typecheck,
  remote-scripts build and OpenSpec validation are run for this packet. OpenSpec
  reports existing long-requirement warnings; this requirement adds none.

Full remote-scripts Docker acceptance, exhaustive historical bootstrap merge
sweeps, independent review and the integrated exact-SHA host gate are not claimed
by this packet. The parent integration must run the host gate on the combined SHA.

## Installed-owner limit

The actual installed poller lives outside the source checkout. An old poller can
reset watched source before the candidate's loader starts; compiling source or
installing swap.js does not control that poller, scheduled/manual launchers,
external supervisors, already running children or unknown host writers. No live
installed-byte, process-family or prior-owner drain audit was performed here.
There is intentionally no marker publisher, schema initializer, clearance or
activation command. A later owner packet must audit installed entrypoints,
replace/drain prior writers under the same edge lock and retain durable intent
before claiming continuous exclusion. The shared Caddy serves other applications
and registry traffic and must not be globally stopped or restarted for this work.

Observed scoped command output:

```sh
bun test tools/tool-remote-scripts/src/edge-admission.test.ts tools/tool-devsync/src/edge-admission.test.ts tools/tool-remote-scripts/src/swap.test.ts tools/tool-remote-scripts/src/swap-writer-barrier.test.ts tools/tool-devsync/src/sync.test.ts tools/tool-bootstrap/src/configure-caddy.test.ts
# 374 passed, 0 failed, 4758 assertions, 6 files
bun test tools/tool-devsync/src/poller.test.ts
# 26 passed, 0 failed, 92 assertions outside filesystem sandbox
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck --projects=tool-remote-scripts,tool-devsync
# 2 successful targets, exit 0
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-remote-scripts:build
# successful build and 3 dependencies, exit 0
bunx openspec validate cross-project-dependencies --json
# valid: true, 1 passed, 0 failed; existing long-requirement warnings
shellcheck bin/dev-deploy.sh bin/dev-poll.sh bin/dev-poll-sync.sh tools/tool-bootstrap/src/bootstrap.sh tools/tool-bootstrap/src/configure.sh
# exit 0
bash -n bin/dev-deploy.sh bin/dev-poll.sh bin/dev-poll-sync.sh tools/tool-bootstrap/src/bootstrap.sh tools/tool-bootstrap/src/configure.sh
# exit 0
```

Configured ESLint over every changed TypeScript file exited 0. Format is checked
again by the normal commit hooks over all staged supported files. The shell
provisioners retain their standalone `sh` invocation; the Linux `test -ef`
extension is documented beside its shellcheck exception and exercised with `sh`.

## Review correction: child handoff, provisioning gap and prefetch admission

Read-only Astra review of `6ab3fe284` found three gaps missed by its green tests.
The source prerequisite was not review-ready at that SHA. This correction:

- Reproduced standalone devsync inode mismatch and inherited-FD8 `EBADF` through
  the actual unlocked CLI, real flock binary and locked Bun child. Explicit extra
  stdio mapping now carries the actual open description into child FD 3. Both
  launchers reach their intended MCP environment preflight. A separate real child
  completes with exit 0 and verifies that a competing process cannot obtain the
  edge lock. Omitting the mapping again failed all three tests (3 failures).
- Reproduced direct SCP replacement of live `base.yml` after bootstrap but before
  refused configure (2 failures: retained marker and occupied edge lock). The
  transport now uploads a unique staged file; admitted configure moves through a
  sibling and commits under its existing edge lock. Tests run the actual ordered
  transport plan against local SSH/SCP substitutes, using shipped bootstrap and
  configure admission prefixes, and stop before host package/service operations.
  They verify successful commit, closed admission, competing writer refusal, and
  real flock exclusion at each move. No external SSH or provisioning occurred.
- Reproduced manual owner/orphan marker admission reaching fake Git fetch (2
  failures). The shipped remote command now checks both retained paths before
  fetch under its canonical outer lock.

The pinned Bun 1.4.2 runtime also returned `EPERM` for FileSink stdin writes in the
local sandbox, independently reproduced with `cat`. Supplying the same secret
payload as subprocess Blob stdin allows the local transport fixture to run without
remote access or relaxed permissions. An unsandboxed test attempt was rejected by
automatic approval review due to possible remote provisioning; no such action ran,
and all provisioning fixtures subsequently ran within the sandbox with local-only
transport substitutes.

Installed-owner adoption, prior-holder drain, marker publication, continuous
exclusion and activation remain unproven. This follow-up adds no publisher or
activation command and changes no host.

Independent Astra rereview approved the corrected bounded source-admission
packet after checking the real descriptor handoff, staged configuration
transport, and prefetch refusal paths. This approval does not cover the
integrated exact-SHA host gate or installed-host adoption.

Correction verification commands and observed output:

```sh
bun test tools/tool-remote-scripts/src/edge-admission.test.ts tools/tool-devsync/src/edge-admission.test.ts tools/tool-remote-scripts/src/swap.test.ts tools/tool-remote-scripts/src/swap-writer-barrier.test.ts tools/tool-devsync/src/sync.test.ts tools/tool-bootstrap/src/configure-caddy.test.ts tools/tool-bootstrap/src/push.test.ts tools/tool-bootstrap/src/push-edge-admission.test.ts
# 396 passed, 0 failed, 4825 assertions, 8 files
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck --projects=tool-remote-scripts,tool-devsync,tool-bootstrap
# 3 successful targets, exit 0
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t build --projects=tool-remote-scripts,tool-bootstrap --skip-nx-cache
# fresh affected builds and dependencies; exit 0
bunx openspec validate cross-project-dependencies --json
# valid, existing long-requirement warnings only
shellcheck bin/dev-deploy.sh tools/tool-bootstrap/src/configure.sh
bash -n bin/dev-deploy.sh tools/tool-bootstrap/src/configure.sh
# both exit 0
```

Configured ESLint passed every corrected TypeScript file. Normal commit hooks
repeat staged lint, format and repository guards. The integrated host gate,
installed adoption audit remain outstanding.
