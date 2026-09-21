# Bureaucrat JSON Declaration Omission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let relationship extraction accept TypeScript's declaration-only omission of imported JSON only when every candidate TypeScript declaration was emitted, while retaining JSON graph edges and refusing a JSON-bearing public declaration surface that has no stable identity.

**Architecture:** Keep the existing compiler program, `ResolvedDeclaration` model and production CLI. For ordinary configs, classify JSON with the public `SourceFile.flags & ts.NodeFlags.JsonFile` API, deliberately omit only those sources, and call the public targeted `Program.emit(sourceFile, ..., true)` for every non-JSON, non-declaration candidate source. Every targeted emit must produce that source's mapped declaration. Keep a separate compatibility path for the measured single-source `outFile` case and explicitly refuse multi-source bundles. Do not synthesize a `.d.ts` or a dependency target for JSON.

**Tech Stack:** Bun 1.4.2, TypeScript 6.0.3 through the installed `typescript` alias, Bun test, Nx, OpenSpec 1.12.0.

**Spec:** `openspec/changes/twilight-bureaucrat-kind-rules/specs/bureaucrat-rules/spec.md`; accepted scope in `docs/superpowers/plans/2026-09-21-batch-4/adoption-tail-map.md` at `f1392c01`.

## Global constraints

- Basis is Batch 4 integration `d749c2c77b148effc4f17effb7d05fa5f1cd6c79`.
- Preserve `tools/tool-fleet/tsconfig.lib.json` including `../../infra/local/vm-lab.ts`.
- Never turn `emitSkipped` into success. JSON is excluded before targeted emit; every emit that actually runs must complete with its declaration output.
- Use only public TypeScript types: `Node.flags` and `ts.NodeFlags.JsonFile` are public. Do not use runtime-only `isJsonSourceFile`, `getOutputPathsFor`, or undeclared `SourceFile.scriptKind`; do not cast to internal compiler types.
- Retain every source import selector and reverse edge to real JSON. The declaration exception concerns emit coverage only.
- A JSON import erased from the emitted `.d.ts` is implementation-only. A JSON import retained in an emitted `.d.ts` is a public dependency and must be given a stable content identity or refused explicitly. This packet chooses explicit refusal; it does not widen the report schema.
- Preserve absent, unreadable, malformed, unresolved-import and genuine compiler-error refusals.
- Every new guard receives a production-CLI mutation proof, saved bytes, `cmp` restoration and a separate green.
- Do not claim F1/K2–K6 evaluation for the repository tools scope. Rule-policy and inventory prerequisites 3 and 4 still own that work.
- Full `bin/h2puni-gate.sh` belongs to final integrated closure.

## Measured basis and evidence limits

The supplied probes under `/tmp/puni-codex-resume-20260921` establish:

- `fleet-declaration-probe.{ts,jsonl,stderr}`: the full tool-fleet program emitted 38 outputs and returned `emitSkipped: true` with no diagnostics; removing only `infra/local/vm-lab.ts` emitted 37 and still skipped.
- `fleet-declaration-source-probe.{ts,json,stderr}`: all 38 TypeScript sources, including `vm-lab.ts`, emitted individually; only `infra/fleet/schemas/operation-plan.json` skipped with zero output and zero diagnostics.
- Current source inspection at `d749c2c7`: `plan.ts` imports that JSON through `@tools/fleet-operation-plan-schema`; `tsconfig.base.json` enables `resolveJsonModule` and maps that alias; no repository tsconfig declares `outFile`.
- `json-public-closure-probe.{ts,jsonl,stderr,exit}`: with the installed public compiler API, an implementation-only JSON import emits `export declare const kind: string;`; a public `typeof schema` surface emits `import schema from './schema.json'`. Both whole-program emissions return `emitSkipped: true` with no diagnostics.
- `json-outfile-probe.{ts,json,stderr,exit}` was compiler-API exploration with several pre-emit diagnostics, so it is not a production baseline. The corrected production-CLI probes are `outfile-production-baseline-rootdir.{stdout,stderr,exit}` and `outfile-production-json-rootdir.{stdout,stderr,exit}`: a one-source System/outFile project with explicit `rootDir` exits 0 and publishes `dist/bundle.d.ts`; adding `resolveJsonModule` and JSON exits 1 with exactly `Option '--resolveJsonModule' cannot be specified when 'module' is set to 'none', 'system', or 'umd'.`
- `outfile-production-multi-rootdir.{stdout,stderr,exit}`: the same production CLI and valid System/outFile options with `src/index.ts` and `src/second.ts` exit 0 today, while the report associates `dist/bundle.d.ts` only with `src/index.ts`. `outfile-callback-source-probe.{ts,json,stderr,exit}` observes that the public emit callback for that output contains both source paths, no pre-emit or emit diagnostics, and `emitSkipped: false`. This is the measured false-success baseline and executable discriminator for the explicit multi-source refusal.
- `fleet-plan-declaration-probe.{ts,json,stderr,exit}`: targeted public emit of the real `tools/tool-fleet/src/plan.ts` succeeds with no diagnostics and its declaration contains only the contracts type import; the operation-plan JSON import is erased. This resolves the packet's real-tree public-closure premise without claiming whole-program extraction.

