# 040.6b Extract preferences — part 2 of 2

| Field                                        | Value                                                                                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item                                    | 040.6 "Extract directory and preferences", part 2 of 2: preferences                                                                                      |
| Part 1                                       | [040.6, the directory](040-6-directory-and-preferences.md). This packet runs after it is integrated.                                                     |
| Size class                                   | M                                                                                                                                                        |
| Wave                                         | 2. Runs after 040.3 and after part 1.                                                                                                                    |
| Planning tokens, top model, high effort      | 3,000,000                                                                                                                                                |
| Implementation tokens, mid model, mid effort | 4,000,000                                                                                                                                                |
| Review tokens, top model, high effort        | 2,000,000                                                                                                                                                |
| Design implemented                           | [code organization design](../../specs/2026-09-19-code-organization-design.md), Task 6 of the [rollout plan](../2026-09-19-code-organization-rollout.md) |

## 1. Goal and non-goals

**Goal.** Put every browser storage key behind one storage repository, one preferences
resource-service and one named-answers feature-service, so that no component or hook reaches
browser storage directly and every key name lives in one registry.

**Non-goals.** No behaviour change of any kind. **No stored key name and no stored byte format
changes: readers have this data in their browsers now.** No DI Bag, no `module.ts`, no
`check.ts`, no module-local `tsconfig.json`, no edit to any ESLint policy file, and no directory
work — that is [part 1](040-6-directory-and-preferences.md). Where the current behaviour looks
like a defect it is **preserved and listed as a finding**, never repaired inside an extraction.

## 2. Read first

| File                                                                               | Why                                                                                           |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                                        | Rules R1 to R5. R5 governs every `Proof:` comment this packet moves.                          |
| `LLM_README.md`                                                                    | R1 requires it before the task's own link.                                                    |
| [batch README](README.md)                                                          | The wave table, the ownership table, the hidden frontend constraints, the standard blocks.    |
| [batch assumptions](ASSUMPTIONS.md)                                                | The strict-K2 split and the deferred module type check both took effect here.                 |
| [part 1](040-6-directory-and-preferences.md)                                       | It creates `apps/wbs/fe-01/src/modules/store.ts` and moves the pin to 22. Read its section 3. |
| `apps/wbs/fe-01/src/lib/remembered.ts`                                             | The source. 173 lines, no test file of its own.                                               |
| `apps/wbs/fe-01/src/lib/theme.ts`                                                  | One key, and the `readAndDrop` distinction the whole storage design turns on.                 |
| `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`                                | A direct storage call with a watched proof comment over it.                                   |
| `apps/wbs/fe-01/src/components/wbs/project-page.tsx`                               | The one hand-written store, and its cleanup rule. Read lines 80 to 115 and 566 to 585.        |
| `apps/wbs/fe-01/src/components/wbs/project-page.test.tsx`                          | The oracle for the project key. It asserts raw stored bytes in eleven places.                 |
| `apps/wbs/fe-01/src/components/wbs/remembered-layout.ts`                           | Eight key builders and one key constant, all called inside the same file.                     |
| `apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx`                     | The one bare-text key, and its caller at line 79.                                             |
| `apps/wbs/fe-01/src/index-bootstrap.test.ts`                                       | Imports `THEME_KEY` from the theme module at its line 8; it pins the pre-paint script.        |
| `apps/wbs/fe-01/src/test-tiers.test.ts` and `apps/wbs/fe-01/vitest.node-suites.ts` | How a test joins the fast tier, and the word list that keeps it out.                          |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                          | The pinned README count this packet moves, 22 to 23.                                          |
| `apps/wbs/fe-01/project.json`                                                      | The real target names.                                                                        |

## 3. Verified facts

Checked in the working tree on 2026-09-19 at `1eeacb0b`.

### Where browser storage is reached today

Searching the frontend source and `apps/wbs/fe-01/index.html`, excluding test files, there are
direct callers in exactly four places:

| File                                                 | Lines                                  | What it does                                          |
| ---------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `apps/wbs/fe-01/src/lib/remembered.ts`               | 107, 121, 125, 128, 150, 163, 167, 170 | The shared store: three storage calls in each factory |
| `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`  | 88                                     | Removes the retired arrows key                        |
| `apps/wbs/fe-01/src/components/wbs/project-page.tsx` | 111, 112, 575                          | The hand-written project store: remove, set, get      |
| `apps/wbs/fe-01/index.html`                          | 36                                     | The pre-paint theme read, in an inline script         |

Two corrections to the work item's original brief, both verified:

- `apps/wbs/fe-01/src/components/wbs/use-plan-filter.ts` line 136 is a **prose comment only**. It
  makes no storage call and needs no edit.
- **`sessionStorage` is used nowhere** in the frontend, source or tests.

`apps/wbs/fe-01/index.html` line 36 is a pre-paint inline script that cannot import a module; it
is out of scope and stays. `apps/wbs/fe-01/src/index-bootstrap.test.ts` pins it against the theme
module and imports `THEME_KEY` from there at its **line 8**; it must keep passing unedited.

### Every browser storage key, with its current owner and stored format

**Fourteen keys.** Every name and every format below is a compatibility fact.

| Key                                      | Owner file today                                                                     | Format                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| `wbs.theme`                              | `apps/wbs/fe-01/src/lib/theme.ts`, `THEME_KEY` line 38                               | JSON string: `system`, `light` or `dark` |
| `wbs.ganttDetail`                        | `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`, `DETAIL_KEY` line 38            | JSON boolean                             |
| `wbs.ganttArrows`                        | `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`, `RETIRED_ARROWS_KEY` line 58    | retired; removed, never read             |
| `wbs.project`                            | `apps/wbs/fe-01/src/components/wbs/project-page.tsx`, `PROJECT_KEY` line 87          | **bare text**, a project id, not JSON    |
| `wbs.expanded.<projectId>`               | `apps/wbs/fe-01/src/components/wbs/remembered-layout.ts`, `expansionKey` line 24     | JSON                                     |
| `wbs.columnWidths.<projectId>`           | same file, `widthOverridesKey` line 81                                               | JSON object                              |
| `wbs.ganttHeight.<projectId>`            | same file, `ganttHeightKey` line 98                                                  | JSON number                              |
| `wbs.ganttDayPx.<projectId>`             | same file, `ganttDayPxKey` line 165                                                  | JSON number                              |
| `wbs.ganttLabels.<projectId>`            | same file, `ganttLabelsKey` line 216                                                 | JSON                                     |
| `wbs.mermaidSectionMode`                 | same file, `MERMAID_SECTION_MODE_KEY` line 274                                       | JSON string                              |
| `wbs.hiddenColumns.<projectId>`          | same file, `hiddenColumnsKey` line 458                                               | JSON array of strings                    |
| `wbs.linksResetShown.<projectId>`        | same file, `linksResetShownKey` line 465                                             | JSON `true`                              |
| `wbs.views.<projectId>`                  | same file, `savedViewsKey` line 568                                                  | JSON array                               |
| `wbs.projectSettingsSection.<projectId>` | `apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx`, `sectionKey` line 49 | **bare text**, through `rememberedText`  |

`remembered-layout.ts` declares **eight key builders and one key constant**, and calls them inside
the same file — at lines 28, 89 and 277 among others — so moving their declarations requires an
**import as well as** a re-export. `sectionKey` is private to the settings modal and is called at
its line 79.

### The project preference refuses nothing, and that is load-bearing

`apps/wbs/fe-01/src/components/wbs/project-page.tsx` lines 566 to 585:

```ts
const remembered = localStorage.getItem(PROJECT_KEY);
if (remembered !== null && found.some((project) => project.id === remembered)) {
  return remembered;
}
if (remembered !== null) rememberProject(null);
```

Any non-null string, `''` included, that the fetched list does not contain is dropped. Validity is
judged against the list this load just fetched, never against a shape. A guard that answered null
for `''` would skip that cleanup and leave the key in storage for ever, which is why the
preferences contract has an `unchecked` shape.

### Three shapes, and two of them cannot change

`remembered.ts` lines 133 to 144 record why the settings section cannot become JSON: it stores a
plain string, and JSON would write it with quotes, so every reader who has ever opened that modal
would lose the tab they were on. `wbs.project` is likewise written as the bare id. The third shape
is the JSON one every other key uses.

### The two verbatim proof comments that stay where they are

Neither moves file. They are evidence; they are not reworded, and a new dated observation is only
appended after the executor watches that fault itself.

`apps/wbs/fe-01/src/components/wbs/gantt-detail.ts` lines 84 to 87, over the retired-key drop:

