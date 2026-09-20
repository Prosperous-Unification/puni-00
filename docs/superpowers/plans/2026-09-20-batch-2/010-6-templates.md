# 010.6 Templates: module, feature-service, resource-service, repository; template verify

Size class L. Token estimates: top-model-high-effort planning 6,000,000; mid-level-mid-effort
implementation 22,000,000; top-model-high-effort review 9,000,000.

Implements slice **B5** of the
[Twilight Bureaucrat rules design](../../specs/2026-09-19-twilight-bureaucrat-rules-design.md):
the template registry, `template verify`, and the first four templates. The artifact shapes come
from the [code organization design](../../specs/2026-09-19-code-organization-design.md) and
[ADR 0029](../../../adr/0029-services-have-a-kind-and-one-direction.md).

Batch rules, the execution contract and the standard blocks are in
[execution batch 1](../2026-09-19-batch-1/README.md); this packet links them by name instead of
copying them, except where it must show an exact command. The batch 1
[results](../2026-09-19-batch-1/RESULTS.md) list the defects that stopped real attempts.

**Revision 3, 2026-09-20**, after a second review refused revision 2. Earlier rehearsal reports
describe the code before the slice 2 parser rewrite and two additional tests. Those changes have not
been rehearsed end to end. Historical results are context, not evidence for this attempt; record
only commands and outcomes actually observed. The disposition of every finding of both reviews is
the last section.

## 0. How this packet is executed

### 0.0 Dispatch

The launcher takes the batch: `--batch batch-2` resolves the packet directory
`docs/superpowers/plans/2026-09-20-batch-2`, the clone root `/home/df/wd/puni/batch-2`, the branch
prefix `batch-2/` and the temporary root `/tmp/puni-batch2` (read from
`puni-plan/exec/run-executor.sh` on 2026-09-20). The planner dispatches each slice with:

```sh
puni-plan/exec/run-executor.sh 010-6-templates slice-1 <base-commit> --batch batch-2
```

substituting the slice label and the base commit of the reviewed predecessor, and records the exact
command it ran with the attempt. Nothing else about the launcher is this packet's business.

### 0.1 The six slices

Strictly in order, never in parallel. Each is one dispatch: the executor does that slice and stops,
the planner reviews and commits, the next slice starts from that commit.

