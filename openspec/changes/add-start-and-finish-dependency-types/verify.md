# verify — add-start-and-finish-dependency-types

## Spec-time commands

Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0: 125 passed, 0 failed; this change was valid. The CLI emitted informational archive warnings because its target main specs are absent. File-scoped `bunx prettier --write` and `bunx prettier --check` exited 0; check reported all matched files use Prettier style. The CP-SAT design probe named in design.md is feasibility evidence only and is not an implementation or R5 proof.

## Task group 1 — code rollback guard (2026-09-28)

- Stage A `migration.sql` already permits `FS`, `SS`, `FF`, keys uniqueness by endpoints and type, and ships beside a guarded `down.sql`; no SQL migration was added.
- Red: `env -u CLAUDECODE bun test src/swap.test.ts src/lib/reconcile.test.ts` from `tools/tool-remote-scripts` reported 14 pass, 2 fail, 1 error before implementation: the planner lacked `relationship-types`, and the swap test could not import its command builder. The backend CLI test failed with exit 1 before its file existed.
- Green: `env -u CLAUDECODE bun test src/swap.test.ts src/lib/reconcile.test.ts src/lib/docker.test.ts` from `tools/tool-remote-scripts` reported 146 pass, 0 fail. `env -u CLAUDECODE bun test src/relationship-types-cli.test.ts` from `apps/wbs/be-01` reported 1 pass, 0 fail. These cover the production swap's refusal/abort, compatible and FS-only acceptance, absent table, malformed output, command failure, and shell/SQLite command scripts.
- **R5 proof:** Replaced the production comparison with `stored.filter(() => false)`. `env -u CLAUDECODE bun test src/swap.test.ts -t 'refuses FS-only code with stored FF'` reported 0 pass, 1 fail: `Expected value: StringContaining "FF (2)"; Unable to find property`. Restored the comparison and added the adjacent `Proof:` comment in `swap.ts`.
- **R5 proof:** Replaced the source-directory check in `relationshipTypesCommand` with an unconditional FS fallback. `env -u CLAUDECODE bun test src/lib/docker.test.ts -t 'does not treat an inaccessible CLI directory'` reported 0 pass, 1 fail: `Expected: 74, Received: 0`. Restored the check and added the adjacent `Proof:` comment in `docker.ts`. The test was then renamed to say “missing source directory” precisely.
- With `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`, `bunx nx run tool-remote-scripts:lint:fast`, `bunx nx run wbs-be-01:lint:fast`, `bunx nx run tool-remote-scripts:typecheck`, and `bunx nx run wbs-be-01:typecheck` each reported `Successfully ran target` and exited 0. Earlier daemon-backed commands had exited 0 after socket warnings without target output, so their exits were not accepted as verification.
- `bunx prettier --check` on all eleven touched files exited 0: `All matched files use Prettier code style!`.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0; 139 items passed, 0 failed.
- Compatible readers have not been deployed; task 1.2 stays open until that happens before Stage B enables SS/FF writes. The h2puni host gate was not run from this `pop-os` worktree. No production deployment was attempted.
- Commit attempt failed before staging: Git could not create `/home/df/wd/puni/puni-00/.git/worktrees/b9-010-4-7-step-deps-b-rollout/index.lock` (`Read-only file system`). The worktree changes remain uncommitted; no push was attempted.

## Planned checks — pending implementation

- **Pending:** Mounted command/MCP, undo/redo, import/export and frozen snapshot round trips for SS/FF; unsupported type and stale history refusals.
- **Pending:** Project `depReach` update atomicity with typed SS/FF and legacy links; shared expanded graph, parent SS/FF Cartesian pairs, valid negative FF weight, zero-duration unknown endpoints, floors/deadlines and resource occupancy in Fast and CP-SAT.
- **Pending:** Q=48 FF counterexample, independently recomputed W_FF, quantized baseline feasibility, real materialization validation and cache/contract version retirement.
- **Pending:** Fast replay, latest dates, float and critical path with a longer FF successor starting earlier, plus truthful Fast deadline-miss and solver-timeout states.
- **Pending:** Picker/browser and Gantt geometry for type labels, SS/FF anchor sides, unknown ticks, collapsed proxies and keyboard/mobile access.
- **Pending R5 proof:** Lower or forge W_FF; independent production-path validation must fail. Restore and add an adjacent `Proof:` comment naming the observed failure.
- **Pending R5 proof:** Skip materialized real FF comparison; the rounding counterexample must fail its publication test. Restore and record output.
- **Pending R5 proof:** Clamp a negative FF weight or use chronological replay; Fast golden/float test must fail. Restore and record output.
- **Pending R5 proof:** Attach an SS/FF arrow to the wrong boundary; geometry/accessibility test must fail. Restore and record output.
- **Pending:** Format, lint, typecheck, build, OpenSpec validation and applicable h2puni gate. All implementation checks remain unverified at spec time.

## Rebase note

2026-09-27 (WBS 010.4.11.1): endpoints and whole-endpoint boundaries rebased on `address-step-nodes` (sources and sinks of the step graph; the step-order chain gives the same first and last nodes as before). Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` on 2026-09-27, after the Astra high review fixes on branch `batch-9/step-nodes-spec`, reported 129 items, 129 passed, 0 failed; this change was valid. File-scoped `bunx prettier --check` on every touched file reported all files use Prettier style. No application behavior is verified by this packet; the h2puni gate result is recorded in the PR.