The supplied fleet probes were compiler-API observations, not production CLI or whole-project gates. The outFile artifacts are production-CLI measurements against `d749c2c7`; their temporary candidate revision/tree identities are visible in stdout. The packet below turns both classes of evidence into maintained tests.

## Ownership

| File                                                                             | Responsibility in this slice                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openspec/changes/twilight-bureaucrat-kind-rules/specs/bureaucrat-rules/spec.md` | State complete non-JSON declaration coverage, real JSON graph edges and explicit refusal for an unsupported JSON public surface.                                                               |
| `openspec/changes/twilight-bureaucrat-kind-rules/tasks.md`                       | Add one unchecked next-numbered task, then check it only after all proofs and final validation. Preserve every pre-existing task and its current checked state exactly.                        |
| `openspec/changes/twilight-bureaucrat-kind-rules/verify.md`                      | Record immutable commits, reds, mutations, restores, greens, exact commands and limitations.                                                                                                   |
| `apps/wiki/cli/src/relationships/relationships.test.ts`                          | Own all synthetic committed-candidate and production CLI behavior tests. Reuse `createRepository`, `write`, `commitAll`, `writeRequestInput`, `invoke` and `report`; create no second harness. |
| `apps/wiki/cli/src/relationships/typescript.ts`                                  | Classify JSON inputs, enforce declaration completeness, retain source graph resolution, and refuse an unrepresented JSON dependency in a public closure.                                       |

No config, fleet source, relationship schema, CLI route, rule adapter or package file changes ownership in this prerequisite.

## Resolved design choice and rejected alternatives

This prerequisite uses the smallest safe contract: JSON may participate in the source import graph but is not a declaration output. If the compiler erases the JSON import from the public `.d.ts`, extraction succeeds after complete TypeScript coverage. If the emitted `.d.ts` retains the JSON import, extraction refuses with its source and JSON target.

Two broader alternatives are deliberately outside this slice:

1. Adding raw JSON bytes or a JSON content hash to `PublicDeclarationSelector` would provide a public-surface identity, but changes the exported report schema and all consumers.
2. Synthesizing a `.d.ts` from JSON would make Bureaucrat a declaration generator and risks disagreeing with compiler inference.

Neither is needed for tool-fleet's current public surface. If a later accepted requirement needs JSON in a public declaration closure, open a separate observable-contract change and choose the first approach; do not silently switch this packet.

Bundled/outFile configs use a separate compatibility path. Production CLI measurement proves the current one-source System/outFile fixture succeeds and maps `dist/bundle.d.ts`; the same fixture with JSON is rejected during existing pre-emit diagnostics. Multi-source bundles are not representable by the current one-source `ResolvedDeclaration` mapping, so this packet makes that unsupported case an explicit refusal rather than marking every callback source complete while mapping only `sourceFiles[0]`. No current repository tsconfig uses `outFile`.

---

### Task 1: Amend the existing B2 OpenSpec change

**Files:**

- Modify: `openspec/changes/twilight-bureaucrat-kind-rules/specs/bureaucrat-rules/spec.md`
- Modify: `openspec/changes/twilight-bureaucrat-kind-rules/tasks.md`
- Modify: `openspec/changes/twilight-bureaucrat-kind-rules/verify.md`

**Interfaces:**

- Consumes: the existing `Kind direction over the import graph` requirement and the tasks file exactly as it exists when this branch is rebased.
- Produces: one new declaration-JSON requirement and the next numbered task. Every existing task state is unchanged by this branch.

- [ ] **Step 1: Add the delta requirement before implementation.**

Append this requirement after the ambient non-code requirement, using the next heading position present at execution time:

```markdown
### Requirement: Declaration extraction distinguishes non-emitting JSON inputs