| Slice                                                            | Delivers                                                                         | Tests it adds |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------- |
| [1](#slice-1--openspec-change-registry-list-and-show)            | The OpenSpec change, the template model, three kind templates, `list`, `show`    | 4             |
| [2](#slice-2--verifying-one-file-against-its-template)           | The candidate shell, the file-scope constraint handlers, `template verify`       | 18            |
| [3](#slice-3--the-negatives-for-the-shell-and-the-file-handlers) | Fifteen watched faults for what slices 1 and 2 added                             | none          |
| [4](#slice-4--the-module-template)                               | The module template, the module-scope handlers, delegation to the kind templates | 11            |
| [5](#slice-5--the-negatives-for-the-module-handlers)             | Nine watched faults for what slice 4 added                                       | none          |
| [6](#slice-6--readme-record-and-format)                          | The README section, the verification record, the final checks                    | none          |

Slices 2 and 3 are one reviewable unit, and so are 4 and 5: a proof slice carries the negatives for
the checks its predecessor added, and **the planner does not merge a check whose proof slice has not
landed.** They are separate dispatches only because one attempt cannot hold both the implementation
and a dozen fault injections.

**The handover boundary is the same for all six.** The executor cannot commit: the clone's Git
directory is read-only (executor preamble rule 1). Each slice ends by leaving its changes in the
working tree and reporting the "ready to commit" path list and commit subject printed at its end.

### 0.2 Sandbox facts every slice depends on

Each of these stopped a real attempt in batch 1. They are not advice, and they override anything
below that disagrees.

- **The clone's `.git` is read-only.** `git add`, `git commit`, `git stash`, `git restore`,
  `git checkout` all fail. Restore a mutated file only by copying back the copy saved under
  `"$task_tmp"` and confirming with `cmp`. Read-only Git is fine. The fixture repositories these
  tests create under `TMPDIR` are **not** the clone: `git init`, `git add` and `git commit` inside
  them are required by the tests.
- **Never set `BUN_INSTALL_CACHE_DIR`.** The launcher warmed the OpenSpec command into this
  attempt's `TMPDIR`. Repointing the cache makes `bunx` try to download, and there is no network.
- **Every OpenSpec command carries `OPENSPEC_TELEMETRY=0`** and must not download. If one tries to,
  stop and report.
- **The command guard rejects any command whose text contains `rm -f`**, before it runs. Never
  delete a scratch file. Run the batch README's version of the OpenSpec validation block, which
  keeps its report under `$TMPDIR/evidence`.
- **Prefix every Nx command with `NX_DAEMON=false`.** dconf warnings are harmless.
- **Scratch lives only under `TMPDIR`**:
  `task_tmp=$(mktemp -d "${TMPDIR:?}/templates-XXXXXX")`; evidence under `$TMPDIR/evidence`.
- **Never mask a status.** No `|| true`, no `|| echo`. Where a command's failure is an expected
  outcome, capture its status and compare it, as section 0.6 does.
- **A test that spawns a process more than twice carries an explicit timeout.** Bun's default is
  5 seconds and the h2puni gate timed out a five-run test at 5,025 ms. Every test in this packet
  that starts Git or the command line carries `30_000`, including the ones that look short: the
  fixture helper alone spawns Git six times. Those arguments are part of the code. Do not drop them.
- **Counts are relative.** Record each suite's baseline before editing. Slice 2 adds exactly 18
  template tests; the candidate-reader and rule-suite counts stay unchanged. Its red and green
  expectations are specified in §2.2. Historical rehearsal totals do not override these deltas.
- **Line numbers are not anchors.** Where this packet cites a line it is evidence from 2026-09-20,
  not a coordinate: find the code by its text.
- **This packet adds no Nx target and no README file.** A new test-running target name would have to
  carry the `CLAUDECODE=0` and `AGENT=0` defaults that
  `tools/tool-devsync/src/workspace-targets.test.ts` requires; every test here runs under the
  existing `twilight-bureaucrat:test` target. No Markdown file is created either, so the application
  README coverage count in `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` — whether
  packet 110.6 has already replaced that pin with a derived value or not — has nothing to move.
  Wanting a new target or a new README is a stop.

### 0.3 Running one named test

Bun's `-t` matches the describe name and the test title **joined by a space**. Run the joined
pattern unanchored, exactly as each proof states it:

```sh
(cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
  bun test --preload ../../../tools/test/scratch/preload.ts src/templates/templates.test.ts \
  -t '<joined pattern>')
```

Every pattern in section 8 was run this way during the rehearsal and selected **exactly one** test:
the output reads `1 pass` or `1 fail` with the rest `filtered out`. A run reporting `Ran 0 tests` or
`matched 0 tests` proves nothing: **stop and report**.

### 0.4 Injecting a fault, saving it, and what counts as a stop

For every proof, in this order:

1. `cp <file> "$task_tmp/"` — the passing bytes.
2. Edit the file to inject exactly the named fault.
3. **Compile it**: `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck` must exit 0. Every
   fault in section 8 was compiled this way during the rehearsal. **If it does not compile, restore
   the saved bytes first, `cmp` them, and only then stop and report**: an unrestored mutation must
   never be left on the tree, not even for a stop.
4. Save the mutation as a patch, accepting exactly status 1:

   ```sh
   if diff -u "$task_tmp/<file>" "<file>" >"$TMPDIR/evidence/P<n>.patch"; then
     echo "nothing was injected" >&2; exit 1
   else test $? -eq 1; fi
   ```

5. Run the named test with its joined `-t` pattern, redirecting output to
   `$TMPDIR/evidence/P<n>.log` and capturing **its own** exit status. Never read a test's status
   through `tee`.
6. Record the decisive failing line.
7. Copy the saved bytes back, `cmp` them, rerun the named test green.
8. Only then write the adjacent `Proof:` comment, with the real date, describing what you saw.

**Restore before every early exit.** Whatever the surprise — a mutation that will not compile, a
test that passes under its fault, a different message, an unrelated failure — copy the saved bytes
back and `cmp` them before writing the report.

**A fault that also fails other tests is not a stop.** Record which ones. The matcher is not the
requirement; the fact is: a proof is accepted when the **named** test fails at the assertion about
the row's fact, whatever matcher it used (executor preamble rule 20). It is a stop only when the
named test **passes** under the fault, does not fail about the row's fact, or the mutation does not
compile — restore, check the function and expression the row names, redo once, and report both.

### 0.5 Two standing facts about this package

- **A new source file changes the validator identity.** `resolveValidatorArtifactPaths` in
  `apps/wiki/cli/src/policy/trust.ts` walks `cli.ts`'s import closure, and this packet's three new
  files join it. Checked on 2026-09-20: no test pins that identity as a literal —
  `pilot-policy.test.ts`, `trusted-policy.test.ts` and `gate-entrypoints.test.ts` all recompute it
  by calling `resolveValidatorArtifactPaths` themselves. The rehearsal ran the whole
  `twilight-bureaucrat:build` target with the new files in place and it succeeded. An activation
  provisioned **outside** the clone must be prepared again; that is the planner's question.
- **There are two dispatchers.** `apps/wiki/cli/src/cli.ts` routes the validator's commands;
  `apps/wiki/cli/src/bin.ts` keeps the installed binary's own allow-list and help text. A command
  added to only one of them is invisible to the installed package, which is why slice 1 writes the
  installed-binary assertions before it touches either file.

### 0.6 The preparation block every slice runs

Every slice begins with **this** block, and with nothing else from another slice's preparation. The
absence checks that belong to slice 1 alone are in section 1.1 and are **not** part of this block:
after slice 1, `src/templates/` exists and `cli.ts` routes `template`, which is the point.

```sh
repo_root=$(pwd -P)
task_tmp=$(mktemp -d "${TMPDIR:?launcher must supply TMPDIR}/templates-XXXXXX")
mkdir -p "$TMPDIR/evidence"
printf 'repo_root=%s\ntask_tmp=%s\n' "$repo_root" "$task_tmp"
(cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
  bun test --preload ../../../tools/test/scratch/preload.ts src/rules/rules.test.ts)
```

Expected: both paths print, `task_tmp` is beneath the launcher's `TMPDIR`, and the rule suite exits 0. **Write its test count down**: this packet adds no rule test, so that count must not move in any
slice. The rehearsal observed 19 there; yours is whatever your base commit carries.

Each slice then records its own starting counts, which its own preparation section names.

## 1. Goal and non-goals

**Goal.** Give Twilight Bureaucrat the templates it owns: a registry of four templates — module,
feature-service, resource-service and repository — each carrying the skeleton Twilight Dash
instantiates **and the machine-readable constraints its generated artifact must satisfy**; and
three command routes, `template list`, `template show <id>` and
`template verify <id> <selection> <repository> <revision> <subject>`, which judge one artifact out
of a Git revision, evaluate exactly the constraints the registry states, and never certify.

**Non-goals.** No rule joins the rule registry, no rule policy field is added, no mode applies to a
template finding, and nothing here runs in the gate or fails an existing check. No consumer
template override or version pinning (design open item 2), no capability, scenario,
manual-procedure, ADR or change-packet template, no generation: Twilight Dash instantiates,
Twilight Bureaucrat verifies. No module index metadata in the README skeleton and no import-graph
resolution — both are bounded deferrals, stated in section 4 and in the delta spec. No existing
file under `apps/wbs` is edited, so no service gains a declaration tag here.

## 2. Read first

| File                                                                  | Why                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| AGENTS.md                                                             | R1 to R5. R5 governs every check this packet adds.                                                                       |
| docs/superpowers/plans/2026-09-19-batch-1/README.md                   | "Rules for every executor", "Standard blocks every packet uses", the execution contract.                                 |
| docs/superpowers/plans/2026-09-19-batch-1/RESULTS.md                  | "What the executors stopped on".                                                                                         |
| docs/superpowers/specs/2026-09-19-twilight-bureaucrat-rules-design.md | "Templates", "Commands" and slice B5. The design this packet implements.                                                 |
| docs/superpowers/specs/2026-09-19-code-organization-design.md         | "Module layout", the direction rules K1 to K9, "What each kind must have". The source of every requirement.              |
| docs/adr/0029-services-have-a-kind-and-one-direction.md               | The decision the kind templates encode.                                                                                  |
| docs/code-organization/README.md                                      | How an unsuffixed backend service declares its kind today, and why a suffixed one needs a declaration of its own.        |
| apps/wiki/cli/src/cli.ts                                              | The validator dispatcher: the route chain and the usage line in its final `throw`.                                       |
| apps/wiki/cli/src/bin.ts                                              | The installed binary's dispatcher: the `validatorCommands` set and the `help` literal.                                   |
| apps/wiki/cli/src/rules/check.ts                                      | The shape this packet copies: a command writer that prints one record and sets `process.exitCode`.                       |
| apps/wiki/cli/src/rules/rules.test.ts                                 | The test style: `runCli`, `stdoutOf`, `stderrOf`, temporary Git fixtures, the `afterEach` cleanup.                       |
| apps/wiki/cli/src/inventory/read-candidate.ts                         | `readCandidate`, `resolveCandidateRoot`, `CandidateSnapshot`.                                                            |
| apps/wiki/cli/src/inventory/read-blob.ts                              | `readCandidateBlob`, the only way this packet reads candidate bytes.                                                     |
| apps/wiki/cli/src/policy/trust.ts                                     | `resolveValidatorArtifactPaths`, which already uses `Bun.Transpiler.scanImports`: the precedent section 6 follows.       |
| apps/wbs/fe-01/src/modules/preferences/                               | A real module of the shape the module template describes: README, contract, three kind files, tests.                     |
| apps/wiki/cli/README.md                                               | This project's module index. Its memberships carry the `src` directory prefix, so new files under it need no index edit. |
| openspec/changes/twilight-bureaucrat-rule-model/                      | The artifact shapes of a Bureaucrat OpenSpec change: `.openspec.yaml`, proposal, delta spec, tasks, verify.              |

## 3. Verified facts

Checked in the worktree on 2026-09-20. Facts 13 to 33 were **observed by executing this packet**
in a throwaway worktree cut from this branch, with the repository's own Nx targets, Bun test runner,
TypeScript options, ESLint configuration and Prettier configuration.

1. Nx project `twilight-bureaucrat`, `sourceRoot` `apps/wiki/cli/src`. Its `test` target runs
   `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --path-ignore-patterns '**/packaging/install.test.ts' --path-ignore-patterns '**/packaging/consumer-bootstrap.test.ts' --preload ../../../tools/test/scratch/preload.ts`
   with `cwd` `apps/wiki/cli`. `src/packaging/build.test.ts` is **not** excluded, so the executor
   can run it; the rehearsal ran it in 19 seconds, 2 tests.
2. `runCli(argv)` in cli.ts dispatches on `args[0]` **and** exact `args.length`, and ends by
   throwing `unknown command: <name>` with a usage line listing every command word. `template`
   appears in neither dispatcher today.
3. bin.ts's `validatorCommands` set lists the same words; a word absent from it is rejected before
   the validator runs.
4. **No test pins cli.ts's usage string or bin.ts's help text as a whole.** `build.test.ts` asserts
   `toContain('unknown command')` and `toContain` of two help lines; `install.test.ts` asserts
   `toContain('twilight-bureaucrat validate-record')`; `trusted-policy.test.ts` asserts
   `toContain('usage: twilight-bureaucrat')`. The rehearsal added one word and one help line and
   `build.test.ts` passed.
5. `readCandidate(root, request)` returns `{ selection, entries, untracked }` with entries
   `{ path, mode, blob }`. `resolveCandidateRoot` resolves a caller's interior directory to the Git
   worktree root. `readCandidateBlob(repository, blob, path)` reads one selected blob by its object
   identity and throws naming the blob and the path when Git refuses.
6. The four frontend modules under `apps/wbs/fe-01/src/modules/` all carry `README.md` with a level
   one title and the sections `## What it owns`, `## What it does not own`, `## Relationships` and
   `## Checks`; `preferences` also carries `## Invariants`. The module template's required section
   list is exactly the four every module already has.
7. Those modules carry `contract.ts`, kind files suffixed `.feature.ts`, `.resource.ts` and
   `.repository.ts`, tests beside them, and — in `directory-management` — a `view/` directory. None
   carries `module.ts`, `check.ts` or `tsconfig.json`.
8. **`di-bag` 0.4.0 is installed**, pinned at the repository root and present in `bun.lock`. What is
   true of these modules is that **they have not adopted it**: no `module.ts`, no bag, and the
   preferences README still says DI Bag is not installed. Assumption A7 is written to adoption.
9. **No Markdown file under `apps/wbs/fe-01` carries a `module-index` comment**, and `fe-01` has no
   README of its own. The frontend module READMEs are therefore not wiki indexes today;
   `read-indexes.ts` ignores a README without the envelope. Assumption A9 records the consequence.
10. **A JSDoc tag the plugin does not know fails lint.** eslint.config.js sets
    `'jsdoc/check-tag-names': ['error', { typed: true }]` and declares no `definedTags`. Observed
    with the repository's own `eslint-plugin-jsdoc`: `@capability widget-editing` inside a JSDoc
    block produced `error Invalid JSDoc tag name "capability" jsdoc/check-tag-names`, while the same
    tag as the line comment `// @capability widget-sharing` produced nothing. **Every declaration
    tag in this packet is a line comment.**
11. `docs/code-organization/README.md` records the convention for a service that does **not**
    declare its kind by suffix: an entry in `kinds.json` naming its `capability` or its `term`.
    There is no convention yet for a suffixed one; assumption A1 introduces it.
12. This packet adds no README, no tsconfig and no Nx target, so no devsync pin moves (section 0.2).
13. **Observed, slice 1.** With the test file present and no source, the four registry tests failed
    0 to 4. With the dispatcher route removed, `bun run src/cli.ts template list` printed
    `unknown command: template`. With section 6's slice 1 files and the two dispatcher edits in
    place, the same four tests passed, `twilight-bureaucrat:typecheck` and
    `twilight-bureaucrat:lint:source` both succeeded, and Prettier reported all files already
    formatted.
14. **Observed, slice 2.** With slice 2's tests appended and slice 1's `verify.ts` still in place,
    the file ran **5 pass, 17 fail**. The fifth pass is
    `refuses an unknown candidate selection kind`: the slice 1 writer already refuses every shape
    that is not `list` or `show` with the same usage line, so that test cannot discriminate until
    P23 mutates `candidateRequest`. Section 2.2 states this, so it is not a surprise to stop on.
15. **Observed, slice 2.** With section 6.5's `verify.ts`, the file ran **22 pass, 0 fail**;
    typecheck, source lint and Prettier all clean.
16. **Observed, this dispatch, 2026-09-20.** With slice 4's eleven tests appended (the three-title
    loop of §4.6 included) and the two authorized edits made, and slice 2's source still in place,
    the file ran **20 pass, 13 fail**: the eleven module tests, plus
    `lists every registered template in identifier order` and
    `refuses an unregistered template identifier and names every registered template`, which change
    because registering the module template changes both the listing and the refusal's registered
    list. With section 6.7's additions the file ran **33 pass, 0 fail**. `twilight-bureaucrat:typecheck`
    and `bunx eslint` on the three touched files both succeeded, and
    `src/packaging/build.test.ts` passed 2 of 2.
17. **Observed.** After slice 4, `twilight-bureaucrat:typecheck`, `twilight-bureaucrat:lint:source`,
    `twilight-bureaucrat:build` and `nx format:check --all` all succeeded, `src/packaging/build.test.ts`
    passed 2 of 2 with slice 1's assertions, and `src/rules/rules.test.ts` was unchanged at 19.
18. **Observed.** `template show nope` printed
    `unknown template: nope (registered: …)` to stderr, exit 1; `template summon` printed the usage
    line, exit 1; `template verify feature-service bogus …` printed the usage line, exit 1, with
    empty stdout.
19. **Observed.** The conforming fixture module verified `{"conforms":true,"findings":[]}`, exit 0,
    against both the `module` and the `repository` templates.
20. **Observed, against this repository at `HEAD`.** `template verify module committed . HEAD apps/wbs/fe-01/src/modules/<module>`
    reported exactly one class of finding per module and nothing else:

    | Module                 | Findings                                                                                      |
    | ---------------------- | --------------------------------------------------------------------------------------------- |
    | `directory`            | `resource.term` on `directory.resource.ts`                                                    |
    | `directory-management` | `feature.capability` on `directory-management.feature.ts`                                     |
    | `plan-writer`          | `feature.capability` on `plan-writer.feature.ts`                                              |
    | `preferences`          | `repository.port`, `feature.capability` and `resource.term`, one each on its three kind files |

    Each message is `file states 0 @<tag> tags, expected exactly 1`. Every other requirement passed
    on all four real modules, the whole-file parse boundary of fact 23 included.

21. **Observed, the import scanner.** `new Bun.Transpiler({ loader: 'ts' }).scanImports` reports
    `import './a.repository';` and `export * from './f.repository';`, ignores
    `// import { x } from './b.repository';` and the same text inside a string literal, reports a
    dynamic `import('./e.repository')`, **elides a purely type-only import**, and **throws** on
    source that does not parse.
22. **Observed, the declaration scanner.** A feature whose only `// @capability` text sits inside a
    template literal and inside a block comment states **zero** declarations: the verification
    reports `file states 0 @capability tags, expected exactly 1`. A regular expression over the raw
    source counted both, which is the revision 2 defect; `lineComments` walks the source instead.
23. **Observed, the parse boundary.** Every selected TypeScript file is parsed when it is decoded,
    so a module whose `contract.ts` and whose test file contain `export const = ;` is refused with
    `cannot scan the imports of src/modules/widget/contract.ts: Failed to scan imports`, exit 1,
    empty stdout. In revision 2, which parsed only the files a constraint read, that module
    verified `conforms: true`.
24. **Observed.** `template verify resource-service …` against `widget.feature.resource.ts` produced
    two findings, `resource.one-kind` and `resource.term`; `template verify feature-service …`
    against `contract.ts` produced `feature.suffix` and `feature.capability`.
25. **Observed, module scope.** A bare module produced, in order, `module.readme`, `module.contract`,
    `module.kind-file` and `module.test`; a README with its last section removed produced
    `the index omits ## Checks`; a README with no level one title produced `the index omits its
title`; a file at `widget/inner/deep.ts` produced `the file sits neither in the module
directory nor in view`; a second file named `widget.feature.resource.ts` produced
    `module.one-kind`; and a module whose feature file lost its tag produced the delegated
    `feature.capability` finding.
26. **Observed, the boundaries.** An absent subject printed `subject selects no candidate file: …`;
    a file template pointed at a directory printed `template feature-service verifies one file; …
is not one`; an absolute subject printed `subject must be a candidate-relative path:
/etc/passwd`; a non-UTF-8 file printed `candidate file … is not UTF-8`; a verification with
    findings printed its record to stdout **and** exited 1, while a conforming one exited 0.
27. **Observed, the pure evaluator.** A hand-made template with one `declares-one` requirement
    produced exactly that finding; the same template with an empty requirement list produced
    `conforms: true`; and a file template stating a `required-file` constraint threw
    `template requirement probe.module states a required-file constraint, which no file artifact can satisfy`.
28. **Observed.** The two pure tests import `verifyArtifact` with `await import('./verify')` inside
    the test body. A static `import { verifyArtifact } from './verify'` makes Bun refuse the whole
    file before any test runs while slice 1's module exports only `writeTemplateCommand`, which
    would make slice 2's red run impossible to read.
29. **Observed.** Every fault in section 8 was applied to the state its slice runs on, compiled with
    `twilight-bureaucrat:typecheck`, run with its `-t` pattern — each selected exactly one test —
    observed failing, restored by copying back and `cmp`, and rerun green.
30. **Observed, the two faults the second review rejected.** `refuseScope` is annotated `never`, so
    `return [];` alone is `TS2322`; the prescribed fault changes the annotation to
    `TemplateFinding[]` **and** the body, which compiles. `const absent = [];` is `TS7034`/`TS7005`
    under `strict`; the prescribed fault is `const absent: string[] = [];`, which compiles.
31. **Observed.** P11's fault needs `type FileKind` in verify.ts's `./template` import. Slice 2's
    file does not import it and slice 4's does; the proof prescribes adding it for the mutation and
    removing it again on restore.
32. **Observed, the two predicted outcomes the second review corrected.** Under P7 the malformed
    feature still produces the `feature.capability` finding and exit 1; what changes is that the
    stderr refusal disappears, and the named test fails on
    `Expected to contain: "cannot scan the imports of …" Received: ""`. Under P15 **both**
    required-file findings vanish, `module.readme` and `module.contract`, and the named test fails
    on the whole finding list.
33. **Observed.** `tools/tool-devsync` was not touched and no Nx target was added; the rehearsal's
    `nx format:check --all` over the whole repository exited 0.

## 4. Unknowns, and the assumptions recorded instead of asking

| #   | Question                                                                            | Recorded assumption                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | How a suffixed service names its capability, term or port machine-readably          | One **line comment** per file: `// @capability <id>`, `// @term <term>`, `// @port <specifier>`, stated exactly once and counted only when it is a real line comment (fact 22). A JSDoc tag is impossible without editing the root ESLint configuration (fact 10).                                                                                                                                   |
| A2  | Whether the templates ship as files or as data                                      | As data: each template carries its skeleton and its constraints inline in TypeScript. No Markdown or TypeScript template file is added, so no document check or README pin moves (fact 12).                                                                                                                                                                                                          |
| A3  | Whether a template finding has a mode                                               | No. Templates carry no policy: a finding is a finding, `conforms` is false, the command exits 1. Modes belong to the rule model, which 010.7 extends.                                                                                                                                                                                                                                                |
| A4  | Whether `template verify` certifies                                                 | No. `certifies: false`, for the same reason a B0 verdict does not: it binds no evidence, no authority and no validator identity.                                                                                                                                                                                                                                                                     |
| A5  | How a consumer overrides or pins a template                                         | Deferred, as the design's open item 2 says. `version` is printed by `list` and `show` so a policy can pin it later; nothing reads it yet.                                                                                                                                                                                                                                                            |
| A6  | Whether these requirements are the real K1 to K9 rules                              | No. They are template conformance over the bytes of one artifact; the authoritative K rules read the import graph and are 010.7's. Each requirement's `rules` field names the rule it partly serves.                                                                                                                                                                                                 |
| A7  | Whether the module template should require `module.ts`, `check.ts`, `tsconfig.json` | Not yet. `di-bag` is installed (fact 8) but **no module in the repository has adopted it**, so requiring its wiring would refuse every real module. They join the template as a version bump when the first module adopts DI Bag.                                                                                                                                                                    |
| A8  | Whether the real modules should be made to conform                                  | No. This packet edits no file under `apps/wbs`. Their missing declaration tags are a finding for the frontend packets, and slice 4's last test pins that observation so it cannot drift silently.                                                                                                                                                                                                    |
| A9  | Whether the module README skeleton carries `module-index` metadata                  | **No, and the delta spec says so.** No frontend module README carries the envelope today (fact 9); prescribing it would make the template's own output non-conforming to the repository and put a second index authority under `fe-01`.                                                                                                                                                              |
| A10 | Whether a type-only import of a repository is caught                                | No. The transpiler elides it (fact 21), so `imports-no-kind` cannot see it. The requirement is stated as "states no import", and the type-level dependency is left to 010.7's graph rule. Written into the delta spec as a stated limit.                                                                                                                                                             |
| A11 | Whether the declaration scanner models regular-expression literals                  | Only slice 1's scanner had this limit: its quote-skipping walk could mistake two adjacent slashes inside a regular-expression character class for a comment start, and its JSDoc said so. Slice 2 replaces `lineComments` with a TypeScript-parser walk (§2.3), which tokenizes a regular-expression literal correctly and does not share this limit; no test depends on the distinction either way. |

## 5. File plan, and what this packet does not own

| Path                                                                              | Slices                                                      | Responsibility                                                           |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| openspec/changes/twilight-bureaucrat-templates/.openspec.yaml                     | 1                                                           | `schema: sdd-lean`, `created: 2026-09-20`.                               |
| openspec/changes/twilight-bureaucrat-templates/proposal.md                        | 1                                                           | Intent, at most 400 words.                                               |
| openspec/changes/twilight-bureaucrat-templates/specs/bureaucrat-templates/spec.md | 1                                                           | The nine requirements of section 9.                                      |
| openspec/changes/twilight-bureaucrat-templates/tasks.md                           | 1 creates, every slice ticks its own                        | The six slices, each naming its tests and its negatives.                 |
| openspec/changes/twilight-bureaucrat-templates/verify.md                          | 1 creates, every slice fills its own rows                   | The proof table of section 8 and the commands record.                    |
| apps/wiki/cli/src/templates/template.ts                                           | 1 creates, 2 rewrites `lineComments`, 3 adds proof comments | The template model, its constraints and its pure readers.                |
| apps/wiki/cli/src/templates/registry.ts                                           | 1 creates, 4 adds the module template                       | The templates, their skeletons, their constraints, and `selectTemplate`. |
| apps/wiki/cli/src/templates/verify.ts                                             | 1 creates, 2 and 4 extend, 3 and 5 add proof comments       | The command writers, the candidate shell, the constraint handlers.       |
| apps/wiki/cli/src/templates/templates.test.ts                                     | 1 creates, 2 and 4 extend                                   | Every template test.                                                     |
| apps/wiki/cli/src/cli.ts                                                          | 1                                                           | One route block and one word in the usage line. Nothing else.            |
| apps/wiki/cli/src/bin.ts                                                          | 1                                                           | One word in `validatorCommands` and one help line. Nothing else.         |
| apps/wiki/cli/src/packaging/build.test.ts                                         | 1                                                           | Three assertions on the built executable.                                |
| apps/wiki/cli/README.md                                                           | 6                                                           | One new `## Templates` section, appended at the end of the file.         |

No other file is authorized.

### 5.1 Ownership beside packet 010.7, which lands in either order

Read from `010-7-rules.md` in this directory on 2026-09-20: that packet states it owns **zero
lines** of `cli.ts` and `bin.ts`, touches no packaging test, keeps its evidence in
`openspec/changes/twilight-bureaucrat-kind-rules/`, and puts its tests in `src/rules/rules.test.ts`.
So the two packets share exactly one file.

| File                                               | Owner                                                                                                                                                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/wiki/cli/src/templates/**`                   | 010.6 entirely. 010.7 creates no file there.                                                                                                                                                                                             |
| `apps/wiki/cli/src/rules/**`                       | 010.7 entirely. This packet reads none of it, registers no rule and adds no rule policy field.                                                                                                                                           |
| `apps/wiki/cli/src/cli.ts`, `src/bin.ts`           | 010.6 entirely, by 010.7's own statement. The exact insertions are in section 6.6, outside any table, because they contain literal pipe characters.                                                                                      |
| `apps/wiki/cli/src/packaging/build.test.ts`        | 010.6. 010.7 adds no packaging assertion.                                                                                                                                                                                                |
| `apps/wiki/cli/README.md`                          | **Shared, by section.** 010.7 owns the existing `## Rules` section; 010.6 appends a new `## Templates` section and edits nothing above it. 010.7's packet says it will not touch a `## Templates` heading this packet has already added. |
| `openspec/changes/twilight-bureaucrat-kind-rules/` | 010.7's evidence. This packet writes nothing there, and nothing in `openspec/changes/service-taxonomy/`.                                                                                                                                 |

**If 010.7 landed first**, the two dispatchers are unchanged by it and only the README carries its
`## Rules` edits: keep them and append below.

### 5.2 Other batch 2 neighbours

020.2, 020.7, 040.1, 040.4, 110.1 and 110.6 touch no file in section 5. 110.6 lands first and may
replace the application README coverage pin in `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`
with a derived value; either way this packet adds no README, so there is nothing to move
(section 0.2). 040.4 may add a frontend module; slice 4's observation test names
`apps/wbs/fe-01/src/modules/directory` only. `docs/code-organization/kinds.json` belongs to 020.8.

## 6. Interfaces

### 6.1 What a template is, and what verification is not

A template is **data**: an identifier, a version, whether it describes one file or one directory,
one skeleton per prescribed file, and a list of requirements — **each requirement carrying the
constraint that checks it**. `template show` prints it whole, so Twilight Dash instantiates exactly
what Twilight Bureaucrat verifies.

The verifier has **one handler per constraint kind and reads nothing else**. It iterates the
template's own requirement list, so a template that drops a requirement drops its check and one that
states a requirement gains it (fact 27). A requirement whose constraint the artifact's scope cannot
satisfy — a module-only constraint on a file template — is a **refusal**, not a silent pass.

Verification is **pure over bytes**, and it refuses what it cannot read: every selected TypeScript
file is decoded as UTF-8 and parsed when it is read, before any constraint looks at it (fact 23).
Declarations are read from real line comments, not from text that merely looks like one (fact 22).
Imports are parsed with the transpiler `trust.ts` already uses. It is deliberately **narrower** than
K1 to K9 (assumptions A6 and A10): it resolves no import to a module and reads no type graph.

A verification never certifies (`certifies: false`) and carries no mode: a finding refuses the
artifact and the command exits 1.

### 6.2 apps/wiki/cli/src/templates/template.ts — slice 1 creates this, complete

Slice 1 writes this file exactly, including the complete constraint union of eleven members. The
module constraints exist in slice 1; their handlers and registered template arrive in slice 4.
Slice 1 contains the original declaration scanner. Slice 2 replaces `lineComments` and removes
`endOfQuoted` exactly as §2.3 specifies.

```ts
/** The artifact kinds Twilight Bureaucrat holds a template for in slice B5. */
export type TemplateId = 'feature-service' | 'module' | 'repository' | 'resource-service';

/** Whether a template describes one file or a whole module directory. */
export type TemplateSubject = 'file' | 'directory';

/** The kind a file name declares, by the suffix rule K1 asks for. */
export type FileKind = 'feature' | 'repository' | 'resource';

/**
 * What one requirement checks, as data the registry states and the verifier consumes.
 *
 * The verifier has exactly one handler per member and reads nothing else, so a template that drops
 * a requirement drops its check and a template that states one gains it. That is what keeps the
 * record Twilight Dash instantiates and the record Twilight Bureaucrat verifies the same record.
 */
export type TemplateConstraint =
  | { readonly kind: 'name-suffix'; readonly suffix: string }
  | { readonly kind: 'one-kind-per-file' }
  | { readonly kind: 'declares-one'; readonly tag: string }
  | { readonly kind: 'imports-no-kind'; readonly kinds: readonly FileKind[] }
  | { readonly kind: 'sibling-test' }
  | { readonly kind: 'required-file'; readonly path: string }
  | { readonly kind: 'index-sections'; readonly path: string; readonly sections: readonly string[] }
  | { readonly kind: 'kind-file-present' }
  | { readonly kind: 'test-present' }
  | { readonly kind: 'files-stay-in-module'; readonly allowedDirectories: readonly string[] }
  | { readonly kind: 'kind-files-follow-their-template' };

/**
 * One file a template prescribes. `content` is the skeleton Twilight Dash instantiates; it carries
 * `<name>` and `<Name>` placeholders and is therefore not valid TypeScript until it is filled in.
 */
export interface TemplateFile {
  /** The path inside the artifact, with `<name>` standing for the module's name. */
  readonly path: string;
  readonly required: boolean;
  readonly content: string;
}

/** One checkable statement about a generated artifact. */
export interface TemplateRequirement {
  /** Stable and quoted in findings: `module.contract`, `feature.capability`. */
  readonly id: string;
  readonly statement: string;
  /** The rules of the code organization design this requirement partly serves: `K1`, `K9`. */
  readonly rules: readonly string[];
  /** What the verifier checks for this requirement. */
  readonly constraint: TemplateConstraint;
}

export interface Template {
  readonly id: TemplateId;
  /** The version a consumer policy will pin. Bumped whenever a requirement or a skeleton changes. */
  readonly version: string;
  readonly subject: TemplateSubject;
  readonly generates: string;
  readonly files: readonly TemplateFile[];
  readonly requirements: readonly TemplateRequirement[];
}

/** What the verifier saw. A finding is never downgraded by a mode: templates carry no policy. */
export interface TemplateFinding {
  readonly requirementId: string;
  /** A candidate-relative path. */
  readonly path: string;
  readonly message: string;
}

export interface TemplateVerification {
  readonly schemaVersion: 1;
  readonly templateId: TemplateId;
  readonly templateVersion: string;
  /** The candidate-relative file or directory that was judged. */
  readonly subject: string;
  readonly conforms: boolean;
  readonly findings: readonly TemplateFinding[];
  /**
   * Always false: a verification binds no evidence, no authority and no validator identity, exactly
   * as a rule verdict does not. Only `lint-ci` certifies.
   */
  readonly certifies: false;
}

/** One candidate file the verifier judges, with its text already decoded. */
export interface ArtifactFile {
  /** Candidate-relative, as the candidate snapshot spells it. */
  readonly path: string;
  /** The path inside the artifact: the name under a module directory, the file name for a file. */
  readonly relativePath: string;
  readonly text: string;
}

const KindNames: readonly FileKind[] = ['feature', 'repository', 'resource'];

export function fileNameOf(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator === -1 ? path : path.slice(separator + 1);
}

/**
 * Every kind a file name declares, read from its dot-separated segments. Two declarations are a K1
 * violation, so the list is returned whole rather than reduced to the first match. A test file
 * declares the kind of the file it proves: `browser-storage.repository.test.ts` is a repository.
 */
export function declaredKinds(path: string): FileKind[] {
  const name = fileNameOf(path);
  const base = name.endsWith('.test.ts')
    ? name.slice(0, -'.test.ts'.length)
    : name.endsWith('.ts')
      ? name.slice(0, -'.ts'.length)
      : name;
  const segments = new Set(base.split('.').slice(1));
  return KindNames.filter((kind) => segments.has(kind));
}

const scanner = new Bun.Transpiler({ loader: 'ts' });

/**
 * Every import specifier the file states, parsed rather than matched.
 *
 * `Bun.Transpiler.scanImports` is the scanner `resolveValidatorArtifactPaths` already trusts in
 * `policy/trust.ts`. It reports a side-effect import and a re-export, which a regular expression
 * over `from '…'` misses, and it ignores import text inside a comment or a string, which such an
 * expression reports. **A purely type-only import is elided by the transpiler and is therefore
 * invisible here**; a type-only dependency on a repository is left to the K3 graph rule, which
 * reads the type graph. Observed on 2026-09-20.
 * @throws Error naming the file when it does not parse.
 */
export function importSpecifiers(text: string, path: string): string[] {
  try {
    return scanner.scanImports(text).map((record) => record.path);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`cannot scan the imports of ${path}: ${detail}`, { cause });
  }
}

/**
 * Every line comment in the source, found by walking it rather than matching it.
 *
 * Strings, template literals and block comments are skipped, so `@capability` inside one of them is
 * not a declaration. A regular expression over the raw source counted those, observed on
 * 2026-09-20. The walk does not model regular-expression literals: two adjacent slashes inside one,
 * which only a character class can produce, would start a comment here. Nothing in a declaration
 * depends on that case, and the alternative is a full parser.
 */
export function lineComments(text: string): string[] {
  const comments: string[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '/' && text[index + 1] === '/') {
      const newline = text.indexOf('\n', index);
      const stop = newline === -1 ? text.length : newline;
      comments.push(text.slice(index, stop));
      index = stop;
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      index = endOfQuoted(text, index, char);
      continue;
    }
    index += 1;
  }
  return comments;
}

/** The index just past the quoted run that starts at `start`, or the end of the source. */
function endOfQuoted(text: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    if (quote !== '`' && char === '\n') return index;
    index += 1;
  }
  return text.length;
}

/**
 * Every value a declaration tag states, one per line comment that is exactly the declaration.
 *
 * The tag is a line comment, `// @capability plan-editing`, and deliberately not a JSDoc tag:
 * `jsdoc/check-tag-names` refuses an unknown tag inside a JSDoc block, observed on 2026-09-20 as
 * `Invalid JSDoc tag name "capability"`. A line comment is a declaration, not symbol knowledge, so
 * it belongs beside the module index comment rather than in the JSDoc rule R3 governs. Only a real
 * line comment counts: see {@link lineComments}.
 */
export function taggedValues(text: string, tag: string): string[] {
  const declaration = new RegExp(`^//[ \\t]*@${tag}[ \\t]+(\\S+)$`);
  const values: string[] = [];
  for (const comment of lineComments(text)) {
    const match = declaration.exec(comment.trimEnd());
    if (match !== null) values.push(match[1]);
  }
  return values;
}
```

### 6.3 apps/wiki/cli/src/templates/registry.ts — the slice 1 version, complete

Slice 4 inserts the module template into this file (section 6.7) and changes nothing else.

```ts
import type { Template } from './template';

const PortContract = `/**
 * Raw access to <the one external thing>, as the port its owner declares.
 *
 * The port belongs to the framework-free core, as ADR 0014 defines; the adapter beside it
 * satisfies this type and adds nothing to it.
 */
export interface <Name>Port {
  readonly <member>: <Type>;
}
`;

const FeatureFile = `import type { <Name> } from './contract';

/**
 * <One piece of user-facing value, in one sentence.>
 *
 * A feature-service: it coordinates resource-services, owns the transaction (K7), imports no
 * repository (K3) and, on the frontend, no React (F1).
 */
// @capability <capability-id>
export function create<Name>(<requirements>): <Name> {
  return { <member>: <value> };
}
`;

const ResourceFile = `import type { <Name> } from './contract';

/**
 * <The quirks and invariants of one resource, in one sentence.>
 *
 * A resource-service: it holds the constraints of one aggregate over repository ports, opens no
 * transaction (K7) and imports no feature-service (K4).
 */
// @term <glossary-term>
export function create<Name>(<requirements>): <Name> {
  return { <member>: <value> };
}
`;

const RepositoryFile = `import type { <Name>Port } from './contract';

/**
 * Raw access to <the one external thing this adapter reaches>. It holds no decisions.
 *
 * A repository adapter: it imports nothing above it (K5) and satisfies the port the core owns.
 */
// @port ./contract#<Name>Port
export function <name>(): <Name>Port {
  return { <member>: <value> };
}
`;

const KindTest = `import { describe, expect, test } from 'bun:test';

/** The level this kind requires; for a repository adapter, conformance against its port. */
describe('<name>', () => {
  test('<what the behaviour is>', () => {
    expect(<observed>).toEqual(<expected>);
  });
});
`;

const featureTemplate: Template = {
  id: 'feature-service',
  version: '1.0.0',
  subject: 'file',
  generates: 'One feature-service file with the capability it serves.',
  files: [{ path: '<name>.feature.ts', required: true, content: FeatureFile }],
  requirements: [
    {
      id: 'feature.suffix',
      statement: 'A feature-service file name ends in `.feature.ts`.',
      rules: ['K1'],
      constraint: { kind: 'name-suffix', suffix: '.feature.ts' },
    },
    {
      id: 'feature.one-kind',
      statement: 'A feature-service file name declares no second kind.',
      rules: ['K1'],
      constraint: { kind: 'one-kind-per-file' },
    },
    {
      id: 'feature.capability',
      statement: 'A feature-service names exactly one capability, in a `@capability` line comment.',
      rules: ['K9'],
      constraint: { kind: 'declares-one', tag: 'capability' },
    },
    {
      id: 'feature.no-repository-import',
      statement:
        'A feature-service states no import of a file whose name declares the repository kind.',
      rules: ['K3'],
      constraint: { kind: 'imports-no-kind', kinds: ['repository'] },
    },
  ],
};

const resourceTemplate: Template = {
  id: 'resource-service',
  version: '1.0.0',
  subject: 'file',
  generates: 'One resource-service file with the glossary term it is named after.',
  files: [{ path: '<name>.resource.ts', required: true, content: ResourceFile }],
  requirements: [
    {
      id: 'resource.suffix',
      statement: 'A resource-service file name ends in `.resource.ts`.',
      rules: ['K1'],
      constraint: { kind: 'name-suffix', suffix: '.resource.ts' },
    },
    {
      id: 'resource.one-kind',
      statement: 'A resource-service file name declares no second kind.',
      rules: ['K1'],
      constraint: { kind: 'one-kind-per-file' },
    },
    {
      id: 'resource.term',
      statement: 'A resource-service names exactly one glossary term, in a `@term` line comment.',
      rules: ['K9'],
      constraint: { kind: 'declares-one', tag: 'term' },
    },
    {
      id: 'resource.no-feature-import',
      statement:
        'A resource-service states no import of a file whose name declares the feature kind.',
      rules: ['K4'],
      constraint: { kind: 'imports-no-kind', kinds: ['feature'] },
    },
  ],
};

const repositoryTemplate: Template = {
  id: 'repository',
  version: '1.0.0',
  subject: 'file',
  generates: 'One repository adapter with the port it satisfies and its conformance test.',
  files: [
    { path: 'contract.ts', required: true, content: PortContract },
    { path: '<name>.repository.ts', required: true, content: RepositoryFile },
    { path: '<name>.repository.test.ts', required: true, content: KindTest },
  ],
  requirements: [
    {
      id: 'repository.suffix',
      statement: 'A repository adapter file name ends in `.repository.ts`.',
      rules: ['K1'],
      constraint: { kind: 'name-suffix', suffix: '.repository.ts' },
    },
    {
      id: 'repository.one-kind',
      statement: 'A repository adapter file name declares no second kind.',
      rules: ['K1'],
      constraint: { kind: 'one-kind-per-file' },
    },
    {
      id: 'repository.port',
      statement: 'A repository adapter names exactly one port, in a `@port` line comment.',
      rules: ['K5'],
      constraint: { kind: 'declares-one', tag: 'port' },
    },
    {
      id: 'repository.conformance-test',
      statement: 'A repository adapter has a sibling test file beside it.',
      rules: ['required test levels'],
      constraint: { kind: 'sibling-test' },
    },
    {
      id: 'repository.no-service-import',
      statement:
        'A repository adapter states no import of a file whose name declares the feature or resource kind.',
      rules: ['K5'],
      constraint: { kind: 'imports-no-kind', kinds: ['feature', 'resource'] },
    },
  ],
};

const templates: readonly Template[] = [featureTemplate, repositoryTemplate, resourceTemplate];

/** The registry, sorted by identifier so a listing is stable. */
export function registeredTemplates(): readonly Template[] {
  return [...templates].sort((left, right) => (left.id < right.id ? -1 : 1));
}

export function findTemplate(templateId: string): Template | undefined {
  return templates.find((template) => template.id === templateId);
}

/** Every registered identifier, for a refusal that has to name the alternatives. */
export function registeredTemplateIds(): string {
  return registeredTemplates()
    .map((template) => template.id)
    .join(', ');
}

/** @throws Error naming every registered template when the identifier is not one of them. */
export function selectTemplate(templateId: string): Template {
  const template = findTemplate(templateId);
  if (template === undefined) {
    throw new Error(`unknown template: ${templateId} (registered: ${registeredTemplateIds()})`);
  }
  return template;
}
```

The repository template ships **three** files, the port contract included, because the design's
table calls the repository artifact "a port and an adapter with a conformance test" and the adapter
skeleton imports `<Name>Port` from `./contract`. Verification does **not** require a sibling
`contract.ts` for an adapter: a backend adapter's port lives with the framework-free core, not
beside it. The generated pair keeps them together; the verifier judges only what it can see.

### 6.4 apps/wiki/cli/src/templates/verify.ts — the slice 1 version, complete

Slice 1 ships a working `list` and `show` and no stub: `verify` is not an action yet and falls to
the usage refusal, which is why the selection-kind test of fact 14 passes before slice 2's code.

```ts
import { registeredTemplates, selectTemplate } from './registry';

const Usage =
  'usage: twilight-bureaucrat template <list|show <template-id>|verify <template-id> <committed|staged|working> <repository> <revision-or-base> <subject>>';

/** `template list` and `template show <id>`; slice 2 adds `verify`. */
export function writeTemplateCommand(argv: readonly string[]): void {
  const [, action, templateId] = argv;
  if (argv.length === 2 && action === 'list') {
    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        templates: registeredTemplates().map(({ id, version, subject, generates }) => ({
          id,
          version,
          subject,
          generates,
        })),
      })}\n`,
    );
    return;
  }
  if (argv.length === 3 && action === 'show') {
    process.stdout.write(`${JSON.stringify(selectTemplate(templateId))}\n`);
    return;
  }
  throw new Error(Usage);
}
```

### 6.5 apps/wiki/cli/src/templates/verify.ts — the slice 2 version, complete

Slice 2 replaces the file with this. The `list` and `show` branches are byte for byte the ones
above; everything else is new.

```ts
import { readCandidateBlob } from '../inventory/read-blob';
import {
  type CandidateRequest,
  readCandidate,
  resolveCandidateRoot,
} from '../inventory/read-candidate';
import { registeredTemplates, selectTemplate } from './registry';
import {
  type ArtifactFile,
  declaredKinds,
  fileNameOf,
  importSpecifiers,
  taggedValues,
  type Template,
  type TemplateConstraint,
  type TemplateFinding,
  type TemplateRequirement,
  type TemplateVerification,
} from './template';

/** One file and the names beside it. Every file-scope constraint is judged against this. */
export interface FileScope {
  readonly scope: 'file';
  readonly file: ArtifactFile;
  /** The file names in the same directory, the file itself included. */
  readonly siblings: readonly string[];
}

function refuseScope(requirement: TemplateRequirement, scope: FileScope): never {
  throw new Error(
    `template requirement ${requirement.id} states a ${requirement.constraint.kind} constraint, which no ${scope.scope} artifact can satisfy`,
  );
}

function finding(requirement: TemplateRequirement, path: string, message: string): TemplateFinding {
  return { requirementId: requirement.id, path, message };
}

function oneKindFindings(
  requirement: TemplateRequirement,
  files: readonly ArtifactFile[],
): TemplateFinding[] {
  return files
    .filter((file) => declaredKinds(file.path).length > 1)
    .map((file) =>
      finding(
        requirement,
        file.path,
        `file name declares ${declaredKinds(file.path).join(' and ')}`,
      ),
    );
}

function fileFindings(
  requirement: TemplateRequirement,
  constraint: TemplateConstraint,
  scope: FileScope,
): TemplateFinding[] {
  const { file, siblings } = scope;
  switch (constraint.kind) {
    case 'name-suffix':
      return fileNameOf(file.path).endsWith(constraint.suffix)
        ? []
        : [finding(requirement, file.path, `file name does not end in ${constraint.suffix}`)];
    case 'one-kind-per-file':
      return oneKindFindings(requirement, [file]);
    case 'declares-one': {
      const stated = taggedValues(file.text, constraint.tag);
      return stated.length === 1
        ? []
        : [
            finding(
              requirement,
              file.path,
              `file states ${String(stated.length)} @${constraint.tag} tags, expected exactly 1`,
            ),
          ];
    }
    case 'imports-no-kind': {
      const findings: TemplateFinding[] = [];
      for (const specifier of importSpecifiers(file.text, file.path)) {
        for (const forbidden of constraint.kinds) {
          if (declaredKinds(specifier).includes(forbidden)) {
            findings.push(
              finding(
                requirement,
                file.path,
                `the file imports ${specifier}, which declares the ${forbidden} kind`,
              ),
            );
          }
        }
      }
      return findings;
    }
    case 'sibling-test': {
      const name = fileNameOf(file.path);
      const testName = name.endsWith('.ts')
        ? `${name.slice(0, -'.ts'.length)}.test.ts`
        : `${name}.test.ts`;
      return siblings.includes(testName)
        ? []
        : [finding(requirement, file.path, `no sibling ${testName} proves this file`)];
    }
    default:
      return refuseScope(requirement, scope);
  }
}

/** Every finding one template's requirements produce over one artifact. */
function requirementFindings(template: Template, scope: FileScope): TemplateFinding[] {
  return template.requirements.flatMap((requirement) =>
    fileFindings(requirement, requirement.constraint, scope),
  );
}

function verification(
  template: Template,
  subject: string,
  findings: readonly TemplateFinding[],
): TemplateVerification {
  return {
    schemaVersion: 1,
    templateId: template.id,
    templateVersion: template.version,
    subject,
    conforms: findings.length === 0,
    findings,
    certifies: false,
  };
}

/**
 * Judges one artifact against one template, by evaluating exactly the requirements the template
 * states. Pure: every byte it reads is already in `files`.
 * @throws Error when the artifact does not match the template's subject kind, when a requirement
 * states a constraint the artifact's scope cannot satisfy, or when a file does not parse.
 */
export function verifyArtifact(
  template: Template,
  subject: string,
  files: readonly ArtifactFile[],
  siblingsOf: (path: string) => readonly string[],
): TemplateVerification {
  const file = files.find((candidate) => candidate.path === subject);
  if (file === undefined) {
    throw new Error(`template ${template.id} verifies one file; ${subject} is not one`);
  }
  return verification(
    template,
    subject,
    requirementFindings(template, { scope: 'file', file, siblings: siblingsOf(file.path) }),
  );
}

function directoryOf(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator === -1 ? '' : path.slice(0, separator);
}

/**
 * The text of one selected file, refusing bytes this judge cannot read.
 *
 * Every selected TypeScript file is parsed here, whether or not a constraint reads its imports, so
 * a malformed support file, contract or test refuses the artifact instead of passing unexamined.
 * @throws Error naming the file when its bytes are not UTF-8 or its source does not parse.
 */
function decodeArtifact(repository: string, blob: string, path: string): string {
  if (!path.endsWith('.ts') && !path.endsWith('.md')) return '';
  const bytes = readCandidateBlob(repository, blob, path);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`candidate file ${path} is not UTF-8: ${detail}`, { cause });
  }
  if (path.endsWith('.ts')) importSpecifiers(text, path);
  return text;
}

export interface TemplateVerifyRequest {
  readonly templateId: string;
  readonly repository: string;
  readonly candidate: CandidateRequest;
  readonly subject: string;
}

/**
 * Reads one artifact out of a candidate revision and judges it against one template.
 * @throws Error when the subject is not candidate-relative, selects nothing, or is the wrong kind
 * of subject for the template. An unknown subject is never an empty artifact.
 */
export function verifyTemplateInCandidate(request: TemplateVerifyRequest): TemplateVerification {
  const template = selectTemplate(request.templateId);
  const root = resolveCandidateRoot(request.repository);
  const subject = request.subject.replace(/\/+$/, '');
  if (subject.length === 0 || subject.startsWith('/') || subject.split('/').includes('..')) {
    throw new Error(`subject must be a candidate-relative path: ${request.subject}`);
  }
  const snapshot = readCandidate(root, request.candidate);
  const selected =
    template.subject === 'directory'
      ? snapshot.entries.filter((entry) => entry.path.startsWith(`${subject}/`))
      : snapshot.entries.filter((entry) => entry.path === subject);
  if (selected.length === 0) {
    const mistaken = snapshot.entries.some((entry) =>
      template.subject === 'directory'
        ? entry.path === subject
        : entry.path.startsWith(`${subject}/`),
    );
    throw new Error(
      mistaken
        ? `template ${template.id} verifies one ${template.subject}; ${subject} is not one`
        : `subject selects no candidate file: ${subject}`,
    );
  }
  const prefix = template.subject === 'directory' ? `${subject}/` : '';
  const files: ArtifactFile[] = selected.map((entry) => ({
    path: entry.path,
    relativePath: entry.path.slice(prefix.length),
    text: decodeArtifact(root, entry.blob, entry.path),
  }));
  const siblingsOf = (path: string): string[] =>
    snapshot.entries
      .filter((entry) => directoryOf(entry.path) === directoryOf(path))
      .map((entry) => fileNameOf(entry.path));
  return verifyArtifact(template, subject, files, siblingsOf);
}

const Usage =
  'usage: twilight-bureaucrat template <list|show <template-id>|verify <template-id> <committed|staged|working> <repository> <revision-or-base> <subject>>';

function candidateRequest(kind: string, revision: string): CandidateRequest {
  if (kind !== 'committed' && kind !== 'staged' && kind !== 'working') {
    throw new Error(Usage);
  }
  return kind === 'committed' ? { kind, revision } : { kind, base: revision };
}

/** `template list`, `template show <id>`, `template verify <id> <kind> <repo> <rev> <subject>` */
export function writeTemplateCommand(argv: readonly string[]): void {
  const [, action, templateId, kind, repository, revision, subject] = argv;
  if (argv.length === 2 && action === 'list') {
    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        templates: registeredTemplates().map(({ id, version, subject: verifies, generates }) => ({
          id,
          version,
          subject: verifies,
          generates,
        })),
      })}\n`,
    );
    return;
  }
  if (argv.length === 3 && action === 'show') {
    process.stdout.write(`${JSON.stringify(selectTemplate(templateId))}\n`);
    return;
  }
  if (argv.length === 7 && action === 'verify') {
    const verified = verifyTemplateInCandidate({
      templateId,
      repository,
      candidate: candidateRequest(kind, revision),
      subject,
    });
    process.stdout.write(`${JSON.stringify(verified)}\n`);
    if (!verified.conforms) process.exitCode = 1;
    return;
  }
  throw new Error(Usage);
}
```

The `template.subject === 'directory'` branches in the shell are written now and exercised in slice
4: no directory template is registered until then.

### 6.6 The two dispatcher edits — slice 1

These carry literal `|` characters, so they are shown outside any table.

In `apps/wiki/cli/src/cli.ts`, immediately **before** the route block whose condition is
`args.length === 4 && args[0] === 'validate-policy-activation'`:

```ts
if ((args.length === 2 || args.length === 3 || args.length === 7) && args[0] === 'template') {
  return import('./templates/verify').then(({ writeTemplateCommand }) => {
    writeTemplateCommand(args);
  });
}
```

Three argument counts because one command word carries three actions; the writer refuses every
other shape with the usage line.

In the same file's final `throw`, the usage string lists the command words separated by `|`. Insert
the single word `template` between the words `explain` and `validate-policy-activation`, keeping
every other word exactly as it is, including any word another lane has added.

In `apps/wiki/cli/src/bin.ts`, add the entry `'template',` to the `validatorCommands` set
immediately after the `'check',` entry, and add one line to the `help` template literal immediately
after the line that documents `explain`. The line is, with two leading spaces:

```text
  twilight-bureaucrat template <list|show <id>|verify <id> <committed|staged|working> <repository> <revision-or-base> <subject>>
