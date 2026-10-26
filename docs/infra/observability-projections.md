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

## Completion boundary

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
unverified. The next source slice must finish namespaced discovery, all selectors/target
bounds, default-deny flows, retained-reader prerequisite validation and exact full-render
closure/comparison. These assembly results do not complete canonical task 2.2.
