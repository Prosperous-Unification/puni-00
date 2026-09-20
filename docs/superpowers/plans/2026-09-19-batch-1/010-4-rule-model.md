# 010.4 Rule model: verdict, findings, modes in policy; check and explain

Size class L. Token estimates: top-model-high-effort planning 6,000,000; mid-level-mid-effort
implementation 22,000,000; top-model-high-effort review 9,000,000.

Implements slice B0 of the [Twilight Bureaucrat rules design](../../specs/2026-09-19-twilight-bureaucrat-rules-design.md).
Batch rules, standard blocks and file ownership: [execution batch 1](README.md). Settled open
points: [assumptions](ASSUMPTIONS.md).

Revision 3, 2026-09-19. Cut into **four sequentially executed parts** after a second adversarial
review. Every interface below was written into a copy of `apps/wiki/cli/src` outside the repository,
type-checked with the repository's compiler options, and executed against real Git fixtures.
Observed output is quoted in section 3; nothing was written into the repository.

## 0. How this packet is executed

Four parts, **strictly in order, never in parallel**. They share the command-line module, the
registry, one test file and one verification record.

| Part                                                                 | Delivers                                                                       | Ends when                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| [1](#part-1--openspec-change-rule-model-registry-and-static-explain) | The OpenSpec change, the rule model, the registry, static `explain`            | Part 1's verification passes and its file list is reported |
| [2](#part-2--the-policy-boundary-and-check)                          | The rule policy, its trust boundary, the `check` command and the verdict       | Part 2's verification passes and its file list is reported |
| [3](#part-3--failure-classification-and-the-adapter-proofs)          | The four adapters proven end to end, every remaining mutation                  | Part 3's verification passes and its file list is reported |
| [4](#part-4--built-executable-readme-and-final-verification)         | The installed binary's routes, the README, formatting, the verification record | Part 4's verification passes and its file list is reported |

**The handover boundary is the same for all four.** The executor cannot commit: the clone's Git
directory is read-only (executor preamble rule 1). So each part ends by leaving its changes in the
working tree and reporting the "ready to commit" file list and commit subject printed at the end of
that part. The planner reviews, commits, and only then dispatches the next part, which starts from
that committed predecessor. Stop if a file scheduled to be created by a later part already exists. This condition excludes
existing files scheduled only for modification. Required predecessor artifacts must be present.

**Rules that override anything below** (executor preamble):

- Never change the clone's Git state: no `add`, no `commit`, no branch, no `stash`, no `restore`.
  `git status`, `diff`, `log`, `grep`, `ls-files`, `show` are fine. Git operations **inside the
  temporary fixture repositories these tests create under the task's own temporary directory are
  required** by the tests and are not the clone's state.
- Restore a mutated tracked file by copying a pre-mutation copy back from the task's temporary
  directory and confirming with `cmp`. Never `git checkout` or `git restore`.
- Prefix every Nx command with `NX_DAEMON=false`. dconf warnings are harmless.
- Do not set `BUN_INSTALL_CACHE_DIR`. The launcher has already installed the OpenSpec command into
  this attempt's `TMPDIR` from Bun's ordinary cache, which you can read; pointing the cache at an
  empty directory makes `bunx` try to download everything again, and there is no network. A tool
  that tries to download blocks the task: stop and report.
- All repository paths in this packet are relative to **your** clone. Use the preparation block for
  the dispatched part. Keep the launcher-provided `TMPDIR` unchanged. All scratch files and backups
  belong beneath it; mutation patches and failing output belong in `$TMPDIR/evidence`. Never change
  directory into another checkout. Run directory-changing commands in a subshell, as written below.
- Verification is split (preamble rule 4a). You run the focused tests this packet names, the type
  check, lint, the build, the format check and OpenSpec validation. The planner runs anything that
  needs staged files or Git writes into the clone. The host gate cannot run here: report it as not
  run.
- Never loosen, skip or rewrite an existing test to get a green result.

### 0.1 Sandbox facts every part depends on

Each of these stopped a real attempt in this batch. They are not advice.

- **The clone's `.git` is read-only.** `git add`, `git commit`, `git stash`, `git restore`,
  `git checkout` all fail. Restore a mutated file only by copying back the pre-mutation copy you
  saved under `"$task_tmp"` and confirming with `cmp`. Read-only Git (`status`, `diff`, `log`,
  `grep`, `ls-files`, `show`) is fine. The temporary fixture repositories the tests create under
  `TMPDIR` are not the clone: `git init`, `git add` and `git commit` inside them are required.
- **Never set `BUN_INSTALL_CACHE_DIR`.** The launcher warmed the OpenSpec command into this
  attempt's `TMPDIR` from Bun's ordinary cache. Repointing the cache makes `bunx` try to download,
  and there is no network.
- **Every OpenSpec command carries `OPENSPEC_TELEMETRY=0`** and must not download. If one tries to,
  stop and report.
- **The command guard rejects any command whose text contains `rm -f`**, before it runs. Never
  delete a scratch file. Leave every report, patch and failing-output file under `$TMPDIR/evidence`.
  Run the batch README's version of the OpenSpec validation block, which has no removal line.
- **Prefix every Nx command with `NX_DAEMON=false`.** dconf warnings are harmless.
- **Scratch lives only under `TMPDIR`**: `task_tmp=$(mktemp -d "${TMPDIR:?}/rule-model-XXXXXX")`.
  Evidence lives under `$TMPDIR/evidence`. No fixed path elsewhere.

### 0.2 Running one named test

Bun's `-t` matches the describe name and the title **joined by a space**. An anchored bare title
matches nothing and the run then reports success on zero tests. Every proof in this packet names the
joined pattern; run it unanchored, exactly as written:

```sh
(cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
  bun test --preload ../../../tools/test/scratch/preload.ts src/rules/rules.test.ts \
  -t '<joined pattern>')
```

Expected while green: `1 pass`, `0 fail`, and a final line `Ran 1 test across 1 file.` A run whose
output says `Ran 0 tests` or `matched 0 tests` proves nothing: **stop and report**, never treat it
as a pass.

### 0.3 Injecting a fault, saving it, and what counts as a stop

For every proof, in this order:

1. `cp <file> "$task_tmp/"` — the passing bytes.
2. Edit the file to inject exactly the named fault.
3. Save the mutation as a patch, accepting exactly status 1 (a bare `diff` under `set -e` stops the
   shell, and `|| true` hides a real error):

   ```sh
   if diff -u "$task_tmp/<file>" "<file>" >"$TMPDIR/evidence/P<n>.patch"; then
     echo "nothing was injected" >&2; exit 1
   else test $? -eq 1; fi
   ```

4. Run the named test with its joined `-t` pattern, redirecting its output to
   `$TMPDIR/evidence/P<n>.log` and capturing **its own** exit status. Never read a test's status
   through `tee`.
5. Record the decisive failing line.
6. Copy the saved bytes back, `cmp` them, rerun the named test green.
7. Only then write the adjacent `Proof:` comment, with the real date, describing what you saw.

**A fault that also fails other tests is not a stop.** Record which ones. It is a stop only when
the named test **passes** under the fault, fails with a **different** message than the one this
packet predicts, or the mutation **does not compile**.

### 0.4 Two standing facts about this package

- **Planner-only checks.** The whole `twilight-bureaucrat:test`, `twilight-bureaucrat:test:package`
  and `tool-devsync:test` targets are the planner's: some of their tests write Git objects into the
  clone. You run the focused files this packet names and list those targets under "Not verified" as
  pending planner verification.
- **A new source file changes the validator identity.** `resolveValidatorArtifactPaths` walks
  cli.ts's import closure, so part 2's new `rules/rule-policy.ts` joins it. Checked on 2026-09-20:
  no test in `apps/wiki/cli` pins that identity as a literal. `pilot-policy.test.ts:188`,
  `trusted-policy.test.ts:541` and `gate-entrypoints.test.ts:494` all recompute it by calling
  `resolveValidatorArtifactPaths` themselves, so they follow the new closure. Expect no test
  failure from the added file. Only an activation provisioned **outside** this clone would have to
  be prepared again, which is the planner's question, not yours.

## 1. Goal and non-goals

**Goal.** Give Twilight Bureaucrat a rule model — `Rule`, `Finding`, `Verdict`, `RuleMode` — a
registry wrapping four checks the package already performs, a rule policy that supplies each rule's
mode from outside the candidate, and two commands: `check`, which runs registered rules over one
candidate and prints one verdict, and `explain`, which prints one rule's record.

**Non-goals.** No new rule family, no new check logic, no change to the sixteen existing routes or
their arguments, no certification, no template registry, no candidate record for Twilight Dash, no
move of any check out of the devsync tests, and no change to how any existing check signals a
violation.

## 2. Read first

| File                                                                  | Why                                                                                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md                                                             | R1-R5. R5 governs every new check here.                                                                                    |
| docs/superpowers/plans/2026-09-19-batch-1/README.md                   | Batch rules, the file-ownership table, and the standard OpenSpec validation block.                                         |
| docs/superpowers/plans/2026-09-19-batch-1/ASSUMPTIONS.md              | The four settled assumptions that bind this packet.                                                                        |
| docs/superpowers/specs/2026-09-19-twilight-bureaucrat-rules-design.md | The design. Its "The rule model" section is the source of the four types; its "Open items" already records B0's deferrals. |
| docs/twilight-structure/names.md                                      | Full product names in prose.                                                                                               |
| apps/wiki/cli/src/cli.ts                                              | The dispatcher you extend, and the private `readBlob` you move (lines 87-101, 355-425).                                    |
| apps/wiki/cli/src/bin.ts                                              | The installed binary's second dispatcher: `validatorCommands` (lines 8-26), `help` (lines 28-35).                          |
| apps/wiki/cli/src/policy/trust.ts                                     | `readStableArtifact`, `assertExternal`, `loadTrustedPolicy`, `lintTrustedCandidate`. The trust boundary you reuse.         |
| apps/wiki/cli/src/inventory/read-candidate.ts                         | `readCandidate`, `CandidateSnapshot`, and the private `resolveWorktreeRoot` you export.                                    |
| apps/wiki/cli/src/indexes/check-indexes.ts                            | `checkIndexes`, its `reviewDebt` list, and the violations it throws.                                                       |
| apps/wiki/cli/src/inventory/classify-entries.ts                       | `classifyEntries` and the messages it throws.                                                                              |
| apps/wiki/cli/src/relationships/index.ts                              | `extractRelationships` and its trusted-modules requirement.                                                                |
| apps/wiki/cli/src/relationships/declarations.ts                       | `DeclaredRelationships.unresolved`, typed `{ relationshipId: string; reason: string }[]` (line 54).                        |
| apps/wiki/cli/src/relationships/selectors.test.ts                     | Lines 275-330: the declaration document shape the part 3 fixture copies.                                                   |
| apps/wiki/cli/src/contracts/records.ts                                | `OpaqueId`, `RelativePath`, `SchemaVersion`, `ClassificationPolicy`, `RelationshipRequest`.                                |
| apps/wiki/cli/src/indexes/indexes.test.ts                             | The fixture style: temporary Git repository, `module-index` comment, spawned production CLI.                               |
| apps/wiki/cli/src/inventory/classification.test.ts                    | Lines 18-24: the shipped classification policy fixture loaded in a test.                                                   |
| apps/wiki/cli/src/packaging/build.test.ts                             | The existing built-executable test that part 4 extends.                                                                    |
| apps/wiki/cli/project.json                                            | The real Nx target names.                                                                                                  |
| openspec/config.yaml                                                  | The `sdd-lean` schema and its per-artifact rules.                                                                          |

## 3. Verified facts

Checked on 2026-09-19. Facts 24 to 38 were **observed by running** the code of section 6 in a copy
of `apps/wiki/cli/src` placed outside the repository, with the real `@shared/validation` and the
real `typescript` resolved through a symlink, against real Git fixtures.

1. Nx project `twilight-bureaucrat`, `sourceRoot` `apps/wiki/cli/src` (apps/wiki/cli/project.json).
2. Its targets are exactly `test`, `lint`, `lint:source`, `lint:fast`, `release`, `build`, `pack`,
   `test:package`, `typecheck`.
3. The `test` target runs
   `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --path-ignore-patterns '**/packaging/install.test.ts' --path-ignore-patterns '**/packaging/consumer-bootstrap.test.ts' --preload ../../../tools/test/scratch/preload.ts`
   with `cwd` `apps/wiki/cli`.
4. `runCli(argv)` dispatches on `args[0]` **and** exact `args.length`, and throws
   `unknown command: <name>` with a usage line (cli.ts:355-425).
5. There are **16 routes and 17 accepted command words**: `validate` and `validate-record` share one
   route (cli.ts:357-360).
6. apps/wiki/cli/src/bin.ts holds a second dispatcher whose `validatorCommands` set lists the same
   17 words; an absent word is rejected before the validator runs (bin.ts:84-91).
7. `checkIndexes(repository, candidate)` (check-indexes.ts:409) returns
   `{ schemaVersion, selection, identity, indexes, reviewDebt }`; `reviewDebt` entries are
   `{ indexPath, directEntries, limit }` with `limit` the constant `DirectEntryLimit = 40`
   (check-indexes.ts:17, 437-446). **Every other violation it finds is thrown as a plain `Error`.**
8. `checkIndexes` does not reject a candidate path outside every index directory: `ownerOf` returns
   `undefined` and no caller refuses it (check-indexes.ts:40-59). What it enforces is exact declared
   membership, resolvable links and anchors, unique module identities, and that at least one index
   exists. The `MOD-INDEX` statement is written to that behaviour and no wider.
9. `classifyEntries` (classify-entries.ts:240) returns `ClassifiedEntry[]` and throws a plain
   `Error` on an unclassifiable entry; its no-match message is
   `ordinary content ${path} matched 0 classification rules` (classify-entries.ts:216-220).
10. `extractRelationships` (relationships/index.ts:185) returns `declarations.unresolved` typed
    `{ relationshipId: string; reason: string }[]` (declarations.ts:54). It throws a plain `Error`
    for: unconfigured, unreadable, candidate-contained or TypeScript-less trusted modules
    (relationships/index.ts:79-98); a failed candidate blob read and malformed batch output
    (relationships/index.ts:24-69); and a declaration endpoint that is not a selected path
    (declarations.ts:1203-1206).
11. **No check function in this package distinguishes a candidate violation from an unusable input
    by type.** Both are plain `Error`. Facts 7, 9 and 10 are the evidence. Section 6.2 is built on
    this fact.
12. `CandidateSnapshot` is exactly `{ selection, entries, untracked }` (read-candidate.ts:31-35).
13. `resolveWorktreeRoot` is private in read-candidate.ts, defined at line 116, with **exactly one
    caller**, `readCandidate` at line 446. `git grep` finds no other use.
14. `lintTrustedCandidate` computes its candidate identity as
    `hashCanonical({ selection, entries, untracked })` (trust.ts:1480-1486).
15. `'observe' | 'ratchet' | 'enforce'` already exists as `LintMode` (trust.ts:45-46).
16. `readStableArtifact` and `assertExternal` are module-private in trust.ts (lines 279, 315).
    `assertExternal` throws `${subject} resolves inside selected candidate: ${path}`.
17. `resolveValidatorArtifactPaths` (trust.ts:478-510) walks imports with
    `Bun.Transpiler.scanImports`, which reports literal dynamic imports. Probe run on 2026-09-19:

    ```sh
    bun -e "const t = new Bun.Transpiler({ loader: 'ts' }); console.log(JSON.stringify(t.scanImports(\"const x = await import('./policy/trust'); import {a} from './b';\")))"
    ```

    Output: `[{"kind":"dynamic-import","path":"./policy/trust"},{"kind":"import-statement","path":"./b"}]`.

18. Because of fact 17, a source file reachable from cli.ts joins the validator closure and changes
    the validator identity; `loadTrustedPolicy` then throws `trusted validator artifacts do not
match the executable implementation` for a binding prepared earlier (trust.ts:591-598).
19. `bin/tool-wiki-lint.sh` exits 0 with `{"schemaVersion":1,"status":"inactive",…}` only when
    `TOOL_WIKI_ACTIVATION_ROOT` is unset or absent **and** `TOOL_WIKI_REQUIRE_CERTIFIED` is `0`, its
    default; with `TOOL_WIKI_REQUIRE_CERTIFIED=1` and no activation it exits 78 (lines 9-22).
20. Two bundles exist: `packaging/build.ts:80-112` bundles bin.ts into `dist/bin.mjs`;
    `packaging/build.ts:34` bundles cli.ts into `toolkit/validator.mjs`. The rules graph reaches the
    validator bundle through cli.ts; bin.ts only allow-lists the word and spawns `validator.mjs`.
21. apps/wiki/cli/README.md is itself the module index and its memberships include the
    `directory-prefix` `src` (README.md:3), so new files under apps/wiki/cli/src need no index edit.
22. apps/wiki/cli/src/packaging/build.test.ts already builds the package, invokes the built
    executable, and asserts `--version`, an `unknown command` refusal and a validator-routed
    `validate-record` (lines 57-105). No other packet owns it.
23. OpenSpec schema is `sdd-lean`; artifacts are `intent` generating `proposal.md`, `specs`
    generating `specs/<capability>/spec.md`, optional `design`, `tasks`, `verify`. The proposal
    template's headers are `## Why`, `## What Changes`, `## Non-Goals`, `## Constraints`,
    `## Capabilities`, `## Domain Terms`, `## Decisions Recorded`, `## Impact`. A change directory
    carries `.openspec.yaml` with `schema:` and `created:`. openspec/specs holds no bureaucrat
    capability, so `bureaucrat-rules` is new.
24. **Observed.** `bunx tsc --noEmit` over the copy, with every module of section 6 and both
    modified files, printed nothing.
25. **Observed.** The canonical fixture — `README.md` declaring `nx.json`, `package.json`,
    `tsconfig.json` and the `src` prefix, plus those files and `src/entry.ts` — passes the existing
    `check-indexes` command with exit 0.
26. **Observed.** `check committed <fixture> <rev> <complete policy>` with no `--rule` printed
    `"ruleIds":["INV-CLASSIFY","MOD-DIRECT-ENTRIES","MOD-INDEX","REL-EXTRACT"]`, `"findings":[]`,
    `"unevaluated":[]`, `"allowed":true`, `"certifies":false`, exit 0.
27. **Observed.** On a candidate with no index, `--rule MOD-INDEX` printed `"findings":[]` and
    `"unevaluated":[{"ruleId":"MOD-INDEX","reason":"selected candidate contains no module indexes"}]`,
    `allowed:false`, exit 1 — **identically in `observe` and in `enforce`**.
28. **Observed.** On that same candidate, `--rule MOD-DIRECT-ENTRIES` printed
    `"unevaluated":[{"ruleId":"MOD-DIRECT-ENTRIES","reason":"the index report is unavailable: selected candidate contains no module indexes"}]`,
    exit 1.
29. **Observed.** An index declaring 42 direct entries produced, in `observe`,
    `{"ruleId":"MOD-DIRECT-ENTRIES","path":"README.md","message":"index declares 42 direct entries, limit 40","effect":"debt"}`
    with `allowed:true`, exit 0; and in `enforce`, the same finding with `"effect":"refusal"`,
    `allowed:false`, exit 1.
30. **Observed.** A candidate containing `src/unknown.zzz` produced
    `"unevaluated":[{"ruleId":"INV-CLASSIFY","reason":"ordinary content src/unknown.zzz matched 0 classification rules"}]`,
    exit 1, in `observe`.
31. **Observed.** `check committed <fixture>/src <rev> <policy inside the worktree> --rule MOD-INDEX`
    exited 1 with `rule policy resolves inside selected candidate: <path>`. The repository argument
    was an interior directory.
32. **Observed.** With `TOOL_WIKI_TRUSTED_NODE_MODULES` unset, `--rule REL-EXTRACT` in `observe`
    printed `"unevaluated":[{"ruleId":"REL-EXTRACT","reason":"trusted TypeScript runtime modules are not configured"}]`,
    exit 1.
33. **Observed.** Relationship extraction needs an Nx workspace file: a fixture without `nx.json`
    failed with `Nx workspace configuration is absent: nx.json`. The canonical fixture therefore
    carries `nx.json` and `package.json`.
34. **Observed.** A candidate carrying `relationships.v1.json` with one edge
    `{relationshipId: 'dynamic-shell-read', kind: 'reads', status: 'unresolved', source: {kind:'path', path:'package.json'}, target: {kind:'path', path:'src/entry.ts'}, reason: 'the shell computes the variable name at runtime'}`,
    named in `relationshipRequest.declarationPaths`, produced exactly
    `{"ruleId":"REL-EXTRACT","path":".","subject":"dynamic-shell-read","message":"declared relationship is unresolved: the shell computes the variable name at runtime","effect":"debt"}`,
    exit 0 in `observe`.
35. **Observed mutation.** Replacing that adapter's `unresolved.map(...)` with an empty list made the
    same invocation print `"findings":[]`, exit 0. The fixture of fact 34 discriminates.
36. **Observed.** Both endpoints of an unresolved edge must be **selected candidate paths**; a
    missing path throws `relationship <id> <side> path <path> is not selected` before the unresolved
    list is built (declarations.ts:1203-1206). The fixture of fact 34 uses two real paths.
37. **Observed.** With `--rule MOD-INDEX` and a policy naming an unregistered rule, removing the
    unregistered-rule branch made the command exit 0 with an allowed verdict. Narrowing a
    policy-boundary test to `MOD-INDEX` is what makes its mutation observable; without `--rule`, the
    run reaches `assertPolicyInputs` and exits 1 for an unrelated reason.
38. **Observed exact refusals, all exit 1:** duplicate mode
    (`rule policy states a mode for MOD-INDEX twice`), undeclared key
    (`Validation failed: unexpected must be removed`), malformed JSON
    (`malformed rule policy JSON <path>: JSON Parse error: …`), non-UTF-8
    (`rule policy <path> is not UTF-8: …`), absent file (`cannot open rule policy <path>: ENOENT…`),
    unknown selection kind (the `usage:` line), unknown rule
    (`unknown rule: NO-SUCH-RULE (registered: INV-CLASSIFY, MOD-DIRECT-ENTRIES, MOD-INDEX, REL-EXTRACT)`),
    unknown flag (`the only check flag is --rule <rule-id>: received --only`), missing policy input
    (`rule INV-CLASSIFY needs policy.classificationPolicy, which the rule policy omits`).

## 4. Unknowns

| Unknown                                                                                                                                                                      | How to resolve                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whether ESLint accepts the section 6 code. It could not be run outside the workspace: ESLint refuses files outside the base path and the config builds the Nx project graph. | Each part runs `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source` as a required step and fixes what it reports, never with an unexplained suppression.         |
| Whether a provisioned activation outside this clone binds the current validator identity (fact 18).                                                                          | Planner question, not executor work. Such an activation must be prepared again.                                                                                           |
| Whether the `twilight-bureaucrat:test` target passes end to end in the executor sandbox. Some repository tests write Git objects into the clone.                             | Preamble rule 4a: the executor runs the focused files this packet names; the planner runs whole targets after staging. Report the target as pending planner verification. |

## 5. File plan

Every file is listed with the part that creates or changes it. A part touches nothing outside its
own rows.

| Path                                                                           | Part                      | Responsibility                                                                                                                                |
| ------------------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| openspec/changes/twilight-bureaucrat-rule-model/.openspec.yaml                 | 1                         | `schema: sdd-lean`, `created: 2026-09-19`.                                                                                                    |
| openspec/changes/twilight-bureaucrat-rule-model/proposal.md                    | 1                         | Intent, 400 words maximum.                                                                                                                    |
| openspec/changes/twilight-bureaucrat-rule-model/specs/bureaucrat-rules/spec.md | 1                         | The eleven requirements of section 9.                                                                                                         |
| openspec/changes/twilight-bureaucrat-rule-model/tasks.md                       | 1 creates, 2 to 4 tick    | The four parts, each naming its tests and negatives. Each later part ticks **only its own** boxes and corrects the counts they name.          |
| openspec/changes/twilight-bureaucrat-rule-model/verify.md                      | 1 creates, 2 to 4 append  | The proof table and the commands record. Each part writes what it observed itself, in its own part's rows and its own commands subsection.    |
| apps/wiki/cli/src/rules/rule.ts                                                | 1, 3                      | The rule model types and four pure functions; part 3 adds the `Proof:` comments for P13 and P19.                                              |
| apps/wiki/cli/src/rules/registry.ts                                            | 1, 3                      | The four rules, `registeredRules`, `findRule`, `registeredIds`; part 3 adds the `Proof:` comments for P15 to P18.                             |
| apps/wiki/cli/src/rules/check.ts                                               | 1, 2, 3                   | `explainRule` and the writers in part 1; `checkCandidate` in part 2; part 3 adds the `Proof:` comments for P14 and P22 and nothing else.      |
| apps/wiki/cli/src/inventory/read-blob.ts                                       | 1                         | `readCandidateBlob`, moved from cli.ts's private `readBlob`, behaviour unchanged.                                                             |
| apps/wiki/cli/src/rules/rules.test.ts                                          | 1 creates, 2 and 3 extend | Every rule test.                                                                                                                              |
| apps/wiki/cli/src/cli.ts                                                       | 1 and 2                   | Part 1: use `readCandidateBlob`, add the two-argument `explain` route. Part 2: add the `check` route, widen `explain`, extend the usage line. |
| apps/wiki/cli/src/bin.ts                                                       | 1 and 2                   | Part 1 adds `explain`; part 2 adds `check`; both add a help line.                                                                             |
| apps/wiki/cli/src/rules/rule-policy.ts                                         | 2                         | The `RulePolicy` record, `loadRulePolicy`, `ruleMode`, `assertPolicyInputs`.                                                                  |
| apps/wiki/cli/src/policy/trust.ts                                              | 2                         | One new exported function, `readExternalArtifact`.                                                                                            |
| apps/wiki/cli/src/inventory/read-candidate.ts                                  | 2                         | Rename the private `resolveWorktreeRoot` to `resolveCandidateRoot`, export it, update its single caller.                                      |
| apps/wiki/cli/src/packaging/build.test.ts                                      | 4                         | Three assertions on the built executable.                                                                                                     |
| apps/wiki/cli/README.md                                                        | 4                         | A `## Rules` section, including the sentence naming the short command.                                                                        |

No other file is authorized. In particular this packet does **not** change
apps/wiki/cli/src/relationships/index.ts, apps/wiki/cli/src/indexes/read-indexes.ts or
apps/wiki/cli/src/indexes/check-indexes.ts: section 6.2 explains why that became unnecessary.

## 6. Interfaces

### 6.1 How `check` relates to `lint-local` and `lint-ci`

**`check` sits beside them. It neither wraps nor delegates, and they do not change.**

- `lintTrustedCandidate` (trust.ts:1500) requires a trusted binding, a trusted authority artifact
  with check receipts and an audit, and a lint evidence document, and emits a certification record
  that recorded activations consume. A rule check at authoring time has none of those inputs.
- Delegating lint to `check` would change `TrustedLintReport`, a record CI and existing activations
  already consume.
- They are not redundant: both call the same `checkIndexes`, `classifyEntries` and
  `extractRelationships`, so each check keeps one implementation. Only the disposition layer
  differs.
- `check` reuses lint's trust boundary rather than copying it, through one new export,
  `readExternalArtifact`.

A B0 verdict never certifies and says so (`certifies: false`).

### 6.2 A thrown value is always a failure to evaluate

Fact 11 is decisive: **no check in this package tells a candidate violation from an unusable input
by type.** `checkIndexes` throws a plain `Error` for a broken link and for an unreadable index blob;
`extractRelationships` throws a plain `Error` for a forged declaration endpoint and for a missing
TypeScript install. An adapter that guessed from the message would be a check that cannot fail
honestly.

So the safe default is the only default:

> A rule's findings come **only** from a check's structured output. Anything a check throws makes
> the rule **not evaluated**, and an unevaluated rule makes the verdict disallowed in every mode,
> `observe` included.

This is the assumption recorded in [ASSUMPTIONS.md](ASSUMPTIONS.md) ("a rule that cannot be
evaluated makes the verdict disallowed in every mode") and the design's open item "A failure to
evaluate is not a violation".

**The consequence, stated rather than hidden.** In B0 only two rules can report debt, because only
two checks return structured data:

| Rule                 | Structured output it reports as findings         | What a throw becomes |
| -------------------- | ------------------------------------------------ | -------------------- |
| `MOD-DIRECT-ENTRIES` | `checkIndexes().reviewDebt`                      | not evaluated        |
| `REL-EXTRACT`        | `extractRelationships().declarations.unresolved` | not evaluated        |
| `MOD-INDEX`          | none: a clean run has no output                  | not evaluated        |
| `INV-CLASSIFY`       | none: a clean run has no output                  | not evaluated        |

So a broken module index cannot be adopted as debt in B0: it disallows the verdict in every mode,
and the operator reads the reason in `unevaluated`. The design's "Debt is visible" principle is
therefore only partly met by B0. The fix is not an adapter heuristic; it is a later slice teaching
the check functions to report violations as data, which the design's first open item already names.
Part 1's OpenSpec proposal records this consequence, and section 9's requirement 5 states it.

Nothing needs a new error class, so the earlier plan's `CheckInputError` and its edits to
`relationships/index.ts` and `indexes/read-indexes.ts` are gone.

### 6.3 apps/wiki/cli/src/rules/rule.ts — part 1

```ts
import type { ClassificationPolicy, RelationshipRequest } from '../contracts/records';
import type { checkIndexes } from '../indexes/check-indexes';
import type { CandidateSnapshot } from '../inventory/read-candidate';

/** Policy disposition for one rule. `ratchet` is declared for later slices; slice B0 refuses it. */
export type RuleMode = 'observe' | 'ratchet' | 'enforce';

/** The record `explain` prints. It carries no behaviour, so any caller can serialize it. */
export interface Rule {
  /** Stable, short and quoted in messages: `MOD-INDEX`, `INV-CLASSIFY`. */
  readonly id: string;
  readonly family: string;
  /** One sentence, the same one its delta requirement states. */
  readonly statement: string;
  /** Where the rule is specified. */
  readonly source: string;
  /**
   * Selectors the rule reads. A name beginning `policy.` is a rule policy field the rule cannot run
   * without; {@link requiredPolicyInputs} selects exactly those.
   */
  readonly inputs: readonly string[];
}

/** What a rule saw, before policy decides whether it refuses the candidate. */
export interface RuleObservation {
  /** A candidate-relative path, or `.` when the observation is about the candidate as a whole. */
  readonly path: string;
  readonly subject?: string;
  readonly message: string;
}

export interface Finding {
  readonly ruleId: string;
  readonly path: string;
  readonly subject?: string;
  readonly message: string;
  /** `debt` in observe mode; `refusal` otherwise. */
  readonly effect: 'debt' | 'refusal';
}

/** A rule that could not judge. No mode downgrades it; see {@link Verdict.allowed}. */
export interface UnevaluatedRule {
  readonly ruleId: string;
  readonly reason: string;
}

export interface Verdict {
  readonly schemaVersion: 1;
  /** `hashCanonical` over the candidate snapshot; the identity the lint engine records. */
  readonly candidate: string;
  readonly policy: string;
  /** False when any finding refuses, and false whenever `unevaluated` is non-empty. */
  readonly allowed: boolean;
  readonly ruleIds: readonly string[];
  readonly findings: readonly Finding[];
  readonly unevaluated: readonly UnevaluatedRule[];
  /**
   * Always false in slice B0: a verdict binds no evidence, no authority and no validator identity,
   * so it cannot certify. Only `lint-ci` certifies.
   */
  readonly certifies: false;
}

export type RuleEvaluation =
  | { readonly kind: 'observed'; readonly observations: readonly RuleObservation[] }
  | { readonly kind: 'not-evaluated'; readonly reason: string };

export type IndexReport = ReturnType<typeof checkIndexes>;

export type RuleOutcome<Report> =
  { readonly ok: true; readonly report: Report } | { readonly ok: false; readonly reason: string };

export interface RuleContext {
  /** The resolved Git worktree root, never a caller's interior directory. */
  readonly repository: string;
  readonly candidate: CandidateSnapshot;
  readonly classificationPolicy?: ClassificationPolicy;
  readonly relationshipRequest?: RelationshipRequest;
  /** The index report, computed once per check and shared by the two module rules. */
  readonly indexes: RuleOutcome<IndexReport>;
}

export interface RegisteredRule extends Rule {
  /** Evaluates the rule over one candidate. A rule that cannot judge says so; it does not throw. */
  evaluate(context: RuleContext): RuleEvaluation;
}

/** The policy fields a rule cannot run without. */
export function requiredPolicyInputs(rule: Rule): string[] {
  return rule.inputs.filter((input) => input.startsWith('policy.'));
}

/** The message of whatever a wrapped check threw. */
export function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Turns one wrapped check into an evaluation. A thrown value is always a failure to evaluate, never
 * debt: these checks report a candidate violation and an unusable input with the same plain
 * `Error`, so nothing here can tell them apart. Findings come only from structured output.
 */
export function evaluateWrapped(run: () => readonly RuleObservation[]): RuleEvaluation {
  try {
    return { kind: 'observed', observations: run() };
  } catch (cause) {
    return { kind: 'not-evaluated', reason: reasonOf(cause) };
  }
}

/** Policy, not code, decides whether an observation refuses the candidate. */
export function toFinding(ruleId: string, mode: RuleMode, observation: RuleObservation): Finding {
  return {
    ruleId,
    path: observation.path,
    ...(observation.subject === undefined ? {} : { subject: observation.subject }),
    message: observation.message,
    effect: mode === 'observe' ? 'debt' : 'refusal',
  };
}
```

### 6.4 apps/wiki/cli/src/inventory/read-blob.ts — part 1

The body is cli.ts's private `readBlob` (cli.ts:87-101) verbatim, with its `Proof:` comment, renamed
and given JSDoc. Behaviour, message and error class are unchanged.

```ts
/**
 * Reads one selected blob by its object identity, never from the working tree.
 * @throws Error naming the blob and the path Git could not read.
 */
export function readCandidateBlob(repository: string, blob: string, path: string): Uint8Array {
  const invocation = Bun.spawnSync(['git', '-C', repository, 'cat-file', 'blob', blob], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (invocation.exitCode !== 0) {
    // Proof: an injected exit 23 made artifact validation refuse
    // `docs/review-evidence/second.v1.json: injected unreadable artifact` at this boundary.
    const detail = invocation.stderr.toString('utf8').trim();
    throw new Error(
      `cannot read selected blob ${blob} for ${path}: ${detail.length === 0 ? `git exited ${String(invocation.exitCode)}` : detail}`,
    );
  }
  return invocation.stdout;
}
```

cli.ts imports it and updates its three call sites (cli.ts:121, 147, 175).

### 6.5 apps/wiki/cli/src/rules/registry.ts — part 1

`registeredIds` lives here, so part 1 depends on nothing later.

```ts
import { classifyEntries } from '../inventory/classify-entries';
import { readCandidateBlob } from '../inventory/read-blob';
import { extractRelationships } from '../relationships';
import { evaluateWrapped, type RegisteredRule } from './rule';

const SpecSource = 'openspec/changes/twilight-bureaucrat-rule-model/specs/bureaucrat-rules/spec.md';

const classificationRule: RegisteredRule = {
  id: 'INV-CLASSIFY',
  family: 'inventory',
  statement: 'Every tracked entry is classified by exactly one rule of the classification policy.',
  source: `${SpecSource}#requirement-inventory-classification`,
  inputs: ['candidate.entries', 'policy.classificationPolicy'],
  evaluate: (context) => {
    const classificationPolicy = context.classificationPolicy;
    if (classificationPolicy === undefined) {
      return { kind: 'not-evaluated', reason: 'the rule policy carries no classification policy' };
    }
    return evaluateWrapped(() => {
      classifyEntries(context.candidate.entries, classificationPolicy, (blob, path) =>
        readCandidateBlob(context.repository, blob, path),
      );
      return [];
    });
  },
};

const directEntriesRule: RegisteredRule = {
  id: 'MOD-DIRECT-ENTRIES',
  family: 'modules',
  statement: 'A module index declares no more direct entries than the reviewed limit.',
  source: `${SpecSource}#requirement-module-index-direct-entry-limit`,
  inputs: ['candidate.entries'],
  evaluate: (context) =>
    context.indexes.ok
      ? {
          kind: 'observed',
          observations: context.indexes.report.reviewDebt.map((debt) => ({
            path: debt.indexPath,
            message: `index declares ${String(debt.directEntries)} direct entries, limit ${String(debt.limit)}`,
          })),
        }
      : {
          // The limit was never judged, so no mode may report this rule as clean.
          kind: 'not-evaluated',
          reason: `the index report is unavailable: ${context.indexes.reason}`,
        },
};

const moduleIndexRule: RegisteredRule = {
  id: 'MOD-INDEX',
  family: 'modules',
  statement:
    'Each module index declares exactly the candidate files nearest to it, and every Markdown reference and anchor it states resolves inside the candidate.',
  source: `${SpecSource}#requirement-module-index-declarations`,
  inputs: ['candidate.entries'],
  // `checkIndexes` returns nothing when it is satisfied and throws when it is not, so this rule
  // produces no finding in slice B0; see the rule model's failure policy.
  evaluate: (context) =>
    context.indexes.ok
      ? { kind: 'observed', observations: [] }
      : { kind: 'not-evaluated', reason: context.indexes.reason },
};

const relationshipsRule: RegisteredRule = {
  id: 'REL-EXTRACT',
  family: 'relationships',
  statement: 'Every declared relationship of the candidate resolves to an extracted selector.',
  source: `${SpecSource}#requirement-relationship-resolution`,
  inputs: ['candidate.entries', 'policy.relationshipRequest'],
  evaluate: (context) => {
    const relationshipRequest = context.relationshipRequest;
    if (relationshipRequest === undefined) {
      return { kind: 'not-evaluated', reason: 'the rule policy carries no relationship request' };
    }
    return evaluateWrapped(() =>
      extractRelationships(
        context.repository,
        context.candidate,
        relationshipRequest,
      ).declarations.unresolved.map((unresolved) => ({
        path: '.',
        subject: unresolved.relationshipId,
        message: `declared relationship is unresolved: ${unresolved.reason}`,
      })),
    );
  },
};

const rules: readonly RegisteredRule[] = [
  classificationRule,
  directEntriesRule,
  moduleIndexRule,
  relationshipsRule,
];

/** The registry, sorted by identifier so a verdict's rule list is stable. */
export function registeredRules(): readonly RegisteredRule[] {
  return [...rules].sort((left, right) => (left.id < right.id ? -1 : 1));
}

export function findRule(ruleId: string): RegisteredRule | undefined {
  return rules.find((rule) => rule.id === ruleId);
}

/** Every registered identifier, for a refusal that has to name the alternatives. */
export function registeredIds(): string {
  return registeredRules()
    .map((rule) => rule.id)
    .join(', ');
}
```

The two `undefined` branches are unreachable from the command line, because `assertPolicyInputs`
refuses first in part 2. They exist because the type allows the value, and they deliberately carry a
message that does not repeat the policy-boundary diagnostic, so proof P8 can tell the two apart.

### 6.6 apps/wiki/cli/src/rules/check.ts — part 1's version, complete

Part 1 creates exactly this file. Part 2 adds to it; nothing here is edited again.

```ts
import { findRule, registeredIds } from './registry';
import type { Rule } from './rule';

function selectRule(ruleId: string): Rule {
  const rule = findRule(ruleId);
  if (rule === undefined) {
    throw new Error(`unknown rule: ${ruleId} (registered: ${registeredIds()})`);
  }
  return rule;
}

/** The rule record `explain` prints. Part 2 adds the stated mode. */
export interface RuleExplanation extends Rule {
  readonly policyId?: string;
  readonly mode?: RuleMode;
}

/**
 * The registry record for one rule. The design's "last negative proof" field waits for the proof
 * register of slice B4; this record carries no placeholder for it.
 * @throws Error when the rule is not registered.
 */
export function explainRule(ruleId: string): RuleExplanation {
  const { id, family, statement, source, inputs } = selectRule(ruleId);
  return { id, family, statement, source, inputs };
}

/** `explain <rule-id>` */
export function writeExplainCommand(argv: readonly string[]): void {
  process.stdout.write(`${JSON.stringify(explainRule(argv[1]))}\n`);
}
```

`RuleMode` is imported from `./rule` in the same `import type` statement as `Rule`. Part 1's
`selectRule` returns `Rule`; part 2 widens it to `RegisteredRule`, which is a subtype, so no part-1
caller changes.

**What part 1 actually landed, which parts 2 to 4 must match** (read from the committed tree on
2026-09-20, not from this section):

- `check.ts` imports `import { findRule, registeredIds } from './registry';` and
  `import type { Rule, RuleMode } from './rule';`.
- `selectRule` carries P1's observed proof comment **between** `const rule = findRule(ruleId);` and
  the `if (rule === undefined)` guard. Leave it exactly where it is; part 2 edits around it.
- `rules.test.ts` holds one describe, `explain production CLI`, with two tests:
  `prints the registry record for a known rule` and
  `refuses an unregistered rule identifier and names every registered rule`. The joined `-t`
  patterns are therefore `explain production CLI prints the registry record for a known rule` and
  `explain production CLI refuses an unregistered rule identifier and names every registered rule`.
- `cli.ts` has the two-argument `explain` route, but its `unknown command` usage line does **not**
  list `explain`. Part 2 adds both words to it.
- `bin.ts` already lists `'explain'` in `validatorCommands` and carries the help line
  `  twilight-bureaucrat explain <rule-id>`. Part 2 adds `'check'` and widens the `explain` line.
- The delta spec holds the eleven requirements, and the four anchors registry.ts cites
  (`#requirement-module-index-declarations`, `#requirement-module-index-direct-entry-limit`,
  `#requirement-inventory-classification`, `#requirement-relationship-resolution`) all resolve.
- `verify.md` holds the proof table with rows P1 to P19 and an empty `Observed failure` column, and
  an empty `## Commands and results` heading. `tasks.md` holds four sections whose boxes are all
  unticked.

Part 1's route in cli.ts, inserted before the `validate-policy-activation` route:

```ts
if (args.length === 2 && args[0] === 'explain') {
  return import('./rules/check').then(({ writeExplainCommand }) => {
    writeExplainCommand(args);
  });
}
```

and `'explain'` is added to bin.ts's `validatorCommands`, with the help line
`  twilight-bureaucrat explain <rule-id>`.

### 6.7 Part 2's additions

**apps/wiki/cli/src/policy/trust.ts**, inserted immediately before
`export function loadTrustedPolicy(` (line 513 on the part-1 tree). `realpathSync` is already
imported at line 2, and `readStableArtifact` (line 279) and `assertExternal` (line 315) are already
in scope; nothing else in the file changes.

```ts
/**
 * Reads one artifact that must live outside the candidate, through the same stable read and the
 * same containment refusal every trusted input in {@link loadTrustedPolicy} uses. A candidate
 * cannot select the policy that judges it.
 *
 * `candidateRoot` must already be the resolved Git worktree root, not a caller's interior
 * directory: `resolveCandidateRoot` in `inventory/read-candidate.ts` produces it.
 * @throws Error when the path is unreadable, changes while it is read, or resolves inside the root.
 */
export function readExternalArtifact(
  candidateRoot: string,
  path: string,
  subject: string,
): { path: string; bytes: Uint8Array } {
  const artifact = readStableArtifact(path, subject);
  assertExternal(realpathSync(candidateRoot), artifact, subject);
  return artifact;
}
```

**apps/wiki/cli/src/inventory/read-candidate.ts**: rename the definition at line 116 and its single
caller at line 446 (fact 13). Nothing else changes.

```ts
/**
 * Resolves the Git worktree root of a caller's repository argument, which may be an interior
 * directory. Every boundary that must decide what is inside the candidate uses this root.
 * @throws {@link CandidateReadError} `not-repository`.
 */
export function resolveCandidateRoot(repository: string): string {
```

**apps/wiki/cli/src/rules/rule-policy.ts**:

```ts
import { parseOrThrow, type } from '@shared/validation';

import {
  ClassificationPolicy,
  OpaqueId,
  RelationshipRequest,
  SchemaVersion,
} from '../contracts/records';
import { readExternalArtifact } from '../policy/trust';
import { findRule, registeredIds, registeredRules } from './registry';
import { requiredPolicyInputs, type RuleMode } from './rule';

const RuleModeRecord = type({
  ruleId: 'string>=1',
  mode: "'observe'|'ratchet'|'enforce'",
}).onUndeclaredKey('reject');

const RulePolicyRecord = type({
  schemaVersion: SchemaVersion,
  policyId: OpaqueId,
  ruleModes: RuleModeRecord.array(),
  'classificationPolicy?': ClassificationPolicy,
  'relationshipRequest?': RelationshipRequest,
}).onUndeclaredKey('reject');

export type RulePolicy = typeof RulePolicyRecord.infer;

function decodeRulePolicy(bytes: Uint8Array, path: string): RulePolicy {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`rule policy ${path} is not UTF-8: ${detail}`, { cause });
  }
  let input: unknown;
  try {
    input = JSON.parse(source) as unknown;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`malformed rule policy JSON ${path}: ${detail}`, { cause });
  }
  return parseOrThrow(RulePolicyRecord, input);
}

/**
 * Loads the consumer's rule policy from outside the candidate and checks it against the registry.
 *
 * Every registered rule needs a mode and every named rule must exist: an absent entry is unknown
 * state, and AGENTS.md R5 forbids defaulting it. `ratchet` is refused until the adopted set that
 * gives it meaning arrives with slice B2.
 * @throws Error naming the offending rule identifier.
 */
export function loadRulePolicy(candidateRoot: string, path: string): RulePolicy {
  const artifact = readExternalArtifact(candidateRoot, path, 'rule policy');
  const policy = decodeRulePolicy(artifact.bytes, artifact.path);
  const stated = new Set<string>();
  for (const { ruleId, mode } of policy.ruleModes) {
    if (stated.has(ruleId)) throw new Error(`rule policy states a mode for ${ruleId} twice`);
    stated.add(ruleId);
    if (findRule(ruleId) === undefined) {
      throw new Error(
        `rule policy names an unregistered rule: ${ruleId} (registered: ${registeredIds()})`,
      );
    }
    if (mode === 'ratchet') {
      throw new Error(
        `rule policy sets ${ruleId} to ratchet, which has no adopted set until slice B2`,
      );
    }
  }
  for (const rule of registeredRules()) {
    if (!stated.has(rule.id)) throw new Error(`rule policy states no mode for ${rule.id}`);
  }
  return policy;
}

/** The mode the policy states for one rule. @throws Error when the policy states none. */
export function ruleMode(policy: RulePolicy, ruleId: string): RuleMode {
  const stated = policy.ruleModes.find((entry) => entry.ruleId === ruleId);
  if (stated === undefined) throw new Error(`rule policy states no mode for ${ruleId}`);
  return stated.mode;
}

/** @throws Error naming the rule and the policy field it needs. */
export function assertPolicyInputs(policy: RulePolicy, ruleId: string): void {
  const rule = findRule(ruleId);
  if (rule === undefined) {
    throw new Error(`unknown rule: ${ruleId} (registered: ${registeredIds()})`);
  }
  for (const input of requiredPolicyInputs(rule)) {
    const absent =
      (input === 'policy.classificationPolicy' && policy.classificationPolicy === undefined) ||
      (input === 'policy.relationshipRequest' && policy.relationshipRequest === undefined);
    if (absent) {
      throw new Error(`rule ${ruleId} needs ${input}, which the rule policy omits`);
    }
  }
}
```

**apps/wiki/cli/src/rules/check.ts**, part 2's additions. The file's final import block is:

```ts
import { hashCanonical } from '../evidence/content-manifest';
import { checkIndexes } from '../indexes/check-indexes';
import {
  type CandidateRequest,
  type CandidateSnapshot,
  readCandidate,
  resolveCandidateRoot,
} from '../inventory/read-candidate';
import { findRule, registeredIds, registeredRules } from './registry';
import { assertPolicyInputs, loadRulePolicy, ruleMode } from './rule-policy';
import {
  type Finding,
  type IndexReport,
  reasonOf,
  type RegisteredRule,
  type Rule,
  type RuleMode,
  type RuleOutcome,
  toFinding,
  type UnevaluatedRule,
  type Verdict,
} from './rule';
```

and the added code is:

```ts
export interface CheckRequest {
  repository: string;
  candidate: CandidateRequest;
  rulePolicyPath: string;
  /** When present, only this rule runs. The verdict still says which rules ran. */
  ruleId?: string;
}

function readIndexOutcome(
  repository: string,
  candidate: CandidateSnapshot,
): RuleOutcome<IndexReport> {
  try {
    return { ok: true, report: checkIndexes(repository, candidate) };
  } catch (cause) {
    // Modeled recovery: `checkIndexes` refuses by throwing, and a throw is a failure to evaluate.
    return { ok: false, reason: reasonOf(cause) };
  }
}

/** Runs every selected rule over one candidate and returns one verdict. Never certifies. */
export function checkCandidate(request: CheckRequest): Verdict {
  const candidateRoot = resolveCandidateRoot(request.repository);
  const policy = loadRulePolicy(candidateRoot, request.rulePolicyPath);
  const selected: readonly RegisteredRule[] =
    request.ruleId === undefined ? registeredRules() : [selectRule(request.ruleId)];
  for (const rule of selected) assertPolicyInputs(policy, rule.id);
  const candidate = readCandidate(candidateRoot, request.candidate);
  const context = {
    repository: candidateRoot,
    candidate,
    ...(policy.classificationPolicy === undefined
      ? {}
      : { classificationPolicy: policy.classificationPolicy }),
    ...(policy.relationshipRequest === undefined
      ? {}
      : { relationshipRequest: policy.relationshipRequest }),
    indexes: readIndexOutcome(candidateRoot, candidate),
  };
  const findings: Finding[] = [];
  const unevaluated: UnevaluatedRule[] = [];
  for (const rule of selected) {
    const mode = ruleMode(policy, rule.id);
    const evaluation = rule.evaluate(context);
    if (evaluation.kind === 'not-evaluated') {
      unevaluated.push({ ruleId: rule.id, reason: evaluation.reason });
      continue;
    }
    for (const observation of evaluation.observations) {
      findings.push(toFinding(rule.id, mode, observation));
    }
  }
  return {
    schemaVersion: 1,
    // The identity `lintTrustedCandidate` records (apps/wiki/cli/src/policy/trust.ts:1480).
    candidate: hashCanonical({
      selection: candidate.selection,
      entries: candidate.entries,
      untracked: candidate.untracked,
    }),
    policy: policy.policyId,
    // A rule that could not be evaluated is not an allowed candidate, in any mode.
    allowed: unevaluated.length === 0 && !findings.some((finding) => finding.effect === 'refusal'),
    ruleIds: selected.map((rule) => rule.id),
    findings,
    unevaluated,
    certifies: false,
  };
}

function candidateRequest(kind: string, revision: string): CandidateRequest {
  if (kind !== 'committed' && kind !== 'staged' && kind !== 'working') {
    throw new Error(
      'usage: twilight-bureaucrat check <committed|staged|working> <repository> <revision-or-base> <rule-policy-json> [--rule <rule-id>]',
    );
  }
  return kind === 'committed' ? { kind, revision } : { kind, base: revision };
}

/** `check <committed|staged|working> <repository> <revision-or-base> <policy> [--rule <id>]` */
export function writeCheckCommand(argv: readonly string[]): void {
  const [, kind, repository, revision, rulePolicyPath, flag, ruleId] = argv;
  if (argv.length === 7 && flag !== '--rule') {
    throw new Error(`the only check flag is --rule <rule-id>: received ${flag}`);
  }
  const verdict = checkCandidate({
    repository,
    candidate: candidateRequest(kind, revision),
    rulePolicyPath,
    ...(argv.length === 7 ? { ruleId } : {}),
  });
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
  // A refused or unevaluated verdict must fail the caller's shell while the record still reaches
  // stdout, so this route sets the exit code instead of throwing.
  if (!verdict.allowed) process.exitCode = 1;
}
```

`selectRule`'s return type widens to `RegisteredRule`, `explainRule` gains its optional second
argument, and `writeExplainCommand` gains the four-argument branch:

```ts
export function explainRule(
  ruleId: string,
  policySelection?: { candidateRepository: string; rulePolicyPath: string },
): RuleExplanation {
  const { id, family, statement, source, inputs } = selectRule(ruleId);
  const rule: Rule = { id, family, statement, source, inputs };
  if (policySelection === undefined) return rule;
  const policy = loadRulePolicy(
    resolveCandidateRoot(policySelection.candidateRepository),
    policySelection.rulePolicyPath,
  );
  return { ...rule, policyId: policy.policyId, mode: ruleMode(policy, id) };
}

/** `explain <rule-id>` or `explain <rule-id> <repository> <rule-policy-json>` */
export function writeExplainCommand(argv: readonly string[]): void {
  const [, ruleId, repository, rulePolicyPath] = argv;
  process.stdout.write(
    `${JSON.stringify(
      argv.length === 4
        ? explainRule(ruleId, { candidateRepository: repository, rulePolicyPath })
        : explainRule(ruleId),
    )}\n`,
  );
}
```

Part 2's routes in cli.ts: the `explain` guard becomes
`(args.length === 2 || args.length === 4)`, and the `check` route is added:

```ts
if ((args.length === 5 || args.length === 7) && args[0] === 'check') {
  return import('./rules/check').then(({ writeCheckCommand }) => {
    writeCheckCommand(args);
  });
}
```

In cli.ts's `unknown command` usage line, replace the exact substring

```
|lint-local|lint-ci|validate-policy-activation>
```

with

```
|lint-local|lint-ci|check|explain|validate-policy-activation>
```

Part 1 added the `explain` route without adding the word to this line; part 2 adds both.

In bin.ts, `validatorCommands` gains `'check'` after `'explain'`, the existing help line
`  twilight-bureaucrat explain <rule-id>` becomes
`  twilight-bureaucrat explain <rule-id> [<repository> <rule-policy-json>]`, and a new help line is
added above it:
`  twilight-bureaucrat check <committed|staged|working> <repository> <revision-or-base> <rule-policy-json> [--rule <rule-id>]`.
No test pins the text of either dispatcher's usage or help string; checked on 2026-09-20,
`build.test.ts:89` asserts only that an unknown command's stderr contains `unknown command`.

**How an unusable policy is refused.** `readExternalArtifact` delegates to `readStableArtifact`,
whose `openSync` failure becomes `cannot open rule policy <path>: <detail>`. An absent file and an
existing but unreadable file are therefore refused by the same boundary and told apart by the
detail: `ENOENT: no such file or directory` against `EACCES: permission denied`. Part 2's decoding
test asserts both details, so neither case can be silently defaulted.

### 6.8 The rule policy document

Written **outside** the candidate's Git worktree. Minimal form, usable only with a `--rule`
selection naming a module rule, because the other two rules need their policy inputs:

```json
{
  "schemaVersion": 1,
  "policyId": "rules.example.v1",
  "ruleModes": [
    { "ruleId": "INV-CLASSIFY", "mode": "observe" },
    { "ruleId": "MOD-DIRECT-ENTRIES", "mode": "observe" },
    { "ruleId": "MOD-INDEX", "mode": "enforce" },
    { "ruleId": "REL-EXTRACT", "mode": "observe" }
  ]
}
```

Complete form, which the default all-rules `check` requires: the same document plus
`"classificationPolicy"` holding the parsed contents of
apps/wiki/cli/src/contracts/fixtures/classification-policy.v1.json and

```json
  "relationshipRequest": {
    "schemaVersion": 1,
    "typescript": { "configPaths": ["tsconfig.json"], "publicEntrypoints": ["src/entry.ts"] }
  }
```

whose two arrays must be non-empty and name paths the candidate contains
(contracts/records.ts:214-236). Adding `"declarationPaths": ["relationships.v1.json"]` makes the
extractor read that declaration, which is how part 3 produces a real unresolved finding.

---

## Part 1 — OpenSpec change, rule model, registry and static `explain`

### 1.1 Preparation

- [ ] Run:

  ```sh
  repo_root=$(pwd -P)
  task_tmp=$(mktemp -d "${TMPDIR:?launcher must supply TMPDIR}/rule-model-XXXXXX")
  printf 'repo_root=%s\ntask_tmp=%s\n' "$repo_root" "$task_tmp"
  ```

  Expected: both paths print, and `task_tmp` is beneath the launcher's `TMPDIR`.

- [ ] Confirm the starting point: `git -C "$repo_root" status --porcelain` shows no file from this
      packet's file plan. Expected: none present. If any is, stop and report.

### 1.2 The OpenSpec change

- [ ] Create openspec/changes/twilight-bureaucrat-rule-model/.openspec.yaml with
      `schema: sdd-lean` and `created: 2026-09-19`.
- [ ] Write proposal.md from openspec/schemas/sdd-lean/templates/proposal.md with the content of
      section 9. Count the words: the cap is 400, excluding the template's HTML comments.
- [ ] Write specs/bureaucrat-rules/spec.md with the **eleven** requirements of section 9, each with
      at least one four-hashtag scenario.
- [ ] Write tasks.md as these four parts, each naming its tests and its negatives.
- [ ] Write verify.md with the section 8 table, rows empty, and a "Commands and results" heading.
- [ ] Run the batch README's **OpenSpec validation** block verbatim. Expected: one JSON report and
      the block exits 0.

### 1.3 The rule model, test first

- [ ] Create apps/wiki/cli/src/rules/rules.test.ts with **only** the part 1 header and tests of
      section 1.6. It must contain no helper it does not use: unused bindings fail
      `lint:source`.
- [ ] Run, in a subshell:

  ```sh
  (cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
    bun test --preload ../../../tools/test/scratch/preload.ts src/rules/rules.test.ts)
  ```

  Expected: both tests fail, because `explain` is not a command. Record the failing line.

- [ ] Create apps/wiki/cli/src/rules/rule.ts (section 6.3).
- [ ] Create apps/wiki/cli/src/inventory/read-blob.ts (section 6.4) by moving cli.ts's private
      `readBlob` verbatim, keeping its `Proof:` comment.
- [ ] Edit cli.ts: delete the private `readBlob`, import `readCandidateBlob`, update the three call
      sites at lines 121, 147 and 175. Nothing else in those functions changes.
- [ ] Create apps/wiki/cli/src/rules/registry.ts (section 6.5).
- [ ] Create apps/wiki/cli/src/rules/check.ts (section 6.6) — the part 1 version, complete.
- [ ] Add the two-argument `explain` route to cli.ts, `'explain'` to bin.ts's `validatorCommands`,
      and bin.ts's help line.
- [ ] Rerun the focused command. Expected: both tests pass.

### 1.4 Negative proof

| #   | Check                                                     | Fault                                             | Test that must fail                                                                                                                  |
| --- | --------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | `selectRule`'s unknown-identifier refusal, rules/check.ts | Return `registeredRules()[0]` instead of throwing | `refuses an unregistered rule identifier and names every registered rule` — the command exits 0 and prints the `INV-CLASSIFY` record |

Procedure, for this and every later proof: `cp <file> "$task_tmp/"` first; inject; run the named
test; **observe and record the failing line**; copy the saved file back; `cmp` the two; rerun the
test green; only then write the adjacent `Proof:` comment, dated with the real date, describing what
you saw.

### 1.5 Part 1 verification

| Command                                                                                                                                                                                                      | Expected                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `(cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" bun test --preload ../../../tools/test/scratch/preload.ts src/rules/rules.test.ts)`                              | Exit 0; 2 pass, 0 fail.                                                                             |
| `(cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" bun test --preload ../../../tools/test/scratch/preload.ts src/cli.test.ts src/inventory/classification.test.ts)` | Exit 0. These two suites exercise the moved blob reader; they prove the extraction changed nothing. |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`                                                                                                                                                  | Exit 0.                                                                                             |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`                                                                                                                                                | Exit 0, no warnings.                                                                                |
| The batch README's **OpenSpec validation** block                                                                                                                                                             | One JSON report; the block exits 0.                                                                 |

Pending planner verification, to be listed in the report as not run here: the whole
`twilight-bureaucrat:test` target, the whole `tool-devsync:test` target, and the host gate.

### 1.6 Part 1's test file

```ts
import { Buffer } from 'node:buffer';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

const cliPath = join(import.meta.dir, '..', 'cli.ts');

function runCli(argv: string[]): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync([process.execPath, 'run', cliPath, ...argv], {
    cwd: import.meta.dir,
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
}

function stdoutOf(invocation: ReturnType<typeof Bun.spawnSync>): string {
  if (invocation.stdout === undefined) throw new Error('stdout pipe was unavailable');
  return Buffer.from(invocation.stdout).toString('utf8');
}

function stderrOf(invocation: ReturnType<typeof Bun.spawnSync>): string {
  if (invocation.stderr === undefined) throw new Error('stderr pipe was unavailable');
  return Buffer.from(invocation.stderr).toString('utf8');
}

describe('explain production CLI', () => {
  test('prints the registry record for a known rule', () => {
    const invocation = runCli(['explain', 'MOD-INDEX']);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(JSON.parse(stdoutOf(invocation)) as unknown).toEqual({
      id: 'MOD-INDEX',
      family: 'modules',
      statement:
        'Each module index declares exactly the candidate files nearest to it, and every Markdown reference and anchor it states resolves inside the candidate.',
      source:
        'openspec/changes/twilight-bureaucrat-rule-model/specs/bureaucrat-rules/spec.md#requirement-module-index-declarations',
      inputs: ['candidate.entries'],
    });
  });

  test('refuses an unregistered rule identifier and names every registered rule', () => {
    const invocation = runCli(['explain', 'NO-SUCH-RULE']);
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'unknown rule: NO-SUCH-RULE (registered: INV-CLASSIFY, MOD-DIRECT-ENTRIES, MOD-INDEX, REL-EXTRACT)',
    );
  });
});
```

`runCli`, `stdoutOf` and `stderrOf` are used by every later part, which appends its own helpers
beside them.

### 1.7 Ready to commit

Commit subject: `feat(bureaucrat): add the rule model, the registry and explain`.

Files: openspec/changes/twilight-bureaucrat-rule-model/.openspec.yaml,
openspec/changes/twilight-bureaucrat-rule-model/proposal.md,
openspec/changes/twilight-bureaucrat-rule-model/specs/bureaucrat-rules/spec.md,
openspec/changes/twilight-bureaucrat-rule-model/tasks.md,
openspec/changes/twilight-bureaucrat-rule-model/verify.md,
apps/wiki/cli/src/rules/rule.ts, apps/wiki/cli/src/rules/registry.ts,
apps/wiki/cli/src/rules/check.ts, apps/wiki/cli/src/rules/rules.test.ts,
apps/wiki/cli/src/inventory/read-blob.ts, apps/wiki/cli/src/cli.ts, apps/wiki/cli/src/bin.ts.

Then stop and hand over. Do not start part 2.

### 1.8 Part 1 stop conditions

1. A file this part must create already exists, or `apps/wiki/cli/src/rules/rule-policy.ts`, which
   Part 2 creates, already exists. Existing files scheduled for modification in later parts are
   expected.
2. The `readBlob` extraction changes any existing test's result.
3. `lint:source` reports something that cannot be fixed without a suppression.
4. The OpenSpec validation block fails and the cause is not in this change's own artifacts.
5. The 400-word intent cap cannot be met: the change is too big, report rather than trimming
   requirements.

---

## Part 2 — the policy boundary and `check`

Starts from the committed part 1, whose tree already carries the rules directory, the two-argument
`explain` route and the eleven-requirement delta spec. Read section 0 in full first: it carries the
sandbox rules, the named-test filter form and the fault procedure this part depends on.

### 2.1 Preparation

- [ ] Run:

  ```sh
  repo_root=$(pwd -P)
  task_tmp=$(mktemp -d "${TMPDIR:?launcher must supply TMPDIR}/rule-model-XXXXXX")
  mkdir -p "$TMPDIR/evidence"
  printf 'repo_root=%s\ntask_tmp=%s\n' "$repo_root" "$task_tmp"
  ```

  Expected: both paths print, and `task_tmp` is beneath the launcher's `TMPDIR`.

- [ ] Confirm the starting tree is part 1's:

  ```sh
  ls "$repo_root/apps/wiki/cli/src/rules/"
  (cd "$repo_root/apps/wiki/cli" && bun run src/cli.ts explain MOD-INDEX)
  ```

  Expected: the listing names `check.ts`, `registry.ts`, `rule.ts` and `rules.test.ts`, and **does
  not** name `rule-policy.ts`; the second command exits 0 and prints one JSON object whose `id` is
  `MOD-INDEX`. If either differs, stop and report.

- [ ] Record this part's baseline test count:

  ```sh
  (cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
    bun test --preload ../../../tools/test/scratch/preload.ts src/rules/rules.test.ts)
  ```

  Expected: exit 0, `2 pass`, `0 fail`. Write that number down. Every count below is **that
  recorded baseline plus this part's own additions**, never a number this packet asserts from
  outside the attempt.

### 2.2 Tests first

- [ ] Append the fixture helpers and the **eleven** tests of section 2.6 to
      apps/wiki/cli/src/rules/rules.test.ts, after part 1's block, which is not edited.
- [ ] Run the focused command of section 2.1. Expected: the eleven new tests fail, because `check`
      is not yet a command and `explain` still takes exactly two arguments, while part 1's two still
      pass: `2 pass`, `11 fail`. Record one failing line.

### 2.3 Implementation

- [ ] Add `readExternalArtifact` to apps/wiki/cli/src/policy/trust.ts, immediately before
      `export function loadTrustedPolicy(` (section 6.7).
- [ ] Rename `resolveWorktreeRoot` to `resolveCandidateRoot` in
      apps/wiki/cli/src/inventory/read-candidate.ts, export it, and update its single caller.
      Before editing, run `git grep -n resolveWorktreeRoot -- apps/wiki/cli/src`. Expected:
      exactly the definition and single caller in inventory/read-candidate.ts (lines 116 and 446
      on 2026-09-20). Documentation references are excluded. Rename that definition and caller
      only.
- [ ] Create apps/wiki/cli/src/rules/rule-policy.ts (section 6.7).
- [ ] Add part 2's code to apps/wiki/cli/src/rules/check.ts (section 6.7), leaving part 1's
      `Proof:` comment inside `selectRule` exactly where part 1 put it.
- [ ] Add the `check` route to cli.ts, widen the `explain` route to
      `args.length === 2 || args.length === 4`, and replace the usage-line substring named in
      section 6.7.
- [ ] Add `'check'` to bin.ts's `validatorCommands` and edit the two help lines named in section
      6.7.
- [ ] Rerun the focused command. Expected: the recorded baseline plus eleven, that is `13 pass`,
      `0 fail`.
- [ ] Tick **only part 2's** boxes in openspec/changes/twilight-bureaucrat-rule-model/tasks.md and
      correct the counts that section names to the numbers you observed: eleven new tests, thirteen
      in the file, proofs P2 to P12 plus P20 and P21. Leave part 1's, part 3's and part 4's boxes
      untouched and say in the report that part 1's boxes are still unticked.

### 2.4 Negative proofs

Thirteen faults, each injected, observed and restored by the procedure in section 0.3, each
followed by its adjacent `Proof:` comment.

Every refusal test asserts its **diagnostic first and its exit status second**. That order is
deliberate: P4, P8 and P11 all keep an exit status that still looks right while losing the sentence
that names the fault, so a test that checked the status first would report nothing useful, or
nothing at all.

| #   | Check and file                                                   | Fault                                                                                                                                      | Named test, as the joined `-t` pattern, and exactly what is observed                                                                                                                                                                                                                                                                                                                  | `Proof:` comment goes in                               |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| P2  | `assertExternal` inside `readExternalArtifact`, policy/trust.ts  | Delete that call in the new function only                                                                                                  | `rule policy boundary refuses a rule policy inside the worktree even when the repository argument is interior` — the policy loads, the narrowed MOD-INDEX run prints an allowed verdict on stdout and exits 0, and the first assertion fails: `toContain` on `rule policy resolves inside selected candidate:` against an empty stderr                                                | trust.ts, beside the `assertExternal` call             |
| P3  | The root passed to the policy loader, rules/check.ts             | In `checkCandidate`, pass `request.repository` instead of `candidateRoot` to `loadRulePolicy`                                              | the same test — containment is then measured from `<repository>/src`, so a policy at the worktree root counts as outside it, loads, and the run exits 0 with the same first assertion failing against an empty stderr                                                                                                                                                                 | check.ts, beside the `loadRulePolicy` call             |
| P4  | The mode-coverage loop in `loadRulePolicy`, rules/rule-policy.ts | Delete the final `for (const rule of registeredRules())` loop                                                                              | `rule policy boundary refuses a policy that states no mode for a registered rule` — the omitted mode belongs to INV-CLASSIFY, which the narrowed run never selects, so `ruleMode` is never asked for it: the run prints an allowed MOD-INDEX verdict and exits 0, and the first assertion fails, `toContain` on `rule policy states no mode for INV-CLASSIFY` against an empty stderr | rule-policy.ts, beside the coverage loop               |
| P5  | The unregistered-rule branch in `loadRulePolicy`                 | Replace its condition with `false`                                                                                                         | `rule policy boundary refuses a policy that names an unregistered rule` — exit 0 with an allowed verdict (fact 37); the diagnostic assertion fails against an empty stderr                                                                                                                                                                                                            | rule-policy.ts, beside that branch                     |
| P6  | The duplicate-identifier branch in `loadRulePolicy`              | Delete it                                                                                                                                  | `rule policy boundary refuses a policy that states a mode for one rule twice` — the first entry silently wins (`ruleMode()` uses `.find()`), exit 0, empty stderr                                                                                                                                                                                                                     | rule-policy.ts, beside that branch                     |
| P7  | The `mode === 'ratchet'` branch in `loadRulePolicy`              | Delete it                                                                                                                                  | `rule policy boundary refuses ratchet until the adopted set exists` — exit 0, empty stderr                                                                                                                                                                                                                                                                                            | rule-policy.ts, beside that branch                     |
| P8  | `assertPolicyInputs`, rules/rule-policy.ts                       | Make the function return immediately                                                                                                       | `rule policy boundary refuses a selected rule whose policy input is absent` — the run still **exits 1**, because the registry's own branch then reports `the rule policy carries no classification policy` as unevaluated; the diagnostic assertion fails, `rule INV-CLASSIFY needs policy.classificationPolicy, which the rule policy omits` against an empty stderr                 | rule-policy.ts, inside `assertPolicyInputs`            |
| P9  | The UTF-8, JSON and schema boundaries in `decodeRulePolicy`      | Three separate injections, restored between each: a non-fatal decoder; delete the `JSON.parse` try; drop `.onUndeclaredKey('reject')`      | `rule policy boundary refuses malformed, non-UTF-8, unreadable, absent and undeclared-key policies distinctly` — one assertion fails per injection, naming the boundary whose sentence disappeared                                                                                                                                                                                    | rule-policy.ts, one comment per boundary               |
| P20 | The unusable-policy read in `loadRulePolicy`                     | Wrap the `readExternalArtifact` call in a `try` whose `catch` returns the bytes `{"schemaVersion":1,"policyId":"fallback","ruleModes":[]}` | the same test — malformed and non-UTF-8 still refuse, because those files exist and are readable, so the **unreadable** case is the first to fail: received stderr `rule policy states no mode for INV-CLASSIFY` instead of `cannot open rule policy <path>: EACCES`. The containment test also fails under this fault; record it and move on                                         | rule-policy.ts, beside the `readExternalArtifact` call |
| P10 | The `--rule` flag validation in `writeCheckCommand`              | Accept any seventh argument as the identifier                                                                                              | `check production CLI refuses an unknown selection kind, an unknown flag and an unknown narrowed rule` — `--only MOD-INDEX` then runs MOD-INDEX and exits 0, so the flag assertion fails against an empty stderr after the selection-kind assertions have passed                                                                                                                      | check.ts, beside the flag guard                        |
| P11 | `candidateRequest`'s selection-kind refusal, rules/check.ts      | Treat any other word as `committed`                                                                                                        | the same test — `bogus` is read as a selection, the unnarrowed run reaches `assertPolicyInputs` and exits 1 with `rule INV-CLASSIFY needs policy.classificationPolicy…`, so the first assertion fails: `usage: twilight-bureaucrat check <committed\|staged\|working>` is absent from that stderr                                                                                     | check.ts, inside `candidateRequest`                    |
| P12 | The `process.exitCode = 1` line in `writeCheckCommand`           | Delete the line                                                                                                                            | `check production CLI refuses an unindexed candidate in every mode and exits 1` — the verdict is still correct, the exit status becomes 0, and `expect(observed.exitCode).toBe(1)` fails with `Received: 0`                                                                                                                                                                           | check.ts, beside the exit-code line                    |
| P21 | The stated mode `explainRule` attaches, rules/check.ts           | Return `{ ...rule, policyId: policy.policyId }`, dropping `mode`                                                                           | `explain with a rule policy prints the policy identifier and the stated mode` — the printed record carries `policyId` and no `mode`, so the `toEqual` on the explanation fails naming the missing `mode: 'enforce'`                                                                                                                                                                   | check.ts, beside the policy branch of `explainRule`    |

**P9 keeps three evidence pairs.** Use distinct evidence identifiers `P9-utf8`, `P9-json` and `P9-schema`. Substitute each identifier for `P<n>` in section 0.3's patch and log filenames. Preserve all three pairs, restore and compare passing bytes between injections, and record all three observed failures in P9's verification row. Never overwrite an earlier injection's evidence.

Every policy-boundary test narrows to `--rule MOD-INDEX`. Fact 37 showed that a run without
`--rule` reaches `assertPolicyInputs` and exits 1 for an unrelated reason, which would hide P4
to P7.

- [ ] After each proof, write its observed failing line into the `Observed failure` cell of its row
      in openspec/changes/twilight-bureaucrat-rule-model/verify.md, and add rows for P20 and P21
      beside them. Correct P4's and P9's `Fault injected` and `Test` cells to the text above: part 1
      committed the older wording. Record only what this attempt saw.

### 2.5 Part 2 verification

| Command                                                                                                                                                                                                                        | Expected exit status and decisive line                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The focused command of section 2.1                                                                                                                                                                                             | Exit 0; `13 pass`, `0 fail` — the recorded baseline of 2 plus this part's 11.                                                                                                                                                                  |
| `(cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" bun test --preload ../../../tools/test/scratch/preload.ts src/inventory/read-candidate.test.ts src/policy/trusted-policy.test.ts)` | Exit 0; `56 pass`, `0 fail`. These cover the renamed worktree resolver and the trust module. This part adds no test to either file, so the number must not move. Measured on the part-1 tree on 2026-09-20: 56 tests across 2 files in 88.78s. |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`                                                                                                                                                                    | Exit 0; `Successfully ran target typecheck`.                                                                                                                                                                                                   |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`                                                                                                                                                                  | Exit 0, no warnings; `Successfully ran target lint:source`.                                                                                                                                                                                    |
| The batch README's **OpenSpec validation** block                                                                                                                                                                               | Exit 0, one JSON report kept under `$TMPDIR/evidence`. This part edits verify.md and tasks.md, so it validates the change it edited.                                                                                                           |

Pending planner verification, named as such in the report: the whole `twilight-bureaucrat:test`,
`twilight-bureaucrat:test:package` and `tool-devsync:test` targets, and the host gate.

### 2.6 Part 2's helpers and tests

Appended to apps/wiki/cli/src/rules/rules.test.ts.

```ts
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import { afterEach } from 'bun:test';

const scratchRoots: string[] = [];
const shippedClassificationPolicyPath = join(
  import.meta.dir,
  '..',
  'contracts',
  'fixtures',
  'classification-policy.v1.json',
);

interface CheckVerdict {
  schemaVersion: 1;
  candidate: string;
  policy: string;
  allowed: boolean;
  ruleIds: string[];
  findings: { ruleId: string; path: string; subject?: string; message: string; effect: string }[];
  unevaluated: { ruleId: string; reason: string }[];
  certifies: boolean;
}

function verdictOf(invocation: ReturnType<typeof Bun.spawnSync>): CheckVerdict {
  return JSON.parse(stdoutOf(invocation)) as CheckVerdict;
}

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  expect(invocation.exitCode, invocation.stderr.toString('utf8')).toBe(0);
  return invocation.stdout.toString('utf8').trim();
}

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(root);
  return root;
}

function write(root: string, path: string, source: string): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, 'utf8');
}

type Membership =
  | { kind: 'path'; path: string }
  | { kind: 'directory-prefix'; prefix: string; exclusions: string[] };

function indexSource(heading: string, moduleId: string, memberships: Membership[]): string {
  const metadata = {
    schemaVersion: 1,
    moduleId,
    memberships,
    relationshipSelectors: [],
    applicableChecks: [],
    inapplicableSections: [
      { section: 'relationships', reason: 'The fixture declares no non-derivable relationships.' },
      { section: 'invariants', reason: 'The fixture has no cross-file runtime invariant.' },
      { section: 'checks', reason: 'The rule registry is the fixture boundary check.' },
    ],
    externalConsumers: {
      kind: 'none-known',
      knowledgeLimit: 'Only consumers visible in this immutable candidate were considered.',
    },
  };
  return `# ${heading}\n\n<!-- module-index ${JSON.stringify(metadata)} -->\n`;
}

function initRepository(prefix: string): string {
  const repository = scratch(prefix);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'rules@example.test']);
  runGit(repository, ['config', 'user.name', 'Rules Fixture']);
  return repository;
}

