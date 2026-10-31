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

## Task25c3c — bounded shared networking source

Implemented the five shared cert-manager/Traefik maps and two Traefik scratch bounds from [the candidate policy](design.md#bound-the-shared-networking-containers). Source commits: `a18d17f64bc0c097f74ed5919864e7f2484e58dc`, then CPU representation/test correction `f6858176805d1ba3943fccb10e9b4397eafe1ad2`, on intent base `4faf5870922ab3cdf70fba56f67a0ee1b01f9996`. `validatePlatform` now requires complete current networking budgets after structural image decoding; historical missing/null maps remain valid incomplete evidence. Shared `assertPodResources` owns quantity/request≤limit validation. Positive limits/scratch are separate requirements; zero requests remain valid. Exact unknown-key, image, chart, network and ownership boundaries remain enforced.

### Captured source and actual outputs

The final actual canonical producer used clean source **and separately recorded clean generator** `f6858176805d1ba3943fccb10e9b4397eafe1ad2`: 11 stages, 25 frames, 396 inventory entries, 1 test/71 assertions, exit 0 in 12.002s. Existing locked cache archives were copied/verified/extracted into owned scratch through the existing tool fixture; no new download, cache replacement, cluster or runtime action occurred. Raw outputs and receipt were saved before assertions, then retained mode 0400 under `/tmp/puni-task25c3c/`:

| Capture                           | SHA256                                                             |
| --------------------------------- | ------------------------------------------------------------------ |
| `bounded-frames.json`             | `ed85fd36b2bdf185f89597626f88f5a2df6e917c78db416aa2a71943e0ac7e18` |
| `bounded-frames.json.stages.json` | `c49856b37d44b1e72eeb9f22d972f3b1f7a751033ca0f9878543d45ae91d28dc` |
| `bounded-receipt.json`            | `c500700d0c9bd6ec1e83dd0dee5224e6300cad9819aed6392a9b6f80037b9c71` |

Artifact SHA256 `95cbf7f43f0c5497481d60acceef530c1270046da2d7286d54d8109584fc7d25`; inventory SHA256 `fe4cec60c8614cba10e1ced1e5115b6b3e35cf355c0783da3bf8b1c4c677120a`. Helm v4.3.0 archive SHA256 `86584a54def73570558f66f5111cc53dfed56689637ae32c1201205d494f54fb`, executable SHA256 `57ce7fc4ea77b28ee6fa91ae071abcade74d3f524e80c9decff5877a5ac8eda4`. Full source-file hashes and provenance are in `identities.json`; exact commands, UTC starts, exits and timings are in each named check JSON beside its log.

All five actual maps match the policy. Traefik's `data`/`tmp` emptyDirs each render `64Mi`; `GOMAXPROCS` references `limits.cpu` with divisor `'1'`, while the pinned default 0.9 memory percentage renders `GOMEMLIMIT: 460MiB`. Ingress host ports, TLS, permanent HTTPS redirect, readiness, namespace/identity, image pins, read-only roots and disabled persistence are preserved. A retained-output comparison confirms both complete release outputs match the immutable old 5bd capture after removing only resource maps, scratch sizes and these two newly derived Go settings. Nine focused output faults independently drop the five maps, two sizes or two Go settings; all are rejected by the same capture assertions without rerendering.

The production native control passes 35 assertions in 5.837s using these retained bytes and the existing validated inventory/accounting path. It adds exactly six conditional initial/replacement Pod charges for three cert-manager Deployments: each charge is 512MiB memory, 50 milli-CPU requests and 64MiB disk. The limited ledger has 27 entries and known contributions of 9344MiB/1390 milli-CPU/9344MiB disk; all unrelated entries/blockers remain equal. It retains **106 blockers**, including three replacement-wave runtime bindings, unsupported Job/DaemonSet lifecycles and all independent contributors. Creation/runtime authority stays false. Old 5bd captures remain unchanged with their original hashes/mode; historical entries and unresolved facts still decode identically.

### REDs, corrections and proofs

The seven missing-bound tests first failed because the production validator accepted missing inputs. Two initial scratch test setups tried deleting nonexistent YAML ancestors; corrected setup produced seven assertion REDs. New structural tests exposed outer-resource and four nested scratch array acceptance; explicit map boundaries fixed them. Test diagnostics were corrected to retain existing shared quantity-error wording. One existing image-override fixture depended on image-first YAML order; preserving that order restored its control. An unintended mechanical edit to an unrelated selected-input test was restored.

The **first** producer completed at clean `a18d17f64bc0c097f74ed5919864e7f2484e58dc` in 11.978s, but its wrapper failed after 29 assertions: the test-only env schema wrongly required every `valueFrom` to use `resourceFieldRef`; cert-manager uses `fieldRef`. The corrected reusable assertions passed 42 assertions against those captured bytes. Its subsequent native control then correctly exposed numeric CPU limits incompatible with the unchanged strict string-quantity native schema. The approved correction quoted the five authored CPU limits without changing amounts; this genuine source change justified the final producer above. No successful producer was repeated. All 115 generator input paths/hashes are byte-identical between a18 and f685; the helper uses the existing `.test.ts` exclusion. No generator filter, lint config, normalizer, skip flag or production writer changed. The first capture remains separately named `current-*`, mode 0400, with hashes in `capture-hashes.txt`/`identities.json`; it is not final-source acceptance.

The final private native control initially exceeded Bun's default 5s test deadline after 35 assertions; rerunning **retained bytes only** with `--timeout=15000` passed. Initial inferred test types/import ordering and an attempted outside-src helper's ESLint project association were corrected before normal commits.

Nineteen focused R5 guard/dependency faults failed with assertions and restored identical bytes; adjacent `Proof:` comments identify them. `proofs.json` records each command, fault/restoration hashes and duration. Two private mutation-harness attempts accidentally captured the whole-module replacement variable and failed before tests; they are explicitly excluded from the nineteen proofs.

| Faults                                                                                                                             | Observed production-path failure                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `candidate-call`; `required-controller`, `required-cainjector`, `required-webhook`, `required-startupapicheck`, `required-traefik` | Missing five maps/two scratch bounds became accepted.                                 |
| `positive-limits`; `required-scratch`; `positive-scratch`                                                                          | Zero limits with zero requests, missing scratch sizes or zero sizes became accepted.  |
| `resource-array`; `scratch-array`; `tmp-volume-array`; `persistence-array`                                                         | Malformed arrays became accepted by structural release decoding.                      |
| `scratch-reader`; `shared-resource-validation`                                                                                     | Supplied invalid/negative quantities or request/limit contradictions became accepted. |
| `resource-unknown-keys`; `scratch-unknown-keys`; `disabled-persistence`                                                            | Foreign branches or enabled persistence became accepted.                              |
| `historical-null`                                                                                                                  | Historical absent/null image-decoding controls failed.                                |

### Commands and checks

Commands ran in the assigned worktree. The 88 new boundary tests plus six selected existing platform cases passed in the 95-case focused run; its one fixture-order failure passed separately after preserving YAML order (0.794s). Five selected historical/strict-cutover checks passed (0.913s). Both library/spec typechecks passed (1.770s/1.595s); changed-file lint passed (4.753s). The correction's spec typecheck/lint/locked-platform control passed (1.485s/3.198s/1.144s). Source commits ran normal hooks in 4.272s/3.294s; Tool Wiki reported inactive, not certified. Formatting/whitespace passed. Scoped strict OpenSpec validation passed one change/zero issues in 17ms (0.234s process); evidence formatting passed in 0.670s. Standalone `openspec` was absent from PATH; the repository-pinned `bunx openspec` worked. No old broad test/proof matrix ran.

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/platform.test.ts -t 'Task25c3c|accepts the locked ordered platform|rejects a chart version|rejects a chart image|rejects an image repository|rejects an unmodeled chart|rejects a Helm post-renderer|rejects Traefik host ports'
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-workload.test.ts tools/tool-fleet/src/observability-rehearsal-inventory.test.ts -t 'default model has no source evidence|closed observed schema still rejects|fix1 old direct validator retains'
bunx tsc --project tools/tool-fleet/tsconfig.lib.json --noEmit --incremental false
bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false
PUNI_REHEARSAL_INVENTORY_EXPORT=/tmp/puni-task25c3c/bounded-receipt.json PUNI_REHEARSAL_FRAMES_EXPORT=/tmp/puni-task25c3c/bounded-frames.json bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-rehearsal-inventory-entry.test.ts
bun test --timeout=15000 /tmp/puni-task25c3c/bounded-native-control.test.ts
bun test --timeout=15000 /tmp/puni-task25c3c/propagation.test.ts
```

These are unmeasured candidate budgets and source evidence, not host admission or proven enforcement. Actual certificate/webhook reconciliation, ingress/TLS/redirect/readiness, throttling/GC/load, recovery and disk/log pressure remain required. Velero's coupled AWS-init/server ephemeral/plugin/scratch contract is the required next unit. Other native/operator/writer/system/helper/image/transient/host/admission, full Flux, signals/UI/history/recovery/live obligations remain open; canonical progress stays 4/11. Builds/full gates and runtime checks were not run; they follow normal affected CI and separately authorized runtime work. No push, merge, deploy, CI rerun, Docker/cluster/store/Secret/host mutation or new runner occurred.

## Task25c3d — exact Velero patch and bounded plugin storage

Source commit `0e39b65706c1c6dd98fb031cd7927f6262e1d539` implements the accepted intent on `f7acf8cec72985e90e37cd7c3c08442e9a95e70b`. Both owning Velero declarations retain their server CPU/memory, node-agent branch, endpoints, credentials and original component/chart/image pins. Server ephemeral request/limit is 128Mi/1Gi; AWS init requests are 50m/64Mi/16Mi and limits are quoted CPU '1'/256Mi/128Mi. The exact inline three-operation patch tests the full original volume array, then bounds plugins/scratch at 256Mi/1Gi.

Historical structural resource decoding accepts incomplete declarations while validating supplied quantities. Current candidates require complete bounds and the supported patch. A shared immutable decoder rejects unknown envelopes/targets/operations, duplicate YAML keys, multiple documents and invalid quantities. The direct renderer independently checks the source envelope, complete image roles, chart and policy. Prepared Helm authentication is factored without changing the existing public archive-selection wrapper; prepared kubectl SHA/version authentication is shared with stage building. Canonical rendering returns expansions and authenticated Helm provenance together, avoiding duplicate extraction. There is no caller authentication token or fallback download.

The renderer checks complete resource identities and one non-hook target with the full ordered volume precondition before actual locked kubectl. Private local Kustomization files carry the original source patch and Helm bytes. Afterward, exact sizes and complete semantic equality outside the two added fields are required. Hooks/CRDs remain inventoried. No patched output is synthesized by the production code.

### Actual source controls

The single canonical eleven-stage producer passed **80 assertions in 12.751s**. Source and clean generator are both `0e39b65706c1c6dd98fb031cd7927f6262e1d539`; its 116 generator input files remain independently identified. It captured 25 frames and 396 inventory entries. The distinct production declaration passed **7 assertions in 2.001s**. No required Velero capture was repeated. Raw frames/stages/receipt and production manifest/output were saved before test assertions and retained mode 0400.

| Capture in `/tmp/puni-task25c3d/` | SHA-256                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `current-frames.json`             | `22744ba8af46abf8213d8ae19d8b68055a5f6b86ebc9ef641a7205069ae1e73b` |
| `current-frames.json.stages.json` | `2b112804d1f90f4b8b456bf85611cf2e656095b92d0a26aa78d73277ddb0b7a2` |
| `current-receipt.json`            | `736a1667f5e7885dbeefef25cf55977be629d574a5401cec486c1f9dfe2c5624` |
| `production-output.json`          | `fdb68da4b4e3d02acf8376c1b8991715a5561fa7157a65aa4fed1e155affad11` |

[Provenance](/tmp/puni-task25c3d/provenance.json) separately records original chart SHA `5e6b516dc6ce83f0b46ef0440c09a5f061e68861c5c8bfdc86484e886a1ba391`, both raw source hashes, source patch SHA `f9fd87fc08509873cf8b40cec0e14d4af238c701d34b6682cdd4c74438f8f858`, canonical built declaration SHA, output hashes and selected source artifact/inventory hashes. Helm v4.3.0 archive/executable hashes remain `86584a54def73570558f66f5111cc53dfed56689637ae32c1201205d494f54fb` / `57ce7fc4ea77b28ee6fa91ae071abcade74d3f524e80c9decff5877a5ac8eda4`; kubectl v1.36.4 remains `8b8f088da2dab964f853b38464033b1be15ede2839eca751482357c45abdd05a`. Only owned private tool extraction was used; shared artifacts were not replaced.

A retained-byte control passed **58 assertions in 8.251s**, comparing all release outputs to actual Task31 f685 output after removing only the new Velero resource/size fields. Node-agent and every unrelated rendered object remain semantically equal. Both environment outputs pass `assertInventoryWorkload` and `normalizeWorkload`, with equal Velero models. Two conditional initial/replacement contributions are added, each 512MiB memory, 100 milli-CPU and 1280MiB disk. The incomplete ledger now has 29 entries, known contributions 10368MiB/1590 milli-CPU/11904MiB and **106 independent blockers**, including Velero replacement-wave runtime binding. Unrelated entries/blockers remain equal. [Control summary](/tmp/puni-task25c3d/source-control-summary.json), [ledger](/tmp/puni-task25c3d/current-ledger.json).

Task31's immutable f685 frames/stages/receipt and historical 5bd C2b frames/stages/receipt retain their original hashes, mode and identities. Both historical inventories decode to their recorded entries/unresolved facts; neither is relabeled as current. [Preservation receipts](/tmp/puni-task25c3d/historical-preservation.json). Six actual captured-output faults remove server disk bounds, plugin resources, either size limit or quoted CPU representation; all fail the shared capture assertions without rerendering (22 assertions, 0.483s).

### REDs, watched faults and fixture corrections

Initial missing-policy/plugin tests resolved incorrectly, establishing assertion REDs. Historical missing server resources failed its acceptance control. The expanded candidate fixture initially stopped at stale generated coexistence bytes; refreshing them through the existing budget function let the intended policy checks run. The owning-source test failed for missing policy, and the new actual-output assertions rejected historical Task31's missing init map. Forty focused guard mutations each produced assertion failures and restored identical source bytes; commands, fault/restoration hashes and durations are in [proofs.json](/tmp/puni-task25c3d/proofs.json) and [proofs-extra.json](/tmp/puni-task25c3d/proofs-extra.json), with adjacent `Proof:` comments.

| Proof groups                                                                                                                                           | Observed failure when removed or broken                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Candidate call/server/plugin maps, positive limits/disk requests, shared quantity validation                                                           | Missing maps, zero policy bounds or request/limit contradictions became accepted.                                      |
| Patch fields/cardinality/target/document count/duplicate keys/operation count/test/add/full-volume checks, positive/string quantities, frozen snapshot | Foreign or ambiguous patches became accepted, or immutable-authority assertion failed.                                 |
| Platform/direct contextual calls, direct source/namespace/image/candidate checks, chart integrity                                                      | Unsupported releases, missing policy/budgets, foreign source/identity/images or substituted archive became accepted.   |
| Unique identities, required non-hook target, rendered volume precondition                                                                              | Named early refusals disappeared or execution reached patching.                                                        |
| Exact sizes, complete closure and complete effects                                                                                                     | Ignored patch, wrong quantities, missing object, image/reference mutation became accepted.                             |
| Helm/kubectl authentication calls, kubectl digest/version, Helm version, command exits                                                                 | Missing/unreadable/substituted preparations, changed reported versions or failed commands lost their required refusal. |

Strict TypeScript indexing, inferred test tuples, imports and awaited test-fault lifetimes were corrected before source commit. One exploratory namespace diagnostic hit the preexisting Secret-closure refusal first; it is excluded as a new guard proof. Direct renderer namespace coverage reaches the actual identity guard.

A final affected-caller audit found one old chart-negative fixture that used a fake Helm executable to corrupt its chart during the version probe. Required executable authentication now correctly rejects that fake first. Its initial RED and the next setup's earlier source-wrapper chart refusal are retained. The corrected fixture corrupts only its owned private chart at the real renderer call seam after wrapper validation and delegates to actual prepared tools; the original `/chart differs/` assertion passes (2 assertions, 2.19s). An intermediate namespace-import collision shadowed that seam and caused **one incidental observability projection render** before the test failed on a null rejection. This excluded setup failure is neither a required Velero capture nor proof; it is not hidden as a no-render run. Binding correction passed scoped lint/types before the final negative. This test-only correction does not change the captured source/generator identity or require new captures. All 116 captured generator input hashes and both owning release hashes still match; the only later differences are this test and OpenSpec evidence/task links. [Byte-equivalence receipt](/tmp/puni-task25c3d/generator-equivalence.json).

### Commands and bounds of evidence

The final new-boundary run passed **109 tests / 157 assertions in 30.58s**; five selected historical/strict-cutover checks passed in 1.081s. Library/spec typechecks and changed-file lint passed. Source commit ran normal hooks in 5.08s; Tool Wiki reported inactive, not certified. Scoped strict OpenSpec validation passed one change with zero issues in 18ms; formatting and whitespace checks passed. Exact check logs and capture command receipts remain in `/tmp/puni-task25c3d/`.

```sh
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/platform.test.ts tools/tool-fleet/src/observability-velero-render.test.ts -t 'Task25c3d (?!actual production)'
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-workload.test.ts tools/tool-fleet/src/observability-rehearsal-inventory.test.ts -t 'default model has no source evidence|closed observed schema still rejects|fix1 old direct validator retains'
bunx tsc --project tools/tool-fleet/tsconfig.lib.json --noEmit --incremental false
bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false
PUNI_REHEARSAL_INVENTORY_EXPORT=/tmp/puni-task25c3d/current-receipt.json PUNI_REHEARSAL_FRAMES_EXPORT=/tmp/puni-task25c3d/current-frames.json bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-rehearsal-inventory-entry.test.ts
PUNI_VELERO_PRODUCTION_EXPORT=/tmp/puni-task25c3d/production-output.json bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-velero-render.test.ts -t 'Task25c3d actual production'
bun test --timeout=30000 /tmp/puni-task25c3d/source-control.test.ts
bun test /tmp/puni-task25c3d/propagation.test.ts
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-projection-render.test.ts -t 'renderer refuses a changed pinned chart before invoking it'
```

The required generated `coexistence.json` refresh used `bun -e 'import { writeFile } from "node:fs/promises"; import { assessObservabilityBudget } from "./tools/tool-fleet/src/observability-budget"; await writeFile("infra/platform/observability/base/coexistence.json", JSON.stringify(await assessObservabilityBudget(process.cwd())));'`. Its only numeric differences are the new init contribution: Velero 256→320MiB, steady 12134→12198MiB, overlap 17766→17830MiB and shortfall 2164→2228MiB. Capacity, reserves, retained workloads, algorithm and `admitted:false` remain unchanged.

These are unmeasured candidate bounds and offline source evidence. Actual Flux revision/patch/Pod binding, plugin installation, backup/load/recovery, writable-root/log accounting, physical disk/eviction/headroom enforcement, complete contributor/host admission and all signals/views/history/isolation/live obligations remain required. Creation/runtime authority remains false; canonical progress stays 4/11 and full task 3.1 stays open. Builds, full host gates and runtime checks were not run. No push/merge/deploy/CI rerun, cluster/Docker/store/Secret/host mutation, pin/archive amendment or production runner was performed.

## Task31 CI fix1 — restore fresh projection CLI initialization

Source `2402f176ce79a1f7e3781bbbe22e3264ebc3c6bf` restores the precise existing CLI contract from clean follow-up base `43e5738f5e3766e49987081a747a73e7ea4ab4a2`, including the separately reviewed Task32 source. R4 delta-spec exemption was explicitly approved for this mechanical dependency restoration; no policy, signature or architecture feature changes.

The published 63004ecc Infra/fleet log (`/tmp/puni-pr760-fleet-6300.log`, SHA256 `fc95e6c0718735ce9b91cb40188ff98f7a1d369a495777fc5d937e1723f41304`) showed five projection CLI diagnostic failures. The unchanged seven-case file reproduced **2 pass/5 fail** in a fresh Bun process on BASE43 (2.186s). Children threw `Cannot access 'ObservabilityResourceAPI' before initialization` at `observability-source-render.ts:26`, before the CLI's `try` and argument/input handlers. The two privacy passes alone did not prove startup health.

The actual eager cycle was `projection-cli → projection-render → projection → platform → platform-releases → generated-capacity → source-inventory → source-render → projection-render`. Task32's `projection-render → observability-render → platform-releases` edge reaches the same dependency. The fix moves `ResourceList`, `PodResources` and `assertPodResources` unchanged into `observability-pod-resources.ts`, which imports only ArkType and existing capacity readers. `platform-releases` and `observability-rehearsal-inventory` use that leaf; `observability-generated-capacity` imports and re-exports the same function for existing callers. Schema/function body SHA256 `dec03ba9a85be80b64c7d912d81238b5f4ca92b553d0db9805498741f0f04b05` matches BASE43 verbatim. Public `Generated capacity …` errors, missing/null/array handling, quantity/zero/request≤limit semantics and detached return maps are preserved.

One controlled regression restored only the `platform-releases → generated-capacity` import. The same unchanged CLI file reproduced **2 pass/5 identical initialization failures** in 2.258s. The file was restored byte-for-byte (`e08d9ed2414024286bae5d2967998922180391e2ec730c2b66b6028d9a5844eb` before/after; fault hash `47dcfafaee9cdaca8804815318cd137f44d97469d48ad078d0f7e8da769ffe26`). The adjacent import `Proof:` records this observed dependency failure. No old resource proof matrix was replayed.

Final checks, all exit 0:

| Check                                                                                            | Observed output / process duration                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Unchanged projection CLI file after restoration/import sorting                                   | 7 pass, 24 assertions; 4.088s.                                                                          |
| Selected native resource input/detachment controls                                               | 12 pass, 19 assertions; 1.552s.                                                                         |
| Selected current networking/Velero and historical decoding controls                              | 10 pass, 14 assertions; 2.942s.                                                                         |
| Private fresh source-CLI argument diagnostic and legacy/leaf export identity/error/zero controls | 2 pass, 10 assertions; 1.790s.                                                                          |
| Library/spec typechecks                                                                          | 1.958s / 2.055s.                                                                                        |
| Changed-file ESLint                                                                              | 3.792s; the initial run caught only import ordering, corrected before final CLI/control acceptance.     |
| Prettier and `git diff --check`                                                                  | Passed.                                                                                                 |
| Scoped strict OpenSpec and evidence formatting                                                   | One valid change/zero issues, 17ms (0.224s process); formatting 0.619s.                                 |
| Normal source commit hooks                                                                       | 3.790s; Tool Wiki inactive/not certified, applicable lint/format/secrets/private-nesting checks passed. |

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-projection-cli.test.ts
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-rehearsal-inventory.test.ts -t 'native resource (array|request array|limit array|CPU quantity|memory quantity|contradiction) refuses|shared resource validation returns detached|fix1 old direct validator retains|actual native request and limit maps retain|nullable native resources remain'
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/platform.test.ts -t 'accepts the locked ordered platform|Task25c3c explicit zero requests|Task25c3c cpu malformed request refuses|Task25c3c memory above limit refuses|Task25c3c historical|Task25c3d zero CPU and memory|Task25c3d plugin bad cpu refuses|Task25c3d server above disk limit refuses|Task25c3d server positive ephemeral-storage limit required'
bun test /tmp/puni-task31-ci-fix1/import-controls.test.ts
bunx tsc --project tools/tool-fleet/tsconfig.lib.json --noEmit --incremental false
bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false
bunx eslint tools/tool-fleet/src/observability-pod-resources.ts tools/tool-fleet/src/observability-generated-capacity.ts tools/tool-fleet/src/platform-releases.ts tools/tool-fleet/src/observability-rehearsal-inventory.ts
```

Exact command arrays, UTC starts, exits and timings live in `/tmp/puni-task31-ci-fix1/*.json` beside their logs; `edge-proof.json`, `verbatim.json` and `identities.json` retain fault/restoration/body/source hashes. Final leaf SHA256 is `2fb83b5410c0092170972331701e43a204c984810bf49997ce327175cbfa4462`; other changed-source hashes are recorded in `identities.json`. CLI tests/handlers, both eager API definitions, Task32 patch/renderer and both Velero YAML files were compared byte-for-byte with BASE43 and remain unchanged.

No lazy union, fallback, swallowed import error, assertion weakening or configuration workaround was introduced. No actual chart/public-producer render, historical capture/proof replay, broad suite, build/full host gate, CI action, push/merge/deploy, host/cluster/Secret action or runtime acceptance ran. CI/publication remain root-owned; prior source captures are not relabeled as current-generator evidence. This startup repair does not close any remaining parity/admission/runtime obligation.

## Published CI timeout and fresh-entry regression — 2026-10-27

These are distinct failures at distinct published source revisions. Neither is a passing required verdict, and neither changes runtime acceptance.

Published `7638305a70b0f65cde4cefc997a0e5bac74a594e`: main run 40546519578 ended cancelled, workspace job 122338769922 ran 17:01:29–18:32:27 UTC (90m58s). Its official annotation states `The job has exceeded the maximum execution time of 1h30m0s`; stable gate 122389377109 failed. The core test/typecheck/build, workspace lint and Burokrat source-lint commands all exited 0, taking 4,558,018ms + 541,233ms + 35,914ms = 85m35.165s. The core workflow step succeeded at 18:30:53, log upload at 18:30:55 and solver image smoke at 18:32:07. The timeout cancelled the heavy-work-lock check; head pinning, dev entrypoint, secrets/private/doc/compose/migration/corpus/OpenSpec/schema checks were skipped. Full required coverage therefore remains unverified for that source. No timeout increase, selection change or disabled check was applied.

Retained once: artifact 12759990536, `/tmp/puni-pr760-workspace-7638-artifact/nx-gate.log`, 4,050,249 bytes, SHA-256 `ad18ce9ad0a6f082c07197ab57abb43f7a8b9ba3a2f480862c9de634655c78d2`; raw job log `/tmp/puni-pr760-workspace-7638.log`, 204,226 bytes, SHA-256 `b3a9f9ae79cd37927463b75478b7de1b23a94798f417939193a9c6abf5605587`. Commands were `gh run download 40546519578 --repo Prosperous-Unification/puni-00 --name nx-gate-log-workspace-1 --dir /tmp/puni-pr760-workspace-7638-artifact`, job-log API and `gh api repos/Prosperous-Unification/puni-00/check-runs/122338769922/annotations`. Exact command JSON records, annotations and step metadata are retained in the controller's `published-7638-final-ci.json`. Sequential command durations do not identify overlapping task CPU bottlenecks. The older 0ea 89m53s green gate does not certify 7638.

Published `63004ecc92a4abab1803ca0c19c55bdc7b02b394`: Infra run 40563427159 failed in Fleet job 122398234802 (18:48:49–19:02:54 UTC). Bun reported 2430 pass / 7 unchanged opt-in skips / 5 fail, 2442 tests across 88 files in 750.21s. All five failures were existing projection CLI argument/input diagnostics: child processes hit `ReferenceError: Cannot access 'ObservabilityResourceAPI' before initialization` in observability-source-render.ts:26 before entering CLI input handling. This is a source initialization regression, separate from the prior timeout. K3s job 122405683067 skipped and subsequent deploy checks were not reached; no generic/full observability rehearsal success is inferred.

Retained Fleet log `/tmp/puni-pr760-fleet-6300.log`, 559,284 bytes, SHA-256 `fc95e6c0718735ce9b91cb40188ff98f7a1d369a495777fc5d937e1723f41304`, obtained once with `gh api --allow-escape-sequences repos/Prosperous-Unification/puni-00/actions/jobs/122398234802/logs`. Exact failed names and all seven unchanged skip names are in the controller's `published-6300-infra-failure.json`. Successful CodeQL/pixels or a still-live main shard do not override this failure.

[Task31 CI fix1](#task31-ci-fix1--restore-fresh-projection-cli-initialization) records the reproduced five failures, verbatim helper extraction, all seven unchanged CLI tests passing, the controlled old-import fault and independent scoped approval. The repair preserves the API union, CLI handlers/assertions, resource checking and Task32 source contracts. Its local evidence is not a new hosted CI verdict. Publishing a reviewed repair for this known failing revision may supersede its remaining run through existing workflow concurrency; this is a meaningful source update, not a rerun triggered by waiting. Observe the replacement checkpoint's own required verdicts.

## Task33 / Task25c3e — conditional serial Job lifecycle accounting

Intent BASE `701c58bc271adfa74df374a95192d7a2a9e2cce5` preceded source/tests. The approved current typed shape adds only Job policy decoding, conditional lifecycle records and accounting slots to the existing native companion. Source commit **`4adb2425057144ca2232437573f2678ca81234a9`** was clean for the single retained-source control. Normal commit hooks passed in 3.94s; Tool Wiki reported `inactive`, not certification. No pushes, CI actions, host/runtime mutation, chart rendering or new capture occurred.

Supported accounting is a fresh unchanged serial NonIndexed Job with effective parallelism=completions=1, suspend/manualSelector=false, supported default failure/replacement behavior and no live/foreign identity. Backoff B retains B+1 full normalized Pod slots, including failed/terminating attempts. The existing normalizer, owner expansion and shared capacity sums are reused. Job scope/lifecycles are additive; inventory and both authorities stay source-only/false. Slots are accounting identities, never Pod names or UIDs.

The adapter materializes at most 256 slots per Job (backoff 0..255); this is a computational limit, not a Kubernetes, hardware or physical safety bound. Backoff256 and MaxInt32 are valid incomplete sources, without truncation or materialization. All supplied known malformed policy/count/selector/resource/volume state is rejected before these branches, provider mismatch or missing bounds. Broad absent/null resource maps remain incomplete. Specific pinned-source lookups resolved conditional completion defaulting, policy defaults and recognized validation domains; no controller-design research was repeated. Job deadline 0 and values above int32 but within safe integers are metadata, not reclamation deadlines.

Per-owner runtime and whole-attempt Helm install/upgrade/retry/remediation, hook Job UID, Flux forced-recreation and retained predecessor/Pod/device/log history obligations remain mandatory. Failure/finalizer accounting, successful/uncertain creation reconciliation and no further creation after success are explicit unobserved conditions. Container restarts reuse slots but leave cumulative logs unbounded; deadlines, grace, TTL and hook policies earn no cleanup credit.

### Commands and outcomes

Commands ran from `/home/df/.codex/worktrees/aa39/puni-00`; exact final arrays/UTC starts/exits/timings are in `/tmp/puni-task25c3e/source-checks.json` and `retained-command.json`.

| Command                                                                                                                                                                                        | Observed result                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-native-job.test.ts`                                                                                     | Final restored source: **104 pass, 0 fail, 448 assertions**, Bun 805ms/process0.823s.                               |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-native-ordinal.test.ts tools/tool-fleet/src/observability-native-deployment.test.ts`                    | Selected unchanged-family compatibility: **147 pass, 0 fail, 285 assertions**, Bun 1.342s. Not repeatedly replayed. |
| `bunx eslint tools/tool-fleet/src/observability-native-ordinal.ts tools/tool-fleet/src/observability-native-job.test.ts`                                                                       | Exit0, 3.845s.                                                                                                      |
| `bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false`                                                                                                          | Exit0, 1.282s; scoped Fleet types, no emitted build.                                                                |
| `bunx prettier --check tools/tool-fleet/src/observability-native-ordinal.ts tools/tool-fleet/src/observability-native-job.test.ts openspec/changes/observability-environment-parity/design.md` | Exit0, 0.463s.                                                                                                      |
| `bunx openspec validate observability-environment-parity --strict --json`                                                                                                                      | One valid change, zero issues, exit0, 0.845s.                                                                       |
| `git diff --check`                                                                                                                                                                             | Exit0, 0.027s before source commit.                                                                                 |
| `bun test --timeout=15000 /tmp/puni-task25c3e/retained.test.ts`                                                                                                                                | Exactly one clean committed-adapter retained-source control: **1 pass, 0 fail, 205 assertions**, Bun2.26s.          |

Meaningful original RED/setup evidence is retained. Schema/default/classification first ran **7 pass / 44 fail**; implemented green 51. Charge/metadata tests ran **62 pass / 9 fail**: eight missing-feature failures plus one incorrect diagnostic expectation (shared source decoding already rejects malformed CPU as `Generated capacity cpu-unknown`). Only that expectation was corrected; green 71 followed. Recognized selector/policy additions ran **87 pass / 6 fail**, then green 93. Added focused prepass/operator controls grew the suite to 101; grammar/claim controls to 103. Self-review's empty managedBy DNS-label negative failed once, then passed with its targeted fix, giving 104. Initial scoped lint reported 14 callback/template/type issues and initial types reported test YAML-node TS2339; all corrected, with final outputs above. Earlier logs were not relabeled as green. Evidence assembly initially assumed a `3.1q` checkbox in canonical tasks.md; that assertion failed after verify.md was written. The actual canonical task is a paragraph under open task 3.1, so a verification link was added there instead; no task-completion checkbox was invented.

### Observed R5 faults

Each following fault was injected individually through `readRehearsalNativeCosts`, observed failing, and immediately restored in `finally`; no old proof matrix was replayed and no mutation framework was added. Adjacent `Proof:` comments name the observed dependencies/tests. Exact fault descriptions, commands, failing-test counts, timings and restored source hashes are in `/tmp/puni-task25c3e/proofs.json`; individual `fault-<name>.log`/`.json` files preserve the output. All 47 targeted commands exited1 with failed assertions. The shared command prefix is `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-native-job.test.ts -t`; table entries are its exact final filter argument. The range fault ran only backoff 256 (257 slots), never hostile MaxInt32 with the guard removed. Expression grammar and success-index grammar controls isolate their checks from later matching/numeric refusals.

| Fault                | Exact test filter                                                                                                                                                               | Failed tests | Process seconds |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------- |
| arrays               | `Job malformed (selector array\|selector labels array\|failure shape)`                                                                                                          | 3            | 0.584           |
| attempt-count        | `Job backoff (0\|4\|6\|10) retains`                                                                                                                                             | 4            | 0.601           |
| backoff-default      | `Job defaults preserve`                                                                                                                                                         | 1            | 0.571           |
| claim-obligation     | `Job external claim`                                                                                                                                                            | 1            | 0.590           |
| completion-default   | `Job valid unsupported workqueue`                                                                                                                                               | 1            | 0.573           |
| condition-key        | `Job malformed condition type`                                                                                                                                                  | 1            | 0.579           |
| conditions           | `Job conditions and whole`                                                                                                                                                      | 1            | 0.604           |
| deadline             | `Job malformed deadline`                                                                                                                                                        | 2            | 0.584           |
| exit-codes           | `Job malformed failure exit codes (zero\|duplicate\|unordered)`                                                                                                                 | 3            | 0.596           |
| exit-container       | `Job malformed failure container unknown`                                                                                                                                       | 1            | 0.580           |
| expansion-range      | `Job valid unsupported range above bound`                                                                                                                                       | 1            | 0.574           |
| fail-index           | `Job malformed failure index contradiction`                                                                                                                                     | 1            | 0.585           |
| failure-matchers     | `Job malformed failure (rule neither\|both matchers)`                                                                                                                           | 2            | 0.573           |
| failure-replacement  | `Job (failure policy cannot\|malformed failure replacement contradiction)`                                                                                                      | 2            | 0.580           |
| foreign              | `Job malformed foreign`                                                                                                                                                         | 3            | 0.653           |
| full-retention       | `Job backoff 4 retains`                                                                                                                                                         | 1            | 0.568           |
| history-forgery      | `Job conditions and whole`                                                                                                                                                      | 1            | 0.579           |
| indexed              | `Job malformed indexed (work queue\|parallel cap)`                                                                                                                              | 2            | 0.583           |
| large-indexes        | `Job malformed indexed large`                                                                                                                                                   | 1            | 0.561           |
| managed-by           | `Job malformed managed controller domain`                                                                                                                                       | 1            | 0.585           |
| managed-domain-label | `empty domain label`                                                                                                                                                            | 1            | 0.588           |
| max-indexes          | `Job malformed (max failed without index\|indexed max failures)`                                                                                                                | 2            | 0.564           |
| namespace            | `Job namespace and provider`                                                                                                                                                    | 1            | 0.566           |
| nonindexed-policy    | `Job malformed (per index nonindexed\|success nonindexed)`                                                                                                                      | 2            | 0.573           |
| prepass              | `all-native prepass`                                                                                                                                                            | 1            | 0.612           |
| resource-obligation  | `Job broad resource absence`                                                                                                                                                    | 4            | 0.591           |
| runtime-forgery      | `Job conditions and whole`                                                                                                                                                      | 1            | 0.571           |
| runtime-obligation   | `Job conditions and whole`                                                                                                                                                      | 1            | 0.573           |
| schema               | `Job malformed (mode\|suspend\|manual selector\|replacement\|restart absent value\|failure rule action\|failure exit codes empty\|failure conditions status)`                   | 8            | 0.607           |
| selector-grammar     | `Job selector In.*bad value`                                                                                                                                                    | 1            | 0.576           |
| selector-labels      | `Job malformed selector (invalid key\|invalid value\|mismatched template)`                                                                                                      | 3            | 0.578           |
| selector-match       | `Job selector (In.*wrong\|NotIn\|Exists.*\[\]\|DoesNotExist)`                                                                                                                   | 4            | 0.605           |
| selector-values      | `Job selector Exists.*setup`                                                                                                                                                    | 1            | 0.582           |
| serial-policy        | `Job (valid unsupported (workqueue\|parallel\|indexed\|suspended\|manual selection\|selector\|foreign controller\|replacement Failed\|failure policy)\|namespace and provider)` | 10           | 0.616           |
| slot                 | `Job backoff 4 retains`                                                                                                                                                         | 1            | 0.575           |
| source-frame         | `Job backoff 4 retains`                                                                                                                                                         | 1            | 0.574           |
| source-identity      | `Job runtime`                                                                                                                                                                   | 5            | 0.592           |
| source-pointer       | `Job backoff 4 retains`                                                                                                                                                         | 1            | 0.570           |
| success-count        | `Job malformed success count exceeds indexes`                                                                                                                                   | 1            | 0.583           |
| success-grammar      | `Job malformed success index exponent`                                                                                                                                          | 1            | 0.568           |
| success-range        | `Job malformed success indexes (overlap\|bound)`                                                                                                                                | 2            | 0.596           |
| success-required     | `Job malformed success empty rule`                                                                                                                                              | 1            | 0.574           |
| template             | `Job conditions and whole`                                                                                                                                                      | 1            | 0.573           |
| total                | `Job charges share`                                                                                                                                                             | 1            | 0.571           |
| unbounded-obligation | `Job unbounded bucket`                                                                                                                                                          | 1            | 0.573           |
| whole-attempt        | `Job (conditions and whole\|unbounded bucket)`                                                                                                                                  | 2            | 0.581           |
| writer-obligation    | `Job absent ephemeral`                                                                                                                                                          | 1            | 0.580           |

### One clean retained-source control

The immutable Task32 capture source **and clean generator** remain `0e39b65706c1c6dd98fb031cd7927f6262e1d539`, distinct from adapter `4adb2425057144ca2232437573f2678ca81234a9`. All three original capture hashes/modes were checked before derivation and remain 0400; they were never rewritten or relabeled:

| Original file under `/tmp/puni-task25c3d/` | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `current-frames.json`                      | `22744ba8af46abf8213d8ae19d8b68055a5f6b86ebc9ef641a7205069ae1e73b` |
| `current-frames.json.stages.json`          | `2b112804d1f90f4b8b456bf85611cf2e656095b92d0a26aa78d73277ddb0b7a2` |
| `current-receipt.json`                     | `736a1667f5e7885dbeefef25cf55977be629d574a5401cec486c1f9dfe2c5624` |

The existing validated source API consumed 25 frames, 11 stages and 396 inventory entries. All 29 old entries, five ordinal lifecycles, **ten Deployment lifecycles** and every non-Job blocker compare exactly with Task32's retained ledger; source inventory hash, frame records, unresolved facts, provider metadata, prerequisites and excluded contributors also compare exactly. The frozen older design's 27 entries / nine Deployments are historical, not this baseline.

Eight normalizable Jobs add 74 slots: cert-manager startup 5, admission-create 7, admission-patch 7, each of the five settings/objects/snapshot Jobs 11. Every slot's exact source frame/hash/pointer, identity, concurrency metadata and full memory/CPU/disk charge is asserted. The known increment is **10112 MiB memory / 2200m CPU requests / 1216 MiB disk**. New total: **103 entries / 20480 MiB memory / 3790m CPU requests / 13120 MiB known disk / 120 blockers**. Five independent absent-ephemeral/log/runtime writer obligations remain. `Job:puni-backup:object-store-buckets` remains `candidate-emptydir-unbounded`, with no invented charge and with its whole-attempt history obligation. Every supported owner retains its own runtime binding and generation/history obligation. No source charge establishes runtime concurrency, effective Pod enforcement, cleanup or a finite cross-generation multiplier.

Artifact hashes and final source hashes are in `/tmp/puni-task25c3e/source-identities.json`:

| Evidence file           | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `proofs.json`           | `f742c2f2866346de491c87537ea71db1452acf6a09b8cf1f1514fd5330f7b23a` |
| `source-checks.json`    | `adfcc34f3c8df37679b8199af634ef9ac1724cc6c2fd1cd20dda8dfb6c1acd35` |
| `retained.test.ts`      | `eb1320327688d52de562b561f1c49a0f5e55c7a55be015527b34ce981d98e1bb` |
| `retained-ledger.json`  | `a673fff2c4c2215826404047f4daf5e0ced3e585db88c539a058c7a06ac53e7f` |
| `retained-summary.json` | `7239f687126fd09df2a0d80deb2b359f5788f587715e11f3a2651fe94dc482e6` |
| `retained-command.json` | `45797ce3cb5d82bf9d0ba2e8d87a4d5f998548f670ea3865d6ed79a720c302b7` |

### Remaining acceptance

Independent scoped review approved the Task33 source and task quality with no Critical or Important findings. The proof-table formatting minor was corrected directly from the retained proof JSON; no tests or fault proofs were replayed. This remains source-only evidence. Task 3.1/full admission and runtime acceptance remain open: CronJob/manual recovery, generated/native remainder, writers, system/helpers/transients/host contributors, whole-attempt generations and retained histories, actual provider/features/effective Pods/UIDs/node/enforcement and retained storage. The canonical 4/11 contract is unmodified; the retained control checks 11 source stages, not a new runtime rehearsal. Full Nx gates, h2/h4 gates, full Fleet suite, build, cluster/runtime checks, CI reruns, publication, deployment and Secret actions were deliberately not run in this scoped task. Root owns the unrelated ec8 Infra cache/fixture failure; no CI repair was attempted here.

## Task32 CI fix1 — canonical prepared Helm archive (2026-10-27)

Source/test commit: `fe7892af1391cfa5b49c3d76f4adad72ac4bf585`, based on clean Task33 source `ad14c5c3b9fa2e9517a8c05f083d801459b336b8`. This fixture-only restoration uses the R4 precise-contract exemption. Task33 implementation and its evidence above were not edited or rerun.

### Failure and repair boundary

Published ec8 Infra 40571238525 / Fleet 122425678800 failed: **2079 pass, 7 skip, 31 fail / 2117 tests / 91 files / 401.44s**. The 561360-byte raw `/tmp/puni-pr760-fleet-ec8.log` hashes to `bf068eb6bd89c03fee7b7ede2cc4f31a8324205c41940011ca16da52d0a5ab66`. K3s was skipped and deploy checks were not reached. These failures are distinct from the earlier TDZ and timeout issues. No rerun has established repaired CI.

The fixture installed verified Helm bytes only in private scratch; renderer default authentication read the unpopulated canonical cache. `observability-tools.fixture.ts` now copies the installer-verified private Helm archive into a unique directory created **inside the selected canonical artifact directory**, atomically renames the complete file to the required archive path, and removes only its owned staging directory. Archive publication is required; unreadable seeds and failed output I/O propagate. Shared executable extraction remains untouched; selected executables and extraction remain private. Production authentication, hashes/provenance, explicit archive refusals, wrappers, CLI arguments/defaults and pins are unchanged. Only the required Helm archive is published.

### Exact focused commands and outcomes

All commands below ran in `/home/df/.codex/worktrees/aa39/puni-00`. Fixture command prefix:

```sh
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-tools.test.ts -t
```

- Initial new RED filter `'locked fixture (publishes verified Helm|concurrent preparations|refuses an unwritable)'`: exit1, **0 pass / 3 fail / 4 filtered**, 88 assertions, 21.16s. Failures were missing canonical archive, no canonical replacement, and unwritable required output incorrectly succeeding.
- Initial GREEN filter `'locked fixture (publishes verified Helm|concurrent preparations|refuses an unwritable|refuses unreadable|reuses one)'`: exit0, **6 pass / 0 fail / 1 filtered**, 119 assertions, 19.18s. Includes both kubectl/Helm mode-000 seed refusals, private symlink paths, two real child preparations, complete archive reads throughout publication, distinct private executable directories, and preserved shared extraction sentinel.
- Additional `'malformed Helm publication'` control: exit0, **1 pass / 0 fail / 7 filtered**, 2 assertions, 1.82s. A real version probe completes before its observer replaces the canonical archive with a directory; publication reports EISDIR and leaves no staging files.
- Publication-omission fault filter `'locked fixture (publishes verified Helm|concurrent preparations|refuses an unwritable|refuses malformed Helm publication)'`: exit1, **0 pass / 4 fail / 4 filtered**, 76 assertions, 22.24s. Exact source restored in `finally`; before/restored SHA-256 both `a90ba79c862ad05fc8149d9328d25e607d70747c2e8aebbf37ee51d48bff04d7`. Adjacent `Proof:` names these observed failures.
- Same four controls after restoration: exit0, **4 pass / 0 fail / 4 filtered**, 96 assertions, 23.49s.

Original exact empty-cache RED remains `/tmp/task32-ci-fix1-repro-4tjajr6z/{receipt.json,stdout.log,stderr.log}`: selected no-op negative expected `/Velero patch/`, received archive ENOENT, exit1, **0 pass / 1 fail / 33 filtered**, 22.09s, cache empty before/after.

Corrected default-auth/CLI command used fresh empty `PUNI_TOOL_CACHE=/tmp/puni-task32-ci-fix1-20261027/default-cache-kpddqux4` and owned `TMPDIR=/tmp/puni-task32-ci-fix1-20261027/default-scratch-fhby4b6j`:

```sh
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-velero-render.test.ts tools/tool-fleet/src/observability-source-cli.test.ts -t '^Task25c3d direct renderer no-op output refuses before accepting output$|^full source CLI actual pinned positive returns source policy receipt and no effective readiness$'
```

Exit0: **2 pass / 0 fail / 41 filtered**, 5 assertions, 24.80s. No-op negative reached its patch refusal (721.61ms); unchanged public source CLI positive returned its source-policy receipt (8052.95ms). The selected cache retained only `helm-v4.3.0/helm-v4.3.0-linux-amd64.tar.gz`: **20321063 bytes**, SHA-256 `86584a54def73570558f66f5111cc53dfed56689637ae32c1201205d494f54fb`, mode0664 under owned mode0700 cache, inode14525053. Private scratch was empty after ordinary cleanup. Exact argv/environment/paths/statistics are in `default-controls.json`.

Statics exited0: `bunx eslint tools/tool-fleet/src/observability-tools.fixture.ts tools/tool-fleet/src/observability-tools.test.ts`; `bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false`; `bunx prettier --check tools/tool-fleet/src/observability-tools.fixture.ts tools/tool-fleet/src/observability-tools.test.ts`; `git diff --check`. Initial lint found only import ordering; autofix preceded the final clean lint/types. Standalone static timings were not captured. Normal source commit hooks passed in 2.90s, including secret/private-nesting checks, formatting/lint and the visible inactive external Tool Wiki outcome.

### Evidence and limits

Canonical evidence formatting and `git diff --check` passed. `bunx openspec validate observability-environment-parity --strict --json` exited0: one valid change, zero issues (reported validation 16ms). Fresh `stat` confirmed both the retained cache and its Helm artifact directory are mode0700, with the archive mode0664/20321063 bytes/inode14525053; fresh `sha256sum` matched the locked archive digest above.

Raw focused logs, `publication-omission.json` and `default-controls.json` live in `/tmp/puni-task32-ci-fix1-20261027/`. Final fixture SHA-256: `d884dafca1fb04e0fab5ab92f523f1dec3d9aab93c490717c76b096a91751b91`; test: `3780662fc289471c1c4cc855becb410e9cbbfe685083d201c5aba474efeaf749`.

The unrelated existing changed-kubectl repair test, historical selected-archive/tool mutation matrices, old passing captures, full canonical 11-stage rendering, Job tests, full Fleet/Nx gates, host gates, CI reruns and runtime/cluster/deploy actions were deliberately not run. Existing explicit archive absent/unreadable/changed tests are preserved without edits. This is source-only CI repair evidence awaiting root review/publication; full admission, runtime acceptance and canonical 4/11 status remain unchanged.

Independent scoped review approved the fixture repair for spec compliance and code quality with no findings. Parent identity checks matched both source files, eight protected paths, the unchanged prior canonical prefix at evidence commit `dc0ecbff53c03a8d522f77cc35368198322d7057`, the locked prepared archive, and the retained omission/restoration and fresh-cache controls. No suites or fault proofs were replayed for review. Repaired published CI, full admission and runtime acceptance remain unverified.

## Task25c3f — common container source storage bounds

Source `0c645d265314f3eb38a3f91e36bd8ef4e2106802` implements the accepted Task34/common-container intent on clean `12354e87e86bb41220df33b28ada2e96a0bc1ec1`. Normal hooks passed; Tool Wiki remained inactive and uncertified. This is a source contract, not runtime acceptance or permission to apply it. Task 3.1 and canonical progress 4/11 remain open.

The owning handwritten YAML and existing `observability.ts` builders now emit the exact unmeasured ephemeral request/limit policy in [the common-container design](design.md#bound-the-remaining-straightforward-container-storage-inputs): clients/exporters/proxies 16Mi/64Mi, registry/MinIO 32Mi/256Mi, collector/gateway 64Mi/256Mi; the existing bucket `tmp` emptyDir is 16Mi. Existing CPU/memory values, versions/images/chart archives, replicas, security, commands, endpoints, selectors, trust and PVC identities remain unchanged. No CPU quantity needed quoting. The existing renderer regenerated only signals.yaml, metrics.yaml and settings.yaml; every other generated artifact, including coexistence.json, stays byte-identical.

Current `validatePlatform` requires every registered native owning path/role and complete explicit CPU/memory/ephemeral maps. The pure `assertCandidatePodResources` reuses `assertPodResources` and its shared quantity readers: nonnegative requests, positive limits and requests no greater than limits; no numeric defaults or second calculator. Current KPS exporters use the same guard. Only those two historical image-reader resource properties become optional `StructuralResources`: valid absent/null outer/inner maps remain incomplete, while supplied malformed/negative/contradictory or foreign known state refuses. Existing `createObservabilityProjection → validatePlatform` supplies the canonical owning boundary. Native generated-byte and source/output equality guards remain; the full rendered-source validator additionally binds the exact two named KPS app maps to source values and rejects unregistered app/init/ephemeral roles.

The approved bucket cap necessarily changed the existing full transport fingerprint input. Independent comparison of command/env/mounts/volumes/readiness against BASE proved exactly one transport change, `/spec/template/spec/volumes/0/emptyDir/sizeLimit:16Mi`. Only the Job fingerprint changed from `6136853647dcbf02d197b82ffc28e7ac2bf30b29c2b505a1919edac801e2680b` to `9af531f665fab0e20cfe667d5757b62f7c1dabe2b2308c8b755437f1979cc21d`; the Deployment fingerprint and full transport coverage remain. Plaintext URL and CA mode mutations refuse through `validatePlatform`; bypassing the fingerprint loses both refusals. No real S3/TLS run was repeated.

### Commands and observed outcomes

All commands below ran in `/home/df/.codex/worktrees/aa39/puni-00`, using Bun 1.4.4. Exact argument arrays, restored per-fault SHA256 values and durations are retained in `/tmp/puni-task25c3f/source-checks.json`, `proofs.json`, `canonical.json`; logs and controls remain beside them.

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/platform-common-resources.test.ts tools/tool-fleet/src/observability-common-resources.test.ts tools/tool-fleet/src/observability-common-propagation.test.ts
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-parity.test.ts tools/tool-fleet/src/observability-composition.test.ts tools/tool-fleet/src/observability-workload.test.ts tools/tool-fleet/src/object-store-buckets.test.ts tools/tool-fleet/src/snapshot-check.test.ts
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/platform.test.ts -t 'accepts the locked ordered platform|Task25c3c historical|Task25c3d zero CPU and memory|Task25c3d plugin bad cpu refuses|Task25c3d server above disk limit refuses'
bun test --preload ./tools/test/scratch/preload.ts /tmp/puni-task25c3f/caller.test.ts
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 /tmp/puni-task25c3f/source-control.test.ts
bun test --preload ./tools/test/scratch/preload.ts /tmp/puni-task25c3f/captured-negatives.test.ts
```

| Control                                                                              | Observed outcome                               |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| New current/historical/builder/propagation family                                    | 59 pass,0 fail,136 assertions,8.59s            |
| Focused composition/parity/workload/bucket/snapshot compatibility                    | 208 pass,0 fail,566 assertions,29.04s          |
| Selected platform compatibility                                                      | 6 pass,272 filtered,0 fail,10 assertions,2.00s |
| Actual full source-validator caller, labeled historical wiring fixture; no rendering | 2 pass,0 fail,2 assertions,2.04s               |
| Retained canonical-byte source control                                               | 1 pass,0 fail,1098 assertions,8.99s            |
| Distinct copied-output/candidate-ledger negatives; no rendering                      | 6 pass,0 fail,41 assertions,1.61s              |

Final scoped static commands (all exit0; exact timings below):

```sh
bunx prettier --check infra/platform/backup/elastic/snapshots.yaml infra/platform/backup/local/object-store.yaml infra/platform/observability/base/metrics.yaml infra/platform/observability/base/signals.yaml infra/platform/observability/elastic/settings/settings.yaml infra/platform/observability/kibana/objects/job.yaml infra/platform/observability/prometheus/blackbox-exporter.yaml infra/platform/observability/prometheus/kube-prometheus-stack.yaml infra/platform/registry/base/registry.yaml tools/tool-fleet/src/observability-pod-resources.ts tools/tool-fleet/src/observability-rehearsal-inventory-entry.test.ts tools/tool-fleet/src/observability-source-render.test.ts tools/tool-fleet/src/observability-source-render.ts tools/tool-fleet/src/observability-source-resources.ts tools/tool-fleet/src/observability.ts tools/tool-fleet/src/platform-backup-tls.ts tools/tool-fleet/src/platform-releases.ts tools/tool-fleet/src/platform.ts tools/tool-fleet/src/observability-common-capture.test.ts tools/tool-fleet/src/observability-common-propagation.test.ts tools/tool-fleet/src/observability-common-resources.test.ts tools/tool-fleet/src/platform-common-resources.test.ts tools/tool-fleet/src/platform-common-resources.ts
bunx eslint tools/tool-fleet/src/observability-pod-resources.ts tools/tool-fleet/src/observability-rehearsal-inventory-entry.test.ts tools/tool-fleet/src/observability-source-render.test.ts tools/tool-fleet/src/observability-source-render.ts tools/tool-fleet/src/observability-source-resources.ts tools/tool-fleet/src/observability.ts tools/tool-fleet/src/platform-backup-tls.ts tools/tool-fleet/src/platform-releases.ts tools/tool-fleet/src/platform.ts tools/tool-fleet/src/observability-common-capture.test.ts tools/tool-fleet/src/observability-common-propagation.test.ts tools/tool-fleet/src/observability-common-resources.test.ts tools/tool-fleet/src/platform-common-resources.test.ts tools/tool-fleet/src/platform-common-resources.ts
bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false
bunx tsc --project tools/tool-fleet/tsconfig.lib.json --noEmit --incremental false
bunx openspec validate observability-environment-parity --strict --json
git diff --check
```

format 0.651s; lint 4.758s; types-spec 1.264s; types-lib 1.160s; spec 0.684s; diff 0.011s. Strict OpenSpec: 1 valid, 0 issues, 16ms. Both Fleet no-emit configurations passed. The source commit used normal hooks; no bypass flags.

### REDs, setup failures and R5 proofs

Initial guard tests:5 pass/35 fail/37 assertions in6.62s, with missing current refusals and historical supplied-quantity validation absent. Owning output tests:0 pass/3 fail/5 assertions in0.452s, missing declared ephemeral values. The first implementation run retained38 pass/5 fail, then41 pass/2 fail: a missed multiline signal-builder argument was fixed; budget-changing mutation fixtures refreshed the existing derived coexistence artifact; malformed bucket input already refused at an earlier Secret-closure boundary; remaining positive failures exposed the required bucket transport fingerprint maintenance described above. After that repair45 tests/113 assertions passed.

Exporter propagation initially had one collection setup error because its new export did not exist; this is not a behavioral RED. The implemented narrow production helper then passed9 tests. Current-output expectations were also run against immutable0e39 capture:0 pass/1 fail/4 assertions,32Mi expected versus absent registry ephemeral request. No capture was relabeled.

Initial scoped statics exposed34 lint errors and3 spec-type errors, all corrected without weakening production contracts. The first new init-closure fault stayed green because its missing map already refused at schema; a bounded unregistered-init case then made the isolated role bypass fail. A later ephemeral case initially lacked its fixture assignment; the uninjected fault log is explicitly excluded (`fault-exporter-ephemeral-uninjected.log`). The assignment was fixed,10 baseline propagation tests passed, and the fault was rerun and restored correctly. The final59-test baseline passed afterward. An evidence-edit Python lookup failure made no source changes and is retained in the session; subsequent commands use fail-fast shell handling.

Retained-source comparison had three setup failures before its single passing control: ArkType's identity assertion retains unknown fields, so comparing its whole returned object prematurely compared changed resource maps; the identity projection was corrected to API/kind/namespace/name. The comparison then exposed an omitted DaemonSet masking branch; the reviewed node-exporter branch was added. The default5s test timeout expired at1086 assertions; the unchanged control passed with30s at1098 assertions. All three logs remain (`source-control-identity-red.log`, `source-control-daemonset-red.log`, `source-control-timeout.log`). These corrections touched only temporary evidence scripts, never production, generator inputs or captured bytes; there was no repeated producer/render/capture.

The 23 new-family production dependency faults below each exited1 with failed test assertions, then restored the exact source bytes for that stage. Adjacent `Proof:` comments name the observed fault/test. No historical 47/40/etc fault matrix was replayed. Commands follow `bun test --preload ./tools/test/scratch/preload.ts <owning-test-file> -t <pattern>`; exact full arrays and restoration hashes are in `proofs.json`.

| Fault                     | Changed production file             | Production-path negative pattern                        | Exit / duration |
| ------------------------- | ----------------------------------- | ------------------------------------------------------- | --------------- |
| `native-call`             | `platform.ts`                       | `current native refuses resources absent`               | 1 / 0.721s      |
| `helm-call`               | `platform.ts`                       | `current Helm requires`                                 | 1 / 0.982s      |
| `required-map`            | `observability-pod-resources.ts`    | `current native refuses ephemeral request absent`       | 1 / 0.745s      |
| `shared-quantities`       | `observability-pod-resources.ts`    | `current native refuses request above limit`            | 1 / 0.729s      |
| `positive-limits`         | `observability-pod-resources.ts`    | `current native refuses zero`                           | 1 / 1.268s      |
| `native-required-role`    | `platform-common-resources.ts`      | `duplicated registered`                                 | 1 / 0.780s      |
| `native-role-closure`     | `platform-common-resources.ts`      | `current native refuses role renamed`                   | 1 / 0.762s      |
| `native-init-closure`     | `platform-common-resources.ts`      | `current native refuses bounded unregistered init`      | 1 / 0.737s      |
| `scratch-positive`        | `platform-common-resources.ts`      | `bucket scratch refuses zero`                           | 1 / 0.502s      |
| `scratch-unique`          | `platform-common-resources.ts`      | `bucket scratch refuses duplicate`                      | 1 / 0.504s      |
| `scratch-call`            | `platform-common-resources.ts`      | `bucket scratch refuses absent`                         | 1 / 0.492s      |
| `historical-boundary`     | `platform-releases.ts`              | `historical Helm retains`                               | 1 / 0.368s      |
| `tls-fingerprint`         | `platform-backup-tls.ts`            | `bounded bucket transport refuses`                      | 1 / 0.991s      |
| `exporter-correspondence` | `observability-source-resources.ts` | `different valid quantity`                              | 1 / 0.170s      |
| `exporter-role`           | `observability-source-resources.ts` | `missing role`                                          | 1 / 0.187s      |
| `exporter-init`           | `observability-source-resources.ts` | `extra init`                                            | 1 / 0.187s      |
| `exporter-caller`         | `observability-source-render.ts`    | `public source caller refuses`                          | 1 / 1.660s      |
| `builder-signal`          | `observability.ts`                  | `common builders`                                       | 1 / 0.439s      |
| `builder-metrics`         | `observability.ts`                  | `common builders`                                       | 1 / 0.466s      |
| `builder-settings`        | `observability.ts`                  | `common builders`                                       | 1 / 0.460s      |
| `native-ephemeral`        | `platform-common-resources.ts`      | `current native refuses bounded unregistered ephemeral` | 1 / 0.743s      |
| `scratch-mount`           | `platform-common-resources.ts`      | `bucket scratch refuses mount absent`                   | 1 / 0.506s      |
| `exporter-ephemeral`      | `observability-source-resources.ts` | `extra ephemeral`                                       | 1 / 0.172s      |

The `native-call` and `helm-call` controls remove the actual `validatePlatform` invocations. `exporter-caller` removes the actual full rendered-source invocation; its labeled historical wiring fixture changes only the two exporter resource maps and uses actual retained chart bytes, without a render. The permanent public source-render suite also gained wrong-value/extra-role negatives; that full chart suite was not separately rerun. Scratch negatives additionally call the same pure production checker, so the stronger existing transport fingerprint cannot hide a broken new bound guard.

Six separate retained-byte controls caught missing registry request, missing bucket cap, a valid wrong 128Mi KPS limit, erased global writer prerequisite, erased Job generation-history requirements and forged creation authority. These exercise assertions over actual captured bytes/derived output; they are separate from the23 production-source faults and did not modify immutable raw files.

### One actual canonical capture and retained comparison

At clean committed source/generator `0c645d265314f3eb38a3f91e36bd8ef4e2106802`, exactly one canonical producer/capture ran:

```sh
PUNI_REHEARSAL_FRAMES_EXPORT=/tmp/puni-task25c3f/current-frames.json PUNI_REHEARSAL_INVENTORY_EXPORT=/tmp/puni-task25c3f/current-receipt.json bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-rehearsal-inventory-entry.test.ts
```

Exit0,1 pass,225 assertions; Bun 13.17s, outer duration 13.239s. Raw expansion/stage/receipt bytes were retained before assertions and then made 0400. The actual two-instance graph covers all 18 changed native/exporter workloads, including shared node/kube-state exporters and local bucket/MinIO branches; no additional changed production branch required a separate render. Eleven stages,25 frames,396 inventory entries remain. Helm version v4.3.0/archive `86584a54def73570558f66f5111cc53dfed56689637ae32c1201205d494f54fb` and executable `57ce7fc4ea77b28ee6fa91ae071abcade74d3f524e80c9decff5877a5ac8eda4` were authenticated by existing production boundaries; kubectl v1.36.4 digest `8b8f088da2dab964f853b38464033b1be15ede2839eca751482357c45abdd05a` and original chart archives were verified. No executable/cache bypass was introduced.

| Raw file under `/tmp/puni-task25c3f` | SHA256                                                             | Bytes   | Mode |
| ------------------------------------ | ------------------------------------------------------------------ | ------- | ---- |
| `current-frames.json`                | `83222e74ee24dc8740e0d71820e5aa8142cccff3b28b978ae6a3e9bdfb450e10` | 7563717 | 0400 |
| `current-frames.json.stages.json`    | `0fd7f3a109ff622f2b17c80578ecbd5ba660f99a254efa01e7ac8ae7253e471c` | 729533  | 0400 |
| `current-receipt.json`               | `099bd03e5093feecaac9eed0deda607cfbea44dba841f9669f9ad8c0fd5292cc` | 1121215 | 0400 |

`generator-equivalence.json` verifies all 118 captured generator-input hashes against both source commit 0c645d2 and current bytes. Source/generator identities remain 0c645d2 after the evidence-only commit; they are not relabeled with that later HEAD. The native adapter remains byte-identical to approved 4adb (`observability-native-ordinal.ts` SHA256 `729300df11a560eacf52278e3187643f72d1b239587aa743cf98773d01bd83a1`).

Independent owning-source comparison verified exactly 27 additions over 9 YAML files: 26 ephemeral coordinates plus the bucket cap. The canonical raw comparison verified exactly 49 intended additions over 21 rendered/native/release definitions, including disabled shared Helm values; every addition was asserted for the exact new value before deleting only that reviewed field for full semantic comparison. All unrelated manifests/config/scripts/images/trust/selectors/claims are equal. Bootstrap bytes/identities remain equal. Five frame hashes and 14 existing native template hashes change, with 2 newly normalizable template identities; each charge/lifecycle binds its actual new frame/template hash, not the old cost-compatible identity. `frame-identities.json` and `template-identities.json` retain the exact before/after pairs.

Historical `/tmp/puni-task25c3d/current-{frames,receipt}.json` plus stages remain 0400 with the original three hashes recorded in Task25c3e's parent hash receipt. Their source/generator stays 0e39. The current reader reproduces their inventory facts, and the unchanged native adapter reproduces the approved 4adb retained ledger exactly: 103 entries/120 blockers/20480Mi memory/3790m CPU/13120Mi known disk. The older 29-entry slice is not used as the current baseline.

### Actual current native contributions and remaining obligations

The existing production normalizer/ledger now yields 116 conditional charges,107 blockers, 5 ordinal/11 Deployment/9 serial Job lifecycle declarations:

| Conditional source contribution                               | Memory MiB | CPU request milli | Known disk MiB |
| ------------------------------------------------------------- | ---------- | ----------------- | -------------- |
| Approved4adb adapter over historical 0e39 source, 103 charges | 20480      | 3790              | 13120          |
| Existing 103 charges: declared ephemeral increments only      | 0          | 0                 | 5568           |
| MinIO initial and first replacement, 2 charges                | 1024       | 100               | 512            |
| Bucket B10 serial lifecycle, 11 full retained slots           | 1408       | 110               | 704            |
| Current 116-charge source ledger                              | 22912      | 4000              | 19904          |

All existing CPU/memory charges and claim identities/amounts remain; only the reviewed disk increments and actual new frame/template coordinates change. New-owner demand is fully charged without cleanup credit. The existing ledger was reused unchanged; derived `/tmp/puni-task25c3f/current-ledger.json` SHA256 `e68e409590df40537a1400744a8e9d5216af1d122d0ec585dba88fdb8798de13` is evidence, not immutable admission authority.

Exactly 14 compound `ephemeral-storage-limit-absent:<role>; writable-logs-and-runtime-state-unobserved` facts disappear because their source limits are now explicit. This is source-limit knowledge only: it establishes no log rotation, runtime writer growth, eviction, recovery or physical enforcement. The MinIO `candidate-ephemeral-unbounded` and bucket `candidate-emptydir-unbounded` facts also disappear. Three explicit facts become available: MinIO's namespace-specific claim-owner/retention and Deployment runtime-wave binding, plus bucket serial runtime binding. Every other blocker is preserved exactly. Global `writable-logs-and-runtime-state`, actual version/controller/UID/template/node/termination/enforcement prerequisites, all old lifecycle conditions, full failed/terminating retention and Job Helm/Flux generations/history requirements remain unchanged. Both authorities stay false, state stays incomplete; all system/runtime, helper, images/transients, hostPath growth and retained-host exclusions remain.

The receiver append log, Flux artifact/tmp and Velero/Kopia node-agent scratch still require separate reviewed input/retention/customization contracts. No arbitrary cap was added. Declared finite budgets require actual startup/load/HTTP-response/log/eviction/recovery/headroom acceptance before live application; they are neither measured consumption nor h3 host sizing or physical storage quotas.

Full Fleet/Nx/build/host gates, unchanged historical proof batches, unrelated app/browser suites and runtime/cluster/Docker/S3/TLS/live checks were not run, per bounded scope. Required runtime/whole-attempt/live work remains open. No push, merge, deploy, CI action/rerun, cluster/store/Secret/host mutation or new production runner occurred. The existing tool fixture prepared authenticated private executables and published its verified archive through its existing owned path. Source-only success does not complete task 3.1, runtime admission or the overall goal.

Independent task review approved Task25c3f spec compliance and code quality with no findings. Parent checks matched all 23 source paths, all 118 captured generator inputs, six protected source/lock paths, three new immutable captures and the three historical captures, plus 23 observed failed-assertion fault receipts. No suite, capture, proof or chart render was repeated for review. Canonical task 3.1, full admission and runtime/live acceptance remain open.

## Read-only image metadata facts — 2026-10-27

Pinned image metadata is a separate source-evidence slice, not an admission or sizing result. The immutable0e39 source inventory has 36 native occurrences / 26 exact references; actual CR image fields and operator executable arguments extend this to 30 source-declared registry/repository/digest identities. Two k3d helper tags and bundled/system/generated effective runtime closure remain unresolved. The common-storage source changes preserve the image/version declarations.

Digest-verified metadata now covers all 30 declared identities: 29 public registry manifest/config sets plus the retained object-store archive/config. Declared compressed layers total **2,891,649,484 bytes**, counting each exact repository/digest once and retaining repeated layers across images. This is neither measured transfer payload, expanded bytes, physical storage/copy/cache demand nor a reservation. RootFS diff IDs and declared Volumes are image metadata; actual mounts, runtime architecture and sharing are unobserved.

Four explicit bounded HTTP cohorts used **128 + 4 + 36 + 16 = 184 requests**, with **203,123 + 4,277 + 65,456 + 47,499 = 320,355 decoded bytes**. Each body stayed below1MiB; initial aggregate limit8MiB and follow-up aggregate limits2MiB were preserved. Every accepted manifest/config body matched its pin or verified parent descriptor and size. Follow-ups reused prior manifests and preserved prior cohorts. Only the exact observed publisher-delegated public R2 transport was allowed for the final four Elastic configs, with no cross-origin Authorization and no persisted signed query tokens; this establishes delegation/content integrity, not bucket ownership. No layer payload was downloaded.

Retained primary evidence: `/tmp/puni-image-facts-20261027t2307/`, `/tmp/puni-image-facts-elastic-agent-20261027t2115/`, `/tmp/puni-image-configs-20261027t2122/`, `/tmp/puni-image-configs-elastic-final-20261027t2129/`. Their content-addressed JSON bodies were independently rehashed/read offline after collection. The final `verification-and-summary.json` records complete source-declared compressed/config coverage and remaining gaps. The separately authorized MinIO config-only read returned1354bytes from exact member `blobs/sha256/814c467f9909d74a438727489ca76f1a15f6b431d6f5b1b4a41b9b4f5ba93eed`; config digest and before/after archive SHA256 `ec86717cd36acd1415443b9fa4e52db14c8c15bf607e5160149858aee89ade1c` matched. Prior layer analysis was reused, without layer decoding, extraction/import or C1 proof replay.

The local default Docker socket read was denied before a daemon identity was obtained. No socket elevation or image inspect/pull/build/run/prune followed; cache and physical allocation remain unknown. Historical projected image sizes lacking raw daemon/context binding were not promoted. Still required are a production evidence consumer/validation boundary for these retained facts, exact helper pins, effective image closure, expanded/physical/copy/device/cache costs, independently admitted process allowances, complete lifecycle/writer/host admission and actual stack/runtime/live acceptance. No source test, CI action, Secret, volume or runtime mutation was performed by this read-only collection.

## Task35 / Task25c3g — conditional native DaemonSet accounting

Implementation BASE `391b6c5350121eaf94efea8f895cdc3751d83740` contains the approved four-artifact intent. Source commit **`82192fe914cf6327fe32348fc9b8d7bba2f274dc`** adds the focused DaemonSet adapter and tests, shared full-cohort mapping, native-only evidence overload and retained bootstrap companion. Normal source commit hooks passed in 4.59s. Implementation/source-only verification is complete; independent task review is pending. Task 3.1, complete capacity/admission and runtime/live acceptance remain open.

### Behavior and evidence boundaries

The original four/five-argument native reader remains valid. Its optional sixth topology evidence argument requires the existing captured inventory's richer third-argument source contract (bootstrapSources plus selected source/artifact provenance). Supplied bytes, original/retained coordinates, independent hash and source/packet identities bind before count derivation. Missing optional evidence is named incomplete; malformed/mismatched supplied trusted state throws. The existing bootstrap coordinate mapping, including relocated policy, and topology YAML/schema/options decoder are shared without widening legacy schemas. Validated new topology metadata is detached from caller mutation. Raw bytes remain internal to preparation; the public inventory gains no raw view.

The known-policy prepass validates supplied daemon fields before incomplete/provider/resource decisions. Pinned RollingUpdate/zero-surge sources support N initial plus N first replacements for all source-declared servers+agents. The materialization limit is 1..128 candidate nodes (at most 256 full slots); other valid counts remain computationally unsupported, never default N=1. Selectors, taints, affinity, scheduling failure and pending work provide no count reduction. Daemon slots are synthetic coordinates, not Node UIDs. OnDelete (including rolling fields) and valid surge cases remain unsupported; malformed percentage/count/selector/toleration/affinity/restart/deadline/foreign fields throw. Defaulting metadata is not reclamation or runtime evidence.

A focused regression identified that the older shared resource schema requires affinity-expression values even for valid Exists/DoesNotExist. The daemon decoder validates the original known placement first, then removes only affinity from its resource-only normalization input. `normalizeWorkload` does not read placement in its arithmetic; exact original template hash, placement and source remain on daemon lifecycles. Both absent-values operators have public-entry positives; malformed operator injection independently fails. No shared/selected/cutover schema was loosened and no eligibility credit was introduced.

Every owner retains `daemon-replacement-wave-runtime-binding` and whole-attempt generation/retained-history prerequisites, including owners with missing topology or unsupported resources. Independent hostPath/device/growth, scratch, claim, missing ephemeral and writable-root facts are collected before the first normalization failure. A fresh unchanged controller UID/generation/template and reachable Node UID set, complete successful/uncertain creation history, reconciled expectations, no prior/adopted/orphan/uncharged retained work and no replacement-of-replacement remain unobserved conditions. Failed/terminating/unschedulable work retains full charges. Rollout, node addition/replacement, placement mutation, repeated failure/eviction, force/lost-node/controller recreation/foreign mutation remain excluded; source conditions cannot enforce themselves. State remains incomplete and creation/runtime authority remain false.

Targeted primary rereads only confirmed [pinned DaemonSet defaulting](https://raw.githubusercontent.com/kubernetes/kubernetes/v1.36.4/pkg/apis/apps/v1/defaults.go) and [controller-added tolerations](https://raw.githubusercontent.com/kubernetes/kubernetes/v1.36.4/pkg/controller/daemon/util/daemonset_util.go). The source tolerations/defaults and controller-derived additions remain separate metadata; actual admission and eligibility are unobserved.

### Focused verification

All logs and private control programs are retained under `/tmp/puni-task25c3g/`. No old 104/147/59/23/47 proof suite, canonical/chart/public-entry render or host gate was replayed.

| Command                                                                                                                                                                                                                                                                                                                                                                                                                       | Observed result                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-native-daemon.test.ts`                                                                                                                                                                                                                                                                                                                 | Final restored implementation:86 pass, 0 fail, 165 assertions; Bun 929ms.                                                                                                                                                                                                                                                      |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-native-deployment.test.ts -t 'Deployment first wave keeps\|Deployment both cohorts reuse'`                                                                                                                                                                                                                                             | Shared-cohort compatibility only:5 pass, 51 filtered, 0 fail, 53 assertions; Bun 590ms.                                                                                                                                                                                                                                        |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-rehearsal-sources.test.ts -t 'native topology companion\|omitted source coordinate infra/local\|bootstrap topology refuses\|bootstrap rejects wrong-coordinate\|bootstrap original policy collector'`                                                                                                                                  | Real bootstrap companion plus affected extraction checks:5 pass, 18 filtered, 0 fail; Bun 603ms.                                                                                                                                                                                                                               |
| `bun test /tmp/puni-task25c3g/forwarding.test.ts`                                                                                                                                                                                                                                                                                                                                                                             | Approved component forwarding proof:1 pass, 7 assertions; final Bun 3.07s. A test-only spy supplies the actual retained/validated0c prepared contract, then the real async wrapper/native boundary runs; the spy restores in finally. This proves forwarding and changed-byte refusal, not producer/render/runtime acceptance. |
| `bunx eslint tools/tool-fleet/src/observability-native-daemon.ts tools/tool-fleet/src/observability-native-daemon.test.ts tools/tool-fleet/src/observability-native-cohorts.ts tools/tool-fleet/src/observability-native-ordinal.ts tools/tool-fleet/src/observability-rehearsal-sources.ts tools/tool-fleet/src/observability-rehearsal-sources.test.ts tools/tool-fleet/src/observability-rehearsal-inventory.ts`           | Exit 0, 5.395s.                                                                                                                                                                                                                                                                                                                |
| `bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false`                                                                                                                                                                                                                                                                                                                                         | Exit 0, 1.489s; scoped Fleet no-emit types.                                                                                                                                                                                                                                                                                    |
| `bunx prettier --check tools/tool-fleet/src/observability-native-daemon.ts tools/tool-fleet/src/observability-native-daemon.test.ts tools/tool-fleet/src/observability-native-cohorts.ts tools/tool-fleet/src/observability-native-ordinal.ts tools/tool-fleet/src/observability-rehearsal-sources.ts tools/tool-fleet/src/observability-rehearsal-sources.test.ts tools/tool-fleet/src/observability-rehearsal-inventory.ts` | Exit 0, 0.619s.                                                                                                                                                                                                                                                                                                                |
| `git diff --check`                                                                                                                                                                                                                                                                                                                                                                                                            | Exit0 before source commit.                                                                                                                                                                                                                                                                                                    |
| `bun test --timeout=15000 /tmp/puni-task25c3g/retained.test.ts`                                                                                                                                                                                                                                                                                                                                                               | Exactly one comprehensive clean committed-adapter retained-input control:1 pass, 0 fail, 46 assertions; Bun 4.04s / process 3.985s.                                                                                                                                                                                            |

Original RED/setup evidence is retained rather than relabeled. The first slice produced 2 pass / 54 fail, then 56 pass. The second produced 62 pass / 6 fail: five missing policy/default features plus one wrong test expectation that added memory-emptyDir to the peak. The existing normalizer uses the maximum, so the test changed to a larger 256Mi memory volume and expected 266Mi including overhead; production arithmetic stayed unchanged. Subsequent targeted REDs demonstrated valid int64 affinity values, absent-values Exists, invalid retained relocation and missing reachable-controller conditions before their fixes. The new coordinate helper preserved its original `source coordinates` diagnostic, so two new tests were corrected to accept that existing diagnostic. Final suite growth reached 86 pass.

The initial source typecheck found the intentional invalid-overload test without its expected-error annotation. Later scoped no-emit found a new test's optional bytes and readonly mutation errors; both were corrected. Initial scoped lint found 15 callback/template/import/optional-parameter issues; all were corrected. The first producer-field omission showed the intended TS2339 alongside those test errors, so it is not the clean type proof. After clean no-emit, repeating only that omission produced exactly one TS2339 at the real native caller, then restoring the field returned to clean types. This establishes the required typed producer handoff, not execution of the expensive producer.

### Watched changed-safety proofs

There are 61 observed failed runtime-test mutations and one clean producer no-emit mutation. Each mutation was restored in finally; adjacent production `Proof:` comments identify the observed fault/test. The first affinity-schema mutation survived because the older resource schema rejected missing values later; `proof-run.log` and the false observation in proofs.json retain this non-proof. After the positive resource-projection regression, the isolated daemon-schema mutation failed as intended. Two mutation-locator setup failures after formatting (source-pointer and combined-total) occurred before running/writing their intended fault; later exact locators produced the failures listed below.

Exact commands, exit codes, failed-test counts, timings and restored pre-mutation source hashes are in `proofs.json`; individual `fault-*.log` files retain output. The default command prefix below is `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-native-daemon.test.ts -t`; entries show its exact filter. Non-default entries show the whole command. Every listed runtime command exited 1 with failed assertions. The range mutation tested only N0/N129, never hostile MaxInt32 while the guard was removed.

| Fault                            | Exact filter or command                                                                                                                                      | Failed tests | Seconds |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -----------: | ------: |
| topology-source                  | `topology (source hash\|original path\|retained path) drift`                                                                                                 |            2 |   0.625 |
| topology-revision                | `topology selected revision drift`                                                                                                                           |            1 |   0.618 |
| topology-packet                  | `topology packet identity drift`                                                                                                                             |            1 |   0.609 |
| topology-hash                    | `topology bytes drift`                                                                                                                                       |            1 |   0.605 |
| topology-closure                 | `topology duplicate contract source drift`                                                                                                                   |            1 |   0.624 |
| topology-safe                    | `coherently hashed topology unsafe`                                                                                                                          |            2 |   0.622 |
| topology-count                   | `full two-node cohorts`                                                                                                                                      |            1 |   0.611 |
| topology-snapshot                | `full two-node cohorts`                                                                                                                                      |            1 |   0.599 |
| policy-maps                      | `malformed (strategy array\|rolling array\|selector array\|toleration array)`                                                                                |            2 |   0.616 |
| policy-strategy-schema           | `malformed strategy enum`                                                                                                                                    |            1 |   0.603 |
| policy-restart-schema            | `malformed restart`                                                                                                                                          |            1 |   0.604 |
| policy-deadline-schema           | `malformed deadline`                                                                                                                                         |            1 |   0.606 |
| policy-toleration-schema         | `malformed toleration enum`                                                                                                                                  |            1 |   0.606 |
| policy-affinity-schema           | `malformed affinity operator`                                                                                                                                |            1 |   0.591 |
| policy-weight                    | `malformed affinity weight`                                                                                                                                  |            1 |    0.63 |
| policy-foreign                   | `malformed foreign\|foreign lifecycle`                                                                                                                       |            7 |   0.671 |
| policy-selector-empty            | `malformed selector empty`                                                                                                                                   |            1 |   0.609 |
| policy-selector-match            | `malformed selector mismatch`                                                                                                                                |            1 |   0.611 |
| policy-key                       | `malformed selector key grammar\|malformed pod affinity key`                                                                                                 |            1 |   0.631 |
| policy-label                     | `malformed template label grammar\|malformed nodeSelector label grammar`                                                                                     |            2 |   0.625 |
| policy-expression                | `malformed selector expression values\|malformed affinity cardinality\|malformed affinity field relation\|malformed pod affinity selector`                   |            4 |   0.653 |
| policy-toleration-relations      | `malformed toleration (empty key\|exists value\|seconds effect)`                                                                                             |            3 |   0.627 |
| policy-quantity                  | `malformed (surge negative\|surge fractional\|surge maxint\|surge percentage\|unavailable percentage\|quantity grammar)`                                     |            1 |   0.656 |
| policy-rolling-zero              | `malformed both`                                                                                                                                             |            2 |   0.627 |
| policy-prepass                   | `late malformed placement`                                                                                                                                   |            1 |   0.608 |
| policy-support                   | `valid unsupported`                                                                                                                                          |            3 |   0.622 |
| topology-range                   | `valid 129 population\|zero declared population`                                                                                                             |            2 |   0.602 |
| runtime-binding                  | `legacy calls retain\|independent claim host`                                                                                                                |            2 |   0.624 |
| whole-attempt                    | `legacy calls retain\|independent claim host`                                                                                                                |            2 |   0.623 |
| independent-obligations          | `independent claim host`                                                                                                                                     |            1 |   0.611 |
| missing-topology                 | `legacy calls retain`                                                                                                                                        |            1 |   0.657 |
| missing-bounds                   | `absent resource`                                                                                                                                            |            3 |   0.607 |
| cohort-count                     | `full two-node cohorts`                                                                                                                                      |            1 |   0.606 |
| cohort-slot                      | `full two-node cohorts`                                                                                                                                      |            1 |   0.612 |
| cohort-zero                      | `full two-node cohorts`                                                                                                                                      |            1 |     0.6 |
| candidate-slot                   | `full two-node cohorts`                                                                                                                                      |            1 |   0.615 |
| template-identity                | `full two-node cohorts`                                                                                                                                      |            1 |   0.615 |
| source-pointer                   | `full two-node cohorts`                                                                                                                                      |            1 |   0.605 |
| source-frame                     | `full two-node cohorts`                                                                                                                                      |            1 |   0.601 |
| daemon-source-identity           | `source UID namespace and provider`                                                                                                                          |            1 |   0.615 |
| daemon-provider                  | `source UID namespace and provider`                                                                                                                          |            1 |   0.629 |
| policy-selector-expressions      | `selector expression .* must match`                                                                                                                          |            4 |   0.639 |
| combined-total                   | `full two-node cohorts\|shared normalizer retains`                                                                                                           |            2 |   0.605 |
| default-policy                   | `full two-node cohorts`                                                                                                                                      |            1 |   0.616 |
| controller-tolerations           | `full two-node cohorts`                                                                                                                                      |            1 |   0.603 |
| runtime-authority                | `full two-node cohorts`                                                                                                                                      |            1 |   0.601 |
| runtime-conditions               | `full two-node cohorts`                                                                                                                                      |            1 |   0.606 |
| generation-forgery               | `full two-node cohorts`                                                                                                                                      |            1 |   0.608 |
| bootstrap-retention              | `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-rehearsal-sources.test.ts -t 'native topology companion'`             |            1 |   0.235 |
| wrapper-forwarding               | `bun test /tmp/puni-task25c3g/forwarding.test.ts`                                                                                                            |            1 |   2.576 |
| affinity-resource-projection     | `Exists affinity without`                                                                                                                                    |            1 |   0.596 |
| topology-independent-hash        | `self-consistent changed topology`                                                                                                                           |            1 |    0.62 |
| topology-coordinate-map          | `invent a retained topology`                                                                                                                                 |            1 |   0.619 |
| topology-decoder                 | `coherently hashed (topology schema\|topology forbidden\|duplicate YAML)`                                                                                    |            3 |   0.624 |
| topology-selection-shape         | `malformed coherent`                                                                                                                                         |            2 |   0.612 |
| bootstrap-snapshot               | `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-rehearsal-sources.test.ts -t 'native topology companion'`             |            1 |   0.238 |
| daemon-normalizer-blocker        | `independent claim host`                                                                                                                                     |            1 |    0.61 |
| daemon-claim-namespace           | `namespace-scoped existing claims`                                                                                                                           |            1 |    0.61 |
| daemon-init-writer               | `absent init ephemeral`                                                                                                                                      |            1 |    0.61 |
| daemon-controller-condition      | `full two-node cohorts`                                                                                                                                      |            1 |   0.599 |
| producer-contract-clean-baseline | `bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false`                                                                        |            0 |   1.263 |
| bootstrap-topology-closure       | `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-rehearsal-sources.test.ts -t 'omitted source coordinate infra/local'` |            1 |   0.246 |

The clean producer-contract row has zero failed tests because its failure is exactly TS2339, not a runtime assertion. The forwarding fault omitted only the evidence handoff from the real async native wrapper; the positive component test failed. Real `readRehearsalBootstrap` bytes/coordinate retention and caller-mutation controls run independently of that spy. Production preparation itself was not rerun.

### One immutable0c retained-input control

The raw source and generator remain **`0c645d265314f3eb38a3f91e36bd8ef4e2106802`**, distinct from new adapter82192fe. Packet identity remains `e722738700c647b281cab2fe36f92dfdd10f4baa1195de34a192098cc8701a01`. The control checked clean committed HEAD before derivation, retained the derived ledger before assertions, and checked clean status again afterward. It read the original selected Git topology bytes, compared both retained-source and captured packet-file hashes, and passed the independently captured inventory as the native contract. No source/generator relabel, rerender or snapshot mutation occurred.

All three original capture hashes and 0400 modes were checked before and after:

| Immutable capture under `/tmp/puni-task25c3f/` | SHA256                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| current-frames.json                            | `83222e74ee24dc8740e0d71820e5aa8142cccff3b28b978ae6a3e9bdfb450e10` |
| current-frames.json.stages.json                | `0fd7f3a109ff622f2b17c80578ecbd5ba660f99a254efa01e7ac8ae7253e471c` |
| current-receipt.json                           | `099bd03e5093feecaac9eed0deda607cfbea44dba841f9669f9ad8c0fd5292cc` |

Topology remains servers 1 / agents 0 and source hash `6c7266174ffee979d5732a91983f29e19b7a1b6d4e86989929080116d5b263f8`. Baseline ledger hash `e68e409590df40537a1400744a8e9d5216af1d122d0ec585dba88fdb8798de13` was independently checked.

Actual new output is **118 charges / 125 blockers / 23,936Mi memory / 4,200m CPU / 20,416Mi known disk**. Only Traefik normalizes: initial0 and replacement0 each retain 512Mi/100m/256Mi. Its source remains `release/traefik/traefik`, frame `e7601322cc2f7386073874d7d0a79f328d5f6a838a983fed6667e4f3474534ed`, pointer `/54/spec/template/spec`, with exact full-template hash and source inventory entry. The control established these outcomes; manual arithmetic was not used as evidence.

All 116 previous charges remain byte-for-byte structurally equal, as do every non-daemon blocker and every old non-accounting field/lifecycle record. Five ordinal, eleven Deployment and nine Job lifecycles are unchanged. Four obsolete `DaemonSet-lifecycle-unaccounted` facts are replaced by 22 explicit daemon facts: runtime/history for each owner, plus node-exporter's three hostPath and normalization obligations; otel agent's two hostPaths, missing ephemeral and normalization obligations; Velero node-agent's two hostPaths, scratch, missing ephemeral, writable root and missing-bound/resource-policy obligations. Current node-exporter ephemeral request 16Mi / limit 64Mi remains present; no historical absent-cap assertion was reused. Other three daemon owners receive no invented full charge or zero-cost claim.

Generated operator work, CronJobs, writers, system/helper/host/image/transient costs and all existing exclusions remain open. Full physical enforcement, actual provider/features/admission-added resource equality, whole-attempt UID/generation/node/history binding, host/coexistence admission, Flux behavior, stored signals/views, recovery/history and live acceptance are unverified. Full Fleet/Nx/build/host gates, historical proof batches and unrelated browser/app suites were deliberately not run for this source slice. No push, merge, deploy, CI action/rerun, Docker/cluster/Secret/store or host mutation occurred.

Retained derived evidence:

| File under `/tmp/puni-task25c3g/` | SHA256                                                             |
| --------------------------------- | ------------------------------------------------------------------ |
| retained-ledger.json              | `07c39947b950e07d9503cbd22f72f0fc00a8e7c97d580d9597becc41c9de4485` |
| retained-summary.json             | `5caf62c01d483d9be23788c709333c33f2477e10d3595bfdbcbd23c8c02c012e` |
| proofs.json                       | `96d5e8c971c6db28e8b860b4ad65357c6498e48d6d2e15989e05b22c47fc3470` |
| retained-control.log              | `71a17678745b0e402479cd7b678b2398b1434cb9dc7d54e505e30a33b047ed24` |

Documentation checks: `bunx openspec validate observability-environment-parity --strict --json` returned one valid change, zero issues, exit 0 (validator16ms). The evidence commit uses normal hooks; independent review remains pending.

## Published CI checkpoints d072 and 055d — 2026-10-27

The published `d072c2f6a30f3be218bf2e149cb416497dba36e4` checkpoint completed its own checks successfully: [main run 40578377675](https://github.com/Prosperous-Unification/puni-00/actions/runs/40578377675) and [infrastructure run 40578377810](https://github.com/Prosperous-Unification/puni-00/actions/runs/40578377810). Workspace job122451754784 ran20:30:25–21:31:47UTC (61m22s); Twilight job122451754634 ran20:30:25–21:35:10UTC (64m45s). Stable gate122484497801 and pixels122462214294 succeeded. Fleet122450839134 reported2654 pass,7 existing opt-in skips,0 fail across2661 tests/92 files in628.03s; deploy reported828 pass,0 fail across32 files in54.31s. Generic K3s job122457799165 succeeded20:42:04–20:57:29UTC. These timings are CI job/test durations, not observability runtime capacity or full authenticated rehearsal acceptance. The retained Fleet log is749504 bytes, SHA256 `9a5fdaa102e18abc95425b9eee8d853b55d598e676513a0dc22f81e61dd747e8`; it was not downloaded again.

The subsequently published reviewed storage checkpoint `055d4008fa12129ed2bd8fee05ea52bdef15853c` has its own [main run40591788802](https://github.com/Prosperous-Unification/puni-00/actions/runs/40591788802) and [infrastructure run40591788726](https://github.com/Prosperous-Unification/puni-00/actions/runs/40591788726), created22:03:26UTC. The main workspace/Twilight jobs remain in progress at this observation; all four browser shards and stable pixels122505171272 succeeded. Fleet122497610209 failed with2713 pass,7 existing skips,2 fail,7002 assertions across2722 tests/96 files in656.83s. Deploy and generic K3s were skipped after that failure. Earlier green does not validate this checkpoint or the later unpushed DaemonSet implementation.

Retained failed log: `/tmp/puni-pr760-fleet-055d.log`,905038 bytes, SHA256 `e17e59b0a51f9591c914981e81975cee0dbb1e21a7734435451d9bd32c578f80`. The two failures are `platform.test.ts` — unlocked backup init container now refused first by the common-role guard instead of the expected image guard — and `observability-preflight.test.ts` — common blackbox positive fixture returns exit1. A fresh targeted reproduction at current adapter HEAD `004485f63ffd0335cbacc3fd9b32aa1af6678a73` ran:

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/platform.test.ts tools/tool-fleet/src/observability-preflight.test.ts -t 'rejects an unlocked init container in a backup job|actual common blackbox Deployment selector and owned scheduled ReplicaSet pod admit prerequisites'
```

Observed0 pass,481 filtered,2 fail,3 assertions,1.405s; process exit1. No timeout, whole-suite rerun, CI retry, guard weakening or source repair was performed. The first failure proves a changed refusal ordering; the second still requires diagnosis of the fixture/source/effective-resource mismatch before a fix. The fixed DaemonSet review package remains391b6c5..004485f; these observations are outside its frozen review range.

The user's h3mon question does not authorize an upgrade. The earlier sizing clarification remains applicable:16GiB available/120GiB claims are full disposable rehearsal inputs, including50GiB registry and20GiB local object storage. Existing h3mon dev-only and co-location subtotals remain incomplete; no final hardware recommendation or successful host admission follows from them. No infrastructure or workload change was made for this clarification.

## Task35 independent review acceptance — 2026-10-27

An independent scoped review of the official nine-file package391b6c5..004485f63 approved both spec compliance and code quality with no findings. The reviewer checked topology provenance, policy-validation ordering, full initial/replacement charges, retained independent obligations, compatibility, false authority and the stated tests/evidence; no suites, renders or fault batches were replayed. Root separately reconciled the completed source/capture/proof verification and existing package rather than regenerating either. The61 watched fault observations are Bun assertion tests against production accounting code, not live Kubernetes runtime observations. The clean TS2339 producer-field fault proves the typed handoff only; the initially masked affinity fault remains excluded.

The private Task35 source slice is complete. Canonical task3.1 and the overall setup remain open: CronJob lifecycle, generated workloads, image/helper/system/transient/physical costs, host admission, authenticated Flux/runtime/signals/history/recovery/live acceptance still require evidence. Source and adapter approval do not supply creation or runtime authority. No publication, deployment or hardware change followed this review.

## Task36 changed-contract CI fixture restoration — 2026-10-27

This bounded test-only restoration starts at `c0faae7400b22588a55018b27ec0aca3561d24c4`. The root classified it as restoring the existing precise contracts under R4; no new behavior or production safety check was introduced. Task35 source and its accepted review package are untouched. The retained 055d CI log and the previously recorded two-case RED above were reused without redownload or CI rerun: 0 pass, 481 filtered, 2 fail, 3 assertions, 1.405s at `004485f63ffd0335cbacc3fd9b32aa1af6678a73`.

### Diagnosis and correction

`validatePlatform` calls `assertCommonNativeResources` before `assertLockedWorkloadImages`. The existing backup fixture adds `fetch` as an init container to the registered `object-store-buckets` Job; that role intentionally permits one named app container and no init/ephemeral containers. The test now requires the specific `common candidate native role or scratch differs` refusal through the real platform validator. Its original init-image purpose remains covered by calling the real exported image checker with the same decoded mutated manifests and toolchain, requiring `backup/local/object-store.yaml Job/object-store-buckets container fetch image differs from the toolchain lock`. Neither production guard nor its order changed.

The blackbox case retained the real CLI, checked-in common source bytes and selector, Deployment→ReplicaSet→Pod UID ownership, and migration-ready assertion. Adding an empty-stderr assertion exposed the actual first refusal:

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-preflight.test.ts -t 'actual common blackbox Deployment selector and owned scheduled ReplicaSet pod admit prerequisites'
```

Observed 0 pass, 204 filtered, 1 fail, 1 assertion, 756ms (case 711.29ms), exit 1; stderr was exactly `observability preflight: candidate-ephemeral-mismatch`. `readCandidateCosts` compares the source-normalized disk demand to the caller declaration before assessing effective replicas. The common source declares ephemeral request 16Mi / limit 64Mi; the stale caller declared 0Mi and `projectFixturePod` omitted both effective resource fields. The fixture now explicitly declares candidate `ephemeralMiB: 64` and supplies effective request `16Mi` / limit `64Mi` locally through the existing `specOverride`. The shared projector and production source/effective comparison remain unchanged. The permanent empty-stderr assertion preserves the diagnostic visibility.

Two implementation attempts exposed test wiring errors, both corrected before final verification: the first green attempt passed blackbox but called `readToolchain` with the fixture directory (EISDIR: 1 pass, 481 filtered, 1 fail, 5 assertions, 1.372s); the next selected run used a nonexistent guessed `toolchain.lock.yaml` (ENOENT: 8 pass, 474 filtered, 1 fail, 19 assertions, 4.65s). The final call uses the exact existing `validatePlatform` path, `infra/versions/toolchain.json`. These were test wiring errors, not additional production diagnoses or acceptance evidence.

### Focused verification

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/platform.test.ts tools/tool-fleet/src/observability-preflight.test.ts -t 'rejects an unregistered backup init role before its unlocked image|actual common blackbox Deployment selector and owned scheduled ReplicaSet pod admit prerequisites|accepts the locked ordered platform graph for every cluster overlay|rejects a plain workload image outside the toolchain lock|rejects a changed Velero plugin image|small caller ephemeral allowance cannot replace bounded source scratch demand|source selector must match actual node labels|owned pod scheduled elsewhere cannot certify selected placement|bounded container ephemeral allowance covers shared scratch without charging the bytes twice'
```

Observed 9 pass, 474 filtered, 0 fail, 20 assertions, 4.71s; exit 0. This includes the two restored cases, unchanged whole-graph positive, ordinary workload/plugin image negatives, source placement refusal, disk-budget mismatch refusal, scheduled-replica mismatch, and bounded disk accounting positive. Blackbox took 759.32ms and backup role/image took 225.98ms.

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/observability-preflight.test.ts -t 'fix1 old named pod resources cannot establish the selected candidate readiness'
```

Observed 1 pass, 204 filtered, 0 fail, 3 assertions, 880ms (case 832.18ms); exit 0. This directly relevant resource-equality negative still blocks readiness for an old named Pod. No production safety check changed, so no new mutation-proof claim is made and no old proof batch was replayed.

The following scoped checks returned exit 0:

- `bunx eslint tools/tool-fleet/src/platform.test.ts tools/tool-fleet/src/observability-preflight.test.ts` — no diagnostics; tool-call wall time 4.098s.
- `bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false` — no diagnostics; tool-call wall time 1.273s.
- `bunx prettier --check tools/tool-fleet/src/platform.test.ts tools/tool-fleet/src/observability-preflight.test.ts` — all matched files use Prettier style; tool-call wall time 0.378s.
- `bunx openspec validate observability-environment-parity --strict --json` — 1 passed change, 0 failed, no issues, validator 18ms; tool-call wall time 0.452s.
- `bunx prettier --check tools/tool-fleet/src/platform.test.ts tools/tool-fleet/src/observability-preflight.test.ts openspec/changes/observability-environment-parity/verify.md` — all three changed files use Prettier style after formatting the appended evidence.
- The final `bunx openspec validate observability-environment-parity --strict --json` repeat after the evidence edit returned 1 passed change, 0 issues, validator 16ms; tool-call wall time 0.466s.
- `git diff --check` — no whitespace diagnostics.

Production contract/source hashes read during this diagnosis (SHA256):

| Path                                                             | SHA256                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `tools/tool-fleet/src/platform-common-resources.ts`              | `7404c90c2a86dd69b77296aafa034e968e03e3d182d2a71f4104802158ffd894` |
| `tools/tool-fleet/src/platform-manifests.ts`                     | `616452cd8f914636b2da97c58c40a7c5bdeb8cb3057390d01eee793625178275` |
| `tools/tool-fleet/src/platform.ts`                               | `e2c9830297cbf5aeedbfaf6beb8bda63c7b1efc535afe514d7ef36d233db0a1f` |
| `tools/tool-fleet/src/observability-workload.ts`                 | `792d92c1324009ac2f6f60aab43130cbd8eecf4ce80932dc922e0d46def19d28` |
| `tools/tool-fleet/src/observability-preflight.ts`                | `9f4f8903fa9a4f7b9381a9a461367c0b4fe27375416279d33992be055a351495` |
| `tools/tool-fleet/src/observability-preflight-cli.ts`            | `fa9dc49715bdcd14bee2ef77834e6e2d78678f53f340c35823bc01e3ed72b0a2` |
| `infra/platform/observability/prometheus/blackbox-exporter.yaml` | `0bdf775283f02c3a96c8c4c24b421982e3c59866b4b3f40bf55f52f1681cb12b` |
| `infra/platform/backup/local/object-store.yaml`                  | `bca40b55dbfc1cd5cdd0c4d57806651bdce08ab3ebac9f5705217545f90c04b1` |

Only the two tests and this verification record change. Full Fleet/Nx/build/host gates, historical proof suites, chart/canonical renders, full strict validation of unrelated changes, CI, network/image calls, cluster/Docker/host/runtime work and live acceptance were deliberately not run. Existing immutable raw captures and private evidence were not modified. Canonical4of11, full source/capacity/host/runtime acceptance and the overall observability setup remain open. Root owns later CI observation; no push, merge, deploy, storage, secrets or hardware change is part of this restoration.

## Task36 independent review and Task37 implementation intent — 2026-10-27

Independent scoped review approved both spec compliance and quality for Task36, c0faae740..682db5b6c, with no findings. Parent verified the exact clean committed three-file surface: two test fixtures plus verification evidence; all production files remain unchanged. The reviewer inspected only the frozen package, the cut blackbox test context and named direct contract risks, without replaying tests, renders or proof batches. Ten focused final cases passed as recorded above; full hosted CI for682db5b6c and runtime/live acceptance remain unverified. The source is not published yet, allowing reviewed work to be bundled rather than triggering duplicate full checks.

The next coherent source unit is Task25c4a helper selection and versioned effective image evidence, recorded first in proposal, delta spec, design and ordered tasks. Its read-only architecture shape was revised to preserve complete authentic historical receipt teardown while requiring explicit new effective evidence for new creation/forward acceptance. It uses the existing creator callback and explicitly refuses a lost transient-inspection race; no deletion synchronization or runtime success is claimed. Root independently verified six retained helper metadata bodies, both manifest/config descriptor sizes and platform/RootFS chains offline; receipt `/tmp/puni-helper-pin-parent-verification.json`. No network/layer/runtime operation or hardware change was needed. Candidate pins become source selections only when committed in the implementation; complete physical/admission/runtime/live criteria remain open.

## Task37 / Task25c4a — helper selection and effective creation evidence

Implementation BASE `6a374c83a2de65097248f73bf1b7e488329465ff`; root approved the revised design and committed the four-artifact intent before source work. Scope is one coherent source unit, with independent review and live acceptance still pending. Overall task 3.1 and canonical 4/11 remain open.

The toolchain now selects the two reviewed k3d 5.9.0 linux/amd64 child manifests with parent-index/config provenance. Helper naming, ordinary execution, witnessed execution and inventory linkage consume that selection. The existing thirty-image metadata cohort and the two helpers' **40,013,014 compressed bytes** remain separately identified; no expanded/cache/physical/runtime or admission sum follows. The supplied [parent verification receipt](evidence/task25c4a/parent-metadata-verification.json) was copied, not researched again. Exact selected tuples remain in design.md and toolchain.json.

New strict creation emits closed version2 plan/inputs/closure records. Precreation helper inspection corroborates reference/RepoDigests, linux/amd64 and independently selected config identity. All expected roles bind effective config IDs; other roles retain observed precreation IDs without newly claimed registry provenance. Immediate tools inspection joins the direct full creator ID, captured daemon and both Config.Image/.Image, then exclusively retains its projection. Every serial tools ID needs an exact retained observation and nonoverlapping lifecycle; final permanent network peers and volume consumers stay separate. The production witness rejects historical plans and calls forward closure before sealing. A lost inspection race or failed persistence retains partial evidence and prevents readiness. The callback does not pause k3d and fsync need not precede provider deletion.

Historical closed records, seals, completion markers and direct receipts are preserved. The reader checks one consistent cohort and dispatches historical or effective validation. Receipt teardown still rechecks current endpoint/daemon/container/network/mount identities, removes only recorded containers/network, and retains every volume and original record. The authentic [historical fixture](../../../tools/tool-fleet/src/fixtures/k3d-creation-v1.json) was generated once by the exact BASE's existing offline real-up fixture, not downgraded from new evidence: 1 pass, 2 assertions, 1.74s ([capture](evidence/task25c4a/historical-capture.log)). Its new-code teardown test compares all original bytes and all volumes. Explicit `readRetainedToolchain(path, expectedSha256)` accepts only independently hash-bound old/current source; current `readToolchain` still requires helper selection. Historical helper obligations remain named, unobserved and unpinned. No public inventory fields were added.

### TDD and observed failures

[Initial RED](evidence/task25c4a/red1.log): 13 pass / 5 fail, 201ms, demonstrating tag naming, absent selected locks and old forward acceptance. First GREEN attempt hit an ArkType composition setup error (`.element` unavailable); the named expected-creator schema fixed it, then 18 passed in 225ms. CLI RED had nine wiring failures because the newly parameterized helper call had not been updated; after wiring, nine current-path cases passed in 9.94s. Linkage/retained-reader RED had one pass/two fail in 253ms; restored tests passed 20/20 in 263ms. Serial-lifecycle RED had 17 pass/one fail in 419ms; overlap refusal closed that gap.

Focused compatibility initially found one existing unknown-key negative failing (99 pass/one fail, 1.408s): ArkType merge needs explicit undeclared-key rejection repeated on composed schemas. All compositions now retain closed boundaries. Initial TypeScript checks exposed inferred-union narrowing and test parse types; initial lint exposed unsafe test parsing/await typing. Those setup issues were corrected without disabling rules. Final review added a retained-current role-completeness negative: an empty-array case already failed the schema, so it was refined to omit exactly one required chart role. That test then failed with missing rejection in 212ms before the common role check was restored. Logs are retained in [this evidence directory](evidence/task25c4a/).

[21 isolated production-path mutations](evidence/task25c4a/proofs.json) produced **42 failed test cases in 34.421s**. Each fault restored the original source bytes in `finally`, checked restoration, and recorded the pre-fault SHA256. [The driver](evidence/task25c4a/proofs.py.txt) and individual logs retain exact commands. Faults cover current selection, preimage identity, historical-forward refusal, effective config joins, transient sets/selection/network/mounts/serial overlap, callback identity/daemon/environment, observation fsync, retained cohorts/hash, source lock, forward plan, inventory linkage, import effective ID and ordinary/witnessed environment propagation. Adjacent Proof comments name their observed failures. The retained-current TDD RED separately demonstrates its required-role check. No prior proof batch was replayed.

### Restored verification

```sh
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/contracts.test.ts tools/tool-fleet/src/k3d-creation.test.ts tools/tool-fleet/src/k3d-resource-runtime.test.ts tools/tool-fleet/src/creation-resources.test.ts tools/tool-fleet/src/observability-rehearsal-obligations.test.ts tools/tool-fleet/src/k3d-helper-images.test.ts
bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/k3d-resource-caller.test.ts --test-name-pattern 'Task37|uses the existing up|accepts only a permutation|Task21 strict platform caller freezes'
bunx tsc --build --force tools/tool-fleet/tsconfig.json
```

Observed [121 pass / 0 fail, 121 assertions, 1.58s](evidence/task25c4a/final-focused.log) and [23 pass / 46 filtered / 0 fail, 236 assertions, 39.12s](evidence/task25c4a/final-caller.log). Scoped TypeScript completed exit0 without diagnostics. ESLint ran on the fourteen changed TypeScript files and completed exit0 without diagnostics. These two background static-check durations were not measured. Final source/test/fixture [SHA256 values](evidence/task25c4a/source-hashes.json) identify the restored implementation; proof restoration hashes precede only subsequent typed fixes, proof comments and formatting.

No actual Docker/cluster/SSH/host/network/image/layer call, full Fleet/Nx/build/host gate, chart/canonical render, CI, secret/storage/hardware mutation, push or deployment ran. Command shims establish caller/refusal/retention behavior only. Live transient capture, effective provider/cache/architecture joins, physical/system/helper/native/generated/writer/process allowances, host admission, Flux, stored signals/views, isolation, history/recovery and full runtime acceptance remain required. Memory flags remain disabled; no historical memory-helper cleanup claim is made. Root owns independent review and CI.

Final scoped [strict validation](evidence/task25c4a/final-strict.log) passed one change with zero issues in 17ms (command wall time 0.578s). [Formatting](evidence/task25c4a/final-format.log) and `git diff --check` passed; exact static-check argument lists are retained in [static-commands.json](evidence/task25c4a/static-commands.json). Evidence assembly initially refused a missing parent directory and the resulting empty format glob; creating that task-owned directory corrected this documentation-only setup failure. Normal commit hooks provide the final staged-file formatting/lint/security checks; their observed outcome is reported separately after commit.

The staged diff check caught diagnostic-log trailing whitespace. Task37 log copies normalize only trailing whitespace/excess final blank lines; [raw and retained hashes](evidence/task25c4a/log-normalization.json) record that transformation. Original `/tmp/task37-*` logs and the authentic historical receipt bytes are unchanged.

Implementation commit `b312fca6b2a4155b4464f7c5e337044ffc3416ca` completed normal pre-commit hooks in 4.64s: lint, format, plaintext-secrets and private-nesting passed. Tool Wiki explicitly reported inactive / uncertified because its external activation root is absent. Migration/doc-cap hooks had no matching files. Both commit-message hooks passed. The post-commit worktree was clean and every retained final source/test/fixture SHA256 matched; no source was changed after those checks.

## Task37 fix round 1 — historical record-kind closure

Fix BASE `9f4bb094d2430440d3007da06d6ac24fc22828b2`. Fresh root review found that the historical cohort branch returned after validating inputs, while the shared record decoder already accepted effective-only `observation-<full-id>` records. A valid extra observation plus recomputed seal/completion hashes therefore reached historical teardown. This violated mixed-cohort refusal without bypassing the existing attachment checks.

`requireCreationCohort` now rejects observation records in the historical branch before returning. The correction adds no historical transient requirement, changes no old creator/event semantics, and grants no cleanup authority. The new real-down negative copies the authentic fixture, adds one schema-valid observation from its existing snapshot, recomputes both seals, and requires refusal before a teardown marker, container/network mutation or inventory change. The untouched historical positive remains unchanged. The original fixture matches BASE byte-for-byte: SHA256 `db977f285b4397a9e8a9b55844f7d2c88a193e787dd3e245f333d16270ef46a4`.

[RED](evidence/task25c4a/fix1/red.log): one historical positive passed and the new negative failed because down exited0 (2.50s). [GREEN](evidence/task25c4a/fix1/green.log): both passed, 44 assertions, 1.78s. Removing only the new guard made the same real-down negative fail again; [proof receipt](evidence/task25c4a/fix1/proof.json) records exit1, 1.398s and exact restored source hash. Restoration ran in `finally`; the adjacent Proof comment records the observation. No prior mutation batch was replayed.

```sh
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/k3d-resource-caller.test.ts --test-name-pattern 'Task37 (historical cohort rejects effective|authentic baseline|sealed reader refuses (inputs-version|observation-cohort|observation-missing))'
bunx eslint tools/tool-fleet/src/creation-resources.ts tools/tool-fleet/src/k3d-resource-caller.test.ts
bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false
```

The [restored five-case run](evidence/task25c4a/fix1/focused-restored.log) passed5 / filtered65 / failed0, 71 assertions, 8.73s. Its first invocation omitted the Fleet target's configured `--timeout=30000`; the inputs-version case hit Bun's default5000ms budget and its fixture child was terminated (exit143): four pass / one fail / one between-test error, 17.60s. That [failed run](evidence/task25c4a/fix1/focused.log) is retained. Only the same five cases were rerun with the existing project budget, without source changes. Scoped lint passed without diagnostics; scoped TypeScript passed without diagnostics (command wall time5.897s). Lint completed after the initial10s yield; its total duration was not measured.

[Final source/test/fixture hashes and raw/retained log hashes](evidence/task25c4a/fix1/hashes.json) identify the fix. New diagnostic log copies trim trailing whitespace/excess final blank lines only; original scratch logs and prior evidence are unchanged. No old144-test/21-fault replay, full Fleet/Nx/build/host gate, render, CI, network, image/layer, Docker/cluster/SSH/host/runtime operation, push or publication ran. Root owns scoped re-review and publication. All prior full admission/runtime/live limitations and overall3.1/canonical4of11 remain open.

Fix-round final strict validation passed one change / zero issues in18ms (command wall time0.452s); scoped formatting passed in0.808s and `git diff --check` passed without diagnostics. Their outputs are retained beside the fix logs. Normal commit hooks and final clean HEAD are recorded in the appended private Task37 report after committing.

## Helper review closure, actual image measurement and retained dev evidence — 2026-10-27

Task37 sourceb312fca6b2a4155b4464f7c5e337044ffc3416ca/evidence9f4bb094 received independent review. Its one Important finding was exact historical record-kind closure: new observations were accepted in an otherwise historical cohort. Fixe86b7ee4ffbdaa6463eadbffa6f24b0612bfe1da rejects those records before teardown; five restored controls/71assertions passed and a removed-guard fault failed. Scoped re-review marked the finding addressed with no new breakage. Parent verified source hashes, allowed fix paths and the unchanged authentic historical fixture. No old144-test/21-fault batch was replayed. The helper source slice is complete; full3.1/runtime remains open.

The offline layer plan retains30 service/system pinned images plus two helper selections,211+17 layer occurrences and150 unique compressed digests. Reusing two already measured MinIO layers leaves148 streams/2,777,420,962 compressed bytes. Exact plan SHA256ca04b63cb9959e99a601c22f049bf0e357e61702738c77793c709d2f68ea0cb7 binds metadata provenance and origin joins; transfer dedup does not imply runtime/physical sharing. Root reviewed the private streaming collector, required same-byte plan hash/parse and exclusive0600 receipts in0700 ownership, checked45 restored controls/four new faults, then released one bounded cohort with512Mi address-space and1800s limits.

Actual collection at23:11:07UTC stopped after94.201s on unsupported PAX metadata in Elastic Agent layer85ac00ffc01922a1ff735f4b98c4a037416b446db655a6efd0ec1c227698c427. It retained43 fully verified layers:291,785,945 compressed and987,752,960 decoded bytes;116HTTPrequests/298,384,888bodybytes include the failed partial stream. No layer payload was retained or imported. Raw receipt `/tmp/puni-layer-collector-20261027/collection-20261027T231107Z.jsonl`,146665B, SHA256d28e7361d5338a2fe22603e864a90ae1c7d3ae5e2d1ed8129ac1958821382f9d remains incomplete. Original execsession87043 is terminal exit1; it must not be restarted or relabelled complete. The remaining105-stream plan will exclude those43 verified results, retaining all image joins. Format diagnosis/continued collection and MinIO decoded hashes remain open.

The first process reports ru_maxrss633480KiB already in its start record and unchanged at failure. Fresh local controls show that high-water usage can persist across exec despite a smaller current-image VmHWM; the first run lacks /proc peak telemetry, so no measured peak-below512Mi claim is made. The enforced limit, oversize-mapping refusal and synthetic checks remain distinct from actual per-process peak measurements and complete host/runtime admission. Expanded tar streams are not physical allocation, node-cache/copy amplification or writable growth.

At23:00:21UTC an authorized read-only h1 checkpoint projection reported complete log/metric/trace/application/storage states, with checkedAt1793141992488 (about29s old), probe1793141996135 and validated actual dev container42d27c3ff342ae131a9697af82c6cb5f3d0d7c9ebf5cabec79a9c53816409623. At23:07:49UTC three direct bounded stored queries rechecked the original17:39 baseline: one log and two trace fingerprints exactly match, and18 historical metric samples at six scrape times remain present. New0400 receipts are in the existing private history-baseline workspace; the originalcf6d8ead.. receipt is unchanged. This proves current transitional checkpoint/history availability only, not post-migration Kubernetes signals, route switch, restore or rollback acceptance.

A new authorized read-only h2 capacity probe at22:51:20UTC reports16,361,123,840B total/3,688,247,296B available RAM and12,682,166,272B free on the observed home/var-tmp device. It also fails the16GiB available-memory rehearsal floor; no known existing host is admitted. No workload, gate, credential or hardware change occurred. Permanent h3mon sizing remains separate from full rehearsal capacity.

Published055d main run40591788802 is now terminalfailure: workspace122497810881 took58m37s, Twilight122497810913 succeeded in45m23s, pixels122505171272 succeeded, and stablegate122523048427 failed. Failed targets were Fleet (the two repaired fixtures) and devsync (one shared teardown overrun). The existing cleanup-allowance OpenSpec packet now records the bounded follow-up intent; it is not a general CI optimization. Current reviewed source remains unpublished until that necessary repair is reviewed, so no new full CI run or aggregate-green claim is made.

## Reviewed cleanup repair ready for bundled publication — 2026-10-27

Task39 commit5860cee4662ecfa96d24a5a34413a6c6c23bcfc8 changes only the shared cleanup allowance30→60 seconds, its fast exact-budget guard/documentation and existing cleanup verification/tasks. Seven fast tests/40assertions pass in7.020s; omission fault fails and exact restoration passes2tests/27assertions in0.617s. The single new-source31-second actual-remover proof passes with both real scratch directories and worker root absent, outside the default suite. Scoped static checks and normal hooks passed; independent spec/quality review approved with no blocker and one disclosed environment warning. Parent matched all source/replay hashes and unchanged callback/helper/project scope. Required hosted verdicts for the next published revision remain unverified.

The source checkpoint now combines reviewed DaemonSet accounting, immutable helper execution/effective identity evidence, exact historical cohort preservation, corrected common-resource test fixtures and the narrowly required teardown allowance. It remains a draft implementation: full closed capacity/physical/runtime image facts, host admission, authenticated Flux/Kubernetes/CNI/Pod/storage evidence, correlated stored signals/views, isolation, outage/history/recovery and live dev convergence remain open. Publication is not deployment or final merge.

## Task41 — published Fleet fixture contracts restored — 2026-10-28

BASE `7d4a3aa02041b9cabb1e8cddebb2389ade81a41d` was clean before this bounded repair. Existing infra run40603405142 / Fleet job122536855841 is terminal failure at that exact source:2864pass,7opt-in skips,2fail,7483assertions,2873tests across99files in674.83s. Its retained raw log `/tmp/puni-pr760-fleet-7d4.log` is966209bytes, SHA256 `2cf6f5059ab3f081be3a3096ef5403f0fb1db710877682876ba73deb4a871ade`; only needed failure context was read, with no download or CI replay.

Both failures were stale test contracts. The temporary-missing-mount shim suppresses the tools container's volume-mount event while retaining the observed mount. Task37's stronger exact transient comparison correctly refuses first with `Transient mount identity differs`. Only this fault's precise expected diagnostic changes. Temporary-missing-create/destroy retain `Temporary creator lifecycle remains unknown`, and temporary-present retains its own diagnostic. Existing unknown-state, token-redaction, absent completion marker and no-cleanup assertions are unchanged. No production guard is weakened or reordered.

The initial task brief incorrectly described a Pod security-context decoder regression. Actual inspection and focused RED established that the fixture sets **container** `securityContext: null`; the existing `InventoryContainer` already explicitly permits that value. The converted StatefulSet fixture lacked the required DaemonSet selector/template labels and retained the foreign `replicas` field. Its first failure was the DaemonSet schema prepass, before the nullable boundary, and its expected `DaemonSet-lifecycle-unaccounted` blocker no longer exists after daemon accounting. Root reviewed these exact boundaries and approved a test-only correction. The fixture now supplies matching labels/selector, removes the foreign replica/claim fields, and keeps the authored null. It asserts exact runtime/history/topology, writable-root/ephemeral and workload-bounds obligations; incomplete state; false creation/runtime authority; no daemon charges/lifecycle; unchanged packet; and the retained native body's null. The existing malformed supplied-security-context negative remains selected and unchanged.

### Scoped RED and GREEN

```sh
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/k3d-resource-caller.test.ts tools/tool-fleet/src/observability-native-ordinal.test.ts --test-name-pattern 'isolates temporary-missing-mount at creation closure without cleanup|valid null security context on unrelated DaemonSet preserves its lifecycle obligation'
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/k3d-resource-caller.test.ts tools/tool-fleet/src/observability-native-ordinal.test.ts --test-name-pattern 'isolates temporary-missing-mount at creation closure without cleanup|valid null container security context on unrelated DaemonSet preserves its lifecycle obligations'
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/k3d-resource-caller.test.ts --test-name-pattern 'isolates temporary-(present|missing-create|missing-mount|missing-destroy) at creation closure without cleanup'
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-native-ordinal.test.ts tools/tool-fleet/src/observability-native-daemon.test.ts --test-name-pattern 'valid null container security context on unrelated DaemonSet preserves its lifecycle obligations|malformed supplied security context is not treated as absent|DaemonSet malformed foreign replicas precedes missing bounds topology and provider|DaemonSet late malformed placement is decoded before earlier ordinal claim collision|DaemonSet valid (Exists|DoesNotExist) affinity without values retains full source and all candidates'
```

Fresh local RED reproduced exactly both hosted failures:0pass,159filtered,2fail,6assertions in2.25s. Restored two cases:2pass,159filtered,0fail,20assertions in2.31s. Four temporary lifecycle siblings:4pass,66filtered,0fail,48assertions in6.51s. Six final native nullable/malformed/placement cases:6pass,171filtered,0fail,15assertions in906ms. Filtered tests were not executed; these counts overlap the two primary cases. No new/changed production safety check exists, so root explicitly ruled that a new guard mutation/Proof comment would be unnecessary; prior Task25c3a/Task37 proofs were not replayed. No nullable schema, quantity, strategy, source provenance, mount, lifecycle or cleanup implementation changed.

```sh
bunx --no-install eslint tools/tool-fleet/src/k3d-resource-caller.test.ts tools/tool-fleet/src/observability-native-ordinal.test.ts
bunx --no-install tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit --incremental false
bunx --no-install openspec validate observability-environment-parity --strict --json
```

Scoped lint and no-emit TypeScript exited0 without diagnostics; their total durations were not measured. Strict OpenSpec passed1change/0issues,18ms validator time (0.511s command wall time). Final formatting/diff checks and normal commit hook outcomes are recorded in the private Task41 report after evidence assembly.

The entire tracked change surface is two direct test files and this verification record: **zero production diff**. Exact BASE/current byte comparisons succeeded for the daemon decoder, native ordinal decoder, workload boundary, creation closure, resource runtime, retained creation reader, authentic historical receipt fixture and toolchain. Their unchanged SHA256 values are recorded in the private report. No original receipt, source pin, resources, provider identity, creator/cohort or authority flag was changed.

No full test files/Fleet/Nx/build/gate, old proof batches, canonical/chart rendering, CI, network, image collection, Docker/cluster/SSH/host/runtime, push or deployment ran. The root-owned live private collector and SourceTask40 receiver were untouched. Full goal/3.1, canonical4of11, physical/runtime image accounting, host admission, authenticated Flux/Kubernetes/CNI/Pod/storage evidence, correlated stored signals/views, isolation, history/recovery and live dev convergence remain open. Root owns fresh review and publication.

## Task41 independent review and next receiver intent —2026-10-28

Independent scoped review of7d4a3aa02041b9cabb1e8cddebb2389ade81a41d→a11aa8d7cd50cfb766cfdc6723bfc0618f086e18 approved both spec compliance and task quality with no blocking finding. Parent read the exact diff, matched eight protected production/fixture/toolchain paths byte-for-byte toBASE and retained the focused execution receipts; no passing test suite was repeated. Unchanged production behavior, selected negative runs and their original evidence remain distinct from the reviewer diff. Tool Wiki is still inactive/unprovisioned and uncertified. No current hosted green claim is made:7d4 infra40603405142 is terminalfailure on the two restored test contracts; main40603405066 is still running, with all pixels and stable pixels successful at that revision only.

The four-artifact Task40 receiver intent now records exact bounded input/history/status/storage semantics before code. Its source/component/canonical capture tasks remain unchecked and separate from full runtime admission and live acceptance.

The single new local MinIO exact-member pass closes both decoded SHA256/configdiffID joins:97e4ece8f8a4d01b66df2c55c1f1e8a2860597b54dffbbc0df2f9942062cb34d(4648960decodedB) and21f49c6d058fd5596ff90a4c79075b14ed455485c38f649decb6db9b3c300de0(141529600decodedB). Both descriptors are application/vnd.oci.image.layer.v1.tar+gzip; manifest6892027e.. is750B/OCIimage manifest, config814c467f.. is1354B/OCIimage config. Aggregate52846437compressed/146178560decodedB; actual646.052ms, currentexecVmHWM17620KiB under512MiBhardAS. Measurementc8b8f1acd1d1e994b2389771b0cc728a01ff47bf5ba9eea23f5a71e0a0f5a430 and new tiny syntheticproof6a72b43bba75fa30d15eb7dda0dc2efec7a5389c521b6a2d64da8c5884d5da41 retain0→1removeddiffIDguard→0restored. Parent rehashed every artifactmanifest entry, checked receipt/config consistency and matched original archive current metadata (identity/0400/timestamps) without archive/decompression replay. Historical logical-byte counts are not remeasured. These are image metadata/stream facts, not physical cache/copy/runtime allocation or hardware advice.

Residual collector7535 has terminated; its existing receipt residual-20261027T235612Z.jsonl is80970B/SHA256d78cf25b193b8db8959fc4258309a338e5d3e53464b4c5ce1ec7e6a631af8bb7, containing25new complete layers1316100352compressed/3270941184decoded/3265454668logicalregularB. It stopped after273.335s/104HTTPrequests/1316169702HTTPbodyB at unsupported tar type on ECK layer90c16ebb.. after1369compressed/8442decoded prefixB. No cohort-complete or inferred exit receipt is fabricated; absent tool handle was reconciled from the terminal failure record. CurrentexecVmPeak64052/VmHWM29656KiB and observedAS512MiB remain distinct from inheritedru_maxrss633480. Earlier43complete layers remain separately verified; none of the68 complete streams will be redownloaded. One tightly bounded failed-prefix diagnosis is separate research, not another full collection release. Whole-image closure/physical facts/admission remain open.

Hardware clarification:16GiB AVAILABLE RAM plus120GiBstores is the current full disposable rehearsal guard (including50GiB registry and20GiBMinIO), not measured steady-state h3mon sizing. Do not infer an upgrade purchase or provisioning authorization from it. Existing observability, applications and telemetry history remain untouched.

### Task40 — finite local receiver source and POSIX application controls

Intent/code base: `eaae78ca14a7b35393b049ac9e16bf2a37555964`. Only the local receiver, its new current-candidate validator/tests, direct `validatePlatform` call and exact local Deployment parity fingerprint changed. Production recipient authority, image, security, CPU/memory, Service, source/environment semantics and historical structural/image readers remain unchanged. Source commit and the separate canonical capture are recorded below after their creation; no source/runtime identity is inferred from this working-tree run.

The existing BusyBox CGI now admits one nonwaiting writer, accepts at most65536 opaque body bytes within10seconds, retains at most8388608 history bytes without rotation and rejects input/storage failures explicitly. Length syntax is one to five ASCII decimal digits; supported zero padding is normalized before arithmetic. A checked same-filesystem replacement preserves old records; readable new bytes and checked stdout precede200ok. Interrupted/uncertain state requires inspection and refuses restart; missing/unreadable established state is never initialized anew. Same-Pod emptyDir retention does not imply power-loss or Pod-replacement durability; lost acknowledgement may duplicate a recorded body. Disk scratch32Mi and ephemeral32Mi/64Mi are unmeasured candidates, not enforced host bounds. httpd children/transport/kernel costs remain unbounded by this CGI contract.

Focused evidence retained under `/tmp/puni-task40-receiver/`:

- Initial application RED:10 observed status-contract failures plus2 newly required initialization failures; existing source acknowledged malformed/oversized/short input. Production caller RED: missing receiver ephemeral limit was accepted. Selected parity RED: old Deployment digest refused the changed fixture.
- New controls exposed two implementation defects before acceptance: ordinary `cmp` output preceded the CGI status; shell `set -e` did not enforce every failed conjunction during initialization. Silent comparison and explicit startup refusals restored their controls. A historical test initially passed the repository directory instead of the required toolchain-file path; that harness error was corrected. Scoped TypeScript/lint findings in new test helpers were corrected.
- `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-receiver.test.ts tools/tool-fleet/src/observability-receiver-candidate.test.ts`:84pass/0fail,255 assertions,12.98s. Executes extracted actual bootstrap/CGI with only private filesystem/stdout remapping and a substituted server-launch boundary. Includes exact raw firing/resolved/trailing-newline/NUL bodies, exact/full history, length/deadline/concurrency, nonroot unreadability, interrupted/partial/failed persistence, readback and stdout, and current-policy/historical-reader controls.
  -51new production-path guard/dependency mutations each produced an observed failing assertion and were restored;22.660s cumulative. `proofs.json` retains exact commands, outcomes and timings; each named raw log remains alongside it. Two first attempts were inconclusive because later checks also refused the injected malformed length/incomplete record; their logs remain as `length-syntax-unproved.log` and `record-write-unproved.log`. Distinguishing fractional-length and complete-sized-but-failed-record faults then failed the expected assertions. Adjacent `Proof:` comments name observed controls. No old proof matrix was replayed.
- Selected parity CLI controls:5pass/0fail,11 assertions,0.936s (`all reviewed candidates satisfy one contract`, capacity sibling comparison, modified/absent receiver and production fixture refusal). Whole-semantic comparison remains intact; only Deployment fingerprint changed to `865f98e052001490ec83c3fd66e3943819bed405e83a15c0c24db41f8251446f`. Exact executable SHA256 is `acb116fadefbd82953f618548f4721eb74e0406bf1bfb2cfbea9062b51ed9b32`.
- Direct unchanged `assessObservabilityRehearsalAdmission` control:4assertions passed;16383MiB refuses,32768MiB still yields false admission/runtime authority and the complete-budget blocker. This avoided importing unrelated render/setup hooks from the larger rehearsal test file.
- Scoped ESLint passed for five TypeScript files: receiver validator, two tests, platform caller and parity. `bunx --no-install tsc --noEmit -p tools/tool-fleet/tsconfig.lib.json` and `.../tsconfig.spec.json` passed. No emit/build/full Nx/Fleet/application/browser gate ran.

The sandbox denied Bun pipe writes with EPERM; the same bare Bun-to-head reproduction failed without receiver code and succeeded outside that sandbox. Bounded tests used scoped escalation as nonroot uid1000. This is an execution-environment limitation, not a receiver defect or pinned BusyBox observation. No Docker, network, SSH/host work, image collection, production mutation or pinned-component run occurred. Pinned BusyBox/httpd/applet behavior, actual traffic fit, effective storage/resource enforcement, host admission, full3.1/canonical4of11 and all signals/isolation/history/recovery/live acceptance remain open.

#### Task40 committed capture and retained comparison

Source commit `ff0b0208bc426ad8bc2a4896f15a90f34eb97b89` passed normal commit hooks. Hook output records Tool Wiki as inactive/not certified because its external activation root is absent; unrelated migration/doc-cap hooks were inapplicable. Scoped formatting, `git diff --check` and `bunx --no-install openspec validate observability-environment-parity --strict --json` passed before the commit. No hooks were bypassed.

Exactly one canonical run used the retained producer recipe, a new `/tmp/puni-task40-receiver/` destination and hash-verified local Helm/kubectl archive copies in its private tool cache. No download or runtime action was needed. Command: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-rehearsal-inventory-entry.test.ts`, with `PUNI_TOOL_CACHE=/tmp/puni-task40-receiver/tool-cache`, `PUNI_REHEARSAL_FRAMES_EXPORT=/tmp/puni-task40-receiver/current-frames.json` and `PUNI_REHEARSAL_INVENTORY_EXPORT=/tmp/puni-task40-receiver/current-receipt.json`. Outcome: 1 pass, 225 assertions, 13.206 seconds wall time. Source and generator both identify `ff0b0208bc426ad8bc2a4896f15a90f34eb97b89`, clean. The producer retained raw output before assertions; all three files are mode0400.

| Retained raw artifact             | SHA256                                                             |   Bytes |
| --------------------------------- | ------------------------------------------------------------------ | ------: |
| `current-frames.json`             | `83222e74ee24dc8740e0d71820e5aa8142cccff3b28b978ae6a3e9bdfb450e10` | 7563717 |
| `current-frames.json.stages.json` | `b38d0544ff36a968d2e145bfaab8be4e94bbe7f15b74e6ce7be9d431bac8d86d` |  739460 |
| `current-receipt.json`            | `72620acbd97f50be8e0af07507d1e12896754d0ac8066239c5dce651b8fa2b95` | 1122938 |

`bun test --timeout=30000 /tmp/puni-task40-receiver/source-control.test.ts` passed 1 test/435 assertions in7.36seconds using the retained bytes, without rendering again. Its first harness attempt mistakenly compared the decoder's passthrough identity object as though it contained only identity fields; the expected receiver behavior change made that comparison fail. The corrected explicit API/kind/namespace/name comparison and complete semantic comparison passed. That first log remains retained; no source or capture was changed.

The capture contains11stages/25frames/396inventory entries. Exactly one stage resource changes: `Deployment:observability:alert-receiver`; removing only its approved command/env/ephemeral/scratch additions reproduces every historical semantic field. The Service and every other stage resource are equal. All Helm release expansion bytes equal immutable0c645d2. Historical raw hashes/modes were rechecked unchanged.

The current native adapter consumed both captures with exact historical/current Git-retained topology bytes independently bound to each receipt. Native charges increase118→120; blockers remain125. The receiver adds initial and first-replacement conditional slots, each32Mi memory/5m CPU request/64Mi disk. Its old `candidate-emptydir-unbounded` blocker becomes `deployment-replacement-wave-runtime-binding`; every other blocker and charge remains unchanged apart from correctly rebound frame hashes. Totals:24000MiB memory,4210m CPU requests,20544MiB disk. These are conditional source accounting, not observed consumption. Runtime prerequisites, unsupported scenarios and excluded contributors are unchanged; state remains incomplete and creation/runtime authority false. The source/control summaries, ledger, exact commands, timings and raw logs remain in the private evidence directory.

Independent scoped review and the separately preflighted pinned BusyBox component remain pending. No further canonical/chart/per-field rerender, old proof replay, full gate, host/cluster/runtime action, CI, push or deployment ran. Full3.1/canonical4of11 and all actual signal, isolation, history, recovery, capacity/enforcement and live criteria remain required.

## Receiver review, completed historical stream facts and hosted cleanup — 2026-10-28

Independent Task40 review approved both specification compliance and task quality for source `ff0b0208bc426ad8bc2a4896f15a90f34eb97b89` and evidence `3dc689d71e5d34e6002dc182ddc770a1d6a4b68a`, with no blocking finding. Parent verified all three new raw capture hashes/modes, the unchanged three historical captures, both tool seed hashes, and all **123 generator input hashes** against the exact committed source and current bytes. The one new capture and its 435-assertion retained comparison were not repeated. Its conditional native ledger remains **120 charges / 125 blockers / 24,000 MiB memory / 4,210m CPU requests / 20,544 MiB known disk**, incomplete with both authorities false. Source review does not certify the pinned component or whole-stack runtime.

The final bounded streaming execution, root session92817, exited0. Its receipt `/tmp/puni-character-residual-20261028/residual80-20261028T004022Z.jsonl` is235112B, SHA256 `081c3ca68c2fed010df58798a88e89f015bc66f43a6686f39bad9b42bc238b75`, frozen0400 after parent validation. All80 descriptor/diffID/position/origin joins and terminal sums matched:1,169,534,665 compressed,3,166,756,352 decoded and3,068,474,597 logical regular payload bytes; five character-device headers and no new xattr records. Actual cost was256HTTPrequests/1,169,633,973bodybytes/280.880seconds. Current-exec VmPeak66,044KiB/VmHWM31,196KiB and observed512MiB address-space limit are distinct from inherited ru_maxrss633,480KiB. No completed earlier stream was downloaded again and no payload was retained.

The offline rollup now joins all **150 original unique layer identities** to **32 original image selections**. Machine facts `/tmp/puni-image-rollup-20261028/facts.json` are764926B, SHA256 `52bf0622f984695fdd5dcc2cae3a117c957a7f0dcffe2e2742d3089b6143b6b0`. Parent rehashed every artifact and all107 input labels/106 distinct retained files, checked every ordered image arithmetic/identity join, and independently summed **2,830,267,399 compressed / 7,571,629,056 decoded bytes**. The30 original source images have211 layer references/2,891,649,484 compressed/7,744,082,432 decoded bytes; two helper candidates have17 references/40,013,014 compressed/97,217,536 decoded bytes. Expanded sums count repeated references; unique sums are artifact-transfer facts. Neither grants physical/cache/node-sharing credit or claims merged rootFS allocation. Fifteen new tiny controls and18 observed assertion-fault outcomes, zero errors or diagnostic-only faults, are retained; old matrices/streams were not replayed.

Missing old counters remain explicit: both retained MinIO inner/logical counters are unknown in this rollup,45 unique streams lack xattr counters and70 lack character counters. No zero was manufactured and no full150-stream logical total is claimed. Historical capture/declaration identities remain0e39b657…/12354e87…; these facts were not relabeled as current Task40 or effective runtime selections. A current inventory consumer, generated/bundled/effective image closure and physical cache/copy/unpack/writable costs remain required.

A separate read-only inventory of those exact32 config bodies found three declaring six Volumes paths: registry `/var/lib/registry`; k3s `/var/lib/cni`, `/var/lib/kubelet`, `/var/lib/rancher/k3s`, `/var/log`; Alertmanager `/alertmanager`. Twenty-nine omit Volumes, including both helper candidates; no null, empty-object, absent-config or malformed state was observed. Facts `/tmp/puni-image-volumes-20261028/facts.json` are31616B, SHA256 `29f3359539f3819a5563eaeb866127fd0bb92fc50ea4cbd8c95966891efc0386`. Parent rehashed its artifacts. Config declarations do not prove Docker anonymous-volume creation, actual mounts or Kubernetes/CRI behavior. No archive, payload, network or production validator was involved.

Published7d4 main run40603405066 is terminalfailure: workspace122537015918 took63m46s; Twilight122537015927 passed in60m52s; all browser shards and stable pixels passed; stablegate122560256111 failed. The only failed Nx target is Fleet with the two exact Task41 contracts already repaired and independently reviewed in a11aa8d7c. Current published source still lacks those repairs; no current aggregate-green claim follows. The shared cleanup change passed its hosted target: **974 tests,0 failures,3,786 assertions,835.47seconds**. Raw workspace log is64041B/SHA256 `a2f3867fc74a41d3cb0301495661c5c5671f24d6340c12d52031409d32696011`; artifact12781169845 ZIP569226B/SHA256 `dbcea2fca0026466912bdbd4de678b39d3aa468a086acd080306f83641c86613`, expanded log4240443B/SHA256 `b92af4f692367dfe9150ba3d76d0165ad720c251bbfe31d8ccbba2b1a35f866a`. Each was fetched once. Nx reports60m42s/0of139cachehits/28m32scriticalpath; broader CI optimization remains outside this change. Later workspace steps were skipped after the failed gate; they are not credited as passing. Tool Wiki remains unprovisioned and uncertified.

A fresh read-only h3 Docker coexistence projection at00:42:13UTC retains13 running containers with8GiB total configured memory limits and no unbounded memory limit; this is configuration, not peak usage or complete Kubernetes/system demand. Receipt7126B/SHA256 `0fa92ef8700b48b4c73a55c6f06205dc37ead9ddafd5f7ef25265a3bf50c0b2a` is0400 in the private operator inventory. No steady-state hardware recommendation or full host admission follows.

The exact pinned BusyBox component has a successful true-ready baseline: source command `acb116fadefbd82953f618548f4721eb74e0406bf1bfb2cfbea9062b51ed9b32`, HTTP200/ok, exact37B firing body,74B retained history and53B stdout mirror. Actual UID1000, read-only root, dropped capabilities, no-new-privileges, seccomp,32Mi memory/100m CPU cgroups and ext4 scratch were observed. The first attempt had only a proxy-readiness reset; the second passed after an in-container PID1/socket/bootstrap barrier but its harness cleaned up prematurely. Both owned containers/fixtures were removed and13 existing IDs preserved. Remaining functional cases and restart/timeout/history boundaries are **not accepted**; no source bug is inferred. Further runtime work requires the corrected bounded case loop and explicit controller release. The image cache is a tracked new artifact; no image prune or production/Secret changes occurred. Pull stdout/timing/exit receipt was lost due a harness recording error, so only the exact final cached identity chain is established.

The actual Docker29.7.2/API1.55/containerd store reports index/manifest object IDs rather than an interchangeable config ID. This exposed a concrete remaining k3d helper identity assumption, confirmed by one pure production-function counterexample (0pass/1fail). The next source design must retain distinct image identity roles and provider provenance through a dedicated adapter and explicit receipt versions. Current helper runtime support is not established by the BusyBox component. Full3.1, canonical4of11, host admission, authenticated Flux/Kubernetes/CNI/Pod/storage evidence, stored signals/views, isolation, history/recovery and live dev convergence remain open.

## Exact receiver functional corpus and remaining capture gap — 2026-10-28

The final released receiver component executed all ten remaining case IDs under the exact pinned source/image. Actual statuses were200 resolved opaque65,536B,400 missing length,400 malformed HTTP length,413 oversized declaration,400 short body,408 slow body,503 simultaneous busy,507 near-full history,200 after same-ID process restart and500 unreadable established history. Slow read took10.013s; busy returned in4.43ms. NUL/trailing bytes, exact near-full refusal, unchanged accepted history, process restart retention and child/process disappearance were observed. Malformed HTTP400 was attributed to the server response, not falsely credited as malformed CGI input. Two earlier requests plus these ten exhaust the12-request budget across three sequential attempts.

Raw final receipt2067904B/SHA256daeec9c21f88941c496abaf2f6d6d88ade950b39642e3d1ec4bf9924a4fc6190 was retained0400 before assessment. Its private cleanup predicate required capitalized No such object, but the successful removal was followed by lowercase error: no such object. The runner therefore exited1 after all functional completions. Separate same-operation cleanup used successful full-ID/owner list queries, exported owned history65643B, verified all seven observed process identities absent, removed only the proven fixture and confirmed all13 existing running IDs unchanged. Cleanup receipt195488B/SHA256c16fa908d80c5654c0791f5d2a573f2ce4c9b896617f139dd6096701ca8f2c90 retains those facts. No fourth container or repeated corpus ran.

The cleanup exception also prevented serialization of final in-memory attach buffers. Maximum/NUL stdout mirror bytes and final stderr are consequently unverified; the earlier37B baseline's exact stdout remains valid but does not fill this gap. Component acceptance stays incomplete. The final evidence manifest records3219227B retained evidence; parent rehashed every listed artifact/report, verified all ten raw statuses, exact ordinal/completion coverage and final owned cleanup/preservation. No application source bug, production change or additional deployment acceptance is inferred.

The next source intent now records neutral image identity roles, a dedicated detected Docker adapter and explicit version3 forward receipts before implementation. A fresh read-only capability projection reports h3 daemon91cee18b-c061-4279-a311-1ac86ca3dd97, reported serverAPI1.55/min1.40, Docker29.7.2, overlayfs and driver-type io.containerd.snapshotter.v1; receiptSHA2560845216a8dfd38cbec8dd79fddfbbf0d68b7d1706fc8ac7056e773b12b036b25. This is observed provider provenance, not proof of an unobserved negotiated API or selected-helper execution. No code or full-suite rerun has yet implemented that intent.

## Task44 — image roles, Docker adapter and version3 source verification (2026-10-28)

The source implementation follows committed four-artifact intent `e362561bb90a6071ee8f1a3aeb10a537fe0c9365` and the controller-approved provider/source clarification `5ed49b6f6`. The latter was committed with normal hooks before v3 integration. Neutral `image-identity.ts` distinguishes config, manifest and index objects, helper source selections and runtime pins with `config.state=unobserved`. `docker-image-identity.ts` owns capability decoding, raw image/manifest fields, repository normalization and role-specific provider provenance. Config IDs in helper selections are source-manifest inferences; new containerd observations carry manifest/index identities rather than asserting observed config bytes.

New strict creation emits closed version3 plans/inputs/permanent snapshots/transient observations/closures. Both exact-reference image projections and runtime manifest descriptors corroborate the selected content under the same daemon. Only Docker29.7.2, reported serverAPI1.55/min1.40, Linux/amd64, overlayfs and unambiguous `driver-type=io.containerd.snapshotter.v1` are currently supported. Identity requests explicitly set API1.55 within their scoped execution context; a runtime profile change also refuses. Reported maximum/minimum are distinct from this requested API. Classic version3 forward support remains explicitly unsupported/unverified; no descriptor/config fallback is provided.

Version1/2 schemas and original config equality meanings remain intact for teardown; new forward acceptance requires version3. The shared existing lifecycle/attachment/volume validators are reused only after v3 image validation, without serialized upgrades. The authentic baseline v1 fixture remains byte-identical. No authentic v2 raw receipt is known: v2 teardown/config/mixed-version controls are explicitly synthetic fixtures constructed under the original producer contract, with `.git` removed to prove legacy teardown has no new Git prerequisite.

Version3 retained reading obtains `sourceRevision:infra/versions/toolchain.json` from the existing local Git repository, checks the recorded hash against those same bytes, and decodes through the existing complete Toolchain validator. The thin IO reader passes the independent selection to cohort joins; forward closure reuses its already checked lock. `decodeRetainedToolchain` is a tiny approved extraction in `contracts.ts`; the original file reader delegates to it. Missing Git/executable/object, failed Git with plausible stdout, changed hash and false helper selection refuse before teardown, with a restoration/manual-inspection prerequisite. There is no fetch, Git mutation, temp lock file or second serialized source proof.

### Primary protocol/source evidence

The exact [Moby docker-v29.7.2 image inspection implementation](https://raw.githubusercontent.com/moby/moby/docker-v29.7.2/daemon/containerd/image_inspect.go) selects the stored target normally and the chosen child for a platform request, using that target for ID/Descriptor. Its repository path uses familiar reference forms. [Docker API history](https://docs.docker.com/reference/api/engine/version-history/) documents platform image inspection and container `ImageManifestDescriptor`; [the CLI API documentation](https://docs.docker.com/reference/api/engine/) documents explicit API requests disabling negotiation, and [image inspect documentation](https://docs.docker.com/reference/cli/docker/image/inspect/) describes platform requests. Initial guessed `v29.0.0` source URLs returned404; those failures supplied no semantics. The exact release-tag source above was available and used.

Existing Task43 safe receipt projections, without new host/API/image operations, confirm BusyBox root/index `73aaf090…`, selected manifest `b7f3d86d…`, root size9535, child size610 and Linux/amd64. The complete original full-tag+index configured reference and DockerHub shorthand RepoDigests are modeled in the protocol fixture. The final runtime-pin positive uses those exact index/child digests and descriptor fields with an explicitly synthetic daemon binding. Helper fixtures remain synthetic protocol observations of the source-selected tuple; BusyBox cannot certify actual helpers. Only safe identity/descriptor/platform/configured-image fields were read; no ENV/configuration values were emitted.

### TDD and selected verification

- Reused the untouched authorized production-function RED `/tmp/puni-task44-identity-shape/helper-counterexample.raw-red.log`:0pass/1fail/120ms at the former config-ID equality assumption; no replay.
- New neutral refusal stubs produced4 expected behavioral failures in9 tests (38ms); generic negative passes at the stub stage were not proofs. Adapter refusal stubs had3 missing-positive-behavior failures and7 runtime fixtures blocked by the stub; those7 are setup failures, not runtime/R5 evidence. No missing-export result was counted.
- Real CLI RED `/tmp/task44-caller-red.log`:1fail/2pass/2.47s, correctly failing at the old helper identity guard. Its two capability cases were masked by that old guard and were not credited as capability proofs. An initial generated-fixture regex syntax error was corrected before retaining this behavioral RED.
- Runtime-profile RED `/tmp/task44-runtime-profile-red.log`:0pass/1fail/2.80s, actual controlled CLI up exited0 after engine drift under the same daemon. After adding the v3 profile read, the same case passed (1test/2.09s).
- Final covering command: `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/image-identity.test.ts tools/tool-fleet/src/docker-image-identity.test.ts tools/tool-fleet/src/k3d-creation.test.ts tools/tool-fleet/src/k3d-resource-runtime.test.ts tools/tool-fleet/src/k3d-resource-caller.test.ts --test-name-pattern 'Task44'`:78pass/0fail/137filtered/185assertions/47.92s, `/tmp/task44-final-tests.log`. This completed before the final additional v3-in-v1 compatibility case and exact BusyBox fixture refinement; those are verified separately below.
- Selected compatibility command: `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/k3d-resource-caller.test.ts tools/tool-fleet/src/k3d-helper-images.test.ts tools/tool-fleet/src/k3d-creation.test.ts --test-name-pattern 'Task21 strict platform caller freezes|Task37 ordinary up|Task37 authentic baseline|Task37 retained historical|Task37 retained current|Task44 historical cohort|Task37 historical closure supports|Task37 real up refuses preimage|refuses temporary-anonymous before direct'`:11pass/0fail/137filtered/102assertions/11.61s, `/tmp/task44-final-compat.log`. This includes actual controlled CLI node import by creator ID without Buildx, ordinary helper references, config/platform/repository precreation refusal, anonymous tools-volume refusal, old toolchain readers and authentic v1 teardown. The old historical forward diagnostic now correctly names version3.
- After its new watched guard fault, `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/k3d-resource-caller.test.ts --test-name-pattern 'Task44 historical cohort rejects version3'`:1pass/0fail/962ms, `/tmp/task44-legacy-mixed-restored.log`.
- Exact retained protocol fixture refinement only: `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/docker-image-identity.test.ts --test-name-pattern 'root index and child|ambiguous digest'`:2pass/0fail/199ms, `/tmp/task44-exact-protocol-green.log`. No passed fault batch was replayed after replacing the prior runtime stand-in hashes with exact retained BusyBox hashes.
- Selected callback/import compatibility previously passed18/18 as part of51pass/0fail/3filtered/1.043s across neutral/adapter/runtime files (`/tmp/task44-protocol-runtime-green.log`); this preserves wrong ID/reference/name/daemon, inspection race, occupied observation and environment refusal paths. The successful callback retains its observation before closure. No provider deletion barrier or cleanup change was added.
- Scoped production `bunx tsc --project tools/tool-fleet/tsconfig.lib.json --noEmit`:exit0,1.58s. Scoped test `bunx tsc --project tools/tool-fleet/tsconfig.spec.json --noEmit`:exit0,1.79s before the exact fixture refinement; its covering final repeat is recorded below. Explicit scoped ESLint across the14 changed TypeScript files:exit0,5.79s; the exact fixture's final ESLint is recorded below. Logs are `/tmp/task44-final-{lib,spec,lint}.log`; `time -p` timings come from fresh command output. Earlier lint/type errors were corrected before these successes.

### Watched new R5 faults

37 individually scoped fault injections produced 44 behavioral failing-test observations; cumulative mutation command wall time 39.356s. Each command targeted only the named new boundary/case, restored source in `finally`, checked byte equality, and retained raw output. Exact command arrays and restoration hashes are in `/tmp/puni-task44-r5/summary.json`. Adjacent `Proof:` comments name these faults. Dependency substitutions/default injections below are labeled as such; they are not falsely described as individual guard-removal bypasses. A temporary mutation-script source-match error and a temporary comment-script syntax error did not count as proofs; source was restored and only the previously unrun version faults continued. Fixture-only failures caused by a shared mutable capability constant and one omitted synthetic volume fault were corrected and are not R5 results.

| Injected fault                        | Behavioral failing tests | Wall time | Raw receipt                                                   |
| ------------------------------------- | -----------------------: | --------: | ------------------------------------------------------------- |
| `capability-engine`                   |                        1 |    0.161s | `/tmp/puni-task44-r5/capability-engine.log`                   |
| `capability-api`                      |                        1 |    0.175s | `/tmp/puni-task44-r5/capability-api.log`                      |
| `capability-store`                    |                        1 |    0.185s | `/tmp/puni-task44-r5/capability-store.log`                    |
| `capability-duplicate`                |                        1 |    0.166s | `/tmp/puni-task44-r5/capability-duplicate.log`                |
| `capability-daemon`                   |                        1 |    0.161s | `/tmp/puni-task44-r5/capability-daemon.log`                   |
| `projection-daemon`                   |                        1 |    0.173s | `/tmp/puni-task44-r5/projection-daemon.log`                   |
| `binding-source-role`                 |                        3 |     0.18s | `/tmp/puni-task44-r5/binding-source-role.log`                 |
| `binding-platform`                    |                        1 |    0.163s | `/tmp/puni-task44-r5/binding-platform.log`                    |
| `binding-descriptor-size`             |                        1 |    0.184s | `/tmp/puni-task44-r5/binding-descriptor-size.log`             |
| `repository-alias`                    |                        1 |     0.16s | `/tmp/puni-task44-r5/repository-alias.log`                    |
| `neutral-source-platform`             |                        1 |     0.16s | `/tmp/puni-task44-r5/neutral-source-platform.log`             |
| `neutral-runtime-descriptor`          |                        4 |    0.175s | `/tmp/puni-task44-r5/neutral-runtime-descriptor.log`          |
| `runtime-provenance`                  |                        2 |    0.171s | `/tmp/puni-task44-r5/runtime-provenance.log`                  |
| `source-lock-hash`                    |                        1 |    4.471s | `/tmp/puni-task44-r5/source-lock-hash.log`                    |
| `git-exit`                            |                        1 |    4.579s | `/tmp/puni-task44-r5/git-exit.log`                            |
| `source-selection-dependency`         |                        1 |    4.456s | `/tmp/puni-task44-r5/source-selection-dependency.log`         |
| `requested-api`                       |                        1 |    1.057s | `/tmp/puni-task44-r5/requested-api.log`                       |
| `runtime-profile`                     |                        1 |     2.71s | `/tmp/puni-task44-r5/runtime-profile.log`                     |
| `forward-closure-version`             |                        1 |    0.241s | `/tmp/puni-task44-r5/forward-closure-version.log`             |
| `forward-witness-version`             |                        1 |    0.355s | `/tmp/puni-task44-r5/forward-witness-version.log`             |
| `capability-store-type`               |                        1 |    0.158s | `/tmp/puni-task44-r5/capability-store-type.log`               |
| `capability-missing-store-dependency` |                        1 |    0.184s | `/tmp/puni-task44-r5/capability-missing-store-dependency.log` |
| `neutral-helper-config`               |                        1 |    0.152s | `/tmp/puni-task44-r5/neutral-helper-config.log`               |
| `neutral-config-equality`             |                        1 |    0.147s | `/tmp/puni-task44-r5/neutral-config-equality.log`             |
| `neutral-runtime-root`                |                        1 |    0.151s | `/tmp/puni-task44-r5/neutral-runtime-root.log`                |
| `neutral-role-discrimination`         |                        1 |    0.156s | `/tmp/puni-task44-r5/neutral-role-discrimination.log`         |
| `missing-platform-default`            |                        1 |     0.18s | `/tmp/puni-task44-r5/missing-platform-default.log`            |
| `manifest-variant`                    |                        1 |     0.18s | `/tmp/puni-task44-r5/manifest-variant.log`                    |
| `root-child-platform`                 |                        1 |    0.183s | `/tmp/puni-task44-r5/root-child-platform.log`                 |
| `index-child-ambiguity`               |                        1 |    0.184s | `/tmp/puni-task44-r5/index-child-ambiguity.log`               |
| `image-volume-projections`            |                        1 |     0.17s | `/tmp/puni-task44-r5/image-volume-projections.log`            |
| `container-reference-daemon`          |                        2 |    0.188s | `/tmp/puni-task44-r5/container-reference-daemon.log`          |
| `unknown-container-object-default`    |                        1 |    0.175s | `/tmp/puni-task44-r5/unknown-container-object-default.log`    |
| `container-raw-object`                |                        1 |     4.45s | `/tmp/puni-task44-r5/container-raw-object.log`                |
| `container-identity-copy`             |                        1 |    4.412s | `/tmp/puni-task44-r5/container-identity-copy.log`             |
| `version3-transient-set`              |                        1 |    4.177s | `/tmp/puni-task44-r5/version3-transient-set.log`              |
| `version3-in-historical-cohort`       |                        1 |    4.026s | `/tmp/puni-task44-r5/version3-in-historical-cohort.log`       |

### Final production source hashes

These identify the implementation with adjacent proof comments. The private implementer report pins the eventual normal source commit; this table avoids a self-referential commit hash.

| File                                            | SHA256                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `tools/tool-fleet/src/image-identity.ts`        | `c2aafbcba29e0664db36bb2c49f4b726b8ac1ece8edffd3d85cda48606d984b9` |
| `tools/tool-fleet/src/docker-image-identity.ts` | `55928cb4ca8d3fae873d8998828f943ede6366f1ef060d4df62b951f23348cb3` |
| `tools/tool-fleet/src/contracts.ts`             | `ae7f8a81435f43d7542606394394c28ec990fdf1517aa9c2f92800f311f65ac6` |
| `tools/tool-fleet/src/creation-resources.ts`    | `efd45981a8f0df4117bc763c3840993a4e41e7a75ff5dc311daff4e435486bcb` |
| `tools/tool-fleet/src/k3d-creation.ts`          | `22d8fa359369e3144cf73a2a1e7543f27c20df8841ec89b3fdb4541c8209df1e` |
| `tools/tool-fleet/src/k3d-helper-images.ts`     | `55c90d1089bd34aea8559b971346762bb75246d18db3550b12e35d484f83d52b` |
| `tools/tool-fleet/src/k3d-lab.ts`               | `30dac4c47670d283a3fb483185f8cf770ca194872d24f1014119078eaf68e357` |
| `tools/tool-fleet/src/k3d-resource-runtime.ts`  | `0da71ecfbc348e671a0803f8fed3c577d646498b8196c86ad37286b690208a46` |

### Scope and remaining acceptance

No owning workload input, executable image reference, source lock, creation name, memory floor or lifecycle authority changed. Reuse immutable `ff0b0208bc426ad8bc2a4896f15a90f34eb97b89` workload capture; no canonical/charts rerender was run. Full Fleet/Nx/application/browser gates, CI, secret/migration CI checks, SSH/hosts/Docker/pulls/saves/images and provider components were intentionally outside this source release and were not run. Prior CI for another revision is not evidence for this implementation. Final named-file formatting, diff and strict OpenSpec outputs are recorded below after report generation.

Independent Task44 source review remains controller-owned and pending. Exact selected-helper and nonhelper provider projections, classic v3 support, actual helper inspection/deletion races and complete physical/runtime image costs remain unverified here. Full3.1, original canonical4of11 milestones, host admission, authenticated Flux/Kubernetes/CNI/Pod/storage evidence, stored signals/views, isolation, history/recovery and live dev convergence remain open. Controller Task45/46 evidence is outside this implementer's claimed verification.

Final Task44 check receipts: final test noEmit after the exact protocol fixture refinement exited0 in1.66s; final ESLint for that sole changed fixture exited0 in2.85s. The14-file scoped lint previously passed in5.79s and production noEmit in1.58s. Named-file Prettier check passed; `openspec validate observability-environment-parity --strict --json` reported1valid/0failed/0issues (17ms); `git diff --check` passed. `git diff --exit-code e362561bb90a6071ee8f1a3aeb10a537fe0c9365 -- infra deploy tools/tool-fleet/src/fixtures/k3d-creation-v1.json` exited0, confirming unchanged tracked owning inputs and authentic v1 bytes. These commands ran locally in the authorized isolated source worktree; no host gate or source publication was performed.

## Receiver log artifact closure and current source image joins — 2026-10-28

Task45 closes Task43's missing maximum/NUL stdout artifact without replaying its ten-case corpus. The recorder opens exclusive binary files before HTTP, flushes/fsyncs bounded chunks, separates evidence from disposable scratch, and uses successful structured full-ID/owner queries for absence. Actual local pipe controls survived an injected cleanup exception; persistence-only and overflow-guard removals failed their assertions, corrupt export refused, restoration passed. Parent reviewed the complete 365-line runner and rehashed all 86 frozen preparation files. Runner SHA256 `3bf587565cfdad2b068991022c69aeeba15d682da6012e9874e53e1b340571ea` embeds the unchanged ff0b executable. An explicit root release amended the earlier caps solely for one missing observation: four sequential components/thirteen requests total across Task43/45, never concurrent components. Previous failed attempts and limitations above remain unchanged.

Actual command: `timeout --signal=TERM --kill-after=10s 65s ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 h3mon 'python3 - --execute 11c2c10bb27bed53f0f70a2b' < /tmp/puni-task45-receiver/final-runner.py`; root session29045 exited0. Fresh preflight retained the same daemon/profile/cache and 13 existing IDs, with 12,508,254,208B available memory; tiny component guards do not admit the whole lab. One distinct 65536 B opaque resolved body produced HTTP 200/ok, 65573 B timestamped history and **exact 65552 B stdout**, including NUL/non-UTF8/trailing whitespace; stderr 0 B, no faults/OOM, 6.637 seconds. Stdout SHA256 `bde2e61e18cfb80c71e89efc11dc8ea673ccd2eb0515a74c1352b0fa2e173200`. The component kept 32 MiB/100m/nonroot/read-only-root/caps0/NNP/default-seccomp/log-driver-none. Owned container `337e15c500351a6eb22ee898a3ab1f33f5764041aa4841e23016ff1fab73ecdd`, observed PID and scratch were removed; all 13 pre-existing running IDs matched afterward. No image pull/save/prune occurred.

Independent `--export` session33454 exited0. Local rereads matched all 9 files/305399 B against manifest `907afed8fb55267bd2fe184386e88ba628aae938a6606ea96e799000a8c2daae`; only then `--purge` with that exact digest removed the owned remote evidence directory, session73416 exit0. Raw files remain 0400 under `/tmp/puni-task45-receiver/live-retained/`. `live-evidence-manifest.json` is 3277 B/SHA256 `adc303f70cfce5ee60249bd6baa7ee835dbed24e476f197bfc5030a1f89bc3de`, binding 16 original artifacts/306910 B. Parent independently checked exact body/history/stdout, response, faults, duration, structured cleanup and hashes. This completes pinned receiver component evidence; Kubernetes/Flux/transport/resource enforcement and common-stack acceptance remain open.

Task46 independently joins all 32 historical image identities to 55 explicit selections in the **frozen ff0b declaration**, including both source-selected helper child manifests; measurement provenance remains historical. Parent rehashed 7 artifacts, all 101 retained input identities and 8 immutable Git sources, then recomputed 150 unique streams/228 expanded references. Unique compressed/decoded totals are 2,830,267,399/7,571,629,056B; one expansion per image is 2,931,662,498/7,841,299,968B. Config-bound Volumes declarations establish no actual mounts. Facts `/tmp/puni-task46-current-image-join/facts.json` are 450524 B/SHA256 `693fddede14252dcd939529fba5c90e870f310acccdff97a3e47950b67a323bf`. Actual command `bun /tmp/puni-task46-current-image-join/join.mjs` exited0; an initial missing bootstrap/policy-frame map entry was corrected and its failed script receipt retained. No payload, fetch, render, production test or network/runtime operation ran.

Unknown closure remains explicit: 24 CR container roles omit image fields; seven null-image obligations are not invented containers. The unselected admission-webhook pin lacks an executable occurrence and retained measurement. Bundled/system/effective operator images, runtime platform/lifecycle/concurrency/placement and physical cache/copy/unpack/writable costs remain unresolved. These stream subtotals do not establish admission or a hardware purchase specification.

Preservation after Task43 and before Task45: three bounded authenticated backend queries at 02:18:37UTC reverified original cf6d8ead baseline log/two trace fingerprints plus 18 metric samples/6 scrape times. The 02:18:36UTC Compose checkpoint reported fresh/complete application/storage, all three signal missing counts 0, age 9522 ms. These are timestamped transitional Compose observations, not migration/rollback/Kubernetes acceptance. Frozen private receipts: 987 B/SHA256 `13a164ea8d6fc0267874e5d2345e7652f67e8315b965e9dcce755ad2085e6406` and 757 B/SHA256 `276b72dc50df8777505d79596366379360d281f0911f826268e9046732f82a88`. No route/store/service configuration changed.

Published-e362 infra CI 40617261332 completed successfully (Fleet 122582556106; generic K3s 122587957016), and stable pixels 122588675712 passed. Main 40617262821 workspace 122582684909/Twilight 122582684959 were still running at the latest observation. These checks belong to e362, not subsequent Task44 source. Tool Wiki remains unprovisioned/uncertified. No full h2 gate, final merge, production activation or persistent Secret change is claimed. Task44 independent review and actual helper/nonhelper adapter corroboration remain separate steps.

## Task44 independent source review — 2026-10-28

Fresh independent specification and quality review approved the complete two-commit source range `e362561bb90a6071ee8f1a3aeb10a537fe0c9365..e63541ebfee29cf7eca3749293dad8d73bbc1d73`, with no critical, important or minor finding. The reviewer read the immutable full diff and binding intent rather than rerunning passing tests or proof batches. Parent read the complete review, independently matched all eight committed production source hashes, and checked all 37 retained fault logs against their 44 behavioral assertion failures. The parent's first log summarizer expected only Bun expect assertions; a legitimate Node AssertionError required correcting that inspection predicate, with no source/test/proof rerun. Review receipt SHA256 is `dda221827863a7499135451eddb0a48f11c69f7932ee329f8f873cb11058083a`. Actual helper/nonhelper projection compatibility, helper races, classic-store v3 support, complete capacity and Kubernetes/observability acceptance remain explicitly outside this source approval.

The published-e362 Twilight CI job122582684959 completed successfully at02:49:13UTC after59m52s. Its workspace job122582684909 was still running at the latest observation. This prior-head result does not certify the new source commit.

## Actual helper image-platform finding and Task48 intent — 2026-10-28

The existing dev goal authorized two exact public helper cache additions, one attempt each, after same-daemon/profile/13-ID/capacity preflight. Frozen Task45 file recorder SHA256 `3bf587565cfdad2b068991022c69aeeba15d682da6012e9874e53e1b340571ea` captured bytes before assertions. Root pull sessions7761 and65591 exited0: serverlb3.924s/1620B stdout; tools3.030s/801B stdout; both stderr0 and no capture faults. Exact references were `ghcr.io/k3d-io/k3d-proxy@sha256:9181bb55f3c04c86510af3526dda86baa9abc389ef988a3c4bb4879b32d8c21c` and `ghcr.io/k3d-io/k3d-tools@sha256:f18c1e21aba123fe6ff315c514a0feffc005f587aa3db773e89489c2118842dd`. No repull/save/prune/container/cluster/Secret action occurred. Root release and raw files are under `/tmp/puni-task47-helper-pulls-20261028/`. Declared content totals40,013,014 compressed/97,217,536 decoded bytes are historical content facts, not enforced network quotas or isolated physical allocation. Command deadlines, bounded capture and measured headroom were the explicit tiny-experiment limits; whole-lab floors/admission remain unchanged.

Both normal and platform-selected helpers return manifest descriptors without platform, while native typed CLI fields explicitly report Linux/amd64/empty variant. Descriptor sizes are2753/1052. Four actual projections plus same-daemon/profile/13-ID/headroom evidence are retained in `both-native-postflight.stdout`, SHA256 `54588f310c44cf58cd5202c2bdd3ceafe48f4e7fdfb165240440aab968611972`, captured04:01:11UTC: available memory12,520,071,168B/free129,791,172,608B. Filesystem-used increase105,582,592B versus preflight is a shared-filesystem delta with possible concurrent writers, not isolated image cost or deduplication credit. All13 existing running IDs matched. No helper container has started.

A retained-real local invocation of immutable e635 `inspectDockerImage` expected successful binding and failed at missing descriptor platform after5/5 exact replay callbacks,83ms/exit1. Raw RED SHA256 `bc656356f6dddaf4f6cb9c989f107301d701484c966ce1e0db9bb705338384ed`; replay input SHA256 `9fc4c307ef3cfc94f56f5cb9040a22b7dc3e467813637e5d05da6f616aede235`, under `/tmp/puni-task48-manifest-platform-shape/`. This is a real production function with synthetic transport replay of actual bytes, not live creation. Two accidental Bun package-script dispatches failed immediately with absent Nx and ran no tests; they are setup failures, not REDs. The direct absolute script invocation produced the sole behavioral RED.

The first combined Variant projection failed because it mixed JSON-map field names with native fields; the initial wrapper did not expose the child CLI stderr. A separate safe diagnostic proved client/server29.7.2 and actual empty Variant. Native `.ID`/`.Variant`/`.Config.Volumes` formatting works together. One diagnostic omitted its own final JSON brace after valid field output; its JSON parse failure was retained and corrected, not credited as provider evidence. Original failures remain under `both-postflight.*`, `variant-diagnostic.*` and `template-boundary.*`; the final native projection above is complete and validated. No variant value was defaulted.

The read-only Task48 shape report SHA256 `1fa3025134e2f2d4fed30da1bcf63e8eb4b7f7f715de9131afadc55768909997` records primary-source boundaries and explicit provider4/outer3 versioning. Automatic approval review rejected the worker's private report copy as a forbidden spec edit. Parent verified the destination is Git-ignored private evidence and, under its authorized evidence-writer role, copied the exact report successfully; no user confirmation or access bypass occurred. Report and current intent precede implementation. Actual source fix/review/provider component, complete budget, Kubernetes/storage/CNI, stored signals/views/isolation/history/recovery and live convergence remain unverified.

## Task49 — observed image-platform provenance and retained provider formats (2026-10-28)

Review BASE is `5ae333bf411b8d3df08c0bba00ebed423531b4dd`; the actual clean implementation start was committed four-artifact Task48 intent `2ee3c4b5ef188c6cc2216b8c726a3fce359216c3`. The approved Task48 shape/addendum and the existing actual native helper witnesses supplied the contract. The original83ms/exit1 retained-real production RED and its `bc656356f6dddaf4f6cb9c989f107301d701484c966ce1e0db9bb705338384ed` receipt remain untouched and were not rerun. No image/provider/registry/host/CI operation or source47/private299-file driver mutation occurred in this implementation.

### Implementation and preserved boundaries

`docker-image-platform.ts` is the permitted small provider-specific sibling: it retains closed safe descriptor/platform/variant presence states and explicit observed image OS/architecture/variant. Image manifests normalize from those observed image fields. Present descriptor platform must agree, and supported variants must be explicitly empty. Missing/null/malformed image evidence or descriptor platform refuses; genuine omitted descriptor platform remains represented as absent. Container normalization is separate and continues requiring descriptor platform; no binding/request inference was enabled.

New image output uses the corroborated native safe template exactly:

```text
{"id":{{json .ID}},"descriptor":{{json .Descriptor}},"os":{{json .Os}},"arch":{{json .Architecture}},"variant":{{json .Variant}},"repoDigests":{{json .RepoDigests}},"volumes":{{json .Config.Volumes}}}
```

Bindings and observations now emit closed adapter4 inside unchanged outer3. Bindings retain mandatory normal/selected inspections and image-config-fields origin. Container records retain the safe raw manifest and container-descriptor origin. Readers recompute normalized facts from raw observations before comparing source/reference/platform/daemon/content. The original adapter3 schema objects and validator branch remain explicit historical alternatives, without reconstructed raw fields. Mixed3/4 pairs/cohorts, unknown versions and omitted provenance refuse; new witness/forward closure/sealing require4. Original outer1/2 teardown and outer3 original-Git/hash/Toolchain validation remain unchanged. Core `image-identity.ts`, Toolchain, pins, graph, execution references, volumes/lifecycle/cleanup/authority/floors and owning workload inputs are unchanged.

The new actual-helper image fixtures use the provided native four-row observations: both selected helper manifests omit descriptor platform while explicit image fields report Linux/amd64/empty Variant; sizes2753/1052. Their daemon transport is synthetic. Generic protocol/CLI fixtures explicitly declare synthetic variants. In particular, the Task43 BusyBox identity/descriptor fixture does not corroborate its newly declared synthetic Variant, and no old actual receipt was supplied with a fabricated empty field. Old adapter3 positive fixtures are fresh explicit synthetic e635 producer-contract records, not stripped adapter4 records or rewritten v1/v2 bytes. No authentic old3 receipt is known. Missing-container-platform remains a labeled synthetic negative; actual helper-container fields are still unobserved here.

### TDD and focused verification

- Original Task48 retained-real RED was reused without execution. New Task49 image/provenance tests initially produced3fail/13pass/162ms (`/tmp/task49-image-red.log`): the old closed image projection rejected the newly explicit Variant field. Those13 masked negative passes are not new safety proofs.
- The new actual forward-witness test initially produced0pass/1fail/387ms (`/tmp/task49-forward-red.log`): a complete synthetic original3 plan incorrectly reached retained forward witness creation. After the format check, the case passed.
- Final Task49-only command: `bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/docker-image-platform.test.ts tools/tool-fleet/src/docker-image-identity.test.ts tools/tool-fleet/src/k3d-creation.test.ts tools/tool-fleet/src/k3d-resource-runtime.test.ts tools/tool-fleet/src/k3d-resource-caller.test.ts --test-name-pattern 'Task49'`:46pass/0fail/202filtered/110assertions/18.86s, `/tmp/task49-final-tests.log`. It covers image absence/presence/variants/contradictions, original3/new4 roundtrips, strict container platform, raw recomputation, pair/cohort versions, source joins, callback/permanent/transient/import/closure/sealed readers and forward refusal.
- Actual controlled CLI roundtrip uses fake Docker/k3d processes, two serial transient callbacks, creator-bound object-store import, permanent snapshots and retained down. Its first direct run hit Bun's default5second case deadline and the harness killed its down child (exit143); that is a runner-budget failure, not a behavioral RED. The repository target's normal30second timeout fixed the invocation; only the failed case was rerun and passed5.52s (`/tmp/task49-cli-roundtrip-green.log`). Final covering run passed it again after changed-guard restoration.
- Selected existing compatibility: `bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/k3d-resource-caller.test.ts --test-name-pattern 'Task37 authentic baseline|Task44 synthetic version2|Task37 ordinary up'`:5pass/0fail/89filtered/57assertions/5.69s, `/tmp/task49-final-compat.log`. Authentic v1 bytes remain unchanged; synthetic v2 still validates config equality, rejects mixed/config drift and tears down without Git. Explicit original3 teardown is covered separately by new schema/observation roundtrip and complete synthetic closure/cohort tests that compare original bytes before/after reads.
- Changed native Volumes wiring only: `bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/k3d-resource-caller.test.ts --test-name-pattern 'refuses temporary-anonymous before direct'`:1pass/0fail/1.81s after its new projection dependency fault/byte restoration, `/tmp/task49-native-volume-restored.log`. The existing caller still refuses declared anonymous tools stores before creation.
- Final scoped production `bunx tsc --project tools/tool-fleet/tsconfig.lib.json --noEmit`:exit0/1.56s. Final scoped spec equivalent:exit0/1.67s after correcting one fixture literal-narrowing error; only the affected normal-ID case was rerun (1pass/172ms, `/tmp/task49-final-normal-id.log`). All11 changed TypeScript files passed scoped ESLint in5.30s; final sole-fixture ESLint after that type-only edit passed2.85s. Logs: `/tmp/task49-final-{lib,spec,lint,fixture-lint}.log`. Earlier import-sort/void-arrow lint errors were fixed. No full Fleet/Nx/app/browser suite or old proof matrix was run.

### Changed safety dependencies

21 effective individually scoped faults produced 22 behavioral failing-test observations in 15.882s cumulative command wall time. Every fault restored the exact saved source in `finally` and compared bytes; `/tmp/puni-task49-r5/summary.json` retains exact command arrays, classifications, log paths and restoration hashes. Adjacent `Proof:` comments name the observed failures. Guard removals, schema widening and source/default substitutions below are distinct forms of evidence; no setup failure is counted.

A removal of a newly added own-undefined platform check left its negative passing because the raw ArkType boundary already rejected that input. It is recorded as masked/ineffective (`explicit-platform-absence.log`, exit0), not an R5 bypass; the redundant new contextual check was removed while schema refusal stayed. A source-match ambiguity before the container-default mutation was a setup error; source restored and only the previously unrun faults continued. A redundant new raw normal/selected check was also omitted in favor of the preserved normalized root/child join. Neither cleanup changes the declared contract. No passed proof was replayed and no old37/44/144/21 batch ran. The native Volumes case faults only the changed formatter dependency, not the previously proved unchanged caller guard.

| Fault                                  | Injection kind                  | Behavioral failing tests | Wall time | Raw receipt                                                    |
| -------------------------------------- | ------------------------------- | -----------------------: | --------: | -------------------------------------------------------------- |
| `observed-v-requested`                 | requested-field-substitution    |                        1 |    0.186s | `/tmp/puni-task49-r5/observed-v-requested.log`                 |
| `image-variant`                        | guard-removal                   |                        1 |    0.193s | `/tmp/puni-task49-r5/image-variant.log`                        |
| `descriptor-agreement`                 | guard-removal                   |                        2 |    0.203s | `/tmp/puni-task49-r5/descriptor-agreement.log`                 |
| `normal-object-id`                     | guard-removal                   |                        1 |    0.205s | `/tmp/puni-task49-r5/normal-object-id.log`                     |
| `variant-state`                        | schema-widening                 |                        1 |    0.148s | `/tmp/puni-task49-r5/variant-state.log`                        |
| `platform-state`                       | schema-widening                 |                        1 |    0.191s | `/tmp/puni-task49-r5/platform-state.log`                       |
| `normal-selected-source`               | normal-witness-substitution     |                        1 |    0.187s | `/tmp/puni-task49-r5/normal-selected-source.log`               |
| `retained-raw-copy-join`               | guard-removal                   |                        1 |    0.192s | `/tmp/puni-task49-r5/retained-raw-copy-join.log`               |
| `retained-raw-recompute`               | revalidation-dependency-removal |                        1 |    4.494s | `/tmp/puni-task49-r5/retained-raw-recompute.log`               |
| `binding-origin`                       | schema-widening                 |                        1 |    0.187s | `/tmp/puni-task49-r5/binding-origin.log`                       |
| `container-origin`                     | schema-widening                 |                        1 |    0.191s | `/tmp/puni-task49-r5/container-origin.log`                     |
| `unknown-provider-format`              | schema-widening                 |                        1 |    0.181s | `/tmp/puni-task49-r5/unknown-provider-format.log`              |
| `container-platform-default`           | container-platform-default      |                        1 |    0.185s | `/tmp/puni-task49-r5/container-platform-default.log`           |
| `container-raw-join`                   | guard-removal                   |                        1 |    0.205s | `/tmp/puni-task49-r5/container-raw-join.log`                   |
| `mixed-provider-pair`                  | guard-removal                   |                        1 |    0.185s | `/tmp/puni-task49-r5/mixed-provider-pair.log`                  |
| `mixed-provider-cohort`                | guard-removal                   |                        1 |    4.586s | `/tmp/puni-task49-r5/mixed-provider-cohort.log`                |
| `forward-witness-provider`             | guard-removal                   |                        1 |    0.374s | `/tmp/puni-task49-r5/forward-witness-provider.log`             |
| `forward-sealer-provider`              | guard-removal                   |                        1 |    0.349s | `/tmp/puni-task49-r5/forward-sealer-provider.log`              |
| `missing-image-provenance-default`     | normalized-facts-default        |                        1 |    0.181s | `/tmp/puni-task49-r5/missing-image-provenance-default.log`     |
| `missing-container-provenance-default` | binding-manifest-default        |                        1 |    0.186s | `/tmp/puni-task49-r5/missing-container-provenance-default.log` |
| `native-volumes-projection`            | native-field-dependency-default |                        1 |    3.073s | `/tmp/puni-task49-r5/native-volumes-projection.log`            |

### Production source hashes

| File                                            | SHA256                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `tools/tool-fleet/src/docker-image-platform.ts` | `82f2be37887fe679c59b89b485510fef8f95522e4167d61adc21205e042ffaf8` |
| `tools/tool-fleet/src/docker-image-identity.ts` | `e86f31007d3c351108dd2dbb2aa71629967ec9006fbf535f2dce2ed900e1b4ac` |
| `tools/tool-fleet/src/creation-resources.ts`    | `4c0c0a602f09a41eaccce9ea78382ba553f7d0ed1dd77bcc575cd90616d584c3` |
| `tools/tool-fleet/src/k3d-creation.ts`          | `bbac5464ae03a35def8265fe054a6f026ba9e49e85cad403b3332a510849c0b0` |
| `tools/tool-fleet/src/k3d-resource-runtime.ts`  | `519248b07f6ea2ca477668b4ca0f86f7b91c1f407edff8eff94464c142c24c14` |

### Scope, checks and outstanding acceptance

Source self-review checked the full production diff, raw-to-normalized versus copy equality, strict old/new provider discrimination, forward versus retained policy and unchanged source/container/mount/network/volume/lifecycle/authority boundaries. `git diff --exit-code 5ae333bf411b8d3df08c0bba00ebed423531b4dd -- tools/tool-fleet/src/image-identity.ts tools/tool-fleet/src/contracts.ts infra deploy tools/tool-fleet/src/fixtures/k3d-creation-v1.json` passed, confirming those tracked core/source/workload/authentic-legacy inputs unchanged. Final named-file format/strict OpenSpec/diff and normal commit receipts follow below after report generation.

No new owning workload source means immutableff0b capture remains applicable; no canonical/charts rerender was performed. Full Fleet/Nx/application/browser/CI/host gates, image pulls/saves/registry/probes/imports/provider runtime and changes to the frozen source47 driver were intentionally outside this source release and not run. The controlled test's object-store import is a fake CLI seam, not a live import. Prior source/CI success is not borrowed for this revision.

Independent source review remains controller-owned and pending. The controller must rebind the private component to approved immutable source/dependencies before actual selected-helper/nonhelper corroboration. Actual helper container descriptor behavior, races, broader runtime/physical capacity, full3.1/canonical4of11 milestones, Kubernetes/Flux/CNI/storage, stored signals/views/isolation/history/recovery and live convergence remain open. This fix supplies source compatibility and provenance, not runtime admission or hardware sizing.

Final Task49 structural receipts: named-file Prettier passed; strict `openspec validate observability-environment-parity --strict --json` returned1valid/0failed/0issues (17ms); `git diff --check` passed. Five final production hashes below the Task49 section were rechecked before staging. No gate/publication/runtime verification is claimed.

## Task49 independent source review and bounded capacity observations — 2026-10-28

Task49 committed normally at `96a0033618e8be00b551370f479ac637e58f8a1f` and handed off a clean worktree with no pending sessions. Independent specification/quality review covered the full actual `5ae333bf411b8d3df08c0bba00ebed423531b4dd` → `96a0033618e8be00b551370f479ac637e58f8a1f` fix range, including prior intent `2ee3c4b5e`; it did not replay the earlier Task44 review or passed tests. All four runtime findings were addressed: observed image-platform omission, closed adapter4 provenance with exact retained compatibility, mandatory container platform and preserved joins, and actual production-caller propagation with truthful fixture meanings. No new Critical/Important breakage or out-of-scope finding was reported. Review is source-only; actual helper-container and full runtime/capacity acceptance remain open.

Parent independently matched all five final production hashes, inspected all21 new fault logs/22 behavioral failures and the final46-case/5-compatibility/static outputs. The proof-stage adapter restoration hash precedes final formatting; the final source hash matches the committed Task49 table. The independent reviewer inspected code/test/report evidence without duplicate test or fault execution. Private report `task-49-platform-review.md` SHA256 `a1e61b82d9a5bd066e990c6403c7aec4e75121b182524b30aa80c350a8d965fe`; exact review package114276B covers both intent and implementation commits.

### Task50 — accepted Docker image counters and preserved failed observations

Read-only fixed image metadata measurements on h3mon completed at `2026-10-28T05:03:00.907634Z` using the existing authenticated Docker CLI stdio transport, with no pull or container mutation command. The successful separately released operator exited0 in1.823536s wall/0.471684s remote; both fixed API1.55 GETs returned200/chunked, complete bounded captures and empty child/SSH stderr. Pre/post daemon `91cee18b-c061-4279-a311-1ac86ca3dd97`, Engine29.7.2/linux/x86_64/overlayfs/containerd profile and runtime components matched. Actual containerd was `v2.3.3`, commit `aad11006b869517fcd3009450b6f82da282e1a9b`. Safe packet7549B SHA256 `2f6aaae48ec3fc6871affc0cde02f0ee8ac60209355c2947a51e00abe0766b2d`; final14-entry evidence manifest SHA256 `4ea5ca2ea44d848313c275e3cad3519e0a6744f74c7ca9de27af04b367ef7b8d` was independently rehashed. Artifacts and all prior releases remain under `/tmp/puni-task50-docker-disk-usage/`.

| Selected helper manifest                                                           | Logical content bytes | Reported snapshot blocks bytes | Mixed total bytes |
| ---------------------------------------------------------------------------------- | --------------------: | -----------------------------: | ----------------: |
| serverlb `sha256:9181bb55f3c04c86510af3526dda86baa9abc389ef988a3c4bb4879b32d8c21c` |              28865411 |                       77099008 |         105964419 |
| tools `sha256:f18c1e21aba123fe6ff315c514a0feffc005f587aa3db773e89489c2118842dd`    |              11166501 |                       23773184 |          34939685 |

Both manifests were available images with exact ID/descriptor joins and linux/amd64 platform. Both API `Containers` fields were explicitly null, preserved with a derived nil-slice reference count0; absence would remain unknown. Top-level API `Variant` was explicitly absent, distinct from the earlier CLI projection's observed empty string. Content counts logical descriptors including metadata/config/layers, not merely historical compressed layer payload. Snapshot usage reports the traced chain's block accounting, cached for committed snapshots. Mixed totals combine those different counters. None supplies exact whole physical allocation, marginal pull cost, exclusive ownership or deduplication credit: `completePhysical=false`. Inspect may cache local verification metadata; zero backend writes is not claimed. Host/coexistence/cold-copy/recovery/storage admission and upgrade sizing remain incomplete.

All three attempts are retained: original first GET returned header-only499 despite transport exit0; its operator closed stdin early. Exact CLI/Go/Moby lifecycle inspection and a new pipe-only production-capture regression identified that defect, with watched guard removal and restored bytes. The second release returned200 but refused the projection because its array-only container-reference assumption missed Go's valid nil-slice/null encoding; discarded raw bytes are not retrospectively claimed. The third accepted both requests after explicit null/array/absent handling. New changed-field regression covered ten malformed refusals and watched a widened guard fail. No old passing controls were replayed. Totals are three root attempts, four explicit image GETs and twelve pre/post metadata CLI commands; these are not complete network-request or transferred-byte counts. All requests retained unchanged time/byte/privacy limits. No raw Config/Env/private payload was persisted.

### Task51 — published workspace cancellation and delivery timing limits

Published `5ae333bf411b8d3df08c0bba00ebed423531b4dd` [CI run40624051664](https://github.com/Prosperous-Unification/puni-00/actions/runs/40624051664), workspace job122604976829, is terminal canceled after90m21s. Its first Nx invocation completed all140 test/typecheck/build tasks in83m15s with0cache hits; cancellation occurred during subsequent affected lint, with28 selected lint targets lacking a start header. The last printed Dash header does not establish the active process or a hang. The90-minute whole-job allowance strongly supports budget exhaustion, but no explicit provider timeout annotation or per-target lint completion/process evidence was retained. Burokrat source lint and later workspace security/migration/OpenSpec checks were not reached and receive no credit. Other published5ae checks passed; this is no gate result for96a.

The completed critical path was WBS backend testing36m48.68s; frontend29m55.32s, Fleet19m04.35s and observability-stack65.09s also completed. These durations overlap. The selector widened to all modules because deletion/rename lacked a previous dependency graph, matching its conservative contract. Read-only partition diagnosis established that affected-mode Dash lint runs in workspace, not twice; removing it would drop required coverage. No directly related observability performance defect or safe partition repair was proven. No workflow/timeout/parallelism/cache/test-policy change or CI rerun was made. Next independently required CI can supply monotonic per-target lint completion/process evidence; a whole rerun solely for diagnosis is unwarranted.

Retained raw workspace log260757B SHA256 `1bf91d294dbf18e84a76ffb17dfb686b9d123c0ffdedc26ee74ce31ddc2a6528`; expanded Nx log4260614B SHA256 `39d59b5cdedebcaedd0993a36ca7dc7600d960314497ebe933809b553e1f349f`; original artifact12792715151 ZIP572931B SHA256 `95fccd2e3a9eda887228d2a6b5ea8ae23ec5a06eefe1beed28f2df601eaa9ba6`. Reports/logs remain locally retained; no download or passing-suite repetition was needed for this diagnosis.

Full task3.1, actual helper/nonhelper corroboration, closed host capacity, authenticated Flux/Kubernetes/effective Pods/CNI/storage, all stored signals/operator views/isolation/history/recovery and live convergence remain open. Source/component evidence does not authorize final merge, production activation, persistent secrets, storage retirement or hardware provisioning.

## Task52 — actual adapter4 helper and index corroboration (2026-10-28)

The bounded provider experiment passed against independently approved immutable source `96a0033618e8be00b551370f479ac637e58f8a1f`. Root reviewed the minimal four-line executable rebinding, verified all28 package entries,357 frozen source/dependency files/modes and seven exact Git exports, and compared unchanged execution files with the previously reviewed package. Original e635/runtime/Task47 evidence stayed unchanged. Metadata resolution succeeded; absent release refused before adapter import. Frozen package SHA256 `c150f7f1f649609d4eaf2b69304144be4670af49c58080f05277cd741540ea1d`; source freeze `c5ff28e0f82f6a8b824f8f7f26c52b84be65a501011c8b902a649c03840517c3`.

Root separately released owner `174cf0936675a5b7b19a4960`, release SHA256 `dc49be7877339630512214a4d4e43ddfdb5b549e90d3b8d4d30a51fed9fa8c69`. Ruling: allow the unproven `/bin/sleep` path solely as an inert executable-availability probe; a failed start would require recorded failure/owned cleanup and stop remaining roles, with no alternate entrypoint or helper-functionality claim. Cost if wrong was a bounded failed component, not admission. Exact actual command:

```sh
/home/df/.bun/bin/bun --no-install --no-env-file --cwd /tmp/puni-task52-96a-source-20261028 --config=/tmp/puni-task52-96a-source-20261028/runtime.toml /tmp/puni-task52-provider-image/run-reviewed.ts /tmp/puni-task52-provider-image/root-release.json
```

It exited0 at `2026-10-28T05:15:22.579154Z`, wall47.881594s, stdout154B/stderr0. The final observed operator duration47.588563s includes evidence export and owned SSH-control cleanup, below120s. Three containers ran serially, at most one live, and all three actual adapter4 bindings and observations passed the real production validators.

| Selection                   | Image object role             | Runtime child descriptor                        | Observed running envelope |
| --------------------------- | ----------------------------- | ----------------------------------------------- | ------------------------: |
| serverlb                    | Selected manifest `9181bb55…` | Same OCI manifest,2753B/Linux-amd64             |                 4.889713s |
| tools                       | Selected manifest `f18c1e21…` | Same OCI manifest,1052B/Linux-amd64             |                 4.772378s |
| cached BusyBox networkProbe | Index `73aaf090…`             | Distinct OCI child `b7f3d86d…`,610B/Linux-amd64 |                 5.163409s |

Both helper image descriptors omit platform in normal/selected inspection, while explicit image fields supply observed Linux/amd64/empty Variant with image-config-fields provenance. Their actual container descriptors supply mandatory platform with container-descriptor provenance. BusyBox's raw container `.Image` remains the index, distinct from its selected child descriptor; neither is relabeled as config. Helper config remains source-inferred, and nonhelper config remains unobserved by this adapter. No missing container-platform fallback was enabled.

All15 policy projections match UID1000:1000/read-only/capDropALL/no added caps/NNP/networknone/lognone/100mCPU/32Mi memory/zero extra swap/pids16/no privilege/TTY/stdin/mounts and the inert sleep command. Preflight confirmed builtin default seccomp. These are inspected configuration facts, not attack tests or peak-use measurements. Guarded stop/rm used only each full owned ID; structured full-ID and owner absence preceded subsequent creation. All three were deliberately stopped with `--time 1`, then observed exited/runningfalse/exit137 before removal; natural successful sleep completion is not claimed. The original13 running IDs matched at eight checkpoints, and cached-image identities matched across eight20-row captures. Parent independently checked those records, all15 policy projections and all actual bindings/raw descriptors. No pull/save/prune/alternate entrypoint, cluster or helper business function ran.

Exactly100 Docker calls and104 relay invocations plus one explicit control-exit SSH process were retained. All Docker/numbered relay receipts exit0 with empty stderr. Independent export retains409 files/115498 decoded bytes; each base64/size/hash/written local file was verified. Raw export209365B SHA256 `8cefc6554c3faf061281f1598d65ed0e148385324d7ca50e40578a8fbe36b2aa` differs from canonical parsed-export SHA256 `2302e9a2f6554357dfad72cba8d564bfc56b1627ea50f0d2f8d7404384eba723`, as required by the existing transport contract. Both hashes were checked. The owned control socket/directory is absent after explicit exit; its absence receipt binds owner/release. Remote evidence remains `/var/tmp/puni-task47-evidence-174cf0936675a5b7b19a4960`; no purge occurred.

All1275 original live files are retained0400. Complete actual evidence manifest `b049aa5e20aa1a896abf1d6272eb5a612b0b2d2c85900dbf79e9a20499ea5625` inventories1314 package/evidence files/1537267B, independently rehashed by parent. Actual report SHA256 `758a5cf7c623933b0b98bfc8741ecfe52688182f74aef3c387bb00b2df0fca0c`; package, source freeze and release identities remain unchanged. Exact100-call command arrays and all capture receipts are retained under `/tmp/puni-task52-provider-image/`. Local audit filename/path/ordinal setup mistakes were corrected using retained bytes; they were not component failures or production negative proofs, and no provider operation was repeated.

### Postcomponent retained-history preservation

At `2026-10-28T05:19:25.468465Z`, three bounded authenticated read-only HTTP queries through the existing SSH/tunnel reverified original baseline `cf6d8eadf5da6484cb2fa9b1071d7e575252cd338878732d791f9417541eaeba`: exact log and two trace fingerprints, all18 metric samples across six scrape times. Unchanged query script SHA256 `4e33d07d6c5f6bbbcd41c6757c3c6f543b5c19215f048a4a538bcf881e2e0e97` and embedded baseline were rechecked before execution; remote35s/local45s bounds remained. This requery exited0 in3.343101s/stderr0; receipt987B SHA256 `38ec3950223ad54fcea4beb0a0b4e8a7b79d27baf4cfa8275751f864842c6d25` is retained0400 beside the older private baselines. It proves timestamped premigration Compose history availability after the component, not a new fresh-health checkpoint, route switch, snapshot/restore, rollback or common Kubernetes acceptance.

Actual helper k3d functionality/races, whole fleet/host capacity/admission, effective Kubernetes/CNI/storage, full common-stack signal/operator-view/isolation/outage/history/recovery and live dev convergence remain open. No full gate, deployment or merge is claimed. Current published342d required CI is allowed to finish; this evidence commit is held locally to avoid a documentation-only head update restarting its still-required runtime work.

## Task53 — pinned finite CronJob syntax oracle prerequisite (2026-10-28)

Task42's parser prerequisite is now available privately; no TypeScript parser or CronJob capacity behavior was implemented. Go was absent from PATH/known locations. Exact official Go1.26.0 linux-amd64 archive66768540B SHA256 `aac1b08a0fb0c4e0a7c1555beb7b59180b05dfc5a3d62e40e9de90cd42f88235` was verified before extraction under `/tmp/puni-task53-cron-oracle/`; Kubernetes1.36.4's pinned robfig3.0.1 module/h1 identities were reused and `go mod verify` passed. All tool/cache/home/temp paths stayed inside that private directory, with local-only toolchain selection, telemetry off, no global installation and no repository task-runner change. Bun/Nx remain the repository task runners.

Private offline build `python3 /tmp/puni-task53-cron-oracle/command.py /tmp/puni-task53-cron-oracle/go/bin/go build -buildvcs=false -trimpath -o /tmp/puni-task53-cron-oracle/oracle .` exited0 in4.133486s. One finite337-case oracle batch exited0 in0.013954s; the passing corpus was not rerun. Its exact command is retained in command receipts and the private report. Parent rehashed all68 artifacts, checked all337 input/output IDs and read the report/comparison contract. Output SHA256 `16598ae6e670aca10e6f602144aaedcb6be1654cd267352acb56af894dfbf15a`; corpus `4680fec05474d8fab04b0775450e43222675bb3954b5b7b9ca5921da55032980`; evidence manifest `a3e06025f2f79919b9ecf635b253fbb428e545ff5ed76656e788c06131689521`; report `a3a9dabf644e083f4f25574fa01dc6db23f234bf855b25effa7c9e302aae37ad`. Setup DNS failure and initial automatic VCS-stamping build failure occurred before corpus execution and receive no behavioral-test credit.

Retained cases distinguish raw robfig acceptance/error/panic, a source-derived fresh Kubernetes schedule/timeZone validation projection, direct Go duration semantics and pinned-zone membership. The projection is not execution of the full Kubernetes validator. Five malformed TZ inputs produced raw parser panics, caught by the private harness; the exact pinned Kubernetes panic-recovery helper is separately cited. Fractional-duration behavior uses float64 scaling/truncation, so a bigint-only rational replacement is not assumed equivalent. No recurrence/Next/DST engine ran.

The exact zone ZIP contains598 names. Actual Go lookup accepted `right/UTC` through host fallback despite its absence from that ZIP. Catalogue absence must remain outside pinned knowledge/unknown or unsupported, distinct from intrinsically malformed Kubernetes input; those host-dependent outcomes cannot become portable acceptance expectations. Oracle-process `TZ=UTC` does not observe controller timezone. Syntax acceptance stays separate from the narrowly supported declared UTC charging scenario.

The actual production TypeScript/native-prepass comparison, source-bound horizons/lifecycle accounting, four-artifact implementation intent, new production-path negative proofs, whole-attempt/runtime enforcement and full admission remain pending. This tool/corpus preparation closes only its prerequisite and does not grant creation or runtime authority. No infrastructure/provider/CI operation, old passing suite or proof replay occurred.

## Task54/55 intent checkpoint — 2026-10-28

Actual implementation BASE before intent is `088fd039b0638a376e9ae8dc7f73b31d4346f4ce`. No parser/horizon code exists yet. The independently retained Task53 oracle was inspected without execution; the fresh-source-only boundary and explicit timezone knowledge policy are recorded in the specification/design. Rehearsal horizon was resolved in CONTEXT.md before implementation. Intent retains the entire observability goal and its authorizations; source-only syntax/accounting cannot grant runtime or creation readiness. Exact intent structural checks and commit follow in the controller ledger before any implementer is released.

## Task54 — fresh CronJob calendar validation source slice (2026-10-28)

Actual review BASE is `088fd039b0638a376e9ae8dc7f73b31d4346f4ce`; intent/domain/spec/design/tasks/verify were committed together at `9cdb10041bde89afb327ec436fe17db4839f9e17` before code. Source commit `12219f5df1f213b3019f3f22123445d07feae0a5` contains only the bounded syntax/prepass slice. Independent source review remains pending. Task55 Job extraction, complete CronJob policy, horizons, ticks and retry slots remain unimplemented.
`readCronSchedule` is the fresh Kubernetes1.36.4 boundary over the reachable robfig3.0.1 validation branches; it rejects uppercase embedded TZ before parsing, retains original codepoints/descriptor origin and exact bigint masks/intervals. Its production `@every` dependency is `readCronDuration`, preserving Go1.26.0 float64 scaling/truncation and signed-int64 outcomes. `readCronTimeZone` retains absent/known/outside-catalogue states. The actual all-native prepass calls `readCronCalendar` once per CronJob, before native lifecycle derivation, and carries the typed calendar locally. Unknown zones retain `cronjob-time-zone-outside-catalogue` alongside `CronJob-lifecycle-unaccounted`; no bigint is serialized. Existing families, source-only inventory and false authorities are unchanged. Exact upstream MIT/BSD notices are in `docs/infra/observability-cron-licenses.md`; owning symbols and the fixture bind source versions/hashes.

### Independent fixture and finite coverage

The single Task53 Go run was read, never replayed, rebuilt or downloaded. `fixtures/cron-go1.26.0-robfig3.0.1-reference.json` retains all original corpus/reference objects, source hash provenance and a separately derived portable policy. Its337 IDs comprise236schedule,58duration and43zone operations across13categories. All source input values/codepoints and IDs are compared. Applicable masks compare as unsigned16-digit hex; every accepted direct duration and normalized interval delay compares exactly. Every accepted reachable interval also binds its exact nanoseconds to a retained direct-duration observation, not to a second candidate calculation. All598catalogue names are checked, and exact catalogue bytes are hash-checked.
Raw embedded-TZ acceptance, five raw panics and raw host lookup outcomes remain diagnostic. Fresh schedule expectations reject uppercase TZ regardless of raw acceptance. Portable timezone policy applies the pinned component/Local predicates plus independent catalogue membership; it deliberately does not turn a catalogue miss into universal Kubernetes invalidity. Outside-catalogue IDs are c267,c268,c286,c287,c310,c311,c329,c330. In particular right/UTC retains host-accepted diagnostics while the production adapter reports outside pinned knowledge. No host Intl, implicit UTC, runtime timezone equality, Next or DST engine is used.

| Retained input        | SHA256                                                             |
| --------------------- | ------------------------------------------------------------------ |
| `corpus.json`         | `4680fec05474d8fab04b0775450e43222675bb3954b5b7b9ca5921da55032980` |
| `output.json`         | `16598ae6e670aca10e6f602144aaedcb6be1654cd267352acb56af894dfbf15a` |
| `zone-catalogue.json` | `9c76a97bdff88983c7c9b70516d4a7c38aa8cd0cac2f176c6e8b967a80c09037` |
| `manifest.json`       | `a3e06025f2f79919b9ecf635b253fbb428e545ff5ed76656e788c06131689521` |
| `report.md`           | `a3a9dabf644e083f4f25574fa01dc6db23f234bf855b25effa7c9e302aae37ad` |

### Ordered TDD and scoped checks

Tests/reference inputs were written before implementation. Initial real `readRehearsalNativeCosts` RED:9passed/22failed; malformed late CronJobs returned incomplete inventories, earlier real ordinal claim collisions masked malformed calendars, and unknown zones lost their knowledge blocker. The real collision control passed. The parser-only first run failed at missing-module setup; that is explicitly not behavioral RED credit. Initial GREEN was345parser/reference tests plus31native tests; native coverage then grew to52tests for focused guard/proof coverage, including the float64-versus-rational int64 edge. Full raw stdout/stderr, command arrays, timestamps, exits and wall times are retained privately under `.superpowers/sdd/observability-environment-parity/task-54-*.json`.
All Bun tests use `--preload ./tools/test/scratch/preload.ts --timeout=30000`. Final exact commands and outcomes:

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Outcome                                                                             | Wall seconds |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -----------: |
| `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-cron-syntax.test.ts tools/tool-fleet/src/observability-native-cronjob.test.ts`                                                                                                                                                                                                                                                                                                    | 337 reference IDs plus calendar shape and native prepass controls;397passed/0failed |     0.897804 |
| `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 --test-name-pattern 'Job defaults preserve declared absence\|Job charges share init maximum\|DaemonSet legacy calls retain\|DaemonSet full two-node cohorts\|default StatefulSet lifecycle retains\|shared traversal exposes exact native' tools/tool-fleet/src/observability-native-job.test.ts tools/tool-fleet/src/observability-native-daemon.test.ts tools/tool-fleet/src/observability-native-ordinal.test.ts` | six selected other-family controls;6passed/275filtered/0failed                      |     1.166777 |
| `bunx tsc --noEmit -p tools/tool-fleet/tsconfig.lib.json`                                                                                                                                                                                                                                                                                                                                                                                                                                | production noEmit;exit0                                                             |     1.697165 |
| `bunx tsc --noEmit -p tools/tool-fleet/tsconfig.spec.json`                                                                                                                                                                                                                                                                                                                                                                                                                               | test noEmit after matcher typing correction;exit0                                   |     1.413798 |
| `bunx eslint tools/tool-fleet/src/observability-cron-duration.ts tools/tool-fleet/src/observability-cron-zone.ts tools/tool-fleet/src/observability-cron-syntax.ts tools/tool-fleet/src/observability-cron-syntax.test.ts tools/tool-fleet/src/observability-native-cronjob.test.ts tools/tool-fleet/src/observability-native-ordinal.ts`                                                                                                                                                | six changed TypeScript files;exit0                                                  |     4.243694 |
| `bunx --no-install openspec validate observability-environment-parity --strict --json`                                                                                                                                                                                                                                                                                                                                                                                                   | locked strict validation;1valid/0failed/0issues                                     |     1.048148 |
| `git diff --cached --check`                                                                                                                                                                                                                                                                                                                                                                                                                                                              | staged diff whitespace;exit0                                                        |     0.008922 |
| `git diff --exit-code 9cdb10041bde89afb327ec436fe17db4839f9e17 -- infra deploy package.json bun.lock`                                                                                                                                                                                                                                                                                                                                                                                    | owning infra/deploy/package/lock bytes unchanged;exit0                              |     0.008189 |

The six compatibility controls cover source-only traversal, default StatefulSet full-Pod/claim charges, DaemonSet legacy calls and full two-node cohorts, and Job defaults plus shared init/overhead/emptyDir normalization. No broad Fleet suite ran. Initial lint found interface/import/control-regex style issues; initial spec noEmit found strict Bun matcher types, and the first broad matcher typing correction triggered unnecessary-type-argument lint. These were setup/static failures, corrected without weakening runtime expectations or suppressing rules. The final receipts above and normal source commit hooks passed. Tool Wiki explicitly reported inactive/not certified because its external activation root is not provisioned; no certification is claimed. Migration and doc-cap hooks were inapplicable to the source commit.

### New production-path fault proofs

Exactly28new fault runs targeted the actual native reader, one fault at a time. Every run exited1 through expected test assertions; no fault run was masked, timed out or failed to load. Each restored its original source bytes in a finally block, with equal before/restored SHA256 retained. No old proof batch was replayed. Calendar-shape and integer-grammar faults specifically lost the controlled Cron refusal and leaked TypeError/BigInt SyntaxError; they are not claimed as malformed-input acceptance. Prepass omission exposed the earlier real claim-collision error. The missing-calendar dependency control refused with the named invariant error; serialization injection produced the expected bigint JSON failure. Other decoder/blocker faults admitted malformed state or lost/additionally invented explicit obligations as identified below. Adjacent production Proof comments record the observed controls.

| Fault group                          | Individual receipts / observed production control                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepass, boundary and serialization  | prepass-order, calendar-shape, schedule-dependency, calendar-invariant, serialization                                                                                         |
| Fresh parser and field guards        | fresh-TZ, field-count, integer-grammar, integer-int64, range-cardinality, step-cardinality, field-bounds, step-dependency                                                     |
| Duration dependency/grammar/overflow | duration-dependency, duration-empty, duration-digits, duration-unit-dependency, duration-multiply, duration-fraction, duration-float64, duration-sum, duration-positive-limit |
| Zone knowledge and obligations       | zone-dependency, zone-Local, zone-components, catalogue-dependency, unknown-blocker, lifecycle-blocker                                                                        |

Fractional production negatives include an oversized fraction added after an int64-min magnitude and an int64-edge positive interval where Go float64 rounding rejects but bigint-only rational math admits. Direct reference comparisons alone are not the proof of prepass wiring. Absent timezone, known non-UTC syntax, valid unsupported descriptors/intervals/impossible dates and unknown names retain source incompleteness and serialize successfully.

### Source bytes and limits

| Source file                                                              | SHA256                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `tools/tool-fleet/src/observability-cron-duration.ts`                    | `70295398466a9f9ea4e439d25035db29ccfd0ab0e859e8cb02e97f6678c3da71` |
| `tools/tool-fleet/src/observability-cron-syntax.ts`                      | `39497e771eea3acb1391956ed39ae8beb177d80c928c5a201c87b1522bf4f9d7` |
| `tools/tool-fleet/src/observability-cron-zone.ts`                        | `f3c938a5755f7511b91ed629534be9a442f11d129b66de4c423ab86664d15f80` |
| `tools/tool-fleet/src/observability-native-ordinal.ts`                   | `1e698857b45a372b319e387fb985ab266a956b550e425ad4cc57e6eaba0ef595` |
| `tools/tool-fleet/src/observability-cron-syntax.test.ts`                 | `3249db942bfbde541bbbacf4181e2604b3feccd86bf9de87afabfddc02075a95` |
| `tools/tool-fleet/src/observability-native-cronjob.test.ts`              | `3a73feb46ffe2ad63a06944c76f4f0541fbd3648b4f34ba9340aff49a0f3dfaf` |
| `tools/tool-fleet/src/observability-cron-zones.json`                     | `9c76a97bdff88983c7c9b70516d4a7c38aa8cd0cac2f176c6e8b967a80c09037` |
| `tools/tool-fleet/src/fixtures/cron-go1.26.0-robfig3.0.1-reference.json` | `b51188564461f1133924b2f646974c5bac4b851de6653b8e20c9389f68930403` |
| `docs/infra/observability-cron-licenses.md`                              | `6c0cf61122ab47248757b3e3fd9bfe827bdc7367d75fb975af358131ff6f6c53` |

No package/lock/owning workload/image/floor/graph/CI/capacity-core change occurred. The immutableff0b owning-workload capture remains reusable; Task54 did not render or capture it again. No Go/oracle execution, full Nx/Fleet/app/browser suite, gate host, SSH, Docker, registry, provider, CI rerun, publication, merge or runtime operation occurred. This source slice cannot establish full CronJob policy, horizons, controller identity/clock/generation, whole-attempt capacity, actual-provider equality, runtime enforcement or common-stack admission. Those criteria and all existing independent obligations remain open.

## Task54 independent source review and Task55 input clarification — 2026-10-28

Independent specification and quality review approved full actualBASE `088fd039b0638a376e9ae8dc7f73b31d4346f4ce` → `f0c04e35e663193bb44b3fc97ee6ee33b0afb7a1`, including prior intent9cdb and source12219/evidencef0, with no Critical/Important/Minor finding. Review report SHA256 `b72b2549e7398b0b12bfbe2b620fce66e8ace15b214a52d5d26cf177a9f082f4` is retained privately. Parent matched nine final hashes, exact original337 corpus/reference objects and598-name catalogue bytes; inspected all28 fault experiments/61 behavioral assertion failures with exact restoration and final397 covering/six compatibility/type/lint/format/strict/normal-commit receipts. No suite, Go/oracle, old proof or render replay was needed.

The reviewer inspected changed code/tests, upstream port branches and production callers and ran one focused Bun diagnostic for a suspected timezone regex end-anchor issue absent from retained cases. Calendar calls with trailing LF/CR/line separators and an embedded component LF all threw the required malformed-timezone error; the suspicion was disproved. This was a narrow diagnostic, not a rerun or new runtime proof. Full Task55 policy/horizon/slot accounting and all host/runtime acceptance remain outside review approval.

Actual BASE before the next input clarification is `f0c04e35e663193bb44b3fc97ee6ee33b0afb7a1`. A read-only pinned-source seam analysis identified how to reuse actual Job spec/default/retry/expansion while preserving standalone required metadata and avoiding fake CronJob-template Job identities. Its report is retained as `task-55-source-seams.md`. The clarified closed horizon still requires controllerTimeZone, validates/snapshots it always, uses explicit source timezone when present and otherwise uses the declaration conditionally. No invented equality or observed controller zone follows; unused knowledge remains visible. Cron's representation limit applies to aggregate S=N(B+1), including zero ticks/large valid backoff without allocation; ordinary Job bounds remain unchanged. Specification/design/tasks record these rules before source implementation. Cost if a ruling is wrong is source-compatibility/accounting rework; no runtime has been admitted.

Current published342d CI remains separate from local source verification. Its Fleet/generic-k3s/browser verdicts passed at their recorded checkpoints; workspace/Twilight were still live at the last observation. No docs/intent head push, cancellation or manual rerun occurred. New source/horizon implementation, actual host admission, authenticated common Kubernetes deployment/signals/views/isolation/history/recovery and live convergence remain required.

## Task56 — declared CronJob horizons and shared Job accounting — 2026-10-28

Actual full review BASE is `f0c04e35e663193bb44b3fc97ee6ee33b0afb7a1`; source start is the clean clarified-intent `22c2efe83637f070992161603c5f8630ebbc09e5`. The prior four-artifact intent and input clarification precede source implementation. Task54 syntax source was already independently approved; its oracle/full suite/proofs were not replayed. Task56 is the implementation of canonical Task55, following the read-only Task55 seam report.

The positive-integer divisor term includes the pinned grammar's optional positive sign and leading zeros. The controller ruled this explicitly before the regexp change: source `*/+15`, `*/00015` and `*/+00015` preserve the divisor15 accounting and each changed source frame's provenance; `*/+7` remains valid unsupported. Native caller RED (`signed-step-red.log`,0.764093s, one expected failure) observes zero entries against the expected14 full slots. Cost of a wrong interpretation is source compatibility rework; all admission/runtime authority remains false.

Source verification and the single committed-adapter retained control are recorded below after completion. Independent specification/quality review remains pending; complete task3.1 capacity, actual horizon enforcement, all controller generation/clock/UID constraints, whole-attempt/manual/history/writer costs and authenticated common-stack runtime acceptance remain open.

Task56 extracts the existing required-metadata Job wrapper, actual JobSpec decoder, serial predicate, default/grace/conditional one-UID facts and `expandJob` into `observability-native-job.ts`. Ordinary Job fields, identity, error boundary, default provenance and field order remain intact; the full104-case Job file passes. CronJob never fabricates a child Job manifest, UID or absent metadata object. It consumes one typed calendar in the full prepass, validates known Cron/nested Job policy, distinguishes null/arrays/maps and delegates only the root starting deadline/nested active deadline to their safe int64 boundary. Cron root hooks remain separate from optional JobTemplate metadata and the full JobTemplate hash remains separate from the Pod template hash.

Closed horizons bind independent source revision/artifact, Cron owner, frame, inventory pointer and full JobTemplate hash before lifecycle iteration. Required controller timezone is always decoded and snapshotted; explicit source timezone wins, including source UTC plus non-UTC/outside-catalogue controller metadata. Only effective UTC and supported expression cadence contribute. No-horizon calls read no new anchors and retain the lifecycle marker. Native four/five/six calls remain supported; the native seventh argument requires a full source contract and permits explicit undefined topology/horizons. The canonical companion sends only its original first five arguments to the producer once, preserves topology forwarding and keeps horizons out of public inventory.

Ticks and full retry slots use the existing normalization/Job expansion/capacity sum. Ordered canonical four-digit dates and positive cadence already bound tick arithmetic; valid backoff is int32. The product still receives an explicit safe-integer/256-slot guard before allocation. Zero ticks accept large valid backoff without allocating; larger envelopes are incomplete without truncation. Forbid, deadlines, history/TTL and cleanup do not discount demand. Full failed/terminating CPU, memory and disk charges, tick/retry/source coordinates, all per-Job conditions and independent prior/manual/generation/history/claim/writer/enforcement obligations remain visible; authority stays false.

TDD first used the actual native reader: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-native-cronjob.test.ts -t 'declared horizon charges'` failed with expected14/received0 before feature code (`/tmp/puni-task56/red.log`, Bun735ms). The signed-step RED above similarly preceded its clarified regexp change. Final restored-source covering runs the complete two changed caller files: **262 pass,0 fail,755 assertions**,1.520734s. This includes all158 Cron tests (106 new plus52 unchanged native caller controls) and104 Job tests. It does not replay the337-case parser/oracle suite or any old fault batch. Selected other-family compatibility is10 pass/0 fail across four files,0.998304s; six overlap selected Job controls and four verify StatefulSet/Deployment/Daemon paths.

**68 distinct new production-path faults failed their intended tests and restored exact bytes**,51.232077s aggregate. `/tmp/puni-task56/faults.json` records each exact mutation, argv, output path, timing and original/mutated/restored hashes (SHA256 `e14605d9c9e5ad79679add7dcc88ae717641a2cf0ef80d87ff05438b73f3541e`); `/tmp/puni-task56/fault-log-hashes.json` hashes every raw receipt. No successful behavioral fault was repeated. Three first selections were masked and are retained separately: non-Cron owner refusal was masked by later template binding; missing millisecond grammar was masked by roundtrip; past February30 was masked by window order. Coherent non-Cron coordinates, expanded `+010000` and future February30 isolated the intended guards. The root int64 exemption fault produced the expected positive-path source refusal rather than an assertion, so it was classified by raw test-level output without replay. No import/syntax setup error is claimed as proof. Safe arithmetic/origin dependency corruptions are explicitly dependency tests, not claims that removing mathematically redundant guards changes reachable source behavior. The later timestamp guard was narrowed to invalid-date detection (preserving controlled NaN refusal); redundant tick/retry numeric checks were removed while the product guard remains. Adjacent Proof comments describe the watched faults.

Raw final commands/results/timestamps/output hashes are `/tmp/puni-task56/{changed-callers-final,compatibility-final,overload-final,signed-step-red,signed-step-green,envelope-final,lib-source,spec-source-fixed,lint-source}.receipt.json` with matching `.log` paths. Library/spec no-emit and scoped ESLint pass. A formatted `@ts-expect-error` initially preceded the call rather than its invalid third argument; moving that test-only directive fixed TS2578/TS2739 and the complete spec check passed1.592333s. Initial fixture aliasing, an incorrectly assumed invalid source coordinate, max-versus-sum normalization expectations and earlier-inventory error expectations were corrected without loosening production validation. Exact source hashes, final format/strict receipts, normal commit/hook evidence and the one clean committed-adapter retained-input control follow in the private `task-56-report.md` and the control record below.

No package/lock/owning workload/image/pin/floor/graph/CI/capacity-core change occurred. No network, provider, runtime, host/SSH/gate, Go execution, chart/canonical rendering or capture, full Fleet/Nx/app/browser suite, push or merge ran. Tool Wiki activation/certification remains separately reported by normal commit hooks. Independent review and complete runtime/admission criteria remain open.

### One committed-adapter retained-input control

Normal source commit `ee6b283e36b83c9d4e738e700a7eadf72017abd1` passed all applicable normal hooks (4.809304s). Tool Wiki explicitly reported inactive/not certified because the external activation root is absent. Migration/doc-cap hooks were inapplicable. The tree was clean before the control. `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 /tmp/puni-task56/retained-control.test.ts` ran exactly once against that committed adapter: **1 pass,0 fail,167 assertions**,5.797039s command wall,5.08786s test time. No rendering, capture or provider call occurred. The adapted script writes only new Task56 output files; the old Task40 script and all retained inputs/ledgers remain byte/mode-identical.

The independent selected source remains `ff0b0208bc426ad8bc2a4896f15a90f34eb97b89`, artifact `d96afb33eb6732c20b5f2ef6831c2dfbefa55d1c79ba7fc233824a9923442086`. Its single actual CronJob is `CronJob:observability:elastic-snapshot-check`, contributing owner `stage/backup`, pointer `/4`, cadence `*/15`, Forbid, backoff0 and absent source timezone. The declaration `(2026-10-28T00:00:00.000Z,2026-10-28T00:30:00.000Z]` conditionally supplies controller UTC. It adds two full128MiB/10mCPU/64MiBdisk retry slots. All120 prior charges and124 independent blockers are exactly unchanged. Historical125 blockers become129 in the no-horizon companion because new independent named obligations remain visible; the bound case has122 entries/126 blockers and totals24256MiB memory/4230mCPU/20672MiB disk. Only the actually covered Cron lifecycle marker is replaced; fresh-source/clock/one-UID/generation/retention/window-enforcement prerequisites remain unobserved and authority stays false.

Raw `/tmp/puni-task56/retained-control.log` SHA256 `5d929a4ee8f582203e845f8f5e72987fa8de5049e8c69dbceb744ab910188310`; adapted script SHA256 `30654ef83ee7a0556130b56f186d4fbf08caa77492c8b617fc4e1545b0df62d8`; summary `/tmp/puni-task56/retained-control-summary.json` SHA256 `19fab68fbc312427c152515ec8f7be1629069f7332e9a716423aee36a6fc57d1`; new ledger SHA256 `06d4b51b6c953a2755e873239e895066589935c83bd200cf7f146ac64d023bb0`. The summary records all five retained byte/mode checks, full source/template/horizon coordinates and actual adapter revision. Final format/strict/diff receipts and normal source/evidence hook outputs are indexed by `/tmp/puni-task56/command-receipts.json`; all source hashes are in `/tmp/puni-task56/source-hashes.json`.

| Final source                                                | SHA256                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `tools/tool-fleet/src/observability-native-job.ts`          | `b934eb14e0f56aeb6f32b6289da197b7413a0fe36f13fd10532f7eeb09ba1370` |
| `tools/tool-fleet/src/observability-native-cronjob.ts`      | `100b5321cb334017603dac4bd36828e8783acb5d0f31f4c8827500f3550068d0` |
| `tools/tool-fleet/src/observability-native-ordinal.ts`      | `749d98a0ace5c9187130d6a2f485403601292b9a6b7df5d711ff666a3bcc11d7` |
| `tools/tool-fleet/src/observability-native-cronjob.test.ts` | `5e8c416d551befc2d54b81785deeb50ebfa5949428d332a60e1b2cd16de73522` |
| `tools/tool-fleet/src/observability-cron-syntax.ts`         | `202f298d909d57762b67b6f754773017267286ce6fa07b0c641fb3558aaa3bc3` |

### Task56 independent review and retained-ledger limits

Independent specification and quality review approved full actualBASE `f0c04e35e663193bb44b3fc97ee6ee33b0afb7a1` → `0d15c4c9cbe2434bbf5d36d5f169dd83674ffc2c`, including prior input clarification22c2, sourceee6 and evidence0d15. There are no Critical/Important/Minor findings. The retained private review report SHA256 is `0978008e6b3ee92f86a9f7391a379ac3729503f23eb33a85107ba432717c1a2f`. The reviewer read the full supplied diff and focused unchanged callers/contracts, inspected retained test/static receipts and adjacent proof descriptions, and required no diagnostic, test, fault, oracle, render, provider or runtime rerun. Approval covers source only. Canonical Task55 is complete; task3.1, actual window enforcement and all common-stack/live acceptance remain open.

Parent independently matched all five final source hashes, all71 raw fault-log hashes/exact restorations (68 effective faults/74 named behavioral failing-test observations and three separately classified masked attempts), all22 command-receipt hashes and relevant outputs. The single retained-input control was not repeated. Parent compared all120 old entries and all124 independent blockers, plus every other existing receipt field and lifecycle fact, and confirmed unchanged semantics/field order outside the declared Cron contribution. All five retained input/script/ledger byte and mode identities remain unchanged.

Read-only aggregation of the retained122-entry/126-blocker ledger identifies28 conditional native owners. Six ordinary setup Jobs each contribute11 full128MiB slots under their declared retry assumptions; these are full failed/terminating-attempt envelopes, not observed concurrent steady demand. The overall24256MiB memory subtotal is conditional, incomplete and not a host purchase specification. Sixty-four provider/unclassified-demand blockers remain, alongside generated workload, storage/writer/history and runtime-binding obligations. The16GiB available-memory lab floor is only a prerequisite and cannot certify the larger candidate. No floor, workload policy or demand charge was reduced to fit a known host.

Published head `342d968423e7a7e12faffb2e6bb8f99c7ff7025c` CI is terminal success: main run40636425378 workspace job122644471222 ran05:10:55–06:39:16UTC (88m21s), Twilight job122644471211 ran05:10:55–06:13:32UTC (62m37s), stable pixels122650868444 succeeded05:31:30UTC and stable gate122672166738 succeeded06:39:21UTC. Infra run40636425298 succeeded (Fleet19m12s, generic k3s14m32s). These are the original run handles, with no cancellation, manual rerun or extra artifact download. They do not verify local Task54/56 source or the common observability runtime. Reviewed local source is batched for the next ordinary feature-head publication to avoid an intermediate documentation-only full run. Full h2 host gate remains unrun; Tool Wiki remains inactive/not certified because its external activation root is absent.

## Task57 — current generated-source gap and Task58 intent

Read-only design and exact seam analysis at published2d9cbccce confirmed existing Task24 resource/scratch declarations and Task25b2 eight selected generated traits in both source and immutableff0b expansions. No tests/proofs/render/capture/provider actions ran. Reports are retained privately: design SHA256 `f1ba96c1463dc0dec51261c337b2a28dca2a46ee60cda78c86d31a4a71422b75`; exact seam addendum `0011724e31438b23306bdfb338c9fea1be8796ec85d3cae8c3d7f71362ba36c6`. This avoids repeating completed maps, traits or primary-source research. The genuine gap is joining those traits to full-graph accounting and conditional lifecycle contributions.

The existing packet's toolchain anchor is receipt.files (`infra/versions/toolchain.json`, SHA256 `5fa350e57fca1228287d101f41c8156f3845cb262f690cc29eb743bb3c31d31e`), not historical bootstrapSources. Packet source/artifact identity must match inventory provenance. Specification/design/tasks record that boundary and additive combined-reader/native-preservation/conditional-cohort/claim requirements before source implementation. Existing initial copied-tree measurements support retaining source caps only; generated Pod equality, startup/growth, physical enforcement and complete host sizing remain open. No hardware, workload, floor, Secret, production or final-merge authorization changed.

### Task58 intent clarification — retained KPS enablement (2026-10-28)

Root read the locked KPS91.4.1 archive without rendering and confirmed SHA256 `1bd5e7a88e758ed3ec22db0fe6e72b1352f3f0e7e5a93c79979f7edf361becdb` against the lock. Its `values.yaml` defaults are `alertmanager.enabled=true` (402), `prometheusOperator.enabled=true` (2982) and `prometheus.enabled=true` (3784). Authentic ff0b declarations omit application store flags and the shared-controller flag; they retain explicit application controller-disable and provider store-disable. Root approved correcting the earlier explicit-flag assumption before implementation, preserving explicit/default origin and exact pin provenance with malformed/disabled/pin-drift negatives. This records source inspection, not runtime or rendered verification. Full review base remains `2d9cbccced60faae3acf221e3861d67c40ce8c9f`.

## Task58 — generated rehearsal traits and conditional lifecycle costs — 2026-10-28

Full review BASE is `2d9cbccced60faae3acf221e3861d67c40ce8c9f`; clean original SOURCESTART is `defa17bb1f9de4f72b71781dc71cbbe3ab0b675b`. The normal four-artifact pinned-default clarification commit is `22c025a9b`. The retained source remains ff0b/artifactd96a, independent of this adapter.

The additive retained reader and canonical companion reuse one validated full-source traversal, the existing selected role decoder/traits, normalized amounts, full cohort expansion and capacity sum. Internal decoded resource/release views and private prepared evidence preserve public inventory fields/order and native-only overloads/output. Runtime bytes bind the independent packet's unique toolchain file plus source/artifact identity before the existing retained decoder. Canonical preparation reads/decodes the lock once and forwards only the original five producer arguments once. Pinned KPS defaults distinguish explicit/default facts; malformed flags/maps refuse before selection.

The supported conditional budget has eight traits, sixteen full initial/replacement Pod slots and six unchanged logical claim slots. Authentic ff0b uses disposable2Gi/10Gi ES in both instances: the small retained projection contributes `17408Mi` memory, `3720m` CPU requests and `56832Mi` disk requests. Unsupported traits remain null and uncharged; exact decoded CR binding keeps extra nodeSet/claim/volume state visible. Only the eight supported generic owner blockers are replaced. Native facts, independent providers/writers/history and actual claim/runtime/enforcement/startup obligations remain separate. State stays incomplete and both authorities false.

Actual feature RED: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-rehearsal-capacity.test.ts` against the native-only delegating facade reported expected8/received0 generated traits,0pass/1fail (1s). The first malformed-array enablement test subsequently failed before the new map narrow was added. Current restored focused coverage is15pass/0fail/169assertions (5.58s), including exact native serialization, logical claims/cohorts, source/default/frame/provider/packet boundaries, late known-state refusal, unsupported extra nodeSets/volumes, closure snapshots, prepared public inventory order and producer forwarding. Selected compatibility:3 native tests/23assertions (0.848s),2 existing selected/immutable-index tests/6assertions (1.82s, portable fixture; no renderer),1 existing cutover test/2assertions (1.069s). Scoped lib/spec no-emit, changed-file lint/format and locked OpenSpec strict validation passed. Final restored receipts and timings precede the source commit below.

Only new integration dependencies were watched: packet coordinates/revision/artifact/hash and selection shape, enablement map/Boolean/default pin and instance uniqueness, extra application/CR closure and API, trait/source-view retention, null costs, replacement cohort, logical claim count, combined sum, exact blocker/history coverage, borrowed-view snapshot, prepared coordinate and canonical horizon forwarding. Raw command/fault/restoration receipts live privately under `/tmp/puni-task58-implementation/`; adjacent production `Proof:` comments name observed cases. Every effective fault has exact before/restored hashes. Initial snapshot omission was masked against an unrelated input mutation, then failed the strengthened canonical borrowed-view test. Initial selection-shape widening was masked by an uncommitted shadowed release-retention bug; the corrected `releaseViews` source passed a clean15-test baseline before the final two selection/direct-retention faults. Masked/setup attempts receive no proof credit. Original feature expectations incorrectly assumed current retained-production4Gi/100Gi; authentic ff0b projection corrected them to2Gi/10Gi. No old proof/parser/oracle batch was replayed.

Automatic approval review rejected a proposed lint-fix batch because `enabled ?? true` could appear to default null. No edits ran. The implemented alternative retains explicit undefined-only value/origin object branches after the Boolean boundary; no lint directive or nullish fallback is used. A temporary release-view shadowing mistake and a readonly test-array append/type setup issue were fixed before completion; final covering checks include them.

One retained-input control remains to run only after the normal source commit and clean tree. No new chart/source render or capture is justified: owning resources, claims, limits, pins, floors, graph and runner remain unchanged. Full Fleet/Nx/app/browser/gate/CI, provider/SSH/Docker/network/Secret/hardware actions and runtime admission were deliberately not run. Complete host/runtime/generated lifecycle/writer/history and full rehearsal/live acceptance remain required.

### Task58 clean committed-adapter retained control

Source commit `3650d3dca62068ac1f108d298703ad9b29151912` completed normally with clean tree (5.245s). Applicable lint/format/plaintext-secret/private-nesting hooks passed; migration/doc-cap hooks were inapplicable. Tool Wiki explicitly reported inactive/not certified because its external activation root is not provisioned. No hook was bypassed.

Final restored verification commands/argv, raw outputs and exact timings are in `/tmp/puni-task58-implementation/final/receipts.json`: focused15pass/169assertions (6.894s wall), selected native3pass/23assertions (1.393s), lib/spec `bunx tsc --project tools/tool-fleet/tsconfig.{lib,spec}.json --noEmit` (2.016/2.265s), changed-file ESLint (5.803s), Prettier check (1.444s), locked `./node_modules/.bin/openspec validate observability-environment-parity --strict --json` (0.850s), and `git diff --check` (0.021s); all exit0. The selected native check was repeated only after the concrete release-retention fix. The two final changed selection/direct-retention faults followed the clean15-test baseline and restored exact bytes; no prior effective batch was replayed. `/tmp/puni-task58-implementation/fault-summary.json` classifies29attempts:27named failures,25credited fault runs,2masked attempts, plus2diagnostic failures before the corrected positive baseline excluded from credit. All restore hashes agree.

The following retained-input control ran exactly once on the clean source commit, with no renderer/capture/provider action:

`bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 /tmp/puni-task58-control/retained-control.test.ts`

It passed1test/144assertions (8.168s command wall;7.426s test;7.421s measured scenario). Selected source `ff0b0208bc426ad8bc2a4896f15a90f34eb97b89` and artifact `d96afb33eb6732c20b5f2ef6831c2dfbefa55d1c79ba7fc233824a9923442086` remain independent from the adapter. Exact toolchain bytes came from `git show ff0b0208bc426ad8bc2a4896f15a90f34eb97b89:infra/versions/toolchain.json`; their SHA256 `5fa350e57fca1228287d101f41c8156f3845cb262f690cc29eb743bb3c31d31e` matches the independently retained packet file coordinate, with no invented bootstrap source. All264old Task40/Task56 artifact bytes/modes are unchanged.

The control preserves120historical native charges and exact prior lifecycle/provider/source/independent blocker facts. Declared Cron horizons retain the existing122native entries (`24256Mi`,`4230m`,`20672Mi`) and126native blockers; the combined reader's native object matches the current native reader byte-for-byte. It adds8traits/8conditional lifecycles/16full Pod slots/6logical unchanged-claim slots (`17408Mi`,`3720m`,`56832Mi`), for known combined contributions `41664Mi`,`7950m`,`77504Mi`. Exactly8supported generic owner blockers are replaced, while independent blockers remain exact;248combined blockers and false authorities keep the ledger incomplete.

Private control artifact SHA256: script `bac235c964c48aab960b44dd468f88cb0617657be56eec31084f0a01d00a67a7`; summary `ad244c5a03f66c6fbdfa1fd51e5fb9ec7f098c8bc03ec5b04e2315e160127523`; full ledger `58b852b55a7c103a6687044822856db88d9c8ee8b3f5795ff69471af8742d5c2`; raw output `99eb00576e7c30bc6120082a166931e63590019f5b8afe90a8e4d384743d0cc9`. Combined closure is `01a1adaa386d020df3a298261617a2e7846327e7fd82c15714d60b9081921b38`. Artifacts live only under `/tmp/puni-task58-control/`; old scripts/outputs were read for adaptation, never executed or overwritten. Task58 source work is complete for independent review; full task3.1/runtime acceptance remains open.

## Task58 independent review and current deployment prerequisites

Independent specification/quality review approved actualBASE2d9cbccced60faae3acf221e3861d67c40ce8c9f → cleanSOURCESTOP700aea9bf177de6204e06689f0911996ed72d83a, including intentdefa/default clarification22c/source3650/evidence700a. No Critical/Important/Minor findings. Private review report SHA256 `a0b412199935b67fe57c4b2fde4b04d3bf57c8af1200fe8d90b665735247e35e`. The reviewer read the full236146B diff and narrowly checked cut-off source/decoder/native/producer contexts; no diagnostics, suites, proofs, rendering, retained control or runtime replay occurred.

Parent independently matched all eight source/test/fixture bytes to3650, read the final eight command receipts/raw outputs plus selected native/trait/cutover outputs, inspected all25credited named failing-fault/restoration observations and kept two masked/two pre-baseline diagnostic attempts uncredited. Parent read the full committed control script/log and independently compared the entire native receipt including JSON field order to the prior Task56 ledger, all264old artifact byte/mode identities, all generated/combined sums and independent native blockers. No passing check or control was rerun. The conditional full-run41664Mi/7950m/77504Mi subtotal remains incomplete and is not steady h3mon usage or a complete host purchase specification.

Published head2d9 CI is terminal success: main40649664877 stable gate122708781780 succeeded2026-10-28T08:24:21Z; workspace122686872532 ran07:23:39–08:24:15 (60m36s), Twilight122686872553 ran07:23:39–08:14:57 (51m18s), all four browser shards and stable pixels122695459652 succeeded07:48:27. Infra40649664864 succeeded07:50:08 (Fleet13m25s/generic k3s14m01s). These original provider handles were observed, with no cancellation, manual rerun or log/artifact download. Verdicts apply to2d9 only, not the unpublished Task58 source or common observability runtime. Full host gate remains unrun; Tool Wiki remains inactive/not certified as normal hooks report.

Four bounded read-only live queries using the existing enrollment operator and strict host trust succeeded2026-10-28T07:39:42Z. GitRepository puni-platform remains Ready at584230c9e47b71cdb48e8d6397dc753e9aa93983; observability/alerts/backup remain suspended and notready, ECK/Prometheus CRDs and observability-dev namespace remain absent. Root puni-cluster is currently Reconciling=True and Ready/Healthy=Unknown/Progressing, superseding the older failed-status snapshot. Private refresh manifest retains all four raw receipts/hashes; no Secret query, Pod/capacity read, grant, source-ref change, unsuspend or deployment occurred. This proves those specific prerequisites and authorized reads, not full preflight or acceptance.

A separate local read-only07:53 snapshot observed33227800576B total/18051555328B available memory and22255362048B home-filesystem free space on device66307. Home is not proven Docker-root backing. No known full-rehearsal host is admitted; no memory/disk floor was weakened or unrelated workload stopped. Full source/system/helper/writer/device accounting, effective runtime enforcement and actual rehearsal/live acceptance remain required.

Task59 source-seam design and addendum were read without execution; hashes `3c5ab5fc856d9b90063daf4d7377f34cc4a56890b5834a903122f1c49821c6f3` and `dcfc45b2b2ccc2db9f2ef409fd2d14bace846ca646853224d40ef109b6cd61d0` are retained privately. Actual pre-intent BASE for Task60 is700aea9bf177de6204e06689f0911996ed72d83a. The four artifacts specify exact source-only readonly host-path accounting before implementation. Runtime propagation/device/writer/quota facts are unobserved; writable checkpoints/backup storage are not waived. No new domain term, hardware/Secret/production/store/final-merge authorization is inferred.

### Task60 selected read-only host-path source accounting

Task60 pre-intent BASE is `700aea9bf177de6204e06689f0911996ed72d83a`; clean
SOURCESTART is `1c1178fc03f7cbc1f052ce0c3aa3a9b483b92330`. The source implementation
adds closed host bodies/mount facts, one shared exact reader-tuple matcher, internal
selected node-exporter policy and optional snapshotted consumer evidence. Default
and observed cutover schemas stay strict. All independent device, writer, retained
bytes, bind/submount/recursive-readonly and Pod/node/runtime/history obligations
remain unobserved; no admission, quota or physical read-only claim follows.

The exact interface ruling keeps the reader module independent of workload/native
runtime imports. `readRehearsalSource` supplies validated frame/pointer/template,
chart and image provenance; the private DaemonSet selector checks reviewed source
identity and unique locked nodeExporter image. Selector and normalizer reuse one
semantic tuple check. Its dependency is faulted once across both production paths;
removing only the selector call is masked by mandatory normalization and is not
claimed as an independent proof. The initial narrow host scan precedes lifecycle
and claim expansion: the new earlier-collision test exposed that ordering gap and
then passed after the shared scan moved ahead of those operations.

Raw commands, exits, timings, fault transformations, before/mutated/restored SHA256
and logs are retained in `/tmp/puni-task60-evidence/`; implementation report is
`.superpowers/sdd/observability-environment-parity/task-60-report.md`.

| Evidence                    | Observed output                                                                                                          | Receipt                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Existing native-reader RED  | 0 node-exporter charges instead of 2; exit 1, 0.835s                                                                     | `red-native.{json,log}`              |
| Closed-boundary RED         | 17 intended malformed/policy failures; exit 1                                                                            | `red-boundary.{json,log}`            |
| Independent obligation RED  | Missing explicit writer/bind/runtime fact; exit 1                                                                        | `red-obligations.{json,log}`         |
| Global ordering RED         | Earlier claim collision masked late malformed host body; exit 1                                                          | `covering-first.{json,log}`          |
| Cross-volume target RED     | Duplicate target was unsupported rather than malformed; exit 1                                                           | `red-cross-volume-target.{json,log}` |
| Final covering source tests | 239 pass, 0 fail, 495 assertions; 1.937s                                                                                 | `source-final-covering.{json,log}`   |
| Selected compatibility      | Cold-start, ordinal, generated combined reader and default cutover/preflight: 366 pass, 0 fail, 954 assertions; 138.025s | `compatibility.{json,log}`           |
| New changed-safety faults   | 29 effective, all exact source hashes restored; no old fault batch replay                                                | `faults.json`, per-fault `.log`      |

The supported-propagation dependency fault produced the expected modeled
`unsupported:workload-shape-unsupported` failure in its positive control; this is
an effective dependency corruption, not a setup/compiler failure. No masked fault
execution or compiler/setup fault was counted as effective. Type and lint findings
were corrected and final scoped checks are recorded below before the source commit.

The one clean committed-adapter comparison on retained ff0b inputs follows the
source commit. Independent source review remains the root agent's next step; this
source-only slice does not complete environment parity or authorize runtime work.

Pre-source statics: scoped library and spec `bunx --no-install tsc --noEmit -p
...` passed (1.351s/1.761s; `precommit-lib.json`/`precommit-spec.json`). Scoped
ESLint passed (`final-scoped-lint.json`); Prettier's explicit changed-file check
passed (`precommit-format.json`). Locked `openspec validate
observability-environment-parity --strict --json` passed with zero issues
(`source-openspec.json`). The last target-cardinality tightening has its own
RED/GREEN and effective `cross-volume-target` receipt, followed by the 239-test
positive covering run. No effective fault was replayed.

The first clean committed-adapter comparison at
`b1a28688a5b50bddb94fa5f54cf1ef659255d879` failed a harness provenance assertion
(exit 1, 5.882s; `retained-control.{json,log}`). The harness incorrectly expected
`/1`, the same-named ServiceAccount's pointer. Actual two full charges correctly used the
DaemonSet's `/13`. That failed script/log/receipt remain retained, and no passing
control was replayed. A normal fixture-provenance correction adds a portable raw
manifest hash and exact DaemonSet coordinate assertion. Independent setup resolves
`apps/v1` + `DaemonSet` + `observability` + exact name, verifies raw manifest and
frame bytes/hash, and confirms `/13` (`retained-setup.json`, exit 0, 0.129s).
The root agent explicitly authorized one corrected valid comparison in new
`/tmp/puni-task60-control-verified` paths after that correction commit. There will
be two comparison executions, including the preserved failed setup attempt; this
is not represented as a single execution.

Corrected retained comparison passed once from clean adapter
`077e04e366012339e56ead033719c3f28679d84e`: exit 0, 6.030s, 1 test and 109
assertions (`retained-control-verified.{json,log}`). The raw control and new ledgers
are under `/tmp/puni-task60-control-verified`; the failed setup attempt remains
under `/tmp/puni-task60-control` and its original evidence receipt/log.
The exact retained source remains `ff0b0208bc426ad8bc2a4896f15a90f34eb97b89`, artifact
`d96afb33eb6732c20b5f2ef6831c2dfbefa55d1c79ba7fc233824a9923442086`;
source and adapter identities are distinct. Original toolchain and topology bytes
were read by `git show` at that revision and verified against retained coordinates.
The fixed Task56 declared Cron horizon has the same source coordinates and window.

The committed adapter adds exactly initial/replacement node-exporter Pods at
64Mi/10m/64Mi each, with `/13/spec/template/spec` source provenance and the existing
conditional 2N DaemonSet lifecycle. Native entries increase 122→124 and native
known contributions become 24384Mi/4250m/20800Mi. Combined known contributions
become **41792Mi/7970m/77632Mi**, exactly +128Mi/+20m/+128Mi from historical Task58.
All prior native charges and unrelated fields/lifecycles/blockers compare exactly;
only the covered node-exporter `workload-volume-unsupported` blocker is removed.
Seven native host-consumer facts are added, alongside 21 explicit independent
writer/bind/device/submount/recursive-readonly/Pod-node obligations. Existing
`hostPath-device-growth` facts remain. OTel writable checkpoint and Velero remain
whole-Pod uncharged/unsupported. All eight generated traits, sixteen generated Pod
charges, six logical claims and generated sums compare exactly to Task58.
Both ledgers remain incomplete with creation/runtime authority false.
The control verifies all original Task40/56/58 artifacts' bytes and modes, the
failed setup script and its receipt/log are unchanged, and the tracked adapter
tree stays clean. The portable exact-provenance fixture test passes after the
metadata-only correction (`fixture-provenance-final.json`, 1 test/6 assertions).

Skipped by scope: full Fleet/Nx/app/browser/build/gate/CI, renders/canonical capture,
old mutation batches and research replay, actual provider/SSH/Docker/network/Secret
or store/hardware operations, push/merge. The normal commit hook reports tool-wiki
inactive because external activation is unprovisioned; it does not certify that
optional external activation. Physical device/writer/input-memory and recursive
read-only/runtime/host/Flux observations remain required. This verifies only the
selected source accounting slice; fresh independent spec/quality review and the
broader parity goal remain outstanding.

### Task60 reference-roster ordering follow-up

The root ruled that the escalated unknown-reference ordering concern is a required
Task60 correction before independent review. The new real-reader RED combines an
earlier **nonhost** StatefulSet claim-template collision and a later host-bearing
owner's absent-volume mount: it observed the earlier collision instead of the
required malformed-source diagnostic (exit 1, 0.856s;
`reference-roster-red.{json,log}`). A second RED establishes that unreferenced
duplicate declarations cannot hide behind that collision (exit 1, 0.930s;
`reference-roster-cardinality-red.{json,log}`).

The initial host scan now validates one complete declaration roster for each
host-bearing owner. It reuses the validated inventory's `claims` facts with
`kind: template` as **names-only** context, so actual StatefulSet implicit claim
mounts remain valid. No second claim decoder, fabricated volume/bound/Ready state,
policy permission or arithmetic was introduced. The shared reader validates raw
volume/template-name uniqueness and every application/init reference before
existing claim expansion; no-host owners retain their earlier first refusal.

Focused post-fault verification passed 102 Task60 tests / 276 assertions in
1.947s (`reference-roster-final-tests.json`). Six reference-roster controls cover
unknown app/init references, referenced/unreferenced duplicate declarations, valid
host-bearing StatefulSet implicit mounts and unchanged no-host collision behavior.
Scoped lib/spec noEmit passed (1.444s/1.708s), affected ESLint passed (4.395s),
explicit formatting passed and normal source commit hooks passed. The new source
commit is `557cab8aa` (`fix(fleet): validate host reference rosters before claim
expansion`); exact full hash is retained in the implementation report.

Exactly four **new** guard/dependency experiments (`roster-unknown`,
`roster-unique`, `roster-scope`, `roster-claim-context`) failed their intended
production-reader controls and restored matching before/source SHA256. Exact
before/mutant source copies, transformations, commands, exits, logs and timings
are in `/tmp/puni-task60-evidence/reference-roster-faults.json` and companion files.
The missing-template-context fault intentionally rejects the valid implicit mount;
it is a modeled dependency failure, not compiler/setup credit. Together with the
prior 29 experiments, this gives 33 effective new Task60 experiments; no prior
passing experiment was replayed.

The successful retained comparison remains pinned to clean adapter
`077e04e366012339e56ead033719c3f28679d84e` and was **not rerun**, as explicitly
required by the root. This correction changes validation order and error outcomes
for malformed rosters; it does not alter parsed host-consumer facts, accepted
source policy, quantities, cohort arithmetic or output for valid declarations.
The unchanged portable retained node-exporter case passes in the focused run.
The earlier successful retained reader had already validated every actual
owner's volume uniqueness/reference roster through `assertInventoryWorkload`
after expansion; the new scan uses those same raw volume and validated template
names earlier. Thus the actual retained candidate/output remains unchanged by
construction and case evidence. The +128Mi/+20m/+128Mi result stays historical
verified evidence at its exact adapter hash, not a claimed new execution.
No source58 edit/test-fault replay, runtime/provider action or publication occurred.
The ordering concern is resolved; independent spec/quality review remains pending.

### Task60 independent review round1 — consumer identity cardinality

Fix BASE is `2d1b4570f457e1b82be9b20fb310f06c2d3a7c04`; full Task60 review BASE
remains `700aea9bf177de6204e06689f0911996ed72d83a`. The independent review found
I1: duplicate application/init consumer names could still reach a prior owner's
claim collision before the inherited identity guard. Its genuine production-reader
RED was reused without execution: `/tmp/puni-task60-hostpath-review-diagnostic.test.ts`
and `.log`, exit 1, one test/two assertions. The standalone malformed-host assertion
passed; the earlier-collision assertion failed with the precise wrong diagnostic.
Bun reported 718ms; the review did not supply a separate command-wall receipt.
The original review/RED files and their hashes/modes are recorded unchanged in
`/tmp/puni-task60-round1/review-red-provenance.json`.

The shared host-bearing prepass now validates one combined application/init name
namespace, matching the inherited inventory identity rule before claim expansion.
Duplicate app names, duplicate init names and a shared app/init name are covered
by actual native-reader negatives behind an earlier nonhost collision. Positive
distinct app/init facts and valid implicit StatefulSet claim mounts still pass;
no-host duplicate names retain the original earlier-collision first refusal.
The source commit is `464a5913d` (`fix(fleet): validate host consumer identities
before claim expansion`); the private report records its full hash.

Fresh focused baseline and restored runs each passed seven tests / 13 assertions
(0.970s / 0.922s). Exactly one new `consumer-name-unique` guard-removal experiment
followed the clean baseline: all three intended app/init/cross-role negatives
failed because the earlier collision masked them again; exit 1, 0.856s. Exact
before/mutant source copies, transformation, command, raw log, timings and matching
before/restored hashes are in `/tmp/puni-task60-round1/consumer-name-unique.json`
and companion files. Adjacent `Proof:` names that observed experiment. No setup,
compiler or masked execution is credited. This gives 34 effective Task60
experiments cumulatively, with none of the prior 33 replayed.

Scoped lib/spec noEmit passed (1.347s/1.719s), affected lint passed (3.687s), format
and diff checks passed. A mechanical test-helper rename after those checks needed
Prettier wrapping; the normal commit hook refused that first attempt. Formatting
was corrected, then the normal source commit passed all hooks; both receipts are
preserved. This formatting failure is not a safety proof or a bypass.

M1 is corrected in the canonical and private report narrative: original `/1` is
`v1 ServiceAccount`, `/9` is `v1 Service`, and selected `/13` is the intended
`apps/v1 DaemonSet`, as established by the parent's retained-frame inspection.
Original failed-control scripts/logs/receipts remain untouched; only their
surrounding evidence narrative is corrected.

The successful retained control remains pinned to clean adapter
`077e04e366012339e56ead033719c3f28679d84e` and was not rerun. The new check only
changes malformed identity refusal order. The prior retained reader already
validated unique app/init names in `assertInventoryWorkload`; valid-source facts,
policy, quantities and cohorts therefore remain unchanged. The unchanged portable
retained node-exporter case still contributes its exact full two charges in the
focused run. This is a static valid-source/nonimpact explanation plus case
evidence, not a new retained execution. No prior 33 fault batch, 366-test
compatibility suite, full control/render, source58 edit, provider/runtime/Secret
or publication action occurred. I1/M1 are resolved; root-owned scoped re-review
remains pending.

## Task60 independent review closure and Task63 intent — 2026-10-28

Independent original review found I1 (duplicate app/init consumer identity could be masked by earlier claim collision) and M1 (retained `/1` is ServiceAccount, not Service). Source correction464a and final evidence7143 address both. Scoped re-review of the complete15767-byte two-commit fix approved specification and quality, with no new breakage. Report SHA256 `c2a4d78b02b1c15825a45402cc281b4d16eac73f13f9282278a8b57528940914`. Parent read the actual report, nine command/fault receipts and named raw restored/fault logs; no tests or controls were replayed. Baseline/restored each7pass/13assertions (0.970/0.922s); one new effective guard-removal experiment made exactly the three intended duplicate app/init/cross-role negatives fail, and restored source SHA256 `07981fdef1256618dba396e2e46e0318b37098c2b92cef7e8a65396c34e689f4`. Scoped lib/spec/lint/format/strict/diff receipts exit0. Cumulative Task60 new safety experiments34; prior33-fault/174-artifact/16-command/270-original-file/control audits remain retained. Successful comparison stays on077e; valid retained outputs were not rerun at7143.

Task63 intent follows one frozen3650 retained-reader diagnostic, not a replay: authentic full ff0b/d96a input with benign toolchain checksum/file-row mutation was accepted despite unchanged artifact tag no longer committing the full file list. State remained incomplete and both authorities false. Canonical producer receipt reconstruction remains a separate stronger boundary; no canonical/runtime bypass is claimed. Root verified all10 diagnostic artifacts and74 frozen runtime/config files against their recorded hashes (no semantic rerun). The new task restores exact packet commitment at the additive reader boundary before publication; no fix is yet claimed here.

Task61 recovered the exact84 ff0b/d96a payload files offline, measuring2216240 logical bytes, with all recorded path/hashes matching and mode0400. Root rehashed84 payload files and13 measurement evidence files, plus inspected the report. One wrapper attempt stopped before packet return; one completed producer-only recovery followed. No renders/tests/provider operations occurred. Historical canonical receipt serialization adds133733 bytes separately; original raw receipt bytes were not retained. This logical input measurement does not establish runtime scratch sufficiency, physical/device costs, numeric controller caps or a permanent h3mon requirement. Source62 remains unreleased pending justified policy. No hardware upgrade, Secret or runtime deployment action is authorized by these measurements.

Full goal remains active, canonical milestones4/11. Published2d9 CI success applies only to that head; Task58/60 and Task63 are held for one reviewed feature-head publication, avoiding repeated full CI runs. Real dev/common-stack deployment, effective Pods/CNI/storage, correlated stored signals/operator views/isolation/outage/history/recovery and full physical host admission remain unverified. The original16Gi available/120Gi stores question described preliminary temporary rehearsal prerequisites, not a measured permanent monitoring-host specification.

## Task63 — retained packet file-list commitment correction — 2026-10-28

Full review BASE is `7143383a5ac49d49c17cd403c52d405f1202f2ee`; clean SOURCESTART is root intent `41680011ac44fe130cb2511de808b3744ece9851`. Normal source commit `383e1833f2bbedf887b165e3ac88bb4b254565e3` changes only `observability-parity-rehearsal.ts`, `observability-rehearsal-capacity.ts` and its covering test. `hashRehearsalFiles` reuses the producer's existing `hash(encode(files))`, preserving complete row order, two-space JSON and trailing newline; `buildPacket` calls that same helper. The retained reader checks that commitment before lock decoding while preserving selection/unique-row/raw-byte checks. Unit packets now declare an honest synthetic revision/artifact; authentic retained projection origin is unchanged. Intended lower coordinate/schema/default-pin cases deliberately reseal their synthetic commitment/selection, while the new exact substitution negative preserves the prior independent artifact.

Exact new reader RED used `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-rehearsal-capacity.test.ts -t 'packet files commitment rejects'`: old source accepted coherent benign `binaries.k3d.sha256` plus matching file-row changes, so the required refusal assertion failed (0pass/1fail,0.964s). Corrected covering baseline passed16tests/184assertions (5.759s), preserving native/trait amounts and false authority. Lower malformed-lock refusal asserts one actual retained decoder call; coordinate/selection/raw-hash failures assert zero decoder calls and the existing binding reason; deliberately resealed pin drift retains its precise default-pin refusal. Raw logs/argv/timings are `/tmp/puni-task63/boundary-red{.log,-command.json}` and `covering-green{.log,-command.json}`.

Only the new commitment guard was faulted. `/tmp/puni-task63/guard-proof.py` replaced its condition with false; the same new reader negative failed through accepted output (0pass/1fail,1.007s). Before/restored SHA256 both `2c277e5c2cfc2e698315bf1da41a203826afb5e8146ab2d0065f1d9a0c1082ab`; mutant `89e9b4b335d323f6bd1fe20a61afbbed84821864e449ace51dacc46185fc2337`. Adjacent `Proof:` names that production-path observation. Final reader SHA256 `b6dcc3a7ecb7bbab6dacc8630f47987932045ecd24bad726460f63c27d7e35d3` differs only by this comment: `final-proof-comment-equivalence.json` verifies stripping it reproduces the exact restored hash. Restored targeted test passed1test/6assertions (1.323s); the already passing full covering baseline was not replayed.

One private helper-only authentic positive ran: `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 /tmp/puni-task63/authentic-files-positive.test.ts`,1pass/11assertions (0.546s). The existing full84-row retained files list equals Task61's independently indexed path/hash rows; shared helper and independent reference both produce `d96afb33eb6732c20b5f2ef6831c2dfbefa55d1c79ba7fc233824a9923442086` for source `ff0b0208bc426ad8bc2a4896f15a90f34eb97b89`. Old metadata bytes/modes remain unchanged. Exactly one helper call, zero producer/combined-reader calls: no historical diagnostic, canonical stage preparation/render, producer or full retained control was replayed. Exact output/receipt/metadata hashes are `authentic-files-positive{.log,-command.json,-summary.json}` under `/tmp/puni-task63/`.

Affected checks are in `/tmp/puni-task63/checks/receipts.json`: lib/spec noEmit exit0 (1.801/2.215s), three-file Prettier exit0 (0.462s), locked strict OpenSpec exit0 (0.789s), diff exit0 (0.008s). Initial scoped lint found only a test prefix-style expression; the equivalent `startsWith` fix passes final lint (4.508s, `lint-final-command.json`), with no production behavior change or old proof replay. Source commit normal hooks pass (4.713s); migration/doc-cap hooks are inapplicable and Tool Wiki explicitly reports inactive/not certified because the external activation root is absent. No hooks were bypassed. Self-review covers the complete three-file diff and shared producer representation; source60, fixture JSON, workloads/resources/claims/pins/graph/CI remain untouched. Runtime/creation authority remains false. Task63 implementation is ready for independent review; full task3.1/host/runtime/live acceptance remains open.

## Task63 independent review and publication readiness — 2026-10-28

Independent scoped review approved specification compliance and code quality for
the complete `7143383a5ac49d49c17cd403c52d405f1202f2ee` →
`933c99b454166fe6b9222b2a8a2b9d1d23b11a4f` three-commit range, with no findings.
Report SHA256 `fd03b0e9c4408847a98535502bc18fa872d1574e65b762132598ee705825e11f`.
Reviewer read the complete46310-byte diff and inspected only the named import-cycle
and decode-placement risks; no command/test/proof/control was replayed.

Parent read the complete implementer/reviewer reports, covering16pass/184assert
output, restored1pass/6assert output, actual guard-removal script/receipt/named
failure, authentic full84-row helper-only script/1pass11assert output, scoped
type/lint/format/strict/diff receipts and raw logs. All36 indexed artifacts
(568051bytes) and3 committed source/test files match recorded SHA256 identities.
Final reader differs from exact restored proof bytes only by the adjacent Proof
comment. Initial test-style lint failure was corrected with final empty lint
output; no runtime behavior changed. Prior Task60/58 controls and raw artifacts
remain attached to their actual observed revisions.

Task58/60/63 are ready for one ordinary feature-branch publication to existing
draft PR760; no final merge or deployment acceptance is implied. Published2d9
verdicts remain head-specific and the new publication requires its own CI. Full
host gate, physical admission, authenticated Flux/Kubernetes handoff, effective
Pods/CNI/storage and common-stack/live signal/history/recovery proofs remain
unverified. Goal stays active, canonical4/11.

## Reviewed batch published and Task62 policy intent — 2026-10-28

Normal review-closure commit `0e336dfd9130020b42a6602f0b10e0149e99418d` passed format,
strict OpenSpec(1valid/0issues,18ms), diff and normal applicable hooks. One ordinary
explicit feature push advanced2d9→0e336 on
`feat/observability-parity-implementation`; no force, main merge or rollout occurred.
Fresh GitHub state verified PR760 OPEN/DRAFT at that exact head and its updated
verification/limitations body. Ordinary CI40671174992 and infra-check40671175014
are in progress at this head; trusted-wiki40671171866 is skipped. These are new
required verdicts, not passing claims. Old2d9 runs remain terminal success. A
sandbox-network refusal on the initial read-only PR query was resolved through the
normal scoped network escalation; no access bypass occurred.

Task62 intent selects one shared authored Flux scratch policy from the existing
Task61 larger-input synthesis. Numeric caps/requests and their unmeasured allowances
are explicit in spec/design; no current host fit, successful controller startup or
physical quota is claimed. The smaller rehearsal-only proposal is historical and
not applied. No new measurement, old proof/control/render or provider action was
needed to choose this initial policy. Actual scoped source verification and one
justified changed-input build/capture still remain to implement and verify.

## Task62 shared Flux policy source slice — 2026-10-28

Review BASE `0e336dfd9130020b42a6602f0b10e0149e99418d`; clean SOURCESTART
`d0aae6d042e53fae5bfc27a64e61631512a1e122` includes the prior four-artifact intent.
One shared authored overlay adds only the selected13 ephemeral/scratch scalars to
four exact identity-tested Flux controller targets. Raw Flux2.9.5 vendor bytes and
toolchain pins remain unchanged. `validatePlatform` requires the narrow closed
policy; all3 forward callers apply its directory, retaining vendor authentication
and existing lifecycle behavior. The collector retains vendor+overlay; current
bootstrap frames carry both identities and actual retained kubectl build bytes.
Historical already-captured raw frames retain their explicit original coordinates.

The initial required production-validator RED resolved with no overlay, rather than
rejecting (raw `01-red.log`, exit1). Focused final coverage passes44tests with
31Bun assertions plus Node refusal assertions (`21-focused-final.log`, exit0,
9.235s command wall). This includes required policy shape/targets/identity order,
operation closure, absence/unreadability, coherent malformed inputs, scalar
syntax/positivity/contradictions, unchanged vendor guard, actual k3d fake-executable
argv/vendor/wait behavior, structured Ansible and cutover source assertions,
retained-input/frame integration and explicit historical-coordinate compatibility.
Ansible/cutover and canonical forwarding assertions are structural; they do not
execute those environments or prove runtime behavior.

Only new Task62 guards/dependencies were faulted:23 initial mutations restored
exact source bytes; an additional coherent operation-count fault demonstrates
extra-op closure. Original malformed extra-op setup was masked by the operation
schema and is not credited for that guard; the corrected test passed before the
watched count removal failed. The forward-coordinate mutation proves the precise
closure diagnostic (later schema decoding still refuses); four forwarding/caller
faults are explicitly structural. Adjacent `Proof:` comments name the observed
checks. No old fault matrix,337-oracle/control or retained-render producer replay.
Raw commands/logs/restoration hashes remain privately under `/tmp/puni-task62`.

Scoped Fleet lib/spec no-emit and Deploy lib no-emit checks pass; changed-file
ESLint passes. Initial spec/lint failures were corrected typed test boundaries,
not safety proofs. Strict OpenSpec, final format/diff and the one committed-source
canonical capture are recorded in the following evidence update. Root approved
one canonical invocation after the source commit; its existing preparation plus
inventory protocol contains two11-stage build passes and one selected-chart
render. No authenticated public reuse seam exists; no cache or second producer
is introduced. Full3.1, current writers/devices,
initialization/reconciliation/recovery sufficiency and effective runtime/storage
admission remain open; finite authored caps grant no creation/runtime authority.

## Task62 actual retained Flux build and comparison — 2026-10-28

Normal-hook SOURCE commit: `765c7dec791a049a79905fc56b63fed45a55542f`. Its tracked tree was
clean before the sole canonical capture. Existing prepared kubectl/Helm binaries
and an explicitly selected already-cached Helm archive were authenticated through
the existing seams; no downloads, tool upgrades, external provisioning, provider, network,
cluster, playbook or runtime operation was invoked. Helm's unchanged authentication
seam privately extracts the prepared archive for executable-byte comparison.
Root approved one necessary canonical invocation: the existing preparation and
inventory API protocol runs two11-stage build passes and renders all12 selected
releases once. No public authenticated reuse-input seam exists. Observers recorded
one inventory-phase validator/build call, one release-render call and one
bootstrap-frame call. Preparation had already performed its required
validation/build pass, so the whole invocation contains two build passes, one
Helm render and one frame production; see the authoritative round1 correction
below. No second producer/cache or repeated capture was introduced.

The one command (`34-canonical-command.json`) passed1test/0fail in12.539s command
wall. The complete new packet remains retained alongside its receipt, stage and
release streams, actual bootstrap bytes, frame coordinates, prepared source and
full accounting output under `/tmp/puni-task62`. Source revision/adapter is the
SOURCE commit above; packet artifact is
`0a4f95b5d8e9c77da098d7d5a452119f4dde3c6b9101737d8ed5301bdd56a8cc`;
actual Flux build is
`396dbce5daaee951aa93ed56135e1ad722707faaeed2a776fcf698f7a99e4d34`;
authored overlay input is
`798bedab9ae590a913f0a40fb757514d87bceca14603078b2255eaa60ea5ba87`.
Raw vendor remains SHA256
`80779d11e7f0050ed01a3f072556fdabefa38f5f6cb623e9df44381c9ec1d592` and toolchain/vendor Git differences against BASE are
empty. The enriched canonical inventory hash and base structural source-inventory
hash remain distinct identities, recorded in the private receipt index.

Decoded actual Kustomize output contains32 objects. Removing **only** the13
selected new ephemeral/scratch scalars makes every complete object equal to the
decoded vendor manifest, independently of output order. All32 old/new pointers
resolve the same GVK/namespace/name; both original and actual manifest/build hashes
are checked, and the only semantic differences total13 scalars across the four
Deployments. One bootstrap/flux frame records the retained overlay build directory,
actual bytes/hash and both independently authenticated source inputs. There is no
duplicate vendor workload frame or borrowed policy hash.

All11 stage streams,12 selected Helm streams, original policy build and364
non-Flux inventory entries are exact historical matches. Current source63 complete
packet commitment is consumed by the unchanged full-accounting reader. Its one
retained-frame arithmetic pass adds8 full Flux Pod cohort charges (2 per controller),
using existing lifecycle multiplication: +8192Mi memory,+700m CPU,+8064Mi disk.
Native known contributions change24384Mi/4250m/20800Mi to32576Mi/4950m/28864Mi;
combined known contributions change41792Mi/7970m/77632Mi to49984Mi/8670m/85696Mi.
These are existing conditional contribution sums, not host admission or a hardware
requirement. Generated traits/lifecycles/entries/subtotal and all unrelated native
fields are unchanged. Four candidate-emptydir-unbounded blockers become four
`deployment-replacement-wave-runtime-binding` blockers; incomplete state and all
creation/runtime authority flags remain false. Existing logs/cache/history,
writer/device/runtime and lifecycle obligations are preserved.

The first comparison-only attempt reached the exact old/native-entry equality and
failed on4 honest CronJob horizon selection leaves (2 charges). Saved-JSON-only
follow-ups exhaustively validate10 changed sourceRevision/artifact leaves against
the respective retained packet/inventory: those2 charges,2 daemon topology
lifecycles and1 CronJob lifecycle. All window/template/frame/pointer/owner/mode,
conditions and quantity siblings remain exact. Only bootstrap/flux frame hashes
and pointers change with the actual Kustomize object order; every non-Flux frame
coordinate is exact. No broad provenance stripping is used. Two further harness
assumptions were corrected from saved output: base structural inventory SHA is
not enriched receipt SHA, and the generic decoder's identity retains additional
fields, so GVK identity comparison uses its4 explicit coordinates while whole
normalized manifests are compared separately. Initial failed scripts/logs and
path-level diagnostics are retained as comparison setup errors, never source or
runtime safety proofs. Final saved-output comparison exits0 in0.400s, with no
accounting/capture/render rerun.

All744 prior Task40/56/58/60/63 artifact file/symlink identities retain exact bytes,
modes and link targets after capture (`old-artifacts-before/after.json`). The prior
successful source58/60/63 evidence remains pinned to its original adapters; it was
not relabeled or replayed. Normal source hooks passed; strict scoped OpenSpec,
changed-file formatting and diff checks pass. The exact final evidence commit is
recorded by the private Task62 report after its normal hooks.

Independent scoped review/publication belong to root. No push, CI cancellation or
rerun, deployment, Secret/store/hardware action or final merge occurred. The live
source3.1 task, current-network inputs, effective Pods/storage and successful
fetch/reconcile/restart/recovery/physical admission remain unverified.

## Task62 parent fix round1 — production caller tests and protocol count correction

This section is authoritative over the earlier structural-proof and whole-capture
counter wording. The earlier commands/outputs remain historical; no successful
real capture, output, source identity or old evidence was changed or replayed.

Parent review found the source-text canonical forwarding test mirrored the
implementation and did not meet the production-path negative requirement. It is
removed. Two replacement cases execute existing production callers through
existing exported dependency mocks and a faithful fake kubectl executable:

- The actual retained builder authenticates/reads its real packet inputs and
  invokes the fake executable. Its Flux argv selects physically distinct retained
  versus mutable-root fixture outputs. The returned bytes must be the retained
  output. Other graph output and tool authentication are explicitly mocked; no
  real Kustomize/chart/runtime render occurs.
- The actual inventory producer receives a validated dependency fixture whose
  built Flux namespace differs from its raw vendor namespace. The real bootstrap
  builder and inventory traversal must retain only the applied namespace and its
  own build hash. No source-text/regex assertion or bootstrap-builder stub is used.

Clean replacement baseline passes2tests/6assertions (`48-round1-positive.log`).
Exactly2 new dependency corruptions were watched: retained directory→runner root
and built bytes→raw vendor. Both fail the actual output assertion (exit1), then
restore source bytes exactly (`round1-proofs.json`). Restored caller/declarative
Ansible coverage passes3tests/10assertions (`51-round1-restored.log`,8.41s Bun).
The first fixture attempts failed because generated fake-script newlines were
not escaped and the synthetic inventory had no required stage; these are setup
failures, retained in46/47 and excluded from safety proof counts. Spec typecheck
passes; import sorting corrected the sole subsequent lint issue.

The cutover TypeScript literal assertion is removed. Its apply-k/vendor-auth and
separate scale-down behavior are verified by code inspection, with runtime
execution still pending. The Ansible structured YAML declaration test remains,
including digest-before-apply ordering; it makes no playbook execution claim.
The2 old structural canonical experiments are superseded/excluded from credited
production-path evidence, and the old cutover structural experiment is excluded.
The Ansible declaration check remains explicitly structural. Adjacent production
Proof comments now name the actual caller output failures.

Protocol counter correction for the SAME one real capture at source
`765c7dec791a049a79905fc56b63fed45a55542f`, artifact
`0a4f95b5d8e9c77da098d7d5a452119f4dde3c6b9101737d8ed5301bdd56a8cc`:
`prepareObservabilityRehearsal` itself returns the existing validation/build pass,
then `prepareRehearsalInventory` performs its validation/build pass and one Helm
render/bootstrap-frame production. Thus the ONE capture invocation/request
contains TWO canonical validation/build passes, ONE Helm render and ONE bootstrap
frame production. Observers were attached after preparation, so stored counters
of1 refer only to the inventory phase. This is established from the successfully
returned existing callgraph, not new global instrumentation. The12.539s command,
raw counters/logs and all captured bytes remain unchanged; there is no rerender,
accounting repeat, optimization or new production API. Independent scoped review
and full3.1/runtime/physical admission remain open.

## Task62 independent approval and Task64 intent — 2026-10-28

Independent review approved specification compliance and task quality at
`e1d2b497aaee44dade676ffdc882976bbce2c6c7`, complete0e336→e1d2 range, with no findings.
Review SHA256 `c84e9dcaefdf4dad3113fd7e74b654f673b6cd55a782502c68cc807eeb7971bb`.
Reviewer read the full103177-byte five-commit diff, named finite-quantity/tool-auth
risks and replacement caller proof logs; no passing check/capture was rerun.

Parent read the complete report, capture and final saved-comparison scripts,
all24 original named-failure/proof receipts plus2 actual-caller replacements,
and22 passing command receipts/raw logs. All220 indexed artifacts(218files+2tool
symlinks;29229097file bytes),16 scoped source/evidence files and85 payload hashes
match their recorded identities. All744 original file/symlink bytes/modes/targets
still match. The packet is a closed86-file root,2220347payload bytes plus136483
receipt bytes, with complete ordered commitment0a4f. Initial parent index audit
mistook a symlink record for a file and threw; the corrected explicit union audit
passed without test or capture replay. Corrected caller checks are3pass/10assert;
credited production experiments are12guards+9dependencies, with diagnostic and
Ansible declaration evidence kept separate. Retired structural substitutes are
excluded. The actual capture remains source765, one12.539s invocation containing
two existing validation/build phases, one Helm render and one frame production.

At published0e336, infra-check40671175014 is terminal success10:50:39Z: Fleet16m27s
and generic K3s14m51s. This is head-specific generic infrastructure evidence,
not the new Flux or common-stack runtime proof. Main CI40671174992 still had
workspace/Twilight running at the latest observation; required pixels failed
because pixels_mode122758256414 exceeded10minutes during frozen Bun installation,
before browser scope/tests. Its inner stall cause remains unobserved. No manual
rerun/cancel, timeout increase or gate bypass occurred. Reviewed62 may batch with
the next concrete64 source update to avoid redundant full CI runs; no intermediate
intent-only push is needed. Full goal remains active, canonical4/11.

Task64 is intent only here: no standalone fix or physical fit is claimed. Its
source-bound71680Mi omission is confirmed independently of current host placement.
New reader-only comparison will reuse the actual765/0a4f packet; existing captures
and runtime limitations remain attached to their observed revisions.

### Task64 — standalone source claim reservations

Pre-intent BASE: `e1d2b497aaee44dade676ffdc882976bbce2c6c7`. Root intent/SOURCESTART: `0430ac5064efb1c2e00a71a335a5fcfb890a9312`. Normal source commit: `1521c8ef36e46dd4fe7b0cd968da36bb93b02aed`; its hooks passed in 4.943s, with Tool Wiki explicitly inactive/uncertified because its external activation root is not provisioned. Implementation changes only the combined adapter/test, a scoped standalone-claim adapter, and export of the existing claim quantity helper. Native-only, public inventory and cold-start outputs are preserved; no owning resource, pin, graph, renderer, generator or runner changed.

Existing combined disk-total RED observed 0 rather than the required71680Mi delta (1.139s, exit1). The final covering run passed64 tests/300 assertions (12.449s), including all new declaration/consumer/malformed-late/collision/snapshot/closure cases and selected exact-native/generated/public-inventory/canonical single-pass compatibility. Three selected cold-start claim compatibility cases passed (0.547s). Fleet library/spec typechecks passed (1.575s/1.840s); changed-path lint passed (5.093s), format check passed (0.426s), strict owning OpenSpec validation passed one change/zero issues (0.661s), and diff whitespace passed. Exact argv, exits, timings and raw logs live in new `/tmp/puni-task64/commands.jsonl` and its receipt index; proof child argv are in `proofs.json`.

Only new/changed production-path checks/dependencies were faulted: schema map/enum/shape boundaries; complete claim prepass ordering; supported namespace/class/mode/binding/history classification; source-reference family/kind/exact namespace joins and missing-consumer obligations; declaration/reference snapshots; conditional obligations; omission/doubling and aggregation of claim charges; exact covered-blocker reconciliation and independent closure evidence. Forty-four intended negative observations across45 attempts restored exact pre-fault bytes. Adjacent `Proof:` comments identify the injected fault and observed production test. No old guard matrix was replayed. One source-group negative was initially masked by missing kind/name in its fixture; the corrected otherwise-valid dataSource failed when its new group constraint was removed. Its first individual log was overwritten by the corrected attempt, so that masked receipt points honestly to the retained aggregate raw run and earns no proof credit. The closure fault did fail the intended custom-message assertion; the harness initially misclassified its diagnostic, corrected by inspecting the same raw log without rerunning. Identity/API/request errors already refused by existing shared boundaries are controls, not new-guard proof claims. Initial fixture-family/boundary setup errors and initial scoped lint errors were corrected before final checks.

After the normal source commit and a clean tree, one actual existing-reader invocation consumed saved Task62 builds/rendered/prepared/bootstrap frames, the independently retained full packet receipt and85 packet payloads, exact packet lock/topology and declared horizons. Retained source stays `765c7dec791a049a79905fc56b63fed45a55542f`, artifact `0a4f95b5d8e9c77da098d7d5a452119f4dde3c6b9101737d8ed5301bdd56a8cc`; adapter revision stays distinct. One earlier setup-only attempt stopped before the reader because prepared topology has a separately bound selection while the build topology has only bytes/source. Corrected setup enumerated exact keys, compared bytes/source, and independently bound selection to the retained packet/inventory. Setup attempt:0 reader calls/exit1/0.780s. Actual control:1 reader call/exit0/2.508s. No provenance paths required adjustment, and there were zero actual producer/renderer/canonical captures.

The control reserves `puni-registry/registry`50Gi and `puni-backup/object-store`20Gi exactly once each: delta0Mi memory/0m CPU/71680Mi disk. Combined known contributions change from49984Mi/8670m/85696Mi to49984Mi/8670m/157376Mi. Embedded native JSON is exact (SHA256 `09ae7a904adeb8c25de204cfc37770b5427e2e1f6a022f113968e34aebeb84f3`), and all generated traits/lifecycles/entries/subtotal are exact. Only the two covered generic PVC declaration refusals are replaced with eight explicit fresh-attempt/history/retention/physical obligations; both declared-consumer ownership/retention refusals remain. New closure: `2aebc7500dc43861bf9aeb505f8b9ecfde138f07bba3e4f84f1b372857377b3a`. State remains incomplete, creationAuthority=false and runtimeAuthority=false. These are conditional whole-attempt known subtotals, not physical fit or steady sizing.

All266 original Task62 artifact entries, including packet payloads, retain exact bytes/modes. Before/after preservation manifests both hash to `e5c06b593c56432efb24754f25374dd42b758b158e8a6a0825f81202ed56395f`. New evidence is confined to `/tmp/puni-task64`; its `comparison-summary.json`, `capacity-ledger.json`, `payload-hashes.json`, `old-artifacts-{before,after}.json`, `proofs.json` and receipt index retain raw evidence. The private `task-64-report.md` records the complete commit/command/evidence handoff.

No full Fleet/Nx/app/browser/CI/host gates, old proof matrices/controls, renderer/producer runs, network/provider/runtime/SSH/Docker/Secret/store/hardware actions or final merge ran. Root owns fresh independent review and batched publication. The Task64 checkbox remains pending independent review; canonical runtime/live/physical acceptance remains open.

## Task64 independent approval and reviewed publication — 2026-10-28

Independent review approved specification and quality for complete
`e1d2b497aaee44dade676ffdc882976bbce2c6c7` →
`4224638ced8633189b7cc752e6c8e4af7eb202a4`, with no blocking findings.
Report SHA256 `53e3f16a7b9d14010b6698e0cdf4436a37a7aa8a4274bcee401aed1a0d8f5ff4`.
The reviewer inspected the complete76374-byte diff and named source classification,
collision, test-capture and single-preparation risks; no test/proof/control replay.
Malformed name/namespace cases can stop in existing frame capture and are not new
reader-proof credit. The first masked source-group attempt is excluded; its lost
individual log is disclosed, aggregate receipt retained, and corrected proof has
its own intended raw failure/restoration. The custom-message closure failure was
confirmed from raw output without replay.

Parent read the complete implementer/reviewer reports, exact comparison/proof
scripts,44 intended raw fault logs,15 final command receipts/raw outputs and the
single actual reader result. All95 indexed artifacts(4155503bytes),4 committed
source files and266 prior entries(219files/45directories/2symlinks) match their
recorded hashes/modes/targets. The156-entry sum is independently49984Mi memory,
8670m CPU-request,157376Mi disk;132 native and22 generated entries remain exact,
with2 standalone claims adding71680Mi. Exactly2 generic refusals become8 concrete
obligations; consumer retention facts remain. No old passing execution was rerun.
These are incomplete conditional source totals, not observed usage or a hardware
purchase specification. Creation/runtime authority remains false.

Published0e336 CI40671174992 is now TERMINAL CANCELLED11:50:16Z. Workspace job
122758256508 exceeded its90-minute budget (10:19:50→11:50:11), after successful
test/typecheck/build execution for52 projects/140tasks (reported79m16s,0cache hits).
Its retained artifact12813431651 is581413bytes, ZIP SHA256
`ffb3569bedc6f9f23ca6a9705179692d4999a67a83e1eacf992b5ec34dbbea79`;
the4363893-byte Nx log shows193 unique project:target starts, with no exact
duplicate starts. All53 lint tasks were launched; their completion and subsequent
source-lint remain unverified. The last printed target is not proof of the active
or slow target. Two tool-devsync warnings are visible; no clean full-lint claim.
No timeout increase, scope reduction, manual cancellation or rerun was requested.
Twilight122758256446 passed60m15s; infra40671175014 passed. Stable gate122798249355
failed on cancellation; stable pixels122762921978 failed because browser scope's
Bun install exceeded10minutes. These verdicts remain specific to0e336. The next
reviewed batch requires ordinary new-head CI; it cannot inherit passing gate
verdicts or claim that tests failed when only the job budget is established.

Current authenticated-source preparation is separate from runtime acceptance:
the actual85-payload765/0a4f packet is retained and independently hashed. A new
local root artifact commit c793ee89 contains exactly86 files/2356830bytes and no
monorepo parents/workflows; existing plaintext scan passes and every Git blob
matches the packet. It is not remotely published here. A19415-byte frozen-code
bundle is prepared for765 with public0e336 prerequisite; no code-branch push is
needed merely to stage it. Fresh read-only h4 preflight confirmed the existing
cached client/image, Docker29.1.3 binding daemon and sufficient component-only
2GiB/8GiB floors; no Git fetch/container/host/credential mutation occurred. The
private execution package remains UNRELEASED: review found failure-stream bounds,
timeout receipt and cleanup-resumption gaps, being corrected before any execution.
No managed credential changed or copied into Kubernetes. Full goal stays active,
canonical4/11; production, persistent Secrets, destructive retirement and final
implementation merge remain separately authorized.

## Task66 retained agent ephemeral source policy — 2026-10-28

Immutable pre-intent BASE: `94ee760c80f01de40ef27c7d87b6669edbdf5435`.
Root four-artifact SOURCESTART: `73516da500aaf926f2075b51ea64dc62be6d4e9a`.
Normal source commit: `3108efc302e02158980239c2ff13ae429f1d7969` (eleven source/config/test paths; normal hooks passed).

Current owning collector values declare ephemeral request 16Mi / limit 64Mi. Both
Velero placements declare node-agent request 256Mi / limit 2Gi, disable default scratch,
and supply exactly one existing scratch volume/mount with 1Gi at /scratch. These
are authored, unmeasured containment policies. Historical valid absence remains
image-readable; malformed supplied maps/scratch refuse. Worker otel-agent stays exact.

The service-source graph contains the collector; Velero is selected separately.
Collector correspondence is mandatory through assertRenderedObservabilitySource.
Every selected Velero release now checks the final authenticated-renderer output
through the same narrow assertion after the unchanged Deployment postrenderer.
It requires exactly the named DaemonSet/app, complete matching resources, no
additional app/init/ephemeral roles, matching scratch and preserved host mounts.
A second scratch name using another volume type and colliding host mounts refuse.
The final Velero selection also refuses an extra same-chart DaemonSet.

Genuine ordered RED: 01-current-red (0 pass / 3 fail; actual validatePlatform previously
resolved for absent collector and both node-agent policies),05-public-output-red
(full public source validator returned a 191-resource receipt against historical
output ignoring current collector policy),21 scratch identity/22 host overlay,
and 30 extra-workload RED. New production guard/forwarding faults: 28 independent
cases in proofs.json, plus the final exact-one workload dependency fault in
proof-final.json. Every mutation restored identical source bytes. Three of the 28
are historical compatibility controls, not invalid-input admission proofs.
Adjacent Proof comments identify the observed faults/tests.

One scoped covering command 25 passed 133 tests / 187 assertions in 15.450s. Follow-ups
29 (4 tests),31 (four renderer/postrenderer cases),34 (three corrected zero-limit
cases), and35 (final extra-workload fault/restored negative) cover only later edits.
Final Fleet lib/spec Nx typecheck 37, scoped lint 27 + 38, format 39, whitespace 40 and
strict owning OpenSpec 17 pass. Initial scoped static failures 15/16/18/26 were fixed;
source 42 hooks passed in 5.283s. Tool Wiki reports inactive/uncertified because its
external activation root is unprovisioned; no hook was bypassed.

Selected locked integration:10 performed two real local Helm templates before a
harness API-index mistake;11 performed four actual collector/Velero local/production
templates and retained selected-local.json/selected-production.json. Its 35 earlier
assertions passed before an unrelated unchanged production fixture marker mismatch.
12 and25 reused those saved outputs with no template invocation: exact new
resource/scratch values, existing Deployment capture/quantity reader, cross-placement
DaemonSet equality and local public source positive passed. Removing only the new
policy leaves reproduces the historical local selected semantic view.32 separately
proves all other owning declaration semantics and exact postrenderer bytes unchanged,
with prior artifacts/pins/worker/parity code and modes untouched. No whole capture ran.

Uncredited setup/masked cases:04 wrong historical Elastic profile;06 generated
collector extraLabels outside base schema;07 correct refusal with too-narrow test
message;09 graph selection mismatch before rendering;10 backup CRDs in service API
index;11 unrelated cached production marker;21 two host-overlay cases without the
injected mount (its scratch identity case was genuine);31 three zero-limit cases
before fixture injection was corrected in 34. The 20 command's final renderer-selection proof
actually failed as intended, but the harness regex omitted the word value from
Received value: null; 23 records correction from raw evidence without replay.

Raw command/output/hash/time index: /tmp/puni-task66-evidence/index.jsonl. Each
label has .json/.stdout/.stderr; proofs.json and fault-*.patch.json retain mutation
hashes, proof-final.json the final guard restoration, selected-summary.json the
four retained output/tool hashes, and preservation.json the BASE/SOURCESTART audit.
The ignored task-66-report.md records exact source/STOP SHAs and the complete index.

Skipped/unverified: owning full-render source suite's two added table entries were
not separately executed; their helper/public boundaries are covered with selected
and historical fixtures. Whole-source current production parity, full Fleet/app/
browser/host gates, runtime sufficiency/recovery, whole-path quota, persistent
history/device/writer/enforcement closure, host admission and live convergence stay
unverified. No install, provider/network/SSH/Docker/live/Secret/history/floor/CI action,
push or merge occurred. Canonical3.1 and canonical4/11 remain open; parent owns task
checkboxes, independent review and publication. Source-only STOP follows evidence.

## Task66 independent review and Task67 CI diagnosis

Independent specification and quality review approved94ee760c8→0b7f95373
with no findings. Root read the complete report/review and proof/preservation/
selected-output scripts, rehashed315 artifacts (8,110,010B), all11 source paths
against SOURCE3108efc3 and79 command-stream pairs. Root read all29 intended raw
failures:3 historical compatibility regressions and26 invalid-admission/forwarding
faults, including the final selector fault/restored pass bound to committed bytes.
The earlier verify prefix and3 cached tool hashes match. No check, proof, capture
or render was replayed for review. The source-only checkbox closes; whole-source
current production parity, physical/writer/history/enforcement, runtime/live and
full3.1 remain open. Tool Wiki remains inactive/uncertified as disclosed above.

Published94ee ordinary infra40687402171 failed in fleet-check122813194029:
controller build passed, tool-fleet:test ran12m7s, then the concurrent tool cache
test failed at observability-tools.test.ts:172 because the final inode equaled
the original unretained inode10013067. Child exits/private executables/digest
reads completed before that assertion; later assertions did not run. Deploy
checks and K3s rehearsal were skipped. Raw780713B SHA256
`c93f7c31664cd62a9f9943cd42ec4a607b99705485151712b561a6956031b8df`
is retained in the private task-67-ci-diagnosis directory.

The fixture/test had no0e336→94ee change. Root inspected both completely:
each child publishes by same-filesystem rename, but the test releases the
original file identity before comparing a reusable numeric inode. The
[Linux unlink contract](https://man7.org/linux/man-pages/man2/unlink.2.html)
keeps an unlinked file alive until its last open descriptor closes. Task67
will retain that original handle while checking replacement, preserving the
assertion and fixture behavior. Actual CI observed equal IDs, without an
allocation trace; the local minimal probe showed later inode recycling but
did not reproduce original-ID reuse. No exact local reproduction is claimed.
No CI rerun, policy/timeout change or broad gate was performed. A focused
test correction restoring the documented contract is within the R4 exception.

For published94ee, pixels122825150724 and Twilight122813440596 are now success;
workspace122813440509 remains in progress at the latest read. These are94ee
verdicts, not verification of unpublished66 or pending67. The previous0e336
terminal runs were not polled again.

Task65's reviewed86-file/2.36MB packet remains local. Automatic approval review
rejected publication before process creation because the prior authorization
did not explicitly cover exporting this particular derived infrastructure
payload. Explicit user approval for only the new artifact feature branch is
pending; no retry, workaround, publication, approved execution release, staging
or client operation occurred. Unaffected source work continues. No h3mon resize,
hardware purchase, Secret or live rollout change was made. The original16GiB/
120GiB rehearsal values remain distinct from permanent monitoring sizing.

## Task67 — deterministic concurrent cache-publication evidence

Source/clean STOP847ad20d63058c66f25a4e93a1e50b6f531e0bf1 changes only
observability-tools.test.ts. It opens the original archive read-only, reads its
identity through that descriptor, retains it across both actual child preparations
and all existing assertions, then closes it in finally. Every child, digest,
replacement, private-executable, shared-directory and unrelated-file assertion
remains. The fixture/installer and CI behavior are unchanged. This restores the
existing precise atomic-publication test contract under the R4 exception.

Exact focused command, with the quoted -t value as one argument:

```sh
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-tools.test.ts -t "locked fixture concurrent preparations publish complete archives with distinct private executables"
```

One deliberate fault omitted only the actual fixture's archive rename. The
focused test failed at the unchanged inode replacement assertion (0pass/1fail,
76assertions,2.152s command). Fixture restoration was byte-exact before green:
SHA256d884dafca1fb04e0fab5ab92f523f1dec3d9aab93c490717c76b096a91751b91.
The restored focused run passed1/1,122assertions,2.902s command. Each run used a
new cache seeded from already locked local archives; necessary private extraction
is the subject of this test. Original archives retain hash/inode/mode/size; no
download or permanent installation occurred. Format, scoped lint and Nx Fleet
typecheck passed (0.250s/3.213s/2.571s), followed by normal hooks and clean STOP.

Independent scoped specification/quality review approved without findings.
Root read the complete report/review and raw intended fault/restored output,
rehashed54 artifacts46,711B, matched the committed test and exact original fixture,
independently compared the sole omitted line and both cached inputs. The first
root audit expected a different fault-comment literal; inspecting the retained
diff corrected that audit expectation without changing or rerunning production
code/tests. Genuine CI RED and the local probe's nonreproduction remain as
documented above; this negative is not an allocator-reuse reproduction.

No broad Fleet suite, full CI/job/host gate, prior Task66 checks, deploy/K3s or
runtime/live acceptance was replayed or claimed. Tool Wiki remains visibly
inactive/uncertified. Actual raw receipts and source binding remain in the
private task-67 report and /tmp/puni-task67-evidence. Canonical4/11 and full3.1
remain open; source66+67 can be published together for their own ordinary CI.

## Post-publication CI and live prerequisites — 2026-10-28

For code headb0a38e44, ordinary infrastructure run40698040215 passed. Its actual
synthetic-merge checkout baf886d0 has b0a38e44 as second parent. The retained job
log records3937Fleet/828Deploy tests with0fail, lint/typechecks/artifact checks,
the repaired cache test, the full actual pinned source/parity positive and both
new full-source Task66 cases. This closes the earlier local-only whole-source
coverage limitation. It does not establish runtime acceptance. The Kubernetes
CI job covers deployment/Traefik, not the common observation stack. All browser
shards and stable pixels passed; the main aggregate gate remains pending at the
latest read. No manual tests/jobs were repeated for this observation.

Fresh read-only live inventory confirms the immutable target/source identities,
suspended observation/alert/backup stages, absent dev namespace and empty required
Secret metadata lists. The root target now reports HealthCheckFailed. Fresh
machine/daemon/PID-bound observations show both known target hosts remain below
the16GiB available-memory floor; h4's unrelated workload also has no finite memory
or CPU cap through its observed ancestors. Both production floor invocations
refused the captured counters without rendering or provisioning. Quota enforcement,
complete physical budget and full live preflight remain unverified. No unowned
workload, history, credential or resource setting was changed. Raw receipts,
code/test coverage and semantics are retained in the private task-68 report.

The separate generated-packet export remains rejected by automatic approval review
pending explicit user authorization. A larger existing isolated host has been
requested for inspection; no machine purchase or h3 resize is authorized. Full
rehearsal/live cutover remains open. Current source checks cannot substitute for
those runtime requirements.

## Completed CI and CodeQL fixture corrections — 2026-10-28

The previous b0a38e44 main CI run 40698040166 completed successfully at 15:00:21 UTC,
including stable gate and pixels. Workspace 122850943372 ran 81m36s: dependency
installation 9s, formatting 2m27s and its test/lint/typecheck/build step 75m57s.
Twilight ran 52m10s. These are execution observations, not a queue diagnosis.
Infrastructure success and its source-parity scope are recorded above.

The separate CodeQL result check 122850216411 failed with two fixture annotations,
even though workflow 40698028967 and all four analyzer jobs succeeded. The result
identified first-newline replacement in the deliberately corrupted manifest and
dynamic JavaScript construction in a delayed child test. Both sources are test
fixtures; no production vulnerability reproduction is claimed. Retained provider
annotations and the full rollup establish this distinction.

Source 52faa917 changes only three test files, 8 additions/2 deletions. Explicit
byte concatenation preserves precisely the original LF-to-space fault without
changing size, JSON meaning or trusted manifest identity. The archive negative
now requires the exact production blob identity/size error. A static delayed child
program receives its original payload through argv instead of generated code;
200 ms output,1000 ms keepalive,30 ms abort and cleanup assertions remain unchanged.
This restores existing precise contracts under the R4 correction exception.

Retained final focused verification passed 5 tests/14 assertions in 440 ms. Scoped
format/lint/file-rooted TypeScript checks passed; this is not a full Fleet typecheck.
The actual byte control found exactly one changed archive byte and the real child
control observed its original payload/name/id after 205.65 ms, then killed/reaped it.
An initial assertion-prefix mismatch is retained and corrected; it is not credited
as a production safety fault. No production guard changed or old proof matrix ran.

Independent specification/quality review approved without findings. Root read the
report and retained raw receipts, matched all three committed source hashes and
verified review SHA256 ec83c1406de145a8eec69a11e4f63cf6e11c28d8f9aa2cff09a0fb0349cb1147.
Private task-69 report/checks retain exact commands and outputs. No passing test,
chart or provider run was repeated for parent review. Actual CodeQL clearance
requires a new result on the next ordinary published head; it remains unverified.

Tool Wiki remains inactive/uncertified because its external activation root is
unprovisioned. Full 3.1 and canonical 4/11 remain open: complete physical admission,
authenticated common-stack rehearsal and live signal/history/recovery acceptance
are not established by these checks. Preliminary 16 GiB available-memory/120 GiB
store requirements describe rehearsal, not permanent h3mon sizing. No resize,
production activation, Secret change, storage retirement or final merge occurred.
The separately rejected generated-packet export still awaits explicit permission.

## CodeQL result on the corrected head — 2026-10-28

At 15:32:11 UTC, the actual check-runs API for published head 49857aa29 records
separate CodeQL result 122912191913 completed/success, title `No new alerts in
code changed by this pull request`, zero annotations. The earlier neutral
missing-JavaScript-configuration result was interim while that analyzer ran;
it is superseded by this final result. No analyzer success was substituted for
the result. Task 69's provider-clearance obligation is now complete. This claim
is limited to new alerts in the changed code, not all existing branch alerts.

Main workspace/Twilight, Fleet and browser checks remain running at that read.
The same read-only main watcher 45274 is live; no CI restart or manual rerun
occurred. Raw result, exact head and timestamp are retained privately. Full
runtime/live acceptance remains open; the deployed dev service is unchanged.

## Capacity scope clarification — 2026-10-28

A source-only extraction at 49857aa29 separates seven authored application
container limits: dev 5888 MiB (5.75 GiB), production 7936 MiB (7.75 GiB), combined 13.5 GiB.
All six source hashes were unchanged before/after. This excludes generated/init/
reloader roles, controllers/agents, platform/host, preserved services, memory
volumes and migration/lifecycle costs; it is not complete admission or usage.
Current Elasticsearch store declarations are dev 10 GiB/production 100 GiB. The older
request-based coexistence budget and conditional full-rehearsal ledger answer
different questions and cannot certify permanent h3mon sizing. No resource limit,
retention, floor, workload, host, credential or runtime was changed. Exact receipt
and remaining steady/migration/rehearsal evidence needs are retained privately.

## Capacity runbook reconciliation — 2026-10-28

The enrollment runbook's October19 request-only comparison was still described
as resolving memory admission. It now retains the dated observations explicitly,
corrects the total-memory unit and directs current activation to source-bound
preflight. The preflight runbook distinguishes permanent, migration and full
rehearsal budgets without introducing new numeric allowances. Source budget tests
and authored requests are no longer presented as complete effective admission.

Changed-file Prettier and `git diff --check` passed; both linked document targets
and the capacity heading exist. Parent inspected the complete diff against the
current budget implementation, selected tests and preflight contract. No behavior,
resource policy, safety guard or runtime changed; no application tests, render,
host probe or old fault matrix was required or run for this documentation correction.
The documentation remains local while the published head's ordinary CI finishes.

## Current Fleet evidence and runtime prerequisites — 2026-10-28

Published head 49857aa29 passed Fleet job 122911791369 at 15:44:20 UTC after 20m48s.
The actual checkout c5b427e3e6d35a02aaba0f124bc0e686069918d3 has parents
e3f7d5ba37e80ce4d04e82c546792f17892e4069 and
49857aa2903fa56feea389211a36624c26bbdb19, independently joined through checkout
log and commit API. Fleet reported 3937 pass / 7 opt-in skips / 0 fail across 3944 tests,
108 files, 1046.82s; Deploy reported 828 pass / 0 fail across 32 files, 68.20s. Fleet
check/lint/typecheck/artifacts and Deploy checks completed successfully.

The actual manifest refusal, archive positive, creator abort and cache-publication
cases passed. Seven authenticated-backend component tests remained skipped because
PUNI_AUTH_ELASTIC_LAB was absent, matching the previously recorded opt-in set.
Earlier Task 5 component evidence was not replayed; these skips do not establish
current live backend authority or common-stack Kubernetes acceptance.

The retained raw log is 986071 bytes, SHA256
bba481786f9a7346793b040758840d18aa65f3f56ca1ecabd56cb586df25aa78.
Initial log retrieval stopped at gh terminal-escape protection; successful capture
retained bytes privately and printed only JSON-escaped summaries. This was a
read-only capture retry, not a CI/test failure or rerun.

At 15:49:47 UTC all four browser shards and stable pixels are success, along with
CodeQL and Fleet. Main workspace/Twilight and the deployment/Traefik Kubernetes
job remain running. The existing watcher 45274 is live. These jobs continue
independently; none was cancelled, restarted or manually rerun. Their pending
results cannot establish full CI success or common-stack runtime acceptance.

Full progress remains 4/11. The same runtime prerequisites remain unresolved
across successive goal turns: explicit permission for the exact prepared generated
packet publication after automatic review rejected its export, and selection of a
larger isolated host for complete physical admission/rehearsal. No such approval
or host has been supplied. Current h3/h4 counters fail the unchanged floor; no
purchase/resize or unowned-workload change is authorized. Remaining authenticated
Flux/Kubernetes/effective-Pod/CNI/storage, stored signals/operator views/isolation,
history/recovery and live dev acceptance require those prerequisites. A source or
component success cannot substitute for them. Production activation, persistent
Secret changes, destructive storage retirement and final merge remain separately
authorized operations. The working dev service and retained history are unchanged.

## Resumed publication review and terminal CI — 2026-10-29

The resumed goal retains the full original objective and starts a fresh blocker
audit. The prepared 86-file source 765 packet remains unpublished; renewed goal
activity is not explicit approval of its previously denied public export.

A read-only publication review revalidated all 85 payload hashes and compared the
86 packet files with published code 49857: 51 identical, 9 changed, 26 new paths.
All eight chart archives are byte-identical to that published commit. Bounded
in-memory inspection covered 610 archive/decode members, 16092682 expanded bytes
and 687 text payloads, including the bzip2 CRD payload that the prior scanner did
not inspect. No archive content was extracted or executed. Parsed 238 authored
YAML/JSON documents and embedded configurations contained no literal Kubernetes
Secret resources; three password fields and nine credential environment entries
use runtime references. Reviewed authored candidates are certificate configuration
or runtime references; the token-shaped vendor hit is an X-placeholder example.
No live credential was identified in these inspections. Generic secret detectors
Gitleaks/TruffleHog are unavailable; arbitrary opaque/base64/custom credentials,
unrelated Git history and supply-chain vulnerabilities are not exhaustively
covered. This is not proof of universal absence or permission to publish.

The packet does reveal service/namespace/port/version/storage/security topology,
Secret/key names and two retained private peer /32 addresses alongside synthetic
rehearsal coordinates. Publication requires an explicit owner decision; the
immutable packet was not sanitized or changed. The private publication review
retains exact reader limits, hashes, contextual candidate disposition and two
inspection-harness diagnostics (unhandled bzip2 content, then console formatting),
corrected without product/test/source mutation. The automatic export denial
remains unresolved; no push, release, credential client or deployment followed.

Current published main CI 40715462139 is terminal cancelled, not still running.
Workspace 122912222892 exceeded the 90-minute job limit; its verification step
ran 15:28:24–16:54:32 UTC before cancellation. Stable gate 122965457030 failed as
required. Twilight completed successfully in 61m50s, all pixels and CodeQL passed,
and infrastructure including deployment/Traefik Kubernetes completed successfully.
These successes do not override the failed required gate or establish full
observability runtime acceptance. Former watcher 45274 is now absent; actual
provider terminal metadata, not that absence alone, establishes completion.
No replacement observer, manual rerun or timeout increase occurred.

Retained workspace artifact 12834073187 has verified ZIP digest
1e83659e8bf86003ca41d6ddcd5fb00ca1557faaba4c5aa65ba2db0a75a3315a.
The 4403770-byte Nx log SHA256 is
6d91126bb6a5ca92c719a9cc0fcb7c5abced64f70dfc6c62513507621db4ee81.
It ends after WBS backend 3836 pass / 3 skips / 0 fail and entry into frontend typecheck;
it does not contain a successful final runtime-command receipt or workspace lint
completion. The actual plan selected 52 workspace modules and no file-selected test
commands. Largest reported test-command durations are backend 2168.30s,
Fleet 1356.81s and devsync 1028.55s. These overlap on two workers and must not be
summed into wall time. Baseline b0a passed with shorter durations; the exact cause
of the slowdown/frontend in-flight time remains unproven. A terminal timeout
requires investigation, not an observability behavior change or assumed pass.

Full physical admission, authenticated source/Flux/Kubernetes/effective Pods/CNI/
storage, correlated signals/operator views/isolation/history/recovery and live
dev acceptance remain open at 4/11. No host upgrade, persistent Secret, production
activation, destructive retirement or final implementation merge is authorized
by this review. Existing working dev/history and all packet bytes are preserved.

## Approved packet publication — 2026-10-30

The user explicitly approved publishing the reviewed packet. That authorization
supersedes the prior unresolved export decision for this exact payload; the
historical automatic rejection remains recorded. Before publication all 86 reviewed
file hashes and all 14 execution-package identities matched the retained review.
No scanner, chart, test, runtime component or old proof matrix was rerun.

One ordinary non-force push created
`feat/observability-parity-source-765c7dec` at artifact commit
`c793ee8919f1b401fa00dab790c767b36f931322`. The complete remote root tree
`b9b4324fd7c279a6b476e259e1add8f82821d76e` contains exactly 86 reviewed blobs with
matching paths, modes and Git identities, no parents and no truncation. The old
artifact branch still points to 2a63a99f2005eb9770695f11e5dbcba4f10ad703 before
and after. The managed source repository identity also matched the destination.
Root inspected all 12 command outcomes and the complete publication proof; normal
branch-absence exit 2 was distinguished from failure. There was no unknown outcome,
force push, replay or export beyond the approved packet. Proof SHA256:
`04288eebca7d6f4b013592d4b844ba51ceeffddb60d04183800ecd3d0d3780dd`.

The artifact is the reviewed source 765 packet, not a new capture of later resource
policies. Publication closes only the export prerequisite: source-client trust/
authority and authenticated binding, physical admission, full Kubernetes/runtime
rehearsal, signals/views/isolation/history/recovery and live dev acceptance remain
open. Existing dev and telemetry history are unchanged. No main/code-head/old-ref
change, merge, deployment, persistent Secret, storage retirement or host upgrade
occurred. Goal remains active at 4/11; packet approval does not authorize those
separately gated operations. Reviewable approval, command streams, remote closure
and hashes are retained in the private packet-publication-2026-10-30 evidence.

## Actual authenticated source verification and cleanup — 2026-10-30

After approved publication, the retained source 765 component completed actual
read-only authenticated packet verification on h4claw. Fresh preflight confirmed
the existing Docker 29.1.3 daemon/image, retained source/dependencies/tools and
managed credential file metadata without copying credential values into inventory.
Available memory 12765319168 bytes and free disk 112972922880 bytes passed the unchanged
component-only 2 GiB/8 GiB floors; full rehearsal remains unadmitted.

The first owned attempt stopped before client execution: Docker reports canonical
NetworkMode bridge whereas the checker expected default. After a reviewed exact
bridge correction, cleanup exposed local-driver default compression conflicting
with max-file=1. That container never started (created/Pid=0/zero timestamps/no
start receipt). Its log-capture failure remains explicit. A concrete exact-ID
operator removal used no force or volume deletion; subsequent observations prove
absence and baseline preservation. Its owned scratch and diagnostic evidence remain.

Three narrow private-package corrections restore the existing provider contracts:
exact bridge plus explicit create network; explicit compress=false with the same
local driver/max-size=1m/max-file=1; and the exact lowercase Docker missing-object
message containing the requested ID. Missing/unknown values still refuse. These
are precise contract corrections under R4, with no product model/API or provider
pin change. Resource ceilings, read-only mounts/root, capability/PID restrictions,
restart=no, bounded streams, deadlines, retained history and no-replay rules remain.
Each correction received scoped independent specification/quality approval without
findings. Their final focused controls passed 12/10/21 assertions respectively,
with genuine old-code REDs and watched production-path network/log/ID-membership
faults losing their intended negatives, followed by exact restoration and adjacent
Proof comments. Syntax checks and current valid fixture acceptance passed. Existing
40/72-check matrices and prior passing render/proof suites were not replayed.

One justified fresh attempt used the corrected package; the failed original start
was never replayed. Actual client execution ran 12:56:40.545750217–12:56:59.876658011 UTC
(19.330907794s), exit 0/no OOM, under 1 GiB/one CPU/256 PIDs and a 600-second deadline.
Prebind traversed 112815 dependency entries with strict resolved-link containment,
imported actual arktype/yaml and resolved the Fleet alias to the frozen source.
The client validated the packet and authenticated-fetch compared the exact root
artifact against source 765, including all payload/provenance bytes. Source/generator
revision 765 was clean; artifact c793 and packet 0a4f matched. CLI stdout JSON equaled
the exclusive binding receipt; stderr was empty. Binding receipt SHA256:
`9fb561b70dcfba2caacc549df5513cf413f1b10ddddc23490128fc7af6927a9d`.

Cleanup retained 27329 stdout bytes and 0 stderr bytes, removed the recorded exact
creator once, then initially refused the unrecognized lowercase absence diagnostic.
Read-only reconciliation confirmed absence and baseline resources present. After
the reviewed exact diagnostic addition, the same cleanup reused the retained
streams/stopped/removal receipts and wrote its final cleaned receipt; no second
removal, new client or restart occurred. Baseline containers/images, original
workspace/receipts and telemetry history remain preserved; no volume deletion.
Final cleanup receipt SHA256:
`652b5784e43f9fbb856332790a875680da0dc6bfe7f5b9646fa3283f1e336957`.
Root independently retrieved/rehashed the proof and both streams and inspected
all three complete review reports, actual negative/restored outputs and final
17-entry package manifest. Private task 70/70b/70c reports, raw command receipts,
complete package snapshots and artifact manifests retain reproduction evidence.
Docker's local-driver contract documents compression enabled by default and the
explicit false option: https://docs.docker.com/engine/logging/drivers/local/.

This closes the authenticated source-component prerequisite for reviewed source 765.
It does not certify the later source 66 policy, full common-stack rehearsal or live
migration. Trust approval and global credential privilege scope remain explicitly
external/unverified. HandoffExecuted, runtimeAcceptance and liveBinding remain false:
no cluster apply or persistent Secret operation occurred. Complete physical capacity,
effective Pods/CNI/storage, stored signals/views/isolation/history/recovery and live
dev acceptance stay open at 4/11. Current implementation CI still lacks a passing
required gate after the recorded 90-minute timeout; no rerun or policy change occurred.

## Additional source-key permission evidence — 2026-10-30

Read-only repository deploy-key metadata and an on-host public-identity derivation
now identify the managed source key as the unique matching enabled GitHub deploy
key with read_only=true and provider verified=true. Private key bytes remained
on the existing host; no private credential copy, key grant or mutation occurred.
The comparison uses the actual configured private key's derived public fingerprint,
not an assumed matching .pub sibling. All three GitHub host-key entries selected
from the existing pinned trust file also match GitHub's published HTTPS metadata.
These are current provider-specific observations, outside the shared domain model.

GitHub documents deploy keys as scoped to a single repository and able to be
read-only: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys.
The result establishes this key's observed GitHub repository read scope; it does
not attest other services' use of that key or replace independent trust approval.
The earlier immutable component receipt still states external/unverified trust
and global credential scope. It was not rewritten to imply later observations
were available during that run. Future checks need their own fresh metadata.

The first fingerprint inspection assumed no optional OpenSSH public-key comment
and refused before returning the projection. Its dependent local comparison also
refused the absent observation; no empty success was substituted. Correcting the
inspection parser produced only public fingerprints, after which the retained
provider metadata matched. No Secret value, key comment or private key material
was exported. Actual provider permission and trust metadata, safe fingerprint
projection and command diagnostics are retained in the private source-key-authority
evidence manifest. No source-component test, CI, chart or runtime was rerun.

Full physical admission, larger isolated rehearsal target, Kubernetes/Flux handoff,
effective workloads/storage and live signal/history/recovery acceptance remain
open at 4/11. This permission observation does not authorize a host upgrade,
persistent Secret change, production activation or final implementation merge.

## Three capacity budgets and hardware targets — 2026-10-31

The user requested completing separate normal, migration and full-rehearsal budgets
before choosing an upgrade. The canonical result is docs/infra/observability-sizing.md,
linked from the existing preflight. This is documentation/research under the R4 docs
exception: no source behavior, admission check, resource policy or capacity floor changed.

Two independent research tasks read current owning definitions, retained pinned outputs
and the existing ledger. The memory extraction accounts for35native and8generated roles,
ordinary init sequencing, reloaders, shared owners, per-node agents, complete declared
replacement/retry/history scenarios and CPU requests versus limits. Source765/packet0a4f
remain distinct from current49857implementation; inspected owning diffs alter only agent
ephemeral/scratch policy, preserving memory/CPU. Source-role full-rehearsal memory is
49984Mi plus2688Mi previously uncharged known OTel/Velero node-agent scenario slots.
This is conditional planning allocation, not observed simultaneous RAM.

Fresh bounded read-only existing-operator commands completed for h3mon/h4claw in
2.441/2.456seconds at13:48UTC. They verify existing machine/daemon/PID identities and
project CPU count, memory controls and complete statvfs counters. Both hosts have8CPUs
and15.237GiB guest RAM. h3mon has23.314GiB used/120.432GiB service-available disk and
13running Docker containers with8GiB combined finite memory limits; h4claw retains
unbounded OpenHands. A separate three-query Kubernetes projection at13:50UTC records
2Ready nodes,25Pods and2Bound claims without exporting Secret or environment values.
No workload, store, credentials, trust, host setting or provider resource was mutated.

Proposed allowances explicitly cover host/runtime services, read-only/admission memory,
maintenance and copy/import workers, image/content/expanded/archive copies, hostPath
writers, logs, retained bytes, store growth and export/rollback workspaces.20percent of
total usable capacity remains unallocated, so the formula divides by0.8. They provide
planning categories and bounded proposed scenarios, not existing enforcement or measured
sufficiency. Root independently checked261 arithmetic/input-identity comparisons across
43roles,6disk scenarios and20input hash checks. No renderer, producer, tests, old control,
full Nx/host gate or CI job was replayed. Initial research extraction/hash-API setup
failures are retained in the reports and not credited as passing evidence.

Independent documentation review found two Important clarifications: preserve the original
16GiB-available/120GiB-active preliminary prerequisites and all recovery/history acceptance,
and state the finite lifecycle contract explicitly. Both are resolved. A minor scratch
headroom observation caused root to increase the proposed normal pair ephemeral tier
from12to16GiB (migration24to28), leaving4GiB above the conservative known contributors.
The changed three-scenario arithmetic passed19additional independent comparisons;
unchanged memory/source checks were retained. Final review approves documentation only.

Final planning minima: normal h3monitoring31.4844GiB guest RAM/340.3926GiB service disk;
migration59.8438GiB/455.3926GiB with reused claims, or630.3926GiB disk with another whole
pair's retained claims; fresh isolated rehearsal79.2969GiB/407.2656GiB. Moving all platform
controllers onto the migration host raises RAM to74.8438GiB. Candidate profiles are64GiB
monitoring RAM with600GB+disk for migration, and128GiB-class RAM/512GBdisk for a fresh
isolated lab, subject to actual guest/filesystem capacity. CPU profiles and all remaining
writer/worker allowances are proposed policies, not benchmarks. Official provider mapping
is separately labeled; no price or regional availability is asserted.

Finite scenarios bind one immutable-source operation, its declared retry/history horizon
and first replacement wave. Forced deletion, lost-node duplicates, further Helm/Flux
recreations or retained attempts require more allocation/fresh admission. Reusing a claim
charges it once; another physical generation is additional demand. Proposed backup-fixture
allocations cannot reduce required recovery cases or retained history; enlarge the budget
if a required corpus exceeds them. Existing used bytes stay charged once, and no process
shutdown grants storage deletion or free-space credit.

Private budget-planning-2026-10-31 evidence retains the two research reports/calculators,
current input hashes, host/cluster projections, independent arithmetic receipts and final
review. Budget planning is complete for these declared scenarios. Actual aggregate caps,
effective Pods/cgroups, physical devices/quotas/writers, throughput/retention sufficiency,
Flux/Kubernetes deployment, stored signals/views/isolation/history/recovery and live-dev
acceptance remain unverified. No runtime checkbox or canonical4/11 milestone was closed.
No hardware purchase/resize, production activation, persistent Secret change, destructive
retirement, implementation push or final merge occurred.

Documentation formatting completed for all three changed files. Strict owning change
validation passed1change/0issues (34ms). The final documentation review has no open
Critical or Important findings. Software/runtime tests and full host gates were not
run for this documentation-only change; they are not inferred from arithmetic checks.

## Hardware recommendation withdrawn; actual dev baseline — 2026-10-31

The user challenged the large hardware recommendation for a platform without users.
The earlier arithmetic is internally consistent but does not establish a justified
purchase: it combines the complete two-instance source, configured store capacity,
conditional attempt/replacement allocations, unmeasured overhead tiers and20percent
headroom. Treating that envelope as measured concurrent demand was incorrect. The
64/128GiB, CPU and disk purchase recommendations are withdrawn in the sizing note;
its earlier figures remain historical audit evidence. Phase-aware sizing is open.
No source capacity policy, floor or acceptance criterion was changed to hide it.

One fresh read-only h3mon command completed in2.314seconds at14:56:49UTC, verifying
machine/daemon/container identities and exact existing loopback endpoint bindings.
Six dev cgroups charge2.829GiB now under5.5GiB combined configured limits. Seven
retained services charge1.851GiB; host MemAvailable is11.661GiB of15.237GiB total.
These are current counters, not a simultaneous lifetime peak or Kubernetes proof.
Elasticsearch reports38,658,806index-store bytes with0failed shards, excluding its
translog and other filesystem writers. Prometheus has1903head series; historical
queries return120MiB max selfRSS,1908maxseries and0.00456core maximum5minute CPU
rate over the queried24hours. Whole-stack CPU and historical sampling coverage
were not measured; per-process self-metrics cannot substitute for them.

The sizing note now leads with measured evidence and next phase/concurrency work.
Full two-instance isolation, signals/operator views/history/recovery acceptance and
the existing16GiB-available lab floor remain required. No new hardware size is
recommended, no resource or retention setting was reduced, and no store, workload,
credential, provider resource or history was changed. Private measured-dev-2026-10-31
receipts retain safe projections, query expressions, script and hashes. Software/
runtime acceptance tests and host gates were not run for this documentation correction.

## Task74 bounded resource reader — 2026-10-31, implementation review pending

Actual pre-intent BASE `16f2dd1c670655fb6d57fa4016f15a5606d2fe42`; approved
intent `99396ad6112532dbd374eb2481ec4f14d94781e5`; normal source commit
`452ab999e5e85894aa2c8d07954755f1b24c1009`. The existing observer now carries
optional provider-neutral `HealthCheckpoint.resources`, with every new CLI cycle
supplying complete or unavailable. A fixed embedded SSH/Python adapter reads actual
host memory/busy CPU and exactly thirteen selected workload cgroups, binding
machine/daemon/boot, projected ownership/control/lifecycle and PID/cgroup generations
before/after. Missing, malformed, stale/future, escaped or changed evidence refuses.
Unselected workloads remain an explicit count; selected memory is never host RAM.
Configured limits remain separate from current charges, including explicit null for
unbounded memory and valid pressure observations above a configured limit.

The existing sender appends resource state/checked/observed timestamps, current
memory and cumulative CPU metrics. CPU sums carry execution start time; bounded-role
host/workload start gauges also expose epochs to consumers that omit OTLP start time.
Checkpoint provenance retains IDs while metric labels contain only bounded target,
group and role values. Producer identity remains distinct from measured legacy/dev
workloads. Local mode emits unavailable with no actual samples or SSH invocation.
The provider is embedded in the compiled binary, not read from a workspace asset.
Old health/progress/storage contracts and the8192-byte checkpoint cap are unchanged.

The actual existing local CLI assertion first failed because resource state was
absent. A second genuine RED showed foreign-machine acceptance under optimized
Python; explicit non-assert refusal now prevents disabled identity/path assertions.
Tests execute actual Python against temporary proc/cgroup files, bounded Docker/SSH
stdio fixtures and the actual OTLP sender against loopback HTTP. Both source and
compiled CLI tests verify local SSH tripwires and default-cycle measured publication;
the compiled provider also runs outside the source directory. The complete thirteen
samples and provenance fit the unchanged checkpoint cap. Actual blocked-process
deadline/cancellation controls terminate their fixture processes.

The one focused covering command was:

```sh
bun test tools/tool-observability-stack/src/dev/resources.test.ts tools/tool-observability-stack/src/dev/resources-ssh.test.ts tools/tool-observability-stack/src/dev/autonomous.test.ts
```

It passed78tests/277assertions with0failures in34.31seconds. After mechanical
fixture typing/string interpolation and array-style lint corrections, the selected
source/compiled/provider/OTLP/encoding smoke passed5tests/51assertions in2.58seconds.
Final affected lib/spec `bunx tsc --build --force tools/tool-observability-stack/tsconfig.json`,
changed-file ESLint and Prettier passed. Strict owning OpenSpec validation passed
1change/0issues in34ms. Normal source hooks passed lint/format/plaintext-secrets and
private-nesting; ToolWiki explicitly reported inactive/uncertified, not certification.

Raw receipts and exact argv are indexed in `/tmp/puni-task74-evidence/command-index.json`;
source file SHA256s are in `source.json`, with receipt hashes in `manifest.json`.
Private report: `.superpowers/sdd/observability-environment-parity/task-74-report.md`.
`python-fault-index.json` and `boundary-fault-index.json` retain individual injected
faults, test outputs, timings and exact restoration hashes. Of58 observed mutations,
27 admitted invalid readings after guard removal,20 changed diagnostic/boundary order,
7 exercised deadline/modeled-failure behavior, and1each exercised transport argv,
local isolation, unavailable encoding and generation encoding. Diagnostic-order
failures are not independent unsafe-acceptance proofs. Adjacent Proof comments name
the observed tests. The original command-deadline mutation's12004ms harness timeout
is uncredited; `command-deadline-fault-refined.json` supersedes it with the intended
refusal mismatch in9.052seconds. Initial missing-module, duplicate-newline fixture,
typecheck and lint failures remain retained and uncredited. Automatic approval
rejected the first CLI wiring command over possible local SSH; it ran nothing, and
the explicit local branch plus executable tripwires resolved that concern.

No full Nx/host gate, old proof matrix, chart render, network install, actual SSH,
Docker/provider operation, deployment, credential/history/resource-policy change,
push or merge ran in this source slice. Independent specification/quality review and
separately bounded actual adapter/existing-pipeline corroboration remain open; no
stored-history/Prometheus-reset or runtime-acceptance claim is made. Task74,3.1 and
full two-instance Kubernetes/isolation/history/recovery acceptance stay open.

## Resource coverage, phase findings and Task74 actual pipeline — 2026-10-31

New read-only coverage at15:29:41UTC completed in2.360seconds. Four30second evaluated
grid series each return2881points/allup across24hours. Raw up counts and sums match
configured expected cadences: collector, gateway and Prometheus2880each; probe17280.
These checks do not prove every raw timestamp or whole-stack load coverage. Host and
container resource histories are absent from dev Prometheus; preserved VictoriaMetrics
has104metric names, with OpenClaw self-memory metrics but no host/container history.
Private resource-history-2026-10-31 retains9artifacts and15independent count/hash checks.

Independent phase research follows actual awaited creation/import/bootstrap calls and
the Flux graph. The conditional52672Mi source sum separates22240Mi persistent initial
roles,18656Mi first replacements and11776Mi Job/tick attempts. None establishes a
physical simultaneous peak. Failed/Succeeded Pod status and retained disk history do
not prove either live process RAM or reclaimed cgroups. No source ledger, floor,
required instance, recovery case or history policy was changed; the withdrawn hardware
recommendation remains withdrawn. Next phase measurements need actual execution and
residual memory attribution rather than invented concurrency discounts.

Fresh independent specification and quality review approves Task74 SOURCE452ab999e,
full pre-intent16f2 through source range, with no Critical/Important/Minor findings.
Review is retained as task-74-review.md. Parent read the complete report/review and
all58raw named fault observations, then verified106evidence artifact hashes,8source
working/committed hashes and36command receipts without rerunning passing checks.
The review and source tests do not certify live history or restart CPU interpretation.

A root bounded release binds clean evidence HEADfc1dd68f and all8reviewed source hashes.
One real createResourceReader invocation used the exact fixed program through the
existing pinned operator transport to h3mon. This verifies the managed root inspection
route, not the h1 observer account's newly exercised Python privilege. Existing actual
collector14318 and Prometheus19090 loopback mappings were independently bound to owned
running Compose containers before a temporary controller-local SSH forward was started.
No new remote file, daemon, Docker resource, credential, port exposure or unit was created.

The actual component completed in2.554seconds, with13complete owned workload readings;
current six-dev memory charge is2.823GiB. Production encodeResourceMetrics and the
existing createOtlpSender published one25235byte batch, acknowledged successfully.
The same temporary query route observed74stored Prometheus resource series within the
10.354second overall operation. Parent independently compared all74state/time/host and
13workload memory, configured-limit, CPU and execution-start values to the exact reading;
all match, with no raw machine/daemon/boot/container identities in metric labels.
Stored CPU names use the exporter `_total` suffix and start timestamp gauges survive.
No restart was induced, so store-side counter reset behavior and sustained history remain
unverified. An ingest acknowledgement alone was not counted as storage evidence.

Exactly one provider reading and one metric publication occurred. The owned temporary
SSH process was terminated/reaped and its PID independently absent; no observer/tunnel
unit was changed. The existing compiled ab4f observer remains the live autonomous producer
and does not yet invoke this new reader. This component is therefore not continuous
resource history activation or full Kubernetes/common-stack/live acceptance. Preserve
all existing dev health/history and route guarantees for the subsequent bounded rollout.

Raw release, wrapper, component, endpoint preflight, reading, batch, acknowledgement,
stored series/polls, complete-value comparison and cleanup receipts are retained privately
in task-74-actual-component. Task74's implementation/review/corroboration source slice
is complete; original3.1 and canonical4/11 runtime milestones remain open. A persistent
observer update, at least two freshness windows and restart-aware history verification
remain required before calling resource collection autonomous in the running system.