```

### 6.7 Slice 4's additions

`template.ts` needs no slice 4 edit: the complete constraint union already exists.

**registry.ts.** Insert this block immediately **before** `const templates: readonly Template[] = [`,
and change that list to
`const templates: readonly Template[] = [featureTemplate, moduleTemplate, repositoryTemplate, resourceTemplate];`:

```ts
const ModuleReadme = `# <Name>

One sentence on the value this module delivers.

## What it owns

- The decisions, state and invariants that live here.

## What it does not own

- The neighbouring decisions a reader would expect here and will not find.

## Relationships

The exported types are in \`contract.ts\`; <the kind files, and what each one holds>.

## Checks

<The Nx target that runs this module's tests, and the files that prove it.>
`;

const ModuleContract = `/**
 * What this module exports, and what its host must supply.
 *
 * Every member carries the JSDoc that states its behaviour, its throws and its invariants, because
 * a work packet reads this file and the README, not the module.
 */
export interface <Name> {
  readonly <member>: <Type>;
}
`;

const IndexSections = [
  '## What it owns',
  '## What it does not own',
  '## Relationships',
  '## Checks',
] as const;

const moduleTemplate: Template = {
  id: 'module',
  version: '1.0.0',
  subject: 'directory',
  generates: 'One module directory: its index, its contract, its kind files and its tests.',
  files: [
    { path: 'README.md', required: true, content: ModuleReadme },
    { path: 'contract.ts', required: true, content: ModuleContract },
    { path: '<name>.feature.ts', required: false, content: FeatureFile },
    { path: '<name>.resource.ts', required: false, content: ResourceFile },
    { path: '<name>.repository.ts', required: false, content: RepositoryFile },
    { path: '<name>.feature.test.ts', required: false, content: KindTest },
  ],
  requirements: [
    {
      id: 'module.readme',
      statement: 'A module carries a README index at its root.',
      rules: ['module layout'],
      constraint: { kind: 'required-file', path: 'README.md' },
    },
    {
      id: 'module.readme-sections',
      statement:
        'The README states a title and the sections "What it owns", "What it does not own", "Relationships" and "Checks".',
      rules: ['module layout'],
      constraint: { kind: 'index-sections', path: 'README.md', sections: IndexSections },
    },
    {
      id: 'module.contract',
      statement: 'A module carries a contract file that states its exported types.',
      rules: ['module layout'],
      constraint: { kind: 'required-file', path: 'contract.ts' },
    },
    {
      id: 'module.kind-file',
      statement: 'A module carries at least one file that declares a kind by its suffix.',
      rules: ['K1'],
      constraint: { kind: 'kind-file-present' },
    },
    {
      id: 'module.one-kind',
      statement: 'No file declares more than one kind.',
      rules: ['K1'],
      constraint: { kind: 'one-kind-per-file' },
    },
    {
      id: 'module.test',
      statement: 'A module carries at least one test file.',
      rules: ['required test levels'],
      constraint: { kind: 'test-present' },
    },
    {
      id: 'module.layout',
      statement: 'Every file sits in the module directory or in its `view` directory.',
      rules: ['module layout'],
      constraint: { kind: 'files-stay-in-module', allowedDirectories: ['view'] },
    },
    {
      id: 'module.kind-files',
      statement: 'Every kind file in the module satisfies the template of its own kind.',
      rules: ['K1', 'K3', 'K4', 'K5', 'K9'],
      constraint: { kind: 'kind-files-follow-their-template' },
    },
  ],
};
```

**verify.ts.** Add the module scope beside `FileScope`, widen `refuseScope` and
`requirementFindings`, add the module handlers, and give `verifyArtifact` its directory branch. The
complete set of additions, in the order they appear in the finished file:

```ts
/** One module directory and everything under it. */
export interface ModuleScope {
  readonly scope: 'module';
  readonly subject: string;
  readonly files: readonly ArtifactFile[];
  readonly siblingsOf: (path: string) => readonly string[];
}

export type ArtifactScope = FileScope | ModuleScope;
```

`refuseScope`'s parameter becomes `scope: ArtifactScope`; nothing else in it changes. `type FileKind`
joins the `./template` import list. After `fileFindings`, and before the `requirementFindings`
comment:

```ts
function moduleFindings(
  requirement: TemplateRequirement,
  constraint: TemplateConstraint,
  scope: ModuleScope,
): TemplateFinding[] {
  const { subject, files } = scope;
  switch (constraint.kind) {
    case 'required-file':
      return files.some((file) => file.relativePath === constraint.path)
        ? []
        : [finding(requirement, subject, `the module directory has no ${constraint.path}`)];
    case 'index-sections': {
      const index = files.find((file) => file.relativePath === constraint.path);
      if (index === undefined) return [];
      const absent = [
        ...(index.text.startsWith('# ') ? [] : ['its title']),
        ...constraint.sections.filter((section) => !index.text.includes(`\n${section}\n`)),
      ];
      return absent.length === 0
        ? []
        : [finding(requirement, index.path, `the index omits ${absent.join(', ')}`)];
    }
    case 'kind-file-present':
      return kindFilesOf(files).length > 0
        ? []
        : [finding(requirement, subject, 'no file declares a kind by its suffix')];
    case 'test-present':
      return files.some((file) => file.relativePath.endsWith('.test.ts'))
        ? []
        : [finding(requirement, subject, 'the module has no test file')];
    case 'files-stay-in-module':
      return files
        .filter((file) => {
          const segments = file.relativePath.split('/');
          return (
            segments.length > 2 ||
            (segments.length === 2 && !constraint.allowedDirectories.includes(segments[0]))
          );
        })
        .map((file) =>
          finding(
            requirement,
            file.path,
            `the file sits neither in the module directory nor in ${constraint.allowedDirectories.join(', ')}`,
          ),
        );
    case 'one-kind-per-file':
      return oneKindFindings(requirement, files);
    case 'kind-files-follow-their-template':
      return kindFilesOf(files).flatMap((file) => {
        const kinds = declaredKinds(file.path);
        if (kinds.length !== 1) return [];
        return requirementFindings(selectTemplate(templateIdOfKind(kinds[0])), {
          scope: 'file',
          file,
          siblings: scope.siblingsOf(file.path),
        });
      });
    default:
      return refuseScope(requirement, scope);
  }
}

function kindFilesOf(files: readonly ArtifactFile[]): ArtifactFile[] {
  return files.filter(
    (file) => !file.relativePath.endsWith('.test.ts') && declaredKinds(file.path).length > 0,
  );
}

function templateIdOfKind(kind: FileKind): string {
  return kind === 'repository' ? 'repository' : `${kind}-service`;
}
```

`requirementFindings` becomes:

```ts
function requirementFindings(template: Template, scope: ArtifactScope): TemplateFinding[] {
  return template.requirements.flatMap((requirement) =>
    scope.scope === 'file'
      ? fileFindings(requirement, requirement.constraint, scope)
      : moduleFindings(requirement, requirement.constraint, scope),
  );
}
```

and `verifyArtifact` gains, as its first statement:

```ts
if (template.subject === 'directory') {
  return verification(
    template,
    subject,
    requirementFindings(template, { scope: 'module', subject, files, siblingsOf }),
  );
}
```

A file whose name declares two kinds is skipped by the delegation branch and reported by
`module.one-kind` instead, so no module file is judged against the wrong template.

## Slice 1 — OpenSpec change, registry, `list` and `show`

### 1.1 Preparation

- [ ] Run section 0.6's preparation block. Expected: the paths print and the rule suite passes;
      record its count.
- [ ] Run **slice 1's own absence checks**, which no later slice repeats, because after this slice
      both are expected to be present:

  ```sh
  if [ -e "$repo_root/apps/wiki/cli/src/templates" ]; then
    echo 'src/templates already exists; stop.' >&2; exit 1
  fi
  if grep -q "unknown command:.*|template|" "$repo_root/apps/wiki/cli/src/cli.ts"; then
    echo 'cli.ts already routes template; stop.' >&2; exit 1
  else
    status=$?
    test "$status" -eq 1 || { echo "grep failed with $status" >&2; exit "$status"; }
  fi
  ```

  Expected: silence. `grep` exits 1 for "no match"; any other status stops.

### 1.2 The OpenSpec change

- [ ] Create the change with the batch README's **Creating an OpenSpec change** block, named
      `twilight-bureaucrat-templates`. Expected: `grep` prints one `schema: sdd-lean` line.
- [ ] Write proposal.md from the schema's template with section 9's intent, at most 400 words
      excluding the template's HTML comments.
- [ ] Write specs/bureaucrat-templates/spec.md with the **nine** requirements of section 9, each
      with at least one four-hashtag scenario whose bullets are real `GIVEN`, `WHEN` and `THEN`
      clauses.
- [ ] Write tasks.md as these six slices, each naming its tests and its negatives, all unticked.
- [ ] Write verify.md with section 8's proof table, the `Observed failure` column empty, and an
      empty `## Commands and results` heading.
- [ ] Run the batch README's **OpenSpec validation** block verbatim. Expected: one JSON report and
      the block exits 0. Record the passed total as this slice's baseline.

### 1.3 Tests first

- [ ] Create apps/wiki/cli/src/templates/templates.test.ts with **only** section 1.6's content:
      four tests.
- [ ] Add section 1.7's three assertions to `src/packaging/build.test.ts`, inside the existing
      `builds the canonical executable for use outside the repository` test, immediately after its
      `explain` assertions.
- [ ] Run both focused files:

  ```sh
  (cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
    bun test --preload ../../../tools/test/scratch/preload.ts src/templates/templates.test.ts \
    src/packaging/build.test.ts)
  ```

  Expected, observed in the rehearsal: the four template tests fail — `template` is not a command,
  so the command line prints `unknown command: template` — and the packaging test fails on its new
  `--help` assertion. **Record both failing lines**: they are the evidence that the installed
  dispatcher's test preceded the dispatcher.

### 1.4 Implementation

- [ ] Create `template.ts` with the complete section 6.2 code, including all eleven constraint
      members. The module constraints exist in slice 1; their handlers and registered template
      arrive in slice 4.
- [ ] Create apps/wiki/cli/src/templates/registry.ts, exactly section 6.3.
- [ ] Create apps/wiki/cli/src/templates/verify.ts, exactly section 6.4.
- [ ] Make the two dispatcher edits of section 6.6.
- [ ] Rerun the two focused files. Expected: 4 template tests pass, packaging passes.

### 1.5 Negative proof

| #   | Check                                         | Fault                                                 | Named test                                                                        |
| --- | --------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| P1  | `selectTemplate`'s unknown-identifier refusal | Return `registeredTemplates()[0]` instead of throwing | `refuses an unregistered template identifier and names every registered template` |

Observed in the rehearsal: the command exits 0 and the test fails with `Expected: 1 Received: 0`.
Follow section 0.4 exactly.

### 1.6 Slice 1's test file

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

interface TemplateListing {
  schemaVersion: number;
  templates: { id: string; version: string; subject: string; generates: string }[];
}

interface ShownTemplate {
  id: string;
  subject: string;
  files: { path: string; required: boolean; content: string }[];
  requirements: { id: string; statement: string; rules: string[]; constraint: { kind: string } }[];
}

describe('template registry CLI', () => {
  test('lists every registered template in identifier order', () => {
    const invocation = runCli(['template', 'list']);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    const listing = JSON.parse(stdoutOf(invocation)) as TemplateListing;
    expect(listing.schemaVersion).toBe(1);
    expect(listing.templates.map((template) => template.id)).toEqual([
      'feature-service',
      'repository',
      'resource-service',
    ]);
    expect(listing.templates.map((template) => template.subject)).toEqual(['file', 'file', 'file']);
  }, 30_000);

  test('shows one template with its skeleton files and its constrained requirements', () => {
    const invocation = runCli(['template', 'show', 'repository']);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    const shown = JSON.parse(stdoutOf(invocation)) as ShownTemplate;
    expect(shown.files.map((file) => file.path)).toEqual([
      'contract.ts',
      '<name>.repository.ts',
      '<name>.repository.test.ts',
    ]);
    expect(shown.files[1].content).toContain('// @port ./contract#<Name>Port');
    expect(shown.requirements.map((requirement) => requirement.id)).toEqual([
      'repository.suffix',
      'repository.one-kind',
      'repository.port',
      'repository.conformance-test',
      'repository.no-service-import',
    ]);
    expect(shown.requirements.map((requirement) => requirement.constraint.kind)).toEqual([
      'name-suffix',
      'one-kind-per-file',
      'declares-one',
      'sibling-test',
      'imports-no-kind',
    ]);
  }, 30_000);

  test('refuses an unregistered template identifier and names every registered template', () => {
    const invocation = runCli(['template', 'show', 'NO-SUCH-TEMPLATE']);
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'unknown template: NO-SUCH-TEMPLATE (registered: feature-service, repository, resource-service)',
    );
  }, 30_000);

  test('refuses an unknown template action', () => {
    const invocation = runCli(['template', 'summon']);
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain('usage: twilight-bureaucrat template <list|show');
  }, 30_000);
});
```

`runCli`, `stdoutOf` and `stderrOf` are used by every later slice, which appends its own helpers
below them.

### 1.7 Slice 1's packaging assertions

Added inside build.test.ts's existing built-executable test, reusing its `externalRoot`,
`executable` and `invoke`:

```ts
const templateHelp = invoke(executable, ['--help'], externalRoot);
expect(templateHelp.exitCode, templateHelp.stderr.toString()).toBe(0);
expect(templateHelp.stdout.toString()).toContain('twilight-bureaucrat template <list|show');