function commit(repository: string, message: string): string {
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', message]);
  return runGit(repository, ['rev-parse', 'HEAD']);
}

/**
 * The canonical clean candidate. It carries `nx.json` and `package.json` because relationship
 * extraction refuses a candidate without an Nx workspace file, and one root index that declares
 * every root file and the `src` prefix. Verified to pass `check-indexes` with exit 0.
 */
function createIndexedCandidate(): { repository: string; revision: string } {
  const repository = initRepository('twilight-rules-candidate-');
  write(
    repository,
    'README.md',
    indexSource('Rules fixture', 'module.fixture', [
      { kind: 'path', path: 'nx.json' },
      { kind: 'path', path: 'package.json' },
      { kind: 'path', path: 'tsconfig.json' },
      { kind: 'directory-prefix', prefix: 'src', exclusions: [] },
    ]),
  );
  write(repository, 'nx.json', '{"$schema":"./node_modules/nx/schemas/nx-schema.json"}\n');
  write(repository, 'package.json', '{"name":"rules-fixture","private":true}\n');
  write(
    repository,
    'tsconfig.json',
    '{"compilerOptions":{"strict":true,"module":"ESNext","moduleResolution":"bundler","target":"ES2022"}}\n',
  );
  write(repository, 'src/entry.ts', 'export const entry = 1;\n');
  return { repository, revision: commit(repository, 'rules fixture') };
}

