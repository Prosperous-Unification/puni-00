# 040.4 Extract the plan feed: refresh owner, stream, roster

|                                               |                                                                                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item                                     | 040.4, parent 040 "DI Bag, caught-object-report-json, application-exception into the WBS frontend"                                                                                                                  |
| Size class                                    | L                                                                                                                                                                                                                   |
| Planning tokens (top model, high effort)      | 6,000,000                                                                                                                                                                                                           |
| Implementation tokens (mid model, mid effort) | 22,000,000                                                                                                                                                                                                          |
| Review tokens (top model, high effort)        | 9,000,000                                                                                                                                                                                                           |
| Design it serves                              | [Code organization design](../../specs/2026-09-19-code-organization-design.md), the `Plan feed` row of its proposed frontend services table, rules F1 and F2, and the project lifetime of its three-lifetimes table |
| Rollout task                                  | [Task 6](../2026-09-19-code-organization-rollout.md), service 2 of 6                                                                                                                                                |
| Execution contract                            | [batch 1 README](../2026-09-19-batch-1/README.md), sections "Execution contract", "Rules for every executor", "Hidden constraints every frontend packet must respect" and "Standard blocks every packet uses"       |
| Predecessor                                   | 040.3, merged: `apps/wbs/fe-01/src/modules/plan-writer/` exists and the hook already delegates every gesture to it                                                                                                  |

## 1. Goal and non-goals

**Goal.** Move the plan feed out of React: the refresh owner's lifetime, the stream it opens and
acknowledges, and the decision about which part of an owner snapshot has not been delivered yet.
They become one framework-free resource-service in a new module, `plan-feed`, which exposes the
store contract of rule F2 over the owner it manages. `usePlanRead` keeps the React half — the
twenty state setters, the tree drawing, the hover card, the drafts sanitizer — and wires the feed
to the plan writer 040.3 already extracted.

**Non-goals.** No behaviour change of any kind; an extraction that seems to need one is a stop
condition. No move of `apps/wbs/fe-01/src/lib/plan-refresh.ts`: the refresh owner is the feed's
repository and stays where it is. No move of `runMarkerWrite` (calendar markers service), of
`stepStack` (history and transfer service), of `settleAgainstSteps` or of `usePlanReadState`. No
move of `PlanReadScope` or of the scope-to-resources mapping — section 4.9 says why. No presence
roster — section 4.8 says why. **No DI Bag module.** DI Bag 0.4.0 is installed at the root (batch 1,
packet 020.1), and composing these services through it is the rollout's lifetimes task, Task 6
order 6; until then the host builds the service with a plain factory call, exactly as the merged
plan-writer module does. No rewiring of `apps/wbs/fe-01/src/lib/plan-refresh-stream.test.ts`, which
re-implements this wiring in a fixture; that is a finding in section 4.10 and belongs to a later
packet.

## 2. Read first

| Read                                                                                                                       | Why                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                                                                                                | Rules R1 to R5. R5 governs every `Proof:` comment this packet moves.                                                     |
| `LLM_README.md`                                                                                                            | R1: the index first, then only the link the task needs.                                                                  |
| [batch 1 README](../2026-09-19-batch-1/README.md)                                                                          | The execution contract and the standard blocks. The node-tier word list in "Hidden constraints" is load-bearing here.    |
| [Code organization design](../../specs/2026-09-19-code-organization-design.md)                                             | Module layout, rules F1 and F2, the three lifetimes, the `Plan feed` row.                                                |
| [Rollout plan](../2026-09-19-code-organization-rollout.md), Task 6                                                         | The six bullets of the extraction procedure, and the order that puts the feed second.                                    |
| [040.3 packet](../2026-09-19-batch-1/040-3-plan-writer.md)                                                                 | The shape this packet follows, and what the writer already abstracts from the feed.                                      |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`                                                                       | The source. Everything this packet moves is between `ownerRef` and `refreshOrMarkStale`.                                 |
| `apps/wbs/fe-01/src/lib/plan-refresh.ts`                                                                                   | `PlanRefresh`, `PlanRefreshSnapshot`, `ResourceRead`, `DirectoryRead`, `RefreshResource`, `resourcesFor`.                |
| `apps/wbs/fe-01/src/lib/project-stream.ts`                                                                                 | `ProjectStream`: two methods, `seen` and `unsubscribe`.                                                                  |
| `apps/wbs/fe-01/src/modules/store.ts`                                                                                      | The `Store<T>` contract rule F2 requires, which this module implements.                                                  |
| `apps/wbs/fe-01/src/modules/plan-writer/contract.ts`                                                                       | `PlanWriterHost.readRefreshOwner` — the seam the hook wires the two services through.                                    |
| `apps/wbs/fe-01/src/modules/directory/directory.resource.ts` and its `README.md`                                           | The house shape of a frontend resource-service module landed by batch 1.                                                 |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx`                                                           | The oracle. `describe('refresh owner lifetimes')` and `describe('overlapping resource invalidations')` are the feed's.   |
| `apps/wbs/fe-01/src/components/wbs/project-page.test.tsx`                                                                  | Holds `recovers a persistent %s without replacing the registered socket`, the only test that counts sockets.             |
| `apps/wbs/fe-01/vitest.node-suites.ts`, `apps/wbs/fe-01/vitest.node.config.ts` and `apps/wbs/fe-01/src/test-tiers.test.ts` | How a suite joins the fast node tier — the config's `include` **is** the list — and the guard that refuses a stale list. |
| `apps/wbs/fe-01/project.json`                                                                                              | The real target names.                                                                                                   |
| `openspec/specs/plan-refresh/spec.md`                                                                                      | The accepted specification this extraction must not disturb. Section 10 quotes the two requirements.                     |

## 3. Interfaces

Every code block in this section, and every one in section 7, was written into a clone of this
worktree on 2026-09-20, type-checked, linted and run. Section 4.11 records what was observed. The
executor is transcribing rehearsed code, not drafting it.

### 3.1 `apps/wbs/fe-01/src/modules/plan-feed/contract.ts`

This is the complete file. Write it exactly as given.

```ts
import type {
  DirectoryRead,
  PlanRefresh,
  PlanRefreshSnapshot,
  RefreshResource,
} from '@/lib/plan-refresh';
import type { ProjectStream } from '@/lib/project-stream';
import type { CalendarMarkerView, PlanRead, StepView } from '@/lib/wbs-api';
import type { Store } from '@/modules/store';

/**
 * How far each resource has been delivered to whoever is drawing the plan.
 *
 * Per resource and not one number for the feed, because the four are read
 * separately and land in any order: a held directory read may arrive after a
 * newer tree has already installed, and it is still the newest directory
 * anybody has. Zero is "nothing delivered yet", which is what a generation
 * counter that starts at one makes safe.
 */
export interface AppliedGenerations {
  readonly tree: number;
  readonly steps: number;
  readonly directory: number;
  readonly markers: number;
}

/**
 * What one publication of the feed has for its reader, and nothing it has
 * already had.
 *
 * A **delta**, computed from the store snapshot below and the generations the
 * reader has applied. Each installed member is null when that resource has
 * nothing new, so a reader applies exactly what moved and leaves the rest of
 * the screen alone. Null means "unchanged", never "empty".
 */
export interface PlanFeedDelivery {
  readonly staleResources: readonly RefreshResource[];
  readonly failureSentence: string | null;
  readonly directory: DirectoryRead | null;
  readonly tree: { readonly value: PlanRead; readonly generation: number } | null;
  readonly steps: readonly StepView[] | null;
  readonly markers: readonly CalendarMarkerView[] | null;
}

/** A refusal this feed owes the reader, in the sentence the reader is owed. */
export interface PlanFeedRefusal {
  readonly sentence: string;
}

/**
 * What the feed's stream tells it.
 *
 * Declared here rather than imported from the plan read hook, which exports a
 * structurally identical `SubscriptionHandlers`: a service does not import from
 * its delivery. The two are assignable in both directions, which is what lets
 * the host pass this object straight to the hook's `subscribe` prop.
 */
export interface PlanFeedStreamHandlers {
  /** See `ProjectStreamOptions.onChange`: what the frame said changed, or `null`. */
  onChange: (changed?: string | null, seq?: number) => void;
  onConnectionChange: (connected: boolean) => void;
}

/**
 * What the plan feed needs from whoever is hosting it.
 *
 * Every member is a function for {@link PlanWriterHost}'s reason: all of them
 * are read at the moment something happens, not at the moment the feed is
 * built. A reader can leave for another project between a read starting and its
 * answer arriving, and the feed is still alive when it does.
 */
export interface PlanFeedHost {
  /**
   * Builds the refresh owner this feed's lifetime is about.
   *
   * A port and not a direct call to `createPlanRefresh`: the project and the
   * API it is keyed by are the host's knowledge, and a unit test needs an owner
   * it can drive without a transport.
   */
  readonly openOwner: () => PlanRefresh;
  /**
   * Whether this feed still owns the screen: the same project and the same API
   * it was opened for.
   *
   * Separate from the feed being closed, and both are needed. A render can
   * install new props before the effect that closes this feed has run, and work
   * already in flight must know it no longer owns the table by then.
   */
  readonly isActiveReader: () => boolean;
  /** Opens the live subscription, or null when this reader has no socket. */
  readonly openStream:
    ((handlers: PlanFeedStreamHandlers, baseline: number) => ProjectStream) | null;
  /**
   * Hands the reader everything that changed since the last publication.
   *
   * A push and not a selector, because this reader is twenty `useState` values
   * and two refs mutated in the same pass. It is derived from the same snapshot
   * the store below answers with, so there is one source of truth and two ways
   * of reading it: this one for the reader that exists, the store for every
   * reader the lifetimes task builds.
   */
  readonly publish: (delivery: PlanFeedDelivery) => void;
  /** Says whether the socket carrying other people's changes is up. */
  readonly setConnected: (connected: boolean) => void;
  /** Announces one refusal to whoever says things to the reader. */
  readonly announceRefusal: (refusal: PlanFeedRefusal) => void;
}

/**
 * One project's feed: the plan is read through it, and it is what decides when
 * to read again — the socket's events, a write's own answer, and the project
 * changing under the reader.
 *
 * A **resource**-service of the project lifetime. Framework-free by rule F1: it
 * imports no React and says nothing to anybody itself. Rule F2 is met by
 * extending {@link Store}: `subscribe` and `snapshot` are the owner's own, and
 * the owner rebuilds its snapshot object only when something in it changed,
 * which is the stability rule.
 */
export interface PlanFeed extends Store<PlanRefreshSnapshot> {
  /**
   * The refresh owner of this lifetime.
   *
   * Exposed, rather than kept private, because two callers still reach it
   * directly and this packet moves neither: the plan writer compares its
   * **identity** to decide whether the gesture it began still belongs to the
   * reader on screen, and the marker write invalidates the marker resource on
   * it. Both leave with their own services in later packets; until then,
   * handing out the owner is what keeps this extraction behaviour-free.
   */
  readonly owner: PlanRefresh;
  /**
   * Reads these resources again, awaiting the covering outcome.
   *
   * Failures are not thrown: they stay in the owner's snapshot and reach the
   * screen as the stale banner on the next publication. The host decides whether
   * the caller is still entitled to ask; this answers the narrower question of
   * what asking means when no baseline has been anchored yet.
   */
  readonly rereadResources: (resources: readonly RefreshResource[]) => Promise<void>;
  /** Ends this lifetime: stop listening, dispose the owner, drop the stream. */
  readonly close: () => void;
}
```

