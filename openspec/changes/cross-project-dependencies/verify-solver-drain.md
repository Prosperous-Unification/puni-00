# Owner-bound solver drain source prerequisite — 2026-10-23

The callable `withSolverDrainUnderOwner` covers the fixed host-wide service under
both prod and dev live ownership. It accepts closed independent source/Bun/bundle/
config/unit pins, captures canonical bounded nofollow files without retaining raw
executable/config bytes, validates the strict production config, and binds the
effective unit's admission namespace to the directory actually owned. Numbered
private owner records retain command intent/readback and file/process/cgroup/
terminal observations. The composed owner entrypoint supplies its live owner to
all remaining protected work and returns `activation: blocked`.

The order is installed tuple → effective service/process/cgroup → durable stop
intent → fixed-service bounded stop → stopped unit and empty original cgroup →
canonical runtime lock → complete Docker discovery/drain → protected callback →
fresh unit/tuple/membership/terminal/owner readbacks. The runtime lock encloses the
whole latter interval. Docker discovery unions the managed label and known name
family. Five projected protocol labels, exact name/ID, config-admitted image refs
and independently resolved immutable IDs, restart authority and native lifecycle
must agree. Never-started created attempts are explicitly inert. Running attempts
use exact-ID kill/wait and fresh terminal inspection; a kill error recovers only
with independently observed same-container terminal evidence. Containers and
deadline backstops remain intact.

## Source acceptance

`bun test tools/tool-remote-scripts/src/lib/solver-exclusion.test.ts tools/tool-remote-scripts/src/lib/solver-host.test.ts tools/tool-remote-scripts/src/lib/solver-cohort.test.ts tools/tool-remote-scripts/src/lib/edge-ownership.test.ts tools/tool-remote-scripts/src/lib/solver-runtime-admission.test.ts tools/tool-remote-scripts/src/solver-supervisor-install-operation.test.ts tools/tool-remote-scripts/src/install.test.ts --preload ./tools/test/scratch/preload.ts --timeout=10000`

**123 pass, 0 fail; 668 assertions across seven files.** [Fresh output](evidence/solver-drain/focused-green.log.txt).
The first ordinary-sandbox attempt was denied disposable Unix socket binds in
existing installer fixtures; the scoped escalated rerun above passed. No real
systemd unit, Docker daemon, host service or production store was used.

New source tests use real temporary installed files, canonical owner records,
actual flock contention and executable command children. Systemd/Docker output
transport and cgroup population are hermetic substitutions; a separate test reads
real `/proc` identity. Tests cover missing/wrong/changed/mode-mismatched files,
unreadable files and aliases, both-environment authority, effective-unit and state
namespace refusals, PID start identity drift, stop no-op and surviving descendant,
manual runtime contention, a child created during stop, surviving Docker child,
created-inert handling, terminal-only kill-race recovery, membership/name/label/
image/tuple/owner drift, timeout intent retention and callback/final-check lifetime.
Malformed UTF-8 command output first reproduced a live child leak, then passed
with exact-child kill/reap on every reader failure. Isolated child-only file-open
interception also proves actual FIFO substitution does not block and an actual
mode change after the final descriptor stat refuses stale pathname metadata.

## Watched omissions

The [driver](evidence/solver-drain/mutations.py.txt) was run from the isolated
worktree. Every one of the following independent production faults exited **1**;
all production sources were restored. [Driver output](evidence/solver-drain/mutations.log.txt).
Tests fail through forbidden acceptance, retained-evidence absence, a live child,
or the physically missing stop/terminal observation, rather than syntax errors.

| Fault                                                                          | Observed failed acceptance                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [Omit stop](evidence/solver-drain/stop.log.txt)                                | Positive drain observes still-active service                       |
| [Omit stopped-unit readback](evidence/solver-drain/stop-readback.log.txt)      | No-op stop admits protected work                                   |
| [Omit cgroup population/identity](evidence/solver-drain/cgroup.log.txt)        | Surviving descendant admits protected work                         |
| [Omit runtime lock](evidence/solver-drain/runtime.log.txt)                     | Occupied real runtime admits protected work                        |
| [Omit exact-ID kill](evidence/solver-drain/kill.log.txt)                       | Positive drain observes nonterminal child                          |
| [Omit terminal checks](evidence/solver-drain/terminal.log.txt)                 | Surviving Docker child admits protected work                       |
| [Omit membership comparison](evidence/solver-drain/membership.log.txt)         | New/missing final member returns success                           |
| [Break owner publication check](evidence/solver-drain/owner.log.txt)           | Lost callback owner returns success                                |
| [Omit actual owner namespace binding](evidence/solver-drain/namespace.log.txt) | Different effective admission directory admits callback            |
| [Break dev authority](evidence/solver-drain/dev-owner.log.txt)                 | Prod-only owner admits host-wide stop/work                         |
| [Omit tuple hash/mode pins](evidence/solver-drain/tuple.log.txt)               | Changed installed bytes admit stop/work                            |
| [Omit image binding](evidence/solver-drain/image.log.txt)                      | Unreviewed digest/immutable identity admits kill/work              |
| [Omit effective environment](evidence/solver-drain/unit-environment.log.txt)   | Unrecognized admission namespace admits stop/work                  |
| [Omit PID start recheck](evidence/solver-drain/process-identity.log.txt)       | Changed start ticks admit stop/work                                |
| [Omit reader error cleanup](evidence/solver-drain/reader-cleanup.log.txt)      | Malformed-output exact child remains alive                         |
| [Omit retained stop intent](evidence/solver-drain/stop-intent.log.txt)         | Timeout/owner loss loses required stop evidence                    |
| [Omit tuple inode comparison](evidence/solver-drain/tuple-inode.log.txt)       | Same-byte replacement after callback returns success               |
| [Open pin object](evidence/solver-drain/pins-closed.log.txt)                   | Extra authority field is accepted                                  |
| [Normalize file alias](evidence/solver-drain/canonical-alias.log.txt)          | Required symlink alias is accepted                                 |
| [Remove file bound](evidence/solver-drain/file-bound.log.txt)                  | Oversized required observation is accepted                         |
| [Omit nonblocking open](evidence/solver-drain/nonblocking-open.log.txt)        | Actual lstat-to-FIFO substitution blocks until owned child timeout |
| [Omit final pathname metadata](evidence/solver-drain/final-metadata.log.txt)   | Actual chmod after final descriptor stat admits stale observation  |