const listed = invoke(executable, ['template', 'list'], externalRoot);
expect(listed.exitCode, listed.stderr.toString()).toBe(0);
expect(
  (JSON.parse(listed.stdout.toString()) as { templates: { id: string }[] }).templates.map(
    (template) => template.id,
  ),
).toContain('repository');

const unknownTemplate = invoke(executable, ['template', 'show', 'NO-SUCH-TEMPLATE'], externalRoot);
expect(unknownTemplate.exitCode).not.toBe(0);
expect(unknownTemplate.stderr.toString()).toContain('unknown template: NO-SUCH-TEMPLATE');
```

The listing assertion is `toContain`, not an exact list, so slice 4's fourth template does not
disturb it; the rehearsal ran this file green in both states.

### 1.8 Slice 1 verification, record and formatting

| Command                                                                                                    | Expected                                                  |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| The two focused files of section 1.3                                                                       | Exit 0; 4 template tests pass; the packaging file passes. |
| The rule suite of section 0.6                                                                              | Exit 0; the recorded count, unchanged.                    |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`                                                | Exit 0; `Successfully ran target typecheck`.              |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`                                              | Exit 0, no warnings.                                      |
| `bunx prettier --write` over **this slice's own files**, then `NX_DAEMON=false bunx nx format:check --all` | Both exit 0. Never a repository-wide write.               |
| The batch README's **OpenSpec validation** block                                                           | Exit 0; one JSON report kept under `$TMPDIR/evidence`.    |

- [ ] Tick **only slice 1's** boxes in tasks.md, and write this slice's commands, statuses and
      decisive lines, plus P1's observed failure, into verify.md.
- [ ] Run `git status --short --untracked-files=all` and compare it with section 1.9's list. A path
      that is not on that list is a stop.

Pending planner verification, named in the report: the whole `twilight-bureaucrat:test`,
`twilight-bureaucrat:test:package` and `tool-devsync:test` targets, and `bin/h2puni-gate.sh`.

### 1.9 Ready to commit

Commit subject: `feat(bureaucrat): add the template registry with list and show`.

Files: openspec/changes/twilight-bureaucrat-templates/.openspec.yaml,
openspec/changes/twilight-bureaucrat-templates/proposal.md,
openspec/changes/twilight-bureaucrat-templates/specs/bureaucrat-templates/spec.md,
openspec/changes/twilight-bureaucrat-templates/tasks.md,
openspec/changes/twilight-bureaucrat-templates/verify.md,
apps/wiki/cli/src/templates/template.ts, apps/wiki/cli/src/templates/registry.ts,
apps/wiki/cli/src/templates/verify.ts, apps/wiki/cli/src/templates/templates.test.ts,
apps/wiki/cli/src/cli.ts, apps/wiki/cli/src/bin.ts, apps/wiki/cli/src/packaging/build.test.ts.

Then stop and hand over. Do not start slice 2.

### 1.10 Slice 1 stop conditions

1. Either absence check of section 1.1 is true.
2. The rule suite's count moves from the section 0.6 baseline.
3. `lint:source` reports something that cannot be fixed without a suppression.
4. The OpenSpec validation block fails for a reason outside this change's own artifacts.
5. The 400-word intent cap cannot be met.

---

## Slice 2 — verifying one file against its template

Starts from the committed slice 1. Read section 0 in full first.

### 2.1 Preparation

- [ ] Run section 0.6's block. **Do not run slice 1's absence checks**: `src/templates/` exists now
      and `cli.ts` routes `template`, by design.
- [ ] Record two baselines:

  ```sh
  (cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
    bun test --preload ../../../tools/test/scratch/preload.ts src/templates/templates.test.ts \
    src/inventory/read-candidate.test.ts)
  ```

  Expected: exit 0. Write down **both** counts: the templates file (4 in the rehearsal) and the
  candidate-reader file, which this slice must leave unchanged. This slice adds **18** template
  tests, so the templates file ends at its recorded count plus 18.

### 2.2 Tests first

- [ ] Append section 2.6's helpers and its two describe blocks to
      apps/wiki/cli/src/templates/templates.test.ts. Merge the new imports into the file's existing
      import block at the top; never leave an `import` in the middle of the file.
- [ ] Run the focused templates file. Expected: exit 1, N+1 passes and 17 failures, totaling N+18
      tests, where N is the template-test baseline recorded in §2.1. On the committed slice 1
      baseline, this is 5 pass and 17 fail. The passing tests are the existing baseline tests and
      `refuses an unknown candidate selection kind`; the latter already passes because slice 1
      rejects the entire verify command with the expected usage message. Every other added test must
      fail. Record one failing CLI assertion and one failing pure-test assertion. After
      implementation, expect N+18 passes and zero failures: 22 passes on this baseline.

The matcher is not the requirement; the fact is — accept a proof when the NAMED test fails at the
assertion about the row's fact, whatever matcher your test used, and record the diagnostic you
actually saw; it is a stop only when the named test passes, does not run, or fails about a different
fact. Every fault location names the function and the exact expression; where two similar
expressions exist, say which.

### 2.3 Implementation

- [ ] Before this slice's implementation, add `import ts from 'typescript';` to `template.ts`.
      Replace the existing `lineComments` JSDoc and implementation with the following code, and
      delete `endOfQuoted`. Keep `taggedValues` unchanged. Include tokens through
      `getChildren(source)`; do not substitute `forEachChild`. Syntax refusal remains the existing
      `importSpecifiers` boundary. Add no unobserved `Proof:` comment; P24 remains pending slice 3.
      This edit belongs to this slice and its handover, not slice 1's.

  ```ts
  /**
   * Returns actual line comments in source order, including comments inside template interpolations.
   * Traversing tokens includes comments in otherwise empty blocks; literal text is never scanned.
   */
  export function lineComments(text: string): string[] {
    const source = ts.createSourceFile(
      'declarations.ts',
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const comments = new Map<number, string>();

    function collect(ranges: readonly ts.CommentRange[] | undefined): void {
      for (const range of ranges ?? []) {
        if (range.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
          comments.set(range.pos, text.slice(range.pos, range.end));
        }
      }
    }

    function visit(node: ts.Node): void {
      collect(ts.getLeadingCommentRanges(text, node.getFullStart()));
      collect(ts.getTrailingCommentRanges(text, node.getEnd()));
      for (const child of node.getChildren(source)) visit(child);
    }

    visit(source);
    return [...comments].sort(([left], [right]) => left - right).map(([, comment]) => comment);
  }
  ```

- [ ] Replace apps/wiki/cli/src/templates/verify.ts with **exactly** section 6.5.
- [ ] Rerun the focused templates file. Expected: the recorded count plus 18, 0 fail.
- [ ] Run `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`. This slice introduces the
      file's types, so the type check belongs to it. Expected: exit 0.

### 2.4 Slice 2 verification, record and formatting

Section 1.8's table, with the focused templates file at the recorded count plus 18 and the
candidate-reader file at its own recorded count, and with these steps, which are this slice's own:

- [ ] Tick **only slice 2's** boxes in tasks.md and write this slice's commands, statuses and
      decisive lines into verify.md, leaving every earlier slice's rows as they are. Evidence
      references in verify.md are basenames relative to the attempt's evidence directory (for
      example `P24.log`), never absolute clone or temporary paths: the record is published.
- [ ] Format this slice's own files, run `NX_DAEMON=false bunx nx format:check --all`, then compare
      `git status --short --untracked-files=all` with section 2.7's list.

### 2.5 Slice 2 stop conditions

1. The slice 1 tests do not pass before any edit, or more than the five named tests pass in the red
   run.
2. The type check reports an error section 6.5 does not contain, which would mean the file was not
   copied exactly.

### 2.6 Slice 2's helpers and tests

The block below is written with its imports first for readability: **merge them into the file's
existing import block at the top**. `join`, `Buffer`, `describe`, `expect` and `test` are already
imported from slice 1; this block adds `node:fs`, `node:os`, `dirname` from `node:path` and
`afterEach` from `bun:test`. The two pure tests use `await import('./verify')` **on purpose**: a
static named import of `verifyArtifact` makes Bun refuse the whole file while slice 1's module does
not export it, and the red run of section 2.2 would then run no test at all (fact 28).

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import { afterEach } from 'bun:test';

const scratchRoots: string[] = [];

afterEach(() => {
  for (const root of scratchRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  expect(invocation.exitCode, invocation.stderr.toString('utf8')).toBe(0);
  return invocation.stdout.toString('utf8').trim();
}

function write(root: string, path: string, source: string): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, 'utf8');
}

const conformingReadme = `# Widget

One sentence on the value this module delivers.

## What it owns

- The widget gesture.

## What it does not own

- The widget's stored shape.

## Relationships

The exported types are in \`contract.ts\`.

## Checks

The \`test\` target runs \`widget.feature.test.ts\`.
`;

const conformingFeature = `import type { Widget } from './contract';

/** One gesture. */
// @capability widget-editing
export function createWidget(): Widget {
  return { ready: true };
}
`;

const conformingRepository = `/** Raw access to the store. */
// @port ./contract#WidgetPort
export function store(): void {}
`;

function initFixture(prefix: string): string {
  const repository = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(repository);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'templates@example.test']);
  runGit(repository, ['config', 'user.name', 'Templates Fixture']);
  return repository;
}

