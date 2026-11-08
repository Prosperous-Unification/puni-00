# Observability controller ownership and separate service instances

Research date: 2026-10-26. Source and local rendering only; no cluster, SSH, container,
credential-value inspection or infrastructure mutation. Repository HEAD inspected:
`8962d8a82c9768a1e4bed86a97bdd17fb7d25669` (concurrent Fleet preflight edits excluded).
Names `observability-dev`, `observability-prod`, `metrics-dev` and `metrics-prod` below are
render fixtures, not certified deployment targets or final architecture decisions.

## Pinned primary sources

The [toolchain lock](../../../infra/versions/toolchain.json) and actual archive SHA-256 agree:

| Chart                                                                                           | Actual SHA-256                                                     |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [kube-prometheus-stack 91.4.1](../../../infra/platform/charts/kube-prometheus-stack-91.4.1.tgz) | `1bd5e7a88e758ed3ec22db0fe6e72b1352f3f0e7e5a93c79979f7edf361becdb` |
| [eck-operator 3.5.0](../../../infra/platform/charts/eck-operator-3.5.0.tgz)                     | `eda9ec502c786fc1ad293e7f4235fdef43b2c741dcc977ab1f62377d72b5173f` |
| [eck-elasticsearch 0.20.0](../../../infra/platform/charts/eck-elasticsearch-0.20.0.tgz)         | `1ab952a3df85a481277afa62154b449ce0c37e83b0b717df42074c68ba753fc8` |
| [eck-kibana 0.20.0](../../../infra/platform/charts/eck-kibana-0.20.0.tgz)                       | `2b74d63c7c6d7d1e8ced6c563374856050b2bde2c7eaefb37f5c097cecf818f3` |

Archive member paths below are primary source citations inside these pinned archives.
KPS `Chart.yaml` identifies Prometheus Operator `v0.94.0`; bundled dependencies are
`crds 0.0.0`, kube-state-metrics `8.5.0`, node-exporter `4.57.0`, Grafana `13.2.5`
and Windows exporter `0.12.*`. Installed archive contents, not dependency resolution,
were rendered. The repository disables Grafana, Windows exporter and Thanos Ruler.

## Actual Helm rendering evidence

`/tmp/puni-parity-tools/helm version --short` returned `v4.3.0+gbec5b06`.
All renders used `--include-crds --kube-version 1.35.0`, without API-server lookup.
`1.35.0` is an explicit rendering capability fixture, not a discovered live version.
Each baseline values file was extracted from the corresponding source HelmRelease's
`spec.values` using the already installed Bun `yaml` package. Python PyYAML was absent;
no dependency was installed. All following successful renders exited zero.

```sh
bun /tmp/puni-parity-controller-research/render.mjs
bun /tmp/puni-parity-controller-research/render-eck.mjs
/tmp/puni-parity-tools/helm template metrics-dev \
  infra/platform/charts/kube-prometheus-stack-91.4.1.tgz \
  --namespace observability-dev --include-crds --kube-version 1.35.0 \
  -f /tmp/puni-parity-controller-research/kube-prometheus-stack-base.yaml \
  -f /tmp/puni-parity-controller-research/app-instance-values.yaml
/tmp/puni-parity-tools/kubectl kustomize infra/platform/observability/local
/tmp/puni-parity-tools/kubectl kustomize infra/platform/observability/production
sha256sum infra/platform/charts/{kube-prometheus-stack-91.4.1,eck-operator-3.5.0,eck-elasticsearch-0.20.0,eck-kibana-0.20.0}.tgz
```

Temporary reproduction scripts, values, complete renders and parsed summaries are in
`/tmp/puni-parity-controller-research/`. They contain no credential values from the
repository. Chart-generated placeholder/default Secret manifests are not credentials
verified against any service. The command for each KPS variant has the same shape as
above, substituting the release/namespace/values recorded below.

