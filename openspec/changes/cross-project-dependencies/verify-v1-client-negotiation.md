# V1 HTTP, browser WebSocket and MCP transport negotiation

Bounded Task 10.1 transport implementation on the exact feature root
`4eeef9704214444e8b19eb888beb63aa19e829e0`, in `/tmp/puni-v1-clients` with independent
Git metadata. The backend's immutable empty capability and dormant activation are
unchanged. No activation, push, deployment, host gate or installed-byte claim.

## Behavior and role boundaries

The shared fetch transport explicitly opts into the exact dependency header only
for protected operations. Generic clients retain no default claim. The browser
HTTP adapter opts in; authentication exemptions remain unclaimed. A real
serialized Request traverses the mounted HTTP adapter and SQLite activation
admission: exact capable reads succeed, while the legacy client decodes the typed 409. Existing wrong, absent, duplicate and incapable-backend cases remain active.

The browser offers `[wbs.cross-project-dependencies.v1, wbs.legacy]` on every fresh
socket. The gateway explicitly selects V1 whenever both offered and implemented;
otherwise it selects offered legacy, or selects nothing for a no-offer legacy
client. Duplicate, malformed and unknown-only offers refuse. Admission derives
from the selected token, never the raw offer list. That same selected token stays
bound to the Request and connection for every fresh retained-delivery check.
Forward, resume and browser-project authorization requests carry only that
connection's selected semantics; legacy sockets never gain the gateway role's claim. A real V1 socket exercises forward/resume and the project-access
credential binding, and separate production-composition adapter tests cover
browser authorization headers. Existing retirement, presence removal, cancellation, replay and egress checks
remain in place. Backend ENABLED authority refuses selected legacy clients.

MCP adds the exact protected-operation header to each backend tool request and
keeps backend incompatibility in its existing tool-error transport. Constants and
operation classification moved to a narrow import without the contracts barrel;
the startup artifact/poisoned-barrel tests remain included. MCP does not infer
backend support, activate storage, or treat dependency 409 as successful content.
Gateway and MCP now advertise frozen V1 **role** support; backend capability is
independent and remains empty. New browser code requires gateway-first rollout
against historical gateways that refused every offered protocol. There is no
probe endpoint, transport-error downgrade, environment support switch or silent
retry with weaker claims.

## Verification

- Source-only gateway regression suite plus MCP startup/client/capability,
  contracts client/classification and mounted SQLite admission: 272 passed across
  36 files. Explicit file enumeration avoids Bun collecting emitted `dist/` tests.
- Browser project-stream adapter and organization context: 47 passed across two
  files, using the repository's jsdom Vitest config.
- Uncached Nx backend/contracts/gateway/MCP/frontend typechecks and every frontend module typecheck passed.
- Scoped changed-file ESLint and formatting are checked before commit; ordinary
  lefthook hooks are installed and retained. Final receipts accompany this file.

Initial sandbox socket tests failed with EPERM before testing behavior; permitted
localhost runs supply the socket evidence. Default Nx plugin sockets were denied
and returned no executed tasks: those are not counted. Verified Nx runs use
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false`. A startup emitter run concurrent with typechecks exceeded its existing 5/10-second test budgets (270 passed, two timed out); the serial restored control passed all 272 without budget changes. One new tuple fixture initially widened its semantics to string; a readonly literal tuple fixed the typecheck and the fresh gateway typecheck passed. Initial default-runtime ESLint runs
exited without useful diagnostics; checked runs use `bunx --bun eslint`.

## Watched production-path negatives

Captured logs live in [evidence/v1-client-negotiation](evidence/v1-client-negotiation).
Every fault was restored before the final control runs.

| Injected fault                                     | Observed failure                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Permit raw offer lists in the backend claim helper | Selected-only test received a V1 claim for an unselected offer list                                             |
| Omit fetch header                                  | Protected transport expected exact V1, received null; auth remained null                                        |
| Omit MCP header                                    | Protected tool expected exact V1, received undefined                                                            |
| Omit browser HTTP opt-in                           | Actual browser fetch expected V1, received null                                                                 |
| Omit browser WS offers                             | Both fresh constructor calls received undefined protocols                                                       |
| Omit explicit selected response header             | Legacy-first dual offer negotiated `wbs.legacy` instead of V1                                                   |
| Replace retained selected claim with null          | V1 connection retired before initial presence delivery; original proof timed out waiting for that absent roster |
| Omit duplicate-offer rejection                     | Duplicate selection returned a selected protocol instead of refusing                                            |
| Omit token-syntax rejection                        | Malformed offer containing legacy returned legacy instead of refusing                                           |
| Omit immutable gateway support predicate           | Incapable fixture selected V1 instead of legacy                                                                 |
| Omit connection semantics binding                  | Real V1 socket passed undefined semantics to project access instead of V1                                       |
| Claim V1 unconditionally on forward/resume         | Legacy downstream calls carried V1 instead of no claim                                                          |
| Claim V1 unconditionally on browser authorization  | Legacy authorization carried V1 instead of no claim                                                             |
| Omit Request-bound selection publication           | `open` threw `socket dependency protocol was not admitted`                                                      |
| Replace unsupported-offer refusal with legacy      | Unknown-only offer returned legacy instead of refusing                                                          |

The first explicit-header omission proof survived with the browser's V1-first
order because Bun implicitly chose the same first token. The final adversarial
legacy-first fixture distinguishes explicit selection from that accidental
success and observes the wrong negotiated protocol with the header removed.
Parent 10.1/10.2 and the integrated exact-SHA host gate remain open.

Final source control command:

```sh
bun test $(rg --files apps/wbs/gw-01/src -g '*.test.ts') apps/wbs/mcp-01/src/startup-document.test.ts apps/wbs/mcp-01/src/wbs-client.test.ts apps/wbs/mcp-01/src/dependency-capabilities-cli.test.ts libs/wbs/domain/contracts/src/http/client.test.ts libs/wbs/domain/contracts/src/dependency-client.test.ts apps/wbs/be-01/src/http/elysia/dependency-client.db.test.ts
```

Fresh Nx controls use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`,
`run-many -t typecheck -p wbs-contracts,wbs-gw-01,wbs-mcp-01,wbs-be-01,wbs-fe-01 --skip-nx-cache`,
and the corrected gateway fixture was followed by `nx run wbs-gw-01:typecheck --skip-nx-cache`.
Browser controls use `bunx vitest run src/lib/project-stream.test.ts src/runtime/organization-context.model.test.ts --maxWorkers=1` from `apps/wbs/fe-01`.