Nothing is re-exported from this file. A reader that needs `PlanRefresh`, `PlanRefreshSnapshot` or
`RefreshResource` names `@/lib/plan-refresh`: this repository refuses barrels that forward another
module's types (`wbs-table.tsx`, the comment above its two-name re-export).

### 3.2 `apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.ts`

Public surface: `createPlanFeed(host: PlanFeedHost): PlanFeed` and
`nextDelivery(snapshot, applied)`. The second is exported because it is the whole of the generation
ledger and has its own unit tests; nothing outside the module imports it.

### 3.3 What does not change

`usePlanRead`'s parameter object and its return object
(`{ refreshOrMarkStale, run, stepStack, runMarkerWrite }`), `SubscriptionHandlers`,
`PlanReadScope`, `WbsTableProps`, `PlanRefresh`, `createPlanRefresh`, `ProjectStream`, and every
export of `plan-writer/contract.ts`. So `wbs-table.tsx`, `project-page.tsx`, `plan-toolbar.tsx` and
`use-plan-dependencies.ts` are **not** edited.

## 4. Verified facts

Everything below was read or run in the worktree `batch-2/planning` at head `6484986e` on
2026-09-20. **Line numbers are not given as targets.** `main` has moved since (dev deploy
cut-over, MCP OAuth logging, large-plan scrolling) and will be merged into the batch before this
packet runs, so every anchor here is a symbol name or a quoted line of code, and the executor
locates it by content. Every count is recorded by the executor in its own step 0 and compared
relatively.

### 4.1 What main changed, and what it did not

`git show origin/main:apps/wbs/fe-01/src/components/wbs/use-plan-read.ts` differs from this
worktree's copy in four hunks, **all** of them the plan writer's extraction (the React import, the
refusal imports, the `run` callback and the return statement). Main touched no part of the feed:
not `applySnapshot`, not the subscription effect, not either refresh callback. Main's
`project-page.tsx` still holds the roster in the same `useState` and the same `subscribe` factory,
three lines further down. Main added `src/components/wbs/plan-viewport.test.ts` to the node tier,
which moves the tier's totals and nothing this packet depends on.

### 4.2 What is left in the hook, and what of it is the feed

| Symbol                        | This packet                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `ownerRef`, `activeApi`       | `ownerRef` becomes `feedRef`; `activeApi` is untouched                        |
| `settleAgainstSteps`          | stays: it edits estimate drafts and held refusals, which are view state       |
| `applySnapshot`               | splits: the generation ledger moves, the twenty setters stay as `publishPlan` |
| the subscription effect       | moves, whole                                                                  |
| `refreshResourcesOrMarkStale` | the owner policy moves; the reader guard stays (section 4.6)                  |
| `refreshOrMarkStale`          | stays (section 4.9)                                                           |
| `runMarkerWrite`              | stays; two lines change because `ownerRef` is gone                            |
| the plan writer's `useMemo`   | stays; one line changes for the same reason                                   |
| `stepStack`                   | stays; two lines change for the same reason                                   |

The effect opens `const owner = createPlanRefresh({ projectId, api });` and closes with the
dependency array `[activeProject, api, projectId, applySnapshot, pushToast, setConnected, subscribe]`.
`applySnapshot`'s first two statements set the stale flag and the failure sentence, then comes the
baseline gate, then four blocks each opened by an `installed.generation > applied.<resource>` test,
in the order directory, tree, steps, markers.

### 4.3 The five `Proof:` comments that move with the code

Each moves into the moved statement's new position, verbatim, and each is re-observed in slice 5
against the moved code. R5: a proof comment is never carried across a move unwatched.

| Where today, by its first words                                     | Lands in         | Re-observed as |
| ------------------------------------------------------------------- | ---------------- | -------------- |
| `suppressing this failure text left the peer-refetch window …`      | `nextDelivery`   | proof 4        |
| `removing this gate exposed a textarea instead of null …`           | `nextDelivery`   | proof 3        |
| `reusing the disposed owner left zero subscriptions instead of one` | `createPlanFeed` | proof 8        |
| `restoring epoch replacement opened two sockets instead of one …`   | `createPlanFeed` | proof 1        |
| `using the bare failure code here left the unavailable-plan …`      | `createPlanFeed` | proof 6        |

Three further `Proof:` comments inside `applySnapshot` (the hover card pair, the slices, and the
`estimateMethod` rename) belong to the **setters**, which stay in the hook. They do not move and
are not re-observed.

### 4.4 The guards with no test, which is why this packet adds a unit suite

The four generation comparisons are the feed's most important decision and no existing suite
separates them from the code around them. Two DOM tests exercise the held-read case —
`installs held directory labels after a newer tree already installed` and
`installs a held renamed step with competing tree=%s` — but both watch a payload that **is** newer
than what was applied, so removing the comparison leaves them green: applying a payload twice is
invisible to them. The same is true of the effect-level `isCurrent()` in `apply`: when the API prop
changes, the cleanup disposes the old owner, and a disposed owner publishes nothing
(`plan-refresh.ts`, `publish` returns early when disposed), so no DOM case reaches that guard
through a live owner.

This is the coverage gap 040.3 hit for its success-path guard, which became the twenty-ninth entry
of `docs/findings/checks-that-cannot-fail-puni-00.md`. The answer is the same: the moved code gets
a node-tier suite that can fail, written before the move, and each such guard's negative is watched
through it. Section 8 records the failure every one of them actually produced.

### 4.5 What the writer already abstracts, and what the hook must therefore keep

`plan-writer/contract.ts` declares `readRefreshOwner: () => PlanRefresh | null` and the service
uses the answer **only** for identity comparisons — its `isCurrent` and the post-landing pair
check. So the feed exposes the owner and nothing changes on the writer's side: the hook's port
becomes `() => feedRef.current?.owner ?? null`. `plan-writer.feature.ts` is **not** edited.

`runMarkerWrite` and `stepStack` read `ownerRef.current` the same way, and `runMarkerWrite` also
calls `owner.invalidate({ resources: ['markers'] })` on it directly. Both get the same two-line
substitution and stay where they are.

### 4.6 Why the reader guard stays in the hook's reread callback, and what that is worth

`refreshResourcesOrMarkStale` opens with
`if (owner === null || activeProject.current !== projectId || activeApi.current !== api) return;`.
`projectId` and `api` there are **the render that built the callback's**, because its dependency
array is `[activeProject, api, projectId]`. A departed caller's callback therefore compares the
live refs against its own project and API, sees they have moved, and returns.

If that guard moved into the feed, a departed caller would reach `feedRef.current`, which is the
**replacement** feed, whose `isActiveReader` compares the live refs against its own project and API
— both current — and the reread would run against the new owner. The plan writer never reaches it
(it checks `isCurrent()` first on both paths), but `plan-toolbar.tsx`'s
`recoverAmbiguousSettingsChange` calls `refreshOrMarkStale()` with no guard of its own. So the
guard stays where it is, unchanged, and the feed's `rereadResources` holds only the owner policy.

**Measured, and it is a finding.** With the guard weakened to `if (feed === null) return;` in the
rehearsal of section 4.11, `src/components/wbs/plan-read-and-write.test.tsx` passed **88 of 88**.
No test in that suite separates this guard from the code around it. It is unchanged code, so R5
asks nothing new of it, and an extraction keeps what it cannot prove is safe to drop — but the gap
is real and belongs in [checks that cannot fail](../../../findings/checks-that-cannot-fail.md) as a
finding. The packet does **not** claim a negative for it, and the executor is not asked to produce
one.

### 4.7 Rule F2 is met, by the store the owner already is

`apps/wbs/fe-01/src/modules/store.ts` declares `Store<T>` with `subscribe` and `snapshot`, and the
`service-taxonomy` change's delta spec carries it as a requirement with its own scenario
(`F2 stateful services expose one store contract`). `PlanFeed` extends
`Store<PlanRefreshSnapshot>`, and the two members are one line each:

```ts
subscribe: (onChange) => owner.subscribe(onChange),
snapshot: () => owner.getSnapshot(),
```

The stability rule holds because `plan-refresh.ts` rebuilds its snapshot object once per
publication, inside `publish`, and answers the same object from `getSnapshot` until then. A unit
test pins both halves: the same object on two reads, a different object after a publication, and
the subscriber woken exactly once.

The `publish` port stays beside the store, and it is not a second contract: the delivery is
`nextDelivery(snapshot, applied)` over that same snapshot. Today's only reader is twenty React
states and two mutated refs, so it takes a delta; every reader the lifetimes task builds takes the
store. The README says this in as many words.

### 4.8 The roster is not in this hook

The work item's title names the roster. It is **not** in `use-plan-read.ts`: it is
`const [roster, setRoster] = useState<Roster>({ users: [], connected: false });` in
`project-page.tsx`, filled by the `onPresence` and `onConnectionChange` handlers of the `subscribe`
factory beside it and handed to the header. The design's "wired in three places today" is that
factory, this hook's effect, and the fixture in `lib/plan-refresh-stream.test.ts`.

**Recorded assumption.** The roster stays in `project-page.tsx`. Moving it would edit the page's
state, its `subscribe` prop contract and
`hands the presence slot the roster, and an empty one before any socket`, none of which this
extraction needs; the feed never sees a presence frame, because `subscribe` is handed to the table
as an opaque factory. It moves when the application lifetime's stream connector is built — the
`Stream connector` row of the design's own table — and this packet's contract is shaped so the feed
never has to learn about it.

### 4.9 `PlanReadScope` stays, and so does the scope mapping

`PlanReadScope` is declared in `use-plan-read.ts` with the long JSDoc explaining why two of its
three values are sound, and it is imported by `plan-toolbar.tsx` and `use-plan-dependencies.ts`.
Moving it into the module would edit both of those files — which belong to work item 040.5, not to
this batch — or add a re-export through `use-plan-read.ts`, and the repository rejects that shape in
as many words: "a table acting as a barrel for modules it no longer owns is the shape this split was
for". So the type and the five-line mapping in `refreshOrMarkStale` stay, and the feed's surface is
`rereadResources` only.

### 4.10 A fixture re-implements the wiring, and this packet leaves it alone

`lib/plan-refresh-stream.test.ts` builds the owner, subscribes, opens a `subscribeToProject` stream
on the first baseline and forwards `seen` — the same policy this packet extracts, written a second
time. A real duplication and a real finding, recorded here. It is **not** edited: rewriting that
fixture onto `createPlanFeed` would change what the two "real API and stream" cases prove while this
extraction is being judged.

### 4.11 The whole extraction was rehearsed, and these are the numbers

On 2026-09-20 the planner wrote every file of section 3 and section 7 into this worktree, rewired
the hook exactly as slice 4 prescribes, ran the checks below, then restored the tree and proved the
restoration with `cmp` on all three edited files and a clean `git status --short`.

| Check                                                                                                | Observed                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `bunx eslint apps/wbs/fe-01/src/modules/plan-feed` and the rewired hook                              | Exit 0, no output                                 |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                                    | Exit 0                                            |
| The module's own suite, node tier                                                                    | `Test Files 1 passed (1)`, `Tests 16 passed (16)` |
| The sandbox unit command, before the module existed                                                  | `38 passed (38)` files, `575 passed (575)` tests  |
| The sandbox unit command, with the module                                                            | `39 passed (39)` files, `591 passed (591)` tests  |
| `plan-read-and-write.test.tsx`, `project-page.test.tsx`, `optimization-integration.test.tsx`, before | `3 passed (3)`, `167 passed (167)`, 39 s          |
| The same three, with the hook rewired                                                                | `3 passed (3)`, `167 passed (167)`, 55 s          |

