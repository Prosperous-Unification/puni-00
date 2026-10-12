# WBS 090/100 local diagnostic inventory

The current survey targets reviewed #380 release candidate
`a478c109d13233ffb61df874adf90c23fc583e75`. This is diagnostic evidence; it does
not accept the final release candidate, certify WBS, activate enforcement, adopt
files, enable ratchets or mark WBS work complete.

The prior surveys of `a61ce440dcbe0880559bc6d97e584e055cf7e23d` and
`74ce3c8bf3a0070b7af73198d75cdcebae385f14` remain intact. The a61 narrative is
retained in [candidate-a61ce440/verify.md.txt](evidence/candidate-a61ce440/verify.md.txt).
The original 74 survey remains under
[evidence/candidate-74ce3c8b](evidence/candidate-74ce3c8b), including its
[original verification narrative](evidence/candidate-74ce3c8b/verify.md.txt).
Astra high reviewed survey commit `394d7d964d92ea566a4621fd713cc4dcd263cbca`
with no P1/P2 findings, as reported by the coordinating agent. That review precedes
this rerun and does not approve its new evidence.

## Candidate, tool and policy

The isolated survey branch normal-merged exact candidate `a478c109` into merge
commit `84b98a87b9b0185c41d29306ca18f1ddce40be67`. The CLI checks the explicit
candidate SHA, never the survey merge HEAD. Relative to the earlier candidate,
this candidate changes backend/browser tests and the Navigator v7 decoder, its tests
and its owning docs/specs. Those incoming changes are inherited from the reviewed
#380 candidate; this survey adds only diagnostic evidence.
The actual tool source and `libs/shared`, `tsconfig.base.json`, and `bun.lock`
were freshly compared with `a478c109` and have no checkout differences.

[identity.json](evidence/candidate-a478c109/identity.json) binds the candidate and
tool SHA/tree, source subtree/entry, execution checkout SHA, Bun executable and
revision, lockfile, TypeScript compiler/package/closure identities and exact policy
digests. This runs the source CLI, not a published or activated executable.
The frozen installation and external runtime module copy from the first survey
are reused; no candidate-supplied modules are loaded by materialized extraction.
Bun remains `1.4.2+744846f84`, TypeScript `6.0.2`. Original and final policy byte
digests were rechecked before invocation.

The final external policy bytes are identical to the reviewed earlier survey:
[diagnostic-policy.json.txt](evidence/candidate-a478c109/diagnostic-policy.json.txt).
The original repository policy is also retained:
[original-policy.json.txt](evidence/candidate-a478c109/original-policy.json.txt).
The diagnostic policy preserves every registered mode as `observe` and adds only:

- Relationships: 21 actual production tsconfigs and 21 app/library public
  entrypoints across be-01, gw-01, mcp-01, fe-01, WBS libraries and shared libraries.
  Existing `docs/wiki-policy/relationships.json` selected-fact declarations remain.
- Plain sources: 442 exact tracked `.ts` selectors for domain/application libraries
  and frontend feature/resource services, stores and geometry. Kinded services also
  remain subject to F1. Filename selectors are a bounded inventory, not a complete
  manually reviewed classification of every frontend helper.
- Size observations: ceiling 800 under all four WBS app source roots, `libs/wbs`
  and `libs/shared`; `pinned: []`. Testing support sources without test/spec suffixes
  remain measured by the existing production-source predicate.
- Adoption: `adoptedPrefixes: []`, an explicit empty diagnostic set. No adoption
  was inferred and no authority was refreshed to suppress a refusal.

Live WBS notes remain the earlier read-only revision-12 observations retained in
[live-wbs.json](evidence/candidate-74ce3c8b/live-wbs.json): both 090 and 100 were
`blocked_by_proxy` and expressly permitted local diagnostics absent activation.
Those rows were not reread or changed during this rerun. Their certification
prerequisite 030.6 remains outside this survey.

## Commands and outcome

Each `full` or `rule-*` invocation retains exact argv/environment/exit/duration in
`*.command.json`, raw stdout in `*.stdout.txt`, and raw stderr in `*.stderr.txt`
under [candidate-a478c109](evidence/candidate-a478c109). Policy snapshots and raw
streams use `.txt` to preserve their bytes through formatting.

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES=/home/df/wd/puni/puni-00/.worktrees/wbs-090-100-runtime-modules \
  bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check committed \
  /home/df/wd/puni/puni-00/.worktrees/wbs-090-100-diagnostics \
  a478c109d13233ffb61df874adf90c23fc583e75 \
  /tmp/wbs-burokrat-a478c109/diagnostic-policy.json
