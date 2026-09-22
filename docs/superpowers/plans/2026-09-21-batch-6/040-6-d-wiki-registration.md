# 040.6 D — wiki registration of the first module

| Field                                      | Value                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Work item                                  | WBS 040.6, "Split the backend core's services into modules; each a sealed DI Bag module" — fourth packet           |
| Size class                                 | S, in three slices (cut down from four after review 4; see "Convergence" below)                                    |
| Slices                                     | 1 the README index block and the pilot-index pin fix, 2 the trusted-boundary registration, 3 tick and record       |
| top-model-high-effort-planning-tokens      | 3000000                                                                                                            |
| mid-level-mid-effort-implementation-tokens | 3000000                                                                                                            |
| top-model-high-effort-review-tokens        | 3000000                                                                                                            |
| Implements                                 | `openspec/changes/adopt-di-composition/tasks.md` 7.5 (new); continues packets A, B, C                              |
| Planned on                                 | 2026-09-22, every slice rehearsed end to end in a private worktree of `bd39d86e`; revised after reviews 1, 2, 3, 4 |

**You execute one slice and stop.** The end of your instructions names which. Each slice opens
with its own step 0: the preconditions that must hold **before** it edits anything, and the
baselines it compares against. Section 8 names the planner's checks.

**Convergence (review 4).** Four review rounds ran against a machine-checked assertion that a
sealed module's README `moduleId` names the same label its own `buildModule` call seals its bag
under. Each round's fix closed the exploit the previous round found and a new one replaced it:
bracket access, then an aliased export, then a spread-merged option, then a parenthesized
initializer and a computed-getter accessor, then — after switching the whole mechanism to type and
runtime identity — an intersection-typed export and a slash-containing registration key. Per
`docs/superpowers/plans/2026-09-19-batch-1/README.md`'s "Convergence" rule, a packet still refused
after three review rounds is cut smaller or held rather than patched again. This revision CUTS the
label-agreement check out of this packet entirely. What remains — the README index block, the
pilot-mapping structural fix, and the trusted-boundary registration — is unaffected by any of the
four rounds' findings, none of which touched the pilot-mapping mechanism. The cut check's own
design work, and the two adversarial cases review 4 reproduced against it, are recorded in this
packet's "Deferred: label agreement" section for whichever later packet takes it on.

