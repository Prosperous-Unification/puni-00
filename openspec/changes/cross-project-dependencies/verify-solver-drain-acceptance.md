# Disposable solver drain acceptance

Status: independently reviewed solver-only host acceptance passed at exact
`1d72ba511bfb2b08aa3b8ddf8906746ea35546cc`. Earlier failed attempts remain
recorded below. Complete source composition, adoption, restoration and the final
integrated gate remain separate; S1/S2/O4 and parent 10.2 stay open.

The opt-in `tool-remote-scripts:test:solver-drain` target requires
`SOLVER_DRAIN_SHA`, `SOLVER_DRAIN_IMAGE` and `SOLVER_DRAIN_RECEIPT`. The SHA must
match committed relevant source at HEAD. The image must be an already-installed
repository digest reference; its immutable image ID is resolved again by the real
drain. There is no pull or image build. The fixture uses `/bin/sleep` from that
image, so the explicitly selected installed image must provide it. The installed
Caddy image can be selected by the host operator after confirming that contract;
no Bun container image is assumed.

The receipt uses exclusive mode-0600 creation in a canonical existing parent and
must be outside the private mode-0700 invocation scratch directory. Keep both
receipt and scratch packet private. They retain fixture pins, inventory, command
intent, owner records and minimal lifecycle observations, never real host config,
container environment, credentials or broad metadata.

Every user-unit start/stop goes through effective fixture authority validation,
including prefix/global drop-ins and all execution hooks, before its exact
command. Four independently hashed fixture byte strings are published only after
pins exist. Physical hashes/inodes survive logical tuple-path mapping; real
systemd execution bookkeeping survives executable/argv mapping. Unknown native
serialization fails visibly. The linked service owns a real-admission creator and
real descendant; its SIGTERM handler launches the predeclared during-stop child.
The initial running child, created-inert child and during-stop child use native
Docker projections unchanged. All inventories and effects are invocation owned.

The total test budget is 120 seconds, each command at most 15 seconds, with an
independent 45-second cleanup budget and cleanup commands at most 10 seconds.
SIGINT/SIGTERM cancels test commands while leaving cleanup its independent budget.
Bounded readers kill/reap their exact child on decoding/read/cancellation failure.
Cleanup recovers partial-create acknowledgements using only the unique owner
label, verifies exact inventory/name/label identity before every effect, obtains
native terminal agreement, removes exact containers, checks final owned absence,
unlinks only the identity-matched unit link and reloads the user manager. Any
uncertainty fails and retains exact attended recovery commands in the receipt.
Scratch evidence and owner markers intentionally remain private for review.

## Local evidence

- Focused suite: `bun test tools/tool-remote-scripts/test/solver-drain-transport.test.ts tools/tool-remote-scripts/test/solver-drain-fixture.test.ts`.
  Fresh output: **12 tests / 46 assertions passed**. [Receipt](evidence/solver-drain-acceptance/focused-green.log.txt).
  It exercises real admission flock lifetime and creator SIGTERM, retained-marker
  refusal, both protocol transport boundaries, command cancellation/output/UTF8
  bounds, effect ownership, no-op kill/changed terminal cleanup, created-inert
  handling and effective-unit preflight before guarded start/cleanup stop.
- [Watched driver](evidence/solver-drain-acceptance/mutations.py.txt) removes nine
  independent runner checks. Every fault exited 1 through an observed negative,
  and sources were restored: [summary](evidence/solver-drain-acceptance/mutations.log.txt).
  Discovery, executable identity, unique ownership, immediate effect recheck,
  output bound, reader-error exact-child reap, cleanup terminal identity,
  effective unit authority and native serialization each have a watched failure.
- [Focused Nx typecheck](evidence/solver-drain-acceptance/typecheck.log.txt) passed.
- [Focused Nx lint](evidence/solver-drain-acceptance/lint.log.txt),
  [runner Bun bundle](evidence/solver-drain-acceptance/build.log.txt) and
  [OpenSpec validation](evidence/solver-drain-acceptance/openspec.log.txt) passed;
  OpenSpec retains existing long-requirement warnings.
- [Local executable discovery](evidence/solver-drain-acceptance/tools.log.txt)
  records availability only; daemon/manager connectivity is untested. No host
  operation was used to obtain these paths. Full h2/h4 gate remains unrun.

