# 040.6 Extract the directory — part 1 of 2

| Field                                        | Value                                                                                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item                                    | 040.6 "Extract directory and preferences", part 1 of 2: the directory                                                                                    |
| Part 2                                       | [040.6b, preferences](040-6b-preferences.md). Runs after this packet is integrated.                                                                      |
| Size class                                   | M                                                                                                                                                        |
| Wave                                         | 2. Runs after 040.3 is integrated.                                                                                                                       |
| Planning tokens, top model, high effort      | 3,000,000                                                                                                                                                |
| Implementation tokens, mid model, mid effort | 5,000,000                                                                                                                                                |
| Review tokens, top model, high effort        | 2,500,000                                                                                                                                                |
| Design implemented                           | [code organization design](../../specs/2026-09-19-code-organization-design.md), Task 6 of the [rollout plan](../2026-09-19-code-organization-rollout.md) |

Revised twice after adversarial review; every finding is answered in **Review disposition**. The
work item was one packet until the second review; it is now two, because seventeen mutation
proofs and two integrations are not one medium-effort session. This packet is the directory. The
preferences half is [040.6b](040-6b-preferences.md) and runs after this one is integrated.

## 1. Goal and non-goals

**Goal.** Take the directory's reads, writes, refetch-after-write policy and refusal mapping out
of the directory page into two plain-TypeScript modules — a Directory **resource**-service and a
Directory management **feature**-service — so the page holds rendering and view state only.

**Non-goals.** No behaviour change of any kind, including which side effect lands before which,
and including what a reader sees while a replaced client's first read is still in flight. No DI
Bag, no `module.ts`, no `check.ts`, no module-local `tsconfig.json`, no composition roots for the
three lifetimes, no change to `DirectoryApi`, and no edit to any ESLint policy file. No
preferences work: that is [040.6b](040-6b-preferences.md). Where the current behaviour looks like
a defect it is **preserved and listed as a finding**, never repaired inside an extraction.

## 2. Read first

| File                                                                               | Why                                                                                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                                        | Rules R1 to R5. R5 governs every `Proof:` comment this packet moves.                                |
| `LLM_README.md`                                                                    | R1 requires it before the task's own link.                                                          |
| [batch README](README.md)                                                          | The wave table, the file ownership table, the hidden frontend constraints and the standard blocks.  |
| [batch assumptions](ASSUMPTIONS.md)                                                | The two that took effect here: the strict-K2 split, and the deferred module type check.             |
| [code organization design](../../specs/2026-09-19-code-organization-design.md)     | Module layout, kinds, K1 to K9, F1 to F8.                                                           |
| [rollout plan](../2026-09-19-code-organization-rollout.md)                         | Task 6 is the procedure this packet details.                                                        |
| [040.3, extract the plan writer](040-3-plan-writer.md)                             | The packet this one waits for. Its section 5 says what it left in the node suites file and the pin. |
| `apps/wbs/fe-01/src/components/directory/directory-page.tsx`                       | The source. 1,405 lines; 27 calls on the injected directory client.                                 |
| `apps/wbs/fe-01/src/components/directory/directory-page.test.tsx`                  | 1,460 lines. The oracle. Read `fakeDirectory`, `pageWith` and the deferred-read case near line 673. |
| `apps/wbs/fe-01/src/lib/wbs-api.ts`                                                | `DirectoryApi` and its view and refusal types; `httpDirectoryApi`.                                  |
| `apps/wbs/fe-01/src/app-router.tsx`                                                | Line 99 passes `api={directoryApi}`; that prop must survive.                                        |
| `apps/wbs/fe-01/src/test-tiers.test.ts` and `apps/wbs/fe-01/vitest.node-suites.ts` | How a test joins the fast tier, and the word list that keeps it out.                                |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                          | The pinned README count this packet moves. Read the re-pin comments above it for the house style.   |
| `apps/wbs/fe-01/project.json`                                                      | The real target names. There is no `test:view` and no `test:api` target.                            |

## 3. Verified facts

Everything here was checked in the working tree on 2026-09-19 at `1eeacb0b`.

### Sizes, targets and runtime

- `apps/wbs/fe-01/src/components/directory/directory-page.tsx` is 1,405 lines;
  `apps/wbs/fe-01/src/components/directory/directory-page.test.tsx` is 1,460;
  `apps/wbs/fe-01/src/lib/wbs-api.ts` is 2,744;
  `apps/wbs/fe-01/src/components/wbs/plan-refusal.ts` is 580.
- `apps/wbs/fe-01/project.json` declares the project `wbs-fe-01` with targets `serve`, `build`,
  `test`, `test:unit`, `e2e`, `e2e-packaged`, `lint`, `lint:fast`, `typecheck`,
  `serve-local-solver`.
- The `test` target is **two differently selected runs**, not one suite twice: `TZ=UTC bunx
vitest run` over the base config, which excludes `*.zoned.test.*`, then `TZ=Pacific/Auckland
bunx vitest run --config vitest.zoned.config.ts`, whose `include` is only
  `src/**/*.zoned.test.{ts,tsx}`.
- **React is 19.2.8** (`package.json`, and `apps/wbs/eslint.product.mjs` spells the same version
  in its settings). Nothing in this packet relies on any batching behaviour.
- `apps/wbs/fe-01/vitest.config.ts` collects `src` test files recursively, so a test under a new
  modules directory is collected by the jsdom tier with no config edit.
- `apps/wbs/fe-01/tsconfig.app.json` includes the source tree recursively, so new module files are
  type-checked with no tsconfig edit. `@/*` maps to the app's source directory in five places.
  **No new alias is needed; do not add one.**

### What the repository's lint does to this code, measured

`eslint.config.js` line 113 enables `tseslint.configs.strictTypeChecked` and line 161 enables
`unused-imports/no-unused-imports` as an error. Three consequences were **measured** on
2026-09-19 by linting candidate files at their real paths with the repository's own
configuration:

- A service exposed as an **interface with method signatures** produces
  `@typescript-eslint/unbound-method` at every site that passes one of those members as a bare
  function — twelve errors across the feature-service and the hook. Every member of every
  contract in section 6 is therefore a **readonly function-typed property**, not a method
  signature, which is also what they actually are: closures in an object literal.
- `this: void` is **not** an available fix here: `@typescript-eslint/no-invalid-void-type` is on
  and rejects it (16 errors on one contract file when tried). Do not reach for it.
- `@typescript-eslint/require-await` is an error, so a fake member that is `async` without
  awaiting fails, and so does a test declared `async` that never awaits.

`apps/wbs/eslint.product.mjs` line 46 enables `reactHooks.configs['recommended-latest']`, so
`react-hooks/exhaustive-deps` is on; lines 64 to 67 switch off exactly four compiler rules. The
hook in section 6 was linted at its real path and reports nothing.

### The fast tier is chosen by scanning a test file's text

`apps/wbs/fe-01/src/test-tiers.test.ts` walks the tree and fails if `NODE_SUITES` and the files
disagree. Its `DOM_EVIDENCE` is, verbatim:

```text
/@testing-library|\bdocument\b|\bwindow\b|\blocation\b|WebSocket|localStorage|matchMedia|getComputedStyle|HTMLElement|\bnavigator\b|jsdom/
```

A fast-tier test must be a `.ts` file, must be listed in `NODE_SUITES`, and its text — comments
included — must contain none of those words. Both test files this packet adds were written under
that rule and were run green.

### The directory page today

- `DirectoryPage` takes `{ token, api?: DirectoryApi, nav?, account? }` (line 44). Line 199 is
  `const directory = useMemo(() => apiOverride ?? httpDirectoryApi(token), [apiOverride, token]);`.
  `apps/wbs/fe-01/src/app-router.tsx` line 99 passes `api={directoryApi}` and
  `directory-page.test.tsx` line 349 is `const pageWith = (api: DirectoryApi) => ...`.
  **The `api` prop must survive unchanged.**
- The page makes **27** calls on that client.
- Page state, lines 201 to 231: `people`, `teams`, `tags`, `workItemTypes`, `services`, `newTag`,
  `newWorkItemType`, `newService`, `newPerson`, `newTeam`, `problem`, `confirming`, `busy`,
  `renamed`, and the refs `focusChipAfterRedraw`, `chipNodes`, `latestRead`.
- There are **five** add handlers: `submitNewPerson` (537), `submitNewTeam` (550),
  `submitNewTag` (572), `submitNewWorkItemType` (597), `submitNewService` (618).
- Two multi-operation gestures sit inline in the markup: create a team and put a person in it
  (836 to 847), and create a service and make a team responsible for it (1007 to 1019). They are
  the design's model feature: one gesture over two resources.
- `latestRead` (255) is the newest-read generation guard; `attempt` (343) is the write runner and
  the refetch policy; `writesFor` (399) is the five-arm kind map.
- `effectSentence`, `EffectContext` and `DirectoryKind` are exported from the page and, verified
  by search over the frontend source and the browser-level tests, imported by **nothing** else.
- `failureText` comes from `apps/wbs/fe-01/src/components/wbs/plan-refusal.ts`, 580 lines of plain
  TypeScript importing no React, so a service may import it. The batch README records that it is
  misfiled and moves with the Notices module; no packet in this batch moves it.

### The three behaviours the extraction must reproduce exactly

1. **A completion runs inside the awaited change, before the refetch.** At line 455 `forgetDraft`
   runs inside `attempt`'s `change()`, before `read()` starts. The same holds for `setNewPerson('')`
   and its four siblings, for `setConfirming` in `askToRemove` (648), and for `setConfirming(null)`
   in `confirmRemoval` (661). Every gesture in section 6 therefore takes a **completion callback
   the service invokes inside the change**. Nothing in this packet depends on promise-resolution
   order or on framework batching.
2. **Replacing the client keeps what is on screen.** `people` and the rest are `useState` in the
   component, and `latestRead` is a `useRef`; when `apiOverride` changes, only `directory`, `read`
   and the arrival effect change identity. Nothing is cleared, and the old values stay on screen
   until the replacement's read lands. The resource therefore gains `replaceClient`, and the hook
   creates the service **once per mount**. A hook that rebuilt the service on `[api, token]` would
   expose an empty directory for the duration of that read, which is a behaviour change.
3. **A thrown removal confirms nothing.** `attempt` catches, records the refusal and refetches; no
   success callback runs. Modelled by the completion callbacks above, with no outcome union.

### The verbatim proof comments that move

These three are evidence. They are copied **exactly as they stand**, with no rewording and no
added claim, and each goes beside the check it describes. A new dated observation is added only
after the executor has watched that fault itself (section 8).

From `directory-page.tsx` 268 to 271, beside the generation comparison:

```ts
// Proof: this line deleted, `and only the newest read may write the screen`
// alone failed, on `expected null not to be null` — a superseded read
// putting the name somebody had just changed back on the panel. Watched
// 2026-08-13.
```

From 441 to 443, beside the **rename** guard and nowhere else:

```ts
   * Proof: this guard removed, `sends nothing when the name is whitespace
   * alone, and says so` failed on `Unable to find role="alert"`, with
   * `patchPerson` having been called `{ name: '' }`. Watched 2026-08-09.
```

From 638 to 642, beside the cascade `false`:

```ts
   * Proof: the two `false`s here pinned to `true`, **six** cases failed —
   * five on `Unable to find role="dialog"` (no confirmation ever drawn) and
   * `removes an entry nothing points at on the first request` on
   * `expected [ [ 't2', true ] ] to deeply equal [ [ 't2', false ] ]`. The
   * fault `steps-panel` already knows. Watched 2026-08-09.
```

### Types in `apps/wbs/fe-01/src/lib/wbs-api.ts`

| Symbol               | Line | Shape or note                                                             |
| -------------------- | ---- | ------------------------------------------------------------------------- |
| `TeamView`           | 576  | `{ id; name; serviceIds }`                                                |
| `TagView`            | 615  | `{ id; name }`                                                            |
| `WorkItemTypeView`   | 706  | `{ id; name }`                                                            |
| `ServiceView`        | 727  | `{ id; name }`                                                            |
| `PersonKindView`     | 776  | one of the two `PERSON_KINDS`                                             |
| `PersonIdentityView` | 784  | `{ id; name; kind }`                                                      |
| `PersonView`         | 802  | extends `PersonIdentityView` with `teamIds: string[]`                     |
| `DirectoryUsage`     | 886  | **`{ projects: UsedProject[]; members: { id; name }[] }`**, both required |
| `DirectoryRemoval`   | 899  | `{ ok: true } \| { ok: false; reason: 'in_use'; usage }`                  |
| `DirectoryWrite<T>`  | 911  | `{ ok: true; entry: T } \| { ok: false; reason: 'taken'; survivingName }` |
| `PersonPatch`        | 921  | `{ name?; kind?; teamIds?: readonly string[] }`                           |
| `TeamPatch`          | 957  | `{ name?; serviceIds?: readonly string[] }`                               |
| `DirectoryApi`       | 969  | 21 members                                                                |
| `DirectoryRefusal`   | 1921 | `{ reason: 'taken'; survivingName } \| { reason: 'refused'; code }`       |

