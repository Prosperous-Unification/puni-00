# Verification

Stage7a implementation is reviewable; WBS 010.4.13.3 remains **in_progress** pending coordinated review and host gating. No push, PR, host gate, activation or deployment was performed by this worker.

## Baseline and resource rules

Base: `fca16386e8c993c35f169ebf57d07b04da0170a9` (repaired #488), isolated clone `/tmp/puni-488-dbpath-sol`.

The domain tests were first run against empty resolver stubs: five assertion failures, then green after implementation. A first import-only run reported the missing module and is not counted as an assertion proof.

Mounted isolated/shared cases cover retained held leaves, parents, stepless leaves, inherited sized/unsized capacities, explicit/sole assumed assignees, widths matching scheduler slices, complete/single/filtered constraints pages, outline omission, stable identity after rename/reparent, export exclusion and import ignoring malformed derived input. The capture test changes the live narrow-team capacity from 2 to 1 immediately after the repository has read it: both modes emit captured capacity 2 and width 2 while the live store holds 1. Producer injection proves older absence returns 200 and malformed present width returns 500 in both modes.

## Scheduler parity

`src/service/node-resources-schedule.test.ts` was run first with the original `slicesOf` loaded from `git show fca16386:libs/wbs/application/core/src/module/work-item/work-item.resource.ts` in a temporary sibling module, then with the extracted resolver. Both passed the same raw slice JSON assertion, including pool order `wide,narrow` with the unsized label skipped, and the same golden hashes:

- Canonical schedule input SHA-256: `836fceac297ca723748bc4d05720bb5ebe5f7b6741e30778f29bde44e26b459f`.
- Serialized Fast schedule SHA-256: `980ef345d62f1a699801b12f5f7e91779af965a080c564602865fdc3b03168e8`.

The temporary baseline module was removed. The fixture covers unnamed widths, explicit/assumed person widths, two assignments to the same person disabling assumption, effort, pool ordering and all three steps.

## Watched negative proofs

All injected production changes were restored in `finally` before continuing. Each final negative run exited 1 with test assertion failures, not an import or collection error. Adjacent `Proof:` comments identify these faults at their production sites.

| Injected production fault                                     | Observed failing oracle                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Pool minimum changed to maximum                               | Domain inherited-team width (3 vs 2); both mounted mode reads                   |
| Named width changed from 1 to stored maxParallel              | Both mounted assignment/width parity cases                                      |
| Sole-assignment fallback removed                              | Both mounted assumed-assignee cases                                             |
| Nearest-team walk given rows with ancestry stripped           | Both mounted inherited-capacity cases                                           |
| Unsized team retained in poolIds                              | Domain unsized-pool assertion; both mounted mode reads with positive estimates  |
| Parent omission removed                                       | Both mounted absent-parent metadata assertions                                  |
| Hold-reduced rows given to resource projection                | Both mounted held-leaf resource parity cases                                    |
| nodeResources removed from constraints group                  | Both mounted filtered constraints-page parity assertions                        |
| Present resource schema widened to unknown                    | Both mounted malformed-producer cases returned 200, expected 500                |
| Export resource omission removed                              | Both mounted document exports leaked nodeResources                              |
| Captured row spread into saved-plan workItems                 | `drops live node resources before canonical saved-plan persistence and hashing` |
| Stored-number width clamp removed                             | `does not widen stored parallelism to a larger team capacity`                   |
| Fallback based on distinct people instead of assignment count | `two assignments to the same person disable assumption`                         |
| Resource serialization replaced by empty records              | Both mounted per-step resource assertions                                       |

The first mounted unsized-pool injection passed because all slices had zero effort. This exposed an ineffective oracle for pool admission. The fixture now writes positive estimates for every step; the repeated injection failed both modes. The direct pool assertion also failed independently. Temporary fault logs are under `/tmp/puni-node-resources-*.log`; the observed outcomes above are the committed evidence.

## Commands and outcomes

Final targeted tests: exit 0, **253 pass, 0 fail, 1072 assertions across 10 files**. Direct compiler build: exit 0, no diagnostics.

```sh
bun test libs/wbs/domain/domain/src/node-resources.test.ts libs/wbs/domain/contracts/src/http/work-item-response.test.ts libs/wbs/domain/contracts/src/http/work-item-fields.test.ts libs/wbs/application/core/src/service/node-resources-schedule.test.ts libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts libs/wbs/application/core/src/module/plan-document/plan-document.resource.test.ts libs/wbs/application/core/src/service/saved-plan-input.test.ts apps/wbs/be-01/src/controller/step-node-resources.controller.db.test.ts apps/wbs/be-01/src/controller/work-item-rows.controller.db.test.ts apps/wbs/mcp-01/src/openapi-tools.test.ts
bunx tsc --build --force libs/wbs/domain/domain/tsconfig.json libs/wbs/domain/contracts/tsconfig.json libs/wbs/application/core/tsconfig.json apps/wbs/be-01/tsconfig.json apps/wbs/mcp-01/tsconfig.json
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json
```

Changed-file checks: `bunx eslint` over all 16 changed TypeScript files exited 0; `bunx prettier --check` over all 22 changed TypeScript/Markdown files exited 0. `git diff --check` exited 0.

OpenSpec: exit 0, 211 valid items (193 changes, 18 specs), zero failures. The unqualified `openspec` binary was absent, so validation used the repository-pinned Bun package.

The attempted `bunx nx run-many --target=typecheck --projects=wbs-domain,wbs-contracts,wbs-core --parallel=1` printed daemon/plugin socket permission failures and returned without task results. Repeated with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`, it stalled after the target banner and was canceled (exit 130). Neither invocation proves an Nx target passed. The direct compiler command above is the same underlying command declared by those project targets and the be-01/mcp-01 targets, and is reported separately.

## Checks outside this worker's scope

The canonical host gate, full build, whole-repository lint/test and CI-only secrets/migration checks were not run. The clone initially had no installed `.git/hooks/pre-commit`; `bunx lefthook install` exited 0 and installed the normal pre-commit and agent-trailer hooks before committing. No migration or dependency changed. Root coordinates the required `bin/h2puni-gate.sh <sha>` on the reviewable commit before any completion claim.