```ts
// Proof: this line deleted. `drops the key the arrows switch wrote, without
// reading it` alone failed, `1 failed | 90 passed`, on `expected 'true' to be
// null` — the retired key still in storage after the chart had been opened.
// Watched 2026-08-12.
```

`apps/wbs/fe-01/src/lib/theme.ts` lines 62 to 67, over `rememberedTheme`:

```ts
// Proof: `readAndDrop` replaced by `read`, which is what "read the claim,
// drop nothing" comes to. `refuses a stored answer that is not one of the
// three, and drops the key` failed on `expected '"midnight"' to be null` —
// the unreadable key left in storage to be read again next time — and
// `refuses storage that is not JSON at all` with it.
```

`gantt-detail.ts` lines 89 to 100 carry a second proof over the detail guard; it stays untouched
because that guard does not move.

### What the repository's lint does to this code, measured

`eslint.config.js` line 113 enables `tseslint.configs.strictTypeChecked`; line 161 enables
`unused-imports/no-unused-imports` as an error. Measured on 2026-09-19 by linting the section 6
files at their real paths with the repository's own configuration:

- A service exposed as an **interface with method signatures** makes
  `@typescript-eslint/unbound-method` fire wherever a member is passed as a bare function. Every
  contract member in section 6 is therefore a **readonly function-typed property**.
- `this: void` is **not** an available fix: `@typescript-eslint/no-invalid-void-type` is on and
  rejects it.
- `@typescript-eslint/require-await` is an error, so no fake member is `async` without awaiting.

### The fast tier is chosen by scanning a test file's text

`apps/wbs/fe-01/src/test-tiers.test.ts`'s `DOM_EVIDENCE` is, verbatim:

```text
/@testing-library|\bdocument\b|\bwindow\b|\blocation\b|WebSocket|localStorage|matchMedia|getComputedStyle|HTMLElement|\bnavigator\b|jsdom/
```

A fast-tier test must be a `.ts` file, must be listed in `NODE_SUITES`, and its text — comments
included — must contain none of those words. **This constrains this packet especially**: three of
its four suites are about browser storage and must never name the global. The fourth,
`browser-storage.repository.test.ts`, names it on purpose, so the tier rule places it in the jsdom
tier and it is simply **not listed**.

### The new README moves a pinned count

`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` pins
`applicationLibraryToolReadmes` in the test `every legacy source occurrence and relevant text
family is pinned`. Observed on 2026-09-19: `557:      applicationLibraryToolReadmes: 19,`. Packet
040.3 moves it to 20, [part 1](040-6-directory-and-preferences.md) to 22, and **this packet adds
one README and moves it to 23**. The count comes from
`git ls-files --cached --others --exclude-standard`, so the failure appears as soon as the file
exists; staging neither avoids nor fixes it. The house style is the comments already above the pin.

### One devsync test needs Git writes, so verification splits

`the production index checker resolves current Markdown links and anchors` shells out to the wiki
index checker, which runs `git write-tree` and `git add --update` against this clone. The
executor's Git directory is read-only, and omitting the staging makes that test throw on untracked
paths rather than pass. Verification splits exactly as executor preamble rule 4a requires. The
wiki index checker skips a README with no `module-index` envelope, so the one here needs nothing
from it.

### Every snippet in this packet was compiled, linted and run

On 2026-09-19 the planner placed the section 6 files at their real paths in a scratch copy of the
tree, ran the repository's own ESLint over each and `tsc --noEmit -p
apps/wbs/fe-01/tsconfig.app.json` over the app, ran the three fast-tier suites, then removed them.
Observed: **0 errors, 0 warnings** on all ten files, `tsc` exit 0, and `Test Files 3 passed (3)`,
`Tests 15 passed (15)`. What this does **not** prove: the six file rewrites of steps 6 and 7,
which exist only as instructions, and the jsdom-tier adapter suite, which was not written by the
planner.

## 4. Unknowns

1. **How many cases `project-page.test.tsx` holds today.** Step 0 records it; this packet adds
   exactly one, so the count must end `+1`.
2. **Whether the jsdom adapter suite belongs in the zoned run.** It does not — it declares no
   `.zoned.` suffix — but the count is checked against step 0's Auckland summary, which must not
   move.
3. **Whether the one new README trips any check beyond the count.** The index checker skips an
   envelope-less README. **Settle it** in step 8, and apply stop condition 8 if a check asks for
   module-index metadata or a registry entry.
4. **Whether `apps/wbs/fe-01/src/modules/store.ts` exists when this packet starts.** Part 1
   creates it. This packet does **not** use it (see section 6's note) but step 0 checks for it as a
   prerequisite marker.

## 5. File plan

Twelve created, nine modified.

| File                                                                        | Responsibility                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/wbs/fe-01/src/modules/preferences/README.md`                          | Wiki index, and the fourteen keys with their compatibility rule                 |
| `apps/wbs/fe-01/src/modules/preferences/contract.ts`                        | `BrowserStorage`, `Claim`, `Remembered`, `Preferences`, `RememberedPreferences` |
| `apps/wbs/fe-01/src/modules/preferences/preference-keys.ts`                 | Every storage key name and key builder                                          |
| `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts`      | The adapter over the real browser store, reached per call                       |
| `apps/wbs/fe-01/src/modules/preferences/fake-browser-storage.ts`            | The in-memory fake                                                              |
| `apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts`            | Parsing, the guard, the refusal drop, the three store shapes                    |
| `apps/wbs/fe-01/src/modules/preferences/preferences.feature.ts`             | The named answers delivery asks for, each over the one key that holds it        |
| `apps/wbs/fe-01/src/modules/preferences/composition.ts`                     | The two instances over the real adapter                                         |
| `apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts`       | Fast-tier suite for the resource                                                |
| `apps/wbs/fe-01/src/modules/preferences/preferences.feature.test.ts`        | Fast-tier suite for the named answers                                           |
| `apps/wbs/fe-01/src/modules/preferences/composition.test.ts`                | Fast-tier suite: the production instances import with no browser store          |
| `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.test.ts` | jsdom-tier suite for the adapter's own three methods                            |
| `apps/wbs/fe-01/src/lib/remembered.ts`                                      | **Modified.** A thin delegation, so no caller's import changes                  |
| `apps/wbs/fe-01/src/lib/theme.ts`                                           | **Modified.** Its store is a named answer; its key comes from the registry      |
| `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`                         | **Modified.** Its one direct storage call becomes a named answer                |
| `apps/wbs/fe-01/src/components/wbs/project-page.tsx`                        | **Modified.** Its key declaration, its store, and its three storage calls       |
| `apps/wbs/fe-01/src/components/wbs/remembered-layout.ts`                    | **Modified.** Key strings move to the registry; it imports and re-exports       |
| `apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx`              | **Modified.** Its one bare-text key, through the named answer                   |
| `apps/wbs/fe-01/src/components/wbs/project-page.test.tsx`                   | **Modified.** One case **added**; no assertion edited                           |
| `apps/wbs/fe-01/vitest.node-suites.ts`                                      | **Modified.** Three entries, this packet's own                                  |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                   | **Modified.** The README count pin, 22 to 23                                    |

No `module.ts`, `check.ts` or module-local `tsconfig.json`: the first two are DI Bag, rollout Task
8, and the third is the deferral in [ASSUMPTIONS.md](ASSUMPTIONS.md).

## 6. Interfaces

Every file below was linted at its real path with the repository's configuration and reported
**0 errors, 0 warnings**, and the app type-checked with exit 0. Write them exactly as given.

**On the shared store contract.** [Part 1](040-6-directory-and-preferences.md) creates
`apps/wbs/fe-01/src/modules/store.ts`. This module **does not extend it and does not import it**,
because it holds no snapshot: a preferences service answers a question when asked and has nothing
that changes underneath a subscriber. Forcing the import would be an unused dependency and a lie
about the service's shape. This is recorded as a finding for the main planner.

### `apps/wbs/fe-01/src/modules/preferences/contract.ts`

```ts
/**
 * Raw access to this browser's key-value store, and nothing else.
 *
 * A repository: it holds no decisions, does no parsing and refuses nothing.
 * Three members, because three is what the whole app uses.
 *
 * **Access errors propagate.** A store that throws on access — a browser with
 * site data blocked is the real case — throws out of these members and out of
 * {@link Preferences} above them, exactly as the hand-written stores have always
 * done. Nothing here catches it, and nothing may be made to: turning a blocked
 * store into a silent default is a behaviour change with its own intent and its
 * own negative tests. What {@link Preferences} recovers from is a *stored value
 * this app can no longer read*, which is a different thing entirely.
 */
export interface BrowserStorage {
  readonly read: (key: string) => string | null;
  readonly write: (key: string, value: string) => void;
  readonly forget: (key: string) => void;
}

/**
 * What storage holds for one key: a value, nothing at all, or something that is
 * no longer a `T`.
 *
 * Three states and not two, because one caller answers each of them
 * differently: the chart's detail switch opens **on** for a plan with dependency
 * edges when nothing is stored, and **off** when a stored answer was refused — a
 * reader who once turned it off and then hand-edited the value has still said
 * something, and it is not "show me the arrows".
 */
export type Claim<T> = { status: 'held'; value: T } | { status: 'absent' | 'refused' };

export interface Remembered<T> {
  /** The three states, for the callers that answer `absent` and `refused` differently. */
  claim(): Claim<T>;
  /**
   * The stored value, or null when there is none to read — **writing nothing**,
   * which is what a React render is allowed to do.
   */
  read(): T | null;
  /**
   * The same read, **dropping** a key whose contents are no longer a `T`.
   *
   * The drop is the observable half of a refusal: without it the same unreadable
   * value is read again on every load, and a control that silently falls back
   * looks recovered while storage still holds the answer nobody can use.
   */
  readAndDrop(): T | null;
  write(value: T): void;
  /** Removes the key — never a default written over it. */
  forget(): void;
}

/**
 * Everything this browser remembers for its reader, over one store.
 *
 * A **resource**-service: it holds the parsing, the guard, and the one refusal
 * rule the whole app shares — a stored value that is no longer a `T` takes the
 * key with it and the caller's own default stands. Deliberately **not** rule
 * R5's "unknown is not OK" throw: every caller stores a preference, and the
 * alternative is a page nobody can open until they clear storage by hand, over
 * the colour of a stripe. The refusal **is** the recovery.
 *
 * Three shapes, because the keys in a reader's browser are already three shapes
 * and none of them may change.
 */
export interface Preferences {
  /** The store for one JSON-written key, judged by one guard. */
  readonly json: <T>(key: string, isValid: (claimed: unknown) => claimed is T) => Remembered<T>;
  /**
   * The store for one key written as **bare text** rather than as JSON.
   *
   * One caller stores a plain string — the settings modal's open section — and
   * has to keep doing so: JSON would write it with quotes, and every reader who
   * has ever opened that modal would lose the tab they were on.
   */
  readonly text: <T extends string>(
    key: string,
    isValid: (stored: string) => stored is T,
  ) => Remembered<T>;
  /**
   * The store for one bare-text key that **refuses nothing**.
   *
   * For the keys whose validity is not a shape: the remembered project id is
   * judged against the project list this load just fetched, and that rule is
   * different on every load, so there is nothing to hand a guard built once. The
   * retired chart key is the other, and it is only ever dropped. Every stored
   * string is held, the empty one included — which is what keeps the project
   * page's own cleanup reachable.
   */
  readonly unchecked: (key: string) => Remembered<string>;
}

/**
 * The named answers this browser holds, which is what delivery is given.
 *
 * A **feature**-service, and the only preferences surface a component or a hook
 * may import: rule K2 says delivery sees a feature-service and never the
 * resource beneath it. Each member is one answer over the one key that holds it,
 * so a screen never names a key and never chooses a shape.
 *
 * The guards stay with their callers rather than moving here, because each is
 * the caller's own domain rule — which three words a theme may be, which five
 * sections a settings modal has — and a registry of other modules' unions is a
 * second place for them to go stale.
 */
export interface RememberedPreferences {
  readonly themeChoice: <T extends string>(
    isValid: (claimed: unknown) => claimed is T,
  ) => Remembered<T>;
  readonly ganttDetail: Remembered<boolean>;
  /** Reached only to be dropped: its value is never looked at. */
  readonly retiredGanttArrows: Remembered<string>;
  /** Holds every string, including the empty one. Judged against the fetched list. */
  readonly lastOpenedProject: Remembered<string>;
  readonly projectSettingsSection: <T extends string>(
    projectId: string,
    isValid: (stored: string) => stored is T,
  ) => Remembered<T>;
}
```

