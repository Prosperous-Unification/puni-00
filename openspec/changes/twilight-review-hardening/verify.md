# Twilight review hardening verification

Scope: corrections requested after the branch review, starting from `9b8a38a2`
on `work/twilight-structure-plan`. This record captures verification before commit
and push; the reviewed diff and the new files in this change and
`tools/tool-workflows/` identify the scope. No runtime implementation, migration,
archive, merge or deployment was performed. Historical pilot/reviewer receipts
remain unchanged.

## Finding dispositions

| Review finding                          | Correction and owner                                                                                                                                  | Evidence or remaining obligation                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executable upgrade compatibility absent | Control-plane restore contract pins executable/checkpoint/hook closure.                                                                               | M1 tests refusal and retained-version recovery; supported migrations and state-preserving rollback belong to Task 14. Runtime tests remain unrun. |
| Pinned policy conflicts with revocation | Authority intersects pinned scope with current grants, revocations and floors at admission/dispatch.                                                  | New normative scenarios and Tasks 3–4 oracles; runtime unrun. Relaxation cannot enlarge approval.                                                 |
| Expired worker can request a new effect | Effect execution owns dispatch fencing and resource-specific settlement, including workspace isolation.                                               | Tasks 4/6 use a still-live stale worker, independent effect counter and remote resource state; runtime unrun.                                     |
| Required design omitted by fast-forward | Twilight tasks now depend on conditional design, keeping verify outside planning.                                                                     | Actual pinned CLI negative and restored control below. Applicability is still a caller obligation in this pilot.                                  |
| Archive lookup failures hidden          | Shared policy distinguishes valid optional absence, specifically identified incompatibility, and unexpected failure.                                  | Fresh skill scenarios below; contradictory bulk tail found and corrected during testing.                                                          |
| Approval retry versus token replay      | Same authenticated command retrieves its historical receipt; a new command cannot reuse the token.                                                    | Backend test assigned to Task 3; FE/MCP journey assigned to Task 5, avoiding a dependency cycle. Runtime unrun.                                   |
| Agentic development scalability         | Deep invariant-owning modules, change-keyed plan locks, input/output receipt lineage, explicit CAS conflicts and measurable proposed storage budgets. | Existing product tasks carry the future tests and stop criteria. Budgets are proposed thresholds, not performance measurements.                   |
| Workflow copies drift                   | `tool-workflows` renders/checks all 40 installed variants from 20 existing source forms; archive and fast-forward shared blocks each have one owner.  | Uncached check is a dependency of lint and is reached by CI's existing run-many gate. No second source snapshot corpus.                           |

## Observed checks

Local runtime: Bun `1.4.0 (34cbb9a40)`. OpenSpec integration asserts exact version
`1.12.0` before exercising its fixture. CI's Bun `1.3.14` was not executed here.

