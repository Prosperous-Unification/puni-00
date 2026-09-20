# 040.4 Extract the plan feed: refresh owner, stream, roster

|                                               |                                                                                                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item                                     | 040.4, parent 040 "DI Bag, caught-object-report-json, application-exception into the WBS frontend"                                                                                                              |
| Size class                                    | L                                                                                                                                                                                                               |
| Planning tokens (top model, high effort)      | 6,000,000                                                                                                                                                                                                       |
| Implementation tokens (mid model, mid effort) | 22,000,000                                                                                                                                                                                                      |
| Review tokens (top model, high effort)        | 9,000,000                                                                                                                                                                                                       |
| Design it serves                              | [Code organization design](../../specs/2026-09-19-code-organization-design.md), the `Plan feed` row of its frontend services table, its import matrix, rules F1, F2, K2 and K3, and the project lifetime        |
| Architectural authority                       | `openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md`: K2 forbids delivery importing a resource-service, K3 puts a feature above it, F1 forbids React in a service, F2 requires the store contract |
| Rollout task                                  | [Task 6](../2026-09-19-code-organization-rollout.md), service 2 of 6                                                                                                                                            |
| Execution contract                            | [batch 1 README](../2026-09-19-batch-1/README.md), sections "Execution contract", "Rules for every executor", "Hidden constraints every frontend packet must respect" and "Standard blocks every packet uses"   |
| Predecessor                                   | 040.3, merged: `apps/wbs/fe-01/src/modules/plan-writer/` exists and the hook already delegates every gesture to it                                                                                              |

## 1. Goal and non-goals

**Goal.** Move the plan feed out of React: the refresh owner's lifetime, the stream it opens and
acknowledges, and the decision about which part of an owner snapshot has not been delivered yet.
They become one module with the two kinds the taxonomy requires — a resource-service that owns the
refresh, and a feature-service that owns the reader's lifetime and what reaches the screen — built
by a composition site the hook calls. `usePlanRead` keeps the React half: the twenty state setters,
the tree drawing, the hover card, the drafts sanitizer, and the sentences a refusal is said in.

**Non-goals.** No behaviour change of any kind; an extraction that seems to need one is a stop
condition. No move of `apps/wbs/fe-01/src/lib/plan-refresh.ts`: the refresh owner is the
repository this resource is built over and it stays where it is. No move of `runMarkerWrite`
(calendar markers service), of `stepStack` (history and transfer service), of `settleAgainstSteps`
or of `usePlanReadState`. No move of `PlanReadScope` or of the scope-to-resources mapping
(section 4.9). No presence roster (section 4.8). No DI Bag module: DI Bag 0.4.0 is installed at the
root (batch 1, packet 020.1) and composing these services through it is the rollout's lifetimes
task, Task 6 order 6; until then the composition site is a function, exactly as
`modules/directory-management/composition.ts` is. No rewiring of
`apps/wbs/fe-01/src/lib/plan-refresh-stream.test.ts`, which re-implements this wiring in a fixture
(section 4.10).

## 2. Read first

| Read                                                                                                                       | Why                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                                                                                                | Rules R1 to R5. R5 governs every `Proof:` comment this packet moves.                                                     |
| `LLM_README.md`                                                                                                            | R1: the index first, then only the link the task needs.                                                                  |
| [batch 1 README](../2026-09-19-batch-1/README.md)                                                                          | The execution contract, the standard blocks, the node-tier word list, and "Rule K2 stays strict on the frontend".        |
| [Code organization design](../../specs/2026-09-19-code-organization-design.md)                                             | The import matrix, the module layout, rules F1, F2, K2, K3, the three lifetimes, the `Plan feed` row.                    |
| `openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md`                                                         | The requirements this module is judged against, K2 and F2 among them.                                                    |
| [Rollout plan](../2026-09-19-code-organization-rollout.md), Task 6                                                         | The six bullets of the extraction procedure, and the order that puts the feed second.                                    |
| `apps/wbs/fe-01/src/modules/directory/` and `apps/wbs/fe-01/src/modules/directory-management/`                             | The house pattern this packet copies: resource, feature, composition, and a contract that re-exports for K2.             |
| [040.3 packet](../2026-09-19-batch-1/040-3-plan-writer.md)                                                                 | The shape of a frontend extraction, and what the writer already abstracts from the feed.                                 |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`                                                                       | The source. Everything this packet moves is between `ownerRef` and `refreshOrMarkStale`.                                 |
| `apps/wbs/fe-01/src/lib/plan-refresh.ts`                                                                                   | `PlanRefresh`, `PlanRefreshSnapshot`, `ResourceRead`, `DirectoryRead`, `RefreshFailure`, `resourcesFor`.                 |
| `apps/wbs/fe-01/src/lib/project-stream.ts`                                                                                 | `ProjectStream`: two methods, `seen` and `unsubscribe`.                                                                  |
| `apps/wbs/fe-01/src/modules/store.ts`                                                                                      | The `Store<T>` contract rule F2 requires, which both kinds in this module implement.                                     |
| `apps/wbs/fe-01/src/modules/plan-writer/contract.ts`                                                                       | `PlanWriterHost.readRefreshOwner` — the seam the hook wires the two services through.                                    |
| `apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx`                                                           | The oracle. `describe('refresh owner lifetimes')` and `describe('overlapping resource invalidations')` are the feed's.   |
| `apps/wbs/fe-01/src/components/wbs/project-page.test.tsx`                                                                  | Holds `recovers a persistent %s without replacing the registered socket`, the only test that counts sockets.             |
| `apps/wbs/fe-01/vitest.node-suites.ts`, `apps/wbs/fe-01/vitest.node.config.ts` and `apps/wbs/fe-01/src/test-tiers.test.ts` | How a suite joins the fast node tier — the config's `include` **is** the list — and the guard that refuses a stale list. |
| `openspec/specs/plan-refresh/spec.md`                                                                                      | The accepted specification this extraction must not disturb. Section 10 quotes the two requirements.                     |

## 3. Interfaces

Every code block in this section and in section 7 was written into a private worktree on
2026-09-20, formatted, linted through `wbs-fe-01:lint`, type-checked, and run. Section 4.11 records
what was observed. The executor transcribes rehearsed code; it drafts nothing.

### 3.1 The module, and why it has four source files

The design's import matrix forbids delivery from importing a resource-service (K2) and puts a
feature-service between them (K3). The batch 1 README settles it for this application in as many
words: "Rule K2 stays strict on the frontend. Delivery imports feature-services only." So the
module has both kinds, in one directory, because the feature exclusively owns the resource — which
is the design's own rule for when a feature and a resource share a module.

```text
apps/wbs/fe-01/src/modules/plan-feed/
  README.md                     wiki index
  contract.ts                   the types both kinds and the host exchange
  plan-feed.resource.ts         the resource: refresh owner, stream, acknowledgement, generations
  plan-feed.feature.ts          the feature: the reader's lifetime, and what reaches the screen
  composition.ts                the one place that sees the owner factory and the feature at once
  plan-feed.resource.test.ts    17 tests, node tier
  plan-feed.feature.test.ts     6 tests, node tier
```

`use-plan-read.ts` imports `composition.ts` and the types in `contract.ts`. It imports neither
`plan-feed.resource.ts` nor `createPlanRefresh`, which is stricter than the tree it starts from:
the hook imports the owner factory today.

### 3.2 `contract.ts`

This is the complete file.

```ts
import type {
  DirectoryRead,
  PlanRefresh,
  PlanRefreshSnapshot,
  RefreshFailure,
  RefreshResource,
} from '@/lib/plan-refresh';
import type { ProjectStream } from '@/lib/project-stream';
import type { CalendarMarkerView, PlanRead, StepView } from '@/lib/wbs-api';
import type { Store } from '@/modules/store';

/**
 * Re-exported so delivery imports this module and no other: rule K2 says a
 * screen sees a feature-service and never the resource-service beneath it. The
 * same line stands in `modules/directory-management/contract.ts`, for the same
 * rule.
 */
export type { PlanRefreshSnapshot, RefreshResource };

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
 * What one publication has for its reader, and nothing it has already had.
 *
 * A **delta** over the store snapshot below: each installed member is null when
 * that resource has nothing new, so a reader applies exactly what moved and
 * leaves the rest of the screen alone. Null means "unchanged", never "empty".
 *
 * `treeFailure` carries the **cause** and not a sentence. Saying things to a
 * person is the Notices module's job and lives in delivery until that module
 * exists; a service that imported the refusal vocabulary would be importing
 * upward out of `components/`, which the import matrix forbids.
 */
export interface PlanFeedDelivery {
  readonly staleResources: readonly RefreshResource[];
  readonly treeFailure: { readonly cause: unknown } | null;
  readonly directory: DirectoryRead | null;
  readonly tree: { readonly value: PlanRead; readonly generation: number } | null;
  readonly steps: readonly StepView[] | null;
  readonly markers: readonly CalendarMarkerView[] | null;
}

/** A refusal this feed owes the reader, in the terms its words are built from. */
export interface PlanFeedRefusal {
  readonly cause: unknown;
}

/**
 * What the feed's stream tells it.
 *
 * Declared here rather than imported from the plan read hook, which exports a
 * structurally identical `SubscriptionHandlers`: a service does not import from
 * its delivery. The two are assignable in both directions, which is what lets
 * the composition site pass this object straight to the hook's `subscribe`
 * prop.
 */
export interface PlanFeedStreamHandlers {
  /** See `ProjectStreamOptions.onChange`: what the frame said changed, or `null`. */
  onChange: (changed?: string | null, seq?: number) => void;
  onConnectionChange: (connected: boolean) => void;
}

/**
 * What the reading needs from whoever built it.
 *
 * `isLive` is the whole of what this resource knows about lifetimes: whether
 * anybody is still listening. **Who** that is — which project, which API,
 * whether the screen has been torn down — is the feature's knowledge, and it
 * answers this one question on the resource's behalf.
 */
export interface PlanReadingPorts {
  readonly openOwner: () => PlanRefresh;
  readonly openStream:
    ((handlers: PlanFeedStreamHandlers, baseline: number) => ProjectStream) | null;
  readonly isLive: () => boolean;
  readonly deliver: (delivery: PlanFeedDelivery) => void;
  readonly reportFailures: (failures: readonly RefreshFailure[]) => void;
  readonly reportConnection: (connected: boolean) => void;
}

/**
 * One project's refresh, its stream and its generations.
 *
 * The **resource**-service: the quirks and invariants of one resource — the
 * plan as this browser holds it — its staleness, its refresh and its stream
 * replay, which is what the design says a frontend resource-service holds. It
 * imports no React (F1) and exposes the store contract (F2) over the refresh
 * owner, whose snapshot object is rebuilt only when something in it changed.
 */
