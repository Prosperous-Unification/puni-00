# Task 3.2 transport acceptance reconciliation — 2026-10-23

Verified source: `1549fb90e205c93712f3767e911bda8747a20863`. Isolated worktree:
`/tmp/puni-evidence-32-closure`, branch `evidence-task32-closure-20261023`.
This packet changes evidence only; Task 3.2 remains unchecked pending root
review and the integrated exact-SHA host gate. Dependencies are linked to
an existing installation; no install, production code or test modification was
needed. Fresh commands below ran with approved local loopback access.

## Contract and scope

Task 3.2 covers the shared command boundary and HTTP/generated MCP transport.
The command definitions retain explicit stable project IDs; shared request
shapes feed the mounted command route and generated operation document. MCP
uses that document, preserving the operation's payload and typed refusal body.
The [MCP README](../../../apps/wbs/mcp-01/README.md) already describes explicit
project identity, owner-local aliases, successor ownership and dormant refusal.

The original [source audit](verify-task-3.2-reconciliation.md) identified
acceptance gaps subsequently filled by the integrated packets below. Requiring
Task 4.2's entire authority matrix to close this transport task conflated two
separately specified obligations. Task 4.2 remains open for its own complete
admission/access/owner/shape acceptance. Tasks 10.x retain installed capability
negotiation, production activation and rollout safety. The synthetic active
command seams in these fixtures establish transport behavior; they do not
establish that production authoring is activated or ready to activate.

| Task 3.2 obligation                                                     | Integrated acceptance and production-path proof                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit project/work-item/step identity through HTTP and generated MCP | Whole FS, split and encoded node FS/SS/FF, both descendant-step timing orders and stable add/update identity in `connected-command-parity.test.ts`; [node packet](verify-mcp-node-ss-ff.md) and [descendant packet](verify-descendant-command-parity.md) retain watched forwarding/binding faults.                                                                                                                          |
| Local payload meaning and batch aliases                                 | Ordered OAuth suite retains local add/remove, typed history and dotted aliases; active machine/delegated cases resolve owner-local dotted aliases without external lookup. [Consented scope packet](verify-task-3.2-consented-scope.md) records observed binding/scope faults.                                                                                                                                              |
| Typed endpoint/not-found/conflict refusal                               | Both full files cover unknown scope, malformed IDs/encoding, explicit-project alias conflict, foreign/absent endpoints, remote step mismatch, leaf descendant refusal, dormant 409 and later-command rollback. Durable table comparisons establish atomic refusal; machine fixture also compares publication lists.                                                                                                         |
| Calendar-unavailable response                                           | Authored real external relationships lose their predecessor anchor via public PATCH; both endpoint reads retain exact HTTP/MCP body parity, project/endpoint identity, empty slices and null forecasts. [Calendar packet](verify-task-3.2-calendar-transport.md) records a watched `scheduleError` forwarding omission.                                                                                                     |
| Optimization response                                                   | Real production capture/coordinator/persistence produces terminal failure from an exited child and required-engine-unavailable without a runtime; generated MCP preserves exact HTTP tree/outcome identity. [Optimization packet](verify-task-3.2-optimization-transport.md) records three watched response corruptions and public optimizer-admission refusal controls. This is not installed solver algorithm acceptance. |
| Shared request boundary is provably breakable                           | Independent production add/update schema widening changes mounted HTTP and generated MCP unsupported-SF refusal from 400 to 422. The [optimization packet](verify-task-3.2-optimization-transport.md) retains all four observed failures, exact fault descriptions and downstream-parser limits.                                                                                                                            |
| Real consent/delegation uses the same transport                         | Complete ordered OAuth suite covers active whole FS, node SS/FF and descendant-step FS over direct authenticated HTTP and generated MCP, stable journal actor/owner identity, all-table rollback and per-call signed delegation. [Active consent packet](verify-task-3.2-consented-active-command.md) and [scoped consent packet](verify-task-3.2-consented-scope.md) retain watched production faults.                     |

No safety check changed in this evidence-only packet. Existing watched faults
were read and reconciled, not reinjected. Their linked records and adjacent
`Proof:` comments remain the evidence for breakability; fresh restored runs
below establish the integrated source behavior.

## Fresh verification

All commands ran from the isolated worktree root on the verified source above.
Both named files ran completely, with no test-name filter; the OAuth file
retains its required ordering. Configured targets bypassed Nx cache.

| Command                                                                                                                                                 | Observed output                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts`                                                                                         | Exit 0; 81 pass, 0 fail, 980 assertions; 365.95s.                                                                                                                                                       |
| `bun test apps/wbs/mcp-01/src/organization-delegation.boot.test.ts`                                                                                     | Exit 0; 26 pass, 0 fail, 812 assertions; 23.53s.                                                                                                                                                        |
| `bun test libs/wbs/domain/contracts/src/http/plan-command-shapes.test.ts apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts` | Exit 0; 28 pass, 0 fail, 211 assertions; 12.29s.                                                                                                                                                        |
| `NX_DAEMON=false bunx --no-install nx run wbs-mcp-01:test --skip-nx-cache`                                                                              | Exit 1; unavailable full-suite verdict: shared disk reached ENOSPC creating a booted backend temporary directory and writing Nx output. No completed suite summary; rerun required after disk recovery. |
| `NX_DAEMON=false bunx --no-install nx run wbs-mcp-01:lint --skip-nx-cache`                                                                              | Exit 0; configured target succeeded uncached; 26.6s.                                                                                                                                                    |
| `NX_DAEMON=false bunx --no-install nx run wbs-mcp-01:typecheck --skip-nx-cache`                                                                         | Exit 0; configured target succeeded uncached; 5.3s.                                                                                                                                                     |
| `OPENSPEC_TELEMETRY=0 bunx --no-install openspec validate --all --json`                                                                                 | Exit 0; 274/274 passed (256 changes, 18 specs), zero failures.                                                                                                                                          |

[Retained command output](evidence/task-3.2-closure/) contains the test/lint/typecheck
receipts and extracted OpenSpec summary. ANSI terminal styling and trailing
whitespace are removed from retained text logs; diagnostic content is unchanged.
Changed-document Prettier and `git diff --check` passed after the final packet
edit. The configured test target was not rerun after disk recovery; its
interruption is an environment failure, not an observed assertion regression.

## Remaining delivery checks

The configured MCP suite rerun, independent review of this reconciliation and
the canonical exact-head host gate are coordinated by the parent session.
Task 3.2 remains unchecked until the required integrated verification completes. This packet does not claim a full
backend configured suite, backend lint/typecheck, repository build, CI, browser,
installed solver/Python/image acceptance, full authority matrix or production
activation. No push, merge or deployment occurred. Draft PR #630 remains draft.
Other task checkboxes retain their prior state; transport acceptance does not
close the overall OpenSpec change or authorize activation.
