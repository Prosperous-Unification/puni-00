# Gateway upgrade dependency admission — 2026-10-23

This bounded task 10.1 packet starts from `e6fcc4d1d`. It adds the canonical
`POST /internal/gateway/dependency-admission` shape and binding, using internal
secret identity before the existing fresh authority/binary/client admission. The
empty request returns no-store 204 or the existing typed incompatibility 409;
there is no receipt, project observation or mutation.

The production gateway authenticates origin/credential first, then asks the
backend on every upgrade/reconnect under its finite attempt/overall deadline.
Only the intersection of exact offered WS token and immutable gateway support
can produce the HTTP semantic claim. The current frozen gateway capability stays
empty. One Request's promise is memoized because Elysia invokes `beforeHandle`
twice during a successful upgrade; separate Requests never share admission.

Bun's native upgrade automatically echoed an offered v1 token even after deleting
it from the JS Request's headers. A raw TCP observation also showed that an empty
response selection produced two protocol headers (one empty, one v1), and the Bun
client hung. Consequently this binary explicitly refuses every offered protocol
before upgrading, including under DISABLED authority. The real-socket tests prove
DISABLED no-token success, DISABLED offered-v1 refusal, and fresh ENABLED refusal.
The current front end offers no v1 token. Future capable protocol negotiation and
client claim sending remain deferred; the failed empty-header approach is absent.
Upstream transport context: [Bun issue 18243](https://github.com/oven-sh/bun/issues/18243).

## Checks

- `bun test src --timeout=10000` from `apps/wbs/gw-01`: 161 pass, 0 fail,
  3684 assertions across 25 source test files.
- `bun test apps/wbs/be-01/src/http/elysia/gateway-dependency.db.test.ts apps/wbs/be-01/src/http/elysia/dependency-client.db.test.ts apps/wbs/be-01/src/app.routes.test.ts apps/wbs/be-01/src/app.test.ts apps/wbs/be-01/src/controller/organization-context.controller.db.test.ts`: 23 pass, 0 fail, 1761 assertions. The new acceptance uses migrated SQLite, mounted backend HTTP and the existing real production gateway subprocess, with actual origin and signed cookie authentication.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-contracts:test:unit`:
  606 pass, 0 fail, 2609 assertions. Canonical endpoint ownership, dependency
  operation coverage, internal identity/origin and organization-control inventories
  include the new endpoint.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-gw-01,wbs-be-01,wbs-contracts --output-style=static`: all three typechecks and backend module typecheck passed.

Initial broad root-level Bun directory filtering also collected generated compiler
output, producing unrelated duplicate-module errors; those are not counted as
source-test evidence. Source suites above use their explicit configured locations.
A sandbox-only run could not listen on loopback; real socket checks were rerun
with loopback permission. Earlier canonical shape promotion exposed pinned test
inventories and a relative project import; inventories were extended and the real
gateway acceptance moved to the existing subprocess boundary. Those failures were
corrected before the successful runs above.

Final additional checks:

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint -p wbs-gw-01,wbs-be-01,wbs-contracts --output-style=static`: all three lint targets passed, with the Nx project graph available.
- `bun test apps/wbs/mcp-01/src/shape-document.test.ts apps/wbs/mcp-01/src/openapi-tools.test.ts`: 38 pass, 0 fail, 409 assertions; the canonical new internal shape does not break MCP tool-document consumers.
- `bunx openspec validate --all --json`: 272 items passed, zero failed (254 changes and 18 specifications).
- Changed source files passed `bunx prettier --check`; `git diff --check` passed.

## Watched R5 negatives

Each source fault was applied separately, its test failure observed, then the
source restored. Adjacent production `Proof:` comments name these observations.

| Injected production fault                           | Observed negative                                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Remove local immutable binary-support conjunction   | Semantic helper expected false but received true for empty binary support; capable-claim client test also failed |
| Replace exact token membership with prefix matching | Prefix token was admitted in the semantic client tests                                                           |
| Corrupt outbound semantic header                    | Exact capable offer received incompatibility instead of admission                                                |
| Accept typed 409 as success                         | Incompatible client received admission                                                                           |
| Remove status guard                                 | First unexpected-status case (200) resolved instead of rejecting                                                 |
| Remove closed refusal-envelope field count          | Extra trusted field ceased to throw                                                                              |
| Remove finite positive budget validation            | Invalid-budget test observed the wrong failure                                                                   |
| Skip upgrade refusal                                | ENABLED reconnect opened a real socket                                                                           |
| Reuse first admission across Requests               | ENABLED reconnect reused DISABLED admission and opened                                                           |
| Return undefined from transport failure catch       | First transport-failure case opened a socket; the mode loop stopped there                                        |
| Remove internal identity policy                     | Corrected rerun: line 95 expected 401, received 204; one assertion before failure                                |
| Remove no-store default                             | Corrected rerun: line 99 expected "no-store", received null; four assertions before failure                      |
| Remove unsupported-protocol refusal                 | DISABLED offered-v1 upgrade opened and negotiated v1                                                             |

### Correction of endpoint proof evidence

The original `internal-secret` and `no-store` mutation commands used
`--timeout=2000`. Their raw output showed only a timeout and one killed dangling
subprocess; it did **not** establish either claimed assertion. Those two original
claims were unsupported and are superseded by the independently rerun evidence
below. The prior logs are retained as
[internal-secret timeout](evidence/gateway-client-admission/prior-internal-secret-timeout.log.txt)
and [no-store timeout](evidence/gateway-client-admission/prior-no-store-timeout.log.txt).

On `f162aa280`, each mutation was rerun independently with loopback access using:

```sh
bun test apps/wbs/be-01/src/http/elysia/gateway-dependency.db.test.ts --timeout=10000
```

- Removed only `{kind: 'identity', require: 'internal'}`, retaining
  `{kind: 'organization-control'}`: [raw failure](evidence/gateway-client-admission/internal-secret.log.txt)
  names `internal gateway admission authenticates first and freshly refuses incompatible upgrades`,
  line 95, `Expected: 401` / `Received: 204`; exit 1, one assertion, no timeout.
- Restored identity, then removed only `defaultResponseHeaders`:
  [raw failure](evidence/gateway-client-admission/no-store.log.txt) names the same
  test, line 99, `Expected: "no-store"` / `Received: null`; exit 1, four assertions,
  no timeout.
- Restored both controls: [raw green control](evidence/gateway-client-admission/restored.log.txt)
  records exit 0, one passing test, zero failures and 20 assertions. Neither
  production behavior nor test behavior changed for these reruns.

All 13 original mutation logs were inspected. The other 11 contain assertion
failures rather than timeout-only exits. Their descriptions above were tightened
where a loop stopped at its first failure: unexpected status 200 and the first
transport failure were observed; that mutation run did not execute later loop
cases. The unmutated tests cover the remaining statuses and failure modes.

Existing mounted backend negatives retain missing/malformed/closed authority and
coherent transaction coverage. The new gateway route uses that same mounted
production admission path without a second authority read.

## Limits

Rolling this gateway out against an older backend that lacks the new internal
endpoint produces backend 404, which the gateway maps to 503 and refuses before
upgrade. Deploy the matching backend endpoint before this gateway. Every offered
WebSocket subprotocol receives 409 until capable negotiation is implemented;
DISABLED legacy clients that offer no protocol still upgrade.

No binary advertises v1. No production activation or authoring is enabled. This
packet does not fence existing sockets, delivery/activation intervals, retained
clients or old process participants. Task 10.1 remains open for those requirements,
independent exact-head review and the integrated isolated h2/h4 host gate. No build,
full monorepo test run, remote gate, push or deployment was performed here.
