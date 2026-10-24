# Edge Init adoption verification

This records an incremental implementation, not live mutation authority or a completed helper.

Baseline: `767ce2056febdc527651b7bcece61fc9bf475207`. Bun observed locally: `1.4.4`.

## Local core evidence

- `bun test tools/tool-remote-scripts/src/lib/edge-init.test.ts tools/tool-remote-scripts/src/lib/edge-init-operation.test.ts`: 36 passed, 0 failed. The operation tests use disposable local Unix sockets and temporary private receipt files; no Docker daemon was contacted.
- Closed-schema mutation: accepting unsupported keys produced four expected failures for Config, HostConfig, State and endpoint fields. Restored.
- Preservation-comparator mutation: removing refusal produced eleven expected failures for Env order/value, image, hostname, security, missing HostConfig field, port, mount source/options, alias and missing network. Restored.
- `bun x tsc --build --force tools/tool-remote-scripts/tsconfig.json`: exited 0.
- Focused ESLint on five new TypeScript files: exited 0, with an explicit warning that module-boundary validation was skipped because the Nx ProjectGraph cache was absent. This is not a complete project lint claim.

## Pending

CLI/private packet admission, production host observer, native fixture, remaining individual R5 fault proofs, full configured checks, exact-SHA host gate, independently reviewed fresh private packet, production execution and controlled automation restoration are unperformed. No native normalization or live behavior is claimed from synthetic tests.

## Independent core review correction

The independent review found inherited Object.prototype rule names could bypass closed native admission, and a second persistent receipt-publication failure could escape the error-redaction boundary. New regressions observed three expected failures before the fixes (constructor, toString and persistent receipt failure). Admission now requires an own rule key; failure receipt publication has its own fixed-code refusal boundary retaining the known stage. No next effect follows a publication failure.

## Finite native transport extension

The focused core/transport run now passes 46 tests. Added fixed Engine read endpoints, read-only inventory discovery without mutation authority, strict Caddy-only Exec with the two frozen argv templates, bounded multiplexed output and terminal identity checks. Native Exec-create expects HTTP 201. Create acknowledgements admit a null or empty warning list; nonempty warnings refuse. This is response admission, not a Config/HostConfig normalization exception.

Four watched production omissions (Caddy roster, stderr rejection, terminal Running and terminal ContainerID binding) each made its selected Unix-socket test fail, then were restored. The internal owned-fixture namespace derives names from a nonce and requires invocation labels; production retains its fixed names and exposes no override.

## Native acceptance runner implementation

`tool-remote-scripts:test:edge-init` is an explicit uncached native target. It requires already-present immutable fixture image IDs through `EDGE_INIT_FIXTURE_REGISTRY_IMAGE` and `EDGE_INIT_FIXTURE_CADDY_IMAGE`, Bun 1.4.4 and the canonical local API 1.52 daemon. It never pulls. The runner creates only invocation-labelled disposable networks, seeded volumes and containers, exercises the finite helper against actual native requests, and verifies exact owned-resource cleanup.

The runner includes preservation, inert candidate refusal, three-network/default-route and port semantics, null Entrypoint, seeded storage, Caddy adaptation/live equality, actual init, both-health-before-removal, alias/route/probe/restart faults, effect acknowledgement loss and a TERM-ignoring t=-1 client deadline. Acknowledgement faults occur at the typed effect-return boundary after real daemon effects; they do not claim a dropped raw network response. Missing daemon/tool/image/privilege or an unproved native field shape fails visibly.

Only the local ownership unit test has run here: 1 passed. Separate watched name and label omissions made that production fixture guard test fail, then were restored. The actual native target remains **unperformed**, pending root review and suitable host prerequisites. No native success receipt exists from this worktree.

Configured lint now has an actual Nx ProjectGraph. `nx run tool-remote-scripts:lint --skip-nx-cache` passed (12.5 seconds); Nx fell back to its main-process plugin mode because this sandbox denies plugin sockets, without skipping module-boundary validation. A deliberate `@wbs/domain/workday` import in the owned native runner made the configured target fail; direct ESLint with that same graph reported `@nx/enforce-module-boundaries`. The fault was removed. Nested `Bun.spawn(['bun','x','nx',...])` attempts produced no task output and were rejected as proof; only the directly invoked commands count.

## Independent native-runner review correction

The review found three false proof or unsafe fixture boundaries: idempotent volume creation did not prove permission to seed; any stop refusal could count as a deadline; and an unrelated Caddy refusal could count as the selected native fault. Cleanup also used abbreviated network IDs.