**The extraction is behaviour-free against the oracle, measured, not argued.** The unit delta the
rehearsal produced is one file and sixteen tests: four for the ledger, twelve for the feed. These
absolute numbers are orientation only — main has moved since — and every comparison the executor
makes is against its own step 0.

### 4.12 The README count pin, and the packet that removes it

`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` pins `applicationLibraryToolReadmes` at a
literal, above five re-pin comments, four of them written by batch 1's frontend packets. A new
module README moves that number by one, and the failure appears as soon as the file exists, because
the count comes from `git ls-files` including untracked files.

Batch 2's packet 110.6 replaces that pin with a derived enumeration and a test named
`the current-document sweep reaches every application, library and tool README`. **110.6's own
section 11 asks to land first**, and says that in that case "040.4 no longer needs its branch A at
all". This packet adopts that: **branch B is the expected path**, branch A is the fallback, and
neither hardcodes a number — step 1.4 records the literal it finds and requires that literal plus
one.

### 4.13 Targets, tiers and the node-tier word list

From `apps/wbs/fe-01/project.json`: `test`, `test:unit`, `lint`, `lint:fast`, `typecheck`, `build`,
`e2e`, `e2e-packaged`, `serve`, `serve-local-solver`. The `lint` target lists `apps/wbs/fe-01/src`
explicitly and `tsconfig.app.json` includes `src/**/*.ts`, so new files under `src` are linted and
type-checked with no project file edit. **This packet adds no Nx target**, so it owes nothing to the
`CLAUDECODE=0` and `AGENT=0` defaults a fix branch adds to every test-running target name, and
nothing to the graph-walking guard in `tools/tool-devsync/src/workspace-targets.test.ts`.

`vitest.node.config.ts` sets `include: [...NODE_SUITES]`. A suite that is not in the list **cannot
be run** by the node tier, even by naming it on the command line: the rehearsal observed
`No test files found, exiting with code 1` with the file present and unlisted.
`src/test-tiers.test.ts` separately refuses a list that names a file which does not exist, that
disagrees with what the directory holds, or that breaks the tier partition. The two together are
why the file and its list entry land in the **same** slice.

That guard also refuses a node-tier suite whose own text matches
`/@testing-library|\bdocument\b|\bwindow\b|\blocation\b|WebSocket|localStorage|matchMedia|getComputedStyle|HTMLElement|\bnavigator\b|jsdom/`,
and a node-tier suite must be `.ts`, not `.tsx`. The suite below never says "window", "document" or
"WebSocket"; it says interval, page and socket. `react-hooks/exhaustive-deps` is a **warning** here
(`eslint-plugin-react-hooks` 7.1.1, `recommended-latest`) and `bunx eslint` runs without
`--max-warnings`, but every dependency array below is one its closure genuinely reads.

## 5. Unknowns

| #   | Unknown                                                                                               | Resolution                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Whether `createPlanFeed` subscribing and initializing **before** the host stores it changes anything. | **Resolved by the rehearsal**: the oracle is 167 of 167 either way. Nothing reads the feed during that synchronous interval; the callers are React state setters. |
| 2   | Whether the four generation comparisons are unpinned by the DOM suites.                               | **Resolved**: section 8 records what each mutation actually failed. The unit suite catches all four; the DOM suites do not.                                       |
| 3   | Whether `wbs-fe-01:test` passes in full after main is merged, and what its two summaries say.         | Planner-only. The executor records the sandbox unit command and the DOM oracle in its own step 0 and compares against those.                                      |
| 4   | Whether 110.6 has already derived the README pin.                                                     | Step 1.4 reads the pin and follows one of two named branches. Neither is a stop. 110.6 landing first is the expected case.                                        |
| 5   | Whether any batch 2 packet renames the oracle's test titles.                                          | **Resolved**: 110.1 selects the backend `project-assignment-reads` capability and cites its identifiers in backend assignment tests. It renames nothing here.     |

## 6. File plan

| File                                                         | Action  | Responsibility                                                                    |
| ------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------- |
| `apps/wbs/fe-01/src/modules/plan-feed/README.md`             | created | Wiki index: purpose, what it owns, what it refuses to own, how it is read, checks |
| `apps/wbs/fe-01/src/modules/plan-feed/contract.ts`           | created | The exported service types and the host requirements                              |
| `apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.ts` | created | The resource-service: owner lifetime, stream, acknowledgement, generation ledger  |
| `apps/wbs/fe-01/src/modules/plan-feed/plan-feed.test.ts`     | created | The module's unit suite: node tier, fake owner, fake stream, no browser           |
| `apps/wbs/fe-01/vitest.node-suites.ts`                       | edited  | One new entry, in slice 2, beside the file it names                               |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`         | edited  | The effect becomes a feed; `applySnapshot` becomes `publishPlan`; `ownerRef` goes |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`    | edited  | One line: the README count pin, **only on branch A of step 1.4**                  |

Seven files, or six on branch B, which is the expected case.

**Neighbouring batch 2 packets.** 110.6 owns the whole of `repo-namespacing-handoff.test.ts` and
asks to land before this packet; step 1.4 handles either order. 110.1 adds level targets to project
files and cites scenario identifiers in the **backend** `project-assignment-reads` capability — it
touches no file here and renames no test this packet names. 040.1 works in `apps/wbs/fe-01/e2e`,
`apps/wbs/fe-01/tsconfig.spec.json` and a root-level test file, not in `src/modules` or the hook.
040.5 (command services) edits this same hook next and is not in this batch: leave
`refreshOrMarkStale`, `PlanReadScope`, `plan-toolbar.tsx` and `use-plan-dependencies.ts` exactly as
they are. 010.6, 010.7, 020.2 and 020.7 touch the Bureaucrat and the backend and share no file.

## 7. Slices

Six slices. Each is dispatched on its own, starts with step 0, ends green, and carries its own
commit subject and path list so the planner can commit it before the next begins.

**Planner prerequisite.** `puni-plan/exec/run-executor.sh` builds its packet path from
`docs/superpowers/plans/2026-09-19-batch-1/` and exits 69 when the file is absent, so it cannot
dispatch this packet as written. A batch-2-capable launcher — one that takes the batch directory,
selects and hashes `docs/superpowers/plans/2026-09-20-batch-2/040-4-plan-feed.md`, and records it in
the ledger — is a prerequisite for slice 1, along with its exact invocation for each of the six
slices below.

### Step 0 — Baseline, at the start of every slice

Nothing is edited in this step.

- [ ] `git rev-parse HEAD` and `git status --short --untracked-files=all`. Record both. This is
      **this slice's** starting status; slice 6 compares against it. Earlier slices are expected to
      be committed already, so their files are not in it.
- [ ] Run the **sandbox unit command** and record its `Test Files` and `Tests` lines:

```sh
(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
  --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts)
```

Expected: exit 0. Call the two numbers **F0** and **T0** for this slice. Every expectation below is
relative to this slice's own F0 and T0. **Never** run `wbs-fe-01:test:unit` or `wbs-fe-01:test`:
three of their tests spawn `bun` from Node and the sandbox refuses that with `spawnSync bun EPERM`.

- [ ] In slices 4, 5 and 6 only, also record the DOM oracle, which is what says the extraction
      changed nothing:

```sh
(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
  src/components/wbs/plan-read-and-write.test.tsx)
(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
  src/components/wbs/project-page.test.tsx src/components/wbs/optimization-integration.test.tsx)
```

Expected: exit 0 from both. Record both summaries; call them **D1** and **D2**. For orientation
only, the planner saw 88 tests in the first and 79 in the second on 2026-09-20, before main was
merged.

### Slice 1 — The contract and the README

Commit subject: `feat(wbs-fe): add the plan feed module's contract and index`. Paths:
`apps/wbs/fe-01/src/modules/plan-feed/contract.ts`,
`apps/wbs/fe-01/src/modules/plan-feed/README.md`, and on branch A
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`.

- [ ] `mkdir -p apps/wbs/fe-01/src/modules/plan-feed`
- [ ] Write `contract.ts` exactly as section 3.1 gives it.
- [ ] Write `README.md` with this content. Leave it free of Markdown links and give it no
      `module-index` comment, for 040.3's reasons: every relative link in a current document is
      resolved by the devsync checks, and a module identity needs `docs/wiki-policy/modules.json`,
      which is out of lane.

```markdown
# Plan feed

One project's reading of the plan: the refresh owner of this project and API lifetime, the live
subscription it opens once an anchor exists, the sequence it acknowledges, and the decision about
which part of an owner snapshot the reader has not been given yet.

The service is plain TypeScript and imports no React, which is rule F1 of the code organization
design in `docs/superpowers/specs/2026-09-19-code-organization-design.md`. It is a
resource-service of the project lifetime: one aggregate — the plan as this browser holds it — its
staleness, its refresh and its replay, and no gesture of any kind.

## What it owns

- The refresh owner's lifetime: built for one project and one API, closed with them.
- Opening the stream exactly once, when the first anchored read has landed, at that anchor's
  sequence; and never opening a second one during a recovery.
- Acknowledging a covered sequence to the stream, and only ever forwards.
- Routing what a frame said changed: an unsequenced frame asks for a fresh baseline, a named one
  asks for the resources it names.
- The generation ledger: which of the four resources has something the reader has not had, and
  the rule that nothing below the anchor is published before the anchor is.
- The sentence a failed tree read is owed, and the refusals of the very first read.
- What "read again" means when nothing is anchored yet and something is stale.

## What it does not own

Anything React holds. The rows, the chart payload, the vocabularies, the undo stack, the estimate
drafts and the hover card are the plan read hook's, and it applies each delivery to them. Gestures
belong to the plan writer beside it. Presence stays with the page that renders the header.

## How it is read

Two ways, over one source of truth. The store contract of rule F2 — `subscribe` and `snapshot`,
the refresh owner's own, whose snapshot object is rebuilt only when something in it changed — is
what any future reader selects from. Beside it, the host is handed a **delivery**: what changed
since the last publication, computed from that same snapshot and the generations already applied.
Today's reader is twenty React states and two refs mutated in one pass, so it takes the delta;
turning it into a selected snapshot is the lifetimes task of the rollout plan, not an extraction.

## Relationships

The exported types are in `contract.ts`; the service is `plan-feed.resource.ts`. There is no
`module.ts`: DI Bag is installed but nothing in this application is composed through it yet, which
is the rollout's lifetimes task, so the host builds the service with a plain factory call. Its one
host today is `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, which also wires this feed to
the plan writer module beside it: the writer compares the owner's identity and sends its rereads
back through the hook.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's own suite is
`plan-feed.test.ts`. The behaviour this extraction preserves is proved by the plan table's and the
project page's own suites, which run in the `test` target of the same project.
```

- [ ] **Step 1.4, the pin.** Read it, without assuming a number:

```sh
grep -nE '^[[:space:]]*applicationLibraryToolReadmes: [0-9]+,$' \
  tools/tool-devsync/src/repo-namespacing-handoff.test.ts
```

**Branch B — the command prints nothing** (the expected case: 110.6 landed first). Do not edit
`repo-namespacing-handoff.test.ts`; it leaves the file plan. Confirm the derived check exists and
passes with the new README present:

```sh
bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
  -t '^the current-document sweep reaches every application, library and tool README$'
```

Expected: `1 pass`, `0 fail`. `0 tests` or `matched 0 tests` means neither the pin nor the derived
check is there: stop and report.

**Branch A — the command prints exactly one line.** Record the number it shows; call it **N**.
First watch the pin fail, running that one test by name and never the whole file, which also holds
the index checker:

```sh
bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
  -t '^every legacy source occurrence and relevant text family is pinned$'
```

Expected before the re-pin: that one test fails, its diff naming `applicationLibraryToolReadmes`
with received **N + 1** against expected **N**. Record the message. Then change the literal to
**N + 1** and add one comment in the house style directly above the line, below the ones already
there:

```ts
// Re-pinned <N> -> <N + 1> for `apps/wbs/fe-01/src/modules/plan-feed/README.md`, the plan feed's
// module index, which the sweep must cover like any application README.
```

Rerun the same named test: expected `1 pass`, `0 fail`. Nothing else in that pinned object moves —
`categories`, `occurrences`, `digest` and `unclassified` are built only from source and
configuration paths, and the predicate behind them rejects every `.md`. If one of them moves, stop.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0. This slice declares the types every
      later slice implements against; a variance mistake is cheapest to find now.
- [ ] Lint and format this slice's files, then check the repository. Every checkpoint does this,
      because the planner commits it with hooks enabled and lefthook runs ESLint and a Prettier
      check over the staged files:

```sh
bunx eslint apps/wbs/fe-01/src/modules/plan-feed
bunx prettier --write \
  apps/wbs/fe-01/src/modules/plan-feed/README.md \
  apps/wbs/fe-01/src/modules/plan-feed/contract.ts
NX_DAEMON=false bunx nx format:check --all
```

On branch A add `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` to the write list.
Expected: ESLint prints nothing and exits 0; Prettier prints one line per file; the repository check
exits 0 or names only files outside this packet, which are reported and left alone.

- [ ] The sandbox unit command → exit 0, **F0** files and **T0** tests. This slice adds no suite.

**Stop after slice 1.** Checkpoint A.

### Slice 2 — The generation ledger, red then green

Commit subject: `feat(wbs-fe): decide what the plan feed has to deliver`. Paths:
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.ts`,
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.test.ts`, `apps/wbs/fe-01/vitest.node-suites.ts`.

- [ ] Write `apps/wbs/fe-01/src/modules/plan-feed/plan-feed.test.ts` with the header and the first
      `describe` below. Slice 3 widens the import list and appends the second block. **No word of
      this file may match the node-tier evidence pattern of section 4.13.**

```ts
import { describe, expect, it } from 'vitest';

import type { DirectoryRead, PlanRefreshSnapshot } from '@/lib/plan-refresh';
import type { CalendarMarkerView, StepView } from '@/lib/wbs-api';
import { planRead } from '@/testing/views';

import type { AppliedGenerations } from './contract';
import { nextDelivery } from './plan-feed.resource';

/** A resource nobody has read. */
const NOTHING_READ = { desired: 0, reading: false, installed: null, failure: null };

/** A resource whose newest read installed `value` at `generation`. */
function installedAt<T>(value: T, generation: number) {
  return { desired: generation, reading: false, installed: { generation, value }, failure: null };
}

/** An owner snapshot with nothing read, and the parts a case cares about laid over it. */
function snapshotOf(over: Partial<PlanRefreshSnapshot> = {}): PlanRefreshSnapshot {
  return {
    tree: NOTHING_READ,
    steps: NOTHING_READ,
    directory: NOTHING_READ,
    markers: NOTHING_READ,
    staleResources: [],
    baseline: null,
    acknowledged: -1,
    ...over,
  };
}

const ANCHORED = { seq: 7, epoch: 1 };
const NOTHING_APPLIED: AppliedGenerations = { tree: 0, steps: 0, directory: 0, markers: 0 };
const VOCABULARY: DirectoryRead = {
  teams: [],
  tags: [],
  services: [],
  workItemTypes: [],
  externalSystems: [],
  people: [],
};
const STEPS: readonly StepView[] = [{ id: 's1', name: 'Build' }];
/**
 * Empty, and that is enough: these cases are about **which** payload a delivery
 * carries and about the identity of the object it carries, never about what is
 * in it. A marker literal would also have to satisfy the colour and date fields
 * the view type requires, which prove nothing here.
 */
const MARKERS: readonly CalendarMarkerView[] = [];

describe('what the plan feed has to deliver', () => {
  it('carries no installed resource before an anchor exists', () => {
    const plan = planRead({ seq: 3 });
    const { delivery, applied } = nextDelivery(
      snapshotOf({ tree: installedAt(plan, 1), staleResources: ['steps'] }),
      NOTHING_APPLIED,
    );

    expect(delivery.tree).toBeNull();
    expect(delivery.staleResources).toEqual(['steps']);
    expect(applied).toEqual(NOTHING_APPLIED);
  });

  it('carries each generation exactly once', () => {
    const plan = planRead({ seq: 3 });
    const snapshot = snapshotOf({
      baseline: ANCHORED,
      tree: installedAt(plan, 1),
      steps: installedAt(STEPS, 1),
      directory: installedAt(VOCABULARY, 1),
      markers: installedAt(MARKERS, 1),
    });

    const first = nextDelivery(snapshot, NOTHING_APPLIED);
    expect(first.delivery.tree).toEqual({ value: plan, generation: 1 });
    expect(first.delivery.steps).toBe(STEPS);
    expect(first.delivery.directory).toBe(VOCABULARY);
    expect(first.delivery.markers).toBe(MARKERS);

    const second = nextDelivery(snapshot, first.applied);
    expect(second.delivery.tree).toBeNull();
    expect(second.delivery.steps).toBeNull();
    expect(second.delivery.directory).toBeNull();
    expect(second.delivery.markers).toBeNull();
    expect(second.applied).toEqual(first.applied);
  });

  it('carries a held read that landed after a newer neighbour installed', () => {
    const plan = planRead({ seq: 3 });
    const { delivery, applied } = nextDelivery(
      snapshotOf({
        baseline: ANCHORED,
        tree: installedAt(plan, 2),
        directory: installedAt(VOCABULARY, 1),
      }),
      { tree: 2, steps: 0, directory: 0, markers: 0 },
    );

    expect(delivery.tree).toBeNull();
    expect(delivery.directory).toBe(VOCABULARY);
    expect(applied).toEqual({ tree: 2, steps: 0, directory: 1, markers: 0 });
  });

  it('says which resources are stale and turns a failed tree read into a sentence', () => {
    const { delivery } = nextDelivery(
      snapshotOf({
        baseline: ANCHORED,
        staleResources: ['tree', 'markers'],
        tree: {
          desired: 2,
          reading: false,
          installed: null,
          failure: { generation: 2, cause: new Error('forbidden') },
        },
      }),
      NOTHING_APPLIED,
    );

    expect(delivery.staleResources).toEqual(['tree', 'markers']);
    expect(delivery.failureSentence).toBe(
      'That change could not be completed: this plan is not yours to change.',
    );
  });
});
```

- [ ] Add `  'src/modules/plan-feed/plan-feed.test.ts',` to `NODE_SUITES` in
      `apps/wbs/fe-01/vitest.node-suites.ts`, immediately **before**
      `  'src/modules/plan-writer/plan-writer.test.ts',`. The list entry and the file land in the
      same slice on purpose: the node config's `include` **is** this list, so an unlisted suite
      cannot run at all, and `src/test-tiers.test.ts` fails on a listed file that does not exist.
- [ ] Run the sandbox unit command. Expect a **failure**: the new suite cannot resolve
      `./plan-feed.resource`. Record the exact message. This is the red state.
- [ ] Create `apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.ts` with exactly this. The
      imports are the ones this slice uses and no others, because the planner commits this
      checkpoint with hooks enabled and `unused-imports/no-unused-imports` is an error. **Every
      `Proof:` comment is the one standing in `use-plan-read.ts` today, copied into the statement's
      new position with not a word changed.**

```ts
import { refusalSentence } from '@/components/wbs/plan-refusal';
import type { PlanRefreshSnapshot } from '@/lib/plan-refresh';

import type { AppliedGenerations, PlanFeedDelivery } from './contract';

/**
 * What of this snapshot the reader has not been given, and what it has been
 * given once this delivery is applied.
 *
 * Pure, and exported for its own suite: it is the whole of the generation
 * ledger, the four comparisons are the feed's most important decision, and no
 * suite that drives a page can separate them from the setters they feed.
 */
export function nextDelivery(
  snapshot: PlanRefreshSnapshot,
  applied: AppliedGenerations,
): { delivery: PlanFeedDelivery; applied: AppliedGenerations } {
  const staleResources = snapshot.staleResources;
  // Proof: suppressing this failure text left the peer-refetch window on
  // “the last refresh failed”, expected the named optimizer-unavailable
  // message while the previously installed plan stayed on screen.
  const failureSentence =
    snapshot.tree.failure === null ? null : refusalSentence(snapshot.tree.failure.cause);
  // Publish the first table with its column vocabulary. The tree anchor
  // alone would expose editors which the initial steps read then remounts.
  // Proof: removing this gate exposed a textarea instead of null in
  // `does not expose a first editor before its held column vocabulary installs`.
  if (snapshot.baseline === null) {
    return {
      delivery: {
        staleResources,
        failureSentence,
        directory: null,
        tree: null,
        steps: null,
        markers: null,
      },
      applied,
    };
  }
  const directory =
    snapshot.directory.installed !== null &&
    snapshot.directory.installed.generation > applied.directory
      ? snapshot.directory.installed
      : null;
  const tree =
    snapshot.tree.installed !== null && snapshot.tree.installed.generation > applied.tree
      ? snapshot.tree.installed
      : null;
  const steps =
    snapshot.steps.installed !== null && snapshot.steps.installed.generation > applied.steps
      ? snapshot.steps.installed
      : null;
  const markers =
    snapshot.markers.installed !== null && snapshot.markers.installed.generation > applied.markers
      ? snapshot.markers.installed
      : null;
  return {
    delivery: {
      staleResources,
      failureSentence,
      directory: directory === null ? null : directory.value,
      tree: tree === null ? null : { value: tree.value, generation: tree.generation },
      steps: steps === null ? null : steps.value,
      markers: markers === null ? null : markers.value,
    },
    applied: {
      tree: tree?.generation ?? applied.tree,
      steps: steps?.generation ?? applied.steps,
      directory: directory?.generation ?? applied.directory,
      markers: markers?.generation ?? applied.markers,
    },
  };
}
```

The order of the four blocks is the order `applySnapshot` applies them in today — directory, tree,
steps, markers — and the hook keeps that order when it applies a delivery. It matters: the tree
block mutates `rowPlacements` and `treeReadProject`, and the steps block runs the drafts sanitizer.

- [ ] Run the sandbox unit command. Expect exit 0, **F0 + 1** files and **T0 + 4** tests.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0.
- [ ] Lint and format this slice's three files exactly as slice 1 does, then
      `NX_DAEMON=false bunx nx format:check --all`. ESLint must print nothing.

**Stop after slice 2.** Checkpoint B.

### Slice 3 — The feed itself, red then green

Commit subject: `feat(wbs-fe): own the plan feed's lifetime, stream and acknowledgement`. Paths:
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.ts`,
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.test.ts`.

- [ ] Widen the import block at the top of `plan-feed.test.ts` to exactly this. No mocking library
      is used: the two fakes are plain objects.

```ts
import { describe, expect, it } from 'vitest';

import type {
  DirectoryRead,
  PlanRefresh,
  PlanRefreshSnapshot,
  RefreshOutcome,
  RefreshResource,
} from '@/lib/plan-refresh';
import type { CalendarMarkerView, StepView } from '@/lib/wbs-api';
import { planRead } from '@/testing/views';

import type {
  AppliedGenerations,
  PlanFeedDelivery,
  PlanFeedHost,
  PlanFeedRefusal,
  PlanFeedStreamHandlers,
} from './contract';
import { createPlanFeed, nextDelivery } from './plan-feed.resource';
```