export interface PlanReading extends Store<PlanRefreshSnapshot> {
  /** The refresh owner of this reading — see {@link PlanFeed.owner}. */
  readonly owner: PlanRefresh;
  /**
   * Reads these resources again, awaiting the covering outcome.
   *
   * Failures are not thrown: they stay in the owner's snapshot and reach the
   * screen as the stale banner on the next publication.
   */
  readonly rereadResources: (resources: readonly RefreshResource[]) => Promise<void>;
  /** Stop listening, dispose the owner, drop the stream. */
  readonly close: () => void;
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
  readonly openOwner: () => PlanRefresh;
  readonly openStream:
    ((handlers: PlanFeedStreamHandlers, baseline: number) => ProjectStream) | null;
  /**
   * Whether this feed still owns the screen: the same project and the same API
   * it was opened for.
   *
   * Separate from the feed being closed, and both are needed. A render can
   * install new props before the effect that closes this feed has run, and work
   * already in flight must know it no longer owns the table by then.
   */
  readonly isActiveReader: () => boolean;
  /** Hands the reader everything that changed since the last publication. */
  readonly publish: (delivery: PlanFeedDelivery) => void;
  /** Announces one refusal to whoever says things to the reader. */
  readonly announceRefusal: (refusal: PlanFeedRefusal) => void;
  /** Says whether the socket carrying other people's changes is up. */
  readonly setConnected: (connected: boolean) => void;
}

/**
 * The live plan on screen, for as long as this reader owns it.
 *
 * The **feature**-service, and the only thing delivery sees: one piece of
 * user-facing value — the table keeps up with other people's changes, and stops
 * the moment this reader leaves — coordinated over one resource-service. It
 * imports no React (F1) and passes on the store contract (F2).
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
  /** Reads these resources again, awaiting the covering outcome. */
  readonly rereadResources: (resources: readonly RefreshResource[]) => Promise<void>;
  /** Ends this lifetime: nothing after it reaches the screen. */
  readonly close: () => void;
}
```

### 3.3 What does not change

`usePlanRead`'s parameter object and its return object
(`{ refreshOrMarkStale, run, stepStack, runMarkerWrite }`), `SubscriptionHandlers`,
`PlanReadScope`, `WbsTableProps`, `PlanRefresh`, `createPlanRefresh`, `ProjectStream`, and every
export of `plan-writer/contract.ts`. So `wbs-table.tsx`, `project-page.tsx`, `plan-toolbar.tsx` and
`use-plan-dependencies.ts` are **not** edited.

## 4. Verified facts

Everything below was read or run on 2026-09-20 at packet head `6484986e`. **Line numbers are not
given as targets**: main has moved and will be merged into the batch before this packet runs, so
every anchor is a symbol name or a quoted line of code, and every count is recorded by the executor
in its own step 0 and compared relatively.

### 4.1 What main changed, and what it did not

`git show origin/main:apps/wbs/fe-01/src/components/wbs/use-plan-read.ts` differs from the packet
head's copy in four hunks, **all** of them the plan writer's extraction (the React import, the
refusal imports, the `run` callback and the return statement). Main touched no part of the feed:
not `applySnapshot`, not the subscription effect, not either refresh callback. Main's
`project-page.tsx` still declares the roster in the same `useState` beside the same `subscribe`
factory; locate both by symbol, because the line numbers differ in both trees. Main added
`src/components/wbs/plan-viewport.test.ts` to the node tier, which moves that tier's totals and
nothing this packet depends on.

### 4.2 What is left in the hook, and what of it is the feed

| Symbol                        | This packet                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `ownerRef`, `activeApi`       | `ownerRef` becomes `feedRef`; `activeApi` is untouched                        |
| `settleAgainstSteps`          | stays: it edits estimate drafts and held refusals, which are view state       |
| `applySnapshot`               | splits: the generation ledger moves, the twenty setters stay as `publishPlan` |
| the subscription effect       | moves, except the two sentences it says, which stay in delivery               |
| `refreshResourcesOrMarkStale` | the owner policy moves; the reader guard stays (section 4.6)                  |
| `refreshOrMarkStale`          | stays (section 4.9)                                                           |
| `runMarkerWrite`              | stays; two lines change because `ownerRef` is gone                            |
| the plan writer's `useMemo`   | stays; one line changes for the same reason                                   |
| `stepStack`                   | stays; two lines change for the same reason                                   |

The effect opens `const owner = createPlanRefresh({ projectId, api });` and closes with the
dependency array `[activeProject, api, projectId, applySnapshot, pushToast, setConnected, subscribe]`.
`applySnapshot` sets the stale flag and the failure sentence, then the baseline gate, then four
blocks each opened by an `installed.generation > applied.<resource>` test, in the order directory,
tree, steps, markers.

### 4.3 The `Proof:` comments, and which of them move

R5: a proof comment is never carried across a move unwatched. Three move into the module; two stay
in delivery, because what they guard stays there — the sentence a failure is said in. All five are
re-observed in slice 6.

| Comment, by its first words                                         | After this packet                                      | Proof |
| ------------------------------------------------------------------- | ------------------------------------------------------ | ----- |
| `reusing the disposed owner left zero subscriptions instead of one` | moves, above `const owner = openOwner();`              | 8     |
| `restoring epoch replacement opened two sockets instead of one …`   | moves, above `streamSequence = snapshot.baseline.seq;` | 1     |
| `removing this gate exposed a textarea instead of null …`           | moves, above the baseline gate in `nextDelivery`       | 3     |
| `suppressing this failure text left the peer-refetch window …`      | stays, above `setTreeFailureText` in `publishPlan`     | 4     |
| `using the bare failure code here left the unavailable-plan …`      | stays, inside the hook's `announceRefusal` port        | 6     |

Three further comments inside `applySnapshot` (the hover card pair, the slices, the
`estimateMethod` rename) belong to the setters, stay with them, and are not re-observed.

### 4.4 The guards with no test, which is why this module has its own suites

The four generation comparisons are the feed's most important decision and no existing suite
separates them from the code around them. Two DOM tests exercise the held-read case —
`installs held directory labels after a newer tree already installed` and
`installs a held renamed step with competing tree=%s` — but both watch a payload that **is** newer
than what was applied, so removing the comparison leaves them green: applying a payload twice is
invisible to them. The same is true of the lifetime guards inside `apply`, `onChange` and the
first read's callback: when the API prop changes the cleanup disposes the old owner, and a disposed
owner publishes nothing (`plan-refresh.ts`, `publish` returns early when disposed), so no DOM case
reaches them through a live owner.

This is the coverage gap 040.3 hit for its success-path guard, the twenty-ninth entry of
`docs/findings/checks-that-cannot-fail-puni-00.md`. The answer is the same: the moved code gets
node-tier suites that can fail, written before the move. Section 8 records the failure every one of
the twenty-three mutations actually produced, including one for each lifetime guard.

### 4.5 What the writer already abstracts, and what the hook must therefore keep

`plan-writer/contract.ts` declares `readRefreshOwner: () => PlanRefresh | null` and the service
uses the answer **only** for identity comparisons. So the feature exposes the owner and nothing
changes on the writer's side: the hook's port becomes `() => feedRef.current?.owner ?? null`.
`plan-writer.feature.ts` is **not** edited. `runMarkerWrite` and `stepStack` read
`ownerRef.current` the same way, and `runMarkerWrite` also calls
`owner.invalidate({ resources: ['markers'] })` on it; both get the same substitution and stay.

### 4.6 Why the reader guard stays in the hook's reread callback, and what that is worth

`refreshResourcesOrMarkStale` opens with
`if (owner === null || activeProject.current !== projectId || activeApi.current !== api) return;`.
`projectId` and `api` there are **the render that built the callback's**, because its dependency
array is `[activeProject, api, projectId]`. A departed caller's callback compares the live refs
against its own project and API, sees they have moved, and returns.

If that guard moved into the feature, a departed caller would reach `feedRef.current`, which is the
**replacement** feed, whose `isActiveReader` compares the live refs against its own project and API
— both current — and the reread would run against the new owner. The plan writer never reaches it
(it checks `isCurrent()` first on both paths), but `plan-toolbar.tsx`'s
`recoverAmbiguousSettingsChange` calls `refreshOrMarkStale()` with no guard of its own.

**Measured, and it is a finding.** With the guard weakened to `if (feed === null) return;`,
`plan-read-and-write.test.tsx` passed **88 of 88**. No test in that suite separates it. It is
unchanged code, so R5 asks nothing new of it, and an extraction keeps what it cannot prove is safe
to drop — but the gap is real and belongs in
[checks that cannot fail](../../../findings/checks-that-cannot-fail.md) as a finding. The packet
claims no negative for it and the executor does not mutate it.

### 4.7 Rules F1, F2, K2 and K3, and where each is satisfied

| Rule | Requirement                                             | Where it is met                                                                                                                                                  |
| ---- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1   | A service file never imports React                      | The four module files import only `@/lib/*` and `@/modules/store`. Verified by reading, and by the suites running under `--environment node`.                    |
| F2   | One store contract: subscribe and a stable snapshot     | `PlanReading` and `PlanFeed` both extend `Store<PlanRefreshSnapshot>` over the owner's own `subscribe` and `getSnapshot`. Two unit tests pin the stability rule. |
| K2   | Delivery imports feature-services only                  | `use-plan-read.ts` imports `composition.ts` and `contract.ts`. It imports no `.resource` file and no owner factory.                                              |
| K3   | A feature imports resource-services, never a repository | `plan-feed.feature.ts` imports `plan-feed.resource.ts` and nothing below it; the owner factory is passed in as a port.                                           |

Nothing in the module imports from `components/`. That is a deliberate change of direction from the
merged plan-writer module, which reaches up to `components/wbs/plan-refusal.ts` — the misfiled
refusal vocabulary batch 1 recorded as a finding. This packet does not move that file; it stops
needing it, by carrying causes rather than sentences (section 3.2) and leaving `refusalSentence`
where it already runs today, in the hook.

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
`Stream connector` row of the design's own table.

### 4.9 `PlanReadScope` stays, and so does the scope mapping

`PlanReadScope` is declared in `use-plan-read.ts` with the long JSDoc explaining why two of its
three values are sound, and it is imported by `plan-toolbar.tsx` and `use-plan-dependencies.ts`.
Moving it would edit both of those files, which belong to work item 040.5 and not to this batch. So
the type and the five-line mapping in `refreshOrMarkStale` stay, and the feature's surface is
`rereadResources` only. The hook keeps `ALL_RESOURCES` and `type RefreshResource` from
`@/lib/plan-refresh` for that mapping: a constant and a type, not a service, and fewer imports from
that module than the tree this packet starts from.

### 4.10 A fixture re-implements the wiring, and this packet leaves it alone

`lib/plan-refresh-stream.test.ts` builds the owner, subscribes, opens a `subscribeToProject` stream
on the first baseline and forwards `seen` — the same policy this packet extracts, written a second
time. A real duplication and a real finding, recorded here. It is **not** edited: rewriting that
fixture onto the module would change what the two "real API and stream" cases prove while this
extraction is being judged.

### 4.11 The whole extraction was rehearsed, and these are the numbers

On 2026-09-20 the planner cut a private worktree from the packet head
(`git worktree add --detach`, `bun install --frozen-lockfile`), wrote every file of section 3 and
section 7 into it, rewired the hook exactly as slice 5 prescribes, ran the checks below, ran all
twenty-three mutations of section 8, and removed the worktree. The shared planning tree was never
touched.

| Check                                                                                                | Observed                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                                                         | Exit 0                                            |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                                    | Exit 0                                            |
| The module's two suites, node tier                                                                   | `Test Files 2 passed (2)`, `Tests 23 passed (23)` |
| The sandbox unit command, with the module                                                            | `40 passed (40)` files, `598 passed (598)` tests  |
| `plan-read-and-write.test.tsx`, `project-page.test.tsx`, `optimization-integration.test.tsx`, before | `3 passed (3)`, `167 passed (167)`                |
| The same three, with the hook rewired                                                                | `3 passed (3)`, `167 passed (167)`                |

**The extraction is behaviour-free against the oracle, measured, not argued.** The unit delta is
two files and twenty-three tests: four for the ledger, thirteen for the reading, six for the
feature. These absolute numbers are orientation only; every comparison the executor makes is
against its own step 0.

### 4.12 The README count pin, and the packet that removes it

`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` pins `applicationLibraryToolReadmes` at a
literal above five re-pin comments. A new module README moves that number by one, and the failure
appears as soon as the file exists, because the count comes from `git ls-files` including untracked
files.

Packet 110.6 replaces that pin with a derived enumeration and a test named
`the current-document sweep reaches every application, library and tool README`, and its own
section 11 asks to land first, in which case "040.4 no longer needs its branch A at all". So
**branch B is the expected path** and branch A is the fallback; neither hardcodes a number. Step
1.4 records the literal it finds and requires that literal plus one.

**Packet 020.2 edits the same field**, conditionally, in its slice C4, and 110.6 names both packets
as consumers of this shared state. If branch A is still possible when this packet runs, the two
must run one after the other with a commit in between, and whichever runs second records the pin
afresh rather than assuming what the first left.

### 4.13 Targets, tiers and the node-tier word list

From `apps/wbs/fe-01/project.json`: `test`, `test:unit`, `lint`, `lint:fast`, `typecheck`, `build`,
`e2e`, `e2e-packaged`, `serve`, `serve-local-solver`. The `lint` target lists `apps/wbs/fe-01/src`
explicitly and `tsconfig.app.json` includes `src/**/*.ts`, so new files under `src` are linted and
type-checked with no project file edit. **This packet adds no Nx target**, so it owes nothing to the
`CLAUDECODE=0` and `AGENT=0` defaults the fix branch adds to every test-running target name, and
nothing to the graph-walking guard in `tools/tool-devsync/src/workspace-targets.test.ts`.

`vitest.node.config.ts` sets `include: [...NODE_SUITES]`. A suite that is not in the list **cannot
be run** by the node tier, even by naming it on the command line: the rehearsal observed
`No test files found, exiting with code 1` with the file present and unlisted.
`src/test-tiers.test.ts` separately refuses a list that names a file which does not exist, that
disagrees with what the directory holds, or that breaks the tier partition. The two together are
why each test file and its list entry land in the **same** slice.

That guard also refuses a node-tier suite whose own text matches
`/@testing-library|\bdocument\b|\bwindow\b|\blocation\b|WebSocket|localStorage|matchMedia|getComputedStyle|HTMLElement|\bnavigator\b|jsdom/`,
and a node-tier suite must be `.ts`, not `.tsx`. The two suites below never say "window",
"document" or "WebSocket"; they say interval, page and socket.

## 5. Unknowns

| #   | Unknown                                                                                   | Resolution                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Whether building the feed inside the effect body changes anything about ordering.         | **Resolved by the rehearsal**: the oracle is 167 of 167 either way. Nothing reads the feed during the synchronous establish; the callers are state setters.   |
| 2   | Whether the generation and lifetime guards are unpinned by the DOM suites.                | **Resolved**: section 8 records what each of the twenty-three mutations failed. The node suites catch every one; the DOM suites catch nine.                   |
| 3   | Whether `wbs-fe-01:test` passes in full after main is merged, and what its summaries say. | Planner-only. The executor records the sandbox unit command and the DOM oracle in its own step 0.                                                             |
| 4   | Whether 110.6 has already derived the README pin, or 020.2 has moved it.                  | Step 1.4 reads the pin and follows one of two named branches, recording the literal rather than assuming it. Neither branch is a stop.                        |
| 5   | Whether any batch 2 packet renames the oracle's test titles.                              | **Resolved**: 110.1 selects the backend `project-assignment-reads` capability and cites its identifiers in backend assignment tests. It renames nothing here. |

## 6. File plan

| File                                                              | Action  | Responsibility                                                               |
| ----------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| `apps/wbs/fe-01/src/modules/plan-feed/README.md`                  | created | Wiki index: the two kinds, what each owns, how it is read, its checks        |
| `apps/wbs/fe-01/src/modules/plan-feed/contract.ts`                | created | The types both kinds and the host exchange                                   |
| `apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.ts`      | created | The resource: refresh owner, stream, acknowledgement, generation ledger      |
| `apps/wbs/fe-01/src/modules/plan-feed/plan-feed.feature.ts`       | created | The feature: the reader's lifetime and what reaches the screen               |
| `apps/wbs/fe-01/src/modules/plan-feed/composition.ts`             | created | The composition site delivery calls                                          |
| `apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.test.ts` | created | 17 tests: the ledger and the reading                                         |
| `apps/wbs/fe-01/src/modules/plan-feed/plan-feed.feature.test.ts`  | created | 6 tests: the reader's lifetime and its announcements                         |
| `apps/wbs/fe-01/vitest.node-suites.ts`                            | edited  | Two new entries, each in the slice that creates its file                     |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`              | edited  | The effect calls the composition site; `applySnapshot` becomes `publishPlan` |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`         | edited  | One line: the README count pin, **only on branch A of step 1.4**             |

Ten files, or nine on branch B, which is the expected case.

**Neighbouring batch 2 packets.** 110.6 owns the whole of `repo-namespacing-handoff.test.ts` and
asks to land before this packet. **020.2 conditionally edits the same pinned field** (its slice C4):
if branch A is still possible, the two packets run one after the other with a commit between them,
and the second records the pin afresh — landing 110.6 first removes the overlap altogether. 110.1
adds level targets to project files and cites scenario identifiers in the backend
`project-assignment-reads` capability; it touches no file here. 040.1 works in
`apps/wbs/fe-01/e2e`, `apps/wbs/fe-01/tsconfig.spec.json` and a root-level test file — no file
here, but it **does** add `browser-packages.test.ts` with three tests to the frontend's full suite,
which slice 7's reconciliation accounts for. 040.5 edits this same hook next and is not in this
batch: leave `refreshOrMarkStale`, `PlanReadScope`, `plan-toolbar.tsx` and
`use-plan-dependencies.ts` exactly as they are. 010.6, 010.7 and 020.7 share no file.

## 7. Slices

Seven slices. Each is dispatched on its own, starts with step 0, ends green, and carries its own
commit subject and path list so the planner can commit it before the next begins.

**How the planner dispatches them.** `puni-plan/exec/run-executor.sh` takes `--batch batch-2`,
which selects `docs/superpowers/plans/2026-09-20-batch-2` as the packet directory,
`/home/df/wd/puni/batch-2` as the clone root, `batch-2/` as the branch prefix and
`/tmp/puni-batch2` as the temporary root. The first slice:

```sh
puni-plan/exec/run-executor.sh 040-4-plan-feed slice-1 <integration-head-sha> --batch batch-2
```

and every slice after it, once the previous one is reviewed and committed:

```sh
puni-plan/exec/run-executor.sh 040-4-plan-feed slice-2 <that-commit-sha> --batch batch-2 --resume
```

`--resume` keeps the same clone, so the planner checks that the clone's HEAD is the commit it just
made (`git -C /home/df/wd/puni/batch-2/040-4-plan-feed rev-parse HEAD`) before dispatching, and the
ledger records the pair.

### Step 0 — Baseline, at the start of every slice

Nothing is edited in this step.

- [ ] `git rev-parse HEAD` and `git status --short --untracked-files=all`. Record both. This is
      **this slice's** starting status; slice 7 compares against it. Earlier slices are committed,
      so their files are not in it.
- [ ] Run the **sandbox unit command** and record its `Test Files` and `Tests` lines:

```sh
(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
  --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts)
