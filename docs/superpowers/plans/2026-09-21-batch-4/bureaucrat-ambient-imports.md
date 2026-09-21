# Bureaucrat Ambient Non-Code Imports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Twilight Bureaucrat evaluate a TypeScript candidate whose compiler accepts an ambient
non-code import such as `import './styles.css'`, without inventing a dependency target or weakening the
failure for a real unresolved module.

**Architecture:** Keep TypeScript as the authority. File/module resolution still creates graph edges;
when that resolution has no target, accept omission only if the program's type checker binds the exact
import expression to an ambient module declaration. Represent the two outcomes explicitly, omit ambient
imports from both forward and reverse selectors, and propagate every other unresolved import through the
existing not-evaluated/fail-closed rule path.

**Tech Stack:** Bun 1.4.2; root alias `typescript: npm:@typescript/typescript6@6.0.2` with installed
package metadata `@typescript/typescript6@6.0.2` (the retained probe records the loaded module's exported
`ts.version` string as `6.0.3`); ArkType records; Twilight Bureaucrat CLI; OpenSpec 1.12.0. The immutable
gate must record its own runtime versions rather than inheriting these planning-host observations.

**Spec:** `openspec/changes/twilight-bureaucrat-kind-rules/specs/bureaucrat-rules/spec.md`, requirement
“Kind direction over the import graph,” amended by Task 1 below.

## Global Constraints

- Work under the existing `twilight-bureaucrat-kind-rules` B2 change; do not create a second change or
  reopen ADR 0029.
- Preserve the report schema. An ambient non-code import yields no `TypeScriptImportSelector`, no
  `TypeScriptReverseEdgeSelector`, and no fabricated `external:*` target.
- `ts.resolveModuleName(...) === undefined` is not enough to omit an edge. The exact import expression
  must have a type-checker symbol whose declarations are ambient `ModuleDeclaration`s.
- A missing relative code module, an unmatched non-code module, missing trusted compiler modules, and
  compiler diagnostics remain extraction failures. Every dependent rule is then unevaluated and the
  verdict is disallowed in every mode.
- Preserve the committed/staged/working materialization boundary, extractor/configuration identities,
  public declaration closure, and exact stdout/stderr/exit behavior.
- Do not add an extension allowlist, require an asset to exist, call a bundler, or synthesize an asset
  graph. Physical asset validation belongs to the owning build tool.
- Bun and Nx only. Each changed safety branch needs a production-CLI negative, an observed failure with
  the branch/dependency broken, and an adjacent `Proof:` comment stating the injected fault and result.
  The pre-existing `rules/check.ts` fail-closed branch is mutation-only in this packet: restore it byte
  for byte and record its F5 observation solely in `verify.md`; do not add a new comment to unchanged code.
- Give each new child-process test an explicit measured timeout (`20_000` for the relationship fixture,
  `30_000` for the full rule command); none may inherit Bun's five-second default.
- This packet is independent of 040.7. It may begin after Batch 3 lands and the implementation checkout
  is isolated; it shares no backend files.

---

## Evidence and accepted boundary

Read-only source basis: clean `batch-4-planning` at
`1fde21d6c9fbd0578c6bb0f8349d975c629b1bc4`. No repository code was changed and no project tests were
run while preparing this packet.

Current production flow:

1. `cli.ts:writeRelationships` and `rules/check.ts:readRelationshipOutcome` call
   `relationships/index.ts:extractRelationships` over a materialized immutable candidate.
2. `typescript.ts:importSites` records every import. `resolveDependency` calls
   `ts.resolveModuleName`; every undefined result currently throws `TypeScript import unresolved`.
3. `extractTypeScriptRelationships` emits forward selectors, then reverse selectors; K2–K6, F1 and
   REL-EXTRACT all share that extraction result. `checkCandidate` records a thrown extraction as
   unevaluated and sets `allowed: false` even in observe mode.
4. The existing production CLI test in `relationships.test.ts`, “refuses absent, unreadable,
   malformed, unresolved and failed TypeScript inputs distinctly,” is the exact unresolved-real-module
   oracle and must remain byte-for-byte meaningful.

Retained standalone compiler probe against `apps/wbs/fe-01/tsconfig.app.json`:

- `ts.resolveModuleName('./styles.css', main.tsx, ...)` returned no resolved module.
- `program.getTypeChecker().getSymbolAtLocation()` on that exact string literal returned symbol
  `"*.css"`, declared as a `ModuleDeclaration` in `node_modules/vite/client.d.ts`.
- `ts.getPreEmitDiagnostics(program)` was empty.
- declaration-only emit for `main.tsx` retained `import './styles.css';` in `main.d.ts`.

The exact source, command, stdout, empty stderr, exit 0, hashes and elapsed time are retained at:

- `/tmp/puni-codex-resume-20260921/ambient-compiler-probe.ts`
- `/tmp/puni-codex-resume-20260921/ambient-compiler-probe.stdout`
- `/tmp/puni-codex-resume-20260921/ambient-compiler-probe.stderr`
- `/tmp/puni-codex-resume-20260921/ambient-compiler-probe-evidence.md`

This was a read-only compiler API probe, not a project test, Nx target, build, or gate. Its provenance
records Bun 1.4.2, installed package metadata 6.0.2, and the loaded compiler's own `ts.version` value
6.0.3; do not conflate the package pin/metadata with that exported runtime string.

The last fact requires the ambient decision to work both for the original program AST and when walking
an emitted declaration. The emitted AST is synthetic and has no checker binding; resolve it through the
matching bound import site in the original source file. Do not treat an unbound emitted import as ambient
on its own.

## File ownership

| File                                                                             | Responsibility in this packet                                                                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `openspec/changes/twilight-bureaucrat-kind-rules/specs/bureaucrat-rules/spec.md` | Add the missing observable ambient-import contract and fail-closed scenario.                                                                           |
| `openspec/changes/twilight-bureaucrat-kind-rules/tasks.md`                       | Append one unchecked Part F TDD task before implementation; check it only after evidence exists.                                                       |
| `openspec/changes/twilight-bureaucrat-kind-rules/verify.md`                      | Record actual RED/mutation/GREEN commands and outputs after execution; never pre-fill proposed observations as facts.                                  |
| `apps/wiki/cli/src/relationships/typescript.ts`                                  | Identify a compiler-bound ambient module and explicitly omit it from selector construction/declaration traversal.                                      |
| `apps/wiki/cli/src/relationships/relationships.test.ts`                          | Production `extract-relationships` CLI contract: accepted ambient import, no fake selectors, retained declaration text, unmatched real module refusal. |
| `apps/wiki/cli/src/rules/rules.test.ts`                                          | Production `check` CLI contract: graph rules evaluate with ambient CSS and remain unevaluated/disallowed when compiler support is absent.              |

No final change is expected in `contracts/records.ts`, `relationships/index.ts`, `rules/check.ts`,
`rules/registry.ts`, report schemas, frontend source/config, or the standalone package trust list.
Task 4 mutates `rules/check.ts` only to observe F5, then restores it byte for byte; its evidence belongs
only in `verify.md`, so that file must not appear in the final diff or commit.

### Required OpenSpec disposition

The existing B2 delta says aliases/barrels resolve but does not state what an import accepted only by an
ambient module means in the graph. That is observable relationship and verdict behavior, so amend the
existing delta before production code. Add this requirement (or equivalent text with the same tests):

```markdown
### Requirement: Compiler-supported ambient non-code imports have no dependency target

When file/module resolution finds no target for an import but the configured TypeScript program binds
that exact import expression to an ambient module declaration, relationship extraction SHALL omit the
import from forward and reverse dependency selectors. It SHALL NOT invent a candidate or external
target. An unresolved import with no such compiler binding SHALL fail relationship extraction; every
selected rule that needs the graph SHALL be unevaluated and the verdict SHALL be disallowed in every
mode.

#### Scenario: Ambient stylesheet import is compiler-supported without an asset file

- **GIVEN** a configured program whose ambient declarations accept `import './styles.css'` and whose
  candidate contains no file at that path
- **WHEN** Twilight Bureaucrat extracts TypeScript relationships
- **THEN** extraction succeeds and contains no forward or reverse selector for that stylesheet

#### Scenario: Similar unresolved module has no ambient support

- **GIVEN** the same candidate imports `./absent` and no compiler declaration binds that expression
- **WHEN** a graph-dependent rule evaluates the candidate
- **THEN** extraction names the unresolved source and specifier, the rule is unevaluated, and the
  candidate is disallowed even in observe mode
```

