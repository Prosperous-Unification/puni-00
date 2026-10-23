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

| Injected production fault                           | Observed negative                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Remove local immutable binary-support conjunction   | Capable-claim client test admitted empty-support binary; exact-offer/socket tests failed |
| Replace exact token membership with prefix matching | Prefix token was admitted in the semantic client tests                                   |
| Corrupt outbound semantic header                    | Exact capable offer received incompatibility instead of admission                        |
| Accept typed 409 as success                         | Incompatible client received admission                                                   |
| Remove status guard                                 | Success-shaped refusal under 200/401/500 ceased to throw                                 |
| Remove closed refusal-envelope field count          | Extra trusted field ceased to throw                                                      |
| Remove finite positive budget validation            | Invalid-budget test observed the wrong failure                                           |
| Skip upgrade refusal                                | ENABLED reconnect opened a real socket                                                   |
| Reuse first admission across Requests               | ENABLED reconnect reused DISABLED admission and opened                                   |
| Return undefined from transport failure catch       | Failed/malformed/deadline backend upgrades opened                                        |
| Remove internal identity policy                     | Wrong-secret mounted request returned 204 instead of 401                                 |
| Remove no-store default                             | Mounted response lost cache-control                                                      |
| Remove unsupported-protocol refusal                 | DISABLED offered-v1 upgrade opened and negotiated v1                                     |

Existing mounted backend negatives retain missing/malformed/closed authority and
coherent transaction coverage. The new gateway route uses that same mounted
production admission path without a second authority read.

## Limits

No binary advertises v1. No production activation or authoring is enabled. This
packet does not fence existing sockets, delivery/activation intervals, retained
clients or old process participants. Task 10.1 remains open for those requirements,
independent exact-head review and the integrated isolated h2/h4 host gate. No build,
full monorepo test run, remote gate, push or deployment was performed here.