When TypeScript declaration-only emit receives a compiler-recognized JSON source, relationship extraction SHALL omit that source from targeted declaration emit and SHALL succeed only if every non-declaration, non-JSON candidate source emits its own mapped declaration and pre-emit compiler diagnostics are empty. The real JSON source SHALL remain in forward and reverse import selectors. A JSON dependency retained by an emitted public declaration SHALL be refused by source and target unless the public selector carries a stable JSON identity. Other skipped emission and pre-emit compiler diagnostics SHALL remain failures. A bundled declaration whose emit callback names one workspace candidate source SHALL preserve the existing source mapping; a callback naming multiple workspace candidate sources SHALL be refused with the config path and sorted source paths.

#### Scenario: Implementation-only JSON has no declaration output

- **GIVEN** a configured program whose implementation imports a real JSON file and whose public declaration erases that import
- **WHEN** Twilight Bureaucrat extracts relationships
- **THEN** every TypeScript declaration is present, the JSON forward and reverse edges remain, and extraction succeeds

#### Scenario: JSON remains in the public declaration

- **GIVEN** an emitted public declaration that imports a real JSON file
- **WHEN** Twilight Bureaucrat constructs the public declaration closure
- **THEN** it refuses the closure and names the declaration source and JSON target rather than publishing an identity that omits the JSON

#### Scenario: Non-JSON declaration coverage is incomplete

- **GIVEN** a configured non-JSON TypeScript source whose declaration output is absent
- **WHEN** declaration extraction checks the compiler output
- **THEN** it refuses extraction and names the missing source even if emit diagnostics are empty

#### Scenario: Single-source bundled declaration stays supported

- **GIVEN** a valid declaration-only outFile configuration
- **WHEN** its emit callback names one workspace candidate source
- **THEN** relationship extraction preserves the existing bundled declaration mapping for that source

#### Scenario: Multi-source bundled declaration is refused

- **GIVEN** a valid declaration-only outFile configuration
- **WHEN** its emit callback names multiple workspace candidate sources
- **THEN** relationship extraction refuses the bundle and names the config path and sorted candidate source paths
```

- [ ] **Step 2: Add the next part to `tasks.md`.**

Read the current file after rebasing. Preserve every existing line and checked state; if Part G is the next free heading, add:

```markdown
## 7. Part G — declaration-only JSON inputs

- [ ] 7.1 Admit compiler-recognized JSON omission only after complete TypeScript declaration coverage, retain real JSON dependency selectors, and refuse an unrepresented JSON public closure — tests: implementation-only JSON, public JSON closure, compiler failure, and bundled/outFile boundary; negatives G1 through G6 break JSON classification, targeted output mapping, forward/reverse edges, public-closure refusal, diagnostic failure propagation, and bundled-source ownership.
```

- [ ] **Step 3: Add a pending declaration-JSON heading to `verify.md`.** State basis `d749c2c7`, list the six planned proofs, and make no pass claim. Do not describe any earlier part as pending or complete from this packet; copy its current state dynamically.

- [ ] **Step 4: Validate only the named change.**

```bash
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate twilight-bureaucrat-kind-rules --strict --json
```

Expected: exit 0; exactly one item, id `twilight-bureaucrat-kind-rules`, `valid: true`, no issues. Parse and assert those fields with `jq`; an exit code alone is insufficient.

- [ ] **Step 5: Commit the artifact amendment.**

```bash
git add openspec/changes/twilight-bureaucrat-kind-rules/specs/bureaucrat-rules/spec.md \
  openspec/changes/twilight-bureaucrat-kind-rules/tasks.md \
  openspec/changes/twilight-bureaucrat-kind-rules/verify.md
