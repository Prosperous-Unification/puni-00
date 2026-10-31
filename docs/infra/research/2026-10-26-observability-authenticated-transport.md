# Authenticated observability transport: Task 5 source research

Research date: 2026-10-26. Read against worktree `aa39/puni-00`, supplied base
`8962d8a82`, and the [authenticated transport task](../../../openspec/changes/observability-environment-parity/tasks.md).
This is reading evidence, **not runtime or acceptance proof**. No tests, builds, Docker,
SSH, Kubernetes, Grafana calls, credential reads, package installation, or persistent
configuration changes ran. All actual pinned-runtime TLS, authorization, subprocess,
and guard-removal proofs below remain pending for the implementer.

## Bun transport: supported names and verification limits

The repository pins Bun 1.4.4 in [.bun-version](../../../.bun-version) and
[toolchain.json](../../../infra/versions/toolchain.json) (including the Bun Alpine image
digest). Installed `node_modules/bun-types/package.json` reports **1.4.2**; its
`globals.d.ts:1933` and `bun.d.ts:4626` are local type evidence, not the pinned runtime.
The official [1.4.4 tagged TLS types](https://raw.githubusercontent.com/oven-sh/bun/bun-v1.4.4/packages/bun-types/bun.d.ts)
confirm these properties:

| Fetch option                    | Exact type/meaning in tagged types                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tls.ca`, `tls.cert`, `tls.key` | Each accepts `string \| BufferSource \| BunFile \| Array<string \| BufferSource \| BunFile> \| undefined`; supply PEM content or a Bun file, not a bare filename string assumed to be opened. |
| `tls.serverName`                | `string`; explicit server name. `servername` is a 1.4.4 alias; `serverName` wins. The installed 1.4.2 types only declare `serverName`.                                                        |
| `tls.rejectUnauthorized`        | `boolean`; client default can come from `NODE_TLS_REJECT_UNAUTHORIZED`. An authenticated verified adapter must select `true` explicitly.                                                      |
| `tls.passphrase`                | Optional `string` for encrypted private keys.                                                                                                                                                 |

Explicit `ca` replaces the built-in Mozilla roots; it does not append them. Decide
whether this particular private route needs only its selected CA or a combined trust
bundle; do not assume public roots survive the override. The same tagged type source
documents certificate-chain ordering and key inputs.

The [1.4.4 tagged fetch types](https://raw.githubusercontent.com/oven-sh/bun/bun-v1.4.4/packages/bun-types/globals.d.ts)
declare `tls?: BunFetchRequestInitTLS`, which extends `Bun.TLSOptions`, and
`checkServerIdentity?: NonNullable<import("node:tls").ConnectionOptions["checkServerIdentity"]>`.
These options belong to `fetch(url, options)`; `new Request()` does not retain the
Bun extensions. A custom checker runs after chain verification; it is synchronous
and must return `undefined` or `Error`. Avoid installing an approving checker in place
of hostname verification.

Current official [fetch documentation](https://bun.com/docs/runtime/networking/fetch#connecting-to-a-specific-address)
explicitly supports dialing an IP URL while setting `Host` and `tls.serverName` to the
origin: the latter selects SNI **and** the certificate verification name. It recommends
`proxy: false` and manual redirects; proxy environment matching otherwise uses the IP.
It also documents client `cert`/`key`, timeout signals, and connection failures as
`TypeError` with socket `code`. Thus the documented tunnel binding is
`https://127.0.0.1:<forward-port>` plus reviewed service `Host`, `tls.serverName`, selected
CA/client identity, `rejectUnauthorized: true`, `proxy: false`, and redirect refusal.
**This is a documented binding to test, not a completed TLS handshake.** The page is
unversioned (currently advertises 1.4.4); tagged types support the property names, but
runtime implementation paths attempted through browsing were unavailable. Exact TLS
error class/code and server-name behavior still require pinned 1.4.4 positive and
wrong-hostname/untrusted-CA negatives. Setting `Host` alone is insufficient evidence.

The [tagged fetch tests](https://raw.githubusercontent.com/oven-sh/bun/bun-v1.4.4/test/js/web/fetch/fetch.test.ts)
at the connection-failure test assert `name: "TypeError"`, `code: "ECONNREFUSED"`
and `"ECONNRESET"`. They are upstream source, not tests run here. Neither those tests
nor the documentation establish a closed TLS-error-code list for this application.

## Existing failure boundary and required preserved bounds

[acceptance.ts](../../../tools/tool-observability-stack/src/dev/acceptance.ts) currently
accepts only credential-free HTTP `127.0.0.1` roots. `query()` has manual redirects,
exact HTTP 200, incremental **1 MiB** response reading, and JSON parsing. `inspect()`
combines its parent signal with a default **5 s**, maximum **10 s** deadline.
`available()` translates modeled query faults, body overflow, cancellation and selected
network failures into unavailable evidence; unknown exceptions propagate. The common
[evaluator](../../../tools/tool-observability-stack/src/dev/observation.ts) keeps
unavailable distinct from successful empty queries and produces explicit incomplete
health. Do not turn failed TLS/authentication into empty evidence or healthy status.

[otlp.ts](../../../tools/tool-observability-stack/src/dev/otlp.ts) has the same current
HTTP-loopback-only endpoint policy. `createOtlpSender()` posts JSON to `/v1/logs`,
`/v1/metrics`, `/v1/traces`, refuses redirects, accepts only HTTP 200, caps acknowledgement
bodies at **4096 bytes**, and validates empty or zero-rejection `partialSuccess`.
It uses the caller's cancellation/deadline signal. Publication acknowledgement remains
separate from stored acceptance. [probe.ts](../../../tools/tool-observability-stack/src/dev/probe.ts)
bounds whole collection/cycle work to at most **20 s** and separately bounds prior
acceptance; preserve these paths for TLS stalls and body stalls too.

Implementation implication: distinguish trusted binding/material validation from the
network exchange. Missing/unreadable/empty/malformed credential, CA, cert or key input
must throw at its trusted input boundary, including incomplete client-cert/key pairs;
do not catch these as ordinary backend outages. Once validated, transport/TLS refusal
and HTTP 401/403 must visibly refuse acceptance/publication. Current broad `TypeError`
catches can also catch bad option/programming inputs; do not expand them into a catch-all
for configuration errors. Preserve bounded bodies, exact status/ack semantics and deadline
behavior when adding headers/TLS. This follows the current code and [R5](../../../AGENTS.md),
not an asserted vendor-specific TLS error mapping.

## Elastic scope, identity inspection and ECK declarations

The exact existing acceptance requests are `POST /logs-*.otel-dev/_search` and
`POST /traces-*.otel-dev/_search`; they filter exact observation ID plus producer
`service.name=puni-dev-probe` and resource environment `dev`. Metrics come from
Prometheus `/api/v1/query`, not Elastic. Searches cap records at 16, use `timeout: 3s`,
and reject timed-out searches, shard failures, inexact totals and partial traces
([acceptance.ts](../../../tools/tool-observability-stack/src/dev/acceptance.ts)).

The common [renderer](../../../tools/tool-observability-stack/src/configuration/signals.ts)
sets `mapping.mode=otel` through its legacy base and sets `data_stream.namespace` from
`inputs.source.environment`. Generated [local gateway](../../../infra/platform/observability/local/gateway.yaml)
uses `dev`; [production gateway](../../../infra/platform/observability/production/gateway.yaml)
uses **`prod`**, not `production`. Infrastructure logs have separate namespaces from
`puni.cluster` (`platform-*`, `workers-*`). Do not add those to health-query rights by
accident. A production health pattern `logs-*.otel-prod` / `traces-*.otel-prod` is an
inference from that namespace plus current acceptance naming; actual emitted dataset
names/search success still need runtime observation. Neither source manifests nor this
note establish a live data-stream inventory. The Kibana view `logs-puni.otel-*` is a
separate UI pattern, not proof that the health producer's dataset is `puni`.

Official [search API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-search)
requires index **`read`** on target data streams/indices/aliases. For the existing
adapter this means only the two health patterns above; no cluster privilege is needed
by its current requests. [Privileges reference](https://www.elastic.co/docs/reference/elasticsearch/security-privileges)
distinguishes `read` from `view_index_metadata` (metadata inspection) and cluster
`monitor` (for cluster health/status, not performed by this adapter). Do not grant
`manage`, `all`, `write`, `create_index`, `auto_configure`, or `manage_security` merely
for `_search`. This conclusion concerns current official docs; exact ES 9.3.8 source
retrieval was unavailable and pinned authorization proof remains pending.

The generated gateways explicitly use `user: elastic`, `ELASTIC_PASSWORD`, and the
[base workload](../../../infra/platform/observability/base/signals.yaml) references
`elasticsearch-es-elastic-user`. Official [ECK managed credentials](https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth/managed-credentials-eck)
identifies this as the default superuser. These ingestion/admin references do **not**
establish an existing read-only query credential. No Secret contents were inspected.
Do not reuse them as acceptance identity or assume a duplicate username/password in
another realm narrows the authenticated user's privileges.

Read-only live evidence can use the **same credential and verified route as the search**:

1. `GET /_security/user/_privileges`: inspect the complete effective privilege response,
   including all index scopes, cluster, run-as, application/global/remote entries. A strict
   reviewed read-only allowlist is stronger than checking a few denied privilege names.
   The [official API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-security-get-user-privileges)
   allows users to inspect their own privileges without administrator rights.
2. `POST /_security/user/_has_privileges`: require `read` true for the expected patterns,
   and explicit administrative/write predicates false (cluster `all`, `manage`,
   `manage_security`; index `all`, `manage`, `write`, `create`, `create_doc`, `index`,
   `delete`, `delete_index`, `create_index`, `auto_configure`). Validate each boolean;
   mixed positive/negative requests naturally have `has_all_requested=false`.
   This [API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-security-has-privileges)
   is inspection despite POST and permits self-checks. Denying `all` alone does not
   prove denial of narrower/custom action grants or unrelated index scopes.
3. Require successful real scoped searches as a positive control. Inspection is policy
   evidence, not a destructive authorization test. Exercise real write/admin HTTP 403
   negatives only against disposable lab resources, with a separate lab-admin positive
   control and R5 guard/dependency mutations. Never send a potentially successful
   mutation to live/prod to discover whether the identity can mutate.

Pinned declarations are supported without inventing a controller API:

- The bundled [ECK 3.5.0 chart](../../../infra/platform/charts/eck-operator-3.5.0.tgz), member
  `eck-operator/charts/eck-operator-crds/templates/all-crds.yaml:4694`, declares
  `spec.auth.fileRealm[].secretName` and `spec.auth.roles[].secretName`.
- [ECK v3.5.0 types](https://raw.githubusercontent.com/elastic/cloud-on-k8s/v3.5.0/pkg/apis/elasticsearch/v1/elasticsearch_types.go)
  specify same-namespace Secrets: role definitions under `roles.yml`; file users/password
  hashes under `users`, role-to-user mappings under **`users_roles`**. These are different
  from `secureSettings`, which deliver Elasticsearch secure settings rather than users.
- Bundled [eck-elasticsearch 0.20.0](../../../infra/platform/charts/eck-elasticsearch-0.20.0.tgz),
  member `templates/elasticsearch.yaml`, emits `.Values.auth` unchanged into `spec.auth`.
  Current [Elasticsearch HelmRelease](../../../infra/platform/observability/elastic/base/elasticsearch.yaml)
  does not declare an `auth` user/role source.
- Current [file-realm docs](https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth/file-based)
  additionally support `kubernetes.io/basic-auth` Secrets (`username`, `password`, optional
  comma-separated `roles`) through `auth.fileRealm`. Duplicate usernames across file-realm
  Secrets use the last password entry; repeated `users_roles` role mappings combine users.
  This is not a supported isolation technique. Current [role docs](https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth/defining-roles)
  say duplicate `roles.yml` role definitions use the last Secret. Avoid duplicate names.
- Native user/role APIs are a separate mutating alternative:
  [`PUT /_security/user/<username>`](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-security-put-user)
  and [`PUT /_security/role/<name>`](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-security-put-role)
  require `manage_security`; native user creation does not manage file-realm users.
  Persistent/prod Secret or native-user changes are outside current authorization.

## Generic model and concrete caller boundaries

[ObservationIdentity](../../../tools/tool-observability-stack/src/dev/observation.ts) is
already generic: string environment/service/revision/observationId. `ObservationEvidence`,
`SignalEvidence`, `ObservationHealth` and `assessObservation()` contain no provider or
transport types. Preserve their identity/time/freshness/trace semantics.

The concrete legacy layer remains deliberately narrower:

- [ProbeObservation](../../../tools/tool-observability-stack/src/dev/probe.ts) fixes
  environment `dev`, target service `be-01`; [HealthSource](../../../tools/tool-observability-stack/src/dev/source.ts)
  is local rehearsal or validated/unvalidated `ssh-dev-container`. Its SSH reader inspects
  the exact dev container, runtime/network/source bind mount, then executes by inspected
  container **ID**, not by mutable name.
- [Acceptance validation](../../../tools/tool-observability-stack/src/dev/acceptance.ts)
  requires that real source, producer `puni-dev-probe`, `wbs-dev-src`, exact inspected ID,
  `/home/puni1/wbs-dev/src`, resource `dev`, and matching target identity/observation/trace.
  Failed source and local rehearsal return incomplete **before any query**. Transport
  generalization must not relax these legacy checks to manufacture a production fixture.
- [OTLP encoding](../../../tools/tool-observability-stack/src/dev/otlp.ts) emits those dev
  producer/resource fields; it includes inspected container/mount attributes only for a
  validated SSH source. [Checkpoint parsing](../../../tools/tool-observability-stack/src/dev/checkpoint.ts)
  also fixes this legacy schema. A generic fixture's scoped expected-source identity must
  remain separate from actual SSH-dev provenance; changing TLS alone cannot provide it.
- The sole non-test source caller found for `createBackendAcceptance`, `createOtlpPublisher`
  and `createOtlpSender` is [probe-cli.ts](../../../tools/tool-observability-stack/src/dev/probe-cli.ts).
  It creates a publisher and a **second sender** used by application-log batches and
  autonomous health metrics; authenticated transport binding must reach both. Its `--local`
  mode deliberately refuses real application-log/storage collection. The generated
  [runtime unit](../../../tools/tool-observability-stack/src/dev/runtime.ts) currently pins
  its existing observer release and plaintext loopback argv; source research does not
  authorize replacing the host unit or pins.

Relevant existing negative coverage to retain: [acceptance tests](../../../tools/tool-observability-stack/src/dev/acceptance.test.ts)
for wrong stored source/identity, rehearsal preflight, body/status/deadline/partial search;
[probe tests](../../../tools/tool-observability-stack/src/dev/probe.test.ts) for OTLP
acknowledgements, local provenance and total-cycle cancellation;
[source tests](../../../tools/tool-observability-stack/src/dev/source.test.ts) for exact
container identity and inspected-ID execution. These were read, not run.

## Grafana: exact minimal deltas

[Grafana adapter](../../../tools/tool-observability-stack/src/dev/grafana.ts) currently
captures inventory, preserves `sdlc-metrics` as sole default plus `sdlc-logs`/`sdlc-traces`,
and hashes all retained datasource entries/dashboard search inventory. However,
`SourceList` only validates `uid` and `isDefault`; initial capture does **not** assert
Victoria type/URL. Hashing an already-wrong initial baseline cannot establish correctness.
Minimal source change: validate `sdlc-metrics.type === 'prometheus'` and
`.url === 'http://victoriametrics:8428'` at initial inventory capture while preserving
sole-default and full retained inventory hashing. Do not require unrelated datasource
fields unless the existing contract needs them. The [official datasource API](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/api-legacy/data_source/)
returns type, URL, UID and default metadata; its legacy `/api` route remains available.

The [CLI](../../../tools/tool-observability-stack/src/dev/grafana-cli.ts) already resolves
an arbitrary caller-provided receipt path, exclusively creates `.lock` and capture files
with `wx`/0600, and atomically saves fsynced phase updates. Capture refuses existing
receipts. Apply requires untouched `captured`; rollback accepts only recorded creation
phases, verifies owned hashes/provisioned status/baseline, deletes only its two UIDs,
checks their absence, and reaches `removed`. Repeated restore needs a **new path**; do
not reset `removed`, overwrite, or delete the historical receipt. No core receipt format
change is needed merely to support further unique paths.

The concrete restriction is [runtime runbook helper](../../runbook-dev-observability-runtime.md)
line 156: two accepted names only, `grafana-integration.json` and
`grafana-integration-restored.json`. Minimal documentation/helper delta: retain both
legacy receipts; add an explicit reviewed unique-operation basename contract beneath
the fixed evidence root (no absolute path, separators, traversal or arbitrary target).
Each later capture chooses a fresh name; apply/rollback reuse that same operation's
receipt. Preserve the pinned helper hash/container verification until separately
reviewed deployment of a new compiled helper. Update the restoration example and
[Grafana runbook](../../runbook-dev-observability-grafana.md) to describe subsequent
cycles. No running Grafana API or existing receipt was read or changed here.

Pending meaningful proofs: wrong initial type and wrong initial URL each refuse before
mutation; a second restoration uses a third unique receipt while both old receipts retain
bytes/phases; existing capture cannot overwrite; rejected basename cannot escape the root;
existing default/ownership/phase/hash/partial-apply protections still pass. Existing
[grafana.test.ts](../../../tools/tool-observability-stack/src/dev/grafana.test.ts) already
has real HTTP fixtures and CLI filesystem checks, but no current test was executed.

## Remaining acceptance evidence

Use the pinned Bun runtime for query and producer positive TLS/mTLS/auth controls plus
untrusted signer, wrong hostname, missing client identity/credential, wrong credential,
missing/unreadable/malformed trust input, redirect, slow handshake/body and response-size
negatives. Demonstrate complete health from all three stored signals through the same
binding; transport refusal must preserve visible incomplete health/publication failure.
Prove query read-only grants through inspection and disposable-lab mutation denial;
prove source scoping without impersonating dev; exercise Grafana deltas through actual
HTTP/subprocess boundaries. Remove each safety guard or break its dependency, observe
the exact negative fail, and record the adjacent R5 proof. No such proof is claimed here.