The values are `httpDirectoryApi` (2275), `directoryRefusalSentence` (2087), `isPersonKind` (779)
and `httpProjectApi` (2364), which builds a directory client at line **2378** and spreads it at
line **2419**. This packet touches none of them.

### The new READMEs move a pinned count

`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` counts, under
`applicationLibraryToolReadmes`, every current document whose path ends `/README.md` and starts
with the applications, libraries or tools root. The test
`every legacy source occurrence and relevant text family is pinned` pins the number. Observed on
2026-09-19: `557:      applicationLibraryToolReadmes: 19,`. Packet 040.3 adds one README and
moves it to **20**; this packet adds **two** and moves it to **22**;
[040.6b](040-6b-preferences.md) adds one and moves it to **23**. The count comes from
`git ls-files --cached --others --exclude-standard`, so the failure appears as soon as the files
exist — staging neither avoids nor fixes it.

The house style is the two comments already above the pin.

### One devsync test needs Git writes, so verification splits

`the production index checker resolves current Markdown links and anchors` shells out to
`apps/wiki/cli/src/cli.ts check-indexes working`, which reaches
`apps/wiki/cli/src/inventory/read-candidate.ts` and runs `git write-tree` and
`git add --update` against this clone's object database. The executor's Git directory is
read-only, and omitting the staging does not make the test pass — it makes it throw on untracked
paths. So verification splits exactly as executor preamble rule 4a requires: the executor runs
the four filesystem-only checks by name, and the planner runs the whole target after staging.

The wiki index checker skips a `README.md` that carries no `module-index` envelope
(`apps/wiki/cli/src/indexes/read-indexes.ts`, `if (metadata === undefined) continue;`), so the two
READMEs here need nothing from it and register no module identity.

### Every snippet in this packet was compiled, linted and run

On 2026-09-19 the planner placed the section 6 files at their real paths in a scratch copy of the
tree, ran the repository's own ESLint over each and `tsc --noEmit -p
apps/wbs/fe-01/tsconfig.app.json` over the app, then ran both new suites, then removed them.
Observed: **0 errors, 0 warnings** on all nine files, `tsc` exit 0, and
`Test Files 2 passed (2)`, `Tests 24 passed (24)`. The two contested negative proofs were also
watched failing; their exact lines are in section 8. What this does **not** prove: the page
rewrite of step 6, which exists only as instructions, and anything about the DOM oracle.

## 4. Unknowns

1. **How many cases `directory-page.test.tsx` holds.** The planner read its first 90 lines, its
   `pageWith` helper and its deferred-read case, not all 1,460. **Settle it** with step 0's
   baseline; every later comparison uses that number, not a planner's.
2. **Whether `TeamView.serviceIds` permits `undefined`.** The page writes `team.serviceIds ?? []`
   throughout and section 6 does the same. **Settle it** by reading line 576; if it is required,
   the `?? []` is harmless and stays, because removing it would be an unrelated change.
3. **Whether the two READMEs trip any check beyond the count.** The wiki index checker skips an
   envelope-less README, and the four filesystem checks were run green by the planner over the
   batch's other documents. **Settle it** in step 8, and apply stop condition 9 if a check asks
   for module-index metadata or a registry entry.

## 5. File plan

Twelve created, three modified.

| File                                                                                   | Responsibility                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/wbs/fe-01/src/modules/store.ts`                                                  | The one store contract every stateful frontend service exposes           |
| `apps/wbs/fe-01/src/modules/directory/README.md`                                       | Wiki index for the resource module                                       |
| `apps/wbs/fe-01/src/modules/directory/contract.ts`                                     | The resource's exported types                                            |
| `apps/wbs/fe-01/src/modules/directory/directory.resource.ts`                           | Snapshot and store, newest-read guard, reads, write runner, client calls |
| `apps/wbs/fe-01/src/modules/directory/fake-directory-api.ts`                           | The in-memory recording client both module suites run on                 |
| `apps/wbs/fe-01/src/modules/directory/directory.resource.test.ts`                      | Fast-tier unit suite for the resource                                    |
| `apps/wbs/fe-01/src/modules/directory-management/README.md`                            | Wiki index for the feature module                                        |
| `apps/wbs/fe-01/src/modules/directory-management/contract.ts`                          | The feature's types, and the re-exports delivery reads                   |
| `apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.ts`      | The gestures: rename, five adds, two create-and-attach, ask, confirm     |
| `apps/wbs/fe-01/src/modules/directory-management/composition.ts`                       | The one site that sees both modules and the client                       |
| `apps/wbs/fe-01/src/modules/directory-management/view/use-directory-management.ts`     | The React adapter over the store contract, and the arrival read          |
| `apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.test.ts` | Fast-tier unit suite for the gestures                                    |
| `apps/wbs/fe-01/src/components/directory/directory-page.tsx`                           | **Modified.** Rendering and view state only                              |
| `apps/wbs/fe-01/vitest.node-suites.ts`                                                 | **Modified.** Two entries, this packet's own                             |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                              | **Modified.** The README count pin, 20 to 22                             |

No `module.ts`, `check.ts` or module-local `tsconfig.json`: the first two are DI Bag, rollout Task
8, and the third is the deferral recorded in [ASSUMPTIONS.md](ASSUMPTIONS.md).

## 6. Interfaces

Every file below was linted at its real path with the repository's configuration and reported
**0 errors, 0 warnings**, and the app type-checked with exit 0. Write them exactly as given.

### `apps/wbs/fe-01/src/modules/store.ts`

```ts
/**
 * What every stateful frontend service exposes, and the only way delivery reads
 * one — rule F2 of the code organization design.
 *
 * Two members and no more. A component subscribes and reads; it never receives a
 * setter, because the whole point of the split is that the decision about what
 * changes lives in the service.
 *
 * **The stability rule.** `snapshot` answers the *same object* on every call
 * until something inside it has changed, and a *different* object on the first
 * call after it has. Both halves are load-bearing and each fails its own way: a
 * snapshot rebuilt on every call makes `useSyncExternalStore` re-render on every
 * check and, inside a render, throws "getSnapshot should be cached"; a snapshot
 * left identical after a real change makes the screen ignore the change,
 * silently, with no error anywhere. The comparison a service makes is per field
 * and by identity, not deep.
 *
 * Function-typed properties rather than method signatures, because that is what
 * they are — closures in an object literal — and because a method signature
 * makes `@typescript-eslint/unbound-method` fire at every caller that passes one
 * as a bare function, which is exactly how `useSyncExternalStore` takes them.
 *
 * Created by packet 040.6 as its first user, which is the batch assumption
 * "one shared store contract, created by its first user".
 */
export interface Store<T> {
  /** Registers a listener and answers the way to drop it. */
  readonly subscribe: (onChange: () => void) => () => void;
  /** The current value. The same object until something in it changed. */
  readonly snapshot: () => T;
}
```

### `apps/wbs/fe-01/src/modules/directory/contract.ts`

```ts
import type {
  DirectoryApi,
  DirectoryRefusal,
  DirectoryRemoval,
  DirectoryWrite,
  PersonIdentityView,
  PersonKindView,
  PersonView,
  ServiceView,
  TagView,
  TeamView,
  WorkItemTypeView,
} from '@/lib/wbs-api';
import type { Store } from '@/modules/store';

/**
 * Which of the directory's five vocabularies an entry belongs to.
 *
 * Moved here from the directory page, where it was declared, exported, and
 * imported by nothing else.
 */
export type DirectoryKind = 'person' | 'team' | 'tag' | 'service' | 'type';

/**
 * Everything the directory holds for a reader, as one value.
 *
 * `busy` and `problem` are in here rather than in the page because they are the
 * observable half of this service's own write policy: a write raises `busy`,
 * clears `problem`, and either refuses in words or refetches.
 */
export interface DirectorySnapshot {
  readonly people: readonly PersonView[];
  readonly teams: readonly TeamView[];
  readonly tags: readonly TagView[];
  readonly services: readonly ServiceView[];
  readonly workItemTypes: readonly WorkItemTypeView[];
  /** True from the start of a write until its refetch has settled. */
  readonly busy: boolean;
  /** The last refusal, in the directory's own words, or null. */
  readonly problem: DirectoryRefusal | null;
}

/**
 * The account-wide directory: every person, team, tag, service and work item
 * type on this deployment, its staleness rule, and the one way a change to it is
 * run.
 *
 * A **resource**-service: one aggregate, its refresh, and the refusals it
 * models. It imports no React (rule F1) and exposes one store contract (F2). It
 * holds **no gesture**: which several operations make up one thing a person does
 * is the feature-service's knowledge. The plan pickers will share this resource,
 * which is why it is its own module.
 *
 * **Nothing here is optimistic.** Every write refetches and the snapshot is
 * replaced from what came back, so a refused change leaves the directory as the
 * server has it with the refusal beside it.
 *
 * **No socket.** This service opens no subscription. A reader sees somebody
 * else's change on the next read its caller asks for.
 */
export interface DirectoryResource extends Store<DirectorySnapshot> {
  /**
   * Reads all five vocabularies at once and installs them.
   *
   * Only the **newest** read may install. Three call sites fire this and none is
   * gated on the others, so an earlier read landing last would put a directory
   * older than what is on screen back on it, with nothing guaranteed to arrive
   * afterwards and repair it.
   *
   * @throws whatever the client throws. A failed read is never swallowed into an
   * empty directory; the caller reports it through `reportFailedRead`.
   */
  readonly read: () => Promise<void>;
  /** Records a failed read as the current problem, in the directory's words. */
  readonly reportFailedRead: (thrown: unknown) => void;
  /** Records a refusal the caller worked out for itself, such as an empty name. */
  readonly refuse: (refusal: DirectoryRefusal) => void;
  /**
   * Points the directory at a different client, **keeping everything it already
   * holds**.
   *
   * The page has always behaved this way: its vocabularies are component state
   * and its generation counter is a ref, so replacing the injected client
   * changed which client the next call used and cleared nothing. Rebuilding the
   * service instead would empty the panels for the length of the replacement's
   * first read, which is a behaviour change nobody asked for.
   */
  readonly replaceClient: (next: DirectoryApi) => void;
  /**
   * Runs one change: raise `busy`, clear `problem`, run it, turn a throw into a
   * refusal, then refetch either way, then lower `busy`.
   *
   * `change` is awaited **before** the refetch begins, so anything it calls — a
   * caller's completion callback included — lands where the page's own `attempt`
   * used to put it.
   */
  readonly runWrite: (change: () => Promise<void>) => Promise<void>;
  /**
   * The current write and its refetch, or an already-settled promise.
   *
   * A gesture is fired and not awaited, exactly as the page fires it, so this is
   * how a test reads the end of one without a timer. `busy` is the same fact
   * rendered.
   */
  readonly settled: () => Promise<void>;

  readonly renameEntry: (
    kind: DirectoryKind,
    id: string,
    name: string,
  ) => Promise<DirectoryWrite<{ id: string; name: string }>>;
  readonly removeEntry: (
    kind: DirectoryKind,
    id: string,
    cascade: boolean,
  ) => Promise<DirectoryRemoval>;

  readonly createPerson: (name: string) => Promise<PersonIdentityView>;
  readonly createTeam: (name: string) => Promise<TeamView>;
  readonly createTag: (name: string) => Promise<TagView>;
  readonly createService: (name: string) => Promise<ServiceView>;
  readonly createWorkItemType: (name: string) => Promise<WorkItemTypeView>;

  readonly setPersonKind: (id: string, kind: PersonKindView) => Promise<DirectoryWrite<PersonView>>;
  /** Sets exactly the teams a person belongs to — a full replacement, never a delta. */
  readonly setPersonTeams: (
    id: string,
    teamIds: readonly string[],
  ) => Promise<DirectoryWrite<PersonView>>;
  /** Sets exactly the services a team is responsible for — a full replacement. */
  readonly setTeamServices: (
    id: string,
    serviceIds: readonly string[],
  ) => Promise<DirectoryWrite<TeamView>>;
}
```

The factory is **not** declared here; `directory.resource.ts` exports
`createDirectory(client: DirectoryApi): DirectoryResource`.

### `apps/wbs/fe-01/src/modules/directory/directory.resource.ts`

