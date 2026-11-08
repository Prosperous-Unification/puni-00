# Frozen transfer v11 checkpoint review

**REJECT** the submitted patch pending the historical-version refusal fix below. This verdict concerns the bounded dormant parser/preparation checkpoint, not completion of OpenSpec task 8.1.

Reviewed 2026-10-22 in `/tmp/puni-transfer-v11`, HEAD `879067fda351b26e2996be5664762a2447198a52`. Both the supplied patch and the tree's final `git diff --binary` have SHA256 `0fe072406bf30180c9de42f04aca8950272076a6275967b12bb3da01b65db868`. No tracked feature source was edited. Review probes and logs are separate files in `/tmp`.

## Blocking finding

**P1 — v1–3 bypass the new external declaration refusal and commit a plan with the prerequisite discarded.**

`libs/wbs/application/core/src/module/plan-document/plan-document.resource.ts:621` places the new historical external-identity guard inside `if (version >= 4)`. Consequently, a v1, v2, or v3 document containing a v11 `kind: 'external'` predecessor is classified successfully with `typedDependencies: []`. Preparation then sees no external dependencies, so the dormant refusal does not run.

This is observed behavior, not a hypothetical activation issue. `/tmp/puni-transfer-review-probes.test.ts` imports through `OrganizationHarness.openComposed`, a real scoped user and `POST /api/projects/import`. Three separate cases declare an absent external project/row under versions 1, 2 and 3. All return **201**, create a project and directory entries, and fail the expected 400 assertion. `/tmp/puni-transfer-review-probes.log` records 0 pass / 3 fail and the created project IDs. A separate classifier probe confirmed all three normalize the declared link to an empty array. The v1 fixture omits its unsupported allowance field; otherwise the cases use the existing plan fixture.

This violates the architecture review's explicit requirement to refuse external declarations disguised under an older version, and the delta spec's prohibition on silently discarding unresolved external references. Preserving old local legacy semantics does not require accepting newly recognizable external declarations.

Move or extract the external-declaration screening so it runs for every supported historical version before the v1–3 converter ignores ordinary old typed fields. Retain existing v1–3 local conversion behavior. Add mounted cases for each affected version that assert the offending dependency path and byte-for-byte unchanged tables/announcements. Remove the new screening in an isolated mutation and observe those cases return 201 before restoring green tests and recording the adjacent R5 proof.

## What the checkpoint does establish

- Export deliberately remains v10. The separate reserved external version is 11. Historical endpoint shapes remain separate; Navigator retains its 7–10 reader and v11 refusal. The focused Navigator tests passed independently.
- v11 authored successors must be internal. Predecessors are explicitly internal or external; external identity carries project/row and applicable step separately from captured labels. A mixed internal/external-identity probe was refused rather than silently normalized.
- Mapping declaration membership compares project, row, scope and applicable step. Repeated mapping sources and scope changes are refused. Mapping destination selection is stored separately in `PreparedImport.externalDependencies`; it does not search display addresses or get remapped as a local row.
- Correctly labelled v11 external imports are refused with typed 409 `external_dependencies_inactive` before directory/project writes in the admitted callback. The real mounted test passed independently, including its full user-table snapshot assertion. The transaction still performs its existing scoped authorization and before-capture before invoking that callback.
- The new code does not add a reachable external relationship write path. Existing local import source contracts pass for both memory and SQLite adapters. No observed source-level authority bypass authorizes an external write in this dormant checkpoint; the blocker instead drops the declaration before dormancy.

## Fresh independent verification

