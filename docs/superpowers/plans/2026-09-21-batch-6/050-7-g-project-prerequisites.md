# 050.7 g — the project prerequisites: project-owned stores and narrow ports

|             |                                                                                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **eleventh packet**                                                                                                                                                                   |
| Size class  | L — five slices, each one executor attempt                                                                                                                                                                                                                                       |
| Predecessor | [050.7f2](050-7-f2-delivery-call-sites.md) — the call-time reader, the `live-application` fixture the table suites render through, and its model-test and proof discipline                                                                                                       |
| Closes      | OpenSpec task **8** of `adopt-frontend-lifetimes`, and item 1 and 2 of "Required implementation order" in the [frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md): React supplies no state setter to the plan feed's or the plan writer's construction |
| Revision    | First.                                                                                                                                                                                                                                                                           |
| Schema      | OpenSpec change `adopt-frontend-lifetimes`, already `sdd-lean`. One new requirement with five scenarios, one per slice; task 8 ticked with a dated note in slice 5.                                                                                                              |

## 1. Goal, non-goals, and the cut

**Goal.** Take every piece of project state the plan feed and the plan writer write through React
today — the plan snapshot (twenty `useState`s filled by one `publishPlan` callback), the socket's
connection, the header's roster, and the shared busy flag — and put it in **plain, project-owned
stores** that React selects from; and put the two announcements the writer and the feed make — "a
command was issued" and "this was refused" — behind **narrow ports** the table listens to. After this
packet, `PlanFeedForReader` and `PlanWriterHost` take stores and ports and no React setter, ref or
toast function, and what a reader sees does not change. Every new store and port is a written state
machine executed by a model-based test with at least four rehearsed sabotages.

**Non-goals.**

- **The project runtime (tasks 10 and 11).** Each store is still built by the mount that owned the
  state it replaces — the table's mount for the delivered plan, busy and the two channels, the page's
  mount for presence. Moving construction into a DI Bag project runtime, and deciding which lifetime
  resets presence on a project switch, is theirs. Presence is therefore **not** reset by a switch in
  this packet, exactly as the roster was not before (section 3.4, section 13 assumption 2).
- **The broad `ProjectApi` (task 9).** `PlanFeedForReader.api`, the refresh owner's factory and the
  writer's `readRefreshOwner` / `isActiveReader` reads (closures over the table's refs) stay. They are
  reads, not setters, and they go with the per-effect ownership task 10 replaces. Section 12 says what
  task 9 needs from this packet. Task 9 **is** separable from this one: nothing here needed the
  repository ports, and nothing here narrows `ProjectApi`.
- **Any reader-visible change.** The proposal of this change promises none beyond the fatal state.
  In particular busy keeps its exact rule — raised at a gesture's start, lowered at its end only while
  its reader is still on screen, one boolean shared by every gesture — although a count of holds was
  designed and rehearsed first; section 13 assumption 1 records why it was dropped.
- `calendar-markers` keeps its host contract: its call site hands it the refusal channel's `publish`
  instead of a toast closure, and nothing in the module changes.
- No new dependency, no `project.json`, no `bun.lock`, no module `module-index` block.

**The cut, and why five slices.** Measured, not assumed (section 4.2):

1. The channel and the busy store are the two primitives every later slice uses, and each is pure
   TypeScript with its own model test — slice 1, nothing wired.
2. The delivered plan and the presence store are the two record stores, each with its own fold and
   its own model test — slice 2, nothing wired.
3. The ports go in before the snapshot moves: the writer's and the feed's announcements and busy
   are three constructor members, one hook (`useChannelListener`) and the three callers of `setBusy`.
   A behaviour-neutral move measured against the twenty adopted table suites (1214 tests before,
   1214 after).
4. The snapshot moves: `publishPlan` and twenty setters become one `useSyncExternalStore` selection
   and one presentation hook (`useSnapshotChanges`). The largest diff, alone in its slice, again
   1214 before and after.
5. Presence moves in the page, the READMEs and task 8 close, and the production-path proofs of the
   ports run — last, because `use-plan-read.ts` is final only after slice 4 (section 8's opening).

## 2. Read first

| File                                                                                          | Why                                                                                                             |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                  | Rules R1–R5 and the routing index.                                                                              |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                         | "Execution contract", "Standard blocks every packet uses" — the strict OpenSpec block and the fault form.       |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`                    | "Required implementation order", "Project owner", "Exact lifecycle tests": what this packet delivers.           |
| `docs/superpowers/plans/2026-09-21-batch-6/050-7-f2-delivery-call-sites.md`, sections 6 and 8 | The step-0, extraction and fault procedure this packet repeats.                                                 |
| `apps/wbs/fe-01/src/modules/store.ts`                                                         | The one store contract (rule F2) every new store implements, and its stability rule.                            |
| `apps/wbs/fe-01/src/modules/plan-feed/{contract,composition,plan-feed.feature}.ts`            | `PlanFeedHost` (unchanged) and `PlanFeedForReader` (changed); the feed's `isLive` gate every write sits behind. |
| `apps/wbs/fe-01/src/modules/plan-writer/{contract,plan-writer.feature}.ts`                    | `PlanWriterHost`, and the three guards of `run`.                                                                |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`                                          | `usePlanReadState`'s twenty states, `publishPlan`, the feed effect, the writer memo, `stepStack`.               |
| `apps/wbs/fe-01/src/components/wbs/wbs-table.tsx:614-980`, `use-plan-dependencies.ts:110-175` | The destructuring and the two other busy writers.                                                               |
| `apps/wbs/fe-01/src/components/wbs/project-page.tsx:494-534`                                  | The roster state and the stream factory that writes it.                                                         |
| `apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts`                           | The shape every model test here copies: its own oracle, a scheduler, counted coverage, reported teardown.       |
| `apps/wbs/fe-01/vitest.node-suites.ts`, `src/test-tiers.test.ts`                              | The four new model tests are DOM-free and must be listed, or the tier test refuses them.                        |

## 3. Design: the state machines

This section is the record lesson 16 of the batch addendum asks for. Each subsection is executed by
the model test it names, and after the packet the same text is JSDoc on the symbol (R3).

### 3.1 The channel — `modules/channel.ts`

A one-way line from something a project owns to whoever listens now: the event counterpart of
`Store`. A producer is handed `Publisher<T>` (`publish` only); delivery subscribes.

State: an ordered set of subscriptions (each its own object, so one function may subscribe twice), a
FIFO queue of events, and whether a delivery is running.

Events: `subscribe`; the returned unsubscribe (idempotent); `publish` from outside; `publish`,
`subscribe` and unsubscribe from **inside** a listener; a listener that throws.

Invariants, each asserted by `channel.model.test.ts` against its own reference loop (arrays, not a
set):

- **C1 — in order, once.** A publication from inside a listener is queued behind the one being
  delivered; every listener hears events in publication order.
- **C2 — no re-entry.** No listener is entered while any listener call is running.
- **C3 — fixed recipients.** An event's recipients are the listeners subscribed when **its**
  delivery starts, in subscription order; one subscribed during that delivery hears the next event
  and not this one; one unsubscribed before its turn is skipped.
- **C4 — nothing late.** Nothing reaches a listener after its unsubscribe has returned.
- **C5 — failures surface.** A listener's failure does not stop delivery to the others or the queue
  behind; then the outermost `publish` throws the one failure by identity, or an `AggregateError` of
  all of them in order. An inner `publish` returns at once and throws nothing.

Interleavings the commands generate, each counted and asserted non-zero over the pinned run: an echo
queued from inside a listener; a listener dropped before its turn; a listener joined during a
delivery; one failure; several failures; publications and unsubscriptions released in an order the
scheduler chooses.

### 3.2 Busy — `modules/plan-writer/busy-store.ts`

The boolean the toolbar and the cells read. **The rule is today's, moved, not changed:** a gesture
raises it when it starts and lowers it when it ends **only if its reader is still on screen** — the
gesture's own `isActiveReader()` / `isCurrent()` test, unchanged, at each of the three writers
(`plan-writer.feature.ts`, `stepStack`, `usePlanDependencies`). What the store owns is the value and
the telling.

States: `idle`, `busy`. Events: `raise`, `lower`, a listener raising or lowering from inside its own
notification, a listener leaving.

Invariants (`busy-store.model.test.ts`):

- **B1.** The snapshot is the last value raised or lowered.
- **B2.** A listener is told exactly once per change of the value — never for a raise that found it
  raised or a lower that found it lowered — and only after the change.
- **B3.** What a listener reads when told is the value at that instant, re-entrant changes included.
- **B4.** Nothing reaches a listener after it left; no call ever throws.

### 3.3 The delivered plan — `modules/plan-feed/delivered-plan-store.ts`

The sum of the feed's publications, which is what the table draws. The feed publishes **deltas**
(`PlanFeedDelivery`, null = unchanged); this store folds them.

Snapshot members and their update rules:

| Member           | Before any delivery | Replaced when                                                                                     |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| `staleResources` | `[]`                | its content differs from the delivery's (the delivery may hand a new array with the same names)   |
| `treeFailure`    | `null`              | null ↔ not null, or the **cause** differs — `nextDelivery` wraps the same cause afresh every time |
| `directory`      | `null`              | the delivery carries one that is not the same object                                              |
| `tree`           | `null`              | likewise                                                                                          |
| `steps`          | `[]` (its own)      | the delivered list differs by id and name (`sameSteps`, moved here); stored as the store's copy   |
| `markers`        | `[]` (its own)      | the delivery carries one that is not the same object                                              |
| `connected`      | `true`              | `reportConnection` with the other value                                                           |

Invariants (`delivered-plan-store.model.test.ts`, whose fold keeps its own record of every member and
never reads the store):

- **D1.** Every member equals the model's fold, by identity where the table above says identity.
- **D2 — the stability rule of `Store`.** A write that changes no member leaves the snapshot the same
  object and tells nobody; one that changes any member replaces it once and tells each listener once,
  after the replacement; a member that did not change keeps its identity — the steps array above all,
  which the table's column memo depends on.
- **D3.** The steps array is never one the feed handed in.
- **D4.** A listener reads the model's value at the instant it is told, including a publication
  relayed from inside another listener; nothing reaches a listener after it left.

Interleavings counted: a publication that changes nothing; an equal step list in a new array; the
same cause in a new wrapper; a publication relayed from a listener; a read landing after a later one.

The store has no withdrawal of its own: whether a publication may still reach it is the feed's
`isLive` gate, which is unchanged and already proved (`plan-feed.feature.ts`, three `Proof:` notes).

### 3.4 Presence — `modules/plan-feed/presence-store.ts`

`{ users, connected }`, starting `{ [], false }` — the honest answer before a socket says anything.
`reportUsers` replaces the list when it is not the same object (every frame is a new list, and a
frame is a change); `reportConnection` when the value differs. Invariants P1–P3 are D1, D2 and D4
for these two members (`presence-store.model.test.ts`).

One store per `ProjectPage` mount, as the `useState` it replaces was one per mount; the stream factory
writes into it and the header selects from it. **Not reset on a project switch** (section 1).

### 3.5 Delivery: two hooks, and what React still owns

No store or channel call can throw a lifecycle refusal: none has a lifecycle (no withdrawal, no
close), and the feed's and the writer's own gates decide whether a write may happen at all. So no
delivery path needs a `catch`. The two hooks own the three timing questions the brief names.

`useChannelListener(channel, listener)` — `components/wbs/use-channel-listener.ts`:

| Question                                        | Answer                                                                                                                                                 | Example test (and its fault)                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| an event between the render and passive effects | subscribed in a **layout** effect, so an event a child's or sibling's mount `useEffect` publishes is heard — the feed's first read is started from one | `hears an event a child publishes from its own mount effect` (`l1`: `useEffect`)   |
| a superseded callback                           | the latest render's listener, through a ref written in a layout effect; no resubscription                                                              | `calls the listener of the latest render and never a superseded one` (`l2`)        |
| replacement while mounted                       | one subscription per channel: a replaced channel is left in the same commit                                                                            | `follows a channel replaced while it stays mounted, and leaves the old one` (`l3`) |
| withdrawal (unmount)                            | the subscription is left; a later publication reaches nothing and throws nothing                                                                       | `hears nothing once it is unmounted, and a publication then throws nothing` (`l4`) |
| a listener's own failure                        | not caught — it reaches the publisher by identity (channel rule C5)                                                                                    | `lets a listener’s own failure reach the publisher by identity` (`l5`)             |

`useSnapshotChanges(store, onChange)` — `components/wbs/use-snapshot-changes.ts` — calls
`onChange(next, previous)` once per change of a store's snapshot, inside the store's own
notification (the pass the change was made in). It is how the table settles the hover card and the
drafts that a delivery invalidates, which `publishPlan` did inline:

| Question                                         | Answer                                                                                      | Example test (and its fault)                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| a change between the render and the subscription | the last snapshot handed on is kept across subscriptions, and a new subscription catches up | `catches up with a change made between its render and its subscription` (`u1`)   |
| a notification that changed nothing              | nothing is handed on twice                                                                  | `hands on nothing when told of a change that left the snapshot as it was` (`u2`) |
| a superseded callback                            | the latest render's `onChange`, through a ref                                               | `calls the callback of the latest render and never a superseded one` (`u3`)      |
| replacement while mounted                        | the old store is left; the replacement's snapshot is a change                               | `follows a store replaced while it stays mounted, and leaves the old one` (`u4`) |
| withdrawal (unmount)                             | the subscription is left                                                                    | `hands on nothing once it is unmounted` (`u5`)                                   |

Values are selected with `useSyncExternalStore`, which re-checks the snapshot after it subscribes, so
a render never shows a snapshot older than the store's.

Presentation stays component-owned, as the map requires: the focus intent (`FocusIntent`) and focus
requests stay in the table; the writer only says a command was issued, and the table's listener calls
`focusIntent.current.commandIssued()`. The toast stack stays the table's (or the page's, through the
existing `toastApi` prop): the refusal listener turns a cause into words with `refusalSentence`, as the
three callbacks it replaces did.

### 3.6 What moved, member by member

| Before (base `1f1264c1`)                                                                 | After                                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `PlanFeedForReader.publish` → `publishPlan` → twenty `setX` (`use-plan-read.ts:532-631`) | `PlanFeedForReader.plan.deliver`; the table selects `DeliveredPlan` and derives each value with a memo |
| `PlanFeedForReader.setConnected` → the table's `setConnected`                            | `plan.reportConnection`; `connected` is a member of the delivered plan                                 |
| `PlanFeedForReader.announceRefusal` → `pushToast` closure (`:649-653`)                   | `refusals: Publisher<PlanFeedRefusal>`; the table's `useChannelListener`                               |
| `PlanWriterHost.noteCommandIssued` → `focusIntent.current.commandIssued()` (`:722-724`)  | `commandsIssued: Publisher<undefined>`; the table's listener calls the focus intent                    |
| `PlanWriterHost.setBusy` / `stepStack` / `usePlanDependencies` → React `setBusy`         | `busy: BusyWrites` (`raise`, `lower`), each guard unchanged; the table selects `Busy`                  |
| `PlanWriterHost.announceRefusal` → `pushToast` closure (`:727-729`)                      | `refusals: Publisher<PlanWriteRefusal>`                                                                |
| `calendarMarkersForReader({ announceRefusal })` → `pushToast` closure (`:704-706`)       | `announceRefusal: refusals.publish`                                                                    |
| `ProjectPage`'s `const [roster, setRoster] = useState<Roster>` (`project-page.tsx:504`)  | `createPresence()` once per mount; the factory calls `reportConnection` / `reportUsers`                |
| hover-card settle, drafts settle, `treeReadProject` inside `publishPlan`                 | `useSnapshotChanges(plan, settle)`, keyed on the tree and the steps changing                           |

Five existing `Proof:` comments move with the expression they describe, text unchanged: the
bare-failure-code note (to the refusal listener), the slices note (to the `chartRead` memo), the
failure-text note (to the `treeFailureText` memo), the `estimateMethod` compile note, and the
hover-card-pair note (to `settle`). Three of those checks can still be broken at their new site, and
section 8 re-observes each (`t1`, `s5`, `s1`).

### 3.7 Existing behaviour, and the tests that already hold it

The map's "Exact lifecycle tests" that concern this packet, and the existing tests that are their
oracle. None is edited; each is in a set every slice runs (the twenty adopted files, or the focused
module suites), and each must stay green.

| Behaviour (map item)                        | Existing test(s)                                                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| StrictMode creates a live second owner (10) | `plan-read-and-write.test.tsx` › `creates a live second owner after StrictMode cleans up its first setup`                                                                                                                                            |
| old completions cannot publish (11) — reads | `ignores an old API read that settles by resolve on the same project`, `… by reject …`                                                                                                                                                               |
| old completions — refusals                  | `does not toast an old API mutation refusal into its replacement`, `keeps an old dependency-list refusal out of its busy API replacement`                                                                                                            |
| old completions — busy                      | `does not spend an old API success against its busy replacement`, `does not announce an old arrangement in its busy replacement`; `plan-writer.test.ts` › `leaves the project busy when its reader left before the answer arrived` (new, slice 3)    |
| stale owner                                 | `plan-writer.test.ts` › `refuses a completed gesture whose feed owner was replaced under it`; `does not announce an arrangement after its covering read changes API owner`; `announces an arrangement after the same reader renews its subscription` |
| busy                                        | `says the toolbar is busy, and marks the controls the wait holds back`                                                                                                                                                                               |
| refusal                                     | `says a refused rename in a toast, and puts nothing above the table`, `names an unavailable optimizer and offers no export before a plan is installed`, `plan-chart-seam.test.tsx` › `rereads a marker refused because a peer already deleted it`    |
| roster                                      | `project-page.test.tsx` › `hands the presence slot the roster, and an empty one before any socket`; new in slice 5: `hands the presence slot who the project’s stream says is here, and its connection`                                              |
| focus                                       | `plan-keyboard.test.tsx` › `Cmd+Enter on the last row makes one and lands in it`, `Ctrl+N works from an estimate cell, and sends what was in it first`                                                                                               |
| connection                                  | `says so while the connection is down`                                                                                                                                                                                                               |

Every one of these was observed green on each slice's rehearsed tree (section 9.3), and the ports'
and the snapshot's production-path faults (section 8.4, 8.5) are observed failing named ones.

### 3.8 What this packet does not claim

- The model tests explore each store and the channel; they do not explore React's scheduling. The
  hook tests are examples, one per timing question, each with its own fault.
- The coverage assertions prove the pinned run reached each interleaving, not that the space is
  exhausted.
- The ports carry no lifetime, so there is no "withdrawn" store to model; a project runtime that
  retires stores (task 10) will need its own record.
- `readRefreshOwner` and `isActiveReader` are still closures over the table's refs (section 1).

## 4. Verified facts

Every number is a **fresh observation from this packet's own rehearsal**, on `1f1264c1` (packet f2's
last slice, the head of this packet's planning branch), on 2026-09-24. None is a stop condition: each
slice records its own baseline in step 0 and compares relatively.

### 4.1 The code as it stands