```ts
import { failureText } from '@/components/wbs/plan-refusal';
import type { DirectoryApi, DirectoryRemoval, DirectoryWrite } from '@/lib/wbs-api';

import type { DirectoryKind, DirectoryResource, DirectorySnapshot } from './contract';

const NOTHING_YET: DirectorySnapshot = {
  people: [],
  teams: [],
  tags: [],
  services: [],
  workItemTypes: [],
  busy: false,
  problem: null,
};

/** The fields the store contract's stability rule is judged over, by identity. */
const FIELDS = ['people', 'teams', 'tags', 'services', 'workItemTypes', 'busy', 'problem'] as const;

/** Builds the directory over one client. Nothing is read until `read` is called. */
export function createDirectory(client: DirectoryApi): DirectoryResource {
  // A `let` and not a parameter read directly, so `replaceClient` can point every
  // closure below at a different client without rebuilding any of them — which is
  // what keeps the snapshot across a replacement.
  let api = client;
  let shown: DirectorySnapshot = NOTHING_YET;
  const listeners = new Set<() => void>();

  /**
   * Replaces the snapshot and tells its subscribers, **if anything moved**.
   *
   * The identity comparison is the store contract's stability rule: without it a
   * write of the same values would wake every subscriber for nothing, and inside
   * a React render would fail the cached-snapshot check outright.
   */
  const show = (next: Partial<DirectorySnapshot>): void => {
    const merged: DirectorySnapshot = { ...shown, ...next };
    if (FIELDS.every((field) => Object.is(merged[field], shown[field]))) return;
    shown = merged;
    for (const listen of [...listeners]) listen();
  };

  /** The newest read, and the only one entitled to install. */
  let latestRead = 0;

  /** The gesture in flight, for `settled`. */
  let inFlight: Promise<void> = Promise.resolve();

  /**
   * What renaming and removing mean for each vocabulary, in **one** place.
   *
   * A person's rename is a patch and so is a team's — both entities have a
   * second field on the same route — while a tag, a service and a type have
   * nothing but a name. That difference is the reason this is a map rather than
   * a naming convention.
   */
  const writesFor: Record<
    DirectoryKind,
    {
      rename: (id: string, name: string) => Promise<DirectoryWrite<{ id: string; name: string }>>;
      remove: (id: string, cascade: boolean) => Promise<DirectoryRemoval>;
    }
  > = {
    person: {
      rename: (id, name) => api.patchPerson(id, { name }),
      remove: (id, cascade) => api.removePerson(id, cascade),
    },
    team: {
      rename: (id, name) => api.patchTeam(id, { name }),
      remove: (id, cascade) => api.removeTeam(id, cascade),
    },
    tag: {
      rename: (id, name) => api.renameTag(id, name),
      remove: (id, cascade) => api.removeTag(id, cascade),
    },
    service: {
      rename: (id, name) => api.renameService(id, name),
      remove: (id, cascade) => api.removeService(id, cascade),
    },
    type: {
      rename: (id, name) => api.renameWorkItemType(id, name),
      remove: (id, cascade) => api.removeWorkItemType(id, cascade),
    },
  };

  const read = async (): Promise<void> => {
    const generation = latestRead + 1;
    latestRead = generation;
    const [foundPeople, foundTeams, foundTags, foundServices, foundWorkItemTypes] =
      await Promise.all([
        api.listPeople(),
        api.listTeams(),
        api.listTags(),
        api.listServices(),
        api.listWorkItemTypes(),
      ]);
    if (generation !== latestRead) return;
    show({
      people: foundPeople,
      teams: foundTeams,
      tags: foundTags,
      services: foundServices,
      workItemTypes: foundWorkItemTypes,
    });
  };

  const reportFailedRead = (thrown: unknown): void => {
    show({ problem: { reason: 'refused', code: failureText(thrown, 'request_failed') } });
  };

  const runWrite = (change: () => Promise<void>): Promise<void> => {
    const ran = (async () => {
      show({ busy: true, problem: null });
      try {
        await change();
      } catch (thrown: unknown) {
        show({ problem: { reason: 'refused', code: failureText(thrown, 'request_failed') } });
      }
      try {
        await read();
      } catch (thrown: unknown) {
        reportFailedRead(thrown);
      } finally {
        show({ busy: false });
      }
    })();
    inFlight = ran;
    return ran;
  };

  return {
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    snapshot: () => shown,
    read,
    reportFailedRead,
    refuse: (refusal) => {
      show({ problem: refusal });
    },
    replaceClient: (next) => {
      api = next;
    },
    runWrite,
    settled: () => inFlight,

    renameEntry: (kind, id, name) => writesFor[kind].rename(id, name),
    removeEntry: (kind, id, cascade) => writesFor[kind].remove(id, cascade),

    createPerson: (name) => api.addPerson(name, []),
    createTeam: (name) => api.addTeam(name),
    createTag: (name) => api.addTag(name),
    createService: (name) => api.addService(name),
    createWorkItemType: (name) => api.addWorkItemType(name),

    setPersonKind: (id, kind) => api.patchPerson(id, { kind }),
    setPersonTeams: (id, teamIds) => api.patchPerson(id, { teamIds }),
    setTeamServices: (id, serviceIds) => api.patchTeam(id, { serviceIds }),
  };
}
```

**The generation comparison carries the verbatim proof comment from section 3**, placed
immediately above `if (generation !== latestRead) return;`. Add nothing to it until step 7.

### `apps/wbs/fe-01/src/modules/directory-management/contract.ts`

```ts
import type {
  DirectoryApi,
  DirectoryUsage,
  PersonKindView,
  PersonView,
  TeamView,
} from '@/lib/wbs-api';
import type { DirectoryKind, DirectorySnapshot } from '@/modules/directory/contract';
import type { Store } from '@/modules/store';

/**
 * Re-exported so delivery imports this module and no other: rule K2 says a page
 * sees a feature-service and never the resource-service beneath it.
 */
export type { DirectoryKind, DirectorySnapshot };

/**
 * What became of a gesture that carries a typed name, answered **at once**.
 *
 * Synchronous, because the page's own handlers are: two of the three arms never
 * reach the network, and the third is fired and not awaited. Anything that has
 * to happen *after* the write arrives is the caller's completion callback, which
 * this service invokes at the exact point the page used to.
 *
 * - `empty`: the name was whitespace alone. Nothing was sent, the problem is
 *   `name_required`, and the caller keeps what was typed so it can be repaired.
 * - `unchanged`: the typed name equals the stored one. Nothing was sent, and the
 *   caller drops its draft itself.
 * - `sent`: a write is in flight. The completion callback runs when it answers,
 *   and does not run at all if it throws.
 *
 * So a draft is dropped on `unchanged` directly and on `sent` through the
 * callback, and kept on `empty`. An add gesture answers only `empty` or `sent`.
 */
export type NameWrite = 'empty' | 'unchanged' | 'sent';

/**
 * Everything a person does to the directory, as the gestures they would name.
 *
 * A **feature**-service: it coordinates one resource-service and holds the
 * knowledge the resource must not — that an empty name is refused without a
 * round trip, that a removal is always asked without a cascade first, and that
 * making a team for somebody is a create and a patch in one gesture.
 *
 * It re-exposes the store contract so the page never reaches past it.
 */
export interface DirectoryManagement extends Store<DirectorySnapshot> {
  readonly read: () => Promise<void>;
  readonly reportFailedRead: (thrown: unknown) => void;
  /** Points the directory at a different client, keeping what it holds. */
  readonly replaceClient: (next: DirectoryApi) => void;
  /** The current gesture and its refetch, for tests. */
  readonly settled: () => Promise<void>;

  /**
   * Sends the name typed over an entry's, if it says something different.
   *
   * `whenSent` runs after the write has answered and before the refetch begins —
   * where the page dropped its name draft — and does not run if the write threw.
   */
  readonly renameEntry: (
    kind: DirectoryKind,
    entry: { id: string; name: string },
    typedName: string,
    whenSent: () => void,
  ) => NameWrite;

  readonly addPerson: (typedName: string, whenAdded: () => void) => NameWrite;
  readonly addTeam: (typedName: string, whenAdded: () => void) => NameWrite;
  readonly addTag: (typedName: string, whenAdded: () => void) => NameWrite;
  readonly addService: (typedName: string, whenAdded: () => void) => NameWrite;
  readonly addWorkItemType: (typedName: string, whenAdded: () => void) => NameWrite;

  /** Marks somebody a person or an agent. Nothing is sent when they already are one. */
  readonly chooseKind: (person: PersonView, kind: PersonKindView) => void;
  readonly setMemberships: (person: PersonView, teamIds: readonly string[]) => void;
  readonly setOwnedServices: (team: TeamView, serviceIds: readonly string[]) => void;

  /** Creates a team and puts one person in it, as one gesture. */
  readonly addTeamForPerson: (person: PersonView, name: string) => void;
  /** Creates a service and makes one team responsible for it, as one gesture. */
  readonly addServiceForTeam: (team: TeamView, name: string) => void;

  /**
   * Asks for a removal **without** a cascade, which is always the first ask.
   *
   * `whenRefused` runs with the usage the server named, where the page opened its
   * confirmation. A removal that throws runs nothing and leaves the refusal in
   * the snapshot, which is what the page has always done.
   */
  readonly askToRemove: (
    kind: DirectoryKind,
    entry: { id: string; name: string },
    whenRefused: (usage: DirectoryUsage) => void,
  ) => void;
  /**
   * Repeats the removal **with** the cascade, after somebody has seen the usage.
   *
   * A second refusal is the server refusing what it just described. There is
   * nothing left to confirm against, so it is raised into the snapshot's problem
   * and `whenGone` does not run — the confirmation stays open with the refusal on
   * it, exactly as today.
   */
  readonly confirmRemoval: (kind: DirectoryKind, id: string, whenGone: () => void) => void;
}
```

### `apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.ts`

```ts
import type { DirectoryWrite } from '@/lib/wbs-api';
import type { DirectoryResource } from '@/modules/directory/contract';

import type { DirectoryManagement, NameWrite } from './contract';

/** Builds the gestures over one directory. */
export function createDirectoryManagement(directory: DirectoryResource): DirectoryManagement {
  const nameRequired = (): void => {
    directory.refuse({ reason: 'refused', code: 'name_required' });
  };

  /**
   * Reports a `taken` name, the one refusal a directory write answers with words
   * rather than a throw — and it carries the **surviving** name, so a sentence
   * built from what was typed would read the wrong one back.
   */
  const sayTaken = (written: DirectoryWrite<unknown>): void => {
    if (!written.ok) {
      directory.refuse({ reason: 'taken', survivingName: written.survivingName });
    }
  };

  /**
   * The shape all five adds share: trim, refuse an empty name without a round
   * trip, otherwise send and tell the caller once it has answered.
   */
  const add = (
    typedName: string,
    make: (clean: string) => Promise<unknown>,
    whenAdded: () => void,
  ): NameWrite => {
    const clean = typedName.trim();
    if (clean === '') {
      nameRequired();
      return 'empty';
    }
    void directory.runWrite(async () => {
      await make(clean);
      whenAdded();
    });
    return 'sent';
  };

  return {
    subscribe: directory.subscribe,
    snapshot: directory.snapshot,
    read: directory.read,
    reportFailedRead: directory.reportFailedRead,
    replaceClient: directory.replaceClient,
    settled: directory.settled,

    renameEntry: (kind, entry, typedName, whenSent) => {
      const clean = typedName.trim();
      if (clean === '') {
        nameRequired();
        return 'empty';
      }
      if (clean === entry.name) return 'unchanged';
      void directory.runWrite(async () => {
        const written = await directory.renameEntry(kind, entry.id, clean);
        // Here and not after the refetch: this is where the page dropped the
        // name draft, and a draft left standing over a value that has just come
        // back would hold the box at what this browser typed.
        whenSent();
        sayTaken(written);
      });
      return 'sent';
    },

    addPerson: (typedName, whenAdded) => add(typedName, directory.createPerson, whenAdded),
    addTeam: (typedName, whenAdded) => add(typedName, directory.createTeam, whenAdded),
    addTag: (typedName, whenAdded) => add(typedName, directory.createTag, whenAdded),
    addService: (typedName, whenAdded) => add(typedName, directory.createService, whenAdded),
    addWorkItemType: (typedName, whenAdded) =>
      add(typedName, directory.createWorkItemType, whenAdded),

    chooseKind: (person, kind) => {
      if (kind === person.kind) return;
      void directory.runWrite(async () => {
        sayTaken(await directory.setPersonKind(person.id, kind));
      });
    },
    setMemberships: (person, teamIds) => {
      void directory.runWrite(async () => {
        sayTaken(await directory.setPersonTeams(person.id, teamIds));
      });
    },
    setOwnedServices: (team, serviceIds) => {
      void directory.runWrite(async () => {
        sayTaken(await directory.setTeamServices(team.id, serviceIds));
      });
    },

    addTeamForPerson: (person, name) => {
      void directory.runWrite(async () => {
        const team = await directory.createTeam(name);
        sayTaken(await directory.setPersonTeams(person.id, [...person.teamIds, team.id]));
      });
    },
    addServiceForTeam: (team, name) => {
      void directory.runWrite(async () => {
        const service = await directory.createService(name);
        sayTaken(
          await directory.setTeamServices(team.id, [...(team.serviceIds ?? []), service.id]),
        );
      });
    },

    askToRemove: (kind, entry, whenRefused) => {
      void directory.runWrite(async () => {
        const outcome = await directory.removeEntry(kind, entry.id, false);
        if (outcome.ok) return;
        whenRefused(outcome.usage);
      });
    },
    confirmRemoval: (kind, id, whenGone) => {
      void directory.runWrite(async () => {
        const outcome = await directory.removeEntry(kind, id, true);
        if (!outcome.ok) throw new Error('in_use');
        whenGone();
      });
    },
  };
}
```

