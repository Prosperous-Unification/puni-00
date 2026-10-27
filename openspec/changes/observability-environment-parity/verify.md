# Task 4b2 / Task15 source verification

This receipt covers desired source only. Canonical task2.2 checkboxes remain parent-owned and incomplete. No runtime, persistent material, live activation, CNI, operator admission, loaded-reader, stored-signal, claim or recovery authority is certified.

## Final scope and interfaces

- `createObservabilitySource(root, unknown)` returns a full desired packet around immutable4b1 assembly flags: nine Helm owners, native/security resources for both instances, role/material/route requirements, same-owner external patches and retained-listener migration prerequisites.
- `assertObservabilitySource` regenerates the full packet before consumption. `renderObservabilitySource` shares pinned Helm/chart checks through `renderObservabilityReleases`;4a still asserts its original118-resource projection before rendering.
- `indexObservabilitySource` enforces namespace-qualified global identities and reviewed API versions. `assertRenderedObservabilitySource` validates191 resources per profile plus exact externally owned resources/handoffs, policy, references and claims.
- `reviewObservabilitySourceDifferences` loads independent23-scalar authority; `assertObservabilitySourceParity` expands configuration content and compares all remaining leaves. Explicit local disposable production-role sizing adds8 reviewed capacity scalars (31total). No namespace, code-line or subtree normalization.
- `validateObservabilitySources(root, tools, {local,production})` / `tool-fleet:validate-observability-source` returns a distinct source/security/parity receipt with source/policy/render hashes. Existing assembly completion flags stay false.
- `assertRetainedReaderConfiguration` checks path exclusion, namespace predicate and attached sole log pipeline. `validateRetainedReaderPrerequisite(input,{run?,now?})` uses existing bounded discovery plus closed safe projections. Requires explicit target and controller contexts, target/owner/source/config/workload identities, source revision, config hash/template checksum, timeout<=30s and freshness<=60s. It certifies observed installed source only; effectiveReaderVerified/activationReady remain false.
- Concrete Fleet source/material/route descriptors stay in Fleet. Future Fleet adapters translate to generic shared observation inputs; no reverse Fleet dependency was introduced.

## Decisions and supported limits

Parent-approved network input uses explicit finite IPv4/32 host declarations. Checked-in enrolled10.1.0.4/.2 and API10.1.0.4 intent is cross-checked. No invented live origins, DNS-as-permanent-policy, blanket0/0, automatic context discovery or live Kubernetes access. Test observer/Grafana/S3/alert/probe hosts are synthetic172.31.100.10–14, never production facts. Missing actual binding inputs block activation; declared complete fixtures yield useful source positives.

App ingest uses separate signal-ingest identity, no cluster privileges, auto_configure/create_doc on exact logs/traces/metrics *.otel-{environment}, with discover.on_start=false and interval0s and allowed mapping otel. Setup remains ECK admin and queries remain read-only. Platform reader has independent platform-ingest identity and logs-puni.otel-{local|production} semantics. Actual effective grants and APM aggregate streams still need runtime witnesses. Primary sources are linked in docs/infra/observability-projections.md; pinned Elastic Agent9.3.8 and collector0.160 accepted exact desired configs offline.

External alerts/Probes/blackbox/backup remain same-owner unapplied handoffs. Public Probes are an exact production context exception. Snapshot patch creates missing pod metadata while preserving existing labels/annotations; it does not adopt resources. The namespace-wide deny includes enrolled reader4318 alongside4317/14317; actual NAT/CNI/host-network effectiveness remains unobserved.

The desired retained reader applies platform mTLS intent to4317/4318/14317; existing selected plaintext listeners and enrolled clients remain unchanged until explicit migration canaries and runtime acceptance. Observed-source metadata cannot certify loaded config or effective cross-domain rejection. No production/live/persistent Secret changes, old dev-route changes, scan exemptions, new cluster, runner, push or merge occurred.

## TDD and checks

Early focused TDD used missing-module REDs, actual pinned chart integration, and independent negative additions. The10-policy negative additions initially reported did-not-throw before independent S3/resource/role/external checks were added. Actual charts exposed file_log receiver rewriting and missing KSM/node-exporter commonLabels inheritance; source now handles these exact chart contracts. Those early transient outputs were not durably archived before compaction; final covering output and the observed mutation receipts below are retained. No missing early timing is invented.

Final covering command (before the last focused parser/patch/4318 fixes):

```sh
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-source*.test.ts tools/tool-fleet/src/observability-reader*.test.ts tools/tool-fleet/src/observability-render.test.ts tools/tool-fleet/src/observability-projection.test.ts tools/tool-fleet/src/observability-composition.test.ts tools/tool-fleet/src/observability-preflight.test.ts
```

Outcome:385pass,0fail,951assertions,191.70s. Includes real full CLI positive, actual pinned renders,23-scalar parity, explicit31-scalar disposable capacity, closed input/private diagnostics, original projection/composition and retained-reader/preflight covering checks. `covering.log` is the retained receipt.

Final source fixes were verified without repeating that385-test batch or unchanged Helm outputs:

- Trusted-source fixture initially lacked chart archives; its apparent refusals were rejected as invalid evidence. After attaching read-only pinned archives, the real positive succeeded and duplicate inventory YAML produced RED (promise resolved), while profile YAML already refused through existing paths. Parser guard added; `trusted-green.log`:12pass/31assertions/2.98s across source and trusted-source files.
- `handoff-red.log`:2failed intended assertions/1.412s for missing4318 and missing snapshot metadata parent. Corrected flow and metadata-preserving patch, added independent full-validator controls.
- Final focused run:10passed and1test-harness failure/8.52s. The failed test inserted a plain JS object then used YAML node traversal. Corrected test application to `document.createNode`; its sole rerun passed1/1,4assertions,0.895s (`final-patch-green.log`). The other10passing controls were not repeated. Metadata preservation test passed with both prior annotation and label.
- `bun /tmp/puni-4b2/final-captured.ts` invokes final source regeneration, full render validator and parity against final actual chart captures. Both profiles191resources,23reviewed differences, all runtime/live flags false. Final capture refresh reports changed Helm owners=[] for both profiles; only native/security/handoff source updated. Earlier refresh rendered only the modified retained reader and production ES owner per profile.
- `bunx nx run tool-fleet:typecheck`:passed (final recorded2.6s; last test-only method adjustment checked again before commit).
- Affected ESLint passed before final corrections; final scan found only new trusted-test import ordering, fixed in targeted ESLint. Normal hook lint covers final staged source.
- `bunx openspec validate observability-environment-parity --strict`:passed,0.622s. `git diff --check`:passed.
- No app/browser/fullhost gate, build, actual Kubernetes-context observation, CNI/TLS routing/material test or store startup was run. These are explicitly later runtime work; pinned binary offline config validation is a component/config test only.

Offline component commands used `docker run --rm --pull=never --network none --memory256m --cpus0.5 --read-only --cap-drop ALL --security-opt no-new-privileges`, readonly `/tmp/puni-4b2:/configuration`, synthetic password env only. Elastic Agent image `docker.elastic.co/elastic-agent/elastic-agent:9.3.8@sha256:0b85d58ffa0e87c30baf3ab9cc3aab1e64da47607c6c1e10e9529d0665a54afd`, entrypoint `/usr/share/elastic-agent/elastic-agent`, command `otel validate --config=/configuration/gateway-{dev|prod}.yaml`:exit0,0.433s/0.528s. Collector0.160.0 digest`sha256:799dc6cf12c96192af37b5bdba804da8c10b3bc563b43cb90c3f3c58d9572ad6`, entrypoint`/otelcol-contrib`, command`validate --config=/configuration/reader-authored.yaml`:exit0,0.464s. Injecting string`invalid-discovery-type` into discover.on_start returned exit1,0.282s with expected bool/type diagnostic (`component-negative.log`); no network/process serving started.

## R5 mutation receipts

All source mutations were restored in finally. Each accepted run exited1 from the intended assertion, not an unrelated module failure. The table distinguishes fail-open controls from fixed-category controls where a later guard continued to refuse. Adjacent Proof comments name these faults in source.

