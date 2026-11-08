# Task 3.2 consented scoped HTTP/MCP acceptance packet

2026-10-23; isolated `/tmp/consented-scope-parity`, base `420d7726e`.
The permanent source change is acceptance coverage in
`apps/wbs/mcp-01/src/organization-delegation.boot.test.ts`; production code already
supports these transports and remains unchanged.

## Covered behavior

The complete ordered OAuth boot suite creates a real upstream JWKS, completes
consent, obtains organization-bound sessions and uses the generated MCP tool
surface and authenticated HTTP calls against the booted backend. Its existing
test-only `active-commands` seam supplies active external-dependency authority.
Each direct HTTP request mints a fresh `oauth.bearerFor` delegation; these tokens
are single use. Existing `ids.launch` remains the successor owner.

Four added tests cover both writing transports: external node SS and FF, plus
remote descendant-step FS with dotted batch refs (`REMOTE.080.39` and
`PUNI.080.39`). Assertions retain stable project, work-item, step, scope,
relationship and journal identity, including the recorded forward dependency,
owner project and actor `u-dany`. Connected work-item reads through authenticated
HTTP and generated MCP are equal and retain the exact endpoint identity.

After a valid patch, a remote descendant-step endpoint on a leaf refuses at
index 1 with `409 not_a_parent` through both transports. The existing
`write-state` fixture compares all 13 captured tables: project, work_item,
dependency, typed_dependency, external_dependency, step, calendar_marker,
command_journal, saved_plan, saved_plan_body, organization_audit, event_log and
event_sequencer. This packet makes no push-delivery or socket-emission claim.

## Commands and observed output

All suite runs use the **complete ordered file**, never a name filter:

```sh
bun test apps/wbs/mcp-01/src/organization-delegation.boot.test.ts
```

Sandbox execution could not open the JWKS listener (`EPERM`, 0 pass / 2 fail,
including consequent teardown failure). It is unavailable evidence, not a
behavioral red. All subsequent suite runs executed outside the sandbox.
Initial test authoring exposed assertion mismatches (22 pass / 4 fail): nested
array matching needed partial relationship matching, and a multi-command batch
journals as `batch`. Those assertions were aligned with the existing contract.
No production implementation was needed or introduced.

Restored final suite: **26 pass / 0 fail, 812 assertions**, exit 0,
31.59 seconds; [green output](evidence-task-3.2-consented-scope/green.log).

The following watched production mutations ran one at a time in the isolated
checkout. Every run used the command above and exited 1; each mutation was
restored in `finally`. JSON files beside the logs contain the exact path and
replacement text. The new scoped cases failed under every fault:

| Fault                                                 | Pass / fail | Observed detection                                                                                 |
| ----------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| Raw upstream token replaces per-call `bearerFor`      | 9 / 17      | Scoped consent setup refuses with `no_active_organization`                                         |
| Drop explicit project binding for non-whole endpoints | 20 / 6      | Remote scoped writes fail rather than commit the expected identities                               |
| Normalize descendant-step as node                     | 19 / 7      | Both dotted descendant batches fail; leaf-refusal expectations also fail                           |
| Corrupt MCP nested `stepId` serialization             | 20 / 6      | Scoped generated writes fail; HTTP node case expects 409 but receives 404 in the MCP refusal check |
| Corrupt MCP nested `projectId` serialization          | 18 / 8      | Scoped generated writes fail; HTTP node case expects 409 but receives 404 in the MCP refusal check |
| Commit refused batches unconditionally                | 22 / 4      | Both new node cases detect durable `Must roll back scoped batch` patch in all-table comparison     |

See [fault evidence](evidence-task-3.2-consented-scope/). Adjacent `Proof:` comments
identify the injected faults and the assertions that detected them. Final journal
payload checks strengthen the initial green assertions after these fault runs;
the final green above verifies them against restored production code.

Additional checks and limits are recorded below. The canonical h2/h4 gate and
broader shared/controller suites are outside this bounded acceptance packet;
this packet does not claim them. In particular, another sandbox controller
suite's migration `ROLLBACK` setup failure is not evidence about these parity
cases. Integration and task/verify reconciliation belong to the coordinating
agent. No push or deployment was performed.

- `bunx --no-install tsc --build --force apps/wbs/mcp-01/tsconfig.json`: exit 0,
  empty output, rerun after final assertion edits.
- `NX_DAEMON=false bunx --no-install nx run wbs-mcp-01:lint`: exit 0 outside
  sandbox, Nx target succeeded. Direct eslint before graph creation skipped the
  module-boundary rule; the Nx run supplies its graph. Sandbox Nx printed socket
  restrictions before completing, so the outside-sandbox run is authoritative.
- `bunx --no-install prettier --write` on the changed test, this packet and the
  mutation JSON: exit 0. The initial working-tree `git diff --check` excluded
  then-untracked logs; review found trailing whitespace in the committed range.
  Logs now have trailing whitespace removed (including CRLF normalization), with
  diagnostic content retained. `git diff --check 420d7726e..HEAD`: exit 0 after
  the evidence correction commit.
- `bunx --no-install openspec validate cross-project-dependencies --json`: exit 0;
  see `evidence-task-3.2-consented-scope/openspec-validation.json`.

The request-serialization faults prove write/refusal detection; they do not
prove detection of corrupted read responses. The HTTP descendant-step case
passed under both serialization faults. Connected read equality passes with
restored production code, without a separate response-corruption proof.