**Proof comment placement, exactly.** The rename proof from section 3 goes on `renameEntry`'s
`clean === ''` guard and **nowhere else**: it names `patchPerson`, which is what a person's rename
sends, and it is not evidence about the `add` helper. The cascade proof goes on `askToRemove`'s
`false`. The `add` helper's own guard gets no historical comment; it gets the dated one the
executor writes in step 7 after watching proof 7.

### `apps/wbs/fe-01/src/modules/directory-management/composition.ts`

```ts
import { type DirectoryApi, httpDirectoryApi } from '@/lib/wbs-api';
import { createDirectory } from '@/modules/directory/directory.resource';

import type { DirectoryManagement } from './contract';
import { createDirectoryManagement } from './directory-management.feature';

/**
 * The one place that sees both modules and the client at once.
 *
 * A composition site, which the design lets see everything because it installs
 * and supplies and holds no logic. It is here rather than in the view because
 * rule K2 says delivery imports a feature-service and nothing beneath it. The
 * application, session and project lifetimes of the rollout's last Task 6 row
 * take this over; until then it is two lines.
 */
export function directoryManagementOver(api: DirectoryApi): DirectoryManagement {
  return createDirectoryManagement(createDirectory(api));
}

/** The same over the real client for one token. */
export function directoryManagementFor(token: string): DirectoryManagement {
  return directoryManagementOver(httpDirectoryApi(token));
}
```

### `apps/wbs/fe-01/src/modules/directory-management/view/use-directory-management.ts`

```ts
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { type DirectoryApi, httpDirectoryApi } from '@/lib/wbs-api';

import { directoryManagementOver } from '../composition';
import type { DirectoryManagement, DirectorySnapshot } from '../contract';

/**
 * One directory for the life of a mount, its current snapshot, and the read that
 * fires on arrival and again whenever the client is replaced.
 *
 * `useSyncExternalStore` and not a `useState` an effect writes: the snapshot is
 * owned outside React, and a getter React compares is the contract for that.
 *
 * **Built once per mount, on purpose.** The page has always kept its
 * vocabularies in component state and its generation counter in a ref, so
 * replacing the injected client changed which client the next call used and
 * cleared nothing on screen. `useState` with a lazy initialiser reproduces that;
 * a `useMemo` keyed on the client would hand back an empty directory for the
 * length of the replacement's first read. The effect below installs the new
 * client and re-reads, which is what the page's own "Arrival." effect did when
 * its `read` callback changed identity.
 *
 * The client is `api` where one is handed in and the real one otherwise — the
 * page's bargain since the directory page shipped, kept here so tests go on
 * injecting a fake through the page's `api` prop.
 */
export function useDirectoryManagement(
  token: string,
  api?: DirectoryApi,
): { management: DirectoryManagement; shown: DirectorySnapshot } {
  const client = useMemo(() => api ?? httpDirectoryApi(token), [api, token]);
  const [management] = useState(() => directoryManagementOver(client));
  const shown = useSyncExternalStore(management.subscribe, management.snapshot);

  useEffect(() => {
    management.replaceClient(client);
    void management.read().catch(management.reportFailedRead);
  }, [management, client]);

  return { management, shown };
}
```

### What does not change

`DirectoryApi`, `httpDirectoryApi`, `httpProjectApi` and its spread, `app-router.tsx`, the page's
props, and every assertion in `directory-page.test.tsx`.

## 7. Steps

Each box is one action. Test steps come before implementation steps. Every command states what
success looks like. Every Nx command carries `NX_DAEMON=false`, and every command that changes
directory runs in a subshell from the repository root.

**This packet is dispatched as two bounded slices, not as one run.** Slice 1 is steps 0 to 5 and
ends at checkpoint A; the executor stops there and reports, and the planner reviews and commits
before slice 2 is dispatched. Slice 2 is steps 6 to 12 and ends at checkpoint B. Each slice has
its own completion checklist below, and section 13 says what the planner reads at each stop.

**Network is off.** Nothing in this packet needs it: every dependency is already installed in the
clone, and the launcher warms the OpenSpec command into this attempt's temporary root before
dispatch, because `bunx` keys its install directory by `TMPDIR`. If a command tries to reach the
network, stop and report rather than enabling it.

### Slice 1 — the store contract, the two modules, and their unit suites

### Step 0 — Prerequisites and baseline, before touching anything

Start only from a planner-prepared clone that already contains an integrated 040.3. Do not change
branches, do not merge anything, do not run `git add`, `git commit`, `git checkout -b`,
`git stash` or `git restore --staged`: they fail here, and the planner commits.

- [ ] `echo "$TMPDIR"` → expect a non-empty path, unique to this attempt. **Every scratch file,
      backup, fixture and piece of evidence in this packet lives under it.** No fixed path under
      the system temporary directory is used anywhere. `mkdir -p "$TMPDIR/evidence"`.
- [ ] `git rev-parse HEAD` → record the starting revision; every count below belongs to it.
- [ ] Check the prerequisite by its **artifact**, not by a count another lane could also have
      moved: `test -f apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts && echo present`
      → expect `present`. Absent means packet 040.3 has not been integrated into this clone:
      **stop and report**.
- [ ] Read the pin. The bare symbol appears three times in that file — the type member, the
      computation and the literal — so anchor the pattern to the pin itself:

```sh
rg -n '^[[:space:]]*applicationLibraryToolReadmes: [0-9]+,$' \
  tools/tool-devsync/src/repo-namespacing-handoff.test.ts
```

      Expected: exactly one line, reading `applicationLibraryToolReadmes: 20,` (the line number may
      differ). **If it reads 19, 040.3 has not been integrated: stop and report.** Any other number
      means a third lane has moved it: stop and report. `grep -nE` with the same pattern is
      equivalent if `rg` is unavailable.

- [ ] `grep -c "src/modules/" apps/wbs/fe-01/vitest.node-suites.ts` → expect at least `1`, the
      entry 040.3 added. `0` means 040.3 has not been integrated: stop and report.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit` → expect exit 0. Record the `Test Files`
      and `Tests` lines. **These recorded numbers, not the planner's, are what every later
      comparison uses.**
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:test` → expect exit 0. This target prints **two**
      summaries, a `TZ=UTC` one and a `TZ=Pacific/Auckland` one. Record both `Test Files` and both
      `Tests` lines.
- [ ] `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/components/directory/directory-page.test.tsx)`
      → expect exit 0. Record `Test Files` and `Tests`. **This is the oracle's baseline.**
- [ ] `git status --short` → expect no modification to any file in section 5. Unrelated
      modifications from other lanes may be present; leave them exactly as they are.

### Step 1 — Orient

- [ ] Read every file in section 2.
- [ ] Confirm `directory-page.tsx` line 199 still reads
      `const directory = useMemo(() => apiOverride ?? httpDirectoryApi(token), [apiOverride, token]);`.
      If it does not, stop and report.
- [ ] Confirm the three proof comments quoted in section 3 still stand at 268 to 271, 441 to 443
      and 638 to 642. If any has moved or changed, stop and report: they are the evidence this
      packet carries forward.

### Step 2 — The store contract and the two module directories

- [ ] `mkdir -p apps/wbs/fe-01/src/modules/directory apps/wbs/fe-01/src/modules/directory-management/view`
- [ ] Write `apps/wbs/fe-01/src/modules/store.ts` exactly as section 6 gives it.
- [ ] Write `apps/wbs/fe-01/src/modules/directory/contract.ts` and
      `apps/wbs/fe-01/src/modules/directory-management/contract.ts` exactly as section 6 gives
      them.
- [ ] Write `apps/wbs/fe-01/src/modules/directory/README.md` with this content:

```markdown
# Directory

The account-wide directory this deployment holds: its people, teams, tags, services and work item
types, the rule for which read may install, and the one way a change to it is run.

A resource-service. It is plain TypeScript and imports no React, which is rule F1 of the code
organization design in `docs/superpowers/specs/2026-09-19-code-organization-design.md`, and it
exposes the one store contract in `apps/wbs/fe-01/src/modules/store.ts`, which is rule F2.

## What it owns

- The five vocabularies as one snapshot, replaced only when something in it moved.
- The newest-read rule: three call sites fire a read, none gated on the others, and only the
  newest may install what it fetched.
- The write runner: raise busy, clear the problem, run the change, turn a throw into a refusal in
  the directory's own words, refetch either way, lower busy.
- Which route each of the five kinds renames and removes through.
- Pointing at a replacement client without losing what it already holds.

## What it does not own

Any gesture. Which several operations make up one thing a person does belongs to the
directory-management feature-service beside it, and the page talks only to that. Nothing here is
optimistic, and nothing here opens a socket.

## Relationships

The exported types are in `contract.ts`; the service is `directory.resource.ts`. There is no
`module.ts` yet: DI Bag is not installed, so the host builds the service with a plain factory
call, from `apps/wbs/fe-01/src/modules/directory-management/composition.ts`. The plan pickers are
expected to share this resource, which is why it is a module of its own rather than a private
member of the feature.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's own suite is
`directory.resource.test.ts`. The behaviour this extraction preserves is proved by
`apps/wbs/fe-01/src/components/directory/directory-page.test.tsx`, which runs in the `test` target
of the same project.
```

- [ ] Write `apps/wbs/fe-01/src/modules/directory-management/README.md` with this content:

```markdown
# Directory management

Everything a person does to the account-wide directory: renaming an entry, adding one of the five
kinds, making a team for somebody, making a service a team is responsible for, and removing an
entry once its usage has been seen.

A feature-service. It is plain TypeScript and imports no React, which is rule F1 of the code
organization design in `docs/superpowers/specs/2026-09-19-code-organization-design.md`. It
coordinates the directory resource-service beside it and holds no transport of its own.

## What it owns

- That a name of whitespace alone is refused without a round trip, and a name equal to the stored
  one is not sent at all.
- That a removal is always asked without a cascade first, and that a second refusal against a
  confirmed cascade is raised rather than turned into a second confirmation.
- That making a team for somebody, or a service for a team, is a create and then a patch — one
  gesture over two resources, which is the design's model feature.
- When a caller's completion callback runs: inside the awaited change, before the refetch, which
  is where the page dropped its name draft and cleared its boxes.

## What it does not own

The snapshot, the newest-read rule, the write runner and the client. Those are the directory
resource-service, which this module is the only importer of. The page's own view state — the name
drafts, the boxes being typed into, the open confirmation and the chip focus — stays in the page.

## Relationships

The exported types are in `contract.ts`; the service is `directory-management.feature.ts`;
`composition.ts` is the one site that sees this module, the resource module and the HTTP client at
once; `view/use-directory-management.ts` is the React adapter its one host reads it through. That
host is `apps/wbs/fe-01/src/components/directory/directory-page.tsx`. There is no `module.ts` yet:
DI Bag is not installed.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's own suite is
`directory-management.feature.test.ts`. The behaviour this extraction preserves is proved by
`apps/wbs/fe-01/src/components/directory/directory-page.test.tsx`, in the `test` target.
```

- [ ] Give neither README a Markdown link and no `module-index` comment. Each becomes a current
      document the moment it exists, and the namespacing test resolves every relative link it
      finds; inline code spans carry the paths instead, which that check does not follow. The wiki
      index checker skips a README with no index envelope, and registering a module identity needs
      `docs/wiki-policy/modules.json`, which is out of lane.

### Step 3 — Move the README count pin, red first

- [ ] Watch it fail, running that one test by name and **not** the whole file — the file also
      holds the index checker, which cannot run here:

```sh
bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
  -t '^every legacy source occurrence and relevant text family is pinned$'
```

      The four tests this packet runs by name are **top-level `test(...)` calls with no enclosing
      `describe`** in that file (verified: lines 409, 420, 442 and 538), so an anchored bare title
      is the full joined name and matches. Expected: **exactly 1 test runs** and it **fails**, its
      diff naming `applicationLibraryToolReadmes` with received `22` against expected `20`. Record
      the message. **A run that matches 0 tests is a stop condition**, not a pass: Bun reports
      success on an empty selection.

- [ ] Change the value to `22` and add a comment in the existing house style directly above it:

```ts
// Re-pinned 20 -> 22 for `apps/wbs/fe-01/src/modules/directory/README.md` and
// `apps/wbs/fe-01/src/modules/directory-management/README.md`, the directory's two module
// indexes, which the sweep must cover like any application README.
```