| KPS variant                                                | CRDs | Operator Deployments | KSM Deployments | Node exporter DaemonSets | Prometheus / Alertmanager CRs | Rules / ServiceMonitors | Hook Jobs |
| ---------------------------------------------------------- | ---: | -------------------: | --------------: | -----------------------: | ----------------------------- | ----------------------- | --------: |
| baseline (`kube-prometheus-stack`, `observability`)        |   10 |                    1 |               1 |                        1 | 1 / 1                         | 30 / 8                  |         2 |
| `crds-false-only`                                          |    0 |                    1 |               1 |                        1 | 1 / 1                         | 30 / 8                  |         2 |
| `shared-owner` / `scoped-owner`                            |   10 |                    1 |               1 |                        1 | 0 / 0                         | 30 / 6                  |         2 |
| `controllers-only`                                         |   10 |                    1 |               0 |                        0 | 0 / 0                         | 0 / 0                   |         2 |
| `app-instance` (`metrics-dev`, `observability-dev`)        |    0 |                    0 |               0 |                        0 | 1 / 1                         | 0 / 2                   |         0 |
| `prod-app-instance` (`metrics-prod`, `observability-prod`) |    0 |                    0 |               0 |                        0 | 1 / 1                         | 0 / 2                   |         0 |

Each app variant rendered **zero cluster-scoped resources**, zero Jobs, zero Roles and
RoleBindings, two ServiceAccounts, two Secrets, two Services, one Prometheus, one
Alertmanager and two self ServiceMonitors. The scoped owner plus both app variants
rendered ten CRDs, one operator, one KSM, one node exporter, two Prometheus and two
Alertmanager CRs, with only two admission hook Jobs. This proves chart resource
cardinality; it does not prove functional platform coverage, namespaced discovery
RBAC, token provisioning, admission, or live migration safety.

The app override layered over the existing pinned [KPS values](../../../infra/platform/observability/prometheus/kube-prometheus-stack.yaml):

```yaml
fullnameOverride: kps-dev
commonLabels:
  puni.dev/telemetry-instance: dev
global:
  rbac: { create: false }
crds: { enabled: false }
prometheusOperator:
  enabled: false
  admissionWebhooks:
    enabled: false
    patch: { enabled: false }
grafana: { enabled: false }
windowsMonitoring: { enabled: false }
thanosRuler: { enabled: false }
nodeExporter: { enabled: false }
kubeStateMetrics: { enabled: false }
defaultRules: { create: false }
kubeApiServer: { enabled: false }
kubelet: { enabled: false }
coreDns: { enabled: false }
kubeDns: { enabled: false }
kubeEtcd: { enabled: false }
kubeControllerManager: { enabled: false }
kubeScheduler: { enabled: false }
kubeProxy: { enabled: false }
prometheus:
  prometheusSpec:
    ignoreNamespaceSelectors: true
```

The fixture additionally sets all five pairs (`serviceMonitor`, `podMonitor`, `probe`,
`rule`, `scrapeConfig`) of `*Selector` and `*NamespaceSelector` as shown in the next
section, and all five `*SelectorNilUsesHelmValues: false`. The prod fixture changes
only fixture instance label, namespace and fullname override. Sources: KPS
`Chart.yaml`, `templates/prometheus/clusterrole*.yaml`,
`templates/prometheus-operator/**`, `templates/exporters/**` and
`templates/prometheus/prometheus.yaml`. With `global.rbac.create: false`, the chart
creates no Prometheus discovery ClusterRole/Binding: explicit namespaced discovery
Roles/Bindings remain required. Turning off CRDs alone does not turn off anything
else; the render above establishes this rather than inferring it from the flag.

The shared-owner override starts with `prometheus.enabled: false` and
`alertmanager.enabled: false`. **That first render failed** with the chart's explicit
control-plane token-Secret diagnostic: default control-plane authentication depends
on `prometheus.enabled`, `prometheus.serviceAccount.create` and
`prometheus.serviceAccount.createTokenSecret`. To render, the fixture explicitly sets
`kubeApiServer.serviceMonitor.authorization`, `kubelet.serviceMonitor.authorization`
and `coreDns.serviceMonitor.authorization` to:

```yaml
type: Bearer
credentials: { name: kps-platform-scrape-token, key: token }
```

That name is an **unprovisioned fixture reference**. Disabling authentication was not
used. The token Secret must exist in each monitor object's namespace with a deliberate
scrape ServiceAccount and required Kubernetes authorization. The successful fixture
has no such Secret/SA closure. Source: KPS `templates/_helpers.tpl` function
`kube-prometheus-stack.prometheus.tokenSecretName`, control-plane ServiceMonitor
templates, `templates/prometheus/serviceaccount.yaml` and token-Secret template.
A store-independent controller bootstrap is renderable: add
`nodeExporter.enabled: false`, `kubeStateMetrics.enabled: false`,
`kubernetesServiceMonitors.enabled: false`, `defaultRules.create: false` and
`prometheusOperator.serviceMonitor.selfMonitor: false` (`controllers-only` row).