```

Expected: exit 0. Call the two numbers **F0** and **T0** for this slice. Every expectation below is
relative to this slice's own F0 and T0. **Never** run `wbs-fe-01:test:unit` or `wbs-fe-01:test`:
three of their tests spawn `bun` from Node and the sandbox refuses that with `spawnSync bun EPERM`.

- [ ] In slices 5, 6 and 7 only, also record the DOM oracle, which is what says the extraction
      changed nothing:

```sh
(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
  src/components/wbs/plan-read-and-write.test.tsx)
(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
  src/components/wbs/project-page.test.tsx src/components/wbs/optimization-integration.test.tsx)
```

Expected: exit 0 from both. Record both summaries; call them **D1** and **D2**. For orientation
only, the planner saw 88 tests in the first and 79 in the second at the packet head.

### Slice 1 — The contract and the README

Commit subject: `feat(wbs-fe): add the plan feed module's contract and index`. Paths:
`apps/wbs/fe-01/src/modules/plan-feed/contract.ts`,
`apps/wbs/fe-01/src/modules/plan-feed/README.md`, and on branch A
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`.

- [ ] `mkdir -p apps/wbs/fe-01/src/modules/plan-feed`
- [ ] Write `contract.ts` exactly as section 3.2 gives it.
- [ ] Write `README.md` with this content. Leave it free of Markdown links and give it no
      `module-index` comment, for 040.3's reasons: every relative link in a current document is
      resolved by the devsync checks, and a module identity needs `docs/wiki-policy/modules.json`,
      which is out of lane.

```markdown
# Plan feed

One project's reading of the plan: the refresh owner of this project and API lifetime, the live
subscription it opens once an anchor exists, the sequence it acknowledges, and the decision about
which part of an owner snapshot the reader has not been given yet.

Two kinds in one module, because the feature exclusively owns the resource. Both are plain
TypeScript and import no React, which is rule F1 of the code organization design in
`docs/superpowers/specs/2026-09-19-code-organization-design.md`, and both expose the one store
contract in `apps/wbs/fe-01/src/modules/store.ts`, which is rule F2.

- `plan-feed.resource.ts` is the **resource**-service: one aggregate — the plan as this browser
  holds it — its staleness, its refresh and its stream replay.
- `plan-feed.feature.ts` is the **feature**-service: the live plan on screen for as long as this
  reader owns it, which is what a screen asks for and the only thing delivery may import (rule
  K2).
- `composition.ts` is where the refresh owner's factory and the feature meet. A screen calls it.

## What the resource owns

- The refresh owner's lifetime: built for one project and one API, closed with them.
- Opening the stream exactly once, when the first anchored read has landed, at that anchor's
  sequence; and never opening a second one during a recovery.
- Acknowledging a covered sequence to the stream, and only ever forwards.
- Routing what a frame said changed: an unsequenced frame asks for a fresh baseline, a named one
  asks for the resources it names.
- The generation ledger: which of the four resources has something the reader has not had, and
  the rule that nothing below the anchor is published before the anchor is.
- What "read again" means when nothing is anchored yet and something is stale.

## What the feature owns

Whether this reader still owns the screen, at the two moments that question has different answers:
the project or the API changing under it, and the screen closing. Everything the resource produces
passes through that one test on its way out — a publication, a refusal of the first read, a
connection change — so a reader that has gone is told nothing.

## What neither owns

Anything React holds, and any sentence. The rows, the chart payload, the vocabularies, the undo
stack, the estimate drafts and the hover card belong to the plan read hook, which applies each
delivery to them; a refusal travels as its **cause**, and the words for it are built where they
are said. Gestures belong to the plan writer beside this module. Presence stays with the page that
renders the header.

## How it is read