- [ ] Rerun the same named test → expect `1 pass`, `0 fail`. Zero tests matched is a stop.
- [ ] Nothing else in that pinned object changes. `categories`, `occurrences`, `digest` and
      `unclassified` come from legacy-root matches in source and configuration paths, and the
      relevance predicate rejects every Markdown path. If any of them also moves, stop and report.

### Step 4 — The two failing unit suites

- [ ] Add exactly these two lines to `NODE_SUITES` in `apps/wbs/fe-01/vitest.node-suites.ts`, in
      the list's sorted positions, and add nothing else:

```ts
  'src/modules/directory-management/directory-management.feature.test.ts',
  'src/modules/directory/directory.resource.test.ts',
```

- [ ] Write `apps/wbs/fe-01/src/modules/directory/fake-directory-api.ts`. It is production-lint
      source: no member may be `async` without awaiting, and every imported type must be used.

```ts
import type {
  DirectoryApi,
  DirectoryRemoval,
  DirectoryUsage,
  DirectoryWrite,
  PersonPatch,
  PersonView,
  TeamPatch,
  TeamView,
} from '@/lib/wbs-api';

/** The person every case starts from. */
export const KAT: PersonView = { id: 'p1', name: 'Kat', kind: 'person', teamIds: [] };
/** The team every case starts from. */
export const PLATFORM: TeamView = { id: 't1', name: 'Platform', serviceIds: [] };

/** What the recorder answers beside the client's own members. */
export interface RecordedDirectory {
  /** Every call this client took, in the order it took them. */
  readonly log: string[];
  readonly readCount: () => number;
  readonly removals: [string, boolean][];
  readonly renames: [string, string][];
  readonly creates: string[];
  readonly personPatches: { id: string; patch: PersonPatch }[];
  readonly teamPatches: { id: string; patch: TeamPatch }[];
  readonly refuseRemovalWith: (usage: DirectoryUsage | null) => void;
  readonly throwOnRemoval: (thrown: Error | null) => void;
  /** Holds every create until `releaseCreates` is called. */
  readonly holdCreates: () => void;
  readonly releaseCreates: () => void;
}

/**
 * A `DirectoryApi` over two in-memory vocabularies, with every call recorded in
 * order.
 *
 * The refusals are set per case rather than derived: what is under test is what a
 * service does with an answer, and a fake that worked out for itself when a name
 * is taken would be a second server to keep in step.
 *
 * Nothing here is `async`; every member answers an already-resolved promise, so
 * the strict rule against an `async` function that never awaits is satisfied. A
 * case that needs a read to hang replaces one member with a promise it resolves
 * by hand.
 */
export function fakeDirectoryApi(): DirectoryApi & RecordedDirectory {
  const people: PersonView[] = [KAT];
  const teams: TeamView[] = [PLATFORM];
  let reads = 0;
  let removalUsage: DirectoryUsage | null = null;
  let removalThrows: Error | null = null;
  let createGate: Promise<void> | null = null;
  let openCreates: (() => void) | null = null;
  const log: string[] = [];
  const removals: [string, boolean][] = [];
  const renames: [string, string][] = [];
  const creates: string[] = [];
  const personPatches: { id: string; patch: PersonPatch }[] = [];
  const teamPatches: { id: string; patch: TeamPatch }[] = [];

  const removal = (id: string, cascade: boolean): Promise<DirectoryRemoval> => {
    log.push(`remove:${id}:${String(cascade)}`);
    removals.push([id, cascade]);
    if (removalThrows !== null) return Promise.reject(removalThrows);
    return Promise.resolve<DirectoryRemoval>(
      removalUsage === null ? { ok: true } : { ok: false, reason: 'in_use', usage: removalUsage },
    );
  };

  const renamed = (
    id: string,
    name: string,
  ): Promise<DirectoryWrite<{ id: string; name: string }>> => {
    log.push(`rename:${id}:${name}`);
    renames.push([id, name]);
    return Promise.resolve<DirectoryWrite<{ id: string; name: string }>>({
      ok: true,
      entry: { id, name },
    });
  };

  const created = async <T>(what: string, name: string, entry: T): Promise<T> => {
    if (createGate !== null) await createGate;
    log.push(`${what}:${name}`);
    creates.push(name);
    return entry;
  };

  return {
    listPeople: () => {
      reads += 1;
      log.push('listPeople');
      return Promise.resolve([...people]);
    },
    listTeams: () => Promise.resolve([...teams]),
    listTags: () => Promise.resolve([]),
    listServices: () => Promise.resolve([]),
    listWorkItemTypes: () => Promise.resolve([]),
    listExternalSystems: () => Promise.resolve([]),

    addPerson: (name) =>
      created('addPerson', name, { id: `new-${name}`, name, kind: 'person' as const }),
    addTeam: (name) => created('addTeam', name, { id: `new-${name}`, name, serviceIds: [] }),
    addTag: (name) => created('addTag', name, { id: `new-${name}`, name }),
    addService: (name) => created('addService', name, { id: `new-${name}`, name }),
    addWorkItemType: (name) => created('addWorkItemType', name, { id: `new-${name}`, name }),

    patchPerson: (id, patch) => {
      log.push(`patchPerson:${id}`);
      personPatches.push({ id, patch });
      if (patch.name !== undefined) renames.push([id, patch.name]);
      const entry: PersonView = {
        ...KAT,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.kind === undefined ? {} : { kind: patch.kind }),
        teamIds: patch.teamIds === undefined ? [...KAT.teamIds] : [...patch.teamIds],
      };
      return Promise.resolve<DirectoryWrite<PersonView>>({ ok: true, entry });
    },
    patchTeam: (id, patch) => {
      log.push(`patchTeam:${id}`);
      teamPatches.push({ id, patch });
      if (patch.name !== undefined) renames.push([id, patch.name]);
      const entry: TeamView = {
        ...PLATFORM,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        serviceIds: patch.serviceIds === undefined ? [] : [...patch.serviceIds],
      };
      return Promise.resolve<DirectoryWrite<TeamView>>({ ok: true, entry });
    },

    renameTag: renamed,
    renameService: renamed,
    renameWorkItemType: renamed,

    removePerson: removal,
    removeTeam: removal,
    removeTag: removal,
    removeService: removal,
    removeWorkItemType: removal,

    log,
    readCount: () => reads,
    removals,
    renames,
    creates,
    personPatches,
    teamPatches,
    refuseRemovalWith: (usage) => {
      removalUsage = usage;
    },
    throwOnRemoval: (thrown) => {
      removalThrows = thrown;
    },
    holdCreates: () => {
      createGate = new Promise<void>((resolve) => {
        openCreates = resolve;
      });
    },
    releaseCreates: () => {
      openCreates?.();
      createGate = null;
      openCreates = null;
    },
  };
}
```

- [ ] Write `apps/wbs/fe-01/src/modules/directory/directory.resource.test.ts`. Its text must
      contain none of the banned words in section 3. **Eleven cases:**

```ts
import { expect, test } from 'vitest';

import type { DirectoryRefusal, DirectoryUsage, PersonView } from '@/lib/wbs-api';

import { createDirectory } from './directory.resource';
import { fakeDirectoryApi, KAT, PLATFORM } from './fake-directory-api';

const USED: DirectoryUsage = { projects: [], members: [{ id: 'p1', name: 'Kat' }] };

test('a read installs all five vocabularies', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api);

  expect(directory.snapshot().people).toEqual([]);
  await directory.read();
  expect(directory.snapshot().people).toEqual([KAT]);
  expect(directory.snapshot().teams).toEqual([PLATFORM]);
});

test('the snapshot is the same object until something changed', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api);
  const before = directory.snapshot();

  expect(directory.snapshot()).toBe(before);
  await directory.read();
  const after = directory.snapshot();
  expect(after).not.toBe(before);
  expect(directory.snapshot()).toBe(after);
});

test('a refusal that says nothing new replaces no snapshot and wakes nobody', () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api);
  let told = 0;
  directory.subscribe(() => {
    told += 1;
  });
  const sameRefusal: DirectoryRefusal = { reason: 'refused', code: 'name_required' };

  directory.refuse(sameRefusal);
  const after = directory.snapshot();
  expect(told).toBe(1);

  directory.refuse(sameRefusal);
  expect(directory.snapshot()).toBe(after);
  expect(told).toBe(1);
});

test('subscribers are told once a read has installed, and not after they drop', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api);
  let told = 0;
  const drop = directory.subscribe(() => {
    told += 1;
  });

  await directory.read();
  expect(told).toBeGreaterThan(0);

  drop();
  const quiet = told;
  api.refuseRemovalWith(USED);
  directory.refuse({ reason: 'refused', code: 'request_failed' });
  expect(told).toBe(quiet);
});

test('only the newest read may install', async () => {
  const api = fakeDirectoryApi();
  /** Every people read still in flight, oldest first, answered by hand. */
  const pending: ((found: PersonView[]) => void)[] = [];
  api.listPeople = () =>
    new Promise<PersonView[]>((answer) => {
      pending.push(answer);
    });
  const directory = createDirectory(api);

  const first = directory.read();
  const second = directory.read();
  expect(pending).toHaveLength(2);

  // The newest answers first — somebody has renamed Kat to Bo.
  pending[1]?.([{ ...KAT, name: 'Bo' }]);
  await second;
  // Then the older one lands, carrying the name nobody holds any more.
  pending[0]?.([{ ...KAT, name: 'Stale' }]);
  await first;

  expect(directory.snapshot().people[0]?.name).toBe('Bo');
});

test('a write raises busy, refetches, and lowers it', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api);
  await directory.read();
  const before = api.readCount();

  const ran = directory.runWrite(async () => {
    await directory.renameEntry('tag', 'g1', 'legal');
  });
  expect(directory.snapshot().busy).toBe(true);
  await ran;
  expect(directory.snapshot().busy).toBe(false);
  expect(api.readCount()).toBe(before + 1);
});

test('a write that throws becomes a refusal, and still refetches', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api);
  api.throwOnRemoval(new Error('offline'));
  await directory.read();
  const before = api.readCount();

  await directory.runWrite(async () => {
    await directory.removeEntry('person', 'p1', false);
  });

  expect(directory.snapshot().problem).not.toBeNull();
  expect(directory.snapshot().busy).toBe(false);
  expect(api.readCount()).toBe(before + 1);
});

test('a refetch that throws becomes a refusal, and busy still falls', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api);
  await directory.read();
  api.listPeople = () => Promise.reject(new Error('offline'));

  await directory.runWrite(() => Promise.resolve());

  expect(directory.snapshot().problem).not.toBeNull();
  expect(directory.snapshot().busy).toBe(false);
});

test('a removal is passed the cascade it was given', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api);
  api.refuseRemovalWith(USED);

  await expect(directory.removeEntry('person', 'p1', false)).resolves.toEqual({
    ok: false,
    reason: 'in_use',
    usage: USED,
  });
  expect(api.removals).toEqual([['p1', false]]);
});

test('each kind renames through its own route', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api);

  await directory.renameEntry('person', 'p1', 'Bo');
  await directory.renameEntry('team', 't1', 'Core');
  await directory.renameEntry('tag', 'g1', 'legal');

  expect(api.personPatches).toEqual([{ id: 'p1', patch: { name: 'Bo' } }]);
  expect(api.teamPatches).toEqual([{ id: 't1', patch: { name: 'Core' } }]);
  expect(api.renames).toContainEqual(['g1', 'legal']);
});

test('a replaced client keeps everything the directory already held', async () => {
  const api = fakeDirectoryApi();
  const directory = createDirectory(api);
  await directory.read();
  expect(directory.snapshot().people).toEqual([KAT]);

  const next = fakeDirectoryApi();
  const pending: ((found: PersonView[]) => void)[] = [];
  next.listPeople = () =>
    new Promise<PersonView[]>((answer) => {
      pending.push(answer);
    });

  directory.replaceClient(next);
  const reading = directory.read();

  // The whole of the claim: what was on screen is still on screen while the
  // replacement's own read is in flight.
  expect(directory.snapshot().people).toEqual([KAT]);

  pending[0]?.([{ ...KAT, name: 'Bo' }]);
  await reading;
  expect(directory.snapshot().people[0]?.name).toBe('Bo');
});
```

- [ ] Write `apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.test.ts`.
      **Thirteen cases:**