/** Commits whatever the test has just written and returns the new revision. */
function commit(repository: string, message: string): string {
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', message]);
  return runGit(repository, ['rev-parse', 'HEAD']);
}

/**
 * A module directory that satisfies every requirement of every template.
 *
 * `helper.ts` is a plain support file: it declares no kind by its suffix and no declaration tag,
 * so it satisfies every module-scope constraint and exists only so slice 4's malformed-support-file
 * test has a support file to corrupt.
 */
function createConformingCandidate(): { repository: string; revision: string } {
  const repository = initFixture('twilight-templates-');
  write(repository, 'src/modules/widget/README.md', conformingReadme);
  write(
    repository,
    'src/modules/widget/contract.ts',
    'export interface Widget {\n  readonly ready: boolean;\n}\n',
  );
  write(repository, 'src/modules/widget/widget.feature.ts', conformingFeature);
  write(repository, 'src/modules/widget/store.repository.ts', conformingRepository);
  write(
    repository,
    'src/modules/widget/store.repository.test.ts',
    "import { test } from 'bun:test';\ntest('adapter', () => {});\n",
  );
  write(
    repository,
    'src/modules/widget/widget.feature.test.ts',
    "import { test } from 'bun:test';\ntest('gesture', () => {});\n",
  );
  write(repository, 'src/modules/widget/helper.ts', 'export function helper(): void {}\n');
  write(repository, 'src/modules/widget/view/use-widget.ts', 'export const view = 1;\n');
  return { repository, revision: commit(repository, 'fixture') };
}

interface Verification {
  schemaVersion: number;
  templateId: string;
  templateVersion: string;
  subject: string;
  conforms: boolean;
  findings: { requirementId: string; path: string; message: string }[];
  certifies: boolean;
}

function verificationOf(invocation: ReturnType<typeof Bun.spawnSync>): Verification {
  return JSON.parse(stdoutOf(invocation)) as Verification;
}

function verify(
  templateId: string,
  repository: string,
  revision: string,
  subject: string,
): ReturnType<typeof Bun.spawnSync> {
  return runCli(['template', 'verify', templateId, 'committed', repository, revision, subject]);
}

describe('template verify, one file', () => {
  test('allows a repository adapter that names its port and has its sibling test', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = verify(
      'repository',
      repository,
      revision,
      'src/modules/widget/store.repository.ts',
    );
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verificationOf(invocation)).toEqual({
      schemaVersion: 1,
      templateId: 'repository',
      templateVersion: '1.0.0',
      subject: 'src/modules/widget/store.repository.ts',
      conforms: true,
      findings: [],
      certifies: false,
    });
  }, 30_000);

  test('reports a file whose name lacks the kind suffix', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/contract.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'feature.suffix',
        path: 'src/modules/widget/contract.ts',
        message: 'file name does not end in .feature.ts',
      },
      {
        requirementId: 'feature.capability',
        path: 'src/modules/widget/contract.ts',
        message: 'file states 0 @capability tags, expected exactly 1',
      },
    ]);
  }, 30_000);

  test('reports a service that states two declaration tags', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.feature.ts',
      `${conformingFeature}// @capability widget-sharing\n`,
    );
    const revision = commit(repository, 'two capabilities');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'feature.capability',
        path: 'src/modules/widget/widget.feature.ts',
        message: 'file states 2 @capability tags, expected exactly 1',
      },
    ]);
  }, 30_000);

  test('counts a declaration tag only when it is a real line comment', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.feature.ts',
      `const quoted = \`\n// @capability quoted-widget\n\`;\n/*\n// @capability commented-widget\n*/\nexport const sample = quoted;\n`,
    );
    const revision = commit(repository, 'tags that are not declarations');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'feature.capability',
        path: 'src/modules/widget/widget.feature.ts',
        message: 'file states 0 @capability tags, expected exactly 1',
      },
    ]);
  }, 30_000);

  test('does not count a fake declaration inside a nested template literal', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.feature.ts',
      `const quoted = \`outer \${\`\n// @capability fake\n\`} tail\`;\nexport const sample = quoted;\n`,
    );
    const revision = commit(repository, 'a fake tag inside a nested template');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'feature.capability',
        path: 'src/modules/widget/widget.feature.ts',
        message: 'file states 0 @capability tags, expected exactly 1',
      },
    ]);
  }, 30_000);

  test('counts a genuine declaration inside a template interpolation', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.feature.ts',
      `import type { Widget } from './contract';\n\nconst label = \`outer \${(() => {\n// @capability widget-editing\nreturn 'inner';\n})()} tail\`;\nexport function createWidget(): Widget {\n  return { ready: true };\n}\n`,
    );
    const revision = commit(repository, 'a real declaration inside an interpolation');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verificationOf(invocation).findings).toEqual([]);
  }, 30_000);

  test('reports a side-effect import of a repository and ignores comments and strings', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.feature.ts',
      `import './store.repository';\n// import { store } from './other.repository';\nconst sample = "from './third.repository'";\n${conformingFeature}export const used = sample;\n`,
    );
    const revision = commit(repository, 'a side-effect import');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'feature.no-repository-import',
        path: 'src/modules/widget/widget.feature.ts',
        message: 'the file imports ./store.repository, which declares the repository kind',
      },
    ]);
  }, 30_000);

  test('reports a resource that imports a feature and a repository that imports a resource', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.resource.ts',
      "import { createWidget } from './widget.feature';\n/** A resource. */\n// @term widget\nexport const widget = createWidget;\n",
    );
    write(
      repository,
      'src/modules/widget/store.repository.ts',
      `import { widget } from './widget.resource';\n${conformingRepository}export const held = widget;\n`,
    );
    const revision = commit(repository, 'forbidden imports');
    const resource = verify(
      'resource-service',
      repository,
      revision,
      'src/modules/widget/widget.resource.ts',
    );
    expect(resource.exitCode).toBe(1);
    expect(verificationOf(resource).findings).toEqual([
      {
        requirementId: 'resource.no-feature-import',
        path: 'src/modules/widget/widget.resource.ts',
        message: 'the file imports ./widget.feature, which declares the feature kind',
      },
    ]);
    const adapter = verify(
      'repository',
      repository,
      revision,
      'src/modules/widget/store.repository.ts',
    );
    expect(adapter.exitCode).toBe(1);
    expect(verificationOf(adapter).findings).toEqual([
      {
        requirementId: 'repository.no-service-import',
        path: 'src/modules/widget/store.repository.ts',
        message: 'the file imports ./widget.resource, which declares the resource kind',
      },
    ]);
  }, 30_000);

  test('reports a repository adapter with no sibling test', () => {
    const { repository } = createConformingCandidate();
    rmSync(join(repository, 'src/modules/widget/store.repository.test.ts'));
    const revision = commit(repository, 'drop the conformance test');
    const invocation = verify(
      'repository',
      repository,
      revision,
      'src/modules/widget/store.repository.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'repository.conformance-test',
        path: 'src/modules/widget/store.repository.ts',
        message: 'no sibling store.repository.test.ts proves this file',
      },
    ]);
  }, 30_000);

  test('reports a standalone file whose name declares two kinds', () => {
    const { repository } = createConformingCandidate();
    write(repository, 'src/modules/widget/widget.feature.resource.ts', conformingFeature);
    const revision = commit(repository, 'two kinds in one name');
    const invocation = verify(
      'resource-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.resource.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings.map((finding) => finding.requirementId)).toEqual([
      'resource.one-kind',
      'resource.term',
    ]);
  }, 30_000);

  test('refuses a file that does not parse', () => {
    const { repository } = createConformingCandidate();
    write(repository, 'src/modules/widget/widget.feature.ts', 'import { a } from ;;;\n');
    const revision = commit(repository, 'unparsable');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'cannot scan the imports of src/modules/widget/widget.feature.ts',
    );
    expect(stdoutOf(invocation)).toBe('');
  }, 30_000);

  test('refuses a candidate file that is not UTF-8', () => {
    const { repository } = createConformingCandidate();
    writeFileSync(
      join(repository, 'src/modules/widget/widget.feature.ts'),
      Buffer.from([0x2f, 0x2f, 0x20, 0xff, 0x0a]),
    );
    const revision = commit(repository, 'invalid bytes');
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'candidate file src/modules/widget/widget.feature.ts is not UTF-8',
    );
  }, 30_000);

  test('refuses a subject that selects nothing', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = verify(
      'feature-service',
      repository,
      revision,
      'src/modules/widget/absent.feature.ts',
    );
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'subject selects no candidate file: src/modules/widget/absent.feature.ts',
    );
  }, 30_000);

  test('refuses a subject that is not candidate-relative', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = verify('feature-service', repository, revision, '/etc/passwd');
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'subject must be a candidate-relative path: /etc/passwd',
    );
  }, 30_000);

  test('refuses a file template pointed at a directory', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = verify('feature-service', repository, revision, 'src/modules/widget');
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'template feature-service verifies one file; src/modules/widget is not one',
    );
  }, 30_000);

  test('refuses an unknown candidate selection kind', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = runCli([
      'template',
      'verify',
      'feature-service',
      'bogus',
      repository,
      revision,
      'src/modules/widget/widget.feature.ts',
    ]);
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain('usage: twilight-bureaucrat template <list|show');
    expect(stdoutOf(invocation)).toBe('');
  }, 30_000);
});