git commit -m 'spec(bureaucrat): define JSON declaration omission'
```

### Task 2: Write production CLI tests before production code

**Files:**

- Modify: `apps/wiki/cli/src/relationships/relationships.test.ts`

**Interfaces:**

- Consumes: the existing committed-candidate production `invoke` helper.
- Produces: five named behavior groups and exact expected diagnostics.

- [ ] **Step 1: Add a fixture helper, not a second repository harness.**

Add a helper near `writeRequestInput`:

```ts
function addJsonDeclarationFixture(repository: string, publicJsonType: boolean): string {
  write(repository, 'packages/provider/src/schema.json', '{"kind":"fleet"}\n');
  write(
    repository,
    'config/tsconfig.json',
    `${JSON.stringify({
      extends: '../tsconfig.json',
      compilerOptions: { resolveJsonModule: true, outDir: '../dist' },
      include: ['../packages/**/*.ts', '../packages/**/*.json'],
    })}\n`,
  );
  write(
    repository,
    'packages/provider/src/json-helper.ts',
    "import schema from './schema.json' with { type: 'json' };\n" +
      (publicJsonType
        ? 'export type Schema = typeof schema;\n'
        : 'export const schemaKind: string = schema.kind;\n'),
  );
  write(
    repository,
    'packages/provider/src/index.ts',
    "export default function publicDefault(): string { return 'public'; }\n" +
      "export { type PublicThing } from './public';\n" +
      "export { type Declared } from './shapes';\n" +
      (publicJsonType
        ? "export type { Schema } from './json-helper';\n"
        : "export { schemaKind } from './json-helper';\n"),
  );
  return writeRequestInput(repository, {
    schemaVersion: 1,
    typescript: {
      configPaths: ['config/tsconfig.json'],
      publicEntrypoints: ['packages/provider/src/index.ts'],
    },
  });
}
```

The existing fixture root already sets `module: 'ESNext'` and `moduleResolution: 'Bundler'`; preserve both and the production-shaped JSON import attribute.

**Corrected by the planner on 2026-09-21 after the first Task 2 attempt stopped.** Two facts the first
version of this helper missed, both measured:

- The helper must EXTEND the fixture's `index.ts`, not replace it. `internal.ts` and the consumer import its
  default export and `PublicThing`; without them both JSON cases failed on pre-emit diagnostics (`has no default
export`, `has no exported member 'PublicThing'`) and never reached declaration emit.
- `outDir` is the trigger. A compiler probe over eight variants (with and without `outDir`, JSON inside or
  outside the package, listed in `include` or not) gave `emitSkipped=false` for every variant without `outDir`
  and `emitSkipped=true`, zero diagnostics, the `.d.ts` still written, for every variant with it: with an output
  directory the compiler wants to copy the JSON beside the output and a declaration-only emit skips that copy.
  tool-fleet's library configuration sets `outDir`; without it this fixture extracted successfully on the
  unchanged code and proved nothing. The production CLI over `tools/tool-fleet/tsconfig.lib.json` on the
  unchanged tree exits 1 with `TypeScript compiler declaration emit failed for tools/tool-fleet/tsconfig.lib.json:`
  and an empty detail.

With both corrections the five named groups gave exactly Step 6's red on the unchanged production code. Because
the entrypoint keeps its existing exports, the implementation-only test expects the whole public closure:
`globals.d.ts`, `hidden.ts`, `index.ts`, `json-helper.ts`, `public.ts`, `shapes.d.ts`.

- [ ] **Step 2: Add the valid implementation-only JSON test.**

Name it `extracts every TypeScript declaration while retaining real JSON dependency edges`. Assert:

```ts
const repository = createRepository();
const requestPath = addJsonDeclarationFixture(repository, false);
const extracted = report(
  invoke(repository, commitAll(repository, 'implementation-only JSON'), requestPath),
);
expect(
  extracted.typescript.imports.filter(({ source }) => source.endsWith('/json-helper.ts')),
).toContainEqual(
  expect.objectContaining({
    source: 'packages/provider/src/json-helper.ts',
    specifier: './schema.json',
    target: 'packages/provider/src/schema.json',
    importKind: 'value',
  }),
);
expect(
  extracted.typescript.reverseEdges.find(
    ({ provider }) => provider === 'packages/provider/src/schema.json',
  )?.importers,
).toContainEqual({
  source: 'packages/provider/src/json-helper.ts',
  specifier: './schema.json',
  importKind: 'value',
});
expect(
  extracted.typescript.publicDeclarations[0]?.declarations.map(({ sourcePath }) => sourcePath),
).toEqual([
  'packages/provider/src/globals.d.ts',
  'packages/provider/src/hidden.ts',
  'packages/provider/src/index.ts',
  'packages/provider/src/json-helper.ts',
  'packages/provider/src/public.ts',
  'packages/provider/src/shapes.d.ts',
]);
expect(
  extracted.typescript.publicDeclarations[0]?.declarations.map(({ text }) => text).join('\n'),
).not.toContain('schema.json');
```

The exact declaration order above is UTF-8 sort order (`index.ts` before `json-helper.ts`). Do not weaken it to `arrayContaining`: declaration completeness is the contract.

- [ ] **Step 3: Add the public JSON closure refusal test.**

Name it `refuses a JSON dependency retained by the public declaration`. Invoke the same fixture with `true`; expect exit 1 and this complete diagnostic substring:

```text
TypeScript public declaration JSON dependency unsupported: packages/provider/src/json-helper.ts -> packages/provider/src/schema.json
```

Also assert stdout is empty. This prevents a partial relationship report.

- [ ] **Step 4: Split or add a dedicated genuine compiler-error test.** Use `MissingType` as the current production fixture does. Assert exit 1, empty stdout, `TypeScript compiler failed:` and `Cannot find name 'MissingType'`. Do not accept the declaration-emit message as a substitute.

- [ ] **Step 5: Add the measured bundled boundaries.** Build each case as a separate repository with a standalone root `tsconfig.json`; do not extend the normal ESNext/Bundler fixture config. Use `module: 'System'`, `moduleResolution: 'Node10'`, `ignoreDeprecations: '6.0'`, `outFile: 'dist/bundle.js'`, explicit `rootDir: '.'`, one ordinary `src/index.ts`, and no JSON. Assert exit 0 and exactly one public declaration mapping `src/index.ts` to `dist/bundle.d.ts`. In a second repository add `resolveJsonModule`, include one JSON import, and assert exit 1, empty stdout and the exact measured option diagnostic:

```text
Option '--resolveJsonModule' cannot be specified when 'module' is set to 'none', 'system', or 'umd'.
```

In a third repository keep the valid non-JSON System/outFile options but add `src/second.ts` to the program. Assert an explicit refusal naming both callback sources because the current report model cannot assign one bundled declaration text to two source identities.

- [ ] **Step 6: Run the five named behavior groups before implementation.**

```bash
cd apps/wiki/cli
TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules \
  bun test src/relationships/relationships.test.ts \
  -t 'extracts every TypeScript declaration|refuses a JSON dependency|genuine compiler error|single-source bundled declaration|multi-source bundled declaration'