| Fact                                                                                                                                                                                                                                                                               | Where                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `PlanFeedForReader` requires `publish`, `announceRefusal`, `setConnected`                                                                                                                                                                                                          | `modules/plan-feed/composition.ts:21-23`                                                         |
| `PlanWriterHost` requires `noteCommandIssued`, `setBusy`, `announceRefusal`                                                                                                                                                                                                        | `modules/plan-writer/contract.ts:50`, `:54`, `:56`                                               |
| `PlanFeedHost` (the feature's own host) is what `createPlanFeed` takes, and its suite builds it directly; it is **not** changed — only the composition's input is                                                                                                                  | `modules/plan-feed/contract.ts:126-145`, `plan-feed.feature.test.ts:72-101`                      |
| `usePlanReadState` holds 21 `useState`s — the twenty the feed fills plus `busy`                                                                                                                                                                                                    | `components/wbs/use-plan-read.ts:214-346`                                                        |
| `publishPlan` is the one writer of the twenty; it also settles the hover card, the drafts, and `treeReadProject`                                                                                                                                                                   | `use-plan-read.ts:532-631`                                                                       |
| every one of the twenty setters is used only through `publishPlan`: `wbs-table.tsx` destructures them at `:614-667` and passes them to `usePlanRead` at `:952-983`, and nothing else                                                                                               | `git grep -n "setWorkItems\|setChartRead\|…" 1f1264c1 -- apps/wbs/fe-01/src`                     |
| three writers of busy: the writer (`plan-writer.feature.ts:72`, `:138`), `stepStack` (`use-plan-read.ts:755`, `:791`), `usePlanDependencies` (`use-plan-dependencies.ts:124`, `:157`)                                                                                              | read                                                                                             |
| the three refusal callbacks close over the table's `pushToast`                                                                                                                                                                                                                     | `use-plan-read.ts:649-653`, `:704-706`, `:727-729`                                               |
| the roster is `useState` in `ProjectPage`, written only by the stream factory, never reset                                                                                                                                                                                         | `project-page.tsx:504-530`                                                                       |
| `sameSteps` is used only by `publishPlan`                                                                                                                                                                                                                                          | `git grep -n sameSteps 1f1264c1 -- apps/wbs/fe-01/src`: its definition, its call, a test comment |
| the table suites construct `WbsTable` with and without `projectId` changes on one mount (`plan-table.test.tsx:458`, `plan-filter.test.tsx:169`, `plan-layout.test.tsx:1318`), so a store per **project** would change what they see; a store per **mount** is what the states were | read                                                                                             |
| `fe-01` modules have no `module-index` block (only `preferences` has a README that says so), so adding a file to `plan-feed/` or `plan-writer/` owes no index entry                                                                                                                | `grep -l module-index apps/wbs/fe-01/src/modules/*/README.md`                                    |
| React **19.2.8**, fast-check **4.9.0**, Vitest **5.0.0**; `-t` is a **regular expression**, so a title with `+` is escaped in the proof records (`t2`)                                                                                                                             | `node_modules/*/package.json`; `t2` matched 0 tests unescaped, 1 escaped                         |
| `@typescript-eslint/no-unnecessary-condition` refuses an `=== undefined` check after `array[index]` here (no `noUncheckedIndexedAccess`), and `fc.Scheduler.waitAll` is deprecated (`no-deprecated`)                                                                               | each refused a first draft; the listings use `.at()` and `waitIdle()`                            |

### 4.2 The measured blast radius

`git grep -c "PlanFeedForReader\|PlanWriterHost\|planFeedForReader\|createPlanWriter\|noteCommandIssued" 1f1264c1 -- apps/wbs/fe-01/src`:
`use-plan-read.ts` 5, `plan-writer.feature.ts` 5, `plan-writer.test.ts` 7, `plan-feed/composition.ts`
3, `plan-writer/contract.ts` 3, and two JSDoc mentions (`plan-feed/contract.ts`,
`calendar-markers/contract.ts`). So the only test that constructs either changed type is
`plan-writer.test.ts` — its host fixture changes (section 6, slice 3 step 3 names the exact edit), no
assertion does.

Probes on the rehearsal, each a serial run of the twenty adopted files (the set f2 adopted the
runtime fixture in; section 6's `adopted.txt`):

| Tree                                  | Adopted set                         |
| ------------------------------------- | ----------------------------------- |
| base `1f1264c1`                       | 20 files, 1214 tests, exit 0, 350 s |
| after slice 3 (ports and busy wired)  | see section 9.3                     |
| after slice 4 (the snapshot selected) | see section 9.3                     |
| after slice 5 (presence)              | see section 9.3 — one more test     |

### 4.3 Planner observations on the base, not stop conditions

- Sandbox node suite (the README's command): 45 files, 674 tests. Preferences suite: 4 files, 39
  tests. Strict OpenSpec: `{"items":114,"passed":114,"failed":0}`.
- The focused module set this packet runs in several slices (`src/modules/plan-writer`,
  `src/modules/plan-feed`, `project-page.test.tsx`, `app-router.test.tsx`): 5 files, 102 tests.
- The adopted set takes about six minutes serially; every slice that runs it says so, and preamble
  rule 19 applies — poll the log, it is still running.

## 5. File plan

| File (under `apps/wbs/fe-01/` unless it starts with `openspec/`)                      | Slice | Create/modify | Responsibility                                                               |
| ------------------------------------------------------------------------------------- | ----- | ------------- | ---------------------------------------------------------------------------- |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`    | 1–5   | modify        | the requirement (slice 1), then one scenario per slice, each before its code |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                                 | all   | modify        | one fresh entry per slice, appended                                          |
| `src/modules/channel.ts`, `channel.model.test.ts`                                     | 1     | **create**    | section 3.1                                                                  |
| `src/modules/plan-writer/busy-store.ts`, `busy-store.model.test.ts`                   | 1     | **create**    | section 3.2                                                                  |
| `vitest.node-suites.ts`                                                               | 1, 2  | modify        | list the four DOM-free model tests                                           |
| `src/modules/plan-feed/delivered-plan-store.ts`, `delivered-plan-store.model.test.ts` | 2     | **create**    | section 3.3                                                                  |
| `src/modules/plan-feed/presence-store.ts`, `presence-store.model.test.ts`             | 2     | **create**    | section 3.4                                                                  |
| `src/modules/plan-writer/contract.ts`, `plan-writer.feature.ts`                       | 3     | modify        | `PlanWriterHost` takes `busy`, `commandsIssued`, `refusals`                  |
| `src/modules/plan-writer/plan-writer.test.ts`                                         | 3     | modify        | the host fixture (named edit) and two new examples                           |
| `src/modules/plan-feed/composition.ts`                                                | 3, 4  | modify        | `refusals` (slice 3); `plan` replaces `publish` and `setConnected` (slice 4) |
| `src/components/wbs/use-channel-listener.ts`, `.test.tsx`                             | 3     | **create**    | section 3.5, first table                                                     |
| `src/components/wbs/use-plan-read.ts`                                                 | 3, 4  | modify        | the ports and busy (slice 3); the delivered plan and `settle` (slice 4)      |
| `src/components/wbs/wbs-table.tsx`                                                    | 3, 4  | modify        | pass the ports (slice 3); drop the twenty setters (slice 4)                  |
| `src/components/wbs/use-plan-dependencies.ts`                                         | 3     | modify        | `busy: BusyWrites` instead of `setBusy`                                      |
| `src/components/wbs/use-snapshot-changes.ts`, `.test.tsx`                             | 4     | **create**    | section 3.5, second table                                                    |
| `src/components/wbs/project-page.tsx`, `project-page.test.tsx`                        | 5     | modify        | presence from a store; one new example                                       |
| `src/modules/plan-feed/README.md`, `src/modules/plan-writer/README.md`                | 5     | modify        | name the new files and what they own                                         |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                                  | 5     | modify        | task 8 ticked, with a dated note                                             |

Nothing else. No `calendar-markers` file, no `plan-feed.feature.ts` or `contract.ts`, no
`project.json`, no `bun.lock`, no `package.json`.

### Why the slices are cut where they are

A test file that imports a module that does not exist yet stops compiling, and the commit hook lints
test files under `strictTypeChecked`; so each slice lands its tests and the implementation together,
with the tests applied **first** and a real red observed in between (slices 1–4). Slice 5's new test
characterises behaviour the page already has — it passes on the unchanged page, so slice 5 has **no
red**, and its teeth are the two faults `q1` and `q2`. Every file a later slice patches receives its
`Proof:` comments only in the last slice that patches it (section 8's opening says how that is
arranged).

## 6. Slices

Each slice is one executor attempt and ends at a checkpoint: the executor stops and reports, and the
planner reviews and commits before the next slice is dispatched. Every block below is real `sh`, run
from the repository root unless it says `cd`. Every frontend command runs from `apps/wbs/fe-01`, one
at a time — never two Vitest runs at once, and every multi-file run with `--no-file-parallelism
--maxWorkers=1`, as the project's own `test` target runs.

### Step 0 — at the start of **every** slice

**0a. The starting state.**

```sh
set -euo pipefail
mkdir -p "${TMPDIR:?}/evidence"
base=$(git rev-parse HEAD)
echo "base=$base" | tee "$TMPDIR/evidence/base.txt"
# The reviewed SHA reaches the executor through this attempt's own slice note
# (see Dispatch), not through the clone, so this comparison is independent of it.
reviewed=<the SHA named in this attempt's slice note>
test "$base" = "$reviewed"
# One snapshot, one emptiness test; --untracked-files=all lists a new file inside
# an untracked directory by itself rather than collapsing it into the directory.
git status --porcelain --untracked-files=all | tee "$TMPDIR/evidence/status-before.txt"
test ! -s "$TMPDIR/evidence/status-before.txt"
test -f node_modules/fast-check/package.json
version=$(bun -e 'console.log(JSON.parse(await Bun.file("node_modules/fast-check/package.json").text()).version)')
echo "fast-check=$version" | tee "$TMPDIR/evidence/fast-check.txt"
test "$version" = 4.9.0
```

Expected: `base=` a 40-character hash equal to the slice note's, an **empty** `status-before.txt`, and
`fast-check=4.9.0`.

**0b. Two helpers and the patches**, written into `$TMPDIR` so that every later block — each its own
shell — can use them.

````sh
set -euo pipefail
cat > "$TMPDIR/run-check.sh" <<'EOF'
#!/usr/bin/env bash
# Runs one check into $TMPDIR/evidence/<name>.log, appends its own exit status,
# and prints the summary lines. Never fails itself: the status line is the result.
# The summary is orientation only: `tsc --build` under Nx without a TTY may print no
# "Found N errors" line, so a typecheck summary may show just its status.
set -uo pipefail
name=$1
shift
log="$TMPDIR/evidence/$name.log"
if "$@" > "$log" 2>&1; then status=0; else status=$?; fi
echo "status=$status" >> "$log"
test -f "$log"
if summary=$(grep -E "Test Files|Tests  |error TS|Found [0-9]+ error|^status=" "$log"); then
  printf '%s | %s\n' "$name" "$(printf '%s' "$summary" | tr '\n' ' ')"
else
  rc=$?
  test "$rc" -eq 1
fi
EOF
cat > "$TMPDIR/expect-status.sh" <<'EOF'
#!/usr/bin/env bash
# Fails unless the named check's recorded status is exactly the expected one.
set -euo pipefail
log="$TMPDIR/evidence/$1.log"
test -f "$log"
last=$(tail -n 1 "$log")
test "$last" = "status=$2"
EOF
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-g-project-prerequisites.md
test -f "$packet"
mkdir -p "$TMPDIR/patches" "$TMPDIR/mutations"
# Section 7's fenced diffs, in document order, as 01.diff … 17.diff.
awk -v out="$TMPDIR/patches" '
  /^## 7\. The code$/ { inside=1; next }
  /^## 8\. Proofs$/   { inside=0 }
  inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(find "$TMPDIR/patches" -name '*.diff' | wc -l)
echo "patches=$count"
test "$count" -eq 17
# Section 8's fault patches, each named by the heading "#### Proof <id>" above it.
awk -v out="$TMPDIR/mutations" '
  /^## 8\. Proofs$/ { inside=1; next }
  /^## 9\. Verification$/ { inside=0 }
  inside && /^#### Proof / { id=$3; next }
  inside && /^```diff$/ { f=sprintf("%s/%s.diff", out, id); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(find "$TMPDIR/mutations" -name '*.diff' | wc -l)
echo "mutations=$count"
test "$count" -eq 42
# The twenty default-tier files that render the table or the page (packet f2's
# adopted set), relative to apps/wbs/fe-01, for the serial "adopted" runs.
printf '%s\n' src/app-router.test.tsx src/components/ui/page-shortcuts.test.tsx \
  src/components/wbs/gantt-panel.test.tsx src/components/wbs/optimization-integration.test.tsx \
  src/components/wbs/plan-cards.test.tsx src/components/wbs/plan-cells.test.tsx \
  src/components/wbs/plan-chart-seam.test.tsx src/components/wbs/plan-dependencies.test.tsx \
  src/components/wbs/plan-estimates.test.tsx src/components/wbs/plan-filter.test.tsx \
  src/components/wbs/plan-keyboard.test.tsx src/components/wbs/plan-layout.test.tsx \
  src/components/wbs/plan-read-and-write.test.tsx src/components/wbs/plan-row-dependencies.test.tsx \
  src/components/wbs/plan-row-render-cost.test.tsx src/components/wbs/plan-structure.test.tsx \
  src/components/wbs/plan-table.test.tsx src/components/wbs/plan-toolbar.test.tsx \
  src/components/wbs/project-page.test.tsx src/components/wbs/project-settings-modal.test.tsx \
  > "$TMPDIR/adopted.txt"
test "$(wc -l < "$TMPDIR/adopted.txt")" -eq 20
````

Expected: `patches=17` and `mutations=42`, exit 0, and `adopted.txt` holding twenty paths.
**Applying section 7.N** below always means exactly this, never a hand edit:

```sh
set -euo pipefail
git apply --check "$TMPDIR/patches/NN.diff"
git apply "$TMPDIR/patches/NN.diff"
```

`--check` and the apply are separate commands on purpose: joined with `&&` under `set -e`, a failed
check would not stop the shell (section 9.1 records the rehearsal of that). `git apply` without
`--index` writes only the working tree, which the read-only `.git` allows.

**0c. The baselines every slice records**, before any edit. The slice's own extra baselines follow in
its step 1.

```sh
set -euo pipefail
cd apps/wbs/fe-01
bash "$TMPDIR/run-check.sh" base-preferences env TZ=UTC bunx vitest run src/modules/preferences
bash "$TMPDIR/run-check.sh" base-sandbox bunx vitest run --config vitest.node.config.ts \
  --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
bash "$TMPDIR/expect-status.sh" base-preferences 0
bash "$TMPDIR/expect-status.sh" base-sandbox 0
```

And the OpenSpec baseline with the README's strict block (section 9.2):

```sh
set -euo pipefail
report=$(mktemp "$TMPDIR/evidence/openspec-base.XXXXXX.json")
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
jq -c '.summary.totals' "$report"
```

**Record every number.** Every later count in a slice is that slice's own step-0 number plus or minus
what the slice itself adds, never an absolute. Rehearsed values are given beside each expectation
for orientation only. (Rehearsed step-0 values per slice are in section 9.3.)

In the sandbox the executor never runs `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e` or `tool-devsync:test`; section 9.4 gives each to the planner with its expected
relative delta.

### Slice 1 — the channel and the busy store, each with its model test

Owns (7 paths): `spec.md`, `verify.md`, `vitest.node-suites.ts`, and four new files:
`src/modules/channel.ts`, `src/modules/channel.model.test.ts`,
`src/modules/plan-writer/busy-store.ts`, `src/modules/plan-writer/busy-store.model.test.ts`.

- [ ] 1. Step 0. This slice has no extra baseline: its two suites do not exist yet.
- [ ] 2. **The contract first (R4).** Apply section 7.1 (the new requirement and its first two
      scenarios) and rerun the strict block. Expected: exit 0, `passed` equal to step 0's number
      (items are counted per document, not per requirement; rehearsed 114 → 114).
- [ ] 3. Apply section 7.2, the two model tests, with nothing to test yet. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-red-vitest env TZ=UTC bunx vitest run \
    src/modules/channel.model.test.ts src/modules/plan-writer/busy-store.model.test.ts
  bash "$TMPDIR/expect-status.sh" s1-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s1-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 3 errors in 2 files.`,

  ```text
  apps/wbs/fe-01/src/modules/channel.model.test.ts:4:45 - error TS2307: Cannot find module './channel' or its corresponding type declarations.
  apps/wbs/fe-01/src/modules/channel.model.test.ts:136:48 - error TS7006: Parameter 'event' implicitly has an 'any' type.
  apps/wbs/fe-01/src/modules/plan-writer/busy-store.model.test.ts:4:39 - error TS2307: Cannot find module './busy-store' or its corresponding type declarations.
  ```

  and Vitest `status=1`, `Test Files 2 failed (2)`, `Tests no tests`, on
  `Failed to resolve import "./channel"` and `Failed to resolve import "./busy-store"`.

- [ ] 4. Apply section 7.3: `channel.ts`, `busy-store.ts`, and the two lines in
      `vitest.node-suites.ts`.
- [ ] 5. **Green checkpoint.**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-green-models env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/modules/channel.model.test.ts src/modules/plan-writer/busy-store.model.test.ts
  bash "$TMPDIR/run-check.sh" s1-green-tiers env TZ=UTC bunx vitest run src/test-tiers.test.ts
  bash "$TMPDIR/run-check.sh" s1-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s1-green-typecheck s1-green-models s1-green-tiers s1-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: the two models `Test Files 2 passed (2)`, `Tests 2 passed (2)`
  (each about a second); tiers 5 tests; sandbox = step 0 **+ 2 files, + 2 tests** (rehearsed
  45·674 → 47·676).

- [ ] 6. Durable lint, from the repository root:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-lint env NX_DAEMON=false bunx nx run wbs-fe-01:lint
  bash "$TMPDIR/expect-status.sh" s1-lint 0
  ```

  An autofixable import-order or Prettier finding is fixed with `bunx eslint --fix <file>`, not
  reported as a stop (preamble rule 17).

- [ ] 7. The nine proofs of section 8.1 (`c1`–`c5` on the channel, `b1`–`b4` on busy), with section
      8's procedure: every fault observed first, then the nine `Proof:` comments at the sites the
      table names.
- [ ] 8. Rerun the two models (`s1-final-models`) and the preferences and sandbox suites (step 0c's
      commands, `s1-final-*`). Expected: models 2 tests; preferences unchanged; sandbox as step 5.
- [ ] 9. Append this slice's `verify.md` entry (shape below), then owned-file Prettier over the seven
      paths, `--write` then `--check`, then rerun the strict OpenSpec block — **after** the evidence
      edit, so the document it just changed is what was checked.
- [ ] 10. Hand over:

  ```sh
  set -euo pipefail
  git status --porcelain --untracked-files=all | tee "$TMPDIR/evidence/status-after.txt"
  ```

  Expected: exactly the seven owned paths — ` M` for `spec.md`, `verify.md` and
  `vitest.node-suites.ts`, and `??` for the four new files — and nothing else.

Planner commit subject: `feat(frontend): add the project channel and busy store with their model tests`.

### Slice 2 — the delivered plan and presence stores, each with its model test

Owns (7 paths): `spec.md`, `verify.md`, `vitest.node-suites.ts`, and four new files:
`src/modules/plan-feed/delivered-plan-store.ts`, `delivered-plan-store.model.test.ts`,
`presence-store.ts`, `presence-store.model.test.ts` (all under `src/modules/plan-feed/`).

- [ ] 1. Step 0. No extra baseline.
- [ ] 2. **The contract first.** Apply section 7.4 (the scenario "A publication that says nothing
      new changes nothing") and rerun the strict block: exit 0, `passed` unchanged.
- [ ] 3. Apply section 7.5, the two model tests. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s2-red-vitest env TZ=UTC bunx vitest run \
    src/modules/plan-feed/delivered-plan-store.model.test.ts \
    src/modules/plan-feed/presence-store.model.test.ts
  bash "$TMPDIR/expect-status.sh" s2-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s2-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 2 errors in 2 files.`,

  ```text
  apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.model.test.ts:13:8 - error TS2307: Cannot find module './delivered-plan-store' or its corresponding type declarations.
  apps/wbs/fe-01/src/modules/plan-feed/presence-store.model.test.ts:4:67 - error TS2307: Cannot find module './presence-store' or its corresponding type declarations.
  ```

  and Vitest `status=1`, `Test Files 2 failed (2)`, `Tests no tests`, on
  `Failed to resolve import "./delivered-plan-store"` and `Failed to resolve import "./presence-store"`.

- [ ] 4. Apply section 7.6: the two stores and the two lines in `vitest.node-suites.ts`.
- [ ] 5. **Green checkpoint:** slice 1 step 5's block with `s2-` names and these two model files.
      Expected `status=0` everywhere: models `Tests 2 passed (2)` (the delivered plan about 2 s);
      tiers 5; sandbox = step 0 **+ 2 files, + 2 tests** (rehearsed 47·676 → 49·678).
- [ ] 6. Durable lint (`s2-lint`), expected `status=0`.
- [ ] 7. The nine proofs of section 8.2 (`d1`–`d5`, `r1`–`r4`); comments afterwards, at the named
      sites.
- [ ] 8. Rerun the two models and the preferences and sandbox suites (`s2-final-*`): unchanged from
      step 5.
- [ ] 9. `verify.md` entry, owned-file Prettier over the seven paths, the strict OpenSpec block.
- [ ] 10. Hand over. Expected exactly ` M` for `spec.md`, `verify.md`, `vitest.node-suites.ts`, and
      `??` for the four new files.

Planner commit subject:
`feat(frontend): add the delivered plan and presence stores with their model tests`.

### Slice 3 — commands, refusals and busy through the project's ports

Owns (11 paths): `spec.md`, `verify.md`, `src/modules/plan-writer/contract.ts`,
`src/modules/plan-writer/plan-writer.feature.ts`, `src/modules/plan-writer/plan-writer.test.ts`,
`src/modules/plan-feed/composition.ts`, `src/components/wbs/use-plan-read.ts`,
`src/components/wbs/wbs-table.tsx`, `src/components/wbs/use-plan-dependencies.ts`, and two new files:
`src/components/wbs/use-channel-listener.ts`, `src/components/wbs/use-channel-listener.test.tsx`.

- [ ] 1. Step 0, then:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s3-base-writer env TZ=UTC bunx vitest run \
    src/modules/plan-writer/plan-writer.test.ts
  # shellcheck disable=SC2046 # the list is twenty fixed paths without spaces
  bash "$TMPDIR/run-check.sh" s3-base-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  ```

  Expected `status=0` for both. Rehearsed: writer 2 tests; adopted 20 files, 1214 tests (about six
  minutes — the run outlives a tool wait; poll the log, it is still running).

- [ ] 2. **The contract first.** Apply section 7.7 (the scenario "The writer and the feed announce
      through the project's ports") and rerun the strict block: exit 0, `passed` unchanged.
- [ ] 3. Apply section 7.8: the new `use-channel-listener.test.tsx` and `plan-writer.test.ts`. That
      patch contains the **one edit this packet makes to an existing test**, named here so it is not
      mistaken for drift: the two `PlanWriterHost` literals in `plan-writer.test.ts` (in
      `recordingHost` and in `refuses a completed gesture whose feed owner was replaced under it`)
      replace `noteCommandIssued`, `setBusy` and `announceRefusal` with `busy` (`raise` pushes
      `true`, `lower` pushes `false` onto the same `busyChanges`), `commandsIssued` and `refusals`
      (`publish` pushes onto the same `refusals`). No `expect` line changes. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s3-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s3-red-vitest env TZ=UTC bunx vitest run \
    src/modules/plan-writer/plan-writer.test.ts src/components/wbs/use-channel-listener.test.tsx
  bash "$TMPDIR/expect-status.sh" s3-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s3-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 6 errors in 2 files.`,

  ```text
  apps/wbs/fe-01/src/components/wbs/use-channel-listener.test.tsx:7:36 - error TS2307: Cannot find module './use-channel-listener' or its corresponding type declarations.
  apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts:52:7 - error TS2353: Object literal may only specify known properties, and 'busy' does not exist in type 'PlanWriterHost'.
  apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts:57:29 - error TS7006: Parameter 'refusal' implicitly has an 'any' type.
  apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts:92:7 - error TS2353: Object literal may only specify known properties, and 'busy' does not exist in type 'PlanWriterHost'.
  apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts:114:7 - error TS2561: Object literal may only specify known properties, but 'commandsIssued' does not exist in type 'PlanWriterHost'. Did you mean to write 'noteCommandIssued'?
  apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts:134:7 - error TS2353: Object literal may only specify known properties, and 'busy' does not exist in type 'PlanWriterHost'.
  ```

  and Vitest `status=1`, `Test Files 2 failed (2)`, `Tests 4 failed (4)`: every writer test —
  the two existing and the two new — on `TypeError: noteCommandIssued is not a function`, and the
  listener file on `Failed to resolve import "./use-channel-listener"`.

- [ ] 4. Apply section 7.9, one multi-file patch: `contract.ts`, `plan-writer.feature.ts`,
      `composition.ts`, `use-channel-listener.ts`, `use-plan-read.ts`, `wbs-table.tsx`,
      `use-plan-dependencies.ts`.
- [ ] 5. **Green checkpoint.**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s3-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s3-green-focused env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/modules/plan-writer/plan-writer.test.ts \
    src/components/wbs/use-channel-listener.test.tsx
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s3-green-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s3-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s3-green-typecheck s3-green-focused s3-green-adopted s3-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: focused `Test Files 2 passed (2)`, `Tests 9 passed (9)` (writer
  = step 1's number **+ 2**, listener 5); adopted **unchanged** from step 1 (rehearsed 1214 → 1214)
  — the move is behaviour-neutral; sandbox = step 0 **+ 0 files, + 2 tests** (rehearsed 49·678 →
  49·680: the writer suite is a node suite).

- [ ] 6. Durable lint (`s3-lint`), expected `status=0`.
- [ ] 7. The seven proofs of section 8.3 (`l1`–`l5` on the listener hook, `w1`–`w2` on the writer);
      comments afterwards, at the named sites. The ports' production-path proofs in
      `use-plan-read.ts` and `composition.ts` are **not** this slice's: slice 4 patches those files
      again, so they run in slices 4 and 5 (section 8's opening).
- [ ] 8. Rerun the focused pair and the preferences and sandbox suites (`s3-final-*`): unchanged from
      step 5.
- [ ] 9. `verify.md` entry, owned-file Prettier over the eleven paths, the strict OpenSpec block.
- [ ] 10. Hand over. Expected exactly nine ` M` paths (`spec.md`, `verify.md`, `contract.ts`,
      `plan-writer.feature.ts`, `plan-writer.test.ts`, `composition.ts`, `use-plan-read.ts`,
      `wbs-table.tsx`, `use-plan-dependencies.ts`) and `??` for `use-channel-listener.ts` and
      `use-channel-listener.test.tsx`.

Planner commit subject:
`feat(frontend): announce commands and refusals and hold busy through project ports`.

### Slice 4 — the table selects the delivered plan

Owns (7 paths): `spec.md`, `verify.md`, `src/modules/plan-feed/composition.ts`,
`src/components/wbs/use-plan-read.ts`, `src/components/wbs/wbs-table.tsx`, and two new files:
`src/components/wbs/use-snapshot-changes.ts`, `src/components/wbs/use-snapshot-changes.test.tsx`.

- [ ] 1. Step 0, then the adopted set (`s4-base-adopted`, slice 3 step 1's command). Expected
      `status=0`; rehearsed 1214.
- [ ] 2. **The contract first.** Apply section 7.10 (the scenario "The table selects the delivered
      plan and settles what changed") and rerun the strict block: exit 0, `passed` unchanged.
- [ ] 3. Apply section 7.11, the new hook test. **Red checkpoint:** typecheck (`s4-red-typecheck`) and
      Vitest on `src/components/wbs/use-snapshot-changes.test.tsx` (`s4-red-vitest`), both expected
      `status=1`. Rehearsed exactly: `Found 1 error in apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.test.tsx:8`,

  ```text
  apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.test.tsx:8:36 - error TS2307: Cannot find module './use-snapshot-changes' or its corresponding type declarations.
  ```

  and `Test Files 1 failed (1)`, `Tests no tests`, on `Failed to resolve import "./use-snapshot-changes"`.

- [ ] 4. Apply section 7.12, one multi-file patch: `use-snapshot-changes.ts`, `use-plan-read.ts`,
      `wbs-table.tsx`, `composition.ts`.
- [ ] 5. **Green checkpoint:** typecheck (`s4-green-typecheck`); the hook file (`s4-green-hook`); the
      adopted set (`s4-green-adopted`); the sandbox suite (`s4-green-sandbox`); each with slice 3
      step 5's form. Expected `status=0` everywhere: hook `Tests 6 passed (6)`; adopted
      **unchanged** from step 1 (rehearsed 1214 → 1214); sandbox unchanged from step 0 (49·680).
- [ ] 6. Durable lint (`s4-lint`), expected `status=0`.
- [ ] 7. The eleven proofs of section 8.4 (`u1`–`u5` on the hook, `s1`–`s5` and `f1` on the table's
      production path); every fault first, then the comments at the named sites.
- [ ] 8. Rerun the hook file and the preferences and sandbox suites (`s4-final-*`): unchanged from
      step 5.
- [ ] 9. `verify.md` entry, owned-file Prettier over the seven paths, the strict OpenSpec block.
- [ ] 10. Hand over. Expected exactly five ` M` paths (`spec.md`, `verify.md`, `composition.ts`,
      `use-plan-read.ts`, `wbs-table.tsx`) and `??` for the two new hook files.

Planner commit subject:
`feat(frontend): select the delivered plan from its store instead of twenty setters`.

### Slice 5 — presence from a store, the ports' production-path proofs, and task 8

Owns (8 paths): `spec.md`, `verify.md`, `tasks.md`, `src/components/wbs/project-page.tsx`,
`src/components/wbs/project-page.test.tsx`, `src/modules/plan-feed/README.md`,
`src/modules/plan-writer/README.md`, and `src/components/wbs/use-plan-read.ts` — for its four
`Proof:` comments only (section 8.5, `t1`–`t3` and `m1`).

- [ ] 1. Step 0, then the page and the router that renders it (`s5-base-page`,
      `TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 src/components/wbs/project-page.test.tsx src/app-router.test.tsx`)
      and the adopted set (`s5-base-adopted`). Expected `status=0`; rehearsed 2 files, 77 tests;
      adopted 1214.
- [ ] 2. **The contract first.** Apply section 7.13 (the scenario "The header selects presence from a
      store") and rerun the strict block: exit 0, `passed` unchanged.
- [ ] 3. Apply section 7.14, the new page example. **No red, by design:** it characterises what the
      page already does, so run it now and expect it to **pass** on the unchanged page — the check
      that it asserts real behaviour is its two faults, `q1` and `q2`:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s5-before-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s5-before-page env TZ=UTC bunx vitest run \
    src/components/wbs/project-page.test.tsx
  bash "$TMPDIR/expect-status.sh" s5-before-typecheck 0
  bash "$TMPDIR/expect-status.sh" s5-before-page 0
  ```

  Expected: both `status=0`; the page file at step 1's page count **+ 1** (rehearsed 73).

- [ ] 4. Apply sections 7.15 (`project-page.tsx`), 7.16 (the two module READMEs) and 7.17
      (`tasks.md`), then date the note by observation, never by copying a date from this packet:

  ```sh
  set -euo pipefail
  tasks=openspec/changes/adopt-frontend-lifetimes/tasks.md
  test -f "$tasks"
  test "$(grep -c '<observed-date>' "$tasks")" -eq 1
  observed=$(date -u +%F)
  sed -i "s/<observed-date>/$observed/" "$tasks"
  grep -n "observed $observed:" "$tasks"
  if grep -n '<observed-date>' "$tasks"; then echo "placeholder left" >&2; exit 1; else rc=$?; test "$rc" -eq 1; fi
  ```

  Expected: one line printed, exit 0; task 8's box is `[x]`.

- [ ] 5. **Green checkpoint:** typecheck (`s5-green-typecheck`), the page and router pair
      (`s5-green-page`), the adopted set (`s5-green-adopted`), the sandbox suite (`s5-green-sandbox`),
      and the repository-wide format check:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s5-format env NX_DAEMON=false bunx nx format:check --all
  bash "$TMPDIR/expect-status.sh" s5-format 0
  ```

  Expected `status=0` everywhere: page and router = step 1's **+ 1** (rehearsed 77 → 78); adopted
  = step 1's **+ 1** (rehearsed 1214 → 1215 — `project-page.test.tsx` is in the set); sandbox
  unchanged (49·680).

- [ ] 6. Durable lint (`s5-lint`), expected `status=0`.
- [ ] 7. The six proofs of section 8.5 (`t1`–`t3` and `m1` on the table's ports, `q1`–`q2` on the
      page); every fault first, then the comments at the named sites — four in `use-plan-read.ts`,
      which is why that file is in this slice's ownership, Prettier and hand-over lists.
- [ ] 8. Rerun the page pair and the preferences and sandbox suites (`s5-final-*`): unchanged from
      step 5.
- [ ] 9. `verify.md` entry. Then owned-file Prettier over the eight paths, `nx format:check --all`
      again (`s5-format-after`), and the strict OpenSpec block — all after the evidence edit.
      Never a repository-wide format **write**.
- [ ] 10. Hand over. Expected exactly eight ` M` paths: `spec.md`, `verify.md`, `tasks.md`,
      `project-page.tsx`, `project-page.test.tsx`, the two READMEs, `use-plan-read.ts`.

Planner commit subject:
`refactor(frontend): hand the header presence from a store and close task 8`.

### Verification record entries

Each slice appends one entry to `openspec/changes/adopt-frontend-lifetimes/verify.md`, headed
`## Packet 050.7g, slice N — <what the slice did>`, containing only its own observations: the attempt
id and starting hash; step 0's baselines as numbers; every command's status; the red checkpoint's own
diagnostics (or, for slice 5, the passing characterisation); the green counts; every proof of that
slice with its observed message (and, for the model faults, seed, run number and shrunk
counterexample); and what stayed **pending planner verification** — `wbs-fe-01:test`,
`wbs-fe-01:test:unit`, `wbs-fe-01:build`, `wbs-fe-01:e2e`, `tool-devsync:test` and the host gate.
Evidence references are basenames relative to that attempt's evidence directory, never absolute
paths. Do not read, quote or restate an earlier entry.

### Dispatch

One attempt per slice, from the reviewed packet, with no network. The base of slice 1 is the planning
lineage that contains packet f2's last slice `1f1264c162baddc250bb391557ad38ae5fa982de` **and** this
packet — main after f2's PR merged with this packet's branch, or this packet's planning head. If that
base is later than `1f1264c1`, section 9.1's script is rerun on it with `git archive <base>` first; the
`index` lines in the diffs are informational (`git apply` without `--index` or `--3way` ignores them).
This block holds the only absolute paths in this document.

```sh
# Slice 1, from the reviewed base.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-g-project-prerequisites 1 <reviewed-base-sha> \
  --batch batch-6 \
  --require-ancestor 1f1264c162baddc250bb391557ad38ae5fa982de \
  --slice-note 'reviewed base <reviewed-base-sha>' \
  --preserve evidence

# Slices 2 to 5, each into the same clone once the previous slice is reviewed
# and committed; N is the slice, P the previous slice's planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-g-project-prerequisites N P \
  --batch batch-6 \
  --require-ancestor 1f1264c162baddc250bb391557ad38ae5fa982de \
  --resume --require-ancestor P \
  --slice-note 'reviewed base P' \
  --preserve evidence
```

No `--seed`: no slice reads another attempt's evidence. No `--network`: nothing reaches a host.
`--slice-note` is load-bearing: it is the only channel by which the reviewed SHA reaches the executor
without passing through the clone, and step 0a reads it.

## 7. The code

Seventeen fenced diffs, in slice order; step 0b extracts them as `01.diff` … `17.diff` in this order,
and section 9.1 records the script that applies all seventeen to a copy of the base, with its output.
Each heading names the slice and the step that applies it. None carries a new `Proof:` comment: the
five `Proof:` comments inside 7.9 and 7.12 are existing ones moving with their expression (section
3.6).

### 7.1 `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` — slice 1, the new requirement

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 87cf35d2..5b3d182a 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -331,3 +331,35 @@ the replacement".
   changes while the development server is serving the page
 - **THEN** the page is reloaded as a new document, and no second bootstrap runs
   inside the old one
+
+### Requirement: A project's plan state and announcements live outside React
+
+The plan feed and the plan writer SHALL be built from project-owned stores and
+ports - the delivered plan, the busy state, the presence of other readers, a
+channel for refusals and a channel for commands issued - and SHALL NOT be handed
+a React state setter, a React ref or a toast function. A store SHALL keep its
+snapshot the same object until one of its members changes, SHALL tell each
+listener once per change and only after the change is made, and SHALL NOT throw
+a lifecycle refusal. A channel SHALL deliver each event, in publication order, to
+the listeners subscribed when that event's delivery starts, SHALL NOT enter a
+listener while it is already running, SHALL NOT deliver to a listener after its
+unsubscribe has returned, and SHALL let a listener's failure reach the publisher
+after the other listeners have been delivered to. Delivery SHALL select from the
+stores and listen to the channels, and what a reader sees SHALL NOT change.
+
+#### Scenario: A listener that publishes, joins or leaves during a delivery
+
+- **WHEN** a listener publishes again, subscribes another listener, or
+  unsubscribes one whose turn in the current delivery has not come, from inside
+  that delivery
+- **THEN** the new event reaches every listener after the current one, the new
+  listener hears only later events, the removed listener hears nothing more, and
+  no listener is entered twice at once
+
+#### Scenario: Busy is told once per change
+
+- **WHEN** a gesture raises busy while it is already raised, or lowers it while
+  it is already lowered, or a listener raises and lowers it from inside its own
+  notification
+- **THEN** a listener is told exactly once for each change of the value, after
+  the change, and reads the value as it stands at that instant
```

### 7.2 `src/modules/channel.model.test.ts` and `src/modules/plan-writer/busy-store.model.test.ts` — slice 1, **new files**, the two model tests

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.model.test.ts b/apps/wbs/fe-01/src/modules/channel.model.test.ts
new file mode 100644
index 00000000..7805a622
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/channel.model.test.ts
@@ -0,0 +1,415 @@
+import fc from 'fast-check';
+import { describe, expect, it } from 'vitest';
+
+import { type Channel, createChannel } from './channel';
+
+/**
+ * What one listener does each time it hears an event, chosen when it subscribes.
+ *
+ * Every re-entrant thing a listener can do to the channel it is being called
+ * from: publish again, drop the newest other listener — usually one whose turn
+ * in this very delivery has not come yet — add one, or fail.
+ */
+type Behaviour =
+  | { readonly kind: 'record' }
+  | { readonly kind: 'echo' }
+  | { readonly kind: 'dropNewest' }
+  | { readonly kind: 'join' }
+  | { readonly kind: 'fail' };
+
+/** Events published from outside are below this; an echo adds it, and is never echoed again. */
+const ECHO = 1000;
+
+/**
+ * How many times each command actually ran, and how many times each
+ * interleaving the rules are about was actually reached, across the whole
+ * pinned run — a property whose commands were all skipped proves nothing.
+ */
+const ran: Record<string, number> = {};
+function note(kind: string): void {
+  ran[kind] = (ran[kind] ?? 0) + 1;
+}
+const COMMAND_KINDS: readonly string[] = [
+  'subscribe',
+  'publishNow',
+  'publishLater',
+  'unsubscribeLater',
+  'unsubscribeTwice',
+  'settle',
+];
+const reached = {
+  echoQueued: 0,
+  droppedBeforeTurn: 0,
+  joinedDuringDelivery: 0,
+  oneFailure: 0,
+  severalFailures: 0,
+};
+
+/**
+ * The reference: the subscribers the model believes are registered, in order,
+ * and how each behaves. It shares nothing with the
+ * channel — arrays instead of a set, and its own loop.
+ */
+interface ChannelModel {
+  subscribed: number[];
+  behaviours: Map<number, Behaviour>;
+  nextId: number;
+}
+
+/** One hearing, as the real listener recorded it. */
+interface Hearing {
+  readonly listener: number;
+  readonly event: number;
+  /** How many listener calls were active, this one included. */
+  readonly depth: number;
+}
+
+interface ChannelWorld {
+  readonly channel: Channel<number>;
+  readonly scheduler: fc.Scheduler;
+  readonly unsubscribes: Map<number, () => void>;
+  /** The ids this file believes are registered, in subscription order. */
+  order: number[];
+  /** The ids whose unsubscribe has returned; nothing may reach them afterwards. */
+  readonly gone: Set<number>;
+  readonly hearings: Hearing[];
+  /** Every failure a listener threw, by `listener:event`, so identity can be asserted. */
+  readonly thrown: Map<string, Error>;
+  /** Scheduled publications and unsubscriptions, awaited by `settle` and by teardown. */
+  readonly inflight: Promise<void>[];
+  depth: number;
+  nextId: number;
+}
+
+/** What the reference expects one outer publication to do. */
+function expectedPublication(
+  model: ChannelModel,
+  event: number,
+): { readonly hearings: { listener: number; event: number }[]; readonly failures: string[] } {
+  const hearings: { listener: number; event: number }[] = [];
+  const failures: string[] = [];
+  const queue = [event];
+  while (queue.length > 0) {
+    const current = queue.shift();
+    if (current === undefined) break;
+    const recipients = model.subscribed.slice();
+    for (const listener of recipients) {
+      if (!model.subscribed.includes(listener)) {
+        reached.droppedBeforeTurn += 1;
+        continue;
+      }
+      hearings.push({ listener, event: current });
+      const behaviour = model.behaviours.get(listener);
+      if (behaviour === undefined) throw new Error(`the model lost listener ${String(listener)}`);
+      if (behaviour.kind === 'echo' && current < ECHO) {
+        queue.push(current + ECHO);
+        reached.echoQueued += 1;
+      }
+      if (behaviour.kind === 'dropNewest') {
+        const newest = model.subscribed.filter((id) => id !== listener).at(-1);
+        model.subscribed = model.subscribed.filter((id) => id !== newest);
+      }
+      if (behaviour.kind === 'join') {
+        const joined = model.nextId;
+        model.nextId += 1;
+        model.subscribed.push(joined);
+        model.behaviours.set(joined, { kind: 'record' });
+        reached.joinedDuringDelivery += 1;
+      }
+      if (behaviour.kind === 'fail') failures.push(`${String(listener)}:${String(current)}`);
+    }
+  }
+  return { hearings, failures };
+}
+
+/** Unsubscribes one listener for real and records that nothing may reach it now. */
+function leave(world: ChannelWorld, id: number): void {
+  const unsubscribe = world.unsubscribes.get(id);
+  if (unsubscribe === undefined) throw new Error(`listener ${String(id)} was never registered`);
+  unsubscribe();
+  world.order = world.order.filter((listener) => listener !== id);
+  world.gone.add(id);
+}
+
+/** Registers one real listener that behaves as `behaviour` says. */
+function subscribeReal(world: ChannelWorld, id: number, behaviour: Behaviour): void {
+  const unsubscribe = world.channel.subscribe((event) => {
+    world.depth += 1;
+    try {
+      // Nothing may reach a listener after its unsubscribe returned.
+      expect(
+        world.gone.has(id),
+        `listener ${String(id)} heard ${String(event)} after it left`,
+      ).toBe(false);
+      world.hearings.push({ listener: id, event, depth: world.depth });
+      if (behaviour.kind === 'echo' && event < ECHO) world.channel.publish(event + ECHO);
+      if (behaviour.kind === 'dropNewest') {
+        // Chosen from the test's own record of who is registered, never from the
+        // channel: `order` is kept by this file alone.
+        const newest = world.order.filter((listener) => listener !== id).at(-1);
+        if (newest !== undefined) leave(world, newest);
+      }
+      if (behaviour.kind === 'join') {
+        const joined = world.nextId;
+        world.nextId += 1;
+        subscribeReal(world, joined, { kind: 'record' });
+      }
+      if (behaviour.kind === 'fail') {
+        const failure = new Error(`listener ${String(id)} refused ${String(event)}`);
+        world.thrown.set(`${String(id)}:${String(event)}`, failure);
+        throw failure;
+      }
+    } finally {
+      world.depth -= 1;
+    }
+  });
+  world.unsubscribes.set(id, unsubscribe);
+  world.order.push(id);
+}
+
+/** Publishes from outside and checks every hearing and the failure against the reference. */
+function publishAndCheck(model: ChannelModel, world: ChannelWorld, event: number): void {
+  const expected = expectedPublication(model, event);
+  const before = world.hearings.length;
+  let failure: unknown = null;
+  try {
+    world.channel.publish(event);
+  } catch (caught: unknown) {
+    failure = caught;
+  }
+  const heard = world.hearings.slice(before);
+  expect(
+    heard.map(({ listener, event: e }) => ({ listener, event: e })),
+    `who heard ${String(event)}, in what order`,
+  ).toEqual(expected.hearings);
+  for (const hearing of heard) {
+    expect(hearing.depth, `listener ${String(hearing.listener)} was entered re-entrantly`).toBe(1);
+  }
+  if (expected.failures.length === 0) {
+    expect(failure, `publish(${String(event)}) threw with no failing listener`).toBeNull();
+    return;
+  }
+  const errors = expected.failures.map((key) => world.thrown.get(key));
+  if (expected.failures.length === 1) {
+    reached.oneFailure += 1;
+    expect(failure, `publish(${String(event)}) did not rethrow the one failure by identity`).toBe(
+      errors[0],
+    );
+    return;
+  }
+  reached.severalFailures += 1;
+  expect(failure, `publish(${String(event)}) did not aggregate its failures`).toBeInstanceOf(
+    AggregateError,
+  );
+  if (!(failure instanceof AggregateError)) return;
+  expect(failure.errors.length, 'aggregated failures').toBe(errors.length);
+  failure.errors.forEach((error: unknown, index) => {
+    expect(error, `aggregated failure ${String(index)}`).toBe(errors[index]);
+  });
+}
+
+type ChannelCommand = fc.AsyncCommand<ChannelModel, ChannelWorld>;
+
+class Subscribe implements ChannelCommand {
+  constructor(readonly behaviour: Behaviour) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: ChannelModel, world: ChannelWorld): Promise<void> {
+    note('subscribe');
+    const id = model.nextId;
+    model.nextId += 1;
+    expect(world.nextId, 'the model and the world agree on the next listener').toBe(id);
+    world.nextId += 1;
+    model.subscribed.push(id);
+    model.behaviours.set(id, this.behaviour);
+    subscribeReal(world, id, this.behaviour);
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `subscribe(${this.behaviour.kind})`;
+  }
+}
+
+class PublishNow implements ChannelCommand {
+  constructor(readonly event: number) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: ChannelModel, world: ChannelWorld): Promise<void> {
+    note('publishNow');
+    publishAndCheck(model, world, this.event);
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `publish(${String(this.event)})`;
+  }
+}
+
+/** A publication an asynchronous producer makes whenever the scheduler says. */
+class PublishLater implements ChannelCommand {
+  constructor(readonly event: number) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: ChannelModel, world: ChannelWorld): Promise<void> {
+    note('publishLater');
+    world.inflight.push(
+      world.scheduler.schedule(Promise.resolve(), `publish ${String(this.event)}`).then(() => {
+        publishAndCheck(model, world, this.event);
+      }),
+    );
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `publishLater(${String(this.event)})`;
+  }
+}
+
+/** A subscriber disposed whenever the scheduler says — an unmount racing a producer. */
+class UnsubscribeLater implements ChannelCommand {
+  constructor(readonly pick: number) {}
+  check(model: ChannelModel): boolean {
+    return model.subscribed.length > 0;
+  }
+  async run(model: ChannelModel, world: ChannelWorld): Promise<void> {
+    note('unsubscribeLater');
+    const id = model.subscribed.at(this.pick % model.subscribed.length);
+    if (id === undefined) throw new Error('no subscriber to pick');
+    world.inflight.push(
+      world.scheduler.schedule(Promise.resolve(), `unsubscribe ${String(id)}`).then(() => {
+        model.subscribed = model.subscribed.filter((listener) => listener !== id);
+        leave(world, id);
+      }),
+    );
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `unsubscribeLater(${String(this.pick)})`;
+  }
+}
+
+class UnsubscribeTwice implements ChannelCommand {
+  constructor(readonly pick: number) {}
+  check(model: ChannelModel): boolean {
+    return model.subscribed.length > 0;
+  }
+  async run(model: ChannelModel, world: ChannelWorld): Promise<void> {
+    note('unsubscribeTwice');
+    const id = model.subscribed.at(this.pick % model.subscribed.length);
+    if (id === undefined) throw new Error('no subscriber to pick');
+    const unsubscribe = world.unsubscribes.get(id);
+    if (unsubscribe === undefined) throw new Error(`listener ${String(id)} was never registered`);
+    model.subscribed = model.subscribed.filter((listener) => listener !== id);
+    leave(world, id);
+    unsubscribe();
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `unsubscribeTwice(${String(this.pick)})`;
+  }
+}
+
+/** Lets the scheduler run everything pending, in an order it chooses. */
+class Settle implements ChannelCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(_model: ChannelModel, world: ChannelWorld): Promise<void> {
+    note('settle');
+    await world.scheduler.waitIdle();
+    const settled = world.inflight.splice(0, world.inflight.length);
+    for (const task of settled) await task;
+  }
+  toString(): string {
+    return 'settle';
+  }
+}
+
+const behaviourArb: fc.Arbitrary<Behaviour> = fc.oneof(
+  fc.constant<Behaviour>({ kind: 'record' }),
+  fc.constant<Behaviour>({ kind: 'echo' }),
+  fc.constant<Behaviour>({ kind: 'dropNewest' }),
+  fc.constant<Behaviour>({ kind: 'join' }),
+  fc.constant<Behaviour>({ kind: 'fail' }),
+);
+const eventArb = fc.integer({ min: 1, max: ECHO - 1 });
+
+const commandsArb = fc.commands<ChannelModel, ChannelWorld, false>(
+  [
+    behaviourArb.map((behaviour) => new Subscribe(behaviour)),
+    eventArb.map((event) => new PublishNow(event)),
+    eventArb.map((event) => new PublishLater(event)),
+    fc.nat(8).map((pick) => new UnsubscribeLater(pick)),
+    fc.nat(8).map((pick) => new UnsubscribeTwice(pick)),
+    fc.constant(new Settle()),
+  ],
+  { maxCommands: 16, size: 'max' },
+);
+
+/**
+ * The channel, run against a reference model.
+ *
+ * The record this executes is section 3.1 of
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-g-project-prerequisites.md`.
+ */
+describe('the channel, against a reference model', () => {
+  it('delivers exactly what the model says, under generated interleavings', async () => {
+    // The counterexamples this file's own packet records were observed under the
+    // frozen lockfile's fast-check; a different version reorders generation.
+    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');
+
+    await fc.assert(
+      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
+        const world: ChannelWorld = {
+          channel: createChannel<number>(),
+          scheduler,
+          unsubscribes: new Map(),
+          order: [],
+          gone: new Set(),
+          hearings: [],
+          thrown: new Map(),
+          inflight: [],
+          depth: 0,
+          nextId: 0,
+        };
+        const model: ChannelModel = { subscribed: [], behaviours: new Map(), nextId: 0 };
+        let failure: Error | null = null;
+        try {
+          await fc.asyncModelRun<ChannelModel, ChannelWorld, false, ChannelModel>(
+            () => ({ model, real: world }),
+            commands,
+          );
+        } catch (caught: unknown) {
+          failure = caught instanceof Error ? caught : new Error(String(caught));
+        }
+        // Teardown runs whatever happened: every scheduled producer and disposal
+        // still runs and is still checked, so a failure there is reported beside
+        // an assertion failure rather than lost behind it.
+        const unreported: string[] = [];
+        try {
+          await scheduler.waitIdle();
+          for (const task of world.inflight.splice(0, world.inflight.length)) await task;
+        } catch (caught: unknown) {
+          unreported.push(String(caught));
+        }
+        if (unreported.length === 0) {
+          if (failure !== null) throw failure;
+          return;
+        }
+        if (failure === null) throw new Error(`teardown refused: ${unreported.join(' | ')}`);
+        throw new Error(`the property failed and its teardown refused: ${unreported.join(' | ')}`, {
+          cause: failure,
+        });
+      }),
+      { seed: 20260924, numRuns: 300 },
+    );
+
+    for (const kind of COMMAND_KINDS) {
+      expect(ran[kind] ?? 0, `the pinned run never executed ${kind}`).toBeGreaterThan(0);
+    }
+    for (const [what, count] of Object.entries(reached)) {
+      expect(count, `the pinned run never reached ${what}`).toBeGreaterThan(0);
+    }
+  });
+});
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.model.test.ts b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.model.test.ts
new file mode 100644
index 00000000..ea98851b
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.model.test.ts
@@ -0,0 +1,327 @@
+import fc from 'fast-check';
+import { describe, expect, it } from 'vitest';
+
+import { type Busy, createBusy } from './busy-store';
+
+/**
+ * What one listener does each time it is told busy changed.
+ *
+ * `bounce` is the re-entrant one: the first time it is told the project is
+ * idle, it raises and lowers again from inside that notification — two more
+ * changes while the first is still being delivered. Once, because a listener
+ * that did it every time would never let delivery end.
+ */
+type Behaviour = 'read' | 'bounce' | 'leave';
+
+const ran: Record<string, number> = {};
+function note(kind: string): void {
+  ran[kind] = (ran[kind] ?? 0) + 1;
+}
+const COMMAND_KINDS: readonly string[] = [
+  'raise',
+  'lower',
+  'gesture',
+  'subscribe',
+  'unsubscribeLater',
+  'settle',
+];
+const reached = {
+  raiseWhileRaised: 0,
+  lowerWhileLowered: 0,
+  gestureEndedOutOfOrder: 0,
+  reentrantBounce: 0,
+};
+
+/**
+ * The reference: the value, how many times it has changed, and who is
+ * listening. Its own record, never read back out of the store.
+ */
+interface BusyModel {
+  busy: boolean;
+  /** Every change of the value so far; the listener that never leaves must have heard this many. */
+  changes: number;
+  subscribed: Set<number>;
+  nextListener: number;
+  nextGesture: number;
+  ended: Set<number>;
+}
+
+interface BusyWorld {
+  readonly busy: Busy;
+  readonly scheduler: fc.Scheduler;
+  readonly model: BusyModel;
+  readonly unsubscribes: Map<number, () => void>;
+  readonly gone: Set<number>;
+  /** What the listener that never leaves has heard: how often, and the last value it read. */
+  readonly sentinel: { heard: number; last: boolean | null };
+  readonly listening: { depth: number };
+  readonly inflight: Promise<void>[];
+}
+
+/** Sets the model's value, counting a change. */
+function become(model: BusyModel, next: boolean): void {
+  if (model.busy === next) {
+    if (next) reached.raiseWhileRaised += 1;
+    else reached.lowerWhileLowered += 1;
+    return;
+  }
+  model.busy = next;
+  model.changes += 1;
+}
+
+/** Asserts the store against the model, as of now. */
+function assertBusy(world: BusyWorld, what: string): void {
+  const { model } = world;
+  expect(world.busy.snapshot(), `${what}: busy`).toBe(model.busy);
+  // A change made from inside a listener is told after the delivery that
+  // listener is part of, so the count is exact only once no listener is running.
+  if (world.listening.depth > 0) return;
+  expect(world.sentinel.heard, `${what}: changes heard by the listener that never leaves`).toBe(
+    model.changes,
+  );
+  if (world.sentinel.heard > 0) {
+    expect(world.sentinel.last, `${what}: the last value the sentinel read`).toBe(model.busy);
+  }
+}
+
+function raise(world: BusyWorld, what: string): void {
+  become(world.model, true);
+  world.busy.raise();
+  assertBusy(world, what);
+}
+
+function lower(world: BusyWorld, what: string): void {
+  become(world.model, false);
+  world.busy.lower();
+  assertBusy(world, what);
+}
+
+function subscribeReal(world: BusyWorld, id: number, behaviour: Behaviour): void {
+  let bounced = false;
+  const unsubscribe = world.busy.subscribe(() => {
+    world.listening.depth += 1;
+    try {
+      expect(world.gone.has(id), `listener ${String(id)} was told after it left`).toBe(false);
+      // Told only after the change it is told about: what it reads is the
+      // model's value at this very instant, re-entrant changes included.
+      const now = world.busy.snapshot();
+      expect(now, `listener ${String(id)} read busy`).toBe(world.model.busy);
+      if (behaviour === 'bounce' && !now && !bounced) {
+        bounced = true;
+        reached.reentrantBounce += 1;
+        raise(world, `bounce raise from listener ${String(id)}`);
+        lower(world, `bounce lower from listener ${String(id)}`);
+      }
+      if (behaviour === 'leave') {
+        world.model.subscribed.delete(id);
+        world.unsubscribes.get(id)?.();
+        world.gone.add(id);
+      }
+    } finally {
+      world.listening.depth -= 1;
+    }
+  });
+  world.unsubscribes.set(id, unsubscribe);
+}
+
+type BusyCommand = fc.AsyncCommand<BusyModel, BusyWorld>;
+
+class Raise implements BusyCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(_model: BusyModel, world: BusyWorld): Promise<void> {
+    note('raise');
+    raise(world, 'raise');
+    await Promise.resolve();
+  }
+  toString(): string {
+    return 'raise';
+  }
+}
+
+class Lower implements BusyCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(_model: BusyModel, world: BusyWorld): Promise<void> {
+    note('lower');
+    lower(world, 'lower');
+    await Promise.resolve();
+  }
+  toString(): string {
+    return 'lower';
+  }
+}
+
+/**
+ * A gesture: raises now and lowers when be-01 answers, which is whenever the
+ * scheduler says — possibly after a gesture started later.
+ */
+class Gesture implements BusyCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(model: BusyModel, world: BusyWorld): Promise<void> {
+    note('gesture');
+    const gesture = model.nextGesture;
+    model.nextGesture += 1;
+    raise(world, `gesture ${String(gesture)} starts`);
+    world.inflight.push(
+      world.scheduler.schedule(Promise.resolve(), `gesture ${String(gesture)} ends`).then(() => {
+        if ([...model.ended].some((other) => other > gesture)) reached.gestureEndedOutOfOrder += 1;
+        model.ended.add(gesture);
+        lower(world, `gesture ${String(gesture)} ends`);
+      }),
+    );
+    await Promise.resolve();
+  }
+  toString(): string {
+    return 'gesture';
+  }
+}
+
+class Subscribe implements BusyCommand {
+  constructor(readonly behaviour: Behaviour) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: BusyModel, world: BusyWorld): Promise<void> {
+    note('subscribe');
+    const id = model.nextListener;
+    model.nextListener += 1;
+    model.subscribed.add(id);
+    subscribeReal(world, id, this.behaviour);
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `subscribe(${this.behaviour})`;
+  }
+}
+
+/** A listener disposed whenever the scheduler says — a component unmounting. */
+class UnsubscribeLater implements BusyCommand {
+  constructor(readonly pick: number) {}
+  check(model: BusyModel): boolean {
+    return model.subscribed.size > 0;
+  }
+  async run(model: BusyModel, world: BusyWorld): Promise<void> {
+    note('unsubscribeLater');
+    const listeners = [...model.subscribed];
+    const id = listeners.at(this.pick % listeners.length);
+    if (id === undefined) throw new Error('no listener to pick');
+    world.inflight.push(
+      world.scheduler.schedule(Promise.resolve(), `listener ${String(id)} leaves`).then(() => {
+        model.subscribed.delete(id);
+        world.unsubscribes.get(id)?.();
+        world.gone.add(id);
+      }),
+    );
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `unsubscribeLater(${String(this.pick)})`;
+  }
+}
+
+class Settle implements BusyCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(_model: BusyModel, world: BusyWorld): Promise<void> {
+    note('settle');
+    await world.scheduler.waitIdle();
+    for (const task of world.inflight.splice(0, world.inflight.length)) await task;
+    assertBusy(world, 'settle');
+  }
+  toString(): string {
+    return 'settle';
+  }
+}
+
+const commandsArb = fc.commands<BusyModel, BusyWorld, false>(
+  [
+    fc.constant(new Raise()),
+    fc.constant(new Lower()),
+    fc.constant(new Gesture()),
+    fc.constantFrom<Behaviour>('read', 'bounce', 'leave').map((b) => new Subscribe(b)),
+    fc.nat(8).map((pick) => new UnsubscribeLater(pick)),
+    fc.constant(new Settle()),
+  ],
+  { maxCommands: 16, size: 'max' },
+);
+
+/**
+ * The busy state, run against a reference model.
+ *
+ * The record this executes is section 3.2 of
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-g-project-prerequisites.md`.
+ */
+describe('the busy state, against a reference model', () => {
+  it('holds the last value raised or lowered, and says so once per change', async () => {
+    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');
+
+    await fc.assert(
+      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
+        const model: BusyModel = {
+          busy: false,
+          changes: 0,
+          subscribed: new Set(),
+          nextListener: 0,
+          nextGesture: 0,
+          ended: new Set(),
+        };
+        const busy = createBusy();
+        const world: BusyWorld = {
+          busy,
+          scheduler,
+          model,
+          unsubscribes: new Map(),
+          gone: new Set(),
+          sentinel: { heard: 0, last: null },
+          listening: { depth: 0 },
+          inflight: [],
+        };
+        busy.subscribe(() => {
+          world.sentinel.heard += 1;
+          world.sentinel.last = busy.snapshot();
+        });
+        let failure: Error | null = null;
+        try {
+          await fc.asyncModelRun<BusyModel, BusyWorld, false, BusyModel>(
+            () => ({ model, real: world }),
+            commands,
+          );
+        } catch (caught: unknown) {
+          failure = caught instanceof Error ? caught : new Error(String(caught));
+        }
+        // Teardown: every gesture still out ends, in the scheduler's order, and is
+        // still checked; its failure is reported beside the property's own.
+        const unreported: string[] = [];
+        try {
+          await scheduler.waitIdle();
+          for (const task of world.inflight.splice(0, world.inflight.length)) await task;
+          assertBusy(world, 'teardown');
+        } catch (caught: unknown) {
+          unreported.push(String(caught));
+        }
+        if (unreported.length === 0) {
+          if (failure !== null) throw failure;
+          return;
+        }
+        if (failure === null) throw new Error(`teardown refused: ${unreported.join(' | ')}`);
+        throw new Error(`the property failed and its teardown refused: ${unreported.join(' | ')}`, {
+          cause: failure,
+        });
+      }),
+      { seed: 20260924, numRuns: 300 },
+    );
+
+    for (const kind of COMMAND_KINDS) {
+      expect(ran[kind] ?? 0, `the pinned run never executed ${kind}`).toBeGreaterThan(0);
+    }
+    for (const [what, count] of Object.entries(reached)) {
+      expect(count, `the pinned run never reached ${what}`).toBeGreaterThan(0);
+    }
+  });
+});
```

### 7.3 `src/modules/channel.ts`, `src/modules/plan-writer/busy-store.ts` (**new**) and `vitest.node-suites.ts` — slice 1

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.ts b/apps/wbs/fe-01/src/modules/channel.ts
new file mode 100644
index 00000000..5c242313
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/channel.ts
@@ -0,0 +1,86 @@
+/**
+ * A one-way line from something a project owns to whoever is listening now.
+ *
+ * The event counterpart of {@link Store}: a store says what **is**, and a
+ * channel says what **happened** — a refusal to announce, a command that was
+ * just issued. Delivery subscribes; the service that produces the event is handed
+ * only {@link Publisher}, so it can say something and can never learn who heard
+ * it, which is what keeps a React setter out of a service's construction inputs.
+ *
+ * The delivery rules, each one a property the model test in
+ * `channel.model.test.ts` checks against its own reference:
+ *
+ * - **In order, one at a time.** A publication made from inside a listener is
+ *   queued behind the one being delivered, so every listener hears events in
+ *   the order they were published and no listener is ever entered twice at once.
+ * - **The recipients are fixed when an event's delivery starts**, in the order
+ *   they subscribed. A listener that subscribes during a delivery hears the next
+ *   event and not this one; a listener that is unsubscribed before its turn —
+ *   by itself or by another listener — is skipped. Nothing is ever delivered to
+ *   a listener after its unsubscribe returned.
+ * - **A listener's failure is not swallowed.** Delivery goes on to the other
+ *   recipients and the queue behind them, and then the `publish` that began the
+ *   delivery throws: the one failure by identity, or an `AggregateError` of all
+ *   of them in the order they happened. A `publish` made from inside a listener
+ *   returns at once and never throws; its event's failures surface from the
+ *   outer one.
+ *
+ * Function-typed properties for the reason {@link Store} gives.
+ */
+export interface Channel<T> {
+  /** Delivers one event to every current listener, under the rules above. */
+  readonly publish: (event: T) => void;
+  /** Registers a listener and answers the way to drop it; dropping twice is harmless. */
+  readonly subscribe: (listener: (event: T) => void) => () => void;
+}
+
+/** The half of a {@link Channel} a producing service is handed. */
+export type Publisher<T> = Pick<Channel<T>, 'publish'>;
+
+/** One registration; its own object so the same function may be subscribed twice. */
+interface Subscription<T> {
+  readonly listener: (event: T) => void;
+}
+
+/** Builds an empty channel. It holds no resource, so nothing ever closes it. */
+export function createChannel<T>(): Channel<T> {
+  const subscriptions = new Set<Subscription<T>>();
+  // Wrapped, because `T` may be `void`: an `undefined` event must not read as
+  // an empty queue.
+  const queue: { readonly event: T }[] = [];
+  let delivering = false;
+  return {
+    subscribe: (listener) => {
+      const subscription: Subscription<T> = { listener };
+      subscriptions.add(subscription);
+      return () => {
+        subscriptions.delete(subscription);
+      };
+    },
+    publish: (event) => {
+      queue.push({ event });
+      if (delivering) return;
+      delivering = true;
+      const failures: unknown[] = [];
+      try {
+        for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
+          const recipients = [...subscriptions];
+          for (const recipient of recipients) {
+            if (!subscriptions.has(recipient)) continue;
+            try {
+              recipient.listener(next.event);
+            } catch (failure: unknown) {
+              // Caught only to keep delivering to the others; every failure is
+              // rethrown below, by identity when it is the only one.
+              failures.push(failure);
+            }
+          }
+        }
+      } finally {
+        delivering = false;
+      }
+      if (failures.length === 1) throw failures[0];
+      if (failures.length > 1) throw new AggregateError(failures, 'channel listeners failed');
+    },
+  };
+}
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
new file mode 100644
index 00000000..d227dd7c
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
@@ -0,0 +1,54 @@
+import { createChannel } from '@/modules/channel';
+import type { Store } from '@/modules/store';
+
+/**
+ * Whether this project is waiting for be-01 on one of its reader's gestures —
+ * the shared busy state the toolbar and the cells read.
+ *
+ * A gesture raises it when it starts and lowers it when it ends, **if its
+ * reader is still the one on screen**. That condition is the gesture's to test,
+ * not this store's: it is the same question the gesture already asks before it
+ * spends its answer, `isActiveReader()` in `plan-writer.feature.ts`, and the
+ * reason is the one the busy-replacement cases prove — a departed reader's
+ * answer must not clear its replacement's pending rename. What this store owns
+ * is the value and the telling: a boolean, stable by value, and a listener is
+ * told once for each change and never when a raise finds it already raised or a
+ * lower finds it already lowered.
+ *
+ * Notification goes through {@link createChannel}, so a listener that raises or
+ * lowers from inside its own notification is told again afterwards rather than
+ * re-entered, and never while the value is being changed.
+ *
+ * Plain TypeScript and no lifetime of its own (rule F1): it holds no resource,
+ * nothing closes it, and no call on it ever throws a lifecycle refusal. Its
+ * owner today is the table's mount, one per project; the project runtime of
+ * OpenSpec task 10 takes it over.
+ */
+export interface Busy extends Store<boolean> {
+  readonly raise: () => void;
+  readonly lower: () => void;
+}
+
+/** The half of {@link Busy} a gesture is handed: it can raise and lower, and cannot listen. */
+export type BusyWrites = Pick<Busy, 'raise' | 'lower'>;
+
+/** Builds a project's busy state, not busy. */
+export function createBusy(): Busy {
+  const changes = createChannel<undefined>();
+  let busy = false;
+  const become = (next: boolean): void => {
+    if (next === busy) return;
+    busy = next;
+    changes.publish(undefined);
+  };
+  return {
+    subscribe: (onChange) => changes.subscribe(onChange),
+    snapshot: () => busy,
+    raise: () => {
+      become(true);
+    },
+    lower: () => {
+      become(false);
+    },
+  };
+}
diff --git a/apps/wbs/fe-01/vitest.node-suites.ts b/apps/wbs/fe-01/vitest.node-suites.ts
index 29422ac5..ae943dea 100644
--- a/apps/wbs/fe-01/vitest.node-suites.ts
+++ b/apps/wbs/fe-01/vitest.node-suites.ts
@@ -63,10 +63,12 @@ export const NODE_SUITES: readonly string[] = [
   'src/lib/saved-plan-compare.test.ts',
   'src/modules/calendar-markers/calendar-markers.feature.test.ts',
   'src/modules/calendar-markers/calendar-markers.resource.test.ts',
+  'src/modules/channel.model.test.ts',
   'src/modules/directory-management/directory-management.feature.test.ts',
   'src/modules/directory/directory.resource.test.ts',
   'src/modules/plan-feed/plan-feed.feature.test.ts',
   'src/modules/plan-feed/plan-feed.resource.test.ts',
+  'src/modules/plan-writer/busy-store.model.test.ts',
   'src/modules/plan-writer/plan-writer.test.ts',
   // Proof: on 2026-09-24, listing the deleted `composition.test.ts` here again failed
   // `names files that exist` on `src/modules/preferences/composition.test.ts: expected