The current proposal already scopes B2 import-graph behavior and needs no architecture change. Append
Part F to `tasks.md`; add an actual-results section to `verify.md` only during execution.

---

### Task 1: Amend the active B2 contract

**Files:**

- Modify: `openspec/changes/twilight-bureaucrat-kind-rules/specs/bureaucrat-rules/spec.md`
- Modify: `openspec/changes/twilight-bureaucrat-kind-rules/tasks.md`

**Interfaces:**

- Consumes: existing B2 “Kind direction over the import graph” contract and fail-closed verdict policy.
- Produces: the requirement above and task `6.1`, which Tasks 2–4 implement and verify.

- [ ] **Step 1: Add the requirement and two scenarios verbatim in substance.**

Place it after “Kind direction over the import graph”; it constrains the graph that K2–K6/F1 consume.

- [ ] **Step 2: Append the unchecked implementation task.**

```markdown
## 6. Part F — compiler-supported ambient non-code imports

- [ ] 6.1 Omit an unresolved-by-file import only when the configured compiler binds its exact import
      expression to an ambient module declaration; preserve unresolved-module failure and graph-dependent
      unevaluated verdicts — tests: ambient selector omission, emitted declaration traversal, unmatched
      import refusal, and production check evaluation; negatives F1 through F5 separately remove semantic
      admission, fabricate a target, broaden admission, require physical existence, and turn extraction
      failure into an empty graph.
```

- [ ] **Step 3: Validate the amended artifact before code.**

Run:

```sh
bunx @fission-ai/openspec@1.12.0 validate twilight-bureaucrat-kind-rules --strict --json
```

Expected: exit 0 and the named change valid. If the installed CLI accepts only `validate --all`, use the
repository's existing strict command and record the exact invocation; do not weaken validation.

- [ ] **Step 4: Commit the spec-only slice.**

```sh
git add openspec/changes/twilight-bureaucrat-kind-rules/specs/bureaucrat-rules/spec.md \
  openspec/changes/twilight-bureaucrat-kind-rules/tasks.md
git commit -m "spec(bureaucrat): define ambient import relationships"
```

### Task 2: Lock the extractor contract with production CLI tests

**Files:**

- Modify: `apps/wiki/cli/src/relationships/relationships.test.ts`

**Interfaces:**

- Consumes: existing `createRepository`, `write`, `commitAll`, `writeRequestInput`, `invoke`, `report`,
  and `output` test helpers.
- Produces: an acceptance oracle covering original-source extraction, emitted-declaration traversal,
  selector omission, and exact unresolved-module refusal.

- [ ] **Step 1: Add the failing ambient-import test.**

Use the existing real CLI invocation, not a direct call to a new helper:

```ts
test('omits a compiler-supported ambient non-code import without inventing a target', () => {
  const repository = createRepository();
  write(repository, 'packages/apps/consumer/src/non-code.d.ts', "declare module '*.css';\n");
  write(
    repository,
    'packages/apps/consumer/src/use.ts',
    "import './styles.css';\n" +
      "import publicDefault, { type PublicThing } from '../../../provider/src/index';\n" +
      'export const use = (value: PublicThing) => value.nested.code + publicDefault().length;\n',
  );
  const requestPath = writeRequestInput(repository, {
    schemaVersion: 1,
    typescript: {
      configPaths: ['config/tsconfig.json'],
      publicEntrypoints: ['packages/apps/consumer/src/use.ts'],
    },
  });
  const invocation = invoke(repository, commitAll(repository, 'ambient stylesheet'), requestPath);
  expect(invocation.exitCode, output(invocation)).toBe(0);
  const extracted = report(invocation);
  expect(
    extracted.typescript.imports.filter(({ specifier }) => specifier === './styles.css'),
  ).toEqual([]);
  expect(
    extracted.typescript.reverseEdges.filter(({ provider }) => provider.endsWith('/styles.css')),
  ).toEqual([]);
  const declaration = extracted.typescript.publicDeclarations[0];
  expect(declaration.entrypoint).toBe('packages/apps/consumer/src/use.ts');
  expect(declaration.declarations.map(({ text }) => text).join('\n')).toContain(
    "import './styles.css';",
  );
}, 20_000);
```

Current expected RED: exit 1 with
`TypeScript import unresolved: packages/apps/consumer/src/use.ts -> './styles.css'`. The retained
declaration assertion prevents an implementation that fixes only the original AST and still fails while
walking emitted declarations. The fixture intentionally has no `styles.css` blob: this is the oracle
against an `existsSync` gate and proves the accepted virtual-module behavior.