| Command/check                                                                                                             | Observed outcome                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_ISOLATE_PLUGINS=false NX_DAEMON=false bunx nx run-many -t test lint typecheck --projects=tool-workflows --parallel=2` | Exit 0; 16 tests passed, 0 failed; 40 variants checked; lint and source/spec typecheck passed. Implementer and coordinator both ran the selected gate. [Retained output](evidence/tool-gate.txt). |
| `OPENSPEC_CLI=<installed-1.12.0-bin/openspec.js> bunx nx run tool-workflows:integration`                                  | Actual pinned CLI integration passed, 1 test, 0 failures. The direct test output is [retained](evidence/design-traversal-green.txt).                                                              |
| `bunx nx format:check --all`                                                                                              | Exit 0.                                                                                                                                                                                           |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                  | Exit 0; 40 changes passed, 0 failed; no main specs. Eight existing archive INFO findings remain.                                                                                                  |
| Scoped relative-link and product-plan preservation checks                                                                 | 72 relative links/anchors resolved across 17 docs; original 20 product deliverables preserved and unchecked; proposal 198 words.                                                                  |

Default Nx isolated plugin workers failed in this sandbox. The named environment
settings above allowed the actual Nx targets to run; they do not replace those
targets with a different checker. Terminal color-environment warnings were emitted
but no selected gate failed. This was not the full application gate.

The final `bunx @fission-ai/openspec@1.12.0 schema validate twilight-v1`,
`bun run tools/tool-git-hooks/src/hooks/doc-caps.ts` and `git diff --check`
also exited 0.

## Failure proofs

All fault injections were restored. Filesystem mutations ran on disposable
fixtures. Comments describe observed output, not guessed failure diagnostics.
Retained terminal logs have normalized line endings and trailing whitespace.

| Check                              | Injected fault and production path                                                                         | Observed failure                                                                                                                                                                                                                        | Restored control                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Conditional design traversal       | Actual 1.12.0 status/instructions on a fixture with Twilight's design edge omitted                         | `expected [intent, specs, design, tasks]`, received `[intent, specs, tasks]`; 1 failed test. [Output](evidence/design-traversal-red.txt).                                                                                               | Actual CLI case passes; optional omission remains accepted by apply.                                                           |
| Generated-file consistency         | Remove the actual generator's comparison, then corrupt a provider command and invoke `--check`             | Divergent-command test failed: `Expected: 1 / Received: 0`. [Output](evidence/workflow-drift-red.txt).                                                                                                                                  | CLI rejects drift and generation repairs it; test passes.                                                                      |
| Required file state                | Delete or chmod-000 a canonical source or installed variant, invoke real generator/check CLI               | Exit 1 with the affected path and `ENOENT` or `EACCES`. [Commands/output](evidence/filesystem-faults.json).                                                                                                                             | Restored readable sources/variants pass.                                                                                       |
| Unknown workflow inventory         | Add an unrecognized workflow source before the inventory check existed, invoke `--write`                   | Negative failed `Expected: 1 / Received: 0`. [Output](evidence/workflow-inventory-red.txt).                                                                                                                                             | The retained test now observes refusal before generation.                                                                      |
| Source and test typecheck coverage | Separately inject an incompatible typed assignment into generator and spec file; run actual Nx typecheck   | Both commands exited 1 and named the failed `tool-workflows:typecheck` target. [Records](evidence/typecheck-faults.json). The saved transport output does not include the compiler diagnostic, so no specific TS error code is claimed. | Full selected gate passes after restoration; independent reviewer confirmed TypeScript includes generator and all three tests. |
| Archive failure handling           | Fresh agents apply old versus corrected single/bulk instructions to malformed JSON and permission failures | Baseline silently continued; first correction exposed a contradictory bulk tail. [Scenario record](evidence/skill-scenarios.md).                                                                                                        | Five fresh corrected samples distinguish stop/report from valid optional absence and identified incompatibility.               |

The ordinary suite also drives malformed frontmatter/description, absent policy or
command markers and unsupported arguments through the real generator CLI, asserting
refusal before writes. These are executable negative cases, not string snapshots
that merely repeat the implementation.

## Review and limitations

Independent contract reviewer `/root/review_contract_fixes` found one Task 3/5 test
dependency error; the correction is recorded above. Independent tooling reviewer
`/root/review_workflow_fixes` approved the implementation after checking all 40 paths,
running 16 tests, independently comparing all ten Claude skill renderings and
confirming typecheck/CI reachability. The coordinator reviewed the combined
workflow and contract changes, verified the corrected Task 3/5 ordering, and
checked preservation of the original product deliverables. No further actionable
finding remains from this review. The older Claude review describes its original
snapshot, not this diff.

Full application tests/typechecks/builds, browser gates, ACP/LangGraph execution,
resource races, cloud-browser/deployment tests, planning migration and upgrade
benchmarks were not run. This change implements repository workflow tooling and
updates proposed runtime contracts. Main specs were neither synchronized nor
archived. All existing product tasks remain future work.
