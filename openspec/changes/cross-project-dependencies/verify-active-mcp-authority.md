# Bounded active generated MCP authority acceptance — 2026-10-23

Base: `5b5c28d31`. This packet adds test-only fixture controls and three generated
MCP acceptance cases. It changes no production authority predicate or composition.
Tasks 3.2 and 4.2 remain open; production external authoring remains inactive.

## Source reconciliation before implementation

| Intersection                                        | Existing evidence at base                                                                                                                                                                              | This packet                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Restricted readable predecessor without edit access | Mounted HTTP whole FS in `cross-project-dependency-commands.controller.db.test.ts`; HTTP/direct node and alias evidence in `verify.md`                                                                 | Generated MCP restricted node SS add, FF update, stable relationship identity and connected HTTP/MCP read equality |
| Queued current credential refusal                   | Mounted HTTP browser membership/revocation in `cross-project-dependency-commands.controller.db.test.ts`; generic machine and direct runner matrix in `command-current-authority.controller.db.test.ts` | Generated MCP machine-key external update after credential revocation                                              |
| Queued successor edit refusal                       | Mounted HTTP external add/update/remove in `verify-4-2-successor-edit-revalidation.md`                                                                                                                 | Generated MCP external update after another owner's successor becomes restricted                                   |
| Active endpoint scopes and outcomes                 | Existing descendant scope, node SS/FF, consented scope, calendar and optimization packets linked by `verify-task-3.2-reconciliation.md`                                                                | Reused; no duplicated scope/outcome matrix                                                                         |

The new fixture uses the existing real machine-key transport, generated shared
operation document, MCP SDK client/server and mounted backend. An authenticated
test control prepares another owner's restricted predecessor and unrestricted
successor. The caller's inability to edit the predecessor is first demonstrated
by a refused patch, with every table and publication unchanged. SS add and FF
update then succeed on explicit node endpoints. Tests compare persisted identity,
complete relationship contents, remote authored fields, both endpoint revisions,
journal count/payload/remote preconditions, publication and connected read parity.

Both queued tests first create an external relationship and read its predecessor
through generated MCP. A control holds the real composed writer and observes the
actual command enqueue without replacing its callback. A separate SQLite connection
then revokes the machine credential or restricts the other-owned successor. After
release, credential change answers the retained-operation HTTP 409
`organization_context_changed`; successor restriction answers HTTP 403 `forbidden`.
MCP retains each typed refusal. Every table and publication is compared against
the post-fault snapshot, including a preceding local rename, old relationship,
revisions and journal. The test-only process restores its writer observer and
releases a held writer during shutdown.

## Watched production-path negatives

| Independent injected fault                                                                                        | Selected observed failure                                                                             | Raw receipt                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| In `createEndpointEvidence`, refuse every restricted remote project immediately after its readable project lookup | Valid generated MCP node add becomes a tool error (projected status 0 instead of 200); 0 pass, 1 fail | [remote-edit.log](evidence/active-mcp-authority/remote-edit.log)                 |
| In `PlanCommandRunner`, use captured `caller.expectedAccess` instead of writer-time `scope.resolveAccess(caller)` | Revoked queued update returns MCP success (`isError` undefined instead of true); 0 pass, 1 fail       | [captured-access.log](evidence/active-mcp-authority/captured-access.log)         |
| Remove only `AdmittedScope.refuseOutsideScope`'s forbidden branch                                                 | Restricted-successor queued update returns MCP success; 0 pass, 1 fail                                | [successor-admission.log](evidence/active-mcp-authority/successor-admission.log) |

Each production file was restored in a `finally` block before the next injection.
No injected production change is committed. Adjacent test `Proof:` comments name
these watched faults. These are acceptance tests of existing production behavior,
so no new production implementation required a red/green change.

## Verification and limits

```sh
bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts --test-name-pattern 'restricted readable node|queued external update|commits whole FS'
```

Restored run: **5 pass, 0 fail, 67 assertions**, with 70 unrelated cases filtered.
[Receipt](evidence/active-mcp-authority/restored.log). Local loopback required
sandbox escalation; the initial sandbox run failed with `EPERM listen` and is
not behavioral evidence. Initial fixture development also corrected the expected
retained-credential 409 and assigned a distinct successor owner before testing
restriction; neither was a production defect.

`NX_DAEMON=false bunx nx run-many -t lint typecheck -p wbs-mcp-01 wbs-be-01 --parallel=1`
passes all five configured tasks with zero cache hits, including backend module
checking. [Receipt](evidence/active-mcp-authority/configured.log). Nx reports denied
plugin sockets and completes using its documented in-process fallback. Its created
ProjectGraph supersedes the initial direct ESLint run's module-boundary skip.
Changed-file Prettier and whitespace checks pass. OpenSpec `validate --all --json` passes all 273 items (255 changes, 18 specs),
exit 0. Strict change validation exits 1 on 18 pre-existing requirement-length
warnings, with no error-level issues; no requirement text is changed here. Full MCP/backend suites, build, canonical integrated host gate, browser, push and
activation are not run by this packet; the coordinator owns integrated verification.

Remaining scope includes the complete active transport/authority/shape matrix,
queued add/remove generated MCP variants, delegated OAuth race intersections,
and parent-task acceptance review. The existing packets cover individual rows;
this bounded packet does not close either parent checkbox or establish activation.
