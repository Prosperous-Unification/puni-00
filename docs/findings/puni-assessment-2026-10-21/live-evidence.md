# Live evidence — PUNI readiness assessment

Read-only observations on 2026-10-21, collected during approximately 17:20–17:35 UTC.
Local checkout and GitHub `main` at the initial read were both
`4151532121633d978beb67ab52b3eb748285cd8e`; local host was `pop-os`.
These are point-in-time observations, not continuous availability evidence.

No deployments, infrastructure changes, credential changes, paid inference, load tests,
or recovery drills were performed. Credential values, client records, session content,
and full environment/configuration dumps were not printed. Configuration reads selected
only the fields named below. Database queries opened existing stores read-only and
selected activation/schema metadata only.

## Access and coverage

Initial sandbox SSH calls failed with `socket: Operation not permitted`; GitHub
metadata also failed to connect. Approved network retries succeeded. All four host
aliases, `h1claw`, `h2puni`, `h3mon`, and `h4claw`, answered `hostname` with strict
host-key checking and batch authentication.

The remote `claw` account on h4claw cannot use sudo: `sudo -l` explicitly refused
all sudo access. Both `sudo -n k3s kubectl get nodes -o wide` and the documented
`sudo k3s kubectl get nodes -o wide` failed; plain `kubectl` was not found. h3mon's
Docker socket denied access. No permission or account configuration was changed.
Consequently current Kubernetes node readiness, Flux reconciliation, pods, volumes,
secret presence, CronJobs, cluster alerts and snapshot status were **not verified**.
Host service status does not substitute for those checks.

## GitHub enforcement and CI

Commands used `gh api` against `repos/Prosperous-Unification/puni-00`:

| Read                                                  | Observed outcome                                                                                                                               | Interpretation                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/branches/main`, selecting name/protected/commit.sha | `main`, `protected:false`, SHA `4151532121633d978beb67ab52b3eb748285cd8e`                                                                      | Current branch lacks protection                                                                     |
| `/branches/main/protection`                           | HTTP 404, `Branch not protected`; CLI exit 1                                                                                                   | An explicit unprotected response, not a passing protection check                                    |
| `/rulesets`                                           | One active rule, `twilight-burokrat release tags`, target `tag`, ID `23794440`                                                                 | Returned ruleset does not protect main merges                                                       |
| `/actions/runs?per_page=12`                           | Main push CI [39637806436](https://github.com/Prosperous-Unification/puni-00/actions/runs/39637806436), created `16:46:37Z`, was `in_progress` | No successful full CI verdict for this head established by this snapshot                            |
| Same recent-run sample                                | PR CI runs in progress/cancelled; infra-check successes; trusted-wiki skipped                                                                  | Individual statuses cannot be combined into a full release verdict or a representative failure rate |

Only recent-run metadata was sampled; job logs, environment protection, deploy-runner
host restrictions, and the full historical deployment/run population were not fetched.
No GitHub writes were made.

## h2puni: production identity and dev state

`docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'` showed production
`be-01-green`, `gw-01-green`, and `fe-01-blue` up eight weeks. `wbs-dev-src` was up
nine hours. Caddy, registry, website/dev applications and logging containers were
also present. Running duration establishes process existence, not correctness.

Deployment state was read with Python from `/home/puni1/wbs/state/{be,gw,fe}.json`,
printing only tier, `activeColor`, and `lastDeployedSha`:

| Tier     | Recorded active color | Recorded SHA                               | Running container OCI revision label       |
| -------- | --------------------- | ------------------------------------------ | ------------------------------------------ |
| Backend  | green                 | `0afc77758131bc4257dcaa78f0b26bc97ffd92dc` | `0d9b296af33f2b851fcbf4df3e9ec89751734ba4` |
| Gateway  | green                 | `0afc77758131bc4257dcaa78f0b26bc97ffd92dc` | `0d9b296af33f2b851fcbf4df3e9ec89751734ba4` |
| Frontend | blue                  | `0afc77758131bc4257dcaa78f0b26bc97ffd92dc` | No value                                   |