### `apps/wbs/fe-01/src/modules/preferences/preference-keys.ts`

```ts
/**
 * Every key this app writes into browser storage, in one place.
 *
 * The names and the formats beside them are a **compatibility fact**: readers
 * have these keys in their browsers now. Renaming one, or writing a JSON string
 * where bare text stands, silently loses whatever that reader had said. Two of
 * these are bare text on purpose — see {@link PROJECT_KEY} and
 * {@link projectSettingsSectionKey}.
 */
export const THEME_KEY = 'wbs.theme';
export const GANTT_DETAIL_KEY = 'wbs.ganttDetail';
/** Written for one day and never read since; dropped rather than migrated. */
export const RETIRED_GANTT_ARROWS_KEY = 'wbs.ganttArrows';
/** **Bare text**: the project id itself, not a JSON string. Refuses nothing. */
export const PROJECT_KEY = 'wbs.project';
export const MERMAID_SECTION_MODE_KEY = 'wbs.mermaidSectionMode';

export const expansionKey = (projectId: string): string => `wbs.expanded.${projectId}`;
export const widthOverridesKey = (projectId: string): string => `wbs.columnWidths.${projectId}`;
export const ganttHeightKey = (projectId: string): string => `wbs.ganttHeight.${projectId}`;
export const ganttDayPxKey = (projectId: string): string => `wbs.ganttDayPx.${projectId}`;
export const ganttLabelsKey = (projectId: string): string => `wbs.ganttLabels.${projectId}`;
export const hiddenColumnsKey = (projectId: string): string => `wbs.hiddenColumns.${projectId}`;
export const linksResetShownKey = (projectId: string): string => `wbs.linksResetShown.${projectId}`;
export const savedViewsKey = (projectId: string): string => `wbs.views.${projectId}`;
/** **Bare text**: one section name, written without quotes. */
export const projectSettingsSectionKey = (projectId: string): string =>
  `wbs.projectSettingsSection.${projectId}`;
```

### `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts`

```ts
import type { BrowserStorage } from './contract';

/**
 * The adapter over this browser's own store.
 *
 * The store is reached **per call** and never captured when this module loads.
 * Two reasons, both load-bearing: the fast test tier has no browser store at all
 * and must be able to import anything above this without it throwing on load,
 * and the shared jsdom setup installs its stand-in after the module graph is
 * built.
 *
 * @throws whatever the browser throws on access. A store that refuses — site
 * data blocked, a private session — is not recovered from here; see
 * {@link BrowserStorage}.
 */
export function browserStorage(): BrowserStorage {
  return {
    read: (key) => localStorage.getItem(key),
    write: (key, value) => {
      localStorage.setItem(key, value);
    },
    forget: (key) => {
      localStorage.removeItem(key);
    },
  };
}
```

### `apps/wbs/fe-01/src/modules/preferences/fake-browser-storage.ts`

```ts
import type { BrowserStorage } from './contract';

/** What the fake answers beside the port's own members. */
export interface HeldByFake {
  /** Everything the fake holds, for asserting on the bytes rather than the reading. */
  readonly held: () => Record<string, string>;
}

/** An in-memory store, for tests and for the injected-fault proofs. */
export function fakeBrowserStorage(seed: Record<string, string> = {}): BrowserStorage & HeldByFake {
  const held = new Map<string, string>(Object.entries(seed));
  return {
    read: (key) => held.get(key) ?? null,
    write: (key, value) => {
      held.set(key, value);
    },
    forget: (key) => {
      held.delete(key);
    },
    held: () => Object.fromEntries(held),
  };
}
```

### `apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts`

```ts
import type { BrowserStorage, Claim, Preferences, Remembered } from './contract';

/** Stored bytes parsed as they were written, or `undefined` when they will not parse. */
function parsedOrNothing(stored: string): unknown {
  try {
    const claimed: unknown = JSON.parse(stored);
    return claimed;
  } catch {
    // Nothing but this app writes these keys, so the only way here is a
    // hand-edited store. Recovered from by the caller rather than rethrown.
    return undefined;
  }
}

/**
 * Everything this browser remembers, over one store.
 *
 * `isValid` carries the whole rule, including ranges: a height outside its
 * bounds is not a height, and refusing it here is what keeps a hand-edited
 * `1e999` off the screen. Per-entry sanitising is **not** here and is the
 * caller's: the width store drops entries for columns this reader no longer
 * has, and it must not write the sanitised set back — a step that is only
 * temporarily absent would lose its width for good.
 */
export function createPreferences(storage: BrowserStorage): Preferences {
  /** The three reads every shape shares, given one way of judging what is there. */
  const storeOver = <T>(
    key: string,
    claim: () => Claim<T>,
    write: (value: T) => void,
  ): Remembered<T> => ({
    claim,
    read: () => {
      const claimed = claim();
      return claimed.status === 'held' ? claimed.value : null;
    },
    readAndDrop: () => {
      const claimed = claim();
      if (claimed.status === 'held') return claimed.value;
      if (claimed.status === 'refused') storage.forget(key);
      return null;
    },
    write,
    forget: () => {
      storage.forget(key);
    },
  });

  const writeText = (key: string) => (value: string) => {
    storage.write(key, value);
  };

  return {
    json: <T>(key: string, isValid: (claimed: unknown) => claimed is T): Remembered<T> =>
      storeOver<T>(
        key,
        // A tagged shape rather than a sentinel, because `refused` has to be
        // told apart from a stored value that legitimately *is* the string
        // `'refused'`: several of these stores hold a union of short strings.
        () => {
          const stored = storage.read(key);
          if (stored === null) return { status: 'absent' };
          const claimed = parsedOrNothing(stored);
          return isValid(claimed) ? { status: 'held', value: claimed } : { status: 'refused' };
        },
        (value) => {
          storage.write(key, JSON.stringify(value));
        },
      ),
    text: <T extends string>(
      key: string,
      isValid: (stored: string) => stored is T,
    ): Remembered<T> =>
      storeOver<T>(
        key,
        // No parse to fail here, so absent and refused are the only two ways not
        // to hold a value.
        () => {
          const stored = storage.read(key);
          if (stored === null) return { status: 'absent' };
          return isValid(stored) ? { status: 'held', value: stored } : { status: 'refused' };
        },
        writeText(key),
      ),
    unchecked: (key: string): Remembered<string> =>
      storeOver<string>(
        key,
        // Never refused, so `readAndDrop` and `read` answer the same thing and
        // the caller's own rule is the only judge there is.
        () => {
          const stored = storage.read(key);
          return stored === null ? { status: 'absent' } : { status: 'held', value: stored };
        },
        writeText(key),
      ),
  };
}
```

### `apps/wbs/fe-01/src/modules/preferences/preferences.feature.ts`

```ts
import type { Preferences, Remembered, RememberedPreferences } from './contract';
import {
  GANTT_DETAIL_KEY,
  PROJECT_KEY,
  projectSettingsSectionKey,
  RETIRED_GANTT_ARROWS_KEY,
  THEME_KEY,
} from './preference-keys';

const holdsBoolean = (claimed: unknown): claimed is boolean => typeof claimed === 'boolean';

/**
 * The named answers delivery asks for, each over the one key that holds it.
 *
 * This is the whole of rule K2 for preferences: a component or a hook imports
 * this and never the resource, so no screen names a storage key and no screen
 * picks between the JSON shape and the bare-text one.
 */
export function createRememberedPreferences(preferences: Preferences): RememberedPreferences {
  return {
    themeChoice: <T extends string>(isValid: (claimed: unknown) => claimed is T): Remembered<T> =>
      preferences.json(THEME_KEY, isValid),
    ganttDetail: preferences.json(GANTT_DETAIL_KEY, holdsBoolean),
    retiredGanttArrows: preferences.unchecked(RETIRED_GANTT_ARROWS_KEY),
    lastOpenedProject: preferences.unchecked(PROJECT_KEY),
    projectSettingsSection: <T extends string>(
      projectId: string,
      isValid: (stored: string) => stored is T,
    ): Remembered<T> => preferences.text(projectSettingsSectionKey(projectId), isValid),
  };
}
```

### `apps/wbs/fe-01/src/modules/preferences/composition.ts`

```ts
import { browserStorage } from './browser-storage.repository';
import type { Preferences, RememberedPreferences } from './contract';
import { createRememberedPreferences } from './preferences.feature';
import { createPreferences } from './preferences.resource';

/**
 * The one preferences resource this app runs on.
 *
 * Exported because `apps/wbs/fe-01/src/lib/remembered.ts` still offers the
 * generic factory to the layout module, which builds a store per project id and
 * so cannot be a fixed named answer. Nothing that imports React may import this;
 * delivery takes {@link rememberedPreferences}.
 */
export const browserPreferences: Preferences = createPreferences(browserStorage());

/** The named answers, which is what delivery imports. */
export const rememberedPreferences: RememberedPreferences =
  createRememberedPreferences(browserPreferences);
```

### What `apps/wbs/fe-01/src/lib/remembered.ts` becomes

It **uses** the names it re-exports, so it imports them as well; a bare `export … from` creates no
local binding.

```ts
import { browserPreferences } from '@/modules/preferences/composition';
import type { Claim, Remembered } from '@/modules/preferences/contract';

export type { Claim, Remembered };

/**
 * The store for one key, judged by one guard — the preferences service's now.
 *
 * Kept as a free function at this path because the layout module builds a store
 * per project id and imports it here, and an extraction that renamed every call
 * site would be a diff nobody can review against "no behaviour changed". The
 * knowledge moved; the spelling did not.
 */
export function remembered<T>(
  key: string,
  isValid: (claimed: unknown) => claimed is T,
): Remembered<T> {
  return browserPreferences.json(key, isValid);
}

/** The same store for a key written as **bare text** rather than as JSON. */
export function rememberedText<T extends string>(
  key: string,
  isValid: (stored: string) => stored is T,
): Remembered<T> {
  return browserPreferences.text(key, isValid);
}
```

## 7. Steps

Each box is one action. Test steps come before implementation steps. Every Nx command carries
`NX_DAEMON=false`, and every command that changes directory runs in a subshell from the repository
root.