- [ ] **Step 2: Strengthen the existing unresolved-real-module case.**

In its `unresolvedRepository`, add:

```ts
write(
  unresolvedRepository,
  'packages/apps/consumer/src/non-code.d.ts',
  "declare module '*.css';\n",
);
```

Keep the existing `import type { Missing } from './absent'` and exact
`TypeScript import unresolved: ... -> './absent'` assertion. This rejects “an ambient declaration exists,
therefore every unresolved import is harmless.”

- [ ] **Step 3: Run only the two extractor oracles and observe RED.**

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test \
  apps/wiki/cli/src/relationships/relationships.test.ts \
  --test-name-pattern 'ambient non-code|refuses absent, unreadable, malformed, unresolved'
```

Expected before implementation: ambient case fails with the exact CSS unresolved message; the strengthened
real-module case passes.

- [ ] **Step 4: Preserve the RED output and leave the test edit uncommitted.**

Record the command, exact CSS unresolved sentence, and failing assertion for `verify.md`. Do not commit a
known-red tree; Task 3 commits the restored GREEN test and implementation together.

### Task 3: Implement semantic ambient admission and explicit omission

**Files:**

- Modify: `apps/wiki/cli/src/relationships/typescript.ts`

**Interfaces:**

- Consumes: `ParsedProject.program`, bound `ts.SourceFile`, and `ImportSite` from `importSites`.
- Produces:

```ts
type DependencyResolution =
  { readonly kind: 'ambient-non-code' } | { readonly kind: 'target'; readonly target: string };
```

`resolveDependency(...)` returns this union. No schema type changes.

- [ ] **Step 1: Retain the import-expression node.**

Add `moduleSpecifier?: ts.StringLiteralLike` to `ImportSite`. Set it for import/export declarations,
import-equals string expressions, import types, and dynamic string imports. Triple-slash sites leave it
undefined. Do not store a path guessed from text.

```ts
// Add to the corresponding existing ImportSite object in each branch:
moduleSpecifier: node.moduleSpecifier; // import/export declaration
moduleSpecifier: node.moduleReference.expression; // import-equals
moduleSpecifier: node.argument.literal; // import type
moduleSpecifier: node.arguments[0]; // dynamic import after the existing string-literal guard
```

- [ ] **Step 2: Add the bound-site and ambient-symbol predicates.**

```ts
function boundImportSite(sourceFile: ts.SourceFile, site: ImportSite): ImportSite | undefined {
  if (site.moduleSpecifier?.getSourceFile() === sourceFile) return site;
  return importSites(sourceFile).find(
    (candidate) =>
      candidate.specifier === site.specifier &&
      candidate.importKind === site.importKind &&
      candidate.moduleSpecifier !== undefined,
  );
}