```

Per-rule invocations append `--rule <id>` with unchanged candidate and policy:
REL-EXTRACT, INV-CLASSIFY, PERF-THRESHOLD, SPEC-SCENARIOS, F7, MOD-INDEX,
MOD-DIRECT-ENTRIES and MOD-LAYOUT. The other six relationship consumers
(F1/K2–K6) use the complete invocation's memoized graph refusal; their individual
commands are deliberately skipped because that prerequisite prevents evaluation.

The full command exited 1 after 116.74 seconds. It returned
`allowed: false`, `certifies: false`, 42 debt findings and ten unevaluated rules.
The exact candidate digest is
`057b559aa29ca676c28b71dc31dad53c96b45b1c71db7632ceea94dff83417cc`;
the unchanged final policy SHA-256 is
`ffc33d5b91dcfae0e622294936f732c366c501d202fc53d15c6a744d266f2690`.

| Registered rules                    | Classification                                   | Observed output                                                                                          |
| ----------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| F7                                  | Evaluated debt                                   | 38 files over 800 lines                                                                                  |
| MOD-LAYOUT                          | Evaluated debt                                   | Four missing index/contract findings in two service directories                                          |
| MOD-INDEX, MOD-DIRECT-ENTRIES       | Evaluated clean                                  | No findings for these two rules                                                                          |
| F1, K2, K3, K4, K5, K6, REL-EXTRACT | Unevaluated; compiler prerequisite refused       | Invalid `@tanstack/table-core` augmentation, implicit row parameter types, missing ColumnMeta properties |
| INV-CLASSIFY                        | Unevaluated; classification prerequisite refused | Undeclared website `apple-touch-icon.png` binary                                                         |
| PERF-THRESHOLD                      | Unevaluated; reviewed authority refused          | Performance config content differs from reviewed authority                                               |
| SPEC-SCENARIOS                      | Unevaluated; source selection refused            | Competing `wbs-domain` leaf-status overlay operation                                                     |

The fresh full verdict's findings and unevaluated reasons exactly match both prior
candidate surveys. Its candidate digest is new; no candidate acceptance is inferred.
The 090 projection retains 20 F7 and four module layout findings; the 100 projection
retains 20 F7 findings. Two domain findings occur in both.

[inventory.json](evidence/candidate-a478c109/inventory.json),
[wbs-090.json](evidence/candidate-a478c109/wbs-090.json) and
[wbs-100.json](evidence/candidate-a478c109/wbs-100.json) retain the actual observations.

## Projection meaning and follow-up

The inventory distinguishes evaluated-clean, evaluated-debt, unevaluated with
prerequisite refusal, command refusal before a verdict, and obligations without
complete registered evaluation. No observe-only finding has refusal effect.
K1/K7/K8/K9/F2/F3/T1/T2 have no complete dedicated registered verdict; internal
partial prerequisites are not complete obligation evaluation. Full test-axes
ledgers remain open. A successful exit from an observe-only debt rule is not
zero debt.

Both 090/100 projections retain every global unevaluated record and full verdict
`allowed: false`/`certifies: false`. 090 projects the three backend apps plus all
WBS/shared libraries. 100 projects fe-01 plus WBS domain and shared libraries.
These are projections of one global verdict, not independent scoped verdicts.
A website binary refusal remains a global blocker. Combined-graph frontend
compiler failure also prevents backend kind/direction evaluation. Overlapping
domain/shared findings cannot be added across projections.

Bounded follow-ups remain those identified in the original reviewed survey:
repair the frozen TanStack augmentation/type boundary before import evaluation;
review the website binary's exact classification provenance; reconcile Performance
configuration through reviewed authority; resolve the competing leaf-status spec
sources through their owning changes; inspect module layout debt; split over-ceiling
sources into behavior-preserving repairs after reading callers/tests. No competing
source synchronization or archive, digest-only authority refresh or catch-all
classification is authorized by this survey.

## Validation and limits

All eight representative per-rule commands matched the full candidate digest,
findings and unevaluated reasons. Four blocker commands exited 1. F7 and the
three module commands exited 0; F7 and MOD-LAYOUT still reported debt.
The retained read-only evidence check rehashed Bun, compiler/package/closure,
lockfile and policies, checked source checkout parity with the selected tool,
verified all eight per-rule outputs and both global-refusal-preserving projections,
and compared the historical findings without claiming unchanged candidate identity.

`bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0 with
**185 passed, zero failed**. Its exact stdout/stderr/exit are retained.
The previously introduced documentation-only `skip_specs: true` metadata remains;
this survey introduces no behavior spec. Scoped Prettier formatting/checking covers
this survey's Markdown and metadata JSON; raw evidence bytes remain untouched.

No application tests, browser measurements, lint/typecheck/build gate, mutation
proofs, host gate, activation, merge to main or deployment ran. The only merge was
the authorized normal merge into this isolated survey branch. Compiler diagnostics
come from relationship extraction, not a standalone application typecheck.
No safety check or production behavior changed; no new R5 safety proof is claimed.
Other products/tools, infrastructure rule evaluation, repairs, complete ledgers,
final candidate acceptance and certification remain open.
