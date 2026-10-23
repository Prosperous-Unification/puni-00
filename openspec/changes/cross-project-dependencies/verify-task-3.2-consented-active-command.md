# Task 3.2 consented active command transport packet — 2026-10-23

Base: `ac7bf3a0a94b775c2bb9a6198fbb23bc27720eea`. This packet adds a
test-only active command phase to the booted organization-delegation suite.
Task 3.2 remains open.

The existing suite first proves dormant 409 refusal. Its final active phase
uses a real OAuth authorization-code consent, RS256 upstream JWT verification,
be-01 organization activation, fresh one-call WBS delegation, and the generated
MCP command tool. A direct HTTP call uses a fresh `oauth.bearerFor` delegation.
The test checks whole-FS creation, a stable-ID SS update,
successor-owned durable relationship, add/update journals assigned to the
successor project and `u-dany`, connected reread, and four
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

Each fault was applied with `apply_patch` to the named line in this isolated
clone, followed by the full booted suite, the inverse patch, and the same suite
as a control. The raw Bun output is retained under
[`evidence/task-3.2-consented-active-command`](evidence/task-3.2-consented-active-command/).
The exact test command for every run was the following, with `<log>` replaced
by the linked filename in the table:

```sh
bun test apps/wbs/mcp-01/src/organization-delegation.boot.test.ts > openspec/changes/cross-project-dependencies/evidence/task-3.2-consented-active-command/<log> 2>&1
```

It ran from the isolated clone root with loopback permission. An earlier
sandbox `EPERM listen` run is not fault evidence. Bun emitted trailing spaces
on four diff lines in the raw-token and predecessor-ID fault logs; only those
trailing spaces were removed so the base-relative `git diff --check` also
checks the retained logs:

```sh
sed -i 's/[[:blank:]]*$//' openspec/changes/cross-project-dependencies/evidence/task-3.2-consented-active-command/fault-predecessor-id.log openspec/changes/cross-project-dependencies/evidence/task-3.2-consented-active-command/fault-raw-token.log
```

| Applied fault, then inverse patch                                                                                                                       | Fault output                                                                                    | Restored control                                                                                    | Observed discriminator                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server.ts`: `await bearerFor(sessionOfCall, upstreamToken, authInfo.scopes)` → `upstreamToken`                                                         | [fault-raw-token.log](evidence/task-3.2-consented-active-command/fault-raw-token.log)           | [control-raw-token.log](evidence/task-3.2-consented-active-command/control-raw-token.log)           | Active project creation returned HTTP 403 `no_active_organization`; 9 pass, 13 fail → 22 pass, 0 fail.                                                       |
| `wbs-client.ts`: `JSON.stringify(body)` → `JSON.stringify(body).replace(/"predecessor":\{"projectId":"[^"]+"/, '"predecessor":{"projectId":"missing"')` | [fault-predecessor-id.log](evidence/task-3.2-consented-active-command/fault-predecessor-id.log) | [control-predecessor-id.log](evidence/task-3.2-consented-active-command/control-predecessor-id.log) | Active generated MCP add returned 404; 17 pass, 5 fail → 22 pass, 0 fail.                                                                                    |
| `dependency-endpoint-evidence.ts`: `authority.access` → `{ kind: 'legacy' }` in predecessor project read                                                | [fault-scoped-access.log](evidence/task-3.2-consented-active-command/fault-scoped-access.log)   | [control-scoped-access.log](evidence/task-3.2-consented-active-command/control-scoped-access.log)   | Active foreign endpoint call became unexpected HTTP 500 instead of indexed 404; 21 pass, 1 fail → 22 pass, 0 fail.                                           |
| `mcp-delegation-backend.ts`: omit the fixture's membership `DELETE` while reporting removal                                                             | [fault-member-removal.log](evidence/task-3.2-consented-active-command/fault-member-removal.log) | [control-member-removal.log](evidence/task-3.2-consented-active-command/control-member-removal.log) | The next MCP call returned 200 rather than 401; 21 pass, 1 fail → 22 pass, 0 fail. This tests removal observation, not a production membership-check bypass. |

The restored controls passed 22 tests, 0 failures and 732 assertions each.
`bunx tsc --build --force` passed for the be-01 and
mcp-01 tsconfigs. Changed-file ESLint exited 0, with the Nx module-boundary
rule skipped because no cached project graph was available. Changed-file
Prettier and `git diff --check` passed. `openspec validate --all --json` passed
273/273 items with existing warnings.

## Remaining checks

The complete task 3.2 matrix, live binary capability negotiation, active
descendant-step success, calendar/optimization outcomes, full host gate and
final integration review remain outside this packet. Durable event tables are compared on
refusal; no socket-delivery count is captured by this fixture.
