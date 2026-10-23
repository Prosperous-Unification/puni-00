# Task 7.3/7.4 h2 actual-image proof runner

Prepared from `b2a9f1bb1` (approved cleanup integrated). **No actual image or host
proof has been run by this packet. Tasks 7.3/7.4 remain open.** The receipt directory
is created only by a future operator invocation; this source is not a receipt.

Use a clean, dedicated h2puni Git worktree containing the final reviewed packet
commit, outside `/home/puni1/wbs-dev/src` and outside the shared gate tree. Install
locked dependencies beforehand as the host workflow requires. Supply the full
40-character commit SHA, not the preparation base above. The script checks exact
HEAD, clean isolated checkout, h2puni, required tools and disabled orphan mode.

Run once, externally under the canonical heavy lock. Do not invoke from a gate,
wrap a gate around this command, or run the Bun entrypoint without the wrapper.
Substitute absolute paths, SHA and a new receipt path whose parent exists:

```sh
cd /home/puni1/task7-image-proof
HEAVY_LOCK_LABEL=task7-actual-image-proof HEAVY_LOCK_WAIT_SECONDS=1800 \
  bin/with-heavy-lock.sh -- \
  bun apps/wbs/be-01/scripts/task7-solver-image-proof.ts \
  FULL_REVIEWED_40_CHARACTER_SHA /tmp/task7-image-receipt-UNIQUE \
  > /tmp/task7-image-lock-UNIQUE.log 2>&1
```

Retain the outer command exit status and lock acquisition output alongside the
receipt. The outer canonical invocation is the locking authority; a lock status
snapshot does not prove this process owns it. This runner deliberately does not
invent an ancestor PID or environment-token ownership check.

The sequence requires full built-mode green, then builds and retains a separate
attempt-owned baseline, starts a loopback-only disposable registry, pushes the
baseline and requires supplied-mode green by its exact immutable digest. It then
builds each derivative independently with `FROM <baseline digest>` and a single
`COPY fault.ts /app/<production path>`. No source checkout is edited. Each mutant
must fail at its selected composed assertion; the identical retained baseline
digest must pass after each mutant, including an unexpectedly failing mutation
proof. An earlier client failure, import failure, timeout or generic Docker error
refuses acceptance. Stop and review rather than broadening accepted errors.

The four mutations are source binding omission; omission of owned reader close;
forced baseline publication; and inclusion of cached `ok` in observation requests
plus bypass of the reservation terminal check for cached `ok`. The closure fault
is a broken closure, not relocated admission. Source binding and closure currently
surface at the composed terminal-ledger assertion because fixture logging retains
the admission error; the latter does not print that earlier assertion directly.
Reuse must reach a complete settled-ledger assertion. Assertion line numbers are
computed from the reviewed checkout and matched against the image stack.

Every command has a GNU timeout, work has a one-hour deadline, and cleanup has
independent per-resource bounds. SIGINT/SIGTERM stop the current command and route
through cleanup. The smoke owns its caller, supervisor, child inventory and built
artifacts; its existing checked cleanup remains authoritative for those resources.
This runner owns only its UUID registry and exact six tags (baseline local tag,
baseline registry tag, four derivative registry tags), recorded before creation.
Cleanup runs in reverse tag order, checks absence by inspect, distinguishes daemon
or permission failure from absence, attempts all resources after partial failure,
and preserves the original failure if cleanup also fails. No prune or broad
container/image deletion is used. Registry images and builder cache are shared
Docker infrastructure, not attempt-owned tags.

The private receipt records commands, exit statuses, stdout/stderr logs, baseline
and derivative digests, complete replacement files and their SHA-256, Dockerfiles,
exact tag/container inventory, restored greens and cleanup readback. Keep failed
receipts too. Do not insert observed `Proof:` comments into production symbols or
close parent tasks until the actual host observations and separate exact-head gate
have been reviewed. An interrupted receipt remains a failure until its inventory
has been checked and any manual cleanup is recorded.

Local validation command (fake commands only):

```sh
bun test apps/wbs/be-01/scripts/task7-solver-image-proof.test.ts
```