/** A candidate with no module index at all: `checkIndexes` refuses it. */
function createUnindexedCandidate(): { repository: string; revision: string } {
  const repository = initRepository('twilight-rules-unindexed-');
  write(repository, 'orphan.ts', 'export const orphan = 1;\n');
  return { repository, revision: commit(repository, 'no index') };
}

interface RuleModeEntry {
  ruleId: string;
  mode: 'observe' | 'ratchet' | 'enforce';
}

const everyRuleObserving: RuleModeEntry[] = [
  { ruleId: 'INV-CLASSIFY', mode: 'observe' },
  { ruleId: 'MOD-DIRECT-ENTRIES', mode: 'observe' },
  { ruleId: 'MOD-INDEX', mode: 'observe' },
  { ruleId: 'REL-EXTRACT', mode: 'observe' },
];

/** Writes a rule policy in its own scratch root, outside every candidate. */
function writeRulePolicy(ruleModes: RuleModeEntry[], extra: Record<string, unknown> = {}): string {
  const path = join(scratch('twilight-rules-policy-'), 'rule-policy.json');
  writeFileSync(
    path,
    `${JSON.stringify({ schemaVersion: 1, policyId: 'rules.test.v1', ruleModes, ...extra })}\n`,
    'utf8',
  );
  return path;
}

