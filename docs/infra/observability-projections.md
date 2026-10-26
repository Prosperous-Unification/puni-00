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
