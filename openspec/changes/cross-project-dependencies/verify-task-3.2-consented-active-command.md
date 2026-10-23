# Task 3.2 consented active command transport packet — 2026-10-23

Base: `ac7bf3a0a94b775c2bb9a6198fbb23bc27720eea`. This packet adds a
test-only active command phase to the booted organization-delegation suite.
Task 3.2 remains open.

The existing suite first proves dormant 409 refusal. Its final active phase
uses a real OAuth authorization-code consent, RS256 upstream JWT verification,
be-01 organization activation, fresh one-call WBS delegation, and the generated
MCP command tool. A second caller uses a fresh `oauth.bearerFor` delegation over
direct HTTP. The test checks whole-FS creation, a stable-ID SS update,
successor-owned durable relationship, journal, connected reread, and four
foreign/absent HTTP/MCP indexed-404 refusals. For each refusal it compares all
captured project, row, relationship, journal, audit, event-log and sequencer
tables before and after the attempted batch.

The active phase is **synthetic authority only**. The fixture seeds the isolated
DB activation receipt and replaces only its booted app's command batch
`WorkItemService` with active external authoring. Its test-only app composition
also bypasses the dependency-client compatibility gate while active. Production
`BACKEND_DEPENDENCY_CAPABILITY.semantics` remains empty and production MCP does
not claim `cross-project-dependencies-v1`. No production activation, capability
advertisement, HTTP shape, generated tool, gateway, or saved-history code changed.
The active test therefore proves consent/delegation and the existing command
transport under synthetic command authority; it does not prove that an installed
binary is ready to activate the full cross-project protocol.

## Watched faults

All faults were injected only in the isolated clone, followed by source
restoration. The full booted suite was run for each.

| Fault                                                                                       | Observed failure                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.ts`: substitute the raw upstream token for `bearerFor`                              | Active project creation returned HTTP 403 `no_active_organization`; 9 passed, 13 failed.                                                        |
| `wbs-client.ts`: replace serialized predecessor `projectId` with `missing`                  | Active generated MCP add returned 404; 17 passed, 5 failed.                                                                                     |
| `dependency-endpoint-evidence.ts`: read the predecessor project as legacy instead of scoped | Active foreign endpoint call became an unexpected HTTP 500 instead of indexed 404; 21 passed, 1 failed.                                         |
| Test fixture: report membership removal without deleting it                                 | The next MCP call returned 200 rather than 401; 21 passed, 1 failed. This proves removal observation, not a production membership-check bypass. |

The restored booted suite passed: `bun test
apps/wbs/mcp-01/src/organization-delegation.boot.test.ts`, 22 tests, 0
failures, 731 assertions. `bunx tsc --build --force` passed for the be-01 and
mcp-01 tsconfigs. Changed-file ESLint exited 0, with the Nx module-boundary
rule skipped because no cached project graph was available. Changed-file
Prettier and `git diff --check` passed. `openspec validate --all --json` passed
273/273 items with existing warnings.

## Remaining checks

The complete task 3.2 matrix, live binary capability negotiation, active
descendant-step success, calendar/optimization outcomes, full host gate and
Astra review remain outside this packet. Durable event tables are compared on
refusal; no socket-delivery count is captured by this fixture.
