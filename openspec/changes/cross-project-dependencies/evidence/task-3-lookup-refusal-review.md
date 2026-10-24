# Lookup refusal declaration review

Verdict: **approved for this narrow response-contract correction. No severity findings.**

Reviewed commit `205df84a488a058c210303c2bf42795f68d92b6e` in `/home/df/.codex/worktrees/b3b7/puni-00`. Its sole source change is the shared 400 refusal schema in `libs/wbs/domain/contracts/src/http/project-address-shapes.ts`: it adds `invalid_params` and `invalid_body` to the existing `invalid_query` enum. The file matches the reported SHA-256 `7317bc9165c4d96696bbc9d042cfa029b9e9516a48b2db45a9227d4b41482faf` and has no difference from that commit.

The shared Elysia adapter classifies invalid params, invalid query and undeclared/malformed GET body framing with these respective codes before dispatching the handler. The expanded response schema declares those adapter codes without changing request schemas, query parsing, repeated-key checks, cursor validation, authorization, success schemas or handler behavior. It does not admit invalid input.

Precision note: the three current lookup bindings install `classifyRequestFailure: () => invalid` in `project-address.routes.ts`, where `invalid` is the 400 `invalid_query` reply. Consequently those mounted bindings currently normalize even body/params validation failures to `invalid_query`. The added enum values align the shared shape with the generic adapter vocabulary and the global GET declaration invariant; they are not evidence that these specific mounted lookup handlers newly emit `invalid_body` or `invalid_params`. This distinction does not require a code change or block the correction.

## Fresh independent verification

1. `bun test ./libs/wbs/domain/contracts/src/http/infrastructure-shapes.test.ts ./apps/wbs/be-01/src/http/elysia/mount.test.ts ./apps/wbs/be-01/src/controller/project-address.controller.db.test.ts` — **62 passed, 0 failed, 455 assertions**. Log: `/tmp/lookup-refusal-review-tests.log`. This covers the GET declaration invariant, shared adapter rejection behavior, and project-address regressions.
2. `bun test ./apps/wbs/be-01/src/controller/project-address-search.controller.db.test.ts ./libs/wbs/domain/contracts/src/http/infrastructure-shapes.test.ts` — **23 passed, 0 failed, 175 assertions**. Log: `/tmp/lookup-refusal-review-search-tests.log`. Malformed limits, repeated query keys, missing reference revision, invalid/reused cursors and organization/project/query/kind mismatches remain typed 400 `invalid_query` refusals.
3. `git diff --check`: passed. Reviewed the exact one-file commit diff and verified its current file hash.

Inspected root's baseline log: the unchanged global GET invariant failed on the discovery operation's absent `invalid_body` declaration before the correction (2 pass, 1 fail). Inspected root's actual contract target log: 495 tests/1541 assertions passed and Nx reported test, lint and typecheck success with cache skipped. Those full contract target results are root evidence, not independently rerun here. No source or Git metadata was modified by this reviewer.

No full host gate, build, deployment, e2e, or external dependency feature/activation completion is claimed. This review is separate from current-command-authority and does not broaden either slice's completion boundary.