`docker inspect` selected container name, `.Image`, OCI revision label and mount
paths only. Observed local image IDs, which are not asserted to be registry manifest
digests:

- Backend: `sha256:ebc269d2f5a4ef99eeee60c0ad69e5ed657407265dee32230301e70930ad6385`.
- Gateway: `sha256:81c3552868199f89c147eab06f0e9b2c99092c6d16f7262190d7a35a3e30743e`.
- Frontend: `sha256:310f4fb8a1ed8550cda3eeb767cfe15dd7e0c89beed437aded1ffd9093d8ebf5`.

Caddy's live admin configuration was retrieved inside its container and parsed
without printing the full configuration. Only host/path matchers and reverse-proxy
upstream dial addresses were emitted. Production `/api/*` routes to `be-01-green:3100`,
`/ws*` to `gw-01-green:3200`, and the frontend fallback to `fe-01-blue:80`.
The observed containers therefore match live routing. Follow-up inspection below
identifies the differing OCI revision as base-image metadata; application provenance
remains unresolved. A label, state file or container image ID alone cannot reconstruct
the accepted source-to-build-to-gate provenance.

### Follow-up correction before assessment merge

On 2026-10-21, a further read-only `docker inspect` selected OCI source, title,
version, revision and `WBS_SHA` from those three running containers:

| Containers                   | OCI source                                    | Title / version         | Application `WBS_SHA` |
| ---------------------------- | --------------------------------------------- | ----------------------- | --------------------- |
| `be-01-green`, `gw-01-green` | `https://github.com/oven-sh/bun`              | `bun` / `1.3.14-alpine` | absent                |
| `fe-01-blue`                 | `https://github.com/caddyserver/caddy-docker` | `Caddy` / `v2.11.4`     | absent                |

The backend/gateway revision remained `0d9b296a…`. It identifies the inherited Bun
image, not an independently established PUNI revision. This corrects the original
interpretation of a conflicting application SHA while retaining the raw observations.
The source/build/gate chain is still unproven; no label or state was changed.

| Probe                                                                                | Fresh result                                                              | Limit                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Public `https://wbs.bulletpoints.club/health` using curl with failure/timeout checks | HTTP success containing the WBS SPA HTML                                  | Public route did not supply backend health JSON                                               |
| Inside `be-01-green`, GET `http://127.0.0.1:3100/health`                             | `200 {"status":"ok"}`                                                     | Backend answers; no commit identity or full user journey proof                                |
| Inside `wbs-dev-src`, same backend request                                           | `200 {"status":"ok","commit":"4151532121633d978beb67ab52b3eb748285cd8e"}` | Dev process reports the assessed source revision                                              |
| Dev `/data/wbs.db`, read-only SQL below                                              | `[{"singleton":1,"state":"activated","has_activation_time":1}]`           | Activation marker exists; no authenticated boundary test performed                            |
| Dev `.env`, selecting `BROWSER_SESSION_AUTHORITY=` only                              | `BROWSER_SESSION_AUTHORITY=enabled`                                       | File setting observed; no full browser lifecycle probe performed                              |
| Production `/data/wbs.db`, read-only `sqlite_master` lookup                          | `organization_activation` table absent                                    | Current organization-activation implementation cannot be assumed deployed in this older store |

Dev query:

```sql
SELECT singleton, state, activated_at IS NOT NULL AS has_activation_time
FROM organization_activation;
```

Production query:

```sql
SELECT name FROM sqlite_master
WHERE type = 'table' AND name = 'organization_activation';
```

Both used Bun SQLite `new Database(path, { readonly: true })` inside the existing
backend containers; no migration or activation command was invoked.

## h1claw: backup execution and assistant metadata