```

### 7.4 `spec.md` — slice 2, the scenario for the record stores

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 5b3d182a..1836dcf5 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -363,3 +363,12 @@ stores and listen to the channels, and what a reader sees SHALL NOT change.
   notification
 - **THEN** a listener is told exactly once for each change of the value, after
   the change, and reads the value as it stands at that instant
+
+#### Scenario: A publication that says nothing new changes nothing
+
+- **WHEN** the plan feed publishes the same tree, directory and markers, an equal
+  step list in a new array and the same failure cause in a new wrapper, or the
+  stream reports the connection or the presence list it already reported
+- **THEN** the delivered plan or the presence keeps the same snapshot object and
+  no listener is told, and a publication that does change a member replaces the
+  snapshot once, keeps every other member as it was, and tells each listener once
```

### 7.5 `src/modules/plan-feed/delivered-plan-store.model.test.ts` and `presence-store.model.test.ts` — slice 2, **new files**

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.model.test.ts b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.model.test.ts
new file mode 100644
index 00000000..ec1b949a
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.model.test.ts
@@ -0,0 +1,550 @@
+import fc from 'fast-check';
+import { describe, expect, it } from 'vitest';
+
+import type { DirectoryRead, RefreshResource } from '@/lib/plan-refresh';
+import type { CalendarMarkerView, PlanRead, StepView } from '@/lib/wbs-api';
+import { fakeProjectApi } from '@/testing/fake-project-api';
+
+import type { PlanFeedDelivery } from './contract';
+import {
+  createDeliveredPlan,
+  type DeliveredPlan,
+  type DeliveredPlanStore,
+} from './delivered-plan-store';
+
+/**
+ * The values a generated publication is drawn from.
+ *
+ * Small on purpose, so that the same tree, the same directory, an equal step
+ * list in a new array and the same failure cause in a new wrapper all come
+ * round again — the repeats are what the stability rule is about.
+ */
+interface Pool {
+  readonly trees: readonly { readonly value: PlanRead; readonly generation: number }[];
+  readonly directories: readonly DirectoryRead[];
+  readonly markers: readonly (readonly CalendarMarkerView[])[];
+  readonly causes: readonly Error[];
+}
+
+/** One generated publication, by index into the pool; `null` is "unchanged". */
+interface DeliverySpec {
+  readonly stale: readonly RefreshResource[];
+  readonly failure: number | null;
+  readonly directory: number | null;
+  readonly tree: number | null;
+  /** Step names, always ids `s0`, `s1`…; a fresh array every time it is delivered. */
+  readonly steps: readonly string[] | null;
+  readonly markers: number | null;
+}
+
+type Behaviour = 'read' | 'relay' | 'leave';
+
+const ran: Record<string, number> = {};
+function note(kind: string): void {
+  ran[kind] = (ran[kind] ?? 0) + 1;
+}
+const COMMAND_KINDS: readonly string[] = [
+  'deliverNow',
+  'redeliver',
+  'deliverLater',
+  'reportConnection',
+  'subscribe',
+  'unsubscribeLater',
+  'settle',
+];
+const reached = {
+  unchangedDelivery: 0,
+  equalStepsInNewArray: 0,
+  sameCauseNewWrapper: 0,
+  relayedFromListener: 0,
+  outOfOrderLanding: 0,
+};
+
+/**
+ * The reference fold, with its own record of every member. It never reads the
+ * store: the steps are held as their names, the stale list as its content, the
+ * failure as its cause.
+ */
+interface PlanModel {
+  stale: RefreshResource[];
+  cause: Error | null;
+  directory: DirectoryRead | null;
+  tree: Pool['trees'][number] | null;
+  /** The model's own copy of the steps' ids and names. */
+  steps: StepView[];
+  markers: readonly CalendarMarkerView[] | null;
+  connected: boolean;
+  /** How many times the snapshot must have been replaced so far. */
+  changes: number;
+  /** How many times the step list must have been replaced so far. */
+  stepChanges: number;
+  subscribed: Set<number>;
+  nextListener: number;
+  nextDelivery: number;
+}
+
+interface PlanWorld {
+  readonly store: DeliveredPlanStore;
+  readonly pool: Pool;
+  readonly scheduler: fc.Scheduler;
+  readonly model: PlanModel;
+  readonly unsubscribes: Map<number, () => void>;
+  readonly gone: Set<number>;
+  /** Every step array handed to the store; the store must keep its own copy, never one of these. */
+  readonly deliveredStepArrays: Set<readonly StepView[]>;
+  readonly sentinel: { heard: number };
+  /** How many listener calls are running; a relayed write is told about only once they end. */
+  readonly listening: { depth: number };
+  readonly inflight: Promise<void>[];
+  /** Which scheduled publications have landed, to count one landing before an earlier one. */
+  readonly landed: Set<number>;
+}
+
+function toDelivery(world: PlanWorld, spec: DeliverySpec): PlanFeedDelivery {
+  const at = <T>(list: readonly T[], index: number | null): T | null => {
+    if (index === null) return null;
+    const value = list.at(index % list.length);
+    if (value === undefined) throw new Error(`the pool has no entry ${String(index)}`);
+    return value;
+  };
+  const cause = at(world.pool.causes, spec.failure);
+  const steps =
+    spec.steps === null ? null : spec.steps.map((name, i) => ({ id: `s${String(i)}`, name }));
+  if (steps !== null) world.deliveredStepArrays.add(steps);
+  return {
+    // A fresh array every time, as the owner's snapshot may give one.
+    staleResources: [...spec.stale],
+    // A fresh wrapper every time, as `nextDelivery` builds one.
+    treeFailure: cause === null ? null : { cause },
+    directory: at(world.pool.directories, spec.directory),
+    tree: at(world.pool.trees, spec.tree),
+    steps,
+    markers: at(world.pool.markers, spec.markers),
+  };
+}
+
+/** What a step list says, as one comparable string. */
+function stepsKey(steps: readonly StepView[]): string {
+  return JSON.stringify(steps.map(({ id, name }) => [id, name]));
+}
+
+/** Folds one publication into the model, counting whether the snapshot must change. */
+function fold(model: PlanModel, delivery: PlanFeedDelivery): void {
+  let changed = false;
+  const stale = [...delivery.staleResources];
+  if (stale.join() !== model.stale.join()) {
+    model.stale = stale;
+    changed = true;
+  }
+  const cause = delivery.treeFailure === null ? null : delivery.treeFailure.cause;
+  if (!(cause === null || cause instanceof Error))
+    throw new Error('the pool only has Error causes');
+  if (cause !== model.cause) {
+    model.cause = cause;
+    changed = true;
+  } else if (cause !== null) {
+    reached.sameCauseNewWrapper += 1;
+  }
+  if (delivery.directory !== null && delivery.directory !== model.directory) {
+    model.directory = delivery.directory;
+    changed = true;
+  }
+  if (delivery.tree !== null && delivery.tree !== model.tree) {
+    model.tree = delivery.tree;
+    changed = true;
+  }
+  if (delivery.steps !== null) {
+    if (stepsKey(delivery.steps) !== stepsKey(model.steps)) {
+      model.steps = delivery.steps.map(({ id, name }) => ({ id, name }));
+      model.stepChanges += 1;
+      changed = true;
+    } else {
+      reached.equalStepsInNewArray += 1;
+    }
+  }
+  if (delivery.markers !== null && delivery.markers !== model.markers) {
+    model.markers = delivery.markers;
+    changed = true;
+  }
+  if (changed) model.changes += 1;
+  else reached.unchangedDelivery += 1;
+}
+
+/** Asserts one snapshot says what the model says, member by member. */
+function assertSnapshot(model: PlanModel, world: PlanWorld, snapshot: DeliveredPlan, what: string) {
+  expect([...snapshot.staleResources], `${what}: stale`).toEqual(model.stale);
+  expect(snapshot.treeFailure?.cause ?? null, `${what}: failure cause`).toBe(model.cause);
+  expect(snapshot.directory, `${what}: directory`).toBe(model.directory);
+  expect(snapshot.tree, `${what}: tree`).toBe(model.tree);
+  expect(stepsKey(snapshot.steps), `${what}: steps`).toBe(stepsKey(model.steps));
+  expect(
+    world.deliveredStepArrays.has(snapshot.steps),
+    `${what}: steps are not the store’s own`,
+  ).toBe(false);
+  if (model.markers === null) expect(snapshot.markers, `${what}: markers`).toEqual([]);
+  else expect(snapshot.markers, `${what}: markers`).toBe(model.markers);
+  expect(snapshot.connected, `${what}: connected`).toBe(model.connected);
+}
+
+/**
+ * Runs one write against the store and the model together, and checks the
+ * stability rule around it: a new snapshot object exactly when the model says
+ * something changed during the call — its own change or one a listener relayed
+ * from inside it — and the same step array whenever the steps did not change.
+ */
+function write(world: PlanWorld, what: string, apply: () => void, perform: () => void): void {
+  const { model, store } = world;
+  const before = store.snapshot();
+  const changesBefore = model.changes;
+  const stepChangesBefore = model.stepChanges;
+  apply();
+  perform();
+  const after = store.snapshot();
+  expect(after !== before, `${what}: a new snapshot exactly when something changed`).toBe(
+    model.changes > changesBefore,
+  );
+  if (model.stepChanges === stepChangesBefore) {
+    expect(after.steps, `${what}: unchanged steps keep their array`).toBe(before.steps);
+  }
+  assertSnapshot(model, world, after, what);
+  // A write relayed from inside a listener is queued behind the delivery that
+  // listener is part of, so the count is exact only once no listener is running.
+  if (world.listening.depth === 0) {
+    expect(world.sentinel.heard, `${what}: changes heard by the listener that never leaves`).toBe(
+      model.changes,
+    );
+  }
+}
+
+function deliver(world: PlanWorld, spec: DeliverySpec, what: string): void {
+  const delivery = toDelivery(world, spec);
+  write(
+    world,
+    what,
+    () => {
+      fold(world.model, delivery);
+    },
+    () => {
+      world.store.deliver(delivery);
+    },
+  );
+}
+
+function subscribeReal(world: PlanWorld, id: number, behaviour: Behaviour, relay: DeliverySpec) {
+  let relayed = false;
+  const unsubscribe = world.store.subscribe(() => {
+    world.listening.depth += 1;
+    try {
+      expect(world.gone.has(id), `listener ${String(id)} was told after it left`).toBe(false);
+      assertSnapshot(world.model, world, world.store.snapshot(), `listener ${String(id)}`);
+      if (behaviour === 'relay' && !relayed) {
+        relayed = true;
+        reached.relayedFromListener += 1;
+        deliver(world, relay, `relay from listener ${String(id)}`);
+      }
+      if (behaviour === 'leave') {
+        world.model.subscribed.delete(id);
+        world.unsubscribes.get(id)?.();
+        world.gone.add(id);
+      }
+    } finally {
+      world.listening.depth -= 1;
+    }
+  });
+  world.unsubscribes.set(id, unsubscribe);
+}
+
+type PlanCommand = fc.AsyncCommand<PlanModel, PlanWorld>;
+
+class DeliverNow implements PlanCommand {
+  constructor(readonly spec: DeliverySpec) {}
+  check(): boolean {
+    return true;
+  }
+  async run(_model: PlanModel, world: PlanWorld): Promise<void> {
+    note('deliverNow');
+    deliver(world, this.spec, 'deliverNow');
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `deliverNow(${JSON.stringify(this.spec)})`;
+  }
+}
+
+/**
+ * A publication that says nothing new, built from the model's own record: the
+ * same stale list in a new array, the same cause in a new wrapper, the same
+ * steps in a new array, and the same tree, directory and markers objects — the
+ * owner republishing because something else in its snapshot moved.
+ */
+class Redeliver implements PlanCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(model: PlanModel, world: PlanWorld): Promise<void> {
+    note('redeliver');
+    const steps = model.steps.map(({ id, name }) => ({ id, name }));
+    world.deliveredStepArrays.add(steps);
+    const delivery: PlanFeedDelivery = {
+      staleResources: [...model.stale],
+      treeFailure: model.cause === null ? null : { cause: model.cause },
+      directory: model.directory,
+      tree: model.tree,
+      steps,
+      markers: model.markers,
+    };
+    write(
+      world,
+      'redeliver',
+      () => {
+        fold(model, delivery);
+      },
+      () => {
+        world.store.deliver(delivery);
+      },
+    );
+    await Promise.resolve();
+  }
+  toString(): string {
+    return 'redeliver';
+  }
+}
+
+/** A publication from a read that lands whenever the scheduler says — possibly after a later one. */
+class DeliverLater implements PlanCommand {
+  constructor(readonly spec: DeliverySpec) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: PlanModel, world: PlanWorld): Promise<void> {
+    note('deliverLater');
+    const ordinal = model.nextDelivery;
+    model.nextDelivery += 1;
+    world.inflight.push(
+      world.scheduler.schedule(Promise.resolve(), `read ${String(ordinal)} lands`).then(() => {
+        if ([...world.landed].some((other) => other > ordinal)) reached.outOfOrderLanding += 1;
+        world.landed.add(ordinal);
+        deliver(world, this.spec, `deliverLater #${String(ordinal)}`);
+      }),
+    );
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `deliverLater(${JSON.stringify(this.spec)})`;
+  }
+}
+
+class ReportConnection implements PlanCommand {
+  constructor(readonly connected: boolean) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: PlanModel, world: PlanWorld): Promise<void> {
+    note('reportConnection');
+    write(
+      world,
+      `reportConnection(${String(this.connected)})`,
+      () => {
+        if (model.connected !== this.connected) {
+          model.connected = this.connected;
+          model.changes += 1;
+        }
+      },
+      () => {
+        world.store.reportConnection(this.connected);
+      },
+    );
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `reportConnection(${String(this.connected)})`;
+  }
+}
+
+class Subscribe implements PlanCommand {
+  constructor(
+    readonly behaviour: Behaviour,
+    readonly relay: DeliverySpec,
+  ) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: PlanModel, world: PlanWorld): Promise<void> {
+    note('subscribe');
+    const id = model.nextListener;
+    model.nextListener += 1;
+    model.subscribed.add(id);
+    subscribeReal(world, id, this.behaviour, this.relay);
+    await Promise.resolve();
+  }
+  toString(): string {
+    return this.behaviour === 'relay'
+      ? `subscribe(relay ${JSON.stringify(this.relay)})`
+      : `subscribe(${this.behaviour})`;
+  }
+}
+
+class UnsubscribeLater implements PlanCommand {
+  constructor(readonly pick: number) {}
+  check(model: PlanModel): boolean {
+    return model.subscribed.size > 0;
+  }
+  async run(model: PlanModel, world: PlanWorld): Promise<void> {
+    note('unsubscribeLater');
+    const listeners = [...model.subscribed];
+    const id = listeners.at(this.pick % listeners.length);
+    if (id === undefined) throw new Error('no listener to pick');
+    world.inflight.push(
+      world.scheduler.schedule(Promise.resolve(), `listener ${String(id)} leaves`).then(() => {
+        model.subscribed.delete(id);
+        world.unsubscribes.get(id)?.();
+        world.gone.add(id);
+      }),
+    );
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `unsubscribeLater(${String(this.pick)})`;
+  }
+}
+
+class Settle implements PlanCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(_model: PlanModel, world: PlanWorld): Promise<void> {
+    note('settle');
+    await world.scheduler.waitIdle();
+    for (const task of world.inflight.splice(0, world.inflight.length)) await task;
+  }
+  toString(): string {
+    return 'settle';
+  }
+}
+
+const indexArb = fc.option(fc.nat(2), { nil: null });
+const specArb: fc.Arbitrary<DeliverySpec> = fc.record({
+  stale: fc.constantFrom<readonly RefreshResource[]>([], ['tree'], ['tree', 'markers']),
+  failure: indexArb,
+  directory: indexArb,
+  tree: indexArb,
+  steps: fc.option(fc.constantFrom<readonly string[]>([], ['Dev'], ['Build'], ['Dev', 'Test']), {
+    nil: null,
+  }),
+  markers: indexArb,
+});
+
+const commandsArb = fc.commands<PlanModel, PlanWorld, false>(
+  [
+    specArb.map((spec) => new DeliverNow(spec)),
+    fc.constant(new Redeliver()),
+    specArb.map((spec) => new DeliverLater(spec)),
+    fc.boolean().map((connected) => new ReportConnection(connected)),
+    fc
+      .tuple(fc.constantFrom<Behaviour>('read', 'relay', 'leave'), specArb)
+      .map(([behaviour, relay]) => new Subscribe(behaviour, relay)),
+    fc.nat(8).map((pick) => new UnsubscribeLater(pick)),
+    fc.constant(new Settle()),
+  ],
+  { maxCommands: 16, size: 'max' },
+);
+
+async function buildPool(): Promise<Pool> {
+  const read = await fakeProjectApi().tree('p1');
+  const directory = (): DirectoryRead => ({
+    teams: [],
+    tags: [],
+    services: [],
+    workItemTypes: [],
+    externalSystems: [],
+    people: [],
+  });
+  return {
+    trees: [1, 2, 3].map((generation) => ({ value: { ...read }, generation })),
+    directories: [directory(), directory(), directory()],
+    markers: [[], [], []],
+    causes: [new Error('forbidden'), new Error('unavailable'), new Error('gone')],
+  };
+}
+
+/**
+ * The delivered plan, run against a reference fold.
+ *
+ * The record this executes is section 3.3 of
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-g-project-prerequisites.md`.
+ */
+describe('the delivered plan, against a reference model', () => {
+  it('folds every publication exactly as the model does, and changes only when it must', async () => {
+    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');
+    const pool = await buildPool();
+
+    await fc.assert(
+      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
+        const model: PlanModel = {
+          stale: [],
+          cause: null,
+          directory: null,
+          tree: null,
+          steps: [],
+          markers: null,
+          connected: true,
+          changes: 0,
+          stepChanges: 0,
+          subscribed: new Set(),
+          nextListener: 0,
+          nextDelivery: 0,
+        };
+        const store = createDeliveredPlan();
+        const world: PlanWorld = {
+          store,
+          pool,
+          scheduler,
+          model,
+          unsubscribes: new Map(),
+          gone: new Set(),
+          deliveredStepArrays: new Set(),
+          sentinel: { heard: 0 },
+          listening: { depth: 0 },
+          inflight: [],
+          landed: new Set(),
+        };
+        store.subscribe(() => {
+          world.sentinel.heard += 1;
+        });
+        let failure: Error | null = null;
+        try {
+          await fc.asyncModelRun<PlanModel, PlanWorld, false, PlanModel>(
+            () => ({ model, real: world }),
+            commands,
+          );
+        } catch (caught: unknown) {
+          failure = caught instanceof Error ? caught : new Error(String(caught));
+        }
+        const unreported: string[] = [];
+        try {
+          await scheduler.waitIdle();
+          for (const task of world.inflight.splice(0, world.inflight.length)) await task;
+          assertSnapshot(model, world, store.snapshot(), 'teardown');
+        } catch (caught: unknown) {
+          unreported.push(String(caught));
+        }
+        if (unreported.length === 0) {
+          if (failure !== null) throw failure;
+          return;
+        }
+        if (failure === null) throw new Error(`teardown refused: ${unreported.join(' | ')}`);
+        throw new Error(`the property failed and its teardown refused: ${unreported.join(' | ')}`, {
+          cause: failure,
+        });
+      }),
+      { seed: 20260924, numRuns: 300 },
+    );
+
+    for (const kind of COMMAND_KINDS) {
+      expect(ran[kind] ?? 0, `the pinned run never executed ${kind}`).toBeGreaterThan(0);
+    }
+    for (const [what, count] of Object.entries(reached)) {
+      expect(count, `the pinned run never reached ${what}`).toBeGreaterThan(0);
+    }
+  });
+});
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.model.test.ts b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.model.test.ts
new file mode 100644
index 00000000..fb05949d
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.model.test.ts
@@ -0,0 +1,319 @@
+import fc from 'fast-check';
+import { describe, expect, it } from 'vitest';
+
+import { createPresence, type Presence, type PresenceStore } from './presence-store';
+
+/** One report the project's stream makes: a presence frame, by pool index, or a connection change. */
+type Report =
+  | { readonly kind: 'users'; readonly list: number }
+  | { readonly kind: 'connection'; readonly connected: boolean };
+
+type Behaviour = 'read' | 'relay' | 'leave';
+
+const ran: Record<string, number> = {};
+function note(kind: string): void {
+  ran[kind] = (ran[kind] ?? 0) + 1;
+}
+const COMMAND_KINDS: readonly string[] = [
+  'reportNow',
+  'reportLater',
+  'subscribe',
+  'unsubscribeLater',
+  'settle',
+];
+const reached = {
+  sameListAgain: 0,
+  sameConnectionAgain: 0,
+  relayedFromListener: 0,
+};
+
+/**
+ * The frames a generated run reports, by identity: gw-01 sends a new list with
+ * every frame, and a repeated index here is the same list object reported twice.
+ */
+const LISTS: readonly (readonly string[])[] = [[], ['kat'], ['kat', 'lee'], ['lee']];
+
+/** The reference: what the header must show, and how many times it must have changed. */
+interface PresenceModel {
+  users: readonly string[];
+  connected: boolean;
+  changes: number;
+  subscribed: Set<number>;
+  nextListener: number;
+}
+
+interface PresenceWorld {
+  readonly store: PresenceStore;
+  readonly scheduler: fc.Scheduler;
+  readonly model: PresenceModel;
+  readonly unsubscribes: Map<number, () => void>;
+  readonly gone: Set<number>;
+  readonly sentinel: { heard: number };
+  readonly listening: { depth: number };
+  readonly inflight: Promise<void>[];
+}
+
+function listAt(index: number): readonly string[] {
+  const list = LISTS.at(index % LISTS.length);
+  if (list === undefined) throw new Error(`no list ${String(index)}`);
+  return list;
+}
+
+function assertPresence(model: PresenceModel, snapshot: Presence, what: string): void {
+  expect(snapshot.users, `${what}: users`).toBe(model.users);
+  expect(snapshot.connected, `${what}: connected`).toBe(model.connected);
+}
+
+/** Applies one report to the model and the store together, and checks the stability rule around it. */
+function report(world: PresenceWorld, entry: Report, what: string): void {
+  const { model, store } = world;
+  const before = store.snapshot();
+  const changesBefore = model.changes;
+  if (entry.kind === 'users') {
+    const users = listAt(entry.list);
+    if (users === model.users) reached.sameListAgain += 1;
+    else {
+      model.users = users;
+      model.changes += 1;
+    }
+    store.reportUsers(users);
+  } else {
+    if (entry.connected === model.connected) reached.sameConnectionAgain += 1;
+    else {
+      model.connected = entry.connected;
+      model.changes += 1;
+    }
+    store.reportConnection(entry.connected);
+  }
+  const after = store.snapshot();
+  expect(after !== before, `${what}: a new snapshot exactly when something changed`).toBe(
+    model.changes > changesBefore,
+  );
+  assertPresence(model, after, what);
+  if (world.listening.depth === 0) {
+    expect(world.sentinel.heard, `${what}: changes heard by the listener that never leaves`).toBe(
+      model.changes,
+    );
+  }
+}
+
+function describeReport(entry: Report): string {
+  return entry.kind === 'users'
+    ? `users(${JSON.stringify(listAt(entry.list))})`
+    : `connection(${String(entry.connected)})`;
+}
+
+function subscribeReal(world: PresenceWorld, id: number, behaviour: Behaviour, relay: Report) {
+  let relayed = false;
+  const unsubscribe = world.store.subscribe(() => {
+    world.listening.depth += 1;
+    try {
+      expect(world.gone.has(id), `listener ${String(id)} was told after it left`).toBe(false);
+      assertPresence(world.model, world.store.snapshot(), `listener ${String(id)}`);
+      if (behaviour === 'relay' && !relayed) {
+        relayed = true;
+        reached.relayedFromListener += 1;
+        report(world, relay, `relay from listener ${String(id)}`);
+      }
+      if (behaviour === 'leave') {
+        world.model.subscribed.delete(id);
+        world.unsubscribes.get(id)?.();
+        world.gone.add(id);
+      }
+    } finally {
+      world.listening.depth -= 1;
+    }
+  });
+  world.unsubscribes.set(id, unsubscribe);
+}
+
+type PresenceCommand = fc.AsyncCommand<PresenceModel, PresenceWorld>;
+
+class ReportNow implements PresenceCommand {
+  constructor(readonly entry: Report) {}
+  check(): boolean {
+    return true;
+  }
+  async run(_model: PresenceModel, world: PresenceWorld): Promise<void> {
+    note('reportNow');
+    report(world, this.entry, describeReport(this.entry));
+    await Promise.resolve();
+  }
+  toString(): string {
+    return describeReport(this.entry);
+  }
+}
+
+/** A frame that arrives whenever the scheduler says, possibly after one sent later. */
+class ReportLater implements PresenceCommand {
+  constructor(readonly entry: Report) {}
+  check(): boolean {
+    return true;
+  }
+  async run(_model: PresenceModel, world: PresenceWorld): Promise<void> {
+    note('reportLater');
+    const what = describeReport(this.entry);
+    world.inflight.push(
+      world.scheduler.schedule(Promise.resolve(), what).then(() => {
+        report(world, this.entry, `later ${what}`);
+      }),
+    );
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `later ${describeReport(this.entry)}`;
+  }
+}
+
+class Subscribe implements PresenceCommand {
+  constructor(
+    readonly behaviour: Behaviour,
+    readonly relay: Report,
+  ) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: PresenceModel, world: PresenceWorld): Promise<void> {
+    note('subscribe');
+    const id = model.nextListener;
+    model.nextListener += 1;
+    model.subscribed.add(id);
+    subscribeReal(world, id, this.behaviour, this.relay);
+    await Promise.resolve();
+  }
+  toString(): string {
+    return this.behaviour === 'relay'
+      ? `subscribe(relay ${describeReport(this.relay)})`
+      : `subscribe(${this.behaviour})`;
+  }
+}
+
+class UnsubscribeLater implements PresenceCommand {
+  constructor(readonly pick: number) {}
+  check(model: PresenceModel): boolean {
+    return model.subscribed.size > 0;
+  }
+  async run(model: PresenceModel, world: PresenceWorld): Promise<void> {
+    note('unsubscribeLater');
+    const listeners = [...model.subscribed];
+    const id = listeners.at(this.pick % listeners.length);
+    if (id === undefined) throw new Error('no listener to pick');
+    world.inflight.push(
+      world.scheduler.schedule(Promise.resolve(), `listener ${String(id)} leaves`).then(() => {
+        model.subscribed.delete(id);
+        world.unsubscribes.get(id)?.();
+        world.gone.add(id);
+      }),
+    );
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `unsubscribeLater(${String(this.pick)})`;
+  }
+}
+
+class Settle implements PresenceCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(_model: PresenceModel, world: PresenceWorld): Promise<void> {
+    note('settle');
+    await world.scheduler.waitIdle();
+    for (const task of world.inflight.splice(0, world.inflight.length)) await task;
+  }
+  toString(): string {
+    return 'settle';
+  }
+}
+
+const reportArb: fc.Arbitrary<Report> = fc.oneof(
+  fc.nat(LISTS.length - 1).map((list): Report => ({ kind: 'users', list })),
+  fc.boolean().map((connected): Report => ({ kind: 'connection', connected })),
+);
+
+const commandsArb = fc.commands<PresenceModel, PresenceWorld, false>(
+  [
+    reportArb.map((entry) => new ReportNow(entry)),
+    reportArb.map((entry) => new ReportLater(entry)),
+    fc
+      .tuple(fc.constantFrom<Behaviour>('read', 'relay', 'leave'), reportArb)
+      .map(([behaviour, relay]) => new Subscribe(behaviour, relay)),
+    fc.nat(8).map((pick) => new UnsubscribeLater(pick)),
+    fc.constant(new Settle()),
+  ],
+  { maxCommands: 16, size: 'max' },
+);
+
+/**
+ * One project's presence, run against a reference model.
+ *
+ * The record this executes is section 3.4 of
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-g-project-prerequisites.md`.
+ */
+describe('a project’s presence, against a reference model', () => {
+  it('shows exactly the last frame and connection, and changes only when they do', async () => {
+    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');
+
+    await fc.assert(
+      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
+        const store = createPresence();
+        const initial = store.snapshot();
+        const model: PresenceModel = {
+          // The store's own starting list, by identity: nothing has been reported yet.
+          users: initial.users,
+          connected: false,
+          changes: 0,
+          subscribed: new Set(),
+          nextListener: 0,
+        };
+        expect(initial, 'a new project’s presence').toEqual({ users: [], connected: false });
+        const world: PresenceWorld = {
+          store,
+          scheduler,
+          model,
+          unsubscribes: new Map(),
+          gone: new Set(),
+          sentinel: { heard: 0 },
+          listening: { depth: 0 },
+          inflight: [],
+        };
+        store.subscribe(() => {
+          world.sentinel.heard += 1;
+        });
+        let failure: Error | null = null;
+        try {
+          await fc.asyncModelRun<PresenceModel, PresenceWorld, false, PresenceModel>(
+            () => ({ model, real: world }),
+            commands,
+          );
+        } catch (caught: unknown) {
+          failure = caught instanceof Error ? caught : new Error(String(caught));
+        }
+        const unreported: string[] = [];
+        try {
+          await scheduler.waitIdle();
+          for (const task of world.inflight.splice(0, world.inflight.length)) await task;
+          assertPresence(model, store.snapshot(), 'teardown');
+        } catch (caught: unknown) {
+          unreported.push(String(caught));
+        }
+        if (unreported.length === 0) {
+          if (failure !== null) throw failure;
+          return;
+        }
+        if (failure === null) throw new Error(`teardown refused: ${unreported.join(' | ')}`);
+        throw new Error(`the property failed and its teardown refused: ${unreported.join(' | ')}`, {
+          cause: failure,
+        });
+      }),
+      { seed: 20260924, numRuns: 300 },
+    );
+
+    for (const kind of COMMAND_KINDS) {
+      expect(ran[kind] ?? 0, `the pinned run never executed ${kind}`).toBeGreaterThan(0);
+    }
+    for (const [what, count] of Object.entries(reached)) {
+      expect(count, `the pinned run never reached ${what}`).toBeGreaterThan(0);
+    }
+  });
+});
```

### 7.6 `src/modules/plan-feed/delivered-plan-store.ts`, `presence-store.ts` (**new**) and `vitest.node-suites.ts` — slice 2

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
new file mode 100644
index 00000000..c6a902dc
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
@@ -0,0 +1,139 @@
+import type { DirectoryRead, RefreshResource } from '@/lib/plan-refresh';
+import type { CalendarMarkerView, PlanRead, StepView } from '@/lib/wbs-api';
+import { createChannel } from '@/modules/channel';
+import type { Store } from '@/modules/store';
+
+import type { PlanFeedDelivery } from './contract';
+
+/**
+ * The plan as this reader has been given it: every publication of the feed,
+ * folded into one value the screen selects from.
+ *
+ * The feed publishes **deltas** ({@link PlanFeedDelivery}: null means
+ * "unchanged"); this is their sum, which is what a screen draws. The tree, the
+ * directory and the markers are the newest ones delivered, or none before the
+ * first; the steps are the newest list, kept as the **same array** when a later
+ * one says the same thing, so that nothing drawn from them rebuilds; the stale
+ * list and the tree failure are the last publication's, because they describe
+ * the owner now and not a history.
+ *
+ * `connected` is whether the socket carrying other people's changes is up, as
+ * the feed last reported it. It starts `true`: before any socket has said
+ * otherwise there is nothing to warn about, and a table read without a socket
+ * never warns.
+ */
+export interface DeliveredPlan {
+  readonly staleResources: readonly RefreshResource[];
+  /** The cause of the last tree read's failure, or null; words are built where they are said. */
+  readonly treeFailure: { readonly cause: unknown } | null;
+  readonly directory: DirectoryRead | null;
+  readonly tree: { readonly value: PlanRead; readonly generation: number } | null;
+  /**
+   * This store's own copy, never the delivered array, so nothing outside it can
+   * change what it compares against; typed mutable only because the table's
+   * consumers take `StepView[]`, and nothing writes into it.
+   */
+  readonly steps: StepView[];
+  readonly markers: readonly CalendarMarkerView[];
+  readonly connected: boolean;
+}
+
+/**
+ * One reader's delivered plan: the store a screen selects from, and the two
+ * writes the plan feed makes into it.
+ *
+ * **The stability rule of {@link Store}, member by member.** A write that
+ * changes no member leaves the snapshot the same object and tells nobody; a
+ * write that changes one replaces the snapshot once and tells every listener
+ * once, after the replacement. "Changes" is decided per member: by identity for
+ * the tree, the directory and the markers (each delivery of them is a new
+ * generation); by content for the steps (id and name, in order) and for the
+ * stale list; by the identity of the **cause** for the tree failure, because
+ * the feed builds a fresh wrapper around the same cause on every publication;
+ * by value for `connected`.
+ *
+ * Plain TypeScript with no lifetime of its own (rule F1): nothing closes it and
+ * no call on it ever throws a lifecycle refusal. Whether a publication may still
+ * reach it is the feed's question, answered before it writes — see
+ * `plan-feed.feature.ts`'s `isLive`. Its owner today is the table's mount; the
+ * project runtime of OpenSpec task 10 takes it over.
+ */
+export interface DeliveredPlanStore extends Store<DeliveredPlan> {
+  /** Folds one publication in. */
+  readonly deliver: (delivery: PlanFeedDelivery) => void;
+  /** Records whether the socket carrying other people's changes is up. */
+  readonly reportConnection: (connected: boolean) => void;
+}
+
+/** The half of {@link DeliveredPlanStore} the plan feed writes through. */
+export type DeliveredPlanWrites = Pick<DeliveredPlanStore, 'deliver' | 'reportConnection'>;
+
+/** Nothing delivered yet: a fresh value for each store, so no two stores share an array. */
+function nothingDelivered(): DeliveredPlan {
+  return {
+    staleResources: [],
+    treeFailure: null,
+    directory: null,
+    tree: null,
+    steps: [],
+    markers: [],
+    connected: true,
+  };
+}
+
+/** Whether two step lists say the same thing, so an equal one can be discarded. */
+export function sameSteps(a: readonly StepView[], b: readonly StepView[]): boolean {
+  return (
+    a.length === b.length && a.every((step, i) => step.id === b[i]?.id && step.name === b[i]?.name)
+  );
+}
+
+function sameResources(a: readonly RefreshResource[], b: readonly RefreshResource[]): boolean {
+  return a.length === b.length && a.every((resource, i) => resource === b[i]);
+}
+
+/** Builds one reader's delivered plan, with nothing delivered yet. */
+export function createDeliveredPlan(): DeliveredPlanStore {
+  const changes = createChannel<undefined>();
+  let current = nothingDelivered();
+  const replace = (next: DeliveredPlan): void => {
+    current = next;
+    changes.publish(undefined);
+  };
+  return {
+    subscribe: (onChange) => changes.subscribe(onChange),
+    snapshot: () => current,
+    deliver: (delivery) => {
+      const staleResources = sameResources(current.staleResources, delivery.staleResources)
+        ? current.staleResources
+        : [...delivery.staleResources];
+      const treeFailure =
+        delivery.treeFailure === null
+          ? null
+          : current.treeFailure !== null && current.treeFailure.cause === delivery.treeFailure.cause
+            ? current.treeFailure
+            : { cause: delivery.treeFailure.cause };
+      const directory = delivery.directory ?? current.directory;
+      const tree = delivery.tree ?? current.tree;
+      const steps =
+        delivery.steps === null || sameSteps(current.steps, delivery.steps)
+          ? current.steps
+          : [...delivery.steps];
+      const markers = delivery.markers ?? current.markers;
+      if (
+        staleResources === current.staleResources &&
+        treeFailure === current.treeFailure &&
+        directory === current.directory &&
+        tree === current.tree &&
+        steps === current.steps &&
+        markers === current.markers
+      )
+        return;
+      replace({ ...current, staleResources, treeFailure, directory, tree, steps, markers });
+    },
+    reportConnection: (connected) => {
+      if (connected === current.connected) return;
+      replace({ ...current, connected });
+    },
+  };
+}
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
new file mode 100644
index 00000000..b01433ea
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
@@ -0,0 +1,57 @@
+import { createChannel } from '@/modules/channel';
+import type { Store } from '@/modules/store';
+
+/**
+ * Who else has one project open, and whether the socket saying so is up.
+ *
+ * gw-01 scopes the list by the project the socket subscribed to, and it
+ * arrives on the plan's own stream, so it is one project's and nobody else's.
+ * It starts empty and disconnected: before a socket has said anything, that is
+ * the honest answer, and never a previous project's list under a new
+ * project's name.
+ */
+export interface Presence {
+  readonly users: readonly string[];
+  readonly connected: boolean;
+}
+
+/**
+ * One project's presence: the store the header selects from, and the two
+ * writes the project's stream makes into it.
+ *
+ * The stability rule of {@link Store}: a write that changes nothing — the same
+ * list object, the same connection — leaves the snapshot the same object and
+ * tells nobody; one that changes a member replaces the snapshot once and tells
+ * every listener once, after the replacement. The list is compared by identity:
+ * every presence frame is a new list, and a frame is a change.
+ *
+ * Plain TypeScript with no lifetime of its own (rule F1): nothing closes it and
+ * no call on it throws a lifecycle refusal. One store per selected project; the
+ * page holds it today and the project runtime of OpenSpec task 10 takes it over.
+ */
+export interface PresenceStore extends Store<Presence> {
+  readonly reportUsers: (users: readonly string[]) => void;
+  readonly reportConnection: (connected: boolean) => void;
+}
+
+/** Builds one project's presence: nobody, not connected. */
+export function createPresence(): PresenceStore {
+  const changes = createChannel<undefined>();
+  let current: Presence = { users: [], connected: false };
+  const replace = (next: Presence): void => {
+    current = next;
+    changes.publish(undefined);
+  };
+  return {
+    subscribe: (onChange) => changes.subscribe(onChange),
+    snapshot: () => current,
+    reportUsers: (users) => {
+      if (users === current.users) return;
+      replace({ ...current, users });
+    },
+    reportConnection: (connected) => {
+      if (connected === current.connected) return;
+      replace({ ...current, connected });
+    },
+  };
+}
diff --git a/apps/wbs/fe-01/vitest.node-suites.ts b/apps/wbs/fe-01/vitest.node-suites.ts
index ae943dea..c3dd693f 100644
--- a/apps/wbs/fe-01/vitest.node-suites.ts
+++ b/apps/wbs/fe-01/vitest.node-suites.ts
@@ -66,8 +66,10 @@ export const NODE_SUITES: readonly string[] = [
   'src/modules/channel.model.test.ts',
   'src/modules/directory-management/directory-management.feature.test.ts',
   'src/modules/directory/directory.resource.test.ts',
+  'src/modules/plan-feed/delivered-plan-store.model.test.ts',
   'src/modules/plan-feed/plan-feed.feature.test.ts',
   'src/modules/plan-feed/plan-feed.resource.test.ts',
+  'src/modules/plan-feed/presence-store.model.test.ts',
   'src/modules/plan-writer/busy-store.model.test.ts',
   'src/modules/plan-writer/plan-writer.test.ts',
   // Proof: on 2026-09-24, listing the deleted `composition.test.ts` here again failed
```

