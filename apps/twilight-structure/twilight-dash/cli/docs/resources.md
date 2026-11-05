# Managed resource cleanup

`resources` is Dash's Linux local resource runtime. It manages disposable output directories,
Git worktrees and the commands it launches inside them. A host reached over SSH can run the
same CLI there; this does not inspect remote processes from the SSH client's machine.
Docker, Kubernetes, automatic adoption of existing directories, ownership transfer and
external-release assertions are unsupported. Existing unwrapped Claude/Codex sessions and
native harness-created worktrees remain untracked.

## Supported ownership boundary

Run Dash and its managed commands under your existing Unix account; no separate account
is required. Use a canonical directory owned by that account with mode 0700. Workloads
cooperate with Dash: no changes to the root/ledger, no unregistered workspace copies,
no daemonization into an untracked session, and no external writer racing cleanup. Other users
must not have access to the managed root. This is not hostile same-UID isolation. Root or other
privileged actors can invalidate these guarantees.

Do not put a production watcher in a private PID namespace while writers exist outside it.
That would hide relevant processes. The test suite's private namespace contains only its own
disposable fixtures; it is not a workaround for production inspection permissions.

Creation does not preflight unrelated processes. Cleanup checks same-user `/proc` identity,
descriptors, cwd, mappings and mount evidence when it attempts release. An unreadable process
records a charged blocker naming its PID: work can finish, but the files and reservation remain
until inspection succeeds. Use `inspect` to read the reason, resolve the process-access issue,
then request cleanup again. There is no requirement to change Unix users. Linux `/proc`, `/etc/machine-id`, `git`, `python3`, and Bun are
required. Managed process draining also requires Python/kernel support for
`os.pidfd_open` and `signal.pidfd_send_signal`; missing support fails closed. Nothing here installs a system service or adopts/deletes existing laptop data.

## Enroll one root

Prepare an **empty**, canonical mode-0700 directory owned by your current account:

```sh
install -d -m 0700 "$HOME/.local/share/dash/resources" "$HOME/.config/dash"
```

Store the configuration at `$HOME/.config/dash/resources.json`, an account-owned regular file
with mode 0600, outside the disposable directories. Replace `/home/alex` below with your actual
absolute home path; JSON does not expand `$HOME` or `~`:

```json
{
  "schemaVersion": 3,
  "root": "/home/alex/.local/share/dash/resources",
  "authorityId": "linux-builder-one",
  "epoch": "initial-enrollment",
  "providerId": "provider-one",
  "mcpResource": "https://wbs.example.invalid/mcp",
  "credential": "<wbs_mk_ API key of the admin-bound machine credential>",
  "diskUnitBytes": 1073741824,
  "diskBudgetUnits": 32,
  "workspaceSlots": 4,
  "headroomBytes": 10737418240,
  "cpuCores": 8,
  "memoryGib": 15,
  "headroom": { "cpuCores": 0, "memoryGib": 2 },
  "exclusiveUnits": {
    "gate_tree": ["/home/alex/puni-00-gate-tbf", "/home/alex/puni-00-gate-tbf2"]
  },
  "enrollmentId": "linux-builder-one-pool"
}
```

