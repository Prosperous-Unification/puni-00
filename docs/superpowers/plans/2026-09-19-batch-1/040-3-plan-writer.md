# 040.3 Extract the plan writer from the plan read hook

| Field                                      | Value                                                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item                                  | 040.3 "Extract the plan writer from the plan read hook"                                                                                                        |
| Size class                                 | L                                                                                                                                                              |
| Top-model high-effort planning tokens      | 6,000,000                                                                                                                                                      |
| Mid-level mid-effort implementation tokens | 22,000,000                                                                                                                                                     |
| Top-model high-effort review tokens        | 9,000,000                                                                                                                                                      |
| Design implemented                         | [Code organization design](../../specs/2026-09-19-code-organization-design.md), the `Plan writer` row of its proposed frontend services table, rules F1 and K2 |
| Rollout task                               | [Task 6](../2026-09-19-code-organization-rollout.md), service 1 of 6                                                                                           |
| Packet format                              | [Execution batch 1](README.md)                                                                                                                                 |

## 1. Goal and non-goals

**Goal.** Move the framework-free policy of the gesture runner — the `run` callback inside
`usePlanRead` — out of React into a plain TypeScript feature-service, the plan writer, living in
a new module directory. The hook keeps only the React parts: reading refs, bridging the busy
state, and pushing a toast from the refusal event the service emits.

**Non-goals.** No behaviour change of any kind. No DI Bag (it is not installed yet), so the hook
constructs the service with a plain factory call. No extraction of the plan feed
(`refreshOrMarkStale`, `refreshResourcesOrMarkStale`, the subscription effect, `applySnapshot`) —
that is work item 040.4 and it is out of scope here. No extraction of undo/redo (`stepStack`) or
of marker writes (`runMarkerWrite`) — the design gives those to the `History and transfer` and
`Calendar markers` services, which are later packets. No move of
`apps/wbs/fe-01/src/lib/local-write.ts`.

## 2. Read first