```

Expected before implementation:

- implementation-only JSON fails with `TypeScript compiler declaration emit failed ...:` and an empty detail;
- public JSON closure fails at that same too-early generic boundary rather than the specific source/target refusal;
- genuine compiler error passes;
- measured single-source bundle and invalid JSON/outFile cases pass; the new multi-source explicit-refusal assertion fails because current code silently associates the bundle with only `sourceFiles[0]`.

Retain the command, exit, nonzero selected-test count and both JSON mismatches. A missing-module or zero-test run is not the red.

### Task 3: Emit each ordinary TypeScript source and keep bundles separate

**Files:**

- Modify: `apps/wiki/cli/src/relationships/typescript.ts`
- Test: `apps/wiki/cli/src/relationships/relationships.test.ts`

**Interfaces:**

- Consumes: `ParsedProject.program`, `ResolvedDeclaration`, public `Program.emit(sourceFile, ...)` and `ts.NodeFlags.JsonFile`.
- Produces: unchanged `TypeScriptRelationships` wire shape.

- [ ] **Step 1: Add a public-API JSON predicate.**

```ts
function isJsonSource(sourceFile: ts.SourceFile): boolean {
  return (sourceFile.flags & ts.NodeFlags.JsonFile) !== 0;
}
```

Do not inspect suffix alone: the accepted boundary is the configured compiler program's classification.

- [ ] **Step 2: Extract the existing writer mapping without widening it.** Add a helper that targets one ordinary source and records an actual callback output under that requested source. The targeted public `Program.emit(sourceFile, ...)` call supplies the source ownership; do not add callback-source cardinality or multiple-output policies that have no production fixture or accepted requirement. Preserve the current writer's emitted-path normalization. Require an actual callback output and preserve unconditional `emitSkipped` failure. Use:

```ts
function emitSourceDeclaration(
  workspace: string,
  project: ParsedProject,
  sourceFile: ts.SourceFile,
  emitted: Map<string, ResolvedDeclaration>,
): void {
  const sourcePath = workspacePath(workspace, sourceFile.fileName);
  if (sourcePath === undefined) return;
  let output: ResolvedDeclaration | undefined;
  const emission = project.program.emit(
    sourceFile,
    (emittedPath, text) => {
      const normalizedEmitted =
        workspacePath(workspace, emittedPath) ??
        `${sourcePath.slice(0, sourcePath.length - extname(sourcePath).length)}.d.ts`;
      output = { sourcePath, emittedPath: normalizedEmitted, text };
    },
    undefined,
    true,
  );
  if (emission.emitSkipped) {
    throw new Error(
      `TypeScript compiler declaration emit failed for ${project.configPath} source ${sourcePath}: ${emission.diagnostics.map(formatDiagnostic).join('; ') || 'no diagnostic'}`,
    );
  }
  if (output === undefined) {
    throw new Error(
      `TypeScript declaration output missing for ${project.configPath}: ${sourcePath}`,
    );
  }
  emitted.set(sourcePath, output);
}
```

The installed probe already measured targeted emit success for all 38 tool-fleet TypeScript sources. This helper preserves the existing contract: `emitSkipped` always fails and its diagnostics, when any, explain that failure. It does not add a second “emit returned diagnostics without skipping” policy that this JSON slice cannot exercise independently; ordinary compiler errors remain owned by the existing pre-emit diagnostic refusal.

- [ ] **Step 3: Use targeted emit only for ordinary configs.** In `emitDeclarations`, when `project.options.outFile === undefined`, iterate all candidate program sources in deterministic path order. Continue for default/external libraries. Copy local `.d.ts` files exactly as today. Deliberately continue for `isJsonSource(sourceFile)`. Call `emitSourceDeclaration` for every other local non-declaration source. Because each eligible source is invoked and must map itself, no separate callback-source completeness set exists.

- [ ] **Step 4: Preserve the measured single-source bundle and refuse unsupported multi-source ownership.** When `outFile` is defined, call whole-program emit once. Preserve the current writer except that its callback must require exactly one workspace source before mapping the output. After either the targeted or bundled path, keep the existing common loop that copies local `.d.ts` source files into `project.declarations`. If the callback contains two or more workspace sources, throw:

```text
TypeScript bundled declaration has multiple candidate sources for <config>: <sorted paths>
```

Retain the existing `emitSkipped` failure with diagnostic detail. Do not send bundled sources through targeted emit, and do not add JSON accommodation: invalid JSON/outFile remains a pre-emit compiler failure.

- [ ] **Step 5: Preserve JSON edges.** Do not change `resolveDependency`, the import loop, external classification or reverse-edge construction. The valid fixture must prove the JSON target remains a candidate path.

- [ ] **Step 6: Refuse only a missing JSON dependency in the emitted public closure.** Keep the existing behavior for every other path. Replace the final filter with a predicate that throws only when the missing local target is compiler-classified JSON:

```ts
return [...new Set([...dependencies, ...sourceReferences])].filter((path) => {
  if (project.declarations.has(path)) return true;
  const dependency = path.startsWith('external:')
    ? undefined
    : project.program.getSourceFile(resolve(workspace, path));
  if (dependency !== undefined && isJsonSource(dependency)) {
    throw new Error(
      `TypeScript public declaration JSON dependency unsupported: ${declaration.sourcePath} -> ${path}`,
    );
  }
  return false;
});
```

Do not add a general `emitted declaration dependency unresolved` refusal in this JSON slice; that would widen existing behavior without an accepted requirement.

- [ ] **Step 7: Run the named behavior groups.** Expected: all pass, with the valid case publishing exact JSON edges and the complete two-file public closure; single-source bundle passes, multi-source bundle refuses, and JSON/outFile stays a pre-emit refusal.

- [ ] **Step 8: Run the entire relationship production CLI file.**

```bash
cd apps/wiki/cli
TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules \
  bun test src/relationships/relationships.test.ts
