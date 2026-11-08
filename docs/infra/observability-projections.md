# Observability chart-role projections

The uncached `tool-fleet:validate-observability-projection` target validates additive
**source projections**, using the vendored ECK, kube-prometheus-stack and collector
charts. It leaves the selected Flux graph unchanged. Its receipt explicitly reports
`completeServiceGraph: false`, `runtimeRehearsal: false`, `liveBinding: false`,
`claimsBound: false` and `controllerHandoverExecuted: false`.

Provide both placement requests explicitly in an external JSON file:

```json
{
  "local": {
    "placement": "local",
    "instances": [
      { "environment": "dev", "namespace": "observability-dev" },
      { "environment": "prod", "namespace": "observability" }
    ]
  },
  "production": {
    "placement": "production",
    "instances": [
      { "environment": "dev", "namespace": "observability-dev" },
      { "environment": "prod", "namespace": "observability" }
    ]
  }
}
```

The ordered instance pair is the current closed source contract. These are declared
namespace and placement names; they provide no observed context, cluster UID or
namespace binding. Both application identities can be projected on either placement.
No third physical cluster is implied.

```sh
PUNI_PARITY_TOOLS=/operator/locked-tools \
PUNI_PROJECTION_REQUESTS=/operator/placement-requests.json \
bunx nx run tool-fleet:validate-observability-projection
```

The tool directory must contain the locked Helm version. The renderer verifies chart
paths, versions and archive hashes, uses `helm template --include-crds`, and fixes
`--kube-version 1.35.0` as a rendering capability fixture. It never contacts an API
server. Missing or unreadable inputs/tools, malformed requests and failed renders
refuse. CLI diagnostics expose fixed categories; they do not print request values or
subprocess diagnostics.

## Ownership and selection

| Owner                                     | Source roles   | Projection boundary                                                                                                        |
| ----------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `observability/eck-operator`              | controllers    | One ECK owner, watching the two declared instance namespaces                                                               |
| `observability/prometheus-controller`     | controllers    | One Prometheus operator/CRD owner, with no app stores, KSM or node exporter                                                |
| `observability/kube-prometheus-stack`     | prod, platform | Retained release, fullname `kps`, production Prometheus/Alertmanager, KSM, node exporter, rules and scrape-token ownership |
| `observability-dev/kube-prometheus-stack` | dev            | App-only monitoring projection; no operator, CRDs, exporters, hooks or cluster RBAC                                        |
| `observability/otel-collector`            | platform       | The retained platform collector and its existing sink dependencies                                                         |

`createObservabilityProjection` and `selectObservabilityProjection` in
[`observability-projection.ts`](../../tools/tool-fleet/src/observability-projection.ts)
produce typed in-memory source candidates. `selectObservabilityProjection(candidate,
['dev'])` selects the two controller owners and the dev monitoring release. It does
not select production stores or platform collection. Selecting `['prod']` includes
the retained combined production/platform monitoring release. Selecting
`['prod', 'platform']` additionally includes the collector and explicitly reports
`observability/elasticsearch` as a required external service. Platform collection
cannot be selected without its production sink role. Empty, duplicate and foreign
selections refuse.

The retained production release also creates the existing
`observability/kps-operator` ServiceMonitor through the pinned chart's
`prometheus.additionalServiceMonitors`. It targets the new controller release's
operator Service using its actual label, HTTPS port and `kps-admission` CA reference.
The chart emits this resource in a native `v1/List`; validation checks every member.
No Helm ownership annotations are fabricated.

The Prometheus controller ownership handover is declared and unexecuted. Keeping the
production release/namespace/fullname and unchanged Prometheus storage template
preserves its source identity. Actual operator-generated workloads and PVC/PV bindings
must come from [observed preflight evidence](observability-preflight.md). No KSM,
node-exporter, rules or scrape-token ownership transfer is selected here.

## Exact source conformance

[`observability-projection-render.ts`](../../tools/tool-fleet/src/observability-projection-render.ts)
exports the pinned renderer, rendered-role validator, placement comparator and combined
validation entrypoint. Generated YAML remains in memory or temporary render files;
no candidate directory is exempted from the normal `infra/platform` scan.

Each complete projection contains exactly the reviewed 118 resource identities across
five release owners: 22 CRDs, one ECK operator, one Prometheus operator, one KSM, one
node exporter and one platform collector. The reviewed identity inventory lives beside
the validator. Missing, duplicate, extra and foreign resources/owners refuse. Dev's
five discovery resource and namespace selectors, monitor target namespaces, controller
watches, instance Alertmanager/storage references and retained operator monitor are
checked explicitly.