Two ways, over one source of truth. The store contract — `subscribe` and `snapshot`, the refresh
owner's own, whose snapshot object is rebuilt only when something in it changed — is what any
future reader selects from. Beside it, the host is handed a **delivery**: what changed since the
last publication, computed from that same snapshot and the generations already applied. Today's
reader is twenty React states and two refs mutated in one pass, so it takes the delta; turning it
into a selected snapshot is the lifetimes task of the rollout plan, not an extraction.

## Relationships

There is no `module.ts`: DI Bag 0.4.0 is installed but nothing in this application is composed
through it yet, which is the rollout's lifetimes task, so `composition.ts` is a function, as
`modules/directory-management/composition.ts` is. Its one caller today is
`apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, which also wires this feed to the plan writer
module beside it: the writer compares the owner's identity and sends its rereads back through the
hook.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suites are
`plan-feed.resource.test.ts` and `plan-feed.feature.test.ts`. The behaviour this extraction
preserves is proved by the plan table's and the project page's own suites, which run in the `test`
target of the same project.
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

**Branch A — the command prints exactly one line.** Record the number; call it **N**. First watch
the pin fail, running that one test by name and never the whole file, which also holds the index
checker:

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

Rerun the same named test: expected `1 pass`, `0 fail`. This is the one existing assertion this
packet is authorized to change, and stop condition 1 exempts exactly it. Nothing else in that
pinned object moves — `categories`, `occurrences`, `digest` and `unclassified` are built only from
source and configuration paths, and the predicate behind them rejects every `.md`. If one of them
moves, stop.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0. This slice declares the types every
      later slice implements against; a variance mistake is cheapest to find now.
- [ ] Lint and format this slice's files, then check the repository. Every checkpoint does this,
      because the planner commits it with hooks enabled and lefthook runs ESLint and a Prettier
      check over the staged files:

```sh
NX_DAEMON=false bunx nx run wbs-fe-01:lint
bunx prettier --write \
  apps/wbs/fe-01/src/modules/plan-feed/README.md \
  apps/wbs/fe-01/src/modules/plan-feed/contract.ts
NX_DAEMON=false bunx nx format:check --all
```

On branch A add `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` to the write list.
Expected: lint exits 0; Prettier prints one line per file; the repository check exits 0 or names
only files outside this packet, which are reported and left alone.

- [ ] The sandbox unit command → exit 0, **F0** files and **T0** tests. This slice adds no suite.

**Stop after slice 1.** Checkpoint A.

### Slice 2 — The generation ledger, red then green

Commit subject: `feat(wbs-fe): decide what the plan feed has to deliver`. Paths:
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.ts`,
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.test.ts`,
`apps/wbs/fe-01/vitest.node-suites.ts`.

- [ ] Write `plan-feed.resource.test.ts` with this header and this first `describe`. Slice 3 widens
      the imports and appends the second block. **No word of this file may match the node-tier
      evidence pattern of section 4.13.**

```ts
import { describe, expect, it } from 'vitest';

import type { DirectoryRead } from '@/lib/plan-refresh';
import type { CalendarMarkerView, StepView } from '@/lib/wbs-api';
import { planRead } from '@/testing/views';

import type { AppliedGenerations, PlanRefreshSnapshot } from './contract';
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

  it('says which resources are stale and carries the failed tree read’s cause', () => {
    const cause = new Error('forbidden');
    const { delivery } = nextDelivery(
      snapshotOf({
        baseline: ANCHORED,
        staleResources: ['tree', 'markers'],
        tree: { desired: 2, reading: false, installed: null, failure: { generation: 2, cause } },
      }),
      NOTHING_APPLIED,
    );

    expect(delivery.staleResources).toEqual(['tree', 'markers']);
    expect(delivery.treeFailure).toEqual({ cause });
  });
});
```

- [ ] Add `  'src/modules/plan-feed/plan-feed.resource.test.ts',` to `NODE_SUITES` in
      `apps/wbs/fe-01/vitest.node-suites.ts`, immediately **before**
      `  'src/modules/plan-writer/plan-writer.test.ts',`. The entry and the file land in the same
      slice on purpose: the node config's `include` **is** this list, so an unlisted suite cannot
      run at all, and `src/test-tiers.test.ts` fails on a listed file that does not exist.
- [ ] Run the sandbox unit command. Expect a **failure**: the new suite cannot resolve
      `./plan-feed.resource`. Record the exact message. This is the red state.
- [ ] Create `apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.ts` with exactly this. The
      imports are the ones this slice uses and no others, because the planner commits this
      checkpoint with hooks enabled and `unused-imports/no-unused-imports` is an error. The one
      `Proof:` comment is the one standing in `use-plan-read.ts` today, copied with not a word
      changed.

```ts
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
  const treeFailure =
    snapshot.tree.failure === null ? null : { cause: snapshot.tree.failure.cause };
  // Publish the first table with its column vocabulary. The tree anchor
  // alone would expose editors which the initial steps read then remounts.
  // Proof: removing this gate exposed a textarea instead of null in
  // `does not expose a first editor before its held column vocabulary installs`.
  if (snapshot.baseline === null) {
    return {
      delivery: {
        staleResources,
        treeFailure,
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
      treeFailure,
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

- [ ] Run the sandbox unit command → exit 0, **F0 + 1** files and **T0 + 4** tests.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0, then
      `bunx prettier --write` this slice's three files and `NX_DAEMON=false bunx nx format:check --all`.

**Stop after slice 2.** Checkpoint B.

### Slice 3 — The reading, red then green

Commit subject: `feat(wbs-fe): own the plan feed's refresh, stream and acknowledgement`. Paths:
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.ts`,
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.test.ts`.

- [ ] Widen the import block of `plan-feed.resource.test.ts` to exactly this:

```ts
import { describe, expect, it } from 'vitest';

import type {
  DirectoryRead,
  PlanRefresh,
  RefreshOutcome,
  RefreshResource,
} from '@/lib/plan-refresh';
import type { CalendarMarkerView, StepView } from '@/lib/wbs-api';
import { planRead } from '@/testing/views';

import type {
  AppliedGenerations,
  PlanFeedDelivery,
  PlanFeedStreamHandlers,
  PlanReadingPorts,
  PlanRefreshSnapshot,
} from './contract';
import { createPlanReading, nextDelivery } from './plan-feed.resource';
```

- [ ] Append the fakes and this second `describe`. The file then carries **seventeen** tests.

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

/** The ports over one fake owner, recording everything the reading asked for. */
function portsOver(
  owner: PlanRefresh,
  over: Partial<PlanReadingPorts> = {},
): {
  ports: PlanReadingPorts;
  deliveries: PlanFeedDelivery[];
  reported: unknown[];
  connections: boolean[];
  opened: { baseline: number; handlers: PlanFeedStreamHandlers }[];
  acknowledged: number[];
  unsubscribed: number;
} {
  const deliveries: PlanFeedDelivery[] = [];
  const reported: unknown[] = [];
  const connections: boolean[] = [];
  const opened: { baseline: number; handlers: PlanFeedStreamHandlers }[] = [];
  const acknowledged: number[] = [];
  const record = { unsubscribed: 0 };
  const ports: PlanReadingPorts = {
    openOwner: () => owner,
    isLive: () => true,
    openStream: (handlers, baseline) => {
      opened.push({ baseline, handlers });
      return {
        seen: (seq) => acknowledged.push(seq),
        unsubscribe: () => {
          record.unsubscribed += 1;
        },
      };
    },
    deliver: (delivery) => deliveries.push(delivery),
    reportFailures: (failures) => {
      for (const failure of failures) reported.push(failure.cause);
    },
    reportConnection: (connected) => connections.push(connected),
    ...over,
  };
  return {
    ports,
    deliveries,
    reported,
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
 * below would be an unnecessary condition and lint refuses it.
 */
function handlersOf(opened: { handlers: PlanFeedStreamHandlers }[]): PlanFeedStreamHandlers {
  const first = opened.at(0);
  if (first === undefined) throw new Error('the anchor opened no stream');
  return first.handlers;
}

const ANCHORED_SNAPSHOT = snapshotOf({ baseline: ANCHORED, acknowledged: 7 });

describe('one project’s reading', () => {
  it('reads the plan as soon as it is built', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);

    createPlanReading(recorded.ports);

    expect(fake.asked).toEqual(['initialize']);
    expect(fake.listeners).toHaveLength(1);
  });

  it('delivers nothing while it is not live', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner, { isLive: () => false });

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);

    expect(recorded.deliveries).toEqual([]);
    expect(recorded.opened).toEqual([]);
  });

  it('opens one stream when the anchor lands, and no more', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);
    fake.show(snapshotOf({ baseline: { seq: 9, epoch: 2 }, acknowledged: 9 }));

    expect(recorded.opened).toHaveLength(1);
    expect(recorded.opened.at(0)?.baseline).toBe(7);
  });

  it('opens nothing for a reader with no stream of its own', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner, { openStream: null });

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);

    expect(recorded.deliveries).toHaveLength(1);
    expect(recorded.opened).toEqual([]);
  });

  it('acknowledges a sequence only once it has moved forward', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);
    fake.show(snapshotOf({ baseline: ANCHORED, acknowledged: 7 }));
    fake.show(snapshotOf({ baseline: ANCHORED, acknowledged: 11 }));

    expect(recorded.acknowledged).toEqual([11]);
  });

  it('asks for a fresh anchor for an unsequenced change and for the named resources otherwise', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);
    const handlers = handlersOf(recorded.opened);
    handlers.onChange();
    handlers.onChange('tree_replaced', 8);

    expect(fake.asked).toEqual(['initialize', 'initialize', 'invalidate']);
    expect(fake.invalidations).toEqual([{ resources: ['tree'], seq: 8 }]);
  });

  it('ignores a change and a connection that arrive after it stops being live', () => {
    const fake = fakeOwner();
    let live = true;
    const recorded = portsOver(fake.owner, { isLive: () => live });

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);
    const handlers = handlersOf(recorded.opened);
    live = false;
    handlers.onChange('tree_replaced', 8);
    handlers.onConnectionChange(false);

    expect(fake.invalidations).toEqual([]);
    expect(recorded.connections).toEqual([]);
  });

  it('reports the connection while it is live', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);
    handlersOf(recorded.opened).onConnectionChange(false);

    expect(recorded.connections).toEqual([false]);
  });

  it('reports every refusal of the first read', async () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);
    const cause = new Error('forbidden');

    createPlanReading(recorded.ports);
    fake.firstRead({ status: 'failed', failures: [{ resource: 'tree', cause }] });
    await Promise.resolve();

    expect(recorded.reported).toEqual([cause]);
  });

  it('reports no refusal of a first read that answers after it stops being live', async () => {
    const fake = fakeOwner();
    let live = true;
    const recorded = portsOver(fake.owner, { isLive: () => live });

    createPlanReading(recorded.ports);
    live = false;
    fake.firstRead({
      status: 'failed',
      failures: [{ resource: 'tree', cause: new Error('forbidden') }],
    });
    await Promise.resolve();

    expect(recorded.reported).toEqual([]);
  });

  it('rereads by invalidating, and resynchronizes when nothing is anchored and something is stale', async () => {
    const fake = fakeOwner();
    const reading = createPlanReading(portsOver(fake.owner).ports);

    fake.show(ANCHORED_SNAPSHOT);
    await reading.rereadResources(['markers']);
    expect(fake.invalidations).toEqual([{ resources: ['markers'] }]);

    fake.show(snapshotOf({ staleResources: ['tree'] }));
    void reading.rereadResources(['markers']);
    expect(fake.asked.filter((call) => call === 'initialize')).toHaveLength(2);
    expect(fake.invalidations).toHaveLength(1);
  });

  it('exposes the store contract over its own owner', () => {
    const fake = fakeOwner();
    const reading = createPlanReading(portsOver(fake.owner).ports);
    const seen: number[] = [];

    const stop = reading.subscribe(() => seen.push(reading.snapshot().acknowledged));
    const first = reading.snapshot();
    expect(reading.snapshot()).toBe(first);
    fake.show(ANCHORED_SNAPSHOT);
    expect(reading.snapshot()).not.toBe(first);
    expect(seen).toEqual([7]);
    stop();
  });

  it('closes by stopping, disposing and dropping the stream', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);
    const reading = createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);

    reading.close();

    expect(fake.asked).toEqual(['initialize', 'stop', 'dispose']);
    expect(recorded.unsubscribed).toBe(1);
  });
});
```

- [ ] Run the sandbox unit command. Expect a **failure**: `createPlanReading` is not exported.
      Record the message. This is the red state for this slice.
- [ ] Widen `plan-feed.resource.ts`'s imports to exactly this:

```ts
import { type PlanRefreshSnapshot, resourcesFor } from '@/lib/plan-refresh';
import type { ProjectStream } from '@/lib/project-stream';