1. `bun test libs/wbs/application/core/src/module/plan-document/plan-document.resource.test.ts libs/wbs/application/core/src/module/plan-import/module.test.ts libs/wbs/application/core/src/http/import.routes.test.ts libs/wbs/domain/contracts/src/http/import-shapes.test.ts apps/wbs/be-01/src/http/elysia/plan-document-boundary.test.ts apps/twilight-structure/twilight-navigator/cli/src/plan-reference.test.ts` — **156 pass, 0 fail**, `/tmp/puni-transfer-review-focused.log`.
2. `bun test libs/wbs/adapters/store-memory/src/import.service.test.ts libs/wbs/adapters/store-sqlite/src/import.service.db.test.ts libs/wbs/application/core/src/service/prepare-import.test.ts` — **141 pass, 0 fail**, `/tmp/puni-transfer-review-source.log`.
3. `bun test apps/wbs/be-01/src/controller/import-export-organization.controller.db.test.ts` — **35 pass, 0 fail**, `/tmp/puni-transfer-review-mounted.log`.
4. `bunx tsc --build --force libs/wbs/domain/contracts/tsconfig.json libs/wbs/application/core/tsconfig.json` — **exit 0**, empty `/tmp/puni-transfer-review-types.log`. This covers those project configurations, not every backend/frontend/module configuration.
5. `bun test --tsconfig-override ./tsconfig.base.json /tmp/puni-transfer-review-probes.test.ts` — **exit 1**, the three expected refusal regressions fail with actual 201. Bun printed a directory-mismatch diagnostic before executing all three tests; the HTTP responses, persisted project rows and test failures are explicit in the log.
6. `git diff --check` — no diagnostics. Patch identity rechecked after tests/typechecking.

## Supplied evidence and R5 limits

The supplied final logs show 152 transfer tests passing, consistent with the independently exercised suites. `/tmp/puni-transfer-tsc.log` is empty and contains no command/status provenance; the independent typecheck above replaces reliance on that file.

`/tmp/puni-transfer-lint-final.log` explicitly reports that `@nx/enforce-module-boundaries` was skipped because no cached ProjectGraph was available. It is **not complete lint evidence**. I did not rerun lint or construct an Nx graph during this review.

Read mutation logs for the v10 disguise guard, duplicate mapping-source guard and duplicate external-declaration guard. The v10 disguise mutation changes only the refusal path (`typedDependencies[0]` becomes `.predecessor.step`); it does not demonstrate prevention of a successful lossy import. The other two supplied logs show their selected assertions fail. Additional proof comments claim observed declaration-membership, mapping-scope and mounted-dormancy mutations, but their dedicated red logs were not supplied among the transfer files inspected. I did not independently rerun implementation mutations and therefore do not certify a complete R5 matrix. No new safety proof should be inferred from passing tests alone.

## Integration instructions and remaining scope

Do not apply this frozen patch as approved. Repair the blocker, freeze a replacement patch with its new digest, and rerun the changed mounted/classifier suites plus the source contracts. Include the new R5 mutation log and a complete scoped lint result with module-boundary checking enabled. A reviewed checkpoint can then be integrated while leaving 8.1 unchecked.

Keep the v10 writer and Navigator allowlist intact until the connected detached export contract is implemented. Do not activate external import by changing `INACTIVE_EXTERNAL_DEPENDENCIES`: the import currently never consumes prepared external relationships after the guard, so enabling it would silently omit them. Active import still requires a real caller/principal revalidation seam, exact writer-bound endpoint ownership/read checks, final duplicate and connected graph checks, external insertions, and connected fanout/announcement integration in the same transaction.

The patch does not implement connected export evidence or v11 serialization, positive mapped/stable-ID external admission, current remote authorization, mapping-convergence duplicate checks, post-project/external-insert/event rollback fault tests, or mounted positive external export/import. Their absence is acceptable only for a clearly bounded dormant checkpoint; it is not evidence that task 8.1 is complete. Generated API artifacts and any shared-file integration remain the integrator's work.

No format command, complete Nx lint, full build, module-specific typecheck, OpenSpec validation, browser tests, secrets/migration checks, h2/h4 gate, deployment, or PR/merge action was performed. No host gate or release readiness is claimed.