## Selector semantics and preserving platform coverage

The pinned CRD `charts/crds/crds/crd-prometheuses.yaml` distinguishes two levels:

| Field                                                                                                   | CRD null / omitted           | CRD `{}`             |
| ------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------- |
| `serviceMonitorSelector`, `podMonitorSelector`, `probeSelector`, `ruleSelector`, `scrapeConfigSelector` | no matching resource objects | all resource objects |
| corresponding `*NamespaceSelector`                                                                      | current Prometheus namespace | all namespaces       |

If all four discovery resource selectors (ServiceMonitor, PodMonitor, Probe,
ScrapeConfig) are null, the CRD describes unmanaged Prometheus configuration.
The chart is a separate transformation: in the baseline, the four explicitly false
NilUsesHelmValues flags produce `{}` resource selectors, and all namespace selectors
are `{}`. ScrapeConfig retains its chart-default release-label resource selector with
an all-namespace selector. An actual `null-selectors` values render gave `{}` for
ServiceMonitor/PodMonitor/Probe resource selectors and their namespace selectors,
and `{}` for rule namespace selection. It omitted rule and ScrapeConfig resource
selectors and ScrapeConfig namespace selection. Therefore null values do **not**
consistently preserve CRD null semantics through this Helm chart. A nonempty explicit
selector is the reliable supported input here.

The dev fixture rendered the following, repeated for all five resource types:

```yaml
serviceMonitorSelector:
  matchLabels: { puni.dev/telemetry-instance: dev }
serviceMonitorNamespaceSelector:
  matchLabels: { kubernetes.io/metadata.name: observability-dev }
ignoreNamespaceSelectors: true
```

The actual two generated self ServiceMonitors carry that dev label and namespace.
Their Service target selectors still carry `release: metrics-dev`. The CRD says
`ignoreNamespaceSelectors: true` prevents monitors from discovering targets outside
the **monitor's** namespace. Without it, limiting monitor-object namespaces does not
limit `ServiceMonitor.spec.namespaceSelector` or the equivalent target discovery.
Probe/ScrapeConfig explicit URLs, additional scrape config and remote-write ingestion
are separate paths; resource selectors do not authorize arbitrary network targets or
clients. NetworkPolicy, API RBAC, and ingest/query credentials remain necessary.

The current shared sources cannot simply disappear when selectors narrow. The
shared-owner render retains six monitors: KSM, node exporter, CoreDNS, API server,
kubelet and operator, plus 30 rules. Existing non-KPS platform monitors/rules include
[collector/gateway](../../../infra/platform/observability/base/signals.yaml),
[platform collector](../../../infra/platform/observability/otel/collector.yaml),
[alerts](../../../infra/platform/alerts/base/rules.yaml), blackbox/Probe and backup
resources in their own compositions. These currently rely on broad selection and
may have no instance label. An explicit platform owner/consumer label and bounded
namespace allowlist must preserve them. A production consumer that retains these
cross-namespace control-plane targets cannot blindly adopt dev's
`ignoreNamespaceSelectors: true`; the kubelet/CoreDNS monitors target `kube-system`
and API monitor targets `default` even though monitor objects live in `observability`.
Sources: actual baseline/shared renders and KPS exporter templates. The fixtures do
not decide which platform store consumes this coverage.

The rendered KSM has no `--namespaces` or denylist flag, and lists pod, Secret,
workload, node and storage resources among its collectors. Its bundled values default
to all namespaces (`namespaces: ""`, `releaseNamespace: false`). Selecting its one
ServiceMonitor therefore exposes the endpoint's cross-namespace series, regardless
of the namespace of that ServiceMonitor. A dev label on the monitor would not isolate
production workload metrics. Shared node-exporter and hostmetrics likewise represent
the actual host, not an application environment. Keep exactly one source owner;
do not duplicate these sources with synthetic dev/prod host labels. Sources: bundled
KSM `values.yaml`, `templates/deployment.yaml`, actual KSM arguments, node-exporter
DaemonSet and [host agent](../../../infra/platform/telemetry/agent/agent.yaml).