import type {
  AppliedGenerations,
  PlanFeedDelivery,
  PlanReading,
  PlanReadingPorts,
} from './contract';
```

- [ ] Append the factory below. Every statement is transcribed from the subscription effect, in the
      same order, with the React reads replaced by ports, the effect's three-part `isCurrent`
      replaced by `isLive()`, and the two sentence-making calls replaced by `reportFailures` and
      `reportConnection`. The translation list under this step names each substitution exactly.

```ts
/**
 * Opens one project's reading and starts it at once.
 *
 * Reading begins inside this call, exactly where the effect it replaces began
 * it. So the caller stores what it gets back **after** the call returns, and the
 * first publication happens while nobody can look it up yet. That is safe and
 * measured: a publication reaches state setters and nothing that reads the feed
 * back, the refusals of the first read arrive in a later microtask, and the
 * whole plan table's suites are unchanged by the move.
 */
export function createPlanReading({
  openOwner,
  openStream,
  isLive,
  deliver,
  reportFailures,
  reportConnection,
}: PlanReadingPorts): PlanReading {
  // Proof: reusing the disposed owner left zero subscriptions instead of one
  // in `creates a live second owner after StrictMode cleans up its first setup`.
  const owner = openOwner();
  let applied: AppliedGenerations = { tree: 0, steps: 0, directory: 0, markers: 0 };
  let stream: ProjectStream | null = null;
  let streamSequence = -1;
  const apply = (): void => {
    if (!isLive()) return;
    const snapshot = owner.getSnapshot();
    const next = nextDelivery(snapshot, applied);
    applied = next.applied;
    deliver(next.delivery);
    if (openStream !== null && snapshot.baseline !== null && stream === null) {
      // The existing socket is already registered during recovery. Reopening
      // here would turn every refused resume into another read/socket cycle.
      // Proof: restoring epoch replacement opened two sockets instead of one
      // in both `recovers a persistent %s ...` production-page cases.
      streamSequence = snapshot.baseline.seq;
      stream = openStream(
        {
          onChange: (changed, seq) => {
            if (!isLive()) return;
            if (changed == null && seq === undefined) void owner.initialize();
            else void owner.invalidate({ resources: resourcesFor(changed), seq });
          },
          onConnectionChange: (connected) => {
            if (isLive()) reportConnection(connected);
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
    if (!isLive() || outcome.status !== 'failed') return;
    reportFailures(outcome.failures);
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
      stop();
      owner.dispose();
      stream?.unsubscribe();
    },
  };
}
```

- [ ] Check the translations against the source, one at a time. Nothing else about them changes:
  - `const owner = createPlanRefresh({ projectId, api }); ownerRef.current = owner;` becomes
    `const owner = openOwner();` plus the caller's own assignment.
  - `ownerRef.current === owner && activeProject.current === projectId && activeApi.current === api`
    becomes `isLive()`, three times.
  - `subscribe !== undefined` becomes `openStream !== null`.
  - `pushToast({ kind: 'error', text: refusalSentence(failure.cause) })` becomes
    `reportFailures(outcome.failures)`, and the toast stays in delivery.
  - the cleanup's `if (ownerRef.current === owner) ownerRef.current = null;` stays in the hook; the
    other three cleanup statements become `close`, in the same order.
- [ ] Run the sandbox unit command → exit 0, **F0** files and **T0 + 13** tests. This slice adds no
      file.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0, then `bunx prettier --write` this
      slice's two files and `NX_DAEMON=false bunx nx format:check --all`.

**Stop after slice 3.** Checkpoint C.

### Slice 4 — The feature and the composition site, red then green

Commit subject: `feat(wbs-fe): give the plan feed a reader lifetime and a composition site`. Paths:
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.feature.ts`,
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.feature.test.ts`,
`apps/wbs/fe-01/src/modules/plan-feed/composition.ts`, `apps/wbs/fe-01/vitest.node-suites.ts`.

- [ ] Write `plan-feed.feature.test.ts` exactly as below — six tests — and add
      `  'src/modules/plan-feed/plan-feed.feature.test.ts',` to `NODE_SUITES` immediately
      **before** the resource suite's entry.

```ts
import { describe, expect, it } from 'vitest';

import type { PlanRefresh, RefreshOutcome } from '@/lib/plan-refresh';

import type {
  PlanFeedDelivery,
  PlanFeedHost,
  PlanFeedRefusal,
  PlanRefreshSnapshot,
} from './contract';
import { createPlanFeed } from './plan-feed.feature';

/** A snapshot with nothing read, and an anchored one to publish. */
const NOTHING_READ = { desired: 0, reading: false, installed: null, failure: null };
const EMPTY: PlanRefreshSnapshot = {
  tree: NOTHING_READ,
  steps: NOTHING_READ,
  directory: NOTHING_READ,
  markers: NOTHING_READ,
  staleResources: [],
  baseline: null,
  acknowledged: -1,
};
const ANCHORED: PlanRefreshSnapshot = { ...EMPTY, baseline: { seq: 7, epoch: 1 }, acknowledged: 7 };

/** An owner the feature drives through the reading it builds. */
function fakeOwner(): {
  owner: PlanRefresh;
  asked: string[];
  show: (next: PlanRefreshSnapshot) => void;
  firstRead: (outcome: RefreshOutcome) => void;
} {
  const asked: string[] = [];
  const listeners: (() => void)[] = [];
  let snapshot = EMPTY;
  let settleFirstRead: (outcome: RefreshOutcome) => void = () => undefined;
  return {
    owner: {
      initialize: () => {
        asked.push('initialize');
        return new Promise((resolve) => {
          settleFirstRead = resolve;
        });
      },
      invalidate: (invalidation) => {
        asked.push(`invalidate:${invalidation.resources.join(',')}`);
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
    },
    asked,
    show: (next) => {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
    firstRead: (outcome) => {
      settleFirstRead(outcome);
    },
  };
}

/** A host that records what reached the screen. */
function hostOver(
  owner: PlanRefresh,
  over: Partial<PlanFeedHost> = {},
): {
  host: PlanFeedHost;
  deliveries: PlanFeedDelivery[];
  refusals: PlanFeedRefusal[];
  connections: boolean[];
} {
  const deliveries: PlanFeedDelivery[] = [];
  const refusals: PlanFeedRefusal[] = [];
  const connections: boolean[] = [];
  return {
    deliveries,
    refusals,
    connections,
    host: {
      openOwner: () => owner,
      openStream: null,
      isActiveReader: () => true,
      publish: (delivery) => deliveries.push(delivery),
      announceRefusal: (refusal) => refusals.push(refusal),
      setConnected: (connected) => connections.push(connected),
      ...over,
    },
  };
}

describe('the plan feed', () => {
  it('hands the reader every publication while it owns the screen', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);

    createPlanFeed(recorded.host);
    fake.show(ANCHORED);

    expect(recorded.deliveries).toHaveLength(1);
  });

  it('hands nothing to a reader that has moved on', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner, { isActiveReader: () => false });

    createPlanFeed(recorded.host);
    fake.show(ANCHORED);

    expect(recorded.deliveries).toEqual([]);
  });

  it('hands nothing on once it is closed, though the owner still publishes', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);
    const feed = createPlanFeed(recorded.host);

    feed.close();
    fake.show(ANCHORED);

    expect(recorded.deliveries).toEqual([]);
    expect(fake.asked).toEqual(['initialize', 'stop', 'dispose']);
  });

  it('announces the cause of every refusal of the first read', async () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);
    const cause = new Error('forbidden');

    createPlanFeed(recorded.host);
    fake.firstRead({ status: 'failed', failures: [{ resource: 'tree', cause }] });
    await Promise.resolve();

    expect(recorded.refusals).toEqual([{ cause }]);
  });

  it('announces no refusal of a first read that answers after the reader closed it', async () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);
    const feed = createPlanFeed(recorded.host);

    feed.close();
    fake.firstRead({
      status: 'failed',
      failures: [{ resource: 'tree', cause: new Error('forbidden') }],
    });
    await Promise.resolve();

    expect(recorded.refusals).toEqual([]);
  });

  it('hands its reader the owner, the store and the reread it is built over', async () => {
    const fake = fakeOwner();
    const feed = createPlanFeed(hostOver(fake.owner).host);

    expect(feed.owner).toBe(fake.owner);
    expect(feed.snapshot()).toBe(EMPTY);
    const seen: number[] = [];
    const stop = feed.subscribe(() => seen.push(feed.snapshot().acknowledged));
    fake.show(ANCHORED);
    expect(seen).toEqual([7]);
    stop();
    await feed.rereadResources(['markers']);
    expect(fake.asked).toContain('invalidate:markers');
  });
});
```

- [ ] Run the sandbox unit command. Expect a **failure**: `./plan-feed.feature` does not resolve.
      Record the message.
- [ ] Write `plan-feed.feature.ts` exactly as below. It is short on purpose: the feature's whole
      job is the reader's lifetime and where the answers go.

```ts
import type { PlanFeed, PlanFeedHost } from './contract';
import { createPlanReading } from './plan-feed.resource';

/**
 * Builds the live plan reading for one reader: one project, one API, one screen.
 *
 * The **feature**-service delivery sees (rule K2), and the only place that knows
 * **who** the reading belongs to. Two things can end a reader's claim and they
 * end it at different moments — the screen closing, and the project or API
 * changing under a render that has not been torn down yet — so `isLive` is the
 * conjunction of both, and the resource asks it before every answer it gives.
 */
export function createPlanFeed({
  openOwner,
  openStream,
  isActiveReader,
  publish,
  announceRefusal,
  setConnected,
}: PlanFeedHost): PlanFeed {
  let closed = false;
  const reading = createPlanReading({
    openOwner,
    openStream,
    isLive: () => !closed && isActiveReader(),
    deliver: publish,
    reportFailures: (failures) => {
      for (const failure of failures) announceRefusal({ cause: failure.cause });
    },
    reportConnection: setConnected,
  });
  return {
    owner: reading.owner,
    subscribe: reading.subscribe,
    snapshot: reading.snapshot,
    rereadResources: reading.rereadResources,
    close: () => {
      closed = true;
      reading.close();
    },
  };
}
```

- [ ] Write `composition.ts` exactly as below.

```ts
import { createPlanRefresh } from '@/lib/plan-refresh';
import type { ProjectStream } from '@/lib/project-stream';
import type { ProjectApi } from '@/lib/wbs-api';