```ts
import { expect, test } from 'vitest';

import type { DirectoryUsage } from '@/lib/wbs-api';
import { createDirectory } from '@/modules/directory/directory.resource';
import { fakeDirectoryApi, KAT, PLATFORM } from '@/modules/directory/fake-directory-api';

import { createDirectoryManagement } from './directory-management.feature';

const USED: DirectoryUsage = { projects: [], members: [{ id: 'p1', name: 'Kat' }] };

const over = (api: ReturnType<typeof fakeDirectoryApi>) =>
  createDirectoryManagement(createDirectory(api));

/** Counts how often a completion callback ran, which is the whole ordering claim. */
function counter(): { note: () => void; ran: () => number } {
  let ran = 0;
  return {
    note: () => {
      ran += 1;
    },
    ran: () => ran,
  };
}

test('a name of whitespace alone is never sent, and says so', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const draft = counter();
  await management.read();

  expect(management.renameEntry('person', KAT, '   ', draft.note)).toBe('empty');
  expect(api.renames).toEqual([]);
  expect(draft.ran()).toBe(0);
  expect(management.snapshot().problem).toEqual({ reason: 'refused', code: 'name_required' });
});

test('a name equal to the stored one is not sent', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const draft = counter();
  await management.read();

  expect(management.renameEntry('person', KAT, 'Kat', draft.note)).toBe('unchanged');
  expect(api.renames).toEqual([]);
  expect(draft.ran()).toBe(0);
});

test('a rename is trimmed, sent, and its caller told before the refetch', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  await management.read();
  /** What the counter read at the moment the refetch began. */
  let atRefetch = -1;
  const draft = counter();
  api.listPeople = () => {
    atRefetch = draft.ran();
    return Promise.resolve([KAT]);
  };

  expect(management.renameEntry('person', KAT, '  Bo  ', draft.note)).toBe('sent');
  await management.settled();

  expect(api.personPatches).toEqual([{ id: 'p1', patch: { name: 'Bo' } }]);
  expect(draft.ran()).toBe(1);
  // The whole ordering claim: the caller had already been told when the refetch
  // started, which is where the page dropped its name draft.
  expect(atRefetch).toBe(1);
});

test('a rename that throws never tells its caller', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const draft = counter();
  await management.read();
  api.patchPerson = () => Promise.reject(new Error('offline'));

  expect(management.renameEntry('person', KAT, 'Bo', draft.note)).toBe('sent');
  await management.settled();

  expect(draft.ran()).toBe(0);
  expect(management.snapshot().problem).not.toBeNull();
});

test('each of the five adds trims, sends and clears its box', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const cleared = counter();
  await management.read();

  expect(management.addPerson('  Bo  ', cleared.note)).toBe('sent');
  await management.settled();
  expect(management.addTeam('Core', cleared.note)).toBe('sent');
  await management.settled();
  expect(management.addTag('legal', cleared.note)).toBe('sent');
  await management.settled();
  expect(management.addService('Payments', cleared.note)).toBe('sent');
  await management.settled();
  expect(management.addWorkItemType('Spike', cleared.note)).toBe('sent');
  await management.settled();

  expect(api.creates).toEqual(['Bo', 'Core', 'legal', 'Payments', 'Spike']);
  expect(cleared.ran()).toBe(5);
});

test('an empty add is refused without a request and keeps its box', () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const cleared = counter();

  expect(management.addPerson('   ', cleared.note)).toBe('empty');
  expect(api.creates).toEqual([]);
  expect(cleared.ran()).toBe(0);
  expect(management.snapshot().problem).toEqual({ reason: 'refused', code: 'name_required' });
});

test('choosing the kind somebody already has sends nothing', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  await management.read();

  management.chooseKind(KAT, 'person');
  await management.settled();

  expect(api.personPatches).toEqual([]);
});

test('making a team for somebody creates before it patches', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  await management.read();
  api.holdCreates();

  management.addTeamForPerson(KAT, 'Core');
  await Promise.resolve();
  await Promise.resolve();
  // Nothing may reach the person while the team is still being made.
  expect(api.log.filter((entry) => entry.startsWith('patchPerson'))).toEqual([]);

  api.releaseCreates();
  await management.settled();

  expect(api.log.filter((entry) => !entry.startsWith('list'))).toEqual([
    'addTeam:Core',
    'patchPerson:p1',
  ]);
  expect(api.personPatches).toEqual([{ id: 'p1', patch: { teamIds: ['new-Core'] } }]);
});

test('making a service for a team creates before it patches', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  await management.read();
  api.holdCreates();

  management.addServiceForTeam(PLATFORM, 'Payments');
  await Promise.resolve();
  await Promise.resolve();
  expect(api.log.filter((entry) => entry.startsWith('patchTeam'))).toEqual([]);

  api.releaseCreates();
  await management.settled();

  expect(api.log.filter((entry) => !entry.startsWith('list'))).toEqual([
    'addService:Payments',
    'patchTeam:t1',
  ]);
  expect(api.teamPatches).toEqual([{ id: 't1', patch: { serviceIds: ['new-Payments'] } }]);
});

test('a removal is always asked without a cascade first', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  api.refuseRemovalWith(USED);
  const refused: DirectoryUsage[] = [];
  await management.read();

  management.askToRemove('person', KAT, (usage) => refused.push(usage));
  await management.settled();

  expect(api.removals).toEqual([['p1', false]]);
  expect(refused).toEqual([USED]);
});

test('a removal nothing points at confirms nothing', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const refused = counter();
  await management.read();

  management.askToRemove('person', KAT, refused.note);
  await management.settled();

  expect(api.removals).toEqual([['p1', false]]);
  expect(refused.ran()).toBe(0);
});

test('a confirmed removal repeats the ask with the cascade', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const gone = counter();
  await management.read();

  management.confirmRemoval('person', 'p1', gone.note);
  await management.settled();

  expect(api.removals).toEqual([['p1', true]]);
  expect(gone.ran()).toBe(1);
});

test('a second refusal against a confirmed cascade is raised, not confirmed', async () => {
  const api = fakeDirectoryApi();
  const management = over(api);
  const gone = counter();
  api.refuseRemovalWith(USED);
  await management.read();

  management.confirmRemoval('person', 'p1', gone.note);
  await management.settled();

  expect(gone.ran()).toBe(0);
  expect(management.snapshot().problem).not.toBeNull();
});
```

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit` → expect the run to **fail**, reporting
      that `./directory.resource` and `./directory-management.feature` cannot be resolved. Record
      the message. Do not go on until you have seen it.

### Step 5 — The two services

- [ ] Write `apps/wbs/fe-01/src/modules/directory/directory.resource.ts` and
      `apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.ts` exactly as
      section 6 gives them, with the three verbatim proof comments placed as section 6 says.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit` → expect exit 0, with `Test Files` two
      above step 0's number and `Tests` twenty-four above it.

### Slice 1 completion checklist — checkpoint A

Stop here and report. Do not start step 6 until the planner has reviewed and committed.

- [ ] `$TMPDIR` recorded, `$TMPDIR/evidence` created, and nothing written outside the clone and it.
- [ ] Step 0's four baselines recorded, the 040.3 artifact found, and the pin read `20` at entry.
- [ ] The eight files of steps 2, 4 and 5 exist: `store.ts`, both contracts, both READMEs, the
      fake, and the two services. `vitest.node-suites.ts` gained exactly two lines and the pin
      moved 20 to 22 with a house-style comment.
- [ ] The red observation of step 4 was recorded before either service existed.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit` is `+2` files and `+24` tests against step 0.
- [ ] `directory-page.tsx` is **untouched** in this slice.
- [ ] The report names the eight paths plus the two modified files, and the commit subject
      `refactor(wbs-fe): add the directory resource and feature services`. Nothing was staged or
      committed.

### Slice 2 — composition, the React adapter, the page, and the proofs

### Step 6 — Composition, the adapter, and the page

- [ ] Write `apps/wbs/fe-01/src/modules/directory-management/composition.ts` and
      `apps/wbs/fe-01/src/modules/directory-management/view/use-directory-management.ts` exactly as
      section 6 gives them.
- [ ] In `directory-page.tsx`, replace line 199 and the seven `useState` calls it feeds —
      `people`, `teams`, `tags`, `workItemTypes`, `services`, `problem`, `busy` — with:

```ts
const { management, shown } = useDirectoryManagement(token, apiOverride);
const { people, teams, tags, services, workItemTypes, busy, problem } = shown;
```

- [ ] Delete from the page: `latestRead`, `read`, `reportFailedRead`, `attempt`, `writesFor`, and
      the **bodies** of `commitRename`, `commitKind`, `setMemberships`, `setOwnedServices` and the
      five `submitNew*` handlers. Move their comments, and the three verbatim proof comments, to
      the module files.
- [ ] **Delete the page's "Arrival." effect** (lines 284 to 287). Its read now lives in the hook,
      which fires on mount and again whenever the client is replaced — the two occasions the
      page's own effect fired. Move its comment into the hook.
- [ ] Keep every other function in the page **under its own name**, as a one-line delegation, so
      no caller in the markup has to change. The markup calls `commitKind` at line 769,
      `setMemberships` at 833, `removeMembership` at 803 and 813, and `setOwnedServices` at 972 and
      1004; `removeMembership` calls `setMemberships` at line 531:

```ts
function commitKind(person: PersonView, kind: PersonKindView): void {
  management.chooseKind(person, kind);
}

function setMemberships(person: PersonView, teamIds: readonly string[]): void {
  management.setMemberships(person, teamIds);
}

function setOwnedServices(team: TeamView, serviceIds: readonly string[]): void {
  management.setOwnedServices(team, serviceIds);
}

function commitRename(kind: DirectoryKind, entry: { id: string; name: string }): void {
  const outcome = management.renameEntry(kind, entry, nameShown(entry), () => {
    forgetDraft(entry.id);
  });
  if (outcome === 'unchanged') forgetDraft(entry.id);
}

function submitNewPerson(event: SubmitEvent<HTMLFormElement>): void {
  event.preventDefault();
  management.addPerson(newPerson, () => {
    setNewPerson('');
  });
}

function askToRemove(kind: DirectoryKind, entry: { id: string; name: string }): void {
  management.askToRemove(kind, entry, (usage) => {
    setConfirming({ kind, id: entry.id, name: entry.name, usage });
  });
}

function confirmRemoval(): void {
  if (confirming === null) return;
  const asked = confirming;
  management.confirmRemoval(asked.kind, asked.id, () => {
    setConfirming(null);
  });
}
```

      The four other add forms follow `submitNewPerson` exactly, each with its own box:
      `management.addTeam(newTeam, …)`, `management.addTag(newTag, …)`,
      `management.addWorkItemType(newWorkItemType, …)`, `management.addService(newService, …)`.

- [ ] Replace the two inline `onCreate` gestures in the markup with one call each:
      `management.addTeamForPerson(person, name)` at the people card's picker (lines 835 to 847)
      and `management.addServiceForTeam(team, name)` at the teams card's (lines 1006 to 1019).
- [ ] The return-to-page effect stays in the page. Its body becomes
      `void management.read().catch(management.reportFailedRead);` in both listeners and its
      dependency list becomes `[management]`, which is stable. Keep its comment.
- [ ] Keep in the page, unmoved: `newTag`, `newWorkItemType`, `newService`, `newPerson`, `newTeam`,
      `renamed`, `confirming`, `focusChipAfterRedraw`, `chipNodes`, `chipKey`, `withoutDraft`,
      `forgetDraft`, `nameShown`, `teamsOf`, `servicesOf`, `membersOf`, `neighbourChip`,
      `removeMembership`, `assumedName`, `count`, `effectSentence`, `EffectContext`, the three
      tap-target constants and all markup.
- [ ] `DirectoryKind` moves to the resource contract and is re-exported through the feature
      contract. The page uses it as a type **and** re-exports it, so it needs **both** — a bare
      `export type { DirectoryKind } from '…'` creates no local binding and every use in the file
      would stop resolving:

```ts
import type { DirectoryKind } from '@/modules/directory-management/contract';

export type { DirectoryKind };
```

- [ ] `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/components/directory/directory-page.test.tsx)`
      → expect exit 0 with **exactly step 0's recorded counts**. **If a case fails, do not edit its
      assertion** (stop condition 1).

### Step 7 — Negative proofs

- [ ] Run every proof in section 8, in order, each with the restore discipline given there. Only
      after observing a failure may the adjacent dated `Proof:` comment be written, and it must
      describe what was actually seen.

### Step 8 — Compile, lint, format, and the split document checks

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → expect exit 0, no diagnostic.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → expect exit 0, no warning.
- [ ] `bunx prettier --write` over exactly the fifteen paths in section 5, then
      `NX_DAEMON=false bunx nx format:check --all` → expect exit 0, or failures naming only files
      outside section 5, which are reported and left alone. **Never run a repository-wide format
      write.**
- [ ] Run the four filesystem-only devsync checks by name. Each reads the tree through
      `git ls-files`, which is read-only, so all four run here:

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

      Expected: **four runs, each reporting exactly `1 pass`, `0 fail`**. All four are top-level
      `test(...)` calls with no enclosing `describe`, so the anchored title is the full joined
      name. **Any run reporting 0 tests matched is a stop condition** — Bun exits zero on an empty
      selection, so the count is the evidence, not the exit status. A failure naming a path this
      packet created is a stop condition. A failure naming only other packets' documents is
      pre-existing: record it verbatim and carry on. Never add `|| true` or anything else that
      turns one of these failures into exit zero.

- [ ] Do **not** run `NX_DAEMON=false bunx nx run tool-devsync:test`. Report it under "Not
      verified" as **pending planner verification**. Do not edit, skip or work around the index
      checker.

### Step 9 — Whole frontend

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit` → exit 0, `Test Files` two above step 0's
      and `Tests` twenty-four above it.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:test` → exit 0. Compare **both** summaries with step
      0's. The UTC summary is two files and twenty-four tests above it; the Auckland summary is
      identical, because this packet adds no zoned suite. Any other difference is a stop condition.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:build` → exit 0.

