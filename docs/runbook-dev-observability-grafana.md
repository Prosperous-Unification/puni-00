# Existing Grafana: dev additions and private operator views

Puni owns the API-managed datasource `puni-dev-prometheus`, dashboard
`puni-dev-observability`, the distinct Compose query overlay and its durable
integration journal. The versioned source is
`tools/tool-observability-stack/src/dev/grafana.ts`; `renderDevGrafana()` renders
all three artifacts. No second Grafana is deployed.

Claire remains the owner of `setup/config/h3mon-observability`. Its live root is
`/home/monitor/observability`; do not copy a guessed template over its Compose,
collector, provisioning or dashboard files. Original Compose/collector files have
observed drift from that owner's checkout. Existing datasource UIDs `sdlc-metrics`,
`sdlc-logs`, `sdlc-traces` and the VictoriaMetrics default stay unchanged.

API-managed additions avoid modifying Claire's file provider and do not need a
Grafana restart or provisioning reload. They persist in the existing Grafana
database. They are independent of file provisioning: loss of that database needs
an intentional new absence capture and replay, not an overwrite or silent adoption.
The retained journal is the only local integration state; it contains hashes,
phases and ownership, never credentials. Keep it with the rollout evidence and
existing Grafana backup policy.

## Before applying

Operate only on h3mon's existing `h3mon-observability-grafana-1`, using its existing
authentication in process memory. Do not print, copy to a file or change the
credential. A missing credential blocks the operation. `GRAFANA_AUTHORIZATION`
is the complete existing `Basic …` or `Bearer …` header; set it from the approved
in-memory credential reader. Do not put its literal value in a shell command,
history, evidence or process arguments. `GRAFANA_URL` must be an HTTP
`127.0.0.1` root, directly on that host or over an existing authenticated SSH
forward. Nothing here creates credentials or changes an existing tunnel.

Capture the existing file hashes, container IDs/start times/restart counts,
datasource replies, dashboard inventory and owned release manifest separately.
The API journal hashes the complete datasource replies and dashboard search
inventory, not every unrelated dashboard's full JSON. Serialize administrators
while applying/removing; Grafana's legacy API has no transaction spanning these
objects. A concurrent administrator can race a read and mutation. The helper
refuses detected drift and never issues an update to an existing UID.

Inspect the query network immediately before preflight:

```sh
ssh h3mon 'sudo -n docker network inspect h3mon-observability_query'
```

The reviewed identity is
`a8c94b425b03ae71d4d5a72cd6947310ee97431358f7e62b4e0cdbb29bd10311`,
name `h3mon-observability_query`, driver `bridge`, `Internal=false`. Inspect member
aliases too; `puni-dev-prometheus` must be unused before the first attachment.
A recreated network requires review and updating the pinned identity, not accepting
its name alone. Supply that fresh inspection as `DevPreflight.queryNetwork`
(`id`, `name`, `driver`, `internal`, `occupiedAliases`). The caller must establish
that the snapshot came from this host; the pure preflight does not perform SSH.

Only Prometheus may additionally join this external query network, with alias
`puni-dev-prometheus`. The other five new services remain solely on the dedicated
dev bridge. All published APIs still bind `127.0.0.1`; Prometheus admin and
lifecycle flags remain absent/disabled. This network is shared with the existing
Grafana and Victoria stores: do not use it as a tenant or production boundary.

## Add the network and API objects

The observed original immutable base is exactly
`/home/monitor/puni-dev-observability/releases/a1ffe27e7/compose.json`.
Configuration files beside it are hashed in `manifest.json`; do not edit them.
When combining the later five-second scrape/rule update, use its separately
reviewed candidate base as `REVIEWED_BASE`. Preserve the original base for rollback.
Only Prometheus needs recreation to attach the new network; retain its volume.

Render and retain a distinct `compose.grafana-query.json` from the reviewed checkout:

```sh
bun -e 'import {renderDevGrafana} from "./tools/tool-observability-stack/src/dev/grafana"; await Bun.write("/tmp/compose.grafana-query.json",JSON.stringify(renderDevGrafana().composeOverlay,null,2)+"\n");'
ssh h3mon 'umask 077; set -C; cat > /home/monitor/puni-dev-observability/evidence/compose.grafana-query.json' < /tmp/compose.grafana-query.json
```

The exclusive creation refuses a preexisting file. Compare retained content to the
reviewed artifact; preserve a preexisting owned overlay for review rather than
replacing it. The overlay adds only `services.prometheus.networks` and the external
network declaration. Validate the actual merged configuration before applying:

```sh
: "${REVIEWED_BASE:?set the reviewed immutable base path on h3mon}"
sudo -n docker compose --project-name puni-dev-observability --profile dev --file "$REVIEWED_BASE" --file /home/monitor/puni-dev-observability/evidence/compose.grafana-query.json config --format json
sudo -n docker compose --project-name puni-dev-observability --profile dev --file "$REVIEWED_BASE" --file /home/monitor/puni-dev-observability/evidence/compose.grafana-query.json up --detach --no-deps prometheus
```

Those two commands run on h3mon, after the reviewed deployment preflight and fresh
capacity/port checks. Confirm the running Prometheus volume identity, loopback
mappings, admin/lifecycle flags, both network memberships and the unique alias;
confirm unchanged existing container identities and health. Do not infer runtime
publication or connectivity from accepted Compose alone.

Run the following from the reviewed checkout, with the existing credential already
in memory and `GRAFANA_URL` aimed at the existing instance. If executing through a
local SSH forward, choose a local evidence path instead of this host path and keep
the same journal throughout. The tool does not upload journals remotely.