```

Expected: all existing and new tests pass; record exact totals.

- [ ] **Step 9: Commit production and test code.**

```bash
git add apps/wiki/cli/src/relationships/typescript.ts \
  apps/wiki/cli/src/relationships/relationships.test.ts
git commit -m 'fix(bureaucrat): admit JSON declaration omission'
```

### Task 4: Watch the six production-path negatives

**Files:**

- Mutate and restore: `apps/wiki/cli/src/relationships/typescript.ts`
- Proof comments: `apps/wiki/cli/src/relationships/relationships.test.ts`

Save both files before the first mutation. Apply one fault at a time, save the exact diff, run only the named oracle, require exit 1 with a nonzero test count, restore saved bytes, `cmp`, and run a separate green.

| Proof                         | One injected fault                                                                                                                                                                             | Named oracle and decisive mismatch                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 JSON classification        | Make `isJsonSource` return `false`                                                                                                                                                             | targeted emit is attempted for `schema.json` and the valid case receives `declaration emit failed ... schema.json: no diagnostic` instead of exit 0 |
| G2 complete TS mapping        | Inside the writer callback passed to `project.program.emit`, return before assigning `output` when `sourcePath` ends with `/json-helper.ts`; do not return from `emitSourceDeclaration` itself | valid case receives `TypeScript declaration output missing ... json-helper.ts`; empty diagnostics cannot make it green                              |
| G3 forward/reverse JSON graph | Skip JSON targets in the existing import loop                                                                                                                                                  | valid case loses the exact forward edge and JSON provider reverse edge                                                                              |
| G4 public closure             | Change the JSON-dependency throw to `return false`                                                                                                                                             | public JSON fixture exits 0 and publishes an identity that omitted `schema.json`                                                                    |
| G5 compiler diagnostics       | Remove the existing `ts.getPreEmitDiagnostics` refusal                                                                                                                                         | dedicated `MissingType` fixture exits 0 or reaches the targeted emit boundary instead of `TypeScript compiler failed:`                              |
| G6 bundled ownership          | Remove the multi-source callback refusal and map only `sourceFiles[0]`                                                                                                                         | two-source outFile fixture exits 0 with a partial source identity instead of the explicit bundled refusal                                           |

G2 is a proof-only writer fault; final production must never name `json-helper.ts`. G5 covers the unchanged pre-emit diagnostic boundary. No new guard accepts emission diagnostics: the implementation retains the existing pre-emit diagnostic refusal and the existing unconditional `emitSkipped` refusal, which reports any associated emit diagnostics. No global empty-diagnostic/no-JSON `emitSkipped` exception is introduced: ordinary sources use targeted emit and every targeted `emitSkipped`, including G1's JSON misclassification, is a failure. The bundled path retains the same unconditional skip refusal. Therefore there is no permissive no-JSON or empty-diagnostics success guard to mutate; do not claim one.

Add adjacent `Proof:` comments at the exact assertions or guards only after observing each red. Record any unexpected failure and refine the oracle before claiming proof.

After every restore, run:

```bash
cmp apps/wiki/cli/src/relationships/typescript.ts "$EVIDENCE/typescript.passing.ts"
cmp apps/wiki/cli/src/relationships/relationships.test.ts "$EVIDENCE/relationships-test.passing.ts"
```

Both must exit 0. Then rerun the owning named test and save the green.

Commit only truthful proof comments:

```bash
git add apps/wiki/cli/src/relationships/typescript.ts \
  apps/wiki/cli/src/relationships/relationships.test.ts