import type {
  PlanFeed,
  PlanFeedDelivery,
  PlanFeedRefusal,
  PlanFeedStreamHandlers,
} from './contract';
import { createPlanFeed } from './plan-feed.feature';

/** What a screen hands the composition site: its identity and where its answers go. */
export interface PlanFeedForReader {
  readonly projectId: string;
  readonly api: ProjectApi;
  readonly subscribe:
    | ((projectId: string, handlers: PlanFeedStreamHandlers, baseline: number) => ProjectStream)
    | undefined;
  readonly isActiveReader: () => boolean;
  readonly publish: (delivery: PlanFeedDelivery) => void;
  readonly announceRefusal: (refusal: PlanFeedRefusal) => void;
  readonly setConnected: (connected: boolean) => void;
}

/**
 * The one place that sees the refresh owner's factory and the feature at once.
 *
 * A composition site, which the design lets see everything because it installs
 * and supplies and holds no logic. It is here rather than in the screen because
 * rule K2 says delivery imports a feature-service and nothing beneath it — the
 * same line `modules/directory-management/composition.ts` carries. The project
 * lifetime of the rollout's last Task 6 row takes this over; until then it is
 * one call.
 */
export function planFeedForReader({
  projectId,
  api,
  subscribe,
  isActiveReader,
  publish,
  announceRefusal,
  setConnected,
}: PlanFeedForReader): PlanFeed {
  return createPlanFeed({
    openOwner: () => createPlanRefresh({ projectId, api }),
    openStream:
      subscribe === undefined
        ? null
        : (handlers, baseline) => subscribe(projectId, handlers, baseline),
    isActiveReader,
    publish,
    announceRefusal,
    setConnected,
  });
}
```

- [ ] Run the sandbox unit command → exit 0, **F0 + 1** files and **T0 + 6** tests.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0, then `bunx prettier --write` this
      slice's four files and `NX_DAEMON=false bunx nx format:check --all`.

**Stop after slice 4.** Checkpoint D. The hook is still untouched and the application still behaves
exactly as it did.

### Slice 5 — Rewire the hook

Commit subject: `refactor(wbs-fe): read the plan through the plan feed module`. Path:
`apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`.

- [ ] Replace `  const ownerRef = useRef<PlanRefresh | null>(null);` with
      `  const feedRef = useRef<PlanFeed | null>(null);`. Leave `activeApi` alone.
- [ ] Replace the whole `applySnapshot` callback with `publishPlan` below. This is the complete
      replacement, including the four `Proof:` comments that stay in delivery. The **dependency
      array is the one `applySnapshot` carried, unchanged**, and is elided only because it is long.

```ts
const publishPlan = useCallback(
  (delivery: PlanFeedDelivery) => {
    setTreeMayBeStale(delivery.staleResources.length > 0);
    // Proof: suppressing this failure text left the peer-refetch window on
    // “the last refresh failed”, expected the named optimizer-unavailable
    // message while the previously installed plan stayed on screen.
    setTreeFailureText(
      delivery.treeFailure === null ? null : refusalSentence(delivery.treeFailure.cause),
    );
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

The `applied` parameter is gone, the `snapshot.baseline === null` early return is gone, and the four
`applied.<resource> = snapshot.<resource>.installed.generation;` assignments are **deleted**: they
are the resource's now, and copying one would name a variable this callback no longer has.

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
  const feed = planFeedForReader({
    projectId,
    api,
    subscribe,
    isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
    publish: publishPlan,
    announceRefusal: ({ cause }) => {
      // Proof: using the bare failure code here left the unavailable-plan
      // fixture with no named toast and an unhandled refusal-code branch.
      pushToast({ kind: 'error', text: refusalSentence(cause) });
    },
    setConnected,
  });
  feedRef.current = feed;
  return () => {
    if (feedRef.current === feed) feedRef.current = null;
    feed.close();
  };
}, [activeProject, api, projectId, publishPlan, pushToast, setConnected, subscribe]);
```

- [ ] Replace the body of `refreshResourcesOrMarkStale`. Its JSDoc and its dependency array are
      unchanged, and the opening guard is the same expression it is today — section 4.6 is why:

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

- [ ] Three substitutions for the callers that still read the owner. Nothing else in those three
      callbacks changes:
  - `runMarkerWrite`: `const owner = ownerRef.current;` becomes
    `const owner = feedRef.current?.owner ?? null;`, and `ownerRef.current === owner` inside its
    `isCurrent` becomes `feedRef.current?.owner === owner`.
  - `stepStack`: the same two substitutions.
  - the writer's `useMemo`: `readRefreshOwner: () => ownerRef.current,` becomes
    `readRefreshOwner: () => feedRef.current?.owner ?? null,`.
- [ ] Fix the imports. Add, in sorted position immediately before the plan writer's import:

```ts
import { planFeedForReader } from '@/modules/plan-feed/composition';
import type { PlanFeed, PlanFeedDelivery } from '@/modules/plan-feed/contract';
```

and collapse the `@/lib/plan-refresh` import to exactly
`import { ALL_RESOURCES, type RefreshResource } from '@/lib/plan-refresh';` — `createPlanRefresh`,
`PlanRefresh`, `PlanRefreshSnapshot` and `resourcesFor` all leave with the code that used them,
which is what makes this hook K2-clean. Keep `refusalSentence` from `./plan-refusal`: `publishPlan`,
the `announceRefusal` port, `runMarkerWrite` and `stepStack` all use it.

- [ ] Do not touch `settleAgainstSteps`, `refreshOrMarkStale`, `PlanReadScope`, `usePlanReadState`,
      the hook's parameter object or its return statement.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0, no diagnostic.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0.
- [ ] `bunx prettier --write apps/wbs/fe-01/src/components/wbs/use-plan-read.ts` then
      `NX_DAEMON=false bunx nx format:check --all`.
- [ ] Confirm the K2 boundary by reading the import list: no `plan-feed.resource`, no
      `createPlanRefresh`. If either is still there, the rewire is wrong.
- [ ] Run the sandbox unit command → **F0** and **T0**: this slice adds no test.
- [ ] Run both DOM oracle commands → exit 0 with **D1** and **D2** exactly as this slice's step 0
      recorded them. A different count means a test was added, removed or skipped: stop and report.
      The planner measured this rewire against the same three files and saw 167 of 167 before and
      after.

**Stop after slice 5.** Checkpoint E.

### Slice 6 — Negative proofs

Commit subject: `docs(wbs-fe): record the plan feed's observed negatives`. Paths:
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.resource.ts`,
`apps/wbs/fe-01/src/modules/plan-feed/plan-feed.feature.ts`,
`apps/wbs/fe-01/src/components/wbs/use-plan-read.ts` (comments only).

- [ ] Perform every injection in section 8, one at a time, in the order given, each with the
      restore discipline that section states. Record the exact failure message for each **before**
      writing or confirming its proof comment.
- [ ] Only after watching a check fail, add or rewrite its `Proof:` comment at the location section
      8's inventory names. Each names the fault injected and the test observed, with the date.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0, and
      `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0: a restored file that no longer compiles
      is the failure this catches.
- [ ] Run the sandbox unit command and both DOM oracle commands again, green: **F0**, **T0**,
      **D1**, **D2**, unchanged.
- [ ] `bunx prettier --write` the files this slice touched, then
      `NX_DAEMON=false bunx nx format:check --all`.

**Stop after slice 6.** Checkpoint F.

### Slice 7 — Whole-project checks and hand-over

No commit of its own unless a check forces a fix; this slice verifies and reports.

- [ ] Run the sandbox unit command → exit 0, **F0** and **T0**.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` and
      `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0 each.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:build` → exit 0.
- [ ] Do **not** run `wbs-fe-01:test:unit` or `wbs-fe-01:test`. Report both as pending planner
      verification, and state this packet's contribution as a **delta, not a total**: two files and
      twenty-three tests in `test:unit` and in the `TZ=UTC` summary of `test`, with the
      `TZ=Pacific/Auckland` summary unchanged. The planner measures it against a baseline taken on
      the same integrated tree immediately before this packet's first commit; if it instead compares
      with a pre-batch baseline it must add every other packet's contribution, of which 040.1's
      `browser-packages.test.ts` (one file, three tests in the UTC suite) is the one that overlaps
      this project.
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

Expected: each prints `1 pass`, `0 fail`. On branch B the last name no longer exists, so that run
reports `0 tests`: run 110.6's
`the current-document sweep reaches every application, library and tool README` instead and say so.
A failure naming a path this packet created is a stop condition; a failure naming only other
packets' documents is pre-existing — the planner observed the link and selector checks already
failing on 010.6's and 020.2's documents — so record it verbatim and carry on.

- [ ] Do **not** run `NX_DAEMON=false bunx nx run tool-devsync:test`: its index checker runs
      `git write-tree` and `git add --update` against this clone. Report it as pending planner
      verification.
- [ ] Run the batch README's standard OpenSpec validation block, the version that keeps its report
      under `$TMPDIR/evidence` and does not end in a removal. Expected: one JSON report printed and
      the block exits 0.
- [ ] `git status --short --untracked-files=all` → expect **this slice's** step 0 status, unchanged:
      the earlier slices are committed. Report the cumulative implementation paths from the six
      commit subjects above, not from the working tree.
- [ ] Do not run `git add`, `git commit`, `git checkout -b`, `git stash` or `git restore --staged`.
- [ ] Do **not** run `bin/h2puni-gate.sh`. Say in the report that the host gate was not run and why.

**Stop after slice 7.** Checkpoint G.

## 8. Negative proofs

Every check below is either new or has had its expression rewritten by the move, so R5 requires
each to be watched failing before its `Proof:` comment is trusted.

**Every one of these was performed by the planner on 2026-09-20**, in a private worktree cut from
the packet head, against the rehearsed implementation of section 4.11, and the "observed" column is
what the run actually printed. The executor repeats each one and records what it sees; a result
that differs from the observed one is a stop.

**Restore discipline, for every entry.** Copy the passing file aside first
(`cp <file> "$TMPDIR/<name>.passing"`), inject, save the mutation as a patch under
`$TMPDIR/evidence` with the batch README's exact `if diff …; then …; else test $? -eq 1; fi` form,
run the named command, save the failing output beside the patch, restore the exact bytes, prove it
with `cmp`, and rerun green. Never `|| true`, and never read a test's status through `tee`.

**A proof succeeds when the NAMED test fails.** A fault that also fails other tests is recorded,
not stopped on. It is a stop only when the named test passes, fails with a different message, or
the mutation does not compile.

Three commands, each run from the repository root in a subshell. The DOM ones take a `-t` filter,
so one case runs instead of the file; a run reporting `0 tests` or `matched 0 tests` is a failure
to stop on.

```sh
# command A
(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
  src/components/wbs/plan-read-and-write.test.tsx -t '<the named test>')
# command B
(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
  src/components/wbs/project-page.test.tsx -t '<the named test>')
