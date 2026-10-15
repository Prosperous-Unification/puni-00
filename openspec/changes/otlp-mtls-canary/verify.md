# Verification

Production activation is pending. The overnight cleanup removed the original uncommitted temporary checkout, so no prior implementation SHA or test log survives. This branch rebuilds on b773e5f64d9b8eeb1bffcd9ceda099425f14297a. The retained design context is guidance, not fresh verification evidence.

Checks remain unverified until fresh command output is recorded below. The branch is pushed early to preserve reviewed intent and subsequent commits. No production resources or secrets have changed.

## Topology and lifecycle TDD (2026-10-15)

- `bun install --frozen-lockfile` passed after setting an owned `BUN_TMPDIR`; initial default temporary path was read-only.
- Normal Lefthook hooks passed for planning commit `bdba76e57`, pushed to `work/otlp-mtls-canary`. Tool Wiki hook explicitly reported inactive because the external activation root is not provisioned.
- Initial topology run: 7 failures because TLS material and canary route did not exist. Initial certificate run: 5 failures because certificate graph was absent.
- `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/platform.test.ts`: 73 passed, 0 failed.
- Removed `await assertOtlpTransport(root)` from the production validator and reran the 12 new cases: 11 failed with unexpectedly resolved promises; certificate dependency negative still rejected through the separate graph guard. Restored enforcement. Logs: `/tmp/otlp-topology-red.log`, `/tmp/otlp-certificate-red.log`, `/tmp/otlp-all-green.log`, `/tmp/otlp-enforcement-fault.log` (temporary diagnostic artifacts, not durable evidence storage).