```sh
bun tools/tool-observability-stack/src/dev/grafana-cli.ts capture /home/monitor/puni-dev-observability/evidence/grafana-integration.json
bun tools/tool-observability-stack/src/dev/grafana-cli.ts apply /home/monitor/puni-dev-observability/evidence/grafana-integration.json
```

Capture requires both owned UIDs to be absent and the three old datasource UIDs
with the sole existing VictoriaMetrics default. Apply rechecks absence and the
captured inventory, POSTs the nondefault datasource, reads it back, durably saves
its receipt, then POSTs the dashboard with `overwrite:false`, reads it back and
saves its receipt. UID/name conflicts fail rather than update. The new datasource
uses `http://puni-dev-prometheus:9090` in proxy mode. No old datasource is repointed.
Each HTTP call refuses redirects and is bounded to five seconds and one MiB.
There are finitely many calls, with no retry loop.

The CLI creates an exclusive `.lock` and mode-0600 receipt; phase updates use
fsynced same-directory files, atomic rename and directory fsync. It refuses missing,
unreadable or malformed journals. Do not remove a stale lock until proving its
process has stopped. A failed mutation/read/save can have committed remotely before
its receipt was recorded. Preserve the journal and inspect both named UIDs against
the reviewed artifacts; never rerun capture to adopt an object or blindly delete it.
An unrecorded dashboard after partial apply blocks automatic rollback.

## Verify views and private access

Use existing authenticated SSH transport for host-loopback Grafana `:3000`, Kibana
`:15601`, Prometheus `:19090` and Elasticsearch `:19200`. Create only a separately
named forward if needed, and later close only that forward. Do not change the
shared SDLC tunnel, expose a public port or proxy these APIs through the application.

With existing auth held in memory, query these paths on the existing Grafana:

- `GET /api/datasources/uid/puni-dev-prometheus`
- `GET /api/datasources/proxy/uid/puni-dev-prometheus/api/v1/query?query=puni_dev_probe_success%7Benvironment%3D%22dev%22%2Cservice%3D%22be-01%22%7D`
- `GET /api/dashboards/uid/puni-dev-observability`
- `GET /api/datasources` and `GET /api/search?type=dash-db&limit=1000`

Require an actual successful Prometheus query through Grafana, correct measured
series and the saved dashboard API model. Open `/d/puni-dev-observability` and
inspect query errors and missing states; API existence alone is not browser proof.
Compare the original UIDs/default, inventory, file hashes and existing services.

The dashboard shows backend health states, per-signal reasons, measured HTTP
success/duration, check/observation ages, application-log collection and storage
collection/capacity. Missing measurements remain missing; there is no `or vector(0)`
or fabricated healthy default. The 120-second freshness boundary applies to the
age panels. Historical gauges can remain queryable after collection fails, so
read collection state and reading age together. Request duration is the actual
remote health request, not SSH roundtrip or internal application work. The observed
revision is an instant table only when exactly one active revision series exists;
ambiguity hides it and is visible in the active count. Producer revision and
historical mcp-01 logs must not be assigned the latest health revision.

For Kibana, start with `/app/apm/traces?rangeFrom=now-1h&rangeTo=now`. Select service
`puni-dev-probe`, environment `dev`, transaction `dev health observation`, then the
actual trace ID from a fresh stored observation. The transaction view route is
`/app/apm/services/puni-dev-probe/transactions/view?environment=dev&rangeFrom=now-1h&rangeTo=now&transactionName=dev%20health%20observation&transactionType=unknown`.
Confirm root `dev health observation` and child `GET be-01 /health`, matching
trace ID and parent/root relationship. These are external probe spans. For logs,
use Discover with `logs-*.otel-dev`, exact `attributes.puni.observation.id`, and the
actual observation interval. Ordinary application logs retain resource service
`mcp-01` and explicit unknown revision; they do not establish probe correlation.
Record actual backend replies and a real rendered waterfall. A synthetic fixture,
empty query, guessed screenshot or old stale observation does not certify live views.

## Remove only the owned integration

Stop concurrent integration work. Keep the same receipt and credential in memory:

```sh
bun tools/tool-observability-stack/src/dev/grafana-cli.ts rollback /home/monitor/puni-dev-observability/evidence/grafana-integration.json
```

Rollback compares the original inventory and exact owned object hashes (including
dashboard version), refuses edited/missing/provisioned objects, removes the owned
dashboard first, verifies its absence, persists that phase, removes the owned
datasource and verifies its absence before saving `removed`. A recorded partial
apply can remove its datasource only if no unrecorded dashboard exists. A failed
operation stops loudly; do not alter receipts to bypass refusal. Reconcile the
named objects manually against captured evidence and preserve unrelated objects.

Then recreate only Prometheus from the captured original base without the overlay,
on h3mon:

```sh
sudo -n docker compose --project-name puni-dev-observability --profile dev --file /home/monitor/puni-dev-observability/releases/a1ffe27e7/compose.json up --detach --no-deps prometheus
```

Verify the original volume and configuration, sole dev membership and loopback
publications. This also restores the original scrape/rules if the candidate changed
them. Retain the overlay/journal as evidence; merely not selecting the overlay
removes its attachment. Do not delete the external query network, use `down`,
remove volumes, restart Grafana or restore Claire's files from the Puni checkout.

The [Grafana legacy datasource API](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/api-legacy/data_source/)
remains available in Grafana 13 despite deprecation of `/api` routes. These helpers
intentionally use the existing instance's API family; a future API migration needs
separate review and live validation.