git commit -m 'test(bureaucrat): prove JSON declaration boundaries'
```

### Task 5: Prove tool-fleet through the production CLI and close only this prerequisite

**Files:**

- Modify: `openspec/changes/twilight-bureaucrat-kind-rules/tasks.md`
- Modify: `openspec/changes/twilight-bureaucrat-kind-rules/verify.md`
- Temporary only: `$EVIDENCE/tool-fleet-relationships-request.json`

**Interfaces:**

- Consumes: committed candidate selection and current `tools/tool-fleet/tsconfig.lib.json`.
- Produces: durable evidence; no repository relationship or policy artifact.

- [ ] **Step 1: Create the temporary request.**

```json
{
  "schemaVersion": 1,
  "typescript": {
    "configPaths": ["tools/tool-fleet/tsconfig.lib.json"],
    "publicEntrypoints": ["tools/tool-fleet/src/plan.ts"]
  }
}
```

- [ ] **Step 2: Invoke the real committed-candidate CLI at the immutable implementation SHA.**

The materializer requires trusted modules outside the candidate checkout. Before the command, set
`TOOL_WIKI_EXTERNAL_MODULES` to the Bun-installed `node_modules` of the unchanged integration clone
or activation archive, then prove its real path is outside this implementation lane:

```bash
repo_root=$(realpath "$PWD")
trusted_modules=$(realpath "${TOOL_WIKI_EXTERNAL_MODULES:?set an installed node_modules outside this lane}")
case "$trusted_modules/" in
  "$repo_root/"*) printf '%s\n' 'trusted modules are inside the candidate' >&2; exit 1 ;;