function isCompilerSupportedAmbientImport(
  project: ParsedProject,
  sourceFile: ts.SourceFile,
  site: ImportSite,
): boolean {
  const bound = boundImportSite(sourceFile, site);
  if (bound?.moduleSpecifier === undefined) return false;
  const symbol = project.program.getTypeChecker().getSymbolAtLocation(bound.moduleSpecifier);
  const declarations = symbol?.declarations ?? [];
  return (
    declarations.length > 0 &&
    declarations.every(
      (declaration) => ts.isModuleDeclaration(declaration) && ts.isStringLiteral(declaration.name),
    )
  );
}
```

The predicate is reached only after builtin handling and file/module resolution fail. Therefore a real
source or external package still produces its ordinary target even if an ambient declaration overlaps.
The declaration-only walk uses `boundImportSite` to find the original program node; it never trusts a
synthetic node's absent symbol.

- [ ] **Step 3: Return an explicit resolution and handle every caller.**

Convert every successful branch in `resolveDependency` to `{ kind: 'target', target }`. At the current
undefined-module branch:

```ts
if (resolved === undefined) {
  if (isCompilerSupportedAmbientImport(project, sourceFile, site)) {
    return { kind: 'ambient-non-code' };
  }
  const source = workspacePath(workspace, sourceFile.fileName) ?? sourceFile.fileName;
  throw new Error(`TypeScript import unresolved: ${source} -> '${site.specifier}'`);
}
```

In `extractTypeScriptRelationships`, `continue` on `ambient-non-code` before constructing the selector.
In `declarationDependencies`, flat-map only `target` resolutions. For source reference directives, assert
the returned kind is `target`; their existing dedicated unresolved branches cannot produce ambient.
Do not encode an ambient sentinel into `imports`, `reverseEdges`, manifest inputs, or public declarations.

- [ ] **Step 4: Run the focused extractor tests to GREEN.**

Run the Task 2 command. Expected: both named cases pass; the ambient selector arrays are empty and the
emitted declaration still contains the CSS import text.

- [ ] **Step 5: Perform and record three R5 mutations separately.**

1. **F1 semantic admission:** force `isCompilerSupportedAmbientImport` to return `false`. Ambient test
   fails with the exact CSS unresolved message.
2. **F2 no fabricated target:** replace the ambient result with
   `{ kind: 'target', target: 'external:ambient' }`. Ambient test fails because `typescript.imports`
   contains the CSS selector.
3. **F3 unresolved remains fatal:** return `ambient-non-code` for every undefined module. The strengthened
   `./absent` case exits 0 instead of 1 or loses the exact unresolved sentence.
4. **F4 no existence gate:** temporarily import `existsSync` and `dirname`/`resolve`, and require
   `existsSync(resolve(dirname(sourceFile.fileName), site.specifier))` before returning
   `ambient-non-code`. The supported virtual stylesheet test fails with the exact CSS unresolved message.

Restore after each mutation, rerun GREEN, and add adjacent `Proof:` comments at the semantic predicate,
selector omission, ambient return (including F4), and unresolved throw with the exact test/result/date.
Never combine faults in one run and do not retain the temporary filesystem/path imports.

- [ ] **Step 6: Commit the extractor slice.**

```sh
git add apps/wiki/cli/src/relationships/typescript.ts \
  apps/wiki/cli/src/relationships/relationships.test.ts
git commit -m "fix(bureaucrat): admit ambient non-code imports"
```

### Task 4: Prove graph-rule evaluation and fail-closed verdicts

**Files:**

- Modify: `apps/wiki/cli/src/rules/rules.test.ts`

**Interfaces:**

- Consumes: existing `createKindedCandidate`, `runCli`, `writeCompleteRulePolicy`, `verdictOf`, and
  `everyRuleObserving`.
- Produces: production `check` CLI evidence for both semantic admission and absent support.

- [ ] **Step 1: Add a full-rule ambient candidate case.**

Create one candidate with these sources:

```ts
{
  'src/non-code.d.ts': "declare module '*.css';\n",
  'src/m/m.feature.ts':
    "import './styles.css';\nexport const run = (): number => 1;\n",
}
```

Give this test and the unsupported variant in Step 2 an explicit `30_000` timeout. The supported
candidate intentionally has no `src/m/styles.css`; an existence-gated implementation must fail it.

Run the production CLI without `--rule` and assert:

```ts
expect(invocation.exitCode, `${stdoutOf(invocation)}${stderrOf(invocation)}`).toBe(0);
const verdict = verdictOf(invocation);
expect(verdict.unevaluated).toEqual([]);
expect(
  verdict.findings.filter(({ ruleId }) =>
    ['F1', 'K2', 'K3', 'K4', 'K5', 'K6', 'REL-EXTRACT'].includes(ruleId),
  ),
).toEqual([]);
expect(verdict.allowed).toBe(true);
```

MOD-LAYOUT may report observe-mode debt because the compact fixture has no module-local index/contract;
do not assert all findings empty. The assertion is that all graph consumers evaluated and the stylesheet
did not become a target.

- [ ] **Step 2: Add the same candidate without its ambient declaration.**

Start from the supported source set, remove `non-code.d.ts`, **add**
`'src/m/styles.css': ':root { color: black; }\n'`, run all rules, and assert exit 1,
`allowed: false`, no graph findings, and unevaluated entries for exactly F1, K2–K6, and REL-EXTRACT, each
carrying:

```text
TypeScript import unresolved: src/m/m.feature.ts -> './styles.css'
```

This proves “unknown” does not become a clean graph merely because the non-TypeScript asset exists.

- [ ] **Step 3: Run the focused rule cases.**

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test \
  apps/wiki/cli/src/rules/rules.test.ts \
  --test-name-pattern 'ambient non-code|ambient declaration'
```

