# verify — add-start-and-finish-dependency-types

## Spec-time commands

Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0: 125 passed, 0 failed; this change was valid. The CLI emitted informational archive warnings because its target main specs are absent. File-scoped `bunx prettier --write` and `bunx prettier --check` exited 0; check reported all matched files use Prettier style. The CP-SAT design probe named in design.md is feasibility evidence only and is not an implementation or R5 proof.

## Planned checks — pending implementation

- **Pending:** Stage A migration pair present and its typed table accepts SS/FF with endpoint/type uniqueness; verify no further schema migration is needed, or ship an additive migration.sql beside down.sql.
- **Pending:** Mounted command/MCP, undo/redo, import/export and frozen snapshot round trips for SS/FF; unsupported type and stale history refusals.
- **Pending:** CP-SAT enforcement of expanded SS/FF edges, negative FF weight, unknown endpoints, floors/deadlines and resource occupancy. Fast and the mounted project `depReach` update are covered in the Fast-slice record below.
- **Pending:** Q=48 FF counterexample, independently recomputed W_FF, quantized baseline feasibility, real materialization validation and cache/contract version retirement.
- **Pending:** Truthful Fast deadline-miss and solver-timeout states. Weighted Fast replay, latest dates, float and critical path are covered in the Fast-slice record below.
- **Pending:** Picker/browser and Gantt geometry for type labels, SS/FF anchor sides, unknown ticks, collapsed proxies and keyboard/mobile access.
- **Pending R5 proof:** Bypass the production code-rollback guard with stored SS/FF records; the swap refusal test must fail, then restore and record output.
- **Pending R5 proof:** Lower or forge W_FF; independent production-path validation must fail. Restore and add an adjacent `Proof:` comment naming the observed failure.
- **Pending R5 proof:** Skip materialized real FF comparison; the rounding counterexample must fail its publication test. Restore and record output.
- **Fast-slice proof recorded below:** Clamp a negative FF weight, restore an append-only person tail or use plan-order resource replay; weighted goldens fail.
- **Pending R5 proof:** Attach an SS/FF arrow to the wrong boundary; geometry/accessibility test must fail. Restore and record output.
- **Pending:** Format, lint, typecheck, build, OpenSpec validation and applicable h2puni gate. All implementation checks remain unverified at spec time.

## Rebase note

2026-09-27 (WBS 010.4.11.1): endpoints and whole-endpoint boundaries rebased on `address-step-nodes` (sources and sinks of the step graph; the step-order chain gives the same first and last nodes as before). Repository-root `bunx @fission-ai/openspec@1.12.0 validate --all --json` on 2026-09-27, after the Astra high review fixes on branch `batch-9/step-nodes-spec`, reported 129 items, 129 passed, 0 failed; this change was valid. File-scoped `bunx prettier --check` on every touched file reported all files use Prettier style. No application behavior is verified by this packet; the h2puni gate result is recorded in the PR.

## 2026-09-28 Fast slice (groups 2, 7, 8, 9)

The read type now includes FS/SS/FF; `isWritableRelationshipType` keeps command writes FS only. The mounted command test refused SS (15 pass / 0 fail) and a direct application-boundary test refused it (6 pass / 0 fail). The solver edge builder throws for SS/FF until the typed solver wire lands in the next PR. Fast dispatches weighted graphs to real-duration placement and replay, while all-FS graphs retain the v3 pass and the pinned `f0145c81759486b5` digest under the v4 algorithm ID. Contract version 14 retires old optimized rows; request and Fast/quantum corpus fixtures were rekeyed without regenerating FS results. The solver wire generation remains v1 because it still carries FS edges only.

Observed commands after edits and formatting:

