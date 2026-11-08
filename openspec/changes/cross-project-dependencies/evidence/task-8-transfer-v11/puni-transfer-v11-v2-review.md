# Frozen transfer v11 corrected checkpoint review

**APPROVE** the corrected frozen patch for the bounded dormant parser/preparation checkpoint. The prior v1–3 blocker is resolved. This is not approval to activate external imports, complete task 8.1, or release without integration checks.

Reviewed 2026-10-22 in `/tmp/puni-transfer-v11`, HEAD `879067fda351b26e2996be5664762a2447198a52`. The supplied `/tmp/puni-transfer-v11-879067fda-v2.patch` and independently calculated `git diff --binary` both have SHA256 `c3692fbdca60879530b008f3a238d6df2c2c3455e68ccd78a34f8613995ef688`. Identity was checked before and after verification. No tracked feature source was edited during review; additional probes and logs are in `/tmp`.

## Correction and bounded findings

The historical external-declaration screen now runs immediately after the envelope boundary is validated, before version-specific conversion. For every supported version below 11, a predecessor or successor carrying `kind`, `projectId`, or `workItemId` is refused at the dependency entry. It therefore executes before v1–3 discard their historical local typed fields. The actual HTTP route classifies before invoking import admission.

The original three mounted probes now return 400 `invalid_typed_dependency` at `typedDependencies[0]`, with no projects created. New committed mounted tests cover v1, v2 and v3 and compare every non-SQLite-internal table before/after, including directory, history and event tables. The v11 dormant import likewise returns 409 and preserves that complete logical table snapshot. These assertions establish unchanged table contents, not raw database-file byte identity or an independently instrumented network broadcast count.

Fresh independent compatibility probes cover every v1–10: valid local FS endpoints retain their existing conversion (discarded for v1–3, preserved from v4 onward), while stable external declarations on either endpoint refuse. Existing focused tests also retain historical version validation, v4 FS-only behavior, v10 export golden bytes and Navigator's historical allowlist/v11 refusal.

The new contradictory-v11-internal-identity regression passes. `requestSchema` applies deep undeclared-key rejection, so an internal endpoint cannot silently retain or discard foreign `projectId`/`workItemId` fields. Mapping membership still binds the full source project/row/scope/step tuple; mappings and descriptive labels do not resolve by address. External preparation remains separate from local ID remapping, and the admitted callback's hard-coded inactive capability refuses before directory/project writes.

Read all 14 changed files in the exact patch: contract shapes and tests; classifier and tests; preparation, prepared types and import feature/module tests; HTTP route and tests; fixture; mounted boundary and organization controller tests. No further blocking defect was found within the dormant checkpoint's scope.

## Fresh independent verification

All commands ran from `/tmp/puni-transfer-v11`.

- Focused classifier, import module, import route, import shapes, mounted boundary and Navigator suites: **158 pass / 0 fail**, `/tmp/puni-transfer-v11-v2-review-focused.log`.
- Memory/SQLite import source contracts and existing preparation suite: **141 pass / 0 fail**, `/tmp/puni-transfer-v11-v2-review-source.log`.
- `bun test apps/wbs/be-01/src/controller/import-export-organization.controller.db.test.ts`: **38 pass / 0 fail**, `/tmp/puni-transfer-v11-v2-review-mounted.log`.
- Original regression probes, `bun test --tsconfig-override ./tsconfig.base.json /tmp/puni-transfer-review-probes.test.ts`: **3 pass / 0 fail**, `/tmp/puni-transfer-v11-v2-review-probes.log`.
- Independent all-version compatibility probes with the same tsconfig override: **10 pass / 0 fail**, `/tmp/puni-transfer-v11-v2-review-compat.test.ts` and `.log`. Both external temporary test runs print Bun's directory-mismatch diagnostic before executing; their assertions and summaries explicitly show execution.
- `bunx tsc --build --force libs/wbs/domain/contracts/tsconfig.json libs/wbs/application/core/tsconfig.json`: **exit 0**, `/tmp/puni-transfer-v11-v2-review-types.log`. Coverage is those project configurations.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many --target=lint --projects=wbs-contracts,wbs-core,wbs-be-01 --skip-nx-cache`: **all three tasks succeeded**, `/tmp/puni-transfer-v11-v2-review-lint-final.log`. The initial default invocation printed sandbox socket failures and exited without a task success report; it is not counted as lint evidence. The supplied `/tmp/puni-transfer-v123-lint-uncached.log` additionally shows all three actual eslint commands with no missing-ProjectGraph skip warning, resolving the prior incomplete lint caveat.
- `git diff --check`: no diagnostics; frozen digest unchanged.

## R5 and integration caveats

Read `/tmp/puni-transfer-v123-guard-fault.log`: with the historical screen disabled, all three committed mounted cases fail their expected 400 assertion and instead receive 201 with new project IDs and created directory records. This demonstrates the precise production-path loss from the original rejection. The adjacent classifier `Proof:` comment accurately describes that supplied observation. Fresh restored runs are green. I did not independently mutate feature source during this re-review. Other earlier mutation evidence retains the limits described in `/tmp/puni-transfer-v11-review.md`; this verdict does not certify a complete future active-import R5 matrix.

Integrate only this reviewed patch, preserve the v10 writer and Navigator allowlist, retain the refusal, and leave task 8.1 unchecked. Do not enable external imports by changing `INACTIVE_EXTERNAL_DEPENDENCIES`: the current import never inserts the prepared external relationships after that refusal. Active support still needs connected export evidence/v11 serialization, transactional current ownership and caller authority checks, endpoint validation, mapping-convergence duplicates and graph checks, actual external writes, fanout/announcements, positive stable-ID/mapping cases, and rollback faults after project/external/event writes.

Generated API artifacts, merged-tree verification, and recording this checkpoint/evidence in the owning OpenSpec verify record remain integration work. No formatting command, full build, full/backend/module-specific typecheck, OpenSpec validation, browser checks, secrets/migration checks, h2/h4 gate, deployment or PR/merge action was performed. No host-gate or release-readiness claim is made.