Proof command prefix: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 <test-file> --test-name-pattern <pattern>`. Initial six used permanent repo tests. Remaining full-render/parity copies under `/tmp/puni-4b2/proof-*.test.ts` used the same permanent assertions with beforeAll replaced by saved actual pinned captures and absolute imports, avoiding repeated Helm renders. Native/CLI tests still exercised actual pinned kubectl/production CLI. Exact executed commands and output locations follow; permanent assertion originals are the matching tools/tool-fleet/src filenames.

| Proof                         | Concrete removed guard or injected fault and observed effect                                                                                                                                              | Seconds | Exact test file / pattern                                                                                                                                                                                                                                                                                                                                                                 | Log                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| reader-path                   | Removed include/exclude equality; dev paths and narrowed platform diagnostics were accepted.                                                                                                              |   1.081 | `tools/tool-fleet/src/observability-reader.test.ts` / `independent (path&#124;diagnostics) fault`                                                                                                                                                                                                                                                                                         | `/tmp/puni-4b2/reader-path.log`                   |
| reader-predicate              | Removed exact namespace predicate; absent-environment dev records were accepted by the source validator.                                                                                                  |   0.791 | `tools/tool-fleet/src/observability-reader.test.ts` / `independent namespace fault`                                                                                                                                                                                                                                                                                                       | `/tmp/puni-4b2/reader-predicate.log`              |
| reader-closure                | Removed single logs pipeline closure; forwarding bypass was accepted.                                                                                                                                     |   0.757 | `tools/tool-fleet/src/observability-reader.test.ts` / `independent bypass fault`                                                                                                                                                                                                                                                                                                          | `/tmp/puni-4b2/reader-closure.log`                |
| reader-pipeline               | Removed receiver/processor/exporter equality; missing namespace-filter attachment was accepted.                                                                                                           |   0.778 | `tools/tool-fleet/src/observability-reader.test.ts` / `independent pipeline fault`                                                                                                                                                                                                                                                                                                        | `/tmp/puni-4b2/reader-pipeline.log`               |
| render-owner                  | Removed release owner uniqueness; duplicate owner silently overwrote output.                                                                                                                              |   0.877 | `tools/tool-fleet/src/observability-render.test.ts` / `duplicate owners`                                                                                                                                                                                                                                                                                                                  | `/tmp/puni-4b2/render-owner.log`                  |
| render-identity               | Removed explicit releaseName/targetNamespace/owner identity refusal; unsupported Flux identities rendered.                                                                                                |   1.213 | `tools/tool-fleet/src/observability-render.test.ts` / `unsupported explicit`                                                                                                                                                                                                                                                                                                              | `/tmp/puni-4b2/render-identity.log`               |
| full-policy-equality          | Disabled requireEqual; all 16 selector/seccomp/default-deny/claim/retention/AM/realm/S3-bound/query/ingest/external membership-owner-enabled negatives accepted faults.                                   |   9.376 | `/tmp/puni-4b2/proof-observability-source-render.test.ts` / `independent (selector&#124;seccomp&#124;default deny&#124;claim&#124;retention&#124;AM persistence&#124;realm) fault&#124;independently rejects (S3 HTTPS&#124;S3 init bound&#124;Elastic memory&#124;trust scratch&#124;query grant&#124;ingest grant&#124;external membership&#124;external owner&#124;external disabled)` | `/tmp/puni-4b2/full-policy-equality.log`          |
| full-owner                    | Disabled only owner-closure equality; extra unique ConfigMap owner accepted.                                                                                                                              |   1.071 | `/tmp/puni-4b2/proof-observability-source-render.test.ts` / `refuses owner closure`                                                                                                                                                                                                                                                                                                       | `/tmp/puni-4b2/full-owner.log`                    |
| full-resources                | Disabled only resource-closure equality; missing unused ECK CRD accepted.                                                                                                                                 |   1.213 | `/tmp/puni-4b2/proof-observability-source-render.test.ts` / `refuses missing closure`                                                                                                                                                                                                                                                                                                     | `/tmp/puni-4b2/full-resources.log`                |
| full-api                      | Removed independently reviewed API union; all five Elasticsearch/Kibana/NetworkPolicy/Probe/CronJob foreign/v1 negatives accepted.                                                                        |   0.414 | `/tmp/puni-4b2/proof-observability-source-render.test.ts` / `independently checks .* API identity`                                                                                                                                                                                                                                                                                        | `/tmp/puni-4b2/full-api.log`                      |
| full-yaml                     | Removed YAML parser-error check; duplicate kind keys accepted.                                                                                                                                            |   0.423 | `/tmp/puni-4b2/proof-observability-source-render.test.ts` / `malformed duplicate YAML`                                                                                                                                                                                                                                                                                                    | `/tmp/puni-4b2/full-yaml.log`                     |
| full-duplicate                | Removed global resource identity uniqueness; duplicate rendered ES resource accepted.                                                                                                                     |    1.08 | `/tmp/puni-4b2/proof-observability-source-render.test.ts` / `refuses duplicate closure`                                                                                                                                                                                                                                                                                                   | `/tmp/puni-4b2/full-duplicate.log`                |
| source-network-host           | Replaced IPv4 /32 parser with unrestricted string; 0.0.0.0/0 accepted.                                                                                                                                    |   0.858 | `/tmp/puni-4b2/proof-observability-source.test.ts` / `refuses broad network`                                                                                                                                                                                                                                                                                                              | `/tmp/puni-4b2/source-network-host.log`           |
| source-network-duplicate      | Removed per-binding uniqueness; repeated S3 hosts accepted.                                                                                                                                               |   0.894 | `/tmp/puni-4b2/proof-observability-source.test.ts` / `refuses duplicate network`                                                                                                                                                                                                                                                                                                          | `/tmp/puni-4b2/source-network-duplicate.log`      |
| source-packet                 | Removed regenerated packet equality; altered activation flag accepted before rendering.                                                                                                                   |   0.921 | `/tmp/puni-4b2/proof-observability-source-render.test.ts` / `altered candidate`                                                                                                                                                                                                                                                                                                           | `/tmp/puni-4b2/source-packet.log`                 |
| reader-yaml                   | Removed reader YAML parser-error check; duplicate extensions keys accepted.                                                                                                                               |   0.773 | `/tmp/puni-4b2/proof-observability-reader.test.ts` / `independent yaml fault`                                                                                                                                                                                                                                                                                                             | `/tmp/puni-4b2/reader-yaml.log`                   |
| reader-schema                 | Widened filter error_mode from propagate to string; ignore accepted.                                                                                                                                      |   0.824 | `/tmp/puni-4b2/proof-observability-reader.test.ts` / `independent filter-mode fault`                                                                                                                                                                                                                                                                                                      | `/tmp/puni-4b2/reader-schema.log`                 |
| reader-identity               | Removed reader identity closure; simultaneous filelog and file_log accepted.                                                                                                                              |   0.833 | `/tmp/puni-4b2/proof-observability-reader.test.ts` / `both receiver identities`                                                                                                                                                                                                                                                                                                           | `/tmp/puni-4b2/reader-identity.log`               |
| reader-observed-target        | Removed identity/marker/namespace/immutable guard; foreign target UID accepted.                                                                                                                           |   0.836 | `/tmp/puni-4b2/proof-observability-reader-evidence.test.ts` / `independent target evidence`                                                                                                                                                                                                                                                                                               | `/tmp/puni-4b2/reader-observed-target.log`        |
| reader-observed-source        | Removed source identity/revision/readiness guard; stale source revision accepted.                                                                                                                         |   0.839 | `/tmp/puni-4b2/proof-observability-reader-evidence.test.ts` / `independent source evidence`                                                                                                                                                                                                                                                                                               | `/tmp/puni-4b2/reader-observed-source.log`        |
| reader-observed-owner         | Removed Helm owner/revision/source/readiness guard; foreign owner UID accepted.                                                                                                                           |   0.837 | `/tmp/puni-4b2/proof-observability-reader-evidence.test.ts` / `independent owner evidence`                                                                                                                                                                                                                                                                                                | `/tmp/puni-4b2/reader-observed-owner.log`         |
| reader-observed-configuration | Removed configuration owner/UID/SHA guard; foreign config UID accepted.                                                                                                                                   |   0.815 | `/tmp/puni-4b2/proof-observability-reader-evidence.test.ts` / `independent configuration evidence`                                                                                                                                                                                                                                                                                        | `/tmp/puni-4b2/reader-observed-configuration.log` |
| reader-observed-workload      | Removed workload owner/rollout/checksum/reference guard; foreign template checksum accepted.                                                                                                              |   0.826 | `/tmp/puni-4b2/proof-observability-reader-evidence.test.ts` / `independent workload evidence`                                                                                                                                                                                                                                                                                             | `/tmp/puni-4b2/reader-observed-workload.log`      |
| reader-freshness              | Removed timestamp boundary; future evidence accepted.                                                                                                                                                     |   0.798 | `/tmp/puni-4b2/proof-observability-reader-evidence.test.ts` / `refuses future and`                                                                                                                                                                                                                                                                                                        | `/tmp/puni-4b2/reader-freshness.log`              |
| reader-request                | Changed request undeclared-key policy to ignore; private credential field accepted.                                                                                                                       |   0.882 | `/tmp/puni-4b2/proof-observability-reader-evidence.test.ts` / `independent unknown evidence`                                                                                                                                                                                                                                                                                              | `/tmp/puni-4b2/reader-request.log`                |
| reader-projection             | Changed existing resource projection to ignore unknown keys; PRIVATE-MARKER projection accepted.                                                                                                          |   0.876 | `/tmp/puni-4b2/proof-observability-reader-evidence.test.ts` / `private projection and`                                                                                                                                                                                                                                                                                                    | `/tmp/puni-4b2/reader-projection.log`             |
| reader-native-volume          | Changed projected volume name from opentelemetry-collector-configmap to opentelemetry-collector-config; actual pinned kubectl returned empty config reference, breaking expected configuration assertion. |   0.356 | `/tmp/puni-4b2/proof-observability-reader-native.test.ts` / `.`                                                                                                                                                                                                                                                                                                                           | `/tmp/puni-4b2/reader-native-volume.log`          |
| parity-unknown                | Removed path/scalar boundary; unknown/subtree exception lost its intended refusal category (later authority still refused).                                                                               |   5.035 | `/tmp/puni-4b2/proof-observability-source-parity.test.ts` / `(unknown&#124;subtree) independently`                                                                                                                                                                                                                                                                                        | `/tmp/puni-4b2/parity-unknown.log`                |
| parity-unused                 | Removed equal-value exception refusal; unused exception lost its intended refusal category (later authority still refused).                                                                               |   2.682 | `/tmp/puni-4b2/proof-observability-source-parity.test.ts` / `unused independently`                                                                                                                                                                                                                                                                                                        | `/tmp/puni-4b2/parity-unused.log`                 |
| parity-duplicate              | Removed duplicate path refusal; repeated authorized exception accepted.                                                                                                                                   |   2.698 | `/tmp/puni-4b2/proof-observability-source-parity.test.ts` / `duplicate independently`                                                                                                                                                                                                                                                                                                     | `/tmp/puni-4b2/parity-duplicate.log`              |
| parity-authority              | Removed independent record/value authority check; stale supplied scalar metadata accepted.                                                                                                                |   2.712 | `/tmp/puni-4b2/proof-observability-source-parity.test.ts` / `stale independently`                                                                                                                                                                                                                                                                                                         | `/tmp/puni-4b2/parity-authority.log`              |
| parity-sibling                | Removed final non-excepted leaf comparison; new ES metadata label accepted.                                                                                                                               |   2.578 | `/tmp/puni-4b2/proof-observability-source-parity.test.ts` / `unreviewed metadata sibling`                                                                                                                                                                                                                                                                                                 | `/tmp/puni-4b2/parity-sibling.log`                |
| parity-placement              | Removed local/production pair boundary; reversed pair lost intended placement refusal category (later comparison still refused).                                                                          |    2.73 | `/tmp/puni-4b2/proof-observability-source-parity.test.ts` / `reversed placement pair`                                                                                                                                                                                                                                                                                                     | `/tmp/puni-4b2/parity-placement.log`              |
| cli-arguments                 | Removed argument count/nonempty boundary; extra argument yielded successful actual pinned CLI receipt instead of exit1.                                                                                   |   6.646 | `/tmp/puni-4b2/proof-observability-source-cli.test.ts` / `refuses arguments input`                                                                                                                                                                                                                                                                                                        | `/tmp/puni-4b2/cli-arguments.log`                 |
| cli-file                      | Disabled ENOENT classification; absent input misreported as unreadable, breaking exact category assertion.                                                                                                |   0.408 | `/tmp/puni-4b2/proof-observability-source-cli.test.ts` / `refuses absent input`                                                                                                                                                                                                                                                                                                           | `/tmp/puni-4b2/cli-file.log`                      |
| cli-json                      | Replaced fixed malformed JSON refusal with raw Error; exact input-malformed category assertion failed.                                                                                                    |   0.421 | `/tmp/puni-4b2/proof-observability-source-cli.test.ts` / `refuses malformed input`                                                                                                                                                                                                                                                                                                        | `/tmp/puni-4b2/cli-json.log`                      |
| cli-private                   | Printed String(failure); private source path leaked instead of fixed validation-refused.                                                                                                                  |   0.412 | `/tmp/puni-4b2/proof-observability-source-cli.test.ts` / `withholds source-unreadable`                                                                                                                                                                                                                                                                                                    | `/tmp/puni-4b2/cli-private.log`                   |
| source-trusted-yaml           | Removed inventory/desired YAML parser guard; duplicate inventory keys yielded successful source packet.                                                                                                   |   1.081 | `/tmp/puni-4b2/proof-observability-source-trusted.test.ts` / `trusted inventory YAML fault`                                                                                                                                                                                                                                                                                               | `/tmp/puni-4b2/source-trusted-yaml.log`           |
| source-trusted-peers          | Removed checked-in enrolled peer/API equality; changed enrolled peer10.1.0.3 accepted.                                                                                                                    |   1.024 | `/tmp/puni-4b2/proof-observability-source-trusted.test.ts` / `trusted enrolled peers fault`                                                                                                                                                                                                                                                                                               | `/tmp/puni-4b2/source-trusted-peers.log`          |
| source-retained-http          | Removed4318 from declared enrolled reader flow; expected HTTP OTLP port assertion failed.                                                                                                                 |   1.013 | `/tmp/puni-4b2/proof-observability-source.test.ts` / `enrolled flow`                                                                                                                                                                                                                                                                                                                      | `/tmp/puni-4b2/source-retained-http.log`          |
| source-snapshot-parent        | Changed snapshot patch path back to metadata/labels with absent metadata parent; parent-existence assertion failed.                                                                                       |   0.964 | `/tmp/puni-4b2/proof-observability-source.test.ts` / `snapshot patch`                                                                                                                                                                                                                                                                                                                     | `/tmp/puni-4b2/source-snapshot-parent.log`        |
| render-snapshot-patch         | Disabled only snapshot patch equality; omitted snapshot flow label patch accepted.                                                                                                                        |   1.198 | `/tmp/puni-4b2/proof-observability-source-render.test.ts` / `missing snapshot flow patch`                                                                                                                                                                                                                                                                                                 | `/tmp/puni-4b2/render-snapshot-patch.log`         |
| render-retained-http          | Disabled only network/discovery equality; missing retained HTTP ingress flow accepted.                                                                                                                    |   1.129 | `/tmp/puni-4b2/proof-observability-source-render.test.ts` / `omitted retained HTTP flow`                                                                                                                                                                                                                                                                                                  | `/tmp/puni-4b2/render-retained-http.log`          |

## Final source hashes

```json
{
  "sourceSHA256": {
    "local": "77677f87dcfba5371a85f75119695ecb2b8424067a01c7714a52c5b3aa3ba547",
    "production": "07680c61415baf2ed462d6f9c78b0bb43b1cf42e09e7d4923fcce707024efd41"
  },
  "policySHA256": {
    "local": "05396cc2cdc2a4fc8c5952767143b512017967ca97f9c7f12273fa0023917ced",
    "production": "c3fb2004c97110abe2c1cceda3f0f064f9447b9166af69c693b460e1701dcff0"
  },
  "renderedSHA256": {
    "local": "3581a51545ab0c4fb11c0b74000aee70d7c149b425001250f5f7291ff22e1890",
    "production": "2a4ac388f66e02df95182bb360072744ea7168b6a4a86382832f6640e132cb55"
  }
}
```

## Self-review and handoff

Self-review checked source/security/parity authority together, exact original projection preservation, namespace-qualified identities, role and CA references, listener migration boundaries, all five selectors, external ownership/patch parent paths, declared required flows, profile exceptions, immutable draft flags and diagnostics. It found and corrected the missing inventory parser check, enrolled HTTP4318 flow and absent snapshot patch parent. No further sweep was started after those bounded fixes; parent independent review is the next boundary.

Source-only limitations remain intentional: desired patches are unapplied; actual external network bindings, contexts, material/grants/trust, runtime route identities, CNI/host-network behavior, ECK admission/init/claim behavior, loaded reader exclusion and migration canaries, stored signals/UI/recovery remain unverified. The source supports explicit default Flux release identity only; releaseName/targetNamespace overrides refuse. External host inputs currently support IPv4/32 only.

Harness attempts rejected as proof: missing copied-test alias import; incorrect unused-exception mutation anchor; four CLI copied-entrypoint module failures; copied trusted fixture root mismatch; mutated YAML anchor/reference mismatch. Each was diagnosed from output, source restored and only the unaccepted proof rerun. Those are recorded in remaining-proofs.json, not counted among accepted proofs.

Owned implementation files: shared pinned renderer and two exports from original projection; closed projection export from preflight; source composition/network/full render/parity/CLI/receipt modules and reviewed scalar table; retained-reader configuration/observation modules; adjacent tests; project target; projections documentation; this OpenSpec verification record. No parent checklist changes.

Final normal-hook commit SHA and hook receipt will be appended to the task report after commit. The permanent verification record intentionally contains no self-referential commit SHA.

## Task4b2 fix1 — reloader flow and ES privilege review findings

1. Add TCP8080 to the existing exact namespace-local Prometheus-to-Prometheus and Prometheus-to-Alertmanager scrape flows. Other peers/ports and namespace-wide deny remain as authored. New internal `assertObservabilitySelfScrapes(namespace, resources, security)` independently binds the two KPS self-ServiceMonitors to their exact existing selectors, endpoint names, selected Services and pinned Service port/target mappings (http-web9090/9093; reloader-web8080). It requires both narrow sender egress and receiver ingress for every endpoint, using exact namespace/pod peers. It runs before generated-policy equality, so the same omission in the source factory and expected policy cannot certify itself. The named reloader target maps to8080 as a pinned source contract; actual operator-created pods and CNI behavior remain unverified. Other monitor families retain their prior checks; no wider discovery or universal live-flow claim is introduced.
2. Independently compare the rendered ES container security object with `{allowPrivilegeEscalation:false,capabilities:{drop:['ALL']}}` in both instances. The existing pod securityContext/RuntimeDefault check remains. Tests reject escalation, capability addition, removed capability drop and missing context, including the review's common ES escalation change in both placement captures before parity can succeed.

Public full-source, CLI, comparison and receipt interfaces are unchanged. The helper is an internal Fleet source-validator responsibility. No selected graph, existing client, runtime/material/readiness flag or shared generic model changed. No live operation, push, merge, cluster startup or persistent Secret change occurred.

### TDD and covering checks

- `reloader-red.log`: new source/full-render controls failed7/7 (4.53s), demonstrating missing8080 and missing independent Service/monitor validation.
- After narrow flow and independent validation changes, `reloader-green.log`:7passed/20assertions/7.12s.
- `es-red.log`:4container-policy controls plus common-profile parity control failed5/5 (6.23s); both-profile equality did not detect common weakening.
- Exact monitor selector binding also received a focused RED: empty self-monitor selector accepted (1failure,1.51s; selector-red.log).
- `es-selector-green.log`:7passed/11assertions/6.24s for ES, common-profile parity, exact selector and malformed contract controls.
- Final covering `observability-source.test.ts` and the same permanent `observability-source-render.test.ts` assertions using saved-render beforeAll:54passed,0failed,98assertions,52.641s wall/52.60s Bun. The type-only literal-key annotation correction afterward does not change those assertions or execution paths.
- Targeted parity common-policy test:1passed,0failed (see exact elapsed receipt below). The unchanged disposable-capacity test and prior parity negatives were not repeated.
- Actual chart capture refresh:changed Helm owners=[] in both placements. Only source/native security was regenerated. Final packet regeneration/full validation/comparison passed:191resources/profile,23reviewed scalar differences. No new exceptions were added.
- Typecheck initially found the new test's direction loop inferred as string; `as const` fixed the fixture indexing. Initial lint identified untyped YAML test projections; explicit test fixture shapes corrected them. Final typecheck and affected lint pass, exact commands/timings below.

Saved-capture test copies differ only in absolute imports and beforeAll loading the actual pinned local/production captures; permanent assertion code remains in the repository test files. No unchanged nine-owner render, original385-test suite, old proof batch, app/browser/fullhost gate or runtime check was repeated.

### Exact final commands and outcomes

- `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-source.test.ts /tmp/puni-4b2/proof-observability-source-render.test.ts` → exit0, 52.641s; `/tmp/puni-4b2-fix1/covering.log`.
- `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 /tmp/puni-4b2/proof-observability-source-parity.test.ts --test-name-pattern 'common ES container'` → exit0, 2.112s; `/tmp/puni-4b2-fix1/parity.log`.
- `bunx nx run tool-fleet:typecheck` → exit0, 3.303s; `/tmp/puni-4b2-fix1/typecheck.log`.
- `bunx eslint tools/tool-fleet/src/observability-source-network.ts tools/tool-fleet/src/observability-source-scrapes.ts tools/tool-fleet/src/observability-source-render.ts tools/tool-fleet/src/observability-source.test.ts tools/tool-fleet/src/observability-source-render.test.ts tools/tool-fleet/src/observability-source-parity.test.ts` → exit0, 4.568s; `/tmp/puni-4b2-fix1/lint.log`.
- `bun /tmp/puni-4b2/final-captured.ts` → exit0, 6.694s; `/tmp/puni-4b2-fix1/receipt.log`.

### R5 proofs

All temporary source mutations were restored in finally. The first row is the prerequisite dependency-fault refusal control; the next five are observed guard-removal assertion failures. Fixed-category proofs are explicitly distinguished from fail-open proofs. Adjacent Proof comments record the same observed fault and assertion beside each production check.

- **factory-fault-refused**: Dependency fault: remove8080 from both self-scrape entries in the network factory. Regenerate desired source/security using that broken factory and reuse unchanged chart captures. Both local/production full-source negatives reject with scrape-flow-absent (2passed). Command: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 /tmp/puni-4b2-fix1/factory-fault.test.ts --test-name-pattern .` → exit0, 7.329s. Log:`/tmp/puni-4b2-fix1/factory-fault-refused.log`.
- **independent-flow-guard**: Keep the broken factory from the prior control and remove the independent sender/receiver/port coverage guard. Both full-source negatives now fail did-not-throw; factory equality alone accepts the shared omission. Command: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 /tmp/puni-4b2-fix1/factory-fault.test.ts --test-name-pattern .` → exit1, 6.583s. Log:`/tmp/puni-4b2-fix1/independent-flow-guard.log`.
- **endpoint-contract-guard**: Remove independent monitor selector/endpoint and Service selector/port/target equality. Five changed endpoint/selector/port/target negatives fail did-not-throw. Command: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 /tmp/puni-4b2/proof-observability-source-render.test.ts --test-name-pattern 'reloader (monitor|service)'` → exit1, 4.013s. Log:`/tmp/puni-4b2-fix1/endpoint-contract-guard.log`.
- **scrape-shape-guard**: Remove Service/monitor/receiver parse refusal. Malformed Service ports yield an unintended TypeError instead of the fixed scrape-contract-malformed category; exact category assertion fails. Command: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 /tmp/puni-4b2/proof-observability-source-render.test.ts --test-name-pattern 'malformed scrape contract'` → exit1, 0.963s. Log:`/tmp/puni-4b2-fix1/scrape-shape-guard.log`.
- **sender-shape-guard**: Remove sender policy parse refusal. Malformed sender egress reaches later scrape-contract-malformed instead of its scrape-policy-malformed category; exact category assertion fails. Command: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 /tmp/puni-4b2/proof-observability-source-render.test.ts --test-name-pattern 'malformed scrape sender'` → exit1, 0.96s. Log:`/tmp/puni-4b2-fix1/sender-shape-guard.log`.
- **es-container-guard**: Skip only Elasticsearch container security equality. Four escalation/capability-add/capability-drop/missing-context negatives and the common weakened policy in both profiles fail did-not-throw (5failed). Command: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 /tmp/puni-4b2/proof-observability-source-render.test.ts /tmp/puni-4b2/proof-observability-source-parity.test.ts --test-name-pattern 'ES container'` → exit1, 5.114s. Log:`/tmp/puni-4b2-fix1/es-container-guard.log`.

### Final hashes

```json
{
  "sourceSHA256": {
    "local": "50f51db10af538c2af3730af454ec1bd3d52445785f9dfa38e785e5bce6a39b2",
    "production": "827683e108cf5e858e6201cc8f6727c7808de33bf8a80ddfaa01ebd6995e66f3"
  },
  "policySHA256": {
    "local": "5b882b96a9f9e319af54cb550a3fd3ec504fb8e599478e23388ff6cbd6214219",
    "production": "91882962940a843e787f12b73ec0df6e2d06facab1900ed804d180662c540272"
  },
  "renderedSHA256": {
    "local": "a8e4cc2947eed949ae663aa34c8c8791655216bade3cda77e278fd6bb445535f",
    "production": "07d15b0680481bddbebab1bb322694c0c00c62eb878303487516ad7770cc08ac"
  }
}
```

### Limits and review handoff

Full-source validation certifies declared source policy and exact comparison only. Effective authority, target observations, live reader behavior, admission, claims, CNI, stored signals/UI/recovery and activation remain false/unverified. External patches remain unapplied and client migrations remain prerequisites. Source no-escalation policy is not runtime admission evidence; chart Service target names are not proof of generated container ports or effective network routing.

Self-review was restricted to these two findings and directly related endpoint/selector/schema and common-policy controls. Both concrete reproductions now have independent source rejection paths and fresh proof receipts. No further broad review sweep was started. Final normal-hook commit SHA, hook outcomes and clean-status receipt follow after commit; parent independent review is next.

## Task 5 / canonical 2.3 — authenticated adapter source and disposable component evidence (2026-10-26)

This appends Task 5 evidence only. Earlier history and unverified runtime/live criteria remain
unchanged; canonical task checkboxes remain parent-owned. Exact commands, logs, proof lineage,
ownership and final commit are recorded in the ignored controller packet
`.superpowers/sdd/observability-environment-parity/task-5-report.md` and `task-5-evidence/`.

- Generic verified TLS/basic or mTLS bindings now serve backend queries and both producer send
  paths. Private JSON binding flags resolve trusted material before network catches; Fleet
  translates its actual declared authority/routes one way into lower transport inputs.
  Authenticated Elastic acceptance inspects complete effective rights through the same dial
  address, CA, service identity and credential as search. Only the exact two scoped health read
  patterns and no other authority are accepted. Legacy HTTP/validated SSH remains explicit
  compatibility without verified read-only authority. The evaluator/checkpoint model is
  unchanged; component provenance never claims actual WBS source observation.
- Actual Bun1.4.4 verified TLS, hostname, mTLS and credentials with real refusals. A real OpenSSL
  subprocess selected the service certificate by SNI over loopback. TLS publication retained
  acknowledgement, partial-success, redirect, body and deadline bounds; the CLI subprocess
  exercised publisher plus second sender. Missing/unreadable/malformed material refused.
- The exact owned disposable Elasticsearch9.3.8 image
  `sha256:f96812864b81e62a9ce7562c4f4bbef1186bb4e8798f814bc6a5f2b84b51b540`
  produced complete component-source health and actual self-privilege/scoped-read positives.
  Document and security-role mutations returned403 for the reader and201/200 for the same-route
  disposable admin. Granting write or manage_security made those real denial tests fail with
  201/200; exact read-only grants were restored. Removing the production authority check let
  the actual admin produce complete health and failed its negative. Persistent targets received
  no mutation, material access or credential change.
- Grafana HTTP tests refuse wrong initial Victoria type/URL, preserve sole default and owned
  inventory, and complete a second cycle with a new receipt while retaining history. The reviewed
  helper accepts bounded unique operation basenames and both current dev receipt names. The
  compiled helper/hash remain pinned; no host activation or current receipt change occurred.
- The covering run had195passed/2failed across197tests. Both failures were harness assumptions:
  first parallel query arrival order and poisoning the unrelated HTTP source. The amended ten
  tests then passed. The HTTPS-only proxy removal proof supersedes the earlier ambiguous proxy
  injection. Captured binding/source/freshness had two observed RED regressions, GREEN actual/
  legacy/runtime controls, and three focused guard-removal failures; restored snapshot tests
  passed3/3. No unchanged broad suite was repeated after fixes.
- R5 evidence separates actual fail-open failures from fixed-category refusal proofs. A raw JSON
  parser-cause injection stayed green for the selected input and is not a privacy proof. Removing
  URL redaction exposed the test credential marker; JSON contextualization has its own observed
  fixed-category proof. All source mutations restored in finally. Final checks/cleanup are in
  the Task5 report; the complete evidence does not imply a single all-green rerun of197tests.

These are adapter and disposable-component proofs. Prometheus/Grafana HTTP fixtures do not
establish deployed service parity, CNI, persistent grants/material, actual dev-source migration,
end-to-end Kubernetes stored signals/UI/recovery/snapshot restore or live activation. Those
criteria remain pending in Task6/later authorized work. No running dev unit, release pin,
persistent Secret, production resource, current receipt, shared controller or selected platform
graph changed. Full host gates were not run for this scoped source task.

### Task 5 review fix1 — complete client material (2026-10-26)

I1 now validates the entire client certificate chain and exactly one complete supported private-key
PEM object, with no unconsumed non-whitespace material. Every certificate is parsed. Directly
related REDs also reproduced extra DER objects hidden inside one PEM block; a small base64 and
top-level DER-envelope consumption check now precedes standard crypto parsing. Existing leaf/key
matching and algorithm/trust/usage policy remain unchanged. M1's publisher JSDoc now distinguishes
legacy loopback HTTP from explicitly authenticated HTTPS and retains acknowledgement versus storage.

Focused RED:3pass/9fail across12tests,1.219s. Complete-input GREEN:14pass/30assertions,1.248s.
Valid-chain and envelope controls:5pass/12assertions,1.663s. The single covering transport-file run
passes40/40,94assertions,2.851s under Bun1.4.4, including real mTLS publication using PKCS8,
PKCS1 and SEC1 client keys, leaf-plus-CA chains, whitespace and CRLF; existing TLS/hostname/SNI/
credential/deadline/acknowledgement controls remain covered. Eight new guard-removal experiments
produce ten fail-open and four fixed-category assertion failures; every source mutation restores
in finally. Two lint-only corrections are followed by four amended key-boundary passes, final
lower-project typecheck and changed-file lint. Exact commands/logs/timings and normal-hook commit
are in `.superpowers/sdd/observability-environment-parity/task-5-fix-1-report.md` and its evidence.

Only these two review findings and directly related encoding branches were changed. No unchanged
195-test suite, old proof batch, render, backend recreation, persistent material, dev unit/pin,
Grafana receipt, production/live operation or host gate ran. Earlier evidence remains historical;
all original Task6/deployment/runtime/live limitations and parent-owned canonical checkboxes remain.

## Task 6a / canonical 3.1 prerequisite — disposable source packet (2026-10-26)

This is a source stop, not completion of canonical 3.1 or 2.2. Runtime, transport and live
flags remain false. The full Task 6 reconciliation, stored-signal, CNI, recovery, history,
identity and UI obligations remain open. Parent owns the task checkboxes.

- `prepareObservabilityRehearsal` exports an exact Git input revision into temporary source,
  generates the common two-instance local candidate, preserves the ten normal Flux stages,
  replaces the legacy observability root/broad ingress, and applies diagnostics/alerts/backup
  handoffs under their original owners. The 72-file packet includes pinned charts and no
  Secret objects. Selected-tree bytes remain unchanged; no cluster or lifecycle action ran.
- `validateObservabilityRehearsal` checks exact source/generator provenance and per-file hashes,
  actual pinned kubectl Kustomize stage builds, graph dependencies/source/marker requirements,
  Helm owner/API/chart-source closure, duplicate resource identities, chart lock hashes and
  independent broad-ingress/Secret refusals. Source and generator review remain `unobserved`;
  an uncommitted generator is explicitly dirty. This receipt does not attest review authority.
- The CLI supports `prepare|validate|admit request.json packet-directory`, requires
  `PUNI_PARITY_TOOLS`, bounds request reads to 64 KiB plus an overflow byte before parsing,
  and emits fixed refusal categories. The consumed direct-download kubectl is SHA-256 checked
  against the exported toolchain lock before execution. No new tool-verification framework.
- The authored-capacity descriptor lists 13 templates totaling 130 GiB, explicitly including
  disabled values: the controller-only release retains a disabled 10 GiB Prometheus template.
  The historical selected-template lower bound is 120 GiB. Neither sum is allocated usage,
  effective operator demand, or proof that storage fits. Operator replica/init/sidecar,
  current-node writable hostPath, system/image/build scratch, backup/recovery/transient and
  coexistence demand remain unknown. Admission reuses the existing platform guard and the
  mechanically exported `readLabCapacity` reader; no floor or existing lab behavior changed.
- Fresh actual admission exits 1 in 2.36s: 15,823 MiB MemAvailable versus 16,384 MiB required,
  with 72,573 MiB free on the actual Docker-root filesystem. Prepare and validate exit 0
  in 2.82s and 2.20s. Artifact SHA-256:
  `c7d0ac32214596e78adaf1459c3a95cea5e987b17c3e509f0c5c8e00d18654a5`.
  The successful source fixture uses explicit synthetic /32 network bindings, not observed
  reachable endpoints. No unrelated workload was stopped or adopted.
- The covering rehearsal file passes 28/28 tests, 65 assertions, 33.43s. Changed-file lint and
  Fleet typecheck exit 0. Original resumed REDs and static failures remain recorded: the
  first capacity attempt exceeded Bun's default 5s timeout; the 30s retry exposed the missing
  descriptor. Initial 120 GiB/12-template assertion was corrected only after identifying
  the disabled authored template. No old render/proof/fullhost/application suite was repeated.
- Focused R5 removals: graph checks caused five fixed-category negative failures; protected
  policy/Secret/Helm checks caused five fixed-category failures while byte closure still
  refused. Removing file closure, byte hashes, provenance equality, the shared memory floor,
  and extra-argument closure each caused one observed fail-open negative. A same-version
  kubectl wrapper and oversized valid JSON were accepted before their new guards; both REDs
  and the restored positives are recorded. The initial raw-error privacy injection stayed
  green for malformed input and proves nothing; the corrected unreadable-packet injection
  exposed PRIVATE-MARKER and failed its negative. All mutations restored in finally.

Exact commands, times, logs, source/generator/per-file hashes, local commit and remaining
runtime inputs are in `.superpowers/sdd/observability-environment-parity/task-6a-report.md`
and its ignored `task-6a-evidence/` directory. Full host gates, remote publication, authenticated
source transport, actual Flux/Helm/ECK reconciliation, runtime acceptance and live binding were
not run under this source-only stop.

### Task 6a review fix1 — Secret-reference closure and selector semantics (2026-10-26)

Only the two accepted Important findings and their directly related boundaries changed.
The original Task6a source report/evidence is preserved. Canonical 3.1/2.2 and all runtime,
transport and live acceptance remain open; this is another source stop for scoped re-review.

I1: the packet now carries the exact source `externally-provided.json` metadata listing,
validated with a closed schema. Its receipt separates 51 externally supplied prerequisites
from 10 declared controller outputs and records 90 consumed Secret references with exact
namespace/name/keys. The omitted registry-auth, object-store root/TLS/CA, Velero cloud/Kopia,
retained-reader CA/trust and Flux target/decryption inputs are explicit. Certificate, ECK
and pinned monitoring-chart producers resolve controller outputs; webhook creation conditions
read actual packaged chart defaults, never guessed effective values. Independent inspection
of the actual packet runs before byte comparison and rejects undeclared native names/keys,
CA references, missing declarations, absent/ambiguous producers and disabled webhook producers.
Supported reference forms are bounded to this packet, not a general Kubernetes validator.

I2: empty `matchLabels` and `matchExpressions` are semantically unconstrained. Only equality
selectors used by the packet are supported; nonempty expressions and unknown selector fields
refuse. A supplied namespace selector must constrain namespaces, even with a narrow pod
selector. A constrained namespace may select all its pods; a pod-only peer must constrain pods.
Omitted/empty ingress remains deny-all; omitted/empty from in an allow rule still refuses.
The semantic refusal precedes file/hash checks and preserves the actual narrow-flow positive.

Focused initial RED: 13 intended finding failures plus three table-shape harness errors,
three passing controls, 17.40s. Intermediate failures identified compressed tar stdin needing
`-z`, and Flux health-check references needing distinction from embedded resource metadata.
Corrected focused controls pass 22/22, 49 assertions, 32.06s. A directly introduced declaration
metadata-shape RED and graph-diagnostic ordering RED were corrected; amended controls pass
2/2 in 5.38s. The covering amended rehearsal file passes 51/51, 115 assertions, 66.64s;
this single covering run is justified by changes to shared prepare/validate receipt and
closure behavior. Changed-file ESLint exits0 in4.81s and Fleet typecheck exits0 in2.06s.

R5: forcing the selector predicate true caused eight fixed-category failures (13.495s);
bypassing actual Secret inspection caused seven fixed-category failures (10.859s). Existing
byte closure still refused these mutations; no full fail-open is claimed. Omitting non-instance
external inventory failed the complete positive receipt assertion (6.490s); omitting controller
outputs failed its producer assertion (7.373s). All mutations restored in finally. Adjacent
Proof comments name these observations; malformed metadata initially fell only to byte hashes,
then gained the independent reference refusal. Exact RED lineage, commands and logs are retained.

Fresh source prepare including full internal validation exits0 in3.54s:73 files, artifact
`2ba60d213e343f3a3b6c2bb4a69e21fb402247a80079fd043847cc317cf543bb`.
The explicit synthetic /32 fixture bindings are still not runtime reachability evidence.
No capacity/admission observation was repeated in this fix; the earlier refusal is historical.
No old render/proof batch, full host gate, application suite, runtime/material access, source
publication, push, merge or lifecycle operation ran. The fix report and final local commit are
in `.superpowers/sdd/observability-environment-parity/task-6a-fix-1-report.md` and its evidence.

## Authorized read-only live inventory — 2026-10-26

The existing enrollment configuration at `~/.puni/fleet/2026-enroll/vars.json` and its operator key/trust files were present, regular, owner-only and owned by the current operator. Its configured root identity through the existing jump route successfully read Kubernetes without retrying the denied non-admin sudo accounts, altering grants or reading node credential files. Local kubeconfig remains empty; the remote managed context is `default`. This supersedes the basic access blocker, not the full preflight requirement. No Secret values were emitted or copied.

Observed through bounded SSH subprocesses: `k3s kubectl get nodes --request-timeout=10s -o custom-columns=NAME:.metadata.name,UID:.metadata.uid,MEMORY:.status.allocatable.memory,CPU:.status.allocatable.cpu`, namespace/CRD/pod/claim projections, and the existing `observabilityProjections.identity`, `source`, `resources` and singular Secret-key projection wrapped over each namespace list. The temporary recording caller was `python3 /tmp/puni-parity-operator-read.py <mode>`; safe timestamped receipts are retained in the controller workspace `operator-inventory/`. The helper is investigation tooling, not a replacement production preflight.

- The immutable `kube-system/puni-cluster-platform-production` marker has UID `dcd4f421-04ba-45b3-a812-0b6670ef3809` and value `platform-production`. Nodes h3mon/h4claw have UIDs `76861c62-3e25-4d79-9b09-b98b111bd1ef` / `2f713792-a370-4468-8412-129e7a492153`, allocatable memory14273444Ki /13618116Ki and8CPU each.
- `flux-system/puni-platform` UID `309c7d73-50fb-4be7-8575-d955dd3b6950` is Ready at pinned commit `584230c9e47b71cdb48e8d6397dc753e9aa93983`, artifact digest `sha256:879cf5a74050b9261df7864e8cdb9744c5b9bae184708054d1b61b618712ceec`; authentication references `puni-platform-auth`. Existing bootstrap Secret names/keynames are present.
- Root `puni-cluster` is not Ready (`HealthCheckFailed`); observability, alerts and backup are explicitly suspended. Existing cert-manager and Traefik releases are Ready. ECK/Prometheus CRDs and observation workloads are absent. The observability namespace exists; its Secret inventory and puni-backup's are empty. Dev observation namespace is absent. Registry50Gi and website2Gi claims are Bound. These are observed withheld prerequisites, not authorization to unsuspend or activate production.
- At20:39UTC, h3mon had11936MiB MemAvailable and124051MiB Docker-filesystem free;13 running Docker containers have limits totaling8192MiB (dev5632MiB plus retained2560MiB). h4claw had11730MiB available and114685MiB Docker free; its OpenHands memory/CPU limits are0, meaning unbounded rather than zero demand. Machine IDs match the checked-in inventory. Neither host meets the disposable platform-lab16GiB available-memory floor. No remote lab was attempted. The existing production-profile coexistence assessment already records overlap17670MiB against15602MiB capacity; the fresh Docker groups agree, but this is not a complete new two-instance/transient admission.

Two temporary recording failures are retained as failed attempts: `Path.open` rejected the unsupported `opener` argument, and applying the singular Secret template directly to a List produced invalid `%!q` output despite kubectl exit0. The caller was corrected to use builtin `open` and a List wrapper, then parsed the corrected JSON before retaining the metadata. The malformed outputs are not inventory evidence or a production adapter failure.

No live object, source pin, suspension, credential, volume, workload or route changed. Complete source-bound preflight, candidate/material ownership, capacity including coexistence/transients, actual Kubernetes stored signals/isolation/UI/recovery/history and live dev cutover remain incomplete.

## Task 6b source portion — authenticated binding and read-only observation (2026-10-26)

Parent-approved scope: exact-artifact Git binding and read-only reconciliation observation;
actual authenticated bootstrap handoff and full Task6b/canonical3.1 runtime acceptance remain
OPEN. No canonical checkbox changed. Base `fffc6cdef1ccad0c4f391a026c9ec25a104fbae1`.

`validateFluxPacket` invokes the existing complete packet validator and retains verified bytes
in an in-process capability. `bindObservabilitySource` authenticates Git transport with bounded
owner-only identity/trust inputs, fetches the exact external commit, and compares full repository
root closure and every blob including `rehearsal.json`. It records original source SHA, generator
provenance, artifact commit and graph path separately. Artifact root is `.`, graph root is
`./infra/clusters/platform/local`. No URL, credential bytes or invented review proof is emitted.
The bootstrap descriptor preserves `puni-platform`/`puni-cluster` and the existing prerequisite
contract; it does not execute that handoff or create Secrets.

`observeFluxReconciliation` reuses the existing lab record, creation journal, name derivation
and closed Kubernetes resource projections. It checks current daemon/immutable marker identity,
source UID/revision/digest/current generation, exact root/stage revisions and dependency graph,
nine deployed Helm histories/native source references, native/controller workloads and ECK/
Prometheus/Alertmanager children. Source, marker and daemon are reread before success; replacement
UIDs refuse. One deadline bounds reads/retries. Receipts preserve source/target/observed resource
UIDs and safe states, or a fixed failure category; exclusive synchronized creation preserves the
first receipt. Creation-journal attribution is explicitly **resourceOwnership:unproven**;
capacity admission and full runtime acceptance are not certified. No mutation path is added.

| Final command                                                                          | Fresh result                                             |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `bun test --timeout=30000 tools/tool-fleet/src/observability-flux.test.ts`             | 45 pass,0 fail,103 assertions;16.14s runner/16.171s wall |
| `bunx eslint tools/tool-fleet/src/observability-flux{,-observation,-cli,.test}.ts`     | exit0,4.982s; four explicit paths in saved command       |
| `bunx tsc --build --force tools/tool-fleet/tsconfig.json`                              | exit0,1.664s                                             |
| `bunx prettier --check` on the four files and `docs/infra/local.md`                    | exit0,0.755s                                             |
| `bunx --no-install openspec validate observability-environment-parity --strict --json` | valid,0 issues,exit0,0.962s                              |

Useful positives use actual Git fetch/upload-pack and blob reads, actual files and subprocesses,
the full CLI binding entrypoint, and pinned kubectl Go templates over a read-only loopback HTTP
fixture. Only the SSH network endpoint and Kubernetes observations are fixtures. This is not
actual remote authentication, deployment or Kubernetes acceptance. The parent's separate managed-
host Git read and live inventory are distinct evidence; this worker performed no remote operation.

Watched proofs:28 isolated mutations,all exit1,173.813s total; each restored before the next.
Removing permissions,size,exclusive receipt,parent mode,file closure,blob comparison,capability,
output cap,marker,daemon,source identity/current readiness,journal,root UID,stage current/revision,
Helm history/source,ECK/workload/child readiness or final source reread accepted the corresponding
invalid operation. Removing NOFOLLOW changed the symlink refusal category; removing NONBLOCK
blocked the actual FIFO until the1.5s harness deadline. Removing replacement detection lost its
specific category and reached later source-stale refusal. Delaying the process deadline by1s
failed the elapsed bound at1056.67ms. These distinctions are retained, not reported as uniformly
fail-open. The first raw-diagnostic experiment failed formatting only, **not privacy**; the
corrected required-packet-read experiment exposed `PRIVATE-MARKER` in raw ENOENT output and
failed the explicit non-disclosure assertion. Adjacent production Proof comments cite observed
faults. Exact commands, logs, test names and per-fault timings are retained in ignored
`.superpowers/sdd/observability-environment-parity/task-6b-evidence/`.

Failure lineage retained: missing module/CLI REDs; first binding run12pass/1fail7.16s because
mode000 correctly raised actual EACCES/input-unreadable instead of the test's permissions category;
observer15pass/13fail6.97s because ConfigMaps have no spec; corrected discrimination then exposed
fixture UID collisions across kinds (1pass/12fail6.11s). After fixing fixture UIDs,14pass/1fail9.21s
identified downstream stage mismatch overwriting source-stale diagnostics; source priority fixed.
The first kubectl projection fixture omitted HelmRelease/StatefulSet API discovery; its corrected
read-only discovery made the new templates pass. Initial lint/type issues (bounded ArkType syntax,
optional narrowed values, imports and Bun assertion typings) were corrected before final checks.

Not run: old51-test packet suite, old renders/proof batches, full host gates, wider app/browser
checks, publication, persistent credentials, cluster lifecycle, authenticated bootstrap handoff,
actual candidate reconciliation or stored-signal/UI/isolation/history/recovery acceptance. Full
budget, complete created-resource identities, actual material/network prerequisites and owned
candidate remain unresolved. Read-only binding/observation adds no admission override; the
unchanged16GiB mutation floor and existing admission refusal remain binding. The controller's
artifact digest is observed; this source portion verifies fetched Git blobs, not a separately
downloaded source-controller archive. Actual deployed chart/CRD/native compatibility and complete
runtime readiness still require the original full acceptance path.

CLI usage and managed-host execution assumptions are in `docs/infra/local.md`. Source execution
needs a complete implementation checkout/Git metadata with the original source commit, matching
generator revision/bytes, Bun dependencies, Git/tar/SSH/ssh-keygen and pinned kubectl. The artifact-
only branch cannot run the CLI, and a standalone compiled binary is not implemented.

### Task 6b fix round1 — condition freshness and stable attribution (2026-10-26)

Base `5d473d4cb271a8d5fc370aea1847a02050d3c311`; only the three accepted Important
findings from the scoped review and their directly related controls are changed. Full Task6b,
authenticated bootstrap execution, ownership/capacity admission and canonical3.1 runtime
acceptance remain OPEN. No canonical checkbox changes.

I1: Prometheus/Alertmanager use their condition-level generation, preserving the reused generic
resource projection's absent-root value0. The Fleet adapter requires **both Available and
Reconciled to be True at the current metadata generation**. A fresh unrelated Ready condition
cannot substitute for either. Confirmed the condition fields in the two committed CRDs from
`infra/platform/charts/kube-prometheus-stack-91.4.1.tgz` using `tar -xzOf ...` plus focused `rg`
reads; no chart render was run. The operator's [status-subresource contract](https://prometheus-operator.dev/docs/proposals/implemented/status-subresource/)
explains these two conditions. The existing pinned-kubectl/HTTP fixture now projects supported
monitoring shapes without invented status-root generation and supplies those real projected
resources/states to the production observer. Four current CRs pass; eight stale/unhealthy
Available/Reconciled cases refuse despite a fresh unrelated Ready condition.

I2: Source and target requests are structured-cloned after validation and before the first
await, following the existing preflight decoder boundary. A controlled SSH fixture pause lets
the real Git fetch begin against A before the caller changes its URL to B; the binding remains
attributed to A. A target mutation during Docker observation cannot substitute a foreign marker,
and the failure receipt preserves the original target UID.

I3: The first nonempty child identity set is pinned per parent UID (kind/namespace/name/UID).
Every later complete resource snapshot checks that set before readiness filtering, so a renamed
replacement or disappeared child refuses even if its parent has become unready. An initially
empty set can acquire its first children; once attributed, later additions, disappearance or
replacement refuse. This is observation consistency, not creation ownership or rollout authority.

Focused RED/GREEN: initial6fail/0pass7.846s exposed false monitoring currentReady and the wrong
repository attribution hash. Corrected realistic monitoring fixtures also caused initial target/
child negatives to reach the known native-generation blocker; those initial categories are not
reported as isolated exploit proofs. I1 passed1 test/61assertions10.626s; I2 passed2 tests6.459s;
initial I3 controls passed3 tests6.231s. A directly related unready-parent disappearance control
then failed6.014s (resource-unready instead of child-identity refusal), revealing readiness
filtering still masked continuity. Moving the check before that filter passed in6.266s. There
were no failed harness/tool attempts in this round; these failed runs are retained as their
actual production/control lineage.

Nine new mutations were watched, all exit1, total59.014s; each restored before the next.
Removing any of four condition status/generation checks produced currentReady:true for its
stale/unhealthy fixture. Bypassing the observer's monitoring gate accepted stale readiness.
Removing the source snapshot emitted B's hash after fetching A; removing the target snapshot
accepted the substituted marker. Removing child-set continuity accepted a renamed replacement;
disappearance controls instead reached later bounded readiness refusals (fixed-category proofs).
Pinning an initially empty set broke the valid first-appearance positive. Adjacent Proof comments
name the observed failures. Only these new proof cases ran, not the earlier28-proof batch.

| Final command                                                                          | Fresh result                                             |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `bun test --timeout=30000 tools/tool-fleet/src/observability-flux.test.ts`             | 51 pass,0 fail,164 assertions;20.36s runner/20.409s wall |
| `bunx eslint` on the three amended Flux files                                          | exit0,5.015s                                             |
| `bunx tsc --build --force tools/tool-fleet/tsconfig.json`                              | exit0,1.853s                                             |
| `bunx prettier --check` on those files                                                 | exit0,0.494s                                             |
| `bunx --no-install openspec validate observability-environment-parity --strict --json` | valid,0issues,exit0,0.844s                               |

This was the single necessary covering pass for the amended adapter and corrected shared fixture,
not an unchanged45-test rerun. The earlier packet51-test/render/proof/fullhost/app/browser batches
were not repeated. Exact commands/logs/timings and proof script are in ignored
`.superpowers/sdd/observability-environment-parity/task-6b-fix-1-evidence/`.
Actual adapter SSH authentication, candidate Kubernetes deployment, bootstrap/material/network
handoff, complete ownership/full capacity, stored-signal/UI/isolation/history/recovery acceptance
remain unverified and required. No managed-host operation, live credentials, source publication,
cluster lifecycle, push, merge or branch switch occurred. Generic Fleet observations and the
existing CLI/full-checkout assumptions are unchanged. Parent scoped re-review follows the normal
hook fix commit and source stop.

### Task 6b fix round 2 — initial-unready child attribution (2026-10-26)

Scoped re-review accepted I1/I2 but retained the initial-unready I3 path. The first snapshot
contained stale parent P and child A; the next contained current P and renamed/replaced child B.
First attribution previously followed the parent's readiness continue, so B was accepted.
The first nonempty child set is now attributed for each expected native parent before readiness
filtering or continuity checks. Empty-to-first appearance remains allowed; attributed sets still
refuse disappearance/replacement. This is read-only observation consistency, not creation ownership.

The exact new regression failed before the change: `Expected refusal but operation resolved`
(0 pass/1 fail, 6.170s wall). The focused child family then passed 5/5 tests and 5 assertions
(6.88s runner/6.916s wall): renamed replacement, disappearance, later-unready disappearance,
initially-unready replacement, and legitimate first appearance. Its command was
`bun test --timeout=30000 tools/tool-fleet/src/observability-flux.test.ts --test-name-pattern 'attributed controller child|initially absent controller child|initially unready parent'`.
The new RED and mutation selected only `--test-name-pattern 'initially unready parent'`.

R5: moving attribution back after readiness reproduced the same false acceptance (exit1,
6.147s wall). The production file was restored byte-for-byte before static checks. The adjacent
Proof comment identifies the moved-attribution fault. No test-harness failures occurred; the two
failing test runs are the intended baseline RED and watched production-path mutation. Final
document formatting initially failed (0.516s) on an extra blank line in the appended section;
Prettier corrected it (0.310s), without changing prior evidence. Final formatting was rechecked.

Fresh amended-path checks: `bunx eslint` on `observability-flux-observation.ts` and
`observability-flux.test.ts` passed (4.107s); `bunx tsc --build --force tools/tool-fleet/tsconfig.json`
passed (1.548s); `bunx prettier --check` on those files passed (0.648s);
`bunx --no-install openspec validate observability-environment-parity --strict --json`
passed with zero issues (0.765s). Exact commands/logs/timings and the proof script are retained in
ignored `.superpowers/sdd/observability-environment-parity/task-6b-fix-2-evidence/`.
No unchanged 51-test suite, earlier 9/28 proofs, schema work, render, full-host or app/browser
checks were repeated. I1/I2 source, CLI arguments and full-checkout/runtime-file assumptions are
unchanged. Normal-hook source commit and original reviewer's scoped re-review follow.

Full Task6b/bootstrap handoff/canonical3.1 remain OPEN: actual adapter authentication against a
published candidate, complete creation ownership and capacity admission (including the unchanged
16GiB floor), material/network prerequisites, actual candidate Flux/Helm/ECK readiness, stored
signals/UI/native health/isolation/history and outage/backup/recovery acceptance remain required
and unverified here. No live, remote, credential, lifecycle, publication, push or branch operation
occurred. Resource ownership remains unproven; fixture results are component evidence only.

### Task 6c — normal Flux API ordering prerequisite (2026-10-27)

At base `24622cd5025c1fb00b70932ccf439d4a5bf50de1`, the generated application stage
mixed the sole ServiceMonitor CRD provider with four native consumers. This is the pinned
Flux/SSA source prediction documented in `flux-order-research.md`, not a measured live failure.
The approved shape adds exactly `flux-system/observability-controllers`, rooted at
`./infra/platform/observability/rehearsal-controllers`, moving only
`observability/prometheus-controller`. It inherits platform/certificates dependencies,
GitRepository/puni-platform, platform-local-kubeconfig, SOPS/sops-age, prune, wait:true and
20m timeout. Observability keeps platform/certificates and gains the controller-stage edge.
The stage waits for the actual HelmRelease through normal Flux health checking; custom health
expressions cannot override this stage's built-in health semantics. ECK and application
HelmRelease dependencies, downstream alerts/backup, service/claim identities and pins stay intact.
No selected `infra/` source file changed.

The earlier policy stage creates observability; its generated namespace document also creates
observability-dev. Both platform and certificates transitively depend on policy/secrets;
the new stage preserves that chain. Existing KPS Helm hooks produce kps-admission TLS;
the disabled Prometheus/Alertmanager workloads do not introduce an early material consumer.
Global default denies cover wbs/workers/website-dev, not the operator namespace; application
policies select application pods. No concrete cycle was found in callers and saved pinned-chart
material. No operator networking changes were made. The cost is one extra health-gated stage
and an explicit reference contract for the two inspected directories.

Changed interfaces are `dependencies`, `buildPacket`, `requireGraph`,
`requireProtectedResources`, new `requireControllerOrder`, and `validateBuilds` in
`tools/tool-fleet/src/observability-parity-rehearsal.ts`; and `expectResources` in
`tools/tool-fleet/src/observability-flux-observation.ts`. Existing public functions/CLI arguments
are unchanged; receipts now enumerate 11 stages, and the observer expects 12 Kustomizations
including puni-cluster. The readyObservations fixture, stage paths/dependencies, sole controller
Helm owner and relocated webhook-producer fault fixture moved together. Previously accepted
monitoring condition freshness, source/target snapshots and child continuity code are unchanged.

Actual packet validation first checks regular-file/symlink provenance, then inspects only packet
Map entries under infra, using explicit relative Kustomize resources. Absolute/remote/escaping,
duplicate/missing references and transforms outside apiVersion/kind/resources refuse; no external
loader or filesystem reference resolution runs in that inspection. It requires one early provider,
no application-stage provider and exactly two native monitors per namespace. A separate literal
main-stage dependency invariant does not trust the factory dependency table. File/path/hash safety
ordering remains intact; actual pinned kubectl Kustomize builds run after trusted bytes and check
controller-only output, exact stage closure, global duplicates and combined Helm owner closure.

The prepared CLI packet from the exact base source has 75 files, artifact SHA-256
`cab20a253675a437e9f2e32b5be740233a757c0bcb5ac6f00a7246f0059c03ad`.
Source and generator revisions both identify the base; generator dirty:true/reviewStatus:unobserved
truthfully records amended, uncommitted generator bytes. This is a source-only sample, not a
published artifact. It contains nine Helm identities split 1 early/8 application, 51 external
Secret declarations, 10 controller Secret declarations and 92 references. Authored template
accounting remains 13 claims/133120 MiB, includes disabled templates, and does not admit capacity.
The unchanged 16384 MiB floor still cannot authorize unknown full-stack/coexistence demand.
The early pinned Kustomize output is one document/no ServiceMonitor, SHA-256
`2f01254e8bc7cb6cc75a14287fcddb968ddc0ad670815d179521b308c8d6f662`;
application output is 86 documents/eight HelmReleases/four ServiceMonitors, SHA-256
`f53b3ae53e93b7c920e6460026baa9515bf1f21bcd3dfb9bf2ba1a82f48a44b0`.
The moved controller's exact bytes match the saved Task6a packet:
`e131e26cfcbfd1a03e16f27e7168b0c917221d5470effb11c55e45a374c6814a`.
The saved packet is older source 9d08fb1; its separately absent external declaration inventory
file is prior source work, not an extra controller-stage change. All shared application/native
and remaining release files compare unchanged with that saved packet.

TDD/focused commands and measured wall times:

- `bun test --timeout=30000 tools/tool-fleet/src/observability-parity-rehearsal.test.ts --test-name-pattern 'controller barrier builds'`: RED 0/1, missing new stage, 3.385s.
- `bun test --timeout=30000 tools/tool-fleet/src/observability-parity-rehearsal.test.ts tools/tool-fleet/src/observability-flux.test.ts --test-name-pattern 'controller barrier|observes exact source'`: initial 11 pass/1 fail, 18.464s. The same-stage fault fixture copied instead of moving its provider, so the existing Secret producer guard refused first. Correcting the fixture to move the sole provider yielded 19/19, 38 assertions, 28.768s.
- `bun test --timeout=30000 tools/tool-fleet/src/observability-parity-rehearsal.test.ts tools/tool-fleet/src/observability-flux.test.ts --test-name-pattern 'controller barrier|observes exact source|packages exact two-instance|same revision and generator|source receipt inventories|prepare preserves the selected|packet file closure refuses|complete packet receipt|Secret reference closure refuses webhook-producer|CLI prepare and validate'`: one selected covering pass, 33/33, 105 assertions, 61.020s. It covers exact graph/determinism, file closure, CLI bridge, claim accounting, full material inventory and the relocated webhook producer; old45/51 suites were not rerun wholesale.
- `bun test --timeout=30000 tools/tool-fleet/src/observability-parity-rehearsal.test.ts --test-name-pattern 'matching broken-factory bytes without'`: further independent-edge RED, 0/1, 8.699s, factory/expected bytes both omitted the edge and child exit0 exposed false acceptance. Added the literal edge invariant.
- Final focused command above: 24/24, 44 assertions, 39.689s, after the edge invariant and typed YAML/Bun-expect corrections. It includes unready controller-stage/Helm, wrong-stage path/owner, prehash wait/dependency/timeout/health override, same-stage provider, extra consumer, missing monitor and bounded reference controls.

Seven distinct watched R5 controls restore production files byte-for-byte. Semantic-category
proofs: bypassing prehash membership loses nine expected early categories (16.457s);
bypassing requireGraph changes the four new stage-contract refusals to hash refusals (8.952s);
bypassing the empty actual build guard changes that refusal to Helm owner closure (7.660s);
omitting the new directory from release-path protection changes a foreign namespace to Secret
closure (4.925s corrected proof). These are not fail-open claims. Fail-open proofs: forcing the
observer's controller Helm owner back to observability accepts the wrong owner (5.990s);
bypassing both order guards accepts matching same-stage broken-factory bytes (7.358s);
removing the independent edge check accepts matching missing-edge factory bytes (7.431s).
The final edge-only restored regression passes 1/1, two assertions, 6.496s. Adjacent Proof comments
name the faults. Matching-factory controls execute modified copies of the real production module,
so prepare and validation regenerate the same bad expected bytes; they do not mock validation.

Failed attempts/limits: initial same-stage fixture error is recorded above. The first early-path
proof harness expected an ordering diagnostic but observed the earlier existing Secret closure;
its assertion failed (4.669s), was corrected, then the watched production negative passed.
Initial ESLint failed 20 localized new-test diagnostics (6.491s) and typecheck failed YAML generic/
unknown annotation errors (2.160s). Precise YAML schemas, parsed-document callback inference and
existing Bun rejects style fixed these; final lint/typecheck passed. One edge-proof log filename
collided with its outer runner log; the same single mutation/restored regression was recaptured
under distinct names (first pair 10.020s/8.452s; retained pair 7.431s/6.496s), without a broader
rerun. Logs, scripts, receipts and exact mutation replacements live in ignored
`.superpowers/sdd/observability-environment-parity/task-6c-evidence/`.

Fresh amended-path static commands: `bunx eslint tools/tool-fleet/src/observability-parity-rehearsal.ts tools/tool-fleet/src/observability-parity-rehearsal.test.ts tools/tool-fleet/src/observability-flux-observation.ts tools/tool-fleet/src/observability-flux.test.ts`
passed (5.454s); `bunx tsc --build --force tools/tool-fleet/tsconfig.json` passed (1.375s).
The final source hashes are recorded below. Final formatting/strict OpenSpec and normal-hook
commit receipts follow in the task report; no success is inferred for unrun checks.

Final source/test SHA-256:

- `tools/tool-fleet/src/observability-parity-rehearsal.ts`: `b92db8f2318ea77bd8f17304f973c3cc7e1f8e0ed7b638af4614727aaa94a859`.
- `tools/tool-fleet/src/observability-parity-rehearsal.test.ts`: `25580c6bba354a0ecb1a5e652d294453de23e693b7ef7af63d9998ee5962fe8b`.
- `tools/tool-fleet/src/observability-flux-observation.ts`: `f4e4fc50b35d92cb744b05bb3a71bcdb3ea329afe16fb603116aade3c9c5baf6`.
- `tools/tool-fleet/src/observability-flux.test.ts`: `9e6743caf4aeaff8ebb5d0dcf78de7ca7b50a509c97a7e3367b7dd74efb4fd79`.

This completes only the bounded source ordering prerequisite pending independent review.
Canonical3.1, full Task6b handoff and runtime acceptance remain OPEN. Actual empty-cluster Flux
must still prove the controller stage Ready and the ServiceMonitor CRD Established before main
reconciliation. Full creation accounting/ownership, capacity, authenticated real binding,
material/network/CNI, stored signals, operator UI, history, outage/recovery/backup and live
acceptance remain required and unverified. Kustomize and fixture success cannot prove them.
No unchanged chart rendering, prior45/51/proof batches, full-host gate, app/browser test, live/
cluster/remote operation, real credential access, source publication/push/merge or branch switch
ran. Dev and withheld production source/observation/alerts/backup were untouched. No canonical
checkbox changed. Normal-hook source commit and SOURCESTOP for fresh independent review follow.

Final Task6c source format check passed (0.632s) on the four amended TS files and verify.md; `bunx --no-install openspec validate observability-environment-parity --strict --json` passed with zero issues (0.230s); `git diff --check` passed (0.010s). The final mutation restoration hashes match the four source/test hashes recorded above. Normal-hook source commit is the next step; full runtime acceptance remains OPEN.

## h3mon sizing clarification — 2026-10-27

The disposable platform profile16GiB available-memory floor and120GiB active claim configuration are rehearsal inputs, not a direct h3mon purchase specification. The120GiB includes50GiB registry and20GiB local MinIO; h3mon's permanent observability placement does not automatically inherit those70GiB. The raw authored descriptor130GiB also includes a disabled10GiB template.

A fresh read-only host/Docker sample at2026-10-26T22:11:11UTC reported11965MiB available memory,124043MiB Docker-filesystem free,13 running containers with8192MiB total memory limits and3179.17MiB Docker-reported usage. This is a single sample, not a peak or admission proof. Existing retained service bounds total2560MiB; current dev Compose bounds5632MiB. No workload or resource limit was changed.

Saved pinned-render/source arithmetic, with one replica per service, both shared operators, retained services and historical host reserves assigned to h3mon:

| Scenario                                                | Request-based planning subtotal | Limit-based planning subtotal |
| ------------------------------------------------------- | ------------------------------: | ----------------------------: |
| Replacement dev, old Compose stopped and data retained  |                         9366MiB |                      11008MiB |
| Same with old dev Compose overlap                       |                        14998MiB |                      16640MiB |
| Future separate dev and production, old Compose stopped |                        16214MiB |                      18944MiB |

These are incomplete declared subtotals, not upper bounds or actual measured consumption: generated containers, transient work and placement-dependent platform/backup services remain unresolved. The pinned operator currently declares config-reloader memory bounds0 and admission Jobs with resources{}; these cannot be budgeted as zero. The existing workload/preflight models should consume actual effective bounded pods; no second capacity implementation is needed. Kubernetes [requests and limits](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) differ from observed usage.

New observation claims are25GiB for dev and115GiB for retained production (including its100GiB ES policy),140GiB if both are placed there. Claims are capacity inputs, not used bytes; retained history/images/scratch/headroom require their own accounting. The earlier17670MiB/2068MiB-shortfall calculation uses a production/platform/backup profile and must not be relabelled dev-only. Source arithmetic/provenance is retained in the controller's h3-sizing.md and fresh safe sample in operator-inventory/h3-usage.json. Actual placement and a complete finite budget remain open; no resize or disk upgrade was recommended or performed from the rehearsal figures.

## Actual authenticated artifact binding — 2026-10-26

The unchanged production `observability-flux-cli.ts bind` at source/generator
`1568080d0080645eca97c1864a6966e7100e4999` successfully fetched the actual SSH repository's
artifact commit `2a63a99f2005eb9770695f11e5dbcba4f10ad703` using the existing managed-host
repository identity and strict configured host trust. This supersedes the previous
unverified **actual binding** item only; the full bootstrap handoff remains open.
The packet uses synthetic explicit network inputs, so this is a transport/source component
proof and cannot certify runtime endpoint bindings, Flux reconciliation or live deployment.

Reproduction inputs and retained evidence:

- Input source and generator: `1568080d0080645eca97c1864a6966e7100e4999`, generator dirty:false;
  source/generator review status remains `unobserved`, as emitted by the implementation.
- Packet: 75 source files plus `rehearsal.json`, SHA256
  `cab20a253675a437e9f2e32b5be740233a757c0bcb5ac6f00a7246f0059c03ad`.
  Preparation took 4.624s in a clean frozen auxiliary checkout. The existing plaintext-secrets
  scanner passed all76 exported files before publication.
- Artifact ref: `feat/observability-parity-source-1568080`, exact commit above, separately
  published and freshly confirmed by `git ls-remote`. The implementation ref is distinct:
  `feat/observability-parity-implementation`. Draft successor PR
  [760](https://github.com/Prosperous-Unification/puni-00/pull/760) is open; planning PR747
  remains merged. Neither feature ref has been merged to main by this work.
- Existing h4 Docker daemon `29d09ed4-aac6-483f-94d8-8eb3ff56f3ec`; credential-free client image
  `sha256:9e93caaaa37dbc3777219bc8314cdf5d050f1dc1d5b04109a1f279f37dea37f1` derives from the
  already-cached Bun1.4.4 image. It contains Git/SSH installed only inside the temporary client.
  Pinned kubectl's59572386 bytes matched
  `8b8f088da2dab964f853b38464033b1be15ede2839eca751482357c45abdd05a` locally and remotely.
- Exact binding command inside the isolated client:
  `PUNI_PARITY_TOOLS=/tools bun tools/tool-fleet/src/observability-flux-cli.ts bind /request.json /proof/binding.json`.
  Source/packet/request/tools and the existing managed identity/trust were read-only mounts;
  private scratch/receipts were writable. Root filesystem was read-only; all capabilities
  dropped; no-new-privileges,1GiB memory,1CPU,256PIDs and bounded private tmpfs were applied.
  No Docker socket, kubeconfig, other host credentials or cluster operation was available.
- Runtime client `ce2bdb25d2628ff46aece4005c880deb9c70a3f4743bb550e4b95417f0dca63f` started
  at23:11:36UTC. Its receipt observedAt23:11:48.300Z; process exited0/noOOM. Every fetched file,
  complete root closure and provenance matched. Parsed CLI stdout equals the exclusive receipt.
  Receipt retains51 external prerequisites, `bootstrap.handoffExecuted:false`,
  `runtimeAcceptance:false`, `liveBinding:false`, and `trustReview:external-prerequisite-unverified`.
  A successful operation does not establish globally read-only credential privileges or human review.
- Safe complete receipt is retained at the owner-only existing-host workspace
  `/var/tmp/puni-parity-source-binding-i482sq0n/proof-binding/binding.json`; local safe summaries
  and helper lineage are in this change's ignored controller workspace. No key value was copied
  to the local machine or committed. The adapter's own scratch copy existed only in client tmpfs.

The verification harness encountered and preserved intermediate failures. An initial Python
file-open API error was corrected before packet creation. Docker omits optional image
`Config.Volumes`; actual read-only evidence confirmed absence before the capability probe was
corrected. The network-disabled/no-mount cached-image probe then proved Bun/tar/sh present and
Git/SSH/keygen absent; its exact creator ID was removed. `/tmp` was RAM-backed with7699MiBfree,
so the unchanged2GiBavailable/8GiBfree client guard refused staging there. Actual `/var/tmp`
was ext4 with114411MiBfree and11188MiB available memory; staging there succeeded9.491s.
Neither the platform16GiB floor nor the client guard was reduced.

The first two credential-free preparers exited100 at apt cache/group-file permissions.
Targeted logs identified the failures. Only the third credential-free preparer received
DAC_OVERRIDE/CHOWN/FOWNER for these container-local filesystem operations, with all other
capabilities dropped, and completed apt plus frozen Bun install with scripts ignored, exit0.
The later credential client dropped ALL capabilities. No host package/permission change.
The first image-commit wrapper exited without a receipt and its raw diagnostic was not retained;
its outcome/cause remains unproved, with no guessed cleanup. A separate recorded PID/start-time
worker durably captured the successful image commit's exact ID and exit0 in103.164s. These are
harness failures and preparation evidence, not production-adapter failures or runtime acceptance.

At23:13:11UTC, all four exact recorded stopped preparer/runtime container IDs were checked
against original image/operation/daemon/exit identities and removed using `docker rm <ID>`
without a volume flag. Their expected exits were100/100/0/0. No volume, retained history or
unrelated workload was removed. Private source/receipt workspace and the credential-free client
image remain for reuse. No persistent Secret, h3mon resize, production source/stage, dev route,
production activation or final merge changed. All previous unproved full Kubernetes, CNI,
resource budget, stored-signal, UI, isolation, history/recovery and actual dev criteria stay open.

### Existing draft CI failure awaiting focused repair

DraftPR760 infra run40415555161/job121896859657 failed122 Fleet tests. The fetched existing
log, retained locally as `/tmp/puni-pr760-fleet-check.log`, proves cold CI lacks the hardcoded
`/tmp/puni-parity-tools/kubectl` used by new packet/Flux beforeAll and related render tests.
The existing `check` target provisions tools after its test dependencies. Other observed failures
compare plain CLI prefix/equality with Nx/FORCE_COLOR-decorated child stderr. These require a
focused portability fix reusing the locked installer and preserving actual refusal/privacy
assertions. No check was skipped, no failing run rerun and no CI selection/permission/merge policy
changed. Other CI jobs were partly in progress at the last observation; no all-green claim.

## Task 19 / 6d — creation-accounting seam and actual app component

The existing lab runner now has explicit `--resource-evidence creation-v1` creation and
receipt-consuming teardown. `lab.json` v1 and dev-env decoding remain unchanged. Strict up
reserves fresh `c` plus15 lowercase hexadecimal IDs; legacy commands refuse that namespace
unconditionally, including after binding deletion. This prevents downgrade, not establishes
ownership; the compatibility cost is reserving that rare legacy ID pattern. The consumer is
`readLabCreationResources(directory, state, labId, profile)`. Closed version1 resources are
owner-only, exclusive, fsynced, sealed by exact file set/hash and bound to a ready attempt,
local Unix Docker endpoint and daemon. The full rehearsal must consume this contract later.

Creation starts a bounded safe event witness before direct network creation and requires that
returned ID's actual network-create event before proceeding. Pinned private k3d debug is parsed
for actual full creator IDs; raw logs/configuration never enter receipts or diagnostics. Stream
failure aborts the active creator. Permanent container/image/network/mount identity closes
against exact inspection. Every serial tools creator remains recorded; tools already destroyed
by normal pinned startup require matching create/mount/destroy events plus final exact-ID
absence, explicitly without post-destruction inspection. Named cache remains enabled. Tools
image anonymous volumes refuse because pinned tools cleanup removes them. All named/anonymous
volume associations remain weaker locators and are retained, never deletion authority.

Teardown revalidates complete attachments and exact resources before bounded owned-container
signals/removal and exact network removal. It uses no k3d delete or volume-removal flags; all
state/journals/volumes remain. This is cooperative noninterference for a fresh attempt on a
trusted daemon; unrelated actors remain independent. There is no atomic inspect/delete or
hostile privileged daemon-writer guarantee. Partial failures retain global uncertainty.

Focused final covering command:

```sh
bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/creation-resources.test.ts tools/tool-fleet/src/k3d-creation.test.ts tools/tool-fleet/src/k3d-resource-runtime.test.ts tools/tool-fleet/src/k3d-resource-caller.test.ts tools/tool-fleet/src/k3d-lab.test.ts tools/tool-fleet/src/k3d-creation-journal.test.ts
```

102pass/0fail,295 assertions,34.52s. Six files cover new storage/parser/witness/consumer seams,
existing runner callers and direct creation journal controls. R5 removed26 production guards,
observing each focused negative fail, and separately injected file/directory fsync failures,
observing the positive existing-runner control fail before direct creation (0.969s each).
The actual caller cancellation RED additionally exposed omitted AbortSignal wiring before GREEN.
Faults include full-ID/event parsing, image/network/volume closure, retention/seal/exclusivity,
ready journal, daemon, reserved namespace, locked tool bytes, reuse, temporary volumes,
handshake, private output bound, active cancellation, teardown attachments/identity and
forbidden volume removal. Every mutation was restored before the covering run. The first
network-attachment mutation survived a second volume guard; the fixture was isolated to a
foreign endpoint without mounts and the targeted mutation then failed in2.568s. It was not
counted as proof until isolated. Exact commands/timings and limitations are retained in the
ignored task-6d report and four task6d-r5 summary files.

Actual component used Docker29.7.2/API1.55, endpoint `unix:///run/docker.sock`, daemon
`c53d8955-62b8-43fe-8277-2d63f606e418`. Initial preflight state `c02dc23cb6f79470` failed
JSON decoding before any Docker resource creation; real safe Go-format projections exposed a
missing closing brace. The subprocess fixture now renders the actual supplied format. The
focused existing-runner control failed before correction, then passed in3.08s. Optional image
Config.Volumes absence was modeled from actual read-only evidence.

Fresh actual admission at2026-10-26T23:14:30.480Z observed14101MiB available memory/65539MiB
Docker disk against unchanged app4096/12288MiB floors. Baseline10 containers/5 networks/44 volumes.
Exact existing CLI commands, with private output:

```sh
env PATH="/tmp/puni-parity-tools:$PATH" K3D=/tmp/puni-parity-tools/k3d KUBECTL=/tmp/puni-parity-tools/kubectl DOCKER_CONFIG=/tmp/puni-parity-tools/docker-config bun tools/tool-fleet/src/k3d-lab.ts up --profile app --worktree-root /home/df/.codex/worktrees/aa39 --resource-evidence creation-v1
env PATH="/tmp/puni-parity-tools:$PATH" K3D=/tmp/puni-parity-tools/k3d KUBECTL=/tmp/puni-parity-tools/kubectl DOCKER_CONFIG=/tmp/puni-parity-tools/docker-config bun tools/tool-fleet/src/k3d-lab.ts down --profile app --id cfc0820dab7a49fa --resource-evidence creation-v1
```

Up exit0 in89s, empty stderr; app node Ready/bundled Traefik Available. Lab
`cfc0820dab7a49fa`, attempt `9a70200b-ec6c-4a86-ae20-6b20735573d6`,135 safe events and ready
journal; consumer read succeeded. Full creator-returned IDs:

| Resource                          | ID                                                                 |
| --------------------------------- | ------------------------------------------------------------------ |
| Network                           | `ba26708bf069935681514339318bfa844030422f65dab604af40c747fed5b961` |
| Registry                          | `e916b0e15605c1a8282bb444b0018d64e59dc3b766c407e8aba7087e696bde1a` |
| Server                            | `0ef5e57f55950f16543288c580f0144f53cff1df2d08074280b931a5c2df686b` |
| Serverlb                          | `dddfd37f83cdb1930f74bde87062aa75ea7794aada4054773051ce7a93c13022` |
| Tools, already normally destroyed | `8abd90f9666f7783dccdd474783bfee53311e033f14ea48dbc69f44910ae9e6c` |

First down refused before any stop/removal or teardown marker. Read-only comparison proved only
server mount ordering differed. Focused permutation RED/GREEN retained all fields/counts;
four permutation/foreign-network/replaced-image/missing-volume controls passed in8.64s. Down
retried the SAME owned receipt, no new lab: exit0/empty stderr. Teardown-to-removed marker
interval5.904758269s (not full command wall time). All stops forced:false; registry exit2,
server/serverlb exit143 after intentional SIGTERM, not claimed successful application exits.

Final exact comparison at23:23:07.651Z: original container/network ID-name sets10/5 unchanged;
all44 original volumes plus these6 retained with identical Name/Driver/Mountpoint/CreatedAt:

- `6b1e1a80e67510dc2979daa6c3d5a4319159b4a691f2af5d2f8695d21e7ee052`
- `f7062298ec4d988eba9e2a492bcd2ee15c50981764bfbf2b6a165ba35c4ba3db`
- `4f119caa4a8ca506f8030b32abd656a5d31a2dd4fdb0ce26aab6c59865b920c3`
- `00b3899a4262e7aa57572a15ed697919b0c36f3202707ddedb17a7ac9d917fc4`
- `c684d0bd8345c051ccc072604ca9bb4b7efcbda066cd6d8f387f51deb0b446b8`
- `k3d-puni-cfc0820dab7a49fa-platform-images`

Private state, kubeconfigs, resources, journal, stop records and removed marker remain. Safe
summaries/source hashes are retained in ignored `task-6d-evidence/`; the actual up preceded the
mount comparison correction and final source commit, with per-file hashes recorded. No successful
component rerun after comments/style changes. No unrelated workload, shared Docker configuration,
h3mon sizing, live route/service or storage changed. No platform services ran under app.

Affected Fleet typecheck `bunx tsc --build --force tools/tool-fleet/tsconfig.json` passed.
Full host/Nx/app/browser gates and unchanged old45/51 suites/charts were intentionally not rerun.
Existing draft CI failures above remain queued separately. This proves only the local creation
accounting component: full bootstrap/authenticated Kubernetes handoff, complete capacity,
source-to-runtime binding, shared signals/CNI/UI/isolation/history/recovery and actual dev
migration remain OPEN. Checkboxes/publication remain parent-owned.

Final changed-file ESLint passed; Prettier left all source files unchanged and formatted this
verification append. `bunx openspec validate observability-environment-parity --json` passed
with zero issues (20ms validator duration). `git diff --check` passed. Normal commit hooks
provide the final staged-file format/lint/secrets/private-nesting/tool-wiki checks.

## Task 19 / 6d review fix 1 — isolated refusal proofs

Review base `cc4e8db2b615cb1e3c6d5cc746284c64b5460fbc`. Eight new existing-CLI negatives
isolate endpoint drift on the same daemon; volume locator drift and an external volume consumer
on another network with permanent container/network observations unchanged; temporary final
presence/reappearance without conflicting attachments; and each missing temporary create,
mount or destroy event with creator ID and other lineage intact. They assert exact refusal
reason/nonzero exit, absent completion/teardown marker, unchanged teardown fixture inventory,
and no Docker kill/stop/rm/delete. Existing refusal cases now also reject the actual `kill`
signal command. The earlier missing-volume mount deletion proves only container comparison;
it is not credited as the new volume teardown proof.

Initial focused command:

```sh
bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/k3d-resource-caller.test.ts --test-name-pattern 'isolates|without legacy fallback|without any cleanup'
```

16pass/0fail/137assertions,31.30s. Then each matching production refusal was separately replaced
with `void 0;`, restoring source in finally. Each fixture operation incorrectly exited0 and its
negative test failed; no earlier guard masked the intended boundary. Eight R5 commands share:

```sh
bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/k3d-resource-caller.test.ts --test-name-pattern '<pattern>'
```

| Removed refusal          | Pattern                              | Observed test exit | Seconds |
| ------------------------ | ------------------------------------ | ------------------ | ------- |
| endpoint-equality        | `isolates endpoint-drift`            | 1                  | 2.739   |
| volume-locator-equality  | `isolates volume-locator`            | 1                  | 2.722   |
| volume-consumer-equality | `isolates volume-consumer`           | 1                  | 2.766   |
| temporary-final-absence  | `isolates temporary-present`         | 1                  | 1.686   |
| temporary-reappearance   | `isolates temporary-reappeared`      | 1                  | 2.696   |
| temporary-create         | `isolates temporary-missing-create`  | 1                  | 1.609   |
| temporary-mount          | `isolates temporary-missing-mount`   | 1                  | 1.583   |
| temporary-destroy        | `isolates temporary-missing-destroy` | 1                  | 1.55    |

The temporary lifecycle guard was independently removed for each create/mount/destroy case;
volume equality independently for locator/consumer. Adjacent production Proof comments record
these observations. Exact commands/logs retained in ignored task-6d-evidence/fix1 and the appended
fix1 report. This round changes tests/comments only. No real app rerun, prior102-test suite or
prior26-fault batch; six retained volumes/private evidence remain untouched. Non-app builder
and direct-import lifecycle accounting remains a later concrete obligation, with no platform
acceptance granted. Full bootstrap/runtime/capacity/shared-stack/CNI/signals/UI/history/recovery
and live migration remain open.

Restored final focused caller command:
`bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/k3d-resource-caller.test.ts`
passed23tests/178assertions/0fail in39.79s, including success controls for the modified subprocess
fixture and all strengthened refusal cases. `bunx tsc --build --force tools/tool-fleet/tsconfig.json`
and `bunx eslint tools/tool-fleet/src/k3d-resource-caller.test.ts tools/tool-fleet/src/k3d-resource-runtime.ts tools/tool-fleet/src/k3d-creation.ts`
passed. Production changes are adjacent comments only; behavioral guards remain intact.

## Task 20 — portable observability test tools and deterministic CLI fixtures

Base `346e7314d1a4a8ded83f090ae0cd2138ab3aa3c9`; source wrapper only. The actual
PR760 infra run `40415555161`, job `121896859657`, failed 122 tests before its
check provisioning phase (`/tmp/puni-pr760-fleet-check.log`). The cold runner lacked
`/tmp/puni-parity-tools/{kubectl,helm}`; inherited Nx `FORCE_COLOR=1` also changed
Bun diagnostics at strict refusal assertions. This restores the existing verification
contract without changing production validators, task selection or workflow policy.

`observability-tools.fixture.ts` calls `contracts.readToolchain`,
`check-provision.toolCacheDirectory/installLockedTool/assertToolVersion` and
`check-cli.runChecked` for kubectl (raw binary) and Helm (`linux-amd64/helm`). It
copies optional canonical archive seeds into process scratch, then lets the unchanged
installer verify the lock checksum, download absent/changed bytes, extract and probe
real tools. A per-cache Promise shares that installation across test files. Shared
archives/extracted trees are never mutated. Missing optional seeds install; unreadable
seeds fail explicitly. There is no `PUNI_PARITY_TOOLS` test override; deliberately
invalid production paths remain direct validator inputs, with no fallback. The
controller ruled against adding publication/locking machinery: fully cold processes
download two locked tools once, and later independent check provisioning can download
again when the canonical cache is empty. This measured cost remains explicit.

Seven consumers now use this fixture: full renderer, source renderer/parity/CLI,
packet, Flux and native retained-reader tests. The substituted kubectl shell fixture
also uses the provisioned executable. Production version/hash/chart/owner guards and
explicit invalid-tool negatives remain intact. Existing projection-render wrong-version
and chart-digest negatives were not changed or rerun in this slice.

`cli.fixture.ts` supplies `FORCE_COLOR=0`, `NO_COLOR=1` only to preflight, source CLI,
backup identity/trust, Flux CLI and packet factory child-process fixtures, preserving other environment
fields. Outputs are not transformed. Exact reason/status/stdout/private-marker assertions
are unchanged; the new payload test retains arbitrary ANSI/private-marker bytes exactly.
The actual CI cold-restore test passed and was left unchanged.

### TDD and fault lineage

- Before implementation, `bun /tmp/puni-task20-red.ts` called the actual full Helm
  renderer with a fresh absent tools directory: exit 1 in 0.68s, `ENOENT` at the Helm
  spawn. `/tmp/puni-task20-cold-red.log` and the reproducer are retained.
- Restored cold positive:
  `PUNI_TOOL_CACHE=/tmp/puni-task20-cold-cache FORCE_COLOR=1 bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-render.test.ts`
  passed 4 tests / 6 assertions in 21.05s, with real downloads and nine-owner rendering;
  `/tmp/puni-task20-cold-green.log`. This cache started absent; the fixture does not
  publish into it. Warm archive-seeded installation/cache-reuse regression initially
  passed in 559.46ms and verifies unchanged executable inode and another process's
  shared-extraction sentinel. The default fixture setup was shared in the covering run.
- Parent's unchanged preflight assertion already reproduced color RED under
  `FORCE_COLOR=1` (0.582s) and control GREEN under `FORCE_COLOR=0 NO_COLOR=1` (0.394s);
  `/tmp/puni-ci-color-{red,control}.log`. Those unchanged diagnostics were not repeated.
- New cache-error boundary proof: temporarily ignore copy errors, run
  `FORCE_COLOR=1 bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-tools.test.ts --test-name-pattern unreadable`.
  The mode-000 seed incorrectly caused a successful real installation; the EACCES
  expectation failed (1 failure, 12.90s). Source was restored in `finally`;
  `/tmp/puni-task20-cache-removal.log`. Adjacent `Proof:` names the injected fault.
- New CLI boundary proof: temporarily remove the environment overrides, run the same
  prefix with `tools/tool-fleet/src/cli.fixture.test.ts --test-name-pattern 'exact safe refusal'`.
  The real source CLI's raw ANSI output failed exact equality (1 failure, 550ms),
  restored in `finally`; `/tmp/puni-task20-color-removal.log` and adjacent `Proof:`.
- The unchanged installer's existing download-digest proof in `check.test.ts` remains
  the proof of that guard. This slice additionally checks that changed cached kubectl
  bytes are replaced by actual locked bytes before execution, then probes the real tool.
  Existing absent/failed explicit tools and same-version wrapper refusals are retained.
- Initial fixture run had 4 pass / 1 fail because directory-copy unreadability was
  incorrectly expected as `EISDIR`; Bun reported `ENOTSUP`. Replaced that diagnostic
  assumption with an actual mode-000/EACCES case; focused GREEN exited 0 in 0.79s.
  `/tmp/puni-task20-fixtures.log` retains the failed harness. Initial ESLint rejected
  awaiting Bun's void-typed matcher; the test now explicitly awaits the operation's
  rejection value, and the removal proof was refreshed against that final assertion.

### Scoped verification

The one covering pass ran:

```sh
FORCE_COLOR=1 bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/cli.fixture.test.ts tools/tool-fleet/src/observability-tools.test.ts tools/tool-fleet/src/backup-identity.test.ts tools/tool-fleet/src/backup-s3-trust.test.ts tools/tool-fleet/src/observability-flux.test.ts tools/tool-fleet/src/observability-parity-rehearsal.test.ts tools/tool-fleet/src/observability-preflight.test.ts tools/tool-fleet/src/observability-reader-native.test.ts tools/tool-fleet/src/observability-render.test.ts tools/tool-fleet/src/observability-source-cli.test.ts tools/tool-fleet/src/observability-source-parity.test.ts tools/tool-fleet/src/observability-source-render.test.ts
```

Observed **411 pass / 6 fail, 417 tests across 12 files, 1017 assertions, 309.70s**;
`/tmp/puni-task20-covering.log`. All real-tool/cache/render/reader/integrity and preflight
checks passed. Restoring the tool setup exposed six additional ANSI failures formerly
masked by the absent-tool beforeAll: Flux malformed/FIFO/private-packet CLI refusal
cases and three packet injected-factory exact refusal cases. The same environment helper
was applied at those boundaries, including the adjacent Flux positive CLI fixture;
no assertions or production behavior changed. This extends the helper's callers to Flux
and the packet factory-injection subprocess fixture.

Only these changed cases were rerun:

```sh
FORCE_COLOR=1 bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-flux.test.ts tools/tool-fleet/src/observability-parity-rehearsal.test.ts --test-name-pattern 'CLI refuses malformed private|actual FIFO input|CLI hides private paths|CLI binds a validated packet|controller barrier rejects'
```

Observed **7 pass / 0 fail, 119 filtered, 19 assertions, 23.52s**;
`/tmp/puni-task20-covering-fix1.log`. All six previous failures and the changed positive
are green. The other 411 passing tests were not broadly repeated; this is deliberately
not reported as a fresh all-green 417-test run. Warm fixture installation in the covering
run took 1120.37ms; changed-cache repair took 10279.09ms with an actual verified download.

Static validation:

- `NX_DAEMON=false bunx nx run tool-fleet:lint`: exit 0, 27.6s;
  `/tmp/puni-task20-lint.log`. Nx's Node process emitted its existing
  FORCE_COLOR/NO_COLOR precedence warning; no lint failures.
- `NX_DAEMON=false bunx nx run tool-fleet:typecheck`: exit 0, 3.2s;
  `/tmp/puni-task20-types.log`.
- After the two new CLI fixture callers were amended,
  `bunx eslint tools/tool-fleet/src/observability-flux.test.ts tools/tool-fleet/src/observability-parity-rehearsal.test.ts`
  exited 0, no diagnostics; `/tmp/puni-task20-lint-fix1.log`.
  The same Fleet typecheck target exited 0 in 1.9s;
  `/tmp/puni-task20-types-fix1.log`.
- `bunx openspec validate --all --json`: exit 0, 294/294 artifacts;
  `/tmp/puni-task20-openspec-all.json` (wall timing not captured).
- `bunx openspec validate observability-environment-parity --strict --json`:
  exit 0, 1/1, no issues; artifact validation 21ms;
  `/tmp/puni-task20-openspec-scoped.json`.
- Optional, unrequired `bunx openspec validate --all --strict --json`: exit 1,
  152 pass / 142 warning-or-info-only failures in unchanged artifacts, primarily long
  requirements. The observability change was valid with no issues. Those unrelated
  warnings were not edited or rerun; `/tmp/puni-task20-openspec.json`.
- All 14 changed/new TypeScript files were formatted with Prettier. Final format,
  whitespace and normal-hook commit evidence are recorded in the Task20 handoff report.

No full host gate, full Fleet check/controller build, previous complete render/fault/runtime
batch, application/browser suite or CI rerun was performed. There were no live Docker,
cluster, remote, credential, route, volume, push or merge operations. Canonical completion
remains 4/11, full 3.1 runtime/platform accounting and live migration remain open. This
slice restores source verification portability; it does not certify runtime or CI success.
Fresh scoped source review remains required after the normal-hook commit.

## Task22 — workspace CI integration closure (2026-10-27)

Base `cf9ed1d5b754ea09751a9d940ed988529fd2c025`, isolated aa39 worktree on
`feat/observability-parity`; sole implementer. This bounded source/docs repair is
separate from queued Task21 OCI transport. No production code or CI policy changed.
Canonical completion remains 4/11; full 3.1 runtime/platform/resource/import and live
migration acceptance remain incomplete.

Actual failed lineage: PR760 run40415555168/job121897014120, artifact12699121863;
retained full log `/tmp/puni-pr760-workspace-full.log`. Workspace CI failed after
68m20s across 52 projects/137 tasks with zero cache hits. Lines4237–4326 show five
parity-render exact stderr failures from inherited color; the same run found the
removed historical Elasticsearch link and five undeclared outside reads. This
receipt closes those observed source failures locally, not the complete CI run.

Focused REDs against unchanged existing oracles:

```sh
FORCE_COLOR=1 bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-observability-stack/src/configuration/parity-render.test.ts --test-name-pattern 'malformed lock JSON syntax'
bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-devsync/src/workspace-targets.test.ts --test-name-pattern 'names every file a suite reads'
bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-devsync/src/repo-namespacing-handoff.test.ts --test-name-pattern 'every routed current document resolves'
```

Each exited1 for its intended assertion: color 0pass/1fail/249ms with raw ANSI
bytes; inputs 0pass/1fail/2.19s naming exactly backup-identity plus four
observability paths; documents 0pass/1fail/663ms naming the absent
`elastic/production/elasticsearch.yaml`. Logs `/tmp/puni-task22-{color,inputs,doc}-red.log`.
These restored failing dependencies prove the unchanged existing guards can fail.
No new production safety guard was introduced; no assertions or oracle policy were weakened.

Changes: the parity-render fixture sets `FORCE_COLOR=0, NO_COLOR=1` at its only
child boundary, preserving other environment fields and raw stderr/status assertions;
no reverse Fleet test dependency or output transformation. The dated assessment now
separates its October21 production description from the current shared
`elastic/base/elasticsearch.yaml` definition retaining the same values. Exact
observability:test inputs name its runbook, failure fields, collector and agent;
`default`/`^production` remain present. Deploy:test now explicitly names its backup
identity subprocess while preserving namedInputs.default's production dependency.

Native Nx proof: `NX_DAEMON=false bun /tmp/puni-task22-hash.ts` uses
`createProjectGraphAsync`, `InProcessTaskHasher.hashTask(...,true)` and actual
`hash.inputs.files` for both test targets. Before: all four observability paths
absent; deploy backup-identity already present via namedInputs.default. After:
all five present. Thus four actual cache-input gaps were repaired; deploy's change
repairs the existing explicit-reader oracle contract, not a previously missing hash.
Logs `/tmp/puni-task22-hash-{before,after}.log`; final probe exit0,0.51s before /
0.52s after. Initial disposable probe failed module resolution because Nx places
exports under `dist/src`; corrected the probe import, without changing repo source.

One coherent covering GREEN:

```sh
FORCE_COLOR=1 bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-observability-stack/src/configuration/parity-render.test.ts tools/tool-devsync/src/workspace-targets.test.ts tools/tool-devsync/src/repo-namespacing-handoff.test.ts --test-name-pattern 'actual renderer adapter|names every file a suite reads|every routed current document resolves'
```

Observed13pass/0fail/39filtered/25assertions/5.17s;
`/tmp/puni-task22-covering.log`. Includes all11 renderer refusals (all five exact
stderr assertions) plus the existing complete outside-read and routed-link oracles.
No private fixture values were printed and no refusal/privacy assertions changed.

Static checks: `NX_DAEMON=false bunx nx run tool-observability-stack:lint` exit0,
7.90s wall/6.6s Nx; owning typecheck with the same prefix exit0,1.30s wall/495ms Nx.
Logs `/tmp/puni-task22-{lint,types}.log`. Lint printed Node's existing
FORCE_COLOR/NO_COLOR precedence warning, no lint failures.
`bunx openspec validate --all --json`: exit0,294/294,1.01s wall;
`bunx openspec validate observability-environment-parity --strict --json`:
exit0,1/1,noissues,0.44s wall/22ms artifact. Logs
`/tmp/puni-task22-openspec-{all,scoped}.json`. Five-file `bunx prettier --check`
passed,0.39s wall; `git diff --check` passed, no diagnostics. Format log
`/tmp/puni-task22-format.log`. Normal-hook commit receipts are recorded in ignored
`task-22-report.md`; this entry and canonical tasks/spec were reviewed without
marking runtime obligations complete.

Deliberately unrun: prior passing417Fleet/102creation suites, full Nx/host gates,
full application/browser/component-runtime suites, real Helm/kubectl reconciliation,
CI rerun and runtime/live acceptance. No Docker/cluster/remote, persistent credential,
route, volume, push, merge or deployment operations occurred. Fresh scoped review
remains required after SOURCESTOP.

## Reviewed CI repair and main integration checkpoint

Task22 source `b308f4f162da9db8dde30dba53f72f8ae7917acc` received independent scoped review: compliant/approved, no Critical or Important issues. The pre-existing lint colour-environment warning remains disclosed and deferred to final review. Full CI and runtime acceptance are not certified by that review.

Fresh `git fetch origin main` completed successfully; main remained `67773f97ac5c608bd785f5ff5619cc0f053779e2`. Normal-hook `git merge --no-edit origin/main` integrated it into the feature branch at `6bf4b8bc1972db0f6fc3fc9edd6ac6a09d81e2f9`; no conflict or main mutation. The only overlapping path, `docs/wiki-policy/policy.json`, merged disjoint changes. Diffs against both parents prove the feature's shared Elasticsearch consumer path and main's fixture exclusions/evidence metadata are retained. `git diff --check HEAD^1 HEAD` exited0; status was clean.

Main relocated the unchanged observability runtime fixture and updated its test import. The focused merged-tree check `bun test --timeout=10000 tools/tool-observability-stack/src/dev/runtime.test.ts` passed56tests/99assertions in1.062s. This tests the fixture import and existing runtime adapter behavior through controlled boundaries; it is not an actual deployment. Prior passing Task19/20/22 batches were not repeated because main changed no corresponding implementation or inputs. The full gate will observe the published merged head separately; no all-green claim.

Source/component evidence remains distinct from full Kubernetes rehearsal and real dev acceptance; canonical completion remains4/11. The existing app-profile creation/retained-volume teardown and authenticated source-binding components do not close full platform capacity, bootstrap/import, generated-Pod, history/recovery or live rollout requirements. Final implementation merge, production activation and persistent credential changes remain separately authorized.

## Task21 — verified prebuilt object-store handoff

2026-10-27, source base `85794eb02868b7521e852966d663f06cae3a7b34`, existing isolated aa39 worktree. Preserved the controller's four uncommitted proposal/design/spec/tasks amendments. This is a source/bootstrap prerequisite; 3.1 remains open. No agents, push, image build, actual image import, Docker/cluster mutation or repeated full gate/lab was used.

The existing `runLab -> upLab -> bootstrapLab -> preparePlatformObjectStore -> importObjectStore` path now requires up-only absolute `--object-store-archive` for strict non-app attempts. Ordinary build callers and app behavior retain their contracts; meaningless archive flags refuse. The private capture happens inside the creating attempt before witness subscription and the first direct Docker creation. Its attempt inputs record Git HEAD, exact committed toolchain/build-lock hashes and the independent OCI/archive identity. Modified source locks refuse before creation; source/generated packet provenance is not inferred from an image digest. Existing positional bootstrap injection slots and `lab.json` v1 remain unchanged.

`object-store-archive.ts` accepts one bounded simple-ustar OCI layout: maximum 128 MiB, 32 unique members, 1 MiB per parsed metadata member, 1 manifest and 1–16 layers. It checks header checksums, NUL tails, octal sizes, bounds/padding/termination, exact paths/types, actual manifest/config/ordered layer SHA256 and sizes, linux/amd64, OCI references and optional Docker compatibility selectors; unreferenced blobs refuse. Only raw directory spellings `blobs/` and `blobs/sha256/` are accepted. No extraction, path normalization, implicit `dist` selection, controller Docker-load reuse or fallback build was added. The output pin is checked; upstream minisign/build provenance remains the existing build contract and is not re-certified by reuse.

The retained archive/receipt are created exclusively under a 0700 directory with 0400 files. Each strict import reopens bounded retained bytes and checks its whole hash before stdin. `witness.requireNode` consults only captured in-progress creator IDs, rechecks the captured daemon and exact node name/configured image/network, and returns the full ID. `docker exec -i <ID> ctr -n k8s.io images import -` consumes those bytes; source and digest-alias target checks use the same ID. Completion/sealing still occurs after bootstrap; names, archive receipts and partial state grant no teardown authority.

### Actual existing archive control

`git diff --exit-code -- infra/versions/toolchain.json infra/versions/object-store.json` exited 0. `bun /tmp/task21-actual-archive.ts` called the production capture/read functions only, then hashed the original again. Final capture took 111.679 ms; capture plus retained-read/original-source control took 240.582 ms. No Docker, import or build command ran. The source was preserved, and the retained file is `/tmp/task21-verified-object-store-UlpEEi/object-store/image.oci` (0400), with its sibling `archive.json`; safe summary `/tmp/task21-actual-archive.json`.

| Identity/account                              | Observed value                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Archive bytes                                 | 52,857,344                                                                                        |
| Archive SHA256                                | `ec86717cd36acd1415443b9fa4e52db14c8c15bf607e5160149858aee89ade1c`                                |
| Locked manifest                               | `sha256:6892027e04ff9f75ad83dcff7f459b8cdfa043ac573a9d88a616bd7803890670`                         |
| Config                                        | `sha256:814c467f9909d74a438727489ca76f1a15f6b431d6f5b1b4a41b9b4f5ba93eed`                         |
| Layer 1                                       | `sha256:034d6572bf287fa79604fee9be062f0683809ae3a3685bc7b0e17bd1c48c50e8`, 2,206,402 bytes        |
| Layer 2                                       | `sha256:2336feaa98bfd45e7d318a7fa039d8df895dedf02eb10034728f54fd71cf3dc9`, 50,640,035 bytes       |
| Platform                                      | `linux/amd64`                                                                                     |
| Per read/import archive buffer                | 52,857,345 bytes (including size-change sentinel)                                                 |
| Parsed metadata bytes                         | 2,987                                                                                             |
| Combined control process observed maximum RSS | 633,480 KiB; includes Bun, validation and repeated full-file controls, **not** an admission bound |

The retained copy costs the full archive plus its metadata/state while the original remains. Per-node compressed layer content is 52,846,437 bytes before config/manifest/index/store overhead; deduplication is not assumed. Verification heap, import overhead, unpack/snapshot and full runtime demand remain explicitly unknown in the receipt. The later existing full evaluator must account for state and Docker filesystems, simultaneous buffers/overhead, per-node copied content and unpack/transients, preserve the independent platform/fleet floor, and compare effective runtime closure. This receipt cannot admit the full two-instance rehearsal.

### Focused commands and outcomes

All test commands use Bun 1.4.4 with `--preload ./tools/test/scratch/preload.ts --timeout=30000` from the assigned worktree. The executable Docker/k3d/kubectl doubles never contact a live daemon. No full Fleet, application, browser, build, Task19/20/22 or host gate was repeated.

| Command after `bun test`                                                                                                                                                                                                                                                                                                                      | Fresh outcome and scope                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tools/tool-fleet/src/object-store-archive.test.ts tools/tool-fleet/src/object-store-import.test.ts tools/tool-fleet/src/object-store-image.test.ts tools/tool-fleet/src/k3d-object-store.test.ts`                                                                                                                                            | 71 pass / 0 fail, 507 ms. Existing authenticated-build/import/alias and positional bootstrap/app compatibility plus the then-current archive cases. Before the raw-directory amendment below.                                                                |
| `tools/tool-fleet/src/k3d-resource-caller.test.ts --test-name-pattern Task21`                                                                                                                                                                                                                                                                 | 24 pass / 0 fail, 24.41 s. Existing strict platform caller positive, pre-first-create artifact/committed-lock refusals, exact-node/daemon/import/source/alias failures and original-path substitution control. Before the added two retained-identity cases. |
| `tools/tool-fleet/src/object-store-archive.test.ts tools/tool-fleet/src/k3d-resource-runtime.test.ts --test-name-pattern 'Task21\|changed source length\|refuses.*archive before distribution'`                                                                                                                                               | 48 pass / 0 fail, 619 ms; includes six in-progress creator lookup cases, changed fstat length and selected archive negatives.                                                                                                                                |
| `tools/tool-fleet/src/object-store-archive.test.ts tools/tool-fleet/src/k3d-resource-caller.test.ts tools/tool-fleet/src/creation-resources.test.ts --test-name-pattern 'Task21 direct\|Task21 rejects\|Task21.*archive-retained\|Task21.*import-retained\|refuses (index-multiple\|docker-multiple\|manifest-shape\|many\|padding) archive'` | 9 pass / 0 fail, 2.57 s; added retained-copy corruption and retained-lock mismatch refuse before exec/Flux; closed receipt-schema and handoff negatives.                                                                                                     |
| `tools/tool-fleet/src/object-store-archive.test.ts`                                                                                                                                                                                                                                                                                           | 51 pass / 0 fail, 489 ms after the exact raw-directory correction and corrected zero-layer fixture; includes unsafe/duplicate/type/padding paths.                                                                                                            |
| `tools/tool-fleet/src/object-store-archive.test.ts tools/tool-fleet/src/k3d-resource-caller.test.ts --test-name-pattern 'refuses index-(json\|utf8) archive\|Task21 strict platform caller'`                                                                                                                                                  | 3 pass / 0 fail, 2.51 s. Added malformed JSON/UTF-8 plus the single actual-format strict caller positive. No unchanged caller suite repeat for the directory fix.                                                                                            |
| `bunx eslint` on the ten changed Fleet source/test files                                                                                                                                                                                                                                                                                      | Exit 0, no diagnostics, after observed Proof comments/import sorting.                                                                                                                                                                                        |
| `bunx nx run tool-fleet:typecheck`                                                                                                                                                                                                                                                                                                            | Exit 0; final Nx duration 1.4 s, uncached (earlier focused typecheck also passed at 1.5 s).                                                                                                                                                                  |
| `node_modules/.bin/openspec validate observability-environment-parity --strict --json`                                                                                                                                                                                                                                                        | Exit 0, 1 change passed, 0 failed/issues, validation 13 ms. Bare `openspec` was absent; the installed repository binary was used.                                                                                                                            |
| `git diff --check`                                                                                                                                                                                                                                                                                                                            | Exit 0. Final formatting and normal-hook commit outcome are recorded in the handoff report.                                                                                                                                                                  |

### Failure lineage and corrected proof fixtures

Initial new-module TDD could not import the not-yet-created archive module. The next feature assertions failed for missing stdin import, missing import identity enforcement and missing required request input. A checksum fixture initially wrote the byte already present (a no-op); changed it to an actual different checksum byte. The first caller fixture lost the required image `role` when replacing a test image object; preserved that field. Integration then exposed the closed inputs schema rejecting the new archive field; added its explicit optional, validated shape rather than weakening unknown-key rejection.

Keep all three masked proof-fixture attempts distinct from production defects: (1) the first many-members case hit an earlier invalid-path check, so removing the count guard still passed; use unique allowed SHA256 paths and assert the count refusal; (2) the first padding offset altered the next header, so it was corrected to the actual body-padding byte; (3) the first zero-layer manifest fixture still shipped an unreferenced layer blob, so removing the layer-minimum check remained refused; remove that blob and keep compatibility layers empty. Each corrected case passed baseline and failed its named isolated guard fault. None of these initial fixture mistakes proves a production refusal boundary.

The first actual-archive read/copy attempt found a separate production format mismatch and refused before copy or daemon mutation: Python tar member inspection had displayed directory names without trailing slashes, while the raw archive headers contain `blobs/` and `blobs/sha256/`. Raw header inspection established that difference. The validator and fixtures now accept exactly those raw spellings, with no general normalization or alternate-alias tolerance; the amended archive cases and actual copy control above passed.

### R5 watched faults

Each row below was a sequential temporary production mutation, a named focused test run with nonzero exit and a failed test, then unconditional restoration of the original source. Tests of missing/invalid metadata/ownership also require the specific contextual refusal; they do not claim every weakened check would bypass all later defenses. The fstat test breaks the actual filesystem metadata dependency in a subprocess. Adjacent `Proof:` comments name the observed negative/positive control. No mutation remains in source.

Commands: `python3 /tmp/task21-guard-faults.py` (36 caught, 16.044 s summed test durations), `python3 /tmp/task21-extra-guard-faults.py` (4 caught, 1.057 s), `python3 /tmp/task21-metadata-faults.py` (2 caught, 0.739 s). Safe outcome logs: `/tmp/task21-{guard-faults,extra-guard-faults,metadata-faults}.json`. These local scripts/logs are supplementary; this permanent table and the committed production-path tests carry the proof record.

| Injected production fault                | Observed test                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Remove regular-file refusal              | non-regular source negative failed; mutant exit 1                                  |
| Remove archive size limit                | oversized sparse source negative failed; mutant exit 1                             |
| Remove read-length comparison            | injected fstat size drift negative failed; mutant exit 1                           |
| Remove tar terminator validation         | nonzero terminator negative failed; mutant exit 1                                  |
| Remove tar member cap                    | corrected many-members negative failed; mutant exit 1                              |
| Remove header NUL-tail check             | ambiguous-name negative failed; mutant exit 1                                      |
| Remove octal validation                  | explicit invalid-octal refusal negative failed; mutant exit 1                      |
| Remove header checksum check             | checksum negative failed; mutant exit 1                                            |
| Remove simple-ustar header check         | header-prefix negative failed; mutant exit 1                                       |
| Remove unique/allowed path check         | duplicate-index negative failed; mutant exit 1                                     |
| Remove member type check                 | symlink-member negative failed; mutant exit 1                                      |
| Remove member bounds/padding check       | corrected padding negative failed; mutant exit 1                                   |
| Remove truncated terminal refusal        | explicit truncated-input negative failed; mutant exit 1                            |
| Remove required-member refusal           | named missing-index negative failed; mutant exit 1                                 |
| Remove metadata size bound               | oversized config metadata negative failed; mutant exit 1                           |
| Remove locked index selector comparison  | foreign-reference negative failed; mutant exit 1                                   |
| Remove actual blob hash/size check       | same-size altered-layer negative failed; mutant exit 1                             |
| Remove manifest media type check         | manifest-media negative failed; mutant exit 1                                      |
| Remove Docker compatibility comparison   | wrong ordered Docker layer selector negative failed; mutant exit 1                 |
| Remove unreferenced-blob closure         | unreferenced SHA256 blob negative failed; mutant exit 1                            |
| Remove retained whole-byte identity      | retained corruption before import negative failed; mutant exit 1                   |
| Drop source O_NOFOLLOW                   | symlink source negative failed; mutant exit 1                                      |
| Widen index platform schema              | arm64 index negative failed; mutant exit 1                                         |
| Omit config platform validation          | arm64 config negative failed; mutant exit 1                                        |
| Omit OCI layout validation               | missing-layout negative failed; mutant exit 1                                      |
| Remove strict import ID check            | node-name import negative failed; mutant exit 1                                    |
| Remove archive/import lock comparison    | mismatched import identity negative failed; mutant exit 1                          |
| Replace ctr creator ID with node name    | retained-archive import positive failed exact-ID assertions failed; mutant exit 1  |
| Force buildObjectStore on prebuilt path  | strict platform caller positive failed; fake executable only failed; mutant exit 1 |
| Remove committed-lock comparison         | edited source build-lock caller negative failed; mutant exit 1                     |
| Remove required archive request check    | strict missing-archive parser negative failed; mutant exit 1                       |
| Remove request scope/absolute-path check | relative archive parser negative failed; mutant exit 1                             |
| Remove in-progress creator refusal       | named missing-creator lookup negative failed; mutant exit 1                        |
| Remove node projection comparison        | foreign creator-name lookup negative failed; mutant exit 1                         |
| Omit import-boundary daemon recheck      | changed-daemon caller negative before Flux failed; mutant exit 1                   |
| Widen archive evidence to unknown        | malformed/private receipt negative before persistence failed; mutant exit 1        |
| Widen index manifest cardinality         | index-multiple negative failed; mutant exit 1                                      |
| Widen Docker manifest cardinality        | docker-multiple negative failed; mutant exit 1                                     |
| Remove manifest layer minimum            | corrected zero-layer manifest negative failed; mutant exit 1                       |
| Remove missing retained handoff refusal  | direct strict bootstrap negative; fake builder attempted failed; mutant exit 1     |
| Normalize away trailing JSON junk        | index-json negative failed; mutant exit 1                                          |
| Disable fatal UTF-8 decoding             | index-utf8 negative failed; mutant exit 1                                          |

### Remaining acceptance

No actual strict archive import/unpack was performed; stdin compatibility is source/API-derived and exercised through exact executable doubles only. [containerd's primary import implementation](https://github.com/containerd/containerd/blob/v2.1.5/cmd/ctr/commands/images/import.go#L166-L176) consumes `-` from stdin; this is API evidence, not proof of the pinned k3s runtime. Installed Bun type declarations establish the stdin runner input. No publication or new signature/human-review claim is made.

Full source-bound cold-start admission, non-app complete resource/transient closure, actual fresh Kubernetes/Flux/CNI reconciliation, three stored signals and operator views, history/restart/recovery/Velero/Kopia and live readiness remain open. The independently reviewed app seam, earlier full gate/build/lab and Task22 CI work were not repeated. Published-PR CI still belongs to base85794eb02 and is controller-owned; its separately diagnosed shallow-history test is outside Task21. No live credentials, persistent stores, image caches or unrelated resources changed.

## Task23 — parent-independent receipt provenance negative

Base `37dd3b7f7f392c658181dd344a932735052ea605`. Published `85794eb02` infra-check `40464152905`, Fleet job `122055439425`, is the authoritative RED: retained `/tmp/puni-pr760-fleet-857.log` reports 1401 pass, 7 skip, 1 fail, 4185 assertions across 73 files, 376.43 s. The only failure was the old stale-source negative at lines 189–194: `/provenance/` was expected but `Rehearsal invalid request` was received. Its unchecked `git rev-parse HEAD^` stdout was passed as request sourceRevision. The retained `/tmp/puni-ci-parentless-proof.json` independently records valid 40-hex HEAD but parent exit128/stdout `HEAD^` in a parentless repository. Neither proof was recreated or downloaded again.

The negative now copies the real current packet, changes only recorded receipt sourceRevision by flipping its first hex digit, serializes valid JSON, and validates against the unchanged real current request. It keeps the exact `/provenance/` expectation. No historical or fictional commit is exported. The real pinned-render packet positive, unknown-source, schema, file-closure and privacy controls remain unchanged. Production behavior, CI fetch depth/workflow and policy are unchanged.

Command: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-parity-rehearsal.test.ts --test-name-pattern 'altered receipt source revision|packages exact two-instance'`. Initial GREEN: 2 pass, 0 fail, 67 filtered, 15 assertions, 6.75 s. Restored guard: same counts, 7.10 s. Final after lint spelling correction: same counts, 6.81 s. These are overlapping scoped runs, not additive coverage.

R5 watched fault: temporarily remove only the recorded/expected receipt equality guard and its throw. Run the same Bun options/file with `--test-name-pattern 'altered receipt source revision'`: exit1, 0 pass, 1 fail, 68 filtered, 1 assertion, 6.06 s; validator resolved and the rejection assertion failed at line195. Source was unconditionally restored before the GREEN control run. The adjacent Proof comment records that exact fault; no mutation remains.

Scoped ESLint initially required `revision.startsWith('0')` instead of a first-character equality; corrected that equivalent spelling and final changed-source/test ESLint exited0 with no diagnostics (3.68 s). Initial unprivileged Nx could not write its workspace cache (`EROFS`); scoped authorized rerun `bunx nx run tool-fleet:typecheck` passed uncached, Nx duration1.4 s. `node_modules/.bin/openspec validate observability-environment-parity --strict --json` passed1 change, 0 issues, validation13 ms. Final formatting, whitespace and normal hooks are recorded in the Task23 source report.

Task21's three focused-command table rows now escape regex alternation pipes so Markdown retains two cells; command regexes and historical outcomes are preserved. No historical proof was rerun for that mechanical correction. A Bun check using the installed `marked` lexer confirmed the focused table has two cells per row and rendered command HTML retains ordinary regex alternation pipes (exit0).

The seven skips in that published CI run are explicitly opt-in `observability-access-auth.test.ts` backend components (`PUNI_AUTH_ELASTIC_LAB` absent), not suppressed required-tool failures. They cover authenticated complete health/provenance, scoped read/mutation rights, actual pinned-backend mutation refusal with admin controls, broader-admin refusal, TLS/hostname/credential refusal, bounded authority status/body/deadline, and credential-binding mutation refusal. Earlier Task5/2.3 component evidence remains at its existing record; it was not rerun and is not current live Kubernetes evidence.

No full Fleet/417/102 batch, old backend lab, host gate, application/browser/build, Docker or Kubernetes rehearsal was run for this bounded fixture repair. Full runtime/canonical4/11 acceptance remains OPEN. Controller owns CI `40464152901`, publication and fresh review; no all-green or live-readiness claim.

## Task24 — finite selected generated-workload inputs

Base `4c6096b65c1156bb3e60a4cb26ad9c5438f9a0d8`; coherent source commit `e364bec74e68420903e187268bac99e19d5bd4c5`. The four intentional proposal/design/spec/tasks amendments preceded implementation and are included. This closes selected source inputs only; canonical4/11, full3.1, cold-start admission and runtime acceptance remain OPEN.

### Source behavior and limits

The existing composition declares complete CPU, memory and ephemeral-storage request/limit maps for both instances' selected ECK application/init roles and Prometheus/Alertmanager main, config-reloader and init-config-reloader roles. Shared source values cover ECK manager, Prometheus controller and both actual create/patch webhook Jobs. Existing positive CPU/memory, heap and storage policies are retained; the ECK filesystem init keeps100m/50Mi and keystore keeps500m/196Mi in both requests and limits. Suspend explicitly keeps the main container's policy resources. Trust init remains first in the authored overrides with its existing command,128Mi/256Mi memory and100m/500m CPU. Operator init ordering still belongs to the pinned provider.

New finite values are declared budgets pending actual startup/load evidence. Shared reloader flags carry10m/100m CPU and32Mi/64Mi memory; complete named application/init overrides additionally carry64Mi ephemeral storage. Both webhook Jobs consume the supported shared patch.resources map. ECK named disk emptyDirs retain identities/lifecycle with positive caps:16Mi copy roots,256Mi runtime scratch/log/data allowances and existing16Mi S3 trust. Existing image-copy measurements (ES bin3404515/config47990/plugins4096 bytes; Kibana config4729/plugins4096) inform copy allowances only, not process memory or runtime growth sufficiency.

The existing independent `assertRenderedObservabilitySource` path now checks selected named role closure, complete positive maps, named scratch, reviewed chart/operator identities and actual controller flags. `validatePlatform`'s closed source schemas accept only the newly supported operator/reloader/hook fields. No operator-produced PodSpec is fabricated. No Prometheus/Alertmanager `config-out` override is appended; the generated memory-emptyDir's pinned Pod-memory provenance and actual cgroup/tmpfs enforcement remain later normalizer/admission work. No new runner or capacity engine is introduced.

Only two exact scalar differences were added to the existing disposable-versus-retained policy: ES suspend init index3 requests/limits memory2Gi versus4Gi. Its CPU, ephemeral and all siblings remain compared. The existing disposable parity control now reviews ten capacity scalars (33 total differences) and rejects an unauthorized3Gi sibling value. Deterministic existing coexistence planning output increases authored KPS requests736→832MiB, overlap17670→17766MiB and shortfall2068→2164MiB; this recursive authored-input planning artifact remains distinct from complete generated-workload demand and live admission.

### Focused verification

Commands use Bun with `--preload ./tools/test/scratch/preload.ts --timeout=30000`; the working-tree component checks below do not claim to export uncommitted YAML.

| Command/scope                                                                                                                                                                                  | Observed outcome                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test` on `observability-source-render.test.ts`, pattern `selected pinned\|duplicate generated\|changed provider`, before implementation                                                   | RED0 pass/4 fail,14 assertions,4.34s: missing trust ephemeral input and accepted duplicate volume/foreign role                                                                           |
| Single covering set: `bun test` on `observability-source-render.test.ts`, `observability-composition.test.ts`, `observability-source-parity.test.ts`, `observability-budget.test.ts`           | 414 pass/2 fail,831 assertions,234.03s; actual declared/default maps passed. Both failures were new expected-message mismatches, corrected without production changes                    |
| Same Bun options, source-render and source-parity files, pattern `selected source refuses observability/prometheus-controller kube-prometheus-stack role\|explicit disposable production-role` | 2 pass/0 fail,327 filtered,4 assertions,11.73s. Earlier controller-watch refusal and unauthorized-scalar refusal are now expected exactly;414 unaffected passing tests were not repeated |
| `bun test` on `platform.test.ts`, pattern `selected provider input\|accepts the locked ordered`                                                                                                | 5 pass/0 fail,109 filtered,5 assertions,1.89s after schema restoration                                                                                                                   |
| Scoped ESLint over the eight changed Fleet source/test files; `bunx tsc --build --force tools/tool-fleet/tsconfig.json`                                                                        | Final runs exit0 without diagnostics; final typecheck follows the corrected test expectations                                                                                            |
| Explicit changed-file Prettier and `git diff --check`                                                                                                                                          | Passed before source commit; ignored generated coexistence JSON retains its generator's exact bytes                                                                                      |
| `bunx openspec validate observability-environment-parity --strict --json`                                                                                                                      | 1 change passed,0 issues,19ms                                                                                                                                                            |

Initial covering discovery used an incorrect ECK StatefulSet key `eck-operator`; the existing pinned inventory and actual chart identify `elastic-operator`. That run retained263 pass/54 fail,530 assertions,183.81s; it is not passing evidence. The key was corrected and checks placed after existing resource closure; real positive plus provider-image/flag controls then passed7/7. Initial parity correctly rejected the new unreviewed suspend leaf (10 pass/1 fail,23.44s), leading to the two narrow records above. Test-only unsafe YAML reads and optional lookup typing were corrected following lint; formatting of two intent files was normalized. An initial generator invocation used the wrong argument and refused; the existing generator's actual `--write` invocation regenerated the artifact. Direct `openspec` was absent from PATH; the installed locked Bun invocation above succeeded.

### R5 watched guard faults

Each fault used the real pinned rendered carrier and actual `assertRenderedObservabilitySource` caller (or copied trusted source through `validatePlatform`). Faults were restored in `finally` blocks; no mutation remains. Negative assertions failed because the production path accepted the injected input, not because of a different exception. Eleven focused semantic fault groups and one grouped source-schema fault cover these checks; they do not repeat the historical archive or backend proofs.

| Removed/weakened guard                                                               | Observed failing negative                                                                          |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Selected map decoder refusal                                                         | Missing Kibana init resources accepted                                                             |
| Positive quantity predicate `>0` changed to `>=0`                                    | All six zero CPU/memory/ephemeral request/limit cases on Kibana init accepted                      |
| Selected role equality                                                               | Missing Kibana init role accepted                                                                  |
| Named scratch decoder refusal                                                        | Zero Kibana scratch cap accepted                                                                   |
| Scratch identity closure                                                             | Missing Kibana scratch accepted                                                                    |
| Primary CR resource-map refusal                                                      | Missing Prometheus resources accepted                                                              |
| Append-only volume restriction                                                       | Duplicate generated Prometheus config-out accepted                                                 |
| Reviewed chart pin binding                                                           | Changed ECK chart version accepted under old role assumptions                                      |
| Shared reloader flag binding                                                         | Missing actual CPU-request flag accepted despite complete CR overrides                             |
| Prometheus provider image binding                                                    | Foreign operator image accepted                                                                    |
| ECK provider image binding                                                           | Foreign operator image accepted                                                                    |
| Optionalize new DiskResources ephemeral fields and reloader/hook resource properties | All four `validatePlatform` missing-input negatives resolved and failed their rejection assertions |

The source-schema proof observer initially expected Bun's wording to include “resolved successfully”; Bun printed “Received promise that resolved”. Its own trailing assertion failed after the four intended open-acceptance failures had been observed; the unconditional restoration still ran. The retained log was independently checked for all four failures and resolved-promise text. Adjacent Proof comments name the actual faults and controls. Ignored detailed evidence, scripts and original failed attempts are retained under `.superpowers/sdd/observability-environment-parity/task-24-evidence/`.

### Exact committed source and generator boundary

After component checks, source commit `e364bec74e68420903e187268bac99e19d5bd4c5` completed normal hooks with a clean tracked tree. Pre-commit4.90s: lint4.90s, format0.82s, plaintext-secrets0.01s, private-nesting0.02s. Both agent-trailer hooks passed0.01s. Tool Wiki explicitly reported inactive/uncertified because its external activation root is not provisioned; no active certification is claimed. Migration/doc-cap routes skipped by their staged-file globs.

An ignored evidence test exports exactly that commit's `infra` with `git archive`; no dirty fallback or invented source SHA. The generator is the same clean committed code. It calls **`validateObservabilitySources`** on the exported root, with local disposable and production retained policies, using real pinned tools. `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 ./.superpowers/sdd/observability-environment-parity/task-24-committed-check.test.ts` passed1/1 in8.04s. Actual semantic validation reports191 resources per placement,33 reviewed scalar differences, sourceSecurityPolicy/wholeRenderParity true; all runtime, admission, claims, observed capacity, handover and activation flags remain false. Retained source hashes: local `163aac7235e4babc93818c0104988a699f32b45fe94062dde3836fede9dc777e`, production `3f14d4202c6620487d2f21db1b7e3f24bc40f89d86c7c0931094adf9feee5914`; rendered hashes: local `c396f6b6b39900c0398884447c05934401db038ad9c346336a0571a6aa14ca4b`, production `4e5229f5f9c8833c8aa50b8cca10f0d37e081496eacc210bbf8c5053c421a2b9`.

The existing actual packet control also exports that same HEAD: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-parity-rehearsal.test.ts --test-name-pattern 'packages exact two-instance'` passed1/1,68 filtered,14 assertions,6.29s, including pinned stage builds and packet validation. Neither check creates Docker or Kubernetes resources. Evidence-runner setup initially refused an `afterAll` preload outside the test runner, then an ignored test path without explicit `./`; those setup errors are not validation evidence. The corrected explicit Bun test path above preserves actual exit status and uses the existing scratch cleanup contract.

No old full Fleet/417/102 suite, unchanged42 archive proofs, backend lab, host gate, Docker/cluster, build, publication, push or merge was run. The416-test covering set above is the new bounded set containing the new selected-role table, not a rerun of the historical417 batch. Full effective generated Pod closure, complete cold-start/coexistence/transient accounting, pinned memory-emptyDir/cgroup/tmpfs enforcement, fresh host capacity, unchanged platform floor and actual Kubernetes/Flux/runtime/live acceptance remain required. Controller owns CI40464152901, publication and fresh scoped review. This evidence commit changes documentation only; the source/generator receipt remains bound to the source commit above.

## Published85794eb02 CI outcome and reviewed successor

CI run40464152901 is terminal failure. Workspace job122055562963 ran06:57:33–08:13:14UTC on2026-10-27,75m41s including setup and publication. Its Nx command reported71m50s,139tasks,0cachehits,31m28s critical path and40m21s reported recoverable time. These are tool-reported timing scopes, not a claim that changing parallelism is safe. CI selection, concurrency and policy remain unchanged.

The failed-step tail is retained at `/tmp/puni-pr760-workspace-857.log`. Full Nx artifact12718841415 (`nx-gate-log-workspace-1`) was downloaded once, checked as one bounded `nx-gate.log` ZIP member and read without extraction to `/tmp/puni-pr760-workspace-857-full.log` (3,902,783bytes). The only failed target was `tool-fleet:test`; its only failed case was the old historical-source negative at line194. Unlike shallow infra CI's invalid request, this checkout's `HEAD^` produced `observability platform-only application exclusion required` before receipt comparison. Both failures come from requiring an unrelated historical tree to satisfy the current generator contract. Reviewed Task23 at4c6096b6 instead alters only the valid current packet's recorded revision; its unchanged current request, valid-packet control and watched equality-guard removal cover the intended provenance boundary without either history assumption.

Twilight job122055562900 passed in62m16s (06:57:33–07:59:49UTC). All four pixels shards and stable pixels job122061072530 passed. Final gate122081062444 failed with workspace. Infra run40464152905 separately failed on the same fixture family, with1401pass/7explicit opt-in backend skips/1failure; its Kubernetes rehearsal was skipped by dependency. The workspace runner throws on the failed test/type/build command before its later independent affected lint invocation; no full workspace lint success is claimed. Scoped changed-path lint remains documented in the source slices.

Task21 archive handoff and Task23 provenance repair are independently approved; Task24 sourcee364bec74/evidencedd7ea3ad7 is independently approved with only the disclosed generic-error-context minor. These reviewed changes form the successor checkpoint. Task24's actual committed-source receipt binds e364bec74; later documentation commits do not relabel that receipt as a different tested generator revision. A successor push requires observing its own CI; no all-green conclusion follows from local tests, reviews or prior-head successful jobs.

Canonical completion stays4/11. Actual import/unpack, complete cold-start derivation/enforcement, full Kubernetes/Flux/CNI/signals/views/history/recovery and real dev rollout remain open. No production activation, persistent credential change, storage deletion or final implementation merge occurred.

## Task25a — shared arithmetic and native source derivation

Source base `005dca80b9d11f99b24b28a1baaabf407f94775a`; the four intentional controller proposal/design/spec/tasks edits were preserved. This slice is **source-only**, with full canonical4/11 and 3.1 still open. The architecture handoff was read-only; no other source owner edited this slice.

### Scope and production entry

`observability-capacity.ts` contains the extracted exact preflight quantity readers, provider-neutral summation and fit. Both preflight node/disk assessment and native ledger totals use the same production sum. Preflight retains its ownership, selector, actual node, digest, UID/Bound/replica, freshness, retained Docker and dual-mount policies and receipt fields. Kubernetes CPU remains request-based with finite limit evidence: the existing 100-core-limit control still reports 1100m required. Memory uses the unchanged shared normalizer's limit/init/volume semantics. No second Pod calculator, fake Candidate/Node/Ready/Bound/UID, runtime runner or parent quota was added.

The read-only `deriveObservabilityColdStartCosts` entry regenerates and validates the full selected source using the existing render/assert/index helpers, then binds all 191 unfiltered resources to immutable frame hashes before native classification. It reads the authored local k3d topology bytes (one server, zero agents and explicit labels); production placement cannot borrow that topology as actual target evidence. The low-level deriver receives the independently expected unfiltered resource inventory, checks owner/resource/hash closure, and returns namespace-scoped exact Pod/claim contributions and named incomplete facts. This is a selected-native-source scope, not a validated whole-attempt admission packet or host observation.

Supported complete fixtures cover explicit Recreate Deployment/OnDelete StatefulSet and DaemonSet forms, bounded one-generation Jobs with explicit counts/no retry/Failed replacement/Never restart and one install-hook phase, finite termination grace, ordinary sequential init, exact authored selector eligibility and namespace-local claims. Unresolved rolling/terminating/retry/repeated-hook behavior, unsupported runnable CRs or resource forms remain incomplete. The ledger exposes its excluded operator/system/host/image/archive/transient/hostPath contributors and `creationAuthority:false`. No CLI success branch or creation gate changed; the existing admission function remains false even with ample fixture capacity. The 16GiB floor, 120GiB stores, app/legacy paths and retained history remain unchanged. k3d memory options remain refused because the pinned path's unnamed helper removes volumes.

The common source index gained only the exact `v1/PersistentVolumeClaim` pair. An apps/v1 PVC refuses through the actual native deriver; a namespace-qualified explicit prod claim cannot satisfy a dev reference. The real full-source consumer still rejects an extra indexed PVC through its independent resource closure.

### Focused commands and results

Commands below ran with `login:false` in the existing aa39 worktree. Bun test commands ran from `tools/tool-fleet`; other commands ran from the repository root. The detailed local command receipts/logs are retained in `.superpowers/sdd/observability-environment-parity/task-25a-evidence/`.

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Observed output                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test --preload ../test/scratch/preload.ts src/observability-capacity.test.ts src/observability-cold-start.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 47 pass, 0 fail, 68 assertions; Bun 1.235s, captured process 1.264s                                                                                            |
| `bun test --preload ../test/scratch/preload.ts src/observability-preflight.test.ts -t 'authorized inventory binds\|source CPU overcommit\|CPU coexistence deficit\|candidate plus retained stack exceeds capacity\|filesystem free-space deficit\|unknown memory quantity refuses\|unknown node CPU refuses\|overflowing memory quantity refuses\|overflowing CPU quantity refuses\|fix1 two complete owned replicas\|fix1 partial replicas\|fix1 omitted claim identity\|common nodeSelector placement\|unconstrained source placement\|stale capacity refuses\|cutover assessment cannot age\|retained history cannot be writable-mounted'`                                                                                                                                                                | 17 pass, 186 filtered, 0 fail, 49 assertions; 12.03s                                                                                                           |
| `bunx tsc --build --force tools/tool-fleet/tsconfig.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Exit0; 2.527s                                                                                                                                                  |
| `bunx eslint tools/tool-fleet/src/observability-capacity.ts tools/tool-fleet/src/observability-capacity.test.ts tools/tool-fleet/src/observability-cold-start.ts tools/tool-fleet/src/observability-cold-start.test.ts tools/tool-fleet/src/observability-preflight.ts tools/tool-fleet/src/observability-parity-rehearsal.test.ts tools/tool-fleet/src/observability-source-render.ts tools/tool-fleet/src/observability-source-render.test.ts`                                                                                                                                                                                                                                                                                                                                                             | Exit0; 6.555s                                                                                                                                                  |
| `bunx openspec validate observability-environment-parity --strict --json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 1 valid change, 0 issues; exit0, 0.593s                                                                                                                        |
| `bunx prettier --check tools/tool-fleet/src/observability-capacity.ts tools/tool-fleet/src/observability-capacity.test.ts tools/tool-fleet/src/observability-cold-start.ts tools/tool-fleet/src/observability-cold-start.test.ts tools/tool-fleet/src/observability-preflight.ts tools/tool-fleet/src/observability-parity-rehearsal.test.ts tools/tool-fleet/src/observability-source-render.ts tools/tool-fleet/src/observability-source-render.test.ts openspec/changes/observability-environment-parity/proposal.md openspec/changes/observability-environment-parity/design.md openspec/changes/observability-environment-parity/specs/observability-environment-parity/spec.md openspec/changes/observability-environment-parity/tasks.md openspec/changes/observability-environment-parity/verify.md` | All 13 changed files pass Prettier; exit0, 1.059s                                                                                                              |
| `bun test --preload ../test/scratch/preload.ts src/observability-parity-rehearsal.test.ts src/observability-source-render.test.ts -t 'validated full rendered source exposes native subset\|production source cannot borrow local planned topology\|native PVC indexing preserves full selected source extra-resource refusal'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Initial worktree integration: 3 pass, 387 filtered, 0 fail, 9 assertions; 10.46s. Exact committed-source repetition is recorded below after the source commit. |

The complete byte-derived positive has seven Pods plus four distinct namespace/ordinal claims: 840MiB memory, 850m CPU requests and 312MiB disk. Sequential init uses max rather than addition. Exact capacity fits; one MiB less produces a named memory deficit. A Recreate Deployment control shares the same normalizer and removes only the two StatefulSet claims.

### R5 watched production faults

All 41 unique guard/dependency faults below were injected separately, observed exit1 with their intended negative assertions, and restored in `finally` before final checks. Adjacent `Proof:` comments name the affected production guards. `fault-proofs.json`, `extra-fault-proofs.json` and `preflight-fault-proofs.json` retain exact selectors/commands, timings and exits; corresponding `fault-*.log` files retain the failed assertions. Pure numeric malformed-input checks exercise the exported production capacity API; native ownership/concurrency/storage tests run actual immutable fixture bytes through the production deriver. No caller aggregate bypass replaces source derivation.

- Source closure: `source-owner-closure`, `source-hash`, `resource-closure`, `unknown-runnable`, `native-resource-map`.
- Topology: `topology-hash`, `topology-malformed`, `topology-one-server`, `topology-label-scope`, `topology-label-duplicate`, `placement`, `local-planned-topology`.
- Concurrency: `replica-count`, `rolling-overlap`, `daemon-rolling-overlap`, `job-retry`, `hook-count`, `hook-phase`, `termination-bound`, `ordinal`.
- Claims/API: `claim-kind`, `claim-template-duplicate`, `claim-volume-collision`, `claim-bound`, `claim-source`, `claim-collision`, `pvc-exact-api`.
- Extracted quantities through preflight subprocesses: `memory-syntax`, `memory-finite`, `cpu-syntax`, `cpu-finite`; removing each guard lost its exact refusal diagnostic.
- Shared sum/fit: `shared-summation-native`, `shared-summation-preflight`, `fit-deficit`, `available-finite`, `demand-finite`, `sum-finite`, `charge-identity`.
- Changed preflight adapters: `preflight-cpu-fit`, `preflight-memory-fit`, `preflight-disk-fit` each failed the corresponding existing deficit control when bypassed.

The initial 34 new-guard fault set ran twice during the sum extraction; the second run refreshed the shared production dependency but unnecessarily repeated unchanged new guards. The additional four and final three faults were scoped to the added/changed boundaries. No old proof batches ran.

### Failure lineage and remaining limits

The first test-file write used a wrong relative path and failed before creating a file. Several first attempts used the wrong preload working directory and failed to locate the preload; these are setup failures, not test evidence. Initial new-module runs failed with missing-module imports; later functional reds specifically observed missing-map traversal failure, absent native total, empty-inventory false completeness and invented start-zero StatefulSet ordinals before their fixes. The first explicit-PVC fixture exposed the old source index's lack of a PVC API arm, then passed through the narrow exact-pair addition. Initial lint passes found import sorting/optional chaining, a now-unnecessary test conditional, unsafe YAML test traversal and incorrect await around Bun's void-returning rejects assertion; these were corrected and the final scoped lint/type checks passed.

The first eight selected preflight tests failed with sandbox Unix-socket EPERM before exercising production logic. The existing local socket fixture passed with scoped escalation: 8 pass, 18 assertions/4.94s. The final expanded 17-control covering set above used that same authorized fixture permission. No socket denial was waived or treated as a capacity refusal.

Full Fleet/backend/application suites, old 1409/417/102/42/414 batches, host gates, build, Docker, lab, cluster, credentials, push, merge and publication were not run. Root owns CI40472856918 and infra40472856714; neither was refetched here. Selected source completeness and pure fit do not close operator traits, derived memory-volume enforcement, whole-attempt contributors/allowances, fresh host/substrate facts, CLI/upLab gating or Kubernetes/Flux/runtime/live acceptance (25b–f). No missing bound was replaced with zero or an invented policy allowance.

### Exact committed source and normal hooks

The source commit is `1c333f3e049190ee2c799638cb3f8fcda62e4f04`. After that normal-hook commit, only the three integration controls named above were repeated: **3 pass, 387 filtered, 0 fail, 9 assertions/9.78s** (captured process 9.85s). The existing rehearsal fixture exported this exact HEAD; the running tracked generator was the same SHA and `git status --porcelain` was empty both before and after. `task-25a-evidence/committed-integration.json` and `.log` retain both SHA identities, the exact command, timestamps, exits and clean-state observations. No earlier source SHA or dirty YAML was labeled committed-current evidence. Both `runtimeRehearsal` and `creationAuthority` remain false.

The source commit's normal precommit completed in 5.33s (captured process 5.492s): staged-file ESLint/Prettier, plaintext-secret scan and private-nesting passed; both agent trailer hooks passed. Tool Wiki explicitly reported inactive/uncertified because the external activation root is not provisioned. Migration and doc-cap hooks skipped because no staged paths matched their globs; no certification or migration check is inferred. The subsequent evidence-only commit records this exact committed-source control; it does not relabel its own documentation-only SHA as a newly tested generator.

The retained proof set has 41 named cases (34+4+3), all observed failing and restored: latest captured group totals 17.507s, 8.741s and 2.190s. Including the disclosed first 34-case repetition, 75 individual fault executions occurred; repeats do not add coverage. No further fault or 47/17 suite refresh was run for comments/documentation.

## Task25a fix round 1 — malformed trusted workload boundaries

Review base `446e63fa3586333fac5f8bef3cf1ffa0d757e601`. The independent review found one Important compound boundary error: every Controller decoding failure became `native-workload-inputs` incomplete, and the native normalizer catch also downgraded contradictory volume definitions because they shared an unsupported-volume category. This restores the existing malformed-state contract; no spec waiver or plan change was made. All original Task25a evidence and failure/repetition lineage above remain historical evidence rather than being relabeled after the fix.

Controller structural failures now throw fixed contextual errors using validated source/resource identifiers and fixed structural paths. Raw ArkType payloads, causes and private fixture values are excluded. The existing normalizer is still the sole authority for volume/source cardinality and accounting: an optional malformed-refusal callback distinguishes contradictions for native derivation, while its absence preserves existing preflight refusal categories. Known unsupported volume features, restartable/container shapes and rolling behavior remain modeled incomplete facts in native analysis. Malformed volume cardinality is checked before unsupported-volume recovery for supported/unsupported sources in the same volume; duplicate/missing sources and contradictory projected selectors use the malformed path.

The first pinned-entry check exposed valid node-exporter `volumeMounts[2].mountPropagation` previously hidden by the blanket schema downgrade. Sanitized inspection showed complete string CPU/memory maps and only that extra structural field. `NativeWorkloadSpec` is derived from the shared Mount/Container/WorkloadSpec primitives and recognizes exactly `None`, `HostToContainer` and `Bidirectional`; the sole normalizer explicitly marks propagation unsupported. The existing WorkloadSpec/ObservedWorkloadSpec decoders remain closed and unchanged. This recognizes an unsupported fact without enabling mount propagation, authoring budgets or implementing 25b. The legacy propagation regression retains `projection-malformed`. The isolated native unsupported-propagation test uses a bounded PVC-template mount with no hostPath; removing only the propagation guard makes its otherwise complete fixture lose the expected blocker. The pinned node-exporter entry proves schema recognition separately.

### Fix-round commands and observed results

All commands used `login:false` and the same aa39 worktree. Test commands below ran from `tools/tool-fleet`; other commands ran from the repository root. Detailed command receipts/logs use the `fix1-` prefix in the existing `task-25a-evidence/` directory.

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Observed output                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `bun test --preload ../test/scratch/preload.ts src/observability-cold-start.test.ts -t 'fix1 malformed controller\|fix1 malformed volume\|fix1 unsafe source context\|missing native resource map\|fix1 wellformed unsupported\|fix1 malformed mount propagation\|native rolling replacement\|native bytes expand\|fix1 ordering'`                                                                                                                                                                                                        | 21 pass, 34 filtered, 0 fail, 62 assertions/561ms; process 0.584s  |
| `bun test --preload ../test/scratch/preload.ts src/observability-preflight.test.ts -t 'fix1 source missing volume variant\|fix1 source multiple volume variants\|fix1 source duplicate volume names\|fix1 source malformed projection variants\|fix1 source resource-field projection\|fix1 source CSI\|unbound candidate hostPath\|fix1 native mount metadata preserves\|transport errors cannot forward credential-bearing\|Secret malformed diagnostics\|source restartable init accounting\|fix1 legacy volume validation preserves'` | 12 pass, 193 filtered, 0 fail, 29 assertions/7.28s; process 7.287s |
| `bunx tsc --build --force tools/tool-fleet/tsconfig.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Exit0; 2.060s                                                      |
| `bunx eslint tools/tool-fleet/src/observability-cold-start.ts tools/tool-fleet/src/observability-cold-start.test.ts tools/tool-fleet/src/observability-workload.ts tools/tool-fleet/src/observability-preflight.test.ts`                                                                                                                                                                                                                                                                                                                  | Exit0; 5.022s                                                      |
| `bunx openspec validate observability-environment-parity --strict --json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 1 valid change, 0 issues; exit0, 0.591s                            |

No old 47/17/41 suite/fault batch, backend suite, host gate, Docker/lab/cluster/build/credentials, push or merge was run. The new shared-normalizer plumbing justified only the twelve named legacy volume/error-contract controls above; quantity/CPU/fit code did not change.

Ten new fix-round faults were injected once each through the production native deriver and restored in `finally`: `fix1-controller-malformed`, `fix1-malformed-callback`, `fix1-volume-cardinality`, `fix1-projection-cardinality`, `fix1-downward-cardinality`, `fix1-missing-volume-source`, `fix1-volume-name-uniqueness`, `fix1-safe-context`, `fix1-mount-propagation-unsupported` and `fix1-mount-propagation-enum`. Every fault produced its intended failed assertion; total captured process time 4.966s. `fix1-fault-proofs.json` and the ten named `.log` files retain exact mutations' selectors, commands, timings and failures; adjacent `Proof:` comments record the observed dependencies. The prior 41 faults were not refreshed.

Red lineage is preserved: the initial malformed-controller/volume/context set failed 10/10 (501ms); the first actual pinned entry failed on valid node-exporter mount propagation (7.01s); its isolated native field test then failed while the malformed enum control passed (1 fail/1 pass, 446ms); missing/both downward selectors failed while valid unsupported resourceFieldRef remained incomplete (2 fail/1 pass, 507ms). The corrected covering set above retains hostPath, rolling and resourceFieldRef incomplete positives, safe-error marker/cause assertions, exact supported-byte totals and the legacy rejection category. The requested clean exact-committed pinned positive and normal-hook results are recorded below after the source commit; no dirty-generator or older-SHA output is claimed as final committed evidence.

A final targeted ordering check extended the same Important finding before commit: an unsupported hostPath volume before a separate emptyDir+PVC contradiction, an unsupported projected resource-field entry before a later secret+configMap contradiction, and unsupported rolling behavior before a volume contradiction all initially returned incomplete (3 failed assertions/507ms). The sole normalizer now reuses one set of structural helpers in a native-only all-entry prepass. Legacy callers without the malformed callback retain sequential validation, with a new first-quantity-refusal regression. Native normalization runs once before concurrency classification; no second engine or formula was added. The source-only diagnostic after this correction returned incomplete, 191 selected resources and creationAuthority:false (6.075s); this dirty-generator diagnostic is explicitly not final committed evidence.

Only affected ordering dependencies and moved guards were refreshed: `fix1-ordering-native-prepass`, `fix1-ordering-legacy-sequential`, `fix1-ordering-projection-traversal`, `fix1-ordering-before-concurrency`, `fix1-ordering-volume-cardinality`, `fix1-ordering-projection-cardinality`, `fix1-ordering-downward-cardinality`, `fix1-ordering-missing-source`, and `fix1-ordering-volume-uniqueness`. All nine produced their intended failed assertions and were restored; their captured process total 11.960s is retained in `fix1-ordering-fault-proofs.json` and individual logs. These comprise five moved-guard refreshes and four ordering dependencies, in addition to the first ten fix-round cases; they are not claimed as nineteen independent safeguards. Prior 18/11 covering checks passed before this ordering correction; the final 21/12 results above replace them as final evidence. No 47/17/41 batch ran.

### Fix-round exact committed positive and hooks

Fix-round source commit `f0c7dfe6eefe42a5c108a3af49ea7a6adbfd7744` passed normal hooks, with precommit 4.67s/captured process 4.843s. Staged-file ESLint/format, plaintext-secret scan, private-nesting and both agent trailer hooks passed. Tool Wiki remained explicitly inactive/uncertified because external activation is absent; migration/doc-cap hooks skipped by staged-file globs. Final five-file format passed 0.818s and whitespace passed 0.013s.

On that exact source and generator SHA, with tracked worktree clean before and after, `bun test --preload ../test/scratch/preload.ts src/observability-parity-rehearsal.test.ts -t 'validated full rendered source exposes native subset'` passed **1 test, 70 filtered, 0 failures, 6 assertions/6.82s** (captured process 6.889s). The existing fixture Git-exported this HEAD, and the actual source entry retained all 191 selected resources, returned incomplete and kept creationAuthority/runtimeRehearsal false. `fix1-committed-entry.json`/`.log` retain both SHA identities, exact command, timestamps and clean states. The earlier pinned-entry red and dirty-generator diagnosis remain separate evidence; neither is relabeled as this committed positive. An evidence-only successor records this outcome without substituting its documentation SHA as tested generator source.

## Task26 — reuse the real pinned index for selected-resource test mutations

Source base `2f37a816edc2978d6c3a4a7a71698c99a3832f8f`, clean isolated aa39 worktree. This is a mechanical test-setup refactor; no production behavior, API, source inventory, provider pin, NativeCapacity/normalizer, CI selection/concurrency/cache/workflow or tool-install behavior changed. The sole production-file edit is the adjacent caller `Proof:` comment. OpenSpec behavior artifacts were not required for this mechanical slice.

The actual pinned render still runs once. Its real `indexObservabilitySource` index is now built once for selected-field fixtures. Each mutation parses only the selected real record into a fresh YAML document and replaces it in fresh outer/owner maps; the shared indexed records are read-only inputs to the unchanged production `assertObservabilitySelectedResources`. No rendered output is fabricated or cached by mutable identity. The new isolation control deletes Kibana init resources, observes the exact selected-resource refusal, then validates a fresh target from the same pinned fixture, compares the untouched indexed owner and preserves its rendered bytes.

### Case preservation and caller proof

The pre-edit inventory was **319 cases**, not the older CI baseline's 318: 46 full-pipeline/index controls including Task25a's extra-PVC closure control, plus 273 selected cases. The exact name multiset, including duplicate table-generated names, is preserved; all role removals, absent resource maps, six zero request/limit fields, scratch identity/limits/duplicates, primary maps, provider pins/images/flags and duplicate roles remain. API, namespace, Secret/privacy, full source and PVC/index coverage were not weakened or removed. Three added controls give **322 cases**. Detailed before/after inventories and their parsed passing-test comparison are retained under ignored `task-26-evidence/`.

The Deployment-role table case now explicitly asserts the isolated guard's selected-resource refusal. Its prior full-caller `/Projection controller watches differ/` refusal remains in a separate full-caller control with the identical container deletion; the earlier projection check is not mislabeled as evidence for the selected-resource guard. The full pinned positive also remains unchanged.

The new full-caller flag negative removes only `--config-reloader-cpu-request=10m` from the actual rendered controller. Temporarily removing **only** `assertObservabilitySelectedResources(source, indexed)` from `assertRenderedObservabilitySource` made that test fail open: **0 pass, 1 fail, 321 filtered, 1 assertion/4.38s** (process 4.411s), because the full caller returned a 191-resource source-policy receipt instead of throwing `/selected resource/`. The source was restored in `finally`; the adjacent `Proof:` names this observed fault. The final covering file below passed with the invocation restored. No old eleven-guard or other fault batch was repeated.

### Commands, timings and limits

Commands used `login:false` and the aa39 isolated worktree on `pop-os`. Bun tests ran from `tools/tool-fleet`; static and Git commands ran from the repository root. Required writes/execution outside the writable roots used scoped escalation for this exact authorized worktree. Exact command arrays, UTC starts, captured process times, exit statuses and complete logs are in `task-26-evidence/*.json`/`.log`.

| Command                                                                                                                                                                                                                                                      | Observed output                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `bun test --preload ../test/scratch/preload.ts --timeout=30000 src/observability-source-render.test.ts -t 'selected source refuses observability-dev/elasticsearch\|actual full pinned source rendering\|selected pinned provider inputs'` (original source) | 42 pass, 277 filtered, 0 fail, 281 assertions/22.31s; process 22.364s |
| `bun test --preload ../test/scratch/preload.ts --timeout=30000 src/observability-source-render.test.ts -t 'full source invokes selected guard for a missing reloader flag'` (only caller invocation removed)                                                 | Intended 1 failed assertion, 4.38s; process 4.411s; restored          |
| `bun test --preload ../test/scratch/preload.ts --timeout=30000 src/observability-source-render.test.ts` (single final covering run)                                                                                                                          | 322 pass, 0 fail, 581 assertions/37.40s; process 37.448s              |
| `bunx tsc --build --force tools/tool-fleet/tsconfig.json` (final source)                                                                                                                                                                                     | Exit 0; 1.828s                                                        |
| `bunx eslint tools/tool-fleet/src/observability-source-render.test.ts tools/tool-fleet/src/observability-source-render.ts` (final source)                                                                                                                    | Exit 0; 3.396s                                                        |
| `bunx prettier --check tools/tool-fleet/src/observability-source-render.test.ts tools/tool-fleet/src/observability-source-render.ts`                                                                                                                         | Exit 0; 0.339s                                                        |
| `bunx openspec validate observability-environment-parity --strict --json`                                                                                                                                                                                    | 1 valid change, 0 issues; exit 0, 0.722s                              |
| `git diff --check`                                                                                                                                                                                                                                           | Exit 0; 0.008s                                                        |

The representative original 42-case subset summed **19.57415s** in reported case durations; those same 42 cases in the final file summed **1.11750s**. The 40 first-owner field negatives alone summed 16.33280s before and 0.39985s after; the provider-map positive moved 2.63157s to 0.05535s, while the full positive stayed 0.60978s to 0.66230s. No separate post-refactor subset rerun was needed. The full final 322-case sum was 34.50475s: the original 273 selected cases summed 7.44153s and original 46 full-pipeline/index cases 24.69763s. Bun's wall times include additional provisioning/beforeAll/index/runner time; the wall-minus-case-sum remainder is not a separately instrumented setup measurement. The final file is not a controlled wall-time comparison with the original 42-case subset.

The saved actual-CI comparison was read: historical source-render 45→318 cases and 23.90→256.82s summed case time; unchanged files also slowed roughly 1.3–1.8×. The brief's published 005 Fleet outcome (1765 pass, 7 opt-in backend skips, 0 fail; 1772 cases/75 files, 801.38s) remains controller-owned prior-head evidence. No claim attributes its whole increase to this file or extrapolates local timings to a new CI wall time.

The initial scoped lint check found eleven `no-confusing-void-expression` findings after tests switched to the void-returning guard; adding braces corrected those callbacks. Both scoped typechecks passed (first 1.817s; final 1.828s), and final lint passed after that correction. This was the only unintended failed check; the caller-removal failure is the intended R5 proof. Inventory enumeration deliberately never ran test callbacks; the single full-file Bun run independently matched all 322 enumerated names and 0 failures.

### Source commit, self-review and ownership

Source commit **`3ce7b3729046ec69d2afc29db7a81e93af63001f`** passed normal hooks: precommit 3.32s (process 3.520s), including ESLint 3.26s, Prettier 0.34s, plaintext-secrets 0.01s and private-nesting 0.02s. Both agent-trailer hooks passed 0.03s/0.01s. Tool Wiki explicitly reported inactive/uncertified because the external activation root is not provisioned; migration/doc-cap routes skipped by staged-file globs. No certification or skipped migration check is claimed.

The covering run validated the final working-source bytes **before** that commit; both committed Git blob IDs were then checked equal to the validated blobs, and tracked status was clean. It was not a post-commit or Git-exported-source run, and no extra final-file rerun was done. Self-review checked the full diff, exact input mutations and name multiset, Job role selection, target isolation, original full-caller controls, restored caller invocation, production-comment-only change and unchanged native-capacity files; no unresolved finding was identified. The normal-hook evidence successor records these facts without relabeling its own documentation SHA as a newly tested generator.

Full Fleet/old 318/1409/417/102/42 batches, backend/browser/host gates, build, Docker/Kubernetes/Flux/lab/runtime/live operations, cache/workflow changes, CI refetch/cancellation, push, merge and publication were not run. No tools were missing. Existing observed local pinned rendering proves desired source policy only; cold-start, admission, actual capacity and enforcement, Kubernetes/Flux/CNI/signals/views/history/recovery and real dev rollout remain unverified. Canonical completion remains 4/11; Task25b–f and 3.1 remain open. Source ownership stops after the evidence commit for the controller's fresh review and publication decision.

## Task25b1 — opt-in source volume normalization

Exact clean source base `a825cf2c1de78c63847a471e3b30eb7a15a7653f`; sole source owner used the existing isolated aa39 worktree on pop-os. Root's four-artifact intent amendment preceded behavior: proposal 399 words, strict scoped OpenSpec 1 valid/0 issues/15ms (0.462s process), formatting/whitespace and normal precommit 0.36s passed, as retained in the dispatch brief. Those are root's prior amendment checks, not refreshed implementation claims. Full canonical completion remains 4/11 ; 3.1 remains open.

### Source boundary and arithmetic

Source commit **`a27a6f17f9b45c9a80f74bcdc6d6dbf6ede0ebd4`** changes only the sole normalizer and its new focused test file. `SourceWorkloadSpec` retains the complete unknown standalone body until the optional internal policy causes strict decoding in `normalizeWorkload`; `WorkloadSpec`, `NativeWorkloadSpec` and `ObservedWorkloadSpec` declarations, preflight projection and all production callers remain unchanged. The policy accepts named standalone metadata volumes and one named derived Memory volume; its closed runtime boundary refuses numeric overrides, wildcard/duplicate authorizations, absent/wrong identities and wrong kinds/media. No provider mapping, source-resource reader, new runner, observed projection or production generated-trait integration was added.

Standalone metadata retains safe unique paths, actual selectors and effective modes, including zero. Only metadata.labels/metadata.annotations with absent/v1 API version are supported; resource-only selectors and foreign field/API identities remain modeled unsupported. Every app/init mount to this volume must explicitly be read-only. With refuseMalformed, strict structure/modes/paths/selector cardinality run before unrelated unsupported recovery, using the existing structural prepass and shared FileMode/cardinality semantics. Without it, the source policy still validates accepted metadata, while default legacy calls preserve sequential first-refusal behavior.

The Memory policy requires one present Memory emptyDir with genuinely absent literal sizeLimit, and refuses every other Memory volume, including another bounded one. It defers the derived normalized amount until complete app/init resource maps and overhead have passed existing normalization. Existing arithmetic derives `P=max(sum(app limits),max(sequential init limits))+overhead`; the normalized volume receives P afterward, so P and overhead are charged once. The hand-checked app 100Mi + sidecar 20Mi / init 200Mi / overhead 10Mi case returns memory 210Mi, volume 210Mi, CPU 45m by requests and disk 16Mi. A changed app limit produces 330Mi; process ephemeral 32Mi still exceeds disk 16Mi. The source retains absent sizeLimit. Only opted Memory output contains `{sourceMemoryVolume:{name,basis:'pod-memory-limit',upperBoundMiB:P,literalSizeLimit:'absent',enforcement:'unobserved'}}`; strict default-output equality proves no extra undefined key. No metadata values, zero-overhead assertion, observed mount bound or kernel enforcement is fabricated.

### TDD and observed proof lineage

Initial focused positives failed 2/2 with existing unsupported-volume refusal while identical-byte default refusal passed (193ms). The initial malformed-first subset failed 13 expected assertions (151ms), with 20 existing refusal/structure cases passing; it showed unsupported recovery hiding malformed standalone content. Those failures occurred before implementation. A later NUL-byte path negative independently failed (264ms) before that safe-path guard was completed, then passed (207ms).

The first scoped typecheck found a test excess-property typing error for a deliberate numeric policy override; a separately named policy variable preserves that runtime negative without unchecked casting. Initial ESLint found only import ordering. Both were corrected. A 32-case negative subset then found two test fixtures using explicit undefined rather than genuinely absent optional fields; strict ArkType decoding refused them before normalization. The corrected omission fixtures passed 32/32, 32 assertions/189ms. These setup/static failures are not production verification. The first commit attempt used `commit --only` before the new test was staged and failed on its pathspec before hooks; no successful hookless commit occurred. The eventual source commit used plain `git commit` with configured normal hooks.

**25 distinct bounded guard/dependency faults were watched failing their production normalizer assertions and restored**, total 5.105s captured process time. No Task25a fault batch was repeated. Exact commands/selectors, exit statuses, UTC times and complete logs are retained in ignored `task-25b1-evidence/*.json`/`.log`; the copied fault scripts retain the mutations. Adjacent Proof comments name each actual dependency and observed negative.

| Faults                                                                                         | Observed failed behavior                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| policy-shape; policy-name-syntax; policy-name-uniqueness                                       | Numeric override admitted; wildcard malformed category lost; duplicate authorization admitted                                                  |
| metadata-policy-identity; memory-policy-identity                                               | Exact missing/wrong-kind policy refusal lost; missing Memory name became property-access error                                                 |
| memory-policy-medium; memory-policy-literal; memory-policy-single-volume                       | Empty/Disk/absent media admitted; zero/empty/invalid/positive explicit caps admitted; extra bounded Memory admitted                            |
| metadata-mode-default; metadata-mode-entry; metadata-closed-body; metadata-decoder             | Bad default/noninteger/item modes or unknown body field escaped malformed-first validation; substituting empty items hid malformed actual body |
| metadata-selectors; metadata-path-safety; metadata-path-uniqueness; metadata-malformed-prepass | Missing/both selectors, six unsafe path forms, duplicate paths or selector/mode/path faults became unrelated unsupported refusals              |
| metadata-authorization; memory-volume-authorization                                            | Unselected metadata admitted/default refusal changed; disk 16Mi dropped to process8Mi/default emptyDir refusal changed                         |
| metadata-field-selector; metadata-api-version; metadata-read-only; metadata-effective-mode     | Foreign field/v2 API/writable mounts admitted; explicit zero mode became420                                                                    |
| memory-deferred-bound; source-evidence-state; source-evidence-absence                          | Volume bound became220 instead of210; enforcement relabeled observed; default gained undefined evidence key                                    |

Two proof discoveries were retained honestly. Removing the first explicit resourceFieldRef condition survived because exact supported metadata field paths already reject resource-only selectors after cardinality validation; that redundant new condition was removed, and no independent proof is claimed for it. The first undefined-evidence-key mutation survived loose `toEqual`; strict equality now detects the key and the one repeated mutation failed as intended. There were 27 mutation executions: 25 final distinct dependencies, one redundant condition later removed, and the one repeated absence fault. The restored last dependencies passed the four selected controls below. Final covering source behavior was unchanged after the single new-file run; only two adjacent Proof comments were added while those last two dependencies were faulted/restored. No post-commit full-file or Git-exported-source claim is made.

### Scoped commands and output

Commands ran with login:false, Bun 1.4.4 and the repo scratch preload. Bare `openspec` was absent from that shell's PATH (exit 127); the locked installed CLI was available and invoked with `bunx --no-install openspec`. Required outside-root writes/test scratch/static metadata used scoped escalation for this exact authorized worktree. No tool remains missing.

| Command                                                                                                                                                                                                                                                                                                                                                                                                          | Observed output                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-workload.test.ts`                                                                                                                                                                                                                                                                                                         | Single covering run: 58 pass, 0 fail, 67 assertions/189ms; process0.197s                         |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-preflight.test.ts -t 'source emptyDir without sizeLimit\|bounded disk emptyDir\|bounded memory emptyDir\|source CPU overcommit\|source restartable init accounting\|fix1 legacy volume validation preserves\|fix2 explicit projected downwardAPI\|fix2 source projected file mode\|fix1 native mount metadata preserves'` | 10 pass, 195 filtered, 0 fail, 24 assertions/6.55s; process6.553s                                |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-cold-start.test.ts -t 'fix1 ordering\|fix1 wellformed unsupported projected resource\|Recreate Deployment'`                                                                                                                                                                                                               | 5 pass, 50 filtered, 0 fail, 7 assertions/483ms; process0.496s                                   |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-workload.test.ts -t 'malformed items\|derives P once\|default calls reject identical\|default model has no source evidence'`                                                                                                                                                                                              | Restored controls:4 pass, 54 filtered, 0 fail, 10 assertions/174ms; process0.185s                |
| `bunx --no-install tsc --build --force tools/tool-fleet/tsconfig.json`                                                                                                                                                                                                                                                                                                                                           | Exit0 without diagnostics; process1.801s                                                         |
| `bunx --no-install eslint tools/tool-fleet/src/observability-workload.ts tools/tool-fleet/src/observability-workload.test.ts`                                                                                                                                                                                                                                                                                    | Exit0 without diagnostics; process3.245s; normal source hook later linted final comments in3.18s |
| `bunx --no-install prettier --check tools/tool-fleet/src/observability-workload.ts tools/tool-fleet/src/observability-workload.test.ts`                                                                                                                                                                                                                                                                          | Exit0; process0.329s                                                                             |
| `bunx --no-install openspec validate observability-environment-parity --strict --json`                                                                                                                                                                                                                                                                                                                           | 1 valid change, 0 issues, 16ms; process 0.683s                                                   |
| Four-file `prettier --check --ignore-path /dev/null` over normalizer, tests, canonical verify and ignored task report                                                                                                                                                                                                                                                                                            | Exit 0; process 0.636s                                                                           |
| `git diff --check`                                                                                                                                                                                                                                                                                                                                                                                               | Exit0; process0.007s                                                                             |

Source normal hooks passed: precommit 3.25s/process 3.446s; ESLint 3.18s, Prettier 0.32s, plaintext-secret 0.01s, private-nesting 0.02s and both trailer hooks 0.02/0.01s. Tool Wiki explicitly remained inactive/uncertified because external activation is not provisioned; migration/doc-cap routes skipped by staged-file globs. Self-review inspected the full source/test diff, source-only unknown-body boundary, exact absent sizeLimit, mode/API/read-only preservation, deferred accounting, default schema/output/order, restored dependencies and unchanged production consumers. No unresolved source finding identified.

### Handoff and unverified scope

Task25b1 source ownership stops after its evidence commit for root's fresh review/publication. Task25b2 must consume this SourceWorkloadSpec/policy through the approved pinned-provider adapter, share the selected Task24 input reader, bind provider/runtime/source identities, derive the eight selected per-replica traits, and integrate exact owner blocker replacement through the existing production wrapper while retaining concurrency/projected-overhead/runtime prerequisites. No provider registry or speculative framework is proposed.

No full Fleet/old full suites or old fault replays, full render matrix, backend/browser, host gate, build, Docker/Kubernetes/Flux/lab/runtime/live operations, CI-policy/cache/workflow changes, CI actions, push, merge or publication ran here. Existing published 420/CI evidence remains controller-owned. Source normalization does not prove actual mount size, admitted Pods, ancestor cgroup/delegation/kubelet/swap behavior, operator concurrency, fresh host capacity, actual claim binding, full admission or signals/views/history/recovery. Floor 16GiB available and 120GiB stores remain unchanged; all runtime/live requirements remain open. Canonical status stays 4/11.

Final strict scoped OpenSpec and explicit four-file format/whitespace checks passed after writing this evidence (16ms/0.683s, 0.636s and 0.010s respectively). Only these recorded-check lines were then added; normal evidence hooks check the final Markdown.

## Task25b2 — selected generated capacity traits and source wrapper

Source base `a912f6672bc1b71c2e10007cd407f0fcbf93ee41`; source commit **`afb32d35880ff2bba7aad7255e37d1f09f8a144c`**, 2026-10-27. Root's four-artifact amendment at `a825cf2c1` and reviewed Task25b1 source/evidence preceded implementation. This is the second bounded source slice; canonical implementation progress remains **4/11**. No runtime/admission criterion is closed.

### Implemented source boundary

`readObservabilitySelectedResources` now returns the existing Task24 named maps, role/source coordinates and provider identities. The public `assertObservabilitySelectedResources` still delegates to those same guards; no competing role/resource list was added. Parsed JSON traversal replaces per-field YAML stringify/parse. Returned ES init overrides follow the supported conservative filesystem/keystore/suspend/trust sequence; this is not a claim that all generated phases were realized. The shared reader supplies actual CR Pod paths for named container image-origin coordinates.

`observability-generated-capacity.ts` maps the eight selected Elasticsearch/Kibana/Prometheus/Alertmanager roles across the actual namespaces to the sole `normalizeWorkload`, including Task25b1's opt-in metadata/config-out source policy. It reads app/init quantities and requested claims from the source, binds exact selected images and chart/operator/runtime/derivation identities, and retains source SHA/pointers. It requires exactly one correctly pinned reloader-image flag; both later `--flag=foreign` and `--flag foreign` overrides refuse. Well-formed unsupported branches retain exact paths and `perReplica:null`; malformed maps, quantities, unions and claim bindings throw. Extra nodeSet claims and resources still validate even when another shape is unsupported. Recovery catches only modeled normalizer limitations; malformed state cannot become a partial trait.

`observability-source-inventory.ts` extracts Task25a's existing owner/hash/resource closure and reuses the existing source index. Original categories/proofs remain beside those checks. `deriveColdStartCosts` retains its public API, native scope, charge arithmetic and non-authorizing output; the wrapper shares one validated index/inventory between native and generated derivation. The wrapper adds `generatedTraits`, replaces only exact processed owner/kind blockers with concrete prerequisites, and binds provider/runtime/derivation identities in the combined closure. Native entries/known totals remain separate. No generated nominal replica amount enters complete charges. The actual source has zero complete native entries because existing concurrency/hostPath blockers remain; a separate nonzero native control prevents vacuous preservation assertions.

The normalizer, default source/observed schemas, preflight projection, generic capacity arithmetic and admission stub are unchanged from the base. No resource amount, chart/lock, CR factory, CI policy or runtime resource changed.

### Source evidence and conditional facts

A narrow primary-source recheck read ECK commit `386c7b14f2d1bbb7f2af1e7da997e64875f16e47`: [NewInitContainers](https://github.com/elastic/cloud-on-k8s/blob/386c7b14f2d1bbb7f2af1e7da997e64875f16e47/pkg/controller/elasticsearch/initcontainer/initcontainer.go) appends filesystem, conditional keystore resources, then suspend; the [suspend constructor](https://github.com/elastic/cloud-on-k8s/blob/386c7b14f2d1bbb7f2af1e7da997e64875f16e47/pkg/controller/elasticsearch/initcontainer/suspend.go) itself is unconditional. Actual keystore Secret/resource realization remains unobserved. The [Pod builder](https://github.com/elastic/cloud-on-k8s/blob/386c7b14f2d1bbb7f2af1e7da997e64875f16e47/pkg/controller/elasticsearch/nodespec/podspec.go) selects `WithAnnotations(es.HasDownwardNodeLabels())`; the [metadata volume](https://github.com/elastic/cloud-on-k8s/blob/386c7b14f2d1bbb7f2af1e7da997e64875f16e47/pkg/controller/common/volume/downward_api.go) always exposes labels and conditionally annotations. Current source selects labels only. Paths/read-only semantics were read from these pinned sources; no metadata values or generated commands were invented. Prometheus Operator and retained k3s fork findings reuse the approved local research. The runtime identity retains fork commit `5f3efbf9f6b592422439471c5fe1a1ab2887e189` without claiming it was observed running.

Browser raw-source requests returned cache misses. Scoped `curl -fsSL` fetched the exact pinned sources into `/tmp/task25b2-eck-{init,suspend,names,pod,volumes,downward}.go`. Guessed `common/keystore/keystore.go` and `common/volume/downwardapi.go` paths returned404; the volume tree located `downward_api.go`. The missing keystore fetch was not treated as evidence of runtime inclusion.

### TDD, self-review and failure lineage

The shared-reader positive first failed because the new reader was absent; the adapter positive then failed because its module was absent. The first red driver's final `cat` masked Bun's status in the shell exit; its captured output was **0 pass/1 failed assertion**, not a successful check. Later test drivers preserved Bun's status explicitly. The initial adapter closure set produced25 pass/13 fail before unsupported branches stopped emitting nominal per-replica amounts. A second closure set exposed missing version/mount/policy checks; corrected controls reached47 pass/94 assertions. Native fixture setup initially used termination0 and a namespace inferred from its synthetic owner; correcting those fixture inputs produced the intended nonzero native contribution. Those setup failures are not implementation acceptance.

Self-review added an immutable shared-index control and malformed-before-rewrite controls. They failed3/3, exposing a volume-array alias and loss of missing ES claim names/null mounts; corrected controls passed3/3. Extra persistent/CSI volumes and template metadata then failed3 controls while the malformed CSI union control already passed; modeled recovery and exact unsupported paths restored all4. A final extra-nodeSet audit exposed unvalidated claim quantities and wrong recovery classification (2 red); corrected controls include malformed/zero claims, malformed unions and CSI plus request>limit. One edit briefly put two assertions inside the fixture mutation before its bytes were updated; the resulting2 setup failures were corrected and are not claimed as production failures. Root's precise duplicate-image-flag risk produced a red control, followed by both supported syntax negatives passing. The source-pointer assertion also failed before adding the actual CR Pod path.

Initial static checks caught index-signature/container typing errors, untyped YAML/JSON fixture access, import/void-expression lint and a mechanical quote error in the `metadata.labels` literal. They were corrected before final validation. A mechanical proof-comment insertion anchor failed before writing its accumulated changes, then was corrected. None of these setup/static failures is counted as a successful negative proof.

### Observed R5 proofs

**60 distinct bounded guard/dependency faults failed their intended production-path tests and were restored**, aggregate captured63.416s: original52/54.714s, late5/5.458s, final2/2.172s and source-pointer1/1.072s. No survivor, syntax/import setup error or old fault batch occurred in these runs. Adjacent `Proof:` comments name observed faults. The later runs did not repeat the original52.

Ignored evidence is under `.superpowers/sdd/observability-environment-parity/task-25b2-evidence/`: `prove.ts`, `prove-extra.ts`, `prove-final.ts`, `prove-pointer.ts`; corresponding JSON manifests/logs retain exact command arrays/selectors, UTC times, exits, elapsed times, failed tests and original/mutated source SHA256s. Commands were `bun <script-path>`; each child used `bun test --preload ./tools/test/scratch/preload.ts <file> -t <selector>`. The native source-boundary fault used `observability-cold-start.test.ts`; other faults used the new adapter test file.

Each mutation child loads raw selected source bytes, rebuilds current source context and reads the actual lock, then calls the same production source/index/selected-map/adapter functions. It never loads cached traits, verdicts or approval. The12-record raw snapshot SHA256 is `b3b73a7ab460def7c23249b95d05e91265e1aa115b1aa9fbcabfe5dfc01b7fdf`. It was exported once from the real pinned render in the dirty implementation worktree based on `a912f6672`; it is a scoped source fixture, not an exact committed-generator or full-attempt receipt. Default tests still render actual locked source. Explicit fixture absence/read/JSON failures throw without a fallback. No full191-resource render ran per fault.

| Fault group                                                                                                     | Observed failure when broken                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Adapter/native source-boundary reuse                                                                            | Changed immutable source bytes were accepted by each consumer                                                          |
| Record/image-role/runtime hash/runtime contract                                                                 | Malformed annotations, duplicate locked roles or changed runtime identities escaped the relevant refusal               |
| Reloader/provider/controller/service chart/image/version/release identity                                       | Missing/overridden flags or foreign selected pin identities were accepted                                              |
| Unsupported-key inspection, mounts, container/Pod policies, placement, host networking, affinity, volumes/media | Exact unsupported paths disappeared or nominal per-replica amounts remained                                            |
| Claim decoder/binding/positive/mode/count and additional-nodeSet claims/resources                               | Empty/foreign/missing/zero/extra claim inputs or malformed resources escaped their boundary                            |
| Source policies and immutable index                                                                             | Removing named metadata/config-out authorization failed actual normalization; aliasing changed shared validated source |
| Malformed callbacks and modeled-only recovery, including extra nodeSets                                         | Contradictory volume unions or request>limit hidden behind CSI became partial outputs                                  |
| Source-memory/effective-Pod state and init order                                                                | Evidence was relabeled observed or provider sequence changed                                                           |
| Exact owner replacement and concrete prerequisites                                                              | Foreign same-kind blockers were replaced or selected prerequisites vanished                                            |
| Nonzero native preservation and no nominal generated charges                                                    | 20MiB/5m/8MiB native costs disappeared or a nominal generated entry was added                                          |
| Combined provider/runtime/derivation closure and source-role pointer                                            | Changed identities no longer changed the receipt, or the CR Pod path was lost                                          |

### Final scoped commands and results

All commands ran with `login:false`, Bun1.4.4 and the repo scratch preload. Bare `openspec` was absent from PATH (exit127); the installed locked CLI was available as `bun node_modules/.bin/openspec`. No required tool remains missing. Authorized outside-root worktree/scratch/static writes used scoped escalation. The final source tests used the default actual-source setup, without `PUNI_GENERATED_TRAITS_FIXTURE`.

| Command                                                                                                                                                                                                                                                                                                                                                                          | Fresh output                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-generated-capacity.test.ts`                                                                                                                                                                                                                                                               | 76 pass,138 assertions,0 fail; Bun6.18s/process6.064s                                   |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-cold-start.test.ts -t 'native bytes expand\|missing source owner\|changed source bytes\|omitted resource\|unexpected runnable kind\|missing native resource map\|Recreate Deployment\|fix1 ordering\|wellformed unsupported hostPath'`                                                    | 11 pass,25 assertions,44 filtered,0 fail; Bun530ms/process0.395s                        |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-preflight.test.ts -t 'source emptyDir without sizeLimit\|source CPU overcommit\|normal Kubernetes CPU overcommit\|fix1 source CPU overhead'`                                                                                                                                              | 4 pass,9 assertions,201 filtered,0 fail; Bun2.72s/process2.569s                         |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-source-render.test.ts -t 'selected provider pin\|selected provider image\|selected reloader flags\|selected source refuses a duplicate\|selected target mutation\|full source invokes selected guard'`                                                                                    | 11 pass,15 assertions,311 filtered,0 fail; Bun4.53s/process4.404s                       |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-parity-rehearsal.test.ts -t 'validated full rendered source exposes\|production source cannot borrow local'`                                                                                                                                                                              | 2 pass,18 assertions,69 filtered,0 fail; Bun7.77s/process7.652s                         |
| `bun node_modules/.bin/tsc --build --force tools/tool-fleet/tsconfig.json`                                                                                                                                                                                                                                                                                                       | Exit0, process1.182s                                                                    |
| `bun node_modules/.bin/eslint tools/tool-fleet/src/observability-generated-capacity.ts tools/tool-fleet/src/observability-generated-capacity.test.ts tools/tool-fleet/src/observability-source-resources.ts tools/tool-fleet/src/observability-source-inventory.ts tools/tool-fleet/src/observability-cold-start.ts tools/tool-fleet/src/observability-parity-rehearsal.test.ts` | Exit0, process4.116s                                                                    |
| `bun node_modules/.bin/prettier --check` with those same six files; `bun node_modules/.bin/openspec validate observability-environment-parity --strict --json`; `git diff --check`                                                                                                                                                                                               | Formatting clean;1 valid change/0 issues/19ms; whitespace clean; combined process1.047s |
| `sha256sum -c .superpowers/sdd/observability-environment-parity/task-25b2-evidence/final-tested-source.sha256` after source commit                                                                                                                                                                                                                                               | All six tested source/test files matched; tracked worktree clean                        |

The one existing selected-reader subset covers the materially changed extraction boundary: original provider pins/images, shared flags, duplicate roles, full-caller invocation and fresh-mutation isolation. It is not a repeat of Task24's old field matrix. Native controls cover the moved closure dependency, real nonzero charges, malformed-before-concurrency behavior and unchanged unsupported hostPath. Preflight controls cover default missing-size refusal and CPU semantics. The final actual wrapper still binds all191 unfiltered resources, eight partial traits, retained-production100Gi requested ES storage, existing native overlap/hostPath blockers, zero complete native charges and the non-authorizing admission stub. A separate combined fixture retains nonzero native charges, CronJob/foreign-owner blockers and changed closure identities. Earlier wrapper TDD red/green controls were recorded; no render matrix was replayed.

Source normal hooks passed: precommit4.18s, lint4.12s, formatting0.45s, plaintext-secrets0.01s, private-nesting0.02s and both trailer hooks0.02/0.01s. Tool Wiki explicitly remains inactive/uncertified because its external activation root is not provisioned; migration/doc-cap routes were inapplicable. All six final tested file SHA256s match source-commit contents after hooks. Self-review resolved the named alias, malformed-rewrite, extra-nodeSet, duplicate-flag and pointer findings; root owns fresh independent review/publication.

### Remaining prerequisites and skipped scope

Traits retain unassessed operator reconciliation/terminating overlap, generated readonly-input memory/backing and mount equality, actual operator/API mutation/template equality, runtime overhead, actual claim/mount binding and complete admitted-Pod/ancestor-cgroup/tmpfs/swap enforcement. Keystore Secret/resource realization remains unobserved. Memory `config-out` has a source-derived P and absent literal cap, with enforcement explicitly unobserved; neither a request nor per-container limit becomes observed Pod enforcement. No commands/selectors/Secret values/Pod or node UIDs/Ready/Bound state were fabricated. Requested PVC size is not actual usage or enforcement.

No full Fleet suite, old render/fault matrix, backend/browser/e2e, build, host gate, Docker/Kubernetes/Flux/lab/runtime/live action, CI workflow/policy/cache action, push, merge or publication ran. Root retains published420 CI ownership. No fresh host capacity, actual startup/init sufficiency, full admission, signals/views/history/recovery or live convergence is claimed. Floor16GiB available,120GiB stores and every runtime/live criterion remain open. Source ownership stops after the evidence commit for root's fresh review.

After writing this evidence, canonical formatting/whitespace and explicit ignored-report formatting passed (process0.310s); final strict scoped OpenSpec returned1 valid change/0 issues/17ms (process0.466s). Only this recorded-check sentence was then added; normal evidence hooks check the final Markdown.

## Task25b2 fix1 — malformed counts and Pod resource policies

Fresh scoped review of `a912f6672..1a4637825` found one Important compound defect: malformed Prometheus shards and Pod-level resource quantities could be reported as valid unsupported traits. No plan conflict or waiver applies. Fix base `1a463782567e53ac3621eacc006b924825772240`; source commit **`5cffee6e354c4c5cafacd0f64f0bc7038eed8b70`** changes only `observability-generated-capacity.ts` and its test file.

Shard counts now decode as nonnegative int32 before unsupported classification. String, negative, fractional, int32-overflow and null values throw `shards-malformed`. Zero remains a valid unsupported source shape with no nominal per-replica bound. This follows the pinned chart CRD and model rather than assuming a positive minimum: `kube-prometheus-stack-91.4.1.tgz` SHA256 `1bd5e7a88e758ed3ec22db0fe6e72b1352f3f0e7e5a93c79979f7edf361becdb` contains `charts/crds/crds/crd-prometheuses.yaml`, whose v1 `spec.shards` is integer/int32/default1 with no minimum. The pinned [CommonPrometheusFields.Shards and ExpectedReplicas](https://github.com/prometheus-operator/prometheus-operator/blob/2e4af1d7d8f0ae634fcf0ac967a76fb381a65542/pkg/apis/monitoring/v1/prometheus_types.go) represent supplied zero directly. The adapter's nonnegative capacity-count boundary rejects negative demand; this is not a claim that the CRD itself declares a minimum. No actual generated Pod cardinality is certified.

One adapter-local requirements validator checks supplied Pod request/limit maps with the existing CPU/memory quantity readers and rejects request>limit for the same resource. It validates selected ECK Pods, every extra nodeSet Pod template and supplied arbitrary Prometheus/Alertmanager Pod templates before those recognized fields can hide inside unsupported classification. Optional request-only, limit-only and empty maps remain valid unsupported policies. Requirement bodies and quantity maps must be records rather than arrays. The helper derives no Pod charge/default cap and supplies no Pod-resource policy to the normalizer. Normalizer/default/cutover behavior, quantity language, source values, pins, pure native charges and `creationAuthority:false` remain unchanged. All valid unsupported controls still return partial traits with `perReplica:null`.

### TDD and bounded new proofs

The first table setup produced3 extra-nodeSet fixture failures: YAML traversal could not edit a plain appended object. Moving those edits into the existing append callback restored the intended setup. Against unchanged production code, the corrected red run was **7 pass/16 failed assertions/30 assertions total/2.43s**: five malformed shard inputs plus eleven malformed Pod quantity/map/type/contradiction cases. After implementing the boundary, those23 controls passed30 assertions/1.85s. New optional-map controls preserve valid partial behavior.

Self-review of the new optional-map decoder found that empty arrays could be treated as objects. An initial empty-array `test.each` row was unpacked as no arguments and caused one YAML Function-value setup failure; wrapping cases as objects corrected the setup. All three actual array-body/request-map/limit-map negatives then failed their intended assertions (0 pass/3 fail/3 assertions/1.166s). Explicit record-kind constraints restored those negatives and optional-map positives (6 pass/9 assertions/1.228s). These setup errors are not counted as production proofs.

**Nine new guard/caller dependency faults failed and restored**, aggregate10.167s. No survivor, fault syntax/import setup failure or replay of the original60 occurred. The original eight took9.022s; the added map-kind fault took1.145s. Adjacent Proof comments name the observed faults.

| New fault                                               | Observed failure when broken                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `shard-count-validation`                                | String/negative/fraction/int32-overflow/null counts became partial                    |
| `pod-requirements-shape`                                | Malformed maps and quantity value types became partial                                |
| `pod-cpu-quantity-reader`, `pod-memory-quantity-reader` | Invalid quantities, wrong dimensional units or negative quantities escaped validation |
| `pod-request-limit-bounds`                              | Selected and extra-template CPU/memory contradictions became partial                  |
| `selected-pod-policy-boundary`                          | Selected ECK malformed Pod quantities disappeared before normalization                |
| `extra-node-policy-boundary`                            | Malformed quantities/bounds hid behind an extra-nodeSet CSI branch                    |
| `unsupported-template-policy-boundary`                  | Malformed Prometheus/Alertmanager template quantities became partial                  |
| `pod-resource-map-kind`                                 | Array requirement bodies and request/limit maps became partial                        |

Exact command arrays, selectors, UTC times, exits, elapsed times and original/mutated source SHA256s are in ignored `.superpowers/sdd/observability-environment-parity/task-25b2-fix1-evidence/{faults,map-kind-faults}.json` and logs. Drivers were `bun .superpowers/sdd/observability-environment-parity/task-25b2-fix1-evidence/prove.ts` and `bun .superpowers/sdd/observability-environment-parity/task-25b2-fix1-evidence/prove-map-kind.ts`; each child invokes the same production adapter through `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-generated-capacity.test.ts -t <recorded-selector>`. They reuse only the original12-record raw snapshot (SHA256 `b3b73a7ab460def7c23249b95d05e91265e1aa115b1aa9fbcabfe5dfc01b7fdf`), rebuild source context and read the actual lock. No cached traits/verdicts, per-fault full rendering or broader audit matrix was used.

### Final affected verification

| Command                                                                                                                                                                                                                                                                                                                              | Fresh output                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-generated-capacity.test.ts -t 'fix1 malformed\|fix1 valid\|selected adapter derives edited\|valid unsupported multiple shards\|valid unsupported Pod resource policy\|shared validated index stays immutable\|combined ledger retains exact'` | 34 pass,78 assertions,71 filtered,0 fail; Bun4.52s/process4.393s; default actual pinned source, no snapshot override |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-workload.test.ts -t 'default calls reject\|default model has no source\|closed observed schema\|source policy Pod resources refuse\|legacy ordering keeps'`                                                                                   | 5 pass,6 assertions,53 filtered,0 fail; Bun189ms/process0.048s                                                       |
| `bun node_modules/.bin/tsc --build --force tools/tool-fleet/tsconfig.json`                                                                                                                                                                                                                                                           | Exit0/process1.104s                                                                                                  |
| `bun node_modules/.bin/eslint tools/tool-fleet/src/observability-generated-capacity.ts tools/tool-fleet/src/observability-generated-capacity.test.ts`                                                                                                                                                                                | Exit0/process3.013s                                                                                                  |
| `bun node_modules/.bin/prettier --check tools/tool-fleet/src/observability-generated-capacity.ts tools/tool-fleet/src/observability-generated-capacity.test.ts`; `git diff --check`                                                                                                                                                  | Clean/process0.189s                                                                                                  |
| `bun node_modules/.bin/openspec validate observability-environment-parity --strict --json`                                                                                                                                                                                                                                           | 1 valid change/0 issues/17ms; process0.568s                                                                          |
| `sha256sum -c .superpowers/sdd/observability-environment-parity/task-25b2-fix1-evidence/final-tested-source.sha256` after source commit                                                                                                                                                                                              | Both tested files match; tracked tree clean before evidence edits                                                    |

Source normal hooks passed: precommit3.82s, lint3.76s, format0.38s, plaintext-secrets0.01s, private-nesting0.03s and trailer hooks0.02/0.01s. Tool Wiki remains explicitly inactive/uncertified. Only the two reviewed source/test files changed. Self-review verified the recognized-field checks precede unsupported outcomes, optional maps stay optional, all extra-nodeSet templates are checked even behind CSI, and no charge calculation or default schema changed. Root owns fresh scoped rereview.

Skipped by the authorized fix scope: original60 proofs, old matrices/full suites, another actual wrapper/gate replay, backend/browser/e2e, build, host/runtime/Kubernetes/Flux/live work, CI actions, push, merge and publication. Previous actual191-resource wrapper evidence remains the previous slice's evidence. No new runtime/host/admission evidence is claimed. Canonical progress stays4/11; concurrency, readonly-input/runtime overhead, effective Pod/claim/mount equality, enforcement, floors and runtime/live criteria remain open.

Final fixround1 evidence formatting/whitespace passed (process0.253s); strict scoped OpenSpec returned1 valid change/0 issues/18ms (process0.520s). Only this recorded-check sentence was then added; normal evidence hooks validate the final Markdown.

## Published checkpoint 420bdbf6 — completed CI evidence

The published draft PR #760 head `420bdbf6bd78c5f96498fcf0693b120f3edf3566` completed CI run `40488001900` and infra-check run `40488001985` successfully. Fresh `gh pr checks 760 --required --json name,state,bucket,link` returned both required verdicts as SUCCESS: [gate](https://github.com/Prosperous-Unification/puni-00/actions/runs/40488001900/job/122161249984) and [pixels](https://github.com/Prosperous-Unification/puni-00/actions/runs/40488001900/job/122145628707). A separate PR read confirmed the exact head and OPEN/draft state. This evidence covers reviewed Tasks 25a and 26; it excludes local Tasks 25b1 and 25b2 and any later commit.

| Evidence                            | Observed outcome                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Workspace job 122134732304          | SUCCESS; 10:23:23–11:22:07 UTC, 58m44s job wall time                                                      |
| Twilight job 122134732446           | SUCCESS; 10:23:24–11:24:39 UTC, 61m15s job wall time                                                      |
| Stable verdicts                     | gate 122161249984 and pixels 122145628707 SUCCESS; all four pixels shards SUCCESS                         |
| Fleet job 122134546365              | SUCCESS; 10:22:57–10:36:48 UTC. Fleet check step 10:24:39–10:35:38 UTC, not asserted to be test-only time |
| Fleet tests                         | 1838 pass / 7 skip / 0 fail; 1845 tests across 77 files, 639.82s reported Bun duration                    |
| Deploy tests in Fleet job           | 828 pass / 0 fail across 32 files, 67.03s; lint/typecheck also succeeded                                  |
| Generic Kubernetes job 122140680536 | SUCCESS; completed 10:51:26 UTC, including existing test:k3s and Traefik rehearsal targets                |

Completed logs were retrieved once after the infra workflow became terminal: `/tmp/puni-pr760-fleet-420.log` (882029 bytes, 3522 lines) and `/tmp/puni-pr760-deploy-420.log` (131533 bytes, 780 lines). Seven opt-in tests in `observability-access-auth.test.ts` remained skipped because `PUNI_AUTH_ELASTIC_LAB` was not supplied. Their exact names match the previous 005 checkpoint; this is not absent-tool suppression. Earlier actual authenticated-backend component receipts remain separate evidence, not a current full observability rehearsal.

Task 26's resource-test file retained all 319 local pre-existing cases and added 3 controls. Comparing the actual CI logs at 005 and 420, its reported case-duration sum fell from 256821.79ms for 318 cases to 55999.26ms for 322 cases. The extra pre-refactor case was introduced by 25a. Fleet's overall reported test duration changed from 801.38s (1772 tests) to 639.82s (1845 tests). These are separate CI runs with additional cases and environmental variance; they do not establish that all job-wall-time change was caused by the refactor. The same 42-case local comparison and caller-removal proof remain in Task 26 evidence.

The first read-only log parser expected non-TTY `(pass)` markers and produced no case timings. It was corrected to the actual checkmark/group-header format, required nonempty 318/322 inventories, and checked all seven skip names before the retained comparison was used. No tests were rerun to obtain these observations. The ignored `published-005-420-timing.json` retains this comparison.

These successful generic CI jobs do not prove full observability Kubernetes/Flux reconciliation, actual generated Pods/cgroups/mounts, complete cold-start admission, stored dev signals/operator views, migration history, recovery or live cutover. Canonical completion remains 4/11. No CI selection/concurrency policy, production activation, persistent credentials, storage retirement or final merge changed.

### Scoped review closure for Tasks 25b1 and 25b2

Task 25b1 received an independent approved review with no findings. Task 25b2's initial independent review found one blocking malformed-before-unsupported gap. Fix source `5cffee6e354c4c5cafacd0f64f0bc7038eed8b70` and evidence `2f778a907dbdcacd55f5669b1a0b3b00f272ac59` received scoped re-review: the finding is addressed, with no new Critical/Important breakage or out-of-scope observations. The re-review inspected the retained 34 affected tests, five default controls and nine new fault logs without repeating them. This closes the bounded source prerequisite, not full admission or runtime acceptance.

Parent checks independently matched the six original tested source hashes and Git blobs before the fix, then matched both final fix files against `task-25b2-fix1-evidence/final-tested-source.sha256` after re-review. An ignored post-evidence handoff helper initially rejected an ArrayBuffer passed to node:crypto; using Uint8Array corrected that metadata-only setup error. Production files and observed fault results were unaffected. Tool Wiki remains inactive/uncertified. The complete published420 CI evidence above excludes these later local commits; the next published checkpoint needs its own CI outcome. Broad final branch review and all canonical runtime/live requirements remain open.

## Task25c1 — bounded retained layer byte facts

2026-10-27, sole source owner in the existing isolated aa39 worktree, clean base `a062792da378d112419e99b3356934d424a9f27d`. Source commit `1ade5dd85590f08da42641bc5d1d52be43ff9f39`; normal source precommit passed in 3.32 s, with prepare/commit-message hooks in 0.01 s each. Parent-owned intent was committed before source: proposal 395 words, strict OpenSpec 1 valid / 0 issues / 17 ms, formatting/whitespace passed and normal precommit 0.35 s, as recorded in the dispatch brief. These parent intent checks were not replayed as implementation evidence. Task 3.1 and the canonical 4/11 count remain unchanged.

`readObjectStoreLayerFacts` is a separate read-only source adapter. The capture validator is shared by capture and `readObjectStoreLayers`; the existing retained import reader and closed receipt contract are unchanged. Field, octal and checksum checks were extracted unchanged into `archive-tar-header.ts` and exercised on both inner and selected outer paths. Complete receipt claims are compared with freshly re-derived archive facts, and output identities come from those verified facts across awaits. No supplied receipt size, descriptor, layer order, buffer count or metadata count becomes independent factual authority.

The adapter identifies its version as `object-store-layer-facts-v1` and includes the actual parser limits: 536,870,912 decoded bytes per layer, 1,073,741,824 decoded bytes aggregate, 100,000 aggregate headers and 256 bytes per path (the intrinsic POSIX prefix/name maximum). Callers may only tighten these caps. Decoder chunk size and source stream high-water mark are 65,536 bytes. These are parser/input bounds, **not total process-memory or filesystem-allocation bounds**. The existing 128 MiB outer archive limit and its full archive buffer remain unchanged; compressed layers are views of those verified bytes. The parser retains only a current tar header and bounded path/type inventory, streams payload/padding, awaits gzip termination, checks all compressed input was consumed and refuses incomplete tar traversal. Unsupported metadata is rejected from its fixed header before its declared body is inspected.

Supported inner formats are selected GNU magic `7573746172202000` and POSIX magic `7573746172003030` layouts, regular files, directories, prior regular-file/hardlink targets, lexical root-confined relative symlinks and zero-payload regular OCI whiteout/opaque markers. GNU extension bytes are not interpreted as a POSIX prefix. PAX/global headers, GNU longname, sparse, device and other types explicitly refuse. No links or member paths are materialized or dereferenced. Hardlinks and whiteouts have separate counts; regular-file payload contributions are summed across all layers without overwrite, deletion or reuse credits. The receipt retains `unpackBytes: 'unknown'`, verification/import memory remain unknown, and the new output separately preserves unknown physical allocation, inode/metadata, heap, import memory and unpack bytes. None is admission authority.

### Bounded format reconnaissance (separate from the production positive)

Before implementation, read-only Python outer-tar metadata inspection and zlib decoding used 65,536-byte output chunks, a 512 MiB per-layer ceiling and 100,000-header ceiling. No extraction, member-body retention or production byte-facts call occurred. It established GNU headers in layer 1, including root `./`, 404 prior-file hardlinks to `bin/[`, `lib64 -> lib`, and `usr/bin/env -> ../../bin/env`; layer 2 uses POSIX ustar. Neither actual layer has PAX, longname, sparse, device or whiteout records. The first-prefix reconnaissance was limited to 65,536 decoded bytes per layer; the subsequent metadata census stayed within the same caps. This format discovery was not the final production positive and did not certify complete byte facts.

### Single actual retained-archive positive

`bun /tmp/task25c1-actual-archive.ts` ran exactly once after the coherent source commit. It reads current committed toolchain/build-lock identities through the existing production readers, validates the historical retained path/hash/size, calls the production facts reader and hashes both archive copies and the receipt before/after using bounded file streams. Fresh binding succeeded; nothing was recaptured or substituted. Inspection took 1,022.065 ms; complete control including before/after identities took 1,199.705 ms. Supplemental safe output is `/tmp/task25c1-actual-archive.json`; this committed section is the canonical evidence.

| Identity                   | Fresh observed value                                                            |
| -------------------------- | ------------------------------------------------------------------------------- |
| Whole archive SHA256       | `ec86717cd36acd1415443b9fa4e52db14c8c15bf607e5160149858aee89ade1c`              |
| Whole archive bytes        | 52,857,344                                                                      |
| Image                      | `docker.io/puni-local/object-store:RELEASE.2025-09-07T16-13-09Z`                |
| Manifest                   | `sha256:6892027e04ff9f75ad83dcff7f459b8cdfa043ac573a9d88a616bd7803890670`       |
| Config                     | `sha256:814c467f9909d74a438727489ca76f1a15f6b431d6f5b1b4a41b9b4f5ba93eed`       |
| Retained image path/mode   | `/tmp/task21-verified-object-store-UlpEEi/object-store/image.oci`, 0400         |
| Retained receipt path/mode | Sibling `archive.json`, 0400, 818 bytes                                         |
| Retained receipt SHA256    | `a12d391516796516e5b7eca88551270ecca22f12ad3ce34270b7b639e8433b0b`              |
| Original archive path/mode | `/home/df/.codex/worktrees/aa39/puni-00/dist/tool-fleet/object-store.oci`, 0664 |
| Before/after preservation  | Both archives and the receipt have identical size, hash and mode before/after   |

| Layer SHA256 (ordered)                                                    | Compressed bytes | Decoded tar bytes | Logical regular payload | Entries | Files | Directories | Hardlinks | Symlinks | Whiteouts |
| ------------------------------------------------------------------------- | ---------------: | ----------------: | ----------------------: | ------: | ----: | ----------: | --------: | -------: | --------: |
| `sha256:034d6572bf287fa79604fee9be062f0683809ae3a3685bc7b0e17bd1c48c50e8` |        2,206,402 |         4,648,960 |               4,417,150 |     442 |    16 |          20 |       404 |        2 |         0 |
| `sha256:2336feaa98bfd45e7d318a7fa039d8df895dedf02eb10034728f54fd71cf3dc9` |       50,640,035 |       141,529,600 |             141,525,360 |       5 |     2 |           3 |         0 |        0 |         0 |
| Total                                                                     |       52,846,437 |       146,178,560 |             145,942,510 |     447 |    18 |          23 |       404 |        2 |         0 |

### Focused verification and failures

All Bun commands ran from the assigned worktree, Bun 1.4.4. The test prelude is `bun test --preload ./tools/test/scratch/preload.ts`; each test command below ends with `--timeout=30000`. No full Fleet, old 42-fault batch, old matrix, backend/browser, build, host gate or CI replay was run.

| Exact command                                                                                                                                                                                                                                                                                                           | Fresh outcome                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/object-store-layer-facts.test.ts --timeout=30000`                                                                                                                                                                                              | Final source: 46 pass / 0 fail, 472 ms. Earlier restored run 466 ms; initial 38-case implementation 248 ms. Real tiny gzip/tar fixtures use the same production reader. |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/object-store-archive.test.ts --test-name-pattern 'freezes the complete\|symlink source\|changed retained\|refuses (checksum\|octal\|ambiguous-name\|header-prefix\|terminator\|truncated\|duplicate\|layer\|padding) archive' --timeout=30000` | 12 pass / 0 fail / 41 filtered, 233 ms. Existing capture/import stdin/ID positive uses command doubles only, plus changed shared header/archive seams.                  |
| `python3 /tmp/task25c1-guard-proofs.py`                                                                                                                                                                                                                                                                                 | 32/32 isolated faults caught, every mutant exit 1 with a named failed test; 6.179 s summed test wall time; unconditional source restoration after each.                 |
| Final gzip proof using the same focused Bun command with `--test-name-pattern 'refuses gzip truncated$'` and temporary `finishFlush: 2`                                                                                                                                                                                 | Caught, exit 1, 0.172 s after removing the unsupported decoder HWM option; restored. Only this changed seam was re-proved.                                              |
| `bunx eslint tools/tool-fleet/src/{archive-tar-header.ts,object-store-archive.ts,object-store-layer-facts.ts,object-store-layer-facts.test.ts}`                                                                                                                                                                         | Exit 0, no diagnostics.                                                                                                                                                 |
| `bunx nx run tool-fleet:typecheck`                                                                                                                                                                                                                                                                                      | Exit 0, uncached, 1.9 s.                                                                                                                                                |
| `bunx prettier --check tools/tool-fleet/src/{archive-tar-header.ts,object-store-archive.ts,object-store-layer-facts.ts,object-store-layer-facts.test.ts}`                                                                                                                                                               | Exit 0, all matched files formatted.                                                                                                                                    |
| `node_modules/.bin/openspec validate observability-environment-parity --strict --json`                                                                                                                                                                                                                                  | Exit 0, 1 valid / 0 failed/issues, 16 ms. Installed repository binary used because bare `openspec` is absent.                                                           |
| `git diff --check`                                                                                                                                                                                                                                                                                                      | Exit 0 before source commit.                                                                                                                                            |
| `git commit -m 'Derive bounded digest-bound object store layer byte facts'`                                                                                                                                                                                                                                             | Normal hooks passed: precommit 3.32 s; source commit above.                                                                                                             |
| `bun /tmp/task25c1-actual-archive.ts`                                                                                                                                                                                                                                                                                   | Exit 0, one production positive, timings and identities above.                                                                                                          |

Initial scaffolding RED was a missing-module error (0 pass / 1 fail / 1 error, 36 ms), not a behavioral refusal proof. The first scoped static run found the limit-map literal type and Bun `.rejects` assertion typings; replacing test assertions with awaited Node `rejects` and explicitly typing the mutable copied limits corrected these. That assertion conversion initially left duplicate commas: format, lint, typecheck and test failed at parse time (0 pass / 1 fail / 1 error, 32 ms); fixed before further work. A later typecheck rejected `highWaterMark` on the installed `ZlibOptions`; removed that decoder option, retained the source stream watermark and decoder chunk-size setting, re-proved only gzip finalization, and final static/tests passed. These mechanical failures supply no behavior evidence.

Behavioral TDD controls caught two self-review findings before their fixes: caller receipt mutation during decoding and non-directory `a/` spelling (0 pass / 2 fail, 185 ms); output now uses re-derived immutable values and non-directory spelling refuses. A local bounded decoder characterization showed gzip accepts trailing compressed zeroes while `bytesWritten` excludes them; its production-path regression failed without the new comparison (0 pass / 1 fail, 177 ms), then passed. Both guards/bindings were also in the 32-fault table below. No mutation remains.

### R5 watched proof table

For each row, the production mutation and its focused `--test-name-pattern` below ran through `object-store-layer-facts.test.ts`, exited 1 with a failed test, and was restored in `finally`. Some checks deliberately assert the first contextual refusal: removing them can encounter a later refusal, which does not rescue that boundary. The decoder non-byte test injects a string-yielding real stream dependency in a subprocess; gzip finalization is weakened with `Z_SYNC_FLUSH`. Adjacent source `Proof:` comments identify these observations. Supplemental mutation outcomes are `/tmp/task25c1-guard-proofs.json`; the permanent table is authoritative.

| Injected production fault                                      | Focused test pattern              | Seconds | Observed                      |
| -------------------------------------------------------------- | --------------------------------- | ------: | ----------------------------- |
| Object store layer facts limit is invalid                      | `path bounds and caller-expanded` |   0.181 | Exit 1, failed test; restored |
| Object store layer facts limit exceeds ceiling                 | `path bounds and caller-expanded` |   0.174 | Exit 1, failed test; restored |
| Object store layer has an unsupported or unsafe path           | `refuses traversal$`              |   0.173 | Exit 1, failed test; restored |
| Object store layer has an unsafe symlink                       | `unsafe symlink text`             |   0.181 | Exit 1, failed test; restored |
| Object store layer symlink escapes root                        | `refuses symlink escape$`         |   0.188 | Exit 1, failed test; restored |
| Object store layer has an unsupported tar dialect              | `refuses dialect$`                |   0.200 | Exit 1, failed test; restored |
| Object store layer has unsupported extended header metadata    | `refuses GNU extended metadata$`  |   0.188 | Exit 1, failed test; restored |
| unsupported type                                               | `refuses unsupported PAX$`        |   0.210 | Exit 1, failed test; restored |
| Object store layer non-directory path has directory spelling   | `directory spelling`              |   0.197 | Exit 1, failed test; restored |
| Object store layer has a duplicate path                        | `refuses duplicate path$`         |   0.200 | Exit 1, failed test; restored |
| Object store layer path has a non-directory ancestor           | `refuses symlink ancestor$`       |   0.212 | Exit 1, failed test; restored |
| Object store layer member size exceeds bound                   | `expanded declared member size`   |   0.172 | Exit 1, failed test; restored |
| Object store layer non-link contains link metadata             | `regular link metadata`           |   0.197 | Exit 1, failed test; restored |
| Object store layer has an ambiguous or unsupported whiteout    | `refuses whiteout payload$`       |   0.176 | Exit 1, failed test; restored |
| Object store layer non-file has a payload                      | `refuses directory payload$`      |   0.210 | Exit 1, failed test; restored |
| Object store layer hardlink target is not a prior regular file | `hardlink absent target`          |   0.171 | Exit 1, failed test; restored |
| Object store layer decoder returned non-byte output            | `decoder dependency yielding`     |   0.406 | Exit 1, failed test; restored |
| Object store layer expansion exceeds bound                     | `bounded decoded expansion`       |   0.164 | Exit 1, failed test; restored |
| Object store layer has nonzero member padding                  | `refuses nonzero padding$`        |   0.177 | Exit 1, failed test; restored |
| Object store layer has an invalid terminator                   | `refuses nonzero tail$`           |   0.192 | Exit 1, failed test; restored |
| Object store layer member count exceeds bound                  | `bounded aggregate members`       |   0.235 | Exit 1, failed test; restored |
| Object store layer gzip input consumption is incomplete        | `ignored compressed zero padding` |   0.192 | Exit 1, failed test; restored |
| Object store layer has an incomplete tar traversal             | `refuses tar truncation$`         |   0.187 | Exit 1, failed test; restored |
| Object store layer facts receipt differs from verified bytes   | `refuses forged receipt config$`  |   0.171 | Exit 1, failed test; restored |
| receipt schema                                                 | `malformed receipt schema`        |   0.183 | Exit 1, failed test; restored |
| Object store archive has an ambiguous header                   | `refuses ambiguous header$`       |   0.170 | Exit 1, failed test; restored |
| Object store archive has invalid octal metadata                | `refuses octal$`                  |   0.185 | Exit 1, failed test; restored |
| Object store archive header checksum differs                   | `refuses checksum$`               |   0.171 | Exit 1, failed test; restored |
| weaken gzip finalization                                       | `refuses gzip truncated$`         |   0.190 | Exit 1, failed test; restored |
| aggregate decoded bound                                        | `aggregate expansion across`      |   0.170 | Exit 1, failed test; restored |
| bind output to caller again                                    | `caller edits`                    |   0.191 | Exit 1, failed test; restored |
| ignore POSIX prefix                                            | `uses POSIX prefix`               |   0.165 | Exit 1, failed test; restored |

### Remaining limits and handoff

Source self-review inspected all four changed source/test files and the archive extraction diff, preserving all original outer refusals, error order and the 128 MiB cap. The capture/helper change only shares validation and current verified views; it does not change import-reader behavior. No Docker, extraction, import, build, pull, host/cluster/runtime/store mutation, credential change, publication, cancellation or merge occurred.

Physical allocation, inode/metadata amplification, cache/content/snapshot copies, total heap/process/import demand and runtime enforcement remain unmeasured/unknown. No process-memory allowance was guessed or measured by this slice. Complete graph/lifecycle/hostPath/capacity/admission/live criteria, the canonical 4/11 count, independent 16 GiB floor and retained 120 GiB stores remain open/unchanged. Full host/CI gates and runtime checks were intentionally skipped as outside this authorized bounded source slice; root owns fresh review and publication. Tool Wiki hook reported inactive/uncertified because the external activation root is unprovisioned; migration/doc-cap routes were inapplicable to the source commit. Final canonical evidence formatting and whitespace passed; strict scoped OpenSpec returned 1 valid / 0 issues / 16 ms. Normal evidence-commit hooks and commit identity are recorded in the ignored handoff report.

## Task25c1 fixround1 — whiteout targets and ancestor closure

2026-10-27, original sole implementer resumed from clean base `b8774b0b113e5169b86a066ffebbd498ecb6bbfb`. Fresh scoped review reported two Important malformed-input gaps: `.wh..` / `.wh...` encoded deletion targets `.` / `..`, and ancestor checking only rejected incompatible headers appearing before their descendants. New production-path fixtures reproduced both findings. This restores the existing complete supported-layer refusal contract; no intent/spec change or waiver was needed.

Source commit `d26a02be0850d35d45346797ec21d7e1fbf11d6c` changes only `object-store-layer-facts.ts` and its tests. Whiteout validation now checks the stripped deletion basename, rejecting empty, dot, dotdot and reserved whiteout targets while preserving normal/dotfile/three-dot basenames and the explicit opaque marker. A per-layer directory-requirements set records ancestors established by descendants; later regular files, symlinks and hardlinks cannot replace those required directories. Valid later explicit directory headers remain accepted. Both ancestor orders, nested paths and all three incompatible forms are exercised. The existing prior-ancestor and duplicate rules remain strict.

The directory-requirements inventory remains bounded by the existing aggregate header/path ceilings. It is no process-memory estimate. Parser caps, verified identity binding, output schema/count arithmetic, supported formats, unknown physical/allocation/inode/heap/import/unpack fields, the 128 MiB outer archive guard and import behavior are unchanged. Self-review read the complete two-file diff and verified both orderings, explicit-directory exemption, per-layer state, whiteout opaque exception and restored proof mutations. No tar framework or new format was added.

### Focused commands and observed outcomes

| Exact command                                                                                                                                                                                           | Outcome                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/object-store-layer-facts.test.ts --test-name-pattern 'whiteout deletion\|explicit opaque' --timeout=30000` before whiteout fix | 1 pass / 2 fail / 46 filtered, 204 ms; both dot-target cases lacked expected rejection.                                                                       |
| Same reader command with `--test-name-pattern 'whiteout deletion\|explicit opaque\|whiteout payload\|ambiguous whiteout'` after whiteout fix                                                            | 5 pass / 0 fail / 44 filtered, 185 ms.                                                                                                                        |
| Same reader command with `--test-name-pattern 'ancestor with\|explicit nested directory'` before ancestor fix                                                                                           | 5 pass / 3 fail / 49 filtered, 181 ms; all descendant-first incompatible forms lacked expected rejection.                                                     |
| Same reader command with `--test-name-pattern 'ancestor with\|explicit nested directory\|whiteout deletion\|explicit opaque'` after both fixes                                                          | 11 pass / 0 fail / 46 filtered, 177 ms.                                                                                                                       |
| `python3 /tmp/task25c1-fix1-proofs.py`                                                                                                                                                                  | 5/5 new isolated faults caught; every mutant exited 1 with a named failed test; 0.955 s summed test wall time; unconditional restoration after each.          |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/object-store-layer-facts.test.ts --timeout=30000`                                                                              | Final affected reader: 57 pass / 0 fail, 560 ms; includes all default-limit, ordered byte-count, identity, complete gzip/tar and prior safety controls.       |
| `bunx eslint tools/tool-fleet/src/object-store-layer-facts{,.test}.ts`                                                                                                                                  | Exit 0, no diagnostics.                                                                                                                                       |
| `bunx nx run tool-fleet:typecheck`                                                                                                                                                                      | Exit 0, uncached, 2.8 s.                                                                                                                                      |
| `bunx prettier --check tools/tool-fleet/src/object-store-layer-facts{,.test}.ts`                                                                                                                        | Exit 0, all matched files formatted.                                                                                                                          |
| `git diff --check`                                                                                                                                                                                      | Exit 0 before source commit.                                                                                                                                  |
| `git commit -m 'Reject ambiguous whiteouts and reversed layer ancestor conflicts'`                                                                                                                      | Normal precommit passed in 3.26 s: lint 3.22 s, format 0.32 s, plaintext-secrets 0.01 s, private-nesting 0.03 s, Tool Wiki 0.00 s; trailer hooks 0.01 s each. |
| `bun /tmp/task25c1-fix1-actual-archive.ts`                                                                                                                                                              | Exit 0, one post-fix production control; identities/counts/preservation below.                                                                                |

The proof harness initially expected a pre-format line indentation and refused with an assertion before any mutation/test; this was a harness setup failure, not evidence of a production guard. Matching the actual formatted expression corrected it. No original 32-fault batch, full Fleet, unchanged outer archive matrix or default import tests were replayed. Only the affected reader suite and five new guard/dependency/exemption proofs ran.

### New watched proofs

Each mutation ran the reader test command above with the exact `--test-name-pattern` below, exited 1 with a failed test, then restored source in `finally`. Failure stdout/stderr, exact argument arrays and timings are retained in the ignored fix evidence. Adjacent `Proof:` comments name each observation.

| Injected fault                        | Focused test pattern                                      | Seconds | Observed                      |
| ------------------------------------- | --------------------------------------------------------- | ------: | ----------------------------- |
| allow whiteout dot target             | `whiteout deletion target \.$`                            |   0.175 | Exit 1, failed test; restored |
| allow whiteout dotdot target          | `whiteout deletion target \.\.$`                          |   0.203 | Exit 1, failed test; restored |
| remove later ancestor refusal         | `regular file ancestor with descendant first`             |   0.194 | Exit 1, failed test; restored |
| drop descendant directory requirement | `symlink ancestor with descendant first`                  |   0.208 | Exit 1, failed test; restored |
| reject valid later directory header   | `explicit nested directory headers with descendant first` |   0.175 | Exit 1, failed test; restored |

### Authorized retained-archive regression control

The changed per-entry guards affect actual supported-format acceptance, so one fresh read-only retained positive was authorized and run after the coherent fix source commit. It was not a replay of unchanged source acceptance. The control binds source revision `d26a02be0850d35d45346797ec21d7e1fbf11d6c`, the same historical retained path, current committed lock readers and whole archive SHA256 `ec86717cd36acd1415443b9fa4e52db14c8c15bf607e5160149858aee89ade1c`, 52,857,344 bytes. Its entire facts object exactly matched the prior positive, including ordered layer identities, all counts, parser caps and unknown fields. Inspection took 1,113.190 ms; control total 1,308.853 ms. No extraction/import/build/pull/Docker/cluster action occurred.

| Account                 |   Layer 1 |     Layer 2 |       Total |
| ----------------------- | --------: | ----------: | ----------: |
| Compressed bytes        | 2,206,402 |  50,640,035 |  52,846,437 |
| Decoded tar bytes       | 4,648,960 | 141,529,600 | 146,178,560 |
| Logical regular payload | 4,417,150 | 141,525,360 | 145,942,510 |
| Entries                 |       442 |           5 |         447 |

Counts remain 18 regular files, 23 directories, 404 hardlinks, 2 symlinks and 0 whiteouts. Both archive copies and the retained receipt have identical before/after sizes/hashes/modes: original `/home/df/.codex/worktrees/aa39/puni-00/dist/tool-fleet/object-store.oci` mode 0664, retained `/tmp/task21-verified-object-store-UlpEEi/object-store/image.oci` mode 0400 and sibling `archive.json` mode 0400. Receipt remains 818 bytes with SHA256 `a12d391516796516e5b7eca88551270ecca22f12ad3ce34270b7b639e8433b0b`. The original positive artifacts were preserved; the new safe summary is `/tmp/task25c1-fix1-actual-archive.json`.

Canonical progress remains 4/11; no runtime checkbox, floor, store, credential, host, CI/publication or ownership action changed. Full graph/lifecycle/admission, physical allocation/inode/cache amplification, heap/process/import memory, effective enforcement and runtime/live criteria remain open. No arbitrary memory allowance was supplied. Backend/browser/full gates/CI/runtime were intentionally out of scope. Final scoped OpenSpec/evidence formatting and normal evidence hooks are recorded in the ignored `task-25c1-fix1-report.md`; root owns fresh scoped re-review and publication. Tool Wiki remains inactive/uncertified because its external activation root is unprovisioned; inapplicable migration/doc-cap routes were skipped.

### Task 25c1 scoped review closure

The initial independent review found two blocking supported-path gaps: dot/dotdot whiteout targets and descendant-first conflicting ancestors. Fix source `d26a02be0850d35d45346797ec21d7e1fbf11d6c` and evidence `fe21d68131b37a4671f88d4e80bec2b4d58e684c` passed scoped re-review: both findings addressed, no new Critical/Important breakage or out-of-scope observation. The reviewer inspected the five retained fault failures and the authorized post-fix retained-archive control without replaying them. Parent independently checked both final tested source hashes. This closes deterministic byte inspection, not physical allocation, process memory, full admission or runtime acceptance.

### Published checkpoint 886465613 — infra results and main CI observation

PR #760 checkpoint `88646561321d4163c18023495051f2bb92d63a62` completed infra-check run `40503029484` successfully: Fleet job `122185222022` and generic Kubernetes job `122191190870` both passed. Fleet reported 2001 pass / 7 skip / 0 fail, 2008 tests across 79 files, 592.38s. Deploy tests reported 828 pass / 0 fail across 32 files, 66.86s; lint/typecheck succeeded. The generic job completed existing test:k3s and Traefik rehearsal targets, not full observability acceptance.

Completed logs were retrieved once: `/tmp/puni-pr760-fleet-886.log` (927533 bytes, 3691 lines) and `/tmp/puni-pr760-deploy-886.log` (130684 bytes, 774 lines). All seven optional authenticated-backend test names match checkpoint420; the actual backend profile was not enabled in this CI run. The ignored `published-886-ci.json` retains exact counts and names. This is scoped CI evidence for the published provider changes and excludes the later local archive implementation.

At the last main CI observation, 2026-10-27 13:06:12 UTC, run `40503029547` remained in progress with workspace `122185432997` and Twilight `122185433126` live. All pixels shards and stable pixels `122194026618` succeeded. A required gate success is not inferred from these partial outcomes. No job was cancelled, restarted or rerun. Canonical progress remains 4/11; generated runtime enforcement, complete source/host admission, actual stored signals/views/history/recovery and live cutover remain open.

## Task25c2a — retained validated stage and chart inventory

Source commits: `ef8c7b2ec05ddc10ee9631d3fa2ebd06f8169a44`, namespace correction `81dd393dd1060863e6bf807509ddef7aa90ba0a4`, optional source-state correction `d93bc7e869aa2d63ceac416f40ad38812988bfba`, and final identity correction `f20008047994359de1cda45f783078be4072d4f6`. Base: `c4d0ab8f31b3b277b9e1f13090b64b98b4080702`. Sole source owner; no push, merge, target or credential changes. Canonical progress stays **4/11** and 3.1 remains open.

The validator now returns its retained `RehearsalStageBuild[]` through `validateObservabilityRehearsalBuilds`; legacy prepare/validate still return their existing receipt. `inventoryObservabilityRehearsal(root, tools, input, directory, helmArchive?)` consumes that single validation/build pass and renders each discovered release once through the existing renderer. Explicit private archive selection has no fallback; the four-argument convenience uses the existing canonical cache. Shared `decodeRenderedResources` preserves the old observability API/default-namespace adapter. Native PodSpec extraction and the existing pure resource validator are reused; returned quantity maps are detached. No quantity or replica totals are derived.

The parent supplied pre-code intent evidence: proposal397 words, strict OpenSpec1 valid/0 issues19ms and normal intent hooks0.35s. These are inherited dispatch records, not rerun claims. Local OpenSpec status/apply returned `sdd-lean`, ready,4/11. Bare `openspec` was unavailable (127); the installed repository binary was used successfully.

### Actual public entry and final-source control

The full public entry passed on clean **d93bc7e869aa2d63ceac416f40ad38812988bfba**, with source and generator revisions equal and `generator.dirty:false`: **1 pass/0 fail,16 assertions,9.71563s case/10.23s Bun/10.33s process**. It retained11 stages,12 release declarations/expansions,23 frames and364 objects (140 stage/224 expansion). These are source object counts, not observed workload or capacity totals. It records32 native image references,8 claim/reference/template facts and11 objects with hook annotations. Four exact image references remain unmapped to lock strings; one IngressClass scope remains adapter-unresolved. All84 unresolved obligations remain visible.

Inventory SHA256: `93f77fae585669a72cdfc69b8d302d182858a8092f289e9bd8af3455f71bda14`; packet artifact SHA256: `744392b5c360739e2f9ed887f8e0e10c2a13ad5c8666ec963af3937e994da758`. Helm archive SHA256 is `86584a54def73570558f66f5111cc53dfed56689637ae32c1201205d494f54fb`; verified `linux-amd64/helm` executable SHA256 is separately `57ce7fc4ea77b28ee6fa91ae071abcade74d3f524e80c9decff5877a5ac8eda4`. The retained archive is privately copied and extracted through `installLockedTool`; inventory itself never downloads. Capability1.35.0 remains the renderer's source fixture with `observed:false`.

Self-review found that scope classification partitioned one physical group/kind/namespace/name identity across a resolved CRD version and an unresolved version. **f200** removes classification from the identity tuple while leaving unknown scope/namespace unresolved. Mixed-version duplicate RED and distinct-namespace positive were followed by GREEN and one watched scope-restoration fault. No chart rerender followed this correction. The final committed adapter consumed frozen **d93** stage/chart captures and matched every public-entry fact exactly: **2.30818s fold/2.90s process**,364 objects/84 unresolved. This is a final-source captured-core control, not a public-entry receipt for f200.

Retained receipts: [public entry](/tmp/puni-task25c2a-evidence/full-entry-final.log), [source summary](/tmp/puni-task25c2a-evidence/source-summary.json), [public receipt](/tmp/puni-task25c2a-evidence/full-entry-final-receipt.json), [f200 captured-core control](/tmp/puni-task25c2a-evidence/final-source-core-control.log), [immutable capture identities](/tmp/puni-task25c2a-evidence/immutable-captures.json), [final source hashes](/tmp/puni-task25c2a-evidence/final-source-hashes.json). Raw captures remain private mode0400; they were not copied into the repository.

### Commands and results

All commands ran in `/home/df/.codex/worktrees/aa39/puni-00` with `login:false`. Exact fault commands, exit codes and timings are in [all proof receipts](/tmp/puni-task25c2a-evidence/all-proofs.json); logs and scripts remain under that private evidence directory.

```bash
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-rehearsal-inventory.test.ts
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-parity-rehearsal.test.ts --test-name-pattern 'packages exact|packaged graph refuses|packaged broad legacy|packaged Secret refuses|packet file closure|altered receipt|same-version substituted kubectl|controller barrier builds|controller barrier refuses|controller barrier independently refuses|controller barrier rejects empty|validated full rendered source'
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-projection-render.test.ts --test-name-pattern 'renderer refuses.*required Helm dependency|renderer refuses a changed pinned chart'
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/platform.test.ts --test-name-pattern 'plain workload image|unlocked init container|registry image digest'
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-parity-rehearsal.test.ts --test-name-pattern 'validated full rendered source exposes native subset'
bunx tsc --build --force tools/tool-fleet/tsconfig.json
bun node_modules/.bin/openspec validate observability-environment-parity --strict --json
```

Final focused output: **73 pass/0 fail,109 assertions,2.38s** (2.39s process). Related legacy packet/control output:24 pass/0 fail,66 assertions,68.60s; renderer dependencies/pins:5/0,14.47s; native image controls:3/0,7.11s. After the shared validator return seam, the scoped old191-object/eight-trait wrapper passed again:1/0,17 assertions,8.05s (8.08s process). Its strict direct null/absent/array refusals and detached map behavior are also covered by the focused suite.

Final identity-fix typecheck exited0 in1.97s; format check exited0 in0.40s. The scoped ESLint checks and each normal source commit's staged lint/format passed. The most recent pre-evidence strict OpenSpec check returned1 valid/0 issues. Source commit process times were5.46s,3.66s,4.22s and3.80s respectively. Tool Wiki reported inactive/uncertified because its external activation root is absent; plaintext-secret/private-nesting and trailer hooks passed. Migration/doc-cap hook routes were inapplicable. No hook was bypassed.

Actual public-entry command on d93:

```bash
PUNI_REHEARSAL_INVENTORY_EXPORT=/tmp/puni-task25c2a-evidence/full-entry-final-receipt.json PUNI_REHEARSAL_FRAMES_EXPORT=/tmp/puni-task25c2a-evidence/full-entry-final-raw.json /usr/bin/time -f 'elapsedSeconds=%e' bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-rehearsal-inventory-entry.test.ts
/usr/bin/time -f 'elapsedSeconds=%e' bun /tmp/puni-task25c2a-evidence/final-source-core-control.ts
```

### Red, refusal and R5 lineage

Initial missing-module and placeholder failures were setup reds, not semantic acceptance. The first implementation also exposed a schema named `Map` shadowing the constructor; the name was corrected. Semantic REDs then independently exposed missing release declarations, coherent chart-version drift, API-group duplicate ownership, foreign PVC APIs, namespace precedence, nullable metadata, malformed map arrays, missing native resource visibility, quantity/limit contradictions, returned-map aliasing, invalid/zero claim quantities and mixed resolved/unresolved owners. Final73/0 output follows their corrections.

Two real public-entry refusals are preserved: ef8 rejected intentional cross-namespace chart metadata (9.74326s case/10.26s process);81dd rejected optional `annotations:null` (8.71567s case/9.15s process). The latter retained the actual raw outputs, reused offline for subsequent field/model corrections. Null annotations are now explicit absent/null/map facts; malformed annotation maps/values still throw, while ordinary empty annotation strings remain valid. Native resource maps likewise retain absent/null/map; source request/limit maps are emitted only when declared. No resource values or pins changed.

**48 isolated faults were caught and restored,28.823s aggregate.47 remain applicable; the blanket release/object namespace equality proof is superseded and is not claimed as a current guard.** Adjacent `Proof:` comments identify the observed faults. The initial hook fault was masked by an earlier null-map-value refusal; quoting an empty string isolated the intended hook check. A hash-only namespace fault was still refused by resource closure; the combined frame-contract fault was then watched. The original empty-claim shape proof was re-proved with the added quantity-reader dependency broken. These refinements and both failed fault setups remain recorded rather than counted as successful first attempts. No original proof batch was replayed after corrections.

| Guard/dependency group                  | Caught faults                                                                                                                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage/frame/release closure             | 10: stage-contract, expansion-owner, frame-owner, frame-hash, resource-closure, required-declaration, chart-pin, release-identity, declaration-equality, empty-expansion                                         |
| Namespace/API/CRD/physical identity     | 12: cluster-namespace, duplicate-crd, malformed-crd, duplicate-object, group-owner, native-api, claim-api, unknown-scope, crd-scope-resolution, metadata-precedence, namespace-frame-contract, mixed-scope-owner |
| Native/claim/hook/structural boundaries | 10: container-image, pod-required, claim-reference, claim-template, hook-required, yaml-errors, list-members, claim-quantity-reader, claim-positive, claim-shape-reader                                          |
| Optional annotations                    | 4: nullable-annotations, annotation-array, annotation-maptype, annotation-state                                                                                                                                  |
| Native resource maps/aliases            | 6: nullable-resources, resource-state, missing-resource-maps, native-resource-validator, resource-map-fabrication, resource-alias                                                                                |
| Archive/selected executable             | 3: archive-source, archive-hash, selected-executable                                                                                                                                                             |
| Visible uncertainty                     | 2: provider-hidden, helper-hidden                                                                                                                                                                                |
| Superseded namespace rule               | 1: release-namespace                                                                                                                                                                                             |

### Limits and outstanding work

The six native roles lacking resource maps remain concrete unresolved request/limit declarations: cert-manager controller/cainjector/webhook/startupapicheck, Traefik and the Velero AWS-plugin init container. Four exact image-reference links and adapter-unmodeled IngressClass scope remain unresolved; no repository-alias inference was added. Provider realization, bootstrap/lifecycle/helper closure, runtime capability equality and all capacity/admission work remain separate. Task25c2b and C3 were not implemented.

The receipt remains `runnableClosure:incomplete`, `creationAuthority:false`, `runtimeRehearsal:false`, `transportObserved:not-evaluated`. This does not relabel the existing authenticated source-binding implementation or change legacy receipt fields. No Pod/UID/Ready/Bound/cgroup or host observation was fabricated.

Full Fleet/Nx gates, old broad render/fault matrices, old archive probes, backend/browser/runtime/transport/host gates and CI replay were intentionally not run. No Docker/build/import/OCI extraction, target mutation, publication, store or secret action occurred; only the explicitly required verified Helm member was privately extracted. Parent owns CI/publication and the separate preflight test-hermeticity finding. Full-goal floors, stores, actual signals/views/history and dev cutover remain open.

### Task25c2a fix1 — preserve individual null quantity maps

I1 is fixed in source `f135ae2c0e1ac9d9f2225779f70757313e234d04` with the test-only readonly-expectation correction `ad987d36173b846b1064570520a034bac012b901`, from FIXBASE `46a4e6a65e8a88ed29f372f0ac03711600515347`. Each request/limit map now retains `absent | null | map` independently. The inventory adapter validates its outer map, sends only supplied non-null maps to the unchanged strict `assertPodResources`, emits only actual quantity maps, and names null/missing declarations as unresolved. No legacy schema, default map/cap, quantity decoder, value, pin or CI policy changed. The shared validator is byte-identical to FIXBASE.

Source-first RED: 5 null-state cases failed,11 controls passed,629ms. Final focused selection: **33 pass/0 fail,62 assertions,671ms** (0.69s process), covering18 new I1 cases plus15 related native/shared-boundary controls. The first scoped typecheck found two test-only readonly-array overload errors; copying the literal expected arrays corrected them. Restored typecheck exited0 in1.81s; scoped ESLint exited0 in4.36s; formatting exited0 in0.40s. Normal source commit processes passed in3.84s and3.21s.

```bash
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-rehearsal-inventory.test.ts --test-name-pattern 'fix1 |native resource .* refuses|nullable native resources|actual native request and limit|existing shared resource boundary'
python3 /tmp/puni-task25c2a-fix1/proofs.py
bunx tsc --build --force tools/tool-fleet/tsconfig.json
bunx eslint tools/tool-fleet/src/observability-rehearsal-inventory.ts tools/tool-fleet/src/observability-rehearsal-inventory.test.ts
bunx prettier --check tools/tool-fleet/src/observability-rehearsal-inventory.ts tools/tool-fleet/src/observability-rehearsal-inventory.test.ts
bun /tmp/puni-task25c2a-evidence/final-source-core-control.ts
```

R5: **8/8 new narrow faults caught and restored,6.108s**: request-null-selection, limit-null-selection, request-null-state, limit-null-state, null-map-obligation, outer-map-kind, supplied-map-validation and no-fabricated-request-map. Each produced the intended focused test assertion failure; adjacent `Proof:` comments identify the observed dependency. [Exact fault commands/results/timings](/tmp/puni-task25c2a-fix1/proofs.json), [RED](/tmp/puni-task25c2a-fix1/red.log), [restored focused output](/tmp/puni-task25c2a-fix1/focused-restored.log).

The committed **ad987** adapter's retained-input control matched every frozen **d93** public-entry fact:364 objects/84 unresolved,2.17214s fold/2.74s process. This is a changed-core equality control, not a new public entry. The d93 actual public-entry receipt remains the only claimed full-entry positive. [Control output](/tmp/puni-task25c2a-fix1/captured-control.log), [source identities](/tmp/puni-task25c2a-fix1/source-hashes.json).

| Changed source/test file                                         | SHA256 at ad987                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `tools/tool-fleet/src/observability-rehearsal-inventory.ts`      | `d485bb71eeb6c33303c3239e1ad67bb3145e1c210aca4c96560e4ce3b4047d6f` |
| `tools/tool-fleet/src/observability-rehearsal-inventory.test.ts` | `6385720f4b946f624f38be7fe4b830fd1fb16812bd5383d7add2fde7b4e4278b` |

The original73-case suite/48-fault batch, chart renders, public entry and broader runtime/host/CI gates were not replayed. No large captures were copied. Scope stayed I1 plus its fixture type correction; all prior unresolved/runtime/admission limits and canonical4/11 remain unchanged. Root owns scoped fix review.

## Task27 — deterministic required-command absence

Source `9bcae1794eb02d04c7602394d43697350dbafa7e`, from clean BASE `b74e0446e01819459615bd44edcda4c1990b1916`. This restores the existing actual CLI negative contract. The fixture accepts an explicit per-run executable search path; only the required-command absence case selects its absolute private bin after deleting kubectl. Existing callers retain the same private-bin-plus-inherited-PATH default. The production CLI, executable selection, exact sanitized diagnostic and exit 1 remain unchanged; the negative also requires empty stdout. No empty PATH component or cwd search is introduced.

A controlled inherited-PATH kubectl exits 0 with empty stdout and records invocation in owned scratch. Before the change, the negative invoked it once and failed: expected `observability preflight: command-unavailable-or-timeout`, received `observability preflight: context-unavailable`. After the change, the same test passed without invoking it. Removing only the explicit private search-path argument reproduced that exact failure and one invocation; `finally` restored byte-identical source and the negative passed again. The adjacent `Proof:` records this fault. This is a fixture boundary proof, not a new production guard or replay of old production fault batches.

| Observation                                        | Test outcome                          | Process time | Fallback invocations |
| -------------------------------------------------- | ------------------------------------- | ------------ | -------------------- |
| Controlled baseline RED                            | 0 pass/1 fail,2 assertions,305ms Bun  | 0.310s       | 1                    |
| Controlled GREEN                                   | 1 pass/0 fail,3 assertions,334ms Bun  | 0.338s       | 0                    |
| Removed private search boundary                    | 0 pass/1 fail,3 assertions,343ms Bun  | 0.347s       | 1                    |
| Restored boundary                                  | 1 pass/0 fail,3 assertions,324ms Bun  | 0.328s       | 0                    |
| Final changed negative and three adjacent controls | 4 pass/0 fail,21 assertions,1.58s Bun | 1.581s       | 0                    |

The three adjacent controls are the valid actual CLI inventory, existing missing-context refusal and credential-bearing transport privacy negative. All four ran with the controlled fallback directory prepended to the test runner's inherited PATH. An earlier sandbox-only attempt failed at `Bun.listen` with EPERM before any fallback invocation; it is a setup failure, not semantic RED. The scoped authorized rerun supplied the observations above.

```bash
bun /tmp/puni-task27-evidence/run.ts red-controlled 1 1
bun /tmp/puni-task27-evidence/run.ts green-controlled 0 0
bun /tmp/puni-task27-evidence/fault.ts
bun /tmp/puni-task27-evidence/run.ts restored-controlled 0 0
bun /tmp/puni-task27-evidence/run.ts focused-final 0 0 '^(required command absence refuses with a safe transport failure category|authorized inventory binds the reviewed revision without replacing the observed Flux revision|missing context refuses|transport errors cannot forward credential-bearing input or error causes)$'
bunx eslint tools/tool-fleet/src/observability-preflight.test.ts
bunx tsc --build --force tools/tool-fleet/tsconfig.json
bunx prettier --check tools/tool-fleet/src/observability-preflight.test.ts
```

The runner records the exact expanded Bun test argv, selected names, exit codes, invocation counts, timings and source hashes in [run receipts](/tmp/puni-task27-evidence/runs.jsonl). [Final focused output](/tmp/puni-task27-evidence/focused-final.log), [fault output](/tmp/puni-task27-evidence/fault-inherited-path.log), [restoration receipt](/tmp/puni-task27-evidence/fault-restoration.json), [fault script](/tmp/puni-task27-evidence/fault.ts). Source-only scoped ESLint/typecheck/format exited 0 in 3.83s/1.71s/0.53s. Normal source-commit hooks passed in 4.22s process: staged lint/format, plaintext-secret/private-nesting and message hooks; Tool Wiki reported inactive/uncertified because its external activation root is absent. Migration/doc-cap routes were inapplicable; no hook was bypassed. Final formatting over the source, canonical verify and ignored report passed in 0.90s.

Final test SHA256 is `1b864b25d7849c5ca89c3116a38ee79f1be9927e3ae8ba51d41903f49f7c4a4e`. The production preflight, CLI and discovery files are byte-identical to BASE; [source identities](/tmp/puni-task27-evidence/source-hashes.json) records both sides. No capacity values, pins, proposal/spec/design, production or CI policy changed.

### Task25c2a independent-review closure

The original bounded Task25c2a review identified I1, preservation of individual null request/limit maps. The follow-up `task-25c2a-fix1-review.md` reports **all findings addressed; no new Critical/Important breakage**, I1 spec-compliant and fix quality approved. It reviewed source `ad987d36173b846b1064570520a034bac012b901` and evidence `b74e0446e01819459615bd44edcda4c1990b1916` after the original `task-25c2a-review.md`. These are retained independent-review observations, not a new review or test replay. Only that inventory slice and I1 are closed; runtime, full-goal and admission acceptance do not follow.

### Published886 final CI observation

The retained `published-886-final-ci.json` records main run [40503029547](https://github.com/Prosperous-Unification/puni-00/actions/runs/40503029547) completed **failure** for published HEAD `88646561321d4163c18023495051f2bb92d63a62`. Workspace job `122185432997` failed after **77m16s elapsed including setup** (12:21:19Z–13:38:35Z on 2026-10-27); its retained Nx log reports **73m22s**. Workspace Fleet had 2000 pass/7 skip/1 fail,2008 tests across 79 files,723.58s. The sole Fleet failure is this required-command absence test at the old line 1543, with the exact expected/actual diagnostic above. [Retained workspace log](/tmp/puni-pr760-workspace-886-artifact/nx-gate.log); artifact 12738108074. The fixture inherited the runner's kubectl; production still refused safely, and this does not establish a production defect.

Twilight, all pixels shards and stable pixels succeeded. Distinct Infra run 40503029484 succeeded with 2001 pass/7 skip/0 fail,592.38s. Those successes do not override the failed main gate. This records the completed published886 run, not CI for the new Task27 source/evidence HEAD; root owns publication and new-head CI. No job was cancelled, restarted or rerun here.

Canonical progress stays **4/11**; 3.1, full 4.3, generated runtime enforcement, complete source/host admission, actual stored signals/views/history/recovery and live cutover remain open. Full Fleet/app/backend/browser/CI/chart runs, full host gates, old proof batches, live probes and OpenSpec validation were intentionally not run for this bounded test-only restoration. No push, merge, deploy, secret change, target mutation or external message occurred. Large retained logs/captures were linked, not copied.

## Task25c2b — retained bootstrap sources and lifecycle origins

Bounded source prerequisite, not canonical 3.1/runtime/live acceptance. Started from clean `6650f9706251847d9c08f2219a5b48f98423f828`; the root supplied the four committed intent artifacts before implementation (proposal 393 words, strict OpenSpec 1 valid/0 issues, 22ms). Those intent receipts are inherited dispatch evidence. Source commits are `da1a217c2a6a2e9ff7f82187066568fba743844b` and the approved CRD-boundary correction `5bd1104bf76e0a36c5d34ddcc2a4ba6f4b4e6b57`.

The existing recursive collector now retains nine original selected-Git bootstrap inputs before hashing: `infra/platform/flux/install.yaml`, `infra/local/platform.k3d.yaml`, `infra/versions/object-store.json`, and the policy kustomization plus its five referenced files. Original policy source coordinates remain `infra/platform/policy/*`; their artifact coordinates are `infra/rehearsal/bootstrap/policy/*`. Generated stage policy remains at its original packet path, including observability-dev. The same packet toolchain binds Flux SHA256 `80779d11e7f0050ed01a3f072556fdabefa38f5f6cb623e9df44381c9ec1d592`; the object-store lock uses its existing schema. No mutable original-checkout input fills a missing exported file.

The original graph-file snapshot supplies legacy capacity/Secret receipt fields; every retained Kubernetes document still enters the existing full-document material and reference boundaries. Topology enters a bounded k3d declaration boundary. The validator retains an independently built original-policy frame and native Flux frame alongside the unchanged eleven-stage graph. Shared structural decoding and the same inventory fold reconcile only independently equal bootstrap-policy/stage-policy definitions by physical group/kind/namespace/name. Other duplicates and incompatible definitions refuse. Every origin keeps its own source, artifact, frame and manifest coordinates. Dynamic marker, lab-label, namespace and credential operations remain declared actions with unobserved realization.

The runner and inventory share only the existing LB/tools image-role-temporary descriptors and their unchanged name construction. Fourteen obligations retain exact selected-source or generator/runner-source coordinates: node/system, registry, LB, every serial tools lifecycle, object-store import, TLS generation, namespace/credential provisioning, marker, label mutation, local-path provisioning, cert-manager solver/startup, Velero restore/transfer, and host solver realization. Known tags are not invented digests. The bounded inventory image adapter links exact chart repository+digest forms without modifying strict platform/source guards or pins. Unknown API scope (including IngressClass) remains unresolved.

### Actual public entry and scope

The committed **5bd1104** public entry passed: **1 pass/0 fail, 29 assertions, 11.38266s case/11.91s Bun/11.98s process**. Source and generator revisions equal 5bd1104, `generator.dirty:false`. It retained 11 stages, 25 frames, 396 source objects, 4 native Flux workloads, 25 objects with both policy origins, 36 declared native image occurrences and 14 helper/action obligations. All four observed tag-omitted image occurrences link to exact chart lock coordinates. No native reference remains unmapped; helper realization and image-role completeness remain unresolved, as do 80 inventory obligations.

Inventory SHA256: `fc729e14ab16e07e0aea5faf9730df5b1743bcf0122cb0b7e6421e1a789d1a20`. Packet artifact SHA256: `0d7c347f69a38274b6e72dc17d00c7ee413dc24d8ec11698604a3bbd96f72d3d`. The complete source/file hashes, immutable raw capture hashes and legacy-field comparison are in [public summary](/tmp/puni-task25c2b-evidence/public-summary.json). Every legacy receipt field other than sourceRevision/generator/files/artifactSHA256 equals the retained d93 C2a receipt, including declaredCapacity and all derived Secret fields. This comparison consumes captured outputs, without another render.

[Public log](/tmp/puni-task25c2b-evidence/public-final-entry.log), [receipt](/tmp/puni-task25c2b-evidence/public-final-receipt.json), [raw expansions](/tmp/puni-task25c2b-evidence/public-final-frames.json), [raw validated stages/bootstrap](/tmp/puni-task25c2b-evidence/public-final-frames.json.stages.json). Large captures remain private in `/tmp`, mode 0400; none is copied into Git. The public control used the existing prepared locked kubectl/Helm archives and private extraction through the existing installer. No cache replacement or download was needed.

### Refusal and correction lineage

Initial missing-module/export reds were setup failures. Semantic origin RED showed 2 pass/5 fail; the independent-coordinate correction showed 0 pass/2 fail before GREEN. Initial scoped types caught still-needed path imports; initial lint caught import order, redundant typed branches and asynchronous assertion syntax. These were corrected before source commit. The first assertion rewrite produced a parsing error, corrected before the next green run. Absence/unreadability controls now explicitly await ENOENT/EACCES via `node:assert/strict`.

The first committed public attempt on da1a217 refused during prepare, **before any stage/chart rendering**: the existing Secret-reference scanner interpreted Flux CRD schema vocabulary as an embedded object (`buckets.source.toolkit.fluxcd.io`, `/spec/versions/0/schema/openAPIV3Schema/properties`, kind was an object). [Retained failure](/tmp/puni-task25c2b-evidence/public-entry.log): 2.24917s case/2.83s process. The exact gap was reported to root before changing scope. Root approved suppressing reference/embedded-resource interpretation only within the exact OpenAPI subtree of an actual top-level `apiextensions.k8s.io/v1` CRD. Full-document material checking, conversion/webhook and all nonschema fields, ordinary objects and Helm embedded-resource handling remain active. Null/array/malformed boundary shapes refuse. CRD RED 4 pass/6 fail became 10 pass/0 fail; an actual Flux document-only safety control also passed. No OpenAPI framework or whole-CRD exclusion was added.

### Commands, restored proofs and checks

Commands ran with `login:false`, Bun 1.4.4 in the assigned worktree, with scoped escalation for authorized writes/scratch. The common test prefix is `bun test --preload ./tools/test/scratch/preload.ts`; each test command ends `--timeout=30000`.

| Command suffix / check                                                                                                                                                                                                                               | Fresh result                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/tool-fleet/src/observability-rehearsal-{bootstrap,sources,obligations}.test.ts`                                                                                                                                                               | Final 48 pass / 0 fail, 47 Bun assertions plus awaited Node refusal assertions, 703ms; small same-production-core fixtures.           |
| `tools/tool-fleet/src/observability-rehearsal-inventory.test.ts -t 'retains actual\|unknown provider\|source closure refuses\|duplicate\|structural\|preserves.*null'`                                                                               | 11 pass / 0 fail, 80 filtered, 29 assertions, 871ms.                                                                                  |
| `tools/tool-fleet/src/observability-parity-rehearsal.test.ts -t 'packaged graph refuses missing-stage\|packaged Secret refuses\|packet file closure refuses extra-file\|packet file closure refuses altered-bytes\|altered receipt source revision'` | 5 pass / 0 fail, 66 filtered, 6 assertions, 13.85s Bun / 13.91s process.                                                              |
| `tools/tool-fleet/src/platform.test.ts -t 'plain workload image\|unlocked init container'`                                                                                                                                                           | 2 pass / 0 fail, 112 filtered, 4 assertions, 1.010s Bun / 1.02s process.                                                              |
| `bunx --no-install tsc --build --force tools/tool-fleet/tsconfig.json`                                                                                                                                                                               | Exit 0, 1.67s before initial commit; final CRD source exit 0, 1.27s tool process.                                                     |
| `bunx --no-install eslint` on the 10 initial changed files, then both CRD correction files                                                                                                                                                           | Exit 0, 5.40s initial scoped check; final correction exit 0, 2.95s tool process. Normal commit hooks also linted staged final source. |
| `bunx --no-install prettier --check` on initial 10 files; final CRD `prettier --write` and normal staged format hook                                                                                                                                 | Exit 0; final hook format 0.31s.                                                                                                      |
| `bunx --no-install openspec validate observability-environment-parity --strict --json`                                                                                                                                                               | 1 valid / 0 issues, 23ms; evidence recheck 24ms.                                                                                      |
| `git diff --check`; committed-source hash comparison                                                                                                                                                                                                 | Exit 0; all 11 changed source/test files match committed 5bd1104 blobs.                                                               |

Exact public command:

```bash
PUNI_REHEARSAL_INVENTORY_EXPORT=/tmp/puni-task25c2b-evidence/public-final-receipt.json PUNI_REHEARSAL_FRAMES_EXPORT=/tmp/puni-task25c2b-evidence/public-final-frames.json /usr/bin/time -f 'elapsedSeconds=%e' bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-rehearsal-inventory-entry.test.ts
```

**38 new guard/dependency faults were caught and restored, 15.484s aggregate process time.** The original 29, four remaining parsing/origin checks, and five approved CRD checks are disjoint; no prior task's fault batch was replayed. Exact command arrays/selectors, UTC starts, exits, source hashes and restoration receipts are retained in [all proofs](/tmp/puni-task25c2b-evidence/all-proofs.json), with drivers `prove.py`, `prove-extra.py`, `prove-crd.py` and individual logs in that directory. Adjacent Proof comments identify every watched boundary. Faults cover omitted retained files, generated/original policy substitution, source coordinates/IO/hash/Flux lock, topology/schema/memory, object-store validator, immutable/duplicate frame origins, omitted native Flux, policy equality and strict unrelated ownership, hidden origins/helpers, unknown helper pins/provenance, wrong repository/digest, forged completion/authority, bootstrap Secret material and exact CRD schema/reference separation. No full graph was rendered for field faults.

Normal source hooks passed (commit processes 9.20s and 3.33s), including staged format/lint, plaintext-secrets, private-nesting and author trailers. Tool Wiki remained explicitly inactive/uncertified because its external activation root is absent; this is not certification. Migration/doc-cap routes were inapplicable. Bounded self-review checked source collection, the original graph-derived receipt scope, immutable origin contracts, shared identity equality, helper provenance, the exact CRD exception, and the unchanged runner helper names/order. [Source hashes](/tmp/puni-task25c2b-evidence/source-hashes.json) and focused/static logs retain the evidence.

No full Fleet suite, old 191/eight-trait wrapper render, old fault matrix, full Nx/build/host gate, backend/browser checks, CI rerun, runtime/cluster/Docker/image/store/secret action, push or deployment was performed. Those broader checks are not claimed. Root owns scoped independent review/publication and current CI handles. Runtime/creation remain false, transport is not evaluated, runnable closure is incomplete, and actual runner-root input equality is unobserved. Capacity arithmetic, lifecycle/writer accounting, process/image allowances, admitted host measurements, reconciliation, stored signals, UI/history/recovery and live acceptance remain required.

### Task25c2b fix1 — structural CRD schema boundary

Independent review identified I1 (Important): an unescaped sibling key `spec['versions/0/schema/openAPIV3Schema']` collided with the genuine CRD schema path and suppressed its undeclared Secret reference or malformed embedded-resource checks. This fix addresses only I1 from clean FIXBASE `9fc88bcdaddf44944ccf75d30bcc57c7cb6b4b6d`. Source commit: `8628f97e5836f372ad4ad419f5e3da2afd5cb950`.

The scanner now carries typed structural segments (string property names and numeric array positions) separately from its unchanged diagnostic path strings. Only equal-length, segment-equal paths select the existing exact top-level v1 CRD schema subtree. Whole-document material, conversion/nonschema, ordinary-resource and malformed-boundary checks retain their previous scope; no schema framework or wider exemption was added.

Both same-production-path regressions first failed with missing expected rejection: **0 pass / 2 fail, 562ms Bun / 0.57s process**. The focused covering set then passed **12 / 0, 10 filtered, 561ms Bun / 0.57s process**, including genuine schema vocabulary, material, conversion, malformed embedded resources, foreign API/ordinary resource, null/array boundary shapes and both slash-bearing siblings. These use one Bun expectation plus awaited Node refusal assertions.

```bash
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-rehearsal-bootstrap.test.ts -t 'fix1 slash-bearing' --timeout=30000
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-rehearsal-bootstrap.test.ts -t 'fix1 slash-bearing|CRD schema vocabulary|CRD still inspects|schema boundary refuses' --timeout=30000
python /tmp/puni-task25c2b-fix1/prove.py
bunx --no-install tsc --build --force tools/tool-fleet/tsconfig.json
bunx --no-install eslint tools/tool-fleet/src/observability-rehearsal-secrets.ts tools/tool-fleet/src/observability-rehearsal-bootstrap.test.ts
bunx --no-install prettier --check tools/tool-fleet/src/observability-rehearsal-secrets.ts tools/tool-fleet/src/observability-rehearsal-bootstrap.test.ts
bun /tmp/puni-task25c2b-fix1/retained-flux.ts
```

One new watched fault replaced structural equality with slash-joined raw segments. Both I1 negatives failed again; the source was restored, then the focused covering set passed. [Proof receipt](/tmp/puni-task25c2b-fix1/proof.json) retains the exact command, UTC start, source hash, exit 1, 0.576s process and restored status; [fault log](/tmp/puni-task25c2b-fix1/fault.log), [RED](/tmp/puni-task25c2b-fix1/red.log), [restored control](/tmp/puni-task25c2b-fix1/restored.log). The adjacent Proof comment names that actual fault. No prior proof batch was repeated.

Final-source **nonrender** control: committed scanner 8628 consumed the immutable retained 5bd Flux bytes through `inspectRehearsalKubernetesSources`, after verifying the capture hash, Flux hash and same-source external declaration hash. It passed with zero actual Secret references, 161.101ms scan / 0.59s process. [Receipt](/tmp/puni-task25c2b-fix1/retained-flux-receipt.json), [log](/tmp/puni-task25c2b-fix1/retained-flux.log). The existing full public-entry PASS remains bound to **5bd1104**; it was not rerun or relabeled as 8628 evidence. No chart/stage rendering occurred.

Scoped type/lint/format passed with exits 0 in 1.45s/3.73s/0.41s; normal source hooks passed in 3.57s process. Tool Wiki remained inactive/uncertified; migration/doc-cap hooks were inapplicable. `git diff --check` passed. Both changed source/test files match committed 8628: scanner SHA256 `4ddffcc9332ec16ebf5605ef12e8a51211fb32f0b7116c5e3302c94c49ca632a`; test SHA256 `fc8bdc346bc99cbecedea01d02b70729cea331087df045eb7b0ebecfad15e4ac`. [Source identities](/tmp/puni-task25c2b-fix1/source-hashes.json).

The prior 38-proof/48-case batches, full public entry, old matrices, full suites/build/host gates, CI and runtime/Docker/image/store/secret actions were deliberately not replayed. No source values/pins, publication, deployment or additional scope changed. Root owns scoped re-review; full capacity, actual runner-input equality, helper/runtime realization and live acceptance remain open.

## Task25c3a — native StatefulSet ordinal lifecycle source charges

Bounded implementation prepared for independent review on base `2d76609a01360a7968d0723fcf82f4fa337b5660`; source commit `613a5aa9aa51a64adc18b92ac6da788c1a3c4b10`. The four accepted intent artifacts preceded source edits. Parent-approved API resolution kept public inventory JSON source-only and selected/cutover behavior strict. OpenSpec status/apply returned `sdd-lean`, ready, 4/11; full canonical 3.1 and runtime/live acceptance remain open. Dispatch explicitly reserved review, publication and CI to the parent, overriding the generic apply instruction to spawn further agents.

`readRehearsalSource` exposes native views from the existing validated traversal. `prepareRehearsalInventory` shares the canonical eleven-stage producer; the original public inventory functions still return only source declarations. The companion `readRehearsalNativeCosts` consumes independently bound retained frames; `deriveObservabilityRehearsalNativeCosts` shares the canonical producer once and carries its inventory hash, provenance and helper obligations. Shared owner normalization/claim expansion reuse `normalizeWorkload`, its application-sum/init-max/overhead arithmetic, CPU requests and `sumCapacity`. No values, pins, CI policy, caller authorization inputs or admission gates changed.

### Retained-source result and limits

The final control used **clean current adapter** `613a5aa9aa51a64adc18b92ac6da788c1a3c4b10` against **captured source** `5bd1104bf76e0a36c5d34ddcc2a4ba6f4b4e6b57`. It verified the three original file hashes/modes, current toolchain bytes against the captured selected-file hash, all 25 frames/11 stages through production decoding/closure, and exact equality of the current source inventory entries and all 80 unresolved strings to the captured receipt. No graph/chart/public-entry rerender occurred.

| Retained input under `/tmp/puni-task25c2b-evidence/` | SHA-256                                                            | Mode |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ---- |
| `public-final-frames.json`                           | `22fcbe2f1dae8050aae4681b7154531d63e783caed802b196f2a81cb51468678` | 0400 |
| `public-final-frames.json.stages.json`               | `2aa7c295ecfc1ee365b57d809216e2280c12aed81b9754d37664a3b42dac515e` | 0400 |
| `public-final-receipt.json`                          | `171ce7d23d26c080b18525fadf550161ae0659541622c1ae2544e7b0d16b8018` | 0400 |

| Owner                                            | Pod memory MiB | CPU request milli | Claim request MiB | Declared ephemeral limit MiB |
| ------------------------------------------------ | -------------: | ----------------: | ----------------: | ---------------------------- |
| `StatefulSet:observability-dev:signal-collector` |            512 |               100 |              2048 | absent                       |
| `StatefulSet:observability-dev:signal-gateway`   |           1024 |               100 |              2048 | absent                       |
| `StatefulSet:observability:signal-collector`     |            512 |               100 |              2048 | absent                       |
| `StatefulSet:observability:signal-gateway`       |           1024 |               100 |              2048 | absent                       |
| `StatefulSet:observability:elastic-operator`     |            512 |               100 |                 0 | 256                          |

The production normalizer/ledger produced five full Pod charges and four unique namespace/controller/template/ordinal claims: **3584 MiB memory, 500m CPU requests, 8448 MiB known disk** (8192 MiB claims plus 256 MiB operator ephemeral). These are conditional source contributions, not hardware sizing, measured usage, physical storage quotas or a whole-attempt fit. The four signal Pods omit ephemeral request/limit fields and declare read-only roots; their zero normalized ephemeral component retains a separate owner-specific absent-limit/log/runtime-writer obligation. Operator ephemeral is explicitly declared.

The ledger remains incomplete with 100 named blockers and all 80 original source unresolved facts. Exact unrelated native obligations remain for 16 Deployments, nine Jobs, four DaemonSets and one CronJob; unrelated PVCs, provider inputs, hostPath writers, system/helper roles, images/archive/transients, retained services and coexistence are not made complete. The canonical companion retains existing helper obligations; this control exercised its shared production decoding/derivation core, not a new canonical build/render run.

Policy/grace declarations and pinned defaults remain separate: Kubernetes v1.36.4 defaults, intended k3s v1.36.4+k3s1, and source-render capability 1.35.0/unobserved. Fixed applicability is one immutable-source attempt, process recovery and ordinary graceful same-template ordinal replacement under cooperative reachable-controller conditions. Force deletion, lost-node execution, foreign mutation, unbound old/new templates and unaccounted generations remain excluded. Actual version/features, UID/owner/template/node equality, termination, enforcement and writer state remain prerequisites; grace is explicitly not a reclamation deadline. Creation/runtime authority stays false. No full source-completeness or admission claim follows.

### Ordered RED, corrections and restored checks

Initial setup errors were a wrongly relative test write (no file created), missing new export/module, and one mechanical extraction leaving `readers` outside function scope. These are setup errors, not passing tests. Meaningful reds then observed an empty native view (expected two), absent shared helper, eight malformed-before-incomplete failures (13 pass/8 fail), five claim/namespace/generation failures (29 pass/5 fail), four missing-bound/explicit-default failures, wrong claim ordinal metadata, and two late standalone metadata selector/path failures. Each was corrected through the shared seams. The first retained run exposed valid `securityContext:null` on `DaemonSet:puni-backup:node-agent`; a focused red established it, and only the broad optional declaration boundary changed. The strict selected/cutover schemas remain unchanged. The next retained run distinguished two unrelated PVC obligations from native workload-family obligations; subsequent controls passed. Initial scoped typecheck found the generic expanded-volume array type, one moved callback argument and an exported return type needing its existing frame interface exported. Initial lint found arrow braces, unnecessary async test functions and a matcher typed unsafely; all were corrected.

Commands below ran from `/home/df/.codex/worktrees/aa39/puni-00`, except Bun tests ran from `tools/tool-fleet`. Logs are retained under `/tmp/puni-task25c3a-evidence/`.

| Command                                                                                                                                                                                                                                                                                                                                                      | Fresh result                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test --preload ../test/scratch/preload.ts src/observability-native-ordinal.test.ts src/observability-cold-start.test.ts src/observability-workload.test.ts`                                                                                                                                                                                             | 167 pass, 0 fail, 264 assertions, 1.177s (54 new, 55 strict cold-start, 58 shared-workload controls); restored after all 45 distinct fault injections.                                                                              |
| `bun test --preload ../test/scratch/preload.ts src/observability-rehearsal-inventory.test.ts -t 'retains actual native image roles\|legacy observability indexing\|nullable native resources\|immutable stage source and resource'`                                                                                                                          | 4 pass, 0 fail, 25 assertions, 0.582s; 87 unrelated tests filtered.                                                                                                                                                                 |
| `bun test /tmp/puni-task25c3a-evidence/retained.test.ts`                                                                                                                                                                                                                                                                                                     | Clean committed-adapter retained-source control: 1 pass, 0 fail, 20 assertions, 4.27s; production traversal and normalization, no reconstructed test source.                                                                        |
| `bunx eslint tools/tool-fleet/src/observability-cold-start.ts tools/tool-fleet/src/observability-rehearsal-inventory.ts tools/tool-fleet/src/observability-workload.ts tools/tool-fleet/src/observability-native-ordinal.ts tools/tool-fleet/src/observability-native-ordinal.test.ts`                                                                       | Exit 0, 4.362s.                                                                                                                                                                                                                     |
| `bunx tsc --project tools/tool-fleet/tsconfig.lib.json --noEmit --incremental false`                                                                                                                                                                                                                                                                         | Exit 0, 1.178s.                                                                                                                                                                                                                     |
| `bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false`                                                                                                                                                                                                                                                                        | Exit 0, 1.209s.                                                                                                                                                                                                                     |
| `bun node_modules/.bin/openspec validate observability-environment-parity --strict --json`                                                                                                                                                                                                                                                                   | 1 valid / 0 issues, 18ms; process 0.622s.                                                                                                                                                                                           |
| `bunx prettier --check tools/tool-fleet/src/observability-cold-start.ts tools/tool-fleet/src/observability-rehearsal-inventory.ts tools/tool-fleet/src/observability-workload.ts tools/tool-fleet/src/observability-native-ordinal.ts tools/tool-fleet/src/observability-native-ordinal.test.ts openspec/changes/observability-environment-parity/design.md` | All matched files formatted, exit 0; whitespace clean via `git diff --check`.                                                                                                                                                       |
| `git commit -m 'Derive source-bound StatefulSet ordinal lifecycle charges'`                                                                                                                                                                                                                                                                                  | Normal hooks passed in 4.56s, including scoped lint/format/secrets/private-nesting. Tool Wiki explicitly reported inactive/uncertified because its external activation root is not provisioned; this is not certification evidence. |

### R5 watched failures

`python3 /tmp/puni-task25c3a-evidence/watch-faults.py` executed only new scoped dependency faults; every final case exited 1 with its corresponding failed test, then restored exact source bytes. The 45 distinct detected faults took 26.358s including one initial shadowed duplicate-template attempt. A metadata mutation selector initially matched twice and stopped before writing; resume skipped completed proofs. Duplicate-template guard removal initially still reached the later collision refusal, so its test was strengthened to require the early `claim-template-duplicate` diagnostic; the restored control passed, then the same removed guard failed it. This is a diagnostic-ordering proof, not a claim that all later guards were absent. Final 167/167 restored tests above include the affected legacy controls; no historical proof batch or source matrix was replayed.

| Changed dependency/fault IDs                                                                                                                                                 | Observed production-path failure                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `count-domain`, `count-obligation`                                                                                                                                           | Negative/fractional replicas and Job parallelism admitted; absent/zero replica obligation disappeared.                                                                 |
| `strategy-contradiction`, `unavailable-domain`, `management-policy`, `update-policy`, `ordinal-policy`, `partition-policy`, `unavailable-policy`                             | Contradictory/fractional fields stopped throwing, or Parallel/OnDelete/custom ordinal/rolling policy acquired charges.                                                 |
| `provider-pin`, `default-substitution`                                                                                                                                       | Changed intended k3s/node pins inherited defaulting, or OrderedReady was replaced by Parallel.                                                                         |
| `prepass-ordering`, `volume-quantity`, `overhead-quantity`, `overhead-memory`, `mount-identity`, `container-identity`, `metadata-shape`, `metadata-complete`, `grace-domain` | Unsupported policy or missing bounds concealed malformed volumes, quantities, overhead, mounts, names, metadata selectors/paths or negative grace.                     |
| `context-null`, `context-malformed`, `missing-map-policy`, `missing-bound-policy`, `claim-storage-bound`                                                                     | Valid null/absent declarations became refusals, malformed supplied context became absence, or missing writable/claim bounds lost their named obligations.              |
| `claim-template-duplicate`, `claim-collision`, `claim-namespace`, `claim-ordinal`                                                                                            | Wrong early refusal, duplicate/conflicting explicit PVC admitted, foreign namespace claim borrowed, or second ordinal metadata became zero.                            |
| `source-generation`, `template-binding`, `namespace-obligation`, `source-hash`, `source-pointer`                                                                             | Foreign/deleting identities gained the fixed scenario; changed templates shared one binding; unresolved namespace or altered frame/document provenance gained charges. |
| `pod-zero`, `pod-double`, `claim-zero`, `claim-double`                                                                                                                       | Exact full ordinal contribution control failed, including shared duplicate-charge refusals for doubled identities.                                                     |
| `ephemeral-obligation`                                                                                                                                                       | Absent ephemeral limits/log/runtime writers disappeared behind the read-only-root zero component.                                                                      |
| `creation-authority`, `completeness`, `runtime-authority`, `runtime-observation`, `render-observation`, `excluded-lifecycle`                                                 | Forged authority/completeness/observations or removed forced/lost/foreign/unbound/generation exclusions failed the fixed conditional-output assertions.                |

Each changed check has an adjacent `Proof:` comment naming these faults. Per-fault exact command, test, exit, elapsed time and output are in `faults.json` and `fault-<id>.log`. Key evidence hashes:

- `retained.test.ts`: `ab147a8e1f5f71514e2728495e38b3998b328f1c222b5ad0f8e4ff0309d0aab1`.
- `retained-ledger.json`: `47595ca1dbbc4d979e8312d9bab6b0cb70a44bfaea090a077b10ea88858ff966`.
- `faults.json`: `7c2f9c9a074f8c8bc9f4cf64ccea060ec0dda76f9697edfecb6a867120c8478f`.
- `restored-tests.log`: `2de951a391dee6f926c31448906e9148a9e72cf16d7f40f8738854ab1ceb811b`.
- `statics.log`: `e2684cf448e1163cf1e04dc14df100457e2ac34eae87e44da27079e311c93928`.

Not run: full Nx/build/host gates, unchanged graph/chart/public-entry rendering, old proof matrices, any Kubernetes/Docker/runtime/store/host/credential actions, push/merge or deployment. Those are outside this bounded source slice; the parent owns existing CI and exact held publication independently of this HEAD. Full floors/stores, capacity admission, runtime/history/recovery/views/live acceptance and separate authorization boundaries remain open. Source is stopped for parent-owned scoped review.

### Task25c3a fix1 — validate recognized volume modes before incomplete classification

Addresses only Important I1 from exact clean FIXBASE `5cf736deecc691bc1e0c832edd110c62d34b9673`. Source commit: `ea7ec631fe356d2fbf7b0a4c05697dd8f29bd8a0`. The broad prepass now applies the existing integer-0..511 `FileMode` contract to projected/configMap/secret defaults and standalone configMap/secret item modes before unsupported-policy or absent-bound classification. Projected item modes already use `FileMode` through the existing schema; standalone downwardAPI uses its existing metadata reader. Selected/cutover schemas, valid normalization, source values and pins are unchanged. The production change is ten lines in `assertInventoryWorkload`; no extraction or metadata framework was needed.

Production-entry RED reproduced all five missing surfaces with -1, 0.5 and 512 behind both unsupported policy and absent bounds, plus malformed supported lifecycle cases: **2 pass / 35 fail, 41 assertions, 0.832s**, with valid 0/511 already passing. GREEN was **37 pass / 0 fail, 0.755s**. Six new watched faults covered bypassing the mode guard and independently omitting each of its five default/item inputs. Guard bypass produced 35 failed negatives; each field omission produced its seven expected failed negatives. All exited 1 and source was restored in `finally`; proof input/restoration SHA-256 matched. Fault process time totaled 4.037s. The adjacent Proof comment identifies these observed failures.

Exact commands (tests from `tools/tool-fleet`, statics from the repository root):

```bash
bun test --preload ../test/scratch/preload.ts src/observability-native-ordinal.test.ts -t 'fix1'
python3 /tmp/puni-task25c3a-fix1/prove.py
bun test --preload ../test/scratch/preload.ts src/observability-preflight.test.ts -t 'fix2 (explicit standard file modes|explicit projected .* file modes|(source|observed) projected file mode)'
bun test --preload ../test/scratch/preload.ts src/observability-workload.test.ts -t 'default model has no source evidence|closed observed schema|source metadata (default mode|invalid default mode|invalid item mode|noninteger mode)'
bunx eslint tools/tool-fleet/src/observability-workload.ts tools/tool-fleet/src/observability-native-ordinal.test.ts
bunx tsc --project tools/tool-fleet/tsconfig.lib.json --noEmit --incremental false
bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false
bunx prettier --check tools/tool-fleet/src/observability-workload.ts tools/tool-fleet/src/observability-native-ordinal.test.ts
git diff --check
bun test /tmp/puni-task25c3a-fix1/retained.test.ts
```

Fresh restored I1 tests passed **37/37, 41 assertions, 0.785s**; selected strict projected-mode controls **8/8, 23 assertions, 5.22s**; selected default-model/closed-observed/metadata-mode controls **6/6, six assertions, 0.196s**. Scoped lint/source typecheck/test typecheck/format/whitespace all exited 0 in 3.757s/1.091s/1.177s/0.378s/0.009s. Normal source hooks passed in 3.71s; Tool Wiki remained explicitly inactive/unprovisioned, not certified.

One new retained-source control passed **1/1, 20 assertions, 3.98s** using **clean current adapter `ea7ec631fe356d2fbf7b0a4c05697dd8f29bd8a0`** and unchanged **captured source `5bd1104bf76e0a36c5d34ddcc2a4ba6f4b4e6b57`**. It rechecked the original three capture hashes/modes and selected toolchain bytes, production frame closure, exact source-inventory equality and unrelated obligations. Five Pod/four claim charges still total 3584MiB memory, 500m CPU requests and 8448MiB known disk; 100 blockers, all 80 source unresolved facts and false creation/runtime authority remain. No graph/chart/public-entry rerender occurred. Original evidence files were preserved; this receipt is `/tmp/puni-task25c3a-fix1/retained-ledger.json`.

Evidence under `/tmp/puni-task25c3a-fix1/`: `red.log`, `green.log`, `restored.log`, `strict.log`, `workload.log`, `statics.log`, `proofs.json`, six `fault-*.log`, `retained.test.ts`, `retained.log`, `retained-ledger.json` and `source-identities.json`. Committed source hashes: workload `792d92c1324009ac2f6f60aab43130cbd8eecf4ce80932dc922e0d46def19d28`; test `7a1ceb465c28d99aeb7e37ee9cddb665f650e155138842190c8530daf1eb4924`. Proof receipt SHA-256 `d734adbd451509929497304033808201209f56e45a7e8a3055a0bb7bdf27a810`; retained control SHA-256 `790d0b66bce57fe46a829b1f354d49f5337b90bdfc3a525364caad0062a9c33a`; retained ledger SHA-256 `22c9a64ce9806fb1ff8985deffd1239077a87a3a20bca6ae73cb7e8106059fee`.

The historical 45-fault/167-test batches, full suites/build/host gates and unchanged rendering were not replayed. No new families, source values/pins, credentials, CI, runtime/host/store actions, push/merge or deployment. Full source/admission/runtime/live limits remain as above. Source stopped for parent-owned I1 re-review.

## Published checkpoint CI and waiting evidence — 2026-10-27

Published implementation checkpoint `0ea3309d049fceff1b299624de7ed64d2c24a08d` passed its own main run 40530478129, stable gate 122334502456 and pixels 122293809987, Infra 40530478011 and CodeQL 40530462115; trusted-wiki 40530464791 skipped. Main workspace 122281897867 ran 15:23:59–16:53:52 UTC (89m53s); Twilight 122281898185 passed at 16:15:50. Downloaded existing Nx gate artifact 12752117667 once; no job was rerun. Its recorded sequential command times are test/typecheck/build 4,435,521 ms, workspace lint 538,395 ms and Burokrat source lint 37,073 ms: 83m30.989s together, with 6m22.011s of job time outside those intervals. Suite durations overlap and must not be added. The log does not establish a CPU/RAM bottleneck.

The validated selection artifact 12746096447 compares base `e3a973aabd2d912981a7fcfe2008dd39f9129391` with synthetic head `467540a30dbfa448d390d796def9d8b137048f78`. Its stated delete/rename fallback selected 54 runtime projects because the previous dependency graph is unavailable. The parity source contains actual manifest deletions/renames; the existing conservative policy is intentional. The exact synthetic object was not available locally; no stronger per-path attribution or CI optimization is claimed. This packet changes neither CI policy nor its safety coverage.

Reviewed bootstrap checkpoint `7638305a70b0f65cde4cefc997a0e5bac74a594e` was normally pushed to `feat/observability-parity-implementation`, PR #760 OPEN/draft, while later native source work stayed local. Its completed Fleet job 122338480877 passed 2200 tests, skipped the same seven opt-in Elastic lab cases as 0ea, failed 0 (2,207 tests across 85 files, 724.62s). Deploy passed 828 tests with zero failures across 32 files in 65.25s. Stable pixels 122351149202 and CodeQL 40546507925 succeeded. At 17:27:49 UTC its own main 40546519578 workspace/Twilight and Infra 40546519843 generic K3s job 122347688020 were still live; their final outcomes remain unverified here. Old 0ea success cannot certify 7638 or later native commits. Trusted-wiki 40546509129 skipped.

Evidence was obtained with `gh run view <run> --repo Prosperous-Unification/puni-00 --json databaseId,headSha,status,conclusion,jobs`; the completed Fleet log used `gh api --allow-escape-sequences repos/Prosperous-Unification/puni-00/actions/jobs/122338480877/logs`. Retained workspace log SHA-256: 0d5380195b911fe0907a0ccbad1e2e6f9b1142c194fee9a2557a81e9babdc5f0. Retained 7638 Fleet log SHA-256: 4cd7b2e3d073ae69f55163f9ccb312dc7836b9989f82982b3e52d4d3f329cd20 (664,141 bytes). These are existing CI observations, not a new test execution or full observability rehearsal. Actual source/capacity admission, Kubernetes observability acceptance, operator views, history/recovery and live convergence remain open.

## Task25c3b — conditional native Deployment first replacement wave

Approved four-artifact intent and implementation BASE: `89323516a9424f2dd58ea936f14e6afd805c5b65`. Source commit: `adfc22f5f9c036d8466a319ab220480712962cb4`. This completes the bounded Deployment source slice for scoped review, not full task 3.1 or runtime admission. No values, resource caps, replicas, pins, CI, rendered graph or runtime inputs changed.

The existing validated traversal now checks known Deployment strategy/count/deadline fields before incomplete shortcuts. Recreate plus rolling fields, foreign StatefulSet fields, malformed integer/percentage values, both rolling quantities zero and deadline/readiness contradictions refuse. MaxSurge percentages may exceed 100%; maxUnavailable percentages may not. These rules and defaults are bound to [Kubernetes v1.36.4 validation](https://raw.githubusercontent.com/kubernetes/kubernetes/v1.36.4/pkg/apis/apps/validation/validation.go) and [defaulting](https://raw.githubusercontent.com/kubernetes/kubernetes/v1.36.4/pkg/apis/apps/v1/defaults.go), not observed runtime behavior.

Supported source gets R full initial plus R full first-replacement Pod charges through existing normalization, expansion and summation. Initial/replacement cohort slots are accounting coordinates, not live Pod names, UIDs or ordinals. The fixed same-template/single-ReplicaSet scenario requires complete successful/uncertain creation history, reconciled creation observations, no prior/adopted work, unchanged identity/template/scale, no unaccounted create retries and no replacement of a replacement. Force deletion, lost nodes, foreign mutation, rollout and controller recreation remain excluded. Every supported owner retains `deployment-replacement-wave-runtime-binding`; independently establishing and enforcing the event constraints remains required before admission. Neither policy, historical snapshot, grace nor a caller boolean establishes that future bound.

Task29 lifecycle records, scope, nine charges and unrelated obligations remain exact. The output adds separate `deploymentScope`/`deploymentLifecycles` and Deployment entries. Two existing inventory metadata interfaces are exported solely to name the inferred public return type; no raw manifests entered public inventory. One existing ordinal assertion narrows the additive concurrency union without changing its expected values. Selected/cutover production code is untouched.

### Retained-source control

The single retained control ran against **clean adapter adfc22f5f9c036d8466a319ab220480712962cb4**, independently preserving **captured source 5bd1104bf76e0a36c5d34ddcc2a4ba6f4b4e6b57**. It verified the original three capture hashes/modes (unchanged from Task25c3a), selected toolchain bytes, all 25 frames/11 stages, exact receipt inventory and all 80 original unresolved facts. It passed **1 test / 79 assertions / 0 failures**, Bun 4.07s, process 4.115s. No graph/chart/public-entry rerender occurred.

Six actual positive owners: registry, kps-operator, both namespace-specific signal-metrics, blackbox-exporter and kube-state-metrics. Twelve new Pod slots contribute **2688Mi memory, 590m CPU requests and 512Mi known ephemeral declaration**. The complete conditional ledger is **6272Mi / 1090m / 8960Mi known disk**, with **21 charges and 106 blockers**. These are source reservations/contributions, not hardware sizing, observed usage, enforced storage quotas or a complete fit.

Ten Deployments retain independent blockers: three cert-manager resource-map omissions; Velero's init resource omission; alert-receiver and all four Flux controllers' unbounded emptyDirs; object-store's unbounded writable root. Velero additionally declares unbounded scratch/plugins and writable roots; this decoder retains the missing-resource primary obligation rather than fabricating a complete Pod. Registry's external claim and five positive owners' missing ephemeral-limit/writer obligations remain explicit. The retained control compared every old StatefulSet entry/lifecycle and every non-Deployment blocker exactly to the prior receipt, including all nine Jobs, four DaemonSets and one CronJob.

### RED, watched faults and restored checks

Decoder RED: 23 expected failures; GREEN: 24 passing cases after explicit array-shape refusal. First-wave RED: 22 expected failures with 24 prior decoder cases passing. Final restored focused suite: **56 pass / 148 assertions / 0 failures**, Bun 662ms, process 0.679s. Two touched ordinal compatibility controls passed **2/2, 16 assertions**, Bun 537ms/process 0.549s.

Setup/expectation corrections were recorded rather than counted as behavioral failures: an initial test write used the wrong project-relative path and created no file; an initial decoder command used the repository root with project-relative arguments; the first schema allowed arrays for optional-only objects; two expected values were corrected to the existing unresolved-namespace identity and max-based ephemeral normalization; one quantity diagnostic already came from the earlier inventory boundary. Scoped typing required the two metadata type exports and an ordinal-only assertion narrowing; lint required block arrows and a typed expected-array construction. No source contract was weakened to make these pass.

**41 new safety faults** were individually observed failing production-path controls and restored, total process 23.982s. They cover schema/array shapes; four foreign-field omissions; Recreate contradiction; surge/unavailable inputs, numeric/percent domains, percentage bound, zero relationship and deadline; early prepass ordering; source defaults/template identity; runtime history/replacement/observation conditions; omitted or zeroed cohorts and duplicate slot identities; source identity/namespace/provider/paused/count/resource blockers; frame/pointer provenance; exact claim namespace/reference; app/init writer obligations; runtime-wave blocker and combined totals. Adjacent `Proof:` comments name the injected faults. The before/after restoration hash matches; `/tmp/puni-task25c3b/source-before-proofs.ts` preserves that exact input. Final changes after the faults were Proof comments and helper naming, followed by the restored suite and statics.

Commands ran from the repository root unless marked project directory. Exact command arrays, UTC starts, exits and timings are retained in `checks.json`, `proofs.json` and `retained-control.json` under `/tmp/puni-task25c3b/`.

```bash
# tools/tool-fleet
bun test --preload ../test/scratch/preload.ts src/observability-native-deployment.test.ts
bun test --preload ../test/scratch/preload.ts src/observability-native-ordinal.test.ts -t 'default StatefulSet lifecycle|claim concurrency metadata'
bun test /tmp/puni-task25c3b/retained.test.ts
# repository root
python3 /tmp/puni-task25c3b/prove.py
bunx tsc --project tools/tool-fleet/tsconfig.lib.json --noEmit --incremental false
bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false
bunx eslint tools/tool-fleet/src/observability-native-ordinal.ts tools/tool-fleet/src/observability-native-deployment.test.ts tools/tool-fleet/src/observability-native-ordinal.test.ts tools/tool-fleet/src/observability-rehearsal-inventory.ts
bunx prettier --check tools/tool-fleet/src/observability-native-ordinal.ts tools/tool-fleet/src/observability-native-deployment.test.ts tools/tool-fleet/src/observability-native-ordinal.test.ts tools/tool-fleet/src/observability-rehearsal-inventory.ts
git diff --check
```

Final source/test typechecks, scoped lint, format and whitespace exited 0 in **1.028s / 1.213s / 4.188s / 0.466s / 0.010s**. `bunx openspec validate observability-environment-parity --strict --json` passed one change with zero issues in 16ms (0.118s process); canonical artifact format/whitespace passed. Normal source pre-commit hooks passed in 4.29s; Tool Wiki explicitly remained inactive/uncertified (external activation root unprovisioned), and migration/doc-cap hooks were inapplicable.

Evidence SHA-256:

- Source adapter: `23045269d5b1dbec1ce23caacca38260fcac673c1a7041da7813da41684fdc33`.
- New Deployment tests: `e3b6345359aa8eae15894e7d121e131dad459efd2b9b8f26ab5a41727801d292`.
- Proof receipt: `e49010773f712c202b53d9c3fece01b16ae639e725c490f1673750104445bee0`.
- Retained test: `f4c4420663ee0489cee53c6e41d85bb9253f8084665712ad59cd601b817e0b85`.
- Retained ledger: `59c1d554ce3972d2a01cca4ba06ecf0c9a6cf6ed8990af1aa908b68636704aa6`.

Not run: historical Task29 test/fault batches, full suites/build/host gates, unchanged rendering, Kubernetes/Docker/image/store/credential/host actions, CI reruns, push/merge or deploy. These are outside this bounded source slice; root owns review/publication/CI. Full source/measurement/host admission, actual runtime ownership/enforcement, Flux, stored signals/views/history/recovery and live acceptance remain required. Creation/runtime authority remains false.

## Existing Compose history reference — 2026-10-27

A bounded read-only capture at 2026-10-27T17:39:38.466833+00:00 queried the existing Compose backends through strict-host-key SSH to h1claw and its existing h3mon loopback tunnel. Observation `63a6fb0b-1b2f-4b9e-9797-52a274112014`, dev/be-01 revision `e3a973aabd2d912981a7fcfe2008dd39f9129391`, observed at epoch milliseconds 1793122667774, has one stored log and two linked trace spans in Elastic plus six Prometheus scrape times with the exact observed-time, revision and success gauges. These are external health-probe signals from `puni-dev-probe`, not proof of application-internal tracing or the common Kubernetes deployment.

Elastic queries used `POST /logs-*.otel-dev/_search` and `/traces-*.otel-dev/_search`, filtered by observation ID, producer and dev environment, size 16, exact total-hit tracking and 3s server timeout. Required HTTP 200, no timeout, zero failed shards and complete bounded hit counts. The retained projection excludes log bodies, records exact index/document IDs and SHA-256 fingerprints, and validates the root/client span relationship. Prometheus used `GET /api/v1/query` with a 600s raw range selector over the three existing probe gauges at the capture time; matching historical samples retain their actual scrape timestamps. Each response was limited to 256 KiB and each request to 8s. No backend, service, credential or configuration mutation occurred.

Safe immutable evidence: `/tmp/puni-parity-history-baseline-20261027-a.json`, copied mode 0400 to the controller's `history-baseline/compose-observation-20261027.json`; SHA-256 `cf6d8eadf5da6484cb2fa9b1071d7e575252cd338878732d791f9417541eaeba`. The adjacent private README records query details and retention limits. This is a concrete pre-migration reference only. Retention may expire it; recheck before a future migration without deleting prior evidence. History after migration, supported retained-backend access, route switch, restore/rollback, Kubernetes stored signals/operator views and live convergence remain unverified.

A separate safe checkpoint/unit read at 17:38:13 UTC found the observer/tunnel active and running, PIDs 3574625/3574624 and zero restarts. Its latest assessment reported complete logs/metrics/traces at checkedAt 1793122664552. That checkpoint summary does not substitute for the direct historical queries above. An initial local note-generation syntax error occurred before any write; fixing query-brace handling did not repeat the remote queries.
