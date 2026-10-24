# Production Init factory verification

The new worker `tools/tool-remote-scripts/src/fixtures/edge-init-factory.ts` runs only in an isolated Bun child. It maps native IO before importing the production observer. The parent test file imports no worker code, so its `mock.module` registrations cannot escape into neighboring tests.

The worker exercises the actual production entry, Engine HTTP/native decoder, inherited-flock checks, file descriptor traversal/readback, authority collector, supervisor transport/subreaper/cleanup, native init reader, stopped-unit adapter/predicate, source admission, Caddy Exec framing, TLS HTTP registry reads and WebSocket handshake/closure. Only raw filesystem, spawn, Docker-socket HTTP and fixed solver query boundaries are translated into invocation-owned files/processes/sockets. The supervisor's actual kernel coordinator/transport/internal-process checks remain intact. Collector and supervisor JSON responses are computed by their production algorithms.

The packet's file/device/inode/hash pins come from owned actual files. Registry retains its one-file declaration roster; Caddy uses checked-in `deploy/compose/base.yml` plus three other-service-only files with comments, quoted scalar interpolation and flow sequences. No resolved Compose projection grants Init authority. The false-source case retains an independently pinned historical projection saying true; the paired case omits that historical projection and still refuses.

Native Config omits OnBuild, matching API 1.52. The independent Engine model reflects measured OomKillDisable representation: original running null, newly created false, running replacement null. It does not clone the original's null into the created response.

## Fresh observations before the OOM profile prerequisite

Bun: `/home/df/.bun/bin/bun`, version 1.4.4. Tests give every factory invocation an explicit 120-second test budget and a 110-second child limit. Real recovery health rounds span ten seconds per serving target.

- Native schema prerequisite: exact `edge-init.ts` and its test copied from `1d2a8f4f5a02f7119e5d9762628ce63077851b4e` into separate dependency commit `f3d1c03c4`; pre-copy files matched `29f26e06c`. Native schema tests: 40 passed. Normal commit hooks passed.
- Prepare matrix: 56 passed, 0 failed, 59.34 seconds. This included actual full prepare with no receipt directory and no mutation, independently pinned false/missing/duplicate Init, forbidden source syntax and later-file redefinitions, absent/unreadable source, real independently opened forged flock, retained owner marker, queued solver job, populated cgroup, failed crontab read, changed machine boot/daemon, graph membership, Exec stderr/terminal checks, body/digest/challenge/TLS/connect faults, malformed native PID, PID recycling, missing network resources, changed writer/bundle and new matching launcher census.
- Recovery negatives: 28 passed, 0 failed, 21.89 seconds, with explicit receipt/inventory/host/process boundary assertions and zero mutation transcript. Includes full packet/source/literal/version/invariant evidence, original process/candidate process witnesses, candidate Env/Init/image/mount/endpoint/process namespace/executable/name/absence, both-running state, current forged edge flock, source/daemon/boot/graph drift, unexplained early original absence and wrong lost-create reserved name.
- Global recovery positives: six passed, 0 failed, 144.71 seconds: both originals retained; registry original removed; both originals absent; expired historical window under a distinct newly held current edge descriptor; explicit unhealthy native Health; wrong complete registry manifest body reported unhealthy. Every case used the actual entry and zero mutation routes.
- Added real WSS/edge cases: nine passed, 0 failed, 18.28 seconds: rejected/malformed WebSocket handshake, changed live configuration, missing route/server coverage and reordered/duplicated/unpinned/swapped native config-file labels. The prepare baseline including real successful WSS upgrade/close passed separately.

The exact OOM profile prerequisite was subsequently mechanically copied from `e395add3d72ac8dbd5c388e0ac422c7dd2207487` into separate dependency commit `6c170728d`: the three production modules and colocated tests only. Their fresh local tests passed: 155 tests, 0 failed, 1022 assertions; the broader owner's 226-test count is not claimed for this lane. No CLI or native runner files were copied.

With the exact profile and Engine29.1.3/API1.52/linux/cgroup2/systemd tuple, the simulated whole execute passed in 41.98 seconds, checking the exact twelve mutation routes and all twenty-four receipt stages. This establishes traversal of the actual algorithms against the current synthetic model.