- [ ] Append the fakes and the second `describe` to `plan-feed.test.ts`. The file then carries
      **sixteen** tests in two blocks: four from slice 2 and twelve here.

```ts
/** A refresh owner that records what it was asked and publishes when told to. */
function fakeOwner(): {
  owner: PlanRefresh;
  asked: string[];
  invalidations: { resources: readonly RefreshResource[]; seq?: number }[];
  listeners: (() => void)[];
  show: (next: PlanRefreshSnapshot) => void;
  firstRead: (outcome: RefreshOutcome) => void;
} {
  const asked: string[] = [];
  const invalidations: { resources: readonly RefreshResource[]; seq?: number }[] = [];
  const listeners: (() => void)[] = [];
  let snapshot = snapshotOf();
  let settleFirstRead: (outcome: RefreshOutcome) => void = () => undefined;
  const owner: PlanRefresh = {
    initialize: () => {
      asked.push('initialize');
      return new Promise((resolve) => {
        settleFirstRead = resolve;
      });
    },
    invalidate: (invalidation) => {
      asked.push('invalidate');
      invalidations.push(invalidation);
      return Promise.resolve({ status: 'installed' });
    },
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.push(listener);
      return () => {
        asked.push('stop');
      };
    },
    dispose: () => {
      asked.push('dispose');
    },
  };
  return {
    owner,
    asked,
    invalidations,
    listeners,
    show: (next) => {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
    firstRead: (outcome) => {
      settleFirstRead(outcome);
    },
  };
}

/** A host over one fake owner, recording everything the feed asked it for. */
function hostOver(
  owner: PlanRefresh,
  over: Partial<PlanFeedHost> = {},
): {
  host: PlanFeedHost;
  deliveries: PlanFeedDelivery[];
  refusals: PlanFeedRefusal[];
  connections: boolean[];
  opened: { baseline: number; handlers: PlanFeedStreamHandlers }[];
  acknowledged: number[];
  unsubscribed: number;
} {
  const deliveries: PlanFeedDelivery[] = [];
  const refusals: PlanFeedRefusal[] = [];
  const connections: boolean[] = [];
  const opened: { baseline: number; handlers: PlanFeedStreamHandlers }[] = [];
  const acknowledged: number[] = [];
  const record = { unsubscribed: 0 };
  const host: PlanFeedHost = {
    openOwner: () => owner,
    isActiveReader: () => true,
    openStream: (handlers, baseline) => {
      opened.push({ baseline, handlers });
      return {
        seen: (seq) => acknowledged.push(seq),
        unsubscribe: () => {
          record.unsubscribed += 1;
        },
      };
    },
    publish: (delivery) => deliveries.push(delivery),
    setConnected: (connected) => connections.push(connected),
    announceRefusal: (refusal) => refusals.push(refusal),
    ...over,
  };
  return {
    host,
    deliveries,
    refusals,
    connections,
    opened,
    acknowledged,
    get unsubscribed() {
      return record.unsubscribed;
    },
  };
}

/**
 * The handlers the anchor's stream was opened with, or a loud failure.
 *
 * `at(0)` and not `[0]`, because this repository does not enable
 * `noUncheckedIndexedAccess`: an index read is typed as present, so the guard
 * below would be an unnecessary condition and lint refuses it. `at` is typed
 * as possibly absent, which is what a first element of a recorded list is.
 */
function handlersOf(opened: { handlers: PlanFeedStreamHandlers }[]): PlanFeedStreamHandlers {
  const first = opened.at(0);
  if (first === undefined) throw new Error('the anchor opened no stream');
  return first.handlers;
}

const ANCHORED_SNAPSHOT = snapshotOf({ baseline: ANCHORED, acknowledged: 7 });

describe('the plan feed', () => {
  it('reads the plan as soon as it is built', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);

    createPlanFeed(recorded.host);

    expect(fake.asked).toEqual(['initialize']);
    expect(fake.listeners).toHaveLength(1);
  });

  it('publishes nothing to a reader that has moved on', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner, { isActiveReader: () => false });

    createPlanFeed(recorded.host);
    fake.show(ANCHORED_SNAPSHOT);

    expect(recorded.deliveries).toEqual([]);
    expect(recorded.opened).toEqual([]);
  });

  it('opens one stream when the anchor lands, and no more', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);

    createPlanFeed(recorded.host);
    fake.show(ANCHORED_SNAPSHOT);
    fake.show(snapshotOf({ baseline: { seq: 9, epoch: 2 }, acknowledged: 9 }));

    expect(recorded.opened).toHaveLength(1);
    expect(recorded.opened.at(0)?.baseline).toBe(7);
  });

  it('opens nothing for a reader with no stream of its own', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner, { openStream: null });

    createPlanFeed(recorded.host);
    fake.show(ANCHORED_SNAPSHOT);

    expect(recorded.deliveries).toHaveLength(1);
    expect(recorded.opened).toEqual([]);
  });

  it('acknowledges a sequence only once it has moved forward', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);

    createPlanFeed(recorded.host);
    fake.show(ANCHORED_SNAPSHOT);
    fake.show(snapshotOf({ baseline: ANCHORED, acknowledged: 7 }));
    fake.show(snapshotOf({ baseline: ANCHORED, acknowledged: 11 }));

    expect(recorded.acknowledged).toEqual([11]);
  });

  it('asks for a fresh anchor for an unsequenced change and for the named resources otherwise', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);

    createPlanFeed(recorded.host);
    fake.show(ANCHORED_SNAPSHOT);
    const handlers = handlersOf(recorded.opened);
    handlers.onChange();
    handlers.onChange('tree_replaced', 8);

    expect(fake.asked).toEqual(['initialize', 'initialize', 'invalidate']);
    expect(fake.invalidations).toEqual([{ resources: ['tree'], seq: 8 }]);
  });

  it('ignores a change that arrives after the reader moved on', () => {
    const fake = fakeOwner();
    let current = true;
    const recorded = hostOver(fake.owner, { isActiveReader: () => current });

    createPlanFeed(recorded.host);
    fake.show(ANCHORED_SNAPSHOT);
    const handlers = handlersOf(recorded.opened);
    current = false;
    handlers.onChange('tree_replaced', 8);
    handlers.onConnectionChange(false);

    expect(fake.invalidations).toEqual([]);
    expect(recorded.connections).toEqual([]);
  });

  it('reports the connection while the reader is current', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);

    createPlanFeed(recorded.host);
    fake.show(ANCHORED_SNAPSHOT);
    handlersOf(recorded.opened).onConnectionChange(false);

    expect(recorded.connections).toEqual([false]);
  });

  it('announces every refusal of the first read in a sentence', async () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);

    createPlanFeed(recorded.host);
    fake.firstRead({
      status: 'failed',
      failures: [{ resource: 'tree', cause: new Error('forbidden') }],
    });
    await Promise.resolve();

    expect(recorded.refusals).toEqual([
      { sentence: 'That change could not be completed: this plan is not yours to change.' },
    ]);
  });

  it('rereads by invalidating, and resynchronizes when nothing is anchored and something is stale', async () => {
    const fake = fakeOwner();
    const feed = createPlanFeed(hostOver(fake.owner).host);

    fake.show(ANCHORED_SNAPSHOT);
    await feed.rereadResources(['markers']);
    expect(fake.invalidations).toEqual([{ resources: ['markers'] }]);

    fake.show(snapshotOf({ staleResources: ['tree'] }));
    void feed.rereadResources(['markers']);
    expect(fake.asked.filter((call) => call === 'initialize')).toHaveLength(2);
    expect(fake.invalidations).toHaveLength(1);
  });

  it('exposes the store contract over its own owner', () => {
    const fake = fakeOwner();
    const feed = createPlanFeed(hostOver(fake.owner).host);
    const seen: number[] = [];

    const stop = feed.subscribe(() => seen.push(feed.snapshot().acknowledged));
    const first = feed.snapshot();
    expect(feed.snapshot()).toBe(first);
    fake.show(ANCHORED_SNAPSHOT);
    expect(feed.snapshot()).not.toBe(first);
    expect(seen).toEqual([7]);
    stop();
  });

  it('closes by stopping, disposing and dropping the stream', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);
    const feed = createPlanFeed(recorded.host);
    fake.show(ANCHORED_SNAPSHOT);

    feed.close();

    expect(fake.asked).toEqual(['initialize', 'stop', 'dispose']);
    expect(recorded.unsubscribed).toBe(1);
    fake.show(snapshotOf({ baseline: ANCHORED, acknowledged: 21 }));
    expect(recorded.deliveries).toHaveLength(1);
  });
});
```

- [ ] Run the sandbox unit command. Expect a **failure**: `createPlanFeed` is not exported. Record
      the message. This is the red state for this slice.
- [ ] Widen `plan-feed.resource.ts`'s imports to exactly this:

```ts
import { refusalSentence } from '@/components/wbs/plan-refusal';
import { type PlanRefreshSnapshot, resourcesFor } from '@/lib/plan-refresh';
import type { ProjectStream } from '@/lib/project-stream';

import type { AppliedGenerations, PlanFeed, PlanFeedDelivery, PlanFeedHost } from './contract';
```

- [ ] Append the factory below. Every statement is transcribed from the subscription effect, in the
      same order, with the three React reads replaced by host calls and `ownerRef.current === owner`
      replaced by `!closed`.

```ts
/**
 * Opens the feed for one project and one API, and starts reading at once.
 *
 * Reading begins inside this call, exactly where the effect it replaces began
 * it. So the host stores the feed **after** the call returns, and the first
 * publication happens while nobody can look the feed up yet. That is safe and
 * measured: a publication reaches React state setters and nothing that reads the
 * feed back, the refusals of the first read arrive in a later microtask, and the
 * whole plan table's suites are unchanged by the move.
 */
export function createPlanFeed({
  openOwner,
  isActiveReader,
  openStream,
  publish,
  setConnected,
  announceRefusal,
}: PlanFeedHost): PlanFeed {
  // Proof: reusing the disposed owner left zero subscriptions instead of one
  // in `creates a live second owner after StrictMode cleans up its first setup`.
  const owner = openOwner();
  let applied: AppliedGenerations = { tree: 0, steps: 0, directory: 0, markers: 0 };
  let stream: ProjectStream | null = null;
  let streamSequence = -1;
  let closed = false;
  /**
   * Whether this feed still owns the table.
   *
   * Two halves, because they fail at different moments: `closed` is this
   * lifetime ending, and the reader test is a render that has already moved on
   * while this lifetime is still being torn down.
   */
  const isCurrent = (): boolean => !closed && isActiveReader();
  const apply = (): void => {
    if (!isCurrent()) return;
    const snapshot = owner.getSnapshot();
    const next = nextDelivery(snapshot, applied);
    applied = next.applied;
    publish(next.delivery);
    if (openStream !== null && snapshot.baseline !== null && stream === null) {
      // The existing socket is already registered during recovery. Reopening
      // here would turn every refused resume into another read/socket cycle.
      // Proof: restoring epoch replacement opened two sockets instead of one
      // in both `recovers a persistent %s ...` production-page cases.
      streamSequence = snapshot.baseline.seq;
      stream = openStream(
        {
          onChange: (changed, seq) => {
            if (!isCurrent()) return;
            if (changed == null && seq === undefined) void owner.initialize();
            else void owner.invalidate({ resources: resourcesFor(changed), seq });
          },
          onConnectionChange: (connected) => {
            if (isCurrent()) setConnected(connected);
          },
        },
        snapshot.baseline.seq,
      );
    }
    if (snapshot.acknowledged > streamSequence) {
      stream?.seen(snapshot.acknowledged);
      streamSequence = snapshot.acknowledged;
    }
  };
  const stop = owner.subscribe(apply);
  void owner.initialize().then((outcome) => {
    if (!isCurrent() || outcome.status !== 'failed') return;
    for (const failure of outcome.failures)
      // Proof: using the bare failure code here left the unavailable-plan
      // fixture with no named toast and an unhandled refusal-code branch.
      announceRefusal({ sentence: refusalSentence(failure.cause) });
  });
  return {
    owner,
    // Rule F2, and the owner is the store: it rebuilds its snapshot object only
    // when something in it changed, which is the stability half of the contract.
    subscribe: (onChange) => owner.subscribe(onChange),
    snapshot: () => owner.getSnapshot(),
    rereadResources: async (resources) => {
      if (owner.getSnapshot().baseline === null && owner.getSnapshot().staleResources.length > 0)
        await owner.initialize();
      else await owner.invalidate({ resources });
    },
    close: () => {
      closed = true;
      stop();
      owner.dispose();
      stream?.unsubscribe();
    },
  };
}
```