Expected: both pass; supported candidate exit 0, unsupported candidate exit 1 with structured
unevaluated rules.

- [ ] **Step 4: Perform R5 mutation F5.**

Temporarily change `readRelationshipOutcome`'s catch in `rules/check.ts` to return an empty successful
relationship report, or equivalently make `graphRule` treat its failed outcome as observed empty. Run only
the unsupported-ambient case. Expected failure: exit becomes 0 and/or the seven required unevaluated
entries disappear. Restore `rules/check.ts` exactly and rerun GREEN. Record the mutation and restoration
only in `verify.md`; do not add or alter a `Proof:` comment on this unchanged production branch.

- [ ] **Step 5: Commit the rule-path proof.**

```sh
git add apps/wiki/cli/src/rules/rules.test.ts
git commit -m "test(bureaucrat): keep ambient graph failures unevaluated"
```

Confirm `git diff -- apps/wiki/cli/src/rules/check.ts` is empty before committing. Record F5's injected
change, failing assertion and byte-for-byte restoration only in `verify.md`; the production branch and its
existing proof comment are unchanged, so adding a new comment would falsely imply code ownership.

### Task 5: Close B2 verification

**Files:**

- Modify: `openspec/changes/twilight-bureaucrat-kind-rules/tasks.md`
- Modify: `openspec/changes/twilight-bureaucrat-kind-rules/verify.md`

**Interfaces:**

- Consumes: restored GREEN tree and the four mutation logs.
- Produces: checked task 6.1 and an auditable verification record; no package publication/activation.

- [ ] **Step 1: Run focused suites uncached.**

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test \
  apps/wiki/cli/src/relationships/relationships.test.ts
TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test \
  apps/wiki/cli/src/rules/rules.test.ts
```

- [ ] **Step 2: Run the owning project checks.**

```sh
NX_DAEMON=false bunx nx run twilight-bureaucrat:test --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck
NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source
NX_DAEMON=false bunx nx run twilight-bureaucrat:build
NX_DAEMON=false bunx nx run twilight-bureaucrat:test:package --skip-nx-cache
```

The package test is load-bearing because `typescript.ts` is bundled into the separately runnable
validator. If any required tool is unavailable, leave 6.1 unchecked and record the exact block.

- [ ] **Step 3: Run repository artifact validation and format check.**

```sh
bunx @fission-ai/openspec@1.12.0 validate --all --json
NX_DAEMON=false bunx nx format:check --all
```

- [ ] **Step 4: Record evidence and check 6.1.**

Append exact date, command, exit, pass counts, and F1–F5 fault/result/restoration to `verify.md`. State
that no full host gate was run unless `bin/h2puni-gate.sh <sha>` actually printed the immutable SHA and
passed. Mark 6.1 complete only after all required commands and five separate mutations pass.

- [ ] **Step 5: Commit verification.**

```sh
git add openspec/changes/twilight-bureaucrat-kind-rules/tasks.md \
  openspec/changes/twilight-bureaucrat-kind-rules/verify.md
git commit -m "docs(bureaucrat): verify ambient import extraction"
```

- [ ] **Step 6: Run the immutable host gate on the final SHA.**

```sh
bin/h2puni-gate.sh "$(git rev-parse HEAD)"
```

Accept only output that names that exact SHA and exits 0. Exit 65 means the shared gate tree is dirty;
report the named files and do not clean them. Do not amend or create another commit after the passing gate
without gating the new final SHA.

## Self-review

- **Spec coverage:** supported ambient import, no fabricated selector/target, emitted-declaration walk,
  unresolved real module, graph consumers evaluated, and extraction failure disallowed are each owned by
  a named production CLI test and mutation.
- **Scope:** no frontend change, asset existence rule, extension list, schema field, new capability,
  package release, or Bureaucrat prerequisite 2–6 enters this packet.
- **Type consistency:** `DependencyResolution` is handled exhaustively at both callers;
  `ImportSite.moduleSpecifier` is optional only for reference directives; emitted sites resolve through
  their original bound source site.
- **Known limits:** TypeScript ambient declarations can intentionally describe virtual modules. This
  packet follows the configured compiler's semantic binding and does not decide whether a build tool can
  load that module. Missing compiler support remains visible and fatal. The accepted requirement resolves
  every design choice in this packet; no user decision is pending.