/** The complete policy: the shipped classification policy and a request the fixture satisfies. */
function writeCompleteRulePolicy(ruleModes: RuleModeEntry[], declarationPaths?: string[]): string {
  return writeRulePolicy(ruleModes, {
    classificationPolicy: JSON.parse(
      readFileSync(shippedClassificationPolicyPath, 'utf8'),
    ) as unknown,
    relationshipRequest: {
      schemaVersion: 1,
      typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/entry.ts'] },
      ...(declarationPaths === undefined ? {} : { declarationPaths }),
    },
  });
}

afterEach(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('rule policy boundary', () => {
  test('refuses a rule policy inside the worktree even when the repository argument is interior', () => {
    const { repository, revision } = createIndexedCandidate();
    const inside = join(repository, 'rule-policy.json');
    writeFileSync(
      inside,
      `${JSON.stringify({ schemaVersion: 1, policyId: 'rules.test.v1', ruleModes: everyRuleObserving })}\n`,
      'utf8',
    );
    const invocation = runCli([
      'check',
      'committed',
      join(repository, 'src'),
      revision,
      inside,
      '--rule',
      'MOD-INDEX',
    ]);
    // The diagnostic is asserted before the status throughout this describe: the faults of
    // section 2.4 lose the sentence while keeping a status that still looks right.
    expect(stderrOf(invocation)).toContain(
      `rule policy resolves inside selected candidate: ${inside}`,
    );
    expect(invocation.exitCode).toBe(1);
  });

  test('refuses a policy that states no mode for a registered rule', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy(
      everyRuleObserving.filter((entry) => entry.ruleId !== 'INV-CLASSIFY'),
    );
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(stderrOf(invocation)).toContain('rule policy states no mode for INV-CLASSIFY');
    expect(invocation.exitCode).toBe(1);
  });

  test('refuses a policy that names an unregistered rule', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy([
      ...everyRuleObserving,
      { ruleId: 'NO-SUCH-RULE', mode: 'observe' },
    ]);
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(stderrOf(invocation)).toContain('rule policy names an unregistered rule: NO-SUCH-RULE');
    expect(invocation.exitCode).toBe(1);
  });

  test('refuses a policy that states a mode for one rule twice', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy([
      ...everyRuleObserving,
      { ruleId: 'MOD-INDEX', mode: 'enforce' },
    ]);
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(stderrOf(invocation)).toContain('rule policy states a mode for MOD-INDEX twice');
    expect(invocation.exitCode).toBe(1);
  });

  test('refuses ratchet until the adopted set exists', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy(
      everyRuleObserving.map((entry) =>
        entry.ruleId === 'INV-CLASSIFY' ? { ...entry, mode: 'ratchet' as const } : entry,
      ),
    );
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(stderrOf(invocation)).toContain(
      'rule policy sets INV-CLASSIFY to ratchet, which has no adopted set until slice B2',
    );
    expect(invocation.exitCode).toBe(1);
  });

  test('refuses a selected rule whose policy input is absent', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy(everyRuleObserving);
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'INV-CLASSIFY',
    ]);
    // Under P8 the run still exits 1, because the registry reports the missing input as
    // unevaluated. Only this sentence tells the boundary from the fallback.
    expect(stderrOf(invocation)).toContain(
      'rule INV-CLASSIFY needs policy.classificationPolicy, which the rule policy omits',
    );
    expect(invocation.exitCode).toBe(1);
  });

  test('refuses malformed, non-UTF-8, unreadable, absent and undeclared-key policies distinctly', () => {
    const { repository, revision } = createIndexedCandidate();
    const root = scratch('twilight-rules-bad-policy-');
    const malformed = join(root, 'malformed.json');
    writeFileSync(malformed, '{\n', 'utf8');
    const notUtf8 = join(root, 'not-utf8.json');
    writeFileSync(notUtf8, Buffer.from([0xff, 0xfe, 0x7b, 0x7d]));
    const unreadable = writeRulePolicy(everyRuleObserving);
    const absent = join(root, 'absent.json');
    const undeclared = writeRulePolicy(everyRuleObserving, { unexpected: 1 });
    const run = (policyPath: string) =>
      runCli(['check', 'committed', repository, revision, policyPath, '--rule', 'MOD-INDEX']);

    const malformedInvocation = run(malformed);
    expect(stderrOf(malformedInvocation)).toContain(`malformed rule policy JSON ${malformed}`);
    expect(malformedInvocation.exitCode).toBe(1);

    const notUtf8Invocation = run(notUtf8);
    expect(stderrOf(notUtf8Invocation)).toContain(`rule policy ${notUtf8} is not UTF-8`);
    expect(notUtf8Invocation.exitCode).toBe(1);

    chmodSync(unreadable, 0o000);
    // A test process that can still read the file would prove nothing, so the fixture is
    // checked before it is used. Running as root is the case this catches.
    expect(() => readFileSync(unreadable, 'utf8')).toThrow();
    const unreadableInvocation = run(unreadable);
    chmodSync(unreadable, 0o600);
    expect(stderrOf(unreadableInvocation)).toContain(
      `cannot open rule policy ${unreadable}: EACCES`,
    );
    expect(unreadableInvocation.exitCode).toBe(1);

    const absentInvocation = run(absent);
    expect(stderrOf(absentInvocation)).toContain(`cannot open rule policy ${absent}: ENOENT`);
    expect(absentInvocation.exitCode).toBe(1);

    const undeclaredInvocation = run(undeclared);
    expect(stderrOf(undeclaredInvocation)).toContain('unexpected must be removed');
    expect(undeclaredInvocation.exitCode).toBe(1);
  });
});

