# Task 3.2 bounded generated MCP command parity

2026-10-22; based on `ff5255989`. The dedicated
`apps/wbs/mcp-01/src/connected-command-parity.test.ts` packet exercises the actual
`createServer` tools/call handler over the SDK linked in-memory transport, derives
tools from the shared generated document, and forwards the generated method, URL,
headers and body unchanged over loopback HTTP into the mounted composed backend
in `apps/wbs/be-01/src/testing/mcp-command-parity-backend.ts`. The successful MCP
case asserts the exact generated POST URL, method, bearer/content-type headers
and serialized command body before forwarding. The child announces readiness
only after migrated seeding and authenticated warmup, has a 15-second readiness
deadline, and ordinary cases await graceful SIGTERM cleanup with exit code zero.
The lifecycle follow-up below also tests reported failure exits.

The backend validates a real API key created by the existing `addAgentPerson` /
`issueApiKey` fixtures. Direct HTTP uses the same key and actor. MCP additionally
receives SDK authInfo read/write scopes. This proves machine-key transport parity,
not active delegated-human or OAuth equivalence. Organization selection remains a
harness binding for seed browser calls; no browser organization header is forged
by the MCP forwarding adapter. Authentication audit timestamps use a fixed clock
and are primed before command snapshots, so command rollback comparisons cover
all persisted tables without hiding legitimate first-use authentication writes.

Each HTTP/MCP case opens its own migrated SQLite fixture. Under the explicit
`syntheticExternalCommands` test-only override, two dated Fast projects have
whole endpoints and two one-day steps apiece. The owner starts at 0→2; an external
FS command commits and moves it to 2→4 (2026-10-21 through 2026-10-22).
The generated MCP read equals the complete direct HTTP tree. Assertions inspect
stored endpoint project/work-item identities, whole scopes, FS type, minted
response ID versus SQLite ID, both endpoint revisions, one added journal row,
external revision receipts and nonempty committed delivery. Independent fixtures
prove later invalid patch index 1 rolls back the earlier external add, preserves
every persisted table and sends no pushes. Ordinary composition refuses with
409 external_dependencies_inactive. Read-only MCP grants refuse an otherwise
admitted command without changes or pushes.

## Watched negatives

All production mutations were applied individually and restored immediately;
none is part of the patch. Each run used:
`bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts`.

| Injected fault                                                                 | Observed failure                                                                                                                              |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `wbs-client.ts`: JSON serializer drops nested `projectId`                      | 3 pass / 3 fail. MCP add answers indexed 404 not_found; dormant control answers 404 rather than 409; rollback fails at index 0 rather than 1. |
| `command-bindings.ts`: minted response ID replaced with `fault-minted-id`      | 4 pass / 2 fail. Both successful transport cases fail response ID versus durable SQLite identity.                                             |
| `connected-step-node.ts`: resolveConnectedGraph iterates an empty external set | 4 pass / 2 fail. Both generated MCP rereads fail the expected successor 2→4 placement (actual 0→2).                                           |
| core `compose.ts`: inactive external authoring replaced with active            | 5 pass / 1 fail. Ordinary MCP dormant control succeeds (`isError` undefined rather than true).                                                |
| `server.ts`: write-scope refusal bypassed                                      | 5 pass / 1 fail. Read-only grant executes the command (`isError` undefined rather than true).                                                 |

Initial test construction exposed incorrect guessed tool spelling and the browser
bearer's expected-organization precondition, followed by an incorrect guessed
response `kind` field; those were fixture mistakes, not claimed production reds.
The watched production mutations above establish that the final assertions are
breakable. There is no new production implementation in this packet.

## Verification and limits

- Final child-process parity packet passes all six cases in the configured suite.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:test`: passed, 530 tests / 0 failures / 3005 assertions across 22 files.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:lint`: passed with the Nx project graph and boundary rule active.
- Focused ESLint for the dedicated backend fixture: passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-mcp-01:typecheck`:
  passed (fresh forced TypeScript build).
- Configured MCP lint initially exposed forbidden cross-application relative imports.
  Moving setup into the dedicated child fixture resolved them; no lint exception
  or production configuration change was introduced.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck`:
  passed, including its module typecheck dependency.
- The first full configured MCP run had 529 pass / 1 fail: README count 87
  versus 88 generated tools. `git blame` attributes 87 to `16d66bb243`; the
  subsequent merged organization-limits contract (`fb9c034bb`, included via
  main reconciliation) adds `getApiOrganizationLimits`. The other newly merged
  machine/trusted-issuer/internal routes are excluded. The README already lists
  the limits read; only its count changes to 88. The generated surface and test
  assertions are unchanged.
- Plain Nx initially printed sandbox Unix-socket permission refusals and exited
  without running the requested target; that exit is not verification. Explicit
  daemon/plugin-isolation settings above run the target in-process.

Loopback tests require sandbox network permission: the first restricted run
correctly rejected a child exiting before readiness after listen EPERM; the
verified runs used the approved loopback-capable execution.

This is intentionally bounded to whole→whole FS add and subsequent tree reads.
It does not complete the endpoint/type matrix, update/remove/history matrix,
active delegation/OAuth, production admission, activation, full integration
review or canonical host gate. Production authority remains inactive. Task 3.2
and the shared verify record are left for integration by the parent owner.

## Review follow-up: fixture lifetime (2026-10-23)

Independent review reproduced a child leak when `readDocument` threw after backend
readiness. The original setup catch covered only the readiness loop; later setup
and a rejected client close could escape without terminating the child. Two new
regressions were run against that implementation and both failed: the child still
had null exit/signal status. Emergency test cleanup force-killed and reaped those
children after recording the failure.

The fixture now owns cleanup immediately after spawn across readiness, JSON decode,
tool derivation, server creation and connection. All acquired client/server closes
settle independently; acquired transports close in finally; backend termination and
reaping run in the innermost finally even when resource cleanup rejects. Setup and
cleanup errors remain visible together. The backend receives SIGTERM, has one
second to exit, then receives SIGKILL and gets one more second to reap. Forced
termination is reported as failure even after successful reaping. Repeated close
calls share the same cleanup promise.

Three regressions inspect real child exit/signal status and `process.kill(pid, 0)`
rejection. Setup-read failure and simultaneous client/server close failures also
prove both real SDK transports reject sends with `Not connected`. A deliberately
withheld graceful stop proves forced termination, completed reaping and explicit
failure reporting. The tests retain emergency reaping so their own red runs do
not leave children behind.

Individual temporary fixture mutations were watched and restored:

| Removed protection                 | Observed negative                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| Outer setup cleanup                | Setup document failure leaves child live: 0 pass / 1 fail.                                          |
| Explicit transport-finally release | Setup and resource-close failure sends resolve instead of rejecting: 0 pass / 2 fail.               |
| Child-finally shutdown/reap        | Both failure tests see live child status: 0 pass / 2 fail.                                          |
| SIGKILL fallback                   | Forced-exit test reaches the reap deadline rather than reported completed SIGKILL: 0 pass / 1 fail. |

The strengthened focused lifecycle packet passed 3 tests / 15 assertions after
restoration. These changes affect test-fixture ownership only; production code,
activation and the bounded parity claims are unchanged.

Follow-up verification: configured MCP suite passed 533 tests / 0 failures / 3014 assertions across 22 files; configured MCP lint and forced MCP typecheck passed. The earlier backend typecheck remains applicable because the backend fixture did not change. Canonical host gate and integration verification remain parent-owned.
