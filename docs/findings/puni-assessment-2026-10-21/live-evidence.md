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
