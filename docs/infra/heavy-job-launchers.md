# Heavy job launchers

Every heavy run on a gate host starts from one of five launchers. Each enters through
`run_heavy_job` in `bin/heavy-lock-lib.sh` with its job type from
[`infra/jobs/catalogue.json`](../../infra/jobs/catalogue.json). On a host that is not enrolled,
`run_heavy_job` takes the host-wide heavy lock exactly as `bin/with-heavy-lock.sh` does. On an
enrolled host it runs `twilight-dash ops job run` from the launcher's own checkout. The design is
[`dash-host-jobs`](../../openspec/changes/dash-host-jobs/design.md) (J3, J12, J13, J15, J16).

**No host is enrolled yet.** Two pieces must land first: J12's observe phase (a Dash job under the
legacy queue protocol, so legacy callers and Dash jobs share one order) and the singleton flock
guard of concurrent mode. Both land with `ops pool switch-mode`, after slice 4. Until then nobody
may create `/home/puni1/.config/dash/host-pool.json` on a gate host (tasks 6.3 to 6.5).

## The entry

| Fact                 | Value                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Enrolled when        | Linux and `/home/puni1/.config/dash/host-pool.json` exists; no variable chooses the mechanism                               |
| Pool root and ledger | `/home/puni1/.local/share/dash/host-pool`, ledger `<root>/.dash/resources.sqlite`; the configuration must name this root    |
| Broken enrollment    | configuration missing beside the ledger, unreadable, naming another root, or `jq` absent: exit 70, neither mechanism runs   |
| Dash                 | `bun <checkout>/apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops job run`, the launcher checkout's own       |
| Flags                | `--type`, `--config`, `--wait-seconds`, `--poll-seconds`, `--label`; the budgets are removed from Dash's environment        |
| Type                 | `HEAVY_LOCK_JOB_TYPE`, required on every host: exit 64 without it                                                           |
| Status               | Dash's or the payload's own, so the caller's `EXIT` trap runs once; INT, TERM and HUP to the launcher are forwarded to Dash |

`ops job run` checks the payload's arguments against the type's argument profile, so each
launcher splits into an outer half and an admitted payload whose arguments fit the profile:

| Type                   | Launcher (outer half)                                                          | Payload                                     |
| ---------------------- | ------------------------------------------------------------------------------ | ------------------------------------------- |
| `gate`                 | `bin/h2puni-gate.sh <sha>`: resolves the sha, labels, copies the wiki launcher | `bin/h2puni-gate-payload.sh <sha>`          |
| `release-build`        | `bin/publish-release.sh`                                                       | `bin/publish-release-payload.sh`            |
| `test-queued`          | `bun run test:queued` → `bin/test-queued.sh`                                   | `bin/test-queued-payload.sh`                |
| `solver-image-publish` | `solver-binding-runtime.ts` → `bin/solver-image-publish.sh <sha>`              | `bin/solver-image-publish-payload.sh <sha>` |
| `website-dev-build`    | `puni-pr-00/deploy/website/dev/build-release.sh` (other repository)            | owed: that repository's change              |

## Conflict inventory (J3)

What each launcher touches, and what keeps two of them apart once a pool admits them together.
"Unit" is an exclusive unit in the pool configuration; "serialised" means the type stays
ineligible for concurrency (J16) until the gap closes.

| Launcher             | Touches                                                                                                                                                                                                                | Conflict and resolution                                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gate                 | the gate tree's checkout, `node_modules`, `.nx` cache and `dist/`; `$TMPDIR`; the trusted wiki launcher copy                                                                                                           | **Unit** `gate_tree`: the payload reads `DASH_JOB_UNIT_GATE_TREE`, refuses 64 without it on an enrolled host, and returns the tree to its resting commit, pass or fail (J15). The caches live inside the tree. `$TMPDIR` is job-private.                                         |
| gate                 | the launcher checkout itself: Dash reads the catalogue at its HEAD and refuses 64 if the HEAD moves                                                                                                                    | **Isolation**: launch from a checkout that is not a pool unit. The payload refuses 64 when the admitted tree is the launcher checkout. The gate host role (task 6.3) owes a third, launcher-only checkout.                                                                       |
| gate                 | the solver smoke's Docker image tag and registry port                                                                                                                                                                  | **Isolation**, already: the tag carries a per-attempt token and the registry publishes on an ephemeral port.                                                                                                                                                                     |
| gate                 | containers: the solver run, `registry:2` and the two clients in `solver-image-smoke.sh`                                                                                                                                | **Bounded and labelled** (J16): `--memory 1g --cpus 1`, the `gate` type's declared bound, and `--label puni.job=$DASH_JOB_ID` inside a Dash job.                                                                                                                                 |
| gate                 | containers still unbounded: the supervisor's managed solver containers (memory-limited to 512 MiB by the driver, no CPU bound, no label), the orphan proc tests, Caddy in `mcp-body-limit.test.ts`, and `docker build` | **Serialised**: Dash records the run `attribution_incomplete`, which keeps `gate` ineligible for concurrency until these take the bound and the label (follow-up).                                                                                                               |
| gate                 | `/run/user/<uid>/wbs-solver-smoke.*` sockets, `systemd --user` timers of the orphan proof                                                                                                                              | **Isolation**: `mktemp` names and per-attempt units.                                                                                                                                                                                                                             |
| release-build        | the `wbs-dagger-engine` container (one per host, `--memory=8g --cpus=6`), `dist/tool-dagger/release.json` in the launcher checkout, the registry push                                                                  | **Unit** `dagger_engine`, shared with `solver-image-publish`. A unit must be a Git work tree today, so the role creates a token tree for it (assumption S6-A7; a non-tree unit kind is a follow-up). The release artifact is the checkout's own and the push tags carry the sha. |
| release-build        | arguments to `bin/publish-release.sh`                                                                                                                                                                                  | The `release-build` profile takes none, so an enrolled host refuses any with 64 (assumption S6-A8).                                                                                                                                                                              |
| test-queued          | the launcher checkout's `node_modules`, `.nx` cache and test scratch; Caddy in `mcp-body-limit.test.ts`                                                                                                                | **Serialised** against another `test-queued` or a gate in the same checkout: the type names no unit yet, so two in one checkout share one `.nx` cache. Launch it from a checkout no other job uses until the type gains a unit (follow-up, as the catalogue already records).    |
| solver-image-publish | the candidate root under `~/wbs-dev/bin/sync.target`, the live checkout `~/wbs-dev/src` the launcher runs from, the Dagger engine, the registry                                                                        | **Unit** `dagger_engine`, as for `release-build`. The live checkout's poller can move its HEAD while the job waits, and Dash then refuses 64 at the gate; the deploy health owner reports that loudly, and nothing runs (assumption S6-A9).                                      |
| any pair             | host CPU and memory                                                                                                                                                                                                    | **Admission**: the envelope vectors (J5).                                                                                                                                                                                                                                        |

Proofs: `apps/twilight-structure/twilight-dash/cli/src/ops/launchers.test.ts` drives two real gate
launchers, and a gate beside a real release launcher, concurrently on one enrolled fixture host
with two gate trees; `bin/heavy-lock.test.sh` cases 40 to 45 pin the entry; `bin/h2puni-gate.test.sh`
cases 44 and 45 pin the tree choice and the resting commit.