| Read                                                                               | Why                                                                                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                                        | Rules R1 to R5. R5 governs every `Proof:` comment this packet moves.                                |
| `LLM_README.md`                                                                    | R1 says read the index first, then only the link for the task.                                      |
| [README.md](README.md)                                                             | The rules every executor in this batch follows.                                                     |
| [Code organization design](../../specs/2026-09-19-code-organization-design.md)     | Module layout, rule K2, rule F1, and the `Plan writer` row.                                         |
| [Rollout plan](../2026-09-19-code-organization-rollout.md), Task 6                 | The six bullets of the extraction procedure this packet spells out for one service.                 |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`                               | The source. The runner is the `const run = useCallback<RunPlanWrite>(` callback.                    |
| `apps/wbs/fe-01/src/lib/local-write.ts`                                            | `LocalWrite`, `LocalWriteAttempt`, `RunPlanWrite`, `createLocalWrite`. 33 lines; read all.          |
| `apps/wbs/fe-01/src/lib/plan-refresh.ts`                                           | `PlanRefresh`, `RefreshResource`, `ALL_RESOURCES`. Read the `export interface PlanRefresh {` block. |
| `apps/wbs/fe-01/src/components/wbs/plan-refusal.ts`                                | `refusalSentence`, `failureText`, `isAmbiguousWriteFailure`, `GONE`, `INVALID_REQUEST`.             |
| `apps/wbs/fe-01/src/components/wbs/live-editing.ts`                                | `CommitOutcome` and `FocusIntent.commandIssued`.                                                    |
| `apps/wbs/fe-01/src/components/wbs/wbs-table.tsx`                                  | The only caller of `usePlanRead`; it must keep compiling untouched.                                 |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx`                   | The oracle: most of the runner's negatives live here.                                               |
| `apps/wbs/fe-01/src/components/wbs/plan-table.test.tsx`                            | Holds `abandons queued adds when unmounted during their covering read`.                             |
| `apps/wbs/fe-01/src/components/wbs/plan-chart-seam.test.tsx`                       | Holds `rereads a marker refused because a peer already deleted it` (a guard that stays).            |
| `apps/wbs/fe-01/vitest.node-suites.ts` and `apps/wbs/fe-01/src/test-tiers.test.ts` | How a test gets into the fast node tier, and the guard that refuses a stale list.                   |
| `apps/wbs/fe-01/project.json`                                                      | The real target names.                                                                              |

## 3. Verified facts

Everything below was read in the repository on 2026-09-19 at commit `1eeacb0b`.

### The source callback

- `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts` is 1030 lines. The runner is the callback
  opening at `  const run = useCallback<RunPlanWrite>(` and closing with the dependency array
  `    [activeProject, api, focusIntent, projectId, pushToast, refreshResourcesOrMarkStale, setBusy],`.
- The hook returns `  return { refreshOrMarkStale, run, stepStack, runMarkerWrite };`.
- `usePlanRead` is called once, in `apps/wbs/fe-01/src/components/wbs/wbs-table.tsx`, at
  `  const { refreshOrMarkStale, run, stepStack, runMarkerWrite } = usePlanRead({`.
- The hook's React imports today are
  `import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';`. `useMemo`
  is **not** imported yet.
- `ownerRef` is declared as `  const ownerRef = useRef<PlanRefresh | null>(null);` and `activeApi`
  as `  const activeApi = useRef(api);` followed by `  activeApi.current = api;`.
- `activeProject` is a `React.RefObject<string>` created in `usePlanReadState` and assigned during
  render (`  activeProject.current = projectId;`), not in an effect.

### What the runner actually touches

Inside `run`, the captured `owner` is used **only** for identity comparisons (`owner !== null`,
`ownerRef.current === owner`). No method of `PlanRefresh` is called from `run`. Every reread goes
through `refreshResourcesOrMarkStale`, which is a separate callback.

### The types

- `apps/wbs/fe-01/src/lib/local-write.ts` exports
  `export type RunPlanWrite = (action: (write: LocalWrite) => Promise<void>) => Promise<CommitOutcome>;`,
  `export interface LocalWriteAttempt extends LocalWrite { completedResources(): readonly RefreshResource[]; }`
  and `export function createLocalWrite(): LocalWriteAttempt`.
- `apps/wbs/fe-01/src/lib/plan-refresh.ts` exports
  `export type RefreshResource = 'tree' | 'steps' | 'directory' | 'markers';` and
  `export const ALL_RESOURCES: readonly RefreshResource[] = ['tree', 'steps', 'directory', 'markers'];`.
  `PlanRefresh` has exactly five members: `initialize`, `invalidate`, `getSnapshot`, `subscribe`,
  `dispose`.
- `apps/wbs/fe-01/src/components/wbs/live-editing.ts` exports
  `export type CommitOutcome = 'landed' | 'refused' | 'unsent';` and the class `FocusIntent` with
  `  commandIssued(): void {`.
- `apps/wbs/fe-01/src/components/wbs/plan-refusal.ts` exports `refusalSentence`, `failureText`,
  `isAmbiguousWriteFailure`, `export const GONE = 'not_found';` and
  `export const INVALID_REQUEST = new Set(['http_400', 'http_422', 'invalid_body']);`. It imports
  only `@/lib/http`, `@/lib/refusal` and `@/lib/wbs-api` — no React, no component.
- Observed: `bun -e "const m = await import('./src/components/wbs/plan-refusal.ts'); console.log(m.refusalSentence(new Error('forbidden')));"`
  run from `apps/wbs/fe-01` printed
  `That change could not be completed: this plan is not yours to change.` — so the module imports
  and evaluates with no browser globals, and that sentence is exact.

### Busy is shared, so it cannot become the writer's store

`setBusy` comes from `usePlanReadState`'s `const [busy, setBusy] = useState(false);` and is passed
to `usePlanRead` **and** to `use-plan-dependencies.ts`, which writes it at
`        setBusy(true);` and `          if (isCurrent()) setBusy(false);`. `wbs-table.tsx` passes
the same setter to both (lines with `    setBusy,` at the `usePlanRead` and
`usePlanDependencies` call sites). The design's rule F2 (one store contract per stateful service)
therefore cannot be satisfied for `busy` in this packet without taking the dependency hook's
lane. `setBusy` stays an injected port. This is a recorded deviation, not an oversight.

### The refusal must leave the service as an event

`run` does two things with a refusal: it pushes a toast, and it returns `'refused'`. The return
value is the whole of what callers consume — `RunPlanWrite` is imported as a type by
`plan-live.ts`, `plan-toolbar.tsx`, `use-estimate-drafts.ts`, `use-plan-dependencies.ts`,
`use-plan-fields.ts`, `use-plan-structure.ts` and `use-reference-sets.ts`, and none of them sees a
sentence. The toast text is asserted by the DOM tests through `toastTexts()`. So the sentence must
leave the service as an event and `CommitOutcome` must stay the return value, unchanged.

### `pushToast` is stable

`apps/wbs/fe-01/src/components/wbs/toasts.tsx` defines `pushToast` as
`  const pushToast = useCallback(` with dependency array `    [cancelFade],`, and `cancelFade` is a
`useCallback` with an empty array. So a `useMemo` keyed on `pushToast` does not churn.

### The oracle tests

All of these exist today and pass. Their assertions must not be edited.

| File                                                             | Test title                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | `keeps a failure on screen when the next action succeeds`                                  |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | `says a row that has gone is gone, and rereads the tree that proves it`                    |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | `says a refused rename in a toast, and puts nothing above the table`                       |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | `turns a validation refusal into a sentence, and rereads the plan`                         |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | `says the toolbar is busy, and marks the controls the wait holds back`                     |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | `does not toast an old API mutation refusal into its replacement`                          |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | `does not spend an old API success against its busy replacement`                           |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | `does not announce an old arrangement in its busy replacement`                             |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | `does not announce an arrangement after its covering read changes API owner`               |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | `announces an arrangement after the same reader renews its subscription`                   |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | `$name has its exact recovery scope` (four cases, including `ambiguous transport failure`) |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx` | `refreshes a created tag after its attachment refuses`                                     |
| `apps/wbs/fe-01/src/components/wbs/plan-table.test.tsx`          | `abandons queued adds when unmounted during their covering read`                           |
| `apps/wbs/fe-01/src/components/wbs/plan-chart-seam.test.tsx`     | `rereads a marker refused because a peer already deleted it`                               |

Observed baselines on 2026-09-19:

- `bunx nx run wbs-fe-01:test:unit` → `Test Files 34 passed (34)`, `Tests 554 passed (554)`, 3.96 s.
- From `apps/wbs/fe-01`,
  `TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 src/components/wbs/plan-read-and-write.test.tsx src/components/wbs/plan-table.test.tsx src/components/wbs/plan-chart-seam.test.tsx`
  → `Test Files 3 passed (3)`, `Tests 157 passed (157)`, 62.18 s.

### The fast tier is a list with a guard

`apps/wbs/fe-01/vitest.node-suites.ts` exports `export const NODE_SUITES: readonly string[] = [`,
paths relative to `apps/wbs/fe-01`. `apps/wbs/fe-01/src/test-tiers.test.ts` walks `src` and the app
root and fails if the list disagrees. Its rule `needsADom` reads a suite as needing a browser when
the path ends `.tsx`, when it is in `INDIRECT_DOM_SUITES`, or when its **own text** matches
`DOM_EVIDENCE`, which is
`/@testing-library|\bdocument\b|\bwindow\b|\blocation\b|WebSocket|localStorage|matchMedia|getComputedStyle|HTMLElement|\bnavigator\b|jsdom/`.
The new unit test must therefore be a `.ts` file whose prose avoids every one of those words.

### The repository's current-document checks apply to both new Markdown files

`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` treats as a current document every
Markdown path starting `docs/`, and every `README.md` under the app, library or tool roots. It runs
three checks: `legacy-root` (a regex refusing pre-move roots and glob roots), `nx-selector` (every
`nx run <project>:` names a real Nx project) and `links` (every relative link resolves, anchors
included). Both this packet and the module `README.md` are subject to all three. `wbs-fe-01` is a
real project name.

Observed on 2026-09-19 with this packet present and the batch still untracked:
`bunx bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts` reported `12 pass 1 fail`.
All three per-document checks passed. The one failure is
`the production index checker resolves current Markdown links and anchors`, whose diagnostic reads
`index checks cannot resolve untracked diagnostic paths:` followed by all ten files of this batch
directory, including packets no one has written yet. It is a pre-existing condition of the whole
batch, not a fault in this document: the checker reads Git blobs, so the diagnostic clears once the
files are staged or committed. Run the target after staging, and if that failure persists with the
batch tracked, stop and report it rather than editing the checker.

### The wiki module registry is a closed list

`apps/wiki/cli/src/policy/pilot-policy.test.ts` names the pilot's documents explicitly in
`const pilotPaths = [`. The module-index HTML comment carried by
`libs/wbs/domain/domain/src/saved-plan/README.md` belongs to that registry, and adding one for an
unregistered module would need `docs/wiki-policy/modules.json`, which this packet does not own.
The new `README.md` therefore carries **no** module-index comment.

### Targets

From `apps/wbs/fe-01/project.json`: `test`, `test:unit`, `lint`, `lint:fast`, `typecheck`, `build`,
`e2e`, `e2e-packaged`, `serve`, `serve-local-solver`. The `lint` target lists explicit paths and
already includes `apps/wbs/fe-01/src`, so new files under `src` are linted with no project.json
edit. `tsconfig.app.json` includes `src/**/*.ts` and `src/**/*.tsx`, so new files typecheck with no
tsconfig edit. `NX_DAEMON=false bunx nx run tool-devsync:test` runs the document checks, but see
the split below: one of its thirteen tests cannot run in the executor's environment.

### The new README moves a pinned count

`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` counts, in `legacySourceOccurrences`,
every current document whose path ends `/README.md` and starts `apps/`, `libs/` or `tools/`, under
the key `applicationLibraryToolReadmes`, and the test
`every legacy source occurrence and relevant text family is pinned` pins that number. Observed on
2026-09-19: the pin reads `      applicationLibraryToolReadmes: 19,`, and
`git ls-files --cached --others --exclude-standard | grep -cE '^(apps|libs|tools)/.*README\.md$'`
printed `19`. The module `README.md` this packet creates makes it **20**. The count is taken from
`candidatePaths()`, which is `git ls-files --cached --others --exclude-standard`, so the failure
appears as soon as the file exists — staging does not avoid it and does not fix it.

Two re-pin comments already sit above the pin, and they are the house style this packet follows:

```ts
// Re-pinned 17 -> 18 when `apps/wiki/consumer/README.md` landed: the consumer template's
// README is a real application README the sweep must cover, not an exemption.
// Re-pinned 18 -> 19 for `apps/wiki/cli/fixtures/consumer/README.md`, the packed-install
// consumer fixture's README, which the sweep must cover like any application README.
```

Nothing else in that pinned object moves. `categories`, `occurrences`, `digest` and `unclassified`
are built only from lines matching the legacy-root regex in paths `isRelevantSourceConfig` accepts,
and that predicate returns false for every `.md` path. The new TypeScript files contain no
legacy-root text.

A README inside a source directory is established practice, not a novelty:
`libs/wbs/adapters/store-memory/src/README.md`, `libs/wbs/application/core/src/use-cases/README.md`,
`libs/wbs/domain/domain/src/saved-plan/README.md`, `tools/tool-dagger/src/lib/README.md` and
`tools/tool-secrets/src/README.md` are five of the nineteen.

### The wiki index checker asks nothing of a README without an index envelope

`apps/wiki/cli/src/indexes/read-indexes.ts` reads every candidate `README.md`, parses it, and then
`    if (metadata === undefined) continue;` — a README carrying no `module-index` envelope is
skipped, so its links are never resolved by that checker and it contributes no index identity. The
module README this packet creates therefore needs nothing from it.

### One devsync test needs Git writes, so verification splits

`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` holds thirteen tests. Twelve read the
tree through `git ls-files` and the file system. One,
`the production index checker resolves current Markdown links and anchors`, spawns
`apps/wiki/cli/src/cli.ts check-indexes working <workspace> HEAD`, and that path reaches
`apps/wiki/cli/src/inventory/read-candidate.ts`, which runs
`invokeGit(repository, ['write-tree'], env)` at line 278 and
`invokeGit(repository, ['add', '--update', '--', '.'], env)` at line 355. Both write into **this
clone's** object database, even though the index file is a temporary one. `readIndexes` also throws
`index checks cannot resolve untracked diagnostic paths: …` whenever anything in the snapshot is
untracked.

The executor of this packet has a read-only Git directory, so it can neither stage the new files
nor let that test write objects. **Omitting `git add` does not make the test pass; it makes it
throw on untracked paths.** Verification therefore splits, as the executor preamble's rule 4a
requires: the executor runs the four filesystem-only checks by name (step 10) and reports the whole
`tool-devsync:test` target as pending planner verification; the planner stages the seven paths and
runs it. Neither side edits, skips or works around the index checker.

Observed on 2026-09-19 while planning, with the batch's documents present and untracked: that one
index test failed on the untracked-paths message, and the link and selector checks failed on other
packets' documents. None of those failures named a file this packet creates.

## 4. Unknowns

| #   | Unknown                                                                                                                                                                                                                                         | How the executor resolves it                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Whether the new unit tests run clean under `--environment node`. `plan-refusal.ts` was proved importable under Bun with no browser globals, but Vitest's node tier was not run against the new file, because the file does not exist yet.       | Step 4 runs command C. A reference error naming a browser global is a **stop condition**, not something to work around: the rollout requires this service's tests in the node tier, `src/test-tiers.test.ts` is not in this packet's file plan, and moving the suite to the DOM tier would make negative proofs 1 and 6 unrunnable. Stop and report; the planner decides. |
| 2   | Whether `wbs-fe-01:test` passes in full on this machine today, and what its two summaries say. Only the three oracle files and the node tier were run while planning.                                                                           | Step 0 records the untouched baseline for both the UTC and the Auckland run before anything is edited. Step 11 compares against that baseline. A failure in a file this packet did not touch is a stop condition, not something to repair here.                                                                                                                           |
| 3   | The exact final line counts of the edited and created files.                                                                                                                                                                                    | Not needed. No size rule is enforced yet — rule F7 is Task 4 of the rollout and has no check in the repository today.                                                                                                                                                                                                                                                     |
| 4   | The full `tool-devsync:test` target, which no executor in this batch can run: its index checker writes Git objects into the clone, and the clone's Git directory is read-only. See section 3 and step 10.                                       | Not resolvable here. The executor runs the filesystem-only document checks and the pin test by name, and reports the full target as pending planner verification after staging.                                                                                                                                                                                           |
| 5   | Whether the success-path guard's new unit test really separates it from the post-reread check. The case is derived from the contract, not yet executed; the only mutation anybody has run is the 2026-09-19 observation described in section 8. | Proof 6 runs it: watch the new test fail red under the mutation and pass green with the guard restored. If it does not fail, **stop and report** — that is a finding for the catalogue, never a licence to drop the guard or keep its stale comment.                                                                                                                      |

## 5. File plan

| File                                                            | Action  | Responsibility                                                                                 |
| --------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `apps/wbs/fe-01/src/modules/plan-writer/README.md`              | created | Wiki index for the module: purpose, what it owns, what it refuses to own, its check.           |
| `apps/wbs/fe-01/src/modules/plan-writer/contract.ts`            | created | The exported service type, its refusal event, and the host requirements it is built over.      |
| `apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts` | created | The feature-service: one gesture, its ledger, its refusal policy, its reread set, its outcome. |
| `apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts`    | created | The module's unit test, node tier, fake host, no browser.                                      |
| `apps/wbs/fe-01/vitest.node-suites.ts`                          | edited  | One new entry so the guard and the fast tier agree.                                            |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`            | edited  | `run` becomes a memoized construction of the service; the moved policy and its imports leave.  |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`       | edited  | One line: the README count pin moves 19 to 20, with its re-pin comment.                        |

Seven files. No `module.ts` and no module `tsconfig.json`: DI Bag is not installed, and an
unreferenced TypeScript project file would be a config nothing consumes. The directory leaves room
for both.

**Two of these files are shared with packet 040.6, which runs after this one.** The batch README
settles the order: `apps/wbs/fe-01/vitest.node-suites.ts` and the README count pin are owned by
040.3 first, then 040.6. This packet adds **only its own** suite line and moves the pin **only**
from 19 to 20. 040.6 moves it from 20 to whatever its own READMEs make. If the pin does not read
19 when this packet starts, 040.6 has already run: stop and report.

## 6. Interfaces

### `apps/wbs/fe-01/src/modules/plan-writer/contract.ts`

This is the complete file.

```ts
import type { RunPlanWrite } from '@/lib/local-write';
import type { PlanRefresh, RefreshResource } from '@/lib/plan-refresh';

/**
 * A gesture that be-01 refused, in the sentence a reader is owed.
 *
 * An **event** and not a return value, and the split is the same one the runner
 * has always made: a refused request is something that happened to somebody, so
 * it is announced once and stays until it is read, while the fact of the refusal
 * is the {@link RunPlanWrite} outcome the caller acts on. `CellInput` is the
 * caller that needs the fact and never the sentence.
 */
export interface PlanWriteRefusal {
  sentence: string;
}

/**
 * What the plan writer needs from whoever is hosting it.
 *
 * Every member is a function rather than a value because all of them are read at
 * the moment a gesture asks, not at the moment the writer is built: the feed
 * owner can be renewed under the same reader by a covering read, and the reader
 * can leave for another project between a request and its answer.
 */
export interface PlanWriterHost {
  /**
   * The plan feed owner as it stands now, or null while none is installed.
   *
   * Its **identity** is all that is read — a gesture compares the owner it began
   * under against the owner that exists when its answer arrives. The writer calls
   * no member of it; rereads go through {@link PlanWriterHost.rereadResources}.
   */
  readRefreshOwner: () => PlanRefresh | null;
  /**
   * Whether this writer still owns the screen: the same project and the same API
   * the gesture was issued against.
   *
   * Separate from the owner above because the two guards disagree on purpose. A
   * covering read may renew the feed owner for the same logical reader, and that
   * renewal must not cost the reader its own gesture's outcome or leave it busy.
   */
  isActiveReader: () => boolean;
  /**
   * Records where the gesture now starting was issued from, synchronously.
   *
   * Called at the moment the gesture happens and not when its answer arrives:
   * everything between the two is the interval in which the reader may have gone
   * somewhere else, and that interval is the thing the focus intent measures.
   */
  noteCommandIssued: () => void;
  /** Awaits the covering outcome of an invalidation; failures stay in the feed's own snapshot. */
  rereadResources: (resources: readonly RefreshResource[]) => Promise<void>;
  /** Raises and clears the shared busy state the toolbar and the cells read. */
  setBusy: (busy: boolean) => void;
  /** Announces one refusal to whoever says things to the reader. */
  announceRefusal: (refusal: PlanWriteRefusal) => void;
}

/**
 * One project's writer: every plan gesture goes through it, and it is what
 * decides, for each one, what has to be read again afterwards.
 *
 * Framework-free by rule F1 of the code organization design. It imports no React
 * and announces nothing itself.
 */
export interface PlanWriter {
  run: RunPlanWrite;
}
```

### `apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts`

Public surface: `export function createPlanWriter(host: PlanWriterHost): PlanWriter`. Nothing else
is exported.

### What does not change

`RunPlanWrite`, `LocalWrite`, `LocalWriteAttempt`, `createLocalWrite` and `CommitOutcome` keep
their present homes and their present shapes. `usePlanRead`'s parameter object and its return
object are unchanged, so `wbs-table.tsx` is not edited.

## 7. Steps

Each box is one action. Test steps come before implementation steps. Every command states what
success looks like.

### Step 0 — Record the baseline before touching anything

The packet compares counts afterwards, so the counts have to exist first. Nothing is edited in this
step.

- [ ] `git rev-parse HEAD` → record the starting revision; every count below belongs to it.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit` → expect exit 0. Record the `Test Files`
      and `Tests` lines. **These recorded numbers, not the planner's, are what every later
      comparison uses.** For orientation only, the planner saw `34 passed (34)` and
      `554 passed (554)` at `1eeacb0b` on 2026-09-19; a different number means the revision moved
      and is not by itself a problem.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:test` → expect exit 0. This target runs **two**
      suites — a `TZ=UTC` run and a `TZ=Pacific/Auckland` run against `vitest.zoned.config.ts` — so
      it prints **two** summaries. Record both `Test Files` and both `Tests` lines. The planner did
      not run this target; see Unknown 2.
- [ ] Read the pin. The bare symbol name appears three times in that file — the type member, the
      computation and the literal pin — so anchor the pattern to the pin itself:

```sh
rg -n '^[[:space:]]*applicationLibraryToolReadmes: 19,$' \
  tools/tool-devsync/src/repo-namespacing-handoff.test.ts
```

      Expected: exactly one line, `557:      applicationLibraryToolReadmes: 19,` (the line number
      may differ). Zero lines, or a number other than 19, means another lane has moved the pin —
      packet 040.6 runs after this one — so stop and report. `grep -nE` with the same pattern is an
      equivalent command if `rg` is unavailable; both were observed printing exactly that one line
      on 2026-09-19.

### Step 1 — Orient

- [ ] Read every file in section 2. Confirm the runner's opening line is
      `  const run = useCallback<RunPlanWrite>(`. If it is not, stop and report.
- [ ] `git status --short` → expect no modification to any of the seven files in section 5.
      Unrelated modifications from other lanes may be present; leave them exactly as they are.

### Step 2 — Create the module directory and its contract

- [ ] `mkdir -p apps/wbs/fe-01/src/modules/plan-writer`
- [ ] Write `apps/wbs/fe-01/src/modules/plan-writer/contract.ts` exactly as given in section 6.
- [ ] Write `apps/wbs/fe-01/src/modules/plan-writer/README.md` with this content:

```markdown
# Plan writer

One plan gesture, and what has to be read again once it is over. Every command service in the
table writes through this module.

The service is plain TypeScript and imports no React, which is rule F1 of the code organization
design in `docs/superpowers/specs/2026-09-19-code-organization-design.md`. It is a
feature-service: it coordinates the gesture's own request ledger against the plan feed it is
handed, and it holds no transport of its own.

## What it owns

- The ledger of the gesture's completed requests, and therefore the reread set a landing earns.
- Which resources a refusal earns instead: the completed prefix normally, everything when the
  failure is ambiguous, when the target has gone, or when be-01 could not read the request.
- Whether the gesture still belongs to the reader on screen, at each of the three moments that
  question has a different answer.
- Raising and clearing the shared busy state, and the outcome the caller acts on.

## What it does not own

The plan feed itself. Rereads go out through `rereadResources`, which the host supplies and which
today is the plan read hook's own invalidation callback. The feed becomes a module of its own in
work item 040.4.

## Relationships

The exported types are in `contract.ts`; the service is `plan-writer.feature.ts`. There is no
`module.ts` yet: DI Bag is not installed, so the host builds the service with a plain factory
call. Its one host today is `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`.

## Checks

The applicable check is the `test:unit` target declared in `apps/wbs/fe-01/project.json`; the
module's own suite is `plan-writer.test.ts`. The behaviour this extraction preserves is proved by
the plan table's own suites, which run in the `test` target of the same project.
```

- [ ] Leave that README free of Markdown links, and give it no `module-index` comment. It becomes a
      current document the moment it exists, and
      `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves every relative link it
      finds; inline code spans carry the paths instead, which that check does not follow. The wiki
      index checker skips a README with no index envelope, and registering a module identity needs
      `docs/wiki-policy/modules.json`, which is out of lane.
- [ ] Move the README count pin. In
      `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, the object under
      `expect(await legacySourceOccurrences()).toEqual({` carries
      `      applicationLibraryToolReadmes: 19,` with two re-pin comments above it. **First watch it
      fail**, running that one test by name and not the whole file — the file also holds the index
      checker, which cannot run here:

```sh
bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
  -t '^every legacy source occurrence and relevant text family is pinned$'
```

      Expected before the repin: that one test fails, its diff naming
      `applicationLibraryToolReadmes` with received `20` against expected `19`. Record the message.
      Then change the value to `20` and add a third comment in the existing house style directly
      above it:

```ts
// Re-pinned 19 -> 20 for `apps/wbs/fe-01/src/modules/plan-writer/README.md`, the first
// frontend module index, which the sweep must cover like any application README.
```

- [ ] Rerun the same named test. Expected after the repin: `1 pass`, `0 fail`.
- [ ] Nothing else in that pinned object changes. `categories`, `occurrences`, `digest` and
      `unclassified` come from legacy-root matches in source and configuration paths, and
      `isRelevantSourceConfig` rejects every `.md`. If any of them also moves, stop and report.

### Step 3 — Write the failing unit test

- [ ] Write `apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts` exactly as below. This is
      the complete file.

```ts
import { describe, expect, it } from 'vitest';

import type { PlanRefresh, RefreshResource } from '@/lib/plan-refresh';

import type { PlanWriteRefusal, PlanWriterHost } from './contract';
import { createPlanWriter } from './plan-writer.feature';

/**
 * A feed owner the writer may compare identities with and must never call.
 *
 * Every member throws, and that is the assertion rather than a convenience: the
 * writer reads the owner for its identity alone, and every reread it asks for
 * goes through the host's own callback. A writer that reached for a member here
 * would fail loudly instead of quietly acquiring a second way to read the plan.
 */
function fakeFeedOwner(): PlanRefresh {
  const refuse = (member: string): never => {
    throw new Error(`the plan writer called ${member} on the feed owner`);
  };
  return {
    initialize: () => refuse('initialize'),
    invalidate: () => refuse('invalidate'),
    getSnapshot: () => refuse('getSnapshot'),
    subscribe: () => refuse('subscribe'),
    dispose: () => refuse('dispose'),
  };
}

/** A host that records everything the writer asked it for, in order. */
function recordingHost(): {
  host: PlanWriterHost;
  rereads: (readonly RefreshResource[])[];
  refusals: PlanWriteRefusal[];
  busyChanges: boolean[];
} {
  const rereads: (readonly RefreshResource[])[] = [];
  const refusals: PlanWriteRefusal[] = [];
  const busyChanges: boolean[] = [];
  const owner = fakeFeedOwner();
  return {
    rereads,
    refusals,
    busyChanges,
    host: {
      readRefreshOwner: () => owner,
      isActiveReader: () => true,
      noteCommandIssued: () => undefined,
      rereadResources: (resources) => {
        rereads.push(resources);
        return Promise.resolve();
      },
      setBusy: (busy) => busyChanges.push(busy),
      announceRefusal: (refusal) => refusals.push(refusal),
    },
  };
}

describe('the plan writer', () => {
  it('rereads the completed prefix of a gesture a later request refuses', async () => {
    const recorded = recordingHost();
    const writer = createPlanWriter(recorded.host);

    const outcome = await writer.run(async (write) => {
      await write.perform(['directory'], () => Promise.resolve('tag minted'));
      await write.perform(['tree'], () => Promise.reject(new Error('forbidden')));
    });

    expect(outcome).toBe('refused');
    expect(recorded.rereads).toEqual([['directory']]);
    expect(recorded.refusals).toEqual([
      { sentence: 'That change could not be completed: this plan is not yours to change.' },
    ]);
    expect(recorded.busyChanges).toEqual([true, false]);
  });
});
```

- [ ] Append the second test to the same file: the case in negative proof 6,
      `refuses a completed gesture whose feed owner was replaced under it`, copied from that entry.
      It goes inside the same `describe`, after the first test. **Both tests are written before the
      service exists.** The file therefore carries two tests, which is the delta every count in
      this packet uses: **one file and two tests**.
- [ ] Add `  'src/modules/plan-writer/plan-writer.test.ts',` to `NODE_SUITES` in
      `apps/wbs/fe-01/vitest.node-suites.ts`, in the array's existing sorted position: **after**
      `  'src/lib/saved-plan-compare.test.ts',` and **before** `  'src/test-tiers.test.ts',`
      (`src/lib/` sorts before `src/modules/`, which sorts before `src/test-tiers.test.ts`). The
      guard sorts both sides before comparing, so placement is for the reader; keep it sorted
      anyway. Add **only** this line — packet 040.6 adds its own in wave 2.
- [ ] Run command C. Expect a **failure**: the suite cannot resolve `./plan-writer.feature`. Record
      the exact message. This is the red state; do not proceed until you have seen it.

### Step 4 — Move the policy

- [ ] Create `apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts` with the body below.
      Every statement is transcribed from the `run` callback in
      `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, in the same order, with the three
      React reads replaced by host calls. **Copy the long JSDoc that today sits above
      `const run = useCallback<RunPlanWrite>(` onto `createPlanWriter`'s `run` member verbatim,
      and copy every `Proof:` comment into the same position it holds today.** The skeleton:

```ts
import {
  failureText,
  GONE,
  INVALID_REQUEST,
  isAmbiguousWriteFailure,
  refusalSentence,
} from '@/components/wbs/plan-refusal';
import { createLocalWrite } from '@/lib/local-write';
import { ALL_RESOURCES } from '@/lib/plan-refresh';

import type { PlanWriter, PlanWriterHost } from './contract';

/**
 * Builds the writer for one reader: one project, one API, one busy state.
 *
 * A plain factory and not a DI Bag module, because DI Bag is not installed in
 * this application yet. The module directory is shaped so that adding one later
 * moves no policy.
 */
export function createPlanWriter({
  readRefreshOwner,
  isActiveReader,
  noteCommandIssued,
  rereadResources,
  setBusy,
  announceRefusal,
}: PlanWriterHost): PlanWriter {
  return {
    // The moved JSDoc goes here, unchanged.
    async run(action) {
      // Proof: guarding only projectId leaked one refusal toast into the new API
      // owner in `does not toast an old API mutation refusal into its replacement`.
      const owner = readRefreshOwner();
      const isCurrent = () => owner !== null && readRefreshOwner() === owner && isActiveReader();
      // Read here, synchronously, because this is the moment the gesture happened.
      noteCommandIssued();
      setBusy(true);
      const write = createLocalWrite();
      try {
        try {
          await action(write);
        } catch (thrown: unknown) {
          if (!isCurrent()) return 'refused';
          // Proof, two faults, both watched 2026-08-09 … (the existing comment, unchanged)
          announceRefusal({ sentence: refusalSentence(thrown) });
          const refusal = failureText(thrown, '');
          // Proof: forcing this typed boundary false … (the existing comment, unchanged)
          const ambiguous = isAmbiguousWriteFailure(thrown);
          const completed = write.completedResources();
          // Proof: replacing the completed prefix below with `[]` … (the existing comment)
          const resources =
            ambiguous || refusal === GONE || INVALID_REQUEST.has(refusal)
              ? ALL_RESOURCES
              : completed;
          if (resources.length > 0) await rereadResources(resources);
          return 'refused';
        }
        const completed = write.completedResources();
        // Proof: returning `landed` without checking the captured owner … (the existing comment)
        if (!isCurrent()) return 'refused';
        if (completed.length > 0) await rereadResources(completed);
        // A covering read may renew the feed owner for the same reader, so its
        // identity cannot decide this outcome. A live owner and the active
        // reader can:
        // Proof: removing this pair check … (the existing two comments, unchanged)
        if (readRefreshOwner() === null || !isActiveReader()) return 'refused';
        return 'landed';
      } finally {
        // A covering read may renew the feed owner while retaining the same
        // logical reader. That reader owns this busy state; a different API or
        // project does not.
        // Proof: requiring captured coordinator identity … (the existing comment)
        if (isActiveReader()) setBusy(false);
      }
    },
  };
}
```

- [ ] Check the three translations against the source, one at a time:
  - `owner !== null && ownerRef.current === owner && activeProject.current === projectId && activeApi.current === api`
    becomes `owner !== null && readRefreshOwner() === owner && isActiveReader()`.
  - `ownerRef.current === null || activeProject.current !== projectId || activeApi.current !== api`
    becomes `readRefreshOwner() === null || !isActiveReader()`.
  - `if (activeProject.current === projectId && activeApi.current === api) setBusy(false);`
    becomes `if (isActiveReader()) setBusy(false);`.
    Nothing else about the guards changes. In particular the second check deliberately does **not**
    compare the captured owner, and the third deliberately checks neither owner.
- [ ] Run command C. Expect exit 0, with the `Test Files` count equal to step 0's recorded number
      plus one and the `Tests` count equal to step 0's plus two. Both new tests are green.

### Step 5 — Rewire the hook

- [ ] In `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, delete the whole
      `const run = useCallback<RunPlanWrite>(...)` callback, including its JSDoc, which has already
      been copied into the service.
- [ ] In its place put:

```ts
/**
 * This reader's writer, rebuilt when the reader changes and not otherwise.
 *
 * The dependency list is the one the callback it replaces carried, so `run`'s
 * identity changes on exactly the renders it changed on before.
 */
const writer = useMemo(
  () =>
    createPlanWriter({
      readRefreshOwner: () => ownerRef.current,
      isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
      noteCommandIssued: () => {
        focusIntent.current.commandIssued();
      },
      rereadResources: refreshResourcesOrMarkStale,
      setBusy,
      announceRefusal: ({ sentence }) => {
        pushToast({ kind: 'error', text: sentence });
      },
    }),
  [activeProject, api, focusIntent, projectId, pushToast, refreshResourcesOrMarkStale, setBusy],
);
```

- [ ] Change the hook's final line to
      `  return { refreshOrMarkStale, run: writer.run, stepStack, runMarkerWrite };`.
- [ ] Add `useMemo` to the React import and add
      `import { createPlanWriter } from '@/modules/plan-writer/plan-writer.feature';`.
- [ ] Remove the imports the move left unused: `createLocalWrite` and the `RunPlanWrite` type from
      `@/lib/local-write` (drop the whole import if both go), the `CommitOutcome` type from
      `./live-editing` (keep `forgetRefusedDrafts` and `FocusIntent`), and `failureText`, `GONE`,
      `INVALID_REQUEST` and `isAmbiguousWriteFailure` from `./plan-refusal`. **Keep**
      `refusalSentence` — `applySnapshot`, the subscription effect, `runMarkerWrite` and
      `stepStack` all still use it. **Keep** `ALL_RESOURCES` and `resourcesFor` —
      `refreshOrMarkStale` and the stream handler still use them.
- [ ] Do not touch `refreshResourcesOrMarkStale`, `refreshOrMarkStale`, `runMarkerWrite`,
      `stepStack`, `applySnapshot`, `settleAgainstSteps` or the subscription effect.

### Step 6 — Compile and lint

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → expect exit 0 and no diagnostic.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → expect exit 0. `unused-imports/no-unused-imports` is an error,
      so a leftover import fails here.
- [ ] Format **only this packet's files**. Never run a repository-wide format write: it rewrites
      other lanes' files, and a read-only check during review already found another packet's
      document needing formatting.

```sh
bunx prettier --write \
  apps/wbs/fe-01/src/modules/plan-writer/README.md \
  apps/wbs/fe-01/src/modules/plan-writer/contract.ts \
  apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts \
  apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts \
  apps/wbs/fe-01/vitest.node-suites.ts \
  apps/wbs/fe-01/src/components/wbs/use-plan-read.ts \
  tools/tool-devsync/src/repo-namespacing-handoff.test.ts
```

      Expected: Prettier prints one line per file and exits 0.

- [ ] `NX_DAEMON=false bunx nx format:check --all` → expect exit 0. If it names a file **not** in the list above,
      that file belongs to another lane: report it in the task report and leave it alone. If it
      names one of these seven, rerun the write above.

### Step 7 — Run the oracle

- [ ] From `apps/wbs/fe-01`:
      `TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 src/components/wbs/plan-read-and-write.test.tsx src/components/wbs/plan-table.test.tsx src/components/wbs/plan-chart-seam.test.tsx`
      → expect `Test Files 3 passed (3)` and `Tests 157 passed (157)`, the observed baseline. A
      different count means a test was added, removed or skipped: stop and report.

### Step 8 — Negative proofs

- [ ] Perform every injection in section 8, one at a time, in order, each with the restore
      discipline that section states. Record the exact failure message for each before writing its
      proof comment.

### Step 9 — Staleness guard inventory

- [ ] Confirm by reading that these guards are **unchanged and still in the hook**, and say so in
      the report. None of them is removed by this task.

| Guard                                                                                                                     | Where                     | Why it stays                                             |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| `const isCurrent = () => ownerRef.current === owner && activeProject.current === projectId && activeApi.current === api;` | the subscription effect   | Belongs to the plan feed, work item 040.4.               |
| The opening test of `refreshResourcesOrMarkStale`                                                                         | the reread callback       | Belongs to the plan feed, work item 040.4.               |
| `runMarkerWrite`'s own `isCurrent`                                                                                        | the marker write callback | Belongs to the calendar markers service, a later packet. |
| `stepStack`'s own `isCurrent`                                                                                             | the undo/redo callback    | Belongs to the history service, a later packet.          |
| The four `installed.generation > applied.*` tests                                                                         | `applySnapshot`           | Belongs to the plan feed, work item 040.4.               |

The only guards that move are the three inside `run`, listed in step 4.

### Step 10 — Document and inventory checks, split

**Leave the seven paths unstaged.** This executor cannot write Git objects, and one test in
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` needs to: its
`the production index checker resolves current Markdown links and anchors` case shells out to
`check-indexes working`, and `apps/wiki/cli/src/inventory/read-candidate.ts` runs
`invokeGit(repository, ['write-tree'], env)` and
`invokeGit(repository, ['add', '--update', '--', '.'], env)` against this clone's object database.
Omitting `git add` does not make that test pass; it makes it throw on untracked paths instead. So
the verification splits, exactly as the executor preamble's rule 4a says.

- [ ] Run the four filesystem-only checks of that file, each by name. Every one reads the tree
      through `git ls-files`, which is read-only, so all four run here:

```sh
for name in \
  'current documentation and active solver packets use namespaced roots' \
  'current Nx commands select existing qualified projects' \
  'every routed current document resolves its local links and anchors' \
  'every legacy source occurrence and relevant text family is pinned'
do
  bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "^${name}\$"
done
```

      Expected: each prints `1 pass`, `0 fail`. A failure naming a path this packet created is a
      stop condition. A failure naming only other packets' documents is pre-existing: record it
      verbatim and carry on. Observed by the planner on 2026-09-19, before this packet was
      executed: the link and selector checks already failed on other packets' documents in this
      batch directory, and the pin check passed at 19.

- [ ] Do **not** run `NX_DAEMON=false bunx nx run tool-devsync:test`. Report it under "Not
      verified" as **pending planner verification**: the planner stages the seven paths and runs
      the whole target. Do not edit, skip or work around the index checker.

### Step 11 — Whole frontend

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit` → expect exit 0, with the `Test Files`
      count equal to step 0's plus one and the `Tests` count equal to step 0's plus two.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:test` → expect exit 0. Compare **both** summaries
      against the two recorded in step 0. The UTC summary is one file and two tests above step 0's
      — the new suite runs in that target too. The `TZ=Pacific/Auckland` summary is identical to
      step 0's: this packet adds no `.zoned.test.ts` file. Any other difference is a stop
      condition.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:build` → expect exit 0.

### Step 12 — OpenSpec validation

- [ ] Run the batch's standard block, which is the only accepted contract — a loose success check
      accepts three malformed reports the gate script documents:

```sh
set -euo pipefail
report=$(mktemp)
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
rm -f -- "$report"
```

      Expected: one JSON report is printed and the block exits 0. If the tool cannot be fetched,
      report the block, not a pass.

### Step 13 — Hand over, do not commit

This executor's Git directory is read-only, so there is nothing to stage and nothing to commit.
Leave the work in the working tree and hand the planner what it needs to commit it.

- [ ] `git status --short --untracked-files=all` → expect exactly the seven paths of section 5 as modified or untracked,
      plus whatever other lanes already had in the tree, which stays untouched. Record the list.
- [ ] Report, under "Ready to commit": the seven paths, and the subject
      `refactor(wbs-fe): extract the plan writer from the plan read hook`, with a body that carries
      step 0's baseline, step 11's counts, and every negative proof of section 8 with the exact
      failure line seen.
- [ ] Do not run `git add`, `git commit`, `git checkout -b`, `git stash` or `git restore --staged`.
      They fail here, and the planner commits after reviewing the diff.

### Step 14 — Completion gate, not run here

- [ ] Do **not** run `bin/h2puni-gate.sh`. The host gate cannot run on this machine.
- [ ] Say in the task report that the host gate was not run, and why. An unavailable required check
      is reported, never treated as passed. The planner runs it after committing.

## 8. Negative proofs

Every check below is either new or has had its expression rewritten by the move. R5 requires each
to be watched failing on a production path before its `Proof:` comment is trusted.

**These are entries, not a table, on purpose.** Three of the mutations contain `||`, which a
Markdown table splits into extra cells and silently displaces every column after it.

**Restore discipline, for every entry.** Copy the passing file aside first
(`cp <file> "$TMPDIR/<name>.passing"`), inject, run, record, then restore the exact bytes and
`diff <file> "$TMPDIR/<name>.passing"` to prove the restore, then rerun the command and see it pass
again. Clean up before reporting anything unexpected.

**Where the pairings come from, exactly.** Two kinds of statement appear below, and they are not
the same kind of evidence.

- **One observation was performed.** On 2026-09-19 the planner removed the success-path
  `isCurrent()` guard from `use-plan-read.ts` in a throwaway clone and ran the UTC suite of
  `src/components/wbs/plan-read-and-write.test.tsx`: it passed **88 of 88**. That is the only
  mutation anybody has executed for this packet. What it proves is that **no existing test pins
  that guard** — a coverage gap. The planner first read it as "the guard cannot fail" and wrote
  that into this packet; the second review showed the reading was wrong, and proof 6 below is the
  repair. The incident is the twenty-ninth entry of
  `docs/findings/checks-that-cannot-fail-puni-00.md`.
- **Every other pairing is derived by reading** the test and the code, and each entry states its
  derivation so the executor can check it rather than trust it.

If an injection does not fail, that is a finding — stop and report it, and the catalogue at
[checks that cannot fail](../../../findings/checks-that-cannot-fail.md) is where it belongs. Never
delete the check to make the packet fit, and never accept a different failing test in place of the
named one.

Three commands are used. `vitest` is not on the PATH, so it is reached through `bunx`. Each runs
**from the repository root in a subshell**, so a repeated command never accumulates directory
changes:

```sh
# command A
(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
  src/components/wbs/plan-read-and-write.test.tsx)
# command B
(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
  src/components/wbs/plan-table.test.tsx)
# command C
NX_DAEMON=false bunx nx run wbs-fe-01:test:unit
```

Each exits 0 before the injection.

### Proof 1 — the writer never calls the feed owner (new check)

- **Mutation.** In `plan-writer.feature.ts`, add `readRefreshOwner()?.getSnapshot();` as the first
  statement of `run`.
- **Command.** C.
- **Expected failure.** `rereads the completed prefix of a gesture a later request refuses` fails
  with `the plan writer called getSnapshot on the feed owner`.
- **Why.** The fake feed owner in the new suite throws from every member, which is the assertion
  that the writer reads the owner for identity only.

### Proof 2 — the refusal event reaches the toast stack (new seam)

- **Mutation.** In `use-plan-read.ts`, make the port a no-op: `announceRefusal: () => undefined,`.
- **Command.** A.
- **Expected failure.** `says a refused rename in a toast, and puts nothing above the table` fails
  on the `toastTexts()` assertion, which expects exactly
  `['That change could not be completed: this plan is not yours to change.']`.
- **Why.** That is the only path from the service's refusal to the corner of the screen. The test
  rejects `patchWorkItem` with `new Error('forbidden')` and asserts the sentence.

### Proof 3 — the catch-path current-reader guard (moved)

- **Mutation.** In `plan-writer.feature.ts`, delete `if (!isCurrent()) return 'refused';` from the
  `catch` block, leaving the announcement to run unconditionally.
- **Command.** A.
- **Expected failure.** `does not toast an old API mutation refusal into its replacement` fails on
  `expect(toastTexts()).toEqual([])` with the forbidden sentence present.
- **Why.** That test holds `patchWorkItem` unresolved, swaps the API prop, waits for the
  replacement's row, then rejects the held promise. With the guard gone the departed gesture
  announces into the replacement.
- **Correction from review, verified.** An earlier draft of this packet paired the
  `isActiveReader` API-half mutation with this test. That is wrong: swapping the API prop re-runs
  the effect at `    const owner = createPlanRefresh({ projectId, api });`, so `readRefreshOwner()`
  no longer equals the captured `owner` and `isCurrent()` is false through the owner half alone.
  The API half is proved by proof 4 instead.

### Proof 4 — `isActiveReader` covers the API half (moved)

- **Mutation.** In `use-plan-read.ts`, weaken the port to
  `isActiveReader: () => activeProject.current === projectId,`.
- **Command.** A.
- **Expected failure.** `does not spend an old API success against its busy replacement` fails on
  `expect(document.querySelector('[data-toolbar]')?.getAttribute('aria-busy')).toBe('true')` after
  `finishOld()`, receiving `'false'`.
- **Why.** The project id is `'p1'` on both sides and only the API object differs, so the weakened
  port returns true and the `finally` clause clears the replacement's busy state on the departed
  gesture's way out.

### Proof 5 — the post-landing check tolerates a renewed owner (moved)

- **Mutation.** In `plan-writer.feature.ts`, replace the whole post-refresh line with
  `if (!isCurrent()) return 'refused';`.
- **Command.** A.
- **Expected failure.** `announces an arrangement after the same reader renews its subscription`
  fails: the toast `Arranged by schedule.` never appears.
- **Why.** A covering read may renew the feed owner for the same reader. `isCurrent()` compares the
  captured owner, so it suppresses a toast the reader is owed.

### Proof 6 — the success-path current-reader guard (moved, and newly pinned)

This is the one guard no existing test holds, and the one whose `Proof:` comment is stale. It gets
a new unit test of its own, written before the mutation, exactly like every other proof here.

- **What is already known.** On 2026-09-19 the planner removed this guard in a throwaway clone and
  the UTC run of `src/components/wbs/plan-read-and-write.test.tsx` passed 88 of 88, including
  `does not announce an old arrangement in its busy replacement`, which the guard's comment names.
  Eighty-eight green tests are a **coverage gap**, not an unbreakable check: the existing suite has
  no case that separates this guard from the post-reread check, because in every departed-reader
  case the suite does have, `rereadResources` returns early and the post-reread check refuses
  anyway. The finding is the twenty-ninth entry of
  `docs/findings/checks-that-cannot-fail-puni-00.md`.
- **The case that separates them**, derived from the contract in section 6 and confirmed against
  the service body in step 4. Let a gesture complete one `tree` write; let the feed owner be
  **replaced** while the action is still running; let `isActiveReader()` stay true throughout.
  - With the guard: `isCurrent()` is false because `readRefreshOwner()` no longer equals the
    captured owner, so `run` returns `'refused'` and asks for **no** reread.
  - Without it: `rereadResources(['tree'])` is called — the host is live and active, so nothing
    returns early — and the post-reread check passes, because the owner is not null and the reader
    is active, so `run` returns `'landed'`.
    The two outcomes differ in both the return value and the reread, which is what makes the case a
    test rather than an opinion.
- **Second unit test**, added to the module's own `plan-writer.test.ts` in step 3, before the
  service exists. It needs a host whose owner can be swapped, so it does not use `recordingHost`:

```ts
it('refuses a completed gesture whose feed owner was replaced under it', async () => {
  // Proof: this is the case no existing suite held — see the twenty-ninth entry of
  // docs/findings/checks-that-cannot-fail-puni-00.md.
  const rereads: (readonly RefreshResource[])[] = [];
  let owner = fakeFeedOwner();
  const writer = createPlanWriter({
    readRefreshOwner: () => owner,
    isActiveReader: () => true,
    noteCommandIssued: () => undefined,
    rereadResources: (resources) => {
      rereads.push(resources);
      return Promise.resolve();
    },
    setBusy: () => undefined,
    announceRefusal: () => undefined,
  });

  const outcome = await writer.run(async (write) => {
    await write.perform(['tree'], () => {
      // The covering read that renewed the feed owner landed while this request was in flight.
      owner = fakeFeedOwner();
      return Promise.resolve('renamed');
    });
  });

  expect(outcome).toBe('refused');
  expect(rereads).toEqual([]);
});
```

- **Order.** Write this test in step 3 with the first one, and watch both fail to resolve
  `./plan-writer.feature`. After step 4 both pass.
- **Mutation.** In `plan-writer.feature.ts`, delete the `if (!isCurrent()) return 'refused';` that
  sits between `const completed = write.completedResources();` and the reread.
- **Command.** C, then A.
- **Expected failure.** Under C, `refuses a completed gesture whose feed owner was replaced under
it` fails at `expect(outcome).toBe('refused')`, reporting received `landed` versus expected
  `refused`. The following reread assertion is not reached during this failing run; retain it
  unchanged. Under A, record the actual passing summary and compare it with the unmutated run.
  After restoring, rerun C and A green.
- **Then, and only then, rewrite the stale comment.** The comment moved in step 4 says the fault
  was watched in `does not announce an old arrangement in its busy replacement`. That is no longer
  true. Replace it with what was actually seen, in the repository's own form, for example:

```ts
// Proof: deleting this guard made `refuses a completed gesture whose feed owner
// was replaced under it` fail with received `landed` versus expected `refused`.
// The following reread assertion was not reached during that failing run.
// Watched, <actual observation date>.
```

- **If the injection does not fail**, stop and report. Do not delete the guard, do not keep the old
  comment, and do not repoint it at another test.

### Proof 7 — the post-landing check keeps its active-reader half (moved)

- **Mutation.** In `plan-writer.feature.ts`, reduce the post-refresh line to
  `if (readRefreshOwner() === null) return 'refused';`.
- **Command.** A.
- **Expected failure.** `does not announce an arrangement after its covering read changes API owner`
  fails on its closing `expect(toastTexts()).toEqual([])`, with `Arranged by schedule.` present.
- **Why.** That test holds `api.tree`, so the arrangement's covering read is still running when the
  API is replaced. A new owner exists by then, so the null half alone passes and the departed
  gesture returns `landed`.

### Proof 8 — the post-landing check keeps its null-owner half (moved)

- **Mutation.** In `plan-writer.feature.ts`, reduce the same line to
  `if (!isActiveReader()) return 'refused';`.
- **Command.** B.
- **Expected failure.** `abandons queued adds when unmounted during their covering read` fails: a
  second create is issued with `afterId` `w1`.
- **Why.** On unmount the effect's cleanup sets `ownerRef.current` to null while the project and
  API props of the departing render still match, so only the null half can stop the queued add.

### Proof 9 — the busy release belongs to the reader, not the owner (moved)

- **Mutation.** In `plan-writer.feature.ts`, replace the `finally` guard with
  `if (isCurrent()) setBusy(false);`.
- **Command.** A.
- **Expected failure.** `announces an arrangement after the same reader renews its subscription`
  fails on its closing busy assertions, which are
  `expect(document.querySelector('[data-toolbar]')).toHaveAttribute('aria-busy', 'false')` and the
  three `toBeEnabled()` checks after it: the renewed reader is left busy forever.
- **Why.** `isCurrent()` compares the captured owner, and a covering read renews the owner for the
  same reader, so the gesture that raised the busy flag can never lower it again.
- **No substitute is accepted.** An earlier draft of this packet allowed
  `does not announce an old arrangement in its busy replacement` to fail instead. The second review
  showed that is a different defect and the allowance is deleted: that test watches a **departed**
  API whose busy state the replacement must never touch, while this mutation strands a **live**
  reader. If any test other than the renewal one fails here, restore the file and investigate
  before going on.

### Proof 10 — the completed prefix decides the reread set (moved)

- **Mutation.** In `plan-writer.feature.ts`, replace `: completed;` on the refusal path with
  `: [];`.
- **Commands.** A, then C.
- **Expected failures.** Under A, `refreshes a created tag after its attachment refuses` times out
  with one tag read instead of two. Under the unit target,
  `rereads the completed prefix of a gesture a later request refuses` fails on
  `expected [] to deeply equal [ [ 'directory' ] ]`.
- **Why.** The created tag's obligation lives only in the completed prefix of a gesture that later
  refused.

### Proof 11 — ambiguous failures recover everything (moved)

- **Mutation.** In `plan-writer.feature.ts`, replace `isAmbiguousWriteFailure(thrown)` with
  `false`.
- **Command.** A.
- **Expected failure.** `ambiguous transport failure has its exact recovery scope` times out
  waiting for `expect(reads).toHaveLength(allReads.length)`, with zero reads instead of nine.
- **Why.** A transport failure leaves the commit outcome unknown, so the completed prefix — empty
  here, because the request rejected — is not a safe recovery scope.

### Proof 12 — a malformed request rereads the plan (moved)

- **Mutation.** In `plan-writer.feature.ts`, drop `INVALID_REQUEST.has(refusal)` from the refusal
  condition.
- **Command.** A.
- **Expected failure.** `invalid body has its exact recovery scope` times out on the same nine-read
  assertion with zero reads.
- **Why.** `INVALID_REFUSAL`'s sentence claims the plan was read again; without this arm the
  sentence would be a lie. The case's cause is `new Error('invalid_body')`, which
  `failureText` returns verbatim and `INVALID_REQUEST` holds.

### Proof 13 — a gone target rereads the tree (moved)

- **Mutation.** In `plan-writer.feature.ts`, drop `refusal === GONE` from the refusal condition.
- **Command.** A.
- **Expected failure.** `says a row that has gone is gone, and rereads the tree that proves it`
  fails on `expected [ '010', '020', '030' ] to deeply equal [ '010', '020' ]`.
- **Why.** `GONE` says the row on screen is not there any more, which is a fact about the tree
  rather than about the request, so it earns a reread although nothing was written.

## 9. OpenSpec

**No OpenSpec change is created.** R4 says OpenSpec is required for observable behaviour,
contracts, migrations, deploy safety or architecture, and skipped for mechanical refactors. This
packet moves code without changing behaviour, and the batch's own rule is that an extraction which
seems to need a behaviour change is a stop condition.

Two accepted or active specifications constrain what moves, and the executor reads them as the
acceptance criteria for "no behaviour change":

- `openspec/specs/plan-refresh/spec.md`, requirement **"Read ownership ends with its project and
  API lifetime"**: "Disposal SHALL settle outstanding callers as disposed and prevent subsequent
  installation, stale changes, notifications, toasts and acknowledgments. A new project or API
  identity SHALL use a distinct owner, including when the project ID is unchanged." This is exactly
  the rule the moved guards implement. Its scenario **"Old requests settle after departure"** is
  what negative proofs 3, 4, 7 and 8 exercise through the production page.
- `openspec/specs/plan-refresh/spec.md`, requirement **"Failures remain visible until their
  resources recover"**, scenario **"A committed edit has a failed refresh"**: a mutation whose
  covering read fails SHALL remain landed. The moved code satisfies this by awaiting
  `rereadResources` and still returning `'landed'`; do not add a failure branch there.
- `openspec/changes/local-write-invalidation/specs/local-write-invalidation/spec.md` is an
  unarchived change whose requirement **"A successful prefix is refreshed after a later refusal"**
  and requirement **"Existing lifecycle and recovery semantics survive narrowing"** own the policy
  being moved. Read them; do not edit that change's `tasks.md` or `verify.md`. Its task 3.3 is
  still open and belongs to its own author, not to this packet.

`openspec/specs/wbs-table-modules/spec.md`, requirement "Concept modules preserve table behavior",
lists the modules the table composes and requires their existing behaviour preserved. Adding a
module the read module composes is inside that requirement, so it needs no delta while behaviour
holds.

The validation command is the batch's standard OpenSpec block, quoted in step 12. Do not substitute
a loose success check for it.

## 10. Verification

Every row states the exit status and the line or count that says it worked.

### What the executor runs

| Command                                                                                                                                                                                                                 | Expected                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit`                                                                                                                                                                       | Exit 0. `Test Files` one above step 0's number and `Tests` two above it.                                                |
| `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 src/components/wbs/plan-read-and-write.test.tsx src/components/wbs/plan-table.test.tsx src/components/wbs/plan-chart-seam.test.tsx)` | Exit 0. `Test Files 3 passed (3)` and `Tests 157 passed (157)`, assertions unedited.                                    |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                                                                                                                                                       | Exit 0, no diagnostic printed.                                                                                          |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                                                                                                                                                                            | Exit 0, no unused-import error.                                                                                         |
| `NX_DAEMON=false bunx nx run wbs-fe-01:test`                                                                                                                                                                            | Exit 0. Two summaries: the UTC one is one file and two tests above step 0's; the Auckland one is identical to step 0's. |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                                                                                                                                           | Exit 0.                                                                                                                 |
| The four named devsync checks in step 10                                                                                                                                                                                | Each `1 pass`, `0 fail`, or a failure naming only other packets' documents, recorded verbatim.                          |
| `NX_DAEMON=false bunx nx format:check --all`                                                                                                                                                                            | Exit 0, or failures naming only files outside this packet's seven, which are reported and left alone.                   |
| The OpenSpec block in step 12                                                                                                                                                                                           | One JSON report printed and the block exits 0.                                                                          |

### What the planner runs afterwards, and the executor reports as pending

| Command                                         | Why the executor cannot run it                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `git add` of the seven paths, then the commit   | The clone's Git directory is read-only here.                                                                      |
| `NX_DAEMON=false bunx nx run tool-devsync:test` | Its index checker runs `git write-tree` and `git add --update` against this clone; both need a writable database. |
| `bin/h2puni-gate.sh <sha>`                      | The host gate cannot run on this machine.                                                                         |

**What none of it proves.** Nothing here proves the writer is reachable from the real browser path:
that is the `e2e` target, which this packet does not run and which no behaviour change requires.
Nothing proves rule F1 mechanically — no lint rule forbids a React import from a service file yet;
that check is Task 3 of the rollout. The two unit tests prove the policy over a fake host only; the
production evidence is the DOM suites in the oracle. And the extraction is verified as a whole only
once the planner's three commands above have run.

## 11. Stop conditions

Stop and report rather than improvising when any of these happens.

1. Any assertion in an existing test has to change to make the suite pass. An extraction changes
   no behaviour; if it seems to need one, the extraction is wrong.
2. A `Proof:` comment has no home in the new file, or its test no longer exists. A proof comment is
   never deleted without its test.
3. A negative injection in section 8 does not produce the named failure, or produces it in a test
   other than the named one. There is no exemption: every one of the thirteen proofs is run,
   proof 6 included.
4. `wbs-table.tsx` appears to need an edit. It should not: `usePlanRead`'s parameters and return
   value are unchanged.
5. `apps/wbs/fe-01/src/lib/local-write.ts` appears to need a move. It does not in this packet —
   seven other consumers import `RunPlanWrite` from it (`plan-live.ts`, `plan-toolbar.tsx`,
   `use-estimate-drafts.ts`, `use-plan-dependencies.ts`, `use-plan-fields.ts`,
   `use-plan-structure.ts`, `use-reference-sets.ts`) and they belong to other packets' lanes.
6. The new suite fails in the node tier with a browser reference error. Do not move it to the DOM
   tier and do not edit `src/test-tiers.test.ts`: both are outside the file plan, and the move
   would make negative proofs 1 and 6 unrunnable. Stop; the planner decides. See Unknown 1.
7. `NX_DAEMON=false bunx nx run wbs-fe-01:test` fails in a file this packet did not touch, or its
   Auckland summary moves.
8. Making `busy` a store contract (rule F2) starts to look necessary. It is not, and it cannot be
   done here: `use-plan-dependencies.ts` shares the same setter.
9. Anything requires editing a file listed in section 12.
10. `applicationLibraryToolReadmes` does not read `19` at the start, or the count after adding one
    README is not `20`. Either means another lane has moved it; packet 040.6 runs after this one.
11. `NX_DAEMON=false bunx nx format:check --all` names one of this packet's seven files after the
    targeted write.
12. Any step seems to need `git add`, `git commit` or the host gate. None of them can run here;
    steps 10, 13 and 14 say what to do instead.

## 12. Out of lane

Do not touch these; another packet owns each. Two files are **shared in sequence** rather than out
of lane: `apps/wbs/fe-01/vitest.node-suites.ts` and the README count pin in
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` belong to 040.3 first and 040.6 second.
This packet adds only its own suite line and moves the pin only from 19 to 20.

| Path                                                                         | Owner                    |
| ---------------------------------------------------------------------------- | ------------------------ |
| `apps/wbs/fe-01/src/components/directory/directory-page.tsx`                 | packet 040.6             |
| `apps/wbs/fe-01/src/lib/remembered.ts`                                       | packet 040.6             |
| `apps/wbs/fe-01/src/lib/theme.ts`                                            | packet 040.6             |
| Browser-storage code in `apps/wbs/fe-01/src/components/wbs/project-page.tsx` | packet 040.6             |
| `apps/wbs/fe-01/src/components/wbs/use-plan-filter.ts`                       | another packet           |
| `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`                          | another packet           |
| `eslint.config.js` and any ESLint policy file                                | Task 3 of the rollout    |
| `openspec/changes/local-write-invalidation/tasks.md` and its `verify.md`     | that change's own author |
| `docs/wiki-policy/modules.json` and the wiki pilot path list                 | Task 9 of the rollout    |
| `apps/wbs/fe-01/src/lib/plan-refresh.ts` and the hook's feed code            | work item 040.4          |

## 13. How to run this packet: one session, three checkpoints

The second review asked whether this should be one executable session or several separately
reviewed slices. **One session for the implementation, with three places where the planner should
stop, read the diff and decide before the executor goes on.** Seven owned files and one extracted
callback are one medium-effort session's worth of work, and the lifecycle proofs must stay with the
extraction: deferring them into a follow-up task is how a moved guard loses its negative, which is
the defect this packet already had to repair once.

The checkpoints are cut where a wrong decision is cheapest to undo and where the next stretch
depends on the previous one being right.

Dispatch checkpoint 1 explicitly as "Steps 0–4 only; stop after Step 4," which is checkpoint A
below. Preserve its baseline report and evidence references for subsequent attempts.

| Checkpoint | After   | What the planner reads before saying go on                                                                                                                                              |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A          | Step 4  | The contract, both unit tests, the moved service, and the recorded red-then-green. If the contract is wrong, everything after it is wasted; this is the cheapest place to find out.     |
| B          | Step 8  | Thirteen observed failure lines, and the rewritten comment for proof 6. A proof watched wrongly here is a false claim in the repository, so it is reviewed before the suites are rerun. |
| C          | Step 14 | The report: counts against step 0's baseline, the four named devsync checks, and the pending list.                                                                                      |

**Integration is a separate executable handoff**, not part of this session: staging the seven
paths, running the whole `tool-devsync:test` target, committing, and the host gate. That handoff
belongs to the planner, because none of it can run in the executor's environment.

## Review disposition

### First review, 2026-09-19 (Codex gpt-6-astra, high effort)

Four critical, five important, two minor. Each was re-verified against the repository. Nothing was
weakened to make a finding disappear.

| Finding                                                    | Disposition         | Evidence and what changed                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 — the new README moves a pinned count           | Fixed               | Confirmed: the pin reads `applicationLibraryToolReadmes: 19,` and the shell count of current application, library and tool READMEs printed `19`. The test file is now in the file plan, section 3 records the pin and its house-style re-pin comments, and step 2 watches the failure at `20` before moving it.                                                |
| Critical 2 — lane overlap with 040.6                       | Fixed               | The planner serialized the two packets. Section 5, section 12 and step 3 now say 040.3 runs first, adds only its own suite line, and moves the pin only 19 to 20; a pin that does not read 19 at the start is stop condition 10.                                                                                                                               |
| Critical 3 — proof 3's mutation cannot fail its named test | Fixed               | Confirmed by reading: swapping the API prop re-runs the effect, which builds a new owner at `createPlanRefresh({ projectId, api })`, so the captured-owner half of `isCurrent` already rejects the departed gesture. Proof 3 is now the catch-path guard removal; the API half moved to proof 4 against the busy-replacement test, with the derivation stated. |
| Critical 4 — repository-wide format write                  | Fixed               | Step 6 now writes only this packet's seven files and then runs `bunx nx format:check --all` as a check, reporting unrelated failures without touching them.                                                                                                                                                                                                    |
| Important 1 — the fault table is structurally broken       | Fixed               | Confirmed, and this revision reproduced the same fault in this very table before repairing it: three rows carried a logical-or operator inside a code span, and Markdown reads each of its two characters as a cell delimiter. Section 8 is now numbered entries with fenced code, and it says why.                                                            |
| Important 2 — DOM proof commands are not executable        | Fixed               | Confirmed: `vitest` is not on the PATH. Section 8 defines two complete `TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1` commands with their working directory, and proof 10 now carries both its commands.                                                                                                                                        |
| Important 3 — moved decisions with no negative proof       | Fixed, and extended | Adopted the invalid-request proof (12) and the post-refresh active-reader proof (7). The success-path guard became proof 6; the second review found that first revision's handling still wrong, and proof 6 is now a pinned negative with a unit test of its own. See the second review below.                                                                 |
| Important 4 — Unknown 1's fallback contradicts the plan    | Fixed               | Confirmed: `src/test-tiers.test.ts` is not in the file plan and the fallback would have made proof 1 unrunnable. An unexpected browser dependency is now a stop condition (Unknown 1, stop condition 6).                                                                                                                                                       |
| Important 5 — the full-suite comparison has no baseline    | Fixed               | Confirmed: the `test` target runs a UTC suite and an Auckland suite and prints two summaries. New step 0 records both before anything is edited; step 11 and section 10 compare against it and state that the Auckland summary must not move.                                                                                                                  |
| Minor 1 — wrong sorted insertion position                  | Fixed               | Confirmed: `src/lib/` sorts before `src/modules/`, which sorts before `src/test-tiers.test.ts`. Step 3 now names those two neighbours.                                                                                                                                                                                                                         |
| Minor 2 — two inaccurate references                        | Fixed               | Confirmed: the post-implementation unit run is in step 4, and seven files import `RunPlanWrite` once `plan-live.ts` is counted. Both corrected.                                                                                                                                                                                                                |

One thing the first review asked for was answered rather than adopted verbatim: it suggested
pairing the API-half mutation with the busy-replacement test, which this packet verified and
adopted as proof 4.

### Second review, 2026-09-19 (Codex gpt-6-astra, high effort)

Two critical, four important, plus executability corrections and a cut-point question. The second
review confirmed all four first-review criticals and both minors fixed, and marked two importants
partly fixed; those two are the criticals below.

| Finding                                                             | Disposition | Evidence and what changed                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 — document verification needs forbidden Git writes       | Fixed       | Verified: `repo-namespacing-handoff.test.ts:429` spawns `check-indexes working`, and `apps/wiki/cli/src/inventory/read-candidate.ts` runs `write-tree` at line 278 and `add --update` at line 355 against this clone. The review cited `indexes/read-candidate.ts:278,345`; the file is under `inventory/` and the second call is at 355 — same two calls, same conclusion. Section 3 and steps 10, 13 and 14 now split the verification. |
| Critical 2 — an unauthorized negative-proof exemption               | Fixed       | Verified the distinguishing case against the contract in section 6: with the guard, a gesture whose feed owner is replaced mid-action returns `refused` with no reread; without it, `rereadResources(['tree'])` runs and it returns `landed`. Proof 6 is now a real negative with its own unit test, the exemption is gone from Unknown 5 and stop condition 3, and the stale comment is rewritten only after the failure is observed.    |
| Important 1 — the pin lookup expects the wrong number of matches    | Fixed       | Verified: the bare name matches three lines, 334, 390 and 557. Step 0 now uses the anchored pattern, and both `rg -n` and `grep -nE` were observed printing exactly `557:      applicationLibraryToolReadmes: 19,`.                                                                                                                                                                                                                       |
| Important 2 — historical counts contradict the baseline step        | Fixed       | Steps 4, 11 and section 10 now compare against step 0's recorded numbers. The planner's 34 / 554 survives only as dated orientation. The delta is now one file and **two** tests.                                                                                                                                                                                                                                                         |
| Important 3 — proof 9 accepts a substitute failing test             | Fixed       | Verified at `plan-read-and-write.test.tsx`: the renewal test closes with `toHaveAttribute('aria-busy', 'false')` and three `toBeEnabled()` checks, which is a stranded live reader, while the busy-replacement test watches a departed API. Different defects. The allowance is deleted and any other failure now requires restore and investigation.                                                                                     |
| Important 4 — mutation provenance disagrees with the instructions   | Fixed       | Section 8's preamble now states exactly one executed observation — the planner's 2026-09-19 removal of the success-path guard, 88 of 88 — separates it from the derived pairings, and says plainly that 88 green tests are a coverage gap. The disposition no longer contradicts the proof.                                                                                                                                               |
| Executability — daemon, subshells, named tests, no staging, no gate | Fixed       | Every Nx command carries `NX_DAEMON=false`; commands A, B and C run from the repository root, A and B in subshells; step 2 and step 10 run devsync tests by anchored name; steps 13 and 14 hand over instead of committing and do not run the host gate.                                                                                                                                                                                  |
| Cut points                                                          | Answered    | New section 13: one implementation session with three planner checkpoints after steps 4, 8 and 14, and integration as a separate handoff. The review's own recommendation, made explicit.                                                                                                                                                                                                                                                 |

Nothing in the second review was rejected. The one place this packet goes beyond it: the review
suggested the new unit test assert `refused` and no reread, and the packet also records that
`plan-read-and-write.test.tsx` stays at 88 of 88 under the same mutation, because that number is
the coverage gap in the open and belongs in the proof comment's evidence.

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): DISPATCH, checkpoint 1 only

Checkpoint 1 (Steps 0–4) has no blocking problem and may proceed now. Proof 6's expected-failure
text and its example `Proof:` comment claimed both assertions of the new test would fail, but the
first assertion throws, so the reread assertion is never reached; the planner rewrote both by hand
to name the single reached assertion and to state that the reread assertion is retained unchanged
though unreached. The planner also applied the non-blocking fixes by hand: the fixed
`/tmp/<name>.passing` examples in section 8 now read `"$TMPDIR/<name>.passing"`, the OpenSpec
invocation in Step 12 now carries `OPENSPEC_TELEMETRY=0`, section 13 now states that checkpoint 1
is "Steps 0–4 only; stop after Step 4," and the handoff `git status --short` in Step 13 now passes
`--untracked-files=all`. The blocking finding belongs to checkpoint 2, which is not dispatched
yet, so it was fixed before that checkpoint's own dispatch rather than after.
