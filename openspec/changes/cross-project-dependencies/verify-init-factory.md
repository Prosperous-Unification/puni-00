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

**Native-equivalence blocker:** an independent real Docker run subsequently found that actual never-started replacement endpoints report an empty `NetworkID`, while this synthetic fixture currently retains its configured network ID. The current production parser rejects that real native shape. The synthetic execute positive therefore does **not** establish native-equivalent create/execute support. The fixture is frozen without normalization or a production patch pending a separate architecture ruling and core fix. No raw host capture, paths, IDs or secrets were copied into the repository. The precise limitation is also documented on `candidateFixture`.

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

## Frozen factory matrix after profile integration

The current source profile is fixed by the exact dependency transplant above. The following actual-entry runs cover all 149 distinct tests in the new factory test file:

- `bun test tools/tool-remote-scripts/src/lib/edge-init-factory.test.ts -t 'actual production execute'`: one passed, 0 failed, 42.15 seconds. Exact twelve-effect transcript and twenty-four receipt stages checked.
- `bun test tools/tool-remote-scripts/src/lib/edge-init-factory.test.ts -t 'actual read-only recovery classifies'`: initially seventeen passed and one failed, 308.13 seconds. The failure was a fixture construction error: constructing Caddy's stopped-after-start prefix also stopped the preceding healthy registry before its historical witness was captured. The fixture now stops only the selected target. Its exact case was rerun with `-t 'classifies caddy candidate-stopped-after-start'`: one passed, 0 failed, 3.60 seconds. All eighteen target/class combinations are now covered by passing observations.
- `bun test tools/tool-remote-scripts/src/lib/edge-init-factory.test.ts -t 'actual production prepare|actual recovery refuses|global prefix|expired historical|service-negative'`: 130 passed, 0 failed, 305.25 seconds, 1107 assertions.
- Stronger queued-job and Exec-stderr model cases were rerun separately: three passed, 0 failed, 15.25 seconds. The queued job has a matching independently selected complete projection hash; the Exec fault carries valid stdout plus secret stderr. Thus these faults target the intended predicate/stderr guards rather than a different hash or JSON-parser failure.

The matrix establishes the actual production algorithms' behavior against this frozen synthetic model, including all nine recovery classes for both targets and zero recovery mutation transcripts. It does not resolve the empty native-created `NetworkID` blocker above. Root explicitly requested this freeze so the native contract ruling and correction can precede final factory review. No further model normalization is included.

The configured Nx project lint, typecheck and build targets passed; focused TypeScript, ESLint and formatting were repeated after fixture corrections. The full h2puni gate, live host operation and real Docker-native equivalence remain unverified by this lane.
