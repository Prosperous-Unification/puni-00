# Disposable solver drain acceptance

Status: implementation prepared for independent review. **No actual-host execution
has occurred in this packet.** S1/S2/O4 and parent 10.2 remain open.

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

## Reviewed host invocation template

After the final source SHA is installed in a clean isolated host tree with its
locked dependencies already installed, supply a known installed image and a new
absolute private receipt path, then invoke under the canonical heavy lock:

```sh
SOLVER_DRAIN_SHA=<exact-reviewed-40-character-sha> \
SOLVER_DRAIN_IMAGE=<already-installed-repository@sha256:digest> \
SOLVER_DRAIN_RECEIPT=/absolute/private/new-receipt.json \
  bin/with-heavy-lock.sh env NX_DAEMON=false bunx nx run tool-remote-scripts:test:solver-drain --skip-nx-cache
```

This is an execution template, not evidence of a completed host run. The runner
refuses omitted inputs, dirty relevant source, absent tools/image and receipt
replacement. It never queries the installed production service or performs a
global solver census.