**This packet is dispatched as two bounded slices, not as one run.** Slice 1 is steps 0 to 6 and
ends at checkpoint A: the module exists, its suites are green, and the shared factory delegates,
but no screen has moved. Slice 2 is steps 7 to 13 and ends at checkpoint B: the four delivery
callers, the key registry and the proofs. The executor stops at each checkpoint and reports; the
planner reviews and commits before the next slice is dispatched. Each slice has its own completion
checklist, and section 13 says what the planner reads at each stop.

**Network is off.** Nothing here needs it: every dependency is installed in the clone, and the
launcher warms the OpenSpec command into this attempt's temporary root before dispatch, because
`bunx` keys its install directory by `TMPDIR`. If a command tries to reach the network, stop and
report rather than enabling it.

### Step 0 — Prerequisites and baselines, before touching anything

Start only from a planner-prepared clone containing an integrated 040.3 **and an integrated
[part 1](040-6-directory-and-preferences.md)**. Do not change branches, do not merge anything, and
do not run `git add`, `git commit`, `git checkout -b`, `git stash` or `git restore --staged`.

- [ ] `echo "$TMPDIR"` → expect a non-empty path, unique to this attempt. **Every scratch file,
      backup, fixture and piece of evidence in this packet lives under it.** No fixed path under
      the system temporary directory is used anywhere. `mkdir -p "$TMPDIR/evidence"`.
- [ ] `git rev-parse HEAD` → record the starting revision.
- [ ] Check both prerequisites by their **artifacts**, not by a count another lane could also have
      moved:
      `test -f apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts && echo one` → expect
      `one` (packet 040.3), and
      `test -f apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.ts && echo two`
      → expect `two` (part 1). Either absent means that packet has not been integrated into this
      clone: **stop and report**.
- [ ] Read the pin, anchored to the pin itself because the bare symbol appears three times in that
      file:

```sh
rg -n '^[[:space:]]*applicationLibraryToolReadmes: [0-9]+,$' \
  tools/tool-devsync/src/repo-namespacing-handoff.test.ts
```

      After checking the prerequisite artifacts above, record the single numeric assertion this
      search returns as **N**; the prerequisite artifacts are what establish integration, not this
      number. Absence or ambiguity — zero or more than one matching line — is a stop condition.
      `grep -nE` with the same pattern is equivalent.

- [ ] The planner records whole-frontend baselines (`wbs-fe-01:test:unit` and `wbs-fe-01:test`)
      before dispatch, from the pre-dispatch clone. The executor does not run either whole target;
      it is reported as pending planner verification at each checkpoint.
- [ ] `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/components/wbs/project-page.test.tsx src/lib/theme.test.ts src/index-bootstrap.test.ts src/components/wbs/plan-layout.test.tsx src/components/wbs/gantt-panel.test.tsx src/components/wbs/project-settings-modal.test.tsx)`
      → exit 0. Record `Test Files` and `Tests`. **These six are the oracle**; only the project
      page's count may move, by exactly `+1`.
- [ ] `git status --short` → expect no modification to any file in section 5.

### Step 1 — Orient

- [ ] Read every file in section 2.
- [ ] Confirm the two verbatim proof comments quoted in section 3 still stand at
      `gantt-detail.ts` 84 to 87 and `theme.ts` 62 to 67. If either has moved or changed, stop and
      report.
- [ ] Confirm `project-page.tsx` line 87 still reads `const PROJECT_KEY = 'wbs.project';` and that
      lines 566 to 585 still hold the cleanup quoted in section 3. If not, stop and report.

### Step 2 — The module, its README, and the pin

- [ ] `mkdir -p apps/wbs/fe-01/src/modules/preferences`
- [ ] Write `contract.ts`, `preference-keys.ts`, `browser-storage.repository.ts` and
      `fake-browser-storage.ts` exactly as section 6 gives them.
- [ ] Before adding the README, run the pin test by name and require exactly one passing test,
      confirming the count still reads the **N** step 0 recorded:

```sh
bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
  -t '^every legacy source occurrence and relevant text family is pinned$'
```

      **A run that matches 0 tests is a stop condition**, not a pass: Bun reports success on an
      empty selection. If this run does not pass, or reports a number other than N, stop and
      report.

- [ ] Write `apps/wbs/fe-01/src/modules/preferences/README.md` with this content:

```markdown
# Preferences

Everything this browser remembers for its reader: the palette they chose, whether the chart shows
its detail, which project they had open, how wide each column was, which settings tab they were
on. Fourteen keys, and the one rule that governs all of them.

The service is plain TypeScript and imports no React, which is rule F1 of the code organization
design in `docs/superpowers/specs/2026-09-19-code-organization-design.md`. It is a repository, a
resource-service and a feature-service in one module, because the resource exclusively owns the
repository and the feature exclusively owns the resource.

## What it owns

- The names of all fourteen keys, in `preference-keys.ts`, and nothing else names one.
- The three stored shapes, and which key uses which: JSON for eleven of them, bare text for the
  remembered project id and for the settings modal's open section.
- The one refusal rule the whole app shares: a stored value that is no longer the expected type
  takes its key with it, and the caller's own default stands. This is deliberately not the
  "unknown is not OK" throw of rule R5 — the alternative is a page nobody can open until they
  clear storage by hand, over the colour of a stripe.
- The named answers delivery asks for, so that no screen names a key or picks a shape.

## What it does not own

The guards. Which three words a theme may be, and which five sections a settings modal has, are
those callers' own domain rules and stay with them. Per-entry sanitising is theirs too: the width
store drops entries for columns a reader no longer has, and must not write the sanitised set back.

Recovery from a store that refuses access. A browser with site data blocked throws out of the
adapter and out of everything above it, exactly as the hand-written stores always did. Turning
that into a silent default would be a behaviour change with its own intent.

## Invariants

Every key name and every stored byte format is a compatibility fact: readers have this data in
their browsers now. Renaming a key, or writing JSON where bare text stands, silently loses
whatever that reader had said. The two bare-text keys cannot become JSON.

## Relationships

The exported types are in `contract.ts`; the repository adapter is
`browser-storage.repository.ts`; the resource is `preferences.resource.ts`; the named answers are
`preferences.feature.ts`; `composition.ts` builds both instances over the real adapter. There is
no `module.ts` yet: DI Bag is not installed. `apps/wbs/fe-01/src/lib/remembered.ts` keeps the
generic factory for the layout module, which builds a store per project id.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`, for
`preferences.resource.test.ts`, `preferences.feature.test.ts` and `composition.test.ts`. The
adapter's own suite, `browser-storage.repository.test.ts`, names browser globals and therefore
runs in the `test` target instead. The behaviour this extraction preserves is proved by the theme,
layout, chart, settings and project page suites in that same target.
```

- [ ] Give the README no Markdown link and no `module-index` comment, for the reason in section 3.
- [ ] Watch the pin fail, running that one test by name and **not** the whole file:

```sh
bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
  -t '^every legacy source occurrence and relevant text family is pinned$'
```

      The four tests this packet runs by name are **top-level `test(...)` calls with no enclosing
      `describe`** in that file (verified: lines 409, 420, 442 and 538), so an anchored bare title
      is the full joined name and matches. Expected: **exactly 1 test runs** and it **fails**,
      naming `applicationLibraryToolReadmes` with received N+1 against expected N — this packet
      adds one README, so the pin moves by exactly one. Record the message. **A run that matches 0
      tests is a stop condition**, not a pass: Bun reports success on an empty selection. Stop if
      the increase is not exactly one, or another pinned field changed.

- [ ] Change the value to N+1 and add a comment in the existing house style directly above it,
      using the observed numbers:

```ts
// Re-pinned N -> N+1 for `apps/wbs/fe-01/src/modules/preferences/README.md`, the preferences
// module index, which the sweep must cover like any application README.
```

- [ ] Rerun the same named test → exactly `1 pass`, `0 fail`; zero tests matched is a stop.
      Nothing else in that pinned object changes; if anything does, stop and report.

### Step 3 — The three failing fast-tier suites

- [ ] Add exactly these three lines to `NODE_SUITES` in `apps/wbs/fe-01/vitest.node-suites.ts`, in
      the list's sorted positions, and add nothing else. **Do not add the adapter's suite**: it
      names browser globals, so the tier rule places it in the jsdom tier and leaving it out is
      what makes `test-tiers.test.ts` agree.

```ts
  'src/modules/preferences/composition.test.ts',
  'src/modules/preferences/preferences.feature.test.ts',
  'src/modules/preferences/preferences.resource.test.ts',
```

- [ ] Write `apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts`. Its text must
      contain none of the banned words in section 3. **Ten cases:**

```ts
import { expect, test } from 'vitest';

import { fakeBrowserStorage } from './fake-browser-storage';
import { createPreferences } from './preferences.resource';

const isColour = (claimed: unknown): claimed is 'light' | 'dark' =>
  claimed === 'light' || claimed === 'dark';
const isSection = (stored: string): stored is 'teams' | 'steps' =>
  stored === 'teams' || stored === 'steps';

test('a JSON-written value comes back as it was written', () => {
  const store = fakeBrowserStorage();
  const held = createPreferences(store).json('wbs.demo', isColour);
  held.write('dark');
  expect(store.held()['wbs.demo']).toBe('"dark"');
  expect(held.read()).toBe('dark');
  expect(held.claim()).toEqual({ status: 'held', value: 'dark' });
});

test('nothing stored is absent, and is not a refusal', () => {
  const held = createPreferences(fakeBrowserStorage()).json('wbs.demo', isColour);
  expect(held.claim()).toEqual({ status: 'absent' });
  expect(held.read()).toBeNull();
});

test('a read that drops removes the refused key; a plain read writes nothing', () => {
  const store = fakeBrowserStorage({ 'wbs.demo': '"midnight"' });
  const held = createPreferences(store).json('wbs.demo', isColour);
  expect(held.read()).toBeNull();
  expect(store.held()['wbs.demo']).toBe('"midnight"');
  expect(held.readAndDrop()).toBeNull();
  expect(store.held()['wbs.demo']).toBeUndefined();
});

test('bytes that will not parse are refused rather than thrown', () => {
  const store = fakeBrowserStorage({ 'wbs.demo': '{not json' });
  const held = createPreferences(store).json('wbs.demo', isColour);
  expect(held.claim()).toEqual({ status: 'refused' });
  expect(held.readAndDrop()).toBeNull();
  expect(store.held()['wbs.demo']).toBeUndefined();
});