describe('check production CLI', () => {
  test('allows the indexed candidate under an enforced module rule and never certifies', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy([
      { ruleId: 'INV-CLASSIFY', mode: 'observe' },
      { ruleId: 'MOD-DIRECT-ENTRIES', mode: 'enforce' },
      { ruleId: 'MOD-INDEX', mode: 'enforce' },
      { ruleId: 'REL-EXTRACT', mode: 'observe' },
    ]);
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    const verdict = verdictOf(invocation);
    expect(verdict.allowed).toBe(true);
    expect(verdict.certifies).toBe(false);
    expect(verdict.findings).toEqual([]);
    expect(verdict.unevaluated).toEqual([]);
    expect(verdict.policy).toBe('rules.test.v1');
    expect(verdict.ruleIds).toEqual(['MOD-INDEX']);
    expect(verdict.candidate).toMatch(/^[0-9a-f]{64}$/);
  });

  test('refuses an unindexed candidate in every mode and exits 1', () => {
    const { repository, revision } = createUnindexedCandidate();
    const observing = writeRulePolicy(everyRuleObserving);
    const observed = runCli([
      'check',
      'committed',
      repository,
      revision,
      observing,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(observed.exitCode).toBe(1);
    const observedVerdict = verdictOf(observed);
    expect(observedVerdict.allowed).toBe(false);
    expect(observedVerdict.findings).toEqual([]);
    expect(observedVerdict.unevaluated).toEqual([
      { ruleId: 'MOD-INDEX', reason: 'selected candidate contains no module indexes' },
    ]);

    const enforcing = writeRulePolicy(
      everyRuleObserving.map((entry) =>
        entry.ruleId === 'MOD-INDEX' ? { ...entry, mode: 'enforce' as const } : entry,
      ),
    );
    const enforced = runCli([
      'check',
      'committed',
      repository,
      revision,
      enforcing,
      '--rule',
      'MOD-INDEX',
    ]);
    expect(enforced.exitCode).toBe(1);
    expect(verdictOf(enforced).unevaluated).toEqual(observedVerdict.unevaluated);
  });

  test('refuses an unknown selection kind, an unknown flag and an unknown narrowed rule', () => {
    const { repository, revision } = createIndexedCandidate();
    const policyPath = writeRulePolicy(everyRuleObserving);
    const badKind = runCli(['check', 'bogus', repository, revision, policyPath]);
    expect(stderrOf(badKind)).toContain(
      'usage: twilight-bureaucrat check <committed|staged|working>',
    );
    expect(badKind.exitCode).toBe(1);

    const badFlag = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--only',
      'MOD-INDEX',
    ]);
    expect(stderrOf(badFlag)).toContain('the only check flag is --rule <rule-id>: received --only');
    expect(badFlag.exitCode).toBe(1);

    const badRule = runCli([
      'check',
      'committed',
      repository,
      revision,
      policyPath,
      '--rule',
      'NO-SUCH-RULE',
    ]);
    expect(stderrOf(badRule)).toContain('unknown rule: NO-SUCH-RULE');
    expect(badRule.exitCode).toBe(1);
  });
});