The last five fields are the host pool (see [Host pool and host jobs](#host-pool-and-host-jobs));
a host that runs no host jobs still states its budgets and may name no units (`{}`).

Set its permissions before initialization:

```sh
chmod 0600 "$HOME/.config/dash/resources.json"
```

An organization admin first binds the **exact** machine credential to this provider, authority
and epoch using `PUT /api/organization/resource-authorities/:authorityId` with
`{providerId,credentialId,epoch}`. An ordinary worker credential cannot certify release. The
configuration's credential is never printed by Dash. Dash calls WBS's MCP endpoint
(`mcpResource`) with it: a `client_credentials` token at `<mcpResource>/oauth/token`, then the
tools `putApiResourceAuthoritiesByAuthorityIdAdmissions`,
`putApiResourceAuthoritiesByAuthorityIdEvents` and
`getApiResourceAuthoritiesByAuthorityIdCleanupRequests`
(`openspec/changes/wbs-mcp-agent-surface` M9: be-01's `/api` refuses the key itself
`401 machine_bearer_not_accepted`). Schema version 1 named a `wbsOrigin` and is refused;
schema version 2 had no host pool and is refused naming the five fields to add. HTTP is
accepted only on loopback for an explicit tunnel or test server; other endpoints require HTTPS
and redirects are refused. `watch` keeps retrying while WBS does not answer, answers `429` or
mcp-01 leaves a call uncompleted (`rate_limited`, `server_error`, …); a refused credential
(`machine_credential_refused`) or any other refusal stops it.

Commands below abbreviate the source entrypoint as `dash`:

```sh
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts resources init --config "$HOME/.config/dash/resources.json"
```

The sole ledger is `<root>/.dash/resources.sqlite`, with FULL-synchronous SQLite transactions,
WAL, history and publication outbox. It pins root device/inode, machine identity, authority,
epoch, provider, disk scale, budget policy and the host pool's budgets, headroom, units and
enrollment identity. Its schema is `user_version` 1. A ledger written before the host pool
(`user_version` 0) is migrated forward in one transaction the first time a schema-3
configuration opens it, only when its pinned binding is exactly that configuration's earlier
fields; any other version is refused, since nothing here can step a newer schema back. The
migration prints one line naming the ledger and the step. A Dash of the earlier version already
running keeps its open connection and does not count host jobs until it restarts, so drain and
restart it before enrolling the host (J12's drain before enrollment). Another configuration cannot silently change
this binding. Never delete or replace `.dash` to regain capacity. Missing/corrupt state refuses
normal operation; recovery requires preserving the ledger and reconciling outstanding uses.

Admission serializes all projects sharing this root. Every unresolved use counts, including
pending, blocked and retained work. It checks reserved units and measured available bytes
minus headroom, conservatively allowing the full reservation of every outstanding use to grow.
New creation requires a successful durable WBS admission before Dash creates any path or
allocates an ordered source event. Admission snapshots the authorized project/task/resource
attribution so legitimate planning deletion cannot invalidate queued publication. WBS shows
that provisional responsibility at source revision 0; it does not certify a physical path.
Provider/resource deletion refuses while that responsibility remains outstanding.

If the admission response is lost, unavailable, or refused, the local intent remains charged
at revision 0 with no path and no source sequence. `sync` retries its exact identity, then
requests cleanup and verifies noncreation; it does not resume the original command. A dead
creator is recovered the same way, while a live creator awaiting its first reply is left
alone. Persistently invalid attribution or credentials require operator repair; never edit
the ledger or free that unknown hold manually. Such refusals do not occupy source sequences
or block publication of other admitted uses. Inspect the saved intent after a failed create
before submitting another allocation, which has a distinct identity and reservation.
Already admitted uses still execute cleanup locally through WBS outages.

These are reservation controls, **not hard disk quotas**. Arbitrary external writers and
commands exceeding their reservation can still exhaust a filesystem. Separate managed roots
are separate pools; this module does not aggregate reservations from independently configured
roots.

## Run managed work

Write a creation request file. WBS attribution is required so every emitted event is
publishable; each physical review, implementation or subagent copy needs its own request/use.

```json
{
  "projectId": "project-one",
  "resourceId": "disk-resource",
  "workItemId": "work-one",
  "stepId": "implementation",
  "attemptNumber": 1,
  "agentRun": "run-one",
  "responsiblePersonId": "person-one",
  "units": 1,
  "kind": "git_worktree",
  "source": "/home/alex/wd/project",
  "diskUnits": 4,
  "disposablePaths": ["node_modules", "dist"]
}
```

`units` is the WBS resource quantity; `diskUnits` is the host reservation under the explicit
`diskUnitBytes` scale. Each use also reserves one workspace slot. The source repository must
be stable and outside the managed root. A `temporary_directory` request omits `source` and
explicitly declares **all** its contents disposable output; never put unique source/evidence
there. IDs and target directory names are generated by Dash, never supplied by HTTP requests.

Prefer the compound session so creation, execution and cleanup belong to one controller:

```sh
dash resources exec --config "$HOME/.config/dash/resources.json" --request "$HOME/.config/dash/work.json" -- codex exec 'implement the selected task'
dash resources exec --config "$HOME/.config/dash/resources.json" --request "$HOME/.config/dash/work.json" -- claude -p 'implement the selected task'
dash resources exec --config "$HOME/.config/dash/resources.json" --request "$HOME/.config/dash/work.json" -- /bin/sh -c 'bun install --backend=copyfile && bun test'
```

Dash reserves and persists intent before creation. It starts the command behind a separate
FD gate, persists Linux boot/PID/start identity before releasing that gate, preserves command
stdin/stdout/stderr, and records actual success/failure/cancellation separately from cleanup.
The CLI returns the command's exit code even when cleanup is blocked. Inspect the emitted use
snapshot for its independent cleanup state. Cancellation persists boot/PID/start identities for observed children before sending TERM.
It signals individual identity-verified processes through Linux pidfds and keeps five-second
KILL escalation active even when the leader has already exited. Restart cleanup resumes from
those durable identities. Session membership alone cannot authorize a signal: if no exact
known live member can establish the session, unknown survivors remain blocked and charged.
More than 4096 remembered descendants also requires owner review instead of truncating proof.

`DASH_RESOURCE_USE_ID` and `DASH_RESOURCE_ROOT` are available to the command. A child/review
request sets `parentId` to the parent use ID; `dependencies` lists other use IDs whose storage
it needs. Parent completion seals the manifest and enqueues all registered descendants in the
same transaction. Late allocations under a sealed/dead parent are refused. This enforces the
registered manifest only; Dash cannot inventory arbitrary resources created outside this API.

`create --config FILE --request FILE` and `run --config FILE --use ID -- COMMAND...` are also
available for explicit handoff. An unparented creation gets a **60-second launch grace** after
its creating process exits. `run` takes ownership and clears that deadline. A live parent owns
parented copies across short-lived create commands. Prefer `exec`: a watcher may reclaim an
unlaunched standalone use after its grace expires. A run's worker disappearance is reconciled
independently by the watcher; only identity-proven orphan groups are terminated.

## Generated files, preserved source, and shared blocks

A clean worktree's HEAD is pinned and verified in the stable repository at
`refs/dash-recovery/<use-id>` before `git worktree remove`. Worktree-only reflog commits and
private worktree/bisect/rewritten refs are additionally pinned at
`refs/dash-recovery/<use-id>-<object-id>` in one atomic Git ref transaction. More than 1024
orphan reflog commits or 1024 private refs blocks cleanup for owner review, without truncating
required preservation. Required source is not archived by
this initial provider: staged, unstaged, untracked or unknown ignored files cause retention
with responsible owner, reason and a review date. The same applies to any Git index entry
marked assume-unchanged or skip-worktree, including sparse checkout workflows: these flags
hide modified bytes from both status and normal worktree removal. Resolve them through owner
review before requesting a retry; a clean status alone is insufficient preservation proof. Recovery refs remain in the stable source;
Dash does not prune them or claim their objects were reclaimed.

`disposablePaths` explicitly authorizes reproducible **top-level directories** such as
`node_modules` and `dist`. Absolute paths, traversal, `.git` and nested paths are refused.
Tracked files under a named directory block deletion. Unknown ignored directories remain
retained. Deletion never follows symlinks, including links to source outside the root.

Shared hardlinks remain charged and block automatic cleanup for every provider, including
clean tracked Git worktree files. Complete no-follow storage inspection precedes both
preparation and deletion; the Git removal command does not bypass that inspection. Bun's normal hardlink backend
can produce these: the existing repository's `arktype/package.json` and
`@types/node/package.json` each had 77 links when inspected. In managed disposable worktrees,
use **`bun install --backend=copyfile`** with `disposablePaths: ["node_modules"]` to produce
owned disposable dependency files. This costs more space during the run. Continuing-owner
cache transfer/accounting is not implemented; do not bypass the hardlink guard for an external
package cache. All release events report `reclaimedBytes: null`, never reserved units or a
host-wide free-space change as bytes reclaimed by this cleanup.

## Watch, inspect and request cleanup

Run this foreground process as the same current user that launches managed commands. For
persistence, use your existing user service manager with restart-on-failure enabled:

```sh
dash resources watch --config "$HOME/.config/dash/resources.json"
```

Each tick reconciles dead owners and pending cleanup, publishes ordered durable events, and
consumes scoped WBS requests. WBS downtime preserves the outbox and does not prevent local
cleanup. Authentication/schema/identity failures stop the watcher visibly for operator repair;
no answer, a `429` and a call mcp-01 left uncompleted for a transient reason remain visible
retry obligations. Normal watch cadence is one
second. Provider subprocesses have 30-second kill deadlines; each cleanup has at most six
attempts with exponential backoff (one second through a one-minute cap). Exhaustion stays
blocked and charged until explicit retry. A retention review date requests another preservation
check; age never authorizes deleting unknown source.

```sh
dash resources inspect --config "$HOME/.config/dash/resources.json"
dash resources inspect --config "$HOME/.config/dash/resources.json" --use USE_ID
dash resources cleanup --config "$HOME/.config/dash/resources.json" --use USE_ID --revision REVISION --incarnation INCARNATION --reason 'operator retry after resolving blocker'
dash resources sweep --config "$HOME/.config/dash/resources.json"
dash resources sync --config "$HOME/.config/dash/resources.json"
```

`cleanup` checks the current local revision and incarnation, persists a request, then sweeps.
`sync` publishes existing outbox events and accepts WBS requests without inventing completion.
The next sweep applies their local intent. Request cursor and intent commit together. A stale
WBS revision for the same immutable incarnation is reconciled against current state; a request
for an already released use gets an attributable no-effect acknowledgment using the complete
original durable release proof and locator, without another removal or reservation return.

Inspect shows target identity, owner, reservation units, outcome, manifest sealing, blocker,
retry schedule and retained evidence. A missing path without prior deletion intent is blocked;
a replacement inode/symlink is never treated as the old target. Deletion followed by a crash
before the SQLite commit reconciles the persisted intent, verifies absence/holds, and publishes
one release. Release, reservation return and outbox insertion commit in one transaction.

## Host pool and host jobs

The same ledger is the host's **host pool** (`openspec/changes/dash-host-jobs`, J4): a **host
job** (a gate, a release build) is a use of kind `host_job` that reserves from the vector the
uses above reserve from. A worktree and a host job count against the same disk units and
workspace slots; a host job also reserves cores, memory and exclusive units.

- **Budgets.** `cpuCores` and `memoryGib` are what the pool may hand out, refused at
  `resources init` above this host's `nproc` or `MemTotal`. `headroom` is kept back per
  dimension: `allocatable = budget − headroom`, which must leave at least one core and one GiB.
- **Exclusive units.** `exclusiveUnits` names, per exclusive id, the units a job may take one
  of: each an absolute canonical directory outside the managed root, at the top of its own Git
  work tree, named once across all ids. Init refuses an alias, a duplicate or a non-tree.
- **Mode and enrollment.** The ledger starts in mode `observe`; `enrollmentId` is pinned in its
  binding. The mode changes only through `ops pool switch-mode` (below), never the
  configuration.
- **Admission is host-local.** No WBS call precedes a host job's reservation; it runs while WBS
  is down. Its events wait in the ledger's `host_job_events` outbox for the WBS projection below.
- **Refusals.** An envelope above `allocatable` in any dimension, or an exclusive id with no
  units, is refused at once (exit 73) naming the dimension and both figures, without a ticket.
  A free unit is handed out only when its tree is readable and clean; a dirty, deleted or broken
  tree is not free and is named in the waiter's outcome and its 75 refusal. A unit must also be
  clean and held by no process at `resources init`.
  Otherwise the caller holds a ticket: waiters are served oldest-fitting-first; a waiter
  overtaken by three younger admissions becomes a barrier no younger waiter passes, the oldest
  barrier applying. A waiter past its wait budget is refused 75 naming who is ahead; a
  wait-zero caller is decided once: admitted if it fits, refused 75 if not or while any live ticket is ahead. A ticket whose process is gone,
  or whose budget ended over a minute ago, is removed by whoever polls next, named on stderr.
- **Settlement per entry.** Cores and memory return when the launched process group is
  terminal (the same `/proc` session inspection as above) and every declared container is gone;
  the tmp directory after the descriptor-relative removal above; a unit when no process holds
  the tree, `git status --porcelain` is empty and HEAD is the commit recorded at admission.
  Each release commits with its event. A launcher that dies leaves its job `unknown` and charged:
  surviving children keep cores and memory, a dirty or moved tree stays `blocked` naming the
  file until an operator restores it, and a job never launched returns only after its launcher
  is gone and the 60-second launch grace has passed. `watch`'s sweep re-reads that evidence each
  tick for running and `unknown` jobs; a `blocked` job is re-read after one second, doubling to
  a one-minute cap, and records an event only when its evidence changes. `ops job run` settles
  a job that declared containers with Docker's reading (below); `watch` does not read Docker
  yet, so such a job whose launcher died stays charged until an operator settles it.
- **Unreadable processes.** Hold inspection reads every same-account process's `cwd`,
  descriptors and maps. A process that changed credentials (`(sd-pam)`, `sshd-session`) is not
  dumpable, and its `/proc/<pid>/fd` is access-denied. For a host job, such a process holds
  nothing the job made only if it is outside the job's scope `dash-job-<id>.scope` **and**
  started before the job's leader in this boot. Settlement names those
  `uninspectable_outside_scope: <pid> (<comm>)` in the entry's reason, the three most recently
  started by name and the rest as a count, and goes on. A different cgroup alone proves nothing:
  a payload's descendant can turn non-dumpable (prctl, a setuid helper, `ssh-agent`, `gpg-agent`)
  and leave the scope with `systemd-run --user`.
  Any other uninspectable process is an unknown holder and keeps the entry `blocked`. A job
  begun before a reboot is therefore blocked by every uninspectable process of the new boot. A
  daemon the payload left inside the scope blocks until it ends. The refusal names the remedy,
  `systemctl --user stop dash-job-<id>.scope`, after which settlement retries. Managed-resource
  cleanup and the unit check at `ops pool init` (and `resources init`) apply the same rule (J19):
  such a process holds nothing only if no Dash job scope contains it, its session is no unreleased
  use's or host job's process group, **and** it started, in this boot, before the use's leader
  (its creator when it never ran a command) or before the initializing Dash process. A released
  use names those in its reason the same way; any other uninspectable process blocks with
  `cannot inspect process PID <pid> (<comm>), which may hold …` and the remedy. In every
  position, a process in a logind login session (`/user.slice/user-<uid>.slice/session-<id>.scope`,
  such as an `sshd-session` of an ssh login that began mid-job) is outside whenever it started,
  unless its session id is a Dash-owned process group's. Known gap: a non-dumpable process
  released this way that opens the job's files later is not seen (design.md J19).
- **A unit left off its resting commit.** A payload killed before it restored its gate tree
  (SIGKILL, `cap`'s MemoryMax) leaves the unit `blocked` as `not its resting commit` for good. The
  reason names the remedy: once no job runs in it, `git -C <unit> checkout --detach <resting
commit>`, and settlement retries.

**WBS projection** (J10). WBS shows the pool and never admits for it. Each `synchronize` (every
`watch` tick) first moves the unmoved `host_job_events` rows, oldest first and in one
transaction, into the authority outbox as `resourceRuntimeUse` v2 (`kind: 'host_job'`, no
planning link, `type`, `label`, the pool's `enrollmentId` as `host`, `launcherSha: null` (the launching checkout's HEAD) until
the launcher records one, one reservation entry per envelope dimension and exclusive id): an
admission becomes `registered`, the settlement that returns every entry becomes
`release_verified` with evidence naming the job's run record (task 6.8, S6F-A1); launches and
partial or blocked settlements stay local. The locator is `dash-host-job-run://<enrollmentId>/<jobId>`:
the `runs` row of that job in `<root>/.dash/host-job-runs.sqlite` on the host enrolled under that
id. The digest is the SHA-256 of the row's stored `start` text, the gate entry the launcher writes
once before the payload runs, and the disposition is `returned`. A job whose gate never opened (refused
at the gate, withdrawn, or never launched) has no run record: its disposition is `not_created` and
its digest is the SHA-256 of `<locator> absent`. Missing run records beside a ledger with host jobs
stop the move and publish nothing until they are restored. WBS refuses any other locator,
including the ledger-row `dash-host-job://…` evidence of slice 5, with `400 invalid_body`. To check a
returned job's digest on its host:

```sh
bun -e 'const { Database } = require("bun:sqlite"); const [file, job] = process.argv.slice(-2); const row = new Database(file, { readonly: true }).query("SELECT start FROM runs WHERE job_id=?").get(job); console.log(row === null ? "absent" : new Bun.CryptoHasher("sha256").update(row.start).digest("hex"));' <root>/.dash/host-job-runs.sqlite <jobId>
```

The moved events publish through
`putApiResourceAuthoritiesByAuthorityIdEvents` in the authority's one sequence with the
worktree uses' events, so a WBS that answers nothing only delays them. WBS keeps each host job
owned by the authority and its organization; the project resources read lists the unreturned
ones beside every resource the authority's instance fulfils. A `report-capacity` binding may add
`"source": "host_pool"` and a `dimension` (`cpuCores` beside `cpu_cores`, `memoryGib` beside
`memory_gib`, `tmpDiskGib` beside `disk_gib`, an exclusive id beside `agent_slots`) with a
top-level `"hostPool": {"ledger": "<root>/.dash/resources.sqlite"}`: the reporter, running on
the pool's host, opens that ledger read-only and sends what unreleased host jobs reserve of the
dimension as `reservedUnits`, with the dimension as `reservedDimension`, while `usageUnits`
keeps the adapter's measurement. It reports again within two seconds of any admission or
settlement (it polls the largest `host_job_events` sequence); opening the ledger fails the
load `config_malformed` before any adapter opens, so run `resources init` first. The resources
section then reads `Measured 15 GiB, 8 in use, 12 reserved by 2 jobs` and names only the jobs
that reserve that dimension.

Deploy WBS before Dash: an outgoing WBS without `resourceRuntimeUse` v2 refuses a host-job event
`400`, and every later outbox event waits behind it. `synchronize` retries such a refusal for 30
minutes from the first one, naming it on stderr each time, then throws, which stops `watch`.
Run `watch` under a unit that restarts it (task 6.7).

### `ops pool` and `ops job` (slice 3)

`ops` is Dash's first typed namespace (J17). Every command takes `--config`, the same
owner-only schema-3 configuration as `resources`. Refusals print one `error: ` line on stderr
and keep the shell lock's exit codes (J13): 64 usage, an uncatalogued job or a checkout that
moved; 70 a host that cannot run the job measured; 73 an envelope the pool can never hold; 75
no room within the wait budget; 129, 130 and 143 a launcher interrupted by SIGHUP, SIGINT or
SIGTERM before its payload started.

```sh
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops pool init --config /path/to/host-pool.json
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops pool inspect --config /path/to/host-pool.json
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops job run --config /path/to/host-pool.json \
  --type gate --label gate:0a518a42 --wait-seconds 3600 -- bin/h2puni-gate.sh <sha>
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops job status --config /path/to/host-pool.json
```

- **`ops pool init`** is `resources init` under the pool's own name: the same initialization
  and refusals, plus the run records file `.dash/host-job-runs.sqlite` beside the ledger. It
  prints the root, enrollment id, mode, allocatable vector and units as JSON.
- **`ops pool inspect`** prints the pool as JSON: mode, allocatable, reserved, each unit and
  who holds it, every unreleased job and every waiter.
- **`ops job run`** reads `infra/jobs/catalogue.json` from the checkout holding the current
  directory **at its HEAD commit**, not the working tree; that commit is the launcher SHA the
  run record pins (for `gate` the tested SHA is the one in its arguments). Just before the gate
  opens, however long admission waited, HEAD is read again. If it moved, the job is refused 64
  unrun, because the payload runs from the working tree. This narrows the gap and does not close
  it: HEAD can still move between that check and the payload's exec, and during the run. The
  record names the commit the catalogue was read at, not one the payload is proven to have
  run. The payload is the words
  after `--`: its first word is the program, the rest
  must match the type's argument profile. An unknown type or a mismatch is 64, naming the type
  and the catalogue path. Before anything is reserved it checks that the host can measure the
  job: `systemd-run` on `PATH` and a user manager that creates a throwaway scope (otherwise 70,
  naming `loginctl enable-linger <user>`), and, for a type that declares a containers bound, a
  `docker` CLI whose daemon answers (otherwise 70). Then it waits for admission (`--wait-seconds`,
  default 0; `--poll-seconds` 1 to 30, default 5) and launches the payload:
  - inside `systemd-run --user --scope --unit dash-job-<use id> -p MemoryHigh=<memoryGib>G`
    (`MemoryMax` too for `enforcement: cap`), behind a gate: the leader's identity is
    persisted, the scope's `memory.peak`, `memory.current`, `cpu.stat`, `pids.current` and
    `memory.events` are read and stored as the gate sample, and only then may the payload
    start. An unreadable counter, a scope that never starts or a run record that cannot be
    written is 70 with the payload never started. The gate closes unopened, and the job keeps a
    null exit code and records `payload did not run: <reason>` (also shown by `ops job status`).
    Its reservation is then settled;
  - with `TMPDIR` the job's private directory under the managed root, `DASH_JOB_ID`,
    `DASH_JOB_TYPE`, `DASH_JOB_UNIT_<ID>` per exclusive unit (the id upper-cased) and
    `HEAVY_LOCK_LABEL` set to `--label`. `$TMPDIR` holds `.dash-tmp-identity`, the marker that
    proves the directory is the one prepared; a payload that deletes or rewrites it leaves its
    tmp entry `blocked` for an operator (fail-closed, task 2.4);
  - sampled every ten seconds and at exit: the counters, the tmp directory's allocated bytes
    (no link followed) and, for a containers bound, the labelled containers' `docker stats`.
    The gated shell keeps the scope alive until the exit sample is stored, so even `true` gets
    a gate and an exit sample. Peak tmp is the largest sample, a lower bound; disk outside
    `TMPDIR` is not covered;
  - SIGINT, SIGTERM and SIGHUP before the gate opens refuse the job at the gate (129, 130,
    143); after it opens they are forwarded to the payload's session.
    The command exits with the payload's own status, 128 + signal when it was signalled. A
    telemetry failure (a counter unreadable mid-run, a scope torn down before the exit sample)
    and a ledger write failure are recorded and reported on stderr apart from that status. It
    then settles the job on its terminal evidence, once a second for up to 30 seconds, and prints one
    `ops job: <id> <entry> <state>: <reason>` line per entry; whatever is still charged is
    left to `watch`.
- **Containers (J16).** A type that declares `containers: { memoryGib, cpuCores }` must start
  each container labelled `puni.job=$DASH_JOB_ID` with `--memory` and `--cpus` at or under the
  bound. A `docker events` stream judges every container created during the run; one without
  the label, labelled with a value that names no live job, without a bound or above it, or one
  that vanished before its bound was read makes the run `attributionIncomplete`. So does a
  failed or unreadable `docker events` stream or replay. Each is named on stderr and in the
  record. The `docker stats`
  samples are advisory: Docker omits containers that vanish between samples and excludes file
  cache; the declared bound is what admission trusts. Compute is released only once no running
  container carries the job's label.
- **`ops job status`** prints the pool line, then one `running` line per unreleased job (type,
  label, pid, age, envelope, peak `memory.peak` so far from its run record, units held,
  settlement state per entry, and `payload did not run: …` for a launch refused at the gate),
  then one `waiting` line per waiter oldest first (age, budget left, overtakes). It opens the
  run records read-only and refuses 70 when they are missing; it never creates them:

  ```text
  host pool h2puni-1: mode observe; allocatable 8 cores, 13 GiB, 16 disk units, 16 slots; reserved 4 cores, 6 GiB, 0 disk units, 1 slots
  running gate gate:0a518a42 pid 4242 age 1m00s envelope 4 cores 6 GiB 0 GiB tmp peak 2.5 GiB units gate_tree=/home/puni1/puni-00-gate-tbf settlement held (compute held, tmp held, gate_tree held)
  waiting website-dev-build build:site pid 4343 age 55s budget 1m05s overtakes 0
  ```

- **`ops job admission --job <id>`** prints one JSON line, `{"job":"<id>","state":…,"running":…}`.
  `running` is true only for a launched (`held`) job with no exit or launch failure recorded
  whose leader is still the process recorded at launch; `state` is null for an id the ledger
  never admitted. It reads the ledger and nothing else: no sweep, no settlement, no lock. A
  nested `run_heavy_job` (`bin/heavy-lock-lib.sh`) asks it before running on the enclosing
  job's admission, because a scope named `dash-job-<id>` alone can be made for any id
  (`dash-host-jobs` task 6.10a).

Not yet: `ops pool switch-mode` (slice 6). In observe mode `ops job run` does not yet take the
shell lock's queue protocol (J12); that arrives with `run_heavy_job` in slice 6, before any host
is enrolled. Run records live in their own file because the ledger's job snapshot is the
runtime's closed shape. Each record pins the host class (`linux-<arch>-<cores>c-<GiB>g`) and,
from slice 4, the toolchain: `bun <version>+<revision>` of the first `bun` on the payload's
`PATH`, or `no bun on PATH`. A `bun` that cannot name its revision refuses 70 before anything is
reserved.

### Calibration, proposal and audit (slice 4)

The loop that changes an envelope (J9). Nothing here writes any `infra/jobs/catalogue.json`;
a proposal lands as a reviewed commit. The 1.25 headroom, the three-record minimum, the
ten-run waste window and the ten-second CPU window are provisional (`HEURISTICS` in
`src/ops/measures.ts`, labelled in [`infra/jobs/README.md`](../../../../../infra/jobs/README.md)).

```sh
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops job calibrate --config /path/to/host-pool.json \
  --type gate -- bin/h2puni-gate.sh <sha>
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops job propose --config /path/to/host-pool.json --type gate
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops job audit --config /path/to/host-pool.json [--now <instant>]
```

- **`ops job calibrate`** takes the flags of `ops job run` (`--wait-seconds` defaults to 7200,
  `--label` to `calibration`). Its ticket is admitted only once the pool has drained: nothing
  reserved in any dimension, no starting or held host job, free space for the whole disk
  budget, and every unit of each exclusive id its type names free and ready. A refusal at the
  end of the wait names a free-space shortfall with both figures. Until then younger jobs may
  pass it, and after three it is a barrier like any waiter (J6). Admitted, it reserves the whole
  `allocatable` vector (cores, memory, disk units, slots), persisted on the job, and every unit
  of each id its type names, so nothing runs beside it; units of other ids are left alone
  (S4-A14). `ops job status` shows it as `running calibration <type> …`, and its ticket as
  `waiting calibration <type> …`. Its envelope is not checked against
  `allocatable`: a calibration is how an envelope too big for this pool gets measured. The
  payload runs as in `ops job run` (same gate, samples and settlement), in a scope with no
  `MemoryHigh` or `MemoryMax`. It gets the first unit of each id its type names. The run record
  is flagged `calibration`.
- **`ops job propose --type <id> [--host-class <c>] [--toolchain <t>]`** reads the catalogue
  at the current checkout's HEAD and the run records. The partition defaults to the HEAD entry's
  argument profile, this host's class and the `bun` on `PATH`. Records of the type from that
  catalogue and partition are compared if complete: ended with status 0, every sample read, no
  ledger failure, attribution complete, an exit sample. Each record left out is named with why,
  including records of the type admitted from another checkout's catalogue. J9's "window" is,
  for now, the partition's entire history: no window is designed yet (S4-A15). It takes the
  nearest-rank p95 per dimension:
  - memory from every uncapped, unthrottled record (`memory.events high` 0);
  - CPU, the peak rate of `usage_usec` over a ten-second window, from calibration records alone;
  - tmp disk from every complete record;
  - duration from calibration records alone, reported only, because the catalogue has no
    duration field.

  With fewer than three records in any dimension it prints the lines, then
  `error: … has 2 calibration records for cpuCores and durationSeconds; …` and exits 1 with no
  patch. Otherwise it prints one line per dimension with the record ids, then the **replacement
  entry** for that job as JSON. The entry has the new envelope (p95 × 1.25 rounded up, at least
  one core and one GiB) and `calibrated` provenance (host class, instant, p95s, record ids),
  validated against `JobType`. The provenance cites only records that fed every dimension they
  were eligible for; a throttled or capped run, left out of memory, is cited on the dimension
  lines alone (S4-A16). A record with no reading in some dimension (`not measured`) is likewise
  not cited. Records are partitioned by `cataloguePath` here, while `audit` below judges each
  record by job id against the current checkout's catalogue (S4-A19). Exit 0.

- **`ops job audit [--now <ISO instant>]`** judges every run record, by its job id, against
  the catalogue of the checkout holding the current directory, at its HEAD. It never re-reads
  the checkout a record ran from, which may be a deleted scratch worktree: the record pins the
  envelope it was admitted under. It prints one line per drift and exits 1, or prints
  `no drift` and exits 0. `--now` (default: the clock) is the instant estimates are judged at;
  one that is malformed or names no real instant (`2026-02-30T00:00:00Z`) is 64.
  - `overrun`: a peak above the envelope the run was admitted under, in memory, CPU or tmp disk.
    It stays visible however many runs follow until the HEAD entry's envelope is at least the
    peak. A new provenance alone, `calibrated` included, does not clear it.
  - `waste`: a dimension's p95 below half the HEAD envelope over at least ten complete runs of
    the HEAD entry.
  - `estimate_expired`: `estimated` provenance whose `until` day has ended.
  - `attribution_incomplete`: a run during which a container ran unlabelled, unbounded or
    unverified (J16). It stays until a later run of the type sees containers and every one
    bounded.
  - Runs without an outcome, and runs of a type the catalogue does not name, print a
    `note: not judged` line.
- **`ops job render-audit-units --config <path> --bun <path> --dash <path> --checkout <path>
--output-directory <dir>`** writes `dash-job-audit.service` (a oneshot running
  `ops job audit` in the checkout, so a drift fails the unit) and `dash-job-audit.timer`
  (`OnCalendar=weekly`, `Persistent=true`). These are systemd **user** units, beside the
  observation units that `render-observation-units` renders for the system manager. It installs
  nothing, refuses a path systemd would expand and replaces no existing file. To install as the
  pool's account (the user manager needs linger, J8):

  ```sh
  install -m 0644 <dir>/dash-job-audit.service <dir>/dash-job-audit.timer ~/.config/systemd/user/
  systemctl --user daemon-reload
  systemctl --user enable --now dash-job-audit.timer
  systemctl --user list-timers dash-job-audit.timer   # next run
  systemctl --user --failed                           # a drift shows here
  journalctl --user -u dash-job-audit.service         # the drift lines
  ```

### Mode lifecycle, `switch-mode` and the singleton guard (slice 6b)

A host pool runs in one of two modes (`dash-host-jobs` J12, J13). The ledger (version 2)
records the mode, the guard, the guard's holder, a `switch-mode` in progress, any hold
corruption and every operator mode record.

**Before the first observe-mode job on a host, `resources watch` must be installed and running
as its user unit (task 6.7, `Restart=on-failure`, `KillMode=process`).** Without it, a job whose
payload outlives its launcher keeps the shell lock until an operator runs
`resources sweep --config <path>`. That covers a surviving child past the 30 s settle budget,
and a launcher killed after launch. Until then every legacy gate and Dash job refuses 75.

**Deploy order.** Deploy slice 6b's Dash to a host first, and run `watch` or any `ops job run`
there before `report-capacity`. Either one migrates the ledger to version 2. Until then
`report-capacity` refuses the version-1 ledger.

- **`observe`** (the start): every host job, calibrations included, also queues on the host's
  shell lock (`bin/heavy-lock-lib.sh`, `/home/puni1/.cache/wbs-heavy-work.lock`) after the
  pool admits it. Dash never reimplements that protocol. `ops job run` starts the library's own
  `with_heavy_lock` as a detached shell holder. Its ticket, deadline, holder record and label
  `dash-job-<job id> <lane label>` are the library's, so legacy callers on any checkout share
  one arrival order with Dash jobs. `bin/with-heavy-lock.sh status` names the holder as for any
  run. The two queues share one wait budget: the shell lock gets what `--wait-seconds` has
  left after admission, rounded up to whole seconds (S6B-A3). Refused there (75), or
  interrupted (129/130/143), the job is withdrawn and its whole reservation returns at once.
  The flock lives on the holder's fd 9, never on Dash. The holder keeps it while the hold file
  `<root>/.dash/legacy-holds/<job id>` exists (it names the holder's pid, boot and start
  identity). The holder's output goes to `<hold file>.log`, never to Dash, and is diagnostics
  only. Dash decides the holder holds from the shell lock's own record, `<lock>.d/holder` naming
  its pid, never from the log (S6B-A23). A full disk therefore loses lines but not the
  decision. A holder that neither holds nor ends within `--wait-seconds` plus a 15 s grace is
  ended and refused 70, naming why. `ops job run` removes the hold file once the job's
  compute entry is released. Three other cases keep it:
  - **Dash dies while the job runs.** The file stays, and `watch` or `resources sweep` removes
    it once that entry settles, so an orphaned payload never runs beside a legacy caller.
  - **Dash dies while its holder still queues.** The holder claims in its turn and holds, and
    the never-launched job is released after the launch grace. `watch` or `sweep` then removes
    the file.
  - **The holder itself is killed.** The kernel releases the flock, and the next claimant
    reclaims the holder record from a dead pid, the library's own rule.
- **`concurrent`**: the pool alone admits, and jobs overlap only when every type involved is in
  the configuration's `concurrencyEligible` list. A job beside unreleased **compute** is
  admitted only if its type and every running type are listed; otherwise it waits, serialised.
  A job admitted and not yet launched counts as running. A job whose compute has settled no
  longer counts, even with its tmp directory or tree still charged. While
  the **guard** is on, `resources watch` holds the canonical flock as legacy holder
  `dash-singleton` whenever a ticket is queued or any job's compute is unreleased, and releases
  it when the pool empties. Admission waits until that holder is recorded, its process runs,
  and the shell lock's holder record names it. A stale launcher on an older checkout therefore
  queues behind every host job. A ticket waits at most 15 s past its own deadline for the guard
  (S6B-A5), then is refused 75 naming it. The guard is re-checked before a job is prepared, so a
  guard lost after admission refuses the job 75 before anything runs. If the guard's holder
  dies while jobs run, `watch` marks those jobs `guardLost` before it queues again. `ops job
status` shows the mark, and the run records it; `ops job audit` reports the run as
  `attribution_incomplete`. `ops job run` re-checks the guard at its payload's exit too, so a
  host whose `watch` is down still records the loss (S6B-A25).
  A file in `<root>/.dash/legacy-holds/` that Dash did not write is **hold corruption**: a
  name that is not a job id, `dash-singleton`, `dash-switch-mode` or their `.log`, or a job
  hold for a job the ledger does not know. `watch` and `sweep` record it and then release
  nothing. Concurrent-mode admission refuses 75 naming it, and `ops job status` prints
  `hold corruption: <path> …`. Check the file and remove it; the next clean scan clears the
  state. The guard's holder outlives `watch`, and a restarted
  `watch` adopts it. The 6.7 user unit must therefore use `KillMode=process`, or the holder
  dies with the unit's cgroup (S6B-A8).

The configuration gains two optional fields, neither pinned by the binding:
`launcherCheckouts` (absolute paths, each named once: the checkouts whose launchers run heavy
jobs here) and `concurrencyEligible` (job type ids, each named once; absent means none). Every
`ops` pool open (`pool init`, `job run`, `job calibrate`, `job status`, `job admission`, `pool inspect`,
`switch-mode` and the record readers) refuses 64 an eligible id that no listed checkout's
catalogue names at HEAD. A typo added later therefore stops the next command rather than
silently serialising the type it meant (S6B-A17). `resources watch` does not check this,
because it admits nothing.

**A launcher checkout whose HEAD moved.** A listed checkout can stand at a commit with no
`infra/jobs/catalogue.json`, for example a gate tree the last gate left on a pre-catalogue
branch's pinned SHA. Every open but `pool init` then reads that checkout as naming nothing and
lists it as `<checkout> unverified at <rev>` (S6B-A22). An id is refused only when no readable
catalogue names it. `pool init` and `switch-mode` stay strict: they refuse until the checkout
stands at a commit carrying the catalogue and the shim.

```sh
dash() { bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts "$@"; }
dash ops pool switch-mode concurrent --config /path/to/host-pool.json --operator dany [--wait-seconds 1800]
dash ops pool switch-mode concurrent --config /path/to/host-pool.json --operator dany --release-guard
dash ops pool switch-mode observe --config /path/to/host-pool.json --operator dany   # rollback
```

**Runbook: observe → concurrent.** These are the code steps of task 6.5; the five-launcher
checklist and the two-job validation come first.

1. Every launcher checkout on the host is listed in `launcherCheckouts`. `switch-mode` checks
   each one and refuses 70 naming the first that fails, and refuses 64 when none is listed.
   Each checkout must pass five checks:
   - it is the top of a Git work tree;
   - git trusts it, with "dubious ownership" named on its own;
   - `bin/heavy-lock-lib.sh` defines `run_heavy_job` at HEAD;
   - nothing under `bin/` differs from HEAD, untracked files included;
   - every catalogue entrypoint that is a `bin/*.sh` launcher calls `run_heavy_job` at HEAD.
     Other entrypoints are named in the evidence as not checked.
2. `concurrencyEligible` names the types validated for overlap. With none listed, the switch
   refuses 64, because nothing would change; `--allow-empty` flips anyway. An id that no
   listed catalogue names is refused 64.
3. `resources watch` runs (task 6.7). In concurrent mode nothing is admitted without it.
4. Run `switch-mode concurrent`. It **stops intake**: from then on a new ticket is refused 75
   `intake stopped while ops pool switch-mode … drains the pool`, until the switch ends or its
   process dies. Tickets already queued keep their budget and their place (S6B-A16). It
   **waits for the pool to drain** of them and of every unreleased compute entry. It then
   **drains the shell lock** by queueing on it as legacy holder `dash-switch-mode` with what
   is left of `--wait-seconds`. SIGINT, SIGTERM or SIGHUP at any step withdraws its ticket or
   releases its hold, reopens intake, and exits 130, 143 or 129. A `dash-switch-mode` hold
   file left by a killed switch refuses the next switch 75, naming the file and whether its pid
   is alive. `watch`, or `resources sweep`, removes it once no switch is live. Holding it proves every
   legacy holder, every waiter ahead and every observe-mode Dash job has finished. It refuses
   75 while any waiter queues behind it, naming each, since that is a launcher still taking
   the legacy path. Last, it **flips** in one ledger transaction: the fence must be its own,
   and no ticket or unreleased compute may remain. Mode `concurrent`, guard on, and the record
   (`sequence`, `at`, `operator`, `account`, `action`, `from`, `to`, `evidence`: each checkout
   and HEAD verified, the eligible types, the drained lock) commit together. The record is
   printed as JSON. Any refusal reopens intake. A second `switch-mode` while one is live is
   refused 75 (the fence is a ledger row written under `BEGIN IMMEDIATE`, S6B-A6).
5. Once no checkout on the host can run a launcher without the shim, record it with
   `switch-mode concurrent --release-guard`. That checks the launchers again and writes a
   `release-guard` record. `watch` then lets go of the flock, and admission no longer waits
   for it.

A ticket whose launcher died (its pid, boot and start identity gone) or whose wait ended over a
minute ago is reclaimed by `watch`'s tick and by `resources sweep`, as well as by the next
poll. The drain of a switch and the guard's demand both ignore such tickets (S6B-A24). Git is
run in the C locale for every launcher check, so its "dubious ownership" text is matched in
any locale.

**Rollback** is `switch-mode observe`. It stops intake, waits for the pool to drain of host
jobs (no ticket, no unreleased compute), refusing 75 at `--wait-seconds` naming what is still
there, then flips with its record. The guard is on again for the next flip.

`ops job status` names the mode, and in concurrent mode the guard and its holder. It adds a
`switching to …; intake stopped` line while a switch is live. While the shell lock matters
(observe mode, or the guard on), it then prints the lock's own `status` lines verbatim, holder
first. A Dash holder (`dash-job-<id> …`, `dash-switch-mode`) gets a `note:` line naming its
hold file and who removes it. The note points to `resources sweep` as the operator's one-shot
release. When the shell lock cannot answer (an unreadable holder record or queue),
`ops job status` refuses 70 in observe mode and under the guard rather than print a partial
answer. `ops pool inspect` adds `concurrencyEligible`, `launcherCheckouts`, `guard`,
`guardHolder`, `switching`, `modeRecords` and `legacyLock` (holder and waiters, or null once
the guard is released).
