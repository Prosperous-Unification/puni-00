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
  binding. The mode changes only through the fenced switch of slice 6, never the configuration.
- **Admission is host-local.** No WBS call precedes a host job's reservation; it runs while WBS
  is down. Its events wait in the ledger's `host_job_events` outbox for slice 5's projection.
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

### `ops pool` and `ops job` (slice 3)

`ops` is Dash's first typed namespace (J17). Every command takes `--config`, the same
owner-only schema-3 configuration as `resources`. Refusals print one `error: ` line on stderr
and keep the shell lock's exit codes (J13): 64 usage, 70 a host that cannot run the job
measured, 73 an envelope the pool can never hold, 75 no room within the wait budget, 130 and
143 a waiter interrupted by SIGINT or SIGTERM.

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
  directory **at its HEAD commit**, not the working tree; that commit is the payload SHA the run
  record pins. The payload is the words after `--`: its first word is the program, the rest
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
    start. An unreadable counter is 70 with the payload never started; its reservation is
    settled at once;
  - with `TMPDIR` the job's private directory under the managed root, `DASH_JOB_ID`,
    `DASH_JOB_TYPE`, `DASH_JOB_UNIT_<ID>` per exclusive unit (the id upper-cased) and
    `HEAVY_LOCK_LABEL` set to `--label`;
  - sampled every ten seconds and at exit: the counters, the tmp directory's allocated bytes
    (no link followed) and, for a containers bound, the labelled containers' `docker stats`.
    The gated shell keeps the scope alive until the exit sample is stored, so even `true` gets
    a gate and an exit sample. Peak tmp is the largest sample, a lower bound; disk outside
    `TMPDIR` is not covered;
  - SIGINT, SIGTERM and SIGHUP are forwarded to the payload's session.
    The command exits with the payload's own status, 128 + signal when it was signalled. A
    telemetry failure (a counter unreadable mid-run, a scope torn down before the exit sample)
    and a ledger write failure are recorded and reported on stderr apart from that status. It
    then settles the job on its terminal evidence for up to 30 seconds and prints one
    `ops job: <id> <entry> <state>: <reason>` line per entry; whatever is still charged is
    left to `watch`.
- **Containers (J16).** A type that declares `containers: { memoryGib, cpuCores }` must start
  each container labelled `puni.job=$DASH_JOB_ID` with `--memory` and `--cpus` at or under the
  bound. A `docker events` stream judges every container created during the run; one without
  the label, without a bound or above it, or one that vanished before its bound was read makes
  the run `attributionIncomplete`, each named on stderr and in the record. The `docker stats`
  samples are advisory: Docker omits containers that vanish between samples and excludes file
  cache; the declared bound is what admission trusts. Compute is released only once no running
  container carries the job's label.
- **`ops job status`** prints the pool line, then one `running` line per unreleased job (type,
  label, pid, age, envelope, peak `memory.peak` so far from its run record, units held,
  settlement state per entry), then one `waiting` line per waiter oldest first (age, budget
  left, overtakes):

  ```text
  host pool h2puni-1: mode observe; allocatable 8 cores, 13 GiB, 16 disk units, 16 slots; reserved 4 cores, 6 GiB, 0 disk units, 1 slots
  running gate gate:0a518a42 pid 4242 age 1m00s envelope 4 cores 6 GiB 0 GiB tmp peak 2.5 GiB units gate_tree=/home/puni1/puni-00-gate-tbf settlement held (compute held, tmp held, gate_tree held)
  waiting website-dev-build build:site pid 4343 age 55s budget 1m05s overtakes 0
  ```

Not yet: `ops job calibrate|propose|audit` (slice 4) and `ops pool switch-mode` (slice 6). In
observe mode `ops job run` does not yet take the shell lock's queue protocol (J12); that
arrives with `run_heavy_job` in slice 6, before any host is enrolled. Run records live in their
own file because the ledger's job snapshot is the runtime's closed shape.
