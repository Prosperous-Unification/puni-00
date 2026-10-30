# Bounded descendant command HTTP/MCP parity — 2026-10-23

Base: `e99adbaa8`. Worktree: `/tmp/puni-descendant-command-parity`.
This packet adds acceptance tests and evidence only. Parent tasks 3.2 and 4.2
remain open. Production external authoring remains inactive.

The existing machine-key parity fixture launches a real composed backend process
with migrated SQLite, real HTTP routes, command transaction/history stores and
connected Fast schedule reads. Generated MCP tools call that same HTTP backend
through the SDK's in-memory transport. The fixture's synthetic active command
composition is test-only; ordinary composition is retained for dormant negatives.
No shared production composition or legacy local reference admission changed.

The new tests submit the same commands through HTTP and generated MCP:

- A remote descendant-step parent has two ready leaves with two workflow steps.
  Their selected final steps finish at 2 and 4. A staged local one-day node
  starts at 4 and finishes at 5. Reversing the leaf durations exercises each
  descendant supplying the maximum predecessor bound. Remote reads independently confirm each
  leaf's schedule. Stored project/work-item/step/scope/type, minted relationship
  identity in the command response and journal, resolved local alias identity,
  journal count and connected endpoint metadata are asserted. HTTP and generated
  MCP work-item reads compare equal.
- A local successor parent alias created earlier in the same batch resolves to
  the successor project with descendant-step scope. Both local leaves begin at
  2 after the remote node and finish at 3. The journal contains resolved IDs.
- A step from the wrong project answers indexed 404, descendant-step on a leaf
  answers indexed 409, and ordinary dormant authoring answers indexed 409.
  A valid external add followed by a failing patch answers at the later index.
  Each refusal compares every table, including journal and revisions, and the
  complete publication list against the prepared snapshot.

## Test development and fault evidence

The initial new acceptance run exposed an incorrect test assumption that tree
rows were nested. The endpoint returns flat `workItems` with `parentId`; the
assertions were corrected. Those initial failures are recorded in
[evidence/descendant-command-parity/initial.log](evidence/descendant-command-parity/initial.log)
and are **not** claimed as production fault proof. No production defect was
exposed by the corrected acceptance cases.

Production faults were injected only in the isolated worktree, one at a time,
and restored before verification. The acceptance tests predate these mutations.

| Fault                                                         | Observed acceptance failure                                                                                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bind every explicit endpoint to the owner project             | Remote descendant MCP success refused (0 success status instead of 200); [receipt](evidence/descendant-command-parity/fault-project.log).          |
| Bind every non-whole endpoint with node scope                 | Both remote descendant and local descendant-parent alias MCP success refused; [receipt](evidence/descendant-command-parity/fault-scope.log).       |
| Omit all expanded external edges from `resolveConnectedGraph` | Both remote MCP leaf-order cases read the local successor at 0→1 instead of 4→5; [receipt](evidence/descendant-command-parity/fault-edge-all.log). |

Keeping only the first expanded external edge **survived** both MCP leaf-order
cases: [receipt](evidence/descendant-command-parity/fault-edge.log). The mounted
pipeline retained the full schedule bound under that fault. This packet proves
complete-edge omission is detected; it does not independently prove every
individual expanded edge is necessary or identify which later layer retains
the bound. The leaf-order cases establish the externally visible schedule for
either timing assignment, not an independent mutation proof for each edge.

## Verification

Receipts live in [the evidence directory](evidence/descendant-command-parity/).

- Existing parity baseline: `bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts --timeout=45000` — 48 passed, 0 failed, 468 assertions ([receipt](evidence/descendant-command-parity/baseline.log)); this process started before the new cases were written.
- New packet: the same path with `--test-name-pattern descendant-step` — 14 passed, 0 failed, 154 assertions ([receipt](evidence/descendant-command-parity/green.log)).
- Backend: `bun test apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts --test-name-pattern 'node authoring|node-parent|descendant|wrong-project-step' --timeout=45000` — 10 passed, 0 failed, 135 assertions ([receipt](evidence/descendant-command-parity/backend-focused.log)).
- Configured checks: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint -p wbs-mcp-01 wbs-be-01 --output-style=static` and the same command with `-t typecheck` passed, including backend module checks ([lint](evidence/descendant-command-parity/lint.log), [typecheck](evidence/descendant-command-parity/typecheck.log)).
- `OPENSPEC_TELEMETRY=0 node_modules/.bin/openspec validate --all --json` — 271/271 passed ([summary](evidence/descendant-command-parity/openspec-summary.json)).

After every source mutation was restored, the complete new descendant packet
passed again: 14 passed, 0 failed, 154 assertions in 77.90s
([receipt](evidence/descendant-command-parity/restored.log)). Final configured
MCP lint and typecheck passed after the proof comments and typed assertions were
finished ([receipt](evidence/descendant-command-parity/final-mcp-checks.log)).
Changed-file Prettier and `git diff --check` passed. Normal
`bunx lefthook run pre-commit` passed applicable lint, format, plaintext-secret,
private-nesting and tool-wiki commands ([receipt](evidence/descendant-command-parity/hooks.log)).
Tool-wiki explicitly remained inactive/uncertified because external activation
was not provisioned. Migration and doc-cap hooks skipped with no matching staged
files. The commit also runs the installed hooks without bypass. Only the assigned parity
test, this report and its evidence are changed; both faulted production files
have an empty diff.

The first sandbox baseline attempt failed at `Bun.serve` with `EPERM listen`;
approved localhost execution supplied the mounted receipts above. An initial
configured MCP lint attempt exited nonzero; direct lint identified unsafe
matcher values in the new tests, which were replaced with typed journal reads
and individual leaf assertions before the successful configured run.

## Limits

This is a bounded synthetic active command packet. It does not establish active
external OAuth delegation, every type/endpoint combination, full permission or
revocation matrices, undo/redo coverage for descendants, unavailable calendars,
optimizer outcomes, production activation, browser/socket behavior, live hosts,
Python/image acceptance or release readiness. The full host gate, full repository
Nx tests, build and browser E2E were not run for this isolated packet. No push or
deploy was performed.