describe('the template record drives verification', () => {
  const probeFile = {
    path: 'a/b.feature.ts',
    relativePath: 'b.feature.ts',
    text: 'export const value = 1;\n',
  };
  const probeTemplate = {
    id: 'feature-service',
    version: '9.9.9',
    subject: 'file',
    generates: 'a probe',
    files: [],
    requirements: [
      {
        id: 'probe.tag',
        statement: 'the probe names one capability',
        rules: [],
        constraint: { kind: 'declares-one', tag: 'capability' },
      },
    ],
  } as const;

  test('evaluates exactly the requirements the template states', async () => {
    const { verifyArtifact } = await import('./verify');
    expect(verifyArtifact(probeTemplate, probeFile.path, [probeFile], () => []).findings).toEqual([
      {
        requirementId: 'probe.tag',
        path: 'a/b.feature.ts',
        message: 'file states 0 @capability tags, expected exactly 1',
      },
    ]);
    expect(
      verifyArtifact({ ...probeTemplate, requirements: [] }, probeFile.path, [probeFile], () => [])
        .conforms,
    ).toBe(true);
  });

  test('refuses a requirement whose constraint no file artifact can satisfy', async () => {
    const { verifyArtifact } = await import('./verify');
    const mismatched = {
      ...probeTemplate,
      requirements: [
        {
          id: 'probe.module',
          statement: 'the probe carries an index',
          rules: [],
          constraint: { kind: 'required-file', path: 'README.md' },
        },
      ],
    } as const;
    expect(() => verifyArtifact(mismatched, probeFile.path, [probeFile], () => [])).toThrow(
      'template requirement probe.module states a required-file constraint, which no file artifact can satisfy',
    );
  });
});
```

### 2.7 Ready to commit

Commit subject: `feat(bureaucrat): verify one file against its template`.

Files: apps/wiki/cli/src/templates/verify.ts, apps/wiki/cli/src/templates/template.ts,
apps/wiki/cli/src/templates/templates.test.ts,
openspec/changes/twilight-bureaucrat-templates/tasks.md,
openspec/changes/twilight-bureaucrat-templates/verify.md.

**This slice does not touch `apps/wiki/cli/src/packaging/build.test.ts`.** Slice 1 already wrote
the full `verify` usage text into both `cli.ts`'s usage line and `bin.ts`'s help line (§6.6), and
`build.test.ts`'s `--help` assertion only checks `toContain('twilight-bureaucrat template
<list|show')` — a prefix slice 1 already satisfies. Its `template list` assertion is `toContain`
over the id list, and slice 2 registers no new template identifier. Adding the `verify` action here
changes no help text and no `--help` or `template list` output the packaging test pins; do not edit
that file in this slice.

---

## Slice 3 — the negatives for the shell and the file handlers

Starts from the committed slice 2. **This slice adds no test and changes no behaviour.** It injects
each fault, watches the named test fail, restores, and writes the adjacent `Proof:` comment.

### 3.1 Preparation

- [ ] Run section 0.6's block, then the focused templates file. Expected: the slice 2 count,
      unchanged. Record it.

### 3.2 The faults

Each was compiled and watched failing during the rehearsal; the observed failure is quoted so a
different one is recognisable as a stop.

| #   | File        | Check                                | Fault                                                                                                                                                                                                                                 | Named test                                                                      | Observed failure                                                                                                                                                                                                                                                                     |
| --- | ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2  | verify.ts   | The candidate-relative subject guard | Delete the `subject must be a candidate-relative path` throw                                                                                                                                                                          | `refuses a subject that is not candidate-relative`                              | `Expected to contain: "subject must be a candidate-relative path: /etc/passwd" Received: "subject selects no candidate file: /etc/passwd"`                                                                                                                                           |
| P3  | verify.ts   | The empty-selection refusal          | Replace the throw with `if (!mistaken) return verification(template, subject, []);` and keep the subject-kind throw for the other branch                                                                                              | `refuses a subject that selects nothing`                                        | `Expected: 1 Received: 0`                                                                                                                                                                                                                                                            |
| P4  | verify.ts   | The subject-kind refusal             | Replace the whole `mistaken` initializer with `const mistaken = false;`                                                                                                                                                               | `refuses a file template pointed at a directory`                                | `Expected to contain: "template feature-service verifies one file; …" Received: "subject selects no candidate file: src/modules/widget"`                                                                                                                                             |
| P5  | verify.ts   | The refused-verification exit status | Delete `if (!verified.conforms) process.exitCode = 1;`                                                                                                                                                                                | `reports a file whose name lacks the kind suffix`                               | `Expected: 1 Received: 0`                                                                                                                                                                                                                                                            |
| P6  | verify.ts   | The UTF-8 boundary                   | Drop `{ fatal: true }` from the `TextDecoder`                                                                                                                                                                                         | `refuses a candidate file that is not UTF-8`                                    | `Expected to contain: "candidate file … is not UTF-8" Received: ""`                                                                                                                                                                                                                  |
| P7  | template.ts | The import-scan boundary             | Replace the `catch` body with `return [];`                                                                                                                                                                                            | `refuses a file that does not parse`                                            | `Expected to contain: "cannot scan the imports of …" Received: ""` — the capability finding and exit 1 remain, only the refusal disappears                                                                                                                                           |
| P8  | verify.ts   | `name-suffix`                        | Return `[]` for the `name-suffix` case                                                                                                                                                                                                | `reports a file whose name lacks the kind suffix`                               | `toEqual` fails: one of the two expected findings is missing                                                                                                                                                                                                                         |
| P9  | verify.ts   | `one-kind-per-file`                  | Change `declaredKinds(file.path).length > 1` to `> 2` in `oneKindFindings`                                                                                                                                                            | `reports a standalone file whose name declares two kinds`                       | `toEqual` fails: `resource.one-kind` is missing                                                                                                                                                                                                                                      |
| P10 | verify.ts   | `declares-one`                       | Change `stated.length === 1` to `stated.length < 99`                                                                                                                                                                                  | `reports a service that states two declaration tags`                            | `Expected: 1 Received: 0`                                                                                                                                                                                                                                                            |
| P11 | verify.ts   | `imports-no-kind`                    | Replace `declaredKinds(specifier)` with `([] as FileKind[])`, **adding `type FileKind` to the `./template` import**, which slice 2's file does not yet have                                                                           | `reports a side-effect import of a repository and ignores comments and strings` | `Expected: 1 Received: 0`                                                                                                                                                                                                                                                            |
| P12 | verify.ts   | `sibling-test`                       | Return `[]` for the `sibling-test` case                                                                                                                                                                                               | `reports a repository adapter with no sibling test`                             | `Expected: 1 Received: 0`                                                                                                                                                                                                                                                            |
| P14 | verify.ts   | Requirement-driven evaluation        | Change `template.requirements.flatMap` to `template.requirements.slice(1).flatMap`                                                                                                                                                    | `evaluates exactly the requirements the template states`                        | `toEqual` fails: the single expected finding is missing                                                                                                                                                                                                                              |
| P22 | verify.ts   | The unknown-action refusal           | Delete the final `throw new Error(Usage);` from `writeTemplateCommand`                                                                                                                                                                | `refuses an unknown template action`                                            | `Expected: 1 Received: 0`                                                                                                                                                                                                                                                            |
| P23 | verify.ts   | The selection-kind refusal           | Replace the throw in `candidateRequest` with `return { kind: 'committed', revision };`                                                                                                                                                | `refuses an unknown candidate selection kind`                                   | `Expected: 1 Received: 0`                                                                                                                                                                                                                                                            |
| P24 | template.ts | Line-comment declaration scanning    | Replace `taggedValues`' body with the multiline regular expression over the raw source: ``new RegExp(`^[ \t]*//[ \t]*@${tag}[ \t]+(\S+)[ \t]*$`, 'gm')`` and `for (const match of text.matchAll(declaration)) values.push(match[1]);` | `counts a declaration tag only when it is a real line comment`                  | `toEqual` fails: the finding is still present, but its message changes from `"file states 0 @capability tags, expected exactly 1"` to `"file states 2 @capability tags, expected exactly 1"`, because the quoted and commented text were counted. The finding does not become empty. |

Bare `[].includes(forbidden)` does **not** compile (`TS2345`), which is why P11 casts. P11's import
addition is part of the mutation: remove it again when restoring, and `cmp` proves you did.

### 3.3 Slice 3 verification, record and formatting

- [ ] After every restore, rerun the whole focused file: the slice 2 count, 0 fail.
- [ ] Run the type check, `lint:source`, this slice's Prettier write and
      `NX_DAEMON=false bunx nx format:check --all`, and the OpenSpec validation block.
- [ ] Fill the `Observed failure` cells of P2 to P12, P14 and P22 to P24 in verify.md with what
      **you** saw, tick slice 3's boxes, and leave every other row untouched.
- [ ] Compare `git status --short --untracked-files=all` with: apps/wiki/cli/src/templates/verify.ts,
      apps/wiki/cli/src/templates/template.ts,
      openspec/changes/twilight-bureaucrat-templates/tasks.md and
      openspec/changes/twilight-bureaucrat-templates/verify.md — the two source files because the
      required `Proof:` comments change them.

### 3.4 Ready to commit

Commit subject: `test(bureaucrat): watch every file-scope template check fail`.

### 3.5 Slice 3 stop conditions

1. Any named test passes under its fault, does not fail about the row's fact (the matcher is not the
   requirement; the fact is — executor preamble rule 20), or the mutation does not compile — restore
   first, then report (section 0.4).
2. The focused file's count differs from the slice 2 count at any point.

---

## Slice 4 — the module template

Starts from the committed slice 3.

### 4.1 Preparation

- [ ] Run section 0.6's block, then the focused templates file. Expected: the slice 2 count,
      unchanged. **Record it**; this slice adds **11** tests, so it ends at that count plus 11.

### 4.2 Tests first, including two authorized edits

- [ ] Append section 4.6's describe block: 11 tests.
- [ ] Make the **two** edits this packet authorizes to existing tests, and no others. Registering a
      fourth template changes both the listing and the refusal message, and the executor may not
      leave either failing:
  - in `lists every registered template in identifier order`, the expected identifiers become
    `['feature-service', 'module', 'repository', 'resource-service']` and the expected subjects
    become `['file', 'directory', 'file', 'file']`;
  - in `refuses an unregistered template identifier and names every registered template`, the
    expected substring becomes
    `unknown template: NO-SUCH-TEMPLATE (registered: feature-service, module, repository, resource-service)`.
- [ ] Run the focused file. Let N be the focused template-test baseline recorded in §4.1. This slice
      adds eleven tests and changes the two authorized registry expectations. Expected: exit 1, N−2
      passes and thirteen failures — the eleven new tests and the two edited registry tests. On the
      committed slice 2 baseline (N = 22) this is 20 pass, 13 fail. Record the failing lines.

### 4.3 Implementation

- [ ] Apply section 6.7's two additions, in order: the module template in registry.ts, the module
      scope and its handlers in verify.ts. `template.ts` needs no edit.
- [ ] Add one line to `createConformingCandidate` in section 2.6 (and in the file): write
      `src/modules/widget/helper.ts`, a plain support file with no kind suffix and no declaration
      tag, so a malformed-support-file test has a file to corrupt. The conforming candidate still
      conforms: an unsuffixed file declares no kind and satisfies every module-scope constraint.
- [ ] Rerun the focused file. Expected: the recorded count plus 11, 0 fail — after implementation,
      N+11 passes and zero failures.
- [ ] Run `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`. This slice widens a
      discriminated union and a function's parameter type, so the type check belongs to it.
      Expected: exit 0.
- [ ] Run the packaging file, whose listing assertion is `toContain` and must still pass with four
      templates:

  ```sh
  (cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
    bun test --preload ../../../tools/test/scratch/preload.ts src/packaging/build.test.ts)
  ```

  Expected: exit 0, `0 fail`.

### 4.4 Slice 4 verification, record and formatting

Section 1.8's table, with the focused templates file at the recorded count plus 11, plus these
steps, which are this slice's own:

- [ ] Tick **only slice 4's** boxes in tasks.md and write this slice's commands, statuses and
      decisive lines into verify.md, leaving every earlier slice's rows as they are. Evidence
      references in verify.md are basenames relative to the attempt's evidence directory (for
      example `P25-contract.log`), never absolute clone or temporary paths: the record is published.
- [ ] Format this slice's own files, run `NX_DAEMON=false bunx nx format:check --all`, then compare
      `git status --short --untracked-files=all` with section 4.5's list.

### 4.5 Ready to commit

Commit subject: `feat(bureaucrat): verify a module directory against the module template`.

Files: apps/wiki/cli/src/templates/registry.ts, apps/wiki/cli/src/templates/verify.ts,
apps/wiki/cli/src/templates/templates.test.ts,
openspec/changes/twilight-bureaucrat-templates/tasks.md,
openspec/changes/twilight-bureaucrat-templates/verify.md.

### 4.6 Slice 4's tests

```ts
describe('template verify, one module', () => {
  test('allows a module that satisfies every requirement', () => {
    const { repository, revision } = createConformingCandidate();
    const invocation = verify('module', repository, revision, 'src/modules/widget');
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(verificationOf(invocation)).toEqual({
      schemaVersion: 1,
      templateId: 'module',
      templateVersion: '1.0.0',
      subject: 'src/modules/widget',
      conforms: true,
      findings: [],
      certifies: false,
    });
  }, 30_000);

  test('reports a module with no index, no contract, no kind file and no test', () => {
    const repository = initFixture('twilight-templates-bare-');
    write(repository, 'src/modules/bare/helper.ts', 'export const helper = 1;\n');
    const revision = commit(repository, 'a bare module');
    const invocation = verify('module', repository, revision, 'src/modules/bare');
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'module.readme',
        path: 'src/modules/bare',
        message: 'the module directory has no README.md',
      },
      {
        requirementId: 'module.contract',
        path: 'src/modules/bare',
        message: 'the module directory has no contract.ts',
      },
      {
        requirementId: 'module.kind-file',
        path: 'src/modules/bare',
        message: 'no file declares a kind by its suffix',
      },
      {
        requirementId: 'module.test',
        path: 'src/modules/bare',
        message: 'the module has no test file',
      },
    ]);
  }, 30_000);

  test('reports an index that omits one of its sections', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/README.md',
      conformingReadme.slice(0, conformingReadme.indexOf('\n## Checks\n') + 1),
    );
    const revision = commit(repository, 'drop a section');
    const invocation = verify('module', repository, revision, 'src/modules/widget');
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'module.readme-sections',
        path: 'src/modules/widget/README.md',
        message: 'the index omits ## Checks',
      },
    ]);
  }, 30_000);

  test('reports an index with no title', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/README.md',
      conformingReadme.replace('# Widget', 'Widget'),
    );
    const revision = commit(repository, 'drop the title');
    const invocation = verify('module', repository, revision, 'src/modules/widget');
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'module.readme-sections',
        path: 'src/modules/widget/README.md',
        message: 'the index omits its title',
      },
    ]);
  }, 30_000);

  test('reports a file that sits below the module directory', () => {
    const { repository } = createConformingCandidate();
    write(repository, 'src/modules/widget/inner/deep.ts', 'export const deep = 1;\n');
    const revision = commit(repository, 'a nested file');
    const invocation = verify('module', repository, revision, 'src/modules/widget');
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'module.layout',
        path: 'src/modules/widget/inner/deep.ts',
        message: 'the file sits neither in the module directory nor in view',
      },
    ]);
  }, 30_000);

  test('reports a module file that declares two kinds', () => {
    const { repository } = createConformingCandidate();
    write(repository, 'src/modules/widget/widget.feature.resource.ts', conformingFeature);
    const revision = commit(repository, 'two kinds in one name');
    const invocation = verify('module', repository, revision, 'src/modules/widget');
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'module.one-kind',
        path: 'src/modules/widget/widget.feature.resource.ts',
        message: 'file name declares feature and resource',
      },
    ]);
  }, 30_000);

  test('reports a kind file inside a module that breaks its own template', () => {
    const { repository } = createConformingCandidate();
    write(
      repository,
      'src/modules/widget/widget.feature.ts',
      conformingFeature.replace('// @capability widget-editing\n', ''),
    );
    const revision = commit(repository, 'drop the capability');
    const invocation = verify('module', repository, revision, 'src/modules/widget');
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'feature.capability',
        path: 'src/modules/widget/widget.feature.ts',
        message: 'file states 0 @capability tags, expected exactly 1',
      },
    ]);
  }, 30_000);

  for (const [name, path] of [
    ['refuses a module whose contract does not parse', 'src/modules/widget/contract.ts'],
    ['refuses a module whose support file does not parse', 'src/modules/widget/helper.ts'],
    [
      'refuses a module whose test file does not parse',
      'src/modules/widget/widget.feature.test.ts',
    ],
  ] as const) {
    test(
      name,
      () => {
        const { repository } = createConformingCandidate();
        write(repository, path, 'export const = ;\n');
        const revision = commit(repository, 'one malformed file');
        const invocation = verify('module', repository, revision, 'src/modules/widget');
        expect(invocation.exitCode).toBe(1);
        expect(stderrOf(invocation)).toContain('cannot scan the imports of ' + path);
        expect(stdoutOf(invocation)).toBe('');
      },
      30_000,
    );
  }

  test("observes this repository's directory module at its committed revision", () => {
    const invocation = verify(
      'module',
      join(import.meta.dir, '..', '..'),
      'HEAD',
      'apps/wbs/fe-01/src/modules/directory',
    );
    expect(invocation.exitCode).toBe(1);
    expect(verificationOf(invocation).findings).toEqual([
      {
        requirementId: 'resource.term',
        path: 'apps/wbs/fe-01/src/modules/directory/directory.resource.ts',
        message: 'file states 0 @term tags, expected exactly 1',
      },
    ]);
  }, 30_000);
});
```