## Preparation evidence (local only, 2026-10-23)

Isolated `/tmp/puni-task73-proof` at preparation base `b2a9f1bb1`. The existing
locked dependency tree was reused with an ignored `node_modules` symlink; no
install occurred. `bun test apps/wbs/be-01/scripts/task7-solver-image-proof.test.ts`: 14 passed, 0 failed,
48 assertions. Fake Docker proves recorded resource scope, existing-tag refusal,
removal denial, ignored removal, delete failure after untag, inspect permission
failure with continued cleanup, generic-error rejection, failed-green rejection,
primary failure preservation and bounded work. The planned-sequence test replaces
Docker/build/smoke with local fakes and checks every original-digest restoration,
independent Dockerfile and six-tag inventory; it proves orchestration only.

Ten independent guard mutations each made its selected test fail (exit 1), then
were restored: SHA equality, mutation-site count, inspect error classification,
container/image absence readback, command status, green status, composed stack
classification, original failure preservation, existing-tag ownership and work
deadline. Local logs: `/tmp/task7-proof-guard-{exact-sha,site,inspect,readback,
command-status,green-status,classification,primary,ownership,bound}.log`.
Adjacent comments name those observed faults. Restored suite log:
`/tmp/task7-proof-final-tests.log`.

Standalone strict check exited 0:
`bunx tsc --noEmit --strict --skipLibCheck --target ESNext --module preserve
--moduleResolution bundler --types bun-types apps/wbs/be-01/scripts/task7-solver-image-proof{,.test}.ts`.
The first attempt used unavailable type name `bun` and exited 1; the corrected
command uses this repository's installed `bun-types` definition. Scoped Prettier
and whitespace validation are recorded by the packet's final preparation commit.

The host/isolation/tool/receipt preflights are source-reviewed and remain unexercised
under their complete real-host conditions. Signal delivery to real Docker, registry
readiness/push behavior, digest resolution, actual mutant assertion sites, real
cleanup, full project lint and the canonical host gate remain unverified here.
No actual host receipt, Docker call, h1 build, h2 gate, push, merge or PR mutation
was performed. Parent Tasks 7.3/7.4 remain open.

The first normal-hook commit attempt rejected evidence-directory TypeScript as
outside the project service. Both executable files now live under the existing
be-01 scripts TypeScript project; hooks were retained and rerun.