### Step 10 — OpenSpec validation

- [ ] Run the batch's standard block, which is the only accepted contract:

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

      Expected: one JSON report printed, block exits 0. If the tool cannot be fetched, report the
      block, not a pass.

### Step 11 — Hand over, do not commit

- [ ] `git status --short` → expect exactly the fifteen paths of section 5 as modified or
      untracked, plus whatever other lanes already had in the tree, untouched. Record the list.
- [ ] Report, under "Ready to commit", those fifteen paths and the subject
      `refactor(wbs-fe): extract the directory into a resource and a feature service`, with a body
      carrying step 0's baselines, step 9's counts, and every proof of section 8 with the exact
      failure line seen.
- [ ] Do not run `git add`, `git commit`, `git checkout -b`, `git stash` or
      `git restore --staged`. They fail here, and the planner commits after reviewing the diff.
- [ ] Put the 040.6 evidence in the **final executor report**. Do **not** write it into
      `openspec/changes/service-taxonomy/verify.md`: that file belongs to 010.3, which creates it,
      and to 020.8, which appends to it in wave 2. The planner appends this packet's evidence
      after integrating 020.8.

### Step 12 — Completion gate, not run here

- [ ] Do **not** run `bin/h2puni-gate.sh`. The host gate cannot run on this machine. Say in the
      report that it was not run; the planner runs the applicable post-commit gate.

### Slice 2 completion checklist — checkpoint B

This packet is done when every line is true. Nothing here is a judgement call.

- [ ] Slice 1's checklist is still true, and its commit is the base of this slice.
- [ ] The twelve new files exist, and the three modified files carry only the changes section 5
      names.
- [ ] `test:unit` is `+2` files and `+24` tests against step 0.
- [ ] The directory page's own suite matches step 0's counts exactly, with no assertion edited.
- [ ] `test`'s Auckland summary is identical to step 0's.
- [ ] `typecheck`, `lint`, `build` and `format:check` all exit 0.
- [ ] All **ten** negative proofs of section 8 were observed failing, restored, and rerun green,
      and each `Proof:` comment written describes what was actually seen.
- [ ] `$TMPDIR/evidence` holds ten `proof-N.patch` files and ten `proof-N.failing.txt` files, and
      every `cmp` after a restore exited 0.
- [ ] No command in the run was given `|| true` or any other failure mask.
- [ ] The four named devsync checks were run; the whole target is reported as pending planner
      verification.
- [ ] The host gate is reported as not run.
- [ ] The fifteen paths and the commit subject are in the report; nothing was staged or committed.

## 8. Negative proofs

Ten. Each is watched failing before its adjacent `Proof:` comment is written. An unwatched proof
comment is a false claim in the repository, and R5 forbids it.

**Restore discipline, for every entry.** Everything lives under `$TMPDIR`, which the launcher
sets uniquely per attempt; no fixed path under the system temporary directory is used. For a
proof numbered `N` over file `F`:

```sh
mkdir -p "$TMPDIR/evidence"
cp "$F" "$TMPDIR/proof-N.passing"
#  ... inject the fault into $F ...
diff -u "$TMPDIR/proof-N.passing" "$F" > "$TMPDIR/evidence/proof-N.patch"
#  ... run the named command, capturing everything ...
<the command> 2>&1 | tee "$TMPDIR/evidence/proof-N.failing.txt"
cp "$TMPDIR/proof-N.passing" "$F"
cmp "$F" "$TMPDIR/proof-N.passing"          # exits 0, and that is the restore proof
<the command>                                # green again
```

The mutation is a **patch file** and the failure is a **captured output file**, both under
`$TMPDIR/evidence`, so a proof is a file the planner copies out rather than a sentence in a
report. **Never restore from Git** — `git checkout` and `git restore` cannot run here, and would
discard the passing uncommitted work. **Never write `|| true`, `; echo exit=$?` or anything else
that turns a required failure into exit zero.**

The two commands used below are:

```sh
RESOURCE='(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/modules/directory/directory.resource.test.ts)'
FEATURE='(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/modules/directory-management)'
```

| #   | File and place                                        | Fault to inject                                                                          | Test that must fail                                                                 |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | `directory.resource.ts`, `read`                       | Delete `if (generation !== latestRead) return;`                                          | `only the newest read may install`                                                  |
| 2   | `directory.resource.ts`, `show`                       | Delete the `FIELDS.every(...)` early return                                              | `a refusal that says nothing new replaces no snapshot and wakes nobody`             |
| 3   | `directory.resource.ts`, `runWrite`                   | Remove the `catch` around `change()`                                                     | `a write that throws becomes a refusal, and still refetches`                        |
| 4   | `directory.resource.ts`, `runWrite`                   | Remove the `finally` that lowers busy                                                    | `a refetch that throws becomes a refusal, and busy still falls`                     |
| 5   | `directory.resource.ts`, `replaceClient`              | Make it a no-op                                                                          | `a replaced client keeps everything the directory already held`                     |
| 6   | `directory-management.feature.ts`, `renameEntry`      | Remove the `clean === ''` guard                                                          | `a name of whitespace alone is never sent, and says so`                             |
| 7   | `directory-management.feature.ts`, `add`              | Remove the `clean === ''` guard                                                          | `an empty add is refused without a request and keeps its box`                       |
| 8   | `directory-management.feature.ts`, `renameEntry`      | Move `whenSent()` to after `sayTaken(written)` **and** after an `await directory.read()` | `a rename is trimmed, sent, and its caller told before the refetch`, on `atRefetch` |
| 9   | `directory-management.feature.ts`, `askToRemove`      | Pin the cascade argument to `true`                                                       | `a removal is always asked without a cascade first`                                 |
| 10  | `directory-management.feature.ts`, `addTeamForPerson` | Replace the two lines with the runtime-valid reversal below                              | `making a team for somebody creates before it patches`                              |

Proof 10's mutation, written out because reordering the two statements literally would use `team`
before its initialisation, and a temporal-dead-zone crash is not evidence about gesture ordering:

```ts
sayTaken(await directory.setPersonTeams(person.id, [...person.teamIds]));
await directory.createTeam(name);
```

**Two of these were watched failing by the planner on 2026-09-19**, in a scratch copy of the tree,
because the second review said they could not fail. Their observed lines are recorded here so the
executor knows what to expect; the executor still runs all ten itself.

- Proof 2: `FAIL src/modules/directory/directory.resource.test.ts > a refusal that says nothing
new replaces no snapshot and wakes nobody`, `AssertionError: expected { people: [], teams: [],
…(5) } to be { people: [], teams: [], …(5) } // Object.is equality`, `Tests 1 failed | 10
passed (11)`.
- Proof 10: `FAIL src/modules/directory-management/directory-management.feature.test.ts > making a
team for somebody creates before it patches`, `AssertionError: expected [ 'patchPerson:p1' ] to
deeply equal []`, `Tests 1 failed | 12 passed (13)`.

**The three historical proof comments are not rewritten.** They move verbatim, as section 3
quotes them, beside the checks they describe: the newest-read one on the generation comparison,
the whitespace one on `renameEntry`'s guard, the cascade one on `askToRemove`'s `false`. The
executor **appends** a separate dated observation under each, and writes a new dated observation
for the seven checks that have none, only after watching that fault. If a historical comment would
have to be reworded to fit, stop and report (stop condition 2).

## 9. OpenSpec

**No new OpenSpec change is opened by this packet, and it claims no blanket exemption.**

1. **The extraction itself** changes no observable behaviour, so R4's mechanical-refactor
   exemption covers it. The proof is the unedited oracle.
2. **The architecture** — the four kinds, the direction rules, F1, F2 and the module layout — is
   decided in the [code organization design](../../specs/2026-09-19-code-organization-design.md)
   and owned by the architectural `service-taxonomy` change, which **does not exist today** and
   which packet 010.3 creates. **010.3 integrated is a prerequisite of this packet** alongside
   040.3: check for `openspec/changes/service-taxonomy/proposal.md` in step 0, and if it is absent,
   report that in the final report and carry on — the code is unaffected, but the evidence has
   nowhere to be filed yet.
3. **Evidence goes in the executor's report, not in another lane's file.**
   `openspec/changes/service-taxonomy/verify.md` is created by 010.3 and appended to by 020.8; it
   is not in this packet's file plan and the executor must not write to it. The planner appends
   this packet's evidence after integrating 020.8.
4. **No accepted capability constrains the directory.** `directory-page` and `directory-crud` are
   unarchived changes under `openspec/changes`, not specs. (`wbs-table-modules`, the one accepted
   capability that mentions remembered state, is the preferences packet's concern, not this one's.)

If the extraction turns out to need a behaviour change — if a test can only be made green by
changing what a person sees — stop and report. That is a new change with its own intent.

## 10. Verification

### What the executor runs