Scoped ESLint passed for all four changed TypeScript files. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-fleet:typecheck` passed. The default Nx daemon/plugin socket path was denied by the sandbox; the documented in-process mode avoided sockets. The first whole-project lint attempt exited nonzero without ESLint diagnostics; it is not counted as passing.

Pinned OpenSpec 1.12.0 validation passed (`valid: true`, no issues) through the cached CLI at `/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js`; attempts to invoke latest through Bun's cache failed on a read-only temporary path and are not counted. Apply reports `sdd-lean`, state `ready`, 0/5 tasks complete before checkbox updates. The context files are this change's five artifacts. The existing parent-directed implementer/reviewer lanes supply the delegated execution and review workflow; production activation remains pending.

## Rebuilt implementation checkpoint and additional proofs

Implementation checkpoint `bf7f7e8d6` was committed through normal hooks and pushed. After adding runtime wiring checks, all 78 platform tests passed (0 failed). Five new runtime negatives were first watched resolving unsafely: detached TLS log receiver, wrong client-trust mount, server signing-key exposure, wrong upstream ConfigMap key and changed queue directory.

### Native Collector authentication and rollover investigation

The disposable proof uses the **exact pinned image** `ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib@sha256:799dc6cf12c96192af37b5bdba804da8c10b3bc563b43cb90c3f3c58d9572ad6`, with receiver configuration extracted from the committed HelmRelease. Only the pipeline's sink changes to the debug exporter. Runtime mounts expose server leaf and client public trust only; signing keys stay outside the container. Node's native HTTP/2 client sends a protobuf `LogsService/Export` with a real log body, verifies TLS, and requires `grpc-status: 0`. A process exit alone is not the delivery oracle: debug output showed `Body: Str(otlp-mtls-client)` and renewed-client bodies.

| Fault or safeguard                       | Observed evidence                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Authorized client                        | Export returned gRPC status `0` and receiver debug output contained its log body                                         |
| No client leaf                           | TLS alert `certificate required` (116)                                                                                   |
| Foreign client CA                        | TLS alert `unknown ca` (48)                                                                                              |
| Server-only client EKU                   | TLS alert `bad certificate` (42)                                                                                         |
| Expired client                           | TLS alert `certificate expired` (45)                                                                                     |
| Wrong server CA                          | Node `UNABLE_TO_VERIFY_LEAF_SIGNATURE`                                                                                   |
| Wrong server hostname                    | Node `ERR_TLS_CERT_ALTNAME_INVALID`                                                                                      |
| Plaintext HTTP/2 to TLS receiver         | Curl receive failure/reset, no successful export                                                                         |
| Unreadable server key at startup         | Collector refused startup with `open /etc/otel/server/tls.key: permission denied` under `--cap-drop ALL`                 |
| Client-CA overlap without reload enabled | After old+new public bundle replacement and 65s, renewed old-CA client exported, new-CA client still failed `unknown ca` |

That last fault found a real missing setting. [Pinned TLS source](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.160.0/config/configtls/configtls.go#L325) only enables the dynamic client trust callback when requested. [Pinned README](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.160.0/config/configtls/README.md#server-configuration) names the YAML key **`client_ca_file_reload: true`** (default false). The first spelling tried (`reload_client_ca_file`, matching the Go field order) was rejected by the actual Collector as an invalid key and discarded before commit. A production-validator mutation now rejects disabling the verified key. Fixed live rollover and age evidence will be recorded after the run completes.

Post-start client trust corruption/removal is different from startup failure: the pinned [reload tests](https://github.com/open-telemetry/opentelemetry-collector/blob/v0.160.0/config/configtls/configtls_test.go#L346) retain the previous valid pool when reload fails. Deleting a file is not revocation. Use a valid replacement bundle, prove new handshakes, and require architect review before activation; post-start corruption alerting remains unverified.

### Unchanged fleet guard

Under `/tmp/wbs-heavy-work.lock`, the real `k3d-lab.ts up --id otlp-mtls --profile fleet --worktree-root /tmp/puni-otlp-mtls-sol` invocation using pinned k3d/kubectl refused: **16015 MiB available, 24576 MiB required**, suggesting `--profile platform`. No guard was lowered and no fleet clusters started. Direct Collector proof does not prove cross-cluster NetworkPolicy, actual Flux/cert-manager reconciliation, Kubernetes projected-secret renewal, host metrics, worker alert delivery, persistent queue recovery or final plaintext closure. Those remain unverified; WBS 070.07 and production activation remain in progress.

Final production-validator mutation pass: removing the OTLP enforcement call made 17 of 18 new negatives fail; the certificate dependency still rejected independently. Removing that dependency comparison separately made its negative resolve (0 passed, 1 failed). Both guards were restored. Fresh platform run: **79 passed, 0 failed**. The client-CA reload key mutation rejects disabling reload.

### Fixed native run (2026-10-15)

With `client_ca_file_reload: true`, the complete direct run exited 0:

- The replacement old-CA client exported with gRPC status 0 after 65s; a new-CA client also exported during the old+new overlap.
- The server's presented serial was `7581901971F02FD1D66860E50E4AD47932F70600`, identical to the replacement server certificate generated before the update. This proves server leaf file reload on a new handshake; it does not prove cert-manager issuance in Kubernetes.
- After replacing client trust with the new CA only and waiting 65s, the old client failed `unknown ca`; the new client still exported with gRPC status 0.
- An old established session received successful Export0 initially and then native **GOAWAY code 0 at 276077ms (276.077s)**. It closed after GOAWAY. This proves idle existing-session aging with the committed 5m/30s settings; an active stream's full 30s grace was not separately measured.
- Six startup faults each exited nonzero with the intended error, rather than counting timeout/failure alone: missing server certificate, missing key and missing client trust each reported `no such file or directory`; unreadable key and unreadable client trust reported `permission denied`; malformed client trust reported `failed to parse CA`. Permission faults used `--cap-drop ALL` to make the bind-mounted file actually unreadable to the process. These are startup proofs, not post-start revocation proofs.
- The shared-lock runs removed only their named disposable containers after collecting logs. Signing keys remained in the owner-only temporary material directory outside runtime mounts.

Fresh final scoped verification: `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/platform.test.ts tools/tool-fleet/src/observability-budget.test.ts` passed **81 tests, 0 failed**. The 79 platform tests include 18 new negatives; the 2 budget tests prove the platform graph remains within the existing h3mon budget. Scoped ESLint and `tool-fleet:typecheck` passed; pinned OpenSpec 1.12.0 validation returned valid with no issues.

Still unverified: two-cluster Flux/cert-manager reconciliation and actual renewal, Kubernetes Secret projection, agent rollout for server trust, Kubernetes persistent-queue recovery, worker alert delivery, final plaintext route closure, active-stream grace, production CA/DNS/SOPS provisioning and exact-SHA h2puni full gate. The direct proof does not close those obligations or WBS 070.07. Task 3 remains open for its unverified lifecycle portion; task 4 records the modeled resource refusal; task 5 remains open for final integration/gate.

## Native agent exporter and persistence proof

A second low-memory direct run used the same pinned image for both gateway and agent, copying the production agent's `otlp` exporter and `file_storage/queue` configuration. Only the log input changed to a loopback OTLP/HTTP receiver, internal metrics moved to 14319 to avoid the two host-network processes sharing 8888, and the sink remained the debug exporter. Runtime mounts exposed leaf/public trust only. The first harness attempt refused startup on the metrics 8888 collision; it was corrected in the harness, without product changes.

- Baseline log body `native-baseline` arrived through the native TLS exporter.
- Stopped the gateway, accepted three bodies `native-outage-1` through `native-outage-3`, restarted the agent while the gateway was still down, then started the gateway. All three bodies arrived. The actual storage file was `queue/exporter_otlp__logs`, 32768 bytes, under the existing queue directory. This is a three-record direct persistent-queue recovery proof, not a lossless guarantee or a Kubernetes node/PVC proof.
- Replaced the running agent's client leaf/key with a leaf signed by the new CA, waited 65s, replaced gateway trust with the new CA only, restarted the gateway, and injected `native-client-leaf-reloaded`. That body arrived through the unchanged running agent. This proves the native exporter's client-leaf reload on a new handshake after the configured 1m interval. The direct run exited 0 and both named containers were removed.

Outgoing native leaf reload and direct queue restart recovery are now proved; their Kubernetes projection/node lifecycle equivalents remain unverified.

## Architect review repair

At checkpoint 8586d5cf2, Astra identified unbound effective endpoint, persistent host backing and checkpoint-consumer invariants. Added production-path mutations plus disconnected/read-only state mounts, then required the upstream environment endpoint, hostPath `/var/lib/puni-otelcol` with `DirectoryOrCreate`, writable mount `/var/lib/otelcol`, and filelog consumer `file_storage/checkpoints`.

The original empty-string hostPath mutation did **not** isolate the new guard: after transport enforcement was removed, the existing `OtelValues` nonempty-path guard still rejected it. The earlier claim that all five unsafe graphs resolved was inaccurate; that case failed on different error text instead of resolving. The runtime guard was sound, but that proof was not.

Replaced the fault with the nonempty path `/var/lib/puni-otelcol-empty`. Fresh corrected proof:

1. With transport enforcement present, all five focused negatives passed, including the changed host path rejected with an OTLP error.
2. Removed only `await assertOtlpTransport(root)` from the production `validatePlatform` call path. All five cases failed specifically with **“Received promise that resolved”**, including the nonempty changed host path, proving the unsafe graph was otherwise accepted.
3. Restored enforcement and reran the focused command; all five negatives passed again.

Command: `bun test --preload ./tools/test/scratch/preload.ts tools/tool-fleet/src/platform.test.ts --test-name-pattern 'OTLP effective queue'`. Temporary logs: `/tmp/otlp-proof-correction-guard.log`, `/tmp/otlp-proof-correction-removed.log`, `/tmp/otlp-proof-correction-restored.log`. No runtime code changed in this correction.

After the review repair, the final scoped test command passed **86 tests, 0 failed** (84 platform and 2 budget tests). Scoped ESLint passed with no diagnostics, `tool-fleet:typecheck` passed, pinned OpenSpec validation reported valid/no issues, and `git diff --check` passed. The corrected focused mutation run above isolates the five reviewed safety checks; the original empty-string proof is superseded.
