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

## Recovery Caddy read API

The core exports `projectInvariant` and `candidateInvariant` using exactly the old comparator fields; observed candidates are never rewritten through the constructor. `observeCaddyListed` accepts only the fixed internal Caddy binding, obtains complete fresh inventory and exact-ID/name/immutable/process observations before and after the unchanged fixed Exec decoder, and shares one bounded deadline. It never adds receipt/listed IDs to mutation or ordinary Caddy Exec rosters.

Actual Unix-socket cases cover original and candidate reads, fixed adapt/live argv, foreign/crossed/expanded bindings, ambiguous/missing inventory, native ID/name/role/config/image/Init/mount/alias drift, paused/restarting/PID-zero state, changed PID/start/config/name after Exec, and total deadline. Each case tests candidate mutation refusals before and after observation and rejects every create/stop/rename/start/delete transcript. Thirteen watched guard/deadline/capability faults each made a selected assertion fail, then were restored. This is local Engine-transport evidence, not native Docker or complete-factory acceptance.
