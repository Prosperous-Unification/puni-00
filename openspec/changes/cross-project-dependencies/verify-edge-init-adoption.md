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