KPS controller watch inputs are distinct from Prometheus discovery selectors. An actual
scoped-owner render used `prometheusOperator.namespaces: {releaseNamespace: true,
additional: [observability-dev, observability-prod]}` plus both
`prometheusInstanceNamespaces` and `alertmanagerInstanceNamespaces` lists containing
the two app namespaces. It emitted `--namespaces=observability,observability-dev,observability-prod`,
`--prometheus-instance-namespaces=observability-dev,observability-prod` and the analogous
Alertmanager flag. `denyNamespaces` is an alternative watch-denylist input, not an instance
selector. These flags scope reconciliation, not tenant access; default cluster RBAC
remains present. Source: KPS `templates/prometheus-operator/deployment.yaml` and
`clusterrole.yaml`. AlertmanagerConfig selection is another boundary: its pinned CRD
says an omitted namespace selector selects its own namespace; the current chart emits
neither config selector by default. Explicitly scope both if later enabling merged
AlertmanagerConfig objects. Preserve the current per-instance `configSecret` closure.

## ECK ownership, watches and admission

Pinned actual counts:

| ECK variant                                                      | CRDs | Operator StatefulSets | ClusterRoles / Bindings | Webhooks | Elastic/Kibana CRs |
| ---------------------------------------------------------------- | ---: | --------------------: | ----------------------- | -------: | ------------------ |
| operator default                                                 |   12 |                     1 | 3 / 1                   |        1 | 0 / 0              |
| operator managed namespaces `[observability, observability-dev]` |   12 |                     1 | 3 / 1                   |        1 | 0 / 0              |
| operator `installCRDs: false`                                    |    0 |                     1 | 3 / 1                   |        1 | 0 / 0              |
| Elasticsearch application chart                                  |    0 |                     0 | 0 / 0                   |        0 | 1 / 0              |
| Kibana application chart                                         |    0 |                     0 | 0 / 0                   |        0 | 0 / 1              |

Do not install an ECK operator release per app instance. `managedNamespaces` defaults
to `[]` (all); the namespaced fixture adds `namespaces: [observability,observability-dev]`
to the operator ConfigMap, without narrowing its cluster RoleBinding. The chart also
supports mutually exclusive `managedNamespaceSelector`, requiring cluster-scoped
resources. `createClusterScopedResources: false` generates Roles/Bindings per managed
namespace but the chart refuses that setting with webhook or storage validation still
enabled. This is not a harmless CRD-disable alias. Cross-namespace association RBAC
is separately controlled by `refs.enforceRBAC`, currently false by default; use local
Elasticsearch refs and explicitly validate/refuse foreign namespaces. Sources: ECK
`values.yaml`, `templates/configmap.yaml`, `templates/role-bindings.yaml`,
`templates/validate-chart.yaml`, and application CR templates.