The runner now refuses retained nonce resources before entering teardown scope, freshly checks exact volume absence before create, and verifies create acknowledgement plus exact native name/nonce ownership before seeding. Cleanup resolves each network to its full 64-character ID and checks its exact nonce-derived name and label before deletion.

TERM proof requires `engine-deadline-uncertain`, elapsed client wait from 250 through 1250 ms, and unchanged full container ID, PID, StartedAt, kernel start ticks and cgroup. A real local Unix-socket Engine fixture exercised the literal `stop?t=-1` request and bounded timeout; a separate immediate HTTP 500 was refused rather than counted as success. This is local transport proof, not Docker acceptance.

Every native fault must now record that its injection fired, match its exact failure phase and full-ID mutation transcript, and independently match expected original/candidate names, process states and applicable alias/route/restart evidence. A real `runInitAdoption` regression omitted the stop acknowledgement fault, completed the registry rename/start sequence, then reached an unrelated Caddy-create refusal. The oracle refused that false proof with either an absent or falsely asserted injection marker.

The runner's local regression file passes 46 tests. Thirty watched omission experiments each caused a selected assertion to fail, covering namespace/volume admission, resource kind/count/name/label/full-ID, bounded deadline and process identity, injection/phase/transcript/native state, and alias/route/restart evidence. All source faults were restored. The actual Docker native target remains **unperformed**.

## Production CLI composition

The CLI statically imports `runProductionInitAdoption`; it has no alternate observer or effect callback. `adopt-edge-init` is an explicit uncached target using the bundled entry and depends on the normal project build. The build now emits `dist/tool-remote-scripts/adopt-edge-init.js`. Default preparation, execution and recovery each use the real closed factory, including Addendum B's installed Compose source-roster and production receipt proof fields.

The CLI file's 19 local cases pass. Source and independently emitted isolated bundles are executed in child processes with the actual held flock description mapped to FD3. All three modes reach the real factory's malformed-private-packet refusal; independently opened same-path and foreign descriptors, and retained owner markers, stop at admission. Otherwise well-shaped packets carrying fixture/socket/host members refuse at the real factory boundary. Synthetic skip/fixture/remote-Docker environment values provide no success path. These tests do not perform complete valid production preparation, Docker access or live execution.

Ten watched faults each failed a selected assertion before restoration: packet and mode cardinality, unknown argument, canonical path, path controls, inherited admission, replacement of the real factory with a false prepared response, whole-summary leakage, raw Error leakage and unknown refusal-code leakage. Initial source/bundle composition tests also observed the unlinked entry fail before the real factory was connected. Failure projection keeps only the five validated summary fields and fixed codes; `recoveryInvocation` is an argv array ending in `--inspect-recovery`, never an invented compensating mutation. The separate `recovery` key is reserved for the observer's forthcoming typed observation detail.

Configured lint, typecheck and build passed with cache skipped (15.4 seconds, three prerequisites). The CLI bundle contains 36 modules (216.40 KB). A direct configured `adopt-edge-init --packet=relative` target invocation failed with `packet-path-invalid`, proving its argument forwarding and refusal before admission or host observation. `openspec validate --all --json` passed 280/280 items with no edge-Init spec issues; unrelated long-requirement warnings remain. The combined CLI/core/observer/fixture regression run passed 133 tests, zero failed, 402 assertions across five files; its log is `/tmp/puni-edge-init-cli-focused.log`.

The observer's recovery/admission, complete packet binding and default-route review fixes remain a separate review lane. No composition test or successful bundle build grants live-effect authority; the concrete private operation packet and root-owned native acceptance remain pending.

## Recovery Caddy read API

The core exports `projectInvariant` and `candidateInvariant` using exactly the old comparator fields; observed candidates are never rewritten through the constructor. `observeCaddyListed` accepts only the fixed internal Caddy binding, obtains complete fresh inventory and exact-ID/name/immutable/process observations before and after the unchanged fixed Exec decoder, and shares one bounded deadline. It never adds receipt/listed IDs to mutation or ordinary Caddy Exec rosters.

Actual Unix-socket cases cover original and candidate reads, fixed adapt/live argv, foreign/crossed/expanded bindings, ambiguous/missing inventory, native ID/name/role/config/image/Init/mount/alias drift, paused/restarting/PID-zero state, changed PID/start/config/name after Exec, and total deadline. Each case tests candidate mutation refusals before and after observation and rejects every create/stop/rename/start/delete transcript. Thirteen watched guard/deadline/capability faults each made a selected assertion fail, then were restored. This is local Engine-transport evidence, not native Docker or complete-factory acceptance.

