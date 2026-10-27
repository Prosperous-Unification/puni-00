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