test('a bare-text key is written without quotes and read without a parse', () => {
  const store = fakeBrowserStorage();
  const held = createPreferences(store).text('wbs.demo.section', isSection);
  held.write('steps');
  expect(store.held()['wbs.demo.section']).toBe('steps');
  expect(held.read()).toBe('steps');
});

test('a bare-text value the guard refuses takes its key with it', () => {
  const store = fakeBrowserStorage({ 'wbs.demo.section': '7' });
  const held = createPreferences(store).text('wbs.demo.section', isSection);
  expect(held.readAndDrop()).toBeNull();
  expect(store.held()['wbs.demo.section']).toBeUndefined();
});

test('an unchecked key holds every string, the empty one included', () => {
  const store = fakeBrowserStorage({ 'wbs.demo.id': '' });
  const held = createPreferences(store).unchecked('wbs.demo.id');
  expect(held.claim()).toEqual({ status: 'held', value: '' });
  expect(held.read()).toBe('');
  expect(held.readAndDrop()).toBe('');
  expect(store.held()['wbs.demo.id']).toBe('');
});

test('an unchecked key is written as bare text', () => {
  const store = fakeBrowserStorage();
  const held = createPreferences(store).unchecked('wbs.demo.id');
  held.write('p1');
  expect(store.held()['wbs.demo.id']).toBe('p1');
});

test('forgetting removes the key and writes no default over it', () => {
  const store = fakeBrowserStorage({ 'wbs.demo': '"dark"' });
  const held = createPreferences(store).json('wbs.demo', isColour);
  held.forget();
  expect(store.held()).toEqual({});
});

test('a store that refuses access is not recovered from', () => {
  const refusing = {
    read: (): string | null => {
      throw new Error('site data blocked');
    },
    write: (): void => {
      throw new Error('site data blocked');
    },
    forget: (): void => {
      throw new Error('site data blocked');
    },
  };
  const held = createPreferences(refusing).json('wbs.demo', isColour);
  expect(() => held.read()).toThrow('site data blocked');
});
```

- [ ] Write `apps/wbs/fe-01/src/modules/preferences/preferences.feature.test.ts`. **Four cases,
      and the first is the whole compatibility claim:**

```ts
import { expect, test } from 'vitest';

import { fakeBrowserStorage } from './fake-browser-storage';
import { createRememberedPreferences } from './preferences.feature';
import { createPreferences } from './preferences.resource';

const isChoice = (claimed: unknown): claimed is 'light' | 'dark' =>
  claimed === 'light' || claimed === 'dark';
const isSection = (stored: string): stored is 'teams' => stored === 'teams';

test('each named answer reaches the key readers already have', () => {
  const store = fakeBrowserStorage();
  const named = createRememberedPreferences(createPreferences(store));

  named.themeChoice(isChoice).write('dark');
  named.ganttDetail.write(true);
  named.lastOpenedProject.write('p1');
  named.projectSettingsSection('p9', isSection).write('teams');

  // Names and bytes together, because both are compatibility facts: two of
  // these are bare text and eleven are JSON, and a reader has them now.
  expect(store.held()).toEqual({
    'wbs.theme': '"dark"',
    'wbs.ganttDetail': 'true',
    'wbs.project': 'p1',
    'wbs.projectSettingsSection.p9': 'teams',
  });
});

test('the retired chart key is reachable only to be dropped', () => {
  const store = fakeBrowserStorage({ 'wbs.ganttArrows': 'true' });
  const named = createRememberedPreferences(createPreferences(store));

  named.retiredGanttArrows.forget();
  expect(store.held()['wbs.ganttArrows']).toBeUndefined();
});

test('the chart detail refuses anything that is not a boolean', () => {
  const store = fakeBrowserStorage({ 'wbs.ganttDetail': '"yes"' });
  const named = createRememberedPreferences(createPreferences(store));

  expect(named.ganttDetail.claim()).toEqual({ status: 'refused' });
  expect(named.ganttDetail.readAndDrop()).toBeNull();
  expect(store.held()['wbs.ganttDetail']).toBeUndefined();
});

test('the last opened project holds the empty string rather than refusing it', () => {
  const store = fakeBrowserStorage({ 'wbs.project': '' });
  const named = createRememberedPreferences(createPreferences(store));

  expect(named.lastOpenedProject.read()).toBe('');
});
```

- [ ] Write `apps/wbs/fe-01/src/modules/preferences/composition.test.ts`:

```ts
import { expect, test } from 'vitest';

import { browserPreferences, rememberedPreferences } from './composition';

/**
 * The production instances must be importable where there is no browser store
 * at all, because that is this tier and because the shared setup installs its
 * stand-in after the module graph is built. Building a store for a key must
 * touch nothing either: only reading and writing may.
 */
test('the production preferences can be built with no browser store present', () => {
  expect(typeof browserPreferences.json).toBe('function');
  expect(typeof browserPreferences.text).toBe('function');
  expect(typeof browserPreferences.unchecked).toBe('function');
  expect(() => browserPreferences.unchecked('wbs.demo.id')).not.toThrow();
  expect(typeof rememberedPreferences.lastOpenedProject.read).toBe('function');
});
```

- [ ] `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --config vitest.node.config.ts src/modules/preferences/preferences.resource.test.ts src/modules/preferences/preferences.feature.test.ts src/modules/preferences/composition.test.ts)`
      → expect the run to **fail collection**, reporting that `./preferences.resource`,
      `./preferences.feature` and `./composition` cannot be resolved. Record the message. Do not go
      on until you have seen it. The whole `wbs-fe-01:test:unit` target is not run here; it is
      reported as pending planner verification.

### Step 4 — The resource, the feature, and the composition

- [ ] Write `preferences.resource.ts`, `preferences.feature.ts` and `composition.ts` exactly as
      section 6 gives them.
- [ ] `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --config vitest.node.config.ts src/modules/preferences/preferences.resource.test.ts src/modules/preferences/preferences.feature.test.ts src/modules/preferences/composition.test.ts)`
      → exit 0, exactly three passing files and fifteen passing tests. The whole
      `wbs-fe-01:test:unit` target is not run here; it is reported as pending planner verification.

### Step 5 — The adapter's own suite

- [ ] Write `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.test.ts`. It names
      browser globals on purpose and is **not** listed in `NODE_SUITES`. Three cases over the real
      store: a written value is readable, `forget` removes a key, and an absent key reads null.
      Clear the store in a `beforeEach` so one case cannot seed the next.
- [ ] `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/modules/preferences/browser-storage.repository.test.ts)`
      → exit 0, three tests passing.
- [ ] `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/test-tiers.test.ts)` → exit 0. This is the
      guard that the fast-tier list and the files agree; if it fails naming one of this packet's
      suites, stop and report (stop condition 7).

### Step 6 — The shared store's callers keep their import

- [ ] Rewrite `apps/wbs/fe-01/src/lib/remembered.ts` exactly as section 6 gives it. Nothing else
      in the app changes in this step.
- [ ] Rerun step 0's six-suite oracle command → exit 0, with all six suites and their test counts
      unchanged from step 0. The whole `wbs-fe-01:test` target is not run here; it is reported as
      pending planner verification.

### Slice 1 completion checklist — checkpoint A

Stop here and report. Do not start step 7 until the planner has reviewed and committed.

- [ ] `$TMPDIR` recorded, `$TMPDIR/evidence` created, nothing written outside the clone and it.
- [ ] Step 0's baselines recorded, both prerequisite artifacts found, and the pin read N.
- [ ] The twelve files of steps 2 to 5 exist: the README, the contract, the key registry, the
      adapter, the fake, the resource, the feature, the composition, and the four suites.
      `vitest.node-suites.ts` gained exactly three lines and the pin moved N to N+1.
- [ ] The red observation of step 3 was recorded before the resource existed.
- [ ] The focused suite run of step 4 reports exactly three passing files and fifteen passing
      tests, and the adapter's jsdom suite passes with three tests. The whole `test:unit` delta
      against step 0 is pending planner verification.
- [ ] `test-tiers.test.ts` passes: three suites in the fast tier, the adapter's in the jsdom tier.
- [ ] `apps/wbs/fe-01/src/lib/remembered.ts` delegates, and **no screen has changed yet**: none of
      the four delivery callers, and not `remembered-layout.ts`, is touched in this slice.
- [ ] The report names the fifteen paths (twelve created, three modified) and the commit subject
      `refactor(wbs-fe): add the preferences module behind the remembered factory`. Nothing was
      staged or committed.

### Step 7 — The four delivery callers

Each of these imports the **feature**, not the resource: rule K2, and the reason the facade exists.

- [ ] `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`:

```ts
import { rememberedPreferences } from '@/modules/preferences/composition';

const storedDetail = rememberedPreferences.ganttDetail;
```

      Delete the local `DETAIL_KEY` and `RETIRED_ARROWS_KEY` declarations and the
      `remembered(...)` call, keeping **all** of their JSDoc: move the `DETAIL_KEY` prose onto
      `storedDetail` and the `RETIRED_ARROWS_KEY` prose to the line that drops it. Line 88 becomes
      `rememberedPreferences.retiredGanttArrows.forget();`, and the **verbatim proof comment at
      lines 84 to 87 stays immediately above it**. The proof comment at 89 to 100 stays where it
      is: its guard does not move.

- [ ] `apps/wbs/fe-01/src/components/wbs/project-page.tsx`. The permitted edits here are: the
      import block, the removal of the `PROJECT_KEY` declaration at line 87, the
      `rememberProject` body at lines 111 and 112, and the read at line 575. Nothing else.

```ts
import { rememberedPreferences } from '@/modules/preferences/composition';
```

      Delete `const PROJECT_KEY = 'wbs.project';` at line 87 and keep its JSDoc on a new
      declaration beside it:

```ts
/**
 * Where this browser remembers which project was open.
 *
 * Reached through the preferences service like every other key, and **judged**
 * nowhere near it: its claim is tested against the project list this load just
 * fetched, not against a shape, so there is nothing to hand a guard built once
 * at module scope — `found.some(...)` is the whole validity rule and it is
 * different on every load. That is what the unchecked shape is for, and why the
 * empty string is held rather than refused: a held empty string still reaches
 * `installProjects`, which drops the key, and a refusal would leave it in
 * storage for ever.
 */
