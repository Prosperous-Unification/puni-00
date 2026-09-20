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

**Revision 2, 2026-09-20**, after the first Codex review refused revision 1. What changed:
verification is now driven by the constraints the registry states, imports are parsed rather than
matched, the single-kind rule applies to a standalone file, every check has a named negative, the
slices are ordered test first, and every count is relative. The disposition of every finding is the
last section.

Every interface in section 6 was written into a copy of `apps/wiki/cli/src` under the planner's
temporary directory, type-checked with the repository's own compiler options, Prettier-checked with
the repository's configuration, and run against real Git fixtures **and** against this repository's
four frontend modules. Every output quoted in section 3 was observed on 2026-09-20. Nothing was
written into the repository.

## 0. How this packet is executed

### 0.0 Dispatch prerequisite, for the planner

`puni-plan/exec/run-executor.sh` builds the packet path as
`docs/superpowers/plans/2026-09-19-batch-1/<packet>.md` and names the clone's branch
`batch-1/<packet>`; read on 2026-09-20, both are literal. This packet lives under
`docs/superpowers/plans/2026-09-20-batch-2/`, so the launcher exits 69 (`packet missing in clone`)
before it dispatches anything. **The planner updates the launcher to take the batch directory, or
dispatches with an equivalent command, and records the exact command that worked before calling
this packet executable.** No slice below can fix this; it is not the executor's problem to solve.

### 0.1 The six slices

Strictly in order, never in parallel. Each is one dispatch: the executor does that slice and stops,
the planner reviews and commits, the next slice starts from that commit.