**Dispatch.** The checkout `run-executor.sh` clones from must contain **this packet file itself**
(`git ls-tree <checkout> -- docs/superpowers/plans/2026-09-21-batch-6/040-6-d-wiki-registration.md`
must print an entry) — `bd39d86e` alone does not, since this packet and its
`current-document-check-exemptions.json` exemption first exist on the commit that lands this
revision on `plan/batch-6-040-6-d`. Dispatch from that commit (or its reviewed integration
descendant); `bd39d86e` is a prerequisite ancestor of it, never the checkout itself. Slice 1 has no
prior slice to resume from: `run-executor.sh 040-6-d-wiki-registration slice-1 <this packet's own
commit sha> --batch batch-6`. Slices 2 and 3 resume the clone slice 1 (and its successors) built:
`run-executor.sh 040-6-d-wiki-registration slice-N <this packet's own commit sha> --resume --require-ancestor <sha of slice N-1's planner commit> --batch batch-6`
(the launcher's batch-6 default supplies `--batch-dir docs/superpowers/plans/2026-09-21-batch-6`).
No slice binds a port or needs the network: every `bun test -t '<title>'` in section 6's rehearsal
ran against a git clone the test itself creates under the system temp directory, so **no slice
needs `--network`**. No slice cites an earlier slice's saved evidence, so **no slice needs
`--seed`** either.

**This packet document is itself a "current document."** `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`'s
`legacy-root` scan reaches every tracked `docs/**/*.md` file, including this one, and this packet's
own verified-facts and exact-content sections legitimately quote `libs/core/src/service/history.service.ts`
many times. The planner therefore added this packet's own path to
`docs/findings/current-document-check-exemptions.json` (matching the existing precedent for a task
packet that quotes verbatim content with pre-move paths) **outside any of the three slices below** —
it is a prerequisite for this document to exist in the tree at all, not part of the work the three
slices do. `tool-devsync:test` was re-run with both files staged after that addition: `366 pass`,
`0 fail`, matching the baseline exactly.

## 1. Goal and non-goals

**Goal.** Give the first sealed DI Bag module — Plan history, landed by packet A at
`libs/wbs/application/core/src/module/plan-history/` — its wiki index registration: a
`<!-- module-index -->` README block naming `moduleId: module.application.plan-history` and every
module file by path (item a of the work item), with the existing generic
`docs/wiki-policy/policy.json` content rules that already classify those files (no new rule
needed, verified in section 3). Fix the two pins in `apps/wiki/cli/src/policy/pilot-policy.test.ts`
(packet A's rehearsed row 8) so a module's own index block no longer forces a hand-edited count or
a hand-maintained list of "the known extras." Register Plan history as a full member of
`docs/wiki-policy/modules.json`/`policy.json`'s content-review pilot, using the `sourceSelector`
mechanism that already binds `boundary.application.use-cases` and `boundary.domain.saved-plan` to
their own pre-move locations, because this module was extracted from an existing file that has a
real history at the pilot's frozen revision. `pilot-policy.test.ts`'s own production `lint()` call
(section 6) checks, end to end, that Plan history's `modules.json` row and `policy.json` boundary
are mutually consistent with each other and with a real README index — the narrower guarantee this
packet actually delivers; it validates a **declared** registration's internal consistency, not
whether every sealed DI module in the repository has one (see "Deferred: label agreement" for what
that would take). Tick `tasks.md` 7.5, which this packet creates (no task named wiki registration
existed before it) to the scope this revision actually delivers — the index block and the pilot
mapping, not a label-agreement claim — and correct 7.4 and the proposal's "Decisions Recorded"
section, both of which said wiki registration was outside this change.

**Non-goal, deferred by convergence: label agreement.** Whether the index block's `moduleId` names
the same label the module's own `buildModule` call seals its bag under is **not** checked by this
packet. See "Deferred: label agreement" below for the four rounds' findings and what a later
packet's design needs to defeat first.

**Non-goals.** No new DI module (Plan history is the only one that exists). No wiki _activation_:
`bin/tool-wiki-lint.sh` still prints `{"status":"inactive",…}` and exits 0 with no
`TOOL_WIKI_ACTIVATION_ROOT` (`bin/tool-wiki-lint.sh:9-21`; it exits **78**, not 0, when
`TOOL_WIKI_REQUIRE_CERTIFIED=1` names that same absence a required-admission refusal instead), so
the lefthook `tool-wiki` tick proves nothing about this packet's own correctness until 030.5 lands
— see section 9. No version bump: `di-bag` stays 0.4.0. No change to
`docs/wiki-policy/modules.bootstrap.json` or `bootstrap-policy.json` — those are the candidate
artifacts for the Burokrat's own separate, in-progress `trusted-activation-relocation` change, not
a general module registry (`openspec/changes/trusted-activation-relocation/design.md:1-8,99-105`).

## 2. Read first

| File                                                            | Why                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                     | Rules R1 to R5.                                                                                                                                                                                                                                                                                                                                                                 |
| `LLM_README.md`                                                 | The index. Read only the entry your slice needs.                                                                                                                                                                                                                                                                                                                                |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`           | "Execution contract", "Standard blocks every packet uses" (the OpenSpec validation block slice 3 uses verbatim), "Counts are relative, never absolute," and "Convergence" (why this revision cuts the packet rather than patching a fourth time).                                                                                                                               |
| `docs/superpowers/specs/2026-09-19-code-organization-design.md` | "Modules" and "Module layout": "A module is one DI Bag module and one wiki module, always one to one," and "The index metadata is required for every module."                                                                                                                                                                                                                   |
| `libs/wbs/application/core/src/module/plan-history/README.md`   | 27 lines. Slice 1 replaces its top paragraph and adds the index block; slice 2 appends a "Wiki registration" section.                                                                                                                                                                                                                                                           |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts`                 | 1081 lines before this packet. Slice 1 edits two spots: the top-level `pilotPaths` array (adds Plan history's README) and one `test(...)` block; locate the test by its title, not by a line number, since packets B/C may have shifted lines.                                                                                                                                  |
| `apps/wiki/cli/src/policy/trust.ts`                             | Read 380-460 and 1180-1235: the boundary-baseline refusal, the `sourceSelector` mechanism, and the "no exact trusted boundary" refusal (`trust.ts:1230`) that motivates slice 1's `modules.length`/`policy.boundaries.length` assertion — that JavaScript-level length mismatch is what actually stops slice 2's own red before the test ever reaches `lint()` or this refusal. |
| `apps/wiki/cli/src/indexes/read-indexes.ts`                     | 65-96: how a real `module-index` block is parsed (Markdown `html` AST nodes only) — why a fenced example in the README cannot pass as a real one.                                                                                                                                                                                                                               |
| `apps/wiki/cli/src/indexes/check-indexes.ts`                    | The "unindexed candidate path" refusal (memberships must be exhaustive) and the `checked` object's `indexPath`/`members` shape.                                                                                                                                                                                                                                                 |
| `apps/wiki/cli/src/contracts/records.ts`                        | 620-636: `ModuleMapping`'s own schema already refuses a duplicate `moduleId`, which is why slice 1 does not add a second uniqueness check.                                                                                                                                                                                                                                      |
| `apps/wiki/cli/src/rules/kinds.ts`                              | `moduleLayoutObservations`/`MOD-LAYOUT`: the only existing Burokrat check adjacent to this packet's own scope, and why it is not extended (section 4).                                                                                                                                                                                                                          |
| `docs/wiki-policy/policy.json`, `modules.json`                  | The six-boundary pilot slice 2 adds Plan history to, as a seventh member.                                                                                                                                                                                                                                                                                                       |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`       | Around line 800: the whole-repository pinned legacy-occurrence count slice 2 must move, because a `sourceSelector` literally names an old, pre-move path.                                                                                                                                                                                                                       |
| `openspec/changes/adopt-di-composition/proposal.md`             | "Decisions Recorded": slice 3 corrects its stale "Wiki registration is separate" sentence.                                                                                                                                                                                                                                                                                      |
| `openspec/changes/adopt-di-composition/design.md`               | "Not decided here": slice 3 replaces its claim that wiki registration is undecided with the pilot-mapping scope task 7.5 actually covers, and states the label-agreement deferral explicitly.                                                                                                                                                                                   |
| `libs/wbs/application/core/src/use-cases/README.md`             | The one other index block in this library, as the format model for slice 1.                                                                                                                                                                                                                                                                                                     |

## 3. Verified facts

Every line was read in the repository at `bd39d86e` on 2026-09-22; every command result was
observed in a private worktree of that commit, and re-observed 2026-09-22 in a fresh rehearsal
clone after review 4's cut.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Evidence                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan history's README carries no `module-index` block yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `libs/wbs/application/core/src/module/plan-history/README.md` (pre-slice-1 text)                                                                                                                                                        |
| Every one of Plan history's five module files is classified by an **existing** generic content rule: `.ts` (all four of `check.ts`, `contract.ts`, `module.ts`, `plan-history.feature.ts`) under `source`; `.test.ts` (`module.test.ts`) under `test`, checked before `source`. No `.feature.ts`-specific rule exists or is needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `docs/wiki-policy/policy.json` → `classificationPolicy.contentRules`, read via `python3 -c "import json; …"` on 2026-09-22                                                                                                              |
| A `module-index` block's schema requires `schemaVersion: 1`, `moduleId`, `memberships`, `relationshipSelectors`, `applicableChecks`, `inapplicableSections`, `externalConsumers`, and refuses an undeclared key; the XOR between `relationshipSelectors`/`applicableChecks` and their matching inapplicability reason is enforced by a `.narrow`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `apps/wiki/cli/src/contracts/index.ts:19-105`                                                                                                                                                                                           |
| `check.core.test` is an established fact id, already used by the sibling `module.application.use-cases` index, mapped to the `wbs-core:test` target.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `docs/wiki-policy/relationships.json:8`; `libs/wbs/application/core/src/use-cases/README.md:3`                                                                                                                                          |
| `check-indexes` refuses a module directory file the index does not declare, with `unindexed candidate path in <README>: <file>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `apps/wiki/cli/src/indexes/check-indexes.ts:146`                                                                                                                                                                                        |
| `ModuleMapping`'s own arktype schema already refuses a `modules.json` with a duplicate `moduleId`, via a `.narrow` that runs before `validate module-mapping` can exit 0 — so a second, hand-written uniqueness assertion in `pilot-policy.test.ts` would be unreachable dead code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `apps/wiki/cli/src/contracts/records.ts:620-636`; probed 2026-09-22: a duplicated `moduleId` made `validate module-mapping` itself exit nonzero                                                                                         |
| `pilot-policy.test.ts`'s `createCandidate()` clones **the local git repository** (committed refs only) and overlays a fixed `pilotPaths` list **from the working tree**, uncommitted; `libs/wbs/domain/domain/src/saved-plan/README.md` and `docs/wiki-policy/policy.json` are both in that list, so a working-tree-only mutation to either is visible to the test with no commit. Plan history's own README was **not** in that list on the unmodified tree (review 5, Critical 1: an earlier draft's slice 1 red depended on an uncommitted README edit the candidate could not see) — slice 1's own first edit adds it to `pilotPaths` before touching the README's content, so the rest of the slice needs no intermediate commit either.                                                                                                                                                                                                                                                                                                                                                   | `apps/wiki/cli/src/policy/pilot-policy.test.ts:30-44,101-119`; probed 2026-09-22 both ways                                                                                                                                              |
| On a tree with only Plan history's README committed (module-index block present, mapping and boundary both absent), the **unmodified** `pilot-policy.test.ts` fails `pins exact pre-index tuples and passes observe lint from external trust` exactly as packet A predicted: `+   "module.application.plan-history",` inside the received array.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Re-observed 2026-09-22 in the rehearsal clone: 0 passed, 1 failed, 21 `expect()` calls                                                                                                                                                  |
| `docs/wiki-policy/policy.json`'s loader refuses any boundary with an empty `baselineEntries` **whenever `policy.pilot` is defined** (it is), with `trusted boundary baseline is empty: <id>` — but it accepts a nonempty baseline reached through `sourceSelector`, the same mechanism `boundary.application.use-cases` (`sourceSelector` prefix `libs/core/src/use-cases`) and `boundary.domain.saved-plan` (`sourceSelector` prefix `libs/domain/src/saved-plan`) already use. `libs/core/src/service/history.service.ts` — the file Plan history was extracted from — exists at the pilot's frozen `sourceRevision` (`7851161bf96312750d07b933ca5d42b75ce575c7`), confirmed by `git ls-tree -r <sourceRevision>`.                                                                                                                                                                                                                                                                                                                                                                            | `apps/wiki/cli/src/policy/trust.ts:388-426`; `docs/wiki-policy/policy.json`; `git ls-tree` observed 2026-09-22                                                                                                                          |
| A boundary declared with a `sourceSelector` and a matching `baselineEntries` tuple, plus a `docs/wiki-policy/modules.json` row for the same module, passes the **entire** `pins exact pre-index tuples and passes observe lint from external trust` test, including the production `lint(candidate, trust)` call — not merely `validate module-mapping`. Also confirmed on the **whole** `pilot-policy.test.ts` file (all 21 tests) — this validates a declared registration's own internal consistency (mapping row, boundary and index all agree), not that every sealed DI module in the repository has a pilot registration at all — discovering an unregistered module is out of this reduced packet's scope (`trust.ts:1244-1257` only rejects an index unmapped **inside a declared boundary**; a module with neither a mapping row nor a boundary is invisible to this test — this is exactly slice 1's own green row in section 6, where Plan history's README index exists with no matching `modules.json` row or `policy.json` boundary at all, and the filtered test still passes). | Re-observed 2026-09-22 in the rehearsal clone: filtered run 1 passed, 28 `expect()` calls; whole-file run 21 passed, 0 failed, `294 expect() calls`, ~405s                                                                              |
| `docs/wiki-policy/modules.bootstrap.json` and `bootstrap-policy.json` are the **candidate** artifacts for the Burokrat's own next trust-activation release, not a general module registry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `openspec/changes/trusted-activation-relocation/design.md:1-8,99-105`                                                                                                                                                                   |
| Adding the `sourceSelector`-based boundary makes the repository-wide legacy-occurrence scan see two more occurrences of the pre-move path (the boundary's `sourceSelector.value` and its one `baselineEntries[0].path`, both `libs/core/src/service/history.service.ts`) — the pinned category rose by two, against `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`'s own pin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Re-observed 2026-09-22 in the rehearsal clone: `historical policy selector or baseline` 39 → 41, `occurrences` 257 → 259, digest changed; the filtered legacy-pin test moved from failing to `1 pass`/`0 fail` once the pin was updated |
| No check in Burokrat compares a `module-index` block's `moduleId` to a DI Bag label, and none is added by this packet — `grep -rln "buildModule\|DiBag\|di-bag" apps/wiki/cli/src` finds nothing. `MOD-LAYOUT` only checks that a module directory has a `README.md` carrying an index and a `contract.ts` blob, never a label. This is the gap "Deferred: label agreement" names.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `apps/wiki/cli/src/rules/kinds.ts:129-165`; grep observed 2026-09-22, no matches                                                                                                                                                        |
| di-bag 0.4.0 exposes a sealed module's `label` only as a string prefix baked into every non-exported binding's own `<label>/<key>` name, reachable solely by installing the module and reading `inspectGraph()` or triggering a `DI_BAG_MISSING_DEPENDENCY` message — never as a queryable property of the module value itself (`node_modules/di-bag/dist/module.d.ts`: `Module`'s only public member is `renameExport`; the class has no public constructor and no label accessor).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `node_modules/di-bag/dist/module.d.ts`; confirmed across four review rounds' worth of probing this surface, most recently 2026-09-22                                                                                                    |

## 4. Why these slices and not others

**README + generic classification (slice 1), not a new `policy.json` rule.** Every module member
file already matches an existing suffix rule; adding a rule that already exists would be dead
weight, and R2/R3 forbid documenting what is already true. The "docs/wiki-policy rule(s)" the work
item asks for **are** the existing `test`/`source` rules, cited by JSON path rather than
duplicated.

**A structural pin fix in the same slice as the README, not a separate one.** Landing the README's
`module-index` block is what breaks `pilot-policy.test.ts`'s original hardcoded array-equality
assertion (an index `check-indexes` now discovers with no matching `modules.json` row), so the fix
belongs in the same slice as the change that motivates it: add the README to `pilotPaths` so an
uncommitted edit is visible to the test at all (review 5, Critical 1), edit the README, observe the
break, apply the structural fix, observe green — one narrative, one commit, no intermediate commit
needed or taken. The fix itself ties the
mapping's length to `policy.boundaries.length` and checks that every declared module has a real
index; a third, hand-written "every non-pilot index sits outside every boundary" loop was cut
because the production `lint(candidate, trust)` call later in the **same test** already enforces
exactly that invariant (`trust.ts:1244-1250`, `pilot index has no module mapping`), so a duplicate
hand-rolled version of it would itself be a dead check with no negative distinct from that later
call's own.

**No label-agreement check (cut by review 4's convergence finding).** Four rounds tried to make "the
README's `moduleId` names the same label the module's `buildModule` call seals its bag under" a
machine-checked assertion, and four rounds each found a new compile- or runtime-valid bypass of
whatever the previous round fixed. `docs/superpowers/plans/2026-09-19-batch-1/README.md`'s
"Convergence" rule is explicit: a packet refused after three rounds is cut smaller, not patched a
fourth time. What is cut is named, not silently dropped — see "Deferred: label agreement."

**Modifies the existing pilot-policy test, not `MOD-LAYOUT`.** This packet's only check-shaped
change is to `pilot-policy.test.ts`'s own hardcoded assertions (section 10.2); it adds no new
Burokrat rule and extends `MOD-LAYOUT` with nothing. `MOD-LAYOUT` had no notion of a DI Bag label
and no `ts.Program` in the first place — that mismatch is why a label-agreement check, before it
was cut, was never going to fit there either; a different concern would have needed a different
program, not a bigger `MOD-LAYOUT`.

**Real trusted-boundary registration (slice 2), not a documented impossibility.** The first draft
of this packet claimed registration was refused because the module's directory did not exist at
the pilot's frozen revision. That claim did not account for `sourceSelector`, the mechanism two of
the six existing boundaries already use for exactly this situation (a directory renamed since the
pilot's baseline). Measured: a `sourceSelector`-based boundary passes every check in
`pilot-policy.test.ts`, including the full `lint()` call, both filtered and across the whole file.

**Size.** Three slices, 15 to 30 minutes each: slice 1 bundles the README's index block with the
pilot-mapping's own structural fix and two rehearsed negatives; slice 2 is two JSON edits plus one
whole-repository pin; slice 3 is bookkeeping across four files.

## 5. File plan

| Path                                                          | Slice | Create or modify                                                                                                                          |
| ------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/wbs/application/core/src/module/plan-history/README.md` | 1, 2  | slice 1 replaces the top paragraph and adds the index block; slice 2 appends "Wiki registration"                                          |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts`               | 1     | modify: the `pilotPaths` array plus one `test(...)` block                                                                                 |
| `docs/wiki-policy/modules.json`                               | 2     | modify, one row inserted                                                                                                                  |
| `docs/wiki-policy/policy.json`                                | 2     | modify, one boundary appended                                                                                                             |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`     | 2     | modify, the pinned legacy-occurrence count/digest and one category, plus a dated `Proof:` comment                                         |
| `openspec/changes/adopt-di-composition/proposal.md`           | 3     | modify, "Decisions Recorded" and "Impact"                                                                                                 |
| `openspec/changes/adopt-di-composition/tasks.md`              | 3     | modify: correct 7.4, add and tick 7.5 to its final (non-label-agreement) scope                                                            |
| `openspec/changes/adopt-di-composition/design.md`             | 3     | modify: replace "Not decided here"'s wiki-registration claim with the adopted pilot-mapping scope, and state the label-agreement deferral |
| `openspec/changes/adopt-di-composition/verify.md`             | 1-3   | each slice appends its own observations                                                                                                   |

**Neighbours.** No other batch-6 packet owns any of these paths. Slice 2's edit to
`repo-namespacing-handoff.test.ts` is the only edit this packet makes to a shared whole-suite pin;
section 8 names its own planner-only whole-file run.

## 6. Rehearsed observations

Every red, green and fault below was produced in a private worktree of `bd39d86e` (this round: a
throwaway clone symlinked to the real `node_modules`, so `bun test` behaves identically to running
in the tracked worktree), against the final listings in section 10, with the literal fragment the
runner printed and the mutated file restored (`cp` from a copy, `cmp`-proved) before the next
mutation. Per addendum point 14, each slice runs `NX_DAEMON=false bunx nx run
twilight-burokrat:typecheck --skip-nx-cache` **before** collecting that slice's own test baselines
(so every baseline and red below is observed with `dist/out-tsc` already populated, the same tree
state the slice's later steps run in) and once more, finally, after every edit in the slice lands;
`twilight-burokrat:lint:source` runs once, at the end. Recorded once here rather than repeated per
row.

| #   | Where                                                                                                                                                                                                                                     | Fault injected                                                                                                                                                                      | Test that observed it                                                     | Literal fragment observed                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | slice 1 red: Part A applied (README added to `pilotPaths`); README edited but uncommitted; Part B not yet applied                                                                                                                         | none; landing the index block alone, with no matching `modules.json` row, is what breaks the original hardcoded array-equality assertion                                            | `pins exact pre-index tuples and passes observe lint from external trust` | `+   "module.application.plan-history",` inside the received array; 0 passed, 1 failed, 21 `expect()` calls                                                                                                                                                               |
| 2   | slice 1 green: section 10.2's diff applied to `pilot-policy.test.ts`                                                                                                                                                                      | none                                                                                                                                                                                | same test                                                                 | 1 passed, 0 failed, 27 `expect()` calls (this slice's own 6-boundary/6-module tree; the loop at `pilot-policy.test.ts:339` asserts once per boundary, so this count is `modules.json`/`policy.json`'s current boundary count plus fixed assertions elsewhere in the test) |
| 3   | `docs/wiki-policy/policy.json`, the boundary whose `boundaryId === 'boundary.infra.release-assembly'` (selector `tools/tool-dagger/src/lib`, not `docs/refactoring/w4-4` — that selector belongs to `boundary.docs.wbs-table-extraction`) | removed, working tree only, its module row untouched — rehearsed on **this slice's own** 6-module/6-boundary tree (README landed, no registration yet), not the later 7-module tree | same test                                                                 | `Expected: 5`, `Received: 6` (`toBe`'s argument, `policy.boundaries.length` after the removal, is "Expected"; `modules.length`, unchanged at 6, is "Received")                                                                                                            |
| 4   | `libs/wbs/domain/domain/src/saved-plan/README.md`, index block                                                                                                                                                                            | removed, working tree only, its `modules.json` row untouched                                                                                                                        | same test                                                                 | `Expected: true`, `Received: false` on the "every pilot-declared module has a real index" assertion                                                                                                                                                                       |
| 5   | slice 2 red: only `docs/wiki-policy/modules.json`'s row added, no matching `policy.json` boundary                                                                                                                                         | half of slice 2's own edit                                                                                                                                                          | same test                                                                 | `Expected: 6`, `Received: 7` on the `modules.length` / `policy.boundaries.length` assertion (slice 1's check independently catches a half-landed registration)                                                                                                            |
| 6   | slice 2 green: both edits applied                                                                                                                                                                                                         | none                                                                                                                                                                                | same test, and the **whole** `pilot-policy.test.ts` file                  | filtered: 1 passed, 0 failed, 28 `expect()` calls; whole file: 21 passed, 0 failed (exact `expect()` total below)                                                                                                                                                         |

**Two task-transition reds, two injected mutation negatives, two green confirmations.** Rows 1 and
5 are reds a slice's own edit produces in transit (row 1: landing the README's index block before
the pin fix; row 5: landing half of slice 2's registration); rows 3 and 4 are the two negatives
this slice deliberately injects and restores; rows 2 and 6 are the two green confirmations
(filtered and, for row 6, also whole-file). Six rows, not the "twelve" or "thirteen" an earlier,
much larger version of this table (before review 4's cut) once had — that count no longer applies
to this table at all.

**Row 3's negative is rehearsed at the correct baseline.** Review 4 found that an earlier draft
rehearsed the boundary-removal negative on the **fully-registered** (7-module) tree, producing
`Expected: 6`/`Received: 7` — the identical fragment row 5 already owns, for a structurally
different reason (a mapping row outside the boundaries, not a boundary outside the mapping). Slice
1's own negative belongs on slice 1's own tree: six modules, six boundaries, before slice 2 ever
runs. Removing one boundary there gives `Expected: 5`/`Received: 6`, confirmed above.

## 7. Slices

Run every test with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT` and prefix Nx with
`NX_DAEMON=false`. Keep exit statuses as `cmd > log 2>&1; echo "exit=$?"`; never read a status
through `tee` and never `|| true`. Scratch only under `"$TMPDIR"`, mutation patches and failing
output under `"$TMPDIR/evidence"`; evidence references in `verify.md` are basenames relative to
that directory, never absolute clone, home or temporary paths. **The executor never runs `git add`,
`git commit`, `git stash` or any other Git-state-changing command; `.git` is read-only in its
clone.** A working-tree mutation is injected by editing the file directly, observed, then restored
with `cp` from a `"$TMPDIR"` copy and proved with `cmp`. The planner commits each slice. Every slice
records `base=$(git rev-parse HEAD)` in its step 0, and runs `typecheck` there too, **before**
collecting that step's test baselines — addendum point 14's post-typecheck baseline rehearsal —
then once more, finally, after every edit in the slice has landed; `lint` runs once, at the end.

### Slice 1 — The README index block and the pilot-index pin, structural

**Step 0.**

```sh
set -euo pipefail
test -f libs/wbs/application/core/src/module/plan-history/README.md
if present=$(grep -n "<!-- module-index" libs/wbs/application/core/src/module/plan-history/README.md); then
  printf '%s\n' "$present" >&2
  exit 1
else
  status=$?
  test "$status" -eq 1
fi
echo "gate: no index block yet, as expected"
test -f apps/wiki/cli/src/policy/pilot-policy.test.ts
log="$TMPDIR/evidence/slice-1-typecheck-baseline.log"
if NX_DAEMON=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache >"$log" 2>&1; then
  status=0
else
  status=$?
fi
printf 'exit=%s\n' "$status" >>"$log"
test "$status" -eq 0
log="$TMPDIR/evidence/slice-1-pin-baseline.log"
if (cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --preload ../../../tools/test/scratch/preload.ts -t 'pins exact pre-index tuples and passes observe lint from external trust' src/policy/pilot-policy.test.ts) >"$log" 2>&1; then
  status=0
else
  status=$?
fi
printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
test "$status" -eq 0
```

Expect the "gate: no index block yet, as expected" line, then a silent pass through both `if`
blocks (each records `exit=0` in its own log rather than printing to stdout, per addendum point 19:
a slow command's completion status is durable evidence in a log file, not a line that vanishes if
the tool call is read back later — `set -euo pipefail` would otherwise abort the whole script
before a bare `echo "exit=$?"` after a failing command ever ran), then the tailed pin-baseline log:
`1 pass`, `0 fail`, `27 expect() calls`, on the unmodified six-module/six-boundary tree — collected
**before** any edit in this slice, so the row-1 red below is measured against a known starting
point. Typecheck runs **before** this baseline, not after (addendum point 14):
`apps/wiki/cli/tsconfig.json`'s `typecheck` target builds `tsconfig.spec.json` by project
reference, which emits under `dist/out-tsc`; every baseline and red below is collected with that
output tree already present, the same state the final typecheck at step 9 leaves it in, so nothing
in this slice's rehearsal runs against a tree in a state its own later steps would never see.
**Do not** search for the bare word `module-index`: the unchanged
README's own prose says "Adding the `module-index` block before those land fails that suite,"
which that search would match and wrongly stop the slice — rehearsed: `grep -n "module-index"
<unchanged README>` finds that prose line and exits 0, which the `if` branch above would then read
as "the block already exists," the opposite of the intended gate. Only the literal
`<!-- module-index` marker identifies a real metadata comment.

1. Apply section 10.2 Part A's diff to `pilot-policy.test.ts`: add Plan history's README to
   `pilotPaths`. Without this, the README edit in step 2 below would be invisible to every
   candidate the test builds for the rest of this slice (review 5, Critical 1) — `createCandidate()`
   clones only committed content and overlays `pilotPaths` from the working tree, uncommitted.
2. Replace `libs/wbs/application/core/src/module/plan-history/README.md`'s content with section
   10.1 verbatim (no "Wiki registration" section yet — slice 2 adds it once the module is really
   registered).
3. `GSETTINGS_BACKEND=memory bunx prettier --write libs/wbs/application/core/src/module/plan-history/README.md`
   then `--check` it. Expect exit 0 both times.
4. Row 1's red: `cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --preload ../../../tools/test/scratch/preload.ts -t 'pins exact pre-index tuples and passes observe lint from external trust' src/policy/pilot-policy.test.ts`.
   Expect exit 1, `0 passed`, `1 failed`, `21 expect() calls`, ~10s — step 1's `pilotPaths` addition
   makes the README's **uncommitted** index block visible to `check-indexes`, and it is now an
   extra entry the original hardcoded array comparison did not expect. No commit happens between
   step 1 and this red, and none happens between this red and step 6's green: the whole sequence is
   working-tree-only, exactly like every negative in this slice.
5. Apply section 10.2 Part B's diff to `pilot-policy.test.ts`. Add the dated `Proof:` comment naming
   the fragment step 4 just produced — the diff's initial form carries none; this executor adds it
   after observing it, here, not before.
6. Row 2's green, filtered: same command as step 4 → exit 0, `1 passed`, `0 failed`,
   `27 expect() calls` (this slice's own 6-boundary tree; verified relative to this slice's own
   count, not an absolute the packet invented), ~50s (the file's own per-test git-clone cost).
7. Row 3's negative: edit `docs/wiki-policy/policy.json` **in the working tree only**
   (`pilotPaths` overlays it uncommitted) to remove the boundary object whose
   `boundaryId === 'boundary.infra.release-assembly'` (selector `tools/tool-dagger/src/lib`; **not**
   the boundary at selector `docs/refactoring/w4-4`, which is `boundary.docs.wbs-table-extraction`
   — a different boundary an earlier draft of this packet named by mistake) from the `boundaries`
   array. Rerun the filtered command. Expect exit 1,
   `Expected: 5`, `Received: 6`. Add the dated `Proof:` comment recording exactly this fragment.
   Restore `policy.json` from a `"$TMPDIR"` copy, `cmp`-prove it, rerun to confirm green again
   (`27 expect() calls`).
8. Row 4's negative: edit `libs/wbs/domain/domain/src/saved-plan/README.md` **in the working tree
   only** (also overlaid uncommitted) to remove its `<!-- module-index … -->` block. Rerun. Expect
   exit 1, `Expected: true`, `Received: false`. Add the dated `Proof:` comment. Restore,
   `cmp`-prove, rerun green.
9. `NX_DAEMON=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache` → exit 0. This is the
   slice's **final** typecheck, run after every edit above (the `pilotPaths` addition and the
   assertion replacement are both TypeScript changes); step 0 already ran the same target once,
   before, as this slice's baseline.
10. `NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache` → exit 0.
11. Append to `verify.md`: the step-0 baseline (typecheck exit and the pin test's `27 expect()
calls`), the row-1 red, the row-2 green, both negatives' fragments, and the evidence basenames.
12. `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

**Do not** touch `docs/wiki-policy/modules.json`, `modules.bootstrap.json` or
`bootstrap-policy.json` in this slice.

Planner commit: `docs(wiki-policy): index Plan history and derive the pilot pin from mapping/boundary parity`.

### Slice 2 — Register Plan history as a trusted pilot boundary

**Step 0.** Requires slice 1 committed: `createCandidate()`'s clone only sees committed content
for a path outside `pilotPaths` — slice 1 added Plan history's README to `pilotPaths` itself, but
the planner's commit is still this slice's own execution checkpoint, not an optional convenience.

```sh
set -euo pipefail
git log -1 --format=%H -- libs/wbs/application/core/src/module/plan-history/README.md
test -f libs/wbs/application/core/src/module/plan-history/README.md
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/modules.json'))['modules']))"
python3 -c "import json;print(len(json.load(open('docs/wiki-policy/policy.json'))['boundaries']))"
git ls-tree -r 7851161bf96312750d07b933ca5d42b75ce575c7 -- libs/core/src/service/history.service.ts
log="$TMPDIR/evidence/slice-2-typecheck-baseline.log"
if NX_DAEMON=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache >"$log" 2>&1; then
  status=0
else
  status=$?
fi
printf 'exit=%s\n' "$status" >>"$log"
test "$status" -eq 0
log="$TMPDIR/evidence/slice-2-legacy-pin-baseline.log"
if env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t 'every legacy source occurrence and relevant text family is pinned' >"$log" 2>&1; then
  status=0
else
  status=$?
fi
printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
test "$status" -eq 0
log="$TMPDIR/evidence/slice-2-pilot-policy-baseline.log"
if (cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts) >"$log" 2>&1; then
  status=0
else
  status=$?
fi
printf 'exit=%s\n' "$status" >>"$log"
tail -5 "$log"
test "$status" -eq 0
```

Expect a commit hash, then (silently) `test -f`. Record the module/boundary counts as `M` and `B`;
they must be equal (both `6` on the rehearsed tree). The `git ls-tree` line must print one
`100644 blob 8c0889017328a5c160a827ab712a9a5ea975a22a` tuple; if it prints nothing, stop — the
historical predecessor this slice's `sourceSelector` needs is not at the name this packet expects.
Each of the three slow commands below records its own `exit=` line durably in its own log rather
than printing to stdout (the same pattern slice 1 uses, per addendum point 19), so a failure past
`set -euo pipefail` still leaves a completion record even though the script aborts before a bare
`echo "exit=$?"` would run. Typecheck runs before both test baselines (addendum point 14, as in
slice 1): expect exit 0. The filtered legacy-pin log tails to `1 pass`, `0 fail`, `1 expect()
calls` — this slice's own baseline, collected **before** either JSON edit; the same command step 7
below reruns after the edits, where it is expected to fail instead. The whole unfiltered
`pilot-policy.test.ts` log tails to `21 pass`, `0 fail`, `293 expect() calls`, ~340s — this slice's
own baseline for step 6's later green, also collected before either edit.

1. Add one row to `docs/wiki-policy/modules.json`'s `modules` array from section 10.3 verbatim
   (insert it immediately before the `module.application.use-cases` entry, alphabetically). Do
   **not** yet touch `policy.json`.
2. `bun run apps/wiki/cli/src/cli.ts validate module-mapping docs/wiki-policy/modules.json` → exit
   0, `valid module-mapping`.
3. Row 5's red: `cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --preload ../../../tools/test/scratch/preload.ts -t 'pins exact pre-index tuples and passes observe lint from external trust' src/policy/pilot-policy.test.ts`
   → exit 1, `Expected: 6`, `Received: 7` on the length assertion. This red is evidence, not a
   commit.
4. Add one boundary to `docs/wiki-policy/policy.json`'s `boundaries` array from section 10.4
   verbatim (append it; order among boundaries is not significant, existing ones are unordered by
   id).
5. Row 6's green, filtered: same command as step 3 → exit 0, `1 passed`, `0 failed`,
   `28 expect() calls`.
6. Row 6's green, whole file: the same command **without** `-t` → exit 0, `21 passed`, `0 failed`,
   one `expect()` call more than this step's own `293`-call baseline in step 0, from the
   per-boundary loop running once more over the seventh boundary. Run this once; it is the
   packet's own proof that registering a seventh boundary disturbs none of the other twenty tests.
   (Unlike `tool-devsync:test` below, `pilot-policy.test.ts` builds every candidate as a fresh
   temporary clone — `createCandidate():101-119` — and never writes to the executor's own clone, so
   the executor may run this whole file directly.)
7. The pin's own red, **filtered, not the whole `tool-devsync:test` target** — that whole target is
   the planner's (batch README "Who does what": it runs the wiki index checker over the working
   tree and writes Git objects, which the executor's read-only `.git` refuses):
   `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t 'every legacy source occurrence and relevant text family is pinned'`
   → the same command step 0 ran clean before either edit; now, against this slice's own two JSON
   edits, it flips to exit 1, `1 fail`, `0 pass`, `1 expect() calls`, with `historical policy
selector or baseline` at `41` where the pin still says `39`, `occurrences` at `259` where the
   pin says `257`, and a different `digest`. Apply section 10.5's diff to
   `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` (the category number, the digest, the
   occurrence count, and one new dated `Proof:` comment recording exactly this).
8. The same filtered command again → exit 0, `1 passed`, `0 failed`, `1 expect() calls`.
9. Append `libs/wbs/application/core/src/module/plan-history/README.md` with section 10.6's "Wiki
   registration" section, appended verbatim after "Consumers".
   `GSETTINGS_BACKEND=memory bunx prettier --write` that file then `--check` it; expect exit 0
   both times.
10. `NX_DAEMON=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache` → exit 0. This is the
    slice's **final** typecheck, run after every edit above; step 0 already ran the same target
    once, before, as this slice's baseline.
11. Append to `verify.md`: `M`, `B`, the historical blob tuple, the two step-0 baselines (the
    filtered legacy-pin's `1 pass`/`0 fail` and the whole `pilot-policy.test.ts`'s `21 pass`/`293
expect()`), the row-5 red and row-6 green fragments, the pin-move before/after values, and the
    evidence basenames.
12. `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

**Do not** touch `docs/wiki-policy/modules.bootstrap.json` or `bootstrap-policy.json` — they are a
separate change's candidate artifacts (section 1).

Planner commit: `docs(wiki-policy): register Plan history as a trusted pilot boundary`.

### Slice 3 — Tick and record

**Step 0.**

```sh
set -euo pipefail
test -f openspec/changes/adopt-di-composition/tasks.md
grep -c "Full K2 closure and wiki registration stay outside this change." openspec/changes/adopt-di-composition/tasks.md
if present=$(grep -n "^- \[ \] 7\.5 " openspec/changes/adopt-di-composition/tasks.md); then
  printf '%s\n' "$present" >&2
  exit 1
else
  status=$?
  test "$status" -eq 1
fi
echo "gate: task 7.5 absent, as expected"
test -f openspec/changes/adopt-di-composition/proposal.md
grep -c "Wiki registration is separate" openspec/changes/adopt-di-composition/proposal.md
test -f openspec/changes/adopt-di-composition/design.md
grep -c "Wiki registration of the new modules, and the K2 feature owners" openspec/changes/adopt-di-composition/design.md
mkdir -p "$TMPDIR/evidence"
report="$TMPDIR/evidence/slice-3-openspec-before.json"
log="$TMPDIR/evidence/slice-3-openspec-before.log"
if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json >"$report" 2>"$log"; then
  status=0
else
  status=$?
fi
printf 'exit=%s\n' "$status" >>"$log"
test "$status" -eq 0
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
jq '.summary.totals' "$report"
```

Expect: `1`, then the gate line, then `1`, then `1`, then step 0's own typecheck-style silent pass
through both `if` blocks (addendum point 19, as in slices 1 and 2), then the before-edit OpenSpec
totals printed by the final `jq` line — `{"items": 114, "passed": 114, "failed": 0}` on the
rehearsed tree. Step 4 below reruns this same validation after every edit and requires these exact
totals unchanged (Important 2 of review 6): this slice adds no validated OpenSpec item, so a moved
total — higher or lower — is itself a fault, not merely a passing predicate on its own.

1. Apply section 10.7's edit to `tasks.md`: correct 7.4's last sentence, add and tick 7.5 to its
   final scope (the index block and the pilot mapping; no label-agreement claim, and an explicit
   pointer to the deferral).
2. Apply section 10.8's edit to `proposal.md`'s "Decisions Recorded" and "Impact" sections.
   `wc -w openspec/changes/adopt-di-composition/proposal.md` must print `400` or fewer (R4's cap);
   it was `397` on the rehearsed tree.
3. Apply section 10.9's edit to `design.md`'s "Not decided here" section: replace the claim that
   wiki registration is undecided with the adopted pilot-mapping scope task 7.5 covers, and state
   the label-agreement deferral explicitly. `GSETTINGS_BACKEND=memory bunx prettier --check
openspec/changes/adopt-di-composition/design.md` → exit 0 (this file's prose needs no rewrap).
4. Run the batch README's exact "OpenSpec validation" block (§ "Standard blocks every packet
   uses"), not a loose success check:

   ```sh
   set -euo pipefail
   mkdir -p "$TMPDIR/evidence"
   report=$(mktemp "$TMPDIR/evidence/openspec-validation.XXXXXX.json")
   OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
   jq -s -e '
     length == 1 and
     (.[0] | type == "object") and
     (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
     (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
   ' "$report" >/dev/null
   jq '.summary.totals' "$report"
   diff <(jq '.summary.totals' "$TMPDIR/evidence/slice-3-openspec-before.json") <(jq '.summary.totals' "$report")
   ```

   Expect exit 0, then the printed totals, then a silent (empty) `diff` — this slice adds no
   validated OpenSpec item, so step 0's before-edit totals (Important 2 of review 6) and this
   after-edit run must match exactly: `{"items": 114, "passed": 114, "failed": 0}` both times on
   the rehearsed tree, unmoved by this slice's edits (`tasks.md` and the trimmed prose in
   `proposal.md`/`design.md` are not separately validated items). A `diff` with output means the
   totals moved and the step fails, even though the `jq -s -e` predicate above it would still have
   passed on a smaller-but-still-positive count.

5. Append to `verify.md`'s Observations a "Packet D" entry summarizing all three slices: restate
   the `sourceSelector` mechanism and cite `trust.ts:388-426`; name the whole-suite checks in
   section 8 as pending planner verification with their observed values from this packet's own
   rehearsal; name the label-agreement deferral and point at "Deferred: label agreement"; record
   step 0's before-edit and step 4's after-edit OpenSpec totals side by side (both `{"items": 114,
"passed": 114, "failed": 0}` on the rehearsed tree) as this slice's own baseline/after pair, not
   a single absolute figure.
6. `GSETTINGS_BACKEND=memory bunx prettier --write openspec/changes/adopt-di-composition/verify.md openspec/changes/adopt-di-composition/tasks.md openspec/changes/adopt-di-composition/proposal.md openspec/changes/adopt-di-composition/design.md`
   then `--check` all four. Expect exit 0 both times.
7. `GSETTINGS_BACKEND=memory bunx nx format:check --all` → exit 0.

Planner commit: `docs(plans): tick the wiki registration task for Plan history`.

## 8. Planner-only checks

The "Value observed on the rehearsed tree" column below is this packet's own rehearsal, not a
number the executing planner may assume still holds on the real target tree. Before running any
slice against that tree, the planner collects its own baseline for each row here (the same
commands, unmodified), then compares the post-slice-3 value against that baseline rather than
against this table's literal figures — the batch README's "counts are relative, never absolute"
rule applies to the planner's own execution exactly as it does to every slice's rehearsal.

| Check                                                                                                                                                                                                                 | Why it is the planner's                                                                                                                                                                    | Value observed on the rehearsed tree                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts` (whole file, unfiltered, **after** slice 3) | Confirms nothing across the three slices together disturbed any of the file's 21 tests; slice 2 already runs this once mid-packet, so this is a final re-confirmation, not the first time. | 21 pass, 0 fail, observed 2026-09-22 with all three slices applied                                                                                                                                             |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test --skip-nx-cache`                                                                                                                                                  | Whole target, ~18 minutes; includes the file above plus every other Burokrat suite                                                                                                         | `764 pass`, `0 fail`, `6702 expect() calls` across 39 files, exit 0, observed 2026-09-22 — `twilight-burokrat` does not include `wbs-core`'s deleted test file, so this figure is unaffected by review 4's cut |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache` (final, all slices staged)                                                                                                                            | The index checker refuses untracked files, so it needs the slices staged or committed, and it spawns processes                                                                             | `366 pass`, `0 fail`, unmoved by this packet once slice 2's pin update lands                                                                                                                                   |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                                            | Takes the host-wide heavy lock                                                                                                                                                             | pending planner verification                                                                                                                                                                                   |

No slice adds a project target or a scanned-source comment line outside the paths section 5 names,
so `tools/tool-devsync/src/workspace-inventory.test.ts` counts do not move; the one file whose own
count this packet moves (`repo-namespacing-handoff.test.ts`) has that move recorded and re-pinned
inside slice 2 itself, not left to the planner.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails during the
`twilight-burokrat:test` row above or the host gate, record it and rerun that file once: it is a
known lock-contention race (its holder's `COMMIT` has `busy_timeout = 0`), not something this
packet's own changes cause. Do not edit that test, and do not edit any other test this packet does
not name.

## 9. What this packet cannot prove

`bin/tool-wiki-lint.sh` exits 0 with `{"schemaVersion":1,"status":"inactive","certified":false,…}`
whenever `TOOL_WIKI_ACTIVATION_ROOT` is unset or absent (`bin/tool-wiki-lint.sh:9-21`) — every run
of the `twilight-burokrat:lint` Nx target and the `tool-wiki` lefthook step on this workstation
today, unless `TOOL_WIKI_REQUIRE_CERTIFIED=1` is also set, in which case the same absence is a
**required**-admission refusal at exit **78** rather than a silent inactive pass
(`bin/tool-wiki-lint.sh:15-21`). Neither mode is exercised in this packet's own commits. That means:

- The lefthook commit hook's `tool-wiki` step passing on every commit in section 7 proves only that
  the tool ran and found no external activation — never that `MOD-LAYOUT`, `MOD-INDEX` or any other
  Burokrat rule certified Plan history's index against a live, externally trusted candidate. 030.5
  (`trusted-activation-relocation`) is what would make that step mean something for this directory.
- What **is** proven, unconditionally, by slice 2's rehearsal: `docs/wiki-policy/modules.json` and
  `policy.json` accept Plan history as a real seventh pilot boundary, and the production `lint()`
  pipeline — not merely `validate module-mapping` — **accepts it under the observe-mode pilot with
  local-operator trust** (`pilot-policy.test.ts:420-423`: `mode: 'observe'`, `trustProvenance:
'local-operator'`, `accepted: true`, and explicitly `certified: false`), on both the filtered test
  and the whole 21-test file. Nothing in this packet claims certification: that field is false by
  the oracle's own design for every boundary this pilot covers, not a gap specific to Plan history.
- What is **not** proven: that an external, digest-pinned activation package built from this
  commit would **certify** Plan history — a different, stronger claim `createExternalTrust`'s
  in-process, local-operator construction never makes. `createExternalTrust` builds its own
  binding/authority artifacts inline (`pilot-policy.test.ts:121-210`); the real external-activation
  packaging path that could produce `certified: true` is 030.5's, unbuilt today.
- What is **not** checked at all, by design of this revision: that the README's `moduleId` names
  the same label the module's own `buildModule` call seals its bag under. See "Deferred: label
  agreement," next.

## Deferred: label agreement

Four review rounds tried to make "the README's `moduleId` equals the module's DI Bag label" a
machine-checked assertion. Each round's fix closed a real, compile-valid or runtime-valid bypass
the previous round left open, and each round a new one appeared: dot/bracket-access spelling, then
an aliased export beside a decoy, then a spread-merged `label` option, then — after switching the
whole mechanism to type identity for cardinality and runtime `inspectGraph()` identity for the
label — an intersection-typed export that hides the real module behind a correctly labelled decoy,
and a registration key containing a slash that impersonates the label's own delimiter. Per
`docs/superpowers/plans/2026-09-19-batch-1/README.md`'s "Convergence" rule, four rounds against the
same mechanism is cut, not a fifth patch.

**Why it keeps failing.** di-bag 0.4.0 exposes a sealed module's label only as a string _prefix_
baked into every non-exported binding's `<label>/<key>` name — reachable through `inspectGraph()`
or a `DI_BAG_MISSING_DEPENDENCY` message, never as a queryable property of the module value itself.
A check built on top of that surface has to _infer_ the label from binding names it did not choose
the shape of, and every inference rule tried (substring before the last `/`, the first private
binding found) has a construction that produces a same-shaped name for a different reason — a
registration whose own key happens to contain a slash is this round's example. Building the
cardinality half on the checker's type identity closed every syntax-level bypass, but the label
half has no equivalently strong identity to build on inside di-bag's current public surface.

**What a later packet's design needs.** One of two things, either upstream or local:

1. A di-bag library surface that exposes a sealed module's label directly and unambiguously (for
   example a `Module.label` accessor, or a documented, type-distinguishable marker on private
   bindings that a slash-containing registration key cannot forge) — an obligation for the di-bag
   migration, tracked under WBS 140.x, not something this repository's own tooling can add to a
   dependency it merely consumes.
2. A repository convention that makes the label a single named, exported constant the index block
   also cites by name — Plan history's own `contract.ts` already exports `PLAN_HISTORY_LABEL` this
   way, but nothing enforces every future module doing the same, or checks the README against it.

Either route is a later packet with its own design, `openspec` change and adversarial rehearsal.
That design's first obligation is defeating the two cases review 4 reproduced against the cut
check — an intersection-typed export hiding the real module behind a correctly labelled decoy, and
a registration key containing a slash impersonating the label — since a design that cannot state
why both are unreachable has not yet earned another review round.

**What is checked today, and what is not.** `pilot-policy.test.ts`'s own production `lint()` call
(section 6) checks, for the boundaries and mapping rows actually **declared**, that each is mutually
consistent — one `modules.json` row matched one-to-one by one `policy.json` boundary matched by one
real README index. This is narrower than "one DI module = one wiki module": that stronger claim
needs two things this test does not do — confirming label agreement (deferred above) and
**discovering** a sealed DI module with no pilot registration at all, which `trust.ts:1244-1257`
only rejects when an unmapped index sits inside a boundary already declared, not for a module with
neither a row nor a boundary. Plan history has both after slice 2; a future sealed module that
skips 7.5 entirely would not be caught by this test. Label agreement and registration discovery are
both separate, stronger claims this packet does not make.

## 10. Exact content

### 10.1 `libs/wbs/application/core/src/module/plan-history/README.md` (slice 1)

```md
# Plan history

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-history","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-history.feature.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts and index.ts."},{"section":"invariants","reason":"Read-before-events, append-only and the no-view rule are documented on HistoryService and installPlanHistory; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/history.service.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the compatibility shim are declared; a deep import of plan-history.feature.ts by a test fixture elsewhere is not tracked here."}} -->

The plan's history, read. This is the first sealed DI Bag module in the core: `module.ts` seals
the graph and exports `history` alone, `check.ts` is the only place that builds a bag, and
`contract.ts` states the two repository ports a host must supply — preserved K3 debt, not
compliance. Private bindings are named under the `application.plan-history` label, so a DI failure
says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts` and
`libs/wbs/application/core/src/service/history.service.ts` keep the former
`@wbs/core/service/history.service` names. Workspace-relative paths rather than Markdown links:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves a relative link against the
file that carries it, and this listing is quoted inside a plan document at another depth.
```

### 10.2 `apps/wiki/cli/src/policy/pilot-policy.test.ts`, exact diff (two parts)

**Part A — add Plan history's README to `pilotPaths` (review 5, Critical 1).** Without this,
`createCandidate()` clones only committed content and overlays the fixed `pilotPaths` list from the
working tree (`pilot-policy.test.ts:30-44,101-119`); Plan history's README is not on that list, so
an uncommitted edit to it is invisible to the candidate and step 4 below could never observe the
red it claims. Locate the `pilotPaths` array and apply exactly this diff:

```diff
   'docs/wiki-policy/relationships.bootstrap.json',
+  'libs/wbs/application/core/src/module/plan-history/README.md',
   'libs/wbs/application/core/src/use-cases/README.md',
   'libs/wbs/domain/domain/src/saved-plan/README.md',
```

With this in place, an **uncommitted** edit to the README is visible to every candidate the test
builds for the rest of this slice — no intermediate commit is needed, and none is taken, between
the README edit, the red and the fix below.

**Part B — replace the hardcoded array/length assertions with computed ones.** Locate the
`test('pins exact pre-index tuples and passes observe lint from external trust', () => {` block.
Apply exactly this diff inside it (surrounding lines unchanged, no other edit to the file).
**No `Proof:` comment is included here** (review 4, Important 1): add one, dated, after step 4
below actually observes the red this diff turns green, quoting the fragment you observed, not a
fragment copied from this packet's own prose.

```diff
     expect(mapping.exitCode, output(mapping)).toBe(0);
     const modules = (
       JSON.parse(readFileSync(mappingPath, 'utf8')) as {
-        modules: { moduleId: string; predecessorModuleIds: string[] }[];
+        modules: { moduleId: string; indexPath: string; predecessorModuleIds: string[] }[];
       }
     ).modules;
-    expect(modules).toHaveLength(6);
+    // The pilot mapping and the trusted-boundary policy are two views of the same boundary set
+    // (`trust.ts:1230` refuses a mapping row with no matching boundary), so their counts stay equal
+    // without either file naming a literal headcount that a further module, registered the way
+    // `module.application.plan-history` now is, would force editing by hand.
+    expect(modules.length).toBe(policy.boundaries.length);
+    // `ModuleMapping`'s own schema (`contracts/records.ts:620-636`) already refuses a duplicate
+    // `moduleId` before `validate module-mapping` above can exit 0, so a uniqueness assertion here
+    // would be unreachable dead code; this length comparison is the check this suite still needs.
     expect(modules.every(({ predecessorModuleIds }) => predecessorModuleIds.length === 0)).toBe(
       true,
     );
     const indexInvocation = run([
       process.execPath,
       'run',
       cliPath,
       'check-indexes',
       'committed',
       candidate.repository,
       candidate.revision,
     ]);
     expect(indexInvocation.exitCode, output(indexInvocation)).toBe(0);
     const indexReport = JSON.parse(pipeText(indexInvocation.stdout, 'index stdout')) as {
-      indexes: { moduleId: string; applicableChecks: string[]; externalConsumers: string[] }[];
+      indexes: {
+        moduleId: string;
+        indexPath: string;
+        applicableChecks: string[];
+        externalConsumers: string[];
+      }[];
     };
-    expect(indexReport.indexes.map(({ moduleId }) => moduleId).sort()).toEqual(
-      [
-        ...modules.map(({ moduleId }) => moduleId),
-        'module.docs.findings',
-        'module.infra.tool-wiki',
-      ].sort(),
-    );
+    // Every pilot-declared module has a real discovered index (never a mapping row with nothing to
+    // back it). What indexes exist BEYOND the declared pilot set is not re-checked here: the
+    // `lint(candidate, trust)` call below already exercises production's own
+    // `pilot index has no module mapping` rule (`trust.ts:1244-1250`) end to end, so a second,
+    // hand-written version of that same rule in this test would just be an unreachable duplicate of
+    // a check this same test already runs for real.
+    expect(
+      modules.every(({ indexPath }) =>
+        indexReport.indexes.some((index) => index.indexPath === indexPath),
+      ),
+    ).toBe(true);
     expect(indexReport.indexes.every(({ applicableChecks }) => applicableChecks.length > 0)).toBe(
       true,
     );
```

The `policy` variable's own inline type (`selector: { value: string }`) is **unchanged** — this
diff does not touch it.

### 10.3 `docs/wiki-policy/modules.json`, the new row

Insert immediately before the `module.application.use-cases` entry in the `modules` array:

```json
{
  "moduleId": "module.application.plan-history",
  "name": "Plan history sealed DI Bag module",
  "memberships": [
    {
      "kind": "directory-prefix",
      "prefix": "libs/wbs/application/core/src/module/plan-history",
      "exclusions": []
    }
  ],
  "predecessorModuleIds": [],
  "indexPath": "libs/wbs/application/core/src/module/plan-history/README.md",
  "externalConsumers": {
    "kind": "declared",
    "memberships": [
      { "kind": "path", "path": "libs/wbs/application/core/src/compose.ts" },
      { "kind": "path", "path": "libs/wbs/application/core/src/index.ts" },
      { "kind": "path", "path": "libs/wbs/application/core/src/service/history.service.ts" }
    ]
  }
}
```

Run `GSETTINGS_BACKEND=memory bunx prettier --write docs/wiki-policy/modules.json` after inserting
it; Prettier's own JSON formatting is the file's canonical form and differs slightly from a raw
`json.dump`.

### 10.4 `docs/wiki-policy/policy.json`, the new boundary

Append to the `boundaries` array:

```json
{
  "boundaryId": "boundary.application.plan-history",
  "selector": {
    "kind": "prefix",
    "value": "libs/wbs/application/core/src/module/plan-history"
  },
  "sourceSelector": {
    "kind": "prefix",
    "value": "libs/core/src/service/history.service.ts"
  },
  "baselineEntries": [
    {
      "mode": "100644",
      "blob": "8c0889017328a5c160a827ab712a9a5ea975a22a",
      "path": "libs/core/src/service/history.service.ts"
    }
  ],
  "obligationIds": []
}
```

Run `GSETTINGS_BACKEND=memory bunx prettier --write docs/wiki-policy/policy.json` after appending
it.

### 10.5 `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, exact diff

```diff
       'current recursive selector': 31,
       'frozen migration evidence': 19,
       'historical bootstrap policy or mapping': 44,
-      'historical policy selector or baseline': 39,
+      'historical policy selector or baseline': 41,
       'production proof or revision transition': 18,
       'test fixture or proof': 106,
```

```diff
     // Proof: exchanging lefthook.yml's and sync.test.ts's classes left every count and unclassified
     // unchanged but changed the digest to `7bae8ae12d6c9f94b27fe83c102f38c67354efe4913b76371172895f1a15e9dc`;
     // without `${category}:`, exchanged and restored classes both produced
     // `681ef06d22b9d0eff7d378a2943005f1daca81573987b1aff9db8daa8475b2a2` (2026-09-21).
-    digest: '2f0d2926e8d85aed7089c3ad667f7a0f6ccb97c514152a9895893978fab3f22d',
-    occurrences: 257,
+    // Proof: registering `module.application.plan-history` in `docs/wiki-policy/policy.json` added
+    // its `boundary.application.plan-history`'s `sourceSelector` and one `baselineEntries` path,
+    // both naming the pre-move `libs/core/src/service/history.service.ts` this module was
+    // extracted from; raised `historical policy selector or baseline` from 39 to 41 and occurrences
+    // from 257 to 259, no unclassified entries (2026-09-22).
+    digest: '55fafcaf0420dd5b2e0018b0a0dd467b7c3b8fae950eca69e72a99f52364b725',
+    occurrences: 259,
     unclassified: [],
   });
 });
```

### 10.6 The "Wiki registration" section (slice 2 appends to the README)

Append after "## Consumers":

```md
## Wiki registration

This module is a full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.plan-history` (`docs/wiki-policy/policy.json`'s
`boundary.application.plan-history`). The boundary's `sourceSelector` binds this new directory to
the single service file it was extracted from, which existed at the pilot's frozen
`sourceRevision` — the same mechanism `boundary.application.use-cases` and `boundary.domain.saved-plan`
already use for their own renamed directories. Whether this README's `moduleId` names the same
label `module.ts` seals its bag under is not machine-checked: see the plan's "Deferred: label
agreement" for why, and what a later change needs before it can be.
```

**Deliberately does not spell the pre-move path.** `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`
scans current documents for legacy, pre-namespacing path text and pins the exact classified
occurrence count; writing `libs/core/src/service/history.service.ts` in this prose (confirmed by
rehearsal) moves that separate pin too. `docs/wiki-policy/policy.json` itself is not scanned by
that document sweep (only `.md` documents are), which is why section 10.5's JSON-only pin move is
the one this packet accounts for, and this README prose avoids adding a second one.

### 10.7 `openspec/changes/adopt-di-composition/tasks.md`, exact diff

```diff
 - [ ] 7.4 Record, per module, which K2 and K3 obligations it does not close and where they are
-      tracked. Full K2 closure and wiki registration stay outside this change.
+      tracked. Full K2 closure stays outside this change.
+- [x] 7.5 Register each sealed module's directory as a wiki index: a `<!-- module-index -->` block
+      naming every module file by path, and full membership in `docs/wiki-policy/modules.json`'s
+      content-review pilot (a `modules.json` row matched one-to-one by a `policy.json` boundary).
+      This keeps a declared mapping row, boundary and README index mutually consistent, checked
+      by `apps/wiki/cli/src/policy/pilot-policy.test.ts`'s own production `lint()` call — a
+      narrower guarantee than "every sealed DI module has a pilot registration": that stronger
+      claim, and label agreement, are both out of this task's scope (packet D's "Deferred: label
+      agreement"). Landed 2026-09-22 for Plan history as
+      `libs/wbs/application/core/src/module/plan-history/README.md`,
+      `docs/wiki-policy/modules.json`'s `module.application.plan-history` row and
+      `docs/wiki-policy/policy.json`'s `boundary.application.plan-history`, using a
+      `sourceSelector` bound to the pre-move `libs/core/src/service/history.service.ts` this
+      directory was extracted from — the same mechanism `boundary.application.use-cases` and
+      `boundary.domain.saved-plan` already use for their own renamed directories. Whether the
+      index block's `moduleId` names the same label the module's own `buildModule` call seals its
+      bag under is explicitly **not** checked by this task: four review rounds against a
+      machine-checked version of that specific claim each found a new compile- or runtime-valid
+      bypass (040.6 packet D's "Deferred: label agreement"), so that check is a later task with its
+      own design, not part of 7.5. Each future module ticks 7.5 for its own directory.
```

### 10.8 `openspec/changes/adopt-di-composition/proposal.md`, exact diff

```diff
 ## Non-Goals

-No library version bump, no frontend lifetimes, no gateway or MCP composition, and no invented
+No library version bump, no frontend lifetimes, no gateway or MCP composition, no invented
 capability for the CRUD delivery reaches directly.

 ## Constraints

 Rules R1 to R5 govern. `bootBe01` keeps owning source, retention, optimizer and listener disposal in
-its tested order; modules borrow them without a second disposer. `servicesOver` stays per-admission:
-no singleton may leak staged stores or announcements between transactions. Every changed check ships
-a watched negative.
+its tested order; modules borrow them, never a second disposer. `servicesOver` stays per-admission:
+no singleton leaks staged stores or announcements between transactions. Every changed check ships a
+watched negative.

 ## Capabilities
 ...
 ## Module identifiers

-A library module is named ring then name, as `module.application.plan-history` is. A module under an
-app carries the runtime word by location: `module.backend.<name>`, `module.frontend.<name>`,
+A library module is ring then name, as `module.application.plan-history` is. An app module carries
+the runtime word by location: `module.backend.<name>`, `module.frontend.<name>`,
 `module.gateway.<name>`, `module.mcp.<name>`. Optimization, the Local solver launcher and the
 Supervisor are backend modules, so `module.backend.*`. A label drops only the `module.` prefix. The
 nine existing identifiers are untouched.

 ## Decisions Recorded

-- Full K2 closure stays outside this change: CRUD delivery for the seven resources lacks feature
-  owners, and none is invented here.
+- Full K2 closure stays outside this change: the seven resources' CRUD delivery lacks feature
+  owners, none invented.
-- K3 debt is preserved, not fixed: a feature-service reading a repository port keeps doing so,
-  declared rather than implicit. Task 7.4 records it.
-- Wiki registration is separate: `policy.json` needs a boundary per identifier, and
-  `pilot-policy.test.ts` pins the mapping length and identifiers.
+- K3 debt is preserved: a feature-service reading a repository port keeps doing so, declared not
+  implicit; task 7.4 records it.
+- Wiki registration is part of this change: task 7.5 tracks the index block and full pilot
+  membership (mapping row and boundary, both required); label agreement is deferred.

 ## Impact

-`libs/wbs/application/core/src`, `libs/wbs/domain/domain/src` and `kinds.json`. `apps/wbs/be-01`
-changes only where a shim path moves.
+`libs/wbs/application/core/src`, `libs/wbs/domain/domain/src`, `kinds.json` and
+`docs/wiki-policy`. `apps/wbs/be-01` changes only where a shim path moves.
```

The `...` marks unchanged context (the "Capabilities" section) and is not part of the diff to
apply; every other line shown is exact. After applying, `wc -w` on the whole file must print `400`
or fewer — it was `397` on the rehearsed tree.

### 10.9 `openspec/changes/adopt-di-composition/design.md`, exact diff

```diff
 ## Not decided here

-Wiki registration of the new modules, and the K2 feature owners for the resources delivery reaches
-directly. Both are named in the proposal as outside this change's claim.
+The K2 feature owners for the resources delivery reaches directly remain outside this change's
+claim. Wiki registration of each new module, by contrast, is adopted scope, but only its
+pilot-mapping half: task 7.5 requires a `module-index` block naming every module file, and full
+membership in the wiki's content-review pilot — both a `modules.json` row and a matching
+`policy.json` boundary, required together (`trust.ts:1224-1230` refuses a mapped module without
+exactly one matching boundary) — keeping a declared registration's mapping row, boundary and index
+mutually consistent, checked by the pilot's own production `lint()` call. That is narrower than
+"every sealed DI module has a pilot registration": discovering an unregistered module is also out
+of scope. Whether an index block's `moduleId` names the same label its module's own `buildModule`
+call seals its bag under is explicitly **not** checked by task 7.5: four review rounds against a
+machine-checked version of that specific claim each found a new bypass, so it is deferred to a
+later change with its own design (040.6 packet D's "Deferred: label agreement").
```

Verified on the rehearsed tree: `GSETTINGS_BACKEND=memory bunx prettier --check design.md` exits 0
after this edit with no reflow, and `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate
--all --json` still reports `{"items": 114, "passed": 114, "failed": 0}`, unchanged by this edit —
`design.md` carries no separately validated OpenSpec item of its own; only `proposal.md`,
`tasks.md` and the `specs/` deltas are.
**Historical note.** Sections 11 through 13 document three rounds of fixes to a machine-checked
label-agreement mechanism (`module-index-identity.test.ts`, `resolvedLabel`,
`exportedBuildModuleCall` and their successors) that review 4 ultimately found a fourth bypass of.
Per the convergence decision above, that whole mechanism is now cut from this packet, so none of
the file paths, function names or row numbers these three sections cite still exist in section 10.
They are kept as an accurate record of what each round actually found and fixed, not as a
description of this revision's own content — section 14 records this round's disposition against
the packet as it exists now.

## 11. Disposition of review 1

- **Critical 1, forbidden executor commits (slice 2 step 4). FIXED.** The two negatives no longer
  instruct a commit or a restoration commit; both mutate `docs/wiki-policy/policy.json` and
  `libs/wbs/domain/domain/src/saved-plan/README.md` in the working tree only, relying on the
  confirmed fact that both paths are in `pilotPaths` and are overlaid uncommitted by
  `createCandidate()`.
- **Critical 2, the slice-4 step-0 precondition necessarily failed. FIXED.** The grep text now
  matches the real sentence ("stay," not "stays"), and the task-7.5-absence check uses the
  `if present=$(grep …); then …; else status=$?; test "$status" -eq 1; fi` form, so a genuine
  absence (grep exit 1) is success and any other grep failure is not silently accepted.
- **Critical 3, a fenced example passed as a real index. FIXED.** `readmeModuleId` no longer
  regex-scans the raw file; it parses with `mdast-util-from-markdown` and visits only `html` AST
  nodes, mirroring `read-indexes.ts:65-96`, and refuses both zero and more than one genuine block.
  Rehearsed: a fenced copy of the real block is invisible to it (row 4); a genuine duplicate is
  refused by count (row 5); malformed JSON is refused distinctly (row 6).
- **Critical 4, the check could validate an unused decoy instead of the exported module. FIXED.**
  `exportedBuildModuleCall` resolves the file's export table and each export's initializer, and
  confirms the resolved call signature's declaration is di-bag's own `buildModule` by declaration
  file **and** declared name — never a property-access filter. Rehearsed against the reviewer's
  exact probe (row 8): a bracket-accessed, wrongly labelled exported call beside an unused,
  correctly labelled, ordinary-syntax decoy is caught (`Expected: "module.wrong-label"`); the same
  scenario made the old property-name-filter version pass silently. A quoted `'label'` key is
  separately confirmed accepted (not a fault; a positive rehearsal note in section 6's row 8 and
  the identity check's own JSDoc).
- **Important 1, the claimed impossibility of registration. INVESTIGATED, and reversed.**
  `sourceSelector` (`trust.ts:388-426`) is exactly the mechanism two of the six existing boundaries
  already use for a directory renamed since the pilot's frozen revision, and
  `libs/core/src/service/history.service.ts` — Plan history's own predecessor — exists there
  (`git ls-tree -r 7851161bf96312750d07b933ca5d42b75ce575c7`). Measured command and result: a
  `sourceSelector`-based boundary plus a matching `modules.json` row make
  `pins exact pre-index tuples and passes observe lint from external trust` pass, filtered (`bun
test -t '<title>' src/policy/pilot-policy.test.ts`, 1 passed, 28 `expect()` calls) and unfiltered
  (same command without `-t`, 21 passed, 0 failed, 294 `expect()` calls, ~400s). This is now the
  packet's slice 3, its stated purpose, not a limitation. Every "impossible"/"refused" claim was
  removed from the README, `tasks.md` and this packet's own prose and replaced with the measured
  mechanism.
- **Important 2, unreachable and unproven assertions. FIXED.** The uniqueness assertion is removed
  (`contracts/records.ts:620-636`'s own schema `.narrow` already refuses a duplicate `moduleId`
  before `validate module-mapping` can exit 0 — probed, confirmed unreachable). The hand-rolled
  "every non-pilot index sits outside every boundary" loop is removed rather than given an isolated
  negative: it duplicates a rule the test's own later `lint(candidate, trust)` call already
  enforces end to end (`trust.ts:1244-1250`), so any fault that would trip it also trips that later
  call, making a hand-written copy redundant rather than independently useful. The two retained
  assertions (length parity, subset) each have a rehearsed, restored, independently reachable
  negative (rows 11 and 12). "Removing a metadata block" and "deleting a README" are now
  distinguished throughout: every negative in this packet removes the `<!-- module-index -->`
  comment, never the file.
- **Important 3, implementation preceded its test. FIXED.** Slice 1 now creates
  `module-index-identity.test.ts` first, runs it red against the unmodified README (row 1:
  `sealed module directory carries no module-index block: plan-history`), and only then adds the
  README's index block for the green (row 2), both inside the same slice/commit.
- **Important 4, `--resume` could not start slice 1. FIXED.** The dispatch paragraph now gives
  slice 1 a bare `run-executor.sh … <this packet's own commit sha> --batch batch-6` invocation with
  no `--resume` — dispatched from the commit that lands this packet itself, since `bd39d86e` alone
  lacks the packet and cannot be the checkout `run-executor.sh` clones from (Critical 1 of review
  2, below, corrected the stale `bd39d86e`-as-checkout claim this bullet used to carry) — and names
  `--resume --require-ancestor <sha of slice N-1's planner commit>` for slices 2 to 4 specifically.
- **Important 5, validation bypassed the mandatory contract and cited absolute totals. FIXED.**
  Slice 4 step 3 now runs the batch README's exact `jq -s -e` block verbatim instead of a loose
  Python summary print. Every count elsewhere in the packet (slice 1's `C`/`F`, slice 3's `M`/`B`)
  is recorded as a step-0 baseline plus a relative delta, never an absolute expectation on its own;
  historical totals observed on the rehearsed tree are labelled as observations, not as the
  dispatch acceptance criterion itself.
- **Important 6, restoration ordering contradicted the proof. FIXED.** Slice 1 step 7's negatives
  are now explicit: inject, observe the identity-test failure, and only afterward restore with
  `cp`/`cmp`; no step instructs a post-restoration typecheck of already-restored code. (The
  reviewer's specific concern was the label-change mutation's typecheck ordering; that mutation
  keeps its own note in section 6 row 7 that `wbs-core:typecheck` exits 0 **on the mutation**,
  observed before restoration.)
- **Important 7, the proposal's own "Decisions Recorded" stayed contradictory. FIXED.** Slice 4 now
  edits `proposal.md` (section 10.9) alongside `tasks.md`, replacing "Wiki registration is
  separate" with a sentence naming `service-taxonomy`'s "A module has one declared boundary" and
  `di-composition`'s label requirement as the existing authority this packet works under, per the
  file plan's new row. No new OpenSpec change is opened.
- **Minor 1, the inactive-launcher claim omitted `TOOL_WIKI_REQUIRE_CERTIFIED=1`. FIXED.** Section
  1's non-goals and section 9 both now state the exit-78 required-admission case distinctly from
  the exit-0 optional-admission case.
- **Minor 2, stale/missing packet facts. FIXED.** The read-first table now says "1081 lines before
  this packet" instead of "950-ish" and directs the reader to the test's title, not a line number.
  The three token-estimate header rows are present. Section 5's neighbours note no longer points at
  a nonexistent cumulative-count cross-reference; section 6's fault table is the single source for
  every count this packet claims.

## 12. Disposition of review 2

- **Critical 1, the dispatch checkout contains no packet. FIXED.** The dispatch paragraph now
  requires the checkout to contain this packet file itself (`git ls-tree <checkout> --
docs/superpowers/plans/2026-09-21-batch-6/040-6-d-wiki-registration.md` must print an entry),
  names the commit that lands this revision on `plan/batch-6-040-6-d` (or its reviewed integration
  descendant) as the dispatch checkout, and keeps `bd39d86e` as a prerequisite ancestor only —
  verified `git ls-tree bd39d86e -- <this path>` returns nothing.
- **Critical 2, the slice-1 precondition rejected the unchanged tree. FIXED.** Step 0 now requires
  the README to exist first (`test -f`), then searches for the literal `<!-- module-index` marker
  instead of the bare word — rehearsed against the real unmodified README (`git show bd39d86e --
…/README.md`): the old bare-word search matched the prose sentence "Adding the `module-index`
  block before those land fails that suite" and exited 1; the fixed search exits 0.
- **Critical 3, two compile-valid false greens remain. FIXED.** Both reproduced against the real
  Plan history source before fixing: (a) `export { actualModule as planHistoryModule }` with a
  wrong label plus a directly exported, correctly labelled decoy passed (1 pass, 0 fail) against
  the review-1 fix, because an aliased export has no `valueDeclaration` and was silently skipped;
  resolving the alias chain through `getAliasedSymbol` (precedent
  `ports/sideways-type-boundaries.test.ts:73-85`) makes both the alias's real target and the decoy
  count, so the file is now refused as ambiguous (`exports 2 di-bag buildModule modules, expected
1`) rather than picking either one — section 6 row 15. (b)
  `{ label: PLAN_HISTORY_LABEL, ...overrideLabel() }` also passed, because the check read the first
  `PropertyAssignment` named `label` and never saw the spread that overrides it at runtime;
  `resolvedLabel` now refuses any options object containing a `SpreadAssignment` or a computed
  property outright, with its own diagnostic — section 6 row 17. A supported one-hop alias with the
  correct label and no decoy is confirmed accepted, not refused — row 16. The DI method is still
  compared by resolved signature declaration identity (`isBuildModuleSignature`), unchanged from
  the review-1 fix. Coverage and residuals are stated explicitly in section 6's new "Coverage"
  paragraph.
- **Important 1, whole `tool-devsync:test` in executor steps. FIXED.** Slice 3 steps 7 and 8 now
  run the reviewer's exact filtered command
  (`bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t 'every legacy source
occurrence and relevant text family is pinned'`) for the baseline, red and green, rehearsed at
  1 pass/0 fail (baseline), 1 fail (red, identical numbers to before: 39→41, 257→259, digest
  changed), 1 pass (green) — each run in under a second, versus the whole target's ~40s. The whole
  target stays exclusively in section 8's planner-only table.
- **Important 2, incomplete and incorrect R5 evidence. FIXED.** The `<!-- module-index-->` (no
  space) input now correctly triggers "is not a module-index envelope" (rehearsed); the previously
  claimed `<!-- module-index -->` (with a space) input actually matches the envelope regex with an
  **empty capture** and reaches `JSON.parse('')`, refused there as malformed JSON — rehearsed and
  now stated explicitly in the code's own comment, distinguishing the two. The "an empty
  `sealedModuleDirectories()` would be vacuous" comment is relabelled as unrehearsed rationale, not
  a `Proof:` claim. Missing-label and export-cardinality guards now each have a rehearsed,
  independently reachable negative (rows 15/18) or a stated reason one is not separately rehearsed
  (cardinality 0, same comparison as row 15's cardinality 2). Every TypeScript mutation in slice 1
  step 7 is now explicitly ordered inject → failing test → mutated `wbs-core:typecheck` → restore
  → `cmp` → green.
- **Important 3, wrong counts. FIXED.** Slice 2's own green is `27 expect() calls` (rehearsed on
  the real 6-boundary tree), not 28; 28 is correct only after slice 3's seventh boundary lands
  (also rehearsed, unchanged). Slice 1 now collects a real step-0 baseline (`C0`/`F0`, `543`/`55`)
  before any edit, and step 8 states the result as `C0 + 1`/`F0 + 1` rather than a freshly-invented
  absolute pair. Slice 2's own README-presence precondition is also fixed to the same
  `<!-- module-index` marker as slice 1's, since a bare `grep -c "module-index"` on the real landed
  README prints `2` (the block, plus the "Checks" section's mention of
  `module-index-identity.test.ts`), not the `1` previously claimed — rehearsed.
- **Important 4, claimed certification the oracle denies. FIXED.** Section 9 now says Plan history
  is "accepted by the observe-mode pilot with local-operator trust," quoting
  `pilot-policy.test.ts:420-423`'s exact `mode: 'observe'`, `trustProvenance: 'local-operator'`,
  `accepted: true`, `certified: false`, and states plainly that certification is a different,
  stronger claim this packet never makes.
- **Minor 1, three diagnostic descriptions contradicted the code. FIXED.** The read-first table's
  `trust.ts` row now says slice 3's own red (row 13) stops at the `modules.length`/
  `policy.boundaries.length` mismatch before the test ever reaches `lint()` or the "no exact
  trusted boundary" refusal; row 9 is unchanged (it was already correct — the original index-ID
  array comparison, on the unmodified test); row 11 now reads `Expected: 6, Received: 7`, matching
  `toBe`'s own argument order, re-rehearsed to confirm.
- **Minor 2, the `claims.db.test.ts` known race was absent. FIXED.** Section 8 now carries the
  addendum's record-and-rerun-once instruction for
  `bounds terminal lock contention and retries until a held write commits`, naming it a known race
  unrelated to this packet.

## 13. Disposition of review 3

- **Critical 1, unsupported initializers were silently skipped, a decoy false green. FIXED by
  replacing the mechanism, not patching the walker.** `exportedBuildModuleCall`/`resolvedLabel` are
  gone. Cardinality is now `diBagModuleExportName`: for every export of `module.ts`, the checker's
  own `checker.getTypeOfSymbolAtLocation` resolves that export's TYPE (never its initializer node),
  and a candidate counts only when its type's own symbol is named `Module` and is declared in
  `node_modules/di-bag/dist/module.d.ts`. A parenthesized initializer's and an intermediate
  variable's exported type are both still `Module<...>`, so both are counted identically to the
  direct form — rehearsed against the real reviewer exploit (parenthesized initializer, wrong label,
  plus a directly exported, correctly labelled `decoyModule`) and independently against an
  intermediate-variable version of the same exploit: both throw `module/plan-history/module.ts
exports 2 di-bag modules, expected 1`, `wbs-core:typecheck` exiting 0 on the mutated tree
  (section 6 rows 11, 12).
- **Critical 2, the computed-property refusal missed accessors. FIXED by never reading the options
  object as syntax at all.** `resolvedLabel`'s `unsupported`/spread/computed-property scan is gone.
  The label is now `moduleRuntimeLabel`: the real `module.ts` is imported at runtime, its candidate
  export installed into a throwaway `DiBag.createBuilder()`, and the label read off a private
  binding's own `<label>/<key>` name through `inspectGraph()` — the same surface di-bag itself uses
  for error messages and cycle paths. Rehearsed against the exact reviewer exploit
  (`const labelKey: string = 'label';` above the export, `get [labelKey]() { return 'wrong-label';
}` appended after the real `label: PLAN_HISTORY_LABEL` property, object-literal duplicate-key
  semantics making the getter win): `Expected: "module.wrong-label"`, `Received:
"module.application.plan-history"`, `wbs-core:typecheck` exiting 0 (section 6 row 10). Because no
  syntax in the options object is read at all, an accessor, a spread, a computed key or any other
  form that this round's exploit or either prior round's (bracket access, an alias, a spread) used
  are the same runtime string to this check — there is nothing left in the options object to
  bypass, because nothing in it is inspected.
- **Important 1, R5 evidence installed prematurely. FIXED.** Every `// Proof:` comment is removed
  from section 10.1's listing; the file slice 1 step 1 creates verbatim carries none. Slice 1 step 7
  now walks all thirteen negatives and the one positive (section 6 rows 3-15) as a numbered
  sub-list, each naming the exact edit location and the exact expected fragment, and instructs the
  executor to add the dated `Proof:` comment only after observing that fragment, quoting what was
  actually observed rather than a fragment copied from this packet's own prose. The two previously
  unproved structural throws (`the program holds no module/${name}/module.ts`;
  `module/${name}/module.ts declares no module symbol`) are now explicitly attributed to precedent
  in the code's own JSDoc (`ports/sideways-type-boundaries.test.ts`'s identical mechanism) rather
  than implied as independently rehearsed, and the un-rehearsable empty-`sealedModuleDirectories()`
  guard keeps its own comment saying plainly it is not a rehearsed negative.
- **Important 2, `design.md` still claimed wiki registration undecided. FIXED.** `design.md` is now
  read in section 2, edited in slice 4 (new step 3, section 10.10), and listed in section 5's file
  plan and slice 4's commit. Its "Not decided here" section now states wiki registration is adopted
  scope under task 7.5, checked by identity, keeping only the K2 feature-owner exclusion — verified
  on the rehearsed tree: `prettier --check` exits 0 with no reflow, and
  `openspec validate --all --json` still reports `{"items": 114, "passed": 114, "failed": 0}`,
  unmoved by this edit.
- **Important 3, required baselines still missing. FIXED.** Slice 3 step 0 now runs both the
  filtered legacy-pin command and the whole unfiltered `pilot-policy.test.ts` file **before**
  either JSON edit, and records both as this slice's own baseline: `1 pass`/`0 fail`/`1 expect()
calls` for the pin (matching review 3's own verified figure), and `21 pass`/`0 fail`/`293
expect() calls`/~340s for the whole file — one `expect()` call fewer than the post-registration
  `294` in step 6, from the per-boundary loop running once more over the seventh boundary. Step 7's
  red is now framed explicitly as a delta from that step-0 baseline, not a freshly asserted
  absolute. Section 8 now opens with an explicit instruction: the planner collects its own baseline
  for each row before running any slice against the real target tree, and compares the post-slice-4
  value against that baseline rather than this packet's own rehearsed figures.
- **Minor 1, section 6 and section 11 stale instructions. FIXED.** Section 6's "Each assertion has
  a mutation" paragraph now names row 16's failure correctly as the original index-identifier
  array-equality comparison (on the unmodified `pilot-policy.test.ts`, before slice 2's diff lands)
  and row 20's failure as the `modules.length`/`policy.boundaries.length` comparison slice 2's diff
  adds — two different assertions, not the same one twice. Section 11's Important-4 bullet no
  longer names `bd39d86e` as the dispatch checkout; it now names "this packet's own commit sha,"
  matching the packet's own current dispatch paragraph and section 12's Critical-1 fix.
- **Minor 2, incomplete file gates. FIXED.** Slice 2 step 0 now runs `test -f
libs/wbs/application/core/src/module/plan-history/README.md` before its `grep -c`. Slice 4 step 0
  now runs `test -f openspec/changes/adopt-di-composition/proposal.md` before its `grep -c`, and a
  matching `test -f`/`grep -c` pair for `design.md` before the new step 3 edits it.

**Verification this round.** All thirteen negatives and the one positive of section 6 rows 3-15
were rehearsed fresh against the real `plan-history/module.ts`, `contract.ts` and `README.md` in
this worktree, each restored with `cp` and `cmp`-proved before the next mutation; `wbs-core:lint`
and `wbs-core:typecheck` were run clean on the restored tree after every group. The slice-3 step-0
baselines (the filtered legacy-pin command and the whole `pilot-policy.test.ts` file) were run
fresh on the rehearsed tree with slice 1 and slice 2's diff applied, six boundaries, before any
slice-3 edit. The `design.md` diff was applied, `prettier --check`ed and OpenSpec-validated fresh.
Every mutation used for this round's rehearsal was restored before this document was finalized;
`git diff bd39d86e --stat` shows only this packet document and
`docs/findings/current-document-check-exemptions.json` changed.

## 14. Disposition of review 4

- **Critical 1, intersection-typed export hides the real module behind a decoy. CUT, not fixed.**
  `diBagModuleExportName` and the whole `module-index-identity.test.ts` mechanism it belonged to
  are removed from this packet. This is the third distinct cardinality bypass across four review
  rounds (bracket access; an aliased export; now an intersection type), each closing the previous
  round's specific exploit without closing the class. Recorded in "Deferred: label agreement" as
  the first adversarial case any future design must defeat.
- **Critical 2, a slash-containing registration key impersonates the label. CUT, not fixed.**
  `moduleRuntimeLabel`'s substring-before-last-slash inference is removed along with the rest of
  the mechanism. Recorded in "Deferred: label agreement" as the second adversarial case, together
  with the underlying fact that made it possible: di-bag 0.4.0 exposes a label only as an inferred
  prefix on private-binding names, not as its own property.
- **Important 1, R5 coverage and proof timing. FIXED for what remains.** The guards review 4 found
  unproved (invalid envelope, unreadable README, empty discovery, configuration errors) belonged
  entirely to the cut check; they no longer exist in this packet, so there is nothing left to prove
  or misattribute. What does remain — section 10.2's `pilot-policy.test.ts` diff — now carries no
  `Proof:` comment in its initial form; slice 1 step 4 instructs the executor to add one, dated,
  after observing the exact red step 3 produces. Section 10.2's boundary-removal negative (slice 1
  step 6) is rehearsed on this slice's own six-module/six-boundary tree, producing `Expected: 5`,
  `Received: 6` — the corrected figure review 4 named, not the `Expected: 6`/`Received: 7` an
  earlier draft mistakenly carried over from the later, fully-registered tree.
- **Important 2, the task ledger describes the superseded mechanism. FIXED.** Task 7.5 (section
  10.7) is rewritten to the scope this revision actually delivers — the index block and the pilot
  mapping — with no mention of resolved call signatures, decoys or any other detail of the cut
  check. It states the label-agreement deferral explicitly and points at "Deferred: label
  agreement."
- **Important 3, the convergence requirement is unresolved. FIXED.** This revision's opening
  "Convergence" section records the four-round history and the cut decision before any dispatch
  instruction; the dispatch paragraph itself is unchanged in mechanism (still requires the
  packet-containing commit) but now governs three slices, none of which touch the cut check.
- **Minor 1, the fault count is wrong. FIXED.** The pre-cut table review 4 counted (thirteen rows,
  row 13 a positive — twelve negatives and one positive, not thirteen negatives) no longer exists.
  This round's much smaller table is stated accurately on its own terms: four mutation negatives
  (rows 1, 3, 4, 5) and two green confirmations (rows 2, 6), named as such in the paragraph
  immediately under the table.
- **Minor 2, missing post-typecheck baseline rehearsal record. FIXED.** Section 6's opening
  paragraph and slice 1 steps 8-9 state explicitly that `twilight-burokrat:typecheck`/`lint:source`
  run **after** the tree returns to its rehearsed baseline for the slice, not merely once at an
  unspecified point; slice 2 step 10 does the same for its own final state.

**Verification this round.** The corrected slice 1 sequence (README landed, original pin fails,
diff applied, pin green, both negatives rehearsed at the correct six-module/six-boundary baseline)
and the corrected slice 2 sequence (mapping row red, boundary added, filtered and whole-file green,
legacy-pin baseline/red/green) were rehearsed fresh in a throwaway clone of this worktree (real
`node_modules` symlinked in, so `bun test` behaves identically to the tracked tree), not merely
re-asserted from an earlier round: filtered pin green `27`/`28 expect() calls` as stated, whole
`pilot-policy.test.ts` green `294 expect() calls` in `405.49s`, boundary-removal negative
`Expected: 5`/`Received: 6`, saved-plan negative `Expected: true`/`Received: false`, registration
red `Expected: 6`/`Received: 7`, legacy-pin red/green with the exact `39→41`/`257→259`/digest
fragments. The `design.md` and `proposal.md` diffs were applied fresh; `prettier --check` exits 0
on both, `openspec validate --all --json` reports `{"items": 114, "passed": 114, "failed": 0}`
unchanged, and `proposal.md` is exactly `400` words. Every mutation used for this round's rehearsal
was made in that throwaway clone, never in this tracked worktree, and the clone is discarded, not
committed; `git diff bd39d86e --stat` on this worktree shows only this packet document and
`docs/findings/current-document-check-exemptions.json` changed.

## 15. Disposition of review 5

- **Critical 1, slice 1's red could not happen in the executor's uncommitted checkout. FIXED.**
  Section 10.2 is now two parts: Part A adds `libs/wbs/application/core/src/module/plan-history/README.md`
  to `pilotPaths`, applied as slice 1's own new step 1, **before** the README is ever edited; Part B
  is the assertion replacement, unchanged in content. Rehearsed fresh, end to end, with no commit
  between any stage: baseline green (`27 expect() calls`) → `pilotPaths` edit → uncommitted README
  edit → red (`+ "module.application.plan-history",` in the received array; `0 pass`, `1 fail`,
  `21 expect() calls`) → Part B applied → green (`27 expect() calls`). Section 3's fact row and
  slice 1's own prose no longer claim the README must be committed.
- **Important 1, the removal fault named two different boundaries. FIXED.** Section 6 row 3 and
  slice 1 step 7 both now specify removal by `boundaryId === 'boundary.infra.release-assembly'`
  with its real selector `tools/tool-dagger/src/lib`, and say explicitly that `docs/refactoring/w4-4`
  belongs to a different boundary (`boundary.docs.wbs-table-extraction`). Rehearsed fresh against
  the real `policy.json`: `Expected: 5`, `Received: 6`.
- **Important 2, the committed scope contradicted itself on the boundary. FIXED.** Sections 10.7
  through 10.9 (task 7.5, proposal, design) no longer say a pilot boundary is optional; all three
  now say full membership — mapping row and boundary, both required — citing `trust.ts:1224-1230`'s
  own refusal of a mapped module with no exact boundary. Re-verified fresh: `proposal.md` is `397`
  words (was `400`, now one bullet shorter without the optional clause), `prettier --check` and
  `openspec validate --all --json` (`114`/`114`/`0`) both clean on `design.md`, `proposal.md` and
  `tasks.md`.
- **Important 3, post-typecheck baseline rehearsal was still backwards. FIXED.** Both slices now run
  `twilight-burokrat:typecheck` in step 0, **before** collecting their test baselines (so
  `dist/out-tsc` from `apps/wiki/cli/tsconfig.spec.json`'s project reference is already populated),
  and once more, finally, after every edit lands. Section 6's opening paragraph and the "Slices"
  preamble both restate this order explicitly instead of the reversed "after… confirming the
  baseline clean" wording review 5 flagged.
- **Important 4, the remaining test's guarantee was overstated. FIXED.** Every "one DI module = one
  wiki module is enforced" claim (Goal, section 3, "Deferred: label agreement," task 7.5,
  `proposal.md`, `design.md`) is replaced with the narrower guarantee `trust.ts:1244-1257` actually
  gives: mutual consistency of **declared** registrations, not discovery of an unregistered sealed
  module. Section 3 grounds this in an existing observation, not a new claim: slice 1's own green
  row already shows Plan history's README index with no matching mapping row or boundary passing
  the filtered test — the same state as removing both records together on the fully-registered
  tree.
- **Minor 1, the negative-proof count remained contradictory. FIXED.** Section 6 now says "two
  task-transition reds, two injected mutation negatives, two green confirmations" for rows 1-6, and
  no longer carries the "twelve"/"thirteen" wording review 5 found still present.
- **Minor 2, "A new check" still described deleted work. FIXED.** That bullet is rewritten as
  "Modifies the existing pilot-policy test, not `MOD-LAYOUT`," with the "runs today, unconditionally"
  contrast (which described the since-cut identity check) removed.

**Verification this round.** The full corrected slice 1 sequence — `pilotPaths` edit, uncommitted
README edit, red, Part B applied, green, both negatives at the correct baseline — was rehearsed
fresh in a throwaway clone (real `node_modules` symlinked in), with no commit taken at any stage:
baseline `27 expect() calls`; red `0 pass`/`1 fail`/`21 expect() calls`; green `27 expect() calls`;
boundary-removal negative `Expected: 5`/`Received: 6`; saved-plan negative `Expected:
true`/`Received: false`; `twilight-burokrat:typecheck`/`lint:source` both clean throughout. The
corrected `proposal.md`, `design.md` and `tasks.md` diffs were applied fresh and pass Prettier and
OpenSpec validation as stated above. `git diff bd39d86e --stat` on this worktree shows only this
packet document and `docs/findings/current-document-check-exemptions.json` changed.

## 16. Disposition of review 6

- **Important 1, step-0 command blocks lost failure statuses under `set -e`. FIXED.** Slice 1 and
  slice 2's step-0 blocks now wrap every slow command (typecheck, the filtered pin baseline, the
  legacy-pin baseline, the whole `pilot-policy.test.ts` baseline) in `if command >"$log" 2>&1; then
status=0; else status=$?; fi; printf 'exit=%s\n' "$status" >>"$log"; test "$status" -eq 0` with a
  concrete, named log per command, exactly as prescribed. Verified with a read-only probe: the
  pattern durably records `exit=1` in the log even when the command fails, unlike the bare `echo
"exit=$?"` this replaces, which a probe (`bash -c 'set -euo pipefail; false; echo "exit=$?"'`)
  confirmed never runs. The section 7 preamble and both slices' surrounding prose are rewritten to
  describe what is now observable (a silent pass through each `if`, then the tailed log).
- **Important 2, OpenSpec validation had no before-edit baseline. FIXED.** Slice 3 step 0 now runs
  the same strict `jq -s -e` validation block (same durable-status wrapper) and prints
  `.summary.totals` as this slice's baseline. Step 4 keeps the batch's exact verbatim validation
  block, then adds `jq '.summary.totals' "$report"` and a `diff` against step 0's saved totals — a
  moved count, higher or lower, now fails the step even though the existing `passed > 0` predicate
  alone would not have caught it. Both observations are recorded in `verify.md` (step 5). Rehearsed
  fresh: step 0's baseline and step 4's after-edit run both printed `{"items": 114, "passed": 114,
"failed": 0}`, and the `diff` produced no output.
- **Minor 1, stale fixture descriptions contradicted the executable fix. FIXED.** Section 6 row 1
  now reads "Part A applied (README added to `pilotPaths`); README edited but uncommitted; Part B
  not yet applied." Slice 2's step-0 prose keeps "Requires slice 1 committed" as the execution
  checkpoint and drops the obsolete "Plan history's README is not in that list" explanation, which
  is only true before slice 1 lands.
- **Minor 2, stale numeric references. FIXED.** Slice 3 step 2's rehearsal statement now says `397`
  (the actual word count, matching section 10.8's own closing line and review 5's disposition),
  keeping `400` as the acceptance cap. Slice 1's baseline prose now cites step **9** as the final
  typecheck, matching the slice's own numbered steps (step 9 typecheck, step 10 lint).

**Verification this round.** All four rewritten `sh` blocks were extracted and checked with
`bash -n` (all syntactically valid) and the two new/changed blocks — slice 3 step 0's OpenSpec
baseline and step 4's after-edit comparison — were run for real against this repository with a
scratch `TMPDIR`: step 0 printed the gate lines then `{"items": 114, "passed": 114, "failed": 0}`,
exit 0; step 4 printed the same totals via `tee`, the added `jq` line, and a silent `diff`, exit 0.
`git diff bd39d86e --stat` on this worktree shows only this packet document and
`docs/findings/current-document-check-exemptions.json` changed.