const rememberedProject = rememberedPreferences.lastOpenedProject;
```

      Lines 111 and 112 become `if (id === null) rememberedProject.forget(); else
      rememberedProject.write(id);`. Line 575 becomes
      `const remembered = rememberedProject.read();`.

- [ ] Add **one case** to `apps/wbs/fe-01/src/components/wbs/project-page.test.tsx`, beside the
      existing remembered-project cases. **Add; never edit an existing assertion.** It stores the
      empty string as the remembered project, renders with two projects in the list, and asserts
      the key is removed and nothing is selected. This is the behaviour that exists today and that
      the unchecked shape exists to preserve.
- [ ] `apps/wbs/fe-01/src/lib/theme.ts`. The key moves to the registry; this file both uses and
      re-exports it, because `index-bootstrap.test.ts` imports `THEME_KEY` from here at its line 8:

```ts
import { rememberedPreferences } from '@/modules/preferences/composition';
import { THEME_KEY } from '@/modules/preferences/preference-keys';

export { THEME_KEY };

const storedChoice = rememberedPreferences.themeChoice(isThemeChoice);
```

      Keep `THEME_KEY`'s existing JSDoc on the re-export, and keep the verbatim proof comment at
      lines 62 to 67 over `rememberedTheme` exactly where it is.

- [ ] `apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx`. Delete `sectionKey` at line
      49 and change its one caller at line 79:

```ts
import { rememberedPreferences } from '@/modules/preferences/composition';

const storedSection = (projectId: string): Remembered<SettingsSection> =>
  rememberedPreferences.projectSettingsSection(projectId, isSettingsSection);
```

      Keep the JSDoc above `storedSection` and `sectionKey`'s own prose with it.

- [ ] `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/components/wbs/project-page.test.tsx src/lib/theme.test.ts src/index-bootstrap.test.ts src/components/wbs/plan-layout.test.tsx src/components/wbs/gantt-panel.test.tsx src/components/wbs/project-settings-modal.test.tsx)`
      → exit 0, with step 0's counts and the project page's `Tests` exactly `+1`. **If a case
      fails, do not edit its assertion** (stop condition 1). The project page suite asserts raw
      stored bytes at its lines 389, 490, 525, 619, 695, 776, 1227, 1235, 1462, 1481 and 2069;
      those are what prove the format did not change.

### Step 8 — The key registry owns every key name

- [ ] In `apps/wbs/fe-01/src/components/wbs/remembered-layout.ts`, delete the eight key builders
      and the one key constant and both **import and re-export** them — the file calls them at
      lines 28, 89 and 277 among others, and `export … from` alone would leave every one of those
      references unresolved:

```ts
import {
  expansionKey,
  ganttDayPxKey,
  ganttHeightKey,
  ganttLabelsKey,
  hiddenColumnsKey,
  linksResetShownKey,
  MERMAID_SECTION_MODE_KEY,
  savedViewsKey,
  widthOverridesKey,
} from '@/modules/preferences/preference-keys';

export {
  expansionKey,
  ganttDayPxKey,
  ganttHeightKey,
  ganttLabelsKey,
  hiddenColumnsKey,
  linksResetShownKey,
  MERMAID_SECTION_MODE_KEY,
  savedViewsKey,
  widthOverridesKey,
};
```

      The guards, the ranges and the per-entry sanitising **stay in this file**. Only the key
      strings move. Keep each builder's JSDoc by moving it to the registry.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0, no diagnostic.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0, no warning.
- [ ] `bunx prettier --write` over exactly the twenty-one paths in section 5, then
      `NX_DAEMON=false bunx nx format:check --all` → exit 0, or failures naming only files outside
      section 5, which are reported and left alone. **Never run a repository-wide format write.**
- [ ] Run the four filesystem-only devsync checks by name:

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
      packet created is a stop condition; one naming only other packets' documents is pre-existing,
      recorded verbatim. Never add `|| true` or anything else that turns a failure into exit zero.

- [ ] Do **not** run `NX_DAEMON=false bunx nx run tool-devsync:test`. Report it under "Not
      verified" as **pending planner verification**.

### Step 9 — Negative proofs

- [ ] Run every proof in section 8, in order, with the restore discipline given there. Only after
      observing a failure may the adjacent dated `Proof:` comment be written, and it must describe
      what was actually seen.

### Step 10 — Whole frontend

- [ ] Report whole-target verification (`wbs-fe-01:test:unit`, `wbs-fe-01:test`) as pending planner
      verification. The executor does not run either whole target here. At checkpoint B the
      planner runs both, uncached, against the pre-dispatch baseline: `test:unit` is +3 files/+15
      tests; the `test` UTC summary is +4 files and +19 tests — the three fast-tier suites and the
      adapter's suite all run in this target, plus the one case added to the project page; the
      Auckland summary is identical to step 0's. Any other difference is a stop condition.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:build` → exit 0.

### Step 11 — OpenSpec validation

- [ ] Run the batch's standard block:

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

      Expected: one JSON report printed, block exits 0.

### Step 12 — Hand over, do not commit

- [ ] `git status --short --untracked-files=all` → expect this slice's own six paths of section
      5 — the four delivery callers, `project-page.test.tsx` and `remembered-layout.ts` — as
      modified, **plus any slice 1 source file that gained a dated `Proof:` comment from section 8**,
      changed by that comment only, and `preference-keys.ts`, changed only by the builders' JSDoc
      step 8 moves into it. Nothing else. Record the list and say which paths changed by
      comments only. (Packet 040.6 stopped here on 2026-09-20 because its hand-over forgot the
      proof comments.)
- [ ] Report, under "Ready to commit", those paths and the subject
      `refactor(wbs-fe): put every browser storage key behind the preferences module`, with a body
      carrying step 0's baselines, step 10's counts, and every proof of section 8 with the exact
      failure line seen.
- [ ] Do not run `git add`, `git commit`, `git checkout -b`, `git stash` or
      `git restore --staged`.
- [ ] Put the evidence in the **final executor report**. Do **not** write it into
      `openspec/changes/service-taxonomy/verify.md`: that file belongs to 010.3 and then 020.8.

### Step 13 — Completion gate, not run here

- [ ] Do **not** run `bin/h2puni-gate.sh`. Say in the report that it was not run and why.

### Slice 2 completion checklist — checkpoint B

- [ ] Slice 1's checklist is still true, and its commit is the base of this slice.
- [ ] The twelve new files exist, and the nine modified files carry only the changes section 5
      names.
- [ ] The whole `test:unit` (+3 files/+15 tests) and `test` (UTC +4/+19, Auckland unchanged) deltas
      against step 0 are confirmed by the planner, uncached, per step 10; the executor did not run
      either whole target.
- [ ] The six oracle suites pass with step 0's counts, except the project page's `Tests`, which is
      exactly `+1`, and no existing assertion was edited.
- [ ] `test-tiers.test.ts` passes: the adapter's suite is in the jsdom tier and the other three are
      in the fast tier.
- [ ] `typecheck`, `lint`, `build` and `format:check` all exit 0.
- [ ] All **eight** negative proofs of section 8 were observed failing, restored, and rerun green.
- [ ] `$TMPDIR/evidence` holds eight `proof-N.patch` files and eight `proof-N.failing.txt` files,
      and every `cmp` after a restore exited 0.
- [ ] No command in the run was given `|| true` or any other failure mask.
- [ ] No source file outside `apps/wbs/fe-01/src/modules/preferences/` and
      `apps/wbs/fe-01/index.html` names a browser storage global. Check with
      `grep -rn "localStorage\|sessionStorage" apps/wbs/fe-01/src --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -v "test-tiers" | grep -v "src/modules/preferences/"`
      → expect only prose comments, specifically the one at
      `apps/wbs/fe-01/src/components/wbs/use-plan-filter.ts` line 136. Any call is a stop.
- [ ] The four named devsync checks were run; the whole target is pending planner verification.
- [ ] The host gate is reported as not run.
- [ ] This slice's own six paths and the commit subject are in the report — the packet's twenty-one
      paths total, fifteen already committed at checkpoint A — and nothing was staged or committed.

## 8. Negative proofs

Eight. Each is watched failing before its adjacent `Proof:` comment is written.

**Restore discipline, for every entry.** Everything lives under `$TMPDIR`, set uniquely per
attempt by the launcher; no fixed path under the system temporary directory is used. For a proof
numbered `N` over file `F`:

```sh
mkdir -p "$TMPDIR/evidence"
cp "$F" "$TMPDIR/proof-N.passing"
#  ... inject the fault into $F ...
diff -u "$TMPDIR/proof-N.passing" "$F" > "$TMPDIR/evidence/proof-N.patch"
<the command> 2>&1 | tee "$TMPDIR/evidence/proof-N.failing.txt"
cp "$TMPDIR/proof-N.passing" "$F"
cmp "$F" "$TMPDIR/proof-N.passing"          # exits 0, and that is the restore proof
<the command>                                # green again
```

The mutation is a **patch file** and the failure is a **captured output file**, both under
`$TMPDIR/evidence`, so a proof is a file the planner copies out rather than a sentence in a
report. **Never restore from Git**: it cannot run here and would discard the passing uncommitted
work. **Never write `|| true`, `; echo exit=$?` or anything else that turns a required failure
into exit zero.**

```sh
# The sandbox unit command (batch README, "Frontend tests inside the sandbox"), not the test:unit target.
FAST='(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts)'
ORACLE='(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/components/wbs/project-page.test.tsx src/lib/theme.test.ts src/components/wbs/gantt-panel.test.tsx)'
```

| #   | File and place                               | Fault to inject                                                    | Test that must fail                                                                                                                       |
| --- | -------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `preferences.resource.ts`, `storeOver`       | Make `readAndDrop`'s `storage.forget(key)` a no-op                 | `a read that drops removes the refused key; a plain read writes nothing`, and `a bare-text value the guard refuses takes its key with it` |
| 2   | `preferences.resource.ts`, `parsedOrNothing` | Rethrow instead of answering `undefined`                           | `bytes that will not parse are refused rather than thrown`                                                                                |
| 3   | `preferences.resource.ts`, `text`            | Write `JSON.stringify(value)` instead of the bare value            | `a bare-text key is written without quotes and read without a parse`, and `each named answer reaches the key readers already have`        |
| 4   | `preferences.resource.ts`, `unchecked`       | Answer `{ status: 'absent' }` when the stored value is `''`        | `an unchecked key holds every string, the empty one included`, and the case added in step 7                                               |
| 5   | `preference-keys.ts`                         | Change `PROJECT_KEY` to `'wbs.projectId'`                          | `each named answer reaches the key readers already have`, and the eleven raw-byte assertions in `project-page.test.tsx`                   |
| 6   | `preferences.feature.ts`                     | Give `ganttDetail` a guard that accepts any string                 | `the chart detail refuses anything that is not a boolean`                                                                                 |
| 7   | `browser-storage.repository.ts`              | Capture the browser store when the module loads, outside the arrow | `the production preferences can be built with no browser store present`, which fails to collect in the fast tier                          |
| 8   | `browser-storage.repository.ts`, `forget`    | Make it a no-op                                                    | The adapter's own jsdom case, and `drops the key the arrows switch wrote, without reading it`                                             |

