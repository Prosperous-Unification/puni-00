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