- `env -u CLAUDECODE bun test src` from `libs/wbs/domain/domain`: 762 pass, 0 fail, 39,411 expectations.
- `env -u CLAUDECODE bun test src solver/src` from `libs/wbs/domain/contracts`: 405 pass, 0 fail, 1,202 expectations.
- `env -u CLAUDECODE bun test src` from `libs/wbs/application/core`: 713 pass, 0 fail, 2,186 expectations.
- `env -u CLAUDECODE bun test apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-graph.controller.db.test.ts`: 27 pass, 0 fail, 159 expectations.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: exit 0, 139 items passed, 0 failed; informational archive-base warnings remain.
- `bunx prettier --check` over tracked touched files and the new weighted test: exit 0, all matched files use Prettier style.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run <project>:lint:fast` for `wbs-domain`, `wbs-contracts`, `wbs-core`, `wbs-be-01`: each exit 0 after fixing an import-order error in core. The same projects' `typecheck` targets each exited 0; core's dependency module check ran and its final TypeScript target was cached on the last run.
- The requested repo-root `env -u CLAUDECODE bun test libs/wbs/domain/domain libs/wbs/domain/contracts/solver` was also run: 1,726 pass, 9 fail, 4 errors. Bun collected generated `dist/out-tsc` and unrelated root-sensitive tests; the project-scoped commands above are the project test contracts and passed. The first root run, before fixture rekeying, additionally failed the expected v13 pins; those were updated.

Observed production-path negative proofs, with each fault restored:

- Whole endpoint expansion changed to first leaf only: `slice-edges.test.ts` gave 30 pass / 4 fail, including parent SS/FF output of one pair instead of four and the FS parent cycle disappearing. `Proof:` is adjacent to the map in `resolveEndpoint`.
- FF weight clamped to zero: `schedule-weighted.test.ts` gave 3 pass / 3 fail; B moved from day 0 to day 4 in the early FF case. `Proof:` is adjacent to the weight derivation.
- Person search restored to an append-only tail: weighted suite gave 4 pass / 2 fail; B moved from day 0 to day 11 instead of filling the gap. `Proof:` is adjacent to `findPersonWindow`.
- Person resource edges kept in node/plan order: weighted suite gave 5 pass / 2 fail; the feasible augmented cycle's latest starts changed from 10/0/9 to 9/0/10. Omitting those edges also gave 5 pass / 2 fail and C latest start 10 instead of 9. Both `Proof:` comments sit at `rebuildResourceOrder`.
- Backward relaxation limited to one pass: weighted suite gave 6 pass / 1 fail; A/C latest starts became 20/19 instead of 10/9. `Proof:` is adjacent to the cyclic fallback.
- Materialized boundary comparison forced false: weighted suite gave 8 pass / 1 fail; B finished at 32024810461.572468 before A at 32024810461.57247. Restoring it reconciled Fast placement and made the unreconciled pinned start throw. Reverting the resource annotation to raw `before.start + edge.weight` gave 8 pass / 1 fail, mislabeling the reconciled Fast slice `optimizer` instead of `predecessor`. Both `Proof:` comments are adjacent to those checks.
- All three application write guards widened to the read predicate: `work-item/module.test.ts` gave 5 pass / 1 fail, accepting SS with `{ ok: true, value: "item-7" }`. The adjacent `Proof:` is in `typedRefusal`. Widening only the two command entry checks did not fail because `typedRefusal` still refused the write; the direct test makes the collective gate breakable.

The full Nx gate, host gate, build, CP-SAT wire, command/import SS/FF writes and UI checks were not run or changed in this slice. The user explicitly excluded the full gate and assigned the wire and write opening to later PRs. The existing pending checks above remain for those PRs.

Commit attempt: `git add` could not create `/home/df/wd/puni/puni-00/.git/worktrees/b9-010-4-7-step-deps-b/index.lock` (`Read-only file system`, exit 128). A direct write probe to that Git worktree metadata directory also returned `Read-only file system` (exit 1). All source and artifact edits remain in this worktree, unstaged; no commits or push were made.

The requested Astra math review was attempted with `codex exec -m gpt-6-astra -c model_reasoning_effort=high --skip-git-repo-check` and the schedule/design file paths. It exited 1 because workspace routing discovery and HTTPS requests failed; no review answer was returned. The production tests and mutation proofs above remain the available evidence.