- [ ] Check the four translations against the source, one at a time. Nothing else about them
      changes:
  - `const owner = createPlanRefresh({ projectId, api }); ownerRef.current = owner;` becomes
    `const owner = openOwner();` plus the host's own assignment in the hook.
  - `ownerRef.current === owner && activeProject.current === projectId && activeApi.current === api`
    becomes `!closed && isActiveReader()`.
  - `subscribe !== undefined` becomes `openStream !== null`, and
    `subscribe(projectId, handlers, baseline)` becomes `openStream(handlers, baseline)`.
  - the cleanup's `if (ownerRef.current === owner) ownerRef.current = null;` stays in the hook; the
    other three cleanup statements become `close`, in the same order.
- [ ] Run the sandbox unit command → exit 0, **F0** files and **T0 + 12** tests. This slice adds no
      file: slice 2 added it.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0.
- [ ] Lint and format this slice's two files, then `NX_DAEMON=false bunx nx format:check --all`.
      ESLint must print nothing.

**Stop after slice 3.** Checkpoint C. The hook is still untouched, and the application still
behaves exactly as it did.

### Slice 4 — Rewire the hook

Commit subject: `refactor(wbs-fe): read the plan through the plan feed module`. Path:
`apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`.

- [ ] Replace `  const ownerRef = useRef<PlanRefresh | null>(null);` with
      `  const feedRef = useRef<PlanFeed | null>(null);`. Leave `activeApi` and its assignment
      alone.
- [ ] Replace the whole `applySnapshot` callback with `publishPlan` below. This is the complete
      replacement, including the three `Proof:` comments that stay with the setters. Only the two
      opening statements, the four `if` tests, the four `applied.* =` assignments and one
      `generation:` line differ from what stands there today; the **dependency array is the one
      `applySnapshot` carried, unchanged**, and is elided here only because it is long.

```ts
const publishPlan = useCallback(
  (delivery: PlanFeedDelivery) => {
    setTreeMayBeStale(delivery.staleResources.length > 0);
    setTreeFailureText(delivery.failureSentence);
    if (delivery.directory !== null) {
      const vocabulary = delivery.directory;
      setTeams(vocabulary.teams);
      setTags(vocabulary.tags);
      setServices(vocabulary.services);
      setWorkItemTypes(vocabulary.workItemTypes);
      setExternalSystems(vocabulary.externalSystems);
      setPeople(vocabulary.people);
    }
    if (delivery.tree !== null) {
      const tree = delivery.tree.value;
      const drawn = toTree(tree.workItems);
      setWorkItems(drawn);
      treeReadProject.current = projectId;
      // The open hover card, settled against the rows that just arrived. The
      // previous placements are read into a local **before** the ref is replaced:
      // React may run the updater below after this call returns, and reading the
      // ref from inside it would compare the new tree against itself and never
      // close anything.
      // Proof: this pair deleted, `closes the card when a peer moves the row it
      // is anchored to` failed on `expected <div role="tooltip" …/> to be null`.
      // Watched, 2026-08-09.
      const placements = placementsOf(drawn);
      const wasPlaced = rowPlacements.current;
      rowPlacements.current = placements;
      cellCards.updateHovered((open) => hoveredCellAfterRefresh(open, wasPlaced, placements));
      // On the same read as the rows and behind the same generation check: a
      // superseded read must not leave its slices under another read's rows.
      // Proof: written as `setSlices((current) => current.length === 0 ?
      // tree.slices : current)` — the refetch leaving the slices where the first
      // read put them — and `replaces the slices on every refetch, as it replaces
      // the rows` failed on `expected '2' to be '1'`: a second row on screen with
      // the one-row plan's slices still behind it; watched 2026-08-09.
      //
      // One call, so the chart's three parts can only ever be one payload's. The
      // steps and the names come from `tree` and **not** from `loadedSteps` or
      // `loadedPeople` below: those are three more requests, and a peer's step
      // delete landing between them is what used to hand `layOutGantt` a slice
      // under a step the plan no longer listed.
      setChartRead({
        slices: tree.slices,
        steps: tree.steps,
        people: tree.assignedPeople,
        depReach: tree.depReach,
        pertWeights: tree.pertWeights,
        estimateRounding: tree.estimateRounding,
        ...(tree.optimization === undefined ? {} : { optimization: tree.optimization }),
        generation: delivery.tree.generation,
      });
      setStack({ undoable: tree.undoable, redoable: tree.redoable });
      setTeamCapacities(tree.teamCapacities);
      setPriorityBands(tree.priorityBands);
      setScheduleError(tree.scheduleError);
      // Proof: renaming the shared response field to `planningMethod` made this
      // production screen fail with TS2339: `estimateMethod` does not exist on PlanRead.
      setEstimateMethod(tree.estimateMethod);
      setStartDate(tree.startDate);
    }
    if (delivery.steps !== null) {
      const loadedSteps = delivery.steps;
      setSteps((current) => (sameSteps(current, loadedSteps) ? current : [...loadedSteps]));
      settleAgainstSteps(loadedSteps);
    }
    if (delivery.markers !== null) setMarkers(delivery.markers);
  },
  [
    // exactly the dependency array `applySnapshot` carried, unchanged
  ],
);
```

The `applied` parameter is gone, the `snapshot.baseline === null` early return is gone, and the
four `applied.<resource> = snapshot.<resource>.installed.generation;` assignments are **deleted**:
all of them are the feed's now, and copying one would name a variable this callback no longer has.

- [ ] Replace the whole subscription effect with:

```ts
/**
 * This reader's feed: one project, one API, one refresh owner, one stream.
 *
 * Built in an effect and closed by its cleanup, which is what makes the
 * owner's lifetime the reader's. `feedRef` is how everything outside this
 * effect reaches it, and it is cleared before the feed is closed, so work
 * that outlives the reader — a gesture whose answer is still in flight —
 * finds no owner rather than a disposed one.
 */
useEffect(() => {
  const feed = createPlanFeed({
    openOwner: () => createPlanRefresh({ projectId, api }),
    isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
    openStream:
      subscribe === undefined
        ? null
        : (handlers, baseline) => subscribe(projectId, handlers, baseline),
    publish: publishPlan,
    setConnected,
    announceRefusal: ({ sentence }) => {
      pushToast({ kind: 'error', text: sentence });
    },
  });
  feedRef.current = feed;
  return () => {
    if (feedRef.current === feed) feedRef.current = null;
    feed.close();
  };
}, [activeProject, api, projectId, publishPlan, pushToast, setConnected, subscribe]);
```

- [ ] Replace the body of `refreshResourcesOrMarkStale`. Its JSDoc and its dependency array are
      unchanged, and the opening guard is the same expression it is today — section 4.6 is why it
      stays here:

```ts
/** Awaits this invalidation's covering outcome; failures remain in the owner snapshot. */
const refreshResourcesOrMarkStale = useCallback(
  async (resources: readonly RefreshResource[]): Promise<void> => {
    const feed = feedRef.current;
    // The reader this callback was built for, and not whoever is on screen
    // now: a reread issued from a project or an API this reader has left must
    // not be spent against the feed that replaced it.
    if (feed === null || activeProject.current !== projectId || activeApi.current !== api) return;
    await feed.rereadResources(resources);
  },
  [activeProject, api, projectId],
);
```

- [ ] Three substitutions for the callers that still read the owner. Nothing else in these three
      callbacks changes:
  - `runMarkerWrite`: `const owner = ownerRef.current;` becomes
    `const owner = feedRef.current?.owner ?? null;`, and `ownerRef.current === owner` inside its
    `isCurrent` becomes `feedRef.current?.owner === owner`.
  - `stepStack`: the same two substitutions.
  - the writer's `useMemo`: `readRefreshOwner: () => ownerRef.current,` becomes
    `readRefreshOwner: () => feedRef.current?.owner ?? null,`.
- [ ] Fix the imports. Add, in sorted position immediately before the plan writer's import:

```ts
import type { PlanFeed, PlanFeedDelivery } from '@/modules/plan-feed/contract';
import { createPlanFeed } from '@/modules/plan-feed/plan-feed.resource';
```

and collapse the `@/lib/plan-refresh` import to exactly
`import { ALL_RESOURCES, createPlanRefresh, type RefreshResource } from '@/lib/plan-refresh';` —
`PlanRefresh`, `PlanRefreshSnapshot` and `resourcesFor` left with the code that used them. Keep
`refusalSentence` from `./plan-refusal`: `runMarkerWrite` and `stepStack` still use it.

- [ ] Do not touch `settleAgainstSteps`, `refreshOrMarkStale`, `PlanReadScope`, `usePlanReadState`,
      the hook's parameter object or its return statement.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0, no diagnostic.
- [ ] `bunx eslint apps/wbs/fe-01/src/components/wbs/use-plan-read.ts` → exit 0 and no output; then
      `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0.
- [ ] `bunx prettier --write apps/wbs/fe-01/src/components/wbs/use-plan-read.ts` then
      `NX_DAEMON=false bunx nx format:check --all` → exit 0, or failures naming only files outside
      this packet.
- [ ] Run the sandbox unit command → **F0** and **T0**: this slice adds no test.
- [ ] Run both DOM oracle commands → exit 0 with **D1** and **D2** exactly as step 0 recorded them.
      A different count means a test was added, removed or skipped: stop and report. The planner
      measured this rewire against the same three files and saw 167 of 167 before and after.

**Stop after slice 4.** Checkpoint D.

### Slice 5 — Negative proofs

Commit subject: `docs(wbs-fe): record the plan feed's observed negatives`. Path:
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.ts` (proof comments only).

- [ ] Perform every injection in section 8, one at a time, in the order given, each with the
      restore discipline that section states. Record the exact failure message for each **before**
      writing or confirming its proof comment.
- [ ] Only after watching a check fail, add or rewrite its `Proof:` comment at the location section
      8's inventory names. Each names the fault injected and the test observed, with the date, in
      the repository's own form.
- [ ] Run the sandbox unit command and both DOM oracle commands again, green, and record the
      counts: **F0**, **T0**, **D1**, **D2**, unchanged.
- [ ] `bunx prettier --write` the file this slice touched, then
      `NX_DAEMON=false bunx nx format:check --all`.

**Stop after slice 5.** Checkpoint E.

### Slice 6 — Whole-project checks and hand-over

No commit of its own unless a check forces a fix; this slice verifies and reports.

- [ ] Run the sandbox unit command → exit 0, **F0** and **T0**.
- [ ] Do **not** run `wbs-fe-01:test:unit` or `wbs-fe-01:test`. Report both as pending planner
      verification, with the expected delta **against the planner's own pre-batch baseline**:
      `test:unit` and the `TZ=UTC` summary of `test` each one file and sixteen tests up; the
      `TZ=Pacific/Auckland` summary unchanged, because this packet adds no `.zoned.test.ts` file.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:build` → exit 0.
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

