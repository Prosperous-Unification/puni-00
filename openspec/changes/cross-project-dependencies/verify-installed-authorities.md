# P2b-1 installed-authority observation review packet

Status: source implementation and focused evidence prepared for independent review.
This packet does **not** mark activation, S4, P3, live adoption or host acceptance
complete. Independent review and exact-SHA host acceptance remain with the coordinator.

## Scope and boundaries

`installed-writers.ts` exports its existing strict v1 decoder and finite member
union. The offline capture observer retains its existing behavior and 46 regression
tests. The live observer reads `hostPath`, fixes the first seven canonical locations,
checks independently pinned source/build/manifest hashes and retains actual file
and parent descriptors around collection. Its public return is always
`activation: 'blocked'`; it contains no drain/adoption/exclusion grant.

The public `observeInstalledDependencyAuthorities()` constructs its own production
filesystem, solver and collector ports. The internal orchestration fixture executes
real owner locks/markers and the actual Python collector against controlled kernel,
filesystem and query adapters. Fixture path mappings reject changed production
writer, solver and DB fragments before redirecting them into scratch storage. No
prewritten successful host-capture response is used.

The collector reads complete root/user cron and system/user unit inventories,
including installed-only/loaded-only names, aliases, masks, templates and bounded
lazy manager loading closure. It reads typed native Unit metadata and execution
properties for service/socket/mount/swap units. Primitive property `s`/`b` payloads
are scalars; `as` and execution arrays are arrays; method object returns are
single-element arrays. Other shapes refuse. Canonical static launch hashing uses
sorted JSON object keys, sorted cron sources, system-before-user sorted unit names,
and explicit `canonicalId`/`names` alias binding. Dynamic process bookkeeping is
compared for stability but excluded from the static projection. Valid unrelated
transient descriptors remain represented; direct WBS transient launchers refuse.

The closed request additionally carries `writerManifestSha256` and all twelve
checked `{member,path}` entries. Those paths are private matching needles only;
the privileged collector never opens, stats or executes them. It revalidates the
finite roster, fixed seven mappings, canonical grammar, bounds and uniqueness,
and binds the echoed manifest hash to the nonce. Actual privileged path reads
remain fixed launch/kernel sources or the two validated DB families.

The process census uses PID/start ticks, exact cgroup-v2 identity and FD device/inode
comparisons for main/WAL/SHM/journal files across all UIDs. It reports source,
solver and container openers without labeling them drained. Prior host executors
refuse despite identical replacement bytes. Disappearing PIDs require independent
exit proof; partial/unreadable census, deleted DB aliases, changed sidecars and
late relevant processes refuse. Newly observed unrelated processes converge in
bounded rounds. Only exact internally captured collector identities are exempt
from prior-executor classification; they still cannot hold selected DB FDs.

## Fixed one-shot transport

The final invocation is fixed Python `-I -c <embedded constant program>` (under
`sudo -n` unless already root). The constant program is bounded to 96 KiB. Private
request/heartbeat/cancellation bytes use standard stdin; no inherited FD3 or sudo
close-from assumption is made. There is no helper installation, resident service,
registry, VM, arbitrary command request or host process-management interface.

One ephemeral privileged supervisor verifies Linux child-subreaper support before
any worker/query fork, remains outside the worker's new session/process group,
and owns retained pidfds for its exact descendants. Cancellation/deadline, control
loss, coordinator death, output overflow, worker failure and process-group escape
trigger TERM then KILL of owned descendants only. A clean terminal acknowledgement
requires worker pipe EOF **and** `waitpid` ECHILD. A killed supervisor, partial
acknowledgement or missing cleanup convergence is `AuthorityCleanupUnknown`, which
requires retaining the owner/evidence for attended inspection. Killing/reaping the
direct sudo child is never represented as proof of privileged descendant cleanup.

A ready acknowledgement carries the supervisor's monotonic sample. The coordinator
uses its remaining original deadline to send a conservative absolute worker
start deadline; it does not assume Bun hrtime and Python monotonic clocks share an
epoch. The worker's collection budget reserves time for bounded cleanup within the
120-second maximum. No query child runs before the supervisor's ready/start
handshake.