The last test is the production-path observation of assumption A8: the module conforms in every
respect except the declaration tag this packet introduces. It reads `HEAD`, never the working tree,
so uncommitted work in the clone cannot change its result. `join(import.meta.dir, '..', '..')` from
`src/templates` is `apps/wiki/cli`, which `resolveCandidateRoot` resolves to the worktree root.
**If this test reports a different finding set, the `directory` module changed: record it and stop,
rather than editing the expectation.**

### 4.7 Slice 4 stop conditions

1. Any new test passes before the implementation lands, or the red run fails a test other than the
   eleven new module tests and the two authorized registry tests.
2. The observation test's finding set differs from section 3's fact 20.
3. The type check reports an error section 6.7 does not contain.

---

## Slice 5 — the negatives for the module handlers

Starts from the committed slice 4. Adds no test and changes no behaviour.

### 5.1 Preparation

- [ ] Run section 0.6's block, then the focused templates file. Expected: the slice 4 count,
      unchanged. Record it.

### 5.2 The faults

| #   | Check                                    | Fault                                                                                                                                                   | Named test                                                              | Observed failure                                                                                         |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| P13 | The scope refusal                        | Change `refuseScope`'s return annotation from `never` to `TemplateFinding[]` **and** its body to `return [];` — both, or it does not compile (`TS2322`) | `refuses a requirement whose constraint no file artifact can satisfy`   | `Received function did not throw`                                                                        |
| P15 | `required-file`                          | Return `[]` for the `required-file` case                                                                                                                | `reports a module with no index, no contract, no kind file and no test` | `toEqual` fails with **both** `module.readme` and `module.contract` missing                              |
| P16 | `index-sections`                         | Replace the `absent` initializer with `const absent: string[] = [];` — the untyped `const absent = [];` is `TS7034`/`TS7005`                            | `reports an index that omits one of its sections`                       | `Expected: 1 Received: 0`; `reports an index with no title` fails with it, which is recorded, not a stop |
| P17 | `kind-file-present`                      | Return `[]` for that case                                                                                                                               | `reports a module with no index, no contract, no kind file and no test` | `toEqual` fails with `module.kind-file` missing                                                          |
| P18 | `test-present`                           | Return `[]` for that case                                                                                                                               | `reports a module with no index, no contract, no kind file and no test` | `toEqual` fails with `module.test` missing                                                               |
| P19 | `files-stay-in-module`                   | Replace the filter's condition with `segments.length > 3`                                                                                               | `reports a file that sits below the module directory`                   | `Expected: 1 Received: 0`                                                                                |
| P20 | The module wiring of `one-kind-per-file` | Pass `[]` instead of `files` to `oneKindFindings` in `moduleFindings`                                                                                   | `reports a module file that declares two kinds`                         | `Expected: 1 Received: 0`                                                                                |
| P21 | Delegation to the kind templates         | Insert `.slice(0, 0)` after `kindFilesOf(files)` in the delegation case                                                                                 | `reports a kind file inside a module that breaks its own template`      | `Expected: 1 Received: 0`                                                                                |
| P25 | The whole-file parse boundary            | Delete `if (path.endsWith('.ts')) importSpecifiers(text, path);` from `decodeArtifact`                                                                  | three titles — see the note below                                       | `Expected: 1 Received: 0` for each — the module verifies as conforming                                   |

P15, P17 and P18 name the same test, which asserts the whole finding list; each fault removes a
different part of it, and the failing output names which. Record all three separately.

P25 names three tests, not one: `refuses a module whose contract does not parse`, `refuses a module
whose support file does not parse` and `refuses a module whose test file does not parse`. After
injecting the one fault, compile it, save `P25.patch`, and run each title **separately** with `-t`
using the test title alone — never Bun's printed `>` describe-plus-title form. Each invocation must
select exactly one test and fail because the malformed module was accepted: Bun 1.4.2 reports
`Expected: 1` / `Received: 0`. Save the three outputs as `P25-contract.log`, `P25-support.log` and
`P25-test.log`. Restore the saved bytes, `cmp` them, and rerun the whole focused file green before
writing the adjacent `Proof:` comment, which names all three observed failures. A boundary that skips
parsing only `.test.ts` files must still fail the independent test-file case; if it does not, the
boundary is still too narrow and the packet, not the test, is wrong.

### 5.3 Slice 5 verification, record and formatting

- [ ] After every restore, rerun the whole focused file: the slice 4 count, 0 fail.
- [ ] Run the type check, `lint:source`, this slice's Prettier write and
      `NX_DAEMON=false bunx nx format:check --all`, and the OpenSpec validation block.
- [ ] Fill the `Observed failure` cells of **P13, P15 to P21 and P25** in verify.md with what you
      saw — P25's cell records all three observations, `P25-contract.log`, `P25-support.log` and
      `P25-test.log` — tick **slice 5's** boxes in tasks.md, and leave every earlier row untouched.
      Evidence references in verify.md are basenames relative to the attempt's evidence directory,
      never absolute clone or temporary paths: the record is published.
- [ ] Compare `git status --short --untracked-files=all` with: apps/wiki/cli/src/templates/verify.ts,
      openspec/changes/twilight-bureaucrat-templates/tasks.md and
      openspec/changes/twilight-bureaucrat-templates/verify.md.

### 5.4 Ready to commit

Commit subject: `test(bureaucrat): watch every module-scope template check fail`.

### 5.5 Slice 5 stop conditions

1. Any named test passes under its fault, does not fail about the row's fact (the matcher is not the
   requirement; the fact is — executor preamble rule 20), or the mutation does not compile — restore
   first, then report.
2. The focused file's count differs from the slice 4 count.

---

## Slice 6 — README, record and format

Starts from the committed slice 5. **Record only what this attempt observes.** Earlier slices ran in
their own clones, and their evidence lives outside every repository. Write
`pending planner transcription` into any proof cell this attempt did not observe, and never
reconstruct a failing line from a `Proof:` comment in the source.

### 6.1 Preparation

- [ ] Run section 0.6's block, then:

  ```sh
  (cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
    bun test --preload ../../../tools/test/scratch/preload.ts src/templates/templates.test.ts)
  if grep -q '^## Templates' "$repo_root/apps/wiki/cli/README.md"; then
    echo 'Templates section already exists; stop.' >&2; exit 1
  else
    status=$?
    test "$status" -eq 1 || { echo "grep failed with $status" >&2; exit "$status"; }
  fi
  ```

  Expected: the focused file at the slice 5 count, and `grep` exiting 1 for "no match". This slice
  adds no test, so the count must not move.

### 6.2 The README

- [ ] Append a `## Templates` section to apps/wiki/cli/README.md, after the last existing section,
      saying: which four templates ship; that `template list` and `template show` print them and
      that Twilight Dash instantiates the same record Twilight Bureaucrat verifies; that each
      requirement carries the constraint that checks it, so a template stating no requirement checks
      nothing; that `template verify` reads one artifact out of a Git revision, parses every
      TypeScript file it selects, never certifies, and exits 1 on a finding; that a service file
      declares its capability, glossary term or port in a line comment, `// @capability <id>`,
      because an unknown JSDoc tag fails `jsdoc/check-tag-names`, and that text that only looks like
      one inside a string or a block comment does not count; and that a type-only import and the
      module index envelope are stated deferrals (assumptions A9 and A10). The README is this
      project's module index and its memberships already carry the `src` directory prefix, so no
      membership changes.

### 6.3 The record

- [ ] Add a `### Slice 6` subsection under `## Commands and results` in verify.md with the real
      output of every command in section 6.4.
- [ ] Fill any empty `Observed failure` cell with `pending planner transcription` and add one
      sentence saying the earlier slices' observed output is in their attempts' log directories
      outside this repository.
- [ ] State in verify.md which checks this attempt did not run and why.
- [ ] Tick **only slice 6's** boxes in tasks.md.

### 6.4 Slice 6 verification

| Command                                                                                                       | Expected exit status and decisive line                                |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `(cd "$repo_root/apps/wiki/cli" && … bun test … src/templates/templates.test.ts src/packaging/build.test.ts)` | Exit 0, `0 fail`; the templates file at the slice 5 count, unchanged. |
| `(cd "$repo_root/apps/wiki/cli" && … bun test … src/rules/rules.test.ts)`                                     | Exit 0; unchanged.                                                    |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`                                                   | Exit 0; `Successfully ran target typecheck`.                          |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`                                                 | Exit 0, no warnings.                                                  |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:build`                                                       | Exit 0; `dist/bin.mjs` and `dist/toolkit/validator.mjs` rebuilt.      |
| `bunx prettier --write <this slice's files>` then `NX_DAEMON=false bunx nx format:check --all`                | Both exit 0. Never a repository-wide write.                           |
| The batch README's **OpenSpec validation** block                                                              | Exit 0; one JSON report kept under `$TMPDIR/evidence`.                |

**Not run here, and why.** `twilight-bureaucrat:test`, `twilight-bureaucrat:test:package` and
`tool-devsync:test` as whole targets, and anything needing staged files or Git writes into this
clone: preamble rule 4a, pending planner verification. `bin/h2puni-gate.sh`: cannot run on this
machine (preamble rule 5).

**What none of it proves.** No provisioned activation is configured in this clone. The three new
source files join the validator's import closure and change the validator identity; no test pins
that identity as a literal (section 0.5), but an activation prepared outside this clone must be
prepared again. No template requirement is enforced anywhere in the gate: `template verify` is a
command a caller runs, and nothing calls it yet. A type-only import, a regular-expression literal
containing two adjacent slashes, and a missing module index envelope are outside what this slice
checks, by assumptions A9, A10 and A11.

### 6.5 Ready to commit

Commit subject: `docs(bureaucrat): describe the templates and record their verification`.

Files: apps/wiki/cli/README.md, openspec/changes/twilight-bureaucrat-templates/tasks.md,
openspec/changes/twilight-bureaucrat-templates/verify.md.

### 6.6 Slice 6 stop conditions

1. `## Templates` already exists in apps/wiki/cli/README.md.
2. The template test count moves from the slice 5 count.
3. `nx format:check --all` fails on a file this packet does not own — report it, never fix it.

---

## 8. Negative proofs, all slices

Every check this packet adds appears here exactly once. **Every fault below was applied, compiled
with `twilight-bureaucrat:typecheck`, run with its `-t` pattern, watched failing its named test,
restored and rerun green** during the planner's rehearsal on 2026-09-20; sections 3.2 and 5.2 quote
what was observed.

| #   | Slice | Check                                | Fault injected                                                     |
| --- | ----- | ------------------------------------ | ------------------------------------------------------------------ |
| P1  | 1     | Unknown template refusal             | Return the first registered template                               |
| P2  | 3     | Candidate-relative subject guard     | Delete the guard                                                   |
| P3  | 3     | Empty-selection refusal              | Return a finding-free verification for that branch                 |
| P4  | 3     | Subject-kind refusal                 | `const mistaken = false;`                                          |
| P5  | 3     | Refused-verification exit status     | Delete `process.exitCode = 1`                                      |
| P6  | 3     | UTF-8 boundary                       | Drop `{ fatal: true }`                                             |
| P7  | 3     | Import-scan boundary                 | `catch { return []; }`                                             |
| P8  | 3     | `name-suffix`                        | Return `[]` for that case                                          |
| P9  | 3     | `one-kind-per-file`                  | `length > 2`                                                       |
| P10 | 3     | `declares-one`                       | `stated.length < 99`                                               |
| P11 | 3     | `imports-no-kind`                    | `([] as FileKind[]).includes(forbidden)`, with the import it needs |
| P12 | 3     | `sibling-test`                       | Return `[]` for that case                                          |
| P13 | 5     | Scope refusal                        | `TemplateFinding[]` annotation and `return [];`                    |
| P14 | 3     | Requirement-driven evaluation        | `template.requirements.slice(1)`                                   |
| P15 | 5     | `required-file`                      | Return `[]` for that case                                          |
| P16 | 5     | `index-sections`                     | `const absent: string[] = [];`                                     |
| P17 | 5     | `kind-file-present`                  | Return `[]` for that case                                          |
| P18 | 5     | `test-present`                       | Return `[]` for that case                                          |
| P19 | 5     | `files-stay-in-module`               | `segments.length > 3`                                              |
| P20 | 5     | Module wiring of `one-kind-per-file` | Pass `[]` instead of `files`                                       |
| P21 | 5     | Delegation to the kind templates     | `.slice(0, 0)` before the delegation                               |
| P22 | 3     | Unknown-action refusal               | Delete the writer's final `throw`                                  |
| P23 | 3     | Selection-kind refusal               | Return `{ kind: 'committed', revision }` for an invalid kind       |
| P24 | 3     | Line-comment declaration scanning    | Scan the raw source with a multiline regular expression            |
| P25 | 5     | Whole-file parse boundary            | Delete the `.ts` parse in `decodeArtifact`                         |

## 9. OpenSpec

The change is `twilight-bureaucrat-templates`, schema `sdd-lean`, capability
`bureaucrat-templates`. It is required: the package gains a command, a record and a conformance
contract, which is observable behaviour.

**Intent, for proposal.md** (fewer than 400 words when written out): Twilight Bureaucrat holds the
templates for the artifacts the system generates, but has none. A generator and a validator that
each carry their own idea of a module drift, and an agent has nowhere to read what a module must
contain. This change adds a registry of four templates — module, feature-service, resource-service
and repository — each carrying the skeleton a generator instantiates and the machine-readable
constraints its output must satisfy, and three routes that list them, show one, and verify one
artifact out of a Git revision. The verifier evaluates exactly the constraints the registry states
and nothing else, decodes and parses every TypeScript file it selects before judging it, and reads
declarations only from real line comments. Verification is pure, narrower than the direction rules
by design, never certifies, and enforces nothing in the gate. A service file declares its
capability, glossary term or port in a line comment, because an unknown JSDoc tag fails lint. Two
limits are stated rather than hidden: a purely type-only import is invisible to the import scanner,
and the module README skeleton carries no wiki index envelope, because no module in the repository
has one yet. Non-goals: no rule, no mode, no policy field, no consumer override, no generation, and
no edit to any existing service.

**The nine requirements**, each with at least one scenario carrying real `GIVEN`, `WHEN` and `THEN`
bullets:

1. **The registry lists and shows templates.** Stable identifiers, a version and a subject kind; an
   unregistered identifier and an unknown action are refused, and every registered identifier is
   named.
2. **A template carries the skeleton a generator instantiates.** `show` prints the prescribed files
   with their content, so the generator and the validator read one record.
3. **A template carries the constraints that check it.** Verification evaluates exactly the
   requirements the template states: a template stating none reports nothing, and a requirement
   whose constraint the artifact's scope cannot satisfy is refused, not ignored.
4. **A module declares its shape.** A module directory carries a README index with a title and its
   four sections, a contract file, at least one kind file and at least one test. The index envelope
   the wiki validator reads is **not** part of this template yet, and this requirement says so.
5. **A module's files stay in the module.** Every file sits in the module directory or its `view`
   directory, and every kind file in it satisfies the template of its own kind.
6. **A file declares exactly one kind**, by its suffix, whether it is judged inside a module or on
   its own.
7. **A service names its domain owner.** A feature-service states exactly one capability, a
   resource-service exactly one glossary term, a repository adapter exactly one port, each once, in
   a real line comment — text inside a string or a block comment is not a declaration — and a
   repository adapter has a test beside it.
8. **The template's direction checks refuse the forbidden import.** A feature importing a
   repository, a resource importing a feature and a repository importing either are reported, from
   parsed import syntax, including a side-effect import and excluding import text in a comment or a
   string. A purely type-only import is out of scope and the requirement states that limit.
9. **Verification is bounded and honest.** It reads one revision, never certifies, exits 1 on a
   finding, and refuses an absent subject, a wrong subject kind, a path that is not
   candidate-relative, an unknown selection kind, a file that is not UTF-8 and **any** selected
   TypeScript file that does not parse, rather than defaulting any of them.

## 10. Out of lane

- Every file under `apps/wiki/cli/src/rules/`: packet 010.7 owns them, and its evidence lives in
  `openspec/changes/twilight-bureaucrat-kind-rules/`.
- `docs/code-organization/kinds.json` and `docs/code-organization/README.md`: 020.8's.
- `eslint.config.js`: no declaration tag is added to `definedTags`; the line-comment form exists
  precisely so the root configuration does not change.
- Any file under `apps/wbs/`: no service gains a tag in this packet (assumption A8).
- `openspec/changes/service-taxonomy/`: 010.3 created it and no slice here writes to it.
- `tools/tool-devsync/` and `nx.json`: no pin moves and no Nx target is added (section 0.2).

## Review dispositions

### First review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

Every finding was checked against the worktree before it was accepted or rejected. Where a finding
said a proof could not produce its stated failure, the mutation was run in a scratch copy under
`TMPDIR` and the result recorded.