Expected: each prints `1 pass`, `0 fail`. On branch B the last name may no longer exist, in which
case run 110.6's `the current-document sweep reaches every application, library and tool README`
instead and say so. A failure naming a path this packet created is a stop condition; a failure
naming only other packets' documents is pre-existing — the planner observed the link and selector
checks already failing on 010.6's and 020.2's documents on 2026-09-20 — so record it verbatim and
carry on.

- [ ] Do **not** run `NX_DAEMON=false bunx nx run tool-devsync:test`: its index checker runs
      `git write-tree` and `git add --update` against this clone. Report it as pending planner
      verification.
- [ ] Run the batch README's standard OpenSpec validation block, the version that keeps its report
      under `$TMPDIR/evidence` and does not end in a removal. Expected: one JSON report printed and
      the block exits 0.
- [ ] `git status --short --untracked-files=all` → expect **this slice's** step 0 status, unchanged:
      the earlier slices are committed. Report the cumulative implementation paths from the five
      commit subjects above, not from the working tree.
- [ ] Do not run `git add`, `git commit`, `git checkout -b`, `git stash` or `git restore --staged`.
      They fail here; the planner commits after reviewing each slice.
- [ ] Do **not** run `bin/h2puni-gate.sh`. Say in the report that the host gate was not run, and
      why.

**Stop after slice 6.** Checkpoint F.

## 8. Negative proofs

Every check below is either new or has had its expression rewritten by the move, so R5 requires
each to be watched failing before its `Proof:` comment is trusted.

**Every one of these was performed by the planner on 2026-09-20**, in this worktree, against the
rehearsed implementation of section 4.11, and the "observed" column is what the run actually
printed. The executor repeats each one against its own tree and records what it sees; a result that
differs from the observed one is a stop.

**Restore discipline, for every entry.** Copy the passing file aside first
(`cp <file> "$TMPDIR/<name>.passing"`), inject, save the mutation as a patch under
`$TMPDIR/evidence` with the batch README's exact `if diff …; then …; else test $? -eq 1; fi` form,
run the named command, save the failing output beside the patch, restore the exact bytes, prove it
with `cmp`, and rerun green. Never `|| true`, and never read a test's status through `tee`.

**A proof succeeds when the NAMED test fails.** A fault that also fails other tests is recorded,
not stopped on. It is a stop only when the named test passes, fails with a different message, or
the mutation does not compile.

Three commands, each run from the repository root in a subshell. The DOM ones take a `-t` filter so
one case runs instead of the file; a run reporting `0 tests` or `matched 0 tests` is a failure to
stop on.

```sh
# command A
(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
  src/components/wbs/plan-read-and-write.test.tsx -t '<the named test>')
# command B
(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
  src/components/wbs/project-page.test.tsx -t '<the named test>')
# command C: the sandbox unit command of step 0
(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
  --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts)
```

### The inventory: every check, its mutation, its test, and where its comment lives

| #   | Check, and where its `Proof:` comment lives                                                              | Mutation                                                                                                                                   | Command | Named test                                                                                    | Observed on 2026-09-20                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | One stream per lifetime — comment moved, above `streamSequence = snapshot.baseline.seq;`                 | drop `&& stream === null`                                                                                                                  | B       | `recovers a persistent resume_denied without replacing the registered socket`                 | `expected [ …(8) ] to have a length of 1 but got 8`; the `resume_ack` twin failed too                   |
| 2   | The covered sequence reaches the stream — new comment on the `acknowledged > streamSequence` block       | delete the whole `if (snapshot.acknowledged > streamSequence) { … }` block                                                                 | A       | `refetches when the subscription reports a change`                                            | `expected -1 to be +0`                                                                                  |
| 3   | Nothing is published before the anchor — comment moved, above the early return                           | delete the `if (snapshot.baseline === null)` early return in `nextDelivery`                                                                | A       | `does not expose a first editor before its held column vocabulary installs`                   | `expected <textarea …(6)></textarea> to be null`                                                        |
| 4   | A failed tree read is said out loud — comment moved, above `failureSentence`                             | `const failureSentence = null;`                                                                                                            | A       | `keeps the installed plan and names an unavailable peer refetch`                              | `expected 'This plan may be out of date — the la…' to contain 'Optimized scheduling is unavailable i…'` |
| 5   | The stale banner is raised at all — new comment above `const staleResources`                             | `const staleResources = snapshot.staleResources.slice(0, 0);`                                                                              | A       | `raises the stale-tree banner when a socket refetch fails`                                    | `expected null not to be null`                                                                          |
| 6   | The first read's refusals reach the reader — comment moved, inside the `for` loop                        | replace the `announceRefusal({ … })` call with `void failure;`                                                                             | A       | `names an unavailable optimizer and offers no export before a plan is installed`              | `expected [] to include 'Optimized scheduling is unavailable i…'`                                       |
| 7   | The stream is dropped with the lifetime — new comment above `stream?.unsubscribe();`                     | delete `stream?.unsubscribe();` from `close`                                                                                               | A       | `refetches when the subscription reports a change`                                            | `expected false to be true`                                                                             |
| 8   | A lifetime gets its own owner — comment moved, above `const owner = openOwner();`                        | in the **hook**: `const feed = feedRef.current ?? createPlanFeed({…});` and delete `if (feedRef.current === feed) feedRef.current = null;` | A       | `creates a live second owner after StrictMode cleans up its first setup`                      | `expected +0 to be 1`                                                                                   |
| 9   | The tree generation is applied once — new comment above the `tree` comparison                            | drop `&& snapshot.tree.installed.generation > applied.tree`                                                                                | C       | `carries each generation exactly once`                                                        | `expected { …(2) } to be null`; `carries a held read …` failed with it                                  |
| 10  | The directory generation — new comment above the `directory` comparison                                  | drop `&& snapshot.directory.installed.generation > applied.directory`                                                                      | C       | `carries each generation exactly once`                                                        | `expected { teams: [], tags: [], …(4) } to be null`                                                     |
| 11  | The steps generation — new comment above the `steps` comparison                                          | drop `&& snapshot.steps.installed.generation > applied.steps`                                                                              | C       | `carries each generation exactly once`                                                        | `expected [ { id: 's1', name: 'Build' } ] to be null`                                                   |
| 12  | The markers generation — new comment above the `markers` comparison                                      | drop `&& snapshot.markers.installed.generation > applied.markers`                                                                          | C       | `carries each generation exactly once`                                                        | `expected [] to be null`                                                                                |
| 13  | A publication belongs to the reader on screen — new comment above `if (!isCurrent()) return;` in `apply` | delete that line                                                                                                                           | C       | `publishes nothing to a reader that has moved on`                                             | `expected [ { staleResources: [], …(5) } ] to deeply equal []`; the closure case failed too             |
| 14  | The closed half of `isCurrent` — new comment above `const isCurrent`                                     | `const isCurrent = (): boolean => isActiveReader();`                                                                                       | C       | `closes by stopping, disposing and dropping the stream`                                       | `expected [ … ] to have a length of 1 but got 2`                                                        |
| 15  | A frame after the reader left — new comment above `if (!isCurrent()) return;` in `onChange`              | delete that line                                                                                                                           | C       | `ignores a change that arrives after the reader moved on`                                     | `expected [ { resources: [ 'tree' ], seq: 8 } ] to deeply equal []`                                     |
| 16  | The connection is reported only to a live reader — new comment on that line                              | `setConnected(connected);` unguarded                                                                                                       | C       | `ignores a change that arrives after the reader moved on`                                     | `expected [ false ] to deeply equal []`                                                                 |
| 17  | Listening stops with the lifetime — new comment above `stop();`                                          | delete `stop();`                                                                                                                           | C       | `closes by stopping, disposing and dropping the stream`                                       | `expected [ 'initialize', 'dispose' ] to deeply equal [ 'initialize', 'stop', 'dispose' ]`              |
| 18  | The owner is disposed with the lifetime — new comment above `owner.dispose();`                           | delete `owner.dispose();`                                                                                                                  | C       | `closes by stopping, disposing and dropping the stream`                                       | `expected [ 'initialize', 'stop' ] to deeply equal [ 'initialize', 'stop', 'dispose' ]`                 |
| 19  | An unanchored stale feed resynchronizes — new comment inside `rereadResources`                           | reduce it to `await owner.invalidate({ resources });`                                                                                      | C       | `rereads by invalidating, and resynchronizes when nothing is anchored and something is stale` | `expected [ 'initialize' ] to have a length of 2 but got 1`                                             |

Proof 8's mutation lives in the hook and its comment travels with `const owner = openOwner();` in
the module: the fault it names is a host that hands the same, already-disposed feed to a second
lifetime, and that is exactly what the mutation builds. Restore **both** hook edits before
asserting anything.

### The guard this packet does not claim a negative for

The reader guard in `refreshResourcesOrMarkStale` stays in the hook, unchanged (section 4.6). The
planner weakened it to `if (feed === null) return;` and ran the whole of
`plan-read-and-write.test.tsx`: **88 of 88 passed**. No test separates it. It is unchanged code, so
R5 asks nothing new of it; the executor does not mutate it, and the gap is reported as a finding for
[checks that cannot fail](../../../findings/checks-that-cannot-fail.md). Section 12's stop
conditions apply to the nineteen proofs above and to nothing else.

## 9. Guard inventory

Confirm by reading that these are unchanged and still where they are, and say so in the report.

| Guard                                                        | Where                    | Why it stays                                        |
| ------------------------------------------------------------ | ------------------------ | --------------------------------------------------- |
| The opening guard of `refreshResourcesOrMarkStale`           | the hook                 | Section 4.6: it is the departed caller's guard.     |
| `runMarkerWrite`'s own `isCurrent`                           | the hook                 | Calendar markers service, a later packet.           |
| `stepStack`'s own `isCurrent`                                | the hook                 | History and transfer service, a later packet.       |
| The plan writer's three identity checks                      | `plan-writer.feature.ts` | 040.3 proved them; this packet does not touch them. |
| `sameSteps` and the drafts sanitizer in `settleAgainstSteps` | the hook                 | View state, with their own proofs and tests.        |
| `publish`'s disposal check and the superseded-read check     | `lib/plan-refresh.ts`    | The owner's, with their own proofs.                 |

No guard is deleted by this packet.

## 10. OpenSpec

**No OpenSpec change is created.** R4 requires one for observable behaviour, contracts, migrations,
deploy safety or architecture, and skips it for mechanical refactors. This packet moves code
without changing behaviour — measured, section 4.11 — and it introduces no architectural exception:
rule F2's store contract is implemented, not deferred (section 4.7), so the proposed
`service-taxonomy` change's requirement `F2 stateful services expose one store contract` is
satisfied by this module rather than excused. Nothing in that change is edited.

`openspec/specs/plan-refresh/spec.md` is accepted and constrains what moves. The executor reads it
as the acceptance criteria for "no behaviour change":