describe('explain with a rule policy', () => {
  test('prints the policy identifier and the stated mode', () => {
    const { repository } = createIndexedCandidate();
    const policyPath = writeRulePolicy(
      everyRuleObserving.map((entry) =>
        entry.ruleId === 'MOD-INDEX' ? { ...entry, mode: 'enforce' as const } : entry,
      ),
    );
    const invocation = runCli(['explain', 'MOD-INDEX', repository, policyPath]);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(JSON.parse(stdoutOf(invocation)) as unknown).toEqual({
      id: 'MOD-INDEX',
      family: 'modules',
      statement:
        'Each module index declares exactly the candidate files nearest to it, and every Markdown reference and anchor it states resolves inside the candidate.',
      source:
        'openspec/changes/twilight-bureaucrat-rule-model/specs/bureaucrat-rules/spec.md#requirement-module-index-declarations',
      inputs: ['candidate.entries'],
      policyId: 'rules.test.v1',
      mode: 'enforce',
    });
  });
});
```

The eleven tests are seven in `rule policy boundary`, three in `check production CLI` and one in
`explain with a rule policy`. Their joined `-t` patterns are the describe name, a space, then the
title, as section 8 lists them.

`writeCompleteRulePolicy` is used by part 3's tests, not by part 2's; if `lint:source` reports it
unused here, move its definition into part 3's block. The same applies to any helper this part does
not yet call. `chmodSync` and `readFileSync` are both used by part 2's decoding test, so both
belong in this part's import line.

### 2.7 Ready to commit

Commit subject: `feat(bureaucrat): read rule modes from trusted policy and add check`.

Files: apps/wiki/cli/src/rules/rule-policy.ts, apps/wiki/cli/src/rules/check.ts,
apps/wiki/cli/src/rules/rules.test.ts, apps/wiki/cli/src/policy/trust.ts,
apps/wiki/cli/src/inventory/read-candidate.ts, apps/wiki/cli/src/cli.ts, apps/wiki/cli/src/bin.ts,
openspec/changes/twilight-bureaucrat-rule-model/tasks.md,
openspec/changes/twilight-bureaucrat-rule-model/verify.md.

Then stop and hand over. Do not start part 3.

### 2.8 Part 2 stop conditions

Each of these is false on this part's real starting tree, which is part 1 committed.

1. apps/wiki/cli/src/rules/rule-policy.ts already exists, or any of apps/wiki/cli/src/rules/rule.ts,
   registry.ts, check.ts and rules.test.ts is absent, or `explain MOD-INDEX` does not print its
   record.
2. The baseline run of section 2.1 does not report `2 pass`, `0 fail`.
3. The rename changes an existing test's result, or the pre-edit search
   `git grep -n resolveWorktreeRoot -- apps/wiki/cli/src` finds anything other than the definition
   and single caller in inventory/read-candidate.ts.
4. A policy-boundary test cannot be made to fail under its mutation, fails with a different message
   than section 2.4 predicts, or the mutation does not compile. A proof that cannot fail is the
   defect this repository exists to prevent: stop and report. A fault that additionally breaks
   other tests is **not** a stop; record which ones and continue.
5. A named-test run reports `Ran 0 tests` or `matched 0 tests`. Fix the joined pattern, and if it
   still matches nothing, stop and report.
6. A change is needed in apps/wiki/cli/package.json, apps/wiki/cli/src/packaging/install.test.ts or
   root CONTEXT.md. Other packets own all three.

---

## Part 3 — failure classification and the adapter proofs

Starts from the committed part 2. Every remaining mutation finishes here. Read section 0 in full
first.

### 3.1 Preparation

- [ ] Run:

  ```sh
  repo_root=$(pwd -P)
  task_tmp=$(mktemp -d "${TMPDIR:?launcher must supply TMPDIR}/rule-model-XXXXXX")
  mkdir -p "$TMPDIR/evidence"
  printf 'repo_root=%s\ntask_tmp=%s\n' "$repo_root" "$task_tmp"
  ```

  Expected: both paths print, and `task_tmp` is beneath the launcher's `TMPDIR`.

- [ ] Confirm the starting tree is part 2's:

  ```sh
  ls "$repo_root/apps/wiki/cli/src/rules/"
  (cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
    bun test --preload ../../../tools/test/scratch/preload.ts src/rules/rules.test.ts)
  ```

  Expected: the listing names `rule-policy.ts` as well as `check.ts`, `registry.ts`, `rule.ts` and
  `rules.test.ts`; the test run exits 0 with `13 pass`, `0 fail`. Write that number down as this
  part's baseline. If either differs, stop and report.

### 3.2 Tests first

- [ ] Append the **six** tests of section 3.5 to apps/wiki/cli/src/rules/rules.test.ts.
- [ ] Run the focused command of section 3.1. Expected: **all six pass immediately**, giving the
      recorded baseline plus six, that is `19 pass`, `0 fail`. They are coverage of the
      implementation parts 1 and 2 already delivered, not a request for new code. If one fails,
      compare it with the observed output in facts 26 to 34 and stop and report rather than
      changing the registry.
- [ ] Tick **only part 3's** boxes in openspec/changes/twilight-bureaucrat-rule-model/tasks.md and
      correct the counts that section names to the numbers you observed: six new tests, nineteen in
      the file, proofs P13 to P19 plus P22.

### 3.3 Negative proofs

Eight faults, each injected, observed and restored by the procedure in section 0.3, each followed
by its adjacent `Proof:` comment. Parts 1 and 2 changed no adapter, so every comment here lands in
a file this part is authorized to touch for that purpose only: rules/rule.ts, rules/registry.ts and
rules/check.ts.

| #   | Check and file                                                              | Fault                                                                                                      | Named test, as the joined `-t` pattern, and exactly what is observed                                                                                                                                                                                                                                                   | `Proof:` comment goes in                       |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| P13 | `toFinding`'s effect mapping, rules/rule.ts                                 | Return `effect: 'debt'` unconditionally                                                                    | `rule adapters over real candidates turns direct-entry debt into a refusal under enforce` — the finding carries `debt`, the verdict is allowed and the run exits 0, so `expect(invocation.exitCode).toBe(1)` fails with `Received: 0`                                                                                  | rule.ts, inside `toFinding`                    |
| P14 | The `unevaluated.length === 0` term in `checkCandidate`, rules/check.ts     | Delete the term                                                                                            | `rule adapters over real candidates refuses a rule whose prerequisite failed, in observe mode` — the verdict reports `"allowed":true` and the run exits 0                                                                                                                                                              | check.ts, beside the `allowed` expression      |
| P15 | `MOD-DIRECT-ENTRIES`'s `not-evaluated` branch, rules/registry.ts            | Return `{ kind: 'observed', observations: [] }`                                                            | the same test — the verdict is allowed with no finding and an empty `unevaluated`, exit 0                                                                                                                                                                                                                              | registry.ts, beside that branch                |
| P16 | `MOD-DIRECT-ENTRIES`'s `reviewDebt.map(...)`, rules/registry.ts             | Replace it with `[]`                                                                                       | `rule adapters over real candidates reports an index over the direct-entry limit with its exact counts` — `findings` is empty, so the `toEqual` on the one expected finding fails                                                                                                                                      | registry.ts, beside the mapped list            |
| P17 | The `classifyEntries` call in the `INV-CLASSIFY` adapter, rules/registry.ts | Return `[]` without calling it                                                                             | `rule adapters over real candidates refuses an unclassifiable entry in observe mode` — the verdict is allowed with an empty `unevaluated`, exit 0                                                                                                                                                                      | registry.ts, beside the `classifyEntries` call |
| P18 | `REL-EXTRACT`'s `unresolved.map(...)`, rules/registry.ts                    | Replace the mapped list with an empty one                                                                  | `rule adapters over real candidates reports a declared relationship that the candidate leaves unresolved` — observed under mutation: `"findings":[]`, exit 0 (fact 35)                                                                                                                                                 | registry.ts, beside the mapped list            |
| P19 | `evaluateWrapped`'s catch, rules/rule.ts                                    | Return `{ kind: 'observed', observations: [] }` from the catch                                             | `rule adapters over real candidates refuses an unclassifiable entry in observe mode` — the thrown violation disappears entirely and the verdict is allowed, exit 0                                                                                                                                                     | rule.ts, inside the catch                      |
| P22 | The default rule selection in `checkCandidate`, rules/check.ts              | Select nothing when `--rule` is absent: `request.ruleId === undefined ? [] : [selectRule(request.ruleId)]` | `rule adapters over real candidates allows the canonical candidate under every registered rule` — the verdict prints `"ruleIds":[]` and `"allowed":true` and exits 0, so the `toEqual` on the four identifiers fails. A check that selects no rule and then allows the candidate is exactly the check that cannot fail | check.ts, beside the selection expression      |

P18's fixture is the one thing the previous revision got wrong: an endpoint that is not a selected
path throws before the unresolved list exists (fact 36), so the finding survived the mutation. The
fixture in section 3.5 declares `status: 'unresolved'` with a reason and two **real** selected
paths, and fact 35 records the mutation emptying `findings`.

- [ ] After each proof, write its observed failing line into the `Observed failure` cell of its row
      in openspec/changes/twilight-bureaucrat-rule-model/verify.md, and add a row for P22 beside
      them. Record only what this attempt saw.

### 3.4 Part 3 verification

| Command                                                                                                                                                                                                                 | Expected exit status and decisive line                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| The focused command of section 3.1                                                                                                                                                                                      | Exit 0; `19 pass`, `0 fail` — the recorded baseline of 13 plus this part's 6.                                                                |
| `(cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" bun test --preload ../../../tools/test/scratch/preload.ts src/relationships/selectors.test.ts src/indexes/indexes.test.ts)` | Exit 0, `0 fail`. Neither file is changed by this packet; record the pass count and compare it only with a run of the same command yourself. |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`                                                                                                                                                             | Exit 0; `Successfully ran target typecheck`.                                                                                                 |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`                                                                                                                                                           | Exit 0, no warnings; `Successfully ran target lint:source`.                                                                                  |
| The batch README's **OpenSpec validation** block                                                                                                                                                                        | Exit 0, one JSON report kept under `$TMPDIR/evidence`. This part edits verify.md and tasks.md.                                               |

The relationship tests need `TOOL_WIKI_TRUSTED_NODE_MODULES`, which the commands above set. Pending
planner verification: the whole `twilight-bureaucrat:test`, `twilight-bureaucrat:test:package` and
`tool-devsync:test` targets, and the host gate.

### 3.5 Part 3's tests

```ts
describe('rule adapters over real candidates', () => {
  test('reports an index over the direct-entry limit with its exact counts', () => {
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
    const revision = commit(repository, 'over the limit');
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      writeRulePolicy(everyRuleObserving),
      '--rule',
      'MOD-DIRECT-ENTRIES',
    ]);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verdictOf(invocation).findings).toEqual([
      {
        ruleId: 'MOD-DIRECT-ENTRIES',
        path: 'README.md',
        message: 'index declares 41 direct entries, limit 40',
        effect: 'debt',
      },
    ]);
  });

  test('turns direct-entry debt into a refusal under enforce', () => {
    const repository = initRepository('twilight-rules-debt-enforce-');
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
    const revision = commit(repository, 'over the limit');
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      writeRulePolicy(
        everyRuleObserving.map((entry) =>
          entry.ruleId === 'MOD-DIRECT-ENTRIES' ? { ...entry, mode: 'enforce' as const } : entry,
        ),
      ),
      '--rule',
      'MOD-DIRECT-ENTRIES',
    ]);
    expect(invocation.exitCode).toBe(1);
    const verdict = verdictOf(invocation);
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings.map(({ effect }) => effect)).toEqual(['refusal']);
  });

  test('refuses a rule whose prerequisite failed, in observe mode', () => {
    const { repository, revision } = createUnindexedCandidate();
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      writeRulePolicy(everyRuleObserving),
      '--rule',
      'MOD-DIRECT-ENTRIES',
    ]);
    expect(invocation.exitCode).toBe(1);
    const verdict = verdictOf(invocation);
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings).toEqual([]);
    expect(verdict.unevaluated).toEqual([
      {
        ruleId: 'MOD-DIRECT-ENTRIES',
        reason: 'the index report is unavailable: selected candidate contains no module indexes',
      },
    ]);
  });

  test('refuses an unclassifiable entry in observe mode', () => {
    const { repository } = createIndexedCandidate();
    write(repository, 'src/unknown.zzz', 'unclassifiable\n');
    const revision = commit(repository, 'add an unclassifiable entry');
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      writeCompleteRulePolicy(everyRuleObserving),
      '--rule',
      'INV-CLASSIFY',
    ]);
    expect(invocation.exitCode).toBe(1);
    const verdict = verdictOf(invocation);
    expect(verdict.allowed).toBe(false);
    expect(verdict.findings).toEqual([]);
    expect(verdict.unevaluated).toEqual([
      {
        ruleId: 'INV-CLASSIFY',
        reason: 'ordinary content src/unknown.zzz matched 0 classification rules',
      },
    ]);
  });

  test('reports a declared relationship that the candidate leaves unresolved', () => {
    const { repository } = createIndexedCandidate();
    write(
      repository,
      'relationships.v1.json',
      `${JSON.stringify({
        schemaVersion: 1,
        declarationId: 'fixture.relationships',
        selectorVersion: 1,
        coverage: 'selected-facts-only',
        facts: [],
        edges: [
          {
            relationshipId: 'dynamic-shell-read',
            kind: 'reads',
            status: 'unresolved',
            // Both endpoints must be selected candidate paths: an endpoint the candidate does not
            // contain is refused before the unresolved list is built.
            source: { kind: 'path', path: 'package.json' },
            target: { kind: 'path', path: 'src/entry.ts' },
            reason: 'the shell computes the variable name at runtime',
          },
        ],
      })}\n`,
    );
    write(
      repository,
      'README.md',
      indexSource('Rules fixture', 'module.fixture', [
        { kind: 'path', path: 'nx.json' },
        { kind: 'path', path: 'package.json' },
        { kind: 'path', path: 'relationships.v1.json' },
        { kind: 'path', path: 'tsconfig.json' },
        { kind: 'directory-prefix', prefix: 'src', exclusions: [] },
      ]),
    );
    const revision = commit(repository, 'declare an unresolved relationship');
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      writeCompleteRulePolicy(everyRuleObserving, ['relationships.v1.json']),
      '--rule',
      'REL-EXTRACT',
    ]);
    expect(invocation.exitCode, `${stdoutOf(invocation)}${stderrOf(invocation)}`).toBe(0);
    const verdict = verdictOf(invocation);
    expect(verdict.unevaluated).toEqual([]);
    expect(verdict.findings).toEqual([
      {
        ruleId: 'REL-EXTRACT',
        path: '.',
        subject: 'dynamic-shell-read',
        message:
          'declared relationship is unresolved: the shell computes the variable name at runtime',
        effect: 'debt',
      },
    ]);
  });

  test('allows the canonical candidate under every registered rule', () => {
    const { repository, revision } = createIndexedCandidate();
    const invocation = runCli([
      'check',
      'committed',
      repository,
      revision,
      writeCompleteRulePolicy(everyRuleObserving),
    ]);
    expect(invocation.exitCode, `${stdoutOf(invocation)}${stderrOf(invocation)}`).toBe(0);
    const verdict = verdictOf(invocation);
    // Without `--rule` every registered rule runs. An empty `ruleIds` with `allowed: true` is the
    // shape of a check that cannot fail, so the identifiers are asserted exactly.
    expect(verdict.ruleIds).toEqual([
      'INV-CLASSIFY',
      'MOD-DIRECT-ENTRIES',
      'MOD-INDEX',
      'REL-EXTRACT',
    ]);
    expect(verdict.findings).toEqual([]);
    expect(verdict.unevaluated).toEqual([]);
    expect(verdict.allowed).toBe(true);
    expect(verdict.certifies).toBe(false);
    expect(verdict.policy).toBe('rules.test.v1');
  });
});
```

### 3.6 Ready to commit

Commit subject: `test(bureaucrat): prove every rule adapter over a real candidate`.

Files: apps/wiki/cli/src/rules/rules.test.ts, apps/wiki/cli/src/rules/rule.ts,
apps/wiki/cli/src/rules/registry.ts, apps/wiki/cli/src/rules/check.ts,
openspec/changes/twilight-bureaucrat-rule-model/tasks.md,
openspec/changes/twilight-bureaucrat-rule-model/verify.md.

The three source files are not optional. Every proof in section 3.3 requires an adjacent `Proof:`
comment, and those comments land in exactly these files: rule.ts for P13 and P19, registry.ts for
P15 to P18, check.ts for P14 and P22. Nothing else in those three files changes — no logic, no
signature, no import. If the diff of any of them shows anything but added comments, stop and
report.

Then stop and hand over. Do not start part 4.

### 3.7 Part 3 stop conditions

Each of these is false on this part's real starting tree, which is part 2 committed.

1. The baseline run of section 3.1 does not report `13 pass`, `0 fail`, or
   apps/wiki/cli/src/rules/rule-policy.ts is absent.
2. Any of the six new tests fails before any mutation. The implementation is parts 1 and 2's;
   compare with facts 26 to 34 and report rather than changing the registry.
3. A `REL-EXTRACT` or `INV-CLASSIFY` result names the TypeScript compiler, the Nx workspace or the
   trusted modules rather than a candidate relationship or entry — for example
   `ts.readConfigFile is not a function`, `Nx workspace configuration is absent` or
   `trusted TypeScript runtime modules are not configured`. That is an environment failure, not a
   rule failure; report it with the observed message and stop.
4. A mutation does not break its named test, breaks it with a different message than section 3.3
   predicts, or does not compile. Report it; do not weaken the test to match. A fault that
   additionally breaks other tests is **not** a stop; record which ones and continue.
5. A named-test run reports `Ran 0 tests` or `matched 0 tests`.
6. A change is needed in any file outside the six listed in section 3.6.

---

## Part 4 — built executable, README and final verification

Starts from the committed part 3. Read section 0 in full first.

**This part records only what it observes itself.** Parts 1 to 3 ran in their own clones, and their
reports and evidence directories live **outside every repository**, under
`puni-plan/exec/logs/<attempt>/report.md` and
`puni-plan/exec/logs/<attempt>/evidence/`. This clone cannot read them, and no
executor may invent them. So:

- Fill the `Observed failure` cell of a proof row **only** when this attempt injected that fault and
  watched the failure. Parts 2 and 3 filled their own rows before handing over; part 1 did not.
- Write `pending planner transcription` into any cell still empty, and say in the report which rows
  those are and why.
- **Never reconstruct a failing line from a `Proof:` comment in the source.** A comment is a
  summary someone else wrote; it is not observed output, and copying it into the record would make
  the record unfalsifiable.
- **Never re-inject an earlier part's fault to regenerate its evidence.** That is a different
  attempt on a different tree; its output would not be the evidence the record claims.

### 4.1 Preparation

- [ ] Run:

  ```sh
  repo_root=$(pwd -P)
  task_tmp=$(mktemp -d "${TMPDIR:?launcher must supply TMPDIR}/rule-model-XXXXXX")
  mkdir -p "$TMPDIR/evidence"
  printf 'repo_root=%s\ntask_tmp=%s\n' "$repo_root" "$task_tmp"
  ```

  Expected: both paths print, and `task_tmp` is beneath the launcher's `TMPDIR`.

- [ ] Confirm the starting tree is part 3's:

  ```sh
  (cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
    bun test --preload ../../../tools/test/scratch/preload.ts src/rules/rules.test.ts)
  if rg -n '^## Rules' "$repo_root/apps/wiki/cli/README.md"; then
    echo 'Rules section already exists; stop.' >&2
    exit 1
  else
    heading_status=$?
    test "$heading_status" -eq 1
  fi
  ```

  Expected: exit 0 with `19 pass`, `0 fail`; the heading check exits 0 only when the README is readable and the heading is absent, and any other result is a stop. Write the
  test count down as this part's baseline: this part adds no rule test, so it must not move.

### 4.2 The installed binary

- [ ] Add the assertions of section 4.6 inside build.test.ts's existing
      `builds the canonical executable for use outside the repository` test, immediately after its
      `validate-record` assertions and before its `lint` invocation. They reuse that test's
      `externalRoot`, `executable` and `invoke`, and `mkdir` and `writeFile` are already imported at
      the top of the file.
- [ ] Run:

  ```sh
  (cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
    bun test --preload ../../../tools/test/scratch/preload.ts src/packaging/build.test.ts)
  ```

  Expected: exit 0, `0 fail`. This is the only proof that the installed binary's allow-list and its
  help text carry both new words, and that a refused verdict still reaches stdout. The Git fixtures
  it creates live under the test's own temporary directory, never in this clone.

### 4.3 The README

- [ ] Add a `## Rules` section to apps/wiki/cli/README.md saying what `check` and `explain` do, that
      a verdict never certifies, that the rule policy is read from outside the candidate's Git
      worktree, and that in slice B0 a rule that cannot be evaluated disallows the verdict in every
      mode. Include this sentence verbatim:

  > The package installs two commands for the same program: `twilight-bureaucrat`, which
  > documentation uses, and the short form `twib`.

  The README is this project's module index, and its memberships already carry the `src`
  directory-prefix, so no membership changes and no other index is touched.

### 4.4 The record

- [ ] Add a `### Part 4` subsection under `## Commands and results` in
      openspec/changes/twilight-bureaucrat-rule-model/verify.md and paste the real output of every
      command in section 4.5: the command, its exit status and its decisive line.
- [ ] Check the proof table. Rows P2 to P12 and P20 to P22 were filled by the parts that observed
      them. Write `pending planner transcription` into every cell that is still empty — at minimum
      P1, which part 1 left blank — and add one sentence under the table saying that part 1's
      observed output is in its attempt's log directory outside this repository and that the
      planner transcribes it when committing.
- [ ] State in verify.md which checks this attempt did not run and why: the whole
      `twilight-bureaucrat:test`, `twilight-bureaucrat:test:package`, `twilight-bureaucrat:pack` and
      `tool-devsync:test` targets, and `bin/h2puni-gate.sh`.
- [ ] Tick **only part 4's** boxes in openspec/changes/twilight-bureaucrat-rule-model/tasks.md and
      correct the counts that section names. Report that part 1's boxes are still unticked and that
      the planner decides them.

### 4.5 Part 4 verification

| Command                                                                                                                                                                                                     | Expected exit status and decisive line                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `(cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" bun test --preload ../../../tools/test/scratch/preload.ts src/rules/rules.test.ts src/packaging/build.test.ts)` | Exit 0, `0 fail`. The rule count is the section 4.1 baseline, 19, unchanged; the packaging suite's own count is recorded and compared only with your own earlier run of section 4.2. |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`                                                                                                                                                 | Exit 0; `Successfully ran target typecheck`.                                                                                                                                         |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`                                                                                                                                               | Exit 0, no warnings; `Successfully ran target lint:source`.                                                                                                                          |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:build`                                                                                                                                                     | Exit 0; `dist/bin.mjs` and `dist/toolkit/validator.mjs` are rebuilt.                                                                                                                 |
| `bunx prettier --write <only the files this packet changed>` then `NX_DAEMON=false bunx nx format:check --all`                                                                                              | Both exit 0. Format only files listed in section 5; a failure on another lane's file is reported, never fixed.                                                                       |
| The batch README's **OpenSpec validation** block                                                                                                                                                            | Exit 0, one JSON report kept under `$TMPDIR/evidence`.                                                                                                                               |

**Not run here, and why.** `twilight-bureaucrat:test`, `twilight-bureaucrat:test:package` and
`tool-devsync:test` as whole targets, and anything needing staged files or Git writes into this
clone: preamble rule 4a, pending planner verification. `twilight-bureaucrat:pack`: it depends on
`build` and duplicates the built-executable coverage now in build.test.ts; the planner runs it if
packaging output changes. `bin/h2puni-gate.sh`: cannot run on this machine (preamble rule 5).

**What none of it proves.** No provisioned activation is configured in this clone, so nothing here
exercises one; `twilight-bureaucrat:lint` reports `status: inactive` and exits 0 only while
`TOOL_WIKI_REQUIRE_CERTIFIED` keeps its default `0` (fact 19). Part 2 added a source file to the
validator's import closure, which changes the validator identity; no test pins that identity as a
literal (section 0.4), but an activation prepared outside this clone must be prepared again. The
four wrapped checks' own correctness is proven by their own suites, which this packet does not
change.

### 4.6 Part 4's packaging assertions

```ts
const ruleHelp = invoke(executable, ['--help'], externalRoot);
expect(ruleHelp.exitCode, ruleHelp.stderr.toString()).toBe(0);
expect(ruleHelp.stdout.toString()).toContain(
  'twilight-bureaucrat check <committed|staged|working>',
);
expect(ruleHelp.stdout.toString()).toContain('twilight-bureaucrat explain <rule-id>');

const explained = invoke(executable, ['explain', 'MOD-INDEX'], externalRoot);
expect(explained.exitCode, explained.stderr.toString()).toBe(0);
expect(JSON.parse(explained.stdout.toString()) as { id: string }).toMatchObject({
  id: 'MOD-INDEX',
});

const packageCandidate = join(externalRoot, 'candidate');
await mkdir(join(packageCandidate, 'src'), { recursive: true });
for (const argv of [
  ['init', '--initial-branch=main'],
  ['config', 'user.email', 'rules@example.test'],
  ['config', 'user.name', 'Rules Fixture'],
]) {
  expect(Bun.spawnSync(['git', '-C', packageCandidate, ...argv]).exitCode).toBe(0);
}
const packageIndex = {
  schemaVersion: 1,
  moduleId: 'module.package-fixture',
  memberships: [{ kind: 'directory-prefix', prefix: 'src', exclusions: [] }],
  relationshipSelectors: [],
  applicableChecks: [],
  inapplicableSections: [
    { section: 'relationships', reason: 'The fixture declares no relationships.' },
    { section: 'invariants', reason: 'The fixture has no cross-file invariant.' },
    { section: 'checks', reason: 'The rule registry is the fixture boundary check.' },
  ],
  externalConsumers: {
    kind: 'none-known',
    knowledgeLimit: 'Only consumers visible in this immutable candidate were considered.',
  },
};
await writeFile(
  join(packageCandidate, 'README.md'),
  `# Package fixture\n\n<!-- module-index ${JSON.stringify(packageIndex)} -->\n`,
  'utf8',
);
await writeFile(join(packageCandidate, 'src/entry.ts'), 'export const entry = 1;\n', 'utf8');
expect(Bun.spawnSync(['git', '-C', packageCandidate, 'add', '--all']).exitCode).toBe(0);
expect(
  Bun.spawnSync(['git', '-C', packageCandidate, 'commit', '--message', 'candidate']).exitCode,
).toBe(0);