Actual Docker/systemd/cgroup-v2 compatibility, image `/bin/sleep`, real linked-unit
FragmentPath and execution serialization, actual service-stop child survival,
real callback restart refusal, membership completion and exact cleanup remain
unverified until host execution. Local fake manifest commands perform no Docker
or systemd operation. A successful positive host receipt will still not prove the
independent production-source stop/cgroup/runtime/kill/terminal/membership fault
packet on an actual host. Prepare/review those isolated derivatives separately;
the source omission evidence in `verify-solver-drain.md` is not relabeled live.

## Normal unit integration

The standard `tool-remote-scripts:test` command explicitly includes the two local
transport/creator safety suites under `test/`; the actual-host runner remains an
opt-in target. The existing uncached `test:caddy` prerequisite is preserved.
Removing either suite from the configured command was watched to fail the target
contract test: [transport omission](evidence/solver-drain-acceptance/configured-transport-omission.log.txt),
[fixture omission](evidence/solver-drain-acceptance/configured-fixture-omission.log.txt).
The restored contract test passed all four cases.

The exact updated unit command passed **1660 tests, 2 skips, 0 failures and 9175
assertions across 75 files** with local Unix/listener permissions:
[receipt and skipped case names](evidence/solver-drain-acceptance/configured-unit-green.log.txt).
The initial sandbox attempt encountered existing Unix-socket EPERM refusals and
was cancelled without a completed verdict; its representative packet is
[retained separately](evidence/solver-drain-acceptance/configured-unit-sandbox.log.txt).
Native Caddy is absent locally. Docker connectivity/image preparation and the
separate Caddy prerequisite were not attempted; the full Nx test target and host
gate therefore remain unverified here. The proposal contains 393 words; bounded
acceptance details stay in this record and the existing design.

## Reviewed host invocation template

After the final source SHA is installed in a clean isolated host tree with its
locked dependencies already installed, supply a known installed image and a new
absolute private receipt path, then invoke under the canonical heavy lock:

```sh
SOLVER_DRAIN_SHA=<exact-reviewed-40-character-sha> \
SOLVER_DRAIN_IMAGE=<already-installed-repository@sha256:digest> \
SOLVER_DRAIN_RECEIPT=/absolute/private/new-receipt.json \
  bin/with-heavy-lock.sh -- env NX_DAEMON=false bunx nx run tool-remote-scripts:test:solver-drain --skip-nx-cache
```

This is an execution template, not evidence of a completed host run. The runner
refuses omitted inputs, dirty relevant source, absent tools/image and receipt
replacement. It never queries the installed production service or performs a
global solver census.

## First host attempt and attended cleanup

Exact source `fe4c3a93484033c7ca79e62c5ca60be7730bea7a` ran the real
Nx target under the canonical host heavy lock and exited 1. Effective unit
preflight refused before service startup because native `systemctl show` omitted
three empty execution hooks. Adding `--all` did not restore those fields. The
fixture's D-Bus service properties independently returned the exact typed empty
array `{"type":"a(sasbttttuii)","data":[]}` for `ExecStartPre`,
`ExecStartPost` and `ExecStop`. The shared strict producer correction is a
separate source packet; missing properties are not accepted as empty defaults.

The original private receipt records incomplete cleanup: the same strict
preflight also refused the unit-stop step. Its two created containers were
removed. An attended recovery under the canonical lock independently verified
exact unit template bytes and canonical identity, the linked target, typed empty
hooks, no drop-ins or jobs, inactive/dead state and zero main/control PIDs. Two
unchanged native observations bracketed the absence of invocation-owned
containers. Only that exact fixture unit link was then removed and the manager
reloaded. Link and owned-container absence passed independent readback. Scratch
files and the original failure receipt remain retained; the service was never
started and no production service was changed.

The original receipt SHA-256 is
`92278d129d4cc46271fc193e060388ca451b1a619d0b00cd8710b28d1aed5e8a`.
A distinct private cleanup-recovery receipt binds that hash. Cleanup recovery does
not turn the failed physical attempt into a passing drain receipt.

## Integrated source-exclusion verification

After integrating the independently approved source/solver exclusion stack,
exact `1d92f28859541121f4e7542cdf2d828cd6605786` passed the ten-file focused
source/solver/backend/gateway/ingress/ownership/mount/privacy suite: **357 pass,
0 fail, 3024 assertions**, 19.19 seconds. Local output is retained in
`/tmp/puni-integrated-source-1d92f2885.log`. This does not establish physical
source acceptance, compatible restoration, installed adoption or a full gate.