| Slice                                                            | Delivers                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [1](#slice-1--openspec-change-registry-list-and-show)            | The OpenSpec change, the template model, three kind templates, `list`, `show`    |
| [2](#slice-2--verifying-one-file-against-its-template)           | The candidate shell, the file-scope constraint handlers, `template verify`       |
| [3](#slice-3--the-negatives-for-the-shell-and-the-file-handlers) | Twelve watched faults for what slice 2 added                                     |
| [4](#slice-4--the-module-template)                               | The module template, the module-scope handlers, delegation to the kind templates |
| [5](#slice-5--the-negatives-for-the-module-handlers)             | Nine watched faults for what slice 4 added                                       |
| [6](#slice-6--readme-record-and-format)                          | The README section, the verification record, the final checks                    |

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
  outcome, capture its status and compare it, as section 1.1 does.
- **A test that spawns a process more than twice carries an explicit timeout.** Bun's default is
  5 seconds and the h2puni gate timed out a five-run test at 5,025 ms. Every test in this packet
  that starts Git or the command line carries `30_000`, including the ones that look short: the
  fixture helper alone spawns Git six times. Those arguments are part of the code. Do not drop them.
- **Counts are relative.** Every count this packet states is "the number you recorded at the start
  of this slice, plus this slice's own additions". Absolute totals elsewhere move under other
  packets and under main; never pin one.
- **Line numbers are not anchors.** Where this packet cites a line it is evidence from 2026-09-20,
  not a coordinate: find the code by its text. The batch 1 branch has since taken a merge from main
  that moved several files.
- **This packet adds no Nx target.** A new test-running target name would have to carry the
  `CLAUDECODE=0` and `AGENT=0` defaults that `tools/tool-devsync/src/workspace-targets.test.ts`
  requires; every test here runs under the existing `twilight-bureaucrat:test` target, so nothing
  there changes. If a slice finds itself wanting a new target, that is a stop.

### 0.3 Running one named test

Bun's `-t` matches the describe name and the test title **joined by a space**. Run the joined
pattern unanchored, exactly as each proof states it:

```sh
(cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
  bun test --preload ../../../tools/test/scratch/preload.ts src/templates/templates.test.ts \
  -t '<joined pattern>')
```

Expected while green: `1 pass`, `0 fail`, and `Ran 1 test across 1 file.` A run reporting
`Ran 0 tests` or `matched 0 tests` proves nothing: **stop and report**.

### 0.4 Injecting a fault, saving it, and what counts as a stop

For every proof, in this order:

1. `cp <file> "$task_tmp/"` — the passing bytes.
2. Edit the file to inject exactly the named fault.
3. **Compile it**: `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck` must exit 0. A
   mutation that does not compile proves nothing and is a stop; every fault in section 8 was
   compiled with the repository's own options on 2026-09-20.
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

**A fault that also fails other tests is not a stop.** Record which ones. It is a stop only when the
named test **passes** under the fault, fails with a **different** message than this packet predicts,
or the mutation does not compile.

### 0.5 Two standing facts about this package

- **A new source file changes the validator identity.** `resolveValidatorArtifactPaths` in
  `apps/wiki/cli/src/policy/trust.ts` walks `cli.ts`'s import closure, and this packet's three new
  files join it. Checked on 2026-09-20: no test pins that identity as a literal —
  `pilot-policy.test.ts`, `trusted-policy.test.ts` and `gate-entrypoints.test.ts` all recompute it
  by calling `resolveValidatorArtifactPaths` themselves. Expect no test failure from the added
  files. An activation provisioned **outside** this clone must be prepared again; that is the
  planner's question.
- **There are two dispatchers.** `apps/wiki/cli/src/cli.ts` routes the validator's commands;
  `apps/wiki/cli/src/bin.ts` keeps the installed binary's own allow-list and help text. A command
  added to only one of them is invisible to the installed package, which is why slice 1 writes the
  installed-binary assertions before it touches either file.

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

Checked in the worktree on 2026-09-20. Facts 13 to 29 were **observed by running** section 6's code
in a copy of `apps/wiki/cli/src` outside the repository, with `@shared/validation` resolved through
the workspace's own path mapping.

1. Nx project `twilight-bureaucrat`, `sourceRoot` `apps/wiki/cli/src`. Its `test` target runs
   `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --path-ignore-patterns '**/packaging/install.test.ts' --path-ignore-patterns '**/packaging/consumer-bootstrap.test.ts' --preload ../../../tools/test/scratch/preload.ts`
   with `cwd` `apps/wiki/cli`. `src/packaging/build.test.ts` is **not** excluded, so the executor
   can run it.
2. `runCli(argv)` in cli.ts dispatches on `args[0]` **and** exact `args.length`, and ends by
   throwing `unknown command: <name>` with a usage line listing every command word. `template`
   appears in neither dispatcher today.
3. bin.ts's `validatorCommands` set lists the same words; a word absent from it is rejected before
   the validator runs.
4. **No test pins cli.ts's usage string or bin.ts's help text as a whole.** `build.test.ts` asserts
   `toContain('unknown command')` and `toContain` of two help lines; `install.test.ts` asserts
   `toContain('twilight-bureaucrat validate-record')`; `trusted-policy.test.ts` asserts
   `toContain('usage: twilight-bureaucrat')`. Adding one word and one help line breaks none.
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
8. **`di-bag` 0.4.0 is installed**, pinned at the repository root by packet 020.1 and present in
   `bun.lock`. What is true of these modules is that **they have not adopted it**: no `module.ts`,
   no bag, and the preferences README still says DI Bag is not installed. Assumption A7 is written
   to adoption, not to installation.
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
12. This packet adds no README, no tsconfig and no Nx target, so the devsync pins over application
    READMEs, depth-sensitive configuration files and target defaults do not move. All of those
    tests live in `tool-devsync:test`, which is planner-only.
13. **Observed.** `bunx tsc` over section 6's three files, with the repository's
    `tsconfig.base.json` options (`strict`, `noPropertyAccessFromIndexSignature`,
    `isolatedModules`), printed nothing, in both the slice 2 state and the slice 4 state.
14. **Observed.** `bunx prettier --check` with the repository's `.prettierrc.json` reported
    `All matched files use Prettier code style!` for all three files, in both states.
15. **Observed, slice 2 state.** `template list` printed the three kind templates in identifier
    order, `feature-service`, `repository`, `resource-service`, each with `"version":"1.0.0"`, exit
    0; `template show module` printed
    `unknown template: module (registered: feature-service, repository, resource-service)`, exit 1.
16. **Observed, slice 4 state.** `template list` printed four identifiers,
    `feature-service, module, repository, resource-service`, exit 0.
17. **Observed.** `template show nope` printed `unknown template: nope (registered: …)` to stderr,
    exit 1, and `template summon` printed the usage line, exit 1.
18. **Observed.** A fixture module — README with the four sections, `contract.ts`,
    `widget.feature.ts` with `// @capability widget-editing`, `store.repository.ts` with
    `// @port ./contract#WidgetPort`, `store.repository.test.ts`, `widget.feature.test.ts` and
    `view/use-widget.ts` — verified `{"conforms":true,"findings":[]}`, exit 0, against both the
    `module` and the `repository` templates.
19. **Observed, against this repository at `HEAD`.** `template verify module committed . HEAD apps/wbs/fe-01/src/modules/<module>`
    reported exactly one class of finding per module and nothing else:

    | Module                 | Findings                                                                                      |
    | ---------------------- | --------------------------------------------------------------------------------------------- |
    | `directory`            | `resource.term` on `directory.resource.ts`                                                    |
    | `directory-management` | `feature.capability` on `directory-management.feature.ts`                                     |
    | `plan-writer`          | `feature.capability` on `plan-writer.feature.ts`                                              |
    | `preferences`          | `repository.port`, `feature.capability` and `resource.term`, one each on its three kind files |

    Each message is `file states 0 @<tag> tags, expected exactly 1`. Every other requirement —
    index, its sections, the contract, the kind file, the single kind, the test, the layout, the
    repository's sibling test, and every forbidden import — passed on all four real modules.

20. **Observed, the import scanner.** `new Bun.Transpiler({ loader: 'ts' }).scanImports` reports
    `import './a.repository';` (a side-effect import) and `export * from './f.repository';`, ignores
    `// import { x } from './b.repository';` and the same text inside a string literal, reports a
    dynamic `import('./e.repository')`, **elides a purely type-only `import type … from './d.repository'`**,
    and **throws** on source that does not parse (`Expected string but found ";"`). A regular
    expression over `from '…'`, which revision 1 used, got the first three of those wrong.
21. **Observed.** With the scanner in place, a feature whose file carries a side-effect import of
    `./store.repository`, a commented-out import and an import inside a string produced exactly one
    finding: `the file imports ./store.repository, which declares the repository kind`.
22. **Observed.** A repository adapter importing `./widget.resource` produced
    `repository.no-service-import`, and a resource importing `./widget.feature` produced
    `resource.no-feature-import`.
23. **Observed.** A file not parsing produced
    `cannot scan the imports of src/modules/widget/widget.feature.ts: Expected string but found ";"`,
    exit 1.
24. **Observed.** `template verify resource-service …` against `widget.feature.resource.ts` produced
    **two** findings, `resource.one-kind` (`file name declares feature and resource`) and
    `resource.term`. Revision 1, which had no single-kind constraint in file scope, accepted that
    file with `conforms: true`; that hole is closed.
25. **Observed.** `template verify feature-service …` against `contract.ts` produced
    `feature.suffix` (`file name does not end in .feature.ts`) and `feature.capability`.
26. **Observed, module scope.** A bare module produced, in order, `module.readme`, `module.contract`,
    `module.kind-file` and `module.test`; a README with its last section removed produced
    `the index omits ## Checks`; a file at `widget/inner/deep.ts` produced
    `the file sits neither in the module directory nor in view`; a second file named
    `widget.feature.resource.ts` produced `module.one-kind`; and a module whose feature file lost
    its tag produced the delegated `feature.capability` finding.
27. **Observed, the boundaries.** An absent subject printed
    `subject selects no candidate file: src/modules/nope`; `template verify feature-service … <a directory>`
    printed `template feature-service verifies one file; … is not one`; an absolute subject printed
    `subject must be a candidate-relative path: /etc/passwd`; `template verify module bogus …`
    printed the usage line; a non-UTF-8 file printed `candidate file … is not UTF-8`; and a
    verification with findings printed its record to stdout **and** exited 1, while a conforming one
    exited 0.
28. **Observed, the pure evaluator.** A hand-made template with one `declares-one` requirement
    produced exactly that one finding; the same template with an empty requirement list produced
    `conforms: true`; and a file template stating a `required-file` constraint threw
    `template requirement probe.module states a required-file constraint, which no file artifact can satisfy`.
    Verification therefore reads the registry's constraints and nothing else.
29. **Observed, the corrected forbidden-import fault.** `([] as FileKind[]).includes(forbidden)`
    compiles — the bare `[].includes(forbidden)` of revision 1 did **not**: `TS2345`, `FileKind` is
    not assignable to `never` — and makes the finding of fact 21 vanish, leaving `conforms: true`
    and exit 0.

## 4. Unknowns, and the assumptions recorded instead of asking

| #   | Question                                                                            | Recorded assumption                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | How a suffixed service names its capability, term or port machine-readably          | One **line comment** per file: `// @capability <id>`, `// @term <term>`, `// @port <specifier>`, stated exactly once. A JSDoc tag is impossible without editing the root ESLint configuration (fact 10), and `kinds.json` is the convention for files **without** a suffix (fact 11).                                                           |
| A2  | Whether the templates ship as files or as data                                      | As data: each template carries its skeleton and its constraints inline in TypeScript. No Markdown or TypeScript template file is added, so no document check or README pin moves (fact 12).                                                                                                                                                     |
| A3  | Whether a template finding has a mode                                               | No. Templates carry no policy: a finding is a finding, `conforms` is false, the command exits 1. Modes belong to the rule model, which 010.7 extends.                                                                                                                                                                                           |
| A4  | Whether `template verify` certifies                                                 | No. `certifies: false`, for the same reason a B0 verdict does not: it binds no evidence, no authority and no validator identity.                                                                                                                                                                                                                |
| A5  | How a consumer overrides or pins a template                                         | Deferred, as the design's open item 2 says. `version` is printed by `list` and `show` so a policy can pin it later; nothing reads it yet.                                                                                                                                                                                                       |
| A6  | Whether these requirements are the real K1 to K9 rules                              | No. They are template conformance over the bytes of one artifact; the authoritative K rules read the import graph and are 010.7's. Each requirement's `rules` field names the rule it partly serves, and each statement is written to what the bytes can show.                                                                                  |
| A7  | Whether the module template should require `module.ts`, `check.ts`, `tsconfig.json` | Not yet. `di-bag` is installed (fact 8) but **no module in the repository has adopted it**, so requiring its wiring would refuse every real module. They join the template as a version bump when the first module adopts DI Bag.                                                                                                               |
| A8  | Whether the real modules should be made to conform                                  | No. This packet edits no file under `apps/wbs`. Their missing declaration tags are a finding for the frontend packets, and slice 4's last test pins that observation so it cannot drift silently.                                                                                                                                               |
| A9  | Whether the module README skeleton carries `module-index` metadata                  | **No, and the delta spec says so.** No frontend module README carries the envelope today (fact 9); prescribing it would make the template's own output non-conforming to the repository and put a second index authority under `fe-01`. It joins the template when the frontend gains a module index boundary, which is the wiki design's work. |
| A10 | Whether a type-only import of a repository is caught                                | No. The transpiler elides it (fact 20), so `imports-no-kind` cannot see it. The requirement is stated as "states no import", and the type-level dependency is left to 010.7's graph rule. Written into the delta spec as a stated limit, not hidden.                                                                                            |

## 5. File plan, and what this packet does not own

| Path                                                                              | Slices                                                | Responsibility                                                           |
| --------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| openspec/changes/twilight-bureaucrat-templates/.openspec.yaml                     | 1                                                     | `schema: sdd-lean`, `created: 2026-09-20`.                               |
| openspec/changes/twilight-bureaucrat-templates/proposal.md                        | 1                                                     | Intent, at most 400 words.                                               |
| openspec/changes/twilight-bureaucrat-templates/specs/bureaucrat-templates/spec.md | 1                                                     | The nine requirements of section 9.                                      |
| openspec/changes/twilight-bureaucrat-templates/tasks.md                           | 1 creates, every slice ticks its own                  | The six slices, each naming its tests and its negatives.                 |
| openspec/changes/twilight-bureaucrat-templates/verify.md                          | 1 creates, every slice fills its own rows             | The proof table of section 8 and the commands record.                    |
| apps/wiki/cli/src/templates/template.ts                                           | 1 creates, 4 extends, 3 adds a proof comment          | The template model, its constraints and its pure readers.                |
| apps/wiki/cli/src/templates/registry.ts                                           | 1 creates, 4 extends                                  | The templates, their skeletons, their constraints, and `selectTemplate`. |
| apps/wiki/cli/src/templates/verify.ts                                             | 1 creates, 2 and 4 extend, 3 and 5 add proof comments | The command writers, the candidate shell, the constraint handlers.       |
| apps/wiki/cli/src/templates/templates.test.ts                                     | 1 creates, 2 and 4 extend                             | Every template test.                                                     |
| apps/wiki/cli/src/cli.ts                                                          | 1                                                     | One route block and one word in the usage line. Nothing else.            |
| apps/wiki/cli/src/bin.ts                                                          | 1                                                     | One word in `validatorCommands` and one help line. Nothing else.         |
| apps/wiki/cli/src/packaging/build.test.ts                                         | 1                                                     | Three assertions on the built executable.                                |
| apps/wiki/cli/README.md                                                           | 6                                                     | One new `## Templates` section, appended at the end of the file.         |

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
`## Rules` edits: keep them and append below. If `src/templates/` already exists or cli.ts's usage
string already contains `template`, **stop and report**: this packet's work is already on the tree.

### 5.2 Other batch 2 neighbours

020.2 (shared failures), 020.7 (backend startup), 040.1 (Chromium proof), 040.4 (plan feed),
110.1 (test axes) and 110.6 (retire upstream sync) touch no file in section 5. 040.4 may add a new
frontend module; slice 4's observation test names `apps/wbs/fe-01/src/modules/directory` only, which
040.4 does not touch. `docs/code-organization/kinds.json` belongs to 020.8 and is not edited here.

## 6. Interfaces

### 6.1 What a template is, and what verification is not

A template is **data**: an identifier, a version, whether it describes one file or one directory,
one skeleton per prescribed file, and a list of requirements — **each requirement carrying the
constraint that checks it**. `template show` prints it whole, so Twilight Dash instantiates exactly
what Twilight Bureaucrat verifies.

The verifier has **one handler per constraint kind and reads nothing else**. It iterates the
template's own requirement list, so a template that drops a requirement drops its check and one that
states a requirement gains it (fact 28). A requirement whose constraint the artifact's scope cannot
satisfy — a module-only constraint on a file template — is a **refusal**, not a silent pass: a
registry mistake has to be loud.

Verification is **pure over bytes**. It reads a candidate revision through the same `readCandidate`
and `readCandidateBlob` the rule adapters use, parses imports with the transpiler `trust.ts` already
uses, and judges only what the bytes of one artifact show. It is deliberately **narrower** than
K1 to K9 (assumptions A6 and A10): it resolves no import to a module and reads no type graph.

A verification never certifies (`certifies: false`) and carries no mode: a finding refuses the
artifact and the command exits 1.

### 6.2 apps/wiki/cli/src/templates/template.ts — slice 1 creates this, slice 4 extends the union

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
  | { readonly kind: 'sibling-test' };

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
 * Every value a declaration tag states in the file, one per matching line.
 *
 * The tag is a line comment, `// @capability plan-editing`, and deliberately not a JSDoc tag:
 * `jsdoc/check-tag-names` refuses an unknown tag inside a JSDoc block, observed on 2026-09-20 as
 * `Invalid JSDoc tag name "capability"`. A line comment is a declaration, not symbol knowledge, so
 * it belongs beside the module index comment rather than in the JSDoc rule R3 governs.
 */
export function taggedValues(text: string, tag: string): string[] {
  const values: string[] = [];
  const tagLine = new RegExp(`^[ \\t]*//[ \\t]*@${tag}[ \\t]+(\\S+)[ \\t]*$`, 'gm');
  for (const match of text.matchAll(tagLine)) values.push(match[1]);
  return values;
}
```

### 6.3 apps/wiki/cli/src/templates/registry.ts — slice 1 creates this, slice 4 adds the module template

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
beside it, and a requirement that refused those would be wrong. The generated pair keeps them
together; the verifier judges only what it can see.

### 6.4 apps/wiki/cli/src/templates/verify.ts — the slice 1 version, complete

Slice 1 ships a working `list` and `show` and no stub: `verify` is not an action yet and falls to
the usage refusal.

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

function decodeArtifact(repository: string, blob: string, path: string): string {
  if (!path.endsWith('.ts') && !path.endsWith('.md')) return '';
  const bytes = readCandidateBlob(repository, blob, path);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`candidate file ${path} is not UTF-8: ${detail}`, { cause });
  }
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
4: no directory template is registered until then, so they are unreachable and the file-subject
refusal above is what a caller meets.

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
other shape with the usage line, so no unknown action reaches a template.

In the same file's final `throw`, the usage string lists the command words separated by `|`. Insert
the single word `template` between the words `explain` and `validate-policy-activation`, keeping
every other word exactly as it is, including any word packet 010.7 or another lane has added.

In `apps/wiki/cli/src/bin.ts`, add the entry `'template',` to the `validatorCommands` set
immediately after the `'check',` entry, and add one line to the `help` template literal immediately
after the line that documents `explain`. The line is, with two leading spaces:

```text
  twilight-bureaucrat template <list|show <id>|verify <id> <committed|staged|working> <repository> <revision-or-base> <subject>>
```

### 6.7 Slice 4's additions

**template.ts.** Replace the constraint union's last member, `| { readonly kind: 'sibling-test' };`,
with:

```ts
  | { readonly kind: 'sibling-test' }
  | { readonly kind: 'required-file'; readonly path: string }
  | { readonly kind: 'index-sections'; readonly path: string; readonly sections: readonly string[] }
  | { readonly kind: 'kind-file-present' }
  | { readonly kind: 'test-present' }
  | { readonly kind: 'files-stay-in-module'; readonly allowedDirectories: readonly string[] }
  | { readonly kind: 'kind-files-follow-their-template' };
```

**registry.ts.** Add the two skeletons, the section list and the module template above
`const featureTemplate`:

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

and change the registry list to
`const templates: readonly Template[] = [featureTemplate, moduleTemplate, repositoryTemplate, resourceTemplate];`.

**verify.ts.** Add the module scope beside `FileScope`, widen `refuseScope` and
`requirementFindings`, add the module handlers, and give `verifyArtifact` its directory branch:

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

`refuseScope`'s parameter becomes `scope: ArtifactScope`; nothing else in it changes.

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

`FileKind` joins the `./template` import list. A file whose name declares two kinds is skipped by
the delegation branch and reported by `module.one-kind` instead, so no module file is judged against
the wrong template.

## Slice 1 — OpenSpec change, registry, `list` and `show`

### 1.1 Preparation

- [ ] Run:

  ```sh
  repo_root=$(pwd -P)
  task_tmp=$(mktemp -d "${TMPDIR:?launcher must supply TMPDIR}/templates-XXXXXX")
  mkdir -p "$TMPDIR/evidence"
  printf 'repo_root=%s\ntask_tmp=%s\n' "$repo_root" "$task_tmp"
  ```

  Expected: both paths print, and `task_tmp` is beneath the launcher's `TMPDIR`.

- [ ] Confirm the starting point, without masking any status:

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
  (cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
    bun test --preload ../../../tools/test/scratch/preload.ts src/rules/rules.test.ts)
  ```

  Expected: the first two checks are silent, `grep` exits 1 for "no match" and any other status
  stops, and the rule suite exits 0. **Write its test count down**: this packet adds no rule test,
  so that count must not move in any slice.

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

  Expected: the four template tests fail because `template` is not a command, and the packaging test
  fails on its new `--help` assertion. **Record both failing lines**: they are the evidence that the
  installed dispatcher's test preceded the dispatcher.

### 1.4 Implementation

- [ ] Create apps/wiki/cli/src/templates/template.ts, exactly section 6.2.
- [ ] Create apps/wiki/cli/src/templates/registry.ts, exactly section 6.3.
- [ ] Create apps/wiki/cli/src/templates/verify.ts, exactly section 6.4.
- [ ] Make the two dispatcher edits of section 6.6.
- [ ] Rerun the two focused files. Expected: the four template tests pass, and the packaging file
      passes. Record the packaging file's own count for comparison inside this slice only.

### 1.5 Negative proof

| #   | Check                                         | Fault                                                 | Test that must fail                                                               |
| --- | --------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| P1  | `selectTemplate`'s unknown-identifier refusal | Return `registeredTemplates()[0]` instead of throwing | `refuses an unregistered template identifier and names every registered template` |

Under the fault the command exits 0 and prints the `feature-service` record. Follow section 0.4
exactly, compile the mutation before running the test, and write the `Proof:` comment adjacent to
the restored guard only after observing the failure.

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
disturb it.

### 1.8 Slice 1 verification, record and formatting

| Command                                                                                                    | Expected                                                  |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| The two focused files of section 1.3                                                                       | Exit 0; 4 template tests pass; the packaging file passes. |
| The rule suite of section 1.1                                                                              | Exit 0; the recorded count, unchanged.                    |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`                                                | Exit 0; `Successfully ran target typecheck`.              |
| `NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source`                                              | Exit 0, no warnings.                                      |
| `bunx prettier --write` over **this slice's own files**, then `NX_DAEMON=false bunx nx format:check --all` | Both exit 0. Never a repository-wide write.               |
| The batch README's **OpenSpec validation** block                                                           | Exit 0; one JSON report kept under `$TMPDIR/evidence`.    |

- [ ] Tick **only slice 1's** boxes in tasks.md, and write this slice's commands, statuses and
      decisive lines, plus P1's observed failure, into verify.md.
- [ ] Run `git status --short --untracked-files=all` and check it against section 1.9's list before
      handing over. A path that is not on that list is a stop.

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

Each is **false** on the tree this slice starts from, checked on 2026-09-20.

1. `apps/wiki/cli/src/templates/` exists, or cli.ts's usage string already contains `template`.
2. The rule suite's count moves from the section 1.1 baseline.
3. `lint:source` reports something that cannot be fixed without a suppression.
4. The OpenSpec validation block fails for a reason outside this change's own artifacts.
5. The 400-word intent cap cannot be met.

---

## Slice 2 — verifying one file against its template

Starts from the committed slice 1. Read section 0 in full first.

### 2.1 Preparation

- [ ] Section 1.1's preparation block, then:

  ```sh
  (cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
    bun test --preload ../../../tools/test/scratch/preload.ts src/templates/templates.test.ts)
  ```

  Expected: exit 0, 4 pass. **Record that count**; this slice adds **13 or 14** tests — 14 if the
  compiler accepts the last one, 13 if it moves to slice 5, as section 2.6 explains — so it ends at
  the recorded count plus that many, and the report says which.

### 2.2 Tests first

- [ ] Append section 2.6's helpers and its two describe blocks to
      apps/wiki/cli/src/templates/templates.test.ts. Merge the new imports into the file's existing
      import block at the top; never leave an `import` in the middle of the file.
- [ ] Run the focused file. Expected: the 4 slice 1 tests pass and every new one fails — the CLI
      ones on the usage refusal, because `verify` is not an action, and the pure ones because
      `verifyArtifact` is not exported yet. Record one failing line of each kind.

### 2.3 Implementation

- [ ] Replace apps/wiki/cli/src/templates/verify.ts with **exactly** section 6.5.
- [ ] Rerun the focused file. Expected: the recorded count plus this slice's additions, 0 fail.
- [ ] Run `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`. This slice introduces the
      file's types, so the type check belongs to it. Expected: exit 0.

### 2.4 Slice 2 verification, record and formatting

Section 1.8's table, with the focused templates file at the recorded count plus this slice's
additions, plus:

| Command                                                                                                        | Expected                                      |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `(cd "$repo_root/apps/wiki/cli" && … bun test … src/inventory/read-candidate.test.ts src/rules/rules.test.ts)` | Exit 0; both suites at their recorded counts. |

- [ ] Tick only slice 2's boxes; write this slice's commands and results into verify.md.
- [ ] Format this slice's own files, run the repository-wide format check, then check
      `git status --short --untracked-files=all` against section 2.7.

### 2.5 Slice 2 stop conditions

1. The slice 1 tests do not pass before any edit.
2. Any new test passes before the implementation lands: that would mean it tests nothing.
3. The type check reports an error section 6.5 does not contain, which would mean the file was not
   copied exactly.

### 2.6 Slice 2's helpers and tests

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';

import { afterEach } from 'bun:test';

import { verifyArtifact } from './verify';

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

/** A module directory that satisfies every requirement of every template. */
function createConformingCandidate(): { repository: string; revision: string } {
  const repository = mkdtempSync(join(tmpdir(), 'twilight-templates-'));
  scratchRoots.push(repository);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'templates@example.test']);
  runGit(repository, ['config', 'user.name', 'Templates Fixture']);
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
  write(repository, 'src/modules/widget/view/use-widget.ts', 'export const view = 1;\n');
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', 'fixture']);
  return { repository, revision: runGit(repository, ['rev-parse', 'HEAD']) };
}

/** Commits whatever the test has just written and returns the new revision. */
function commit(repository: string, message: string): string {
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', message]);
  return runGit(repository, ['rev-parse', 'HEAD']);
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
    expect(verificationOf(invocation).findings.map((item) => item.requirementId)).toEqual([
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

  test('evaluates exactly the requirements the template states', () => {
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
});
```

**One more pure test belongs with these, and may not compile yet.** It proves the scope refusal:

```ts
test('refuses a requirement whose constraint no file artifact can satisfy', () => {
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
```

The `required-file` member joins the constraint union only in slice 4, and the planner confirmed on
2026-09-20 that it is absent from the slice 2 state. **Add this test inside the same describe block,
run the type check, and if the compiler rejects the constraint literal, move the test to slice 5
(section 5.1) and say so in the report.** Either way its watched fault is P13, in slice 5. Do not
widen the union early to make it compile: that is slice 4's edit.

### 2.7 Ready to commit

Commit subject: `feat(bureaucrat): verify one file against its template`.

Files: apps/wiki/cli/src/templates/verify.ts, apps/wiki/cli/src/templates/templates.test.ts,
openspec/changes/twilight-bureaucrat-templates/tasks.md,
openspec/changes/twilight-bureaucrat-templates/verify.md.

---

## Slice 3 — the negatives for the shell and the file handlers

Starts from the committed slice 2. **This slice adds no test and changes no behaviour.** It injects
each fault, watches the named test fail, restores, and writes the adjacent `Proof:` comment.

### 3.1 Preparation

- [ ] Section 1.1's block, then the focused templates file. Expected: the slice 2 count, unchanged.
      Record it.

### 3.2 The faults

| #   | File        | Check                                | Fault                                                                                       | Named test                                                                      |
| --- | ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| P2  | verify.ts   | The candidate-relative subject guard | Delete the `subject must be a candidate-relative path` throw                                | `refuses a subject that is not candidate-relative`                              |
| P3  | verify.ts   | The empty-selection refusal          | Replace the `selected.length === 0` throw with `return verification(template, subject, [])` | `refuses a subject that selects nothing`                                        |
| P4  | verify.ts   | The subject-kind refusal             | Replace the `mistaken` expression with `false`                                              | `refuses a file template pointed at a directory`                                |
| P5  | verify.ts   | The refused-verification exit status | Delete `if (!verified.conforms) process.exitCode = 1;`                                      | `reports a file whose name lacks the kind suffix`                               |
| P6  | verify.ts   | The UTF-8 boundary                   | Drop `{ fatal: true }` from the `TextDecoder`                                               | `refuses a candidate file that is not UTF-8`                                    |
| P7  | template.ts | The import-scan boundary             | Return `[]` from the `catch` instead of throwing                                            | `refuses a file that does not parse`                                            |
| P8  | verify.ts   | `name-suffix`                        | Return `[]` for the `name-suffix` case                                                      | `reports a file whose name lacks the kind suffix`                               |
| P9  | verify.ts   | `one-kind-per-file`                  | Change `declaredKinds(file.path).length > 1` to `> 2` in `oneKindFindings`                  | `reports a standalone file whose name declares two kinds`                       |
| P10 | verify.ts   | `declares-one`                       | Change `stated.length === 1` to `stated.length < 99`                                        | `reports a service that states two declaration tags`                            |
| P11 | verify.ts   | `imports-no-kind`                    | Replace `declaredKinds(specifier)` with `([] as FileKind[])`                                | `reports a side-effect import of a repository and ignores comments and strings` |
| P12 | verify.ts   | `sibling-test`                       | Return `[]` for the `sibling-test` case                                                     | `reports a repository adapter with no sibling test`                             |
| P14 | verify.ts   | Requirement-driven evaluation        | Change `template.requirements.flatMap` to `template.requirements.slice(1).flatMap`          | `evaluates exactly the requirements the template states`                        |

P11's mutation needs `FileKind` imported in verify.ts; add it to the `./template` import for the
mutation and remove it again on restore. The bare `[].includes(forbidden)` does **not** compile
(`TS2345`), which is why the cast is prescribed. Under P3 the refusal disappears and the command
exits 0 with a conforming record; under P5 the observed exit status is 0 where 1 is expected; under
P7 the refusal loses its path and the command reports a finding-free verification instead.

P13, the scope refusal, is proven in slice 5, with the test that may move there (section 2.6).

### 3.3 Slice 3 verification, record and formatting

- [ ] After every restore, rerun the whole focused file: the slice 2 count, 0 fail.
- [ ] Run the type check, `lint:source`, this slice's Prettier write and the repository-wide format
      check, and the OpenSpec validation block, as section 1.8 does.
- [ ] Fill P2 to P12 and P14's `Observed failure` cells in verify.md with what you saw, tick slice
      3's boxes, and check `git status --short --untracked-files=all`: exactly
      apps/wiki/cli/src/templates/verify.ts, apps/wiki/cli/src/templates/template.ts,
      openspec/changes/twilight-bureaucrat-templates/tasks.md and
      openspec/changes/twilight-bureaucrat-templates/verify.md — the two source files because the
      required `Proof:` comments change them.

### 3.4 Ready to commit

Commit subject: `test(bureaucrat): watch every file-scope template check fail`.

### 3.5 Slice 3 stop conditions

1. Any named test passes under its fault, fails with a different message, or the mutation does not
   compile.
2. The focused file's count differs from the slice 2 count at any point.

---

## Slice 4 — the module template

Starts from the committed slice 3.

### 4.1 Preparation

- [ ] Section 1.1's block, then the focused templates file. Expected: the slice 2 count, unchanged.
      **Record it**; this slice adds **8** tests, so it ends at that count plus 8.

### 4.2 Tests first

- [ ] Append section 4.6's describe block, 8 tests.
- [ ] Make the one named edit to an existing test: in
      `lists every registered template in identifier order`, the expected identifiers become
      `['feature-service', 'module', 'repository', 'resource-service']` and the expected subjects
      become `['file', 'directory', 'file', 'file']`. That is the only change to any existing test,
      and the packet names it here because the preamble forbids every other kind.
- [ ] Run the focused file. Expected: the 8 new tests fail, `lists every registered template` fails
      on the new expectation, and everything else passes. Record the failing lines.

### 4.3 Implementation

- [ ] Apply section 6.7's three additions, in order: the constraint union in template.ts, the module
      template in registry.ts, the module scope and its handlers in verify.ts.
- [ ] Rerun the focused file. Expected: the recorded count plus 8, 0 fail.
- [ ] Run `NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck`. This slice widens a
      discriminated union and a function's parameter type, so the type check belongs to it.
      Expected: exit 0.

### 4.4 Slice 4 verification, record and formatting

Section 1.8's table, with the focused templates file at the recorded count plus 8, plus the
packaging file, whose listing assertion is `toContain` and must still pass with four templates:

```sh
(cd "$repo_root/apps/wiki/cli" && TOOL_WIKI_TRUSTED_NODE_MODULES="$repo_root/node_modules" \
  bun test --preload ../../../tools/test/scratch/preload.ts src/packaging/build.test.ts)
```

Expected: exit 0, `0 fail`.

### 4.5 Ready to commit

Commit subject: `feat(bureaucrat): verify a module directory against the module template`.

Files: apps/wiki/cli/src/templates/template.ts, apps/wiki/cli/src/templates/registry.ts,
apps/wiki/cli/src/templates/verify.ts, apps/wiki/cli/src/templates/templates.test.ts,
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
    const repository = mkdtempSync(join(tmpdir(), 'twilight-templates-bare-'));
    scratchRoots.push(repository);
    runGit(repository, ['init', '--initial-branch=main']);
    runGit(repository, ['config', 'user.email', 'templates@example.test']);
    runGit(repository, ['config', 'user.name', 'Templates Fixture']);
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
`src/templates` is `apps/wiki/cli`, which `resolveCandidateRoot` resolves to the worktree root; any
directory inside the worktree would do. **If this test reports a different finding set, the
`directory` module changed: record it and stop, rather than editing the expectation.**

### 4.7 Slice 4 stop conditions

1. Any new test passes before the implementation lands.
2. The observation test's finding set differs from section 3's fact 19.
3. The type check reports an error section 6.7 does not contain.

---

## Slice 5 — the negatives for the module handlers

Starts from the committed slice 4. Adds no test except the one that may have moved here from slice
2, and changes no behaviour.

### 5.1 Preparation

- [ ] Section 1.1's block, then the focused templates file. Expected: the slice 4 count, unchanged.
      Record it.
- [ ] If slice 2 moved `refuses a requirement whose constraint no file artifact can satisfy` here
      (section 2.6), add it now inside the `the template record drives verification` describe block,
      watch it pass — the handler and the union member both exist at this point — and note in the
      report that it arrives one slice late and why. The count then ends at the recorded count plus
      one.

### 5.2 The faults

| #   | Check                                    | Fault                                                                 | Named test                                                              |
| --- | ---------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| P13 | The scope refusal                        | Return `[]` from `refuseScope` instead of throwing                    | `refuses a requirement whose constraint no file artifact can satisfy`   |
| P15 | `required-file`                          | Return `[]` for the `required-file` case                              | `reports a module with no index, no contract, no kind file and no test` |
| P16 | `index-sections`                         | Replace `absent` with an empty array                                  | `reports an index that omits one of its sections`                       |
| P17 | `kind-file-present`                      | Return `[]` for the `kind-file-present` case                          | `reports a module with no index, no contract, no kind file and no test` |
| P18 | `test-present`                           | Return `[]` for the `test-present` case                               | `reports a module with no index, no contract, no kind file and no test` |
| P19 | `files-stay-in-module`                   | Replace the filter's body with `false`                                | `reports a file that sits below the module directory`                   |
| P20 | The module wiring of `one-kind-per-file` | Pass `[]` instead of `files` to `oneKindFindings` in `moduleFindings` | `reports a module file that declares two kinds`                         |
| P21 | Delegation to the kind templates         | Return `[]` for the `kind-files-follow-their-template` case           | `reports a kind file inside a module that breaks its own template`      |

P15, P17 and P18 all name the same test, which asserts the whole finding list: each fault removes
exactly one entry from it, and the failing output names which. Record all three separately. P16 also
fails `reports an index with no title`; record that as an extra failing test, not as a stop.

### 5.3 Slice 5 verification, record and formatting

As section 3.3, with the slice 4 count, and with `git status --short --untracked-files=all` showing
apps/wiki/cli/src/templates/verify.ts, tasks.md, verify.md, and — only if the moved test arrived
here — apps/wiki/cli/src/templates/templates.test.ts.

### 5.4 Ready to commit

Commit subject: `test(bureaucrat): watch every module-scope template check fail`.

### 5.5 Slice 5 stop conditions

1. Any named test passes under its fault, fails with a different message, or the mutation does not
   compile.
2. The focused file's count differs from the slice 4 count, except for the single moved test.

---

## Slice 6 — README, record and format

Starts from the committed slice 5. **Record only what this attempt observes.** Earlier slices ran in
their own clones, and their evidence lives outside every repository. Write
`pending planner transcription` into any proof cell this attempt did not observe, and never
reconstruct a failing line from a `Proof:` comment in the source.

### 6.1 Preparation

- [ ] Section 1.1's block, then:

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

  Expected: the focused file at the slice 5 count, and `grep` exiting 1 for "no match". Any other
  status stops. This slice adds no test, so the count must not move.

### 6.2 The README

- [ ] Append a `## Templates` section to apps/wiki/cli/README.md, after the last existing section,
      saying: which four templates ship; that `template list` and `template show` print them and
      that Twilight Dash instantiates the same record Twilight Bureaucrat verifies; that each
      requirement carries the constraint that checks it, so a template stating no requirement checks
      nothing; that `template verify` reads one artifact out of a Git revision, never certifies, and
      exits 1 on a finding; that a service file declares its capability, glossary term or port in a
      line comment, `// @capability <id>`, because an unknown JSDoc tag fails
      `jsdoc/check-tag-names`; and that a type-only import and the module index envelope are stated
      deferrals (assumptions A9 and A10). The README is this project's module index and its
      memberships already carry the `src` directory prefix, so no membership changes.

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
command a caller runs, and nothing calls it yet. A type-only import and a missing module index
envelope are outside what this slice checks, by assumptions A9 and A10.

### 6.5 Ready to commit

Commit subject: `docs(bureaucrat): describe the templates and record their verification`.

Files: apps/wiki/cli/README.md, openspec/changes/twilight-bureaucrat-templates/tasks.md,
openspec/changes/twilight-bureaucrat-templates/verify.md.

`git status --short --untracked-files=all` at the end of this slice shows exactly those three paths.

### 6.6 Slice 6 stop conditions

1. `## Templates` already exists in apps/wiki/cli/README.md.
2. The template test count moves from the slice 5 count.
3. `nx format:check --all` fails on a file this packet does not own — report it, never fix it.

---

## 8. Negative proofs, all slices

Every check this packet adds appears here exactly once. Each fault was compiled with the
repository's own options on 2026-09-20.

| #   | Slice | Check                                | Fault injected                           | Named test                                                                        |
| --- | ----- | ------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------- |
| P1  | 1     | Unknown template refusal             | Return the first registered template     | `refuses an unregistered template identifier and names every registered template` |
| P2  | 3     | Candidate-relative subject guard     | Delete the guard                         | `refuses a subject that is not candidate-relative`                                |
| P3  | 3     | Empty-selection refusal              | Return a finding-free verification       | `refuses a subject that selects nothing`                                          |
| P4  | 3     | Subject-kind refusal                 | Replace `mistaken` with `false`          | `refuses a file template pointed at a directory`                                  |
| P5  | 3     | Refused-verification exit status     | Delete `process.exitCode = 1`            | `reports a file whose name lacks the kind suffix`                                 |
| P6  | 3     | UTF-8 boundary                       | Drop `{ fatal: true }`                   | `refuses a candidate file that is not UTF-8`                                      |
| P7  | 3     | Import-scan boundary                 | Return `[]` from the `catch`             | `refuses a file that does not parse`                                              |
| P8  | 3     | `name-suffix`                        | Return `[]` for that case                | `reports a file whose name lacks the kind suffix`                                 |
| P9  | 3     | `one-kind-per-file`                  | `length > 2`                             | `reports a standalone file whose name declares two kinds`                         |
| P10 | 3     | `declares-one`                       | `stated.length < 99`                     | `reports a service that states two declaration tags`                              |
| P11 | 3     | `imports-no-kind`                    | `([] as FileKind[]).includes(forbidden)` | `reports a side-effect import of a repository and ignores comments and strings`   |
| P12 | 3     | `sibling-test`                       | Return `[]` for that case                | `reports a repository adapter with no sibling test`                               |
| P13 | 5     | Scope refusal                        | Return `[]` from `refuseScope`           | `refuses a requirement whose constraint no file artifact can satisfy`             |
| P14 | 3     | Requirement-driven evaluation        | `template.requirements.slice(1)`         | `evaluates exactly the requirements the template states`                          |
| P15 | 5     | `required-file`                      | Return `[]` for that case                | `reports a module with no index, no contract, no kind file and no test`           |
| P16 | 5     | `index-sections`                     | Replace `absent` with an empty array     | `reports an index that omits one of its sections`                                 |
| P17 | 5     | `kind-file-present`                  | Return `[]` for that case                | `reports a module with no index, no contract, no kind file and no test`           |
| P18 | 5     | `test-present`                       | Return `[]` for that case                | `reports a module with no index, no contract, no kind file and no test`           |
| P19 | 5     | `files-stay-in-module`               | Replace the filter's body with `false`   | `reports a file that sits below the module directory`                             |
| P20 | 5     | Module wiring of `one-kind-per-file` | Pass `[]` instead of `files`             | `reports a module file that declares two kinds`                                   |
| P21 | 5     | Delegation to the kind templates     | Return `[]` for that case                | `reports a kind file inside a module that breaks its own template`                |

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
and nothing else. Verification is pure, narrower than the direction rules by design, never
certifies, and enforces nothing in the gate. A service file declares its capability, glossary term
or port in a line comment, because an unknown JSDoc tag fails lint. Two limits are stated rather
than hidden: a purely type-only import is invisible to the import scanner, and the module README
skeleton carries no wiki index envelope, because no module in the repository has one yet.
Non-goals: no rule, no mode, no policy field, no consumer override, no generation, and no edit to
any existing service.

**The nine requirements**, each with at least one scenario carrying real `GIVEN`, `WHEN` and `THEN`
bullets:

1. **The registry lists and shows templates.** Stable identifiers, a version and a subject kind; an
   unregistered identifier is refused and every registered one is named.
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
   a line comment; and a repository adapter has a test beside it.
8. **The template's direction checks refuse the forbidden import.** A feature importing a
   repository, a resource importing a feature and a repository importing either are reported, from
   parsed import syntax, including a side-effect import and excluding import text in a comment or a
   string. A purely type-only import is out of scope and the requirement states that limit.
9. **Verification is bounded and honest.** It reads one revision, never certifies, exits 1 on a
   finding, and refuses an absent subject, a wrong subject kind, a path that is not
   candidate-relative, a file that is not UTF-8 and a file that does not parse, rather than
   defaulting any of them.

## 10. Out of lane

- Every file under `apps/wiki/cli/src/rules/`: packet 010.7 owns them, and its evidence lives in
  `openspec/changes/twilight-bureaucrat-kind-rules/`.
- `docs/code-organization/kinds.json` and `docs/code-organization/README.md`: 020.8's.
- `eslint.config.js`: no declaration tag is added to `definedTags`; the line-comment form exists
  precisely so the root configuration does not change.
- Any file under `apps/wbs/`: no service gains a tag in this packet (assumption A8).
- `openspec/changes/service-taxonomy/`: 010.3 created it and no slice here writes to it.
- `tools/tool-devsync/` and `nx.json`: no pin moves and no Nx target is added (fact 12 and
  section 0.2).

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