## Fresh checks

Pinned Bun: `/tmp/puni-pr630-bun142-al30yoqo/bun` version 1.4.2. `package.json` and
`bun.lock` matched the source checkout before reusing its `node_modules` by symlink;
this was not a fresh dependency install. Nx used `NX_DAEMON=false` and
`NX_ISOLATE_PLUGINS=false`.

- Focused writer/authority tests: **107 passed, 0 failed, 232 assertions** across
  seven files, including 46 offline writer regressions and 18 real supervisor cases.
- Configured `nx run tool-remote-scripts:lint`: passed with the actual target banner
  and uncached successful completion. A stale clone-local lazy-import graph was
  corrected using `nx reset --only-workspace-data` before rerunning.
- Configured `nx run tool-remote-scripts:typecheck`: passed with actual target output.
- Configured `nx run tool-remote-scripts:build`: passed all four required targets;
  this includes the five existing executor bundles, not a new activation writer.
- Initial `openspec validate --all --json`: 276/277 valid, with the integration-created
  empty duplicate native-mount requirement. Root's approved docs correction
  `c3f12dce0b019296ef7f0c6a1cc73db339cec75a` was cherry-picked as
  `ee5fe5695` atop base `c6730b830b0106d58f17674d208ce07a7cc71d89` before the implementation
  commit. The original failure is retained as baseline evidence. The refreshed
  full validation passed **277/277** items with exit 0.

This sandbox denies disposable subprocess pipe writes (Bun FileSink EPERM; Node
child stdin early EOF). The minimal Python-readline reproduction failed inside the
sandbox and returned `hello` outside it. Real supervisor proofs therefore ran with
normal tool auto-review escalation for **scratch-only local subprocesses**; this
was not a live sudo/systemd/host call or a code workaround for the sandbox.

## Watched R5 omissions

Thirty-five deliberate production guard/dependency faults each produced assertion
failures, then the original source was restored. Adjacent `Proof:` comments name
the guards and observed tests. The mutations covered:

- exact cron absence, duplicate direct launch, effective reload and transient WBS authority;
- final host/coordinator/launch binding, complete installed-unit inventory and full static hash;
- finite writer roster/fixed paths/name decoder, old interpreter refusal, proc unreadability;
- FD inode matching, previous-PID omission and late relevant process admission;
- independently pinned DB main/parent identities and changed sidecar family;
- typed object binding, scalar/array metadata and execution-command nesting;
- installed hash, file aliases, same-inode leaf through a replaced parent, file readback;
- final actual owner, independent machine/launch hashes and bounded subprocess output;
- required subreaper capability, terminal ECHILD, worker pipe EOF and supervisor output bounds.

Real scratch subprocesses additionally prove identical-byte interpreter replacement
remains refused; child/grandchild/setsid survivors are cleaned; TERM-ignoring children
are killed; cancellation before/after fork, closed control, coordinator death,
delayed cleanup and output saturation refuse conservatively; unrelated processes
remain alive. Missing ECHILD, retained pipe writers, supervisor death and partial
acknowledgements remain cleanup-unknown. A retained pidfd refuses an exited identity
and cannot signal a newly spawned replacement process; the test does not claim to
force numerical PID reuse on the real kernel.

## Resolved preparation boundary and explicit limits

The public request contains manifest **contents**, whose reviewed/installed capture
paths are relative, but contains no offline capture-root pathname. The live observer
can exclude exact owner evidence/state directories and prove unique live paths and
inodes; it cannot prove that the five declared host locations are outside an
arbitrary external offline capture directory, or compare their inodes against its
reviewed/captured files. It does not invent a capture-root default or claim that
comparison. The existing offline inspector retains its capture-root alias/descriptor
proofs. The coordinator's Astra ruling assigns that actual offline reviewed/captured alias
proof to independently reviewed manifest preparation. No arbitrary privileged
capture-root input/default is added. The live scope does not read those offline
files as authority. A future claim of contemporaneous cross-capture independence
would require a separate explicit binding, recheck and review.

