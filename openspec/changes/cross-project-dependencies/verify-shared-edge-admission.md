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

## Regression correction: isolated swap CLI prerequisites

At `cb6585dd6`, fresh runs of the backend/gateway mixed-invocation tests,
participant inspection tests, activation invocation tests and source/built
recovery dispatch tests produced 29 failures. Executing children tried the real
canonical `/home/puni1/wbs/state/edge.lock` and failed with `ENOENT` before reaching
their intended parser or recovery refusal. The backend and gateway files each
reported 4 passed / 11 failed; participant plus activation reported 39 passed /
5 failed; the filtered recovery run reported 4 passed / 2 failed.

These fixtures now use private scratch state with a regular `edge.lock`, set
`WBS_EDGE_STATE` for each child and discard inherited `WBS_EDGE_LOCK_FD` tokens.
The recovery fixture retains its existing local Docker substitute. Production
admission, parser checks and R5 refusal proofs are unchanged; no live canonical
state is created and no new safety check is introduced.

Fresh verification:

```sh
bun test tools/tool-remote-scripts/src/swap-backend-exclusion.test.ts tools/tool-remote-scripts/src/swap-gateway-exclusion.test.ts tools/tool-remote-scripts/src/swap-dependency-participants.test.ts tools/tool-remote-scripts/src/lib/step-blockage-activation.test.ts tools/tool-remote-scripts/src/lib/dependency-admission.test.ts tools/tool-remote-scripts/src/edge-admission.test.ts --preload ./tools/test/scratch/preload.ts --timeout=10000
# 120 passed, 0 failed, 347 assertions, 6 files
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-remote-scripts:typecheck
# successful uncached target, exit 0
bunx openspec validate cross-project-dependencies --json
# valid: true; existing long-requirement warnings only
```

Configured ESLint and Prettier passed all six changed TypeScript files, and
`git diff --check` passed. The existing edge-admission suite still exercises
retained markers, contention and forged descriptors through real launchers.
The complete configured `tool-remote-scripts:test` target, Docker acceptance and
exact-SHA host gate were not rerun for this fixture-only correction: local disk
had approximately 423 MB free, and the parent integration owns the broad gate.

## Fixture correction: READY failure retains child cleanup (2026-11-08)

The original nonqualifying `f642f094` h4 gate failed the configure fixture's
READY assertion at `edge-admission.test.ts:303`. That assertion preceded its
cleanup `try/finally`; the same gap existed in six launcher contention cases and
the independent-descriptor case. This establishes a fixture cleanup defect. It
does not establish the cause of the later UNKNOWN STOP, final termination or
other gate failures, which remain preserved separately.

All eight cases now arm the same file-local child owner before readiness work.
It starts original stdout/stderr reads concurrently, publishes the existing
cooperative release on every body outcome, and joins the original exit and both
streams before returning. Successful cleanup rethrows the identical primary
failure; cleanup rejection retains it with the cleanup causes. Competing command
outputs and exit are joined before their assertions. Existing READY polls
(100 × 5 ms), assertions, argv, test deadlines and production admission guards
are unchanged. Configure's private fake `id` still returns 1000 and reaches the
root refusal before staging or host operations. Local execution used nonroot
UID/GID 1000 and private state/lock/reader paths; no live host was touched.

Two regressions use real private waiting flock/configure children and a deliberately
absent READY observation through that same owner. They assert the original
failure identity, cooperative release and original exit/stream settlements.
The test's emergency release runs only after a failing settlement oracle, and
never counts as the cleanup under proof.

Observed TDD and R5:

- Original body-before-cleanup coverage: both regressions failed because the
  release file was absent; the outer fixture rescue then settled the children.
- Restored coverage: 2 passed, 0 failed, 21 assertions. A watched reintroduction
  of the coverage gap failed the same two oracles (not a timeout), then exact
  byte restoration passed both again.
- The first reviewed helper shape passed the complete owning file: 46 tests,
  0 failures, 155 assertions, 14.14 s (the earlier 13.43 s run is historical).

```sh
bun test tools/tool-remote-scripts/src/edge-admission.test.ts --preload ./tools/test/scratch/preload.ts --timeout=10000
```

This local fixture repair does not qualify native custody, full remote acceptance,
UNKNOWN retirement, deployment or the separately owned exact-SHA host gate.

Independent review required two further fixture proofs. A real child now physically
acknowledges cooperative release but keeps its original exit and both pipes open
until a separate finish permit. The owner must remain pending at that acknowledged
boundary, before any test-side settlement await. Bypassing its join failed the
same pending oracle before outer rescue; exact restoration passed. The separate
release-written promise establishes helper continuation ordering, while the actual
child acknowledgment and finish gate establish the physical pending boundary.

The four competing-command joins now retain all three original promises with
`Promise.allSettled` before propagating failure. A controlled rejected read with
pending exit and sibling-stream capabilities must not settle the helper early.
The fail-fast omission failed that pending oracle before the test completed those
capabilities; restoration passed. These are finite local fixture ownership proofs,
not native custody, UNKNOWN settlement or a causal explanation of the h4 STOP.

Final corrected source verification: the complete owning command above passed
48 tests, 0 failures, 168 assertions in 14.69 s. Configured remote-scripts
uncached typecheck and scoped ESLint passed. The final source was separately
watched with three omissions: readiness outside cleanup (two release-oracle
failures), owner return before original joins (physical child ACK pending oracle),
and fail-fast competing observations (controlled original-promises pending oracle).
Each omitted version exited 1 at its owning assertion before emergency rescue;
each exact byte-restored version exited 0. Original intermediate failures and
prior review receipts remain historical evidence, not final-source certificates.