## Focused tooling

- `NX_DAEMON=false bunx nx run tool-remote-scripts:typecheck --skip-nx-cache`: passed. [Output](evidence/solver-drain/typecheck.log.txt).
- `NX_DAEMON=false bunx nx run tool-remote-scripts:lint --skip-nx-cache`: passed. [Output](evidence/solver-drain/lint.log.txt).
- `NX_DAEMON=false bunx nx run tool-remote-scripts:build --skip-nx-cache`: passed. [Output](evidence/solver-drain/build.log.txt).

- `bun node_modules/@fission-ai/openspec/bin/openspec.js validate cross-project-dependencies --json`: valid with existing long-requirement warnings. [Output](evidence/solver-drain/openspec.log.txt).
- Changed-file Prettier and `git diff --check`: passed.

Nx used its documented in-process plugin fallback after sandbox worker socket
denial. This is focused source evidence; an integrated exact-SHA h2/h4 gate has
not been run by this packet.

## Controlled actual-host acceptance plan — unimplemented and unexecuted

A separate reviewed runner is required. Keep it out of this already bounded
source packet until its fixture transport has independent review. Root will run
it only after review under an authorized host heavy lock.

1. Allocate one unpredictable invocation token, canonical private scratch root,
   honest scratch edge-state directory and prod/dev layout directories. Prepare
   four private fixture tuple files from independently reviewed bytes; compute
   expected pins before publishing their installed copies. Require an explicitly
   supplied already-present digest-pinned fixture image; do not pull implicitly.
2. Create only `wbs-solver-drain-acceptance-<token>.service`, a linked,
   non-transient user unit with independently checked file/path identity. Its
   reviewed creator fixture takes the real runtime admission lock for its whole
   lifetime, reports readiness, owns a descendant and creates only invocation-
   owned Docker attempts. Use exact fixture argv and the honest scratch
   `WBS_EDGE_STATE`. This proves the exclusion adapter, not installed supervisor
   provenance or complete supervisor startup/adoption. Do not run the real
   supervisor's global orphan sweep against a host daemon.
3. A fixture-only transport validates the exact unit name, linked FragmentPath,
   argv, known environment, token and file identities before mapping only the
   reviewed logical production service/path fields. Preserve actual systemd
   execution-record serialization. Map the exact observed fixture cgroup between
   logical and physical names while using real `/proc` PID start ticks and real
   cgroup-v2 population/inodes. Keep scratch admission state honest end to end;
   never report production state while holding a scratch owner/runtime lock.
4. Scope both Docker discovery commands with an additional unique fixture-owner
   label, retaining their managed-label/name-family filters. Reject any ID outside
   the predeclared invocation inventory. Before each exact-ID effect independently
   recheck that container's unique fixture ownership. Preserve the five protocol
   labels/name/image/restart/native-state projections. Never issue a host-wide
   managed-label or name-family census, query the installed production service,
   or stop/remove any non-fixture resource.
5. Observe real unit stop and empty/removed descendant cgroup, a Docker child
   still running after creator stop, an attempt created during stop, created-inert
   handling, exact-ID kill/wait/terminal agreement and final membership. Within
   the protected callback, race a fixture restart and manual guarded fixture
   launch against retained markers/runtime occupancy. Require no protected
   sentinel without the complete physical observations. Repeat only reviewed
   independent stop/cgroup/runtime/kill/terminal/membership faults.
6. On every outcome retain the private owner packet and fixture inventory. Cleanup
   checks stop/reap of the exact unique unit and terminal state before removing
   exact invocation-owned containers. Verify disappearance, remove only the
   identity-matched unit link/scratch files, reload the user manager and verify
   fixture-only absence. Cleanup uncertainty refuses success and names the exact
   owned manual completion commands; never sweep names, labels, or scratch roots.

## Limits

S1/S2/O4 and parent 10.2 remain open. No live authority census or audit was
collected, directly or indirectly. Old unguarded manual processes are not proven
absent by the new runtime lock. Effective systemd serialization and cgroup layout
on an actual host, continuous real restart/request admission, actual installed
writer adoption, other required participants, compatible restoration, atomic
activation and full protected-store exclusion remain unverified. No writable
activation CLI, restoration or complete activation grant was added. The action
must await every protected continuation; returning relinquishes runtime exclusion.