**The two historical proof comments are not rewritten.** They stay in their own files, as section
3 quotes them: the retired-key one in `gantt-detail.ts` over the line that drops it, the
`readAndDrop` one in `theme.ts` over `rememberedTheme`. The executor **appends** a separate dated
observation under each only after watching proofs 8 and 1 respectively, and writes a new dated
observation for the six checks that have none. If a historical comment would have to be reworded
to fit, stop and report (stop condition 2).

## 9. OpenSpec

**No new OpenSpec change is opened by this packet, and it claims no blanket exemption.**

1. **The extraction itself** changes no observable behaviour, so R4's mechanical-refactor
   exemption covers it. The proof is the unedited oracle: six suites and eleven raw-byte
   assertions.
2. **The architecture** — the four kinds, the direction rules, F1 and the module layout — is
   decided in the [code organization design](../../specs/2026-09-19-code-organization-design.md)
   and owned by the architectural `service-taxonomy` change, which packet 010.3 creates.
   **010.3 integrated is a prerequisite** alongside 040.3 and part 1: check for
   `openspec/changes/service-taxonomy/proposal.md` in step 0 and report its absence.
3. **Evidence goes in the executor's report, not in another lane's file.**
   `openspec/changes/service-taxonomy/verify.md` belongs to 010.3 and 020.8; the planner appends
   this packet's evidence after integrating 020.8.
4. **One accepted capability constrains this ground: `wbs-table-modules`.** Its requirement
   "Concept modules preserve table behavior" reads: "The table SHALL compose remembered layout,
   layout, column set, read, filter, toolbar, export actions, keyboard, structure, estimate
   drafts, reference sets, column families, cell props and chart input modules while preserving
   their existing behavior", with the scenario "Layout reset after a resize ... both return to
   their existing default rules". **Step 8 edits that module.** It moves key strings and imports
   and re-exports the builders, leaving every guard, default and reset rule where it is, so the
   requirement is satisfied by construction and proved by `plan-layout.test.tsx` passing unedited.
   Cite that requirement in the commit message.

If the extraction turns out to need a behaviour change, stop and report.

## 10. Verification

### What the executor runs

| Command                                                                | Expected                                                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The focused node-tier suite command of steps 3 and 4                   | Step 3 fails collection; step 4 exits 0 with exactly three passing files and fifteen tests.    |
| The six-suite oracle command in step 0                                 | Exit 0, step 0's counts, with the project page's `Tests` exactly +1.                           |
| `(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/test-tiers.test.ts)` | Exit 0. The fast-tier list and the files agree.                                                |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                      | Exit 0, no diagnostic.                                                                         |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                           | Exit 0, no warning.                                                                            |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                          | Exit 0.                                                                                        |
| The storage sweep in the completion checklist                          | Only the one prose comment; no call outside the preferences module and the pre-paint script.   |
| The four named devsync checks in step 8                                | Each `1 pass`, `0 fail`, or a failure naming only other packets' documents, recorded verbatim. |
| `NX_DAEMON=false bunx nx format:check --all`                           | Exit 0, or failures naming only files outside section 5.                                       |
| The OpenSpec block in step 11                                          | One JSON report printed, block exits 0.                                                        |
| The eight proofs of section 8                                          | Each named test observed failing, restored, rerun green.                                       |

### What the planner runs afterwards, and the executor reports as pending

| Command                                                          | Why the executor cannot run it                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `git add` of the twenty-one paths, then the commit               | The clone's Git directory is read-only here.                                                                                          |
| `NX_DAEMON=false bunx nx run tool-devsync:test`                  | Its index checker runs `git write-tree` and `git add --update` against this clone.                                                    |
| `NX_DAEMON=false bunx nx run wbs-fe-01:test:unit`, uncached      | Counts are relative; the planner checks the delta against its pre-dispatch baseline, not the executor. Expect `+3` files/`+15` tests. |
| `NX_DAEMON=false bunx nx run wbs-fe-01:test`, uncached           | Same reason. Expect UTC `+4` files/`+19` tests; Auckland unchanged.                                                                   |
| `bin/h2puni-gate.sh <sha>`                                       | The host gate cannot run on this machine.                                                                                             |
| Appending this packet's evidence to `service-taxonomy/verify.md` | That file belongs to 010.3 and then 020.8.                                                                                            |

**What none of it proves.** Nothing runs the browser level: `e2e` is not run here. Nothing proves
that a reader's _existing_ browser data survives an upgrade — only that the names and bytes this
code writes are the ones the current code writes, which the feature suite and the project page's
raw-byte assertions pin. Nothing proves rules F1, K2, K3 or K4 mechanically; the kind-suffix lint
is rollout Task 3, which is in no packet of this batch. Nothing proves the module's isolated type
check, which the batch assumptions defer.

## 11. Stop conditions

1. Any assertion in an existing test has to change to make a suite pass. The one deliberate
   assertion change here is the README count pin.
2. A `Proof:` comment would have to be reworded, or has no home, or its test no longer exists.
3. A negative injection in section 8 does not produce the named failure in the named test. All
   eight are run. A fault that also fails **other** tests is not a stop: save the whole failing
   output, list every additional failing test by name in the report beside the proof, and go on.
   It is a stop only when a named test passes, fails with a different message, or the mutation does
   not compile. (Proof 1 necessarily fails `bytes that will not parse are refused rather than
thrown` as well as its two named tests: an unparseable value is also a refused key.)
4. **Any stored key name or stored byte format would have to change.** Readers have this data in
   their browsers; this is a stop, not a judgement call.
5. The oracle's counts differ from step 0's by anything other than the project page's `+1`.
6. The anchored pin search at step 0 is absent or ambiguous, or the count after adding the
   README is not exactly N+1.
7. `test-tiers.test.ts` fails naming one of this packet's suites. Do not edit `DOM_EVIDENCE` or
   `INDIRECT_DOM_SUITES`: both are outside the file plan.
8. The document checks ask for anything other than a plain README.
9. The current behaviour looks like a defect. Preserve it, record it as a finding, report it.
10. Anything requires editing a file in section 12, or `apps/wbs/fe-01/index.html`.
11. Any step seems to need `git add`, `git commit`, staging, the whole devsync target, or the host
    gate. Steps 8, 12 and 13 say what to do instead.
12. A required tool is missing. Do not install anything into the repository; install only under
    `$TMPDIR` if the packet's own commands need it, and otherwise stop and report.
13. A run of a named test reports **0 tests matched**. Bun exits zero on an empty selection, so
    this is a silent pass on nothing, not a success.
14. `$TMPDIR` is unset or empty, or anything would have to be written outside the clone and
    `$TMPDIR`.
15. Any command tries to reach the network.
16. Slice 1's checkpoint has not been reviewed and committed, and step 7 is next. The executor
    stops at a checkpoint and waits; it never starts the following slice on its own.

## 12. Out of lane

Two files are **shared in sequence**: `apps/wbs/fe-01/vitest.node-suites.ts` and the README count
pin belong to 040.3 first, [part 1](040-6-directory-and-preferences.md) second, this packet third.
This packet adds only its own three suite lines and moves the pin only from 22 to 23.

| Path                                                                                                                                    | Owner                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `apps/wbs/fe-01/src/components/directory/directory-page.tsx` and the two directory modules                                              | [part 1](040-6-directory-and-preferences.md)     |
| `apps/wbs/fe-01/src/modules/store.ts`                                                                                                   | created by part 1; not imported here             |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, `apps/wbs/fe-01/src/lib/local-write.ts`, `apps/wbs/fe-01/src/lib/plan-refresh.ts` | packet 040.3                                     |
| `apps/wbs/fe-01/src/components/wbs/use-reference-sets.ts`                                                                               | a later task                                     |
| `apps/wbs/fe-01/index.html`                                                                                                             | nobody in this batch; the pre-paint script stays |
| `apps/wbs/fe-01/src/test-tiers.test.ts`                                                                                                 | nobody; it is the guard, not a knob              |
| `eslint.config.js`, `apps/wbs/eslint.product.mjs`                                                                                       | Task 3 of the rollout                            |
| `openspec/changes/service-taxonomy/` and its `verify.md`                                                                                | 010.3, then 020.8                                |
| `docs/wiki-policy/modules.json` and the wiki pilot path list                                                                            | Task 9 of the rollout                            |

`apps/wbs/fe-01/src/components/wbs/use-plan-filter.ts` needs no edit: its only mention of browser
storage is prose.

## 13. How to run this packet: two slices, two checkpoints

The execution contract dispatches one executor at a time in bounded slices, and a packet is
dispatched only as the slice the planner has reviewed. The cut is where the risk changes: slice 1
adds a module and proves it against fakes while every screen still behaves exactly as before;
slice 2 is the only part that can lose a reader's stored data.

| Slice | Steps   | Ends at      | What the planner reads before dispatching the next                                                                                                                 |
| ----- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | 0 to 6  | Checkpoint A | The contract, the key registry, the three fast-tier suites and the jsdom adapter suite, the tier guard, the pin move, and the delegating factory. No screen moved. |
| 2     | 7 to 13 | Checkpoint B | The four delivery rewrites and the registry move against step 0's six-suite oracle, the storage sweep, eight observed failure lines with their evidence files.     |

At each checkpoint the executor **stops and reports**: it never commits, never stages and never
starts the next slice on its own. The planner reviews the diff against the frozen baseline, stages
the exact paths, replays a sample of the proofs from `$TMPDIR/evidence`, runs the planner-only
checks of section 10, commits with hooks enabled and records the hashes in the ledger.

**Integration is a separate planner handoff**: staging the twenty-one paths, the whole
`tool-devsync:test` target, the commit, the merge and the host gate.