**Historical native-equivalence blocker at the 149-case checkpoint:** an independent real Docker run subsequently found that actual never-started replacement endpoints report an empty `NetworkID`, while this synthetic fixture currently retains its configured network ID. The current production parser rejects that real native shape. The synthetic execute positive therefore does **not** establish native-equivalent create/execute support. The fixture is frozen without normalization or a production patch pending a separate architecture ruling and core fix. No raw host capture, paths, IDs or secrets were copied into the repository. The refreshed model below addresses this specific representation after the separate ruling; it does not establish real Docker equivalence.

## Watched production guards

Each mutation changed only a temporary local production file. The original bytes were restored in a `finally` block and compared byte-for-byte before further verification; no production mutation is committed with the harness.

| Removed production comparison                                | Actual-entry negative                                                          | Observed negative failure                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Docker info identity fingerprint equality                    | prepare daemon-drift                                                           | Expected refusal exit 2; got success exit 0. Test exit 1.                     |
| Candidate immutable projection equality                      | recovery candidate-mount with both originals absent                            | Expected refusal exit 2; got success exit 0 after 23.92 seconds. Test exit 1. |
| Literal source semantics (structural and parsed Init checks) | prepare source-false retaining independently pinned true historical projection | Expected refusal exit 2; got success exit 0. Test exit 1.                     |
| Ordered source-roster SHA equality                           | recovery receipt-source with both originals absent                             | Expected refusal exit 2; got success exit 0 after 25.46 seconds. Test exit 1. |
| Literal-Init proof SHA equality                              | recovery receipt-literal with both originals absent                            | Expected refusal exit 2; got success exit 0 after 25.38 seconds. Test exit 1. |
| Historical full packet SHA equality                          | recovery receipt-packet with both originals absent                             | Expected refusal exit 2; got success exit 0 after 23.94 seconds. Test exit 1. |

After restoration, the four selected actual-entry tests passed (daemon drift in both modes, candidate mount drift, historical packet drift), 0 failed, 2.85 seconds. The additional restored literal-source/source-hash/literal-hash negatives and retained-file inode/byte replacement cases passed together: five passed, 0 failed, 2.74 seconds. Adjacent `Proof:` comments identify these watched faults.

## Checks and limits

The actual configured Nx `tool-remote-scripts:lint`, `:typecheck` and `:build` targets passed after the exact profile transplant. Project bundles rebuilt; three build prerequisite tasks used their existing local cache. Focused TypeScript project build, ESLint and formatting also passed during development. An initial sandbox-only Nx lint invocation printed IPC refusal without executing the target despite exit zero; it is not counted as lint evidence. A later actual configured lint target ran and exposed import sorting in the new test, which was fixed before the successful configured run. The final matrix counts are recorded below after its constituent runs settle.

Only owned synthetic fixtures were created. No live host or Docker action, credential materialization, deployment, source branch merge or production recovery effect was performed. This harness does not prove live host admission or confer live-effect permission. The h2puni gate has not been run in this lane.

The owned descendant fault exercises actual subreaper refusal and settlement after a worker leaves a child. A kernel-level inability to complete privileged cleanup is not synthesized as a successful observation and has not been reproduced by this factory fixture; the dedicated supervisor component tests cover cleanup-unknown protocol behavior. This limitation remains explicit.

## Historical 149-case matrix before created-network correction

The current source profile is fixed by the exact dependency transplant above. The following actual-entry runs cover all 149 distinct tests in the new factory test file:

- `bun test tools/tool-remote-scripts/src/lib/edge-init-factory.test.ts -t 'actual production execute'`: one passed, 0 failed, 42.15 seconds. Exact twelve-effect transcript and twenty-four receipt stages checked.
- `bun test tools/tool-remote-scripts/src/lib/edge-init-factory.test.ts -t 'actual read-only recovery classifies'`: initially seventeen passed and one failed, 308.13 seconds. The failure was a fixture construction error: constructing Caddy's stopped-after-start prefix also stopped the preceding healthy registry before its historical witness was captured. The fixture now stops only the selected target. Its exact case was rerun with `-t 'classifies caddy candidate-stopped-after-start'`: one passed, 0 failed, 3.60 seconds. All eighteen target/class combinations are now covered by passing observations.
- `bun test tools/tool-remote-scripts/src/lib/edge-init-factory.test.ts -t 'actual production prepare|actual recovery refuses|global prefix|expired historical|service-negative'`: 130 passed, 0 failed, 305.25 seconds, 1107 assertions.
- Stronger queued-job and Exec-stderr model cases were rerun separately: three passed, 0 failed, 15.25 seconds. The queued job has a matching independently selected complete projection hash; the Exec fault carries valid stdout plus secret stderr. Thus these faults target the intended predicate/stderr guards rather than a different hash or JSON-parser failure.

The matrix establishes the actual production algorithms' behavior against this frozen synthetic model, including all nine recovery classes for both targets and zero recovery mutation transcripts. It does not resolve the empty native-created `NetworkID` blocker above. Root explicitly requested this freeze so the native contract ruling and correction can precede final factory review. No further model normalization is included.

The configured Nx project lint, typecheck and build targets passed; focused TypeScript, ESLint and formatting were repeated after fixture corrections. The full h2puni gate, live host operation and real Docker-native equivalence remain unverified by this lane.

## Refreshed created-network model and immutable expiry

The historical 149-case checkpoint above is preserved as historical evidence. The current model uses actual never-started empty NetworkID values, empty gateways/MAC/runtime identities, zero prefixes and null DNSNames. A running replacement obtains full IDs only from independent packet pins. Caddy has two separately pinned networks. Exact-name and full-ID Engine reads include complete network configuration and current modeled membership; subsequent inspect is freshly evaluated. Unrelated created blank endpoints remain raw inventory observations without receiving replacement authority.

The three production modules and colocated tests were copied byte-for-byte from `e67189b5d173f365bc6d7ad0f0ad53708d131450` in separate dependency commit `8f6ff49d39b23131cc445c51ee2541a1151bf6e6`. Fresh local component tests: 252 passed, 0 failed, 1228 assertions. This count excludes native runner tests and does not claim the owner's broader suite.

Refreshed actual-entry groups against that dependency, all with explicit per-case 120-second limits:

- `-t 'actual production execute|classifies caddy candidate-inert'`: two passed, 0 failed, 62.82 seconds. Execute checks twelve exact mutations and twenty-four receipt stages.
- `-t 'created network fault|refreshed network fault|inert recovery refuses network membership|stopped-original recovery|unrelated created blank'`: 36 passed, 0 failed, 231.78 seconds, 269 assertions.
- `-t 'actual production prepare|actual recovery refuses|service-negative'`: 137 passed, 0 failed, 239.43 seconds, 1161 assertions.
- `-t 'actual read-only recovery classifies|global prefix|expired historical|unrelated created blank'`: 23 passed, 0 failed, 426.49 seconds, 200 assertions.

These groups overlap and cover 186 distinct cases; their counts must not be added. They cover all eighteen target/recovery-class combinations, both original-absence prefixes, expired history with a distinct freshly held edge descriptor, precise network substitution/configuration/membership/stability failures, strict inert runtime allocations, unknown inventory and unrelated inventory drift. Every recovery case asserts zero mutation routes. New execute network negatives assert exactly one create, no original stop, precise receipt prefix and final raw read boundary.

The raw clock boundary regression then exposed a separate immutable-expiry defect through the actual entry. The isolated worker advances only its outer Date.now/performance.now at deterministic Engine milestones, never during native child lifetimes. Registry create advances both clocks 150 seconds; the rollback case returns wall time by 150 seconds before Caddy phase creation, then advances monotonic time another 220 seconds at Caddy create. Initial authority is about 360 seconds. The worker records every applied mutation and its clocks. The current control shares the registry advance without rollback.

Against pristine e671, `-t 'preserves first effect expiry'` produced the required RED: rollback applied a stop beyond initial expiry and failed `stopApplied === false`; the matching control passed (one pass, one fail, 46.15 seconds). Independent reviewer reproduction and the exact correction contract are recorded privately in `/tmp/puni-init-monotonic-expiry-ruling.md`. No production guard or success callback was substituted for that proof.