const packagePolicy = join(externalRoot, 'rule-policy.json');
await writeFile(
  packagePolicy,
  JSON.stringify({
    schemaVersion: 1,
    policyId: 'rules.package.v1',
    ruleModes: [
      { ruleId: 'INV-CLASSIFY', mode: 'observe' },
      { ruleId: 'MOD-DIRECT-ENTRIES', mode: 'observe' },
      { ruleId: 'MOD-INDEX', mode: 'enforce' },
      { ruleId: 'REL-EXTRACT', mode: 'observe' },
    ],
  }),
  'utf8',
);
const allowed = invoke(
  executable,
  ['check', 'committed', packageCandidate, 'HEAD', packagePolicy, '--rule', 'MOD-INDEX'],
  externalRoot,
);
expect(allowed.exitCode, allowed.stderr.toString()).toBe(0);
// An allowed verdict must be allowed for the stated reason: no finding and nothing unevaluated.
// `allowed: true` alone would also accept a verdict that reported debt it had silently downgraded.
expect(
  JSON.parse(allowed.stdout.toString()) as {
    allowed: boolean;
    certifies: boolean;
    findings: unknown[];
    ruleIds: string[];
    unevaluated: unknown[];
  },
).toMatchObject({
  allowed: true,
  certifies: false,
  findings: [],
  ruleIds: ['MOD-INDEX'],
  unevaluated: [],
});

const refusedCandidate = join(externalRoot, 'refused');
await mkdir(refusedCandidate);
for (const argv of [
  ['init', '--initial-branch=main'],
  ['config', 'user.email', 'rules@example.test'],
  ['config', 'user.name', 'Rules Fixture'],
]) {
  expect(Bun.spawnSync(['git', '-C', refusedCandidate, ...argv]).exitCode).toBe(0);
}
await writeFile(join(refusedCandidate, 'orphan.ts'), 'export const orphan = 1;\n', 'utf8');
expect(Bun.spawnSync(['git', '-C', refusedCandidate, 'add', '--all']).exitCode).toBe(0);
expect(
  Bun.spawnSync(['git', '-C', refusedCandidate, 'commit', '--message', 'no index']).exitCode,
).toBe(0);
const refused = invoke(
  executable,
  ['check', 'committed', refusedCandidate, 'HEAD', packagePolicy, '--rule', 'MOD-INDEX'],
  externalRoot,
);
expect(refused.exitCode).not.toBe(0);
expect(refused.stdout.toString()).toContain('"allowed":false');
expect(refused.stdout.toString()).toContain('selected candidate contains no module indexes');
```

`mkdir` and `writeFile` are already imported by build.test.ts. The refused invocation exits non-zero
because bin.ts's `runValidator` throws when the validator exits non-zero (bin.ts:69-71); the verdict
still reaches stdout because `runValidator` forwards it first (bin.ts:67).

### 4.7 Ready to commit

Commit subject: `feat(bureaucrat): route the rule commands through the package and record the run`.

Files: apps/wiki/cli/src/packaging/build.test.ts, apps/wiki/cli/README.md,
openspec/changes/twilight-bureaucrat-rule-model/tasks.md,
openspec/changes/twilight-bureaucrat-rule-model/verify.md.

Then stop and report. The packet is complete.

### 4.8 Part 4 stop conditions

Each of these is false on this part's real starting tree, which is part 3 committed.

1. The baseline run of section 4.1 does not report `19 pass`, `0 fail`, or apps/wiki/cli/README.md
   already has a `## Rules` section.
2. The built executable rejects `check` or `explain` as an unknown command, or `--help` does not
   name both: bin.ts's allow-list or help text did not receive them in parts 1 and 2. Report rather
   than editing bin.ts here, which is part 1's and part 2's file.
3. The built allowed check prints a non-empty `findings` or `unevaluated` list. That is a real
   difference between the built validator and the source one; report the printed verdict.
4. `nx format:check --all` fails on a file this packet does not own. Report it; never reformat
   another lane's file.
5. Filling verify.md would need output this attempt did not observe. Write
   `pending planner transcription` instead and report it; never reconstruct it from a `Proof:`
   comment or by re-injecting an earlier part's fault.
6. A change is needed in apps/wiki/cli/package.json or
   apps/wiki/cli/src/packaging/install.test.ts. Packet 010.5 owns both.

---

## 8. Negative proofs, all parts

Twenty-two proofs. The part column says where each one is performed; none is deferred past its
part. The test column gives the **joined** describe-plus-title pattern Bun's `-t` matches; run it
unanchored and treat a zero-test run as a failure (section 0.2).

| #   | Part | Check                                       | Fault                                   | Test, as the joined `-t` pattern                                                                               |
| --- | ---- | ------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| P1  | 1    | `selectRule`'s unknown-identifier refusal   | Return the first registered rule        | `explain production CLI refuses an unregistered rule identifier and names every registered rule`               |
| P2  | 2    | `assertExternal` in `readExternalArtifact`  | Delete the call                         | `rule policy boundary refuses a rule policy inside the worktree even when the repository argument is interior` |
| P3  | 2    | The worktree root passed to containment     | Pass the raw repository argument        | the same test                                                                                                  |
| P4  | 2    | The mode-coverage loop                      | Delete the loop                         | `rule policy boundary refuses a policy that states no mode for a registered rule`                              |
| P5  | 2    | The unregistered-rule branch                | Condition to `false`                    | `rule policy boundary refuses a policy that names an unregistered rule`                                        |
| P6  | 2    | The duplicate-identifier branch             | Delete it                               | `rule policy boundary refuses a policy that states a mode for one rule twice`                                  |
| P7  | 2    | The ratchet branch                          | Delete it                               | `rule policy boundary refuses ratchet until the adopted set exists`                                            |
| P8  | 2    | `assertPolicyInputs`                        | Return immediately                      | `rule policy boundary refuses a selected rule whose policy input is absent`                                    |
| P9  | 2    | UTF-8, JSON and schema decoding             | Three injections                        | `rule policy boundary refuses malformed, non-UTF-8, unreadable, absent and undeclared-key policies distinctly` |
| P20 | 2    | The unusable-policy read                    | Fall back to an empty policy            | the same test                                                                                                  |
| P10 | 2    | The `--rule` flag validation                | Accept any seventh argument             | `check production CLI refuses an unknown selection kind, an unknown flag and an unknown narrowed rule`         |
| P11 | 2    | The selection-kind refusal                  | Treat any word as `committed`           | the same test                                                                                                  |
| P12 | 2    | `process.exitCode = 1`                      | Delete the line                         | `check production CLI refuses an unindexed candidate in every mode and exits 1`                                |
| P21 | 2    | The stated mode `explain` attaches          | Drop `mode` from the explanation        | `explain with a rule policy prints the policy identifier and the stated mode`                                  |
| P13 | 3    | `toFinding`'s effect mapping                | Always `debt`                           | `rule adapters over real candidates turns direct-entry debt into a refusal under enforce`                      |
| P14 | 3    | The `unevaluated` term in `allowed`         | Delete the term                         | `rule adapters over real candidates refuses a rule whose prerequisite failed, in observe mode`                 |
| P15 | 3    | `MOD-DIRECT-ENTRIES`'s not-evaluated branch | Return an empty observation list        | the same test                                                                                                  |
| P16 | 3    | `MOD-DIRECT-ENTRIES`'s debt propagation     | Replace `reviewDebt.map(...)` with `[]` | `rule adapters over real candidates reports an index over the direct-entry limit with its exact counts`        |
| P17 | 3    | The `classifyEntries` call                  | Skip it                                 | `rule adapters over real candidates refuses an unclassifiable entry in observe mode`                           |
| P18 | 3    | `REL-EXTRACT`'s unresolved propagation      | Empty the mapped list                   | `rule adapters over real candidates reports a declared relationship that the candidate leaves unresolved`      |
| P19 | 3    | `evaluateWrapped`'s catch                   | Return an observed empty list           | `rule adapters over real candidates refuses an unclassifiable entry in observe mode`                           |
| P22 | 3    | The default all-rules selection             | Select nothing without `--rule`         | `rule adapters over real candidates allows the canonical candidate under every registered rule`                |

P17 and P19 share a test deliberately: they are two ways to lose the same refusal, and each must be
observed on its own. The same is true of P14 and P15, of P10 and P11, and of P9 and P20.

## 9. OpenSpec

Change `twilight-bureaucrat-rule-model`, schema `sdd-lean`, new capability `bureaucrat-rules`,
created in part 1.

**proposal.md**, within 400 words excluding the template's comments:

- _Why_: the repository's rules are judged in many places, and an agent cannot ask one tool whether
  an artifact is allowed. A new rule has no home and no stated mode.
- _What Changes_: Twilight Bureaucrat gains `check` and `explain`; a rule's mode comes from the
  consumer's trusted policy rather than from code; four checks the package already performs become
  registered rules with stable identifiers; a rule that could not be evaluated disallows the verdict
  in every mode. The sixteen existing routes are unchanged and a verdict never certifies.
- _Non-Goals_: no new rule family, no template registry, no candidate record for Twilight Dash, no
  change to how any check signals a violation, no certification, no `ratchet` mode.
- _Constraints_: a candidate cannot select the policy that judges it, and containment is measured
  from the resolved Git worktree root; `lint-local` and `lint-ci` keep their arguments, report shape
  and certification; because no check distinguishes a violation from an unusable input by type, only
  the two checks with structured output can report debt in this slice.