The placement comparison checks every effective manifest field. Its sole scalar
exception is the first KSM ServiceMonitor endpoint's first metric relabeling
`replacement`: exactly `platform-local` versus `platform-production`. Both exact values
are checked before comparison; sibling actions, all namespaces and all references
remain compared. This projection comparison complements the unchanged full current
graph parity validator.

The reduced unit-test fixture records resource identities and checked operative fields
from the pinned Helm render. It omits CRD schemas and generated Secret contents. The
source validation command checks full actual Helm output, including those fields.

## Original projection completion boundary

These projections intentionally omit the complete ES/Kibana/signal-service composition,
namespaced discovery RBAC, final default-deny policies and effective instance trust.
The retained production discovery selectors remain their existing source behavior;
full platform coverage and scoped selection must converge together in the next slice.
The platform collector retains its existing filelog behavior; excluding dev-owned
records without an application environment remains required before adding that runtime
namespace. The ES explicit RuntimeDefault seccomp correction likewise belongs to the
full shared service candidate.

Full-service generation must carry forward the retained owner identities and monitor
references above, then bind actual target/namespace/controller ownership, credentials,
capacity, admission and operator-UI routes through the existing preflight and rehearsal
contracts. The current dev runtime and all persistent secrets remain untouched by this
source operation.

## Common service-source assembly

`createObservabilityComposition(root, request)` in
[`observability-composition.ts`](../../tools/tool-fleet/src/observability-composition.ts)
adds common ES/Kibana releases and native collector, APM gateway, metrics proxy,
retention and Kibana setup resources around the unchanged chart-role projection.
It produces an in-memory **assembly**, with `securityConformant`, `wholeRenderParity`,
`runtimeRehearsal`, `liveBinding`, `claimsBound`, `controllerHandoverExecuted` and
`activationReady` all false. It creates no selected Flux entry or Secret contents.
The existing projection target continues to certify only its original chart-role scope.

The request requires explicit policies as well as placement and application identity:

```json
{
  "placement": "production",
  "instances": [
    { "environment": "dev", "namespace": "observability-dev", "policy": "development" },
    { "environment": "prod", "namespace": "observability", "policy": "retained-production" }
  ]
}
```

| Policy                 | ES memory / heap / claim | Allowed instance           |
| ---------------------- | ------------------------ | -------------------------- |
| `development`          | 2Gi / 1g / 10Gi          | Dev, on either placement   |
| `retained-production`  | 4Gi / 2g / 100Gi         | Prod, on either placement  |
| `disposable-rehearsal` | 2Gi / 1g / 10Gi          | Prod, local placement only |

A local rehearsal must explicitly request its smaller policy; the generator never infers
capacity from placement. Existing signal and Prometheus retention remains shared and
is included in each instance's `retention` descriptor. These are declared bounds, not
admission or coexistence evidence. The common ES pod declares RuntimeDefault explicitly,
retains the previously measured S3 init 128Mi request / 256Mi limit and verified HTTPS
trust program, and declares 16Mi trust scratch. ES and Kibana each declare 1Gi writable
root ephemeral storage with nonroot/no-escalation/drop-ALL context. New bounds are
unmeasured; actual ECK init containers, pod storage and admission still need observation.

`projection` preserves the exact approved chart-role object. Each instance's typed
`monitoring` release names its `baseOwner` and supplies the service-policy override for
that same KPS owner. The override adds Alertmanager `storage.volumeClaimTemplate`
(1Gi, `puni-retain`, ReadWriteOnce) and `persistentVolumeClaimRetentionPolicy` with both
scale and delete set to Retain, using the pinned chart's Alertmanager-specific fields.
This is a new, unbound, unmeasured claim. It neither identifies existing Alertmanager
history nor proves operator-generated PVC retention. Existing production identities,
Prometheus storage, platform monitoring and controller monitor remain in the base.

`selectObservabilityComposition(candidate, ['dev'])` returns the controller prerequisites,
dev KPS service override, dev ES/Kibana releases and dev native resources. It requires the
actual retained reader's exclusion before dev namespace activation; it starts no production
store or platform collector. Selecting `['prod', 'platform']` substitutes the desired reader
release as well. Every owner appears once; foreign/missing/duplicate monitoring bases,
changed overrides, duplicate selections and duplicate final owners refuse.