## Native API 1.52 omitted OnBuild correction

Root's owned native attempt refused before adoption because both real API 1.52 inspect Config objects omitted `OnBuild`. The closed parser now admits absence without adding a property; present null, empty and nonempty string arrays retain their exact representation, malformed values and unknown fields still refuse. A read-only replay of the two private synthetic snapshots changed from two `unsupported-native-shape` refusals to two accepted inspections with `OnBuild` still absent. No snapshot values were copied into the repository.

Native fixture failure records now retain the finite source stage, a controlled reason and a diagnostic SHA256 before cleanup. Cleanup failure publishes a separate private exclusive file containing both failures; raw exception messages never enter either record or console output. File receipts hash the actual bytes. Ten watched faults failed selected regressions: OnBuild requiredness/type, unknown-field strictness, arbitrary refusal reason, raw diagnostic, empty failure evidence, overwrite, combined failure path, public file mode and canonical-versus-file-byte hash. All faults were restored.

Fresh focused core/runner verification passed 88 tests, zero failed, 158 assertions. The initial sandboxed run refused its two Unix listeners; rerunning the same tests with local socket permission passed. Configured lint, typecheck and build passed uncached in 15.4 seconds with three prerequisites. This corrects an observed native contract; a successful Docker adoption run remains unproved and belongs to root's separate acceptance lane.

The integrated recovery observer's optional detail is now explicitly projected by the CLI through its scope, window and six ordered target fields. Extra nested host/configuration fields are excluded. Returning the nested object directly made the new projection regression fail before restoration. Fresh CLI checks passed 20 tests/98 assertions, and uncached configured lint/typecheck/build passed in 15.0 seconds. This validates composition and redaction; the complete factory matrix remains outstanding.

## Measured created-state OOM profile

The fixed internal profile `engine-29.1.3-api-1.52-cgroup2-created-oom-v1` requires fresh exact Docker 29.1.3/API 1.52/Linux/server-version/cgroup2/systemd evidence. Production adds CgroupVersion and CgroupDriver to the selected daemon-info fingerprint, retaining the existing init, daemon executable/process and full version/info pin checks. Both original targets must contain explicit null OomKillDisable before effects. Generic comparison without the profile stays strict.

Only the shared immutable projection copies a fully inert created candidate's false OomKillDisable as null. The parser, original inspection and outgoing create request remain unchanged. Operation comparison, receipt invariant fingerprints, inert recovery and the fixed read-only Caddy observation consume that same declared profile. Running/stopped false, true, missing values, wrong profiles and all other immutable drift refuse. Every closed production v2 receipt now requires the fixed invariantProfile identifier. Synthetic stopped-null checks establish exact comparison behavior only; they claim no native stopped-state measurement.

The native runner independently admits the same profile before fixture creation and at each admission. It requires raw created=false and running=null observations for both owned targets before reporting success, and includes only the fixed profile, exact fixture image IDs, daemon/version hashes and those guarded OOM scalars in its private report. No Docker fixture or host operation was run in this worktree.

Fresh focused verification passed 226 tests, zero failed, 1240 assertions across core, operation, observer, runner and CLI files. Actual local Unix sockets, TLS and owned native process fixtures remain part of that run. Configured uncached lint, typecheck and build passed in 26.8 seconds with three prerequisites. Initial style/type findings were fixed before this final restored run. Twenty-five watched source faults failed selected assertions and were restored: profile identity; original source admission; value presence and true-value admission; phase admission; inert status/running/dead/sandbox/endpoint evidence; default strictness; outgoing request rewrite; operation propagation; overbroad running equality; receipt profile publication/equality; Caddy declared-profile propagation; native raw value and report roster; and each exact version/API/OS/server-version/cgroup-version/cgroup-driver check.

The complete actual production-factory matrix belongs to the separate harness lane and remains unverified here. Root's subsequent owned native acceptance and concrete live-operation review are still required; these local checks grant no live effect authority.

`openspec validate --all --json` passed 280/280 items with zero failures after the profile delta. Full local outputs are `/tmp/puni-oom-final-tests.log`, `/tmp/puni-oom-final-configured.log`, `/tmp/puni-oom-watch.log` and `/tmp/puni-oom-openspec.json`; the separate report-roster omission also failed before restoration. The host-wide h2/h4 gate and native Docker execution were not run in this lane.