## Second host attempt: controlled refusal state

Exact `42020a6bfba221482096b73bd6dfe869ee517ffa` ran under the canonical
host lock and exited 1. Native hook observation passed. The private receipt
records real creator-stop child survival, cgroup observations, attempt inventory
and the protected callback's manual/systemd restart refusal. Final verification
then refused because the expected blocked fixture restart exited 78 and systemd
retained `failed/failed`, zero main/control PIDs, no job and an empty cgroup.
Stopping that already-failed unit does not change it to `inactive/dead`.

Review also identified a real contract mismatch: the fixture suppressed restart
for exit 78, while production still exited 1 and had no corresponding unit
setting. A separate reviewed source correction must couple typed retained-owner
refusal, actual CLI exit classification, production restart prevention, effective
unit observations and shared terminal-state verification. No generic lock error
or unrelated startup failure may be reclassified as controlled refusal.

The original receipt SHA-256 is
`859543d7be562274edb6fe213422a4d9c6584cef0ea17d3b3668b8be0b50133e`.
Attended recovery under the canonical lock verified exact unit bytes/link,
unchanged identity and two native terminal-78 observations, including the
restart-prevention setting, no drop-ins/jobs/PIDs/cgroup and no owned containers.
Only the exact fixture link was removed, the manager reloaded, and link/container
absence independently read back. No `reset-failed` was used. The original receipt,
failed-state evidence and scratch files remain retained. This attempt is failed;
it is not a passing physical exclusion or production-adoption receipt.

## Merged policy/observer check

The first eleven-file merged check at
`2e471717fdd55782eb463baccedd483a295d5a06` reported **192 pass, 8 fail**.
Seven installer cases correctly refused the newly observed global Bun 1.4.4
instead of the pinned 1.4.2; the remaining case had a newly merged observer fixture
still using legacy unit argv. The latter is corrected in the terminal-contract
packet, not relabeled passing here.

An isolated Bun 1.4.2 was installed under `/tmp`, with archive SHA-256 verified
against `infra/versions/toolchain.json`; the global runtime was not changed.
Rechecking the complete installer-operation file with that runtime passed
**47 tests, 0 failures, 355 assertions**, 8.10 seconds. The merged full check must
be rerun after the terminal-contract packet is integrated.

## Positive solver-only host acceptance

Exact `1d72ba511bfb2b08aa3b8ddf8906746ea35546cc` passed the real
`tool-remote-scripts:test:solver-drain` target under the canonical h2 heavy lock,
exit 0, 17.5 seconds. It used a new clean detached worktree and the preinstalled
dependency tree only after exact `bun.lock` and `package.json` comparison; this
was dependency reuse, not a claimed fresh frozen install.

The owned fixture exercised real ordinary-policy initialization/admission,
native typed-empty hook observation, systemd stop and controlled-78 restart
refusal, process/cgroup extinction, creator-stop Docker-child survival, complete
attempt inventory and terminal cleanup. The private receipt records
`drain-completed`, `cleanup.complete=true`, no failure and no cleanup failures.
Independent queries then found no invocation-owned containers and no exact unit
link. No production service, store, image tag or configuration was changed.

The raw receipt and host log are preserved privately in
`/tmp/puni-solver-host-1d72ba511/`. Its SHA-256 is
`65cd4aa53f14a5e25e6d86fb3043885d4d83ef26121f07846af59968c8ebbfc2`.
[Redacted physical summary](evidence/solver-drain-acceptance/host-1d72ba511.json)
contains only the source identity, receipt hash, bounded observations and cleanup
facts. Private operational fields and the separate live-authority audit are not
published with that summary.

This positive does not prove the full source/backend/gateway/Caddy composition,
production installed-authority adoption, actual application semantics, compatible
restoration or the final exact-SHA gate.

## Complete configured local unit command after integration

At `c2bb10d574a159aa38d76ebcd56e829a846fe16f`, the exact local unit
command from `tool-remote-scripts` project configuration passed with pinned Bun
1.4.2 and permitted local socket primitives: **1868 pass, 2 skip, 0 fail, 11262
assertions across 83 files**, 339.76 seconds. Both skips are the existing real-Docker
exceptional-cleanup cases. Output is retained in
`/tmp/puni-integrated-configured-unit-c2bb10d57.log`; exit file is 0.
The separate real-Caddy prerequisite and full canonical gate are not included in
that unit invocation and are not claimed passed by it.
