# 010.7 Rules: kind direction, module layout, file size ratchet

Size class L. Token estimates: top-model-high-effort planning 6,000,000; mid-level-mid-effort
implementation 22,000,000; top-model-high-effort review 9,000,000.

Implements slice **B2** of the
[Twilight Bureaucrat rules design](../../specs/2026-09-19-twilight-bureaucrat-rules-design.md),
which is slice 5.1 of the [service-taxonomy change](../../../../openspec/changes/service-taxonomy/tasks.md)
and Task 9 of the [code organization rollout](../2026-09-19-code-organization-rollout.md). The rules
it adds are stated in the
[code organization design](../../specs/2026-09-19-code-organization-design.md) as K2 to K6, F1, F7
and the module layout, and decided in
[ADR 0029](../../../adr/0029-services-have-a-kind-and-one-direction.md).

Batch rules, the execution contract, the standard blocks and the named-test rule:
[execution batch 1 README](../2026-09-19-batch-1/README.md). Packet defects already paid for:
[batch 1 results, "What the executors stopped on"](../2026-09-19-batch-1/RESULTS.md). Settled
assumptions: [batch 1 assumptions](../2026-09-19-batch-1/ASSUMPTIONS.md). Nothing in those documents
is copied here; this packet links them by name, except where it must show an exact command.

Written 2026-09-20 against the batch 1 integration head `6484986e`. Every fact in section 3 was read
or executed in the repository on that date.

## 0. How this packet is executed

**Five parts, strictly in order, never in parallel.** They share one registry, one test file, one
rule policy schema and one verification record.