- _Capabilities_: new, `bureaucrat-rules`.
- _Domain Terms_: rule, finding, verdict, rule mode, rule policy. State that the glossary entry is
  deferred, as ASSUMPTIONS.md records, because the Twilight glossary already defines Finding and
  Verdict for the runtime and reconciling them is its own task.
- _Decisions Recorded_: none, unless the executor finds a decision that is hard to reverse,
  surprising and had real alternatives.
- _Impact_: the `twilight-bureaucrat` project only.

**specs/bureaucrat-rules/spec.md**, under `## ADDED Requirements`, with **eleven** requirements,
each with at least one four-hashtag scenario. Requirements 7 to 10 must state their rule's sentence
**verbatim**, because registry.ts cites them by anchor.

1. **Rule registry.** Every rule is exposed under a stable identifier, family, statement, source and
   input list. Scenarios: `explain` prints the record; `explain` refuses an unregistered identifier.
2. **Rule modes come from trusted policy.** The mode is read from a document outside the candidate's
   Git worktree, and every registered rule has a stated mode. Scenarios: a policy inside the
   worktree is refused even when the repository argument is interior; a rule with no stated mode is
   refused; `ratchet` is refused.
3. **One verdict per candidate.** `check` runs the selected rules over one candidate selection and
   prints exactly one verdict naming the candidate identity, the policy, the rules that ran, every
   finding and every rule it could not evaluate. Scenarios: an allowed candidate; `--rule` narrows.
4. **Mode decides the effect.** A finding is debt in observe mode and a refusal otherwise, and a
   verdict carrying a refusal exits non-zero while still printing the verdict. Scenario: direct-entry
   debt becomes a refusal under enforce.
5. **A failure to evaluate is never debt.** A rule that could not be evaluated is named in the
   verdict and disallows it in every mode. Because no check distinguishes a candidate violation from
   an unusable input by type, every thrown refusal is treated as a failure to evaluate, so in this
   slice only checks with structured output report debt. Scenarios: an unindexed candidate under
   observe; a rule whose prerequisite failed.
6. **A verdict never certifies.** The record states it, and certification remains the sole output of
   `lint-ci`. Scenario: the record carries `certifies: false`.
7. **Module index declarations.** Anchor `#requirement-module-index-declarations`.
8. **Module index direct entry limit.** Anchor `#requirement-module-index-direct-entry-limit`.
9. **Inventory classification.** Anchor `#requirement-inventory-classification`.
10. **Relationship resolution.** Anchor `#requirement-relationship-resolution`.
11. **Explain reports what B0 knows.** `explain` prints a rule's static record, and its stated mode
    when a rule policy is named. It does not report a last negative proof: the proof register
    arrives with slice B4, as the design's open items already record. Scenario: `explain` with a
    policy prints the mode.

**tasks.md** is the four parts, each naming its tests and negatives; each part ticks its own boxes
and corrects the counts they name. **verify.md** is created in part 1 and filled by the part that
observed each result: parts 2 and 3 write their own proof rows and commands as they go, and part 4
adds its own and marks every cell it did not observe as pending planner transcription. Part 1's
change was committed with the eleven requirements and the P1 to P19 proof table already in place,
so parts 2 and 3 correct the P4 and P9 wording and append rows P20 to P22 rather than rewriting the
table.

Validate with the batch README's **OpenSpec validation** block. Do not archive the change.

## 10. Out of lane

| Path                                                                                                     | Owner                                                           |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| apps/wiki/cli/package.json                                                                               | Packet 010.5, which adds the short binary alias                 |
| apps/wiki/cli/src/packaging/install.test.ts                                                              | Packet 010.5                                                    |
| CONTEXT.md at the repository root                                                                        | Packet 010.3 (batch README file-ownership table)                |
| apps/wiki/cli/src/indexes/check-indexes.ts, read-indexes.ts, relationships/index.ts, classify-entries.ts | Nobody in this batch. This packet changes no check's behaviour. |
| The devsync tests that hold the document checks                                                          | Slice B1, a later packet                                        |
| Anything under openspec/specs                                                                            | Only the archive step writes there                              |

apps/wiki/cli/README.md is **in** this packet's lane: the batch README assigns it to 010.4, and
010.5 no longer edits it, which is why part 4 adds the sentence naming the short command.

## 11. Review disposition

Second adversarial review (Codex gpt-6-astra, high effort). Every finding was checked against the
repository or executed in the out-of-tree copy before it was acted on.

| Finding                                                     | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 slice 2 still depends on slice 3 through `registeredIds` | Fixed. `registeredIds` now lives in registry.ts (section 6.5) and part 1's check.ts is given complete, imports and return type included (section 6.6).                                                                                                                                                                                                                                                                                                                             |
| C2 unknown failures still default to candidate violations   | Fixed, by removing the distinction rather than refining it. Verified fact 11: no check in this package types its violations, so no adapter can tell them apart. Every throw is now a failure to evaluate; `CheckInputError` and the edits to relationships/index.ts and read-indexes.ts are gone. Observed: an unindexed candidate under observe now exits 1 with `unevaluated`, not `debt` (fact 27). The cost is recorded in section 6.2, in the proposal, and in requirement 5. |
| C3 P18's fixture cannot prove the propagation               | Fixed and executed. Verified declarations.ts:1203-1206 refuses an unselected endpoint before the unresolved list exists (fact 36). The new fixture declares `status: 'unresolved'` with a reason and two real selected paths, and the observed mutation empties `findings` (facts 34, 35). The permission to finish with "unproven propagation" is removed; stop condition 3 of part 3 replaces it.                                                                                |
| I1 the blob-read test destroys its prerequisite             | Resolved by C2's fix: there is no `CheckInputError` boundary left to test, so the test is gone.                                                                                                                                                                                                                                                                                                                                                                                    |
| I2 the slice-2 header fails lint with unused bindings       | Fixed. Part 1's header (section 1.6) has only the three helpers its two tests use; part 2 appends its own. Section 2.6 tells the executor to move any helper lint reports as unused.                                                                                                                                                                                                                                                                                               |
| I3 scheduling and mutation expectations inconsistent        | Fixed. P8 now runs against its own missing-input test in part 2. Part 3's tests are explicitly "expected green, coverage of what parts 1 and 2 delivered". P4 to P7 now narrow to `--rule MOD-INDEX`, which fact 37 shows is what makes the mutation observable.                                                                                                                                                                                                                   |
| I4 changed guards and adapters lack proofs                  | Fixed. P16 (direct-entry propagation), P17 (classification call) and P19 (the catch) added; the error-class rows disappeared with C2's fix.                                                                                                                                                                                                                                                                                                                                        |
| I5 packaging coverage does not match the file plan          | Fixed. Section 4.6 now invokes `explain`, an allowed `check` and a refused `check` against the built executable.                                                                                                                                                                                                                                                                                                                                                                   |
| I6 "nine requirements" specifies eleven                     | Fixed: section 9 enumerates eleven and part 1 says eleven.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| I7 stale claims                                             | Fixed. Verified the design records the B0 proof deferral at line 217, so section 11 no longer calls it outstanding; verified `resolveWorktreeRoot` has exactly one caller (fact 13), and section 6.7 says so.                                                                                                                                                                                                                                                                      |
| Executability: planner's absolute paths                     | Fixed. Every path is clone-relative; each part starts with `repo_root=$(pwd -P)` and runs directory-changing commands in subshells.                                                                                                                                                                                                                                                                                                                                                |
| Executability: commits and gate                             | Fixed. Each part ends with "ready to commit" — subject plus file list — and hands over. Section 0 states the boundary, and the gate is reported as not run.                                                                                                                                                                                                                                                                                                                        |
| Executability: `NX_DAEMON=false`                            | Fixed on every Nx command.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Executability: package fetching                             | Fixed: `BUN_INSTALL_CACHE_DIR` under the task's `/tmp` directory, and an unavailable tool blocks the task.                                                                                                                                                                                                                                                                                                                                                                         |
| Executability: fixture Git scope                            | Fixed: section 0 distinguishes the clone's Git state, which is untouchable, from the temporary fixture repositories these tests must create.                                                                                                                                                                                                                                                                                                                                       |
| Executability: formatting step                              | Fixed: part 4 formats only the owned files, then runs the repository-wide check.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Recommendation: cut into four sequential parts              | Adopted. Section 0 and the four part sections.                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Two limits of this revision, stated rather than hidden:

- **ESLint was not run on the new code.** ESLint refuses files outside the workspace base path and
  its config builds the Nx project graph, so an out-of-tree copy cannot be linted. Every part runs
  `lint:source` as a required step, and section 2.6 warns about the unused-helper case the review
  found.
- **The `twilight-bureaucrat:test` target was not run.** The executor sandbox cannot run whole
  targets that write Git objects into the clone (preamble rule 4a); each part names the focused
  suites it runs instead, and the target is listed for planner verification.

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH AFTER FIXES, part 1 only

Both blocking findings were correct and the planner applied the reviewer's text by hand. Every preparation block now creates its scratch directory beneath the launcher's `TMPDIR` instead of directly under `/tmp`, and prints the two paths it promised to print. The stop condition "any file from parts 2 to 4 already exists" was true on the baseline, because later parts modify files that exist today; it now names only files a part must create. Notes about parts 2 to 4 are carried to those parts' own dispatch reviews.

### Part 1, first attempt, 2026-09-20: stopped before any edit, and what changed

The attempt stopped correctly at step 1.2 with no repository file changed: `bunx` tried to download the OpenSpec command although the launcher had installed it. The packet caused that. Its preparation block exported `BUN_INSTALL_CACHE_DIR` to an empty directory under the scratch root, so Bun could no longer see the cache the launcher had warmed, and the attempt has no network. The export is removed from every part's preparation. Packets 010.5 and 010.3 ran the same command successfully without it.

### Revision for parts 2 to 4, 2026-09-20

Part 1 is merged into `batch-1/integration` and is left here as the historical record; nothing above
"Part 2" was rewritten except the reconciliation note in section 6.6, which states what part 1
actually landed. Parts 2, 3 and 4 were rewritten so each can be dispatched alone, from the tree its
predecessor's commit leaves behind.

**The third review's notes, one by one.**

- _Part 2, P4._ The reviewer was right that deleting the coverage loop does not reach the
  diagnostic the packet predicted: the omitted mode belongs to INV-CLASSIFY, which a run narrowed to
  `--rule MOD-INDEX` never selects, so `ruleMode` is never asked for it and the command exits 0
  with an allowed verdict. The fix is in the test, not the fault. Every refusal test in
  `rule policy boundary` now asserts its diagnostic before its exit status, so the observed failure
  under P4 is the missing sentence `rule policy states no mode for INV-CLASSIFY` against an empty
  stderr, with the allowed verdict on stdout as the second piece of evidence. The same reordering
  rescues P8 and P11, which both keep an exit status of 1 under their faults and would otherwise
  have been unobservable.
- _Parts 2 to 3, existing but unreadable policy._ Part 2's decoding test is renamed
  `refuses malformed, non-UTF-8, unreadable, absent and undeclared-key policies distinctly` and now
  chmods a real policy to `0o000`, asserts the test process genuinely cannot read it, and requires
  `cannot open rule policy <path>: EACCES` against the absent case's `…: ENOENT`. Its negative is
  the new P20: falling back to an empty policy when the read fails, which is exactly the default
  R5 forbids. The `readStableArtifact` message shape was read from
  apps/wiki/cli/src/policy/trust.ts:279 and the EACCES behaviour was checked on this host.
- _Parts 2 to 3, policy-aware `explain`._ Part 2 gains a third describe,
  `explain with a rule policy`, with one test asserting the full record plus `policyId` and
  `mode: 'enforce'`, which is requirement 11's scenario. Its negative is the new P21: return the
  record with `policyId` but no `mode`. The fault was chosen so it still compiles and leaves no
  unused binding, because the repository's compiler options set `strict` but not `noUnusedLocals`.
- _Parts 2 to 3, an allowed all-rules invocation._ Part 3 gains a sixth test,
  `allows the canonical candidate under every registered rule`, running `check` with no `--rule`
  and the complete policy and asserting all four identifiers, empty findings, empty unevaluated,
  `allowed: true` and `certifies: false`. Its negative is the new P22: select nothing when `--rule`
  is absent, which prints `"ruleIds":[]` with `"allowed":true` — the shape of a check that cannot
  fail.
- _Part 3, file ownership against the proof comments._ Section 3.6 listed rule.ts and registry.ts as
  optional and omitted check.ts, although P14 mutates `checkCandidate`. The list is now mandatory
  and complete: rules.test.ts, rule.ts (P13, P19), registry.ts (P15 to P18), check.ts (P14, P22),
  plus tasks.md and verify.md. Section 3.3 names the file each `Proof:` comment lands in, and
  section 3.6 requires the diff of the three source files to contain added comments and nothing
  else.
- _Part 4, evidence._ Parts 1 to 3 run in separate clones and their reports and evidence live
  outside every repository, under `puni-plan/exec/logs/<attempt>/`. Part 4 cannot
  read them, so it no longer claims to. Parts 2 and 3 now write their own observed failing lines
  into verify.md as they go; part 4 writes only its own, writes `pending planner transcription` into
  every cell still empty (P1 at minimum), and is forbidden both from reconstructing output from a
  `Proof:` comment and from re-injecting an earlier part's fault. Part 4 stop condition 5 makes
  that a stop rather than a judgement call.
- _Part 4, the built allowed check._ The assertion now requires empty `findings`, empty
  `unevaluated` and `certifies: false` beside `allowed: true` and `ruleIds: ['MOD-INDEX']`, and a
  `--help` assertion proves the installed dispatcher names both new commands.

**Sandbox facts baked into every part**, each of which stopped a real attempt in this batch: the
clone's `.git` is read-only, so restoration is `cp` plus `cmp`; `BUN_INSTALL_CACHE_DIR` is never
set; every OpenSpec command carries `OPENSPEC_TELEMETRY=0` and must not download; the command guard
rejects any command containing `rm -f`, so no scratch file is ever deleted and the batch README's
version of the validation block is the one to run; every Nx command carries `NX_DAEMON=false`;
scratch lives only under `TMPDIR` and evidence under `$TMPDIR/evidence`; a mutation patch is saved
with the README's `if diff …; then …; else test $? -eq 1; fi` form, never `|| true`, and a test's
status is never read through `tee`. Section 0.3 also states what is and is not a stop: a fault that
additionally breaks other tests is recorded and passed over, while a named test that passes, fails
with a different message, or will not compile is a stop. Section 0.2 states the `-t` rule: Bun
matches the describe name and the title joined, every proof names the joined pattern, and a run
reporting `Ran 0 tests` is a stop.

**Each part is now dispatchable alone.** Every part has its own preparation block, its own
starting-tree confirmation, its own recorded baseline test count, its own file list, its own
verification table with an expected exit status and decisive line, its own negative proofs with the
file each `Proof:` comment belongs in, its own ready-to-commit list and commit subject, and its own
stop conditions, every one of which is false on the tree that part really starts from. Counts are
stated as the part's recorded baseline plus its own additions: 2 plus 11 for part 2, 13 plus 6 for
part 3, and no rule-test change in part 4.

**What was checked in the repository and contradicted the packet.**

- `apps/wiki/cli/src/cli.ts`'s `unknown command` usage line does **not** list `explain`: part 1
  added the route without the word. Part 2's instruction to "gain `|check|explain` before its
  closing `>`" was too vague to execute, so section 6.7 now names the exact substring to replace.
- `apps/wiki/cli/src/rules/check.ts` as committed already imports `RuleMode` and carries P1's
  `Proof:` comment between `const rule = findRule(ruleId);` and the `if (rule === undefined)`
  guard, which section 6.6's code block does not show. Part 2 is told to edit around it.
- `bin.ts` already carries `'explain'` and the help line `twilight-bureaucrat explain <rule-id>`, so
  part 2 adds `'check'` and widens the existing `explain` line rather than adding one.
- No test pins the validator identity as a literal. `pilot-policy.test.ts:188`,
  `trusted-policy.test.ts:541` and `gate-entrypoints.test.ts:494` all recompute it through
  `resolveValidatorArtifactPaths`, so part 2's new `rules/rule-policy.ts` joins the closure without
  breaking a test. Only an activation provisioned outside the clone needs preparing again.
- No test pins either dispatcher's usage or help text; `build.test.ts:89` asserts only that stderr
  contains `unknown command`.
- `resolveWorktreeRoot` is still exactly one definition at read-candidate.ts:116 and one call at
  line 446, as fact 13 says.
- `openspec/changes/twilight-bureaucrat-rule-model/verify.md` already holds the P1 to P19 table with
  an empty `Observed failure` column and an empty `## Commands and results` heading, and
  `tasks.md`'s boxes are all unticked, including part 1's. Parts 2 to 4 tick only their own and
  report part 1's as the planner's decision. The file plan rows for both files were corrected from
  "part 1 only" and "part 4 fills".
- Part 2's regression command was run on the part-1 tree on 2026-09-20:
  `src/inventory/read-candidate.test.ts` and `src/policy/trusted-policy.test.ts` give 56 pass, 0
  fail in 88.78s. That number is now the expected decisive line.
- Section 11's old disposition row still says `BUN_INSTALL_CACHE_DIR` was "fixed" by pointing it at
  the task directory. That row is history and is contradicted by the attempt note below it and by
  section 0.1, which overrides it.

### Dispatch review of part 2, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH AFTER FIXES

Three findings, all correct, applied by the planner by hand. The `resolveWorktreeRoot` search matched this packet as well as the source, so its stop condition was true on the baseline; it is now scoped to `apps/wiki/cli/src`. P9's three injections shared one evidence filename and would have overwritten each other; they now have three identifiers. Part 4's heading check masked an unreadable README with `|| true`; it now accepts exactly status 1. One note was also applied: under P6's fault the first duplicate entry wins, not the last.