No live host authority collection, privileged authorization/config installation,
service/cron adoption, process drain, Docker membership claim, database write,
activation or exposure occurred. User/system bus availability and the exact installed
host inventory remain live prerequisites. This source slice does not create the later
complete exclusion interval or decide which observed DB opener is a valid participant.
No Caddy integration tests, raw full Nx test target, full h2/h4 host gate, fresh frozen
install, actual sudo policy acceptance or live cleanup acceptance were executed.
The coordinator owns exact-SHA host acceptance after independent review.

## Independent review corrections after 039b1d34b

Astra identified three production gaps hidden by the original fixtures. The follow-up
commit fixes them without invoking sudo, systemd or other live host operations.

1. Python `os.listdir('/proc/self/fd')` reported its own already-closed enumeration
   FD. The collector now retains a real libc directory stream throughout both FD
   passes, reads it with `readdir`, and inspects every returned FD including that
   live enumeration descriptor. It does not ignore holes or exempt self from DB
   opener matching. A native unchanged self-census failed before the fix, passes
   afterward, and reports an ordinary scratch file held open by that same process.
2. The waiting sudo transport also contains the embedded program in its argv. The
   private supervisor envelope now binds the actual spawned transport PID/start/
   cgroup. Before worker fork, the supervisor proves the finite kernel parent chain
   from itself through that exact transport to the exact coordinator. It checks
   the initial fixed invocation and executable inode, snapshots full exe/hash,
   argv-hash, PID/start/cgroup/UID/cwd identities, and rechecks them. Sudo monitor
   records are exact snapshots of that proven chain, not name/UID/ancestor patterns.
   The worker registers precisely those records plus itself. A native Python
   launcher fixture substitutes only checked fixed sudo executable/prefix fragments
   and uses the actual production invocation shape; no sudo call occurs. Exact
   transport succeeds, same-executable outsiders and invocation/executable/start/
   cgroup/full-identity drift refuse.
3. Solver path/argv spelling no longer exempts a process. A closed private solver
   projection is derived from the strict effective unit, actual kernel PID/start/
   cgroup and independently pinned interpreter tuple/argv. Stopped units explicitly
   supply null. The collector accepts only that exact solver and refuses every
   manual/additional instance, including attempts to reuse the coordinator exception.
   TypeScript independently checks every returned relevant process against the exact
   coordinator, retained internal process records or exact effective solver, and
   requires exactly one effective solver when running. The blocked public observation
   retains typed `relevantProcesses`; the full inventory is no longer discarded.

Native tests execute a manually launched scratch supervisor through a checked mapping
of the two fixed solver path fragments. Stopped/wrong PID/start/cgroup/executable/
argv identities refuse and an exact projection succeeds. Real owner/collector
orchestration additionally rejects missing, extra and altered solver records after
actual collection; its positive running-unit observation retains the exact process.
A separate native harness kills an actual child Bun coordinator, then its scratch
subreaper proves the supervisor/worker descendants are fully reaped. The former
foreign-coordinator fixture is now correctly a pre-fork refusal test, rather than
being mislabeled as coordinator death.

Twelve additional production guard/dependency omissions were watched red and
restored: retained self-listing stream, transport census registration, initial
transport argv/executable/kernel identity, complete internal identity matching,
solver kernel binding/coordinator-alias refusal, extra relevant process rejection,
missing effective solver rejection, retained public inventory and required internal-process liveness. These are separate
from the original 35 watched implementation faults.

The follow-up remains on the exact standalone clone's pinned Bun **1.4.2**, with
`package.json` and `bun.lock` still equal to its dependency source before final
checks. It does not claim acceptance against the separately advancing main branch's
Bun 1.4.4 pin. The coordinator owns that merge/retest and fresh independent review.

Follow-up focused verification: **124 passed, 0 failed, 266 assertions** across seven
files. Configured lint and typecheck passed uncached with actual Nx output. The
configured executor build passed (three unchanged dependency targets used local
cache), and the explicit observer bundle compiled. Full OpenSpec validation passed
277/277 items. Normal commit-hook results accompany the exact follow-up commit
report; no hook bypass or full host gate is claimed.
