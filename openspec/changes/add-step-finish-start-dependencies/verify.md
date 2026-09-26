# verify — add-step-finish-start-dependencies

## Spec-time commands

Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0: 125 passed, 0 failed; this change was valid. The CLI emitted informational archive warnings because its target main specs are absent. File-scoped `bunx prettier --write` and `bunx prettier --check` exited 0; check reported all matched files use Prettier style. No application behavior is verified by this packet.

## Planned checks — pending implementation

- **Pending:** Migration lint, apply and rollback with an empty typed table; production rollback guard refusal when typed rows exist, plus explicit recovery command. Check absent versus unreadable trusted migration state separately.
- **Pending:** Expanded slice-graph cases: parent Cartesian product, self-slice/cycle refusal, apparent work-item cycle acceptance, referenced-step deletion refusal, reparenting and step reorder.
- **Pending:** Mounted HTTP/MCP old-client compatibility and typed add/edit/remove, duplicate and invalid-reference 4xx, batch atomicity, stale undo/redo.
- **Pending:** Versioned export/import, whole-project copy, subtree duplication and frozen saved plan/snapshot round trips, including malformed new-format rejection.
- **Pending:** Fast and CP-SAT golden corpus, canonical hash/cache retirement, independent materialized FS validation and unknown zero-duration predecessor.
- **Pending:** Browser/geometry and accessibility checks for default add, Customize, chips, keyboard/mobile, endpoint ticks and collapsed proxies.
- **Pending R5 proof:** Omit one parent-expanded edge; a mounted add or scheduler validation test must fail. Restore and add adjacent `Proof:` comment naming the observed failure.
- **Pending R5 proof:** Bypass rollback guard with typed rows; rollback safety test must fail. Restore and record the observed output.
- **Pending R5 proof:** Pin legacy anchor or substitute visual placeholder duration; a production-path scheduling test must fail. Restore and record output.
- **Pending R5 proof:** Accept a dangling step or stale undo; mounted refusal test must fail. Restore and record output.
- **Pending:** Format, lint, typecheck, build, OpenSpec validation and applicable h2puni gate. All implementation checks remain unverified at spec time.