Exact corrected observer and colocated tests were copied from `42cd51fb6c3f36acd1acd5276415942e1859754a` in separate dependency commit `89c26bbc8996d503164c07a6a1fd16d46c3f9876`. SHA256: observer `c01cc8a300ce632b4fdbd13a22d754047bc71623a88076f6c6cf971ae8134352`; test `c2b9626ed3344ac17c1553b8408478d03eccbb5f3479e085b729e36ced45f6d3`. Fresh observer tests: 31 passed, 0 failed, 249 assertions. A sandbox-only attempt refused local listen; only the subsequent authorized owned-listener run is counted.

With the correction, `-t 'preserves first effect expiry|actual production execute|expired historical'`: four passed, 0 failed, 104.93 seconds, 39 assertions. Both clock cases refuse before Caddy creation with the exact five registry effects. Ordinary execute still completes its twelve effects. Expired historical recovery still succeeds with a new held edge descriptor and zero effects. Thus all 188 distinct current factory cases have passing observations across the bounded groups, with affected expiry cases rerun after the correction; this is not a single full-suite run.

Configured `nx run-many -t lint,typecheck,build -p tool-remote-scripts` passed in 14.1 seconds after the correction. All three requested targets executed; only their three build prerequisites used cache. No native Docker acceptance, live host admission, h2puni gate or external service operation was performed. Synthetic raw-boundary coverage remains distinct from real native equivalence.

Additional watched actual-entry guards after the correction:

| Temporary production fault                                       | Observed test failure                                                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Omit fixed invocation-expiry comparison                          | Rollback applied late Caddy stop; `stopApplied` expected false, received true; test exit1, 24.53 seconds.                          |
| Recapture expiry from current wall/monotonic clocks in admission | Same late applied stop assertion failed; test exit1, 24.99 seconds.                                                                |
| Omit fresh network configuration fingerprint comparison          | Self-consistent exact-name config drift completed execute; expected refusal2, received success0; test exit1, 39.13 seconds.        |
| Omit inert candidate membership prohibition                      | Candidate listed in full-ID network membership completed execute; expected refusal2, received success0; test exit1, 38.92 seconds. |
| Omit fresh raw candidate readback equality                       | One-shot changed hostname at fresh inspect completed execute; expected refusal2, received success0; test exit1, 39.02 seconds.     |

Each mutation was restored in a finally block, compared byte-for-byte and checked against the committed production files before restored verification. Observer SHA256 remained `c01cc8a300ce632b4fdbd13a22d754047bc71623a88076f6c6cf971ae8134352`; operation SHA256 remained `851e7f25ce72397b489c8f0635c7f01aadb7218f0a2892da601da1d97fa8d2d1`. Adjacent Proof comments name each production-path omission. No mutated production bytes are included in either dependency or harness commits.

After the watches, the first restored six-case run passed five and exposed one stale test expectation: expired preparation now refuses immediately after packet decode, before any Engine observation. The test was strengthened to require an empty read transcript, preserving its exact preparation-refused result and zero effects. This is the intended earlier defensive boundary of the correction, not an admission bypass.

Final focused production dependencies: 257 passed, 0 failed, 1233 assertions across edge-init, edge-init-operation and edge-init-observer tests. Final uncached configured lint/typecheck/build, including all three build prerequisites: six successful tasks, 16.0 seconds, cache explicitly skipped. The earlier historical 149 and intermediate 186 observations are not relabeled as full native proofs.

The restored six-case rerun passed: `-t 'preserves first effect expiry under clock-rollback|created network fault network-config-drift|created network fault network-membership-id|created network fault network-stable-read|forged-current-lock|expired-prepare'`: six passed, 0 failed, 44.79 seconds, 58 assertions. It checks the corrected expiry, all three watched network guards, forged fresh admission refusal and early expired preparation. Focused ESLint, formatting and `git diff --check` also passed after the final assertion update. All production dependency files remain byte-identical to their exact transplanted sources; the final harness commit contains only the two new harness files and this evidence document.