### 7.7 `spec.md` — slice 3, the scenario for the ports

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 1836dcf5..837f9725 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -372,3 +372,10 @@ stores and listen to the channels, and what a reader sees SHALL NOT change.
 - **THEN** the delivered plan or the presence keeps the same snapshot object and
   no listener is told, and a publication that does change a member replaces the
   snapshot once, keeps every other member as it was, and tells each listener once
+
+#### Scenario: The writer and the feed announce through the project's ports
+
+- **WHEN** a gesture starts, is refused, or the feed's first read is refused
+- **THEN** the table hears that a command was issued before any request is sent,
+  says each refusal once in the toast stack it was given, and a gesture whose
+  reader has left lowers no busy state and announces nothing
```

### 7.8 `src/modules/plan-writer/plan-writer.test.ts` (the named fixture edit and two examples) and `src/components/wbs/use-channel-listener.test.tsx` (**new**) — slice 3

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-channel-listener.test.tsx b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.test.tsx
new file mode 100644
index 00000000..1bd514f6
--- /dev/null
+++ b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.test.tsx
@@ -0,0 +1,118 @@
+import { act, cleanup, render } from '@testing-library/react';
+import { type ReactNode, useEffect } from 'react';
+import { afterEach, describe, expect, it } from 'vitest';
+
+import { type Channel, createChannel } from '@/modules/channel';
+
+import { useChannelListener } from './use-channel-listener';
+
+// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
+const hasDom = typeof document !== 'undefined';
+const itDom = hasDom ? it : it.skip;
+
+afterEach(() => {
+  cleanup();
+});
+
+/** Listens to `channel` with `listener`, and renders its children below the listener. */
+function Listening({
+  channel,
+  listener,
+  children,
+}: {
+  channel: Channel<string>;
+  listener: (event: string) => void;
+  children?: ReactNode;
+}) {
+  useChannelListener(channel, listener);
+  return <>{children}</>;
+}
+
+/** Publishes once from its own mount effect — the way the plan feed's first read starts. */
+function PublishOnMount({ channel, event }: { channel: Channel<string>; event: string }) {
+  useEffect(() => {
+    channel.publish(event);
+  }, [channel, event]);
+  return null;
+}
+
+describe('listening to a project channel', () => {
+  itDom('hears an event a child publishes from its own mount effect', () => {
+    const channel = createChannel<string>();
+    const heard: string[] = [];
+
+    render(
+      <Listening channel={channel} listener={(event) => heard.push(event)}>
+        <PublishOnMount channel={channel} event="first read refused" />
+      </Listening>,
+    );
+
+    expect(heard).toEqual(['first read refused']);
+  });
+
+  itDom('calls the listener of the latest render and never a superseded one', () => {
+    const channel = createChannel<string>();
+    const first: string[] = [];
+    const second: string[] = [];
+    const view = render(<Listening channel={channel} listener={(event) => first.push(event)} />);
+
+    view.rerender(<Listening channel={channel} listener={(event) => second.push(event)} />);
+    act(() => {
+      channel.publish('after the re-render');
+    });
+
+    expect(first).toEqual([]);
+    expect(second).toEqual(['after the re-render']);
+  });
+
+  itDom('follows a channel replaced while it stays mounted, and leaves the old one', () => {
+    const replaced = createChannel<string>();
+    const replacement = createChannel<string>();
+    const heard: string[] = [];
+    const listener = (event: string) => heard.push(event);
+    const view = render(<Listening channel={replaced} listener={listener} />);
+
+    view.rerender(<Listening channel={replacement} listener={listener} />);
+    act(() => {
+      replaced.publish('from the replaced channel');
+      replacement.publish('from the replacement');
+    });
+
+    expect(heard).toEqual(['from the replacement']);
+  });
+
+  itDom('hears nothing once it is unmounted, and a publication then throws nothing', () => {
+    const channel = createChannel<string>();
+    const heard: string[] = [];
+    const view = render(<Listening channel={channel} listener={(event) => heard.push(event)} />);
+
+    view.unmount();
+
+    expect(() => {
+      channel.publish('after the unmount');
+    }).not.toThrow();
+    expect(heard).toEqual([]);
+  });
+
+  itDom('lets a listener’s own failure reach the publisher by identity', () => {
+    const channel = createChannel<string>();
+    const failure = new Error('the toast stack is gone');
+    render(
+      <Listening
+        channel={channel}
+        listener={() => {
+          throw failure;
+        }}
+      />,
+    );
+
+    let caught: unknown = null;
+    try {
+      channel.publish('refused');
+    } catch (thrown: unknown) {
+      caught = thrown;
+    }
+
+    expect(caught).toBe(failure);
+  });
+});
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts
index 3c4a2301..69fd2308 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts
@@ -2,6 +2,7 @@ import { describe, expect, it } from 'vitest';

 import type { PlanRefresh, RefreshResource } from '@/lib/plan-refresh';

+import { createBusy } from './busy-store';
 import type { PlanWriteRefusal, PlanWriterHost } from './contract';
 import { createPlanWriter } from './plan-writer.feature';

@@ -44,13 +45,16 @@ function recordingHost(): {
     host: {
       readRefreshOwner: () => owner,
       isActiveReader: () => true,
-      noteCommandIssued: () => undefined,
       rereadResources: (resources) => {
         rereads.push(resources);
         return Promise.resolve();
       },
-      setBusy: (busy) => busyChanges.push(busy),
-      announceRefusal: (refusal) => refusals.push(refusal),
+      busy: {
+        raise: () => busyChanges.push(true),
+        lower: () => busyChanges.push(false),
+      },
+      commandsIssued: { publish: () => undefined },
+      refusals: { publish: (refusal) => refusals.push(refusal) },
     },
   };
 }
@@ -81,13 +85,13 @@ describe('the plan writer', () => {
     const writer = createPlanWriter({
       readRefreshOwner: () => owner,
       isActiveReader: () => true,
-      noteCommandIssued: () => undefined,
       rereadResources: (resources) => {
         rereads.push(resources);
         return Promise.resolve();
       },
-      setBusy: () => undefined,
-      announceRefusal: () => undefined,
+      busy: { raise: () => undefined, lower: () => undefined },
+      commandsIssued: { publish: () => undefined },
+      refusals: { publish: () => undefined },
     });

     const outcome = await writer.run(async (write) => {
@@ -101,4 +105,45 @@ describe('the plan writer', () => {
     expect(outcome).toBe('refused');
     expect(rereads).toEqual([]);
   });
+
+  it('says a command was issued before it sends anything', async () => {
+    const recorded = recordingHost();
+    const said: string[] = [];
+    const writer = createPlanWriter({
+      ...recorded.host,
+      commandsIssued: { publish: () => said.push('command issued') },
+    });
+
+    await writer.run(async (write) => {
+      await write.perform(['tree'], () => {
+        said.push('request sent');
+        return Promise.resolve('renamed');
+      });
+    });
+
+    expect(said).toEqual(['command issued', 'request sent']);
+  });
+
+  it('leaves the project busy when its reader left before the answer arrived', async () => {
+    const recorded = recordingHost();
+    const busy = createBusy();
+    let reading = true;
+    const writer = createPlanWriter({
+      ...recorded.host,
+      isActiveReader: () => reading,
+      busy,
+    });
+
+    await writer.run(async (write) => {
+      await write.perform(['tree'], () => {
+        // Another API replaced this reader's while the request was in flight,
+        // and that reader raised busy for a gesture of its own.
+        reading = false;
+        return Promise.resolve('renamed');
+      });
+    });
+
+    expect(busy.snapshot()).toBe(true);
+    expect(recorded.rereads).toEqual([]);
+  });
 });
```

### 7.9 `contract.ts`, `plan-writer.feature.ts`, `composition.ts`, `use-channel-listener.ts` (**new**), `use-plan-read.ts`, `wbs-table.tsx`, `use-plan-dependencies.ts` — slice 3

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
new file mode 100644
index 00000000..2d383667
--- /dev/null
+++ b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
@@ -0,0 +1,38 @@
+import { useLayoutEffect, useRef } from 'react';
+
+import type { Channel } from '@/modules/channel';
+
+/**
+ * Listens to one project channel for as long as the component is mounted, with
+ * the listener of the latest render.
+ *
+ * Three things a naive `useEffect(() => channel.subscribe(listener))` gets
+ * wrong, each an example test in `use-channel-listener.test.tsx`:
+ *
+ * - **Subscribed before any passive effect of the commit runs.** A layout
+ *   effect, so an event a sibling's or a child's `useEffect` publishes on mount
+ *   — the plan feed's first read is started from one — is heard rather than
+ *   published into nobody.
+ * - **The listener of the latest render, without resubscribing.** Read through a
+ *   ref written in a layout effect, so a listener superseded by a re-render is
+ *   never called again, and a new listener identity costs no unsubscribe.
+ * - **One subscription per channel.** A channel replaced while the component
+ *   stays mounted is left before the new one is joined, in the same commit, and
+ *   unmounting leaves it; nothing published afterwards reaches this component.
+ *
+ * It never catches: a listener's failure reaches whoever published, which is
+ * {@link Channel}'s rule.
+ */
+export function useChannelListener<T>(channel: Channel<T>, listener: (event: T) => void): void {
+  const latest = useRef(listener);
+  useLayoutEffect(() => {
+    latest.current = listener;
+  });
+  useLayoutEffect(
+    () =>
+      channel.subscribe((event) => {
+        latest.current(event);
+      }),
+    [channel],
+  );
+}
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts
index aeb472b5..5ba9095d 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts
@@ -3,6 +3,7 @@ import { useCallback, useEffect, useMemo, useRef } from 'react';

 import type { RunPlanWrite } from '@/lib/local-write';
 import type { ProjectApi, StepView } from '@/lib/wbs-api';