- Requirement **"Read ownership ends with its project and API lifetime"**: "Disposal SHALL settle
  outstanding callers as disposed and prevent subsequent installation, stale changes,
  notifications, toasts and acknowledgments. A new project or API identity SHALL use a distinct
  owner, including when the project ID is unchanged." That is what `createPlanFeed` and `close`
  implement, and proofs 8, 13, 14, 15, 17 and 18 exercise it.
- Requirement **"Failures remain visible until their resources recover"**: a mutation whose
  covering read fails SHALL remain landed, and the failure stays in the snapshot. Proofs 4 and 5
  exercise it. Do not add a failure branch to `rereadResources`.

`openspec/specs/wbs-table-modules/spec.md`, requirement "Concept modules preserve table behavior",
requires the modules the table composes to keep their behaviour. Adding a module the read module
composes is inside that requirement while behaviour holds, so it needs no delta.

The validation command is the batch's standard OpenSpec block, run in slice 6.

## 11. Verification

### What the executor runs

| Command                                           | Expected                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| The sandbox unit command                          | Exit 0. Slice 2: **F0 + 1** files, **T0 + 4** tests. Slice 3: **F0**, **T0 + 12**. Slices 4 to 6: **F0**, **T0**. |
| The two DOM oracle commands, slices 4 to 6        | Exit 0, **D1** and **D2** unchanged from that slice's step 0.                                                     |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` | Exit 0, no diagnostic. Every slice.                                                                               |
| `bunx eslint <this slice's files>`                | Exit 0, no output. Every slice, before its checkpoint.                                                            |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`      | Exit 0. Slice 4 onwards.                                                                                          |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`     | Exit 0. Slice 6.                                                                                                  |
| The four named devsync checks                     | Each `1 pass`, `0 fail`, or a failure naming only other packets' documents.                                       |
| `NX_DAEMON=false bunx nx format:check --all`      | Exit 0, or failures naming only files outside this packet.                                                        |
| The standard OpenSpec block                       | One JSON report printed, block exits 0.                                                                           |

### What the planner runs afterwards

| Command                                                         | Why the executor cannot run it                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `git add` of each slice's paths, then its commit                | The clone's Git directory is read-only.                                                                      |
| `NX_DAEMON=false bunx nx run tool-devsync:test`                 | Its index checker writes Git objects into the clone.                                                         |
| `wbs-fe-01:test:unit` and `wbs-fe-01:test`, outside the sandbox | Three of their tests spawn `bun` from Node; the sandbox refuses it.                                          |
| `wbs-fe-01:e2e`                                                 | Needs a browser and the real stack. This packet changes the read path of every table screen, so run it once. |
| `bin/h2puni-gate.sh <sha>`                                      | The host gate cannot run on this machine.                                                                    |

**What none of it proves.** Nothing here proves the feed is reachable from the real browser path:
that is the `e2e` target. Nothing proves rule F1 mechanically — no lint rule forbids a React import
from a service file yet, which is Task 3 of the rollout. The unit suite proves the policy over a
fake owner and a fake stream; the production evidence is the two DOM suites.

## 12. Stop conditions

Stop and report rather than improvising when any of these happens. Each is false on the tree this
packet starts from.

1. Any assertion in an existing test has to change to make a suite pass.
2. A `Proof:` comment has no home in the new file, or the test it names no longer exists.
3. The DOM oracle's counts differ from that slice's step 0, or a test outside this packet's files
   fails.
4. A named test in section 8's inventory passes under its mutation, fails with a different message,
   or the mutation does not compile. Extra failing tests are recorded and are **not** a stop.
5. `wbs-table.tsx`, `project-page.tsx`, `plan-toolbar.tsx`, `use-plan-dependencies.ts` or
   `plan-writer.feature.ts` appears to need an edit.
6. `PlanReadScope` or `refreshOrMarkStale` appears to need to move (section 4.9).
7. The presence roster appears to need to move (section 4.8).
8. The new suite fails in the node tier with a reference error naming a browser global, or
   `src/test-tiers.test.ts` refuses the new entry.
9. Step 1.4 finds neither the literal pin nor 110.6's derived check.
10. `NX_DAEMON=false bunx nx format:check --all` names one of this packet's own files after the
    targeted write.
11. Any step seems to need `git add`, `git commit` or the host gate.

## 13. Out of lane

| Path                                                                   | Owner                                        |
| ---------------------------------------------------------------------- | -------------------------------------------- |
| `apps/wbs/fe-01/src/lib/plan-refresh.ts`                               | Nobody in this batch; the owner stays put.   |
| `apps/wbs/fe-01/src/lib/plan-refresh-stream.test.ts`                   | Nobody; its duplication is a finding (4.10). |
| `apps/wbs/fe-01/src/lib/project-stream.ts`                             | The application lifetime's stream connector. |
| `apps/wbs/fe-01/src/components/wbs/project-page.tsx`                   | The roster's home (4.8).                     |
| `apps/wbs/fe-01/src/components/wbs/plan-toolbar.tsx`                   | Work item 040.5.                             |
| `apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts`           | Work item 040.5.                             |
| `apps/wbs/fe-01/src/modules/plan-writer/**`                            | Work item 040.3, merged.                     |
| `apps/wbs/fe-01/src/modules/store.ts`                                  | Packet 040.6, merged. Imported, not edited.  |
| `apps/wbs/fe-01/project.json`, `tsconfig.spec.json` and the e2e folder | Packets 110.1 and 040.1.                     |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`              | Packet 110.6 — step 1.4 sequences it.        |
| `eslint.config.js` and any ESLint policy file                          | Task 3 of the rollout.                       |
| `docs/wiki-policy/modules.json` and the wiki pilot path list           | Task 9 of the rollout.                       |

## 14. How to run this packet

Six dispatches, each its own attempt, each reviewed and committed before the next starts. The
batch-2-capable launcher named at the top of section 7 is a prerequisite for all of them.

| Slice | Dispatch as                              | Commit subject                                                           | What the planner reads before saying go on                                   |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1     | "Step 0 and slice 1 only; stop after it" | `feat(wbs-fe): add the plan feed module's contract and index`            | The contract, the README, the pin branch. A wrong contract wastes the rest.  |
| 2     | "Slice 2 only"                           | `feat(wbs-fe): decide what the plan feed has to deliver`                 | The four ledger tests, the pure function, the tier entry, red then green.    |
| 3     | "Slice 3 only"                           | `feat(wbs-fe): own the plan feed's lifetime, stream and acknowledgement` | The twelve lifetime tests, the factory, and that the hook is untouched.      |
| 4     | "Slice 4 only"                           | `refactor(wbs-fe): read the plan through the plan feed module`           | The hook diff against the old effect, line by line, and the oracle's counts. |
| 5     | "Slice 5 only"                           | `docs(wbs-fe): record the plan feed's observed negatives`                | Nineteen observed failure lines and the comments they justify.               |
| 6     | "Slice 6 only"                           | none                                                                     | The report: counts against step 0, the devsync checks, the pending list.     |

Integration is the planner's separate handoff: the whole `tool-devsync:test` target, both frontend
whole targets, the browser suite and the host gate.

### First review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

Every finding was checked against the repository. Where the reviewer said a proof could not produce
its stated result, the mutation was executed in this worktree and the observed output recorded; the
whole extraction was then rehearsed end to end and the tree restored (section 4.11).

| Finding                                                   | Disposition | What changed                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 — the launcher cannot find a batch-2 packet    | Fixed       | Confirmed: `run-executor.sh` builds the batch-1 path and exits 69. Section 7 opens with a planner prerequisite naming the launcher and its per-slice invocation.                                                                                                                   |
| Critical 2 — slice 1 registered a nonexistent suite       | Fixed       | Confirmed, and stronger than reported: `vitest.node.config.ts` sets `include: [...NODE_SUITES]`, so an unlisted suite cannot run even when named — observed `No test files found, exiting with code 1`. The list entry moved into slice 2, beside the file. Section 4.13 says why. |
| Critical 3 — slice 2 could not be committed with hooks    | Fixed       | Confirmed: `unused-imports/no-unused-imports` is an error and lefthook lints staged files. Slice 2 now writes only the two imports `nextDelivery` uses; slice 3 widens them. Every slice lints and formats its own files before its checkpoint.                                    |
| Critical 4 — the supplied tests failed lint               | Fixed       | Confirmed: no `noUncheckedIndexedAccess`, so `opened[0]?.` is an unnecessary condition. Replaced by one `handlersOf` helper using `at(0)`, with the reason in its JSDoc. `bunx eslint` over the whole module now prints nothing.                                                   |
| Critical 5 — baselines were impossible as written         | Fixed       | Per-slice deltas: slice 2 `+1 file/+4 tests`, slice 3 `+0/+12`, slices 4 to 6 unchanged. Step 0 now records the two DOM oracle summaries in the slices that compare them, and slice 6 compares against its own starting status.                                                    |
| Critical 6 — proof 8's named test never reached the guard | Fixed       | Confirmed by running it: with the guard weakened, `plan-read-and-write.test.tsx` passed **88 of 88**. The proof is deleted rather than replaced — the guard is unchanged code, so R5 asks nothing of it — and the coverage gap is recorded as a finding in sections 4.6 and 8.     |
| Critical 7 — proof 1's stated failure was wrong           | Fixed       | Confirmed by running it: the mutation fails the named test with `expected [ …(8) ] to have a length of 1 but got 8`, and its `resume_ack` twin fails too. The inventory now carries the observed line, not a predicted one.                                                        |
| Important 8 — the F2 exception was unauthorised           | Fixed       | Verified the requirement in `openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md`. The exception is gone: `PlanFeed` extends `Store<PlanRefreshSnapshot>` over the owner's own subscribe and snapshot, with a unit test for both halves of the stability rule.        |
| Important 9 — the README pin repeated an absolute count   | Fixed       | Step 1.4 now records the literal it finds and requires that literal plus one. 110.6's own section 11 asks to land first, so branch B is the expected path and it runs 110.6's derived test by name.                                                                                |
| Important 10 — slice 4's placeholder was ambiguous        | Fixed       | Slice 4 now carries the complete `publishPlan` callback as it was rehearsed, and says in words that the four `applied.* =` assignments are deleted.                                                                                                                                |
| Important 11 — the proof instructions left checks bare    | Fixed       | Section 8 is now a nineteen-row inventory: check, comment location, mutation, command, named test, observed failure. It includes the `apply` guard, the `closed` half, `stop()`, `dispose()` and a real distinct-owner mutation for proof 8's comment.                             |
| Important 12 — the hand-over assumed a dirty tree         | Fixed       | Every slice has a commit subject and a path list; slice 6 compares with its own step 0 status and reports the cumulative paths from the commits.                                                                                                                                   |
| Important 13 — "DI Bag is not installed" is false         | Fixed       | Verified `di-bag` 0.4.0 in the root manifest. Every occurrence now says composition through DI Bag is the lifetimes task, in the packet and in the module README.                                                                                                                  |
| Minor 14 — the 110.1 description was stale                | Fixed       | Verified: 110.1 selects the backend `project-assignment-reads` capability. The purported title migration is gone, and unknown 5 is resolved.                                                                                                                                       |
| Minor 15 — the sorted insertion point was wrong           | Fixed       | Verified the list's order. The entry goes immediately before `src/modules/plan-writer/plan-writer.test.ts`.                                                                                                                                                                        |

Two things the review could not see, now in the packet: main has moved and touched no part of the
feed (section 4.1), so every line number here is advisory and every count is relative; and this
packet adds no Nx target, so the `CLAUDECODE=0` defaults a fix branch adds to test-running targets
and the graph guard that checks them ask nothing of it (section 4.13).