## Findings for the main planner

Recorded, not repaired.

1. **This module does not use the shared store contract, and should not be made to.** Part 1
   creates `apps/wbs/fe-01/src/modules/store.ts`; a preferences service holds no snapshot and has
   nothing that changes underneath a subscriber, so extending it would be an unused dependency and
   a false claim about the service's shape. The main planner asked that this packet import it; the
   packet does not, and this is the deviation to decide on.
2. **`remembered-layout.ts` still reaches the preferences _resource_** through
   `apps/wbs/fe-01/src/lib/remembered.ts`, because it builds a store per project id and so cannot
   be a fixed named answer. It imports no React, so it is not delivery and rule K2 is not
   violated — but under rule K6 a resource-level module importing another module's resource is a
   sideways import, which the design says should go through a published event. Classifying that
   file is the table packet's work, not this one's.
3. **The retired arrows key is dropped on every mount, for ever.** `gantt-detail.ts` removes
   `wbs.ganttArrows` on every mount, long after the day it was written. Preserved exactly; a dated
   removal of that line is its own small change.
4. **The pre-paint theme read in `apps/wbs/fe-01/index.html` still names the key by hand.** It
   cannot import a module, so it stays, and `index-bootstrap.test.ts` is what keeps it honest.
   Once the key lives in a registry, the parity test could read the registry instead of the theme
   module — a small improvement, out of lane here.
5. **Rules F1, K2, K3 and K4 are mechanically unenforced when this runs**, per the batch
   assumptions: rollout Task 3 is in no packet of this batch.
6. **`this: void` is not usable in this repository's contracts.** `no-invalid-void-type` is on and
   rejects it, so every service contract uses readonly function-typed properties instead.

## Review disposition

This packet was split out of [040.6](040-6-directory-and-preferences.md) on 2026-09-19, on the
second review's recommendation and the main planner's decision. It carries the preferences half of
both reviews' findings.

| Finding                                                     | Verified                                                                                                                        | Action                                                                                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review 2 critical 3 — lint failures                         | Yes, and the review's suggested `this: void` is itself rejected by `no-invalid-void-type`.                                      | **Fixed.** Every contract member is a readonly function-typed property. All ten section 6 files measured at 0 errors, 0 warnings.                                                   |
| Review 2 critical 4 — editing another lane's verify file    | Yes.                                                                                                                            | **Fixed.** Step 12 forbids it; section 9 names the owner and the handoff; section 12 lists the path.                                                                                |
| Review 2 important 1 — impossible expected output           | Yes. The bare grep prints three lines.                                                                                          | **Fixed.** Step 0 uses the anchored `rg` pattern, expecting exactly one line reading 22, and says what 20 and 19 each mean.                                                         |
| Review 2 important 2 — unresolved and duplicate bindings    | Yes. `sectionKey`'s caller at line 79; `PROJECT_KEY`'s declaration at line 87; the layout module's own calls at 28, 89 and 277. | **Fixed.** Step 7 names the permitted edits including the import and the old declaration; step 8 imports **and** re-exports; the settings modal's caller is rewritten, not aliased. |
| Review 2 important 3 — proof comments rewritten             | Yes.                                                                                                                            | **Fixed.** Section 3 quotes both verbatim; section 8 forbids rewording and requires a separate dated observation.                                                                   |
| Review 2 important 4 — incomplete standalone paths          | Yes.                                                                                                                            | **Fixed by the split.** Own prerequisites, own baselines, own proof set, own verification table, own completion checklist, own handoff.                                             |
| Review 2 carried critical 6 — delivery imports the resource | Yes: `gantt-detail.ts`, `project-page.tsx`, `theme.ts` and `project-settings-modal.tsx` are all React delivery.                 | **Fixed.** `preferences.feature.ts` is the facade; all four import it. Only `lib/remembered.ts` reaches the resource, and finding 2 records why.                                    |
| Review 2 carried critical 9 — executor-authored README      | Yes.                                                                                                                            | **Fixed.** Step 2 supplies the README body verbatim.                                                                                                                                |
| Review 2 carried important 3 — 010.3 permitted to be absent | Yes.                                                                                                                            | **Fixed.** Section 9 makes integrated 010.3 an explicit prerequisite.                                                                                                               |
| Review 2 carried important 4 — module typecheck owed        | Yes.                                                                                                                            | **Recorded** in [ASSUMPTIONS.md](ASSUMPTIONS.md) and finding 5 of part 1.                                                                                                           |
| Review 1 critical 7 — the project guard changed behaviour   | Yes. Lines 566 to 585 drop `''` today.                                                                                          | **Fixed.** The `unchecked` shape holds every string; two unit cases and one added oracle case pin it; proof 4 breaks it.                                                            |
| Review 1 important 1 — proof 10 could not detect its fault  | Yes.                                                                                                                            | **Fixed.** `composition.test.ts` imports the production instances in the fast tier (proof 7), and the adapter has its own jsdom suite (proof 8).                                    |
| Review 1 important 5 — the contract overstated recovery     | Yes.                                                                                                                            | **Fixed.** The port's JSDoc says access errors propagate and forbids catch-and-default; a test asserts a refusing store throws.                                                     |
| Executability: Nx daemon, commits, gate, restore, tools     | Yes, all five.                                                                                                                  | **Fixed.** Every Nx command carries `NX_DAEMON=false`; step 12 hands over; step 13 forbids the gate; section 8 restores by copy and `cmp`; stop condition 12 limits installs.       |

Nothing was rejected. One deviation from the main planner's instruction is recorded as finding 1:
this packet does not import the shared store contract, because it holds no snapshot.

### Third round, 2026-09-20: the batch execution contract

Folded in after the batch README gained its "Execution contract" and new standard blocks.

| Point                                                                   | Verified                                                                                                              | Action                                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| One executor at a time, in bounded slices with planner checkpoints      | Yes.                                                                                                                  | **Fixed.** Section 7 is two slices with their own completion checklists; section 13 is the two checkpoints.                        |
| Scratch, backups and fixtures under `$TMPDIR`; evidence as patches      | Yes.                                                                                                                  | **Fixed.** Step 0 records it and creates `$TMPDIR/evidence`; section 8 gives the save, patch, capture, restore and `cmp` commands. |
| Never mask a failure                                                    | Yes.                                                                                                                  | **Fixed** in section 8 and step 8, and asserted in the slice 2 checklist.                                                          |
| Bun's `-t` joins describe and title; zero matches reports success       | Yes. All four named devsync tests are top-level `test(...)` calls at lines 409, 420, 442 and 538, with no `describe`. | **Fixed.** Steps 2 and 8 state the verified structure and the expected count; a zero-match run is stop condition 13.               |
| `OPENSPEC_TELEMETRY=0` on every OpenSpec invocation                     | Yes.                                                                                                                  | **Fixed** in step 11's block.                                                                                                      |
| Network off                                                             | Yes.                                                                                                                  | **Fixed.** Section 7's preamble; an attempt to reach it is stop condition 15.                                                      |
| Prerequisites checked by artifact, not by a count another lane can move | Yes — the grill made this point about a README count of 20.                                                           | **Fixed.** Step 0 checks 040.3's and part 1's own feature files, and reads the pin as a second, weaker signal.                     |
| Only 020.8 appends to `openspec/changes/service-taxonomy/verify.md`     | Yes.                                                                                                                  | Already true here: step 12 sends evidence to the report and section 12 lists the path as out of lane.                              |
| Counts are relative to the packet's own start                           | Already true.                                                                                                         | Unchanged.                                                                                                                         |

Nothing in this round was rejected. One deviation from an instruction remains, recorded as
finding 1: this packet does not import the shared store contract, because it holds no snapshot.

### Third review, 2026-09-20 (Codex gpt-6-astra, high effort): dispatch after fixes, applied

Verdict: DISPATCH AFTER FIXES — slice 1 had two conflicts with the execution contract, and no
further dispatch blocker turned up in the preferences logic itself. The planner applied both fixes
by hand: steps 0, 3, 4 and 6, checkpoint A's checklist, step 10, checkpoint B's checklist, and the
verification tables no longer have the executor run the whole `wbs-fe-01:test:unit` or
`wbs-fe-01:test` target — the executor now runs the three preferences suites through a focused
Vitest command for both the collection-failure observation and the exact three-file/fifteen-test
green count, reruns the unchanged six-suite oracle in step 6, and reports both whole-target deltas
as pending planner verification at each checkpoint. The README pin is now recorded as N at step 0
rather than demanded as the absolute value 22, step 2 requires the pin to fail at exactly N+1
rather than the absolute 23, and stop condition 6 was updated to match. The planner also applied
two non-blocking corrections by hand: checkpoint A's stale "nine files"/"ten paths" wording is now
"twelve files"/"fifteen paths", matching section 5's own count, and step 12's hand-over now expects
slice 2's own six paths in `git status --short` rather than the packet's full twenty-one, since
slice 1's fifteen are already committed by the time slice 2 runs. These fixes are in place before
slice 2 is dispatched.

### Slice 1, 2026-09-20: a type error the packet caused, found by the planner

Slice 1 defers the type check to slice 2, so the executor could not see it: the planner's `wbs-fe-01:typecheck` on slice 1 failed at `remembered-layout.ts:462` and `:576`, `Remembered<string[]>` is not assignable to `Remembered<readonly string[]>`. This packet had prescribed the moved `Remembered<T>` interface with property-style members (`readonly write: (value: T) => void`), which are checked contravariantly; the original in `lib/remembered.ts` used method signatures, which are bivariant, and `remembered-layout.ts` relies on that. The planner restored the method signatures in the clone with a JSDoc saying why, and corrected the interface in this packet. Lesson for later packets: a slice that moves a type runs the type check in that slice.

### Slice 2, first attempt, 2026-09-20: stopped at proof 1, and what changed

Step 7 was done and step 8 mostly: the four delivery callers are moved, the project page gained its case, typecheck, lint, formatting and the four document checks passed. Proof 1 then failed its two named tests and a third, and the executor stopped on stop condition 3. That is the same packet defect packet 040.3 had: a fault that breaks one more reader than the two it names is still a fault the named tests caught. The condition now records extra failures instead of stopping on them, and the executor preamble says so for every packet. The attempt also left the builders' JSDoc unmoved, because the dispatch note allowed slice 1 files to change by proof comments only; step 8's move of that JSDoc into `preference-keys.ts` is part of this slice, and the hand-over expects it.