[ECK operator values](../../../infra/platform/observability/eck/eck-operator.yaml) and
its chart already default operator containers to nonroot, no privilege escalation,
drop ALL and read-only root filesystem. Elasticsearch 9.3.8's generated main/init
containers get nonprivileged, nonroot, no escalation and drop ALL defaults; the
filesystem init does not require privilege. The init constructor adds filesystem
preparation, optional keystore initialization and suspension; it does not add a
privileged sysctl init. Sources: pinned
[container security context](https://raw.githubusercontent.com/elastic/cloud-on-k8s/v3.5.0/pkg/controller/elasticsearch/securitycontext/securitycontext.go),
[init constructor](https://raw.githubusercontent.com/elastic/cloud-on-k8s/v3.5.0/pkg/controller/elasticsearch/initcontainer/initcontainer.go)
and [filesystem init](https://raw.githubusercontent.com/elastic/cloud-on-k8s/v3.5.0/pkg/controller/elasticsearch/initcontainer/prepare_fs.go).
The filesystem script chowns only when already root
([script](https://raw.githubusercontent.com/elastic/cloud-on-k8s/v3.5.0/pkg/controller/elasticsearch/initcontainer/prepare_fs_script.go)).

For ES >=8 the operator normally supplies fsGroup 1000 and RuntimeDefault seccomp,
but `WithPodSecurityContext` supplies the context only when the user context is nil.
The existing [ES source](../../../infra/platform/observability/elastic/base/elasticsearch.yaml)
provides a nonnil runAsUser/group/fsGroup 1000 context with no seccomp field; therefore
RuntimeDefault must not be assumed to merge in. Init containers inherit the selected
main image, volumes and environment where unspecified. Sources:
[ES pod assembly](https://raw.githubusercontent.com/elastic/cloud-on-k8s/v3.5.0/pkg/controller/elasticsearch/nodespec/podspec.go)
and [default builder](https://raw.githubusercontent.com/elastic/cloud-on-k8s/v3.5.0/pkg/controller/common/defaults/pod_template.go).
Helm renders ES/Kibana CRs, not operator-generated pod specs. No PSA admission or
Kibana final pod security claim is made here. The existing
[namespace policy](../../../infra/platform/policy/namespaces.yaml) marks
`observability` privileged for node-exporter host namespaces and root host filelog;
that does not justify weakening an app-only namespace. Actual generated pods and
storage permissions must be admitted in rehearsal before selecting restricted PSA.

## Instance closure, identity and activation constraints

The [base composition](../../../infra/platform/observability/base/kustomization.yaml)
currently includes controllers, shared host sources, stores and app services together.
Actual kustomize output has five HelmReleases, two StatefulSets, two Jobs, two custom
ServiceMonitors and three NetworkPolicies in both profiles; local adds one receiver
Deployment and Service. Both profiles use namespace `observability`. Local/production
are placement profiles today, not two app namespaces on one target. Source environment
must remain independent of placement when dev is placed on the production platform.

Required closure includes these existing references and behaviors:

- Collector/gateway StatefulSets each use distinct `state` claim templates, 2Gi,
  `puni-retain`, and explicit Retain on scale/delete. ES uses
  `elasticsearch-data`, `DeleteOnScaledownOnly`, 100Gi production / 10Gi local;
  ES requests/limits are 4Gi production / 2Gi local. Prometheus requests 512Mi,
  limits 1Gi, and has a 10Gi `puni-retain` claim with 15d/8GB retention. Alertmanager
  has no explicit persistent storage configuration in the existing values.
  Sources: actual profile kustomize outputs, ES source and KPS source/CR templates.
  Namespaced templates avoid identical claim identities across namespaces; PV UIDs,
  claimRefs, existing storage and retention are not proven by this fact.
- Secret references are namespace-bound: `elastic-s3-credentials`, generated
  `elasticsearch-es-elastic-user` / `elasticsearch-es-http-certs-public`,
  `kibana-kb-http-certs-public`, `alertmanager-puni`, `otel-server-tls`,
  `otel-client-trust`, `signal-collector-tls`, `signal-client-trust`,
  `signal-collector-client`, `signal-gateway-tls`, `signal-gateway-trust`,
  `signal-metrics-tls`, `signal-metrics-writer`, `signal-metrics-write-auth` and
  `signal-metrics-query-auth`. Preserve Secret/config, cert SAN, client CA, S3,
  settings/snapshot and dashboard Job closure per instance. Sources:
  [signals](../../../infra/platform/observability/base/signals.yaml),
  [metrics](../../../infra/platform/observability/base/metrics.yaml),
  [ES settings](../../../infra/platform/observability/elastic/settings/settings.yaml),
  [Kibana objects](../../../infra/platform/observability/kibana/objects/job.yaml),
  [platform collector](../../../infra/platform/observability/otel/collector.yaml).
  Different Secret names do not prove different effective client identities or trust.
- Existing service URLs explicitly include `observability.svc`; moving only resource
  metadata does not update collector exports, metrics proxy backends, private routes,
  TLS server names, Kubernetes monitor target namespaces, Prometheus Alertmanager
  reference namespaces, or Kibana associations. The ECK app chart manifests omit
  metadata.namespace; Helm's effective installation namespace must be assigned when
  analyzing them. Sources: app chart templates, signals/profile configurations and
  KPS `templates/prometheus/prometheus.yaml`.
- Keep central image digests including generated Prometheus config-reloader and
  admission certgen hooks, not just visible Deployment images. The pinned owner
  Deployment supplies its reloader digest through `--prometheus-config-reloader`.
  The app-only render omits the owner Deployment, so complete image closure is the
  union of instance and explicit shared prerequisites. Sources: lock, source values,
  actual render and KPS operator Deployment template.

With pinned helm-controller 1.6.4, no explicit `releaseName`/`targetNamespace` means
current metadata.name/namespace defaults; explicit targetNamespace changes the
default releaseName prefix, and explicit releaseName overrides it. Fullname override
alone does not stabilize `release` and `app.kubernetes.io/instance` labels, subchart
names or monitor target selectors. The fixture proves `release: metrics-dev` with
`fullnameOverride: kps-dev`. Model the actual Flux identity before comparing rendered
ownership, monitoring and retained claims. Primary source:
[GetReleaseName/GetReleaseNamespace](https://raw.githubusercontent.com/fluxcd/helm-controller/v1.6.4/api/v2/helmrelease_types.go).

Current [policy](../../../infra/platform/policy/network-policy.yaml) has no default-deny
for all observability pods; the rendered three policies restrict collector/proxy/
Prometheus ingress. There is no all-pod ES/Kibana default-deny/egress boundary in this
composition. A namespace-local podSelector differs from a combined pod/namespace
selector, and default-deny ingress alone does not prevent outbound mutation/query.
New instance boundaries need the explicitly scoped DNS, API discovery, operator,
source, store, TLS and operator-UI flows plus real negative clients; selectors are
not substitute API authorization. Existing Grafana datasource/dashboard credentials
and reachable private routes must be bound independently; a ClusterIP is not proof
that the retained Docker Grafana or external observer can reach it.

A source-feasible dev-only activation packet consists of a separately bound shared
controller prerequisite plus dev services/claims/trust, with required platform source
ownership separately declared. The `controllers-only` render demonstrates that this
prerequisite does not require any Prometheus/Alertmanager/ES production instance.
Preserve an existing verified platform source/sink binding until its separately
reviewed migration, or provide an explicitly reviewed source destination: silently
requiring prod service activation to give a shared collector somewhere to export
would violate dev-only activation. The current
[production Flux entry](../../../infra/clusters/platform/production/observability.yaml)
selects the entire production overlay; it is not a dev-only bootstrap. Its existing
platform/certificates prerequisites, target kubeconfig, SOPS dependency and waits
remain required. A declared new target marker is a candidate, not a live binding;
actual context/cluster/node identity, ownership, free capacity, admission, retained
claims and reachable routes remain inventory-gated. No second cluster runner or new
infrastructure is needed to express these independent lifecycle boundaries.

## Global filelog routing risk

The actual [platform collector](../../../infra/platform/observability/otel/collector.yaml)
reads `/var/log/pods/*/*/*.log`, excluding only its own
`/var/log/pods/observability_otel-collector-*/*/*.log`. Container parsing and the
closed Pino-field extraction do not establish an application environment from the
pod namespace. `filter/platform-only` drops records only when
`deployment.environment.name` is present. A dev-namespace record lacking that field
therefore passes this source predicate and reaches the existing platform ES exporter;
redaction is not tenancy routing. The current exporter uses the shared platform store
and `PUNI_ENVIRONMENT` stream namespace. This is a source-level admission inference,
not a collector-runtime negative test.

The [common builder](../../../tools/tool-observability-stack/src/configuration/signals.ts)
contains local filelog/hostmetrics pipelines, a platform cluster marker, and a platform
admission predicate based on allowed infrastructure cluster plus absent application
environment. Its explicit `source.collection: external` projection removes local
filelog/hostmetrics from the app collector; the
[Fleet binding](../../../tools/tool-fleet/src/observability.ts) currently chooses that
mode and one existing `otel-collector` platform owner. This avoids a second host
reader, but does not change the old owner's global path. An app-only namespace split
must exclude or explicitly route actual dev-owned pod paths in that one reader while
preserving shared platform diagnostics and host metrics. The required production-path
negative is a dev-namespace record with no app environment; inferring ownership from
`puni.cluster` or adding only an OTLP environment filter cannot prove isolation.

## Remaining proof boundaries

No live rollout, operator reconciliation, admission, API `can-i`, network-policy/CNI,
TLS/authentication, scrape, alert delivery, runtime source routing, PV rebinding,
snapshot/restore, capacity or operator-UI route was tested. No full gate or broad
suite was run for this research-only note. ECK-generated workload/image/Secret
closure and namespaced discovery roles must be checked after real reconciliation.
The temporary values deliberately contain incomplete scrape-token closure and do not
label/select all current custom platform monitors; they must not be applied as a
migration. Cardinality/scoping findings inform the next design step; ownership
transfer and store/source migration still need explicit, breakable production-path
checks and actual live receipts.
