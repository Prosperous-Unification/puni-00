# WBS 090/100 local diagnostic inventory

This is a bounded survey of candidate `74ce3c8bf3a0070b7af73198d75cdcebae385f14`
(corrected #380 candidate), not final candidate acceptance. It introduces no application or
validator behavior. No activation, certification, ratchet, adoption, WBS completion,
source synchronization, archiving, host gate, merge or deployment was performed.

## Authority and selection

The live WBS project is `558ec5c7-f561-4181-9d9b-055b06bc9796`. The read-only
`getApiProjectsByIdWork_itemsByWorkItemId` responses retained in
[evidence/candidate-74ce3c8b/live-wbs.json](evidence/candidate-74ce3c8b/live-wbs.json)
identify 090 (`7ad9e8a6-0369-43f0-9711-8d9e687d92a6`) and 100
(`02d9313b-d484-4cf1-9485-f71fe81c0fdf`), both revision 12 and
`blocked_by_proxy`. Their notes permit local diagnostic inventory before activation;
certification still requires 030.6. These observations do not change the live rows.

[identity.json](evidence/candidate-74ce3c8b/identity.json) binds the exact candidate
SHA/tree, tool SHA/tree and tool source subtree, source CLI entry, Bun executable/version/revision,
lockfile, TypeScript package/compiler and complete TypeScript package closure digests.
The tool is the source CLI at that same SHA, not a published distribution or activated
release. `bun install --frozen-lockfile --ignore-scripts` succeeded with 1292 packages.
The installed runtime modules were hard linked to an ignored sibling directory outside
the candidate for relationship materialization. The first attempted copy to `/tmp`
refused cross-device hard links and was not used. The compiler is TypeScript 6.0.2;
Bun is 1.4.2+744846f84. Dependency lifecycle scripts were skipped intentionally.

The original tracked rule policy is retained byte for byte in
[original-policy.json.txt](evidence/candidate-74ce3c8b/original-policy.json.txt). It was
copied outside the candidate to `/tmp/wbs-burokrat-74ce3c8b/original-policy.json`.
The external diagnostic copy adds four explicit fields; their complete values are in
[diagnostic-policy.json.txt](evidence/candidate-74ce3c8b/diagnostic-policy.json.txt):

- `relationshipRequest`: 21 actual production tsconfigs for be-01, gw-01, mcp-01,
  fe-01 and all WBS/shared libraries, with 21 corresponding actual app main/public
  library index entrypoints. Existing selected-fact relationship declarations remain
  `docs/wiki-policy/relationships.json`. This is a WBS project graph, not the activation
  pilot's one-domain source selection. Transitive sources may extend beyond the roots.
- `plainTypeScriptPaths`: 442 explicit tracked production `.ts` paths covering WBS
  domain/application libraries and frontend feature/resource services, stores and geometry.
  Filename and directory selection implement the F1 plain-source categories; they do not
  claim a complete manually reviewed classification of every frontend helper. Kinded
  services also remain covered by the rule's own kind inventory.
- `sizeCeilings`: ceiling 800, roots be-01/gw-01/mcp-01/fe-01 `src`, `libs/wbs`
  and `libs/shared`; `pinned: []`. This observes the decided ceiling without accepting
  any file above it. The existing production-source predicate also measures `.ts`
  testing support files that are not named `.test` or `.spec`; those findings are retained.
- `adoptedSet`: `adoptedPrefixes: []`, explicitly empty for this diagnostic. No
  adoption was inferred. All 14 registered rules retain `observe` mode.

Original/result policy digests are recorded in `identity.json`. The evidence copies
inside this documentation tree are snapshots, not authority: replay must copy the selected
snapshot outside the candidate before invoking `check`. Reviewed Performance and scenario
policy fields were preserved, including their stale/refused state; no new authority was invented.

## Commands and evidence

Every invocation retains its exact argv, selected environment, exit code and elapsed
seconds in `*.command.json`, raw stdout in `*.stdout.txt` and raw stderr in
`*.stderr.txt`. Empty stdout is intentional for command refusals. Policy snapshots use `.json.txt` and raw stdout uses `.txt` to preserve the exact
bytes without formatter rewriting; nonempty verdict streams contain JSON.

The initial `dependency-refusal-*` commands failed before policy loading because
`@noble/hashes` was absent from the inherited installation. Frozen installation resolved
that process prerequisite. `preflight-original` then refused with
`rule F1 needs policy.plainTypeScriptPaths, which the rule policy omits`; it produced no
candidate verdict and evaluated no rule. Its first omission is not the only missing input.

`exploratory-19-configs` retains the first complete registry invocation before gw-01
and mcp-01 were added to the explicit relationship/size scope. Its policy snapshot and
digest are distinct. The `full` invocation and subsequent `rule-*` invocations use the
final 21-project selector policy, and retain global whole-tree refusals.

The canonical diagnostic command was:

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES=/home/df/wd/puni/puni-00/.worktrees/wbs-090-100-runtime-modules \
  bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check committed \
  /home/df/wd/puni/puni-00/.worktrees/wbs-090-100-diagnostics \
  74ce3c8bf3a0070b7af73198d75cdcebae385f14 \
  /tmp/wbs-burokrat-74ce3c8b/diagnostic-policy-complete-wbs.json
```

Per-rule diagnostics append `--rule <id>` without changing the candidate or policy.
They select representative blockers (REL-EXTRACT, INV-CLASSIFY, PERF-THRESHOLD,
SPEC-SCENARIOS) and independently observable rules (F7, MOD-INDEX,
MOD-DIRECT-ENTRIES, MOD-LAYOUT). F1 and K2–K6 share the full invocation's single
memoized relationship refusal; separate commands for these six consumers were skipped
because the same prerequisite prevented their evaluation.

## Interpreting the inventory

The full invocation exited 1 after 107.39 seconds and returned `allowed: false`,
`certifies: false`, 42 findings and ten unevaluated rules. The final policy SHA-256 is
`ffc33d5b91dcfae0e622294936f732c366c501d202fc53d15c6a744d266f2690` (the exact retained value is in `identity.json`).

| Registered rules                    | Observed classification                          | Evidence                                                                                                 |
| ----------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| F7                                  | Evaluated debt                                   | 38 files exceed 800 lines; no pins                                                                       |
| MOD-LAYOUT                          | Evaluated debt                                   | Four missing index/contract findings in two service directories                                          |
| MOD-INDEX, MOD-DIRECT-ENTRIES       | Evaluated clean                                  | Zero findings for these two rules only                                                                   |
| F1, K2, K3, K4, K5, K6, REL-EXTRACT | Unevaluated; compiler prerequisite refused       | Invalid `@tanstack/table-core` augmentation, implicit row parameter types, missing ColumnMeta properties |
| INV-CLASSIFY                        | Unevaluated; classification prerequisite refused | Undeclared website `apple-touch-icon.png` binary                                                         |
| PERF-THRESHOLD                      | Unevaluated; reviewed authority refused          | Performance config content differs from reviewed authority                                               |
| SPEC-SCENARIOS                      | Unevaluated; source selection refused            | Competing `wbs-domain` leaf-status overlay operation                                                     |

The 090 projection retains 20 F7 and four MOD-LAYOUT findings. The 100 projection
retains 20 F7 findings. Two domain-library F7 findings occur in both projections,
so their counts cannot be added. These counts describe selected findings, not
complete application acceptance.

The machine-readable inventory and 090/100 projections accompany the raw verdict.
`evaluated-clean` means that a selected rule returned observations with no findings;
`evaluated-debt` means it returned debt findings. A tool `unevaluated` record is retained
as `unevaluated`, with a separate prerequisite-refusal description. A process or policy
exception before a verdict is `command-refusal`. No observed finding has refusal effect
under this observe-only policy. Designed obligations absent from the registry are
`unimplemented-obligation`, never an evaluated clean rule.

090 projects be-01/gw-01/mcp-01 and WBS domain/application/adapter libraries. 100 projects
fe-01 plus the domain/contracts/validation libraries also consumed by the frontend.
Shared libraries appear in both projections where applicable. Every projection inherits
all whole-tree unevaluated records and the full verdict's `allowed: false` and
`certifies: false`. A website classification refusal is a global blocker even though it
is outside either WBS projection. A frontend compiler refusal also prevents backend
kind/direction evaluation in the combined graph. Projection finding counts are not
independent scoped verdicts or coverage claims.

## Bounded follow-up slices

1. Resolve the frozen frontend compiler boundary: inspect the actual TanStack package
   version/export surface and its augmentation/callers. The reported missing
   `@tanstack/table-core` augmentation, implicit row types and missing ColumnMeta fields
   must be repaired against an owning precise spec or a new OpenSpec change. Rerun the
   full relationship graph before claiming F1/K2–K6 clean or reporting import debt.
2. Review the website binary declaration at
   `apps/website/fe-01/public/apple-touch-icon.png` in the owning classification policy,
   with real format/consumer/regeneration provenance. Do not add a catch-all or silently
   discard the global refusal. Rerun INV-CLASSIFY and then full inventory.
3. Reconcile the Performance config with its reviewed authority through the owning
   change. Do not refresh its digest just to suppress the refusal. No browser measurements
   were produced by this survey; further authority/evidence gaps may become visible later.
4. Resolve the competing `wbs-domain` leaf-status overlay through the owning scenario
   sources. Do not synchronize or archive competing sources as part of this survey.
   Rerun SPEC-SCENARIOS and preserve downstream missing allocator/coverage obligations.
5. Inspect the service directories reported by MOD-LAYOUT before proposing module
   boundaries, contracts and wiki indexes. Preserve the actual debt until reviewed.
6. Turn F7 findings into small, behavior-preserving repair slices with callers/tests
   read first. The baseline creates no size pins and enables no ratchet. Prioritize
   high-coupling large files only after their owning module shape is understood.

## Unverified work and limits

All eight representative per-rule invocations matched the corresponding full-verdict
findings or unevaluated records and candidate digest. The four blocker commands exited 1;
F7 and all three module commands exited 0. F7 and MOD-LAYOUT still report debt under
observe mode: exit 0 does not mean zero findings. A retained read-only evidence check
verified policy byte digests, candidate identities, global refusal preservation, inventory
counts and per-rule parity. Scoped Prettier formatting was run on generated documentation
and metadata; raw stdout and policy snapshots remain byte for byte.

No application tests, browser runs, full format/lint/typecheck/build gate, negative mutation
proofs, host gate, package release checks or activation checks ran in this diagnostic
survey. No safety check or production behavior changed, so this survey adds no R5
safety-check proof. The compiler errors are outputs from relationship extraction, not
an independent application typecheck. Scope selection is explicit and bounded; other
products/tools and non-TypeScript infrastructure remain for 120/130. Candidate acceptance,
repairs, complete ledgers, certification and live activation remain open.
