# verify — add-start-and-finish-dependency-types

## Spec-time commands

Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0: 125 passed, 0 failed; this change was valid. The CLI emitted informational archive warnings because its target main specs are absent. File-scoped `bunx prettier --write` and `bunx prettier --check` exited 0; check reported all matched files use Prettier style. The CP-SAT design probe named in design.md is feasibility evidence only and is not an implementation or R5 proof.

## Planned checks — pending implementation

- **Pending:** Stage A migration pair present and its typed table accepts SS/FF with endpoint/type uniqueness; verify no further schema migration is needed, or ship an additive migration.sql beside down.sql.
- **Pending:** Mounted command/MCP, undo/redo, import/export and frozen snapshot round trips for SS/FF; unsupported type and stale history refusals.
- **Pending:** Shared expanded graph, parent SS/FF Cartesian pairs, valid negative FF weight, zero-duration unknown endpoints, floors/deadlines and resource occupancy in Fast and CP-SAT.
- **Pending:** Q=48 FF counterexample, independently recomputed W_FF, quantized baseline feasibility, real materialization validation and cache/contract version retirement.
- **Pending:** Fast replay, latest dates, float and critical path with a longer FF successor starting earlier, plus truthful Fast deadline-miss and solver-timeout states.
- **Pending:** Picker/browser and Gantt geometry for type labels, SS/FF anchor sides, unknown ticks, collapsed proxies and keyboard/mobile access.
- **Pending R5 proof:** Lower or forge W_FF; independent production-path validation must fail. Restore and add an adjacent `Proof:` comment naming the observed failure.
- **Pending R5 proof:** Skip materialized real FF comparison; the rounding counterexample must fail its publication test. Restore and record output.
- **Pending R5 proof:** Clamp a negative FF weight or use chronological replay; Fast golden/float test must fail. Restore and record output.
- **Pending R5 proof:** Attach an SS/FF arrow to the wrong boundary; geometry/accessibility test must fail. Restore and record output.
- **Pending:** Format, lint, typecheck, build, OpenSpec validation and applicable h2puni gate. All implementation checks remain unverified at spec time.