esac
TOOL_WIKI_TRUSTED_NODE_MODULES="$trusted_modules" \
  bun apps/wiki/cli/src/cli.ts extract-relationships committed "$repo_root" \
  "$(git rev-parse HEAD)" "$EVIDENCE/tool-fleet-relationships-request.json" \
  > "$EVIDENCE/tool-fleet-relationships.json" \
  2> "$EVIDENCE/tool-fleet-relationships.stderr"
```

Assert with `jq`:

- the command exited 0 and stdout is one valid JSON document;
- one import selector has source `tools/tool-fleet/src/plan.ts`, specifier `@tools/fleet-operation-plan-schema`, target `infra/fleet/schemas/operation-plan.json`, kind `value`;
- that JSON provider's reverse edge names `plan.ts`;
- exactly one public selector exists for `plan.ts`, contains a nonempty declaration list and none of its declaration texts imports the operation-plan JSON;
- at least one TypeScript import selector has source `infra/local/vm-lab.ts`, proving the wrapper stayed in the configured program;
- stderr is empty.

Do not infer that all rules evaluated. This command proves only extraction and selected public closure.

- [ ] **Step 3: Run final scoped and packaged checks.**

```bash
NX_DAEMON=false bunx nx run twilight-bureaucrat:typecheck --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-bureaucrat:lint:source --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-bureaucrat:test --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-bureaucrat:build --skip-nx-cache
NX_DAEMON=false bunx nx run twilight-bureaucrat:test:package --skip-nx-cache
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate twilight-bureaucrat-kind-rules --strict --json
GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx format:check --all
```

Record exact exits and test counts. The whole project test sets `TOOL_WIKI_TRUSTED_NODE_MODULES`; do not substitute a bare root `bun test`. `twilight-bureaucrat:test:package` is required because the bundled standalone compiler path is load-bearing. `tool-devsync:test` remains outside this five-file slice; do not run it and record it as skipped by scope. Do not run raw full Nx gates.

- [ ] **Step 4: Record evidence and close only the newly added declaration-JSON task.** Check its actual rebased task number. Preserve every pre-existing task at the state found after rebasing; do not infer an earlier part's state from this packet. In `verify.md`, include:

- immutable implementation and proof-comment SHAs;
- initial production reds and their nonzero selected-test counts;
- the six mutations with exact changed expression, named test, mismatch, restoration `cmp`, and green count;
- final relationship-file, whole-project and packaged-test totals;
- production tool-fleet command plus all `jq` assertions;
- supplied probe provenance, including the valid one-source and false-success multi-source production outFile baselines, and the fact that no emitted files were written;
- `vm-lab.ts` remained included;
- no public JSON identity support was added; the unsupported surface refuses;
- deferred host gate and any skipped package/devsync checks.

- [ ] **Step 5: Revalidate and commit only the two closure documents.**

```bash
git add openspec/changes/twilight-bureaucrat-kind-rules/tasks.md \
  openspec/changes/twilight-bureaucrat-kind-rules/verify.md
git commit -m 'docs(bureaucrat): close JSON declaration prerequisite'
```

## Stop conditions

Stop for review rather than widening scope if:

- a targeted non-bundled emit cannot associate its one declaration output with exactly the requested source through the public callback;
- a current valid `outFile` config differs from the measured single-source success or explicit multi-source refusal;
- satisfying a test requires changing `RelationshipRequest`, `PublicDeclarationSelector`, `ResolvedDeclaration`, a JSON schema, a fleet config/source, or any rule adapter;
- the production tool-fleet run depends on prerequisite 3 or 4 rather than succeeding as direct relationship extraction.

These are technical scope boundaries, not new user decisions. A schema-bearing JSON public identity would need a separately reviewed observable contract; the current requirement is fully satisfied by explicit refusal.

## Self-review

- Spec coverage: valid targeted JSON omission, one mapped declaration per ordinary TypeScript source, real forward/reverse JSON edges, public JSON refusal, genuine compiler failure, measured single-source bundle compatibility, multi-source bundle refusal and real tool-fleet extraction each have a named task and oracle.
- R5 coverage: G1–G6 cover every new branch. Ordinary targeted `emitSkipped` always fails, so no empty-diagnostics or no-JSON success guard exists.
- Type consistency: the plan changes no report interface. `isJsonSource` accepts public `ts.SourceFile`; a targeted public emit maps its actual callback output to the requested workspace-relative source; a bundle maps only when its callback has exactly one workspace source.
- Scope: exact repository ownership is five files. `vm-lab.ts`, configs, fleet code, policy, rules and package files remain untouched.
