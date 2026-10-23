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