| Command                                                                                          | Expected                                                                                       |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit`                                                | Exit 0. `Test Files` +2 and `Tests` +24 against step 0.                                        |
| `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/components/directory/directory-page.test.tsx)` | Exit 0, **exactly** step 0's counts, assertions unedited.                                      |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                                | Exit 0, no diagnostic.                                                                         |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                                                     | Exit 0, no warning.                                                                            |
| `NX_DAEMON=false bunx nx run wbs-fe-01:test`                                                     | Exit 0. UTC summary +2 files and +24 tests; Auckland summary identical to step 0's.            |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                    | Exit 0.                                                                                        |
| The four named devsync checks in step 8                                                          | Each `1 pass`, `0 fail`, or a failure naming only other packets' documents, recorded verbatim. |
| `NX_DAEMON=false bunx nx format:check --all`                                                     | Exit 0, or failures naming only files outside section 5, reported and left alone.              |
| The OpenSpec block in step 10                                                                    | One JSON report printed and the block exits 0.                                                 |
| The ten proofs of section 8                                                                      | Each named test observed failing, restored, rerun green.                                       |

### What the planner runs afterwards, and the executor reports as pending

| Command                                                          | Why the executor cannot run it                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `git add` of the fifteen paths, then the commit                  | The clone's Git directory is read-only here.                                            |
| `NX_DAEMON=false bunx nx run tool-devsync:test`                  | Its index checker runs `git write-tree` and `git add --update` against this clone.      |
| `bin/h2puni-gate.sh <sha>`                                       | The host gate cannot run on this machine.                                               |
| Appending this packet's evidence to `service-taxonomy/verify.md` | That file belongs to 010.3 and then 020.8; the planner appends after integrating 020.8. |

**What none of it proves.** Nothing runs the browser level: `e2e` is not run here and no behaviour
change requires it. Nothing proves rules F1, K2, K3 or K4 mechanically — the kind-suffix lint is
rollout Task 3, which is in no packet of this batch, and the batch assumptions record that these
modules obey them by construction and review only. Nothing proves the module's isolated type
check, which the assumptions defer to the DI Bag task. And the extraction is verified as a whole
only once the planner's four rows above have run.

## 11. Stop conditions

Stop and report rather than improvising when any of these happens. Stopping with an honest report
is a successful outcome.

1. Any assertion in an existing test has to change to make a suite pass. The one deliberate
   assertion change in this packet is the README count pin, whose whole purpose is to move.
2. A `Proof:` comment would have to be reworded, or has no home in the new file, or its test no
   longer exists.
3. A negative injection in section 8 does not produce the named failure, or produces it in a test
   other than the named one. There is no exemption: all ten are run.
4. The directory page's own suite reports counts different from step 0's, in either direction.
5. The pin does not read `20` at step 0, or the count after adding two READMEs is not `22`.
6. `NX_DAEMON=false bunx nx run wbs-fe-01:test` fails in a file this packet did not touch, or its
   Auckland summary moves.
7. `app-router.tsx`, `DirectoryApi` or `httpDirectoryApi` appears to need an edit. None of them
   does: the page's props are unchanged.
8. A new suite fails in the node tier with a browser reference error. Do not move it to the DOM
   tier and do not edit `src/test-tiers.test.ts`: both are outside the file plan. Stop.
9. The document checks ask for anything other than a plain README — module-index metadata, a
   registry entry, a trusted-policy entry. None of those is authorised here.
10. Anything requires editing a file in section 12.
11. Any step seems to need `git add`, `git commit`, staging, the whole devsync target, or the host
    gate. None can run here; steps 8, 11 and 12 say what to do instead.
12. A required tool is missing. Do not install anything into the repository; install only under
    `$TMPDIR` if the packet's own commands need it, and otherwise stop and report.
13. A run of a named test reports **0 tests matched**. Bun exits zero on an empty selection, so
    this is a silent pass on nothing, not a success.
14. `$TMPDIR` is unset or empty, or anything would have to be written outside the clone and
    `$TMPDIR`.
15. Any command tries to reach the network. Nothing here needs it; the OpenSpec command is warmed
    into this attempt's temporary root before dispatch.
16. Slice 1's checkpoint has not been reviewed and committed, and step 6 is next. The executor
    stops at a checkpoint and waits; it never starts the following slice on its own.

## 12. Out of lane

Two files are **shared in sequence** rather than out of lane: `apps/wbs/fe-01/vitest.node-suites.ts`
and the README count pin belong to 040.3 first, this packet second, and
[040.6b](040-6b-preferences.md) third. This packet adds only its own two suite lines and moves the
pin only from 20 to 22.

| Path                                                                                                                                    | Owner                                    |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `apps/wbs/fe-01/src/lib/remembered.ts`, `apps/wbs/fe-01/src/lib/theme.ts`                                                               | [040.6b](040-6b-preferences.md)          |
| `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`                                                                                     | [040.6b](040-6b-preferences.md)          |
| `apps/wbs/fe-01/src/components/wbs/project-page.tsx` and its suite                                                                      | [040.6b](040-6b-preferences.md)          |
| `apps/wbs/fe-01/src/components/wbs/remembered-layout.ts`                                                                                | [040.6b](040-6b-preferences.md)          |
| `apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx`                                                                          | [040.6b](040-6b-preferences.md)          |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, `apps/wbs/fe-01/src/lib/local-write.ts`, `apps/wbs/fe-01/src/lib/plan-refresh.ts` | packet 040.3                             |
| `apps/wbs/fe-01/src/components/wbs/use-reference-sets.ts`                                                                               | a later task; read it, do not edit it    |
| `eslint.config.js`, `apps/wbs/eslint.product.mjs`                                                                                       | Task 3 of the rollout                    |
| `openspec/changes/service-taxonomy/` and its `verify.md`                                                                                | 010.3, then 020.8                        |
| `docs/wiki-policy/modules.json` and the wiki pilot path list                                                                            | Task 9 of the rollout                    |
| `apps/wbs/fe-01/src/components/wbs/plan-refusal.ts`                                                                                     | moves with the Notices module; import it |

Not touched: `apps/wbs/fe-01/index.html`; `httpDirectoryApi` and `httpProjectApi`, including the
spread at line 2419.

## 13. How to run this packet: two slices, two checkpoints

The execution contract dispatches one executor at a time in bounded slices, and a packet is
dispatched only as the slice the planner has reviewed. This packet is cut where the second
review's own recommendation cut it — resource and store first, feature and view integration
second — because a wrong contract makes everything after it wasted work, and because the page
rewrite is the only part that can break the oracle.

| Slice | Steps   | Ends at      | What the planner reads before dispatching the next                                                                                                                 |
| ----- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | 0 to 5  | Checkpoint A | Both contracts, both READMEs, both unit suites, both services, the pin move, and the recorded red-then-green. No delivery code exists yet, so nothing can regress. |
| 2     | 6 to 12 | Checkpoint B | The page rewrite against step 0's oracle counts, ten observed failure lines with their evidence files, and the pending list.                                       |

At each checkpoint the executor **stops and reports**: it never commits, never stages and never
starts the next slice on its own. The planner reviews the diff against the frozen baseline, stages
the exact paths, replays a sample of the proofs from `$TMPDIR/evidence`, runs the planner-only
checks of section 10, commits with hooks enabled and records the hashes in the ledger.

**Integration is a separate planner handoff**, not part of either slice: staging, the whole
`tool-devsync:test` target, the commit, the merge and the host gate.
[040.6b](040-6b-preferences.md) is dispatched only after slice 2 has been merged.

## Findings for the main planner

Recorded, not repaired.

1. **Replacing the injected client mid-life is preserved, not endorsed.** The page has always kept
   its vocabularies while a replacement's first read was in flight, so `replaceClient` reproduces
   it. Nothing in production ever does it — `app-router.tsx` memoizes the client per app mount and
   the suite passes a constant fake — so this is a behaviour that exists only for tests. The three
   lifetimes task should decide whether it stays at all.
2. **A second refusal against a confirmed cascade is thrown as a bare `Error('in_use')`** and
   reaches the person as a generic request failure, telling them less than the server said.
   Preserved exactly; a candidate for a modelled outcome when the Notices module is planned.
3. **`DirectoryPage` still takes a client as a prop.** It is the injection seam the whole suite
   runs through, so it survives unchanged. The lifetimes task must plan its replacement together
   with the suite's migration.
4. **Rules F1, K2, K3 and K4 are mechanically unenforced when this runs**, per the batch
   assumptions: rollout Task 3 is in no packet of this batch.
5. **`this: void` is not usable in this repository's contracts.** `no-invalid-void-type` is on and
   rejects it, so every service contract uses readonly function-typed properties instead. Worth
   stating once in the rollout rather than rediscovering it per module.

## Review disposition

### First review, 2026-09-19 (Codex gpt-6-astra, high effort)

Nine critical, five important, four minor. The second review confirmed eleven of them fixed and
seven partly fixed. Nothing was rejected; the detail is in the second round below, which supersedes
it.

### Second review, 2026-09-19 (Codex gpt-6-astra, high effort)

Four new critical, five new important, seven carried-forward partials, and a recommendation to
split. Every finding was re-verified against the repository before acting. **Nothing was rejected.**

| Finding                                                 | Verified                                                                                                                          | Action                                                                                                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New critical 1 — replacing the API resets state         | Yes. The page's vocabularies are `useState` and its counter a `useRef`; a `useMemo`-keyed service would empty them.               | **Fixed.** `replaceClient` on both contracts; the hook builds the service once per mount with a lazy `useState` and re-reads from an effect. New case `a replaced client keeps everything the directory already held`, and proof 5.   |
| New critical 2 — proof 2 cannot fail                    | Yes. The old case never drove a genuine no-op through `show`.                                                                     | **Fixed.** New case `a refusal that says nothing new replaces no snapshot and wakes nobody` refuses the **same object** twice and asserts snapshot identity and one notification. Watched failing; the observed line is in section 8. |
| New critical 3 — lint failures                          | Yes, and worse than reported: `this: void`, the review's suggested fix, is itself rejected by `no-invalid-void-type` (16 errors). | **Fixed.** Every contract member is a readonly function-typed property. The empty-add test is no longer `async`. All nine section 6 files and both suites measured at 0 errors, 0 warnings.                                           |
| New critical 4 — editing another lane's verify file     | Yes. That path is in 020.8's file plan, not this one's.                                                                           | **Fixed.** Step 11 forbids it, section 9 point 3 names the owner and the handoff, and section 12 lists the path.                                                                                                                      |
| New important 1 — impossible expected output            | Yes. The bare grep prints three lines, at 334, 390 and 557.                                                                       | **Fixed.** Step 0 uses the anchored `rg` pattern with the `grep -nE` equivalent, expecting exactly one line reading 20.                                                                                                               |
| New important 2 — unresolved and duplicate bindings     | Yes. `commitKind` at 769, `setMemberships` at 531 and 833, `setOwnedServices` at 972 and 1004.                                    | **Fixed.** Step 6 keeps all three page functions under their own names as one-line delegations, and lists every call site.                                                                                                            |
| New important 3 — proof comments rewritten              | Yes. The previous draft reworded them and attached the rename proof to the `add` helper.                                          | **Fixed.** Section 3 quotes all three verbatim; section 6 says exactly where each goes and that `add` gets no historical comment; section 8 forbids rewording and requires a separate dated observation.                              |
| New important 4 — incomplete standalone paths           | Yes.                                                                                                                              | **Fixed by the split.** This packet has its own prerequisites, baselines, proof set, verification table, completion checklist and handoff; the pin is 20 to 22 here and 22 to 23 there.                                               |
| New important 5 — proof 10 is not a usable recipe       | Yes. The literal reordering is a temporal-dead-zone error, and the old test had no chronological assertion.                       | **Fixed.** The fake keeps an ordered `log`; the case holds creates and asserts nothing patches while one is pending; proof 10 supplies a runtime-valid reversal. Watched failing; observed line in section 8.                         |
| Carried critical 6 — delivery imports the resource      | Yes, for the preferences half.                                                                                                    | **Fixed for the directory here** (the page imports only the feature), and answered for preferences by a feature facade in [040.6b](040-6b-preferences.md).                                                                            |
| Carried critical 9 — executor-authored READMEs          | Yes.                                                                                                                              | **Fixed.** Step 2 supplies both README bodies verbatim.                                                                                                                                                                               |
| Carried important 3 — 010.3 permitted to be absent      | Yes.                                                                                                                              | **Fixed.** Section 9 makes integrated 010.3 an explicit prerequisite and moves the evidence to the report.                                                                                                                            |
| Carried important 4 — module typecheck still owed       | Yes.                                                                                                                              | **Recorded.** [ASSUMPTIONS.md](ASSUMPTIONS.md) carries the deferral and its reason; finding 4 keeps it visible for the rollout's own decision.                                                                                        |
| Executability: Nx daemon, commits, gate, restore, tools | Yes, all five.                                                                                                                    | **Fixed.** Every Nx command carries `NX_DAEMON=false`; step 11 hands over instead of committing; step 12 forbids the gate; section 8 restores by copy and `cmp`; stop condition 12 limits installs to the clone or `/tmp`.            |
| Recommendation — split into two packets                 | Agreed by the main planner.                                                                                                       | **Done.** This file is the directory; [040.6b](040-6b-preferences.md) is preferences and runs after this one is integrated.                                                                                                           |

### Third round, 2026-09-20: the batch execution contract

The batch README gained an "Execution contract" and new standard blocks after this packet's second
revision, and a high-effort grill of the execution plan named this packet three times. Each point
was checked against the README and the repository.

| Point                                                                                       | Verified                                                                                                                                                                                             | Action                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Grill: "040.6 tells an executor running out of session space to finish and commit its part" | Yes, in the pre-split draft.                                                                                                                                                                         | **Fixed.** Step 11 hands over a file list and a commit subject; no stop condition mentions committing; section 13 gives the planner the commit.        |
| Grill Q4: the `service-taxonomy` verification record has two writers                        | Yes. 020.8 lists that path in its own file plan.                                                                                                                                                     | **Fixed.** Step 11 and section 9 send the evidence to the executor's report; section 12 lists the path as 010.3's, then 020.8's.                       |
| Grill: "a README count of 20 in 040.6 is not proof of which implementation landed"          | Yes. The pin is a count any lane could move.                                                                                                                                                         | **Fixed.** Step 0 now checks the prerequisite by 040.3's own artifact, `plan-writer.feature.ts`, and reads the pin as a second, weaker signal.         |
| Grill table: cut into independently verified slices with planner handoffs                   | Yes.                                                                                                                                                                                                 | **Fixed.** Section 7 is two bounded slices with their own completion checklists; section 13 is the two checkpoints and what the planner reads at each. |
| Contract: every scratch file, backup and fixture under `$TMPDIR`, evidence as patches       | Yes.                                                                                                                                                                                                 | **Fixed.** Step 0 records `$TMPDIR` and creates `$TMPDIR/evidence`; section 8 gives the exact save, patch, capture, restore and `cmp` commands.        |
| Contract: never mask a failure                                                              | Yes.                                                                                                                                                                                                 | **Fixed.** Stated in section 8 and in step 8's devsync block; the slice 2 checklist asserts no mask was used.                                          |
| Contract: Bun's `-t` matches describe and title joined, and zero matches reports success    | Yes. Verified that all four named devsync tests are **top-level** `test(...)` calls at lines 409, 420, 442 and 538, with no enclosing `describe`, so an anchored bare title is the full joined name. | **Fixed.** Steps 3 and 8 state the verified structure, require exactly one passing test per run, and make a zero-match run stop condition 13.          |
| Contract: `OPENSPEC_TELEMETRY=0` on every OpenSpec invocation                               | Yes.                                                                                                                                                                                                 | **Fixed** in step 10's block.                                                                                                                          |
| Contract: network off unless the packet names hosts                                         | Yes.                                                                                                                                                                                                 | **Fixed.** Section 7's preamble states nothing here needs the network and makes an attempt stop condition 15.                                          |
| Contract: counts are relative to the packet's own start                                     | Already true.                                                                                                                                                                                        | Unchanged; every expectation in sections 7 and 10 is "+n against step 0".                                                                              |

Nothing in this round was rejected.