`retainedReader.desiredManifest` preserves its existing owner/sinks/queues/redaction and adds
both the dev namespace pod-path exclusion and rejection of logs carrying that namespace
attribute, including records without an application environment. `prerequisites` requires
verification on the **actual retained reader**, plus observed controller ownership/handover.
The existing selected reader remains unchanged. The desired declaration is not proof that
the live leak has been closed.

The native packet has fifteen resources per namespace. `assertObservabilityAssemblyResources`
checks the reviewed kind/API set, exact inventory and concrete namespace. Four ConfigMaps
use full SHA-256 content-addressed names; only the corresponding namespace-local volume
references are rewritten. Payloads, Pod/Job references and reference multiplicity are checked.
Both immutable Jobs retain Flux's `force: enabled` replacement annotation. Changed content
therefore changes the relevant templates in source; actual controller refresh remains a
runtime obligation. No global namespace replacement or semantic comparison exception is used.
`assertObservabilityComposition(root, candidate)` regenerates and compares the entire assembly,
including requirements, completion flags and original projection. Call it before consuming a
previously stored candidate; generated objects alone provide no external authority.

[`observability-authority.ts`](../../tools/tool-fleet/src/observability-authority.ts) exports
`declareObservabilitySecrets`, `declareObservabilityAuthority` and `declareObservabilityRoutes`
for the next source/authentication adapters. Required Secret names and keys are namespace-local
references only. ECK fileRealm requires `users`/`users_roles`, roles require `roles.yml`, and the
health role has no cluster grants and only `read` on exact `logs-*.otel-{environment}` and
`traces-*.otel-{environment}` patterns. Query client credentials are separate from existing
Elastic ingest/setup admin and metrics-write credentials. Metrics queries use separate
basic-auth material and only query/query_range routes. Instance-exclusive ingest CA intent
requires effective cross-instance rejection; differing references are not proof.

Route descriptors bind internal HTTPS endpoint/serverName and credential/trust references.
Their external dial binding for the observer and retained Docker Grafana is explicitly
`required`; no reachable external URL is invented. Authentication work must resolve material,
verify same-route TLS and complete read-only grants, and demonstrate query mutation denial
and cross-instance rejection in the disposable lab. CNI, stored three-signal acceptance,
operator-generated pod support, claims, current-node hostPath costs and live readiness remain
unverified. The full source interface below supplies namespaced discovery, selectors/target bounds,
default-deny flows, retained-reader prerequisite validation and full-render comparison.
These assembly results do not complete canonical task 2.2.

## Full service source validation

`createObservabilitySource(root, input)` in
[`observability-source.ts`](../../tools/tool-fleet/src/observability-source.ts) adds the
remaining desired security policy to the immutable assembly above. It returns nine
release owners, fifteen native resources per instance, namespaced discovery and
network policies, separate material/role requirements, retained platform listener
migration prerequisites and unapplied same-owner external patches. It does not change
the assembly's completion flags or the currently selected Flux graph.

`validateObservabilitySources(root, tools, {local, production})` and the uncached target
below render all nine pinned releases plus native/security resources. The successful
receipt reports `scope: full-service-source-validation`, `sourceSecurityPolicy: true`
and `wholeRenderParity: true`, with source/policy/render SHA-256 hashes. It independently
keeps effective authority, observed retained-reader source, operator admission, claims,
capacity, handover, external bindings and activation false. Source and component
validation do not certify a running service or complete canonical task 2.2.

```sh
PUNI_PARITY_TOOLS=/operator/locked-tools \
PUNI_SOURCE_REQUESTS=/operator/full-source-requests.json \
bunx nx run tool-fleet:validate-observability-source
```

Each request extends the assembly policy request above with a required `network` object:
`api`, `observer`, `grafana`, `s3`, `alertDelivery` and `publicProbes` are arrays of one to
sixteen distinct IPv4 `/32` hosts. Missing, broad, malformed and unknown bindings refuse.
There is no DNS resolution or implicit broad fallback. Tests supply explicitly synthetic
host declarations; those are not production addresses. The desired enrolled peers and
API intent come from `infra/ansible/inventory/production-existing-hosts.yml`, cross-checked
with `infra/fleet/desired.yaml`. Actual Docker Grafana/observer origins and S3 dial peers
must still be supplied and observed by the next adapter.

Namespace-wide ingress/egress deny is accompanied by explicit DNS, API, discovery,
controller/webhook, scrape, signal, store, UI, alert and backup flows. Discovery Roles
scope Prometheus to its instance; production retains explicit platform discovery and
minimal node/metrics cluster access. All five monitor/resource and namespace selectors
are explicit. The restored operator monitor, KSM, node exporter and platform coverage
retain their existing owners. Real CNI behavior, host-network/NAT addresses, admission
and target reachability require runtime evidence before applying these policies.