After moving the scripts into their owned project, the configured
`bunx tsc --project apps/wbs/be-01/tsconfig.tools.json --noEmit --pretty false`
passed. Scoped ESLint passed after generating the Nx project graph with
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show project wbs-be-01 --json`;
the earlier pre-graph warning is not counted as module-boundary evidence.
`bunx openspec validate cross-project-dependencies --json` reported 1 passed,
0 failed, with existing long-requirement warnings.

## Review corrections: inner receipt and interrupted cleanup

Astra identified two proof-runner gaps after the preparation commit: an intended
composed assertion could mask an inner cleanup failure, and an outer timeout
could stop inner cleanup before later owned resources were released. Neither gap
was exercised against real Docker or h2puni.

Each smoke invocation now receives a fresh UUID cleanup nonce. The inner shell
prints exactly one `cleanup-complete <nonce>` line only after every cleanup step
succeeds, including when the client originally failed. The outer runner requires
that exact invocation receipt before accepting either green or an expected
production assertion. A missing, foreign or duplicate receipt refuses acceptance;
a cleanup failure preserves the original client exit status and emits no receipt.

Before launching the inner smoke, the runner records and creates an exclusive
`/run/user/<uid>/wbs-solver-proof-inventory-<nonce>` directory. This survives socket
directory removal and shares its filesystem, while the main receipt remains under
`/tmp`. The shell records its invocation identity, initial owned names, each tag
and each later direct-client token before creation. It creates the retained
admission file first, then hardlinks it into the private socket directory before
the composed client can append its pre-request Pri/Time tokens. No new mount or
fixture-client protocol is introduced. The socket directory name uses the fresh
invocation nonce and is recorded before creation too.

On every inner return, the outer runner retains stdout/stderr and the exit/signal
status, snapshots both retained inventory files into the main receipt, and validates
ownership and framing. It independently inspects, removes and reads back each
recorded nested container and image with bounded commands, even after TERM/KILL.
It attempts later resources after an earlier removal failure. It removes the exact
socket inventory/socket paths and directory, and removes the retained `/run`
inventory only after successful recovery and copying. Malformed/unreadable
inventory or failed recovery refuses acceptance and leaves the retained directory
named in the receipt for review. A recovered timeout remains a failed proof.

The first receipt-negative run reproduced the P1 false green: 0 passed / 3 failed
for intended assertions with absent, foreign and duplicate receipts. The corrected
outer fake-command suite passed 24 tests, including malformed/missing/unreadable
inventory refusal and a stalled inner cleanup killed with a later caller, child
and image still owned. That test requires the saved KILL status/output and proves
all later resources absent after recovery. Inner fake-Docker tests cover receipts
after failed clients, withheld receipts on cleanup denial in both modes, invalid
nonce refusal and preservation of admission tokens after socket cleanup.

The first cross-filesystem prototype correctly failed: hardlinking `/tmp` retained
admission state into `/run` returned a cross-device error. The retained directory
now lives under `/run`; `/tmp` receives copies. Exact empty UUID test directories
left by the failed prototype were removed explicitly. No broad cleanup occurred.

Supervisor recovery also has an explicit owner. A pre-fork marker records that
supervisor startup began; immediately after fork and before any authenticated
caller, the shell records the PID and Linux `/proc` start tick. Recovery checks
that identity before bounded TERM/KILL and requires the process absent or zombie
(non-executing) before removing socket paths. A reused PID or missing startup
identity fails visibly and preserves the socket directory for manual review;
independent recorded Docker cleanup still proceeds. Deleting a socket is never
used as process termination evidence.

The stalled-inner test includes a real detached dummy supervisor outside the
inner timeout's process group. It proves that KILL can stop inner cleanup while
the dummy survives, and that recovery then terminates/reaps it plus the later
recorded fake child/image. A separate wrong-start-tick test verifies that recovery
refuses to signal a live dummy with another recorded incarnation. Test-owned
cleanup releases that dummy afterward. Inventory copies are asserted under `/tmp`
while the runtime directory is on `/run`'s different filesystem.

Recovery accepts at most 8192 manifest bytes, 15 records, seven direct containers,
two composed admission tokens, three images, one supervisor and one socket
directory. It validates those limits before any recovery Docker work. Overcount,
missing/unreadable state, malformed framing, foreign invocation/name, duplicate
ownership and missing supervisor identity refuse acceptance.

Eleven independent production-path mutations each failed the selected negative,
then were restored: receipt matching; cleanup-success emission gating; receipt
emission; nested recovery invocation; manifest invocation identity; container name
ownership; supervisor start incarnation; supervisor identity presence; captured
output persistence; resource count bound; retained supervisor ownership entry.
Logs: `/tmp/task7-recovery-negative-{receipt-guard,receipt-gate,receipt-emission,
nested-recovery,manifest-invocation,container-ownership,pid-incarnation,
supervisor-presence,captured-output,resource-bound,retained-supervisor}.log`.
The manifest mutation preserves header consumption so another parser error cannot
stand in for the invocation check. Malformed-state tests require the precise
expected diagnosis.

Final restored fake suites:
`bun test apps/wbs/be-01/scripts/solver-image-smoke.test.ts
apps/wbs/be-01/scripts/task7-solver-image-proof.test.ts --timeout=10000`:
103 passed, 0 failed, 346 assertions, 58.68 seconds
(`/tmp/task7-recovery-full-final.log`). These tests used approved temporary Unix
sockets, attempt-owned `/run` inventory directories and dummy processes; all Docker
commands were fakes. Configured be-01 tools TypeScript check, graph-aware scoped
ESLint, ShellCheck, scoped Prettier and whitespace checks passed. OpenSpec validation
reported 1 passed / 0 failed with existing long-requirement warnings. No actual
Docker build/run, h2 proof/gate, push, merge or PR mutation occurred. Tasks 7.3/7.4
remain open.