| Finding                                                             | Disposition            | What changed                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 the launcher cannot dispatch a batch-2 packet                    | **Fixed** (confirmed)  | `run-executor.sh` does build `docs/superpowers/plans/2026-09-19-batch-1/<packet>.md` and branch `batch-1/<packet>`. Section 0.0 makes the launcher update a planner-side dispatch prerequisite and requires the working command to be recorded.                                                                                                                                                                               |
| C2 the non-conforming test destructures an unused `revision`        | **Fixed** (confirmed)  | Every fixture mutation now goes through a `commit()` helper that returns the new revision, so no binding is unused.                                                                                                                                                                                                                                                                                                           |
| C3 the prescribed test totals are wrong                             | **Fixed** (confirmed)  | Recounted: slice 1 adds 4, slice 2 adds 13 or 14, slice 4 adds 8, slices 3, 5 and 6 add none except the one test that may move to slice 5. Every count is now "the number you recorded at this slice's start, plus this slice's additions".                                                                                                                                                                                   |
| C4 the P6 fault does not type-check                                 | **Fixed** (reproduced) | `[].includes(forbidden)` gave `TS2345` in the scratch copy. The fault is now `([] as FileKind[]).includes(forbidden)`, which compiles and does make the finding vanish (fact 29). Section 0.4 now requires compiling every mutation before running its test.                                                                                                                                                                  |
| C5 several checks have no R5 negative                               | **Fixed** (confirmed)  | The verifier is now one handler per constraint kind, and section 8 has one watched fault per handler plus one per shell boundary: 21 proofs, each with a named test.                                                                                                                                                                                                                                                          |
| I1 the import scan misidentifies imports                            | **Fixed** (reproduced) | The regular expression missed `import './x.repository';` and matched commented-out and quoted text. `importSpecifiers` now uses `Bun.Transpiler.scanImports`, the scanner `trust.ts` already trusts; a parse failure throws; the type-only gap is recorded as assumption A10 and written into the delta spec.                                                                                                                 |
| I2 a standalone template bypasses the single-kind rule              | **Fixed** (reproduced) | `template verify resource-service … widget.feature.resource.ts` did return `conforms: true`. Each kind template now carries a `one-kind-per-file` requirement, and fact 24 records the two findings it now produces.                                                                                                                                                                                                          |
| I3 the template record is not the verifier's source of requirements | **Fixed**              | `TemplateRequirement` now carries a `TemplateConstraint`, and the verifier evaluates exactly the template's own requirement list. Fact 28 records a one-requirement template producing one finding and an empty one producing none; P14 is its watched fault, and P13 proves the refusal of a constraint the scope cannot satisfy.                                                                                            |
| I4 the skeletons omit the index envelope and the port               | **Partly**             | The port is fixed: the repository template now ships `contract.ts` with a port skeleton, and the adapter's `@port` tag points at it. The index envelope is **rejected as a requirement and recorded as a bounded deferral**: no Markdown file under `apps/wbs/fe-01` carries a `module-index` comment (fact 9), so prescribing one would make every real module non-conforming. Assumption A9 and delta requirement 4 say so. |
| I5 implementation precedes its tests                                | **Fixed**              | Six slices: each implementation slice writes its tests first and watches them fail, the packaging assertions precede the dispatcher edits, and the two proof slices add no test at all.                                                                                                                                                                                                                                       |
| I6 three process-spawning tests lack timeouts                       | **Fixed** (confirmed)  | Every test that starts Git or the command line now carries `30_000`, and section 0.2 states the rule as mechanical.                                                                                                                                                                                                                                                                                                           |
| I7 the baseline commands mask errors                                | **Fixed** (confirmed)  | Section 1.1 now uses an explicit existence check and inspects `grep`'s status, accepting 1 only as "no match"; the search is the usage string, not every occurrence of the word.                                                                                                                                                                                                                                              |
| I8 evidence and formatting do not match the handover lists          | **Fixed**              | Every slice ends with its own task ticks, its own verify.md rows, its own Prettier write, the repository-wide format check, and a `git status` check against its own path list. The proof slices list the source files their `Proof:` comments change.                                                                                                                                                                        |
| M1 "DI Bag is not installed" is false                               | **Fixed** (confirmed)  | `package.json` pins `di-bag` 0.4.0. Fact 8 and assumption A7 now say it is installed and **unadopted**, and base the deferral on adoption.                                                                                                                                                                                                                                                                                    |
| M2 the ownership claims disagree with 010.7                         | **Fixed** (confirmed)  | 010.7 states it owns zero lines of both dispatchers and keeps its evidence in `twilight-bureaucrat-kind-rules`. Section 5.1 now says 010.6 owns both dispatchers and the packaging test outright, the README is the only shared file, and section 10 names the right evidence directory.                                                                                                                                      |
| M3 inaccurate internal references                                   | **Fixed**              | The test sections are cited by their own numbers, the observation test's path is `join(import.meta.dir, '..', '..')` with what it resolves to stated, `verify.ts` is "slice 1 creates, slices 2 and 4 extend", and no devsync line number is pinned at all (section 0.2).                                                                                                                                                     |
| M4 the ownership table is malformed by literal pipes                | **Fixed** (confirmed)  | The dispatcher edits, which contain `\|`, moved out of the table into section 6.6.                                                                                                                                                                                                                                                                                                                                            |

Two facts the coordinator supplied on 2026-09-20 are also carried: counts stay relative because main
has moved and batch 1 has taken that merge, and this packet adds **no** Nx target, so the
`CLAUDECODE=0` and `AGENT=0` defaults that `workspace-targets.test.ts` requires of a test-running
target are untouched (section 0.2).

### Second review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

This revision was **rehearsed slice by slice in a throwaway worktree cut from this branch**, which
was removed afterwards. Every red run, green run, type check, lint, format check and fault below was
executed there; the shared planning worktree was never used for execution.

| Finding                                                               | Disposition            | What changed in the steps, the code and the tables                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 the red run cannot register its tests (static import)              | **Fixed** (reproduced) | The two pure tests now use `await import('./verify')` inside the test body (§2.6, fact 28). Rehearsed: slice 2's red run reads 5 pass, 17 fail instead of refusing the file.                                                                                                                                                        |
| C2 registering `module` breaks an assertion the executor may not edit | **Fixed** (reproduced) | §4.2 now authorizes and prescribes **two** edits — the listing expectation and the unknown-template message — and states the red run as 20 pass, 11 fail, which the rehearsal observed.                                                                                                                                             |
| C3 P13's mutation cannot compile                                      | **Fixed** (reproduced) | `return [];` alone is `TS2322`. §5.2 prescribes changing the annotation to `TemplateFinding[]` **and** the body; compiled and watched failing with `Received function did not throw`. §8's claim is now "compiled during the rehearsal", per fault.                                                                                 |
| C4 P16's mutation fails strict compilation                            | **Fixed** (reproduced) | `const absent = [];` is `TS7034`/`TS7005`. §5.2 prescribes `const absent: string[] = [];`, compiled and watched failing.                                                                                                                                                                                                            |
| I1 the optional scope test is deterministically deferred              | **Fixed**              | The complete constraint union now lands in slice 1 (§6.2, §1.4), so the scope test compiles and fails in slice 2's red run. The compiler-dependent branch and the slice-5 arrival are gone; slice 2's addition is a fixed 18.                                                                                                       |
| I2 declaration text in strings and block comments counts              | **Fixed** (reproduced) | `taggedValues` now reads real line comments through a new `lineComments` walk (§6.2). A new test, `counts a declaration tag only when it is a real line comment`, covers a template literal and a block comment; P24 is its watched fault. The regular-expression limit on regular-expression literals is assumption A11 and JSDoc. |
| I3 malformed files pass the advertised parse boundary                 | **Fixed** (reproduced) | `decodeArtifact` now parses **every** selected TypeScript file (§6.5). A new module test, `refuses a module whose contract does not parse`, covers a malformed contract and test file; P25 is its watched fault. Requirement 9 states the widened promise.                                                                          |
| I4 the proof inventory omits new refusals                             | **Fixed**              | P22 (unknown action) and P23 (invalid selection kind) join §8 and §3.2, with a new test for the selection kind. Both were compiled and watched failing.                                                                                                                                                                             |
| I5 predicted mutation outcomes are inaccurate                         | **Fixed** (reproduced) | P7 now states that the capability finding and exit 1 remain and only the stderr refusal disappears; P15 now states that **both** required-file findings vanish. Facts 32 records the observed lines.                                                                                                                                |
| I6 evidence and task updates remain ambiguous                         | **Fixed**              | §§2.4, 4.4 and 5.3 now carry their own explicit tick, record, format and `git status` steps instead of importing another slice's table wholesale.                                                                                                                                                                                   |
| I7 an unscoped stop becomes true after slice 1                        | **Fixed**              | §0.6 is the reusable preparation block; the absence checks live only in §1.1, which says so, and every later slice's preparation references §0.6 alone.                                                                                                                                                                             |
| I8 the launcher claim is stale                                        | **Fixed** (confirmed)  | §0.0 now gives the real invocation with `--batch batch-2` and requires the planner to record the command and base commit it used.                                                                                                                                                                                                   |
| I9 an invalid mutation can be left installed                          | **Fixed**              | §0.4 now requires restoring and `cmp`-comparing before **every** early exit, compilation failure included.                                                                                                                                                                                                                          |
| M1 an expected baseline was never recorded                            | **Fixed**              | §2.1 records the candidate-reader baseline as well as the templates baseline, and §2.4 compares both.                                                                                                                                                                                                                               |
| M2 slice 5 has eight proofs, not nine                                 | **Fixed**              | Slice 5 now has exactly nine, P13, P15 to P21 and the new P25, and §0.1 says nine.                                                                                                                                                                                                                                                  |
| M3 a supplied identifier violates R2                                  | **Fixed**              | `item` is renamed to `finding` in the standalone-kind test.                                                                                                                                                                                                                                                                         |

Round-one findings the second review marked PARTLY are closed above: C1 by §0.0, C5 by P22 and P23,
I5 by the six test-first slices and the two proof slices that add no test, and I8 by §§2.4, 4.4 and
5.3. Nothing is left half-answered, and no slice was cut.

### Disposition of the slice 2 dispatch review

`puni-plan/reviews-batch-2/010-6-templates.reviewS2.md` (verdict: DISPATCH AFTER FIXES) re-checked
round-one's C1–C4, I1–I9 and M1–M3 against this revision and found them still fixed, except I2 and
I3, marked PARTLY. Every finding below was checked against a real rehearsal in this clone; the
rehearsal's counts, probes, ESLint and typecheck results are recorded in the report this commit's
handover carries.

| Finding                                                                                           | Disposition                      | What changed                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1–C4, I1, I4–I9, M1–M3 (round-one, re-confirmed fixed)                                           | **Carried**                      | The review re-checked these against revision 3 and found them still fixed; this attempt made no further change to their fixes.                                                                                                                                                                                       |
| I2 the nested-template tests exist, but the parser implementation remains underspecified (PARTLY) | **Fixed**                        | §2.3's first implementation step now supplies the exact parser-based `lineComments` code (`ts.createSourceFile`, `getChildren(source)` traversal, `SingleLineCommentTrivia` only, deduplicated by position). §6.2's "Everything else…" sentence now says slice 2 replaces `lineComments` and removes `endOfQuoted`.  |
| I3 independent malformed support-file and test-file negatives remain absent (PARTLY)              | **Rejected for slice 2**         | The review itself files this against slice 4 ("this concerns slice 4"); slice 2 verifies one file and states no directory-scope constraint, so it has no support-file or test-file scope to add a negative for. No slice 2 edit follows from it.                                                                     |
| Blocking 1 — §2.2's red count is wrong (`5 pass, 15 fail`)                                        | **Fixed**                        | §2.2's expected-result paragraph, §0.2's counts bullet and the introductory rehearsal claim now read exactly as the review's replacement text: `N+1` passes and 17 failures red, `N+18` passes green, 5 pass/17 fail and 22 pass/0 fail on the committed baseline.                                                   |
| Blocking 2 — "traverse the parsed nodes" permits a `forEachChild` walk that misses real comments  | **Fixed**                        | §2.3 now names `import ts from 'typescript';`, supplies the exact `getChildren(source)`-based `lineComments`, and says `forEachChild` must not be substituted. Rehearsed in this clone: `bun -e` confirmed a comment directly before a closing brace is found by `getChildren(source)` and missed by `forEachChild`. |
| Non-blocking — slice 2 need not touch `build.test.ts`                                             | **Confirmed, stated in §2.7**    | §2.7 now states explicitly that slice 1 already wrote the full `verify` usage text into both dispatchers, so the packaging test's `--help` and `template list` assertions are unaffected; slice 2 does not touch that file.                                                                                          |
| Non-blocking — A11 and the old scanner JSDoc describe a limitation the parser rewrite removes     | **Fixed**                        | A11 in §4 now states the regular-expression-literal limit belonged only to slice 1's quote-skipping walker and that slice 2's parser-based `lineComments` does not share it.                                                                                                                                         |
| Non-blocking — P24's actual Bun 1.4.2 mismatch differs from the packet's prediction               | **Fixed**                        | §3.2's P24 row now states the finding changes from `"file states 0 @capability tags…"` to `"file states 2 @capability tags…"` rather than becoming absent.                                                                                                                                                           |
| Non-blocking — use evidence basenames in verify.md, never attempt-specific absolute paths         | **Fixed**                        | §2.4's tick/verify.md bullet now states evidence references are basenames relative to the attempt's evidence directory, never absolute clone or temporary paths.                                                                                                                                                     |
| Non-blocking — "what the planner must verify after the executor returns"                          | **Not actionable in the packet** | This is guidance for the planner's own post-attempt check, not an instruction for the executor; no packet edit follows from it.                                                                                                                                                                                      |

Rehearsal of the supplied `lineComments` code in this clone: 6/6 focused tests passed (the 4
committed slice 1 tests plus the two nested-template tests from §2.6), the closing-brace, nested-fake
and interpolation `bun -e` probes all matched the review's predictions, `bunx eslint
apps/wiki/cli/src/templates/template.ts` reported nothing, and `NX_DAEMON=false bunx nx run
twilight-bureaucrat:typecheck` exited 0. The supplied code needed no correction. The rehearsal was
fully reverted; `git status --short --untracked-files=all` showed only this packet before commit.

### Disposition of the slices 3, 4 and 5 dispatch review

`puni-plan/reviews-batch-2/010-6-templates.review345.md` (verdict: DISPATCH AFTER FIXES for slices 4
and 5) found one blocking problem and several non-blocking notes. Every finding was checked against
a real rehearsal of slice 4 in this clone; the rehearsal was fully reverted before this commit.

| Finding                                                                                                                                                                      | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocking — §4.6 and §5.2 P25: malformed contract content masks malformed test content; support content untested                                                              | **Fixed**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | §4.6's single "malformed contract" test is replaced by the review's three-title loop, one fresh `createConformingCandidate()` per title, corrupting only `contract.ts`, `helper.ts` or `widget.feature.test.ts` respectively. §4.2's red-run expectation now reads "N−2 passes and thirteen failures" before implementation and "N+11 passes and zero failures" after. "Eleven" now appears in §0.1, §4.1, §4.2's first checkbox, §4.3–§4.4 ("plus 11"), and this attempt's fact 16. §4.7's first stop condition names "the eleven new module tests and the two authorized registry tests". §5.2's P25 row and the note beneath it now name all three titles, the three separate `-t` runs, and the three log basenames (`P25-contract.log`, `P25-support.log`, `P25-test.log`); §5.3 says P25's cell records all three observations. |
| The fixture question                                                                                                                                                         | **Answered — the fixture was missing the file, and is now added.** `createConformingCandidate()` (§2.6) already wrote `src/modules/widget/widget.feature.test.ts`, but wrote no plain support file. Without one, the new support-file test would have corrupted a path the fixture never creates. §2.6 now also writes `src/modules/widget/helper.ts` (a plain file with no kind suffix and no declaration tag), and §4.3 tells the executor to add this one line to the already-existing `createConformingCandidate` when implementing slice 4 — the function is defined by slice 2 but extended by slice 4, per the ownership table. The conforming candidate still conforms: an unsuffixed file declares no kind and satisfies every module-scope constraint, confirmed by the rehearsed green run. |
| Non-blocking — the matcher rule is not shared consistently (§0.4, §3.5, §5.5 still prescribed a literal-message stop)                                                        | **Fixed**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | §0.4's "fault that also fails other tests" paragraph, §3.5's first stop condition and §5.5's first stop condition now defer to "the matcher is not the requirement; the fact is" (executor preamble rule 20): a proof is accepted when the named test fails at the assertion about the row's fact, and a mutation that leaves the named test passing is first a location mistake — restore, check the function and expression the row names, redo once, report both.                                                                                                                                                                                                                                                                                                                                                                  |
| Non-blocking — evidence basenames                                                                                                                                            | **Fixed**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | §4.4 and §5.3 now state the basenames rule explicitly (previously only §2.4 did), matching the already-fixed slice 2 wording.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Non-blocking — all prescribed slice 3/5 mutations behaved as predicted (P1–P24 except P25)                                                                                   | **Not re-verified in this dispatch; unaffected.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | This dispatch's rehearsal touched only the module template, its verify.ts handlers, the eleven tests and P25 — the only places this fix changes. Slice 3 is already committed and untouched; slice 5's other eight mutations (P13, P15–P21) are unaffected by this fix and were not re-run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Non-blocking — packaging needs no edit                                                                                                                                       | **Confirmed by rehearsal.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `src/packaging/build.test.ts` passed 2 of 2 with the module template registered, matching the review's `toContain('repository')` analysis.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Non-blocking — pins (workspace-inventory counts, namespacing digest)                                                                                                         | **Confirmed, indirectly.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | This fix adds no project/TypeScript configuration and no new template file; `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache` was run after the revert and is recorded in this attempt's report to the caller.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Planner checklist — slice 4 finishes at baseline+11; only the two authorized registry expectations change                                                                    | **Confirmed by rehearsal.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Red: 20 pass, 13 fail on the N = 22 baseline. Green: 33 pass, 0 fail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Planner checklist — contract, support and test-file refusals each use a fresh candidate with one malformed file, asserting its own path and empty stdout                     | **Confirmed by rehearsal and by reading the code.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Each of the three loop iterations calls `createConformingCandidate()` independently and asserts `stderrOf(invocation)).toContain('cannot scan the imports of ' + path)` and `stdoutOf(invocation)).toBe('')`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Planner checklist — replay all three P25 runs; a boundary that skips `.test.ts` parsing must fail the independent test-file case                                             | **Confirmed by rehearsal.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Deleting the whole-file parse line made all three titles fail independently, each selecting exactly one test with `Expected: 1` / `Received: 0`. The review's own weakening — skip parsing only `.test.ts` files — left the contract and support titles passing but failed exactly the test-file title with the same assertion, closing the gap the review found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Planner checklist — replay slice 3's fifteen proofs; verify the committed `directory` module; run the packaged executable and the planner-only Bureaucrat and devsync suites | **Not run in this dispatch.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Slice 3 is already committed and this fix does not touch it. The `directory` module observation (the eleventh test) passed unchanged in this rehearsal, reporting exactly the `resource.term` finding fact 20 records. The whole `twilight-bureaucrat:test` target, the packaged executable's own CLI invocation, and the planner-only devsync suite beyond `tool-devsync:test` were not run here; this attempt's report to the caller states what was and was not run.                                                                                                                                                                                                                                                                                                                                                               |