| Part                                                | Delivers                                                            | Ends when                                         |
| --------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| [A](#part-a--the-adopted-set-makes-ratchet-usable)  | The OpenSpec change; `ratchet` stops being refused; the adopted set | Part A's verification passes and its files listed |
| [B](#part-b--f7-the-file-size-ratchet)              | Rule `F7`: the size ceiling and the pinned-file ratchet             | Part B's verification passes and its files listed |
| [C](#part-c--kind-resolution-and-mod-layout)        | Kind and module resolution; rule `MOD-LAYOUT`                       | Part C's verification passes and its files listed |
| [D](#part-d--the-direction-machinery-k3-and-k4)     | The shared import graph; rules `K3` and `K4`, barrels resolved      | Part D's verification passes and its files listed |
| [E](#part-e--k2-k5-k6-f1-the-readme-and-the-record) | Rules `K2`, `K5`, `K6`, `F1`; the README; the verification record   | Part E's verification passes and its files listed |

**The hand-over boundary is the same for all five.** The executor cannot commit: the clone's Git
directory is read-only (executor preamble rule 1). Each part ends by leaving its changes in the
working tree and reporting the "ready to commit" path list and commit subject printed at the end of
that part. The planner reviews, commits, and only then dispatches the next part, which starts from
that committed predecessor.

### 0.1 Rules that override anything below

These come from the executor preamble and the batch 1 README. Where this packet disagrees with
them, they win.

- Never change the clone's Git state: no `add`, `commit`, branch, `stash` or `restore`. `git status`,
  `diff`, `log`, `grep`, `ls-files`, `show` are fine. **Git inside the temporary fixture
  repositories these tests create under `TMPDIR` is required** and is not the clone's state.
- Restore a mutated tracked file by copying back a pre-mutation copy from `"$task_tmp"` and
  confirming with `cmp`. Never `git checkout` or `git restore`.
- Prefix every Nx command with `NX_DAEMON=false`. dconf warnings are harmless.
- Never set `BUN_INSTALL_CACHE_DIR`. The launcher warmed the OpenSpec command into this attempt's
  `TMPDIR`; repointing the cache makes `bunx` try to download and there is no network.
- Every OpenSpec command carries `OPENSPEC_TELEMETRY=0` and must not download.
- The command guard rejects any command whose text contains `rm -f`, before it runs. Never delete a
  scratch file; leave every report, patch and failing log under `$TMPDIR/evidence`. Run the batch
  README's version of the OpenSpec validation block, which has no removal line.
- Scratch lives only under `TMPDIR`: `task_tmp=$(mktemp -d "${TMPDIR:?}/kind-rules-XXXXXX")`.
- Verification is split. You run the focused tests this packet names, the type check,
  `lint:source`, the build, the format check and OpenSpec validation. The planner runs the whole
  `twilight-bureaucrat:test`, `twilight-bureaucrat:test:package` and `tool-devsync:test` targets,
  because some of their tests write Git objects into the clone. The host gate cannot run here:
  report it as not run.
- Never loosen, skip, delete or rewrite an existing test or check to get a green result. Never add
  `any`, an unchecked cast, a non-null assertion or a lint suppression without the adjacent comment
  naming the boundary that makes it safe.

### 0.2 The focused test command, exactly

**This is the single most important command in the packet.** Running `bun test` on the rules file
without `TOOL_WIKI_TRUSTED_NODE_MODULES` fails two tests that pass under the Nx target. Observed
2026-09-20 on `6484986e`: plain `bun test src/rules/rules.test.ts` gave `17 pass, 2 fail`, both
failures reading `"reason":"trusted TypeScript runtime modules are not configured"`. With the
variable set, the same file gave `19 pass, 0 fail` in 28.24 s.

```sh
(cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
  bun test --preload ../../../tools/test/scratch/preload.ts src/rules/rules.test.ts)
```

Every "run the rules test file" instruction below means exactly this command. To run one named test,
append `-t '<pattern>'`.

### 0.3 Running one named test

Bun's `-t` matches the describe name and the title **joined**. An anchored bare title matches
nothing and the run then reports success on zero tests. Every pattern in this packet is the
**unanchored exact title**; use it exactly as written. Expected while green: `1 pass`, `0 fail`, and
a final line `Ran 1 test across 1 file.` A run whose output says `Ran 0 tests` or `matched 0 tests`
proves nothing: **stop and report**.

### 0.4 Injecting a fault, saving it, and what counts as a stop

For every proof, in this order:

1. `cp <file> "$task_tmp/"` — the passing bytes.
2. Edit the file to inject exactly the named fault.
3. Save the mutation as a patch, accepting exactly status 1:

   ```sh
   if diff -u "$task_tmp/<basename>" "<file>" >"$TMPDIR/evidence/P<n>.patch"; then
     echo "nothing was injected" >&2; exit 1
   else test $? -eq 1; fi
   ```

4. Run the named test with its `-t` pattern, capturing **its own** exit status. Never read a test's
   status through `tee`, and never through a pipeline, whose status is the last stage's. Use
   exactly this block:

   ```sh
   set +e
   ( cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
     bun test --preload ../../../tools/test/scratch/preload.ts src/rules/rules.test.ts \
     -t '<pattern>' ) >"$TMPDIR/evidence/P<n>.log" 2>&1
   mutated_status=$?
   set -e
   cp "$task_tmp/<basename>" "<file>"
   cmp "$task_tmp/<basename>" "<file>"
   test "$mutated_status" -ne 0
   grep -F '<the failing sentence this packet predicts>' "$TMPDIR/evidence/P<n>.log"
   ```

   The restore and the `cmp` come **before** both assertions, so a surprising status never leaves a
   mutated file behind. `grep -F` failing is a stop: the fault produced a different failure than the
   packet predicted.

   **Part C is the exception to the `grep -F` line.** Its proof table's last column describes an
   assertion mismatch, not a literal log sentence, so part C replaces that command with
   `cat "$TMPDIR/evidence/P<n>.log"` and reads it. See C.4, which states the rule and what still
   counts as a stop.

5. Record the decisive failing line.
6. Copy the saved bytes back, `cmp` them, rerun the named test green.
7. Only then write the adjacent `Proof:` comment, dated, describing what you actually saw.

**A fault that also fails other tests is not a stop.** Record which ones. It is a stop only when the
named test **passes** under the fault, fails with a **different** message than this packet predicts,
or the mutation **does not compile**.

### 0.5 Two standing facts about this package

- **A new source file changes the validator identity.** The trust code walks `cli.ts`'s import
  closure, so every file this packet creates under `apps/wiki/cli/src` joins it. Checked on
  2026-09-20: **no test in `apps/wiki/cli` pins that identity as a literal.** `pilot-policy.test.ts`,
  `trusted-policy.test.ts` and `gate-entrypoints.test.ts` recompute it by calling
  `resolveValidatorArtifactPaths` themselves, so they follow the new closure. Expect no test failure
  from the added files. Only an activation provisioned **outside** this clone would have to be
  prepared again; that is the planner's question, not yours.
- **Relationship extraction is a whole-program typecheck.** `extractRelationships` materializes the
  whole candidate into a temporary directory, builds a `ts.Program` per named tsconfig, runs
  `ts.getPreEmitDiagnostics` and **throws if there is any diagnostic**, and emits declarations. It
  is seconds per call, and it refuses a candidate that does not typecheck. Parts D and E therefore
  compute it **once per check** and share it. Never call it per rule.

### 0.5a Every newly registered rule is owed a mode in the packaged-build test

Seen in part B, by the planner's whole-suite run on 2026-09-20: registering `F7` failed `buildPackage > builds the canonical executable for use outside the repository` on `rule policy states no mode for F7`, because a rule policy owes every registered rule a mode and `apps/wiki/cli/src/packaging/build.test.ts` writes its own policy (`ruleModes`, in identifier order, beside a comment that says so). The sandbox cannot build the package, so the executor never sees this failure. **Every part that registers a rule (C, D and E) therefore adds each new identifier to that list as `{ ruleId: '<ID>', mode: 'observe' }`, keeps the list sorted by identifier, and names `apps/wiki/cli/src/packaging/build.test.ts` among its changed paths.** It adds no test and moves no count. Do not run that test: report it as pending planner verification.

### 0.6 Timeouts

Batch 1's h2puni gate timed out a test that ran the production CLI five times at Bun's 5-second
default. The brief's rule counts **processes**, not CLI launches, and `initRepository` plus `commit`
already spawn Git six times before any CLI runs. **So every test this packet adds that builds a Git
fixture or spawns the CLI carries an explicit timeout as its third `test` argument**, in the form
already used twice in `rules.test.ts`. No new test in any part is left at Bun's default.

Use `15_000` in parts A, B and C, whose tests spawn Git and the CLI but never extract relationships,
and `30_000` in parts D and E, which pay for a whole-program typecheck per CLI run. Part C's four
in-process kind-resolution tests spawn nothing and need no timeout; they are the only tests in this
packet that do not. A test that exceeds its timeout is a
finding to report with the measured time, not a licence to raise it past `60_000`.

## 1. Goal and non-goals

**Goal.** Give Twilight Bureaucrat the slice B2 rules: `ratchet` mode with a consumer-supplied
adopted set, `F7` the file size ratchet, `MOD-LAYOUT` the module layout, and the kind direction
rules `K2` to `K6` plus `F1`, judged from the file-level import graph the package already extracts,
through barrels and path aliases.

**What this item must do about ratchet mode, decided from the design.** The rule policy loader
refuses `ratchet` today with `rule policy sets <id> to ratchet, which has no adopted set until slice
B2` (`apps/wiki/cli/src/rules/rule-policy.ts:80-84`). Three documents say this packet is the one
that lifts it: the design's open item "**Ratchet mode needs an adopted set, which B0 does not have.
B0's policy loader refuses `ratchet` by name and points at slice B2**"; the delta requirement
"Ratchet mode protects touched and adopted code", whose last sentence is "Twilight Bureaucrat slice
B0 has no adopted set and SHALL refuse the `ratchet` mode by name **until slice B2**"
(`openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md:319-321`); and task 5.1, "**supply
the adopted set that ratchet mode needs**". So **part A replaces that refusal**: `ratchet` is
accepted when, and only when, the policy states an adopted set, and is refused by name when it does
not. Nothing is defaulted; an absent adopted set under a ratcheting rule is unknown state and
throws, as AGENTS.md R5 requires.

**Non-goals.**

- **K7** (the feature-service owns the transaction) has no static check by its own delta
  requirement, which names review as its check. Not implemented.
- **K8** (each table has one resource owner) is not implemented. Verified 2026-09-20: migration and
  Drizzle table facts are **declaration-driven only** — `extractRelationships` returns
  `declarations.facts` for facts a declaration document names, and nothing scans the tree for
  tables; and there is no resource **module** to own a table, because all nine backend resources are
  classified in place with no module directory. The two inputs K8 needs do not exist. Recorded as
  assumption A6.
- **K9** and the scenario join need an OpenSpec requirement selector, which the package does not
  have. Not implemented.
- No file is moved, no service is extracted, no kind suffix is added to any file, no ESLint fence is
  added (that is rollout Task 3, a devsync lane), no `docs/code-organization/size-ceilings.json` is
  created (rollout Task 4, same lane), and no rule policy document for this repository is created
  (assumption A4).
- No new command, no change to `cli.ts` or `bin.ts`, no certification, no template.

## 2. Read first

| File                                                                    | Why                                                                                     |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                             | Rules R1 to R5. R5 governs every new check here.                                        |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                   | The execution contract, the standard blocks, the OpenSpec validation block.             |
| `docs/superpowers/plans/2026-09-19-batch-1/RESULTS.md`                  | "What the executors stopped on": the defects you must not repeat.                       |
| `docs/superpowers/specs/2026-09-19-code-organization-design.md`         | The import matrix, K1 to K9, F1 to F8, the module layout block.                         |
| `docs/superpowers/specs/2026-09-19-twilight-bureaucrat-rules-design.md` | The rule model and slice B2's scope.                                                    |
| `openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md`      | The requirements this packet implements, with the scenario identifiers it must satisfy. |
| `apps/wiki/cli/src/rules/rule.ts`                                       | The rule model you extend: `RuleContext`, `toFinding`, `RuleOutcome`.                   |
| `apps/wiki/cli/src/rules/rule-policy.ts`                                | The policy schema and the ratchet refusal you replace.                                  |
| `apps/wiki/cli/src/rules/registry.ts`                                   | The four registered rules and the sorted registry.                                      |
| `apps/wiki/cli/src/rules/check.ts`                                      | `checkCandidate`, where the shared context is built.                                    |
| `apps/wiki/cli/src/rules/rules.test.ts`                                 | The fixture style, and the **three exact-list assertions** of section 3, fact 6.        |
| `apps/wiki/cli/src/inventory/read-candidate.ts`                         | `CandidateEntry` (`path`, `mode`, `blob`) and `CandidateSnapshot`.                      |
| `apps/wiki/cli/src/inventory/read-blob.ts`                              | `readCandidateBlob(repository, blob, path): Uint8Array`, how part B measures a file.    |
| `apps/wiki/cli/src/relationships/typescript.ts`                         | `TypeScriptImportSelector` and `ImportKind`; lines 247-353 for how a target is spelled. |
| `apps/wiki/cli/src/relationships/index.ts`                              | `extractRelationships` and its trusted-modules requirement (lines 79-98).               |
| `apps/wiki/cli/src/contracts/records.ts`                                | `RelativePath`, `OpaqueId`, `SchemaVersion`, and the arktype narrow style.              |
| `apps/wbs/fe-01/src/modules/`                                           | The four real modules this packet's rules will judge.                                   |
| `openspec/config.yaml`                                                  | The `sdd-lean` schema and its per-artifact rules.                                       |

## 3. Verified facts

Read or executed in `/home/df/wd/puni/batch-2-planning` on 2026-09-20 at `6484986e`.

1. Nx project `twilight-bureaucrat`, root `apps/wiki/cli`, targets exactly `test`, `lint`,
   `lint:source`, `lint:fast`, `release`, `build`, `pack`, `test:package`, `typecheck`
   (`apps/wiki/cli/project.json`).
2. The `test` target's command is
   `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --path-ignore-patterns '**/packaging/install.test.ts' --path-ignore-patterns '**/packaging/consumer-bootstrap.test.ts' --preload ../../../tools/test/scratch/preload.ts`, with `cwd` `apps/wiki/cli`. Section 0.2's command is that command narrowed to one file.
3. **`src/rules/rules.test.ts` is 19 tests, 19 pass, 0 fail, 180 expect calls, 28.24 s** under
   section 0.2's command. Without the environment variable it is 17 pass, 2 fail. Both numbers were
   observed.
4. `apps/wiki/cli/src/rules/` holds exactly `check.ts` (178 lines), `registry.ts` (119),
   `rule-policy.ts` (117), `rule.ts` (124) and `rules.test.ts` (711). There is no README there; the
   project README's index declares `{"kind":"directory-prefix","prefix":"src","exclusions":[]}`
   (`apps/wiki/cli/README.md:3`), **so a new file under `src` needs no index edit.**
5. `check` and `explain` already dispatch in both dispatchers. `cli.ts:400-409` routes
   `explain` at argv length 2 or 4 and `check` at length 5 or 7; `bin.ts:8-28` lists both in
   `validatorCommands` and `bin.ts:34-35` documents them in `help`. **A rule added to the registry
   needs no dispatcher change at all**, because `check --rule <id>` and `explain <id>` already reach
   every registered rule. This packet therefore owns **zero lines** of `cli.ts` and `bin.ts`.
6. `rules.test.ts` has **exactly four places that name every registered rule**, and each must be
   updated in the part that registers a rule. `loadRulePolicy` demands a mode for every registered
   rule even under `--rule`, so a missed site turns an existing test red:
   - line 48, the `explain NO-SUCH-RULE` refusal text, today
     `unknown rule: NO-SUCH-RULE (registered: INV-CLASSIFY, MOD-DIRECT-ENTRIES, MOD-INDEX, REL-EXTRACT)`;
   - lines 169-174, `const everyRuleObserving: RuleModeEntry[]`, four entries;
   - lines 699-704, `expect(verdict.ruleIds).toEqual([...])` in
     `allows the canonical candidate under every registered rule`.
   - lines 384-389, the **literal four-entry array** inside
     `allows the indexed candidate under an enforced module rule and never certifies`, which keeps
     `MOD-DIRECT-ENTRIES` and `MOD-INDEX` at `enforce`.
     `writeCompleteRulePolicy` (lines 188-206) is the fifth place to touch, because it is the only
     helper that supplies optional policy inputs.

   **Every part that registers a rule is authorized to edit all five sites**, including the literal
   array at 384-389, which it replaces with
   `everyRuleObserving.map((entry) => (entry.ruleId === 'MOD-DIRECT-ENTRIES' || entry.ruleId === 'MOD-INDEX' ? { ...entry, mode: 'enforce' as const } : entry))`.
   **That test's assertions do not change.** Line numbers drift as the file grows; locate each site
   by its surrounding text, never by the number.

7. `registeredRules()` sorts by identifier with `left.id < right.id` (`registry.ts:106-108`). After
   part E the sorted list is exactly
   `F1, F7, INV-CLASSIFY, K2, K3, K4, K5, K6, MOD-DIRECT-ENTRIES, MOD-INDEX, MOD-LAYOUT, REL-EXTRACT`.
8. `RulePolicyRecord` (`rule-policy.ts:20-26`) is `.onUndeclaredKey('reject')` with
   `schemaVersion`, `policyId`, `ruleModes`, `classificationPolicy?`, `relationshipRequest?`. A new
   optional field must be added there **and** to `assertPolicyInputs` (`rule-policy.ts:102-117`),
   whose `absent` expression enumerates the policy inputs by name.
9. `loadRulePolicy` refuses `ratchet` at `rule-policy.ts:78-84`, and `rules.test.ts:294-314` is the
   test that observes it, titled `refuses ratchet until the adopted set exists`.
10. `toFinding(ruleId, mode, observation)` (`rule.ts:113-124`) is the single place mode becomes an
    effect: `mode === 'observe' ? 'debt' : 'refusal'`.
11. `RuleContext` (`rule.ts:73-81`) is `{ repository, candidate, classificationPolicy?,
relationshipRequest?, indexes }`, and `indexes: RuleOutcome<IndexReport>` is the existing
    example of a prerequisite computed **once per check** in `checkCandidate`
    (`check.ts:104-114`) and shared by two rules.
12. `CandidateEntry` is `{ path: string; mode: '100644'|'100755'|'120000'|'160000'; blob: string }`
    (`read-candidate.ts:25-29`). `readCandidateBlob(repository, blob, path)` returns the bytes and
    throws naming the blob and path (`read-blob.ts:5-19`). **No working-tree read is needed to
    measure a file's size.**
13. `extractRelationships(repository, candidate, request)` returns an object whose
    `typescript.imports` is `TypeScriptImportSelector[]` =
    `{ source, specifier, target, importKind, extractor, identity }` (`typescript.ts:28-35`).
    `source` and `target` are **candidate-relative POSIX paths**, except that an external module
    resolves to the synthetic string `external:<package>` — `external:react`,
    `external:@tanstack/react-query` — built by `externalTarget` (`typescript.ts:247-252`), which
    keeps two segments for a scoped package.
14. `ImportKind` is exactly
    `'dynamic' | 'import-equals' | 're-export' | 'reference-lib' | 'reference-path' | 'reference-types' | 'type' | 'type-re-export' | 'value'`
    (`typescript.ts:17-26`). **Barrels are not flattened**: importing a barrel yields one edge whose
    `target` is the barrel file, and the barrel's own re-exports are separate edges with
    `importKind` `re-export` or `type-re-export`. Following those transitively is how scenario
    `SERVICE-TAXONOMY-009` ("a barrel hides a forbidden repository") is satisfied, and part D does
    exactly that.
15. Path aliases are resolved: `resolveDependency` calls `ts.resolveModuleName` with the parsed
    tsconfig options (`typescript.ts:339-344`), so `paths` and `baseUrl` apply. An unresolved
    non-builtin import **throws** (`typescript.ts:347-350`).
16. `extractRelationships` requires `TOOL_WIKI_TRUSTED_NODE_MODULES` to name a directory outside the
    candidate that contains `typescript/package.json`, and throws
    `trusted TypeScript runtime modules are not configured` otherwise
    (`relationships/index.ts:79-98`). This is why section 0.2 exists.
17. `RelationshipRequest` (`contracts/records.ts:214-254`) requires
    `typescript.configPaths` (≥1, unique) and `typescript.publicEntrypoints` (≥1, unique), with
    optional unique `declarationPaths`. There is no file allowlist, so the graph's scope is whatever
    the named tsconfigs include.
18. Six files in the repository already carry a kind suffix, all under
    `apps/wbs/fe-01/src/modules/`: `directory-management/directory-management.feature.ts`,
    `directory/directory.resource.ts`, `plan-writer/plan-writer.feature.ts`,
    `preferences/browser-storage.repository.ts`, `preferences/preferences.feature.ts`,
    `preferences/preferences.resource.ts`. No `.tsx` carries one, and no backend file carries one.
19. Those four module directories are the only real modules. Their contents on 2026-09-20:
    `directory/` has `README.md`, `contract.ts`, `directory.resource.ts`, `directory.resource.test.ts`,
    `fake-directory-api.ts`; `directory-management/` has `README.md`, `contract.ts`,
    `composition.ts`, the feature and its test, and `view/use-directory-management.ts`;
    `plan-writer/` has `README.md`, `contract.ts`, the feature and its test; `preferences/` has
    `README.md`, `contract.ts`, `composition.ts`, `composition.test.ts`, `preference-keys.ts`,
    `fake-browser-storage.ts` and three kinded files with their tests. **Every one has `README.md`
    and `contract.ts`; none has `module.ts`, `check.ts` or `tsconfig.json`.** Part C's rule is
    written to the two files that exist, not to the whole layout block; see assumption A5.
20. Their contract files carry type declarations only — `preferences/contract.ts` exports the
    `Claim<T>` union beside its interfaces, so "interfaces only" would overstate it. The kinded files import `./contract`,
    `@/lib/wbs-api`, `@/components/wbs/plan-refusal`, `@/lib/local-write`, `@/lib/plan-refresh` and
    `@/modules/directory/contract`. **None of those targets carries a kind suffix**, so the real tree
    yields no K2 to K6 finding today. Recorded as unknown U2, not asserted as a test.
21. `docs/code-organization/` holds exactly `kinds.json` and `README.md`. `kinds.json` is
    `{ reviewed: "2026-09-20", entries: [...95] }`: 11 feature, 9 resource, 3 repository, 72 support,
    0 delivery. **`size-ceilings.json`, `size-ceilings.test.ts` and `kind-direction.test.ts` do not
    exist**, and `apps/wbs/eslint.product.mjs` has no suffix-shaped `files` glob and no F1 or K
    fence: rollout Tasks 3 and 4 have not been done.
22. The largest non-test `.ts`/`.tsx` under `apps` and `libs`, by `wc -l`:
    `apps/wbs/fe-01/src/components/wbs/gantt-panel.tsx` 6,422;
    `libs/wbs/application/core/src/service/work-item.service.ts` 4,594;
    `apps/wbs/fe-01/src/components/wbs/plan-cards.tsx` 2,912;
    `apps/wbs/fe-01/src/components/wbs/gantt-geometry.ts` 2,866;
    `libs/wbs/domain/domain/src/schedule.ts` 2,853;
    `apps/wbs/fe-01/src/components/wbs/wbs-table.tsx` 2,770;
    `apps/wbs/fe-01/src/lib/wbs-api.ts` 2,744;
    `libs/wbs/adapters/store-sqlite/src/schema.ts` 2,498;
    `apps/wiki/cli/src/policy/trust.ts` 1,762. These are the files a real ceiling would pin; this
    packet pins none of them (assumption A4).
23. **Executed 2026-09-20, not read.** A throwaway Git fixture with `nx.json`, `package.json`, a
    `strict` `tsconfig.json`, `src/entry.ts` re-exporting `./m/m.resource`, and
    `src/m/m.resource.ts` containing `import type { ReactNode } from 'react';` was passed to the
    production command
    `bun run src/cli.ts extract-relationships committed <repo> <rev> <request>` with
    `TOOL_WIKI_TRUSTED_NODE_MODULES=<repo_root>/node_modules`. `typescript.imports` came back as
    exactly two edges:
    `src/entry.ts | ./m/m.resource | src/m/m.resource.ts | re-export` and
    `src/m/m.resource.ts | react | external:react | type`. This proves three things parts D and E
    depend on: a fixture candidate reaches `external:react`, because the trusted modules directory
    the tests pass is the repository's own `node_modules`, which holds `react`, `react-dom` and
    `@types/react`; a re-export is reported with `importKind: 're-export'` and the re-exported file
    as its target; and a type-only import is reported with `importKind: 'type'`.
24. `@tanstack/react-query` is **not** in the repository's `node_modules` (checked 2026-09-20).
    That does **not** put the scoped half of `F1` beyond a fixture, because
    `TOOL_WIKI_TRUSTED_NODE_MODULES` is an ordinary directory the caller chooses
    (`relationships/index.ts:79-98`). **Executed 2026-09-20:** a directory under the scratch root
    holding a symlink to the repository's `typescript` plus
    `@tanstack/react-query/{package.json,index.d.ts}` made the production CLI report
    `resource imports external:@tanstack/react-query through '@tanstack/react-query'`. Every proof
    in this packet is therefore a production-path proof; none is an in-process observation test.
25. There is **no rule policy document in the repository**: `git grep -l ruleModes -- '*.json'`
    returns nothing. Every rule policy today is written by a test into its own scratch directory.
26. `RelativePath` (`contracts/records.ts:5-20`) forbids a leading slash, a trailing slash, dot
    segments, glob characters, doubled slashes and NUL. A directory prefix is therefore written
    without a trailing slash, and prefix matching must be
    `path === prefix || path.startsWith(`${prefix}/`)`.
27. `PositiveInteger` exists at `contracts/records.ts:36` but is **not exported**. Use
    `type('number.integer>=1')` inline.
28. `checkIndexes` returns `{ schemaVersion, selection, identity, indexes, reviewDebt }`, and each
    entry of `indexes` carries `indexPath`, `moduleId`, `identity`, `members`, `externalConsumers`
    and `applicableChecks` (`indexes/check-indexes.ts:409-452`). `readIndexes` **skips a `README.md`
    that carries no `module-index` comment, and skips one whose mode is `120000`**
    (`indexes/read-indexes.ts:141-147`). So a check on the filename `README.md` is **not** a check
    that a module has an index: an ordinary README passes it. Critical finding 6 is correct and
    §6.4 is rewritten accordingly.
29. `noUnusedLocals` is set nowhere in `tsconfig.base.json` or the project's tsconfigs (checked
    2026-09-20). An unused import therefore produces **no** diagnostic, and the earlier claim that
    it would make extraction throw was wrong.
30. **Probes executed 2026-09-20.** The first four ran against a scratch copy of §6.4 and §6.5
    outside the repository; each is the reason a proof changed. The rest ran the **production CLI**
    over real Git fixtures, after §6's code was written into the worktree, type-checked, linted and
    then restored byte for byte (`cmp` clean, `git status` showing no rule file changed).
    - `m/a.feature.test.ts` with `KindSuffix` minus its `$` still yields **one** kinded file, not
      two: the filename holds no `.feature.ts` substring. `/\.(feature|repository|resource)\./`
      yields **two**. C1's mutation is the loose form.
    - A composition root is recorded in `compositionRoots` and **never enters `files`**, so
      `kinded.get(source)` returns `undefined` and the `exempt.has(...)` guard is unreachable:
      deleting it changed `[]` to `[]`. Recording the composition root as a feature instead yields
      one K3 finding. The exemption **is** the absence from `files`, and that is what D3 proves.
    - With `forbidden: ['repository']`, a feature importing `m/view/panel.tsx` yields `[]`. With
      `['repository', 'delivery']` it yields one observation. K3 must forbid delivery.
    - `m/store.ts` and `m/geometry.ts` beside a kinded file receive **no** kind, so nothing in
      §6.5 could ever see them reach React. F1 needs the declared-paths input of §6.2.
    - `nx run twilight-bureaucrat:typecheck` exited 0 with §6's code in place; `lint:source`
      refused `if (source === undefined || source.kind !== direction.from)` with
      `@typescript-eslint/prefer-optional-chain`, so §6.5 uses `source?.kind !== direction.from`.
      A code block this packet prescribes that does not lint is a defect, and this one was found by
      running it.
    - The production CLI produced, over real fixtures, exactly these messages, which the tests below
      assert verbatim: `feature imports repository src/m/m.repository.ts through './barrel'`;
      `feature imports delivery src/m/view/panel.ts through './view/panel'`;
      `feature in src/b imports feature in src/m`;
      `declared plain TypeScript imports external:react through 'react'`;
      `resource imports external:@tanstack/react-query through '@tanstack/react-query'`;
      and, both with `path` equal to the module directory `src/m`,
      `module directory declares no wiki index` and `module directory declares no contract file`.
31. The launcher `/home/df/wd/puni/puni-plan/exec/run-executor.sh` accepts `--batch batch-2`
    (line 13), which selects the clone root `/home/df/wd/puni/batch-2`, the branch prefix `batch-2/`,
    the temporary root `/tmp/puni-batch2` and the packet directory
    `docs/superpowers/plans/2026-09-20-batch-2` (lines 21-26, 30, 40, 46). The hard-coded batch-1
    path this packet once reported is gone, and no launcher change is a prerequisite. See §12.
32. Strict OpenSpec validation on `6484986e` passed 99 of 99 (batch 1 RESULTS.md). Counts in this
    packet are relative: each part records `P` in its step 0 and requires `P + 1` in part A, where
    the change is created, and `P` unchanged in parts B to E, which create none. Main has moved
    since this packet was written, so the literal 99 is history, not a target.

## 4. Unknowns

Not verified; never state any of these as fact.

- **U1.** Whether two proposed OpenSpec changes may both add requirements to the capability
  `bureaucrat-rules`. Part A finds out by running the validation block; if it refuses, **part A stop
  condition 3** applies.
- **U2.** Whether the rules produce zero findings over this repository itself. Nobody ran them over
  it, and doing so needs a rule policy, a `RelationshipRequest` naming this repository's tsconfigs
  and a candidate that typechecks whole. Fact 20 is a reading of the imports, not a run.
- **U3.** The cost of `extractRelationships` on a fixture inside the sandbox. The existing
  `REL-EXTRACT` test takes about 1.7 s; parts D and E add fixtures of the same size, and their tests
  spawn the CLI more than twice, so every such test carries an explicit timeout (section 0.6 rule
  below).
- **U4.** Whether a provisioned activation exists anywhere that must be prepared again. Fact in
  section 0.5 covers the clone only.

## 5. File plan

| File                                               | Part       | Create or modify | Responsibility                                                        |
| -------------------------------------------------- | ---------- | ---------------- | --------------------------------------------------------------------- |
| `openspec/changes/twilight-bureaucrat-kind-rules/` | A (+B-E)   | create           | The slice B2 change: proposal, delta spec, tasks, verification record |
| `apps/wiki/cli/src/rules/rule.ts`                  | A, C, D    | modify           | The adopted set, the effect function, the widened `RuleContext`       |
| `apps/wiki/cli/src/rules/rule-policy.ts`           | A, B       | modify           | `adoptedSet`, `sizeCeilings`, the replaced ratchet refusal            |
| `apps/wiki/cli/src/rules/check.ts`                 | A, B, C, D | modify           | Passes the adopted set and builds the shared context                  |
| `apps/wiki/cli/src/rules/size-ratchet.ts`          | B          | create           | Measures candidate files and produces `F7`'s observations             |
| `apps/wiki/cli/src/rules/kinds.ts`                 | C          | create           | Kind and module resolution from paths alone                           |
| `apps/wiki/cli/src/rules/direction.ts`             | D          | create           | The import graph walk and the direction observations                  |
| `apps/wiki/cli/src/rules/registry.ts`              | B, C, D, E | modify           | One registry entry per new rule                                       |
| `apps/wiki/cli/src/rules/rules.test.ts`            | A-E        | modify           | Every test and every exact-list update                                |
| `apps/wiki/cli/README.md`                          | E          | modify           | The "## Rules" section only                                           |

One more file is touched, by part A only:
`openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md`, whose "Ratchet mode protects
touched and adopted code" requirement is amended so it no longer contradicts what this packet
delivers. See §9 and assumption A3. That change is **proposed, not accepted**: it is not in
`openspec/specs/`, so nothing archived is being rewritten.

Nothing else is touched. No file outside `apps/wiki/cli/src/rules`, `apps/wiki/cli/README.md`, the
new OpenSpec change directory and that one delta spec changes. **This packet creates no README and
no Nx target**, so neither the README coverage pin in
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` — which packet 110.6 lands first and may
turn from a literal into a derived value — nor the incoming `CLAUDECODE=0`/`AGENT=0` target defaults
have anything to bind here. Do not edit either; if a part ever seems to need to, stop and report.

### 5.1 Ownership against the other batch 2 packets

| Neighbour                                 | Shared surface                                         | Settlement                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **010.6 templates and `template verify`** | `apps/wiki/cli/src/cli.ts`, `apps/wiki/cli/src/bin.ts` | **010.6 owns both dispatchers entirely.** This packet changes neither file, in any part (fact 5). 010.6 adds its `template` routes to `cli.ts`'s `runCli` chain and its command words to `bin.ts`'s `validatorCommands` and `help`. |
| 010.6                                     | `apps/wiki/cli/src/rules/registry.ts`                  | **010.7 owns it.** If 010.6 registers a conformance rule it appends to the `rules` array and lands **after** this packet, updating the three exact-list assertions of fact 6 in the same slice.                                     |
| 010.6                                     | `apps/wiki/cli/src/rules/rules.test.ts`                | **010.7 owns it.** 010.6 puts its tests in a new file of its own, for example `src/templates/templates.test.ts`.                                                                                                                    |
| 010.6                                     | `apps/wiki/cli/README.md`                              | **010.7 owns the `## Rules` section, lines 22-31 today.** 010.6 adds a new `## Templates` section and edits nothing above it.                                                                                                       |
| 010.6                                     | `apps/wiki/cli/src/rules/rule-policy.ts`               | **010.7 owns it.** A template version pin is a new optional field; 010.6 adds it after this packet lands, or puts it in a policy file of its own.                                                                                   |
| 010.6, both                               | The validator identity                                 | Both packets add source files under `apps/wiki/cli/src`, so both move it. Neither breaks a test (section 0.5). Either order is safe.                                                                                                |
| 110.1 test axes                           | `openspec/changes/test-axes/`                          | Disjoint. This packet never edits that change, and never adds an Nx target.                                                                                                                                                         |
| 110.6 retire upstream sync                | `tools/tool-devsync/`                                  | Disjoint. This packet never edits the devsync tool, its tests or `docs/code-organization/`.                                                                                                                                         |
| 020.2, 020.7, 040.1, 040.4                | —                                                      | Disjoint trees.                                                                                                                                                                                                                     |

**Either order.** Because 010.7 touches no dispatcher and 010.6 touches no rule file, the two
packets can land in either order with no rebase.

## 6. Interfaces

Exact code. **Every block below was written into `apps/wiki/cli/src/rules` on 2026-09-20, type-checked
with `nx run twilight-bureaucrat:typecheck` (exit 0), linted with `lint:source` (exit 0 after the one
fix noted in fact 30), exercised through the production CLI over real Git fixtures, and then
restored byte for byte, proven with `cmp` and `git status`.** Use it verbatim; a changed shape breaks
a later part.

### 6.0 What ratchet mode is in this packet, and what it is not

`ratchet` refuses a finding **inside the consumer's adopted set** and reports every other finding as
debt. It does **not** look at which files the candidate touched, and this packet adds no comparison
base.

That is a deliberate reversal of this packet's previous revision, which read touched paths with
`git diff` against the live index and worktree. The rules design's first principle is "**A pure
judge.** A verdict is a function of the candidate, the trusted policy and the evidence. No network,
no credentials, no clock. Anyone can rerun it and get the same answer." A live `git diff` is none of
those: `readCandidate` freezes a staged candidate as `selection.indexTree` and a working candidate as
captured blobs, and a diff taken afterwards can call a captured violation "untouched" because
someone restored the index in between. A verdict that changes while the candidate does not is the one
thing the design forbids.

Doing it correctly needs a **comparison base supplied as an explicit input, resolved to a tree object
identity before judging, recorded in the verdict, and refused when it cannot be resolved**. That is a
change to the verdict record, which the design assigns to slice **B6**, "the shared contracts library
and the candidate record for Twilight Dash" — not to B2, whose row names "kind direction, table
ownership, the size ratchet, module layout" and whose open item names only "an adopted set, which B0
does not have".

So touched-code ratcheting is **cut from this packet** and named as a follow-up, and part A amends
the owning requirement rather than leaving two contracts standing (§9, assumption A3).

### 6.1 The adopted set — part A

First replace the now-false declaration JSDoc at the top of `rule.ts`:

```ts
/**
 * Policy disposition for one rule. `observe` reports every finding as debt, `enforce` refuses every
 * finding, and `ratchet` refuses a finding inside the consumer's adopted set and reports the rest as
 * debt. `ratchet` needs an adopted set; a policy that ratchets without one is refused.
 */
export type RuleMode = 'observe' | 'ratchet' | 'enforce';
```

Change `Finding.effect`'s JSDoc to match what `effectOf` now does:

```ts
  /** `debt` in observe mode, and in ratchet mode outside the adopted set; `refusal` otherwise. */
  readonly effect: 'debt' | 'refusal';
```

Then add, after `RuleContext`:

```ts
/**
 * The modules and paths a consumer has adopted. Ratchet mode refuses a finding inside this set and
 * reports one outside it as debt, so a repository can adopt the taxonomy module by module without
 * the untouched remainder failing every candidate.
 *
 * Prefixes are candidate-relative and carry no trailing slash, because `RelativePath` forbids one.
 * An empty list adopts nothing, which makes every ratcheted finding debt; that is a legitimate
 * starting policy and is not defaulted anywhere. An observation whose path is `.` — the candidate as
 * a whole, which `REL-EXTRACT` produces — is never adopted, because it names no module to adopt.
 */
export interface AdoptedSet {
  readonly adoptedPrefixes: readonly string[];
}

/** True when a candidate-relative path is at or under one adopted prefix. */
export function isAdopted(adoptedSet: AdoptedSet | undefined, path: string): boolean {
  if (adoptedSet === undefined) return false;
  return adoptedSet.adoptedPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
```

and replace `toFinding` entirely:

```ts
function effectOf(
  mode: RuleMode,
  observation: RuleObservation,
  adoptedSet: AdoptedSet | undefined,
): 'debt' | 'refusal' {
  // Proof: on 2026-09-20, always returning debt made an enforced direct-entry finding exit 0;
  // the adapter test expected exit 1 and received 0.
  if (mode === 'observe') return 'debt';
  if (mode === 'enforce') return 'refusal';
  return isAdopted(adoptedSet, observation.path) ? 'refusal' : 'debt';
}

/** Policy, not code, decides whether an observation refuses the candidate. */
export function toFinding(
  ruleId: string,
  mode: RuleMode,
  observation: RuleObservation,
  adoptedSet: AdoptedSet | undefined,
): Finding {
  return {
    ruleId,
    path: observation.path,
    ...(observation.subject === undefined ? {} : { subject: observation.subject }),
    message: observation.message,
    effect: effectOf(mode, observation, adoptedSet),
  };
}
```

The fourth parameter is **required, not optional**: an omitted argument would silently mean "nothing
adopted", which is the defaulting R5 forbids. `check.ts` has exactly one call site, in the
observation loop of `checkCandidate`; it becomes

```ts
findings.push(toFinding(rule.id, mode, observation, policy.adoptedSet));
```

The two existing `Proof:` comments move with the code they describe; never delete a proof comment.

### 6.2 The policy additions — parts A, B and E

In `rule-policy.ts`, add `RelativePath` to the existing import from `../contracts/records`, and put
these above `RulePolicyRecord`. `AdoptedSetRecord` lands in part A, `SizeCeilingsRecord` in part B,
`PlainSelectorRecord` in part E.

```ts
const AdoptedSetRecord = type({
  adoptedPrefixes: RelativePath.array(),
})
  .onUndeclaredKey('reject')
  .narrow((adopted, context) =>
    new Set(adopted.adoptedPrefixes).size === adopted.adoptedPrefixes.length
      ? true
      : context.mustBe('unique adopted prefixes'),
  );

const SizeCeilingsRecord = type({
  ceiling: type('number.integer>=1'),
  roots: RelativePath.array(),
  pinned: type({ path: RelativePath, maximum: type('number.integer>=1') })
    .onUndeclaredKey('reject')
    .array(),
})
  .onUndeclaredKey('reject')
  .narrow((ceilings, context) => {
    if (ceilings.roots.length === 0) return context.mustBe('at least one measured root');
    if (new Set(ceilings.roots).size !== ceilings.roots.length) {
      return context.mustBe('unique measured roots');
    }
    const pinnedPaths = ceilings.pinned.map((pin) => pin.path);
    return new Set(pinnedPaths).size === pinnedPaths.length
      ? true
      : context.mustBe('unique pinned paths');
  });

const PlainSelectorRecord = type({
  kind: "'path'|'prefix'",
  value: RelativePath,
}).onUndeclaredKey('reject');
```

`RulePolicyRecord` keeps its `Proof:` comment and `.onUndeclaredKey('reject')` and becomes, once all
three parts have landed:

```ts
const RulePolicyRecord = type({
  schemaVersion: SchemaVersion,
  policyId: OpaqueId,
  ruleModes: RuleModeRecord.array(),
  'adoptedSet?': AdoptedSetRecord,
  'classificationPolicy?': ClassificationPolicy,
  'plainTypeScriptPaths?': PlainSelectorRecord.array(),
  'relationshipRequest?': RelationshipRequest,
  'sizeCeilings?': SizeCeilingsRecord,
}).onUndeclaredKey('reject');
```

**No narrow requires a pinned maximum above the ceiling.** A pin that has fallen to or under the
ceiling is a finding of `F7`, not a malformed policy, because it is a fact about the candidate.

The ratchet branch in `loadRulePolicy` is replaced, in part A:

```ts
// The adopted set is what gives ratchet its meaning; R5 forbids defaulting it.
// Proof: on <date>, deleting this branch made the no-adopted-set test receive empty stderr
// instead of naming INV-CLASSIFY.
if (mode === 'ratchet' && policy.adoptedSet === undefined) {
  throw new Error(`rule policy sets ${ruleId} to ratchet but states no adopted set`);
}
```

and `loadRulePolicy`'s JSDoc sentence about slice B2 becomes "`ratchet` needs an adopted set; a
policy that ratchets a rule without one is refused."

`assertPolicyInputs`'s `absent` expression gains one disjunct in part B and one in part E, so that
after part E it reads:

```ts
const absent =
  (input === 'policy.classificationPolicy' && policy.classificationPolicy === undefined) ||
  (input === 'policy.relationshipRequest' && policy.relationshipRequest === undefined) ||
  (input === 'policy.sizeCeilings' && policy.sizeCeilings === undefined) ||
  (input === 'policy.plainTypeScriptPaths' && policy.plainTypeScriptPaths === undefined);
```

### 6.3 `apps/wiki/cli/src/rules/size-ratchet.ts` — part B, complete

```ts
import { readCandidateBlob } from '../inventory/read-blob';
import type { CandidateEntry } from '../inventory/read-candidate';
import type { RuleObservation, RuleOutcome } from './rule';

/** One file the consumer has accepted above the ceiling, with the size it may not exceed. */
export interface PinnedSize {
  readonly path: string;
  readonly maximum: number;
}

export interface SizeCeilings {
  readonly ceiling: number;
  /** Candidate-relative directory prefixes whose production source is measured. */
  readonly roots: readonly string[];
  readonly pinned: readonly PinnedSize[];
}

/**
 * Lines as `wc -l` counts them: the number of newline bytes. A file with no final newline counts one
 * fewer than its visible lines; every text file in this repository ends in one, because the
 * repository formats with Prettier.
 */
export function countLines(bytes: Uint8Array): number {
  let lines = 0;
  for (const byte of bytes) {
    if (byte === 0x0a) lines += 1;
  }
  return lines;
}

/** Production source: TypeScript that is neither a declaration file nor a test. */
export function isMeasuredSource(path: string): boolean {
  if (path.endsWith('.d.ts')) return false;
  if (path.includes('.test.') || path.includes('.spec.')) return false;
  return path.endsWith('.ts') || path.endsWith('.tsx');
}

function underOneRoot(path: string, roots: readonly string[]): boolean {
  // Proof: on <date>, dropping the `/` from this comparison made `src2/big.ts` count as under the
  // root `src`; the declared-roots test expected no finding and received one.
  return roots.some((root) => path === root || path.startsWith(`${root}/`));
}

/**
 * Measures every production source file under the policy's roots and reports the three ways the
 * ratchet is broken: an unpinned file over the ceiling, a pinned file over its pin, and a pinned
 * file that has fallen to or under the ceiling and must leave the list, so the list only shrinks.
 *
 * A pin naming a path the candidate does not measure is a stale record, not candidate debt, so it is
 * a failure to evaluate: no mode may report this rule clean while its policy is out of date.
 */
export function measureSizes(
  repository: string,
  entries: readonly CandidateEntry[],
  ceilings: SizeCeilings,
): RuleOutcome<readonly RuleObservation[]> {
  const measured = new Map<string, number>();
  for (const entry of entries) {
    if (entry.mode !== '100644' && entry.mode !== '100755') continue;
    if (!isMeasuredSource(entry.path)) continue;
    if (!underOneRoot(entry.path, ceilings.roots)) continue;
    measured.set(entry.path, countLines(readCandidateBlob(repository, entry.blob, entry.path)));
  }
  const pinnedByPath = new Map(ceilings.pinned.map((pin) => [pin.path, pin.maximum]));
  for (const pinnedPath of pinnedByPath.keys()) {
    // Proof: on <date>, dropping this loop made a pin for a file the candidate lacks report nothing;
    // the stale-pin test expected an unevaluated rule and received an allowed verdict.
    if (!measured.has(pinnedPath)) {
      return {
        ok: false,
        reason: `the size policy pins ${pinnedPath}, which the candidate does not measure`,
      };
    }
  }
  const observations: RuleObservation[] = [];
  for (const [path, lines] of [...measured].sort(([left], [right]) => (left < right ? -1 : 1))) {
    const maximum = pinnedByPath.get(path);
    if (maximum === undefined) {
      // Proof: on <date>, comparing with `>=` made a file exactly at the ceiling a finding; the
      // at-the-ceiling test expected no finding and received one.
      if (lines > ceilings.ceiling) {
        observations.push({
          path,
          message: `${String(lines)} lines exceeds the ceiling ${String(ceilings.ceiling)}`,
        });
      }
      continue;
    }
    if (lines > maximum) {
      observations.push({
        path,
        message: `${String(lines)} lines exceeds its pinned maximum ${String(maximum)}`,
      });
      continue;
    }
    if (lines <= ceilings.ceiling) {
      observations.push({
        path,
        message: `${String(lines)} lines is at or under the ceiling ${String(ceilings.ceiling)}: remove the pin`,
      });
    }
  }
  return { ok: true, report: observations };
}
```

`RuleOutcome<Report>` already exists in `rule.ts` as
`{ ok: true; report: Report } | { ok: false; reason: string }`; reuse it, do not redeclare it.

### 6.4 `apps/wiki/cli/src/rules/kinds.ts` — part C, complete

```ts
import type { CandidateEntry } from '../inventory/read-candidate';
import type { RuleObservation } from './rule';

export type ServiceKind = 'delivery' | 'feature' | 'repository' | 'resource';

/**
 * The declaration rule K1 asks for: the kind is the filename suffix before the extension. A test file
 * is not matched, because `preferences.feature.test.ts` ends in `.test.ts`, not `.feature.ts`.
 */
const KindSuffix = /\.(feature|repository|resource)\.tsx?$/;

/** Wiring, exempt from K2 to K6 by never entering {@link KindGraph.files}. */
const CompositionRootName = 'composition.ts';

export interface KindedFile {
  readonly path: string;
  readonly kind: ServiceKind;
  /** The module directory this file belongs to, candidate-relative. */
  readonly module: string;
}

export interface KindGraph {
  /** Every directory that directly contains a kind-suffixed file, sorted. */
  readonly moduleRoots: readonly string[];
  /**
   * Every file a direction rule may judge, as a source or as a target.
   *
   * **A composition root is absent from this list, and that absence is the whole of its K2-to-K6
   * exemption**: a file with no kind is never a rule's source and never a forbidden target, so no
   * rule needs a guard for it. The taxonomy exempts composition roots because they install modules
   * and supply adapters.
   */
  readonly files: readonly KindedFile[];
  readonly compositionRoots: readonly string[];
}

function directoryOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? '' : path.slice(0, cut);
}

/**
 * A path inside a module directory. `''` is the candidate-root module identifier, and a candidate
 * path carries no leading slash, so joining `''` with `/` would build `/README.md` and match
 * nothing.
 */
function modulePath(root: string, name: string): string {
  return root === '' ? name : `${root}/${name}`;
}

function kindOfSuffix(path: string): ServiceKind | undefined {
  const matched = KindSuffix.exec(path);
  if (matched === null) return undefined;
  const declared = matched[1];
  if (declared === 'feature') return 'feature';
  if (declared === 'repository') return 'repository';
  return 'resource';
}

/** The nearest enclosing module root, which is the longest one that contains the directory. */
function moduleOf(directory: string, moduleRoots: readonly string[]): string | undefined {
  let nearest: string | undefined;
  for (const root of moduleRoots) {
    // `''` is the candidate root and contains every directory, so it is exempt from the
    // containment test that a named root must pass.
    if (root !== '' && directory !== root && !directory.startsWith(`${root}/`)) continue;
    // Proof: on <date>, returning the first match instead of the longest made
    // `m/inner/view/x.tsx` resolve to module `m`, which left it outside `m/view`, so it received
    // no kind at all; the nearest-module test expected `m/inner` and received `undefined`.
    if (nearest === undefined || root.length > nearest.length) nearest = root;
  }
  return nearest;
}

/**
 * Resolves every candidate file's kind and module from its path alone. It cannot fail: a file with no
 * suffix and no view directory simply has no kind, and no direction rule applies to it.
 *
 * **This is a suffix-only adapter, and nothing else makes a file accountable.** `INV-CLASSIFY` and
 * `classification-policy.v1.json` classify *content* — source, test, config, migration — and demand
 * no service kind, so an unsuffixed service is debt nowhere in this package; the only inventory that
 * demands a kind is `tools/tool-devsync/src/service-kinds.ts`, over three backend directories, and it
 * is not consulted here. Deleting every suffix in a candidate empties this graph and satisfies every
 * direction rule vacuously.
 *
 * Unsatisfied and recorded rather than claimed: `SERVICE-TAXONOMY-001`, `002` and `003`, which belong
 * to the inventory lane; and the **repository port** half of K3 and K4, because a port lives in an
 * unsuffixed `contract.ts` and is invisible here. A port boundary needs a declared input of its own.
 */
export function resolveKinds(entries: readonly CandidateEntry[]): KindGraph {
  const paths = entries
    .filter((entry) => entry.mode === '100644' || entry.mode === '100755')
    .map((entry) => entry.path);
  const moduleRoots = [
    ...new Set(paths.filter((path) => KindSuffix.test(path)).map(directoryOf)),
  ].sort();
  const files: KindedFile[] = [];
  const compositionRoots: string[] = [];
  for (const path of [...paths].sort()) {
    const directory = directoryOf(path);
    const module = moduleOf(directory, moduleRoots);
    if (module === undefined) continue;
    // Part D writes this proof comment, after observing D3. Part C leaves it out.
    if (path === modulePath(module, CompositionRootName)) {
      compositionRoots.push(path);
      continue;
    }
    const declared = kindOfSuffix(path);
    if (declared !== undefined) {
      files.push({ path, kind: declared, module });
      continue;
    }
    const view = modulePath(module, 'view');
    // Proof: on <date>, keeping only the descendant half of this condition
    // (`directory.startsWith(...)`) dropped `m/view/panel.tsx`, and keeping only the direct half
    // (`directory === view`) dropped `m/view/deep/row.tsx`; the delivery test's
    // `toContainEqual` reported each missing tuple in turn.
    if (directory === view || directory.startsWith(`${view}/`)) {
      files.push({ path, kind: 'delivery', module });
    }
  }
  return { moduleRoots, files, compositionRoots };
}

/**
 * Every module directory that lacks something the module layout requires.
 *
 * The index comes from the **checked index report**, not from a filename: `readIndexes` skips a
 * `README.md` carrying no `module-index` comment and one whose mode is a symlink, so a module holding
 * an ordinary README has no index at all while a filename check would pass it. The contract must be a
 * regular blob for the same reason — a symlink named `contract.ts` declares nothing.
 */
export function moduleLayoutObservations(
  graph: KindGraph,
  entries: readonly CandidateEntry[],
  indexPaths: ReadonlySet<string>,
): readonly RuleObservation[] {
  const regularFiles = new Set(
    entries
      .filter((entry) => entry.mode === '100644' || entry.mode === '100755')
      .map((entry) => entry.path),
  );
  const observations: RuleObservation[] = [];
  for (const root of graph.moduleRoots) {
    // The candidate root is reported as `.`, the same whole-candidate path `REL-EXTRACT` uses,
    // because `RelativePath` forbids the empty string.
    const reported = root === '' ? '.' : root;
    // Proof: on <date>, accepting any entry named README.md made the ordinary-README fixture
    // allowed; the test expected `module directory declares no wiki index`.
    if (!indexPaths.has(modulePath(root, 'README.md'))) {
      observations.push({ path: reported, message: 'module directory declares no wiki index' });
    }
    // Proof: on <date>, dropping the regular-file filter made the symlinked-contract fixture
    // allowed; the test expected `module directory declares no contract file`.
    if (!regularFiles.has(modulePath(root, 'contract.ts'))) {
      observations.push({ path: reported, message: 'module directory declares no contract file' });
    }
  }
  return observations;
}
```

**The candidate root is a module like any other.** The owning requirement covers "each directory
containing a kind-declared service" and excludes nothing, so a candidate whose kinded file sits at
the root has `''` as a module root. `''` is preserved as the internal candidate-root module
identifier, and `modulePath` is what keeps it from building `/README.md`, `/contract.ts` and
`/view`, none of which a candidate path can ever equal. Observed on 2026-09-20, in this worktree, by
rehearsing part C: with `modulePath` changed to always join with `/`, the root-module CLI fixture
received two findings, `module directory declares no wiki index` and
`module directory declares no contract file`, both at `path: "."`, where the test expected `[]`.
That rehearsal is proof C8b below.

### 6.5 `apps/wiki/cli/src/rules/direction.ts` — parts D and E

Part D writes everything except `PlainSelector`, `resolvePlainSelectors`, `matchesSelector` and
`reactObservations`, which part E adds.

```ts
import type { KindedFile, KindGraph, ServiceKind } from './kinds';
import type { RuleObservation } from './rule';

/** One resolved import edge, as `extractRelationships().typescript.imports` spells it. */
export interface ImportEdge {
  readonly source: string;
  readonly specifier: string;
  readonly target: string;
  readonly importKind: string;
}

const ReExportKinds = new Set(['re-export', 'type-re-export']);
const ReactTargets = new Set(['external:react', 'external:react-dom']);
const ReactScopePrefix = 'external:@tanstack/react-';

/**
 * Every file one import reaches: the direct target, plus everything that target re-exports, and so
 * on. A barrel therefore cannot hide the kind of the file behind it, which is what lint cannot see
 * and this check must. External targets are returned but never expanded. The visited set makes a
 * re-export cycle terminate.
 */
export function reachedTargets(imports: readonly ImportEdge[], target: string): readonly string[] {
  const reached: string[] = [];
  const seen = new Set<string>();
  const queue = [target];
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined || seen.has(next)) continue;
    seen.add(next);
    reached.push(next);
    if (next.startsWith('external:')) continue;
    for (const edge of imports) {
      // Proof: on <date>, returning only the direct target made the barrel fixture's feature reach
      // the barrel and stop; the K3 barrel test expected the repository behind it.
      if (edge.source === next && ReExportKinds.has(edge.importKind)) queue.push(edge.target);
    }
  }
  return reached;
}

/** One direction rule: which importing kind it governs and which kinds it may not reach. */
export interface Direction {
  readonly from: ServiceKind;
  readonly forbidden: readonly ServiceKind[];
}

function kindedByPath(graph: KindGraph): Map<string, KindedFile> {
  return new Map(graph.files.map((file) => [file.path, file]));
}

function sorted(observations: RuleObservation[]): readonly RuleObservation[] {
  return observations.sort((left, right) =>
    `${left.path}\u0000${left.subject ?? ''}` < `${right.path}\u0000${right.subject ?? ''}`
      ? -1
      : 1,
  );
}

/** Every import a file of the governed kind makes into a forbidden kind, barrels resolved. */
export function directionObservations(
  graph: KindGraph,
  imports: readonly ImportEdge[],
  direction: Direction,
): readonly RuleObservation[] {
  const kinded = kindedByPath(graph);
  const reported = new Set<string>();
  const observations: RuleObservation[] = [];
  for (const edge of imports) {
    const source = kinded.get(edge.source);
    // Written as an optional chain because `lint:source` refuses
    // `source === undefined || source.kind !== direction.from` with `prefer-optional-chain`.
    if (source?.kind !== direction.from) continue;
    for (const target of reachedTargets(imports, edge.target)) {
      const reachedFile = kinded.get(target);
      // Proof: on <date>, dropping this membership test made the allowed resource import a finding;
      // the allowed-dependency test expected `findings: []`.
      if (reachedFile === undefined || !direction.forbidden.includes(reachedFile.kind)) continue;
      const key = `${edge.source}\u0000${target}`;
      if (reported.has(key)) continue;
      reported.add(key);
      observations.push({
        path: edge.source,
        subject: target,
        message: `${direction.from} imports ${reachedFile.kind} ${target} through '${edge.specifier}'`,
      });
    }
  }
  return sorted(observations);
}

/** K6: a kind importing the same kind from another module. */
export function sidewaysObservations(
  graph: KindGraph,
  imports: readonly ImportEdge[],
): readonly RuleObservation[] {
  const kinded = kindedByPath(graph);
  const reported = new Set<string>();
  const observations: RuleObservation[] = [];
  for (const edge of imports) {
    const source = kinded.get(edge.source);
    if (source === undefined) continue;
    for (const target of reachedTargets(imports, edge.target)) {
      const reachedFile = kinded.get(target);
      if (reachedFile === undefined) continue;
      // Proof: on <date>, making this module comparison always unequal made a same-module import a
      // finding; the inside-one-module test expected `findings: []`.
      if (reachedFile.kind !== source.kind || reachedFile.module === source.module) continue;
      const key = `${edge.source}\u0000${target}`;
      if (reported.has(key)) continue;
      reported.add(key);
      observations.push({
        path: edge.source,
        subject: target,
        message: `${source.kind} in ${source.module} imports ${reachedFile.kind} in ${reachedFile.module}`,
      });
    }
  }
  return sorted(observations);
}

/** A store or geometry module the consumer's policy declares plain TypeScript. */
export type PlainSelector =
  | { readonly kind: 'path'; readonly value: string }
  | { readonly kind: 'prefix'; readonly value: string };

export type SelectorOutcome =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Refuses a selector the candidate no longer satisfies. Without this a renamed store silently leaves
 * F1's coverage, exactly as a stale pin would silently leave F7's, so the two rules treat a stale
 * record the same way: a failure to evaluate, not an allowed candidate.
 */
export function resolvePlainSelectors(
  selectors: readonly PlainSelector[],
  entryPaths: ReadonlySet<string>,
): SelectorOutcome {
  for (const selector of selectors) {
    // Proof: on <date>, deleting this loop let `src/m/renamed-store.ts` import React while the
    // policy still named `src/m/store.ts`; the stale-selector test expected an unevaluated rule.
    if (selector.kind === 'path' && !entryPaths.has(selector.value)) {
      return {
        ok: false,
        reason: `the rule policy declares plain TypeScript at ${selector.value}, which the candidate does not contain`,
      };
    }
    if (selector.kind === 'prefix') {
      const covered = [...entryPaths].some((path) => path.startsWith(`${selector.value}/`));
      if (!covered) {
        return {
          ok: false,
          reason: `the rule policy declares plain TypeScript under ${selector.value}, which covers no candidate file`,
        };
      }
    }
  }
  return { ok: true };
}

function matchesSelector(path: string, selectors: readonly PlainSelector[]): boolean {
  return selectors.some((selector) =>
    selector.kind === 'path' ? path === selector.value : path.startsWith(`${selector.value}/`),
  );
}

/**
 * F1: a service file, a store or a geometry module reaching React. Delivery may; the others may not.
 *
 * Requirement F1 covers stores and geometry as well as the three service kinds, and nothing in a path
 * marks a store, so they come from the trusted policy's declared selectors, which
 * {@link resolvePlainSelectors} has already checked against the candidate.
 */
export function reactObservations(
  graph: KindGraph,
  imports: readonly ImportEdge[],
  plainSelectors: readonly PlainSelector[],
): readonly RuleObservation[] {
  const kinded = kindedByPath(graph);
  const reported = new Set<string>();
  const observations: RuleObservation[] = [];
  for (const edge of imports) {
    const source = kinded.get(edge.source);
    // Proof: on <date>, dropping this skip made the delivery component's React import a finding;
    // the scoped-and-delivery test expected exactly one observation, for the store.
    if (source?.kind === 'delivery') continue;
    const declaredPlain = matchesSelector(edge.source, plainSelectors);
    // Proof: on <date>, dropping `declaredPlain` made the store fixture report nothing; the store
    // test expected one finding for `src/m/store.ts`.
    if (source === undefined && !declaredPlain) continue;
    for (const target of reachedTargets(imports, edge.target)) {
      // Proof: on <date>, dropping the scope prefix let a resource import
      // `@tanstack/react-query`; the scoped test received `findings: []`.
      if (!ReactTargets.has(target) && !target.startsWith(ReactScopePrefix)) continue;
      const key = `${edge.source}\u0000${target}`;
      if (reported.has(key)) continue;
      reported.add(key);
      observations.push({
        path: edge.source,
        subject: target,
        message: `${source?.kind ?? 'declared plain TypeScript'} imports ${target} through '${edge.specifier}'`,
      });
    }
  }
  return sorted(observations);
}
```

### 6.6 The widened `RuleContext` and the shared relationship report — parts C and D

`rule.ts` gains these imports:

```ts
import type { extractRelationships } from '../relationships';
import type { PlainSelector } from './direction';
import type { KindGraph } from './kinds';
import type { SizeCeilings } from './size-ratchet';
```

and `RuleContext` becomes, once every part has landed. **`relationships` is a method, never a
property**: a property-style function member is contravariant in its parameters and broke variance
in batch 1.

```ts
export type RelationshipReport = ReturnType<typeof extractRelationships>;

export interface RuleContext {
  /** The resolved Git worktree root, never a caller's interior directory. */
  readonly repository: string;
  readonly candidate: CandidateSnapshot;
  readonly classificationPolicy?: ClassificationPolicy;
  readonly plainTypeScriptPaths?: readonly PlainSelector[];
  readonly relationshipRequest?: RelationshipRequest;
  readonly sizeCeilings?: SizeCeilings;
  /** The index report, computed once per check and shared by the three module rules. */
  readonly indexes: RuleOutcome<IndexReport>;
  /** Kinds and modules, derived from paths alone; total, so it needs no outcome wrapper. */
  readonly kinds: KindGraph;
  /**
   * The extracted relationships, computed at most once per check and never before a rule asks.
   * Extraction typechecks the whole candidate, so an unconditional call would make every `check` pay
   * for it.
   */
  relationships(): RuleOutcome<RelationshipReport>;
}
```

In `check.ts`, add `import type { RelationshipRequest } from '../contracts/records';`,
`import { extractRelationships } from '../relationships';`, `import { resolveKinds } from './kinds';`
and `type RelationshipReport` to the existing `./rule` import, then add above `checkCandidate`:

```ts
function readRelationshipOutcome(
  repository: string,
  candidate: CandidateSnapshot,
  request: RelationshipRequest | undefined,
): RuleOutcome<RelationshipReport> {
  // The exact sentence slice B0's REL-EXTRACT produced; the rule keeps its message.
  if (request === undefined) {
    return { ok: false, reason: 'the rule policy carries no relationship request' };
  }
  try {
    return { ok: true, report: extractRelationships(repository, candidate, request) };
  } catch (cause) {
    // Modeled recovery: extraction refuses by throwing, and a throw is a failure to evaluate.
    return { ok: false, reason: reasonOf(cause) };
  }
}
```

Inside `checkCandidate`, immediately after `const candidate = readCandidate(...)`, add the memo, and
**replace the whole `const context = { ... }` literal** with this one. Leaving the literal unchanged
is the defect that makes part D's type check fail:

```ts
let relationshipOutcome: RuleOutcome<RelationshipReport> | undefined;
const relationships = (): RuleOutcome<RelationshipReport> => {
  relationshipOutcome ??= readRelationshipOutcome(
    candidateRoot,
    candidate,
    policy.relationshipRequest,
  );
  return relationshipOutcome;
};
const context = {
  repository: candidateRoot,
  candidate,
  ...(policy.classificationPolicy === undefined
    ? {}
    : { classificationPolicy: policy.classificationPolicy }),
  ...(policy.plainTypeScriptPaths === undefined
    ? {}
    : { plainTypeScriptPaths: policy.plainTypeScriptPaths }),
  ...(policy.relationshipRequest === undefined
    ? {}
    : { relationshipRequest: policy.relationshipRequest }),
  ...(policy.sizeCeilings === undefined ? {} : { sizeCeilings: policy.sizeCeilings }),
  indexes: readIndexOutcome(candidateRoot, candidate),
  kinds: resolveKinds(candidate.entries),
  relationships,
};
```

Part C adds `kinds:` and the `kinds` member; part D adds the memo, `relationships`, and
`readRelationshipOutcome`; part B adds the `sizeCeilings` spread and member; part E adds the
`plainTypeScriptPaths` spread and member. Each part adds only its own lines.

`REL-EXTRACT` in `registry.ts` is rewritten in part D to read the shared outcome. Its findings and
its two reasons must not change:

```ts
  evaluate: (context) => {
    const outcome = context.relationships();
    if (!outcome.ok) return { kind: 'not-evaluated', reason: outcome.reason };
    // Proof: on 2026-09-20, replacing the unresolved mapping with an empty list made the adapter
    // test receive `findings: []` instead of the declared relationship debt.
    return {
      kind: 'observed',
      observations: outcome.report.declarations.unresolved.map((unresolved) => ({
        path: '.',
        subject: unresolved.relationshipId,
        message: `declared relationship is unresolved: ${unresolved.reason}`,
      })),
    };
  },
```

The existing test `reports a declared relationship that the candidate leaves unresolved` must still
pass unchanged. If it does not, **stop**: this refactor changes no behaviour.

### 6.7 The registry entries

`registry.ts` gains a second source constant beside the existing `SpecSource`:

```ts
const KindSpecSource =
  'openspec/changes/twilight-bureaucrat-kind-rules/specs/bureaucrat-rules/spec.md';
```

`F7` and `MOD-LAYOUT` are ordinary rule objects:

```ts
const moduleLayoutRule: RegisteredRule = {
  id: 'MOD-LAYOUT',
  family: 'modules',
  statement: 'A module directory declares the wiki index and the contract the module layout names.',
  source: `${KindSpecSource}#requirement-module-layout`,
  inputs: ['candidate.entries'],
  evaluate: (context) =>
    context.indexes.ok
      ? {
          kind: 'observed',
          observations: moduleLayoutObservations(
            context.kinds,
            context.candidate.entries,
            new Set(context.indexes.report.indexes.map((index) => index.indexPath)),
          ),
        }
      : // Proof: on <date>, returning an empty observed list here made the malformed-index fixture
        // exit 0; the test expected exit 1 and an unevaluated MOD-LAYOUT.
        {
          kind: 'not-evaluated',
          reason: `the index report is unavailable: ${context.indexes.reason}`,
        },
};

const sizeRatchetRule: RegisteredRule = {
  id: 'F7',
  family: 'code-shape',
  statement:
    'A production source file does not grow past the size ceiling, and a file already above it only shrinks.',
  source: `${KindSpecSource}#requirement-source-file-size-is-ratcheted`,
  inputs: ['candidate.entries', 'policy.sizeCeilings'],
  evaluate: (context) => {
    const ceilings = context.sizeCeilings;
    if (ceilings === undefined) {
      return { kind: 'not-evaluated', reason: 'the rule policy carries no size ceilings' };
    }
    const measured = measureSizes(context.repository, context.candidate.entries, ceilings);
    return measured.ok
      ? { kind: 'observed', observations: measured.report }
      : { kind: 'not-evaluated', reason: measured.reason };
  },
};
```

The five graph rules share one body, added in part D:

```ts
function graphRule(
  id: string,
  family: string,
  statement: string,
  anchor: string,
  inputs: readonly string[],
  observe: (
    graph: KindGraph,
    imports: readonly ImportEdge[],
    context: RuleContext,
  ) => readonly RuleObservation[],
): RegisteredRule {
  return {
    id,
    family,
    statement,
    source: `${KindSpecSource}${anchor}`,
    inputs,
    evaluate: (context) => {
      const outcome = context.relationships();
      // Proof: on <date>, returning an empty observed list here made the unconfigured-modules test
      // exit 0 with `unevaluated: []`; it expected exit 1 and the named reason.
      if (!outcome.ok) return { kind: 'not-evaluated', reason: outcome.reason };
      return {
        kind: 'observed',
        observations: observe(context.kinds, outcome.report.typescript.imports, context),
      };
    },
  };
}

const DirectionAnchor = '#requirement-kind-direction-over-the-import-graph';
const GraphInputs = ['candidate.entries', 'policy.relationshipRequest'];

function directionRule(id: string, statement: string, direction: Direction): RegisteredRule {
  return graphRule(id, 'relationships', statement, DirectionAnchor, GraphInputs, (graph, imports) =>
    directionObservations(graph, imports, direction),
  );
}
```

Part D registers `K3` and `K4`; part E registers `K2`, `K5`, `K6` and `F1`.

```ts
const kindDirectionRules: readonly RegisteredRule[] = [
  directionRule(
    'K2',
    'Delivery imports feature-services and never a resource-service or a repository.',
    { from: 'delivery', forbidden: ['resource', 'repository'] },
  ),
  directionRule(
    'K3',
    'A feature-service imports resource-services and never a repository or delivery, through a barrel or directly.',
    { from: 'feature', forbidden: ['repository', 'delivery'] },
  ),
  directionRule(
    'K4',
    'A resource-service imports repository ports and never a feature-service or delivery.',
    { from: 'resource', forbidden: ['feature', 'delivery'] },
  ),
  directionRule(
    'K5',
    'A repository adapter imports nothing above it: no resource-service, no feature-service and no delivery.',
    { from: 'repository', forbidden: ['resource', 'feature', 'delivery'] },
  ),
  graphRule(
    'K6',
    'relationships',
    'No kind imports a sibling of the same kind from another module.',
    DirectionAnchor,
    GraphInputs,
    sidewaysObservations,
  ),
];

const plainTypeScriptRule: RegisteredRule = {
  id: 'F1',
  family: 'code-shape',
  statement:
    'A service, store or geometry module is plain TypeScript and never imports a React package.',
  source: `${KindSpecSource}#requirement-services-are-plain-typescript`,
  inputs: ['candidate.entries', 'policy.plainTypeScriptPaths', 'policy.relationshipRequest'],
  evaluate: (context) => {
    const selectors = context.plainTypeScriptPaths;
    if (selectors === undefined) {
      return {
        kind: 'not-evaluated',
        reason: 'the rule policy declares no plain TypeScript paths',
      };
    }
    const resolved = resolvePlainSelectors(
      selectors,
      new Set(context.candidate.entries.map((entry) => entry.path)),
    );
    if (!resolved.ok) return { kind: 'not-evaluated', reason: resolved.reason };
    const outcome = context.relationships();
    if (!outcome.ok) return { kind: 'not-evaluated', reason: outcome.reason };
    return {
      kind: 'observed',
      observations: reactObservations(context.kinds, outcome.report.typescript.imports, selectors),
    };
  },
};
```

K3 forbids **delivery** as well as a repository, because its requirement says "SHALL NOT import a
repository port or adapter, a feature-service of another module, **delivery**, React or a vendor UI
library", and a probe showed `['repository']` alone lets a feature import `m/view/panel.tsx`
unreported (fact 30).

The `rules` array becomes, after part E:

```ts
const rules: readonly RegisteredRule[] = [
  classificationRule,
  directEntriesRule,
  moduleIndexRule,
  moduleLayoutRule,
  relationshipsRule,
  sizeRatchetRule,
  plainTypeScriptRule,
  ...kindDirectionRules,
];
```

`registeredRules()` sorts it, so after part E the identifier list is exactly
`F1, F7, INV-CLASSIFY, K2, K3, K4, K5, K6, MOD-DIRECT-ENTRIES, MOD-INDEX, MOD-LAYOUT, REL-EXTRACT`.

### 6.8 The five places every registered rule is named

`rules.test.ts` names the whole registry in four places and supplies optional policy inputs in a
fifth. **Every part that registers a rule updates all five**, because `loadRulePolicy` demands a mode
for every registered rule even under `--rule`. Locate each by its surrounding text, never by a line
number, which drifts as the file grows.

| Site                                                                                                                 | What to change                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| The `explain NO-SUCH-RULE` refusal string                                                                            | Add the new identifiers in sorted order.                                                |
| `const everyRuleObserving: RuleModeEntry[]`                                                                          | Add `{ ruleId: '<id>', mode: 'observe' }`.                                              |
| The `verdict.ruleIds` array in `allows the canonical candidate under every registered rule`                          | Add the new identifiers in sorted order.                                                |
| The **literal four-entry array** in `allows the indexed candidate under an enforced module rule and never certifies` | Replace it with the expression below. Its assertions do not change.                     |
| `writeCompleteRulePolicy`                                                                                            | Add the new optional policy inputs, so the canonical candidate still passes every rule. |

The literal array becomes:

```ts
const policyPath = writeRulePolicy(
  everyRuleObserving.map((entry) =>
    entry.ruleId === 'MOD-DIRECT-ENTRIES' || entry.ruleId === 'MOD-INDEX'
      ? { ...entry, mode: 'enforce' as const }
      : entry,
  ),
);
```

and `writeCompleteRulePolicy`'s `extra` gains, as its parts land:

```ts
    sizeCeilings: { ceiling: 40, roots: ['src'], pinned: [] },
    plainTypeScriptPaths: [],
```

### 6.9 The rule policy document, as the tests write it

```json
{
  "schemaVersion": 1,
  "policyId": "rules.test.v1",
  "ruleModes": [{ "ruleId": "K3", "mode": "ratchet" }],
  "adoptedSet": { "adoptedPrefixes": ["src/adopted"] },
  "sizeCeilings": {
    "ceiling": 40,
    "roots": ["src"],
    "pinned": [{ "path": "src/big.ts", "maximum": 60 }]
  },
  "plainTypeScriptPaths": [{ "kind": "path", "value": "src/m/store.ts" }],
  "relationshipRequest": {
    "schemaVersion": 1,
    "typescript": { "configPaths": ["tsconfig.json"], "publicEntrypoints": ["src/entry.ts"] }
  }
}
```

`ruleModes` must name **every** registered rule; the fragment shows only the new fields.
`writeRulePolicy` already takes an `extra` record, so every new field goes through it with no new
helper.

---

## Part A — the adopted set makes ratchet usable

Delivers the OpenSpec change, the adopted set, and a `ratchet` mode that is accepted when the policy
supplies one. **Adds three tests and renames one.** A rename adds nothing: the delta is `+3`.

### A.1 Preparation

- [ ] Run:

  ```sh
  repo_root=$(pwd -P)
  task_tmp=$(mktemp -d "${TMPDIR:?launcher must supply TMPDIR}/kind-rules-XXXXXX")
  mkdir -p "$TMPDIR/evidence"
  printf 'repo_root=%s\ntask_tmp=%s\n' "$repo_root" "$task_tmp"
  ```

  Expected: both paths print and `task_tmp` is beneath `TMPDIR`.

- [ ] Confirm the starting tree. **`|| true` is forbidden** by AGENTS.md R5 and appears nowhere in
      this packet; an absence is probed with an explicit conditional.

  ```sh
  git -C "$repo_root" status --porcelain
  ls "$repo_root/apps/wiki/cli/src/rules"
  if [ -e "$repo_root/openspec/changes/twilight-bureaucrat-kind-rules" ]; then
    echo 'STOP: the change already exists' >&2
    exit 1
  fi
  grep -c 'has no adopted set until slice B2' "$repo_root/apps/wiki/cli/src/rules/rule-policy.ts"
  ```

  Expected: no output from the first; the five existing rule files from the second; nothing from the
  third; `1` from the fourth.

- [ ] Record the two baselines. **This packet states no absolute total anywhere.** Main has moved
      since it was written, packet 010.6 adds Bureaucrat tests and 110.6 changes the devsync suite,
      so a literal would be a false stop.

  ```sh
  ( cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
    bun test --preload ../../../tools/test/scratch/preload.ts src/rules/rules.test.ts ) \
    >"$TMPDIR/evidence/baseline.log" 2>&1
  baseline_status=$?
  tail -4 "$TMPDIR/evidence/baseline.log"
  test "$baseline_status" -eq 0
  ```

  The run is redirected, never piped, so the status is the test run's and not `tail`'s. Expected:
  exit 0 and `0 fail`. Record the number of tests as `N`; it was 19 on `6484986e`. Then run the batch
  README's **OpenSpec validation** block and record `summary.totals.passed` as `P`; it was 99 on
  `6484986e`. **Part A ends at `N + 3` tests and `P + 1` OpenSpec items.** If the baseline reports
  any failure, stop.

### A.2 The OpenSpec change

Rule R4 requires OpenSpec: this changes an architectural contract, the meaning of a policy mode.

- [ ] Create the change with the batch README's **Creating an OpenSpec change** block, named
      `twilight-bureaucrat-kind-rules`. Expected: `grep -n "schema: sdd-lean"` prints one line. If it
      prints nothing, stop.
- [ ] Write `proposal.md` from the schema's template with §9's intent. **At most 400 words**,
      excluding the template's HTML comments; count them.
- [ ] Write `specs/bureaucrat-rules/spec.md` with §9's **five** requirements. Every requirement needs
      at least one `#### Scenario:` heading with real `**GIVEN**`, `**WHEN**` and `**THEN**` bullets:
      OpenSpec validates the heading only, so vacuous bullets would pass and would be a defect. §9's
      table is the authority on titles and anchors; the registry's `source` strings must match them
      exactly, and an `explain` test in part E asserts one verbatim.
- [ ] Amend the owning requirement, which is the one file outside this packet's own lanes. In
      `openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md`, under **Requirement: Ratchet
      mode protects touched and adopted code**, replace the sentence "A rule in ratchet mode SHALL
      refuse a violation introduced by new or touched code, SHALL refuse a regression inside a module
      in the adopted set, and SHALL report a pre-existing violation outside the adopted set as debt
      without refusing." with:

  > A rule in ratchet mode SHALL refuse a violation inside a module in the consumer's adopted set and
  > SHALL report a violation outside it as debt without refusing. The adopted set SHALL be policy
  > supplied by the consumer. Refusing a violation because the candidate **touched** its file SHALL
  > additionally require a comparison base supplied as an explicit input, resolved to a tree object
  > identity before judging and recorded in the verdict; until that input exists, scenario
  > SERVICE-TAXONOMY-038 SHALL be unmet and SHALL NOT be claimed.

  Then replace its final sentence, "Twilight Bureaucrat slice B0 has no adopted set and SHALL refuse
  the `ratchet` mode by name until slice B2.", with "Twilight Bureaucrat slice B2 supplies the adopted
  set; a policy that ratchets a rule without one SHALL be refused by name." Change **nothing else** in
  that file: the three scenarios keep their identifiers and their bodies, because a scenario identifier
  is stable.

- [ ] Write `tasks.md` as these five parts, each naming its tests and its negatives, and `verify.md`
      with a `## Commands and results` heading and one section per part, empty.
- [ ] Run the OpenSpec validation block. Expected: one JSON report, the block exits 0, `passed` is
      `P + 1`.

### A.3 Tests first

Every test below builds a Git fixture, which spawns Git six times before the CLI runs, so **every one
carries `15_000` as its third `test` argument**. §0.6 admits no exception, and this step states none.

- [ ] Factor the 41-entry debt fixture that the two existing direct-entry tests build inline into a
      helper beside `createUnindexedCandidate`, and have both call it. **Change neither existing
      test's assertions.**

  ```ts
  /** An indexed candidate whose single index declares 41 direct entries, one over the limit. */
  function createDirectEntryDebtCandidate(): { repository: string; revision: string } {
    const repository = initRepository('twilight-rules-debt-');
    const members = Array.from({ length: 41 }, (unused, index) => `src/module${String(index)}.ts`);
    for (const member of members) write(repository, member, 'export const value = 1;\n');
    write(
      repository,
      'README.md',
      indexSource(
        'Debt fixture',
        'module.debt',
        members.map((path) => ({ kind: 'path', path }) as const),
      ),
    );
    return { repository, revision: commit(repository, 'over the limit') };
  }
  ```

- [ ] **Rename** the existing test `refuses ratchet until the adopted set exists` to
      `refuses ratchet when the policy states no adopted set`, keep its structure, and change only its
      expected sentence to `rule policy sets INV-CLASSIFY to ratchet but states no adopted set`. Add
      `15_000`. This is the one existing test this packet edits, and it is edited because the
      behaviour it pins is the behaviour part A changes.

- [ ] Add `describe('ratchet mode', ...)` with three tests, each on
      `createDirectEntryDebtCandidate()` and each running
      `check committed <repository> <revision> <policy> --rule MOD-DIRECT-ENTRIES`. The finding's
      path is `README.md`, the index path, so `['src']` does not adopt it and `['README.md']` does.

  | Title, and the `-t` pattern                                             | Policy                                                                            | Assert                                                        |
  | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
  | `reports ratchet debt outside the adopted set and allows the candidate` | `MOD-DIRECT-ENTRIES` at `ratchet`, `{ adoptedSet: { adoptedPrefixes: ['src'] } }` | exit 0; `allowed` true; one finding with `effect: 'debt'`     |
  | `refuses ratchet debt inside the adopted set`                           | the same with `adoptedPrefixes: ['README.md']`                                    | exit 1; `allowed` false; one finding with `effect: 'refusal'` |
  | `refuses an adopted set that repeats a prefix`                          | every rule observing, `{ adoptedSet: { adoptedPrefixes: ['src', 'src'] } }`       | exit 1; stderr contains `unique adopted prefixes`             |

  Build each policy with the existing helper, for example

  ```ts
  const policyPath = writeRulePolicy(
    everyRuleObserving.map((entry) =>
      entry.ruleId === 'MOD-DIRECT-ENTRIES' ? { ...entry, mode: 'ratchet' as const } : entry,
    ),
    { adoptedSet: { adoptedPrefixes: ['src'] } },
  );
  ```

- [ ] Run the rules test file. **The four reds differ, and each must be recorded separately**,
      because `decodeRulePolicy` runs the schema before the registry loop: - the renamed test fails on the **message**: `loadRulePolicy` still throws the slice-B0 wording,
      `rule policy sets INV-CLASSIFY to ratchet, which has no adopted set until slice B2`. It
      carries no new schema field, so it never reaches the schema. - the three new tests fail at the **schema**, with `adoptedSet must be removed`.

### A.4 Implementation

- [ ] Apply §6.1 to `rule.ts`: the `RuleMode` JSDoc, the `Finding.effect` JSDoc, `AdoptedSet`,
      `isAdopted`, `effectOf` and the four-parameter `toFinding`.
- [ ] Apply §6.2's part-A half to `rule-policy.ts`: the `RelativePath` import, `AdoptedSetRecord`, the
      `'adoptedSet?'` field, the replaced ratchet branch, the JSDoc sentence.
- [ ] In `check.ts`, change the single `toFinding` call in `checkCandidate`'s observation loop to
      `findings.push(toFinding(rule.id, mode, observation, policy.adoptedSet));`. Nothing else in
      `check.ts` changes in this part.
- [ ] Run the rules test file. Expected: `N + 3` tests, `0 fail`.
- [ ] Run `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`. This part changes a shared
      function's signature, so the type check belongs in this slice.

### A.5 Negative proofs

Follow §0.4 exactly; write each `Proof:` comment only after seeing the failure.

| #   | Fault                                                                     | Named test                                                              | Expected failing line                                                                        |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A1  | Delete the `mode === 'ratchet' && policy.adoptedSet === undefined` branch | `refuses ratchet when the policy states no adopted set`                 | Empty stderr instead of `rule policy sets INV-CLASSIFY to ratchet but states no adopted set` |
| A2  | In `effectOf`, return `'refusal'` for ratchet unconditionally             | `reports ratchet debt outside the adopted set and allows the candidate` | `effect` is `refusal` and the run exits 1, where `debt` and 0 were expected                  |
| A3  | In `effectOf`, return `'debt'` for ratchet unconditionally                | `refuses ratchet debt inside the adopted set`                           | `effect` is `debt` and the run exits 0, where `refusal` and 1 were expected                  |
| A4  | Remove the `.narrow` from `AdoptedSetRecord`                              | `refuses an adopted set that repeats a prefix`                          | Exit 0 and no `unique adopted prefixes` in stderr                                            |

A2 and A3 each also change the other ratchet test. Record those extra failures beside the proof; per
executor preamble rule 16 that is not a stop.

### A.6 Part A verification

| Command                                                                                            | Expected                                             |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| §0.2's focused command                                                                             | Exit 0; `N + 3` tests ran, `0 fail`.                 |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`                                        | Exit 0.                                              |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`                                      | Exit 0, no warnings.                                 |
| `bunx prettier --write <the files you changed>`, then `NX_DAEMON=false bunx nx format:check --all` | The second exits 0 with no output.                   |
| The batch README's **OpenSpec validation** block                                                   | One JSON report; block exits 0; `passed` is `P + 1`. |

- [ ] **Before handing over**, fill part A's section of
      `openspec/changes/twilight-bureaucrat-kind-rules/verify.md` with the real commands, exit
      statuses, decisive output lines, and every fault with the test that failed and the line you saw,
      transcribed from `$TMPDIR/evidence`. Every part does this for itself: the launcher gives each
      attempt a **new** temporary root, so a later part cannot reach this one's logs.

Pending planner verification, named in the report as not run here: the whole
`twilight-bureaucrat:test`, `twilight-bureaucrat:test:package` and `tool-devsync:test` targets, and
`bin/h2puni-gate.sh`.

### A.7 Ready to commit

Subject: `feat(bureaucrat): give ratchet mode the consumer's adopted set`

Paths: `openspec/changes/twilight-bureaucrat-kind-rules/.openspec.yaml`,
`openspec/changes/twilight-bureaucrat-kind-rules/proposal.md`,
`openspec/changes/twilight-bureaucrat-kind-rules/specs/bureaucrat-rules/spec.md`,
`openspec/changes/twilight-bureaucrat-kind-rules/tasks.md`,
`openspec/changes/twilight-bureaucrat-kind-rules/verify.md`,
`openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md`,
`apps/wiki/cli/src/rules/rule.ts`, `apps/wiki/cli/src/rules/rule-policy.ts`,
`apps/wiki/cli/src/rules/check.ts`, `apps/wiki/cli/src/rules/rules.test.ts`.

Report what `git status --short --untracked-files=all` actually shows, not this list, and reconcile
any difference. Then stop and hand over. Do not start part B.

### A.8 Part A stop conditions

1. `openspec/changes/twilight-bureaucrat-kind-rules/` already exists, or any of
   `apps/wiki/cli/src/rules/{size-ratchet,kinds,direction}.ts` exists.
2. The baseline run reports any failure. The **total** is recorded, never compared to a literal.
3. OpenSpec refuses a second change adding requirements to `bureaucrat-rules` (unknown U1). Record
   the refusal text and stop; the fix is a capability of its own and is the planner's call.
4. The 400-word intent cap cannot be met. Report rather than trimming requirements.
5. A named negative's test passes under the fault, fails with a different message, or does not
   compile.

---

## Part B — `F7`, the file size ratchet

Starts from the committed part A. Read §0 in full first. **Adds eleven tests; the delta is `+11`.**

### B.1 Preparation

- [ ] Repeat A.1's three blocks, with these starting-tree checks: `git status --porcelain` empty;
      `grep -c 'states no adopted set' apps/wiki/cli/src/rules/rule-policy.ts` prints `1`; and an
      explicit conditional that stops if `apps/wiki/cli/src/rules/size-ratchet.ts` exists. Record `N`
      and `P` afresh. **Part B ends at `N + 11` tests and `P` unchanged**: it creates no OpenSpec
      change.

### B.2 Tests first

Every test carries `15_000`. Add this fixture helper beside the others:

```ts
/** A candidate whose `src` tree holds files of chosen line counts, for the size ratchet. */
function createSizedCandidate(sizes: Record<string, number>): {
  repository: string;
  revision: string;
} {
  const repository = initRepository('twilight-rules-sizes-');
  for (const [path, lines] of Object.entries(sizes)) {
    write(repository, path, 'export const value = 1;\n'.repeat(lines));
  }
  write(
    repository,
    'README.md',
    indexSource('Sizes fixture', 'module.sizes', [
      { kind: 'directory-prefix', prefix: 'src', exclusions: [] },
    ]),
  );
  return { repository, revision: commit(repository, 'sized fixture') };
}
```

Each written line ends in exactly one newline, so `countLines` returns the requested number.

- [ ] Add `describe('F7 the size ratchet', ...)` with these eleven tests. Each runs
      `check committed <repository> <revision> <policy> --rule F7`, with the policy built as
      `writeRulePolicy(everyRuleObserving, { sizeCeilings: <the policy named below> })` unless the row
      says otherwise.

  | Title, and the `-t` pattern                                             | Fixture                                         | `sizeCeilings`                                                                    | Assert                                                                                                                                                            |
  | ----------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `allows a candidate whose files are under the ceiling`                  | `{ 'src/small.ts': 10 }`                        | `{ ceiling: 40, roots: ['src'], pinned: [] }`                                     | exit 0; `findings: []`; `unevaluated: []`                                                                                                                         |
  | `allows a file exactly at the ceiling`                                  | `{ 'src/exact.ts': 40 }`                        | the same                                                                          | exit 0; `findings: []`                                                                                                                                            |
  | `reports an unpinned file over the ceiling with both numbers`           | `{ 'src/big.ts': 50 }`                          | the same                                                                          | one finding: `path` `src/big.ts`, `message` `50 lines exceeds the ceiling 40`                                                                                     |
  | `allows a pinned file under its pinned maximum`                         | `{ 'src/big.ts': 50 }`                          | `pinned: [{ path: 'src/big.ts', maximum: 60 }]`                                   | exit 0; `findings: []`                                                                                                                                            |
  | `reports a pinned file that has grown past its pin`                     | `{ 'src/big.ts': 50 }`                          | `pinned: [{ path: 'src/big.ts', maximum: 45 }]`                                   | `message` `50 lines exceeds its pinned maximum 45`                                                                                                                |
  | `reports a pinned file that has fallen under the ceiling`               | `{ 'src/big.ts': 30 }`                          | `pinned: [{ path: 'src/big.ts', maximum: 60 }]`                                   | `message` `30 lines is at or under the ceiling 40: remove the pin`                                                                                                |
  | `refuses a size policy that pins a file the candidate does not hold`    | `{ 'src/small.ts': 10 }`                        | `pinned: [{ path: 'src/gone.ts', maximum: 60 }]`                                  | exit 1; `findings: []`; `unevaluated` equals `[{ ruleId: 'F7', reason: 'the size policy pins src/gone.ts, which the candidate does not measure' }]`               |
  | `measures neither a test file nor a declaration file`                   | `{ 'src/big.test.ts': 50, 'src/big.d.ts': 50 }` | `{ ceiling: 40, roots: ['src'], pinned: [] }`                                     | exit 0; `findings: []`                                                                                                                                            |
  | `measures nothing outside the declared roots`                           | `{ 'src/keep.ts': 10, 'src2/big.ts': 50 }`      | `{ ceiling: 40, roots: ['src'], pinned: [] }`                                     | exit 0; `findings: []`. `src2` is a sibling of `src`, not a descendant. The fixture's index must declare both prefixes, or `check-indexes` refuses the candidate. |
  | `refuses a size policy with no root, a repeated root or a repeated pin` | `{ 'src/small.ts': 10 }`                        | three policies in turn: `roots: []`; `roots: ['src','src']`; two pins on one path | exit 1 each; stderr contains `at least one measured root`, then `unique measured roots`, then `unique pinned paths`. Three CLI runs, so this test takes `20_000`. |
  | `refuses F7 when the policy states no size ceilings`                    | `{ 'src/small.ts': 10 }`                        | **omitted**: `writeRulePolicy(everyRuleObserving)` with no `sizeCeilings`         | exit 1; stderr contains `rule F7 needs policy.sizeCeilings, which the rule policy omits`                                                                          |

- [ ] Update all five sites of §6.8 for `F7`: add it to `everyRuleObserving`, to the two sorted
      identifier lists, and give `writeCompleteRulePolicy` a
      `sizeCeilings: { ceiling: 40, roots: ['src'], pinned: [] }`.
- [ ] Run the rules test file. **Two different reds, recorded separately**: every test whose policy
      carries a `sizeCeilings` key fails at the schema with `sizeCeilings must be removed`, because
      `decodeRulePolicy` runs before the registry loop; the one test that omits it fails with
      `rule policy names an unregistered rule: F7`.

### B.3 Implementation

- [ ] Create `apps/wiki/cli/src/rules/size-ratchet.ts` exactly as §6.3.
- [ ] Add `SizeCeilingsRecord`, the `'sizeCeilings?'` field and the `policy.sizeCeilings` disjunct of
      `assertPolicyInputs` to `rule-policy.ts`, per §6.2.
- [ ] Add `readonly sizeCeilings?: SizeCeilings;` to `RuleContext` with its `import type`, and add the
      `sizeCeilings` spread to `check.ts`'s context literal, per §6.6.
- [ ] Register `sizeRatchetRule` from §6.7 and add it to the `rules` array.
- [ ] Run the rules test file. Expected: `N + 11` tests, `0 fail`.
- [ ] Run the type check; this part widens `RuleContext`.

### B.4 Negative proofs

For Part B, this table's final column describes the required assertion mismatch, not a literal log sentence. In §0.4 step 4, replace the final `grep -F` command with `cat "$TMPDIR/evidence/P<n>.log"`. Keep status capture, restoration, `cmp`, and the nonzero-status assertion unchanged. Confirm that the named test actually ran and failed at the assertion demonstrating the listed mismatch; a collection error, timeout, or unrelated assertion does not prove it. Record the actual matcher diagnostic and expected/received values. B3 may fail first with `Expected: 1` and `Received: 0`; unprinted subsequent assertions are not additional evidence. In the policy-refusal tests used by B8, B9a, B9b and B10, assert the required stderr sentence before asserting the exit code. Stop if the intended mismatch cannot be established. Additional failing tests remain governed by preamble rule 16.

| #   | Fault in the named file                                                                                       | Named test                                                              | Expected failing line                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `countLines` returns `0` always                                                                               | `reports an unpinned file over the ceiling with both numbers`           | `findings: []` where one finding was expected                                                                                            |
| B2  | Change `lines > ceilings.ceiling` to `lines >= ceilings.ceiling`                                              | `allows a file exactly at the ceiling`                                  | One finding, `40 lines exceeds the ceiling 40`, where none was expected                                                                  |
| B3  | Delete the stale-pin loop                                                                                     | `refuses a size policy that pins a file the candidate does not hold`    | Exit 0 and `unevaluated: []`                                                                                                             |
| B4  | Change `lines > maximum` to `lines > maximum + 1000`                                                          | `reports a pinned file that has grown past its pin`                     | `findings: []`                                                                                                                           |
| B5  | Delete the `lines <= ceilings.ceiling` branch                                                                 | `reports a pinned file that has fallen under the ceiling`               | `findings: []`                                                                                                                           |
| B6  | `isMeasuredSource` returns `true` for every path                                                              | `measures neither a test file nor a declaration file`                   | Two findings where none were expected                                                                                                    |
| B7  | In `underOneRoot`, replace the whole predicate with `path.startsWith(root)`                                   | `measures nothing outside the declared roots`                           | One finding for `src2/big.ts` where none was expected                                                                                    |
| B8  | Remove the `roots.length === 0` clause from `SizeCeilingsRecord`'s narrow                                     | `refuses a size policy with no root, a repeated root or a repeated pin` | No `at least one measured root` in stderr                                                                                                |
| B9a | Remove only the duplicate-root `if` block from `SizeCeilingsRecord`'s narrow; retain the duplicate-pin check. | `refuses a size policy with no root, a repeated root or a repeated pin` | The repeated-root stderr assertion fails because `unique measured roots` is absent.                                                      |
| B9b | Retain the duplicate-root check; replace the final duplicate-pin ternary return with `return true;`.          | the same test                                                           | The empty-root and repeated-root cases pass; the repeated-pin stderr assertion fails because `unique pinned paths` is absent.            |
| B10 | Remove the `policy.sizeCeilings` disjunct from `assertPolicyInputs`                                           | `refuses F7 when the policy states no size ceilings`                    | Stderr lacks `rule F7 needs policy.sizeCeilings`. The registry fallback still exits 1, so **the sentence is the proof, not the status**. |

Execute B9a and B9b independently, restoring and confirming green between them. Save separate patches and logs and record both observations beside their respective checks. These are two mutations of the existing test; the test-count delta remains `+11`.

### B.5 Part B verification

A.6's table, with `N + 11` tests, `0 fail`, and `passed` equal to `P`. Fill part B's section of
`verify.md` before handing over.

### B.6 Ready to commit

Subject: `feat(bureaucrat): add the F7 file size ratchet rule`

Paths: `apps/wiki/cli/src/rules/size-ratchet.ts`, `apps/wiki/cli/src/rules/registry.ts`,
`apps/wiki/cli/src/rules/rule.ts`, `apps/wiki/cli/src/rules/rule-policy.ts`,
`apps/wiki/cli/src/rules/check.ts`, `apps/wiki/cli/src/rules/rules.test.ts`,
`openspec/changes/twilight-bureaucrat-kind-rules/verify.md`. Report what `git status` actually shows.

### B.7 Part B stop conditions

1. `size-ratchet.ts` already exists, or part A's changes are absent.
2. The baseline run reports any failure.
3. A measured line count differs from the fixture's requested size: the fixture writer is wrong, not
   `countLines`. Report both numbers.
4. A named negative's test passes under the fault, fails with a different message, or does not
   compile.

---

## Part C — kind resolution and `MOD-LAYOUT`

Starts from the committed part B. **Adds ten tests; the delta is `+10`.**

### C.1 Preparation

- [ ] A.1's three blocks, with these checks: tree clean; `ls apps/wiki/cli/src/rules/size-ratchet.ts`
      succeeds; an explicit conditional that stops if `apps/wiki/cli/src/rules/kinds.ts` exists.
      Record `N` and `P`. **Part C ends at `N + 10` tests and `P` unchanged.**
- [ ] Part B already added `KindSpecSource` to `registry.ts`, the `sizeCeilings` policy field and
      the mapped enforcement policy in `rules.test.ts`. **Preserve all three.** Part C needs **no**
      rule policy schema change: `MOD-LAYOUT` declares only `candidate.entries`.

### C.2 Tests first

- [ ] **First create `apps/wiki/cli/src/rules/kinds.ts` as a skeleton**: every exported type and
      interface of §6.4 verbatim, and `resolveKinds` and `moduleLayoutObservations` with their full
      §6.4 signatures and the body `throw new Error('kind resolution is not implemented');`. Without
      it, `rules.test.ts`'s module-scope `import` of `./kinds` cannot resolve and **the whole file
      fails to collect**, so parts A and B's tests stop running and no red is observed for anything. A
      collection failure is not a test failure.

- [ ] Add an in-process `describe('kind resolution', ...)` importing `resolveKinds` and
      `type ServiceKind` from `./kinds` and `type CandidateEntry` from `../inventory/read-candidate`.
      These four tests spawn nothing, so they carry **no** timeout.

  ```ts
  const kindEntry = (path: string): CandidateEntry => ({
    path,
    mode: '100644',
    blob: '0'.repeat(40),
  });
  const kindsOf = (paths: string[]): [string, ServiceKind, string][] =>
    resolveKinds(paths.map(kindEntry)).files.map((file) => [file.path, file.kind, file.module]);
  ```

  | Title, and the `-t` pattern                             | Paths                                                          | Assert                                                                                           |
  | ------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
  | `reads a kind from the filename suffix`                 | `m/a.feature.ts`, `m/b.resource.ts`, `m/c.repository.ts`       | `kindsOf` equals the three tuples with kinds `feature`, `resource`, `repository`, all module `m` |
  | `does not read a kind from a test file`                 | `m/a.feature.ts`, `m/a.feature.test.ts`                        | `kindsOf` has length 1 and its only path is `m/a.feature.ts`                                     |
  | `calls a file under a module's view directory delivery` | `m/a.feature.ts`, `m/view/panel.tsx`, `m/view/deep/row.tsx`    | see the two paragraphs below this table                                                          |
  | `assigns a file to its nearest module`                  | `m/a.feature.ts`, `m/inner/b.feature.ts`, `m/inner/view/x.tsx` | `x.tsx` has module `m/inner`, and `resolveKinds(...).moduleRoots` equals `['m', 'm/inner']`      |

  **`calls a file under a module's view directory delivery` asserts each view path on its own**, so
  that losing the direct half of the view condition and losing the descendant half give different
  diagnostics. Do not fold the three tuples into one `toEqual`:

  ```ts
  const nested = kindsOf(['m/a.feature.ts', 'm/view/panel.tsx', 'm/view/deep/row.tsx']);
  expect(nested).toContainEqual(['m/view/panel.tsx', 'delivery', 'm']);
  expect(nested).toContainEqual(['m/view/deep/row.tsx', 'delivery', 'm']);
  expect(nested).toHaveLength(3);
  ```

  **The same test then extends to the candidate root**, because a module at the root is the path the
  resolution code gets wrong when `''` is joined with a slash:

  ```ts
  const graph = resolveKinds(
    [
      'a.feature.ts',
      'composition.ts',
      'view/panel.tsx',
      'view/deep/row.tsx',
      'inner/b.feature.ts',
      'inner/view/x.tsx',
    ].map(kindEntry),
  );
  const moduleOfPath = (path: string): string | undefined =>
    graph.files.find((file) => file.path === path)?.module;
  expect(moduleOfPath('view/panel.tsx')).toBe('');
  expect(moduleOfPath('view/deep/row.tsx')).toBe('');
  expect(moduleOfPath('inner/view/x.tsx')).toBe('inner');
  expect(graph.compositionRoots).toEqual(['composition.ts']);
  expect(graph.files.map((file) => file.path)).not.toContain('composition.ts');
  ```

- [ ] Add `describe('MOD-LAYOUT', ...)` with six CLI tests, each carrying `15_000` and each running
      `check committed <repository> <revision> <policy> --rule MOD-LAYOUT` with
      `writeRulePolicy(everyRuleObserving)`. Add this fixture helper, which builds a module under
      `src/m` and a root index declaring the `src` prefix, exactly as `createIndexedCandidate` does:

  ```ts
  /** A candidate holding one kinded module under `src/m`, with the module's own files chosen. */
  function createModuleCandidate(options: {
    moduleReadme?: string;
    contractMode?: 'regular' | 'symlink' | 'absent';
  }): { repository: string; revision: string } {
    const repository = initRepository('twilight-rules-module-');
    write(repository, 'src/m/m.feature.ts', 'export const value = 1;\n');
    if (options.contractMode === 'regular')
      write(repository, 'src/m/contract.ts', 'export const c = 1;\n');
    if (options.contractMode === 'symlink') {
      write(repository, 'src/elsewhere.ts', 'export const e = 1;\n');
      symlinkSync('../elsewhere.ts', join(repository, 'src/m/contract.ts'));
    }
    if (options.moduleReadme !== undefined)
      write(repository, 'src/m/README.md', options.moduleReadme);
    write(
      repository,
      'README.md',
      indexSource('Module fixture', 'module.root', [
        { kind: 'directory-prefix', prefix: 'src', exclusions: [] },
      ]),
    );
    return { repository, revision: commit(repository, 'module fixture') };
  }
  ```

  `symlinkSync` joins the existing `node:fs` import and `join` the existing `node:path` import. The
  fixture writer already runs `git add --all`, which records a symlink with mode `120000`.

  | Title, and the `-t` pattern                                | `createModuleCandidate` options                                                         | Assert                                                                                                                                       |
  | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
  | `allows a module that declares its index and its contract` | the **valid module README** below, `contractMode: 'regular'`                            | exit 0; `findings: []`; `unevaluated: []`                                                                                                    |
  | `allows a module at the candidate root`                    | `createRootModuleCandidate()` below, not `createModuleCandidate`                        | exit 0; `findings: []`; `unevaluated: []`; `allowed: true`                                                                                   |
  | `names a module directory that declares no contract`       | the **no-contract module README** below, `contractMode: 'absent'`                       | one finding: `path` `src/m`, `message` `module directory declares no contract file`, `effect` `debt`                                         |
  | `names a module directory that declares no wiki index`     | `moduleReadme: '# Module\n\nOrdinary prose, no metadata.\n'`, `contractMode: 'regular'` | one finding: `path` `src/m`, `message` `module directory declares no wiki index`                                                             |
  | `names a module whose contract is a symlink`               | the valid module README, `contractMode: 'symlink'`                                      | the finding `module directory declares no contract file`                                                                                     |
  | `refuses a candidate whose index metadata is malformed`    | `moduleReadme: '# M\n\n<!-- module-index {not json} -->\n'`, `contractMode: 'regular'`  | exit 1; `findings: []`; `unevaluated` names `MOD-LAYOUT` with a reason beginning `the index report is unavailable: index metadata malformed` |

  **The module README's memberships are relative to the declaring README, not to the candidate
  root.** `joinIndexPath` (`apps/wiki/cli/src/indexes/check-indexes.ts:32-38`) joins each declared
  local path onto the index's own directory, so a `src/m/README.md` declaring the prefix `src/m`
  asks for `src/m/src/m` and `checkIndexes` throws `membership target absent: src/m/src/m` — which
  would leave `MOD-LAYOUT` unevaluated and prove nothing. Keep the **root** index's `src` prefix and
  the symlink fixture's target as §C.2's helper writes them, and use these two module READMEs:

  ```ts
  // For `allows a module that declares its index and its contract` and
  // `names a module whose contract is a symlink`:
  indexSource('M', 'module.m', [
    { kind: 'path', path: 'm.feature.ts' },
    { kind: 'path', path: 'contract.ts' },
  ]);
  // For `names a module directory that declares no contract`:
  indexSource('M', 'module.m', [{ kind: 'path', path: 'm.feature.ts' }]);
  ```

  and add this second fixture beside `createModuleCandidate`, for the candidate-root test. Its
  README is the candidate's only index and declares the two root files it owns:

  ```ts
  /** A candidate whose kinded module IS the candidate root. */
  function createRootModuleCandidate(): { repository: string; revision: string } {
    const repository = initRepository('twilight-rules-root-module-');
    write(repository, 'a.feature.ts', 'export const value = 1;\n');
    write(repository, 'contract.ts', 'export const c = 1;\n');
    write(
      repository,
      'README.md',
      indexSource('Root module fixture', 'module.rootmodule', [
        { kind: 'path', path: 'a.feature.ts' },
        { kind: 'path', path: 'contract.ts' },
      ]),
    );
    return { repository, revision: commit(repository, 'root module fixture') };
  }
  ```

  **`MOD-LAYOUT` is not skipped when the index check fails.** `checkCandidate` stores the index
  outcome in the context and runs every selected rule regardless; `MOD-LAYOUT` reports itself
  unevaluated, which the last row asserts. Do not treat that fixture's refusal as stop condition 3.

- [ ] Update all five sites of §6.8 for `MOD-LAYOUT`. It needs no new policy input, so
      `writeCompleteRulePolicy` gains only its mode.
- [ ] Run the rules test file. **Two different reds, recorded separately**: the four in-process tests
      fail with `kind resolution is not implemented`; the six CLI tests fail with
      `rule policy names an unregistered rule: MOD-LAYOUT`. The file must still **collect**; a
      module-resolution error instead of test failures means the skeleton was not written.

### C.3 Implementation

- [ ] Fill the two bodies in `kinds.ts` exactly as §6.4, keeping the skeleton's signatures. §6.4
      includes `modulePath`; take it verbatim, and with it the `root !== ''` exemption in `moduleOf`,
      the `modulePath(module, CompositionRootName)` comparison, the `const view` binding, the two
      `modulePath(root, ...)` layout lookups and `path: root === '' ? '.' : root`. `''` stays the
      internal candidate-root module identifier and is never rewritten inside `resolveKinds`.
- [ ] **Do not copy §6.4's or §6.7's placeholder `Proof:` comments verbatim.** Omit the
      composition-root proof comment entirely: it describes D3, which part D observes, not part C.
      Write the view-branch comment only after observing C2a and C2b, and every other part C proof
      comment only after observing its own fault, naming the mismatch you actually saw. A comment
      claiming a K2 or K3 finding is a claim part C cannot make: those rules are not registered
      until parts D and E.
- [ ] Add `readonly kinds: KindGraph;` to `RuleContext` with its `import type`, and add
      `kinds: resolveKinds(candidate.entries),` to `check.ts`'s context literal, per §6.6.
- [ ] Register `moduleLayoutRule` **exactly as §6.7 gives it** — three arguments to
      `moduleLayoutObservations` and an index-outcome branch — and add it to the `rules` array. A
      two-argument call is a type error.
- [ ] Run the rules test file. Expected: `N + 10` tests, `0 fail`.
- [ ] Run the type check; this part widens `RuleContext`.

### C.4 Negative proofs

For part C the final column describes an **assertion mismatch, not a literal log sentence**. In
§0.4 step 4, replace the final `grep -F` command with `cat "$TMPDIR/evidence/P<n>.log"`. Preserve
the status capture, the restoration, the `cmp` and the nonzero-status assertion. Confirm that the
named test ran and failed at the assertion demonstrating the specified mismatch; a collection error,
a timeout and an unrelated failure do not count. Record the actual matcher diagnostic with its
expected and received values. C7 may fail first on exit status, expected 1 and received 0; do not
claim that subsequent assertions ran. Preamble rule 16 governs additional failing tests.

Run each row independently: restore and confirm green between rows, and save a separate patch and
log for each. C1, C2a, C2b, C3 and C8a mutate `resolveKinds` or `moduleOf` and are observed
**in process**; C4 to C7 and C8b are observed through the **production CLI**. None of C2a, C2b,
C8a or C8b adds a test.

The "required mismatch" column was **observed** on 2026-09-20 by rehearsing part C in a worktree at
this packet's part B head, under §0.2's command with Bun 1.4.2. Expect these exact matcher
diagnostics; a different one is a stop.

| #   | Fault                                                                                                                                                                      | Named test                                              | Required mismatch                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `KindSuffix` becomes `/\.(feature\|repository\|resource)\./` — the **loose** form                                                                                          | `does not read a kind from a test file`                 | `expect(received).toHaveLength(expected)`, `Expected length: 1`, `Received length: 2`. Removing only the `$` is inert (fact 30)        |
| C2a | Keep only the descendant half of the view condition: `directory.startsWith(\`${view}/\`)`                                                                                  | `calls a file under a module's view directory delivery` | `toContainEqual`, `Expected to contain: [ "m/view/panel.tsx", "delivery", "m" ]`; received holds the feature and `m/view/deep/row.tsx` |
| C2b | Keep only the direct half: `directory === view`                                                                                                                            | Same test                                               | `toContainEqual`, `Expected to contain: [ "m/view/deep/row.tsx", "delivery", "m" ]`; received holds the feature and `m/view/panel.tsx` |
| C3  | `moduleOf` keeps the first match instead of the longest                                                                                                                    | `assigns a file to its nearest module`                  | `toBe`, `Expected: "m/inner"`, `Received: undefined` — module `m` puts the file outside `m/view`, so it receives no kind at all        |
| C4  | Delete the `contract.ts` requirement from `moduleLayoutObservations`                                                                                                       | `names a module directory that declares no contract`    | `toEqual`, expected the one `module directory declares no contract file` finding at `src/m`, `Received + 1`: `[]`                      |
| C5  | Replace `indexPaths.has(...)` with a lookup in `regularFiles`, so any entry named `README.md` counts                                                                       | `names a module directory that declares no wiki index`  | `toEqual`, expected the one `module directory declares no wiki index` finding at `src/m`, `Received + 1`: `[]`                         |
| C6  | Drop the regular-file filter that builds `moduleLayoutObservations`'s `regularFiles`, so any entry may stand for the contract. **Retain `resolveKinds`'s own mode filter** | `names a module whose contract is a symlink`            | `toContain`, `Expected to contain: "module directory declares no contract file"`, `Received: []`                                       |
| C7  | In `moduleLayoutRule`, return `{ kind: 'observed', observations: [] }` when `indexes` is not ok                                                                            | `refuses a candidate whose index metadata is malformed` | `toBe`, `Expected: 1`, `Received: 0` — the exit-status assertion, which is reached first. The `unevaluated` assertions never ran       |
| C8a | Restore the old `moduleOf` containment guard: drop `root !== '' &&`                                                                                                        | `calls a file under a module's view directory delivery` | `toBe`, `Expected: ""`, `Received: undefined` — `view/panel.tsx` loses its module, so the candidate-root delivery files disappear      |
| C8b | `modulePath` always returns `` `${root}/${name}` ``                                                                                                                        | `allows a module at the candidate root`                 | `toEqual`, `Expected: []`, received two findings at `path: "."`, `module directory declares no wiki index` and `...no contract file`   |

### C.5 Part C verification

A.6's table, with `N + 10` tests, `0 fail`, and `passed` equal to `P`. Fill part C's section of
`verify.md` before handing over.

### C.6 Ready to commit

Subject: `feat(bureaucrat): resolve service kinds and check the module layout`

Paths: `apps/wiki/cli/src/rules/kinds.ts`, `apps/wiki/cli/src/rules/registry.ts`,
`apps/wiki/cli/src/rules/rule.ts`, `apps/wiki/cli/src/rules/check.ts`,
`apps/wiki/cli/src/rules/rules.test.ts`, `apps/wiki/cli/src/packaging/build.test.ts` (section 0.5a: the
`MOD-LAYOUT` mode), `openspec/changes/twilight-bureaucrat-kind-rules/verify.md`.
Report what `git status` actually shows.

### C.7 Part C stop conditions

1. `kinds.ts` or `direction.ts` already exists, or part B's files are absent.
2. The baseline run reports any failure.
3. The module-index check refuses a fixture **other than** the deliberately malformed one — for
   example with `membership target absent`. Report the refusal; the fixture's index is wrong, and
   the rule is not the thing to change. C.2 states why a module README's memberships are local.
4. A named negative's test passes under the fault, fails with a **different mismatch** than C.4's
   "required mismatch" column states, or does not compile. C.4, not §0.4's `grep -F`, defines what
   the mismatch is for part C, and preamble rule 16 governs additional failing tests: record them
   and go on.

---

## Part D — the direction machinery, `K3` and `K4`

Starts from the committed part C. This part rewrites the existing `REL-EXTRACT` rule; read §6.6
before editing. **Adds seven tests; the delta is `+7`.**

### D.1 Preparation

- [ ] A.1's three blocks, with these checks: tree clean; `ls apps/wiki/cli/src/rules/kinds.ts`
      succeeds; an explicit conditional that stops if `apps/wiki/cli/src/rules/direction.ts` exists.
      Record `N` and `P`. **Part D ends at `N + 7` tests and `P` unchanged.**

### D.2 The fixture and the environment helper

Every direction test needs a candidate that relationship extraction accepts: `nx.json`,
`package.json`, a `tsconfig.json` that typechecks, one root index declaring everything, and an
entrypoint that exists.

- [ ] Add:

  ```ts
  /**
   * A candidate whose `src` tree holds the sources the caller supplies. It carries `nx.json`,
   * `package.json` and a `tsconfig.json`, because relationship extraction refuses a candidate with no
   * Nx workspace file and throws on any type error.
   */
  function createKindedCandidate(sources: Record<string, string>): {
    repository: string;
    revision: string;
  } {
    const repository = initRepository('twilight-rules-kinds-');
    write(repository, 'nx.json', '{"$schema":"./node_modules/nx/schemas/nx-schema.json"}\n');
    write(repository, 'package.json', '{"name":"kinds-fixture","private":true}\n');
    write(
      repository,
      'tsconfig.json',
      '{"compilerOptions":{"strict":true,"module":"ESNext","moduleResolution":"bundler","target":"ES2022"}}\n',
    );
    // The entrypoint exports a constant and imports nothing. The import graph comes from every file
    // the tsconfig includes, not from what the entrypoint reaches, so no test needs it to name a module.
    write(repository, 'src/entry.ts', 'export const entry = 1;\n');
    for (const [path, source] of Object.entries(sources)) write(repository, path, source);
    write(
      repository,
      'README.md',
      indexSource('Kinds fixture', 'module.kinds', [
        { kind: 'path', path: 'nx.json' },
        { kind: 'path', path: 'package.json' },
        { kind: 'path', path: 'tsconfig.json' },
        { kind: 'directory-prefix', prefix: 'src', exclusions: [] },
      ]),
    );
    return { repository, revision: commit(repository, 'kinded fixture') };
  }

  /** `runCli` with an overridden child environment. `runCli` itself is unchanged. */
  function runCliWithEnv(
    argv: string[],
    env: Record<string, string | undefined>,
  ): ReturnType<typeof Bun.spawnSync> {
    return Bun.spawnSync([process.execPath, 'run', cliPath, ...argv], {
      cwd: import.meta.dir,
      env: { ...process.env, ...env },
      stderr: 'pipe',
      stdout: 'pipe',
    });
  }
  ```

  The policy is `writeCompleteRulePolicy(everyRuleObserving)`, which already supplies a
  `relationshipRequest` naming `tsconfig.json` and `src/entry.ts`.

  **Every fixture file must typecheck under `strict`.** A type error or an unresolved specifier makes
  extraction throw and the rule report itself unevaluated instead of producing a finding. An **unused
  import is harmless**: `noUnusedLocals` is set nowhere (fact 29). Give each file a used export
  anyway, because an import the compiler elides produces no edge.

### D.3 Tests first

- [ ] Add `describe('K3 and K4', ...)` with these seven tests, each carrying `30_000`, because each
      pays for a whole-program typecheck. All but the last run through `runCli`.

  | Title, and the `-t` pattern                                 | `sources`                                                                                                                                                                                       | Rule | Assert                                                                                                                                                                                                                     |
  | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `names a feature-service that imports a repository`         | `src/m/m.repository.ts`: `export const store = { read: (): number => 1 };` • `src/m/m.feature.ts`: `import { store } from './m.repository';` + `export const run = (): number => store.read();` | K3   | one finding: `path` `src/m/m.feature.ts`, `subject` `src/m/m.repository.ts`, `message` `feature imports repository src/m/m.repository.ts through './m.repository'`                                                         |
  | `sees a repository through a barrel a feature imports`      | the repository above • `src/m/barrel.ts`: `export * from './m.repository';` • the feature importing `'./barrel'` instead                                                                        | K3   | one finding with the same `path` and `subject` and `message` `feature imports repository src/m/m.repository.ts through './barrel'` — **observed verbatim on 2026-09-20**                                                   |
  | `names a feature-service that imports a delivery component` | `src/m/view/panel.ts`: `export const panel = 1;` • `src/m/m.feature.ts`: `import { panel } from './view/panel';` + `export const run = (): number => panel;`                                    | K3   | one finding, `message` `feature imports delivery src/m/view/panel.ts through './view/panel'` — **observed verbatim**                                                                                                       |
  | `allows a feature-service that imports a resource-service`  | `src/m/m.resource.ts`: `export const load = (): number => 1;` • `src/m/m.feature.ts` importing and calling it                                                                                   | K3   | exit 0; `findings: []`; `unevaluated: []`                                                                                                                                                                                  |
  | `names a resource-service that imports a feature-service`   | `src/m/m.feature.ts`: `export const run = (): number => 1;` • `src/m/m.resource.ts` importing and calling it                                                                                    | K4   | one finding: `path` `src/m/m.resource.ts`, `subject` `src/m/m.feature.ts`                                                                                                                                                  |
  | `exempts a composition root that imports every kind`        | all three kinds, **none importing another** • `src/m/composition.ts` importing and using each                                                                                                   | K3   | exit 0; `findings: []`                                                                                                                                                                                                     |
  | `refuses K3 when the trusted modules are unconfigured`      | the first row's two files                                                                                                                                                                       | K3   | through `runCliWithEnv(argv, { TOOL_WIKI_TRUSTED_NODE_MODULES: '' })`: exit 1; `allowed` false; `findings: []`; `unevaluated` equals `[{ ruleId: 'K3', reason: 'trusted TypeScript runtime modules are not configured' }]` |

  In the composition test the feature must not itself import the repository, or K3 fires on the
  feature and the test proves nothing. The last test **passes before any mutation**, because
  extraction already throws in that environment; D4 mutates `graphRule` and watches it fail.

- [ ] Update all five sites of §6.8 for `K3` and `K4`. `writeCompleteRulePolicy` already carries a
      `relationshipRequest`, so nothing else changes there.
- [ ] Run the rules test file. Expected: all seven fail with
      `rule policy names an unregistered rule: K3`.

### D.4 Implementation

- [ ] Create `apps/wiki/cli/src/rules/direction.ts` with §6.5's part-D half: `ImportEdge`,
      `ReExportKinds`, `ReactTargets`, `ReactScopePrefix`, `reachedTargets`, `Direction`,
      `kindedByPath`, `sorted`, `directionObservations` and `sidewaysObservations`. Write
      `directionObservations`'s guard as `if (source?.kind !== direction.from) continue;`: the
      two-clause form is refused by `lint:source` with `@typescript-eslint/prefer-optional-chain`,
      observed on 2026-09-20.
- [ ] Apply §6.6's part-D half to `rule.ts` and `check.ts`: `RelationshipReport`, the
      `relationships()` method, `readRelationshipOutcome`, the memo, and `relationships,` **in the
      context literal**. Omitting that one line leaves the object missing a required member and the
      type check fails.
- [ ] Rewrite `REL-EXTRACT` to read `context.relationships()`, per §6.6, keeping its observations and
      its `Proof:` comment.
- [ ] Add `graphRule`, `DirectionAnchor`, `GraphInputs` and `directionRule` from §6.7, and register
      `K3` with `forbidden: ['repository', 'delivery']` and `K4` with
      `forbidden: ['feature', 'delivery']`. Add both to the `rules` array.
- [ ] Add **no** composition-root guard. §6.5 has none: the exemption is a composition root's absence
      from `KindGraph.files`, and a guard would be unreachable (fact 30).
- [ ] Run the rules test file. Expected: `N + 7` tests, `0 fail`, and in particular
      `reports a declared relationship that the candidate leaves unresolved` still passes. If that one
      fails, **stop**: the refactor changed behaviour.
- [ ] Run the type check; this part adds a function-typed interface member.

### D.5 Negative proofs

| #   | Fault                                                                                                                                            | Named test                                                  | Expected failing line                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | In `reachedTargets`, return `[target]` and never expand re-exports                                                                               | `sees a repository through a barrel a feature imports`      | `findings: []` where one K3 finding was expected                                                                                                                                                                         |
| D2  | In `directionObservations`, drop the `direction.forbidden.includes(...)` test                                                                    | `allows a feature-service that imports a resource-service`  | Unexpected findings in a verdict that **still exits 0**: the rule is observing, so the extra finding is debt. The failing assertion is `findings` not being `[]`, never the status.                                      |
| D3  | In `resolveKinds` (`kinds.ts`), push the composition root into `files` as `{ path, kind: 'feature', module }` instead of into `compositionRoots` | `exempts a composition root that imports every kind`        | One K3 finding with `path` `src/m/composition.ts` where none was expected. **Deleting a guard proves nothing**: a composition root never enters `files`, so a probe returned `[]` either way (fact 30).                  |
| D4  | In `graphRule`, return `{ kind: 'observed', observations: [] }` when the outcome is not ok                                                       | `refuses K3 when the trusted modules are unconfigured`      | Exit 0 with `allowed: true` and `unevaluated: []`, where exit 1 and the named reason were expected. That test supplies the empty variable itself through `runCliWithEnv`; every other command in this part keeps it set. |
| D5  | Remove `'delivery'` from K3's `forbidden` list                                                                                                   | `names a feature-service that imports a delivery component` | `findings: []`                                                                                                                                                                                                           |
| D6  | In `directionRule`'s K4 entry, remove `'feature'` from `forbidden`                                                                               | `names a resource-service that imports a feature-service`   | `findings: []`                                                                                                                                                                                                           |

D3's proof comment belongs beside the composition-root branch in `kinds.ts`, so **`kinds.ts` is in
part D's handover**.

Memoizing extraction is a cost, not a check: it changes no verdict and carries no proof.

### D.6 Part D verification

A.6's table, with `N + 7` tests, `0 fail`, `passed` equal to `P`, and the type check, which is
required in this slice. Fill part D's section of `verify.md` before handing over.

### D.7 Ready to commit

Subject: `feat(bureaucrat): judge K3 and K4 on the extracted import graph`

Paths: `apps/wiki/cli/src/rules/direction.ts`, `apps/wiki/cli/src/rules/kinds.ts`,
`apps/wiki/cli/src/rules/registry.ts`, `apps/wiki/cli/src/rules/rule.ts`,
`apps/wiki/cli/src/rules/check.ts`, `apps/wiki/cli/src/rules/rules.test.ts`,
`openspec/changes/twilight-bureaucrat-kind-rules/verify.md`. Report what `git status` actually shows.

### D.8 Part D stop conditions

1. `direction.ts` already exists, or part C's files are absent.
2. The baseline run reports any failure.
3. `reports a declared relationship that the candidate leaves unresolved` fails after the
   `REL-EXTRACT` rewrite.
4. A fixture makes extraction throw a TypeScript diagnostic. Fix the fixture's types; never relax
   `strict` and never change a rule to swallow it. If it cannot be fixed in three attempts, stop and
   report the message.
5. A direction test exceeds its 30 second timeout. Report the measured time; do not raise it past
   `60_000` without reporting.

---

## Part E — `K2`, `K5`, `K6`, `F1`, the README and the record

Starts from the committed part D. **Adds ten tests; the delta is `+10`.** Unlike the earlier
revision, this part carries its own schema, policy-input, context and propagation steps: `F1` needs a
policy field that does not exist yet, and registering it without that field would make every F1
fixture fail undeclared-key validation.

### E.1 Preparation

- [ ] A.1's three blocks, with these checks: tree clean; `ls apps/wiki/cli/src/rules/direction.ts`
      succeeds. Record `N` and `P`. **Part E ends at `N + 11` tests and `P` unchanged.**

### E.2 The trusted fixture directory

The scoped React package is not installed (fact 24), but `TOOL_WIKI_TRUSTED_NODE_MODULES` is an
ordinary directory the caller chooses, so a fixture can supply one. **Executed on 2026-09-20**, this
made the production CLI report
`resource imports external:@tanstack/react-query through '@tanstack/react-query'`.

- [ ] Add, beside the other helpers:

  ```ts
  /**
   * A trusted modules directory holding the real TypeScript runtime plus a minimal scoped package, so
   * a fixture can import `@tanstack/react-query` and have it resolve as an external library.
   */
  function createTrustedModules(): string {
    const modules = scratch('twilight-rules-modules-');
    symlinkSync(
      join(import.meta.dir, '..', '..', '..', '..', '..', 'node_modules', 'typescript'),
      join(modules, 'typescript'),
    );
    mkdirSync(join(modules, '@tanstack', 'react-query'), { recursive: true });
    writeFileSync(
      join(modules, '@tanstack', 'react-query', 'package.json'),
      '{"name":"@tanstack/react-query","version":"0.0.0","types":"index.d.ts"}\n',
      'utf8',
    );
    writeFileSync(
      join(modules, '@tanstack', 'react-query', 'index.d.ts'),
      'export declare const useQuery: () => number;\n',
      'utf8',
    );
    return modules;
  }
  ```

  `scratch` already registers the directory for the `afterEach` cleanup. `symlinkSync`, `mkdirSync`
  and `writeFileSync` come from the existing `node:fs` import; add `symlinkSync` if part C did not.
  The five `..` segments walk from `apps/wiki/cli/src/rules` to the repository root; if that path does
  not exist, stop and report rather than guessing.

### E.3 Tests first

- [ ] Add `describe('K2, K5, K6 and F1', ...)` with these ten tests, each on `createKindedCandidate`
      and each carrying `30_000`. The policy is `writeCompleteRulePolicy(everyRuleObserving)` unless a
      row names an override, which goes through `writeRulePolicy`'s `extra`.

  | Title, and the `-t` pattern                                       | `sources`                                                                                                                                               | Rule | Assert                                                                                                                                                                                                                                                                             |
  | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `names a delivery component that imports a resource-service`      | `src/m/m.resource.ts` exporting `load` • `src/m/view/panel.ts` importing and calling it                                                                 | K2   | one finding: `path` `src/m/view/panel.ts`, `subject` `src/m/m.resource.ts`                                                                                                                                                                                                         |
  | `allows a delivery component that imports its feature-service`    | `src/m/m.feature.ts` exporting `run` • `src/m/view/panel.ts` importing and calling it                                                                   | K2   | exit 0; `findings: []`                                                                                                                                                                                                                                                             |
  | `names a repository adapter that imports a resource-service`      | `src/m/m.resource.ts` exporting `load` • `src/m/m.repository.ts` importing and calling it                                                               | K5   | one finding: `path` `src/m/m.repository.ts`                                                                                                                                                                                                                                        |
  | `names a feature that imports another module's feature`           | `src/a/a.feature.ts` exporting `run` • `src/b/b.feature.ts`: `import { run } from '../a/a.feature';` + a use                                            | K6   | one finding: `path` `src/b/b.feature.ts`, `message` `feature in src/b imports feature in src/a`                                                                                                                                                                                    |
  | `allows two files of one kind inside one module`                  | `src/m/one.feature.ts` exporting `run` • `src/m/two.feature.ts` importing and calling it                                                                | K6   | exit 0; `findings: []`                                                                                                                                                                                                                                                             |
  | `names a store the policy declares plain TypeScript`              | `src/m/m.feature.ts` exporting `run` • `src/m/store.ts`: `import type { ReactNode } from 'react';` + `export const s = (n: ReactNode): ReactNode => n;` | F1   | override `plainTypeScriptPaths: [{ kind: 'path', value: 'src/m/store.ts' }]`; one finding: `path` `src/m/store.ts`, `subject` `external:react`, `message` `declared plain TypeScript imports external:react through 'react'` — **observed verbatim**                               |
  | `names a service that imports a scoped React package`             | `src/m/m.resource.ts`: `import { useQuery } from '@tanstack/react-query';` + `export const r = (): number => useQuery();`                               | F1   | through `runCliWithEnv(argv, { TOOL_WIKI_TRUSTED_NODE_MODULES: createTrustedModules() })`; one finding: `subject` `external:@tanstack/react-query`, `message` `resource imports external:@tanstack/react-query through '@tanstack/react-query'` — **observed verbatim**            |
  | `exempts delivery from the framework boundary`                    | `src/m/m.feature.ts` exporting `run` • `src/m/view/panel.ts` importing `react` and using `ReactNode`                                                    | F1   | override `plainTypeScriptPaths: []`; exit 0; `findings: []`                                                                                                                                                                                                                        |
  | `refuses a plain TypeScript selector the candidate does not hold` | `src/m/m.feature.ts` only                                                                                                                               | F1   | override `plainTypeScriptPaths: [{ kind: 'path', value: 'src/m/store.ts' }]`; exit 1; `findings: []`; `unevaluated` names `F1` with reason `the rule policy declares plain TypeScript at src/m/store.ts, which the candidate does not contain`                                     |
  | `prints the registry record for a kind rule`                      | `createIndexedCandidate()`; no check runs                                                                                                               | —    | `explain K3` exits 0 and prints exactly `id` `K3`, `family` `relationships`, `statement` and `source` from §6.7, `inputs` `['candidate.entries', 'policy.relationshipRequest']`; and `explain F1` prints `family` `code-shape`. Two CLI runs, no extraction, so `15_000` suffices. |

  The last row is the check that every `statement` and `source` anchor is what §6.7 and §9 say. Fix
  the registry to match the packet, never the test.

- [ ] Add one more test to the same describe, titled
      `refuses F1 when the policy declares no plain TypeScript paths`: `createKindedCandidate({ 'src/m/m.feature.ts': 'export const run = (): number => 1;\n' })`,
      policy `writeRulePolicy(everyRuleObserving)` with **no** `plainTypeScriptPaths`, `--rule F1`,
      expecting exit 1 and
      `rule F1 needs policy.plainTypeScriptPaths, which the rule policy omits` in stderr. With the
      ten above that makes **eleven** tests, which is E.1's `+11`. Report the number the run actually
      gives, never this arithmetic.

- [ ] Update all five sites of §6.8 for `K2`, `K5`, `K6` and `F1`. After this part the
      `explain NO-SUCH-RULE` string is
      `unknown rule: NO-SUCH-RULE (registered: F1, F7, INV-CLASSIFY, K2, K3, K4, K5, K6, MOD-DIRECT-ENTRIES, MOD-INDEX, MOD-LAYOUT, REL-EXTRACT)`
      and `verdict.ruleIds` is that list in that order. `writeCompleteRulePolicy` gains
      `plainTypeScriptPaths: []`, without which `assertPolicyInputs` refuses every check selecting
      `F1`, including the canonical all-rules test.
- [ ] Run the rules test file. Expected: every new test fails, those whose policy carries
      `plainTypeScriptPaths` at the schema with `plainTypeScriptPaths must be removed`, and the rest
      with `rule policy names an unregistered rule: F1` or `: K2`. Record which gave which.

### E.4 Implementation

This part owns its own edits to `rule-policy.ts`, `rule.ts`, `check.ts` and `direction.ts`; the file
plan and E.8 list all four.

- [ ] In `rule-policy.ts`: add `PlainSelectorRecord` and the `'plainTypeScriptPaths?'` field from
      §6.2, and add the `policy.plainTypeScriptPaths` disjunct to `assertPolicyInputs`.
- [ ] In `direction.ts`: add `PlainSelector`, `SelectorOutcome`, `resolvePlainSelectors`,
      `matchesSelector` and `reactObservations` from §6.5.
- [ ] In `rule.ts`: add `readonly plainTypeScriptPaths?: readonly PlainSelector[];` to `RuleContext`
      with its `import type { PlainSelector } from './direction';`.
- [ ] In `check.ts`: add the `plainTypeScriptPaths` spread to the context literal, per §6.6.
- [ ] Register `K2`, `K5`, `K6` and `plainTypeScriptRule` from §6.7 and add them to the `rules` array.
- [ ] Run the rules test file. Expected: `N + 11` tests, `0 fail`.
- [ ] Run the type check; this part widens `RuleContext` again.

### E.5 Negative proofs

| #   | Fault                                                                                | Named test                                                        | Expected failing line                                                                                                                            |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | K2's `forbidden` becomes `[]`                                                        | `names a delivery component that imports a resource-service`      | `findings: []`                                                                                                                                   |
| E2  | K5's `forbidden` becomes `['delivery']` only                                         | `names a repository adapter that imports a resource-service`      | `findings: []`                                                                                                                                   |
| E3  | In `sidewaysObservations`, make the module comparison always equal                   | `names a feature that imports another module's feature`           | `findings: []`                                                                                                                                   |
| E4  | In `sidewaysObservations`, make the module comparison always unequal                 | `allows two files of one kind inside one module`                  | One finding where none was expected                                                                                                              |
| E5  | In `reactObservations`, drop the `declaredPlain` disjunct                            | `names a store the policy declares plain TypeScript`              | `findings: []`                                                                                                                                   |
| E6  | In `reactObservations`, drop the `ReactScopePrefix` test                             | `names a service that imports a scoped React package`             | `findings: []`                                                                                                                                   |
| E7  | In `reactObservations`, drop the `source?.kind === 'delivery'` skip                  | `exempts delivery from the framework boundary`                    | One finding where none was expected                                                                                                              |
| E8  | Delete the loop body of `resolvePlainSelectors`, returning `{ ok: true }`            | `refuses a plain TypeScript selector the candidate does not hold` | Exit 0 and `unevaluated: []`                                                                                                                     |
| E9  | Remove the `policy.plainTypeScriptPaths` disjunct from `assertPolicyInputs`          | `refuses F1 when the policy declares no plain TypeScript paths`   | Stderr lacks `rule F1 needs policy.plainTypeScriptPaths`. The registry fallback still exits 1, so **the sentence is the proof, not the status**. |
| E10 | In `plainTypeScriptRule`, change `family: 'code-shape'` to `family: 'relationships'` | `prints the registry record for a kind rule`                      | `explain F1` prints `family: "relationships"`, not `code-shape`                                                                                  |

Every one of these runs the production CLI. **No proof in this packet is an in-process observation
test**, which the earlier revision wrongly claimed was unavoidable for the scoped package.

### E.6 The README

- [ ] In `apps/wiki/cli/README.md`, extend the `## Rules` section and **edit nothing else**. Locate it
      by its heading; it was lines 22 to 31 on `6484986e` and may have moved. Add after the existing
      paragraph:

  > Rules are grouped by family. The modules family checks index declarations, the direct-entry limit
  > and the module layout. The relationships family checks the kind direction rules K2 to K6 on the
  > import graph the package extracts, which resolves path aliases and follows re-exports, so a barrel
  > cannot hide the kind of the file behind it. The code-shape family checks F1, that a service, store
  > or geometry module is plain TypeScript, and F7, the file size ratchet. A rule in ratchet mode
  > refuses a finding inside the consumer's adopted set and reports one outside it as debt; refusing
  > because a file was touched needs a comparison base the verdict records, which this package does not
  > yet take.

  If packet 010.6 has already added a `## Templates` section, leave it alone and add none.

### E.7 The verification record

- [ ] Consolidate `openspec/changes/twilight-bureaucrat-kind-rules/verify.md`. Parts A to D each wrote
      their own section before handing over, so this step reads the **committed** record, adds part
      E's, and checks that every part is represented. It does not reconstruct earlier parts from
      memory: each attempt gets a new temporary root, so part A's `$TMPDIR/evidence` is gone. If a
      part's section is missing, stop and report which; the planner holds the copied evidence outside
      the repository.
- [ ] Name what was not run: the three whole targets and the host gate.
- [ ] Tick `tasks.md`'s five tasks.

### E.8 Part E verification

| Command                                                                                    | Expected                                             |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| §0.2's focused command                                                                     | Exit 0; `N + 11` tests ran, `0 fail`.                |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`                                | Exit 0.                                              |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`                              | Exit 0, no warnings.                                 |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:build`                                    | Exit 0.                                              |
| `bunx prettier --write <changed files>`, then `NX_DAEMON=false bunx nx format:check --all` | The second exits 0, no output.                       |
| The batch README's **OpenSpec validation** block                                           | One JSON report; block exits 0; `passed` equals `P`. |

### E.9 Ready to commit

Subject: `feat(bureaucrat): judge K2, K5, K6 and F1 and record slice B2`

Paths: `apps/wiki/cli/src/rules/direction.ts`, `apps/wiki/cli/src/rules/registry.ts`,
`apps/wiki/cli/src/rules/rule.ts`, `apps/wiki/cli/src/rules/rule-policy.ts`,
`apps/wiki/cli/src/rules/check.ts`, `apps/wiki/cli/src/rules/rules.test.ts`,
`apps/wiki/cli/README.md`, `openspec/changes/twilight-bureaucrat-kind-rules/tasks.md`,
`openspec/changes/twilight-bureaucrat-kind-rules/verify.md`. Report what
`git status --short --untracked-files=all` actually shows, including any file a required `Proof:`
comment touched, and reconcile any difference with this list.

### E.10 Part E stop conditions

1. Part D's files are absent.
2. The baseline run reports any failure.
3. The `explain` test's expected `statement` or `source` differs from the registry: fix the registry
   to match §6.7, never the test, and report the difference.
4. `createTrustedModules`'s path to the repository's `typescript` does not exist. Report it; do not
   search for another copy.
5. A named negative's test passes under the fault, fails with a different message, or does not
   compile.

---

## 7. Verification, all parts

Every figure is a delta over the baseline **that part** recorded in its own step 0. **This packet
states no absolute total anywhere.** Main has moved since it was written, packet 010.6 adds
Bureaucrat tests and 110.6 changes the devsync suite, so a literal would be a false stop.

| Check                                        | Who      | Expected                                                                                                                                                                                               |
| -------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §0.2's focused command                       | Executor | `+3`, `+11`, `+10`, `+7`, `+11` over each part's own recorded `N`; `0 fail` throughout.                                                                                                                |
| `twilight-bureaucrat:typecheck`              | Executor | Exit 0, in **every** part: each one moves a shared type or signature.                                                                                                                                  |
| `twilight-bureaucrat:lint:source`            | Executor | Exit 0, every part.                                                                                                                                                                                    |
| `twilight-bureaucrat:build`                  | Executor | Exit 0, part E.                                                                                                                                                                                        |
| `nx format:check --all`                      | Executor | Exit 0, every part.                                                                                                                                                                                    |
| Strict OpenSpec validation                   | Executor | `P + 1` in part A, which creates the change; `P` unchanged in B to E.                                                                                                                                  |
| **Whole `twilight-bureaucrat:test`**         | Planner  | Exit 0, plus this part's own delta over the baseline of the commit **this dispatch** started from (A `+3`, B `+11`, C `+10`, D `+7`, E `+11`); `+42` only against a baseline that precedes every part. |
| **Whole `twilight-bureaucrat:test:package`** | Planner  | Exit 0 and unchanged against that same baseline: no command and no manifest entry changes.                                                                                                             |
| **Whole `tool-devsync:test`**                | Planner  | Exit 0 and unchanged against that same baseline: this packet never touches devsync.                                                                                                                    |
| **`bin/h2puni-gate.sh <sha>`**               | Planner  | On the shared build host only. Report as not run here.                                                                                                                                                 |

**No new Nx target and no new README.** The incoming `nx.json` change that puts `CLAUDECODE=0` and
`AGENT=0` in the default of every test-running target name, the
`tools/tool-devsync/src/workspace-targets.test.ts` walk that enforces it, and the README coverage pin
in `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` that packet 110.6 may turn from a
literal into a derived value all bind nothing here. Inspect those files rather than assuming their
state, and edit neither.

**What none of it proves.** No test runs the rules over this repository (unknown U2), so nothing here
claims the repository satisfies K2 to K6, F1, F7 or the module layout. No rule is put into ratchet or
enforce mode anywhere, because no rule policy document exists (fact 25). Nothing judges a repository
**port**, an unsuffixed service, a store the policy does not name, a file the candidate touched, or
K7, K8 and K9. The verdict still never certifies.

## 8. Negative proofs, all parts

Forty-one faults: A1 to A4; B1 to B10, with B9 run as B9a and B9b; C1, C2a, C2b, C3 to C7, C8a and
C8b; D1 to D6; and E1 to E10. Each mutates production code and must be observed failing its named
test, restored by byte comparison, and only then given an adjacent dated `Proof:` comment.

**Not every one runs the production CLI.** C1, C2a, C2b, C3 and C8a exercise `resolveKinds` and
`moduleOf` directly in process; they prove the resolution, not the CLI wiring. C4 to C7 and C8b
exercise the production CLI, as do every A, B, D and E fault. Record that distinction in
`verify.md`, and never claim an observation that belongs to a later part: part C cannot see a K2 or
K3 finding, and cannot see D3's composition-root exemption.

Every patch and failing log stays under `$TMPDIR/evidence`, named after its identifier, and every row
is transcribed into `verify.md` **in the part that observed it**, because the next attempt gets a new
temporary root.

Two candidate faults carry **no** proof, and the packet says so rather than inventing one:

- Memoizing the relationship report rather than extracting per rule. It is a cost; no verdict changes.
- Reordering the `rules` array. `registeredRules()` sorts it, so nothing observable changes.

Three faults were **rewritten after a review proved the original mutation inert**, each confirmed by a
scratch probe on 2026-09-20 (fact 30): C1, where removing the regex anchor left the result unchanged;
D3, where the composition-root guard was unreachable dead code and the classification branch is the
real boundary; and the whole touched-path proof set, which is gone with the feature (§6.0).

## 9. OpenSpec

Change `twilight-bureaucrat-kind-rules`, schema `sdd-lean`, capability `bureaucrat-rules`, created in
part A. Part A also amends one requirement of the **proposed** `service-taxonomy` change, which is not
in `openspec/specs/` and is therefore not an accepted contract.

**Intent, at most 400 words.** Problem: Twilight Bureaucrat's rule model has four rules and refuses
`ratchet` by name, so the taxonomy rules this repository has decided — kind direction, the module
layout and the file size ratchet — are judged nowhere, and a repository cannot adopt them module by
module. Outcome: `ratchet` becomes usable, refusing a finding inside a consumer-supplied adopted set
and reporting the rest as debt; eight rules join the registry; K2 to K6 are judged on the extracted
import graph, which resolves path aliases and follows re-exports, so a barrel cannot hide a forbidden
kind from the check the way it hides one from lint. Non-goals: K7, K8 and K9; touched-code ratcheting,
which needs a comparison base the verdict records; moving files; adding kind suffixes; ESLint fences;
a ceilings document; a rule policy for this repository. Constraints: the trust boundary holds, a
verdict is a function of the candidate snapshot and the trusted policy alone, a verdict never
certifies, every rule ships a watched production-path negative, and an unevaluated rule disallows in
every mode.

**Five requirements**, each with real GIVEN, WHEN and THEN bullets:

| Requirement                              | Anchor                                                  | States                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ratchet mode uses a supplied adopted set | `#requirement-ratchet-mode-uses-a-supplied-adopted-set` | A ratcheting rule needs an adopted set; a finding inside it refuses, one outside it is debt; a policy that ratchets without one is refused by name.                 |
| Source file size is ratcheted            | `#requirement-source-file-size-is-ratcheted`            | Over the ceiling unpinned, over a pin, and a pin that has fallen to or under the ceiling are findings; a stale pin is unevaluated.                                  |
| Module layout                            | `#requirement-module-layout`                            | A module directory declares a real wiki index at its own `README.md` and a regular contract file; an unavailable index report leaves the rule unevaluated.          |
| Kind direction over the import graph     | `#requirement-kind-direction-over-the-import-graph`     | K2 to K6 on the resolved graph, barrels followed, composition roots outside the graph.                                                                              |
| Services are plain TypeScript            | `#requirement-services-are-plain-typescript`            | A service, or a store or geometry module the policy declares, never reaches a React package; a selector the candidate does not satisfy leaves the rule unevaluated. |

**The amendment.** `service-taxonomy`'s "Ratchet mode protects touched and adopted code" currently
requires refusal "for a violation introduced by new or touched code". This packet delivers the
adopted-set half and not the touched half, so part A rewrites that requirement to state the adopted
half as the obligation and to make the touched half conditional on a comparison base supplied as an
explicit input, resolved to a tree object identity before judging and recorded in the verdict —
naming scenario `SERVICE-TAXONOMY-038` as unmet until then. Adding a contrary requirement under
another capability would have left two contracts standing, which the second review correctly refused;
amending the owning one is the only honest form. The three scenarios keep their identifiers and their
bodies.

## 10. Assumptions recorded

Each is a decision taken during planning rather than a question sent to the owner. Any can be
reopened.

- **A1. A kind is declared by the filename suffix only, and nothing else makes a file accountable.**
  `docs/code-organization/kinds.json` classifies 95 backend files, but it lives inside the candidate,
  so a candidate could edit the policy that judges it. B2 therefore judges suffix-declared kinds,
  which is what K1 asks for and what the four real modules already use.

  `INV-CLASSIFY` and `classification-policy.v1.json` classify **content** — source, test, config,
  migration — and demand no service kind, so an unsuffixed service is debt **nowhere in this
  package**; the only inventory that demands one is `tools/tool-devsync/src/service-kinds.ts`, over
  three backend directories. These are **suffix-only adapter checks**: deleting every suffix in a
  candidate empties the graph and satisfies K2 to K6 vacuously.

  Unsatisfied and recorded rather than claimed: `SERVICE-TAXONOMY-001`, `002` and `003`, which the
  inventory lane owns; and the **repository port** half of K3 and K4, because a port lives in an
  unsuffixed `contract.ts` — `apps/wbs/fe-01/src/modules/preferences/contract.ts` is the real case —
  and nothing here can see it. A port boundary needs a declared input of its own, like
  `plainTypeScriptPaths`, and is out of scope.

- **A2. `composition.ts` is the composition root, and its exemption is its absence from the graph.**
  The taxonomy exempts composition roots from K2 to K6 but names no spelling; two of the four real
  modules have a `composition.ts`, so the name is derived from the tree rather than declared in
  policy. `SERVICE-TAXONOMY-018`, which asks whether a claimed composition root branches on domain
  state, is not implemented.

- **A3. Ratchet means the adopted set. Touched-code ratcheting is cut, and the owning requirement is
  amended to say so.** The rules design's first principle is a pure judge: a verdict is a function of
  the candidate and the trusted policy, and anyone rerunning it gets the same answer. Reading touched
  paths with `git diff` breaks that, because the candidate is frozen and the index is not; the second
  review demonstrated two different touched lists for one `CandidateSelection`. Doing it correctly
  needs a comparison base supplied as an explicit input, resolved to a tree object identity before
  judging and recorded in the verdict — a change to the verdict record, which the design assigns to
  slice B6. Cutting it and amending the requirement leaves one contract standing; the previous
  revision's added-requirement dodge left two.

- **A4. No rule policy and no size ceilings are adopted for this repository.** Fact 25: none exists,
  and choosing this repository's ceiling is rollout Task 4, a devsync lane this packet does not enter.
  The rules ship with tests and no adoption.

- **A5. `MOD-LAYOUT` checks the two things that exist, and checks them for real.** The layout block
  also names `module.ts`, `check.ts` and `tsconfig.json`, which no real module has (fact 19) and which
  depend on DI Bag adoption, rollout Task 8. Checking them now would fail every module for a reason
  this packet cannot fix. What it does check is not a filename: the index comes from the checked index
  report, so an ordinary README fails, and the contract must be a regular blob, so a symlink fails.

- **A6. K8 is not implemented.** Table facts are declaration-driven and there is no resource module to
  own a table.

- **A7. Frontend delivery is a file under a module's `view/` directory.** The layout block names
  `view/` as the frontend delivery directory. A backend controller carries no marker this packet can
  read, so backend delivery is outside the graph and K2 is proven on the frontend shape only.

- **A8. The size ratchet measures `.ts` and `.tsx`, excluding `.d.ts`, `.test.` and `.spec.`**, which
  is the rollout's own measurement command translated into the candidate.

- **A9. A type-only import counts.** Fact 23 shows `import type { ReactNode } from 'react'` arrives as
  an edge with `importKind: 'type'`, and the direction rules do not filter on `importKind`. A service
  that names React's types is still coupled to React, and a resource-service that names a
  feature-service's types is still pointed the wrong way. The one place the design distinguishes them
  is frontend delivery importing types from the contracts library (`SERVICE-TAXONOMY-006`), and the
  contracts library is not a kind, so nothing here judges it.

- **A10. Stores and geometry are named by the consumer, and a stale name refuses.** Requirement F1
  covers them and nothing in a path marks one (fact 30), so they come from the trusted policy's
  `plainTypeScriptPaths`. A renaming candidate does **not** silently escape: `resolvePlainSelectors`
  refuses a selector the candidate no longer satisfies, exactly as `measureSizes` refuses a stale pin,
  and part E proves it. A consumer that names none gets the three service kinds and no more, which is
  a visible narrowing, because `assertPolicyInputs` refuses a policy that selects F1 without the list.

## 11. Out of lane

Do not touch, in any part: `apps/wiki/cli/src/cli.ts` and `apps/wiki/cli/src/bin.ts`, which packet
010.6 owns; anything under `tools/tool-devsync/` or `docs/code-organization/`, which rollout Tasks 2
to 4 and packet 110.6 own; `apps/wbs/eslint.product.mjs`; `openspec/changes/test-axes/`; any file
under `apps/wbs/` or `libs/wbs/`; and every section of `apps/wiki/cli/README.md` except `## Rules`.

`openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md` is in lane for **part A only**, and
only for the amendment §9 spells out. Its `verify.md`, its `proposal.md` and its scenario identifiers
are not. If a part seems to need any other file, **stop and report**.

## 12. Dispatch, planner only

The launcher supports this batch directly, so no launcher change is a prerequisite. Dispatch part A
with

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 010-7-rules A <base> --batch batch-2
```

which resolves the clone root `/home/df/wd/puni/batch-2`, the branch `batch-2/010-7-rules`, the
temporary root under `/tmp/puni-batch2` and the packet path
`docs/superpowers/plans/2026-09-20-batch-2/010-7-rules.md` (fact 31). Later parts use the same form
with `B`, `C`, `D`, `E`. Record in the ledger, per attempt: the resolved clone, the resolved packet
path, the packet's hash, the base commit, and the `N` and `P` that attempt observed, because every
figure in this packet is relative to them.

This packet needs no network and no `--seed` hand-off: every part writes its own evidence into the
committed `verify.md` before handing over rather than reaching into an earlier attempt's temporary
root.

## Review disposition

### First review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

Every finding was checked against the worktree before it was acted on. Where the review said a
mutation could not fail, the mutation was run in a scratch copy of §6.4 and §6.5 outside the
repository; those runs are fact 31. **Nothing was rejected: all twenty findings hold.**

| Finding                                                 | Disposition | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** fourth hard-coded rule list                      | Fixed       | Confirmed at `rules.test.ts:384-389`. Fact 6 now names **five** sites and authorizes replacing that literal array with an `everyRuleObserving.map(...)` that keeps `MOD-DIRECT-ENTRIES` and `MOD-INDEX` enforcing. Its assertions are untouched.                                                                                                                                                                                                                                                                  |
| **C2** C1's mutation cannot fail                        | Fixed       | Probe: dropping the `$` still returned **one** kinded file; `/\.(feature\|repository\|resource)\./` returned **two**. C.4 now prescribes the loose form and requires two files.                                                                                                                                                                                                                                                                                                                                   |
| **C3** composition-root guard unreachable               | Fixed       | Probe: deleting the guard returned `[]` both ways. All three guards removed from §6.5; the exemption is documented as the composition root's absence from `files`, and D3 now mutates `resolveKinds` to record it as a feature, which yields one K3 finding. The false "four findings" proof text is gone.                                                                                                                                                                                                        |
| **C4** D4's named test never asserts that case          | Fixed       | New test `refuses K3 when the trusted modules are unconfigured`, with a new `runCliWithEnv` helper that overrides the child environment; `runCli` is unchanged. It passes before the mutation and fails after it.                                                                                                                                                                                                                                                                                                 |
| **C5** K3 allows feature-to-delivery                    | Fixed       | Probe confirmed `['repository']` misses the edge. K3's forbidden kinds are now `['repository', 'delivery']`, with a new CLI test and mutation E/D coverage.                                                                                                                                                                                                                                                                                                                                                       |
| **C6** MOD-LAYOUT accepts a non-index README            | Fixed       | Confirmed at `read-indexes.ts:141-147`. `moduleLayoutObservations` now takes the checked index paths and requires a regular contract blob; the rule consumes `context.indexes` and reports itself unevaluated. Three new CLI tests: ordinary README, symlinked contract, malformed metadata. The false "never reached" claim is corrected.                                                                                                                                                                        |
| **I1** adopted-only ratchet contradicts its requirement | Superseded  | Round one implemented touched-code ratcheting; the second review showed that implementation read mutable Git state, so round two **cut** it and amended the owning requirement instead. See the round-two table's C2 and I6. Round one's answer was: Touched-code ratcheting is **implemented**: new `touched.ts`, `RatchetInput`, two part-A tests and a bad-base refusal test. The deferral requirement is replaced by one that states the `committed` residue. No requirement is amended or left contradicted. |
| **I2** F1 omits stores and geometry                     | Fixed       | Probe confirmed `m/store.ts` gets no kind. New trusted-policy input `plainTypeScriptPaths`, declared in F1's `inputs` so `assertPolicyInputs` refuses a policy without it, plus a CLI test and assumption A10.                                                                                                                                                                                                                                                                                                    |
| **I3** false inventory claim                            | Fixed       | `resolveKinds`'s JSDoc and assumption A1 now say these are **suffix-only adapter checks**, name the content-versus-kind difference, and list the unsatisfied scenarios and the invisible repository-port half of K3 and K4.                                                                                                                                                                                                                                                                                       |
| **I4** context assembly omits `relationships`           | Fixed       | §6.6 now shows the whole `const context = { ... }` literal with `relationships,`, `kinds:` and the new optional spreads.                                                                                                                                                                                                                                                                                                                                                                                          |
| **I5** new checks lack negatives                        | Fixed       | Added B7 to B10 (root-prefix boundary, empty roots, duplicate roots and pins, the `assertPolicyInputs` disjunct) and the `allows a file exactly at the ceiling` test the §6.3 proof comment names.                                                                                                                                                                                                                                                                                                                |
| **I6** several expected reds are wrong                  | Fixed       | A.3 distinguishes the message failure from the schema failure; B.2 states `sizeCeilings must be removed` for the policy path and the unregistered-rule message for the other; C.2 writes an unimplemented `kinds.ts` skeleton first so the file still collects; D2 now expects exit **0** with unexpected debt.                                                                                                                                                                                                   |
| **I7** absolute counts                                  | Fixed       | Every literal total is gone. Each part records `N` and `P`; deltas are A `+7`, B `+10`, C `+9`, D `+7`, E `+9`, OpenSpec `+1` in A and `+0` after. Planner rows compare against **that dispatch's** baseline, not batch 1's 679, 44 and 284.                                                                                                                                                                                                                                                                      |
| **I8** part A evidence not persisted                    | Fixed       | Every part fills its own `verify.md` rows before handing over; part E consolidates the committed record and stops if a part's rows are missing. No `--seed` hand-off is needed.                                                                                                                                                                                                                                                                                                                                   |
| **I9** launcher cannot find the packet                  | Fixed       | Confirmed at `run-executor.sh:37-38`, exit 69. New §12 makes parameterizing the batch directory a planner-only prerequisite before part A.                                                                                                                                                                                                                                                                                                                                                                        |
| **I10** masked failures in the shell                    | Fixed       | `                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |     | true` removed from A.1 and forbidden explicitly; the baseline is redirected, never piped, and its own status is asserted; §0.4 carries an exact capture-restore-`cmp`-assert block with `grep -F` on the predicted sentence. |
| **I11** timeouts count only CLI launches                | Fixed       | §0.6 now counts processes, notes the six Git spawns per fixture, and gives every new fixture or CLI test a timeout: `15_000` in A to C, `30_000` in D and E.                                                                                                                                                                                                                                                                                                                                                      |
| **M1** stale fact references                            | Fixed       | The React probe is fact 23, the absent rule policy fact 25, and U1 points at part A stop condition 3.                                                                                                                                                                                                                                                                                                                                                                                                             |
| **M2** `RuleMode` JSDoc left false                      | Fixed       | §6.1 opens by replacing the declaration JSDoc at `rule.ts:5` with the final three-mode contract.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **M3** two overreaching statements                      | Fixed       | Fact 20 says "type declarations", citing `Claim<T>`; new fact 30 records that `noUnusedLocals` is set nowhere, so D.2 no longer claims an unused import breaks extraction.                                                                                                                                                                                                                                                                                                                                        |

**Still unproven, and said so in the packet rather than claimed:** the rules are never run over this
repository (U2); repository ports, unsuffixed services and undeclared stores are invisible (A1,
A10); K7, K8 and K9 are out of scope; and a `committed` selection has no touched paths (A3).

### Second review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

Its central charge was right: round one's fixes lived in the disposition table and never reached the
numbered steps. This revision therefore **rewrote §6 and parts A to E outright**, and every code block
was written into `apps/wiki/cli/src/rules`, type-checked (exit 0), linted (which caught one real
defect), run through the production CLI over Git fixtures, and restored byte for byte — `cmp` clean on
all five existing files, `git status` showing no rule file changed. **Nothing was rejected.**

The architectural finding was accepted in the strongest form. Touched-code ratcheting is **cut**, not
patched: the rules design's first principle makes a verdict a function of the candidate and the
trusted policy, a live `git diff` is neither, and doing it correctly needs a comparison base resolved
to an object identity and recorded in the verdict — a verdict-record change the design assigns to
slice B6. Part A now amends the owning requirement instead of adding a contrary one.

| Finding                                                  | Disposition | What changed in the steps                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** part A cannot implement its own interface         | Fixed       | Touched-code is gone, so `toFinding`'s fourth argument is `policy.adoptedSet` and A.4 passes exactly that. `touched.ts` no longer exists in any list. The three ratchet tests are fully specified in A.3 with their fixtures, policies and assertions.                                                                       |
| **C2** ratcheting reads mutable Git state                | Fixed       | Cut. §6.0 states the purity argument and names B6 as the home of a recorded comparison base; A3 and §9 carry it.                                                                                                                                                                                                             |
| **C3** the bad-base proof cannot fire                    | Fixed       | Gone with the feature. No proof in this packet depends on an invalid base.                                                                                                                                                                                                                                                   |
| **C4** part B's proof tests are missing                  | Fixed       | B.2 now specifies **eleven** tests in one table with fixture, policy and assertion for each, including equality at the ceiling, the sibling-root boundary, the three policy narrows and the missing-ceilings input. B7 is the exact mutation `path.startsWith(root)`; B2 is the `>` to `>=` equality mutation.               |
| **C5** part C contradicts the corrected code             | Fixed       | C.3 registers §6.7's complete three-argument entry with its index branch. C.2 writes a throwing skeleton first, so the file still collects, and specifies all five CLI fixtures. C5's expected message is `module directory declares no wiki index`, the one the code emits. C.7 exempts the deliberately malformed fixture. |
| **C6** part D's tests and helper are absent              | Fixed       | D.2 gives `runCliWithEnv` complete; D.3 specifies all seven tests including the K3-to-delivery case and the unconfigured-modules case, with the exact unevaluated reason. D5 removes `delivery` from K3's list.                                                                                                              |
| **C7** part E needs unauthorized policy changes          | Fixed       | E.4 owns four files explicitly — schema field, required-input disjunct, context member, context spread — and E.9 lists all of them. E.3 says how the complete-policy helper takes each override.                                                                                                                             |
| **I1** counts still force incorrect stops                | Fixed       | Every literal is gone. Deltas are derived from the enumerated tests: A `+3` (a rename adds nothing), B `+11`, C `+9`, D `+7`, E `+11`. Every part records `N` **and** `P` in its own step 0; the planner's whole-suite delta is `+41` and cumulative only against a baseline preceding every part.                           |
| **I2** incorrect red expectations                        | Fixed       | A.3 distinguishes the renamed test's message failure from the schema failure; B.2 and E.3 state which tests hit `... must be removed` and which hit the unregistered-rule message; C.2 distinguishes a collection failure from a test failure; D.2 removes the unused-import claim.                                          |
| **I3** timeout instructions contradict each other        | Fixed       | A.3's default-timeout sentence is deleted. Every new Git-fixture or CLI test carries a timeout: `15_000` in A to C, `20_000` for B's three-run policy test, `30_000` in D and E. The in-process kind tests spawn nothing and carry none, and §0.6 says so.                                                                   |
| **I4** R5 coverage incomplete                            | Fixed       | Every proof is a production-path proof. E.2 builds a trusted fixture directory with a scoped stub package, which **was executed** and produced the asserted message, so no in-process observation test remains. E5, E9 and D6 are the store-selector, missing-policy and K4 mutations the review asked for.                  |
| **I5** renaming a listed store bypasses F1               | Fixed       | `plainTypeScriptPaths` is a typed selector, and `resolvePlainSelectors` refuses one the candidate no longer satisfies, exactly as a stale pin refuses. E8 is its mutation; A10's false claim is corrected.                                                                                                                   |
| **I6** committed ratchet narrows the contract            | Fixed       | Part A amends `service-taxonomy`'s own requirement, quoting the replacement text, and keeps the three scenario identifiers. §11 puts that file in lane for part A only.                                                                                                                                                      |
| **I7** launcher facts obsolete                           | Fixed       | Fact 31 records `--batch batch-2` and its resolved paths; §12 gives the supported invocation and the ledger fields, and no launcher change is a prerequisite.                                                                                                                                                                |
| **I8** part D's handover omits a proof file              | Fixed       | D3 mutates the classification branch in `kinds.ts`, its proof comment lives there, and `kinds.ts` is in D.7.                                                                                                                                                                                                                 |
| **M1** fact numbers stale                                | Fixed       | References now cite the renumbered facts: indexes 28, unused imports 29, probes 30, launcher 31, OpenSpec 32, React extraction 23.                                                                                                                                                                                           |
| **M2** documentation omits touched-path refusals         | Fixed       | Moot: there are none. The `Finding.effect` comment, `AdoptedSet`'s JSDoc and the README paragraph all describe debt as outside the adopted set, and the README says a touched-file refusal would need a base the verdict records.                                                                                            |
| **M3** unattached documentation block in production code | Fixed       | The exemption invariant sits on `KindGraph.files` where it belongs; the probe history stays in this packet and in `verify.md`, not in `direction.ts`.                                                                                                                                                                        |

**Still unproven, and said so rather than claimed:** the rules are never run over this repository
(U2); repository ports, unsuffixed services and undeclared stores are invisible (A1, A10); K7, K8, K9
and touched-code ratcheting are out of scope with named homes; and no rule is adopted anywhere,
because this repository has no rule policy (A4).

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH

The verdict is DISPATCH for part A, with no blocking defect; it does not
authorize parts B through E before their own separate reviews. The review's
"Blocking problems" section named none for part A, so there was no blocking
text to apply. Two of the non-blocking notes for part E gave literal,
unambiguous replacement text and were applied by the planner by hand, before
part E is dispatched: E.2's `createTrustedModules` now walks five `..`
segments to reach the repository root's `node_modules/typescript`, not four,
which pointed at a nonexistent `apps/node_modules/typescript`; and E10's fault
now mutates `plainTypeScriptRule`'s `family` from `'code-shape'` to
`'relationships'` directly, since the previously specified `graphRule`
mutation left F1's printed family unchanged. The remaining non-blocking notes
— B9's separate-removal replay, C's in-process-versus-CLI proof distinction
for C1–C3, E.3's stale `explain F1` red expectation, and §0.4's literal-output
caution for A2/A3 — are advisory rather than drop-in text and were left for
the executor and a later review to apply when B, C and E are dispatched.

## Disposition of the part C dispatch review

Fourth review, 2026-09-20 (Codex gpt-6-astra, high effort): **DISPATCH AFTER FIXES**, part C only.
Every finding was checked against this worktree's code, and finding 4 was settled by **rehearsing**
part C here — writing §6.4, the wiring and all ten tests, running them red then green under §0.2's
command, injecting every part C fault, and then reverting the rehearsal. The rehearsal observed
`33` tests before part C and `43` after, so the delta is `+10`.

| Finding                                              | Disposition                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** module README memberships are index-relative   | **FIXED** in C.2. Confirmed at `apps/wiki/cli/src/indexes/check-indexes.ts:32-38` and `:120-136`: `joinIndexPath` joins onto `index.directory`, so `src/m/README.md` declaring the prefix `src/m` asks for `src/m/src/m`. The three module READMEs now declare the local paths `m.feature.ts` and `contract.ts`; the root index keeps its `src` prefix. Rehearsed green.                      |
| **2** proof descriptions read as literal diagnostics | **FIXED**. C.4 opens with the review's rule, §0.4 now names part C as the exception to its `grep -F` line, and C.4's last column carries the **observed** Bun 1.4.2 matcher diagnostics. C7 is recorded as failing first on exit status, `Expected: 1` / `Received: 0`.                                                                                                                       |
| **2b** C2 masks one delivery predicate               | **FIXED**. C2 is split into C2a (descendant half only) and C2b (direct half only), and the delivery test now asserts each view path with its own `toContainEqual`, so the two faults produce different diagnostics. Rehearsed: C2a names `m/view/panel.tsx`, C2b names `m/view/deep/row.tsx`. C6 is narrowed to `moduleLayoutObservations`'s filter only.                                     |
| **3** §8 and §6.4 misstate what the proofs observed  | **FIXED**. §8's opening paragraph is replaced; the fault total is now **forty-one** and the in-process set is named. §6.4's composition-root proof comment is removed as D3's, the view-branch comment describes C2a and C2b, and C.3 forbids copying placeholder proof comments. (The old total "thirty-seven" was already wrong by one for A1–A4, B1–B10 + B9b, C1–C7, D1–D6, E1–E10 = 38.) |
| **4** a module at the candidate root is misresolved  | **FIXED**, and confirmed by rehearsal rather than by reasoning. `modulePath`, the `root !== ''` exemption, the `view` binding and `path: root === '' ? '.' : root` are in §6.4; C.2 adds `createRootModuleCandidate` and the CLI test `allows a module at the candidate root`; C8a and C8b are the two new proofs. Part C's delta is `+10` and the cumulative delta `+42`.                    |
| Note: commit part B before dispatch                  | Planner action, not a packet change. Part B is staged and uncommitted in this worktree.                                                                                                                                                                                                                                                                                                       |
| Note: preserve part B's policy additions             | **FIXED** in C.1: `KindSpecSource`, `sizeCeilings` and the mapped enforcement policy are named as preserved, and `MOD-LAYOUT` is stated to need no policy-schema change.                                                                                                                                                                                                                      |
| Note: kind resolution remains suffix-only            | Already stated, in `resolveKinds`'s JSDoc in §6.4. No change.                                                                                                                                                                                                                                                                                                                                 |

**Rehearsal record, 2026-09-20, in `/home/df/wd/puni/batch-2/revise-010-7-C` at part B's staged
head.** `bun test` on the rules file: `33 pass, 0 fail` before, `43 pass, 0 fail, 361 expect()
calls` after. `bunx eslint` on `kinds.ts`, `registry.ts`, `rule.ts`, `check.ts` and `rules.test.ts`:
exit 0. `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`: exit 0. Every one of C1, C2a,
C2b, C3, C4, C5, C6, C7, C8a and C8b was injected, observed failing only its named test with the
diagnostic C.4 now records, and the file restored. The rehearsal was then reverted; only part B's
staged paths and this packet remain changed.