+import type { BusyWrites } from '@/modules/plan-writer/busy-store';

 import { pickerEntries } from './dep-picker';
 import { parseDependencies, unknownMessage } from './depends-input';
@@ -23,7 +24,7 @@ import { type TreeRow } from './wbs-rows';
 export function usePlanDependencies({
   flat,
   pushToast,
-  setBusy,
+  busy,
   api,
   refreshOrMarkStale,
   setDepPicker,
@@ -32,7 +33,7 @@ export function usePlanDependencies({
 }: {
   flat: TreeRow[];
   pushToast: (toast: Toast) => void;
-  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
+  busy: BusyWrites;
   api: ProjectApi;
   refreshOrMarkStale: (scope?: PlanReadScope) => Promise<void>;
   setDepPicker: React.Dispatch<
@@ -121,7 +122,7 @@ export function usePlanDependencies({
       void (async () => {
         const owner = api;
         const isCurrent = () => activeApi.current === owner;
-        setBusy(true);
+        busy.raise();
         const refused: string[] = [];
         let ambiguous = false;
         try {
@@ -154,7 +155,7 @@ export function usePlanDependencies({
           // rename while it was still pending. Watched in `keeps an old
           // dependency-list refusal out of its busy API replacement`,
           // 2026-09-14.
-          if (isCurrent()) setBusy(false);
+          if (isCurrent()) busy.lower();
         }
         const problems = [
           notThere,
@@ -171,7 +172,7 @@ export function usePlanDependencies({
           pushToast({ kind: 'error', text: problems.join(' ') });
       })();
     },
-    [activeApi, api, flat, pushToast, refreshOrMarkStale, setBusy],
+    [activeApi, api, busy, flat, pushToast, refreshOrMarkStale],
   );

   /**
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index ec1cbe39..6fff6d59 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -1,6 +1,14 @@
 import type { DependencyReach } from '@wbs/domain/dependency-reach';
 import type * as React from 'react';
-import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
+import {
+  type ReactNode,
+  useCallback,
+  useEffect,
+  useMemo,
+  useRef,
+  useState,
+  useSyncExternalStore,
+} from 'react';

 import { ALL_RESOURCES, type RefreshResource } from '@/lib/plan-refresh';
 import type { ProjectStream } from '@/lib/project-stream';
@@ -27,8 +35,12 @@ import {
   type StepView,
 } from '@/lib/wbs-api';
 import { calendarMarkersForReader } from '@/modules/calendar-markers/composition';
+import type { CalendarMarkerRefusal } from '@/modules/calendar-markers/contract';
+import { type Channel, createChannel } from '@/modules/channel';
 import { planFeedForReader } from '@/modules/plan-feed/composition';
-import type { PlanFeed, PlanFeedDelivery } from '@/modules/plan-feed/contract';
+import type { PlanFeed, PlanFeedDelivery, PlanFeedRefusal } from '@/modules/plan-feed/contract';
+import { type BusyWrites, createBusy } from '@/modules/plan-writer/busy-store';
+import type { PlanWriteRefusal } from '@/modules/plan-writer/contract';
 import { createPlanWriter } from '@/modules/plan-writer/plan-writer.feature';

 import { type CellCards } from './cell-card-store';
@@ -36,6 +48,7 @@ import type { FocusIntent } from './live-editing';
 import { forgetRefusedDrafts } from './live-editing';
 import { NOTHING_TO_REDO, NOTHING_TO_UNDO, refusalSentence } from './plan-refusal';
 import { type Toast, type ToastStackApi } from './toasts';
+import { useChannelListener } from './use-channel-listener';
 import { dropDrafts, rowOfCellKey, stepOfCellKey, stepOfDraftKey } from './use-estimate-drafts';
 import type { PlanImportControl } from './use-plan-import';
 import { toTree, type TreeRow } from './wbs-rows';
@@ -177,6 +190,33 @@ export const NO_CHART_READ: ChartRead = {
   generation: 0,
 };

+/**
+ * A refusal one of this project's services announces: the feed's and the
+ * markers' as a cause, the writer's as the sentence it already chose.
+ *
+ * The words for a cause are built by the table's listener and nowhere else, for
+ * the reason `PlanFeedDelivery` gives: a service that imported the refusal
+ * vocabulary would be importing upward out of `components/`.
+ */
+export type PlanRefusal = PlanFeedRefusal | CalendarMarkerRefusal | PlanWriteRefusal;
+
+/**
+ * The project-owned stores and ports this table's services write through.
+ *
+ * Built once per mount, which is one project: `ProjectPage` keys the table by
+ * the selected project. A lazy state initializer is safe here only because none
+ * of them holds a resource or needs closing — StrictMode's discarded second
+ * initializer leaks nothing. The project runtime of OpenSpec task 10 builds them
+ * instead, and then this function goes.
+ */
+function openProjectPorts() {
+  return {
+    busy: createBusy(),
+    refusals: createChannel<PlanRefusal>(),
+    commandsIssued: createChannel<undefined>(),
+  };
+}
+
 /**
  * No calendar markers — the state before the first read lands, and the state a
  * project with none stays in.
@@ -252,7 +292,10 @@ export function usePlanReadState({ projectId }: { projectId: string }) {
   const [treeMayBeStale, setTreeMayBeStale] = useState(false);
   const [treeFailureText, setTreeFailureText] = useState<string | null>(null);

-  const [busy, setBusy] = useState(false);
+  const [ports] = useState(openProjectPorts);
+  // Selected, never set here: the gestures raise and lower it through `busyWrites`.
+  const busy = useSyncExternalStore(ports.busy.subscribe, ports.busy.snapshot);
+  const busyWrites: BusyWrites = ports.busy;

   const [connected, setConnected] = useState(true);

@@ -360,7 +403,9 @@ export function usePlanReadState({ projectId }: { projectId: string }) {
     treeFailureText,
     setTreeFailureText,
     busy,
-    setBusy,
+    busyWrites,
+    refusals: ports.refusals,
+    commandsIssued: ports.commandsIssued,
     connected,
     setConnected,
     scheduleError,
@@ -429,7 +474,9 @@ export function usePlanRead({
   subscribe,
   setConnected,
   focusIntent,
-  setBusy,
+  busyWrites,
+  refusals,
+  commandsIssued,
 }: {
   setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
   projectId: string;
@@ -464,12 +511,30 @@ export function usePlanRead({
     | undefined;
   setConnected: React.Dispatch<React.SetStateAction<boolean>>;
   focusIntent: React.RefObject<FocusIntent>;
-  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
+  busyWrites: BusyWrites;
+  refusals: Channel<PlanRefusal>;
+  commandsIssued: Channel<undefined>;
 }) {
   const feedRef = useRef<PlanFeed | null>(null);
   const activeApi = useRef(api);
   activeApi.current = api;

+  // Joined before the feed below starts reading, which is a passive effect of
+  // this same commit: see `useChannelListener`.
+  useChannelListener(refusals, (refusal) => {
+    pushToast({
+      kind: 'error',
+      // Proof: using the bare failure code here left the unavailable-plan
+      // fixture with no named toast and an unhandled refusal-code branch.
+      text: 'sentence' in refusal ? refusal.sentence : refusalSentence(refusal.cause),
+    });
+  });
+  // The table decides what a command issued means for the focus; the writer
+  // only says that one was.
+  useChannelListener(commandsIssued, () => {
+    focusIntent.current.commandIssued();
+  });
+
   /**
    * Settles this browser's own state against the steps be-01 just reported.
    *
@@ -646,11 +711,7 @@ export function usePlanRead({
       subscribe,
       isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
       publish: publishPlan,
-      announceRefusal: ({ cause }) => {
-        // Proof: using the bare failure code here left the unavailable-plan
-        // fixture with no named toast and an unhandled refusal-code branch.
-        pushToast({ kind: 'error', text: refusalSentence(cause) });
-      },
+      refusals,
       setConnected,
     });
     feedRef.current = feed;
@@ -658,7 +719,7 @@ export function usePlanRead({
       if (feedRef.current === feed) feedRef.current = null;
       feed.close();
     };
-  }, [activeProject, api, projectId, publishPlan, pushToast, setConnected, subscribe]);
+  }, [activeProject, api, projectId, publishPlan, refusals, setConnected, subscribe]);

   /** Awaits this invalidation's covering outcome; failures remain in the owner snapshot. */
   const refreshResourcesOrMarkStale = useCallback(
@@ -701,11 +762,9 @@ export function usePlanRead({
         api,
         readRefreshOwner: () => feedRef.current?.owner ?? null,
         isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
-        announceRefusal: ({ cause }) => {
-          pushToast({ kind: 'error', text: refusalSentence(cause) });
-        },
+        announceRefusal: refusals.publish,
       }),
-    [activeProject, api, projectId, pushToast],
+    [activeProject, api, projectId, refusals],
   );

   /**
@@ -719,16 +778,20 @@ export function usePlanRead({
       createPlanWriter({
         readRefreshOwner: () => feedRef.current?.owner ?? null,
         isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
-        noteCommandIssued: () => {
-          focusIntent.current.commandIssued();
-        },
         rereadResources: refreshResourcesOrMarkStale,
-        setBusy,
-        announceRefusal: ({ sentence }) => {
-          pushToast({ kind: 'error', text: sentence });
-        },
+        busy: busyWrites,
+        commandsIssued,
+        refusals,
       }),
-    [activeProject, api, focusIntent, projectId, pushToast, refreshResourcesOrMarkStale, setBusy],
+    [
+      activeProject,
+      api,
+      busyWrites,
+      commandsIssued,
+      projectId,
+      refreshResourcesOrMarkStale,
+      refusals,
+    ],
   );

   /**
@@ -752,7 +815,7 @@ export function usePlanRead({
         feedRef.current?.owner === owner &&
         activeProject.current === projectId &&
         activeApi.current === api;
-      setBusy(true);
+      busyWrites.raise();
       try {
         let outcome;
         try {
@@ -788,10 +851,10 @@ export function usePlanRead({
         }
         await refreshOrMarkStale();
       } finally {
-        if (isCurrent()) setBusy(false);
+        if (isCurrent()) busyWrites.lower();
       }
     },
-    [activeProject, api, projectId, pushToast, refreshOrMarkStale, setBusy],
+    [activeProject, api, busyWrites, projectId, pushToast, refreshOrMarkStale],
   );
   return { refreshOrMarkStale, run: writer.run, stepStack, markers };
 }
diff --git a/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx b/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
index 32f027ef..474bccde 100644
--- a/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
@@ -637,7 +637,9 @@ export function WbsTable({
     markers,
     setMarkers,
     busy,
-    setBusy,
+    busyWrites,
+    refusals,
+    commandsIssued,
     connected,
     setConnected,
     scheduleError,
@@ -979,7 +981,9 @@ export function WbsTable({
     subscribe,
     setConnected,
     focusIntent,
-    setBusy,
+    busyWrites,
+    refusals,
+    commandsIssued,
   });
   usePlanKeyboardEffects({
     setCheatSheetOpen,
@@ -1209,7 +1213,7 @@ export function WbsTable({
     usePlanDependencies({
       flat,
       pushToast,
-      setBusy,
+      busy: busyWrites,
       api,
       refreshOrMarkStale,
       setDepPicker,
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/composition.ts b/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
index 731a74ab..8779e846 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
@@ -1,6 +1,7 @@
 import { createPlanRefresh } from '@/lib/plan-refresh';
 import type { ProjectStream } from '@/lib/project-stream';
 import type { ProjectApi } from '@/lib/wbs-api';
+import type { Publisher } from '@/modules/channel';

 import type {
   PlanFeed,
@@ -19,7 +20,8 @@ export interface PlanFeedForReader {
     | undefined;
   readonly isActiveReader: () => boolean;
   readonly publish: (delivery: PlanFeedDelivery) => void;
-  readonly announceRefusal: (refusal: PlanFeedRefusal) => void;
+  /** Where a refusal of the first read is announced; the words are the listener's. */
+  readonly refusals: Publisher<PlanFeedRefusal>;
   readonly setConnected: (connected: boolean) => void;
 }

@@ -39,7 +41,7 @@ export function planFeedForReader({
   subscribe,
   isActiveReader,
   publish,
-  announceRefusal,
+  refusals,
   setConnected,
 }: PlanFeedForReader): PlanFeed {
   return createPlanFeed({
@@ -50,7 +52,7 @@ export function planFeedForReader({
         : (handlers, baseline) => subscribe(projectId, handlers, baseline),
     isActiveReader,
     publish,
-    announceRefusal,
+    announceRefusal: refusals.publish,
     setConnected,
   });
 }
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/contract.ts b/apps/wbs/fe-01/src/modules/plan-writer/contract.ts
index 8e76001b..7329da50 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/contract.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/contract.ts
@@ -1,5 +1,8 @@
 import type { RunPlanWrite } from '@/lib/local-write';
 import type { PlanRefresh, RefreshResource } from '@/lib/plan-refresh';
+import type { Publisher } from '@/modules/channel';
+
+import type { BusyWrites } from './busy-store';

 /**
  * A gesture that be-01 refused, in the sentence a reader is owed.
@@ -17,10 +20,13 @@ export interface PlanWriteRefusal {
 /**
  * What the plan writer needs from whoever is hosting it.
  *
- * Every member is a function rather than a value because all of them are read at
+ * Two kinds of member, and no React in either. The first three are **read** at
  * the moment a gesture asks, not at the moment the writer is built: the feed
  * owner can be renewed under the same reader by a covering read, and the reader
- * can leave for another project between a request and its answer.
+ * can leave for another project between a request and its answer. The last
+ * three are the project's own **store and ports** — the writer raises and
+ * lowers busy through one and says what happened through the other two, and
+ * never learns who is listening.
  */
 export interface PlanWriterHost {
   /**
@@ -40,20 +46,24 @@ export interface PlanWriterHost {
    * renewal must not cost the reader its own gesture's outcome or leave it busy.
    */
   isActiveReader: () => boolean;
-  /**
-   * Records where the gesture now starting was issued from, synchronously.
-   *
-   * Called at the moment the gesture happens and not when its answer arrives:
-   * everything between the two is the interval in which the reader may have gone
-   * somewhere else, and that interval is the thing the focus intent measures.
-   */
-  noteCommandIssued: () => void;
   /** Awaits the covering outcome of an invalidation; failures stay in the feed's own snapshot. */
   rereadResources: (resources: readonly RefreshResource[]) => Promise<void>;
-  /** Raises and clears the shared busy state the toolbar and the cells read. */
-  setBusy: (busy: boolean) => void;
-  /** Announces one refusal to whoever says things to the reader. */
-  announceRefusal: (refusal: PlanWriteRefusal) => void;
+  /**
+   * The project's busy state: raised when a gesture starts, and lowered when it
+   * ends only if {@link PlanWriterHost.isActiveReader} still answers yes — the
+   * reader that raised it owns it; a different API or project does not.
+   */
+  busy: BusyWrites;
+  /**
+   * Says that a gesture is starting, synchronously, at the moment it happens and
+   * not when its answer arrives: everything between the two is the interval in
+   * which the reader may have gone somewhere else, and whoever draws the focus
+   * measures that interval from here. The event carries nothing; what it means
+   * for the focus is the listener's decision.
+   */
+  commandsIssued: Publisher<undefined>;
+  /** Where a refusal is announced, once, to whoever says things to the reader. */
+  refusals: Publisher<PlanWriteRefusal>;
 }

 /**
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
index b4e5bac6..4337abff 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
@@ -20,10 +20,10 @@ import type { PlanWriter, PlanWriterHost } from './contract';
 export function createPlanWriter({
   readRefreshOwner,
   isActiveReader,
-  noteCommandIssued,
   rereadResources,
-  setBusy,
-  announceRefusal,
+  busy,
+  commandsIssued,
+  refusals,
 }: PlanWriterHost): PlanWriter {
   return {
     /**
@@ -68,8 +68,8 @@ export function createPlanWriter({
       // happened. The intent compares it against where the focus is when the
       // refetch lands, and everything between the two is the window in which
       // the reader may have gone somewhere else.
-      noteCommandIssued();
-      setBusy(true);
+      commandsIssued.publish(undefined);
+      busy.raise();
       const write = createLocalWrite();
       try {
         try {
@@ -85,7 +85,7 @@ export function createPlanWriter({
           // to include 'That change could not be completed: …'`. The reread
           // below dropped, the same test failed on `expected [ '010', '020',
           // '030' ] to deeply equal [ '010', '020' ]`.
-          announceRefusal({ sentence: refusalSentence(thrown) });
+          refusals.publish({ sentence: refusalSentence(thrown) });
           // Two refusals say the screen is behind rather than that the request
           // was wrong: {@link GONE}, and a body be-01 could not read. The
           // second is the sentence's own claim — {@link INVALID_REFUSAL} says
@@ -135,7 +135,7 @@ export function createPlanWriter({
         // reader busy forever. Dropping the API half let the departed owner
         // clear its replacement's pending rename. Watched in the renewal and
         // busy-replacement cases, 2026-09-14.
-        if (isActiveReader()) setBusy(false);
+        if (isActiveReader()) busy.lower();
       }
     },
   };
```

### 7.10 `spec.md` — slice 4, the scenario for the selected snapshot

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 837f9725..ce129801 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -379,3 +379,10 @@ stores and listen to the channels, and what a reader sees SHALL NOT change.
 - **THEN** the table hears that a command was issued before any request is sent,
   says each refusal once in the toast stack it was given, and a gesture whose
   reader has left lowers no busy state and announces nothing
+
+#### Scenario: The table selects the delivered plan and settles what changed
+
+- **WHEN** a publication changes the delivered plan, including one that lands after
+  the table has rendered and before its effects have run
+- **THEN** the table draws the delivered values, and the hover card and the drafts
+  are settled against the rows and steps that changed, once per change
```

### 7.11 `src/components/wbs/use-snapshot-changes.test.tsx` — slice 4, **new file**

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.test.tsx b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.test.tsx
new file mode 100644
index 00000000..d1b49a42
--- /dev/null
+++ b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.test.tsx
@@ -0,0 +1,147 @@
+import { act, cleanup, render } from '@testing-library/react';
+import { type ReactNode, useLayoutEffect } from 'react';
+import { afterEach, describe, expect, it } from 'vitest';
+
+import { createChannel } from '@/modules/channel';
+import type { Store } from '@/modules/store';
+
+import { useSnapshotChanges } from './use-snapshot-changes';
+
+// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
+const hasDom = typeof document !== 'undefined';
+const itDom = hasDom ? it : it.skip;
+
+afterEach(() => {
+  cleanup();
+});
+
+/** A store of one number; `tell` notifies without changing anything, as a careless store might. */
+interface NumberStore extends Store<number> {
+  set: (next: number) => void;
+  tell: () => void;
+}
+
+function numberStore(start: number): NumberStore {
+  const changes = createChannel<undefined>();
+  let value = start;
+  return {
+    subscribe: (onChange) => changes.subscribe(onChange),
+    snapshot: () => value,
+    set: (next) => {
+      value = next;
+      changes.publish(undefined);
+    },
+    tell: () => {
+      changes.publish(undefined);
+    },
+  };
+}
+
+function Watching({
+  store,
+  onChange,
+  children,
+}: {
+  store: Store<number>;
+  onChange: (next: number, previous: number) => void;
+  children?: ReactNode;
+}) {
+  useSnapshotChanges(store, onChange);
+  return <>{children}</>;
+}
+
+/** Changes the store from its own layout effect, which runs before its parent's. */
+function ChangeOnLayout({ store, to }: { store: NumberStore; to: number }) {
+  useLayoutEffect(() => {
+    store.set(to);
+  }, [store, to]);
+  return null;
+}
+
+describe('following a store’s changes', () => {
+  itDom('hands on every change once, with the snapshot it replaced', () => {
+    const store = numberStore(0);
+    const seen: [number, number][] = [];
+    render(<Watching store={store} onChange={(next, previous) => seen.push([next, previous])} />);
+
+    act(() => {
+      store.set(1);
+      store.set(2);
+    });
+
+    expect(seen).toEqual([
+      [1, 0],
+      [2, 1],
+    ]);
+  });
+
+  itDom('catches up with a change made between its render and its subscription', () => {
+    const store = numberStore(0);
+    const seen: [number, number][] = [];
+
+    render(
+      <Watching store={store} onChange={(next, previous) => seen.push([next, previous])}>
+        <ChangeOnLayout store={store} to={5} />
+      </Watching>,
+    );
+
+    expect(seen).toEqual([[5, 0]]);
+  });
+
+  itDom('hands on nothing when told of a change that left the snapshot as it was', () => {
+    const store = numberStore(0);
+    const seen: [number, number][] = [];
+    render(<Watching store={store} onChange={(next, previous) => seen.push([next, previous])} />);
+
+    act(() => {
+      store.tell();
+    });
+
+    expect(seen).toEqual([]);
+  });
+
+  itDom('calls the callback of the latest render and never a superseded one', () => {
+    const store = numberStore(0);
+    const first: number[] = [];
+    const second: number[] = [];
+    const view = render(<Watching store={store} onChange={(next) => first.push(next)} />);
+
+    view.rerender(<Watching store={store} onChange={(next) => second.push(next)} />);
+    act(() => {
+      store.set(1);
+    });
+
+    expect(first).toEqual([]);
+    expect(second).toEqual([1]);
+  });
+
+  itDom('follows a store replaced while it stays mounted, and leaves the old one', () => {
+    const replaced = numberStore(0);
+    const replacement = numberStore(7);
+    const seen: [number, number][] = [];
+    const onChange = (next: number, previous: number) => seen.push([next, previous]);
+    const view = render(<Watching store={replaced} onChange={onChange} />);
+
+    view.rerender(<Watching store={replacement} onChange={onChange} />);
+    act(() => {
+      replaced.set(1);
+      replacement.set(8);
+    });
+
+    expect(seen).toEqual([
+      [7, 0],
+      [8, 7],
+    ]);
+  });
+
+  itDom('hands on nothing once it is unmounted', () => {
+    const store = numberStore(0);
+    const seen: number[] = [];
+    const view = render(<Watching store={store} onChange={(next) => seen.push(next)} />);
+
+    view.unmount();
+    store.set(1);
+
+    expect(seen).toEqual([]);
+  });
+});
```

### 7.12 `use-snapshot-changes.ts` (**new**), `use-plan-read.ts`, `wbs-table.tsx`, `composition.ts` — slice 4

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index 6fff6d59..b80c2dfd 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -10,20 +10,9 @@ import {
   useSyncExternalStore,
 } from 'react';

-import { ALL_RESOURCES, type RefreshResource } from '@/lib/plan-refresh';
+import { ALL_RESOURCES, type DirectoryRead, type RefreshResource } from '@/lib/plan-refresh';
 import type { ProjectStream } from '@/lib/project-stream';
-import type {
-  AssignedPersonView,
-  CalendarMarkerView,
-  ExternalSystemView,
-  PersonView,
-  PriorityBandView,
-  ServiceView,
-  TagView,
-  TeamCapacityView,
-  TeamView,
-  WorkItemTypeView,
-} from '@/lib/wbs-api';
+import type { AssignedPersonView } from '@/lib/wbs-api';
 import {
   DEFAULT_PERT_WEIGHTS_VIEW,
   type EstimateMethod,
@@ -38,7 +27,12 @@ import { calendarMarkersForReader } from '@/modules/calendar-markers/composition
 import type { CalendarMarkerRefusal } from '@/modules/calendar-markers/contract';
 import { type Channel, createChannel } from '@/modules/channel';
 import { planFeedForReader } from '@/modules/plan-feed/composition';
-import type { PlanFeed, PlanFeedDelivery, PlanFeedRefusal } from '@/modules/plan-feed/contract';
+import type { PlanFeed, PlanFeedRefusal } from '@/modules/plan-feed/contract';
+import {
+  createDeliveredPlan,
+  type DeliveredPlan,
+  type DeliveredPlanStore,
+} from '@/modules/plan-feed/delivered-plan-store';
 import { type BusyWrites, createBusy } from '@/modules/plan-writer/busy-store';
 import type { PlanWriteRefusal } from '@/modules/plan-writer/contract';
 import { createPlanWriter } from '@/modules/plan-writer/plan-writer.feature';
@@ -51,6 +45,7 @@ import { type Toast, type ToastStackApi } from './toasts';
 import { useChannelListener } from './use-channel-listener';
 import { dropDrafts, rowOfCellKey, stepOfCellKey, stepOfDraftKey } from './use-estimate-drafts';
 import type { PlanImportControl } from './use-plan-import';
+import { useSnapshotChanges } from './use-snapshot-changes';
 import { toTree, type TreeRow } from './wbs-rows';

 export interface WbsTableProps {
@@ -211,6 +206,7 @@ export type PlanRefusal = PlanFeedRefusal | CalendarMarkerRefusal | PlanWriteRef
  */
 function openProjectPorts() {
   return {
+    plan: createDeliveredPlan(),
     busy: createBusy(),
     refusals: createChannel<PlanRefusal>(),
     commandsIssued: createChannel<undefined>(),
@@ -218,25 +214,43 @@ function openProjectPorts() {
 }

 /**
- * No calendar markers — the state before the first read lands, and the state a
- * project with none stays in.
- *
- * Hoisted out of the component so the empty case is one object rather than a
- * new array on every render: `GanttPanel` takes `markers` straight into a
- * `useMemo` dependency list, and a fresh `[]` each time would rebuild the chip
- * layer on renders that changed nothing about it. `gantt-panel.tsx` keeps its
- * own `NO_MARKERS` for the same reason on the other side of the prop.
+ * The rows each delivered tree draws, built once per tree however many places
+ * ask: the table's render and the settling of the hover card below read the
+ * same array.
  */
-const NO_MARKERS: readonly CalendarMarkerView[] = [];
+const drawnRows = new WeakMap<DeliveredTree, TreeRow[]>();
+
+/** One delivered tree, as the delivered plan holds it. */
+type DeliveredTree = NonNullable<DeliveredPlan['tree']>;
+
+function rowsOf(tree: DeliveredTree): TreeRow[] {
+  const drawn = drawnRows.get(tree);
+  if (drawn !== undefined) return drawn;
+  const rows = toTree(tree.value.workItems);
+  drawnRows.set(tree, rows);
+  return rows;
+}
+
+/** A directory before the first read of one has landed: every list empty. */
+function emptyDirectory(): DirectoryRead {
+  return { teams: [], tags: [], services: [], workItemTypes: [], externalSystems: [], people: [] };
+}

 /**
  * What a plan read holds while it is in flight, and after it has landed: the
  * rows, the chart's slices, the vocabularies, the undo stack and whether any
  * of it is stale.
  *
- * State rather than a query cache because this table has one project on screen
- * and a socket telling it when to read again — see {@link usePlanRead} for the
- * reading itself.
+ * **Selected, never set.** The plan feed writes every publication into the
+ * project's delivered plan (`modules/plan-feed/delivered-plan-store.ts`), and
+ * every value below is derived from that one snapshot, so a render never sees
+ * two publications at once and nothing here hands a setter to anybody. Each
+ * derived value keeps its identity until the member it comes from changes,
+ * which is what the table's memos were already relying on.
+ *
+ * A store rather than a query cache because this table has one project on
+ * screen and a socket telling it when to read again — see {@link usePlanRead}
+ * for the reading itself.
  */
 export function usePlanReadState({ projectId }: { projectId: string }) {
   /**
@@ -251,7 +265,11 @@ export function usePlanReadState({ projectId }: { projectId: string }) {

   activeProject.current = projectId;

-  const [workItems, setWorkItems] = useState<TreeRow[]>([]);
+  const [ports] = useState(openProjectPorts);
+  const delivered = useSyncExternalStore(ports.plan.subscribe, ports.plan.snapshot);
+  const tree = delivered.tree;
+
+  const workItems = useMemo(() => (tree === null ? [] : rowsOf(tree)), [tree]);

   /** The project whose whole tree most recently completed a successful read. */
   const treeReadProject = useRef<string | null>(null);
@@ -264,21 +282,44 @@ export function usePlanReadState({ projectId }: { projectId: string }) {
    * a person freed here starts something over there — and guessing which would
    * be a second implementation of the engine.
    *
-   * One state and not three, and that is the fix rather than a tidy-up.
+   * One value and not three, and that is the fix rather than a tidy-up.
    * `layOutGantt` refuses a payload whose slices name a step or a person it has
    * not got, which is exactly what this client held while the slices came from
    * `tree()` and the steps and names came from `steps()` and `listPeople()`:
    * four requests, four moments, and a peer deleting a step in between left a
-   * chart that threw. Held together, they cannot disagree — there is no setter
-   * that can move one without the others.
+   * chart that threw. Derived from one delivered tree, they cannot disagree.
    *
    * The separate reads stay for what they are actually about: {@link steps}
    * heads the estimate columns and the steps dialog edits it, and
    * {@link people} is who the assignee picker can offer.
    */
-  const [chartRead, setChartRead] = useState<ChartRead>(NO_CHART_READ);
+  const chartRead = useMemo<ChartRead>(
+    () =>
+      // On the same read as the rows and behind the same generation check: a
+      // superseded read must not leave its slices under another read's rows.
+      // Proof: written as `setSlices((current) => current.length === 0 ?
+      // tree.slices : current)` — the refetch leaving the slices where the first
+      // read put them — and `replaces the slices on every refetch, as it replaces
+      // the rows` failed on `expected '2' to be '1'`: a second row on screen with
+      // the one-row plan's slices still behind it; watched 2026-08-09.
+      tree === null
+        ? NO_CHART_READ
+        : {
+            slices: tree.value.slices,
+            steps: tree.value.steps,
+            people: tree.value.assignedPeople,
+            depReach: tree.value.depReach,
+            pertWeights: tree.value.pertWeights,
+            estimateRounding: tree.value.estimateRounding,
+            ...(tree.value.optimization === undefined
+              ? {}
+              : { optimization: tree.value.optimization }),
+            generation: tree.generation,
+          },
+    [tree],
+  );

-  const [steps, setSteps] = useState<StepView[]>([]);
+  const steps = delivered.steps;

   /**
    * Whether the last refetch failed, leaving the tree on screen possibly
@@ -289,19 +330,27 @@ export function usePlanReadState({ projectId }: { projectId: string }) {
    * tell are worse than an empty table. Cleared by any refresh that lands —
    * the retry button's, an edit's, or a peer's change event.
    */
-  const [treeMayBeStale, setTreeMayBeStale] = useState(false);
-  const [treeFailureText, setTreeFailureText] = useState<string | null>(null);
+  const treeMayBeStale = delivered.staleResources.length > 0;
+  const treeFailure = delivered.treeFailure;
+  // Proof: suppressing this failure text left the peer-refetch window on
+  // “the last refresh failed”, expected the named optimizer-unavailable
+  // message while the previously installed plan stayed on screen.
+  const treeFailureText = useMemo(
+    () => (treeFailure === null ? null : refusalSentence(treeFailure.cause)),
+    [treeFailure],
+  );

-  const [ports] = useState(openProjectPorts);
   // Selected, never set here: the gestures raise and lower it through `busyWrites`.
   const busy = useSyncExternalStore(ports.busy.subscribe, ports.busy.snapshot);
   const busyWrites: BusyWrites = ports.busy;

-  const [connected, setConnected] = useState(true);
+  const connected = delivered.connected;

-  const [scheduleError, setScheduleError] = useState<'calendar_range' | 'cycle' | null>(null);
+  const scheduleError = tree === null ? null : tree.value.scheduleError;

-  const [estimateMethod, setEstimateMethod] = useState<EstimateMethod>('pert');
+  // Proof: renaming the shared response field to `planningMethod` made this
+  // production screen fail with TS2339: `estimateMethod` does not exist on PlanRead.
+  const estimateMethod: EstimateMethod = tree === null ? 'pert' : tree.value.estimateMethod;

   /**
    * Whether this reader has anything to undo or redo, as of the last tree read.
@@ -312,42 +361,31 @@ export function usePlanReadState({ projectId }: { projectId: string }) {
    * would be a second answer to a question that has one, and it would be wrong
    * in exactly the cases that matter.
    */
-  const [stack, setStack] = useState({ undoable: false, redoable: false });
+  const stack = useMemo(
+    () =>
+      tree === null
+        ? { undoable: false, redoable: false }
+        : { undoable: tree.value.undoable, redoable: tree.value.redoable },
+    [tree],
+  );

   /** The project's start date, or null while the plan is not on a calendar. */
-  const [startDate, setStartDate] = useState<string | null>(null);
+  const startDate = tree === null ? null : tree.value.startDate;

   /**
-   * The global directory: every team and every person on this deployment.
+   * The global directory: every team and every person on this deployment, the
+   * tag and service vocabularies, the work item types and the external systems.
    *
    * Global rather than per project — Dany's ask — so it is loaded once beside
-   * the tree rather than filtered by anything.
+   * the tree rather than filtered by anything. The services label the third
+   * dimension's facet and its cell picker; a facet that offers ids instead of
+   * names is a filter nobody can aim. The external systems are loaded with the
+   * others and never added to: be-01 seeds them with exactly the names
+   * `systemOfUrl` can answer and offers no create, so a page that has read them
+   * once has read all of them.
    */
-  const [teams, setTeams] = useState<TeamView[]>([]);
-
-  /** The global tag vocabulary, for the facet's labels and the cell's picker. */
-  const [tags, setTags] = useState<TagView[]>([]);
-
-  /**
-   * The global service vocabulary, for the third dimension's facet labels and —
-   * from task 7.1 — its cell picker.
-   *
-   * Beside the tags and loaded on the same read for the same reason: a facet
-   * that offers ids instead of names is a filter nobody can aim.
-   */
-  const [services, setServices] = useState<ServiceView[]>([]);
-
-  const [workItemTypes, setWorkItemTypes] = useState<WorkItemTypeView[]>([]);
-
-  /**
-   * The external-system vocabulary, for the ref marks' names and the editor's
-   * picker.
-   *
-   * Loaded with the other four and never added to: be-01 seeds this one with
-   * exactly the names `systemOfUrl` can answer and offers no create, so a page
-   * that has read it once has read all of it.
-   */
-  const [externalSystems, setExternalSystems] = useState<ExternalSystemView[]>([]);
+  const directory = useMemo(() => delivered.directory ?? emptyDirectory(), [delivered.directory]);
+  const { teams, tags, services, workItemTypes, externalSystems, people } = directory;

   /**
    * How many of each team this plan may have at work at once, as be-01 sent it
@@ -357,7 +395,7 @@ export function usePlanReadState({ projectId }: { projectId: string }) {
    * computed from these numbers, and a separately-fetched capacity could put a
    * number beside bars it does not explain. `wbs-api.ts` has the argument.
    */
-  const [teamCapacities, setTeamCapacities] = useState<TeamCapacityView[]>([]);
+  const teamCapacities = useMemo(() => (tree === null ? [] : tree.value.teamCapacities), [tree]);

   /**
    * What this plan calls its priority numbers — five rungs, most important first.
@@ -369,69 +407,46 @@ export function usePlanReadState({ projectId }: { projectId: string }) {
    * answer for a plan nobody has configured, so this is empty only before the
    * first read has landed — which is the same moment the rows are empty.
    */
-  const [priorityBands, setPriorityBands] = useState<PriorityBandView[]>([]);
+  const priorityBands = useMemo(() => (tree === null ? [] : tree.value.priorityBands), [tree]);

-  const [people, setPeople] = useState<PersonView[]>([]);
   /**
    * The calendar markers on this project — the list `GanttPanel` draws.
    *
-   * **Its own state off its own read**, and not a member of `chartRead`, which
+   * **Its own member off its own read**, and not a member of `chartRead`, which
    * is `ProjectApi.listCalendarMarkers`'s own argument turned around: a marker
    * moves nothing in the schedule (task 4, axis-1), so folding it into the plan
    * would make every marker write a full tree reread and every tree reread
-   * carry markers the table never looks at.
-   *
-   * The panel reports its four writes upward rather than performing them
-   * ({@link GanttProps.onRenameMarker}) precisely so that this component — the
-   * owner of the list — is the single place where a write and the redraw after
-   * it can agree. Everything below is that owner.
+   * carry markers the table never looks at. The delivered plan keeps the same
+   * array until a new one arrives, so `GanttPanel`'s memo on it holds.
    */
-  const [markers, setMarkers] = useState<readonly CalendarMarkerView[]>(NO_MARKERS);
+  const markers = delivered.markers;
   return {
+    plan: ports.plan,
     markers,
-    setMarkers,
     activeProject,
     workItems,
-    setWorkItems,
     treeReadProject,
     chartRead,
-    setChartRead,
     steps,
-    setSteps,
     treeMayBeStale,
-    setTreeMayBeStale,
     treeFailureText,
-    setTreeFailureText,
     busy,
     busyWrites,
     refusals: ports.refusals,
     commandsIssued: ports.commandsIssued,
     connected,
-    setConnected,
     scheduleError,
-    setScheduleError,
     estimateMethod,
-    setEstimateMethod,
     stack,
-    setStack,
     startDate,
-    setStartDate,
     teams,
-    setTeams,
     tags,
-    setTags,
     services,
-    setServices,
     workItemTypes,
-    setWorkItemTypes,
     externalSystems,
-    setExternalSystems,
     teamCapacities,
-    setTeamCapacities,
     priorityBands,
-    setPriorityBands,
     people,
-    setPeople,
   };
 }

@@ -449,30 +464,12 @@ export function usePlanRead({
   projectId,
   activeProject,
   api,
-  setTreeMayBeStale,
-  setTreeFailureText,
-  setMarkers,
-  setTeams,
-  setTags,
-  setServices,
-  setWorkItemTypes,
-  setExternalSystems,
-  setPeople,
-  setWorkItems,
+  plan,
   treeReadProject,
   rowPlacements,
   cellCards,
-  setChartRead,
-  setStack,
-  setTeamCapacities,
-  setPriorityBands,
-  setScheduleError,
-  setEstimateMethod,
-  setStartDate,
-  setSteps,
   pushToast,
   subscribe,
-  setConnected,
   focusIntent,
   busyWrites,
   refusals,
@@ -482,34 +479,14 @@ export function usePlanRead({
   projectId: string;
   activeProject: React.RefObject<string>;
   api: ProjectApi;
-  setTreeMayBeStale: React.Dispatch<React.SetStateAction<boolean>>;
-  setTreeFailureText: React.Dispatch<React.SetStateAction<string | null>>;
-  setMarkers: React.Dispatch<React.SetStateAction<readonly CalendarMarkerView[]>>;
-  setTeams: React.Dispatch<React.SetStateAction<TeamView[]>>;
-  setTags: React.Dispatch<React.SetStateAction<TagView[]>>;
-  setServices: React.Dispatch<React.SetStateAction<ServiceView[]>>;
-  setWorkItemTypes: React.Dispatch<React.SetStateAction<WorkItemTypeView[]>>;
-  setExternalSystems: React.Dispatch<React.SetStateAction<ExternalSystemView[]>>;
-  setPeople: React.Dispatch<React.SetStateAction<PersonView[]>>;
-  setWorkItems: React.Dispatch<React.SetStateAction<TreeRow[]>>;
+  plan: DeliveredPlanStore;
   treeReadProject: React.RefObject<string | null>;
   rowPlacements: React.RefObject<ReadonlyMap<string, string>>;
   cellCards: CellCards;
-  setChartRead: React.Dispatch<React.SetStateAction<ChartRead>>;
-  setStack: React.Dispatch<React.SetStateAction<{ undoable: boolean; redoable: boolean }>>;
-  setTeamCapacities: React.Dispatch<React.SetStateAction<TeamCapacityView[]>>;
-  setPriorityBands: React.Dispatch<React.SetStateAction<PriorityBandView[]>>;
-  setScheduleError: React.Dispatch<React.SetStateAction<'calendar_range' | 'cycle' | null>>;
-  setEstimateMethod: React.Dispatch<
-    React.SetStateAction<'pert' | 'optimistic' | 'realistic' | 'pessimistic'>
-  >;
-  setStartDate: React.Dispatch<React.SetStateAction<string | null>>;
-  setSteps: React.Dispatch<React.SetStateAction<StepView[]>>;
   pushToast: (toast: Toast) => void;
   subscribe:
     | ((projectId: string, handlers: SubscriptionHandlers, baseline: number) => ProjectStream)
     | undefined;
-  setConnected: React.Dispatch<React.SetStateAction<boolean>>;
   focusIntent: React.RefObject<FocusIntent>;
   busyWrites: BusyWrites;
   refusals: Channel<PlanRefusal>;
@@ -559,7 +536,7 @@ export function usePlanRead({
    * The drafts sanitizer returns the object it was given when nothing changed.
    * `drafts` is not one of `columns`' dependencies, so this is about not
    * re-rendering every cell rather than about remounting them — but the rule is
-   * the same one `sameSteps` keeps one line above, and stating it twice is
+   * the same one the delivered plan's `sameSteps` keeps, and stating it twice is
    * cheaper than the two of them drifting.
    *
    * A step change **does** cost the focus, and that is the accepted trade: the
@@ -594,28 +571,20 @@ export function usePlanRead({
     [setDrafts],
   );

-  const publishPlan = useCallback(
-    (delivery: PlanFeedDelivery) => {
-      setTreeMayBeStale(delivery.staleResources.length > 0);
-      // Proof: suppressing this failure text left the peer-refetch window on
-      // “the last refresh failed”, expected the named optimizer-unavailable
-      // message while the previously installed plan stayed on screen.
-      setTreeFailureText(
-        delivery.treeFailure === null ? null : refusalSentence(delivery.treeFailure.cause),
-      );
-      if (delivery.directory !== null) {
-        const vocabulary = delivery.directory;
-        setTeams(vocabulary.teams);
-        setTags(vocabulary.tags);
-        setServices(vocabulary.services);
-        setWorkItemTypes(vocabulary.workItemTypes);
-        setExternalSystems(vocabulary.externalSystems);
-        setPeople(vocabulary.people);
-      }
-      if (delivery.tree !== null) {
-        const tree = delivery.tree.value;
-        const drawn = toTree(tree.workItems);
-        setWorkItems(drawn);
+  /**
+   * What a publication changes on screen beyond the values selected from it,
+   * run inside the delivered plan's own notification — the pass the change was
+   * made in, before the table renders it.
+   *
+   * Two settlings, each keyed on its member changing: a new tree records whose
+   * tree it is and settles the open hover card against the rows that just
+   * arrived; a new step list drops what only the gone steps held. A step list
+   * that came back the same is kept as the same array by the delivered plan, so
+   * it settles nothing, exactly as it rebuilt nothing before.
+   */
+  const settle = useCallback(
+    (next: DeliveredPlan, previous: DeliveredPlan) => {
+      if (next.tree !== null && next.tree !== previous.tree) {
         treeReadProject.current = projectId;
         // The open hover card, settled against the rows that just arrived. The
         // previous placements are read into a local **before** the ref is replaced:
@@ -625,75 +594,16 @@ export function usePlanRead({
         // Proof: this pair deleted, `closes the card when a peer moves the row it
         // is anchored to` failed on `expected <div role="tooltip" …/> to be null`.
         // Watched, 2026-08-09.
-        const placements = placementsOf(drawn);
+        const placements = placementsOf(rowsOf(next.tree));
         const wasPlaced = rowPlacements.current;
         rowPlacements.current = placements;
         cellCards.updateHovered((open) => hoveredCellAfterRefresh(open, wasPlaced, placements));
-        // On the same read as the rows and behind the same generation check: a
-        // superseded read must not leave its slices under another read's rows.
-        // Proof: written as `setSlices((current) => current.length === 0 ?
-        // tree.slices : current)` — the refetch leaving the slices where the first
-        // read put them — and `replaces the slices on every refetch, as it replaces
-        // the rows` failed on `expected '2' to be '1'`: a second row on screen with
-        // the one-row plan's slices still behind it; watched 2026-08-09.
-        //
-        // One call, so the chart's three parts can only ever be one payload's. The
-        // steps and the names come from `tree` and **not** from `loadedSteps` or
-        // `loadedPeople` below: those are three more requests, and a peer's step
-        // delete landing between them is what used to hand `layOutGantt` a slice
-        // under a step the plan no longer listed.
-        setChartRead({
-          slices: tree.slices,
-          steps: tree.steps,
-          people: tree.assignedPeople,
-          depReach: tree.depReach,
-          pertWeights: tree.pertWeights,
-          estimateRounding: tree.estimateRounding,
-          ...(tree.optimization === undefined ? {} : { optimization: tree.optimization }),
-          generation: delivery.tree.generation,
-        });
-        setStack({ undoable: tree.undoable, redoable: tree.redoable });
-        setTeamCapacities(tree.teamCapacities);
-        setPriorityBands(tree.priorityBands);
-        setScheduleError(tree.scheduleError);
-        // Proof: renaming the shared response field to `planningMethod` made this
-        // production screen fail with TS2339: `estimateMethod` does not exist on PlanRead.
-        setEstimateMethod(tree.estimateMethod);
-        setStartDate(tree.startDate);
-      }
-      if (delivery.steps !== null) {
-        const loadedSteps = delivery.steps;
-        setSteps((current) => (sameSteps(current, loadedSteps) ? current : [...loadedSteps]));
-        settleAgainstSteps(loadedSteps);
       }
-      if (delivery.markers !== null) setMarkers(delivery.markers);
+      if (next.steps !== previous.steps) settleAgainstSteps(next.steps);
     },
-    [
-      projectId,
-      rowPlacements,
-      setChartRead,
-      setEstimateMethod,
-      setExternalSystems,
-      cellCards,
-      setPeople,
-      setPriorityBands,
-      setScheduleError,
-      setServices,
-      setStack,
-      setStartDate,
-      setSteps,
-      setTags,
-      setTeamCapacities,
-      setTeams,
-      setTreeFailureText,
-      setTreeMayBeStale,
-      setWorkItemTypes,
-      setWorkItems,
-      settleAgainstSteps,
-      treeReadProject,
-      setMarkers,
-    ],
+    [cellCards, projectId, rowPlacements, settleAgainstSteps, treeReadProject],
   );
+  useSnapshotChanges(plan, settle);

   /**
    * This reader's feed: one project, one API, one refresh owner, one stream.
@@ -710,16 +620,15 @@ export function usePlanRead({
       api,
       subscribe,
       isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
-      publish: publishPlan,
+      plan,
       refusals,
-      setConnected,
     });
     feedRef.current = feed;
     return () => {
       if (feedRef.current === feed) feedRef.current = null;
       feed.close();
     };
-  }, [activeProject, api, projectId, publishPlan, refusals, setConnected, subscribe]);
+  }, [activeProject, api, plan, projectId, refusals, subscribe]);

   /** Awaits this invalidation's covering outcome; failures remain in the owner snapshot. */
   const refreshResourcesOrMarkStale = useCallback(
@@ -919,10 +828,3 @@ export function hoveredCellAfterRefresh(
   const placed = now.get(rowOfCellKey(open));
   return placed !== undefined && placed === was.get(rowOfCellKey(open)) ? open : null;
 }
-
-/** Whether two step lists say the same thing, so an equal one can be discarded. */
-export function sameSteps(a: readonly StepView[], b: readonly StepView[]): boolean {
-  return (
-    a.length === b.length && a.every((step, i) => step.id === b[i]?.id && step.name === b[i]?.name)
-  );
-}
diff --git a/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
new file mode 100644
index 00000000..c106335b
--- /dev/null
+++ b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
@@ -0,0 +1,52 @@
+import { useLayoutEffect, useRef } from 'react';
+
+import type { Store } from '@/modules/store';
+
+/**
+ * Calls `onChange` once for every change of a store's snapshot, with the
+ * snapshot it replaced, for as long as the component is mounted.
+ *
+ * For the presentation a change **causes** rather than the value it shows — the
+ * table's hover card settled against rows that moved, drafts dropped for a step
+ * that went. The value itself is selected with `useSyncExternalStore`; this is
+ * the side effect, run synchronously inside the store's own notification, which
+ * is the same pass the change was made in.
+ *
+ * The four things it keeps, each an example test in
+ * `use-snapshot-changes.test.tsx`:
+ *
+ * - **Nothing missed between the render and the subscription.** The last
+ *   snapshot handed on is remembered across subscriptions, and a subscription
+ *   first catches up with any change made since — a child's layout effect runs
+ *   before this one does.
+ * - **Nothing twice.** A notification whose snapshot is the one already handed
+ *   on calls nothing.
+ * - **The callback of the latest render**, read through a ref, so a superseded
+ *   callback is never called and a new identity costs no resubscription.
+ * - **One subscription per store.** A store replaced while mounted is left, and
+ *   its replacement's snapshot is a change; unmounting leaves it.
+ *
+ * It never catches: `onChange`'s failure reaches whoever changed the store.
+ */
+export function useSnapshotChanges<T>(
+  store: Store<T>,
+  onChange: (next: T, previous: T) => void,
+): void {
+  const latest = useRef(onChange);
+  const handedOn = useRef(store.snapshot());
+  useLayoutEffect(() => {
+    latest.current = onChange;
+  });
+  useLayoutEffect(() => {
+    const catchUp = (): void => {
+      const next = store.snapshot();
+      const previous = handedOn.current;
+      if (next === previous) return;
+      handedOn.current = next;
+      latest.current(next, previous);
+    };
+    const unsubscribe = store.subscribe(catchUp);
+    catchUp();
+    return unsubscribe;
+  }, [store]);
+}
diff --git a/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx b/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
index 474bccde..0bbe00c9 100644
--- a/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
@@ -622,50 +622,32 @@ export function WbsTable({
 }: WbsTableProps) {
   const today = useToday();
   const {
+    plan,
     activeProject,
     workItems,
-    setWorkItems,
     treeReadProject,
     chartRead,
-    setChartRead,
     steps,
-    setSteps,
     treeMayBeStale,
-    setTreeMayBeStale,
     treeFailureText,
-    setTreeFailureText,
     markers,
-    setMarkers,
     busy,
     busyWrites,
     refusals,
     commandsIssued,
     connected,
-    setConnected,
     scheduleError,
-    setScheduleError,
     estimateMethod,
-    setEstimateMethod,
     stack,
-    setStack,
     startDate,
-    setStartDate,
     teams,
-    setTeams,
     tags,
-    setTags,
     services,
-    setServices,
     workItemTypes,
-    setWorkItemTypes,
     externalSystems,
-    setExternalSystems,
     teamCapacities,
-    setTeamCapacities,
     priorityBands,
-    setPriorityBands,
     people,
-    setPeople,
   } = usePlanReadState({ projectId });
   const {
     expanded,
@@ -956,30 +938,12 @@ export function WbsTable({
     projectId,
     activeProject,
     api,
-    setTreeMayBeStale,
-    setTreeFailureText,
-    setMarkers,
-    setTeams,
-    setTags,
-    setServices,
-    setWorkItemTypes,
-    setExternalSystems,
-    setPeople,
-    setWorkItems,
+    plan,
     treeReadProject,
     rowPlacements,
     cellCards,
-    setChartRead,
-    setStack,
-    setTeamCapacities,
-    setPriorityBands,
-    setScheduleError,
-    setEstimateMethod,
-    setStartDate,
-    setSteps,
     pushToast,
     subscribe,
-    setConnected,
     focusIntent,
     busyWrites,
     refusals,
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/composition.ts b/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
index 8779e846..1db2b4a0 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
@@ -3,12 +3,8 @@ import type { ProjectStream } from '@/lib/project-stream';
 import type { ProjectApi } from '@/lib/wbs-api';
 import type { Publisher } from '@/modules/channel';

-import type {
-  PlanFeed,
-  PlanFeedDelivery,
-  PlanFeedRefusal,
-  PlanFeedStreamHandlers,
-} from './contract';
+import type { PlanFeed, PlanFeedRefusal, PlanFeedStreamHandlers } from './contract';
+import type { DeliveredPlanWrites } from './delivered-plan-store';
 import { createPlanFeed } from './plan-feed.feature';

 /** What a screen hands the composition site: its identity and where its answers go. */
@@ -19,10 +15,10 @@ export interface PlanFeedForReader {
     | ((projectId: string, handlers: PlanFeedStreamHandlers, baseline: number) => ProjectStream)
     | undefined;
   readonly isActiveReader: () => boolean;
-  readonly publish: (delivery: PlanFeedDelivery) => void;
+  /** The reader's delivered plan: every publication and connection report is written here. */
+  readonly plan: DeliveredPlanWrites;
   /** Where a refusal of the first read is announced; the words are the listener's. */
   readonly refusals: Publisher<PlanFeedRefusal>;
-  readonly setConnected: (connected: boolean) => void;
 }

 /**
@@ -40,9 +36,8 @@ export function planFeedForReader({
   api,
   subscribe,
   isActiveReader,
-  publish,
+  plan,
   refusals,
-  setConnected,
 }: PlanFeedForReader): PlanFeed {
   return createPlanFeed({
     openOwner: () => createPlanRefresh({ projectId, api }),
@@ -51,8 +46,8 @@ export function planFeedForReader({
         ? null
         : (handlers, baseline) => subscribe(projectId, handlers, baseline),
     isActiveReader,
-    publish,
+    publish: plan.deliver,
     announceRefusal: refusals.publish,
-    setConnected,
+    setConnected: plan.reportConnection,
   });
 }
```

### 7.13 `spec.md` — slice 5, the scenario for presence

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index ce129801..42e7a205 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -386,3 +386,9 @@ stores and listen to the channels, and what a reader sees SHALL NOT change.
   the table has rendered and before its effects have run
 - **THEN** the table draws the delivered values, and the hover card and the drafts
   are settled against the rows and steps that changed, once per change
+
+#### Scenario: The header selects presence from a store
+
+- **WHEN** the project's stream reports who is here or whether it is connected
+- **THEN** the page's presence store holds it and the header's presence slot is
+  handed it, starting from nobody and disconnected
```

### 7.14 `src/components/wbs/project-page.test.tsx` — slice 5, one new example

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
index 11de2b96..e11f44e9 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
@@ -3,6 +3,7 @@ import type { PlanDocumentRequest } from '@wbs/contracts';
 import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

+import type { ProjectStreamDeps, SocketHandlers } from '@/lib/project-stream';
 import type {
   SavedPlanCompareReply,
   SavedPlanListEntryView,
@@ -939,6 +940,58 @@ describe('the header bar', () => {
     expect(asked.at(-1)?.users).toEqual([]);
   });

+  itDom(
+    'hands the presence slot who the project’s stream says is here, and its connection',
+    async () => {
+      let opened: SocketHandlers | null = null;
+      const streamDeps: ProjectStreamDeps = {
+        openSocket: (_url, handlers) => {
+          opened = handlers;
+          return { send: () => undefined, close: () => undefined };
+        },
+        schedule: () => 0,
+        cancel: () => undefined,
+        random: () => 0,
+      };
+      const asked: { users: readonly string[]; connected: boolean }[] = [];
+      render(
+        <ProjectPage
+          token="t"
+          api={fakeProjects(TWO)}
+          streamDeps={streamDeps}
+          presence={(roster) => {
+            asked.push(roster);
+            return null;
+          }}
+        />,
+      );
+      await selectProject('p2');
+      await waitFor(() => {
+        expect(opened).not.toBeNull();
+      });
+      const socket = (): SocketHandlers => {
+        if (opened === null) throw new Error('the page never opened a socket');
+        return opened;
+      };
+
+      act(() => {
+        socket().onOpen();
+        socket().onMessage(JSON.stringify({ type: 'presence', users: ['kat', 'lee'] }));
+      });
+      expect(asked.at(-1)).toEqual({ users: ['kat', 'lee'], connected: false });
+
+      act(() => {
+        socket().onMessage(JSON.stringify({ type: 'resume_ack', replayed: { 'project:p2': 0 } }));
+      });
+      expect(asked.at(-1)).toEqual({ users: ['kat', 'lee'], connected: true });
+
+      act(() => {
+        socket().onClose();
+      });
+      expect(asked.at(-1)).toEqual({ users: ['kat', 'lee'], connected: false });
+    },
+  );
+
   itDom('leaves the table out of the banner and in the page’s main', async () => {
     pageWith(fakeProjects(TWO));
     await selectProject('p2');
```

### 7.15 `src/components/wbs/project-page.tsx` — slice 5

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index 26779fe3..fe5d9931 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -7,6 +7,7 @@ import {
   useMemo,
   useRef,
   useState,
+  useSyncExternalStore,
 } from 'react';

 import { AppHeader } from '@/components/chrome/app-header';
@@ -17,6 +18,7 @@ import { type ProjectStreamDeps, subscribeToProject } from '@/lib/project-stream
 import type { Recalled } from '@/lib/remembered';
 import { cn } from '@/lib/utils';
 import { httpProjectApi, type ProjectApi, type ProjectListEntry } from '@/lib/wbs-api';
+import { createPresence } from '@/modules/plan-feed/presence-store';
 import {
   type ApplicationServicesState,
   useApplicationServicesReader,
@@ -500,11 +502,16 @@ export function ProjectPage({
    * opens the stream (it is the thing that has to refetch), so the roster
    * arrives through the factory below rather than from a socket of the header's
    * own.
+   *
+   * A plain store the stream writes into and the header selects from, so the
+   * factory is handed no React setter. One per page mount, exactly as the state
+   * it replaces was — it is **not** reset when the selection changes, and that
+   * is kept deliberately: which lifetime resets it is the project runtime's
+   * decision (OpenSpec tasks 10 and 11), not this packet's. A lazy initializer
+   * is safe because the store holds no resource.
    */
-  const [roster, setRoster] = useState<Roster>({
-    users: [],
-    connected: false,
-  });
+  const [projectPresence] = useState(createPresence);
+  const roster: Roster = useSyncExternalStore(projectPresence.subscribe, projectPresence.snapshot);
   const subscribe = useMemo(
     () => (projectId: string, handlers: SubscriptionHandlers, baseline: number) =>
       subscribeToProject(
@@ -518,16 +525,14 @@ export function ProjectPage({
           hasBaseline: true,
           onChange: handlers.onChange,
           onConnectionChange: (connected) => {
-            setRoster((current) => ({ ...current, connected }));
+            projectPresence.reportConnection(connected);
             handlers.onConnectionChange(connected);
           },
-          onPresence: (users) => {
-            setRoster((current) => ({ ...current, users }));
-          },
+          onPresence: projectPresence.reportUsers,
         },
         streamDeps,
       ),
-    [streamDeps],
+    [projectPresence, streamDeps],
   );

   /**
```

### 7.16 `src/modules/plan-feed/README.md` and `src/modules/plan-writer/README.md` — slice 5

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/README.md b/apps/wbs/fe-01/src/modules/plan-feed/README.md
index ecab80cd..44e4cfad 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/README.md
+++ b/apps/wbs/fe-01/src/modules/plan-feed/README.md
@@ -15,6 +15,15 @@ contract in `apps/wbs/fe-01/src/modules/store.ts`, which is rule F2.
   reader owns it, which is what a screen asks for and the only thing delivery may import (rule
   K2).
 - `composition.ts` is where the refresh owner's factory and the feature meet. A screen calls it.
+- `delivered-plan-store.ts` is the **store** the feed publishes into: every publication folded
+  into the one snapshot a screen selects from, with the connection the stream last reported.
+- `presence-store.ts` is the **store** of who else has the project open and whether the socket
+  saying so is up. The page owns it today and the project's stream writes into it.
+
+Both stores are plain TypeScript over `modules/channel.ts`, keep their snapshot the same object
+until a member changes, tell each listener once per change, and never throw a lifecycle refusal.
+Their model tests, `delivered-plan-store.model.test.ts` and `presence-store.model.test.ts`, run
+them against reference models under scheduler-ordered deliveries and re-entrant listeners.

 ## What the resource owns

@@ -46,11 +55,13 @@ renders the header.
 ## How it is read

 Two ways, over one source of truth. The store contract — `subscribe` and `snapshot`, the refresh
-owner's own, whose snapshot object is rebuilt only when something in it changed — is what any
-future reader selects from. Beside it, the host is handed a **delivery**: what changed since the
-last publication, computed from that same snapshot and the generations already applied. Today's
-reader is twenty React states and two refs mutated in one pass, so it takes the delta; turning it
-into a selected snapshot is the lifetimes task of the rollout plan, not an extraction.
+owner's own, whose snapshot object is rebuilt only when something in it changed — is the feed's
+own. Beside it, each publication is a **delivery**: what changed since the last one, computed
+from that same snapshot and the generations already applied. The composition writes every
+delivery into the reader's delivered plan, and the table selects from that store with
+`useSyncExternalStore`; nothing the feed is built with is a React setter. What a delivery settles
+beyond the values on screen — the hover card, drafts for a step that went — the table does from
+the delivered plan's own notification.

 ## Relationships

@@ -59,11 +70,13 @@ through it yet, which is the rollout's lifetimes task, so `composition.ts` is a
 `modules/directory-management/composition.ts` is. Its one caller today is
 `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, which also wires this feed to the plan writer
 module beside it: the writer compares the owner's identity and sends its rereads back through the
-hook.
+hook. The same hook builds the delivered plan once per table mount, and `project-page.tsx` builds
+the presence store once per page mount; the project runtime of OpenSpec task 10 builds both
+instead.

 ## Checks

 The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suites are
-`plan-feed.resource.test.ts` and `plan-feed.feature.test.ts`. The behaviour this extraction
+`plan-feed.resource.test.ts`, `plan-feed.feature.test.ts` and the two store model tests. The behaviour this extraction
 preserves is proved by the plan table's and the project page's own suites, which run in the `test`
 target of the same project.
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/README.md b/apps/wbs/fe-01/src/modules/plan-writer/README.md
index b96c3b4e..701064f2 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/README.md
+++ b/apps/wbs/fe-01/src/modules/plan-writer/README.md
@@ -15,7 +15,11 @@ handed, and it holds no transport of its own.
   failure is ambiguous, when the target has gone, or when be-01 could not read the request.
 - Whether the gesture still belongs to the reader on screen, at each of the three moments that
   question has a different answer.
-- Raising and clearing the shared busy state, and the outcome the caller acts on.
+- Raising and clearing the shared busy state, and the outcome the caller acts on. The state
+  itself is `busy-store.ts`, a plain store the table selects from; the writer is handed only its
+  `raise` and `lower`, and lowers only while its reader is still on screen.
+- Saying that a command was issued, and announcing a refusal, each through a `Publisher` of a
+  project channel (`modules/channel.ts`). The table listens; the writer never learns who does.

 ## What it does not own

@@ -25,12 +29,13 @@ work item 040.4.

 ## Relationships

-The exported types are in `contract.ts`; the service is `plan-writer.feature.ts`. There is no
+The exported types are in `contract.ts`; the service is `plan-writer.feature.ts`; the busy store is
+`busy-store.ts`. There is no
 `module.ts` yet: DI Bag is not installed, so the host builds the service with a plain factory
 call. Its one host today is `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`.

 ## Checks

 The applicable check is the `test:unit` target declared in `apps/wbs/fe-01/project.json`; the
-module's own suite is `plan-writer.test.ts`. The behaviour this extraction preserves is proved by
+module's own suites are `plan-writer.test.ts` and `busy-store.model.test.ts`. The behaviour this extraction preserves is proved by
 the plan table's own suites, which run in the `test` target of the same project.
```

### 7.17 `openspec/changes/adopt-frontend-lifetimes/tasks.md` — slice 5, task 8 ticked

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/tasks.md b/openspec/changes/adopt-frontend-lifetimes/tasks.md
index fc9f246e..a9f9ba2d 100644
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -73,9 +73,21 @@
       module; the router instance and address survive a same-session update.
 - [ ] 7. Log out is a coordinated local exit: no request, project then session
       retirement, and the fatal state when either fails.
-- [ ] 8. The project prerequisites: plan snapshot, connection, roster and busy
+- [x] 8. The project prerequisites: plan snapshot, connection, roster and busy
       state move into project-owned stores, and the command register and refusal
       publication move behind narrow ports.
+      Closed by 050-7-g, observed <observed-date>: the plan snapshot and the
+      connection are `modules/plan-feed/delivered-plan-store.ts`, the roster is
+      `presence-store.ts` beside it, and busy is
+      `modules/plan-writer/busy-store.ts`; a command issued and a refusal are
+      `modules/channel.ts` channels the table listens to. `PlanFeedForReader` and
+      `PlanWriterHost` take those stores and ports and no React setter, ref or
+      toast function, and the table and the page select from the stores. Each is
+      still built by the mount that owned the state it replaced — the table's for
+      the delivered plan, busy and the channels, the page's for presence, which is
+      therefore not reset by a project switch, exactly as before — until task 10's
+      project runtime builds them; the feed's owner reads and the broad
+      `ProjectApi` are tasks 9 and 10's.
 - [ ] 9. The broad project API moves behind the plan and command modules' private
       repository ports.
 - [ ] 10. The project runtime owns feed, writer, markers and saved plans for one
```

## 8. Proofs

Every fault below was injected for real in the planner's rehearsal on 2026-09-24, on that slice's own
committed tree (`s5`-group faults on the final tree): its named test watched failing, the file restored,
before the next fault. The executor repeats each one and writes the adjacent `Proof:` comment **only
after observing its own failure**, dated with its own observed date (`date -u +%F`) — never
2026-09-24, never before the observation. Each slice runs **all** of its faults first and writes its
comments afterwards, so every fault patch below still applies.

**Where the comments may go.** A comment is written only into a file no later slice's patch touches:
`use-plan-read.ts` and `composition.ts` are patched by slices 3 and 4, so none of slice 3's faults
sits in them — the ports' production-path faults run in slice 4 (`s1`–`s5`, `f1`) and slice 5 (`t1`–`t3`,
`m1`), when those files are final. Slice 5's four faults in `use-plan-read.ts` are rehearsed against
the file **without** slice 4's comments; their patches still apply after slice 4's comments are in,
because every slice-4 comment site (`treeFailureText`, `settle`) is more than twenty lines from every
slice-5 fault's context (the refusal and command listeners, the markers memo), and `git apply`
tolerates the line offset.

**Each slice's faults are records of four lines** — id, file (from the repository root), suite (from
`apps/wbs/fe-01`) and the exact `-t` pattern — in the first `text` block of that slice's subsection.
Vitest's `-t` is a **regular expression**: the one title with a `+` in it is recorded with the `+`
escaped (`t2`). Extract the records from this document rather than retyping them, so the titles keep
their typographic apostrophes byte for byte:

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-g-project-prerequisites.md
section=8.1 # this slice's subsection: 8.1 for slice 1 … 8.5 for slice 5
test -f "$packet"
awk -v want="### $section " '
  index($0, want) == 1 { s=1; next }
  s && /^```text$/ { c=1; next }
  c && /^```$/ { exit }
  c { print }
' "$packet" > "$TMPDIR/proofs.txt"
test -s "$TMPDIR/proofs.txt"
test $(( $(wc -l < "$TMPDIR/proofs.txt") % 4 )) -eq 0
wc -l < "$TMPDIR/proofs.txt"
````

Expected: 36 lines for slice 1, 36 for slice 2, 28 for slice 3, 44 for slice 4 and 24 for slice 5.

**First, prove every filter selects exactly one test**, before injecting anything:

```sh
set -euo pipefail
cd apps/wbs/fe-01
while IFS= read -r id && IFS= read -r file && IFS= read -r suite && IFS= read -r title; do
  out=$(TZ=UTC bunx vitest run "$suite" -t "$title" --reporter=verbose 2>&1 < /dev/null)
  # grep -c prints 0 and exits 1 when nothing matched; any other status is an error.
  if n=$(grep -cE '^ +✓ ' <<< "$out"); then :; else rc=$?; test "$rc" -eq 1; fi
  printf '%s %s matched | %s\n' "$id" "$n" "$title"
  test "$n" -eq 1
done < "$TMPDIR/proofs.txt"
```

Expected: one line per fault, each reading `<id> 1 matched`. A `0` is a stop, not a licence to guess
another filter. (`$file` is read and unused here; the next block uses it.)

**Then every fault, in order**, with the README's patch form — save the passing bytes, inject, write
the patch, run the named test, restore, compare, and only then assert; then rerun it green:

```sh
set -euo pipefail
while IFS= read -r id && IFS= read -r file && IFS= read -r suite && IFS= read -r title; do
  test -f "$file"
  cp "$file" "$TMPDIR/$id.passing"
  git apply --check "$TMPDIR/mutations/$id.diff" < /dev/null
  git apply "$TMPDIR/mutations/$id.diff" < /dev/null
  if diff -u "$TMPDIR/$id.passing" "$file" > "$TMPDIR/evidence/$id.patch"
  then echo "$id: nothing was injected" >&2; exit 1; else test $? -eq 1; fi
  if (cd apps/wbs/fe-01 && TZ=UTC bunx vitest run "$suite" -t "$title") \
    > "$TMPDIR/evidence/$id.log" 2>&1 < /dev/null
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/$id.log"
  cp "$TMPDIR/$id.passing" "$file"
  cmp "$file" "$TMPDIR/$id.passing"
  test "$status" -eq 1
  if (cd apps/wbs/fe-01 && TZ=UTC bunx vitest run "$suite" -t "$title") \
    > "$TMPDIR/evidence/$id.green.log" 2>&1 < /dev/null
  then status=0; else status=$?; fi
  test "$status" -eq 0
  printf '%s | %s\n' "$id" "$(grep -E '^ +Tests ' "$TMPDIR/evidence/$id.log")"
done < "$TMPDIR/proofs.txt"
```

Expected: one line per fault with the `Tests …` line its table gives, and exit 0. The loop stops at
the first fault whose named test passes (`test "$status" -eq 1`), **after** that file has been
restored and compared — then preamble rule 20 applies: re-read the table, redo that fault once by
hand, and stop if it still passes. Every command inside reads `/dev/null`, so nothing it runs can
consume the records the loop is reading. Extra failing tests are recorded, not a stop.

**The comment** names the injected fault and the observed failure, as a `//` line comment directly
above the line the table names, for example:

```ts
// Proof: on <observed date>, iterating the live subscription set here failed `delivers exactly
// what the model says, under generated interleavings` after 5 runs on `who heard 1, in what order`.
```

Two faults that share a site share one comment block, one sentence each. Where an existing `Proof:`
comment already sits at the site (`w2`, `s1`, `s5`, `t1`), the new sentence is added below it as its
own `// Proof:` line; the existing lines are not edited.

**For the model faults**, the run number, the shrunk counterexample and the first `Caused by` line
are the evidence; they are seed-pinned (`seed: 20260924`, `numRuns: 300`, fast-check 4.9.0) and were
identical in two rehearsal runs. A different run number or counterexample means the generator, seed
or command set differs from what was reviewed: record it, and stop only if the named test **passes**.

### 8.1 Slice 1 — the channel and busy (`src/modules/channel.ts`, `src/modules/plan-writer/busy-store.ts`)

The records for `$TMPDIR/proofs.txt`:

```text
c1
apps/wbs/fe-01/src/modules/channel.ts
src/modules/channel.model.test.ts
delivers exactly what the model says, under generated interleavings
c2
apps/wbs/fe-01/src/modules/channel.ts
src/modules/channel.model.test.ts
delivers exactly what the model says, under generated interleavings
c3
apps/wbs/fe-01/src/modules/channel.ts
src/modules/channel.model.test.ts
delivers exactly what the model says, under generated interleavings
c4
apps/wbs/fe-01/src/modules/channel.ts
src/modules/channel.model.test.ts
delivers exactly what the model says, under generated interleavings
c5
apps/wbs/fe-01/src/modules/channel.ts
src/modules/channel.model.test.ts
delivers exactly what the model says, under generated interleavings
b1
apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
src/modules/plan-writer/busy-store.model.test.ts
holds the last value raised or lowered, and says so once per change
b2
apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
src/modules/plan-writer/busy-store.model.test.ts
holds the last value raised or lowered, and says so once per change
b3
apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
src/modules/plan-writer/busy-store.model.test.ts
holds the last value raised or lowered, and says so once per change
b4
apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
src/modules/plan-writer/busy-store.model.test.ts
holds the last value raised or lowered, and says so once per change
```

Every fault fails the slice's model test, `Tests 1 failed (1)`, exit 1. Run, counterexample (⏎ marks the line break fast-check prints) and the innermost cause, as rehearsed:

| Id   | Fault                                                                          | Run | Counterexample, shrunk                                                                                                                                                        | Innermost cause                                                                                                                                                     | Comment above                                   |
| ---- | ------------------------------------------------------------------------------ | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `c1` | recipients are the live set, not a copy taken when the event's delivery starts | 5   | ``[schedulerFor()`⏎-> [task${1}] promise::publish 1 resolved`,subscribe(join),publishLater(1) /*replayPath="BBf:F"*/]``, shrunk 5 times                                       | `Error: teardown refused: AssertionError: who heard 1, in what order: expected [ { listener: +0, event: 1 }, …(1) ] to deeply equal [ { listener: +0, event: 1 } ]` | `const recipients = [...subscriptions];`        |
| `c2` | a listener unsubscribed before its turn is still called                        | 16  | ``[schedulerFor()`⏎-> [task${1}] promise::publish 1 resolved`,subscribe(dropNewest),publishLater(1),subscribe(record),settle /*replayPath="AAAAABGBS:VF"*/]``, shrunk 4 times | `AssertionError: publish(1) threw with no failing listener: expected AssertionError: listener 1 heard 1 after … { …(4) } to be null`                                | `if (!subscriptions.has(recipient)) continue;`  |
| `c3` | a publication from inside a listener is delivered at once, nested              | 17  | ``[schedulerFor()`⏎-> [task${1}] promise::publish 1 resolved`,publishLater(1),subscribe(echo),settle /*replayPath="CGC:F"*/]``, shrunk 1 time                                 | `AssertionError: listener 0 was entered re-entrantly: expected 2 to be 1`                                                                                           | `if (delivering) return;`                       |
| `c4` | listener failures are collected and never rethrown                             | 5   | ``[schedulerFor()`⏎-> [task${1}] promise::publish 1 resolved`,subscribe(fail),publishLater(1) /*replayPath="BBf:F"*/]``, shrunk 5 times                                       | `Error: teardown refused: AssertionError: publish(1) did not rethrow the one failure by identity: expected null to be Error: listener 0 refused 1`                  | `if (failures.length === 1) throw failures[0];` |
| `c5` | the first listener failure stops delivery to the rest                          | 5   | ``[schedulerFor()`⏎-> [task${1}] promise::publish 1 resolved`,subscribe(fail),subscribe(join),publishLater(1) /*replayPath="BBe:F"*/]``, shrunk 4 times                       | `Error: teardown refused: AssertionError: who heard 1, in what order: expected [ { listener: +0, event: 1 } ] to deeply equal [ { listener: +0, event: 1 }, …(1) ]` | `failures.push(failure);`                       |
| `b1` | a raise or lower that changes nothing still tells every listener               | 1   | ``[schedulerFor()`⏎`,lower /*replayPath="AN:B"*/]``, shrunk 0 times                                                                                                           | `AssertionError: lower: changes heard by the listener that never leaves: expected 1 to be +0`                                                                       | `if (next === busy) return;`                    |
| `b2` | listeners are told before the value changes                                    | 1   | ``[schedulerFor()`⏎`,raise /*replayPath="DKA:F"*/]``, shrunk 1 time                                                                                                           | `AssertionError: raise: the last value the sentinel read: expected false to be true`                                                                                | `busy = next;`                                  |
| `b3` | `lower` does nothing                                                           | 1   | ``[schedulerFor()`⏎`,raise,lower /*replayPath="EJE:F"*/]``, shrunk 2 times                                                                                                    | `AssertionError: lower: busy: expected true to be false`                                                                                                            | `become(false);` inside `lower`                 |
| `b4` | `raise` toggles instead of raising                                             | 2   | ``[schedulerFor()`⏎-> [task${1}] promise::gesture 0 ends resolved`,gesture,raise /*replayPath="ACLB:K"*/]``, shrunk 1 time                                                    | `AssertionError: raise: busy: expected false to be true`                                                                                                            | `become(true);` inside `raise`                  |

#### Proof c1 — recipients are the live set, not a copy taken when the event's delivery starts

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.ts b/apps/wbs/fe-01/src/modules/channel.ts
index 5c242313..ed18961b 100644
--- a/apps/wbs/fe-01/src/modules/channel.ts
+++ b/apps/wbs/fe-01/src/modules/channel.ts
@@ -64,7 +64,7 @@ export function createChannel<T>(): Channel<T> {
       const failures: unknown[] = [];
       try {
         for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
-          const recipients = [...subscriptions];
+          const recipients = subscriptions;
           for (const recipient of recipients) {
             if (!subscriptions.has(recipient)) continue;
             try {
```

#### Proof c2 — a listener unsubscribed before its turn is still called

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.ts b/apps/wbs/fe-01/src/modules/channel.ts
index 5c242313..18f90f87 100644
--- a/apps/wbs/fe-01/src/modules/channel.ts
+++ b/apps/wbs/fe-01/src/modules/channel.ts
@@ -66,7 +66,6 @@ export function createChannel<T>(): Channel<T> {
         for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
           const recipients = [...subscriptions];
           for (const recipient of recipients) {
-            if (!subscriptions.has(recipient)) continue;
             try {
               recipient.listener(next.event);
             } catch (failure: unknown) {
```

#### Proof c3 — a publication from inside a listener is delivered at once, nested

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.ts b/apps/wbs/fe-01/src/modules/channel.ts
index 5c242313..35769b02 100644
--- a/apps/wbs/fe-01/src/modules/channel.ts
+++ b/apps/wbs/fe-01/src/modules/channel.ts
@@ -59,7 +59,6 @@ export function createChannel<T>(): Channel<T> {
     },
     publish: (event) => {
       queue.push({ event });
-      if (delivering) return;
       delivering = true;
       const failures: unknown[] = [];
       try {
```

#### Proof c4 — listener failures are collected and never rethrown

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.ts b/apps/wbs/fe-01/src/modules/channel.ts
index 5c242313..54ee7325 100644
--- a/apps/wbs/fe-01/src/modules/channel.ts
+++ b/apps/wbs/fe-01/src/modules/channel.ts
@@ -79,8 +79,6 @@ export function createChannel<T>(): Channel<T> {
       } finally {
         delivering = false;
       }
-      if (failures.length === 1) throw failures[0];
-      if (failures.length > 1) throw new AggregateError(failures, 'channel listeners failed');
     },
   };
 }
```

#### Proof c5 — the first listener failure stops delivery to the rest

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.ts b/apps/wbs/fe-01/src/modules/channel.ts
index 5c242313..2d4ec34a 100644
--- a/apps/wbs/fe-01/src/modules/channel.ts
+++ b/apps/wbs/fe-01/src/modules/channel.ts
@@ -72,7 +72,7 @@ export function createChannel<T>(): Channel<T> {
             } catch (failure: unknown) {
               // Caught only to keep delivering to the others; every failure is
               // rethrown below, by identity when it is the only one.
-              failures.push(failure);
+              throw failure;
             }
           }
         }
```

#### Proof b1 — a raise or lower that changes nothing still tells every listener

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
index d227dd7c..b8bf1382 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
@@ -37,7 +37,6 @@ export function createBusy(): Busy {
   const changes = createChannel<undefined>();
   let busy = false;
   const become = (next: boolean): void => {
-    if (next === busy) return;
     busy = next;
     changes.publish(undefined);
   };
```

#### Proof b2 — listeners are told before the value changes

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
index d227dd7c..c90a7925 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
@@ -38,8 +38,8 @@ export function createBusy(): Busy {
   let busy = false;
   const become = (next: boolean): void => {
     if (next === busy) return;
-    busy = next;
     changes.publish(undefined);
+    busy = next;
   };
   return {
     subscribe: (onChange) => changes.subscribe(onChange),
```

#### Proof b3 — `lower` does nothing

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
index d227dd7c..891c36b8 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
@@ -47,8 +47,6 @@ export function createBusy(): Busy {
     raise: () => {
       become(true);
     },
-    lower: () => {
-      become(false);
-    },
+    lower: () => undefined,
   };
 }
```

#### Proof b4 — `raise` toggles instead of raising

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
index d227dd7c..d7287ffa 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
@@ -45,7 +45,7 @@ export function createBusy(): Busy {
     subscribe: (onChange) => changes.subscribe(onChange),
     snapshot: () => busy,
     raise: () => {
-      become(true);
+      become(!busy);
     },
     lower: () => {
       become(false);
```

### 8.2 Slice 2 — the delivered plan and presence (`src/modules/plan-feed/`)

The records for `$TMPDIR/proofs.txt`:

```text
d1
apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
src/modules/plan-feed/delivered-plan-store.model.test.ts
folds every publication exactly as the model does, and changes only when it must
d2
apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
src/modules/plan-feed/delivered-plan-store.model.test.ts
folds every publication exactly as the model does, and changes only when it must
d3
apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
src/modules/plan-feed/delivered-plan-store.model.test.ts
folds every publication exactly as the model does, and changes only when it must
d4
apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
src/modules/plan-feed/delivered-plan-store.model.test.ts
folds every publication exactly as the model does, and changes only when it must
d5
apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
src/modules/plan-feed/delivered-plan-store.model.test.ts
folds every publication exactly as the model does, and changes only when it must
r1
apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
src/modules/plan-feed/presence-store.model.test.ts
shows exactly the last frame and connection, and changes only when they do
r2
apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
src/modules/plan-feed/presence-store.model.test.ts
shows exactly the last frame and connection, and changes only when they do
r3
apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
src/modules/plan-feed/presence-store.model.test.ts
shows exactly the last frame and connection, and changes only when they do
r4
apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
src/modules/plan-feed/presence-store.model.test.ts
shows exactly the last frame and connection, and changes only when they do
```

Every fault fails the slice's model test, `Tests 1 failed (1)`, exit 1. Run, counterexample (⏎ marks the line break fast-check prints) and the innermost cause, as rehearsed:

| Id   | Fault                                                            | Run | Counterexample, shrunk                                                                                                                                                                                                                                                                                              | Innermost cause                                                                                             | Comment above                                                             |
| ---- | ---------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `d1` | a step list equal to the one held replaces it anyway             | 1   | ``[schedulerFor()`⏎`,redeliver /*replayPath="AN:B"*/]``, shrunk 0 times                                                                                                                                                                                                                                             | `AssertionError: redeliver: a new snapshot exactly when something changed: expected true to be false`       | the `sameSteps(current.steps, delivery.steps)` conjunct                   |
| `d2` | a null tree ("unchanged") clears the held tree                   | 1   | ``[schedulerFor()`⏎-> [task${1}] promise::read 0 lands resolved`,deliverLater({"stale":[],"failure":null,"directory":null,"tree":0,"steps":null,"markers":null}),settle,deliverNow({"stale":[],"failure":null,"directory":null,"tree":null,"steps":null,"markers":null}) /*replayPath="IFp:F"*/]``, shrunk 13 times | `AssertionError: deliverNow: a new snapshot exactly when something changed: expected true to be false`      | `const tree = delivery.tree ?? current.tree;`                             |
| `d3` | listeners are told before the snapshot is replaced               | 1   | ``[schedulerFor()`⏎-> [task${1}] promise::read 0 lands resolved`,deliverLater({"stale":[],"failure":null,"directory":null,"tree":null,"steps":null,"markers":0}),subscribe(read),settle /*replayPath="GHq:F"*/]``, shrunk 14 times                                                                                  | `AssertionError: listener 0: markers: expected [] to be []`                                                 | `current = next;` inside `replace`                                        |
| `d4` | the tree failure is compared by its wrapper, not its cause       | 5   | ``[schedulerFor()`⏎`,reportConnection(false),subscribe(relay {"stale":[],"failure":0,"directory":null,"tree":null,"steps":null,"markers":null}),reportConnection(true),redeliver /*replayPath="MCx:F"*/]``, shrunk 10 times                                                                                         | `AssertionError: redeliver: a new snapshot exactly when something changed: expected true to be false`       | the `current.treeFailure.cause === delivery.treeFailure.cause` comparison |
| `d5` | the delivered step array is kept instead of the store's own copy | 1   | ``[schedulerFor()`⏎-> [task${1}] promise::read 0 lands resolved`,deliverLater({"stale":[],"failure":null,"directory":null,"tree":null,"steps":["Dev"],"markers":null}),settle /*replayPath="CLL:F"*/]``, shrunk 6 times                                                                                             | `AssertionError: deliverLater #0: steps are not the store’s own: expected true to be false`                 | `: [...delivery.steps];`                                                  |
| `r1` | a frame with the list already held is a change                   | 1   | ``[schedulerFor()`⏎`,users(["lee"]),users(["lee"]) /*replayPath="NAAABCF:VB"*/]``, shrunk 3 times                                                                                                                                                                                                                   | `AssertionError: users(["lee"]): a new snapshot exactly when something changed: expected true to be false`  | `if (users === current.users) return;`                                    |
| `r2` | a frame arriving while disconnected is dropped                   | 1   | ``[schedulerFor()`⏎-> [task${1}] promise::users([]) resolved`,later users([]),settle /*replayPath="CLD:F"*/]``, shrunk 2 times                                                                                                                                                                                      | `AssertionError: later users([]): a new snapshot exactly when something changed: expected false to be true` | the same line as `r1`                                                     |
| `r3` | listeners are told before the snapshot is replaced               | 1   | ``[schedulerFor()`⏎-> [task${1}] promise::users([]) resolved`,subscribe(read),later users([]),settle /*replayPath="CLF:F"*/]``, shrunk 2 times                                                                                                                                                                      | `AssertionError: listener 0: users: expected [] to be []`                                                   | `current = next;` inside `replace`                                        |
| `r4` | a connection change also clears the list                         | 1   | ``[schedulerFor()`⏎`,connection(true) /*replayPath="DKA:F"*/]``, shrunk 1 time                                                                                                                                                                                                                                      | `AssertionError: connection(true): users: expected [] to be []`                                             | `replace({ ...current, connected });`                                     |

#### Proof d1 — a step list equal to the one held replaces it anyway

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
index c6a902dc..bfc5f98a 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
@@ -116,7 +116,7 @@ export function createDeliveredPlan(): DeliveredPlanStore {
       const directory = delivery.directory ?? current.directory;
       const tree = delivery.tree ?? current.tree;
       const steps =
-        delivery.steps === null || sameSteps(current.steps, delivery.steps)
+        delivery.steps === null
           ? current.steps
           : [...delivery.steps];
       const markers = delivery.markers ?? current.markers;
```

#### Proof d2 — a null tree ("unchanged") clears the held tree

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
index c6a902dc..a4f15332 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
@@ -114,7 +114,7 @@ export function createDeliveredPlan(): DeliveredPlanStore {
             ? current.treeFailure
             : { cause: delivery.treeFailure.cause };
       const directory = delivery.directory ?? current.directory;
-      const tree = delivery.tree ?? current.tree;
+      const tree = delivery.tree;
       const steps =
         delivery.steps === null || sameSteps(current.steps, delivery.steps)
           ? current.steps
```

#### Proof d3 — listeners are told before the snapshot is replaced

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
index c6a902dc..67692920 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
@@ -97,8 +97,8 @@ export function createDeliveredPlan(): DeliveredPlanStore {
   const changes = createChannel<undefined>();
   let current = nothingDelivered();
   const replace = (next: DeliveredPlan): void => {
-    current = next;
     changes.publish(undefined);
+    current = next;
   };
   return {
     subscribe: (onChange) => changes.subscribe(onChange),
```

#### Proof d4 — the tree failure is compared by its wrapper, not its cause

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
index c6a902dc..aa7d6230 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
@@ -110,7 +110,7 @@ export function createDeliveredPlan(): DeliveredPlanStore {
       const treeFailure =
         delivery.treeFailure === null
           ? null
-          : current.treeFailure !== null && current.treeFailure.cause === delivery.treeFailure.cause
+          : current.treeFailure === delivery.treeFailure
             ? current.treeFailure
             : { cause: delivery.treeFailure.cause };
       const directory = delivery.directory ?? current.directory;
```

#### Proof d5 — the delivered step array is kept instead of the store's own copy

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
index c6a902dc..1d34b953 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
@@ -118,7 +118,7 @@ export function createDeliveredPlan(): DeliveredPlanStore {
       const steps =
         delivery.steps === null || sameSteps(current.steps, delivery.steps)
           ? current.steps
-          : [...delivery.steps];
+          : delivery.steps;
       const markers = delivery.markers ?? current.markers;
       if (
         staleResources === current.staleResources &&
```

#### Proof r1 — a frame with the list already held is a change

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
index b01433ea..2dee304a 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
@@ -46,7 +46,6 @@ export function createPresence(): PresenceStore {
     subscribe: (onChange) => changes.subscribe(onChange),
     snapshot: () => current,
     reportUsers: (users) => {
-      if (users === current.users) return;
       replace({ ...current, users });
     },
     reportConnection: (connected) => {
```

#### Proof r2 — a frame arriving while disconnected is dropped

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
index b01433ea..481c2116 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
@@ -46,7 +46,7 @@ export function createPresence(): PresenceStore {
     subscribe: (onChange) => changes.subscribe(onChange),
     snapshot: () => current,
     reportUsers: (users) => {
-      if (users === current.users) return;
+      if (users === current.users || !current.connected) return;
       replace({ ...current, users });
     },
     reportConnection: (connected) => {
```

#### Proof r3 — listeners are told before the snapshot is replaced

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
index b01433ea..9c448576 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
@@ -39,8 +39,8 @@ export function createPresence(): PresenceStore {
   const changes = createChannel<undefined>();
   let current: Presence = { users: [], connected: false };
   const replace = (next: Presence): void => {
-    current = next;
     changes.publish(undefined);
+    current = next;
   };
   return {
     subscribe: (onChange) => changes.subscribe(onChange),
```

#### Proof r4 — a connection change also clears the list

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
index b01433ea..b2a4db8a 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
@@ -51,7 +51,7 @@ export function createPresence(): PresenceStore {
     },
     reportConnection: (connected) => {
       if (connected === current.connected) return;
-      replace({ ...current, connected });
+      replace({ users: [], connected });
     },
   };
 }
```

### 8.3 Slice 3 — the listener hook and the writer

The records for `$TMPDIR/proofs.txt`:

```text
l1
apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
src/components/wbs/use-channel-listener.test.tsx
hears an event a child publishes from its own mount effect
l2
apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
src/components/wbs/use-channel-listener.test.tsx
calls the listener of the latest render and never a superseded one
l3
apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
src/components/wbs/use-channel-listener.test.tsx
follows a channel replaced while it stays mounted, and leaves the old one
l4
apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
src/components/wbs/use-channel-listener.test.tsx
hears nothing once it is unmounted, and a publication then throws nothing
l5
apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
src/components/wbs/use-channel-listener.test.tsx
lets a listener’s own failure reach the publisher by identity
w1
apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
src/modules/plan-writer/plan-writer.test.ts
says a command was issued before it sends anything
w2
apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
src/modules/plan-writer/plan-writer.test.ts
leaves the project busy when its reader left before the answer arrived
```

| Id   | Fault                                                            | Suite › test                                                                                                  | Observed (`Tests` line)                                                                                         | Comment above  |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------- |
| `l1` | the subscription moves to a passive `useEffect`                  | `use-channel-listener.test.tsx` › `hears an event a child publishes from its own mount effect`                | `expected [] to deeply equal [ 'first read refused' ]`; `1 failed                                               | 4 skipped (5)` | the second `useLayoutEffect(` (the subscription)                                |
| `l2` | the ref of the latest listener is never updated                  | `use-channel-listener.test.tsx` › `calls the listener of the latest render and never a superseded one`        | `expected [ 'after the re-render' ] to deeply equal []`; `1 failed                                              | 4 skipped (5)` | the first `useLayoutEffect(` (the ref write)                                    |
| `l3` | the subscription does not follow the channel (`[]` dependencies) | `use-channel-listener.test.tsx` › `follows a channel replaced while it stays mounted, and leaves the old one` | `expected [ 'from the replaced channel' ] to deeply equal [ 'from the replacement' ]`; `1 failed                | 4 skipped (5)` | `[channel],`                                                                    |
| `l4` | the subscription is never left (its unsubscribe dropped)         | `use-channel-listener.test.tsx` › `hears nothing once it is unmounted, and a publication then throws nothing` | `expected [ 'after the unmount' ] to deeply equal []`; `1 failed                                                | 4 skipped (5)` | `channel.subscribe((event) => {`                                                |
| `l5` | the listener's failure is swallowed                              | `use-channel-listener.test.tsx` › `lets a listener’s own failure reach the publisher by identity`             | `expected null to be Error: the toast stack is gone`; `1 failed                                                 | 4 skipped (5)` | `latest.current(event);`                                                        |
| `w1` | the command is announced after the request is sent               | `plan-writer.test.ts` › `says a command was issued before it sends anything`                                  | `expected [ 'request sent', 'command issued' ] to deeply equal [ 'command issued', 'request sent' ]`; `1 failed | 3 skipped (4)` | `commandsIssued.publish(undefined);`                                            |
| `w2` | busy lowered even after the reader left                          | `plan-writer.test.ts` › `leaves the project busy when its reader left before the answer arrived`              | `expected false to be true`; `1 failed                                                                          | 3 skipped (4)` | `if (isActiveReader()) busy.lower();` — below the existing `Proof:` lines there |

#### Proof l1 — the subscription moves to a passive `useEffect`

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
index 2d383667..564d8a20 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
@@ -1,4 +1,4 @@
-import { useLayoutEffect, useRef } from 'react';
+import { useEffect, useLayoutEffect, useRef } from 'react';

 import type { Channel } from '@/modules/channel';

@@ -28,7 +28,7 @@ export function useChannelListener<T>(channel: Channel<T>, listener: (event: T)
   useLayoutEffect(() => {
     latest.current = listener;
   });
-  useLayoutEffect(
+  useEffect(
     () =>
       channel.subscribe((event) => {
         latest.current(event);
```

#### Proof l2 — the ref of the latest listener is never updated

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
index 2d383667..2e524290 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
@@ -25,9 +25,6 @@ import type { Channel } from '@/modules/channel';
  */
 export function useChannelListener<T>(channel: Channel<T>, listener: (event: T) => void): void {
   const latest = useRef(listener);
-  useLayoutEffect(() => {
-    latest.current = listener;
-  });
   useLayoutEffect(
     () =>
       channel.subscribe((event) => {
```

#### Proof l3 — the subscription does not follow the channel (`[]` dependencies)

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
index 2d383667..ca8e3af2 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
@@ -33,6 +33,6 @@ export function useChannelListener<T>(channel: Channel<T>, listener: (event: T)
       channel.subscribe((event) => {
         latest.current(event);
       }),
-    [channel],
+    [],
   );
 }
```

#### Proof l4 — the subscription is never left (its unsubscribe dropped)

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
index 2d383667..11a1facc 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
@@ -29,10 +29,11 @@ export function useChannelListener<T>(channel: Channel<T>, listener: (event: T)
     latest.current = listener;
   });
   useLayoutEffect(
-    () =>
+    () => {
       channel.subscribe((event) => {
         latest.current(event);
-      }),
+      });
+    },
     [channel],
   );
 }
```

#### Proof l5 — the listener's failure is swallowed

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
index 2d383667..a6d75d2e 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-channel-listener.ts
@@ -31,7 +31,11 @@ export function useChannelListener<T>(channel: Channel<T>, listener: (event: T)
   useLayoutEffect(
     () =>
       channel.subscribe((event) => {
-        latest.current(event);
+        try {
+          latest.current(event);
+        } catch {
+          // swallowed
+        }
       }),
     [channel],
   );
```

#### Proof w1 — the command is announced after the request is sent

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
index 4337abff..d227f536 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
@@ -68,12 +68,12 @@ export function createPlanWriter({
       // happened. The intent compares it against where the focus is when the
       // refetch lands, and everything between the two is the window in which
       // the reader may have gone somewhere else.
-      commandsIssued.publish(undefined);
       busy.raise();
       const write = createLocalWrite();
       try {
         try {
           await action(write);
+          commandsIssued.publish(undefined);
         } catch (thrown: unknown) {
           // A refusal from a project the reader has left is not a refusal of
           // anything on the screen now. The old burst stops without putting
```

#### Proof w2 — busy lowered even after the reader left

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
index 4337abff..c40b3d66 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
@@ -135,7 +135,7 @@ export function createPlanWriter({
         // reader busy forever. Dropping the API half let the departed owner
         // clear its replacement's pending rename. Watched in the renewal and
         // busy-replacement cases, 2026-09-14.
-        if (isActiveReader()) busy.lower();
+        busy.lower();
       }
     },
   };
```

### 8.4 Slice 4 — the snapshot hook and the table's production path

The records for `$TMPDIR/proofs.txt`:

```text
u1
apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
src/components/wbs/use-snapshot-changes.test.tsx
catches up with a change made between its render and its subscription
u2
apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
src/components/wbs/use-snapshot-changes.test.tsx
hands on nothing when told of a change that left the snapshot as it was
u3
apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
src/components/wbs/use-snapshot-changes.test.tsx
calls the callback of the latest render and never a superseded one
u4
apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
src/components/wbs/use-snapshot-changes.test.tsx
follows a store replaced while it stays mounted, and leaves the old one
u5
apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
src/components/wbs/use-snapshot-changes.test.tsx
hands on nothing once it is unmounted
s1
apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
src/components/wbs/plan-cells.test.tsx
closes the card when a peer moves the row it is anchored to
s2
apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
src/components/wbs/plan-read-and-write.test.tsx
drops a half-typed figure for a step that has gone
s3
apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
src/components/wbs/plan-layout.test.tsx
offers the reset only while there is a width to reset
s4
apps/wbs/fe-01/src/modules/plan-feed/composition.ts
src/components/wbs/plan-read-and-write.test.tsx
says so while the connection is down
s5
apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
src/components/wbs/plan-read-and-write.test.tsx
keeps the installed plan and names an unavailable peer refetch
f1
apps/wbs/fe-01/src/modules/plan-feed/composition.ts
src/components/wbs/plan-read-and-write.test.tsx
names an unavailable optimizer and offers no export before a plan is installed
```

| Id   | Fault                                                          | Suite › test                                                                                                      | Observed (`Tests` line)                                                                                            | Comment above      |
| ---- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `u1` | no catch-up when a subscription starts                         | `use-snapshot-changes.test.tsx` › `catches up with a change made between its render and its subscription`         | `expected [] to deeply equal [ [ 5, +0 ] ]`; `1 failed                                                             | 5 skipped (6)`     | `catchUp();` (the call after `subscribe`)                                          |
| `u2` | an unchanged snapshot is handed on again                       | `use-snapshot-changes.test.tsx` › `hands on nothing when told of a change that left the snapshot as it was`       | `expected [ [ +0, +0 ], [ +0, +0 ] ] to deeply equal []`; `1 failed                                                | 5 skipped (6)`     | `if (next === previous) return;`                                                   |
| `u3` | the ref of the latest callback is never updated                | `use-snapshot-changes.test.tsx` › `calls the callback of the latest render and never a superseded one`            | `expected [ 1 ] to deeply equal []`; `1 failed                                                                     | 5 skipped (6)`     | the first `useLayoutEffect(` (the ref write)                                       |
| `u4` | the subscription does not follow the store (`[]` dependencies) | `use-snapshot-changes.test.tsx` › `follows a store replaced while it stays mounted, and leaves the old one`       | `expected [ [ 1, +0 ] ] to deeply equal [ [ 7, +0 ], [ 8, 7 ] ]`; `1 failed                                        | 5 skipped (6)`     | `}, [store]);`                                                                     |
| `u5` | the subscription is never left                                 | `use-snapshot-changes.test.tsx` › `hands on nothing once it is unmounted`                                         | `expected [ 1 ] to deeply equal []`; `1 failed                                                                     | 5 skipped (6)`     | `return unsubscribe;`                                                              |
| `s1` | the hover card is no longer settled against a new tree         | `plan-cells.test.tsx` › `closes the card when a peer moves the row it is anchored to`                             | `expected <div role="tooltip" …(2)>…(2)</div> to be null`; `1 failed                                               | 125 skipped (126)` | `rowPlacements.current = placements;` in `settle` — below the moved `Proof:` lines |
| `s2` | the drafts are no longer settled against new steps             | `plan-read-and-write.test.tsx` › `drops a half-typed figure for a step that has gone`                             | `expected [ '010' ] to deeply equal []`; `1 failed                                                                 | 87 skipped (88)`   | `if (next.steps !== previous.steps) settleAgainstSteps(next.steps);`               |
| `s3` | whose tree it is is no longer recorded                         | `plan-layout.test.tsx` › `offers the reset only while there is a width to reset`                                  | `Unable to find an accessible element with the role "button" and name "Reset layout"`; `1 failed                   | 77 skipped (78)`   | `treeReadProject.current = projectId;` in `settle`                                 |
| `s4` | the feed's connection reports go nowhere                       | `plan-read-and-write.test.tsx` › `says so while the connection is down`                                           | `Unable to find an accessible element with the role "status"`; `1 failed                                           | 87 skipped (88)`   | `setConnected: plan.reportConnection,` in `composition.ts`                         |
| `s5` | the failure's words are never built                            | `plan-read-and-write.test.tsx` › `keeps the installed plan and names an unavailable peer refetch`                 | `expected 'This plan may be out of date — the la…' to contain 'Optimized scheduling is unavailable i…'`; `1 failed | 87 skipped (88)`   | the `treeFailureText` memo's function — below the moved `Proof:` lines             |
| `f1` | the feed's refusals go nowhere                                 | `plan-read-and-write.test.tsx` › `names an unavailable optimizer and offers no export before a plan is installed` | `expected [] to include 'Optimized scheduling is unavailable i…'`; `1 failed                                       | 87 skipped (88)`   | `announceRefusal: refusals.publish,` in `composition.ts`                           |

#### Proof u1 — no catch-up when a subscription starts

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
index c106335b..f9ec7cd6 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
@@ -46,7 +46,6 @@ export function useSnapshotChanges<T>(
       latest.current(next, previous);
     };
     const unsubscribe = store.subscribe(catchUp);
-    catchUp();
     return unsubscribe;
   }, [store]);
 }
```

#### Proof u2 — an unchanged snapshot is handed on again

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
index c106335b..f78d3310 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
@@ -41,7 +41,6 @@ export function useSnapshotChanges<T>(
     const catchUp = (): void => {
       const next = store.snapshot();
       const previous = handedOn.current;
-      if (next === previous) return;
       handedOn.current = next;
       latest.current(next, previous);
     };
```

#### Proof u3 — the ref of the latest callback is never updated

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
index c106335b..bcf3115a 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
@@ -34,9 +34,6 @@ export function useSnapshotChanges<T>(
 ): void {
   const latest = useRef(onChange);
   const handedOn = useRef(store.snapshot());
-  useLayoutEffect(() => {
-    latest.current = onChange;
-  });
   useLayoutEffect(() => {
     const catchUp = (): void => {
       const next = store.snapshot();
```

#### Proof u4 — the subscription does not follow the store (`[]` dependencies)

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
index c106335b..f7bee98b 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
@@ -48,5 +48,5 @@ export function useSnapshotChanges<T>(
     const unsubscribe = store.subscribe(catchUp);
     catchUp();
     return unsubscribe;
-  }, [store]);
+  }, []);
 }
```

#### Proof u5 — the subscription is never left

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
index c106335b..185aad01 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-snapshot-changes.ts
@@ -47,6 +47,6 @@ export function useSnapshotChanges<T>(
     };
     const unsubscribe = store.subscribe(catchUp);
     catchUp();
-    return unsubscribe;
+    void unsubscribe;
   }, [store]);
 }
```

#### Proof s1 — the hover card is no longer settled against a new tree

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index b80c2dfd..65c5a889 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -596,8 +596,8 @@ export function usePlanRead({
         // Watched, 2026-08-09.
         const placements = placementsOf(rowsOf(next.tree));
         const wasPlaced = rowPlacements.current;
-        rowPlacements.current = placements;
-        cellCards.updateHovered((open) => hoveredCellAfterRefresh(open, wasPlaced, placements));
+        void wasPlaced;
+        void placements;
       }
       if (next.steps !== previous.steps) settleAgainstSteps(next.steps);
     },
```

#### Proof s2 — the drafts are no longer settled against new steps

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index b80c2dfd..e86946cf 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -599,7 +599,6 @@ export function usePlanRead({
         rowPlacements.current = placements;
         cellCards.updateHovered((open) => hoveredCellAfterRefresh(open, wasPlaced, placements));
       }
-      if (next.steps !== previous.steps) settleAgainstSteps(next.steps);
     },
     [cellCards, projectId, rowPlacements, settleAgainstSteps, treeReadProject],
   );
```

#### Proof s3 — whose tree it is is no longer recorded

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index b80c2dfd..14532b88 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -585,7 +585,6 @@ export function usePlanRead({
   const settle = useCallback(
     (next: DeliveredPlan, previous: DeliveredPlan) => {
       if (next.tree !== null && next.tree !== previous.tree) {
-        treeReadProject.current = projectId;
         // The open hover card, settled against the rows that just arrived. The
         // previous placements are read into a local **before** the ref is replaced:
         // React may run the updater below after this call returns, and reading the
```

#### Proof s4 — the feed's connection reports go nowhere

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/composition.ts b/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
index 1db2b4a0..1ed1c760 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
@@ -48,6 +48,6 @@ export function planFeedForReader({
     isActiveReader,
     publish: plan.deliver,
     announceRefusal: refusals.publish,
-    setConnected: plan.reportConnection,
+    setConnected: () => undefined,
   });
 }
```

#### Proof s5 — the failure's words are never built

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index b80c2dfd..dc725716 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -336,7 +336,7 @@ export function usePlanReadState({ projectId }: { projectId: string }) {
   // “the last refresh failed”, expected the named optimizer-unavailable
   // message while the previously installed plan stayed on screen.
   const treeFailureText = useMemo(
-    () => (treeFailure === null ? null : refusalSentence(treeFailure.cause)),
+    () => null,
     [treeFailure],
   );

```

#### Proof f1 — the feed's refusals go nowhere

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/composition.ts b/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
index 1db2b4a0..d1d18d8c 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
@@ -47,7 +47,7 @@ export function planFeedForReader({
         : (handlers, baseline) => subscribe(projectId, handlers, baseline),
     isActiveReader,
     publish: plan.deliver,
-    announceRefusal: refusals.publish,
+    announceRefusal: () => undefined,
     setConnected: plan.reportConnection,
   });
 }
```

### 8.5 Slice 5 — the table's ports and the page's presence

The records for `$TMPDIR/proofs.txt`:

```text
t1
apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
src/components/wbs/plan-read-and-write.test.tsx
names an unavailable optimizer and offers no export before a plan is installed
t2
apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
src/components/wbs/plan-keyboard.test.tsx
Cmd\+Enter on the last row makes one and lands in it
t3
apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
src/components/wbs/plan-read-and-write.test.tsx
says a refused rename in a toast, and puts nothing above the table
m1
apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
src/components/wbs/plan-chart-seam.test.tsx
rereads a marker refused because a peer already deleted it
q1
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
hands the presence slot who the project’s stream says is here, and its connection
q2
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
hands the presence slot who the project’s stream says is here, and its connection
```

| Id   | Fault                                                          | Suite › test                                                                                                      | Observed (`Tests` line)                                                                                                                                       | Comment above    |
| ---- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `t1` | a cause becomes its bare `String`, not a sentence              | `plan-read-and-write.test.tsx` › `names an unavailable optimizer and offers no export before a plan is installed` | `expected [ Array(1) ] to include 'Optimized scheduling is unavailable i…'`; `1 failed                                                                        | 87 skipped (88)` | the listener's `text:` line — below the moved `Proof:` lines                     |
| `t2` | the command listener no longer tells the focus intent          | `plan-keyboard.test.tsx` › `Cmd+Enter on the last row makes one and lands in it`                                  | `expected <textarea …(6)></textarea> to be <textarea …(6)></textarea>` — the focus stayed on the old row; `1 failed                                           | 95 skipped (96)` | `focusIntent.current.commandIssued();`                                           |
| `t3` | the writer's refusals (the ones with a sentence) are not said  | `plan-read-and-write.test.tsx` › `says a refused rename in a toast, and puts nothing above the table`             | `expected [] to deeply equal [ Array(1) ]`; `1 failed                                                                                                         | 87 skipped (88)` | `pushToast({` in the refusal listener                                            |
| `m1` | the markers' refusals go nowhere                               | `plan-chart-seam.test.tsx` › `rereads a marker refused because a peer already deleted it`                         | `the given combination of arguments (undefined and string) is invalid for this assertion` — there is no toast whose text could contain `no longer`; `1 failed | 22 skipped (23)` | `announceRefusal: refusals.publish,` in the `markers` memo of `use-plan-read.ts` |
| `q1` | presence frames are not reported to the store                  | `project-page.test.tsx` › `hands the presence slot who the project’s stream says is here, and its connection`     | `expected { users: [], connected: false } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`; `1 failed                                                       | 72 skipped (73)` | `onPresence: projectPresence.reportUsers,`                                       |
| `q2` | the connection is reported to the table only, not to the store | `project-page.test.tsx` › `hands the presence slot who the project’s stream says is here, and its connection`     | `expected { users: [ 'kat', 'lee' ], …(1) } to deeply equal { users: [ 'kat', 'lee' ], …(1) }` — `connected` stayed `false`; `1 failed                        | 72 skipped (73)` | `projectPresence.reportConnection(connected);`                                   |

#### Proof t1 — a cause becomes its bare `String`, not a sentence

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index b80c2dfd..06c6bb49 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -503,7 +503,7 @@ export function usePlanRead({
       kind: 'error',
       // Proof: using the bare failure code here left the unavailable-plan
       // fixture with no named toast and an unhandled refusal-code branch.
-      text: 'sentence' in refusal ? refusal.sentence : refusalSentence(refusal.cause),
+      text: 'sentence' in refusal ? refusal.sentence : String(refusal.cause),
     });
   });
   // The table decides what a command issued means for the focus; the writer
```

#### Proof t2 — the command listener no longer tells the focus intent

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index b80c2dfd..214cc0af 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -508,9 +508,7 @@ export function usePlanRead({
   });
   // The table decides what a command issued means for the focus; the writer
   // only says that one was.
-  useChannelListener(commandsIssued, () => {
-    focusIntent.current.commandIssued();
-  });
+  useChannelListener(commandsIssued, () => undefined);

   /**
    * Settles this browser's own state against the steps be-01 just reported.
```

#### Proof t3 — the writer's refusals (the ones with a sentence) are not said

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index b80c2dfd..9489272f 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -499,6 +499,7 @@ export function usePlanRead({
   // Joined before the feed below starts reading, which is a passive effect of
   // this same commit: see `useChannelListener`.
   useChannelListener(refusals, (refusal) => {
+    if ('sentence' in refusal) return;
     pushToast({
       kind: 'error',
       // Proof: using the bare failure code here left the unavailable-plan
```

#### Proof m1 — the markers' refusals go nowhere

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index b80c2dfd..7029533d 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -671,7 +671,7 @@ export function usePlanRead({
         api,
         readRefreshOwner: () => feedRef.current?.owner ?? null,
         isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
-        announceRefusal: refusals.publish,
+        announceRefusal: () => undefined,
       }),
     [activeProject, api, projectId, refusals],
   );
```

#### Proof q1 — presence frames are not reported to the store

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index fe5d9931..009175c3 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -528,7 +528,7 @@ export function ProjectPage({
             projectPresence.reportConnection(connected);
             handlers.onConnectionChange(connected);
           },
-          onPresence: projectPresence.reportUsers,
+          onPresence: () => undefined,
         },
         streamDeps,
       ),
```

#### Proof q2 — the connection is reported to the table only, not to the store

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index fe5d9931..400c180a 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -525,7 +525,6 @@ export function ProjectPage({
           hasBaseline: true,
           onChange: handlers.onChange,
           onConnectionChange: (connected) => {
-            projectPresence.reportConnection(connected);
             handlers.onConnectionChange(connected);
           },
           onPresence: projectPresence.reportUsers,
```

## 9. Verification

### 9.1 Every fenced diff applies, extracted from this document, in slice order

The requirement is not "these diffs were once correct" but "these diffs, as this committed document
spells them, apply in slice order, and every fault patch applies to what they produce". The script
below proves both; it was run after the final Prettier `--check` of this document.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-g-project-prerequisites.md
base=1f1264c162baddc250bb391557ad38ae5fa982de
work=$(mktemp -d "${TMPDIR:?}/extract-XXXXXX")
mkdir -p "$work/patches" "$work/mutations" "$work/tree"
awk -v out="$work/patches" '
  /^## 7\. The code$/ { inside=1; next }
  /^## 8\. Proofs$/   { inside=0 }
  inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(find "$work/patches" -name '*.diff' | wc -l)
echo "extracted=$count"
test "$count" -eq 17
awk -v out="$work/mutations" '
  /^## 8\. Proofs$/ { inside=1; next }
  /^## 9\. Verification$/ { inside=0 }
  inside && /^#### Proof / { id=$3; next }
  inside && /^```diff$/ { f=sprintf("%s/%s.diff", out, id); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(find "$work/mutations" -name '*.diff' | wc -l)
echo "fault-patches=$count"
test "$count" -eq 42
# A real repository holding exactly the base tree, so --check has something to check against.
git archive "$base" | tar -x -C "$work/tree"
git -C "$work/tree" init -q
git -C "$work/tree" add -A
git -C "$work/tree" -c user.email=x@example.invalid -c user.name=x commit -qm base
# --check and apply are SEPARATE commands: joined with && under set -e, a failed
# check does not stop the shell and a later iteration can still reach the end.
for p in "$work"/patches/*.diff; do
  git -C "$work/tree" apply --check "$p"
  git -C "$work/tree" apply "$p"
done
echo "all 17 applied"
for m in "$work"/mutations/*.diff; do
  git -C "$work/tree" apply --check "$m"
done
echo "all 42 fault patches check against the result"
git -C "$work/tree" status --porcelain --untracked-files=all | wc -l
````

Observed on 2026-09-24, after the final Prettier `--check`:

```
extracted=17
fault-patches=42
all 17 applied
all 42 fault patches check against the result
26
```

`git apply --check` prints nothing on success, which is why the script's own `echo` lines are the
evidence and why both counts are asserted rather than printed: a run that extracted sixteen patches
would otherwise apply sixteen and still say it had applied them all. Prettier removes the single space
`git diff` writes on a blank context line inside these fences; `git apply` reads the empty line as a
blank context line, and the run above extracted every patch from the formatted document, so that is
exactly what it exercised. The last line is the number of paths the seventeen patches change against
the base: six in slice 1, four more in slice 2 (its spec and `vitest.node-suites.ts` are already
counted), nine more in slice 3, two in slice 4 and five in slice 5 — every owned path but `verify.md`,
which the executor writes. The applied tree was compared file by file with the rehearsal's final
commit: all twenty-six byte-identical except `tasks.md`, whose one `<observed-date>` slice 5 step 4
replaces.

**That success line is unreachable when a check fails, and that was rehearsed:** the context line
`export function createPlanWriter({` in 7.9 was rewritten to text the file does not contain, and both
loop forms were run on fresh base trees.

| Loop form                                                                | Observed on 2026-09-24                                                                                                                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git apply --check "$p" && git apply "$p"`                               | printed `error: patch failed: apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts:20` and three later files' errors, then `all 17 applied`, and **exited 0** — a false success |
| `git apply --check "$p"` then `git apply "$p"` on separate lines (above) | printed the first `error:` lines, **no** success line, and **exited 1**                                                                                                                  |

Every **intermediate** tree typechecks: `wbs-fe-01:typecheck` exit 0 on each of the five rehearsal
commits, before it was made. Exactly four trees do not: the red checkpoints of slices 1 to 4, each
after that slice's contract and test patches and before its implementation (section 6 gives each
one's diagnostics). A red is rebuilt only from the previous slice's tree plus that slice's test
patch, never by reverse-applying patches on a later tree: slice 4 rewrites `use-plan-read.ts` over
slice 3's version, so reverting slice 3's patch on the final tree does not apply.

### 9.2 The strict OpenSpec block, reproduced

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
report=$(mktemp "$TMPDIR/evidence/openspec-validation.XXXXXX.json")
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

Expected: one JSON report, exit 0. `failed` that is `false` rather than `0` is refused by
`type == "number"`. The report stays under `$TMPDIR/evidence`; the command guard rejects `rm -f`.
Rehearsed on the base and after every slice: `{"items":114,"passed":114,"failed":0}` each time — the
new requirement and its five scenarios live in a document that already counted as one item.

### 9.3 Commands actually run, and what each reported

All on 2026-09-24, by this packet's author, on a rehearsal branch cut at `1f1264c1` where each slice
was laid down from exactly the files these patches produce and then committed **with the hooks on**
(lefthook's pre-commit and commit-msg hooks passed for all five commits), not inside an executor
sandbox. Each slice's red was rebuilt from the previous slice's commit plus that slice's test files
only; each fault was injected into the committed tree of the slice that owns it.

| Check                                              | Base `1f1264c1` | Slice 1                  | Slice 2                  | Slice 3                       | Slice 4                  | Slice 5                             |
| -------------------------------------------------- | --------------- | ------------------------ | ------------------------ | ----------------------------- | ------------------------ | ----------------------------------- |
| sandbox node suite (files·tests)                   | 45·674          | 47·676                   | 49·678                   | 49·680                        | 49·680                   | 49·680                              |
| preferences suite                                  | 4·39            | 4·39                     | 4·39                     | 4·39                          | 4·39                     | 4·39                                |
| focused set (plan-writer, plan-feed, page, router) | 5·102           | 6·103                    | 8·105                    | 8·107                         | 8·107                    | 8·108                               |
| adopted set, serial                                | 20·1214 (350 s) | —                        | —                        | 20·1214                       | 20·1214                  | 20·1215                             |
| zoned (Auckland)                                   | —               | —                        | —                        | 2·3                           | 2·3                      | 2·3                                 |
| red typecheck                                      | —               | exit 1, 3 errors         | exit 1, 2 errors         | exit 1, 6 errors              | exit 1, 1 error          | exit 0 (no red by design)           |
| red Vitest                                         | —               | `2 failed (2)`, no tests | `2 failed (2)`, no tests | `Tests 4 failed (4)`, 2 files | `1 failed (1)`, no tests | `73 passed (73)` — characterisation |
| typecheck on the slice's commit                    | 0               | 0                        | 0                        | 0                             | 0                        | 0                                   |
| faults observed failing, file restored             | —               | 9 of 9                   | 9 of 9                   | 7 of 7                        | 11 of 11                 | 6 of 6                              |
| strict OpenSpec                                    | 114 · 114 · 0   | 114 · 114 · 0            | 114 · 114 · 0            | 114 · 114 · 0                 | 114 · 114 · 0            | 114 · 114 · 0                       |

(`45·674` is 45 files, 674 tests.) On the final commit: `wbs-fe-01:lint` exit 0, `nx format:check
--all` exit 0, `wbs-fe-01:build` exit 0 (`✓ built in 883ms`). Every proof filter was run on the final
tree first and matched exactly one test — forty-two faults over twenty-six distinct patterns.

The forty-two faults were then run a **second** time through this document's own section 8 blocks —
the fault patches extracted from the formatted packet by section 9.1's script, the records extracted
per subsection, the filter check and the fault loop, all copied out of the packet — each subsection on
its slice's rehearsal commit (8.1 on slice 1's … 8.5 on slice 5's): every filter `1 matched`, every
fault `status=1` with its table's `Tests` line, every restore `cmp`-identical, every green rerun
`status=0`, and the working tree clean afterwards (`status-after=0` five times). The eighteen model
counterexamples — run number and replay path — came out byte-identical to the first run.

### 9.4 Planner-only, with the expected relative delta

The sandbox cannot run these: three tests in two files spawn `bun` from Node, there is no browser, a
build writes outside the attempt's lane, and devsync writes Git objects.

| Check                                                                                                                                                                                            | Expected, relative to the base                                                                                                                                                       | Planner's own rehearsal                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit`                                                                                                    | slice 1 **+ 2 files, + 2 tests**; slice 2 **+ 2, + 2**; slice 3 **+ 0, + 2**; slices 4 and 5 unchanged                                                                               | base 47 files, 697 tests; final commit 51 files, 703 tests; exit 0 both                                       |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test`                                                                                                         | UTC: slice 1 **+ 2 files, + 2**; slice 2 **+ 2, + 2**; slice 3 **+ 1, + 7**; slice 4 **+ 1, + 6**; slice 5 **+ 0, + 1**. Net **+ 6 files, + 18 tests**. Auckland zoned unchanged     | base UTC 132 files, 3029 tests, zoned 2 · 3; final commit UTC 138 files, 3047 tests, zoned 2 · 3; exit 0 both |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                                                                                                                    | exit 0 after each slice                                                                                                                                                              | exit 0 on the final commit, `✓ built in 883ms`                                                                |
| `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, with the slice committed or staged                                                                   | unchanged; no project target, no module index block, and the new files are module sources, hooks and tests                                                                           | 366 pass, 0 fail, exit 0 on the final commit                                                                  |
| `CI=1 E2E_PORT_SHIFT=<a multiple of 300 clear of every live run, checked with ss -ltn> NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run wbs-fe-01:e2e -- <spec>` | exit 0, unchanged, after slices 3, 4 and 5 — every spec that edits a plan, since busy, refusals, focus and the whole delivered plan move; slices 1 and 2 wire nothing a browser sees | **Pending planner verification.** Not run in this rehearsal. The executor never launches a browser.           |
| the same target **unfiltered**, on its own shift, on the final integration commit                                                                                                                | exit 0. The batch README's "Integration verification" requires the whole frontend browser suite once a frontend change lands                                                         | **Pending planner verification.** Not run, not waived.                                                        |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                       | exit 0 on the shared build host                                                                                                                                                      | **Not run**; reported as pending, never as passed.                                                            |

`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` is not decoration: `CLAUDECODE=1` changes Bun's test
output and fails thirteen unrelated tests in this repository.

### 9.5 What none of this proves

- No browser ran. The Chromium checks are the planner's and are pending, not waived.
- The model tests explore the stores and the channel, not React's scheduling; the hooks' timing is
  proved by one example per question (section 3.5), not by exploration.
- The coverage assertions prove the pinned runs reached each interleaving, not that the space is
  exhausted.
- Presence is not reset on a project switch (section 13, assumption 2); nothing here proves that is
  the right behaviour, only that it is today's.
- No store has a lifetime; a project runtime that retires them (task 10) needs its own record.

## 10. Stop conditions

Each is false on the real starting tree, checked on 2026-09-24.

1. Step 0a's status is not empty, or `base` differs from the slice note's SHA, or `fast-check` is not
   4.9.0. Stop: the clone is not the tree this packet was reviewed against, or the pinned
   counterexamples of sections 8.1 and 8.2 were recorded under another generator.
2. Step 0b extracts other than 17 patches or 42 fault patches. Stop: this document is not the one
   reviewed.
3. A patch fails `git apply --check`. Stop and report the exact error; never hand-edit a file into
   shape.
4. A baseline (step 0c or a slice's step 1) exits non-zero. Stop, except for the known cases in 11.
5. A red checkpoint shows **no** failure, or different diagnostics than section 6 names; or slice 5's
   characterisation (step 3) **fails**. Either means the tests did not land as written.
6. An adopted-set green run differs from its step-1 number by anything but the delta section 6 gives
   (0 in slices 3 and 4, + 1 in slice 5). Stop: a "behaviour-neutral" move changed behaviour.
7. A proof filter matches zero tests, or more than one. Stop.
8. A fault leaves its named test passing. Restore, re-read the table, redo once; if it still passes,
   stop — the check may not be where this packet says it is.
9. The strict OpenSpec block exits non-zero, or `passed` falls below step 0's number.
10. At hand-over, the status shows any path outside the slice's own list. Stop.
11. **Known, not this packet's:** `claims.db.test.ts` › `bounds terminal lock contention and retries
until a held write commits` failing; a single `Test timed out in 5000ms` in one of the twenty
    adopted files during a serial run on a loaded host; or a `DiBagCloseCancelledError`
    (`DI_BAG_CLOSE_TIMEOUT`) from the `live-application` fixture's own `afterEach` retirement. Record
    it, rerun **that file alone once**, and stop only if it fails again.
12. Anything asks for a `git` state change in the clone, a network call, a browser, or `--no-verify`.

## 11. Out of lane

- `modules/plan-feed/{contract,plan-feed.feature,plan-feed.resource}.ts` and their suites:
  `PlanFeedHost` does not change, and nothing in the feed's gates does.
- `modules/calendar-markers/*`: its call site in `use-plan-read.ts` changes; the module does not.
- `lib/project-stream.ts`, `live-editing.ts` (`FocusIntent`), `toasts.tsx`, `app-router.tsx`,
  `presence-panel.tsx`: read only.
- Every existing test file except `plan-writer.test.ts` (the named fixture edit, section 6 slice 3
  step 3) and `project-page.test.tsx` (one new example, no edit).
- `runtime/*`, `lib/remembered.ts`, the preferences module, `src/testing/*`: untouched.
- `project.json`, `vitest.config.ts`, `vitest.node.config.ts`, `vitest.zoned.config.ts`, `bun.lock`,
  `package.json`: untouched. No dependency is added, removed or bumped.

## 12. Hand-over to the next packet

- **Task 9 (the broad `ProjectApi` behind private repository ports)** is separable and needs nothing
  more from this packet. What it will find: `PlanFeedForReader` is now `{ projectId, api, subscribe,
isActiveReader, plan, refusals }` — `api` and the refresh owner's factory are its target; `PlanWriterHost`
  no longer carries anything React owns except the two reads `readRefreshOwner` / `isActiveReader`
  (closures over `feedRef` and the table's `activeProject`/`activeApi` refs) and `rereadResources`,
  which go when task 10 moves the feed's ownership; `stepStack` and `usePlanDependencies` still call
  `api.undo`/`redo`/`addDependency` directly, and the other command hooks still take `api`.
- **Task 10** builds, per selected project, what `openProjectPorts()` in `use-plan-read.ts` and
  `useState(createPresence)` in `project-page.tsx` build per mount today — the delivered plan, busy,
  the two channels, presence — and publishes their read halves through the project context. None has
  a lifetime to dispose of.
- **Task 11** decides whether presence resets on a project switch (it does not today, section 1) —
  a reader-visible choice with its own scenario.
- `useChannelListener` and `useSnapshotChanges` are general: a later service that announces events
  or wants per-change side effects uses them rather than a hook of its own.
- A **count-of-holds** busy rule (section 13, assumption 1) was designed and rehearsed green against
  the adopted set; it would change what a reader sees in two cases and needs its own OpenSpec change.

## 13. Assumptions recorded rather than asked

1. **Busy keeps its exact rule.** A count of holds — busy while any gesture is out, every gesture
   giving back only its own hold — was built first, passed its model test and the twenty adopted
   files, and removes the `isActiveReader()` guards. It was dropped: it changes what a reader sees
   when two gestures overlap (the progress cursor stays until the last one ends, where today the first
   to end clears it) and when a departed reader's gesture ends (busy clears then, where today it stays
   until the replacement's own gesture ends). The proposal promises no such change and the map asks
   that this ownership move, "do not weaken it". The rule stays in the gestures; the value and its
   telling move into the store.
2. **Presence is one store per page mount, not per project**, so a switch does not reset it — exactly
   as the `useState` it replaces. Resetting it is arguably right (the existing test's comment calls
   a stale list under a new project's name dishonest) but reader-visible, and task 11's.
3. **The stores are plain objects built by the mounts that owned the state**, through a lazy
   `useState` initializer. The map's warning about lazy initializers applies to services with
   disposal; these hold no resource, so StrictMode's discarded second initializer leaks nothing.
4. **One store per table mount, not per project id**, because the table suites rerender one mount
   with a new `projectId` (section 4.1) and see the previous project's rows until the new one's first
   delivery, as the `useState`s gave them. `treeReadProject` stays a ref set by `settle`, which is
   what keeps `hasSuccessfulTreeRead` false for a new `projectId` until its own tree lands.
5. **A channel rethrows listener failures after delivering to everyone**, rather than stopping at the
   first one or swallowing them (R5: nothing is dropped; the others are still told).
6. **Seed `20260924`, 300 runs, `size: 'max'`, at most 16 commands** for all four model tests: each
   finishes in one to three seconds and every coverage counter is non-zero. A future author who
   changes the commands, seed or version re-rehearses and re-pins.
7. **Serial runs for the multi-file suites** (`--no-file-parallelism --maxWorkers=1`), as the
   project's own `test` target runs them.
8. **`fc.scheduler()` without React's `act`** in the model tests: the stores and the channel have no
   React surface; the scheduler orders asynchronous producers and unsubscriptions.
9. **Five moved `Proof:` comments keep their text and dates** (section 3.6); the three whose checks
   can be broken at the new site are re-observed (`t1`, `s1`, `s5`) and get a dated sentence of their
   own beside the old one.

## 14. The brief, point by point

### 14.1 The non-negotiables of the commissioning brief

| Requirement                                                                                               | Where this packet meets it                                                                                                                           |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| project-owned plain stores for the plan snapshot, connection/roster and busy, with update rules           | §3.2–3.4, §7.3, §7.6; `PlanFeedForReader` and `PlanWriterHost` take no React setter (§3.6)                                                           |
| each store: state machine record, model test with its own oracle, scheduler, pinned seed and runs         | §3.1–3.4; four model tests (§7.2, §7.5), seed `20260924`, 300 runs, fast-check version asserted                                                      |
| at least four rehearsed sabotages per model test, shrunk counterexamples pasted                           | §8.1 (5 channel, 4 busy), §8.2 (5 delivered plan, 4 presence), each with run, counterexample and cause                                               |
| narrow ports for the command register and refusal publication; focus stays component-owned                | §3.1, §3.5, §3.6: `commandsIssued` and `refusals` channels; `FocusIntent` stays in the table                                                         |
| delivery through hooks, no catch-free path that can throw a lifecycle refusal into render or effect       | §3.5: no store or channel has a lifecycle; `useSyncExternalStore`, `useChannelListener`, `useSnapshotChanges`                                        |
| withdrawal between render and effect, superseded callbacks, replacement while mounted: example + mutation | §3.5 tables: `l1`–`l5`, `u1`–`u5`, each its own test and fault (§8.3, §8.4)                                                                          |
| existing stale-owner, busy, refusal, roster, focus behaviour preserved and cited; no assertion weakened   | §3.7; adopted set unchanged in slices 3 and 4 (1214 → 1214); the one fixture edit named (§6 slice 3 step 3)                                          |
| every fenced diff `git apply --check`s extracted in slice order; counts asserted; output pasted           | §9.1                                                                                                                                                 |
| intermediate trees typecheck; reds rebuilt from base + slice prefix                                       | §9.1 last paragraph; §6 red checkpoints                                                                                                              |
| fresh, relative counts; empty status at step 0; owned-path hand-over                                      | §6 step 0a–0c; every expectation is "step 0's number ± the slice's own"; §6 hand-over lists                                                          |
| real `sh`, `set -euo pipefail`, conditional status capture, durable wrappers, serial multi-file Vitest    | §6 `run-check.sh`, `expect-status.sh`; §8 procedure; every multi-file run serial                                                                     |
| exact proof filters, typographic apostrophes, checked to match exactly one; no `Proof:` in listings       | §8 filter block (the `+` escaped in `t2`); §7 carries only moved comments (§3.6)                                                                     |
| executor dates by observation; no private absolute paths except launcher lines; R2 names                  | §8 opening; slice 5 step 4; the Dispatch block is the only one                                                                                       |
| no `any`/`!`/unchecked casts without a boundary comment                                                   | none added outside tests; the tests use `!` nowhere and cast nothing                                                                                 |
| teardown: cleanup before awaited retirement, `try/finally`, identity-tracked rejections                   | hook tests' `afterEach(cleanup)`; every model test drains the scheduler in teardown and **reports** every teardown failure beside the property's own |
| task 8 ticked with a dated note; `verify.md` per slice                                                    | §7.17 and slice 5 step 4; §6 "Verification record entries"                                                                                           |

### 14.2 The batch-6 addendum's twenty points

| Point                       | Assessment                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Reproduced red           | Met for slices 1–4: compiler and runtime reds rebuilt from base + slice prefix, diagnostics pasted (§6). Slice 5 has none by design and says so; its teeth are `q1`, `q2`.           |
| 2. Typecheck and lint       | Met: both native per slice, exit 0 on each rehearsed commit, every slice committed with lefthook on (§9.3).                                                                          |
| 3. Path counts              | Met: each hand-over lists the slice's exact paths, including the Proof-only `use-plan-read.ts` in slice 5; the planner's own commits add only this document.                         |
| 4. Failure-visible commands | Met: every check records its own status and `expect-status.sh` asserts it.                                                                                                           |
| 5. HEAD-reading tests       | N/A: no project, target or CI path is renamed.                                                                                                                                       |
| 6. Sandbox constraints      | Met: whole targets, build, devsync and Chromium are the planner's, with expected deltas (§9.4).                                                                                      |
| 7. Known race               | Met: named, one rerun, no repair authority (§10.11).                                                                                                                                 |
| 8. Names                    | Met: no product name in identifiers; no module id added or changed.                                                                                                                  |
| 9. Packet form and evidence | Met: five slices, each ending in a planner commit with its exact subject; per-slice relative baselines; production-path negatives with observed messages; nothing silently skipped.  |
| 10. Pins                    | Met: no pin touched; fast-check 4.9.0 checked at step 0 and asserted by each model test.                                                                                             |
| 11. Pipeline exit handling  | Met: the fault `diff` form after one command; the filter count and the placeholder check use `if …; else rc=$?; test "$rc" -eq 1; fi` on single commands.                            |
| 12. Planner chaining        | Met: the extraction script stops at the first failed check (§9.1), rehearsed with a broken patch.                                                                                    |
| 13. Module index            | N/A with reason: no `fe-01` module carries a `module-index` block (§4.1); devsync with the slices committed raised no unindexed-path refusal (§9.3).                                 |
| 14. Bun directory filters   | N/A: every suite runs through Vitest from `apps/wbs/fe-01`.                                                                                                                          |
| 15. Interleaving property   | Met for every store and the channel: scheduler-ordered producers and disposals, pinned seed and runs, counted coverage (§3.1–3.4, §7.2, §7.5).                                       |
| 16. Model-based remedy      | Met: written machines first (§3), four reference models with their own oracles, re-entrant commands from inside listeners, 18 rehearsed sabotages with counterexamples (§8.1, §8.2). |
| 17. Seeded evidence         | N/A: no slice reads an earlier attempt's evidence.                                                                                                                                   |
| 18. Symbol-based checks     | N/A: no code-shape checker is introduced.                                                                                                                                            |
| 19. Missing-file grep       | Met: every grep over a file follows a `test -f` or reads captured output.                                                                                                            |
| 20. Honest limits           | Met: §3.8 and §9.5 state what the models and the rehearsal do not establish; §13 records the two reader-visible choices left to tasks 10 and 11.                                     |

## 15. Ready to commit

| Slice | Paths                                                                                                                                                                                                                                                                                                                                                                                 | Subject                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1     | `spec.md`, `verify.md`, `apps/wbs/fe-01/vitest.node-suites.ts` — **3 modified**; `apps/wbs/fe-01/src/modules/{channel.ts,channel.model.test.ts}`, `apps/wbs/fe-01/src/modules/plan-writer/{busy-store.ts,busy-store.model.test.ts}` — **4 new**                                                                                                                                       | `feat(frontend): add the project channel and busy store with their model tests`      |
| 2     | `spec.md`, `verify.md`, `apps/wbs/fe-01/vitest.node-suites.ts` — **3 modified**; `apps/wbs/fe-01/src/modules/plan-feed/{delivered-plan-store,presence-store}{.ts,.model.test.ts}` — **4 new**                                                                                                                                                                                         | `feat(frontend): add the delivered plan and presence stores with their model tests`  |
| 3     | `spec.md`, `verify.md`, `apps/wbs/fe-01/src/modules/plan-writer/{contract.ts,plan-writer.feature.ts,plan-writer.test.ts}`, `apps/wbs/fe-01/src/modules/plan-feed/composition.ts`, `apps/wbs/fe-01/src/components/wbs/{use-plan-read.ts,wbs-table.tsx,use-plan-dependencies.ts}` — **9 modified**; `apps/wbs/fe-01/src/components/wbs/use-channel-listener{.ts,.test.tsx}` — **2 new** | `feat(frontend): announce commands and refusals and hold busy through project ports` |
| 4     | `spec.md`, `verify.md`, `apps/wbs/fe-01/src/modules/plan-feed/composition.ts`, `apps/wbs/fe-01/src/components/wbs/{use-plan-read.ts,wbs-table.tsx}` — **5 modified**; `apps/wbs/fe-01/src/components/wbs/use-snapshot-changes{.ts,.test.tsx}` — **2 new**                                                                                                                             | `feat(frontend): select the delivered plan from its store instead of twenty setters` |
| 5     | `spec.md`, `verify.md`, `tasks.md`, `apps/wbs/fe-01/src/components/wbs/{project-page.tsx,project-page.test.tsx,use-plan-read.ts}`, `apps/wbs/fe-01/src/modules/{plan-feed,plan-writer}/README.md` — **8 modified**                                                                                                                                                                    | `refactor(frontend): hand the header presence from a store and close task 8`         |

(`spec.md`, `verify.md` and `tasks.md` are under `openspec/changes/adopt-frontend-lifetimes/`.) After the
last commit the host gate runs on the shared build host with the committed hash, and its printed
running-hash line and exit status are recorded. Anywhere else it is reported as not run, with the
reason — never as passed. The Chromium runs of §9.4 are reported the same way until they have happened.