`systemctl --user list-timers --all --no-pager` showed an hourly `sqlite-backup.timer`,
a daily `sdlc-snapshot.timer`, recurring storage maintenance and agent reconciliation.
The system timer list also included OS update/maintenance timers. Timer presence alone
does not establish that protected copies exist.

`systemctl --user show` selected `Id`, `ActiveState`, `Result`, `ExecMainStatus`,
start/exit timestamps and `FragmentPath`:

| Service                       | Last observed execution, UTC | Result                                                       |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------ |
| `sqlite-backup.service`       | `17:17:00`–`17:18:27`        | `ActiveState=failed`, `Result=exit-code`, `ExecMainStatus=1` |
| `sdlc-snapshot.service`       | `03:17:04`–`03:17:12`        | `Result=success`, status 0                                   |
| `storage-maintenance.service` | `17:13:35`–`17:14:04`        | `Result=success`, status 0                                   |

A read-only `journalctl --user -u sqlite-backup.service --since '24 hours ago' -o json`
was parsed remotely without printing raw log messages. Of 166 entries, 24 contained
`status=1/FAILURE`, 48 contained `Failed `, and none matched `Finished `. These are
**message counts**, not independently deduplicated backup attempts. They establish
repeated reported failure in the window. They do not identify the cause, newest usable
backup, covered databases, remote-object integrity, or whether a partial backup succeeded.
Those require follow-up. The unrelated successful snapshot/maintenance exits do not
repair or prove SQLite recovery, and their contents were not inspected.

The user service list showed `openclaw-gateway.service` active, with description
`OpenClaw Gateway (v2026.7.1-2)`. Running `openclaw --version` returned
`OpenClaw 2026.9.4 (3a9d69d)`. The service description and installed CLI identity differ;
the actual running gateway build was not independently queried.

A remote JSON parser read only `tools.exec.{host,security,ask}` and the channel key
names from `~/.openclaw/openclaw.json`. All three execution fields were absent;
`whatsapp` was the only configured channel kind. No credentials, account identities,
session transcripts, or full configuration were emitted. Effective permissions remain
unknown because inherited/default/other policy sources were not resolved. Absence is
not evidence of a restrictive or permissive default.

## h3mon and h4claw: capacity and monitoring

| Observation                        | h3mon                               | h4claw                                               |
| ---------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `free -m` total / available memory | 15,602 / 14,165 MiB                 | 15,602 / 8,922 MiB                                   |
| `nproc`                            | 8                                   | 8                                                    |
| Swap total                         | 4,095 MiB                           | 0                                                    |
| Kubernetes host service            | `k3s-agent.service` running         | `k3s` active/running since `2026-09-27 18:59:15 UTC` |
| Root filesystem, `df -h /`         | 150G size, 14G used, 130G available | Not queried                                          |

These are instantaneous host readings. Kubernetes allocatable/requested capacity,
pressure under load, HA, and replacement behavior were not measured.

Unauthenticated loopback VictoriaMetrics queries used
`http://127.0.0.1:8428/api/v1/query` on h3mon, with curl timeout/failure checks:

| Instant query                                                                                | Response                                                       |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `count({__name__=~".+"})`                                                                    | Success, 16,496 active series at sample timestamp `1792603886` |
| `count(up)`                                                                                  | Success, empty vector                                          |
| `count by (__name__) ({__name__=~"http_server_requests_total\|gw_.*\|otelcol_exporter_.*"})` | Success, empty vector                                          |

The third query used regex alternation `|` (table escaping above is Markdown only).
This proves a responsive populated metrics store and absence of the selected series
at that instant in that store. It does not prove that all monitoring is absent, that
another backend has no such series, or that configured alert recipients work.

GET `/metrics` directly inside prod backend and inside dev backend/gateway returned
HTTP 200. A parser retained only unique metric names from non-comment sample lines:
each exposed **only `target_info`**. No application request/latency or gateway traffic
series were present at those scrapes. No application load was generated.