# command C: the module's own suites, which is the sandbox unit command narrowed
(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/modules/plan-feed)
```

Command C reported `Test Files 2 passed (2)`, `Tests 23 passed (23)` unmutated.

### The inventory: every check, its mutation, its test, and where its comment lives

`R` is `plan-feed.resource.ts`, `F` is `plan-feed.feature.ts`, `H` is `use-plan-read.ts`.

| #   | Check, and where its `Proof:` comment lives                                                | File | Mutation                                                                                                                         | Command | Named test                                                                                    | Observed                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One stream per lifetime — comment moved, above `streamSequence = snapshot.baseline.seq;`   | R    | drop `&& stream === null`                                                                                                        | B, C    | `recovers a persistent resume_denied without replacing the registered socket`                 | B: `expected [ …(8) ] to have a length of 1 but got 8`, the `resume_ack` twin too; C: `opens one stream when the anchor lands, and no more` `…got 2`                       |
| 2   | The covered sequence reaches the stream — new comment on that block                        | R    | delete the whole `if (snapshot.acknowledged > streamSequence) { … }` block                                                       | A, C    | `refetches when the subscription reports a change`                                            | A: `expected -1 to be +0`; C: `acknowledges a sequence only once it has moved forward` `expected [] to deeply equal [ 11 ]`                                                |
| 3   | Acknowledgement only ever moves forward — same comment, on the condition                   | R    | `if (snapshot.acknowledged >= streamSequence) {`                                                                                 | C       | `acknowledges a sequence only once it has moved forward`                                      | `expected [ 7, 7, 11 ] to deeply equal [ 11 ]`                                                                                                                             |
| 4   | Nothing is published before the anchor — comment moved, above the early return             | R    | delete the `if (snapshot.baseline === null)` early return in `nextDelivery`                                                      | A, C    | `does not expose a first editor before its held column vocabulary installs`                   | A: `expected <textarea …(6)></textarea> to be null`; C: `carries no installed resource before an anchor exists`                                                            |
| 5   | The failed tree read's cause is carried — new comment above `treeFailure`                  | R    | `const treeFailure = null;`                                                                                                      | A, C    | `keeps the installed plan and names an unavailable peer refetch`                              | A: `expected 'This plan may be out of date — the la…' to contain 'Optimized scheduling is unavailable i…'`; C: `expected null to deeply equal { cause: Error: forbidden }` |
| 6   | The stale list is carried — new comment above `const staleResources`                       | R    | `const staleResources = snapshot.staleResources.slice(0, 0);`                                                                    | A, C    | `raises the stale-tree banner when a socket refetch fails`                                    | A: `expected null not to be null`; C: two ledger cases, `expected [] to deeply equal [ 'steps' ]`                                                                          |
| 7   | The stream is dropped with the lifetime — new comment above `stream?.unsubscribe();`       | R    | delete `stream?.unsubscribe();` from `close`                                                                                     | A, C    | `refetches when the subscription reports a change`                                            | A: `expected false to be true`; C: `closes by stopping, disposing and dropping the stream` `expected +0 to be 1`                                                           |
| 8   | A lifetime gets its own owner — comment moved, above `const owner = openOwner();`          | H    | `const feed = feedRef.current ?? planFeedForReader({…});` **and** delete `if (feedRef.current === feed) feedRef.current = null;` | A       | `creates a live second owner after StrictMode cleans up its first setup`                      | `expected +0 to be 1`                                                                                                                                                      |
| 9   | The tree generation is applied once — new comment above the `tree` comparison              | R    | drop `&& snapshot.tree.installed.generation > applied.tree`                                                                      | C       | `carries each generation exactly once`                                                        | `expected { …(2) } to be null`; `carries a held read …` failed with it                                                                                                     |
| 10  | The directory generation — new comment above the `directory` comparison                    | R    | drop `&& snapshot.directory.installed.generation > applied.directory`                                                            | C       | `carries each generation exactly once`                                                        | `expected { teams: [], tags: [], …(4) } to be null`                                                                                                                        |
| 11  | The steps generation — new comment above the `steps` comparison                            | R    | drop `&& snapshot.steps.installed.generation > applied.steps`                                                                    | C       | `carries each generation exactly once`                                                        | `expected [ { id: 's1', name: 'Build' } ] to be null`                                                                                                                      |
| 12  | The markers generation — new comment above the `markers` comparison                        | R    | drop `&& snapshot.markers.installed.generation > applied.markers`                                                                | C       | `carries each generation exactly once`                                                        | `expected [] to be null`                                                                                                                                                   |
| 13  | A publication needs a live reading — new comment above `if (!isLive()) return;` in `apply` | R    | delete that line                                                                                                                 | C       | `delivers nothing while it is not live`                                                       | `expected [ { staleResources: [], …(5) } ] to deeply equal []`; two more cases failed with it                                                                              |
| 14  | A frame needs a live reading — new comment above `if (!isLive()) return;` in `onChange`    | R    | delete that line                                                                                                                 | C       | `ignores a change and a connection that arrive after it stops being live`                     | `expected [ { resources: [ 'tree' ], seq: 8 } ] to deeply equal []`                                                                                                        |
| 15  | The connection needs a live reading — new comment on that line                             | R    | `reportConnection(connected);` unguarded                                                                                         | C       | `ignores a change and a connection that arrive after it stops being live`                     | `expected [ false ] to deeply equal []`                                                                                                                                    |
| 16  | The first read's refusals need a live reading — new comment above the `.then` guard        | R    | `if (outcome.status !== 'failed') return;`                                                                                       | C       | `reports no refusal of a first read that answers after it stops being live`                   | `expected [ Error: forbidden ] to deeply equal []`; the feature's closed case failed too                                                                                   |
| 17  | Listening stops with the lifetime — new comment above `stop();`                            | R    | delete `stop();`                                                                                                                 | C       | `closes by stopping, disposing and dropping the stream`                                       | `expected [ 'initialize', 'dispose' ] to deeply equal [ 'initialize', 'stop', 'dispose' ]`                                                                                 |
| 18  | The owner is disposed with the lifetime — new comment above `owner.dispose();`             | R    | delete `owner.dispose();`                                                                                                        | C       | `closes by stopping, disposing and dropping the stream`                                       | `expected [ 'initialize', 'stop' ] to deeply equal [ 'initialize', 'stop', 'dispose' ]`                                                                                    |
| 19  | An unanchored stale feed resynchronizes — new comment inside `rereadResources`             | R    | reduce it to `await owner.invalidate({ resources });`                                                                            | C       | `rereads by invalidating, and resynchronizes when nothing is anchored and something is stale` | `expected [ 'initialize' ] to have a length of 2 but got 1`                                                                                                                |
| 20  | A closed reader is told nothing — new comment above `let closed = false;`                  | F    | `isLive: () => isActiveReader(),`                                                                                                | C       | `hands nothing on once it is closed, though the owner still publishes`                        | `expected [ { staleResources: [], …(5) } ] to deeply equal []`; the closed-refusal case failed too                                                                         |
| 21  | Refusals reach the screen — new comment above the `for` loop                               | F    | `void failures;` in place of the loop body                                                                                       | A, C    | `names an unavailable optimizer and offers no export before a plan is installed`              | A: `expected [] to include 'Optimized scheduling is unavailable i…'`; C: `announces the cause of every refusal of the first read`                                          |

Twenty-one checks, twenty-three observed failures counting the two that fail under two commands.
Proof 8's mutation lives in the hook and its comment travels with `const owner = openOwner();`:
the fault it names is a host that hands the same, already-closed feed to a second lifetime. Restore
**both** hook edits before asserting anything.

### The guard this packet does not claim a negative for

The reader guard in `refreshResourcesOrMarkStale` stays in the hook, unchanged (section 4.6). The
planner weakened it to `if (feed === null) return;` and ran the whole of
`plan-read-and-write.test.tsx`: **88 of 88 passed**. No test separates it. It is unchanged code, so
R5 asks nothing new of it; the executor does not mutate it, and the gap is reported as a finding for
[checks that cannot fail](../../../findings/checks-that-cannot-fail.md). Section 12's stop
conditions apply to the twenty-one checks above and to nothing else.

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

**No OpenSpec change is created**, and no architectural exception is taken. R4 requires a change for
observable behaviour, contracts, migrations, deploy safety or architecture, and skips it for
mechanical refactors. This packet moves code without changing behaviour — measured, section 4.11 —
and it conforms to the architecture the proposed `service-taxonomy` change states rather than
amending it: section 4.7 maps K2, K3, F1 and F2 onto the files that satisfy each, and the module
follows the shape batch 1's merged directory extraction established. Nothing in that change is
edited.

`openspec/specs/plan-refresh/spec.md` is accepted and constrains what moves. The executor reads it
as the acceptance criteria for "no behaviour change":

- Requirement **"Read ownership ends with its project and API lifetime"**: "Disposal SHALL settle
  outstanding callers as disposed and prevent subsequent installation, stale changes,
  notifications, toasts and acknowledgments. A new project or API identity SHALL use a distinct
  owner, including when the project ID is unchanged." That is what the feature's `isLive` and the
  reading's `close` implement, and proofs 8, 13, 14, 15, 16, 17, 18 and 20 exercise it — the
  notifications clause is proofs 16 and 20, the acknowledgement clause is proofs 2 and 3.
- Requirement **"Failures remain visible until their resources recover"**: a mutation whose
  covering read fails SHALL remain landed, and the failure stays in the snapshot. Proofs 5 and 6
  exercise it. Do not add a failure branch to `rereadResources`.

`openspec/specs/wbs-table-modules/spec.md`, requirement "Concept modules preserve table behavior",
requires the modules the table composes to keep their behaviour. Adding a module the read module
composes is inside that requirement while behaviour holds, so it needs no delta.

The validation command is the batch's standard OpenSpec block, run in slice 7.

## 11. Verification

Every slice runs, in this order: the sandbox unit command, `wbs-fe-01:typecheck`,
`wbs-fe-01:lint`, a targeted `prettier --write`, and `nx format:check --all`. Slices 5, 6 and 7 add
the two DOM oracle commands. Slice 7 adds the build, the four devsync checks and the OpenSpec
block. There is no slice with a shorter list.

| Command                                           | Expected                                                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The sandbox unit command                          | Exit 0. Slice 2: **F0 + 1**/**T0 + 4**. Slice 3: **F0**/**T0 + 13**. Slice 4: **F0 + 1**/**T0 + 6**. Slices 1, 5, 6, 7: **F0**/**T0**. |
| The two DOM oracle commands, slices 5 to 7        | Exit 0, **D1** and **D2** unchanged from that slice's step 0.                                                                          |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` | Exit 0, no diagnostic. Every slice.                                                                                                    |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`      | Exit 0. Every slice.                                                                                                                   |
| `NX_DAEMON=false bunx nx format:check --all`      | Exit 0, or failures naming only files outside this packet. Every slice.                                                                |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`     | Exit 0. Slice 7.                                                                                                                       |
| The four named devsync checks                     | Each `1 pass`, `0 fail`; on branch B the pin check is replaced by 110.6's derived one. Slice 7.                                        |
| The standard OpenSpec block                       | One JSON report printed, block exits 0. Slice 7.                                                                                       |

### What the planner runs afterwards

| Command                                                         | Why the executor cannot run it                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git add` of each slice's paths, then its commit                | The clone's Git directory is read-only.                                                                                                                             |
| `NX_DAEMON=false bunx nx run tool-devsync:test`                 | Its index checker writes Git objects into the clone.                                                                                                                |
| `wbs-fe-01:test:unit` and `wbs-fe-01:test`, outside the sandbox | Three of their tests spawn `bun` from Node; the sandbox refuses it. Compare against a baseline taken on the integrated tree just before this packet's first commit. |
| `wbs-fe-01:e2e`                                                 | Needs a browser and the real stack. This packet changes the read path of every table screen, so run it once.                                                        |
| `bin/h2puni-gate.sh <sha>`                                      | The host gate cannot run on this machine.                                                                                                                           |

**What none of it proves.** Nothing here proves the feed is reachable from the real browser path:
that is the `e2e` target. Nothing proves F1, K2 or K3 mechanically — those lint rules are Task 3 of
the rollout and do not exist yet, so this packet's conformance is established by reading the imports
(section 4.7) and by the structure, not by a check. The unit suites prove the policy over a fake
owner and a fake stream; the production evidence is the two DOM suites.

## 12. Stop conditions

Stop and report rather than improvising when any of these happens. Each is false on the tree this
packet starts from.

1. Any assertion in an existing test has to change to make a suite pass — **except** the one
   authorized README-count literal of step 1.4 branch A, which is changed only after watching it
   fail and only for that one field. Every other field of that pinned object, and every other
   assertion in the repository, is still covered by this condition.
2. A `Proof:` comment has no home, or the test it names no longer exists.
3. The DOM oracle's counts differ from that slice's step 0, or a test outside this packet's files
   fails.
4. A named test in section 8's inventory passes under its mutation, fails with a different message,
   or the mutation does not compile. Extra failing tests are recorded and are **not** a stop.
5. `wbs-table.tsx`, `project-page.tsx`, `plan-toolbar.tsx`, `use-plan-dependencies.ts` or
   `plan-writer.feature.ts` appears to need an edit.
6. `PlanReadScope` or `refreshOrMarkStale` appears to need to move (section 4.9).
7. The presence roster appears to need to move (section 4.8).
8. A suite fails in the node tier with a reference error naming a browser global, or
   `src/test-tiers.test.ts` refuses either new entry.
9. Step 1.4 finds neither the literal pin nor 110.6's derived check.
10. The hook still imports `plan-feed.resource` or `createPlanRefresh` after slice 5.
11. `NX_DAEMON=false bunx nx format:check --all` names one of this packet's own files after the
    targeted write.
12. Any step seems to need `git add`, `git commit` or the host gate.

## 13. Out of lane

| Path                                                                   | Owner                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------- |
| `apps/wbs/fe-01/src/lib/plan-refresh.ts`                               | Nobody in this batch; the owner stays put.        |
| `apps/wbs/fe-01/src/lib/plan-refresh-stream.test.ts`                   | Nobody; its duplication is a finding (4.10).      |
| `apps/wbs/fe-01/src/lib/project-stream.ts`                             | The application lifetime's stream connector.      |
| `apps/wbs/fe-01/src/components/wbs/plan-refusal.ts`                    | The Notices module; this packet stops needing it. |
| `apps/wbs/fe-01/src/components/wbs/project-page.tsx`                   | The roster's home (4.8).                          |
| `apps/wbs/fe-01/src/components/wbs/plan-toolbar.tsx`                   | Work item 040.5.                                  |
| `apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts`           | Work item 040.5.                                  |
| `apps/wbs/fe-01/src/modules/plan-writer/**`                            | Work item 040.3, merged.                          |
| `apps/wbs/fe-01/src/modules/store.ts`                                  | Packet 040.6, merged. Imported, not edited.       |
| `apps/wbs/fe-01/project.json`, `tsconfig.spec.json` and the e2e folder | Packets 110.1 and 040.1.                          |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`              | Packets 110.6 and 020.2 — step 1.4 sequences it.  |
| `eslint.config.js` and any ESLint policy file                          | Task 3 of the rollout.                            |
| `docs/wiki-policy/modules.json` and the wiki pilot path list           | Task 9 of the rollout.                            |

## 14. How to run this packet

Seven dispatches, each its own attempt, each reviewed and committed before the next starts. The
invocations are in section 7's preamble: `--batch batch-2` for the first, `--resume` for the rest,
with the planner checking the clone's HEAD against the commit it just made.

| Slice | Dispatch as        | Commit subject                                                              | What the planner reads before saying go on                                      |
| ----- | ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1     | `slice-1`          | `feat(wbs-fe): add the plan feed module's contract and index`               | The contract, the README, the pin branch. A wrong contract wastes the rest.     |
| 2     | `slice-2 --resume` | `feat(wbs-fe): decide what the plan feed has to deliver`                    | The four ledger tests, the pure function, the tier entry, red then green.       |
| 3     | `slice-3 --resume` | `feat(wbs-fe): own the plan feed's refresh, stream and acknowledgement`     | The thirteen reading tests and the factory; the hook still untouched.           |
| 4     | `slice-4 --resume` | `feat(wbs-fe): give the plan feed a reader lifetime and a composition site` | The feature, its six tests, and that K2's boundary is the composition site.     |
| 5     | `slice-5 --resume` | `refactor(wbs-fe): read the plan through the plan feed module`              | The hook diff against the old effect, its import list, and the oracle's counts. |
| 6     | `slice-6 --resume` | `docs(wbs-fe): record the plan feed's observed negatives`                   | Twenty-one observed failures and the comments they justify.                     |
| 7     | `slice-7 --resume` | none                                                                        | The report: counts against step 0, the devsync checks, the pending list.        |

Integration is the planner's separate handoff: the whole `tool-devsync:test` target, both frontend
whole targets, the browser suite and the host gate.

### First review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

Every finding was checked against the repository; where a proof was said to be impossible, the
mutation was executed and the observed output recorded.

| Finding                                                   | Disposition | What changed                                                                                                                             |
| --------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 — the launcher cannot find a batch-2 packet    | Fixed       | Superseded by the second round: the launcher takes `--batch batch-2`, and section 7 now carries the exact invocations.                   |
| Critical 2 — slice 1 registered a nonexistent suite       | Fixed       | Each suite's list entry lands in the slice that creates the file; section 4.13 records that the node config's `include` **is** the list. |
| Critical 3 — slice 2 could not be committed with hooks    | Fixed       | Every slice writes only the imports it uses and runs lint and format before its checkpoint.                                              |
| Critical 4 — the supplied tests failed lint               | Fixed       | One `handlersOf` helper using `at(0)`, with the reason in its JSDoc. `wbs-fe-01:lint` is clean over the whole module.                    |
| Critical 5 — baselines were impossible as written         | Fixed       | Per-slice deltas throughout, and slice 7 now states the planner's comparison explicitly (see round two, finding 5).                      |
| Critical 6 — proof 8's named test never reached the guard | Fixed       | Measured: the mutation left 88 of 88 passing. The proof is withdrawn and the coverage gap disclosed in sections 4.6 and 8.               |
| Critical 7 — proof 1's stated failure was wrong           | Fixed       | Measured: `expected [ …(8) ] to have a length of 1 but got 8`, both cases.                                                               |
| Important 8 — the F2 exception was unauthorised           | Fixed       | Both kinds extend `Store<PlanRefreshSnapshot>`; two unit tests pin the stability rule.                                                   |
| Important 9 — the README pin repeated an absolute count   | Fixed       | Step 1.4 records the literal and requires literal plus one; branch B is the expected path.                                               |
| Important 10 — slice 5's placeholder was ambiguous        | Fixed       | The complete `publishPlan` callback is given, and the four stale assignments are named as deleted.                                       |
| Important 11 — the proof instructions left checks bare    | Fixed       | Section 8 is a twenty-one-row inventory; round two's two missing conditions are rows 3 and 16.                                           |
| Important 12 — the hand-over assumed a dirty tree         | Fixed       | Every slice has a subject and a path list; slice 7 compares with its own step 0.                                                         |
| Important 13 — "DI Bag is not installed" is false         | Fixed       | Stated as installed, with composition deferred to the lifetimes task.                                                                    |
| Minor 14 — the 110.1 description was stale                | Fixed       | Corrected to its backend capability.                                                                                                     |
| Minor 15 — the suite insertion point was wrong            | Fixed       | Both entries sit immediately before the plan writer's.                                                                                   |

### Second review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

The round-one lines it marked PARTLY are closed below alongside the new findings. Everything was
re-verified, and the whole module was rebuilt in a private worktree cut from the packet head, then
removed; the shared planning tree was never edited.

| Finding                                                        | Disposition | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Critical 1 — the extraction introduced a K2 violation          | Fixed       | Confirmed against the `service-taxonomy` spec and the batch 1 decision. The module now has both kinds and a composition site, following `directory-management`: `plan-feed.resource.ts`, `plan-feed.feature.ts`, `composition.ts`, and a `contract.ts` that re-exports for K2. The hook imports the composition site and the contract only — no `.resource`, and no `createPlanRefresh`. Section 4.7 maps every rule to the file that satisfies it; §10 no longer claims F2 alone settles the architecture. Rebuilt, linted, type-checked, and 167 of 167 on the oracle. |
| Important 2 — two safety conditions were outside the inventory | Fixed       | Both are now rows with observed failures: the first read's lifetime guard (row 16, `expected [ Error: forbidden ] to deeply equal []`, plus the feature's closed case, row 20) and the acknowledgement direction (row 3, `expected [ 7, 7, 11 ] to deeply equal [ 11 ]` — exactly the sequence the review predicted). Two new tests carry them, one per kind.                                                                                                                                                                                                            |
| Important 3 — launcher instructions were stale                 | Fixed       | Confirmed `--batch` at the launcher's option parser and its batch-2 directory case. Section 7 gives the first invocation and the `--resume` form, and says the planner verifies the resumed HEAD against the last commit.                                                                                                                                                                                                                                                                                                                                                |
| Important 4 — the authorized re-pin met a stop condition       | Fixed       | Stop condition 1 now exempts exactly step 1.4 branch A's README-count literal and nothing else.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Important 5 — the planner's totals ignored other packets       | Fixed       | Slice 7 states the contribution as a delta against a baseline taken on the integrated tree immediately before this packet's first commit, and names 040.1's one file and three tests as what a pre-batch comparison must reconcile.                                                                                                                                                                                                                                                                                                                                      |
| Important 6 — the shared-file claim missed 020.2               | Fixed       | Confirmed in 020.2's slice C4. Sections 4.12 and 6 name it, require sequential execution with a commit between while branch A is possible, and say 110.6 landing first removes the overlap.                                                                                                                                                                                                                                                                                                                                                                              |
| Minor 7 — verification obligations were inconsistent           | Fixed       | Section 11 opens with the per-slice list, and slices 6 and 7 carry the typecheck and lint commands in their own checklists.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Minor 8 — the roster line-offset claim was reversed            | Fixed       | Confirmed: main declares it three lines **earlier**. The offset is gone; section 4.1 keeps the symbol anchor only.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Round one, finding 1 — PARTLY (exact invocations absent)       | Closed      | See Important 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Round one, finding 5 — PARTLY (invalid planner comparison)     | Closed      | See Important 5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Round one, finding 11 — PARTLY (two conditions missing)        | Closed      | See Important 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

One consequence of Critical 1 worth naming: the module now imports nothing from `components/`,
because a refusal travels as its cause and the sentence is built where it is said. That is stricter
than the merged plan-writer module, whose upward import of the misfiled refusal vocabulary batch 1
recorded as a finding; this packet does not move that file, it stops needing it.