External rules, Probes, blackbox exporter and snapshot Job/CronJob remain owned by
`flux-system/alerts`, `flux-system/observability` and `flux-system/backup`. The packet
includes their exact desired per-profile resources and additive label patches, each
`applied: false`. Those owners must apply the patches before selector/deny activation.
Production-only public Probes are a single reviewed context difference tied to
`alerts/production/public-probes.yaml`; arbitrary membership is not ignored.

App ingestion uses `signal-elastic-ingest`, `signal-ingest-users` and
`signal-ingest-roles`; setup retains ECK admin and health queries retain read-only
credentials. The ingest role declares no cluster grants and `auto_configure` plus
`create_doc` on `logs-*.otel-{environment}`, `traces-*.otel-{environment}` and
`metrics-*.otel-{environment}`, including APM aggregate metric streams. Node discovery
is explicitly disabled (`discover.on_start: false`, `interval: 0s`) and app gateway
mapping permits only `otel`. These fields were accepted by the exact pinned Elastic
Agent 9.3.8 binary's offline `otel validate`; a non-boolean `on_start` was rejected.
The policy follows the [pinned exporter configuration](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/v0.160.0/exporter/elasticsearchexporter/config.go),
[Elastic exporter privileges](https://www.elastic.co/docs/reference/edot-collector/components/elasticsearchexporter)
and [OpenTelemetry data stream naming](https://www.elastic.co/docs/reference/opentelemetry/data-streams).
Actual effective grants and stored APM aggregates still require positive and negative
runtime witnesses. The retained platform reader uses its own `platform-ingest` identity
and exact `logs-puni.otel-{local|production}` scope, preserving platform semantics.

`assertRetainedReaderConfiguration` checks both path exclusion and the attached
namespace predicate, including forwarded dev records with no application environment.
`validateRetainedReaderPrerequisite(input, {run?, now?})` in
[`observability-reader-observation.ts`](../../tools/tool-fleet/src/observability-reader-observation.ts)
uses bounded read-only discovery against explicit `context` and `controllerContext`.
Its closed schema requires target marker/UID, owner/source UIDs and source revision,
configuration UID/SHA-256, workload UID/template checksum, timeout (at most 30 seconds)
and maximum evidence age (at most 60 seconds). It checks fresh identity, ownership,
ready revisions, installed configuration, rollout metadata and config references.
The receipt certifies **observed installed source only**; `effectiveReaderVerified`
and `activationReady` remain false. Metadata cannot prove loaded configuration or
record rejection. Actual context was unavailable during this source work; native
kubectl projection tests used synthetic GET-only discovery and client-side dry run.

The desired reader binds all OTLP listeners (4317, 4318 and 14317) to the declared
platform mTLS trust domain, excluding app identities. Existing selected plaintext
listeners remain unchanged. Their enrolled-client transitions are unexecuted migration
prerequisites until authenticated canary and runtime proofs permit the change.

[`observability-source-render.ts`](../../tools/tool-fleet/src/observability-source-render.ts)
validates 191 namespace-qualified resource identities, API versions, references,
security policy, retention, independent claims and bounded ES/S3 settings. It reuses
the original projection's reference boundary and the assembly's native content-hash
and refresh checks. `observability-render.ts` shares only pinned tool/chart rendering;
the original projection still validates its own unchanged contract first.

[`observability-source-parity.ts`](../../tools/tool-fleet/src/observability-source-parity.ts)
expands YAML/JSON/NDJSON payloads and compares every remaining scalar after validating
only the four content-addressed ConfigMap names and their known volume references.
The independent reviewed table permits exactly 23 local/production scalar differences,
including exact S3 endpoint/trust mode, platform markers, external rule expressions,
public Probe context and platform stream name. Explicit local disposable production-role
sizing adds eight precise capacity scalars, for 31 total. Unknown, duplicate, unused,
subtree, stale or self-authorizing exception records refuse; namespaces, identities,
code lines and unrelated siblings are not normalized.

Fleet adapters consume these concrete material, route, patch and policy descriptors
and translate them into the existing provider-neutral observation inputs. No Fleet
contract is added to the shared evaluator. Runtime TLS/hostname/client identity,
query mutation denial, CNI, operator pods/claims, stored three-signal routes, UI and
recovery remain Task 5/6/8/9 evidence.