## What remains unverified

- Current cluster reconciliation and Kubernetes resource/backup status, due to privilege limits.
- Provider inventories, AWS accounts, network-level abuse protection and real billing.
- Production source/build provenance, latest accepted gate, and frontend identity.
- Live two-client isolation, browser/MCP revocation and external identity-provider flows.
- Newest usable backup and restore, backup failure cause, off-region protection and escrow.
- Effective OpenClaw permissions, running gateway version, connector behavior and assistant-state restore.
- Alert recipient delivery, production log/trace correlation and per-client metric access.
- Longitudinal service targets, delivery throughput, change failure rates and operator effort.

These are explicit assessment limits and follow-up evidence needs, not passing checks.

## Rerun refresh — 2026-10-22

Read-only observations on 2026-10-22, approximately 08:40–09:05 UTC, when the
assessment was rerun against the scope that gained [Agent swarm
organization](../../../puni-assessment.md#agent-swarm-organization). Local checkout
and GitHub `main` were `d43f4176a18ff32b22161f478eb02e62ae328667`. The three current
findings of the first run were re-read; the methods and privacy limits above apply.

| Finding                | 2026-10-21                                                       | 2026-10-22 read                                                                                                                                                                                                                                          | State     |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| SQLite backups         | Hourly `sqlite-backup.service` failing, cause unknown            | Still failing every hour through `08:18:10Z`: `Main process exited, code=exited, status=1/FAILURE`. The journal now shows the failing phase: `flock` reports `Command failed: scp h2puni:/home/puni1/backup-staging/<stamp>-wbs-dev-<pid>.partial.db …`. | Unchanged |
| Production provenance  | State files `0afc7775…` for all tiers; containers up eight weeks | Same three state files read `0afc77758131bc4257dcaa78f0b26bc97ffd92dc`; `be-01-green`, `gw-01-green`, `fe-01-blue` still up eight weeks; dev containers up six to seven weeks.                                                                           | Unchanged |
| Main branch protection | `protected:false`, HTTP 404 on protection, one tag ruleset       | `protected:false` at `d43f4176a…`, HTTP 404 `Branch not protected`, the only active ruleset is still `twilight-burokrat release tags` (id 23794440).                                                                                                     | Unchanged |

The backup read identifies the failing step, not the cause: the pull from the h2puni
staging directory fails. Whether the partial file is missing, renamed, unreadable or
blocked by the transport was not determined, and no snapshot, upload or retention state
was inspected. W02 remains open.

### Delivery flow, seven days to 2026-10-22

Read with `gh pr list --state merged --search "merged:>=2026-10-15T08:49Z"`, `gh run list
--branch main` and `git log origin/main --since='7 days ago'`. These are flow counts for
the swarm-organization assessment; they are not accepted outcomes in the sense of
[the delivery metric contract](delivery.md#modularity-artifacts-and-parallel-agent-delivery).

| Measure                             | Observed                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Pull requests merged                | 111; per day 15, 21, 13, 1, 9, 18, 20, 14                                                          |
| PR author and merger                | `dany-fedorov` for all 111, both roles                                                             |
| Open-to-merge time                  | median 4.8 h, 90th percentile 23.0 h                                                               |
| PR size, additions plus deletions   | median 1,089 lines, 90th percentile 11,898, maximum 216,863                                        |
| Branch families                     | `feat/` 32, `docs/` 18, `fix/` 6, `plan/` 2; the rest unprefixed                                   |
| Titles containing `fix` or `revert` | 19 of 111; four `revert` commits on main in 30 days                                                |
| `ci` workflow on main               | 29 runs, 26 success, 3 failure; `Push on main` 28 of 28 success                                    |
| Non-merge commits on main           | 456: author `Dany Fedorov` 445, `dany-fedorov` 8, `Claire` 2, `OpenClaw Queue Worker` 1            |
| Agent trailers on those commits     | `Co-Authored-By: Claude Fable 5.1` 114, `Claude Opus 5.5` 56; 155 of the last 300 carry no trailer |

What these establish: a high and sustained merge rate through one GitHub identity, agent
authorship that is only partly attributable from git metadata, and a small but non-zero
revert and CI-failure rate. They do not establish accepted business outcomes, rework
cost, operator minutes or a throughput gain per added agent.

### Not read in the rerun

The dev WBS could not be queried: the `wbs-dev` MCP session was revoked by the
credential-epoch run on dev at `2026-10-22T02:56Z` (recorded in the private plan
repository) and needs the operator to re-authenticate. Live claims, agent persons,
occupancy and attempt rows on dev were therefore not re-read; the 2026-10-21 bound-claim
proof in the private plan repository is cited as dated evidence, not refreshed.
Everything listed under "What remains unverified" above still stands.

## W02 resolution — 2026-10-23

Read and changed on 2026-10-23 between 20:17Z and 22:00Z on h1claw (`claw` user), h2puni
and the Hetzner bucket `puni-01`; the code change is claire PR #135.

**Cause.** The hourly unit's `TimeoutStartSec=900` was reached once the `wbs-dev`
generation grew to 883 MB (the live `wbs-dev/data/wbs.db` is 985 MB for 8,982 `event_log`
rows) at the measured ~1 MiB/s upload rate from Ashburn to hel1. The 2026-10-19 16:17Z run
completed in 14 m 31 s; every run from 17:17Z was killed by systemd at 15 minutes after
promoting its set but before archive acceptance and local pruning. Local generations grew by
one set per hour to 108 files and 24 GB, `/dev/sda1` reached 100 % on 2026-10-20 16:17Z,
and every later run failed at the `scp` pull with ENOSPC. This is the "failing step" the
rerun named; the step was the symptom.

**Bucket state.** `puni01:puni-01/backups/sqlite/generations` held 3,223 objects and
145.0 GiB, every hourly generation since 2026-08-24 (144.7 GiB of it `wbs-dev`), with
68 incomplete multipart uploads initiated 2026-10-18 to 2026-10-20 by the killed runs.
Versioning is enabled; the only lifecycle rule expires noncurrent versions after 30 days.
No job pruned current objects. `puni-01/sqlite/website-dev` (puni-00's k3s runner) held
808 objects and 141 MiB, also unpruned. `puni-bkt-02` is empty.

**Newest usable generation.** `status.json` `lastSuccessful` names 2026-10-19 16:17Z
(wbs-dev sha256 `e5a258…`, 882,352,128 bytes, sanity 8,643). Older complete sets for every
hour from 2026-08-24 remain in the bucket; the 2026-10-19 17:17Z to 2026-10-20 00:17Z sets
reached the bucket in full from the killed runs.

**Repair.** Claire PR #135: `TimeoutStartSec=3000`; rclone `--transfers=2
--s3-chunk-size=32M --s3-upload-concurrency=8` (200 MiB stream: 59 s against 192 s with the
old flags); new `prune-remote` command with a tiered policy (every set for 48 h, the last
set of each UTC day for 60 days, the last set of each UTC week for 52 weeks, newest and
status-named sets always kept, refusal on a failed or empty listing, re-list after deletion,
then `rclone backend cleanup` of multipart uploads older than 24 h) on a daily
`sqlite-backup-remote-prune.timer` at 04:47Z under the hourly job's lock. Local recovery
followed the script's own verified `prune` path after the newest local sets were uploaded.

**Not done here.** The bucket lifecycle rule still lacks `AbortIncompleteMultipartUpload`
and `ExpiredObjectDeleteMarker` (the session's permission classifier refused direct bucket
mutations); deleted generations free space only after the 30-day noncurrent rule; the
`website-dev` prefix has no retention; the `wbs-dev` database size itself is unexplained.
