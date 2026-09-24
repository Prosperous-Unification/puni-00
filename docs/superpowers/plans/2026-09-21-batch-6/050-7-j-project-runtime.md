# 050.7 j — the project runtime: one owner for the selected project's plan services

|             |                                                                                                                                                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **thirteenth packet**                                                                                                                                                                                                    |
| Size class  | M — three slices, each one executor attempt                                                                                                                                                                                                                                                                         |
| Predecessor | [050.7h](050-7-h-project-api-ports.md) — `ProjectServices`, `PlanCommands` and the project composition root, and its section 12, "Hand-over to the next packet"                                                                                                                                                     |
| Advances    | OpenSpec task **10** of `adopt-frontend-lifetimes` — **not ticked**: every service it names but saved plans moves into the project runtime, and the box stays unchecked with a dated note naming saved plans as the outcome still owed (section 3.8). Item 4 of the lifetime map's "Required implementation order". |
| Revision    | Third. Rounds 1 and 2 said READY AFTER FIXES; sections 16 and 17 dispose of their findings.                                                                                                                                                                                                                         |
| Schema      | OpenSpec change `adopt-frontend-lifetimes`, already `sdd-lean`. One new requirement with three scenarios, one per slice; packet g's presence scenario amended in slice 3; task 10 annotated, not ticked.                                                                                                            |

## 1. Goal, non-goals, and the cut

**Goal.** The selected project's plan services are **one DI Bag project runtime**, built outside React
and owned by **one project owner** that `ProjectPage` holds above the header and the table: the
delivered plan, busy, presence, the refusal and command-issued channels, the plan feed, the calendar
marker gestures, the plan writer and the plan commands, one of each per selected project. The owner
withdraws the current runtime **synchronously** when the selection moves, the page goes, or Strict
Mode re-enters, retires it **once**, and publishes the next only after that retirement succeeded; a
failed retirement shows the sanitized fatal state. The table opens and closes nothing: it receives
`ProjectRuntime`, and every "is this reader still on screen" guard it kept over its own refs is the
runtime's `isCurrent` now. Presence becomes project-owned and **resets on a switch** (section 3.6).

**Non-goals.**

- **Saved plans.** The shelf keeps its own keyed watch and has no feature facade; the lifetime map
  lists that facade as a prerequisite. Task 10 names saved plans, so task 10 is **not ticked**.
- **Task 11's own tests.** Route unmount through the router, Strict Mode re-entry through the page,
  and an example that opens the table's commit-to-effect window stay task 11's; the undo stack's
  `isCurrent` guard and the writer's `isActiveReader` are carried, not re-proved (section 3.8).
- **Tasks 6, 7, 12, 13**: the session runtime, Log out, module indexes and isolated type checks, the
  architecture checks. No `module.ts`, no module identifier, no `module-index` block.
- **A lifecycle-failure reporter for the project.** The page shows the slot's sanitized fault; it
  logs nothing (section 3.8).
- No dependency, `project.json`, `bun.lock` or pin changes.

**What a reader sees change**, and nothing else: the header's presence is reset by a switch; a
project whose retirement fails shows the sanitized fatal state in place of the page's main; and the
table appears once its runtime is live — a few microtasks after the pick rather than in the same
commit (one page test's synchronous query becomes a `waitFor`, section 3.7).

**The cut, and why three slices.** Measured, not assumed (section 4.2):

1. **The runtime and its owner**, plain TypeScript with node-tier tests and no React:
   `runtime/project-runtime.ts` (`installProjectRuntime`, `createProjectOwner`), `ProjectRuntime` in
   the project contract, the owner's model test and seven examples. Delivery changes by one type
   import. This slice carries the state machine and its ten model faults.
2. **Delivery**: the table takes `project: ProjectRuntime`; the page opens and leaves the runtime
   through `createProjectOwner`; the seventeen table suites draw through a test fixture,
   `WbsTableOverClient`, by a script (256 sites); four named test edits; two new page examples.
3. **Presence from the runtime**, reset by a switch; the READMEs, the lifetime map and task 10's
   dated note.

## 2. Read first

| File                                                                                   | Why                                                                                                                                 |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                           | Rules R1–R5 and the routing index.                                                                                                  |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                  | "Execution contract", "Standard blocks every packet uses" — the strict OpenSpec block and the fault form.                           |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`             | "Project owner", "Replacement and cleanup policy" and the exact lifecycle tests 8–14: what this packet delivers and what it leaves. |
| `docs/superpowers/plans/2026-09-21-batch-6/050-7-h-project-api-ports.md`, sections 6–9 | The step-0, extraction and fault procedure this packet repeats.                                                                     |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`                                          | The one serialized owner every lifetime uses; the project owner is one slot plus identity.                                          |
| `apps/wbs/fe-01/src/runtime/application-runtime.ts`                                    | `acquireTransactionally` and the application runtime: the shape the project runtime repeats.                                        |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`                                   | The feed effect, the markers and writer memos, `openProjectPorts` and the `activeServices` guards this packet moves.                |
| `apps/wbs/fe-01/src/components/wbs/wbs-table.tsx`, `project-page.tsx`                  | The table's commands memo and props; the page's client, presence store, stream factory and table render.                            |
| `apps/wbs/fe-01/src/modules/plan-writer/busy-store.model.test.ts`                      | The `fc.asyncModelRun` form the owner's model test follows.                                                                         |

## 3. Design

### 3.1 The state machine

This section is the record lesson 16 of the batch addendum asks for; the owner's model test executes
it and names it in its JSDoc, and the same rules are JSDoc on `createProjectOwner` and
`ProjectRuntime.isCurrent` (R3).

**The owner** is one `LifetimeSlot<ProjectRuntime>` per `ProjectPage` mount. Its states are the
slot's: `empty`, `constructing`, `live(r)`, `retiring`, `fatal(terminal)`. **A runtime** built by it
moves through `built → current → withdrawn → retired`, or `built → withdrawn → retired` when a newer
request overtook it after its factory ran, or `withdrawn → stuck` when its disposal fails or outruns
the budget (the owner becomes terminally fatal).

| From                      | Event                                                                | To                                                                                   |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `empty`, `fatal` (not t.) | `open(p)`                                                            | `constructing`; the runtime for `p` is installed, then `live(r)` if still the newest |
| `live(r)`                 | `open(q)` or `leave()` — **synchronously**, before either returns    | `retiring`; `r` is withdrawn: `r.isCurrent()` is false from here on                  |
| `retiring`                | `r`'s disposal succeeded (feed closed, stream unsubscribed, once)    | `constructing` for an `open`, `empty` for a `leave`                                  |
| `retiring`                | `r`'s disposal rejected or outran the budget                         | `fatal`, terminal; every later `open` is refused with the same state                 |
| `constructing`            | the construction threw after opening the feed                        | the feed is released, then `fatal`, not terminal                                     |
| any                       | a newer request overtook this one                                    | it builds nothing, or gives back what it built; it settles quietly                   |
| withdrawn `r`             | a read answers, the stream frames, a reader rereads or adds a marker | nothing reaches anybody, and no request is sent                                      |

**Events** the model generates: `open(p1|p2)`, `leave`, one scheduled answer, all answers (`drain`),
a stream frame to any runtime ever built (`change`, `connect`, `disconnect`, `presence`), a captured
`reread` and a captured marker `add` from any runtime ever built; `reenter(p1|p2)` — an `open` issued
from **inside the owner's own next notification**, as a component re-rendered by the owner's store
would issue it — and `openBroken(p1|p2)`, an `open` whose installer opens the feed and then raises
**`PartialAcquisitionError`** because its commands cannot be built. Each runtime gets its own fake
client and stream, so every request, frame and close is attributed to the runtime that made it; each
runtime's close waits on one scheduled step before the real close runs, which is what opens the
interval between withdrawal and disposal in which late work can still arrive.

**Invariants**, each asserted by `project-runtime.model.test.ts` against its own records, never read
back out of the owner:

- **P1 — one current.** At every observation point at most one runtime answers `isCurrent()`, and it
  is the one the owner publishes `live`.
- **P2 — withdrawal is instant.** From the synchronous return of `open` and `leave`, no runtime
  answers `isCurrent()` until the next one is published.
- **P3 — nothing after withdrawal.** A withdrawn runtime's delivered plan and presence are the very
  objects they were at withdrawal, whatever answers, frames or gestures arrive afterwards; a runtime
  overtaken before it was ever published never changes from what it was built with.
- **P4 — nothing sent for a departed reader.** A reread or a marker gesture asked of a withdrawn
  runtime sends no request.
- **P5 — once.** When everything has settled, every runtime but the live one had its feed closed
  exactly once and its stream, if it opened one, unsubscribed exactly once; the live one neither;
  no runtime opened two streams; an unbuildable runtime's feed was given back once per time its
  installer ran.
- **P6 — the latest wins.** When everything has settled the owner is `live` with the last project
  opened; `fatal`, **not** terminal, when the last request could not be built; `empty` after a
  `leave` — or, in a run where some request could not be built, `empty` or non-terminal `fatal`,
  because a retirement asked of a slot a failed construction left `fatal` holds nothing and changes
  nothing, and which request built last is the scheduler's choice.
- **P7 — every transition settles.** No `open` or `leave` rejects: every refusal in the model comes
  from the owner's own runtimes or from supersession, and the owner classifies both as modelled
  outcomes (section 3.3). A rejection reaches the teardown and fails the property.

What the owner's model does **not** generate, and where it is covered instead: a disposal that
rejects or outruns its budget (the model's close is the real one behind one scheduled step and never
fails), and a request issued from inside the **installer** itself. Both are
`lifetime-slot.model.test.ts`'s (`disposal: 'rejects' | 'never'` under a 1 ms budget, `reentry:
'factory'`), and the owner's handling of a failed retirement is the example `o2`'s.

Interleavings counted over the pinned run and asserted non-zero: an answer landing after its runtime
was withdrawn; a frame to a withdrawn runtime; a reread and a marker gesture by a withdrawn runtime;
a `leave` with nothing current; reopening the project already asked for; a switch while live; a
stream opened; an `open` issued from inside a notification; an unbuildable installer run; a `leave`
in a run with an unbuildable request.

### 3.2 The runtime — `installProjectRuntime`

One DI Bag graph per selected project, built synchronously (the slot's `Acquire` is synchronous, and
DI Bag runs sync factories inline), returned through `acquireTransactionally` so a construction that
throws after the feed opened releases it. Registrations:

| Binding                                                     | Built from                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `plan`, `busy`, `refusals`, `commandsIssued`, `presence`    | packet g's stores and channels, one each                                                                                                   |
| `feed` — **the one owned disposable**, `DiBag.withDisposal` | `services.planFeedFor({ projectId, subscribe: streamInto(presence), isActiveReader: isCurrent, plan, refusals })`; disposal `feed.close()` |
| `readRefreshOwner`                                          | `() => (isCurrent() ? feed.owner : null)`                                                                                                  |
| `reread`                                                    | reads only while `isCurrent()`                                                                                                             |
| `markers`, `writer`, `commands`                             | `services.calendarMarkersFor`, `createPlanWriter`, `services.planCommandsFor(projectId)`                                                   |

`streamInto(presence)` wraps the source's stream opener: `onConnectionChange` tells the presence
(only while current) and then the feed; `onPresence` tells the presence (only while current).

`ProjectRuntime` publishes `projectId`, `isCurrent`, `plan` (read side), `presence` (read side),
`busy`, `refusals`, `commandsIssued`, `reread`, `markers`, `writer`, `commands` — the example
`publishes the project’s feature and store surfaces, and nothing else` enumerates exactly these
eleven keys (fault `k1`). No bag, client, port, refresh owner or stream is reachable (rule K2).

### 3.3 The owner — `createProjectOwner`

`open(projectId, source)` is `slot.replace(() => install(...))`, `leave()` is `slot.retire()`. What
the owner adds to the slot is **identity** and **classification**.

- Identity: each runtime is handed `isCurrent = () => slot.snapshot() is live with this very
runtime`, so a runtime replaced by another project's is not current although the slot is live
  again (faults `m1`, `m9`).
- Classification, **by the refusal itself**: the owner wraps its installer and each runtime's close
  and records, by identity, every failure that leaves one of its own runtimes — a construction that
  throws (a `PartialAcquisitionError` is rewrapped so its release is recorded too), a release that
  rejects, a retirement that rejects. The slot publishes `fatal` for each of these before it
  rethrows it, so `settle` resolves for a recorded refusal (faults `o2` for a retirement, `o3` and
  `m10` for a construction, `o4` for a partial acquisition's release) and for
  `TransitionSupersededError` (fault `o1`), and rethrows anything else with its cause: a fault of the
  slot itself. It no longer reads `slot.snapshot()` after the rejection, which a request issued in
  between may already have moved from `fatal` to `constructing` (round-1 review, Important 2). The
  earlier snapshot-reading form was rehearsed against the model with `reenter` and `openBroken` and
  **passed** — the ordering accident the review traced holds under every generated interleaving —
  so the change is recorded as removing a dependence on ordering, not as fixing an observed failure.

The page therefore `void`s both methods. `install` and the budget are injectable for tests;
production passes neither.

The slot's own guarantees — synchronous withdrawal, one transition at a time, superseded requests
build nothing, a failed or expired retirement is terminal, a failed construction releases what it
acquired — are proved in `lifetime-slot.test.ts` and `lifetime-slot.model.test.ts` and are not
re-proved here; the project examples exercise two of them through the owner (a failed retirement,
a half-built runtime).

### 3.4 Delivery: who receives what

| Consumer                     | Before (base)                                                                                                            | After                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectPage`                | `projectServicesOver(api)` in a memo, a page-level presence store, `<WbsTable key={selected} projectServices subscribe>` | the same memo; `useState(createProjectOwner)`; an effect `open(selected, { services, subscribe })` / cleanup `leave()`; the table drawn only while `live`, keyed by the runtime's project; `LifetimeFault` when `fatal` |
| `WbsTable` (`WbsTableProps`) | `projectId`, `projectServices`, `subscribe`; builds `commands` in a memo                                                 | `project: ProjectRuntime`; `projectId` and `commands` read off it                                                                                                                                                       |
| `usePlanReadState`           | `useState(openProjectPorts)`                                                                                             | selects from `project.plan`, `project.busy`; hands on `project.refusals`, `project.commandsIssued`                                                                                                                      |
| `usePlanRead`                | opens the feed in an effect; builds markers and writer in memos; five `activeServices` guards                            | `refreshOrMarkStale` is `project.reread`; `run` is `project.writer.run`; `markers` is `project.markers`; the undo stack reads `project.isCurrent`                                                                       |
| the seventeen table suites   | `<WbsTable projectId projectServices={projectServicesOf(X)} subscribe>`                                                  | `<WbsTableOverClient …>` — same props, a fixture that installs one runtime per project, services and stream in its effect (section 3.5)                                                                                 |

### 3.5 The suites' fixture — `src/testing/wbs-table-over-client.tsx`

The page's owner is asynchronous (the slot awaits between withdrawal and publication), and the
suites have always asserted the table synchronously after `render`. The fixture installs the runtime
with the production installer **synchronously in its effect** — inside Testing Library's `act`, so
the table is on screen when `render` returns — withdraws it in the effect's cleanup and closes it
after, and installs the next when `projectId`, `projectServices` or `subscribe` changes. It does
**not** gate the next runtime on the last one's retirement and never shows a fatal state; that is the
owner's, proved by the model test and the page's suite. It is a component, not a cache, because a
runtime must be given back and only an effect cleanup knows when.

### 3.6 Presence: the decision

Packet g kept one presence store per page mount, **not** reset by a switch, and left the decision to
the project runtime (its section 13, assumption 2). **Decided: presence is project-owned and resets.**
Each runtime owns its presence store; its stream writes into it only while it is current; the header
is handed the live runtime's presence, and a constant "nobody, disconnected" while no runtime is
published. Reasons: gw-01 scopes the roster by the project the socket subscribed to, so a previous
project's list under the next project's name is false; `presence-store.ts`'s own JSDoc already says
"never a previous project's list under a new project's name"; and a store that outlives the runtime
that fills it is exactly the ownership this change removes. Recorded in the delta spec (slice 3's
scenario "A project switch resets presence", and packet g's scenario "The header selects presence
from a store" amended to name the runtime's store).

### 3.7 Existing behaviour, and the tests that hold it

The twenty adopted files run whole in slices 2 and 3: **1215 → 1217 → 1218**, the additions being
this packet's three page examples. Four existing tests change, each a **named edit** (section 6,
slice 2 step 3), because what they asserted was the table owning its feed:

| Test                                                                                                      | Edit, and why                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan-read-and-write.test.tsx` › `refetches when the subscription reports a change`                       | `expect(unsubscribed).toBe(true)` after `view.unmount()` is awaited (`waitFor`): the stream is closed by the runtime's retirement, which DI Bag runs after `close()` returns, not inside React's unmount. The fact — the stream is unsubscribed once the table goes — is unchanged.                                                                                                                                                 |
| `plan-read-and-write.test.tsx` › `creates a live second owner after StrictMode cleans up its first setup` | `expect(closed).toBe(1)` after `view.unmount()` is awaited, for the same reason. `opened` stays exactly 1 and `closed` exactly 1.                                                                                                                                                                                                                                                                                                   |
| `plan-read-and-write.test.tsx` › `announces an arrangement after the same reader renews its subscription` | **Retitled** `drops an arrangement whose reader renewed its subscription, and leaves the new one idle`, and its toast expectation becomes `[]`. A new stream source is a new runtime — a new reader — exactly as a new client is, so the old gesture's success is not announced into it. The busy and enabled assertions are unchanged. Production's stream factory is memoised on `streamDeps` and never renews under one project. |
| `project-page.test.tsx` › `leaves the table out of the banner and in the page’s main`                     | the synchronous `querySelector('[data-grid]')` after the pick becomes a `waitFor`: the table is drawn once the runtime is live, a few microtasks after the pick.                                                                                                                                                                                                                                                                    |

Every other behaviour is held by unchanged tests, among them the stale-owner cases in
`plan-read-and-write.test.tsx` (`does not spend an old API success against its busy replacement`,
`does not toast an old API mutation refusal into its replacement`, `ignores an old API read that
settles by %s on the same project`), `plan-table.test.tsx` › `keeps an add burst and its refetch
inside the project where it started`, `project-page.test.tsx` › `recovers a persistent %s without
replacing the registered socket`, `starts a created project without the previous project’s row
anchors`, and g's `hands the presence slot who the project’s stream says is here, and its connection`.

### 3.8 What this packet does not claim

- **Task 10 is not done**: saved plans are not in the runtime. The box stays unchecked with a dated
  note; the owner task is task 10 itself, behind the lifetime map's saved-plans facade prerequisite.
- **One feed, one owner.** `createPlanReading` calls `openOwner()` exactly once per feed
  (`modules/plan-feed/plan-feed.resource.ts`, `const owner = openOwner();`), and a runtime has one
  feed, so a feed never renews its refresh owner and "the same reader renewing its coordinator" no
  longer exists: a new stream source is a new runtime. That is what makes the retitled test in
  section 3.7 honest, and it is the fact `plan-writer.feature.ts`'s stale note and task 11's
  follow-up should cite.
- **The undo stack's guard is simplified, not carried.** It was `owner !== null &&
feedRef.current?.owner === owner && activeProject.current === projectId &&
activeServices.current === projectServices`; it is `project.isCurrent`. The captured-owner half is
  dropped because it is equivalent under one owner per feed, and `readRefreshOwner` answers `null`
  once the runtime is withdrawn.
- **Carried, not proved.** The writer's `isActiveReader: isCurrent` inside the runtime: removing it
  was rehearsed against `does not spend an old API success against its busy replacement` and the
  test **passed** — busy stores are per runtime now, so an old gesture lowering its own runtime's busy
  changes nothing a reader sees, and `readRefreshOwner` already refuses its outcome (fault `m6`
  proves that one). The undo stack's `project.isCurrent` in `use-plan-read.ts`: made always-true and
  run against `plan-read-and-write`, `plan-keyboard`, `plan-toolbar` and `plan-table` (262 tests), no
  test failed — as for packet h's four guards, only a test that opens the window between a commit and
  its passive effect can reach it; task 11 owns that test. The table's `key`: with the owner, a
  switch normally draws nothing between two runtimes, which remounts the table by itself; removing
  the key no longer fails `starts a created project without the previous project’s row anchors`
  (rehearsed), so its old `Proof:` line — now false — is replaced by a comment saying why it stays.
- **Removed `Proof:` comments, and where their checks went.** Packet g's markers-memo note (`() =>
undefined` for `announceRefusal`) goes with the memo; the check is the runtime's markers wiring,
  proved by `w1`. Packet g's two presence notes in the page's stream factory go with those lines;
  the checks are the runtime's (`r1`, `r2`) and the page's pass-through (`x1`, `x2`). Packet h's
  executor writes two comments into regions this packet removes by script — `t1` above the table's
  commands memo, whose check no longer exists (commands are per runtime), and `t2` at the writer's
  `isActiveReader`, carried as above. `plan-writer.feature.ts`'s note that "replacing it with
  `isCurrent()` suppressed the valid toast after a same-reader subscription renewal" no longer
  describes an observable case (the renewal is a new runtime now); that file is out of lane and the
  note is left for task 11.
- **No lifecycle-failure reporter, and one fatal nobody sees.** On a switch a project fatal state is
  drawn, not logged. On **route unmount** and on **Strict Mode's cleanup** the page's effect cleanup
  calls `void projectOwner.leave()`; if that retirement fails, `settle` resolves (it is a modelled
  refusal), the page that would draw the fatal state is gone, and nothing logs it — the failure is
  invisible, which rule R5 does not accept. **No code change here, by choice:** the application
  bootstrap's console report (`showFatal` in `application-bootstrap.tsx`) is local to that function
  and reports the application slot's own fault; exporting a seam from it is a change to the
  application lifetime, not one line. Named residual, owned by task 7 (Log out) and task 11: route
  the project owner's terminal fault to the application's lifecycle report, or make the session's
  retirement join and report the project's (section 12).
- **`LifetimeFault`'s wording** ("Nothing here can put it back — reload") is exact for a failed
  retirement, which is terminal; for a failed construction, which is not terminal and which no
  production graph can produce today, picking another project would build again. Recorded, not
  changed.
- The window in which the header shows nobody — between withdrawal and the next runtime's
  publication — is microtasks long; the page test proves the reset (the next project never shows the
  old list), not the length of that window.
- `modules/project/composition.ts`'s JSDoc still says the project lifetime "turns this into the
  project runtime"; the runtime is built over it instead. Left: packet h's executor writes four
  comments into that file.

## 4. Verified facts

Every number is a **fresh observation from this packet's own rehearsal** on 2026-09-24, on
`a687bf38` — the batch-6 planning head `473d00db` with packet h's three rehearsal commits laid on it,
which carries packet g's real merged code — and on three rehearsal commits laid over it, one per
slice. None is a stop condition: each slice records its own baseline in step 0 and compares
relatively.

### 4.1 The code as it stands

| Fact                                                                                                                                                                                         | Where                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| the table opens its feed in an effect, builds markers and writer in memos, and five guards compare `activeServices.current === projectServices`                                              | `use-plan-read.ts`, `usePlanRead`                            |
| the delivered plan, busy and the two channels are one `useState(openProjectPorts)` per table mount                                                                                           | `use-plan-read.ts`, `usePlanReadState`                       |
| the table builds `commands` in `useMemo(() => projectServices.planCommandsFor(projectId), [projectServices, projectId])`                                                                     | `wbs-table.tsx`, `WbsTable`                                  |
| the page holds one presence store per mount, written by its stream factory, not reset by a switch                                                                                            | `project-page.tsx`, `ProjectPage`                            |
| `LifetimeSlot` withdraws synchronously and notifies from a microtask; `acquireTransactionally` is exported for every later lifetime                                                          | `runtime/lifetime-slot.ts`, `runtime/application-runtime.ts` |
| DI Bag 0.4.0 runs disposers **after** `close()` returns (probed: `after close() returned \| dispose b \| dispose a \| awaited`) and rejects a throwing disposer with `DI_BAG_CLEANUP_FAILED` | `di-bag` 0.4.0, probed in this rehearsal                     |
| the suites draw the table at 256 JSX sites in 17 files, every one `<WbsTable` followed by whitespace; prose writes `<WbsTable>`                                                              | slice 2's script counts them and refuses any other total     |
| React **19.2.8**, Vitest **5.0.0**, fast-check **4.9.0**; `-t` is a regular expression and no proof title here holds a metacharacter but `’`, which matches itself                           | `node_modules/*/package.json`                                |

### 4.2 The measured blast radius

`git diff --stat a687bf38 <slice 3 rehearsal>`: **34 files, 2108 insertions, 583 deletions**; with
`verify.md`, which only the executor writes, the slices touch 35 distinct paths. Slice 1 owns 8 (3
new), slice 2 owns 26 (1 new, and `project-runtime.ts` for one `Proof:` comment), slice 3 owns 10.

| Tree            | Adopted set (20 files, serial) | Page and router | Sandbox node suite |
| --------------- | ------------------------------ | --------------- | ------------------ |
| base `a687bf38` | 20·1215                        | 2·78            | 51·687             |
| after slice 1   | 20·1215                        | 2·78            | 53·695             |
| after slice 2   | 20·1217                        | 2·80            | 53·695             |
| after slice 3   | 20·1218                        | 2·81            | 53·695             |

### 4.3 Planner observations on the base, not stop conditions

- Preferences suite 4·39; zoned (Auckland) 2·3; strict OpenSpec `{"items":114,"passed":114,"failed":0}`.
- The adopted set takes about six minutes serially; every slice that runs it says so, and preamble
  rule 19 applies — poll the log, it is still running.
- The owner's model test runs 300 generated sequences in under a second.

## 5. File plan

Paths under `apps/wbs/fe-01/` unless they start with `openspec/` or `docs/`.

| File                                                                                                    | Slice | Create/modify | Responsibility                                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ----- | ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`                      | 1–3   | modify        | the requirement (slice 1), then one scenario per slice, each before its code; g's scenario amended (3)                            |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                                                   | all   | modify        | one fresh entry per slice, appended                                                                                               |
| `src/runtime/project-runtime.ts`                                                                        | 1     | **create**    | section 3.2 and 3.3: `installProjectRuntime`, `createProjectOwner`                                                                |
| `src/runtime/project-runtime.model.test.ts`, `src/runtime/project-runtime.test.ts`                      | 1     | **create**    | the model test (section 3.1) and seven examples                                                                                   |
| `src/modules/project/contract.ts`                                                                       | 1, 2  | modify        | `ProjectRuntime`, `ProjectSource`, `ProjectStreamHandlers`, `OpenProjectStream`, `PlanRefusal` (1); `ProjectServices`'s JSDoc (2) |
| `src/components/wbs/use-plan-read.ts`                                                                   | 1, 2  | modify        | `PlanRefusal` imported from the contract (1); the table reads the runtime (2)                                                     |
| `vitest.node-suites.ts`                                                                                 | 1     | modify        | list the two DOM-free suites                                                                                                      |
| `src/testing/wbs-table-over-client.tsx`                                                                 | 2     | **create**    | section 3.5                                                                                                                       |
| the seventeen table suites listed in slice 2's hand-over                                                | 2     | modify        | the named fixture edit, by script; three named edits in `plan-read-and-write.test.tsx`                                            |
| `src/components/wbs/wbs-table.tsx`                                                                      | 2     | modify        | `project` prop; commands off the runtime                                                                                          |
| `src/components/wbs/project-page.tsx`, `src/components/wbs/project-page.test.tsx`                       | 2, 3  | modify        | the owner and the fatal state, two examples, one named edit (2); presence from the runtime, one example (3)                       |
| `src/modules/{plan-feed,calendar-markers,project}/README.md`, `src/modules/plan-feed/presence-store.ts` | 3     | modify        | who owns the feed, the markers and presence now                                                                                   |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`                              | 3     | modify        | one dated update under "Project owner"                                                                                            |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                                                    | 3     | modify        | task 10's dated note; the box stays unchecked                                                                                     |

Nothing else. Not `lifetime-slot.ts`, `application-runtime.ts`, the stores, the channel, the plan
feed, marker, writer or commands modules, `modules/project/composition.ts`,
`src/testing/project-services-of.ts`, `lib/*`, `project.json`, `bun.lock` or `package.json`.

### Why the slices are cut where they are

A test file that imports a module that does not exist yet stops compiling, and the commit hook lints
test files, so each slice lands its tests and its implementation together, the tests applied
**first** and a real red observed in between. Slice 1 is the whole lifecycle and its proofs, with no
consumer. Slice 2 cannot be smaller: once `WbsTableProps` takes a runtime, the page and every suite
that draws the table must hand it one. Slice 3 is the one decision (presence) with its own red, and
the documents. `project-runtime.ts` is final after slice 1 (slice 2 only adds a `Proof:` comment to
it); `project-page.tsx` is patched in slices 2 and 3, so every fault in it is slice 3's.

## 6. Slices

Each slice is one executor attempt and ends at a checkpoint: the executor stops and reports, and the
planner reviews and commits before the next slice is dispatched. Every block below is real `sh`, run
from the repository root unless it says `cd`. Every frontend command runs from `apps/wbs/fe-01`, one
at a time — never two Vitest runs at once, and every multi-file run with `--no-file-parallelism
--maxWorkers=1`, as the project's own `test` target runs.

### Step 0 — at the start of **every** slice

**0a. The starting state.** Before running this block, replace `<the SHA named in this attempt's
slice note>` with the 40-character hash the slice note gives (`reviewed base <sha>`); unreplaced, the
block dies on the unterminated quote. It compares that hash with `HEAD` and stops if they differ.

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
```

Expected: `base=` a 40-character hash equal to the slice note's, and an **empty** `status-before.txt`.

**0b. Two helpers, the patches, the two scripts, the fault patches and the adopted list**, written
into `$TMPDIR` so that every later block — each its own shell — can use them.

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
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-j-project-runtime.md
test -f "$packet"
mkdir -p "$TMPDIR/patches" "$TMPDIR/mutations"
# Section 7's fenced diffs, in document order, as 01.diff … 09.diff.
awk -v out="$TMPDIR/patches" '
  /^## 7\. The code$/ { inside=1; next }
  /^## 8\. Proofs$/   { inside=0 }
  inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(find "$TMPDIR/patches" -name '*.diff' | wc -l)
echo "patches=$count"
test "$count" -eq 9
# Section 7's two TypeScript blocks, in document order: the suites script (7.5)
# and the regions script (7.7).
awk -v one="$TMPDIR/suites-over-client.ts" -v two="$TMPDIR/table-regions.ts" '
  /^## 7\. The code$/ { inside=1; next }
  /^## 8\. Proofs$/   { inside=0 }
  inside && /^```ts$/ { n++; capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture && n == 1 { print > one }
  capture && n == 2 { print > two }
' "$packet"
echo "suites-over-client.ts lines=$(wc -l < "$TMPDIR/suites-over-client.ts")"
echo "table-regions.ts lines=$(wc -l < "$TMPDIR/table-regions.ts")"
test "$(wc -l < "$TMPDIR/suites-over-client.ts")" -eq 42
test "$(wc -l < "$TMPDIR/table-regions.ts")" -eq 87
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
test "$count" -eq 23
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
# The seventeen suites that draw the table on its own, relative to apps/wbs/fe-01.
printf '%s\n' src/components/ui/page-shortcuts.test.tsx src/components/wbs/gantt-panel.test.tsx \
  src/components/wbs/optimization-integration.test.tsx src/components/wbs/plan-cards.test.tsx \
  src/components/wbs/plan-cells.test.tsx src/components/wbs/plan-chart-seam.test.tsx \
  src/components/wbs/plan-dependencies.test.tsx src/components/wbs/plan-estimates.test.tsx \
  src/components/wbs/plan-filter.test.tsx src/components/wbs/plan-keyboard.test.tsx \
  src/components/wbs/plan-layout.test.tsx src/components/wbs/plan-read-and-write.test.tsx \
  src/components/wbs/plan-row-dependencies.test.tsx src/components/wbs/plan-row-render-cost.test.tsx \
  src/components/wbs/plan-structure.test.tsx src/components/wbs/plan-table.test.tsx \
  src/components/wbs/plan-toolbar.test.tsx > "$TMPDIR/suites.txt"
test "$(wc -l < "$TMPDIR/suites.txt")" -eq 17
````

Expected: `patches=9`, `suites-over-client.ts lines=42`, `table-regions.ts lines=87`,
`mutations=23`, exit 0. **Applying section 7.N** below always means exactly this, never a hand edit:

```sh
set -euo pipefail
git apply --check "$TMPDIR/patches/NN.diff"
git apply "$TMPDIR/patches/NN.diff"
```

`--check` and the apply are separate commands on purpose: joined with `&&` under `set -e`, a failed
check would not stop the shell. `git apply` without `--index` writes only the working tree, which the
read-only `.git` allows; the `index` lines in the diffs are informational. The nine diffs are
numbered in section order, skipping the two scripts: 7.1 is `01.diff`, 7.2 `02`, 7.3 `03`, 7.4 `04`,
7.6 `05`, 7.8 `06`, 7.9 `07`, 7.10 `08`, 7.11 `09`.

**0c. The baselines every slice records**, before any edit:

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
what the slice itself adds, never an absolute. Rehearsed values are given beside each expectation for
orientation only (section 9.3 has them per slice).

In the sandbox the executor never runs `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e` or `tool-devsync:test`; section 9.4 gives each to the planner with its expected
relative delta.

### Slice 1 — the project runtime and its owner, with the state machine's model test

Owns (8 paths): `spec.md`, `verify.md`, `apps/wbs/fe-01/vitest.node-suites.ts`, and under
`apps/wbs/fe-01/src/`: `modules/project/contract.ts`, `components/wbs/use-plan-read.ts`, and three
new files — `runtime/project-runtime.ts`, `runtime/project-runtime.model.test.ts`,
`runtime/project-runtime.test.ts`.

- [ ] 1. Step 0, then the read-and-write suite:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-base-read env TZ=UTC bunx vitest run \
    src/components/wbs/plan-read-and-write.test.tsx
  bash "$TMPDIR/expect-status.sh" s1-base-read 0
  ```

  Expected `status=0`. Rehearsed: 88 tests.

- [ ] 2. **The contract first (R4).** Apply section 7.1 (the new requirement and its first scenario)
      and rerun the strict block. Expected: exit 0, `passed` equal to step 0's number (rehearsed
      114 → 114).
- [ ] 3. Apply section 7.2: the two new suites. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-red-vitest env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/runtime/project-runtime.model.test.ts src/runtime/project-runtime.test.ts
  bash "$TMPDIR/expect-status.sh" s1-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s1-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 14 errors in 2 files.` — 8 in
  `project-runtime.model.test.ts` (3 × TS2305, 1 × TS2307, 4 × TS7006) and 6 in
  `project-runtime.test.ts` (2 × TS2305, 1 × TS2307, 3 × TS7006); the four that name the cause:

  ```text
  apps/wbs/fe-01/src/runtime/project-runtime.model.test.ts:8:3 - error TS2305: Module '"@/modules/project/contract"' has no exported member 'ProjectRuntime'.
  apps/wbs/fe-01/src/runtime/project-runtime.model.test.ts:15:78 - error TS2307: Cannot find module './project-runtime' or its corresponding type declarations.
  apps/wbs/fe-01/src/runtime/project-runtime.test.ts:6:3 - error TS2305: Module '"@/modules/project/contract"' has no exported member 'ProjectSource'.
  apps/wbs/fe-01/src/runtime/project-runtime.test.ts:11:59 - error TS2307: Cannot find module './project-runtime' or its corresponding type declarations.
  ```

  and Vitest `status=1`, `Test Files 2 failed (2)`, `Tests no tests`, both on `Failed to resolve
import "./project-runtime"`.

- [ ] 4. Apply section 7.3: the contract's new types, the runtime and its owner, the read hook's one
      import, and the two lines in `vitest.node-suites.ts`.
- [ ] 5. **Green checkpoint.**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-green-runtime env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/runtime/project-runtime.model.test.ts src/runtime/project-runtime.test.ts
  bash "$TMPDIR/run-check.sh" s1-green-read env TZ=UTC bunx vitest run \
    src/components/wbs/plan-read-and-write.test.tsx
  bash "$TMPDIR/run-check.sh" s1-green-tiers env TZ=UTC bunx vitest run src/test-tiers.test.ts
  bash "$TMPDIR/run-check.sh" s1-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s1-green-typecheck s1-green-runtime s1-green-read s1-green-tiers s1-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: runtime 2 files, 8 tests (one model test, seven examples);
  read-and-write unchanged from step 1 (88); tiers 5 tests; sandbox = step 0 **+ 2 files, + 8 tests**
  (rehearsed 51·687 → 53·695).

- [ ] 6. Durable lint, from the repository root:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-lint env NX_DAEMON=false bunx nx run wbs-fe-01:lint
  bash "$TMPDIR/expect-status.sh" s1-lint 0
  ```

  An autofixable import-order or Prettier finding is fixed with `bunx eslint --fix <file>`, not
  reported as a stop (preamble rule 17).

- [ ] 7. The eighteen proofs of section 8.1 (`m1`–`m10` on the model, `k1`, `k2`, `r1`, `r2`,
      `o1`–`o4` on the examples), with section 8's procedure: every fault observed first, then the
      `Proof:` comments at the sites the table names.
- [ ] 8. Rerun the runtime pair (`s1-final-runtime`, step 5's command, 2 files, 8 tests) and step 0c's
      preferences and sandbox commands (`s1-final-*`): preferences unchanged, sandbox as step 5.
- [ ] 9. Append this slice's `verify.md` entry (shape below), then owned-file Prettier over the eight
      paths, `--write` then `--check`, from this list, which step 10 reuses; then rerun the strict
      OpenSpec block — **after** the evidence edit.

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/src/components/wbs/use-plan-read.ts \
    apps/wbs/fe-01/src/modules/project/contract.ts \
    apps/wbs/fe-01/src/runtime/project-runtime.model.test.ts \
    apps/wbs/fe-01/src/runtime/project-runtime.test.ts \
    apps/wbs/fe-01/src/runtime/project-runtime.ts \
    apps/wbs/fe-01/vitest.node-suites.ts \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md \
    > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 8
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  ```

  Expected: exit 0, and `All matched files use Prettier code style!` from the check.

- [ ] 10. Hand over — the working tree's changed paths compared with the owned list:

  ```sh
  set -euo pipefail
  git status --porcelain --untracked-files=all | tee "$TMPDIR/evidence/status-after.txt"
  cut -c4- "$TMPDIR/evidence/status-after.txt" | sort > "$TMPDIR/evidence/status-paths.txt"
  sort "$TMPDIR/owned.txt" > "$TMPDIR/evidence/owned-sorted.txt"
  diff "$TMPDIR/evidence/owned-sorted.txt" "$TMPDIR/evidence/status-paths.txt"
  ```

  Expected: the `diff` prints nothing and exits 0: ` M` for `spec.md`, `verify.md`,
  `vitest.node-suites.ts`, `contract.ts` and `use-plan-read.ts`, `??` for the three new files.

Planner commit subject: `feat(frontend): own the selected project's plan services in one project runtime`.

### Slice 2 — the table draws from the runtime, and the page owns it

Owns (26 paths): `spec.md`, `verify.md`, and under `apps/wbs/fe-01/src/`:
`modules/project/contract.ts`, `components/wbs/{use-plan-read.ts,wbs-table.tsx,project-page.tsx,
project-page.test.tsx}`, `runtime/project-runtime.ts` (only the `w1` `Proof:` comment of step 7),
`testing/wbs-table-over-client.tsx` (new), and the seventeen suites of `$TMPDIR/suites.txt`.

- [ ] 1. Step 0, then the adopted set, the zoned suite and the page pair:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046 # the list is twenty fixed paths without spaces
  bash "$TMPDIR/run-check.sh" s2-base-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s2-base-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/run-check.sh" s2-base-page env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/components/wbs/project-page.test.tsx src/app-router.test.tsx
  for check in s2-base-adopted s2-base-zoned s2-base-page; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` for all three. Rehearsed: adopted 20·1215 (about six minutes — poll the log,
  it is still running); zoned 2·3; page pair 2·78.

- [ ] 2. **The contract first.** Apply section 7.4 (the scenario "The page owns the runtime, and the
      table draws from it") and rerun the strict block: exit 0, `passed` unchanged.
- [ ] 3. **The test side**, in this order. First section 7.5, **the named fixture edit** of this
      slice, so it is not mistaken for drift — every `<WbsTable` JSX site in the seventeen suites
      becomes `<WbsTableOverClient` (256 sites, props unchanged), `WbsTableProps['subscribe']`
      becomes `WbsTableOverClientProps['subscribe']`, `WbsTable` leaves each suite's import from the
      table's module (the line goes when nothing is left) and one import of the fixture follows the
      last `@/testing/` import — then Prettier over the seventeen, which re-wraps the elements the
      longer name pushes past the line:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  test -f "$TMPDIR/suites-over-client.ts"
  # shellcheck disable=SC2046 # seventeen fixed paths without spaces
  bun "$TMPDIR/suites-over-client.ts" $(cat "$TMPDIR/suites.txt") \
    | tee "$TMPDIR/evidence/s2-suites-script.txt"
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/suites.txt") > /dev/null
  tail -n 1 "$TMPDIR/evidence/s2-suites-script.txt"
  ```

  Expected: eighteen lines, one per suite with its count, the last `suites=17 sites=256`, exit 0.
  Any other last line, or a non-zero exit, is a stop.

  Then apply section 7.6: the fixture, the page's two new examples, and **the four named test
  edits** of section 3.7 — three in `plan-read-and-write.test.tsx` (two awaited unsubscribes, the
  renewal case retitled with its toast expectation `[]`) and one in `project-page.test.tsx` (the
  grid awaited). No other `expect` line changes. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s2-red-vitest env TZ=UTC bunx vitest run \
    src/components/wbs/plan-row-dependencies.test.tsx
  bash "$TMPDIR/expect-status.sh" s2-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s2-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 4 errors in 2 files.` — the
  fixture's two diagnostics, reported once per build project that includes `src/testing`:

  ```text
  apps/wbs/fe-01/src/testing/wbs-table-over-client.tsx:12:18 - error TS2430: Interface 'WbsTableOverClientProps' incorrectly extends interface 'Omit<WbsTableProps, "project">'.
  apps/wbs/fe-01/src/testing/wbs-table-over-client.tsx:59:46 - error TS2322: Type '{ planImport?: PlanImportControl | undefined; toastApi?: ToastStackApi | undefined; projectName?: string | undefined; savedPlansShelf?: ReactNode; project: ProjectRuntime; }' is not assignable to type 'IntrinsicAttributes & WbsTableProps'.
  ```

  and Vitest `status=1`, `Tests 5 failed (5)`, every one on `TypeError: Cannot read properties of
undefined (reading 'planCommandsFor')` — the table, handed a runtime, still asks for services.

- [ ] 4. **The implementation**, in this order. First section 7.7, the regions script, which is a
      script rather than a diff because packet h's executor writes `Proof:` comments inside both
      regions (section 3.8) whose text no diff here can know:

  ```sh
  set -euo pipefail
  test -f "$TMPDIR/table-regions.ts"
  bun "$TMPDIR/table-regions.ts" apps/wbs/fe-01/src/components/wbs/use-plan-read.ts \
    apps/wbs/fe-01/src/components/wbs/wbs-table.tsx | tee "$TMPDIR/evidence/s2-regions.txt"
  ```

  Expected: two lines, `read hook: N lines replaced by 19` and `table: M lines replaced by 14`, exit
  0 — `N` and `M` are 108 and 18 on this packet's rehearsal base and grow by however many comment
  lines packet h's executor wrote at its `t2` and `t1` (record both). Then apply section 7.8: the
  contract's JSDoc, the rest of the read hook and the table, and the page.

- [ ] 5. **Green checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s2-green-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s2-green-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/run-check.sh" s2-green-page env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/components/wbs/project-page.test.tsx src/app-router.test.tsx
  bash "$TMPDIR/run-check.sh" s2-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s2-green-typecheck s2-green-adopted s2-green-zoned s2-green-page s2-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: adopted = step 1 **+ 2 tests** (rehearsed 1215 → 1217: the two
  new page examples; the four edited tests pass as edited); zoned unchanged; page pair = step 1
  **+ 2** (78 → 80); sandbox unchanged from step 0 (53·695).

  And the table no longer builds a project service:

  ```sh
  set -euo pipefail
  if git grep -nE "planFeedFor|calendarMarkersFor|planCommandsFor|createPlanWriter|openProjectPorts" \
    -- apps/wbs/fe-01/src/components > "$TMPDIR/evidence/s2-builders.txt"
  then echo "delivery still builds a project service" >&2; cat "$TMPDIR/evidence/s2-builders.txt" >&2; exit 1
  else rc=$?; test "$rc" -eq 1; fi
  ```

  Expected: nothing printed, exit 0 (on this slice's base the same `git grep` lists six lines in
  `use-plan-read.ts` and one in `wbs-table.tsx`).

- [ ] 6. Durable lint (`s2-lint`), expected `status=0`.
- [ ] 7. The one proof of section 8.2 (`w1`); the comment afterwards, in `project-runtime.ts`.
- [ ] 8. Rerun the page pair (`s2-final-page`) and step 0c's preferences and sandbox commands
      (`s2-final-*`): unchanged from step 5.
- [ ] 9. `verify.md` entry, then owned-file Prettier over the twenty-six paths from this list (step
      10 reuses it), then the strict OpenSpec block:

  ```sh
  set -euo pipefail
  {
    sed 's|^|apps/wbs/fe-01/|' "$TMPDIR/suites.txt"
    printf '%s\n' \
      apps/wbs/fe-01/src/components/wbs/project-page.test.tsx \
      apps/wbs/fe-01/src/components/wbs/project-page.tsx \
      apps/wbs/fe-01/src/components/wbs/use-plan-read.ts \
      apps/wbs/fe-01/src/components/wbs/wbs-table.tsx \
      apps/wbs/fe-01/src/modules/project/contract.ts \
      apps/wbs/fe-01/src/runtime/project-runtime.ts \
      apps/wbs/fe-01/src/testing/wbs-table-over-client.tsx \
      openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
      openspec/changes/adopt-frontend-lifetimes/verify.md
  } > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 26
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  ```

  Expected: exit 0, and `All matched files use Prettier code style!` from the check.

- [ ] 10. Hand over, with slice 1 step 10's block unchanged. Expected: the `diff` prints nothing and
      exits 0 — twenty-five ` M` paths (`project-runtime.ts` among them, for its `w1` comment) and
      one `??` (`apps/wbs/fe-01/src/testing/wbs-table-over-client.tsx`).

Planner commit subject:
`refactor(frontend): draw the table from the selected project's runtime, owned by the page`.

### Slice 3 — presence from the runtime, reset by a switch, and the records

Owns (10 paths): `spec.md`, `verify.md`, `tasks.md` (all under
`openspec/changes/adopt-frontend-lifetimes/`), `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`,
and under `apps/wbs/fe-01/src/`: `components/wbs/{project-page.tsx,project-page.test.tsx}`,
`modules/{plan-feed,calendar-markers,project}/README.md`, `modules/plan-feed/presence-store.ts`.

- [ ] 1. Step 0, then the adopted set, the zoned suite and the page pair:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046 # the list is twenty fixed paths without spaces
  bash "$TMPDIR/run-check.sh" s3-base-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s3-base-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/run-check.sh" s3-base-page env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/components/wbs/project-page.test.tsx src/app-router.test.tsx
  for check in s3-base-adopted s3-base-zoned s3-base-page; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` for all three. Rehearsed: adopted 20·1217; zoned 2·3; page pair 2·80.

- [ ] 2. **The contract first.** Apply section 7.9 (the scenario "A project switch resets presence"
      and packet g's presence scenario amended to name the runtime's store) and rerun the strict
      block: exit 0, `passed` unchanged.
- [ ] 3. Apply section 7.10: one new example in `project-page.test.tsx`. **Red checkpoint:**

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s3-red-vitest env TZ=UTC bunx vitest run \
    src/components/wbs/project-page.test.tsx \
    -t 'hands the presence slot nobody in the next project until its own stream says'
  bash "$TMPDIR/expect-status.sh" s3-red-vitest 1
  ```

  Expected, and rehearsed exactly: `Tests 1 failed | 75 skipped (76)`, on `AssertionError: expected
-1 to be greater than or equal to 0` — after the switch the header was never handed nobody: the
  page's one presence store kept p1's list. No typecheck red: the example uses nothing new.

- [ ] 4. Apply section 7.11 (the page, `presence-store.ts`'s JSDoc, the three READMEs, the lifetime
      map, `tasks.md`), then date the two notes by observation, never by copying a date from this
      packet:

  ```sh
  set -euo pipefail
  observed=$(date -u +%F)
  for note in openspec/changes/adopt-frontend-lifetimes/tasks.md \
    docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md; do
    test -f "$note"
    test "$(grep -c '<observed-date-j>' "$note")" -eq 1
    sed -i "s/<observed-date-j>/$observed/" "$note"
    grep -n "observed $observed" "$note"
    if grep -n '<observed-date-j>' "$note"; then echo "placeholder left in $note" >&2; exit 1; else rc=$?; test "$rc" -eq 1; fi
  done
  ```

  Expected: at least one line printed per file (packet h's note may carry the same date), exit 0;
  task 10's box is still `[ ]`.

- [ ] 5. **Green checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s3-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  bash "$TMPDIR/run-check.sh" s3-format env NX_DAEMON=false bunx nx format:check --all
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s3-green-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s3-green-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/run-check.sh" s3-green-page env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/components/wbs/project-page.test.tsx src/app-router.test.tsx
  bash "$TMPDIR/run-check.sh" s3-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s3-green-typecheck s3-format s3-green-adopted s3-green-zoned s3-green-page \
    s3-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: adopted = step 1 **+ 1** (rehearsed 1217 → 1218: the new
  example); zoned unchanged; page pair = step 1 **+ 1** (80 → 81); sandbox unchanged (53·695).

- [ ] 6. Durable lint (`s3-lint`), expected `status=0`.
- [ ] 7. The four proofs of section 8.3 (`q1`, `q2`, `x1`, `x2`, all in `project-page.tsx`); every
      fault first, then the comments at the named sites.
- [ ] 8. Rerun the page pair (`s3-final-page`) and step 0c's preferences and sandbox commands
      (`s3-final-*`): unchanged from step 5.
- [ ] 9. `verify.md` entry. Then owned-file Prettier over the ten paths from this list (step 10 reuses
      it), `nx format:check --all` again (`s3-format-after`), and the strict OpenSpec block — all
      after the evidence edit. Never a repository-wide format **write**.

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/src/components/wbs/project-page.test.tsx \
    apps/wbs/fe-01/src/components/wbs/project-page.tsx \
    apps/wbs/fe-01/src/modules/calendar-markers/README.md \
    apps/wbs/fe-01/src/modules/plan-feed/README.md \
    apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts \
    apps/wbs/fe-01/src/modules/project/README.md \
    docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/tasks.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md \
    > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 10
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  ```

  Expected: exit 0, and `All matched files use Prettier code style!` from the check.

- [ ] 10. Hand over, with slice 1 step 10's block unchanged. Expected: the `diff` prints nothing and
      exits 0 — exactly ten ` M` paths, the list above.

Planner commit subject:
`refactor(frontend): hand the header the selected project's presence, reset on a switch`.

### Verification record entries

Each slice appends one entry to `openspec/changes/adopt-frontend-lifetimes/verify.md`, headed
`## Packet 050.7j, slice N — <what the slice did>`, containing only its own observations: the attempt
id and starting hash; step 0's baselines as numbers; every command's status; the red checkpoint's own
diagnostics; the scripts' printed lines (slice 2); the green counts; every proof of that slice with
its observed message (for the model faults, run number and shrunk command sequence); and what stayed
**pending planner verification** — `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e`, `tool-devsync:test` and the host gate. Evidence references are basenames relative to
that attempt's evidence directory, never absolute paths. Do not read, quote or restate an earlier
entry.

### Dispatch

One attempt per slice, from the reviewed packet, with no network, driven by a Claude subagent. The
base of slice 1 is the planning lineage that contains packet h's **real** slice-3 commit and this
packet — main after h's lane merged with this packet's branch. That base differs from the rehearsal
base this packet was cut against (`a687bf38`) by packet h's executor `Proof:` comments and its
`verify.md` entries: before the first dispatch the planner reruns section 9.1's script on it with
`git archive <base>` (section 9.1 also records the run against a copy with every one of h's comment
sites in the files this packet patches filled). This block holds the only absolute paths in this
document.

```sh
# Slice 1, from the reviewed base; H3 is packet h's slice-3 planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-j-project-runtime 1 <reviewed-base-sha> \
  --driver claude \
  --batch batch-6 \
  --require-ancestor <H3> \
  --slice-note 'reviewed base <reviewed-base-sha>' \
  --preserve evidence

# Slices 2 and 3, each into the same clone once the previous slice is reviewed
# and committed; N is the slice, P the previous slice's planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-j-project-runtime N P \
  --driver claude \
  --batch batch-6 \
  --require-ancestor <H3> \
  --resume --require-ancestor P \
  --slice-note 'reviewed base P' \
  --preserve evidence
```

No `--seed`: no slice reads another attempt's evidence. No `--network`: nothing reaches a host.
`--slice-note` is load-bearing: it is the only channel by which the reviewed SHA reaches the executor
without passing through the clone, and step 0a reads it. `--driver claude` writes the prompt and
stops; the Claude subagent runs the slice and the planner collects the attempt.

## 7. The code

Nine fenced diffs and two TypeScript scripts, in slice order. Step 0b extracts the diffs as `01.diff`
… `09.diff` and the scripts as `suites-over-client.ts` and `table-regions.ts`, and section 9.1
records the run that applies all of them, in this order, to a tree extracted from the rehearsal base
and proves the result byte-identical to the rehearsal's final commit. No diff adds a `Proof:`
comment; section 3.8 lists the three the diffs remove and the two the regions script removes on the
real base.

### 7.1 `spec.md` — slice 1, the new requirement

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index d0c5be430..42a7834e0 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -430,3 +430,29 @@ route's own promise. What a reader sees SHALL NOT change.
 - **THEN** the table keeps its services, its feed and its socket across the
   same client, a new client replaces all three, and the table is never handed
   the client itself
+
+### Requirement: One project runtime owns the selected project's plan services
+
+fe-01 SHALL build the plan services of one selected project - its delivered plan,
+its busy state, its refusal and command-issued channels, its plan feed, its
+calendar markers, its plan writer and its plan commands - as one DI Bag project
+runtime, outside React, through one project owner that holds at most one current
+runtime. The owner SHALL withdraw the current runtime synchronously when another
+project is opened or the project is left, before its disposal starts, and every
+guard inside the runtime SHALL answer from that withdrawal: a withdrawn runtime
+SHALL hand nothing on from a late answer or a stream frame, SHALL send nothing
+for a reread or a calendar-marker gesture asked of it, and SHALL NOT answer that
+it is current again. Its feed SHALL be given back exactly once, closing its
+stream, however many triggers retire it. The runtime SHALL publish only feature
+and store surfaces.
+
+#### Scenario: A late answer, a frame, a reread and a marker after a switch
+
+- **WHEN** a project is opened or left while another project's runtime is
+  current, and that runtime's reads then answer, its stream reports, or a reader
+  still holding it asks for a reread or adds a calendar marker, before or after
+  its disposal
+- **THEN** no runtime but the one the owner publishes answers that it is
+  current, the withdrawn runtime's delivered plan stays exactly as it was when it
+  was withdrawn, no request is sent on its behalf, and once its retirement has
+  run its feed has been closed once and its stream unsubscribed once
```

### 7.2 `project-runtime.model.test.ts` and `project-runtime.test.ts` (**new**) — slice 1

The model test executes section 3.1: P1 and P2 after every `open` and `leave`, P1 and P3 after every
other command, P4 inside `reread` and `mark`, P5 and P6 at teardown. Its counters of commands run
and of the interleavings reached are asserted non-zero after the pinned run (`seed: 20260924`,
`numRuns: 300`, fast-check 4.9.0). Two commands exist for the classes the batch addendum's lesson
16 names: `reenter(p)` asks the owner to open a project from inside the owner's own next
notification, as a component re-rendered by its store would, and `openBroken(p)` opens a project
whose installer raises `PartialAcquisitionError` after its feed has opened.

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.model.test.ts b/apps/wbs/fe-01/src/runtime/project-runtime.model.test.ts
new file mode 100644
index 000000000..7e3001333
--- /dev/null
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.model.test.ts
@@ -0,0 +1,598 @@
+import fc from 'fast-check';
+import { describe, expect, it } from 'vitest';
+
+import type { DeliveredPlan } from '@/modules/plan-feed/delivered-plan-store';
+import type { Presence } from '@/modules/plan-feed/presence-store';
+import { projectServicesOver } from '@/modules/project/composition';
+import type {
+  ProjectRuntime,
+  ProjectServices,
+  ProjectSource,
+  ProjectStreamHandlers,
+} from '@/modules/project/contract';
+import { fakeProjectApi } from '@/testing/fake-project-api';
+
+import { createProjectOwner, installProjectRuntime, type ProjectOwner } from './project-runtime';
+
+/**
+ * One runtime the owner built, and everything the world did to it.
+ *
+ * Each `open` is handed a source of its own — its own fake client, its own
+ * stream — so every request, every stream and every feed close is attributed to
+ * the runtime that made it, which a shared client could not say.
+ */
+interface Built {
+  readonly name: string;
+  readonly projectId: string;
+  /** Whether its source's commands refuse to be built, after its feed has opened. */
+  readonly broken: boolean;
+  /** How many times the owner ran its installer. */
+  installs: number;
+  /** The source this runtime was installed from, by identity. */
+  services: ProjectServices | null;
+  runtime: ProjectRuntime | null;
+  /** Requests this runtime's client received, reads and marker writes alike. */
+  calls: number;
+  feedCloses: number;
+  streamsOpened: number;
+  streamsClosed: number;
+  handlers: ProjectStreamHandlers | null;
+  /** What the runtime held when it was built, before anybody could see it. */
+  initial: Held | null;
+  /** What it held at the instant it was withdrawn, or `null` while it has not been. */
+  frozen: Held | null;
+}
+
+/** What a runtime holds that a reader sees: its delivered plan and its presence. */
+interface Held {
+  readonly plan: DeliveredPlan;
+  readonly presence: Presence;
+}
+
+/** What a runtime holds right now. */
+function heldBy(runtime: ProjectRuntime): Held {
+  return { plan: runtime.plan.snapshot(), presence: runtime.presence.snapshot() };
+}
+
+const ran: Record<string, number> = {};
+function note(kind: string): void {
+  ran[kind] = (ran[kind] ?? 0) + 1;
+}
+const COMMAND_KINDS: readonly string[] = [
+  'open',
+  'leave',
+  'answer',
+  'drain',
+  'frame',
+  'reread',
+  'mark',
+  'openBroken',
+  'reenter',
+];
+const reached = {
+  answerLandedAfterWithdrawal: 0,
+  frameToWithdrawn: 0,
+  rereadByWithdrawn: 0,
+  markByWithdrawn: 0,
+  leftWhileNothingCurrent: 0,
+  reopenedTheSameProject: 0,
+  switchedWhileLive: 0,
+  streamOpened: 0,
+  reenteredFromListener: 0,
+  brokenInstalled: 0,
+  leftAfterBroken: 0,
+};
+
+/**
+ * The reference: what the page last asked for, and whether that request's
+ * runtime cannot be built. Nothing here is read back from the owner.
+ */
+interface OwnerModel {
+  wanted: string | null;
+  broken: boolean;
+  /** Whether any request in this run could not be built. */
+  anyBroken: boolean;
+}
+
+interface OwnerWorld {
+  readonly owner: ProjectOwner;
+  readonly scheduler: fc.Scheduler;
+  readonly built: Built[];
+  readonly bySource: Map<ProjectServices, Built>;
+  readonly inflight: Promise<unknown>[];
+  next: number;
+}
+
+/** A fresh client for one runtime: every read answers when the scheduler says. */
+function sourceFor(world: OwnerWorld, projectId: string, broken = false): ProjectSource {
+  world.next += 1;
+  const base = fakeProjectApi();
+  const record: Built = {
+    name: `r${String(world.next)}`,
+    projectId,
+    broken,
+    installs: 0,
+    services: null,
+    runtime: null,
+    calls: 0,
+    feedCloses: 0,
+    streamsOpened: 0,
+    streamsClosed: 0,
+    handlers: null,
+    initial: null,
+    frozen: null,
+  };
+  const gate = <T>(route: string, answer: () => Promise<T>): Promise<T> => {
+    record.calls += 1;
+    return world.scheduler.schedule(answer(), `${record.name} ${route}`).then((value) => {
+      if (record.runtime !== null && !record.runtime.isCurrent()) {
+        reached.answerLandedAfterWithdrawal += 1;
+      }
+      return value;
+    });
+  };
+  const client: typeof base = {
+    ...base,
+    tree: (id) => gate('tree', () => base.tree(id)),
+    steps: (id) => gate('steps', () => base.steps(id)),
+    listTeams: () => gate('teams', () => base.listTeams()),
+    listTags: () => gate('tags', () => base.listTags()),
+    listServices: () => gate('services', () => base.listServices()),
+    listWorkItemTypes: () => gate('types', () => base.listWorkItemTypes()),
+    listExternalSystems: () => gate('systems', () => base.listExternalSystems()),
+    listPeople: () => gate('people', () => base.listPeople()),
+    listCalendarMarkers: (id) => gate('markers', () => base.listCalendarMarkers(id)),
+    createCalendarMarker: (id, marker) => {
+      record.calls += 1;
+      return base.createCalendarMarker(id, marker);
+    },
+  };
+  const composed = projectServicesOver(client);
+  const services: ProjectServices = {
+    ...composed,
+    planCommandsFor: (id) => {
+      if (broken) throw new Error(`${record.name}'s commands could not be built`);
+      return composed.planCommandsFor(id);
+    },
+    planFeedFor: (reader) => {
+      const feed = composed.planFeedFor(reader);
+      return {
+        ...feed,
+        close: () => {
+          record.feedCloses += 1;
+          feed.close();
+        },
+      };
+    },
+  };
+  record.services = services;
+  world.built.push(record);
+  world.bySource.set(services, record);
+  return {
+    services,
+    subscribe: (_projectId, handlers) => {
+      record.streamsOpened += 1;
+      reached.streamOpened += 1;
+      record.handlers = handlers;
+      return {
+        seen: () => undefined,
+        unsubscribe: () => {
+          record.streamsClosed += 1;
+        },
+      };
+    },
+  };
+}
+
+/** Records, at the instant before a transition is asked for, what the current runtime held. */
+function freezeTheCurrent(world: OwnerWorld): void {
+  for (const record of world.built) {
+    if (record.runtime?.isCurrent() === true) {
+      record.frozen = heldBy(record.runtime);
+      reached.switchedWhileLive += 1;
+    }
+  }
+}
+
+/** The invariants that hold at every observation point, whatever is still in flight. */
+function assertOwnership(world: OwnerWorld, what: string): void {
+  const current = world.built.filter((record) => record.runtime?.isCurrent() === true);
+  expect(
+    current.map((record) => record.name),
+    `${what}: more than one runtime says it is current`,
+  ).toHaveLength(Math.min(current.length, 1));
+  const state = world.owner.snapshot();
+  for (const record of current) {
+    expect(
+      state.status === 'live' && state.services === record.runtime,
+      `${what}: ${record.name} says it is current but is not the one published`,
+    ).toBe(true);
+  }
+  for (const record of world.built) {
+    const runtime = record.runtime;
+    if (runtime === null || runtime.isCurrent()) continue;
+    const expected = record.frozen ?? record.initial;
+    expect(
+      runtime.plan.snapshot() === expected?.plan,
+      `${what}: ${record.name}'s delivered plan changed after it was withdrawn`,
+    ).toBe(true);
+    expect(
+      runtime.presence.snapshot() === expected?.presence,
+      `${what}: ${record.name}'s presence changed after it was withdrawn`,
+    ).toBe(true);
+  }
+}
+
+type OwnerCommand = fc.AsyncCommand<OwnerModel, OwnerWorld>;
+
+class Open implements OwnerCommand {
+  constructor(readonly projectId: string) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: OwnerModel, world: OwnerWorld): Promise<void> {
+    note('open');
+    if (model.wanted === this.projectId) reached.reopenedTheSameProject += 1;
+    freezeTheCurrent(world);
+    world.inflight.push(world.owner.open(this.projectId, sourceFor(world, this.projectId)));
+    model.wanted = this.projectId;
+    model.broken = false;
+    assertOwnership(world, `open(${this.projectId})`);
+    expect(
+      world.built.filter((record) => record.runtime?.isCurrent() === true),
+      `open(${this.projectId}): a runtime is still current after withdrawal`,
+    ).toEqual([]);
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `open(${this.projectId})`;
+  }
+}
+
+class Leave implements OwnerCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(model: OwnerModel, world: OwnerWorld): Promise<void> {
+    note('leave');
+    if (world.owner.snapshot().status !== 'live') reached.leftWhileNothingCurrent += 1;
+    freezeTheCurrent(world);
+    world.inflight.push(world.owner.leave());
+    if (model.anyBroken) reached.leftAfterBroken += 1;
+    model.wanted = null;
+    model.broken = false;
+    expect(
+      world.built.filter((record) => record.runtime?.isCurrent() === true),
+      'leave: a runtime is still current after withdrawal',
+    ).toEqual([]);
+    await Promise.resolve();
+  }
+  toString(): string {
+    return 'leave';
+  }
+}
+
+/**
+ * Opens a project whose runtime cannot be built: its feed opens, then its
+ * commands throw, and the installer raises a partial acquisition.
+ */
+class OpenBroken implements OwnerCommand {
+  constructor(readonly projectId: string) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: OwnerModel, world: OwnerWorld): Promise<void> {
+    note('openBroken');
+    freezeTheCurrent(world);
+    world.inflight.push(world.owner.open(this.projectId, sourceFor(world, this.projectId, true)));
+    model.wanted = this.projectId;
+    model.broken = true;
+    model.anyBroken = true;
+    assertOwnership(world, `openBroken(${this.projectId})`);
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `openBroken(${this.projectId})`;
+  }
+}
+
+/**
+ * A reader that asks for another project from inside the owner's own
+ * notification — as a component re-rendered by the owner's store would — the
+ * next time the owner says anything.
+ */
+class ReenterFromListener implements OwnerCommand {
+  constructor(readonly projectId: string) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: OwnerModel, world: OwnerWorld): Promise<void> {
+    note('reenter');
+    let asked = false;
+    const stop = world.owner.subscribe(() => {
+      if (asked) return;
+      asked = true;
+      stop();
+      reached.reenteredFromListener += 1;
+      freezeTheCurrent(world);
+      world.inflight.push(world.owner.open(this.projectId, sourceFor(world, this.projectId)));
+      model.wanted = this.projectId;
+      model.broken = false;
+      expect(
+        world.built.filter((record) => record.runtime?.isCurrent() === true),
+        `reenter(${this.projectId}): a runtime is still current after withdrawal`,
+      ).toEqual([]);
+    });
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `reenter(${this.projectId})`;
+  }
+}
+
+/** One scheduled answer or step, in the order fast-check chooses. */
+class Answer implements OwnerCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(_model: OwnerModel, world: OwnerWorld): Promise<void> {
+    note('answer');
+    if (world.scheduler.count() > 0) await world.scheduler.waitNext(1);
+    else await Promise.resolve();
+    assertOwnership(world, 'answer');
+  }
+  toString(): string {
+    return 'answer';
+  }
+}
+
+/** Every answer still out, in the order fast-check chooses: a reader who waits. */
+class Drain implements OwnerCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(_model: OwnerModel, world: OwnerWorld): Promise<void> {
+    note('drain');
+    await world.scheduler.waitIdle();
+    assertOwnership(world, 'drain');
+  }
+  toString(): string {
+    return 'drain';
+  }
+}
+
+/** Picks one built runtime whatever its state: a captured reader does not know it was left. */
+function pick(world: OwnerWorld, index: number): Built | null {
+  const candidates = world.built.filter((record) => record.runtime !== null);
+  if (candidates.length === 0) return null;
+  return candidates[index % candidates.length] ?? null;
+}
+
+/** What one frame on a stream says. */
+type FrameKind = 'change' | 'connect' | 'disconnect' | 'presence';
+
+/** A frame on a runtime's stream: a change to read, the connection, or who is here. */
+class Frame implements OwnerCommand {
+  constructor(
+    readonly index: number,
+    readonly kind: FrameKind,
+  ) {}
+  check(): boolean {
+    return true;
+  }
+  async run(_model: OwnerModel, world: OwnerWorld): Promise<void> {
+    note('frame');
+    const record = pick(world, this.index);
+    const handlers = record?.handlers ?? null;
+    if (record === null || handlers === null) return;
+    if (record.runtime?.isCurrent() !== true) reached.frameToWithdrawn += 1;
+    if (this.kind === 'change') handlers.onChange(null);
+    else if (this.kind === 'presence') handlers.onPresence(['kat']);
+    else handlers.onConnectionChange(this.kind === 'connect');
+    await Promise.resolve();
+    assertOwnership(world, `frame(${record.name}, ${this.kind})`);
+  }
+  toString(): string {
+    return `frame(${String(this.index)}, ${this.kind})`;
+  }
+}
+
+/** A reader that kept a runtime's reread, and calls it now. */
+class Reread implements OwnerCommand {
+  constructor(readonly index: number) {}
+  check(): boolean {
+    return true;
+  }
+  async run(_model: OwnerModel, world: OwnerWorld): Promise<void> {
+    note('reread');
+    const record = pick(world, this.index);
+    const runtime = record?.runtime ?? null;
+    if (record === null || runtime === null) return;
+    const withdrawn = !runtime.isCurrent();
+    const before = record.calls;
+    world.inflight.push(runtime.reread(['tree']));
+    if (withdrawn) {
+      reached.rereadByWithdrawn += 1;
+      expect(record.calls - before, `reread: withdrawn ${record.name} sent a request`).toBe(0);
+    }
+    await Promise.resolve();
+    assertOwnership(world, `reread(${record.name})`);
+  }
+  toString(): string {
+    return `reread(${String(this.index)})`;
+  }
+}
+
+/** A reader that kept a runtime's marker gestures, and adds a marker now. */
+class Mark implements OwnerCommand {
+  constructor(readonly index: number) {}
+  check(): boolean {
+    return true;
+  }
+  async run(_model: OwnerModel, world: OwnerWorld): Promise<void> {
+    note('mark');
+    const record = pick(world, this.index);
+    const runtime = record?.runtime ?? null;
+    if (record === null || runtime === null) return;
+    const withdrawn = !runtime.isCurrent();
+    const before = record.calls;
+    world.inflight.push(runtime.markers.add({ date: '2026-09-24', name: 'Launch' }));
+    if (withdrawn) {
+      reached.markByWithdrawn += 1;
+      expect(record.calls - before, `mark: withdrawn ${record.name} sent a request`).toBe(0);
+    }
+    await Promise.resolve();
+    assertOwnership(world, `mark(${record.name})`);
+  }
+  toString(): string {
+    return `mark(${String(this.index)})`;
+  }
+}
+
+const commandsArb = fc.commands<OwnerModel, OwnerWorld, false>(
+  [
+    fc.constantFrom('p1', 'p2').map((projectId) => new Open(projectId)),
+    fc.constant(new Leave()),
+    fc.constant(new Answer()),
+    fc.constant(new Answer()),
+    fc.constant(new Drain()),
+    fc
+      .tuple(fc.nat(6), fc.constantFrom<FrameKind>('change', 'connect', 'disconnect', 'presence'))
+      .map(([index, kind]) => new Frame(index, kind)),
+    fc.nat(6).map((index) => new Reread(index)),
+    fc.nat(6).map((index) => new Mark(index)),
+    fc.constantFrom('p1', 'p2').map((projectId) => new OpenBroken(projectId)),
+    fc.constantFrom('p1', 'p2').map((projectId) => new ReenterFromListener(projectId)),
+  ],
+  { maxCommands: 24, size: 'max' },
+);
+
+/**
+ * The project owner, run against a reference model.
+ *
+ * The record this executes is section 3 of
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-j-project-runtime.md`.
+ */
+describe('the project owner, against a reference model', () => {
+  it('keeps one runtime current, and nothing of a withdrawn one reaches anybody', async () => {
+    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');
+
+    await fc.assert(
+      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
+        const model: OwnerModel = { wanted: null, broken: false, anyBroken: false };
+        const world: OwnerWorld = {
+          owner: createProjectOwner({
+            install: (dependencies) => {
+              const record = world.bySource.get(dependencies.services);
+              if (record === undefined) throw new Error('a runtime was installed from no source');
+              record.installs += 1;
+              if (record.broken) reached.brokenInstalled += 1;
+              const installed = installProjectRuntime(dependencies);
+              record.runtime = installed.services;
+              record.initial = heldBy(installed.services);
+              // The real close, reached when the scheduler says: a retirement that takes
+              // time is what opens the interval between withdrawal and disposal, in which
+              // a late answer, a captured reread or a marker gesture can still arrive.
+              return {
+                services: installed.services,
+                close: async (options) => {
+                  await scheduler.schedule(Promise.resolve(), `${record.name} retires`);
+                  await installed.close(options);
+                },
+              };
+            },
+          }),
+          scheduler,
+          built: [],
+          bySource: new Map(),
+          inflight: [],
+          next: 0,
+        };
+        let failure: Error | null = null;
+        try {
+          await fc.asyncModelRun<OwnerModel, OwnerWorld, false, OwnerModel>(
+            () => ({ model, real: world }),
+            commands,
+          );
+        } catch (caught: unknown) {
+          failure = caught instanceof Error ? caught : new Error(String(caught));
+        }
+        // Teardown: every answer still out lands, in the scheduler's order, and the
+        // settled state is checked; its failure is reported beside the property's own.
+        const unreported: string[] = [];
+        try {
+          while (scheduler.count() > 0 || world.inflight.length > 0) {
+            await scheduler.waitIdle();
+            for (const task of world.inflight.splice(0, world.inflight.length)) await task;
+          }
+          assertOwnership(world, 'teardown');
+          const state = world.owner.snapshot();
+          if (model.wanted === null && model.anyBroken) {
+            // A retirement asked of a slot that a failed construction left fatal
+            // holds nothing and changes nothing; which request was the last to
+            // build is the scheduler's choice. Either way nothing is held.
+            expect(
+              state.status === 'empty' || (state.status === 'fatal' && !state.terminal),
+              `teardown: left after an unbuildable project, but the owner is ${state.status}`,
+            ).toBe(true);
+          } else if (model.wanted === null) {
+            expect(state.status, 'teardown: left, but something is still held').toBe('empty');
+          } else if (model.broken) {
+            expect(
+              state.status === 'fatal' && !state.terminal,
+              `teardown: the last project asked for cannot be built, but the owner is ${state.status}`,
+            ).toBe(true);
+          } else {
+            expect(
+              state.status === 'live' ? state.services.projectId : state.status,
+              'teardown: the last project asked for is not the one live',
+            ).toBe(model.wanted);
+          }
+          const live = state.status === 'live' ? state.services : null;
+          for (const record of world.built) {
+            if (record.broken) {
+              // Built as far as its feed, then given back by the transaction, once.
+              expect(
+                record.feedCloses,
+                `teardown: unbuildable ${record.name}'s feed closed ${String(record.feedCloses)} times after ${String(record.installs)} installs`,
+              ).toBe(record.installs);
+              continue;
+            }
+            if (record.runtime === null) continue;
+            const isLive = record.runtime === live;
+            expect(
+              record.feedCloses,
+              `teardown: ${record.name}'s feed closed ${String(record.feedCloses)} times, live=${String(isLive)}`,
+            ).toBe(isLive ? 0 : 1);
+            expect(
+              record.streamsOpened,
+              `teardown: ${record.name} opened two streams`,
+            ).toBeLessThanOrEqual(1);
+            expect(
+              record.streamsClosed,
+              `teardown: ${record.name}'s stream closed ${String(record.streamsClosed)} of ${String(record.streamsOpened)}, live=${String(isLive)}`,
+            ).toBe(isLive ? 0 : record.streamsOpened);
+          }
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
+  }, 120_000);
+});
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.test.ts b/apps/wbs/fe-01/src/runtime/project-runtime.test.ts
new file mode 100644
index 000000000..df58a38d7
--- /dev/null
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.test.ts
@@ -0,0 +1,201 @@
+import { describe, expect, it, vi } from 'vitest';
+
+import { projectServicesOver } from '@/modules/project/composition';
+import type {
+  ProjectServices,
+  ProjectSource,
+  ProjectStreamHandlers,
+} from '@/modules/project/contract';
+import { fakeProjectApi } from '@/testing/fake-project-api';
+
+import { createProjectOwner, installProjectRuntime } from './project-runtime';
+
+/** A source over a fresh fake client, and what its feed and its stream went through. */
+function recordedSource(options: { unsubscribe?: () => void } = {}) {
+  const seen = { installs: 0, feedCloses: 0, opened: 0, closed: 0 };
+  const composed = projectServicesOver(fakeProjectApi());
+  const services: ProjectServices = {
+    ...composed,
+    planFeedFor: (reader) => {
+      seen.installs += 1;
+      const feed = composed.planFeedFor(reader);
+      return {
+        ...feed,
+        close: () => {
+          seen.feedCloses += 1;
+          feed.close();
+        },
+      };
+    },
+  };
+  const source: ProjectSource = {
+    services,
+    subscribe: () => {
+      seen.opened += 1;
+      return {
+        seen: () => undefined,
+        unsubscribe: () => {
+          seen.closed += 1;
+          options.unsubscribe?.();
+        },
+      };
+    },
+  };
+  return { source, seen };
+}
+
+describe('the project runtime', () => {
+  it('publishes the project’s feature and store surfaces, and nothing else', async () => {
+    const runtime = installProjectRuntime({
+      projectId: 'p1',
+      ...recordedSource().source,
+      isCurrent: () => true,
+    });
+
+    // Enumerated rather than trusted to the type: an object with one more member
+    // still satisfies `ProjectRuntime`, and that member would reach the table.
+    expect(Object.keys(runtime.services).sort()).toEqual([
+      'busy',
+      'commands',
+      'commandsIssued',
+      'isCurrent',
+      'markers',
+      'plan',
+      'presence',
+      'projectId',
+      'refusals',
+      'reread',
+      'writer',
+    ]);
+    await runtime.close({ timeoutMs: 1_000 });
+  });
+
+  it('tells the project’s presence who its stream says is here, and whether it is up', async () => {
+    let told: ProjectStreamHandlers | null = null;
+    const { source } = recordedSource();
+    const owner = createProjectOwner({ budgetMs: 1_000 });
+    await owner.open('p1', {
+      ...source,
+      subscribe: (_projectId, handlers) => {
+        told = handlers;
+        return { seen: () => undefined, unsubscribe: () => undefined };
+      },
+    });
+    const opened = owner.snapshot();
+    if (opened.status !== 'live') throw new Error(`p1 was not published: ${opened.status}`);
+    const stream = await vi.waitFor(() => {
+      if (told === null) throw new Error('the stream was never opened');
+      return told;
+    });
+    expect(opened.services.presence.snapshot()).toEqual({ users: [], connected: false });
+
+    stream.onPresence(['kat', 'lee']);
+    stream.onConnectionChange(true);
+
+    expect(opened.services.presence.snapshot()).toEqual({ users: ['kat', 'lee'], connected: true });
+  });
+
+  it('gives back the feed a half-built runtime had already opened', async () => {
+    const { source, seen } = recordedSource();
+    const owner = createProjectOwner({ budgetMs: 1_000 });
+
+    await owner.open('p1', {
+      ...source,
+      services: {
+        ...source.services,
+        planCommandsFor: () => {
+          throw new Error('the commands could not be built');
+        },
+      },
+    });
+
+    expect(seen.installs).toBe(1);
+    expect(seen.feedCloses).toBe(1);
+    const state = owner.snapshot();
+    expect(state.status === 'fatal' && !state.terminal).toBe(true);
+  });
+
+  it('withdraws the runtime the instant another project is opened, and disposes it after', async () => {
+    const first = recordedSource();
+    const owner = createProjectOwner({ budgetMs: 1_000 });
+    await owner.open('p1', first.source);
+    const opened = owner.snapshot();
+    if (opened.status !== 'live') throw new Error(`p1 was not published: ${opened.status}`);
+    const p1 = opened.services;
+
+    const switching = owner.open('p2', recordedSource().source);
+
+    expect(p1.isCurrent()).toBe(false);
+    expect(first.seen.feedCloses).toBe(0);
+    await switching;
+    expect(first.seen.feedCloses).toBe(1);
+    const state = owner.snapshot();
+    expect(state.status === 'live' ? state.services.projectId : state.status).toBe('p2');
+  });
+
+  it('settles a request a newer one overtook, and builds nothing for it', async () => {
+    const first = recordedSource();
+    const second = recordedSource();
+    const owner = createProjectOwner({ budgetMs: 1_000 });
+
+    const overtaken = owner.open('p1', first.source);
+    const winner = owner.open('p2', second.source);
+
+    await expect(overtaken).resolves.toBeUndefined();
+    await winner;
+    expect(first.seen.installs).toBe(0);
+    expect(second.seen.installs).toBe(1);
+  });
+
+  it('shows a retirement that fails as the fatal state, and refuses the next project', async () => {
+    const stuck = recordedSource({
+      unsubscribe: () => {
+        throw new Error('the socket would not close');
+      },
+    });
+    const next = recordedSource();
+    const owner = createProjectOwner({ budgetMs: 1_000 });
+    await owner.open('p1', stuck.source);
+    await vi.waitFor(() => {
+      expect(stuck.seen.opened).toBe(1);
+    });
+
+    await expect(owner.leave()).resolves.toBeUndefined();
+    const left = owner.snapshot();
+    expect(left.status === 'fatal' && left.terminal).toBe(true);
+
+    await expect(owner.open('p2', next.source)).resolves.toBeUndefined();
+    expect(owner.snapshot()).toBe(left);
+    expect(next.seen.installs).toBe(0);
+  });
+
+  it('is terminal, and still settles, when a half-built runtime cannot be released', async () => {
+    const { source } = recordedSource();
+    const next = recordedSource();
+    const owner = createProjectOwner({ budgetMs: 1_000 });
+
+    await expect(
+      owner.open('p1', {
+        ...source,
+        services: {
+          ...source.services,
+          planFeedFor: (reader) => ({
+            ...source.services.planFeedFor(reader),
+            close: () => {
+              throw new Error('the feed would not close');
+            },
+          }),
+          planCommandsFor: () => {
+            throw new Error('the commands could not be built');
+          },
+        },
+      }),
+    ).resolves.toBeUndefined();
+    const stuck = owner.snapshot();
+    expect(stuck.status === 'fatal' && stuck.terminal).toBe(true);
+
+    await expect(owner.open('p2', next.source)).resolves.toBeUndefined();
+    expect(owner.snapshot()).toBe(stuck);
+    expect(next.seen.installs).toBe(0);
+  });
+});
```

### 7.3 `contract.ts`, `project-runtime.ts` (**new**), `use-plan-read.ts` and `vitest.node-suites.ts` — slice 1

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index 79996b0dc..fa776968b 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -22,19 +22,17 @@ import {
   type SliceView,
   type StepView,
 } from '@/lib/wbs-api';
-import type { CalendarMarkerRefusal } from '@/modules/calendar-markers/contract';
 import { type Channel, createChannel } from '@/modules/channel';
 import type { PlanCommands } from '@/modules/plan-commands/contract';
-import type { PlanFeed, PlanFeedRefusal } from '@/modules/plan-feed/contract';
+import type { PlanFeed } from '@/modules/plan-feed/contract';
 import {
   createDeliveredPlan,
   type DeliveredPlan,
   type DeliveredPlanStore,
 } from '@/modules/plan-feed/delivered-plan-store';
 import { type BusyWrites, createBusy } from '@/modules/plan-writer/busy-store';
-import type { PlanWriteRefusal } from '@/modules/plan-writer/contract';
 import { createPlanWriter } from '@/modules/plan-writer/plan-writer.feature';
-import type { ProjectServices } from '@/modules/project/contract';
+import type { PlanRefusal, ProjectServices } from '@/modules/project/contract';

 import { type CellCards } from './cell-card-store';
 import type { FocusIntent } from './live-editing';
@@ -192,16 +190,6 @@ export const NO_CHART_READ: ChartRead = {
   generation: 0,
 };

-/**
- * A refusal one of this project's services announces: the feed's and the
- * markers' as a cause, the writer's as the sentence it already chose.
- *
- * The words for a cause are built by the table's listener and nowhere else, for
- * the reason `PlanFeedDelivery` gives: a service that imported the refusal
- * vocabulary would be importing upward out of `components/`.
- */
-export type PlanRefusal = PlanFeedRefusal | CalendarMarkerRefusal | PlanWriteRefusal;
-
 /**
  * The project-owned stores and ports this table's services write through.
  *
diff --git a/apps/wbs/fe-01/src/modules/project/contract.ts b/apps/wbs/fe-01/src/modules/project/contract.ts
index ad7500c6d..ae8742cfc 100644
--- a/apps/wbs/fe-01/src/modules/project/contract.ts
+++ b/apps/wbs/fe-01/src/modules/project/contract.ts
@@ -1,7 +1,23 @@
-import type { CalendarMarkers, CalendarMarkersHost } from '@/modules/calendar-markers/contract';
+import type { RefreshResource } from '@/lib/plan-refresh';
+import type { ProjectStream } from '@/lib/project-stream';
+import type {
+  CalendarMarkerRefusal,
+  CalendarMarkers,
+  CalendarMarkersHost,
+} from '@/modules/calendar-markers/contract';
+import type { Channel } from '@/modules/channel';
 import type { PlanCommands } from '@/modules/plan-commands/contract';
 import type { PlanFeedForReader } from '@/modules/plan-feed/composition';
-import type { PlanFeed } from '@/modules/plan-feed/contract';
+import type {
+  PlanFeed,
+  PlanFeedRefusal,
+  PlanFeedStreamHandlers,
+} from '@/modules/plan-feed/contract';
+import type { DeliveredPlan } from '@/modules/plan-feed/delivered-plan-store';
+import type { Presence } from '@/modules/plan-feed/presence-store';
+import type { Busy } from '@/modules/plan-writer/busy-store';
+import type { PlanWriter, PlanWriteRefusal } from '@/modules/plan-writer/contract';
+import type { Store } from '@/modules/store';

 /** What a reader hands for its feed: everything the feed needs but the routes. */
 export type PlanFeedReader = Omit<PlanFeedForReader, 'routes'>;
@@ -31,3 +47,83 @@ export interface ProjectServices {
   /** The commands of one project, bound to it, writing through the commands' routes. */
   readonly planCommandsFor: (projectId: string) => PlanCommands;
 }
+
+/**
+ * A refusal one of this project's services announces: the feed's and the
+ * markers' as a cause, the writer's as the sentence it already chose.
+ *
+ * The words for a cause are built by whoever listens, and nowhere here, for the
+ * reason `PlanFeedDelivery` gives: a service that imported the refusal
+ * vocabulary would be importing upward out of `components/`.
+ */
+export type PlanRefusal = PlanFeedRefusal | CalendarMarkerRefusal | PlanWriteRefusal;
+
+/**
+ * What a project's stream tells its runtime: the feed's two handlers, and who
+ * else is in the project, which arrives on the same socket.
+ */
+export interface ProjectStreamHandlers extends PlanFeedStreamHandlers {
+  onPresence: (users: readonly string[]) => void;
+}
+
+/** How a project's stream is opened: by project, with its runtime's handlers, from its baseline. */
+export type OpenProjectStream = (
+  projectId: string,
+  handlers: ProjectStreamHandlers,
+  baseline: number,
+) => ProjectStream;
+
+/**
+ * What one project runtime is built over: the services cut from the session's
+ * one client, and the way its stream is opened — absent where there is no
+ * socket, as in a suite that draws the table on its own.
+ */
+export interface ProjectSource {
+  readonly services: ProjectServices;
+  readonly subscribe: OpenProjectStream | undefined;
+}
+
+/**
+ * The services of one selected project, for as long as its runtime is the one
+ * published — and nothing else (rule K2).
+ *
+ * One of each, built once when the project is opened and given back when it is
+ * left: the delivered plan the feed writes and the table selects, busy, the two
+ * announcement channels, the marker gestures, the writer and the commands. No
+ * bag, no client, no port, no refresh owner and no stream is reachable from
+ * here; the runtime's own suite enumerates this surface rather than trusting
+ * the type.
+ *
+ * **`isCurrent` is the one answer to "is this reader still on screen"**, and
+ * every guard that used to compare the table's own refs reads it instead. It
+ * turns false the instant the owner withdraws this runtime — before its
+ * disposal starts, whether or not a replacement follows — and never turns true
+ * again, so a late answer, a captured reread and a marker gesture from a
+ * runtime that has been left all find it false.
+ */
+export interface ProjectRuntime {
+  readonly projectId: string;
+  /** Whether this runtime is still the one its owner publishes. */
+  readonly isCurrent: () => boolean;
+  /** Every publication of the feed, folded; the table selects from it. */
+  readonly plan: Store<DeliveredPlan>;
+  /**
+   * Who else has this project open, and whether the socket saying so is up —
+   * this project's and nobody else's, starting from nobody, disconnected.
+   */
+  readonly presence: Store<Presence>;
+  /** Raised while a gesture is out; lowered when it ends only while this runtime is current. */
+  readonly busy: Busy;
+  /** Every refusal this project's services announce, once each. */
+  readonly refusals: Channel<PlanRefusal>;
+  /** Says that a gesture is starting, before its first request is sent. */
+  readonly commandsIssued: Channel<undefined>;
+  /**
+   * Reads these resources again and awaits the covering outcome, only while this
+   * runtime is current; failures stay in the feed's own snapshot.
+   */
+  readonly reread: (resources: readonly RefreshResource[]) => Promise<void>;
+  readonly markers: CalendarMarkers;
+  readonly writer: PlanWriter;
+  readonly commands: PlanCommands;
+}
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
new file mode 100644
index 000000000..cb3386b41
--- /dev/null
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -0,0 +1,333 @@
+import { DiBag } from 'di-bag';
+
+import type { RefreshResource } from '@/lib/plan-refresh';
+import type { CalendarMarkers } from '@/modules/calendar-markers/contract';
+import { type Channel, createChannel } from '@/modules/channel';
+import type { PlanCommands } from '@/modules/plan-commands/contract';
+import type { PlanFeedForReader } from '@/modules/plan-feed/composition';
+import type { PlanFeed } from '@/modules/plan-feed/contract';
+import {
+  createDeliveredPlan,
+  type DeliveredPlanStore,
+} from '@/modules/plan-feed/delivered-plan-store';
+import { createPresence, type PresenceStore } from '@/modules/plan-feed/presence-store';
+import { type Busy, createBusy } from '@/modules/plan-writer/busy-store';
+import type { PlanWriter } from '@/modules/plan-writer/contract';
+import { createPlanWriter } from '@/modules/plan-writer/plan-writer.feature';
+import type { PlanRefusal, ProjectRuntime, ProjectSource } from '@/modules/project/contract';
+import type { Store } from '@/modules/store';
+
+import { acquireTransactionally } from './application-runtime';
+import {
+  createLifetimeSlot,
+  type LifetimeState,
+  PartialAcquisitionError,
+  type RetirableRuntime,
+  RETIREMENT_BUDGET_MS,
+  TransitionSupersededError,
+} from './lifetime-slot';
+
+/** What one project runtime is installed from: the project, its source, and its own liveness. */
+export interface ProjectRuntimeDependencies extends ProjectSource {
+  readonly projectId: string;
+  /**
+   * Whether this runtime is still the one its owner publishes, asked
+   * synchronously at the moment anything happens.
+   *
+   * The owner's answer, not the runtime's: withdrawal happens in the owner, the
+   * instant a transition is accepted, and a runtime cannot see it. Every guard
+   * inside the runtime reads this and nothing else — see
+   * {@link ProjectRuntime.isCurrent}.
+   */
+  readonly isCurrent: () => boolean;
+}
+
+/**
+ * Installs one selected project's runtime: one DI Bag graph, built outside
+ * React, publishing {@link ProjectRuntime} and nothing else.
+ *
+ * Synchronous, because the lifetime slot's `Acquire` is: every factory here is
+ * a sync factory, which DI Bag runs inline, so the slot's generation fences
+ * hold. The feed starts reading as soon as it is resolved, exactly as the
+ * table's effect used to start it.
+ *
+ * **The feed is the graph's one owned disposable**, given back through
+ * `DiBag.withDisposal` when the runtime's close runs: its refresh owner is
+ * disposed and its stream unsubscribed then, once. The stores and channels hold
+ * nothing that needs giving back.
+ *
+ * Four guards read the owner's `isCurrent`, and the first three are the
+ * table's old reader guards moved to where the reader now is:
+ *
+ * - the feed hands nothing on — no publication, no refusal, no connection —
+ *   once this runtime has been withdrawn;
+ * - the refresh owner the writer and the marker gestures compare is `null`
+ *   once it has, so a gesture begun after that sends nothing and one begun
+ *   before it spends nothing against a replacement;
+ * - a reread asked of it after that reads nothing;
+ * - its stream tells its presence nothing more, so the roster of a project
+ *   that has been left is never changed after it was left.
+ *
+ * @throws `PartialAcquisitionError` when a service cannot be resolved, carrying
+ * the bounded close for whatever was acquired first — the feed above all,
+ * whose reads have already started.
+ */
+export function installProjectRuntime({
+  projectId,
+  services,
+  subscribe,
+  isCurrent,
+}: ProjectRuntimeDependencies): RetirableRuntime<ProjectRuntime> {
+  /**
+   * The stream the feed opens, telling this project's presence who is here and
+   * whether the socket is up — only while this runtime is current, so a
+   * withdrawn project's roster is never changed after it was left.
+   */
+  const streamInto = (presence: PresenceStore): PlanFeedForReader['subscribe'] =>
+    subscribe === undefined
+      ? undefined
+      : (streamProjectId, handlers, baseline) =>
+          subscribe(
+            streamProjectId,
+            {
+              onChange: handlers.onChange,
+              onConnectionChange: (connected) => {
+                if (isCurrent()) presence.reportConnection(connected);
+                handlers.onConnectionChange(connected);
+              },
+              onPresence: (users) => {
+                if (isCurrent()) presence.reportUsers(users);
+              },
+            },
+            baseline,
+          );
+  const bag = DiBag.createBuilder()
+    .register({
+      plan: DiBag.fromSyncFactory((): DeliveredPlanStore => createDeliveredPlan()),
+      busy: DiBag.fromSyncFactory((): Busy => createBusy()),
+      refusals: DiBag.fromSyncFactory((): Channel<PlanRefusal> => createChannel<PlanRefusal>()),
+      commandsIssued: DiBag.fromSyncFactory((): Channel<undefined> => createChannel<undefined>()),
+      presence: DiBag.fromSyncFactory((): PresenceStore => createPresence()),
+    })
+    .register({
+      feed: DiBag.withDisposal(
+        DiBag.fromSyncFactory(
+          ({
+            plan,
+            presence,
+            refusals,
+          }: {
+            plan: DeliveredPlanStore;
+            presence: PresenceStore;
+            refusals: Channel<PlanRefusal>;
+          }): PlanFeed =>
+            services.planFeedFor({
+              projectId,
+              subscribe: streamInto(presence),
+              isActiveReader: isCurrent,
+              plan,
+              refusals,
+            }),
+        ),
+        (feed) => {
+          feed.close();
+        },
+      ),
+    })
+    .register({
+      readRefreshOwner: DiBag.fromSyncFactory(
+        ({ feed }: { feed: PlanFeed }) =>
+          () =>
+            isCurrent() ? feed.owner : null,
+      ),
+      reread: DiBag.fromSyncFactory(
+        ({ feed }: { feed: PlanFeed }) =>
+          async (resources: readonly RefreshResource[]): Promise<void> => {
+            if (!isCurrent()) return;
+            await feed.rereadResources(resources);
+          },
+      ),
+    })
+    .register({
+      markers: DiBag.fromSyncFactory(
+        ({
+          readRefreshOwner,
+          refusals,
+        }: {
+          readRefreshOwner: () => PlanFeed['owner'] | null;
+          refusals: Channel<PlanRefusal>;
+        }): CalendarMarkers =>
+          services.calendarMarkersFor({
+            projectId,
+            readRefreshOwner,
+            isActiveReader: isCurrent,
+            announceRefusal: refusals.publish,
+          }),
+      ),
+      writer: DiBag.fromSyncFactory(
+        ({
+          readRefreshOwner,
+          reread,
+          busy,
+          commandsIssued,
+          refusals,
+        }: {
+          readRefreshOwner: () => PlanFeed['owner'] | null;
+          reread: (resources: readonly RefreshResource[]) => Promise<void>;
+          busy: Busy;
+          commandsIssued: Channel<undefined>;
+          refusals: Channel<PlanRefusal>;
+        }): PlanWriter =>
+          createPlanWriter({
+            readRefreshOwner,
+            isActiveReader: isCurrent,
+            rereadResources: reread,
+            busy,
+            commandsIssued,
+            refusals,
+          }),
+      ),
+      commands: DiBag.fromSyncFactory((): PlanCommands => services.planCommandsFor(projectId)),
+    })
+    .build();
+  return acquireTransactionally(bag, () => ({
+    projectId,
+    isCurrent,
+    plan: bag.resolve('plan'),
+    presence: bag.resolve('presence'),
+    busy: bag.resolve('busy'),
+    refusals: bag.resolve('refusals'),
+    commandsIssued: bag.resolve('commandsIssued'),
+    reread: bag.resolve('reread'),
+    markers: bag.resolve('markers'),
+    writer: bag.resolve('writer'),
+    commands: bag.resolve('commands'),
+  }));
+}
+
+/**
+ * The one owner of the selected project's runtime: which runtime is current,
+ * and the only way one is opened or left.
+ *
+ * A store (rule F2) over the runtime's {@link LifetimeState}, so the page draws
+ * the table only while a runtime is `live`, and the sanitized fatal state when
+ * one could not be retired or built.
+ */
+export interface ProjectOwner extends Store<LifetimeState<ProjectRuntime>> {
+  /**
+   * Withdraws whatever runtime is current, synchronously, and publishes one for
+   * this project once that runtime's retirement has succeeded.
+   *
+   * Resolves when this request has published, was overtaken by a newer one, or
+   * was refused because one of this owner's own runtimes could not be built or
+   * given back — the slot has then published `fatal`, which is what the page
+   * shows. It rejects only with a refusal that came from neither: a fault of
+   * the slot itself, rethrown with its cause.
+   */
+  readonly open: (projectId: string, source: ProjectSource) => Promise<void>;
+  /** Withdraws and retires whatever runtime is current; settles as {@link open} does. */
+  readonly leave: () => Promise<void>;
+}
+
+/** What an owner is built from; production passes none of it. */
+export interface ProjectOwnerDependencies {
+  /** How one runtime is installed. Defaults to {@link installProjectRuntime}. */
+  readonly install?: (dependencies: ProjectRuntimeDependencies) => RetirableRuntime<ProjectRuntime>;
+  /** The bounded wait for a retirement. Defaults to the one budget every lifetime has. */
+  readonly budgetMs?: number;
+}
+
+/**
+ * Builds the owner of one page's selected project.
+ *
+ * One lifetime slot underneath, so every rule of `lifetime-slot.ts` holds for
+ * the project too: withdrawal is synchronous, transitions run one at a time in
+ * request order, a superseded request builds nothing, a runtime is disposed
+ * once however many triggers retire it, and a retirement that fails or outruns
+ * its wait refuses every later transition with the sanitized fatal state.
+ *
+ * What this adds is **identity**. Each runtime is handed an `isCurrent` that
+ * answers yes only while the slot is `live` **with that very runtime**, so a
+ * runtime replaced by another project's is not current even though the slot is
+ * live again.
+ *
+ * Holds nothing until `open` is called, which is what makes it safe to build in
+ * a lazy state initializer that Strict Mode may run twice.
+ */
+export function createProjectOwner({
+  install = installProjectRuntime,
+  budgetMs = RETIREMENT_BUDGET_MS,
+}: ProjectOwnerDependencies = {}): ProjectOwner {
+  const slot = createLifetimeSlot<ProjectRuntime>(budgetMs);
+  /**
+   * Every failure that left one of this owner's runtimes: a construction that
+   * threw, a partial acquisition's release or a retirement that rejected. The
+   * slot turns each of these into its `fatal` state before rethrowing it, so a
+   * refusal found here is a modelled outcome whatever the slot's state has
+   * moved on to since. Compared by identity, never by message.
+   */
+  const refusedByRuntime = new Set<unknown>();
+  /** The same close, with its refusal recorded before the slot sees it. */
+  const recorded =
+    (close: (options: { timeoutMs: number }) => Promise<void>) =>
+    async (options: { timeoutMs: number }): Promise<void> => {
+      try {
+        await close(options);
+      } catch (refusal: unknown) {
+        refusedByRuntime.add(refusal);
+        throw refusal;
+      }
+    };
+  /**
+   * Settles one transition as a modelled outcome, classified by the refusal
+   * itself and not by the slot's state afterwards, which a later request may
+   * already have moved on.
+   *
+   * Superseded is controlled cancellation; a refusal from this owner's own
+   * runtime has been published as `fatal`, sanitized, and that state is what
+   * anybody is shown. Anything else is a fault of the slot and is rethrown
+   * with its cause.
+   */
+  const settle = async (transition: Promise<unknown>): Promise<void> => {
+    try {
+      await transition;
+    } catch (refusal: unknown) {
+      if (refusal instanceof TransitionSupersededError) return;
+      if (refusedByRuntime.has(refusal)) return;
+      throw new Error('a project transition was refused by the slot itself', { cause: refusal });
+    }
+  };
+  /** Installs one runtime, recording every failure that can leave it. */
+  const installRecorded = (dependencies: ProjectRuntimeDependencies) => {
+    let runtime: RetirableRuntime<ProjectRuntime>;
+    try {
+      runtime = install(dependencies);
+    } catch (failure: unknown) {
+      const refusal =
+        failure instanceof PartialAcquisitionError
+          ? new PartialAcquisitionError(failure.cause, recorded(failure.release))
+          : failure;
+      refusedByRuntime.add(refusal);
+      throw refusal;
+    }
+    return { services: runtime.services, close: recorded(runtime.close) };
+  };
+  return {
+    subscribe: slot.subscribe,
+    snapshot: slot.snapshot,
+    open: (projectId, source) =>
+      settle(
+        slot.replace(() => {
+          let built: ProjectRuntime | null = null;
+          const isCurrent = (): boolean => {
+            const state = slot.snapshot();
+            return state.status === 'live' && state.services === built;
+          };
+          const runtime = installRecorded({ projectId, ...source, isCurrent });
+          built = runtime.services;
+          return runtime;
+        }),
+      ),
+    leave: () => settle(slot.retire()),
+  };
+}
diff --git a/apps/wbs/fe-01/vitest.node-suites.ts b/apps/wbs/fe-01/vitest.node-suites.ts
index 35e31dd30..d07107bda 100644
--- a/apps/wbs/fe-01/vitest.node-suites.ts
+++ b/apps/wbs/fe-01/vitest.node-suites.ts
@@ -85,6 +85,8 @@ export const NODE_SUITES: readonly string[] = [
   'src/runtime/application-runtime.test.ts',
   'src/runtime/lifetime-slot.model.test.ts',
   'src/runtime/lifetime-slot.test.ts',
+  'src/runtime/project-runtime.model.test.ts',
+  'src/runtime/project-runtime.test.ts',
   'src/test-tiers.test.ts',
   'src/testing/fake-project-api.test.ts',
   'src/testing/plan-fixture-command-results.test.ts',
```

### 7.4 `spec.md` — slice 2, the scenario for the page and the table

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 42a7834e0..41d3e5a7c 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -456,3 +456,12 @@ and store surfaces.
   current, the withdrawn runtime's delivered plan stays exactly as it was when it
   was withdrawn, no request is sent on its behalf, and once its retirement has
   run its feed has been closed once and its stream unsubscribed once
+
+#### Scenario: The page owns the runtime, and the table draws from it
+
+- **WHEN** a project is selected, another project is selected, or the page goes
+- **THEN** the table is drawn only from the runtime the page's project owner
+  publishes for the selected project, and is handed no client, port or factory;
+  the previous project's stream is closed once; and when a retirement fails, the
+  sanitized report and its occurrence handle are shown in place of the page's
+  main and the next project is never drawn
```

### 7.5 `suites-over-client.ts` — slice 2, the named fixture edit, a script

Run from `apps/wbs/fe-01` over the seventeen suites of `$TMPDIR/suites.txt`, then Prettier over the
same seventeen (slice 2, step 3). It refuses any total other than 256 sites and any suite without a
site or without the imports it rewrites, and writes a file only once that file's edit is complete.

```ts
// Draws every table suite over `WbsTableOverClient` instead of `WbsTable`: the
// named fixture edit of slice 2, as a script because it touches 256 JSX sites in
// 17 files and nothing else. Prints one line per file, and exits non-zero on any
// file it does not recognise, having written nothing to it.
import { readFileSync, writeFileSync } from 'node:fs';

const FIXTURE = '@/testing/wbs-table-over-client';
const files = process.argv.slice(2);
if (files.length !== 17) throw new Error(`expected 17 suites, got ${String(files.length)}`);
let total = 0;
for (const file of files) {
  const before = readFileSync(file, 'utf8');
  // Only JSX: an opening tag followed by whitespace. Prose writes `<WbsTable>`.
  const sites = before.match(/<WbsTable(?=\s)/g)?.length ?? 0;
  if (sites === 0) throw new Error(`${file}: no <WbsTable site`);
  let after = before.replace(/<WbsTable(?=\s)/g, '<WbsTableOverClient');
  after = after.replace(/WbsTableProps\['subscribe'\]/g, "WbsTableOverClientProps['subscribe']");
  const needsProps = after.includes('WbsTableOverClientProps');
  const tableImport = /^import \{([^}]*)\} from '((?:\.\/|@\/components\/wbs\/)wbs-table)';\n/m;
  const found = tableImport.exec(after);
  if (found === null) throw new Error(`${file}: no import from the table's module`);
  const kept = (found[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '' && name !== 'WbsTable' && name !== 'type WbsTableProps');
  const replacement =
    kept.length === 0 ? '' : `import { ${kept.join(', ')} } from '${found[2] ?? ''}';\n`;
  after = after.replace(tableImport, replacement);
  const testing = [...after.matchAll(/^import [^;]*? from '@\/testing\/[^']+';\n/gms)];
  const last = testing.at(-1);
  if (last === undefined) throw new Error(`${file}: no @/testing import to follow`);
  const at = last.index + last[0].length;
  const named = needsProps
    ? 'WbsTableOverClient, type WbsTableOverClientProps'
    : 'WbsTableOverClient';
  after = `${after.slice(0, at)}import { ${named} } from '${FIXTURE}';\n${after.slice(at)}`;
  writeFileSync(file, after);
  total += sites;
  console.log(`${file} sites=${String(sites)}`);
}
console.log(`suites=${String(files.length)} sites=${String(total)}`);
if (total !== 256) throw new Error(`expected 256 sites, got ${String(total)}`);
```

### 7.6 `wbs-table-over-client.tsx` (**new**), `project-page.test.tsx` and `plan-read-and-write.test.tsx` — slice 2, the test side

Applied after 7.5 and Prettier, so its `plan-read-and-write.test.tsx` hunks are the four named edits'
three and nothing else, against the file the script left.

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx
index 8e669d7..4fd727b 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx
@@ -228,7 +228,10 @@ describe('live edits from other people', () => {
     expect(cursors.at(-1)).toBe(api.rows.length - 1);

     view.unmount();
-    expect(unsubscribed).toBe(true);
+    // The runtime's retirement runs after its withdrawal, not inside the unmount.
+    await waitFor(() => {
+      expect(unsubscribed).toBe(true);
+    });
   });

   /**
@@ -1829,7 +1832,10 @@ describe('refresh owner lifetimes', () => {
     });
     expect(screen.getByLabelText('Name of 010')).toHaveProperty('value', 'Strict owner');
     view.unmount();
-    expect(closed).toBe(1);
+    // The runtime's retirement runs after its withdrawal, not inside the unmount.
+    await waitFor(() => {
+      expect(closed).toBe(1);
+    });
   });

   it('does not toast an old API mutation refusal into its replacement', async () => {
@@ -2112,7 +2118,7 @@ describe('refresh owner lifetimes', () => {
     expect(toastTexts()).toEqual([]);
   });

-  it('announces an arrangement after the same reader renews its subscription', async () => {
+  it('drops an arrangement whose reader renewed its subscription, and leaves the new one idle', async () => {
     const api = fakeApi();
     await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Same reader' });
     const view = render(
@@ -2162,7 +2168,7 @@ describe('refresh owner lifetimes', () => {
         setTimeout(resolve, 0);
       });
     });
-    expect(toastTexts()).toEqual(['Arranged by schedule.']);
+    expect(toastTexts()).toEqual([]);
     expect(document.querySelector('[data-toolbar]')).toHaveAttribute('aria-busy', 'false');
     expect(screen.getByRole('button', { name: 'Arrange by schedule' })).toBeEnabled();
     expect(screen.getByLabelText('Name of 010')).toBeEnabled();
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
index e11f44e..91a9038 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
@@ -992,6 +992,74 @@ describe('the header bar', () => {
     },
   );

+  itDom('closes the selected project’s stream once the page goes', async () => {
+    let opened = 0;
+    let closed = 0;
+    const streamDeps: ProjectStreamDeps = {
+      openSocket: () => {
+        opened += 1;
+        return {
+          send: () => undefined,
+          close: () => {
+            closed += 1;
+          },
+        };
+      },
+      schedule: () => 0,
+      cancel: () => undefined,
+      random: () => 0,
+    };
+    const view = render(<ProjectPage token="t" api={fakeProjects(TWO)} streamDeps={streamDeps} />);
+    await selectProject('p2');
+    await waitFor(() => {
+      expect(opened).toBe(1);
+    });
+
+    view.unmount();
+
+    await waitFor(() => {
+      expect(closed).toBe(1);
+    });
+  });
+
+  itDom(
+    'shows the sanitized report when a project will not let go, and never draws the next',
+    async () => {
+      let opened = 0;
+      const streamDeps: ProjectStreamDeps = {
+        openSocket: () => {
+          opened += 1;
+          return {
+            send: () => undefined,
+            close: () => {
+              throw new Error('alice@example.com’s socket would not close');
+            },
+          };
+        },
+        schedule: () => 0,
+        cancel: () => undefined,
+        random: () => 0,
+      };
+      render(<ProjectPage token="t" api={fakeProjects(TWO)} streamDeps={streamDeps} />);
+      await selectProject('p1');
+      await waitFor(() => {
+        expect(opened).toBe(1);
+      });
+
+      await selectProject('p2');
+
+      const fault = await waitFor(() => {
+        const shown = document.querySelector('[data-lifetime-fault]');
+        expect(shown).not.toBeNull();
+        return shown;
+      });
+      expect(fault?.textContent).toContain('Reference');
+      expect(fault?.textContent).not.toContain('alice@example.com');
+      expect(document.querySelector('[data-grid]')).toBeNull();
+      expect(opened).toBe(1);
+    },
+  );
+
   itDom('leaves the table out of the banner and in the page’s main', async () => {
     pageWith(fakeProjects(TWO));
     await selectProject('p2');
@@ -999,8 +1067,12 @@ describe('the header bar', () => {
     // The half that says the landmark is a bar rather than the whole page: a
     // `<header>` wrapped around everything would satisfy the assertions above.
     const bar = screen.getByRole('banner');
-    const grid = document.querySelector('[data-grid]');
-    expect(grid).not.toBeNull();
+    // Drawn once the project's runtime is live, a few microtasks after the pick.
+    const grid = await waitFor(() => {
+      const drawn = document.querySelector('[data-grid]');
+      expect(drawn).not.toBeNull();
+      return drawn;
+    });
     expect(bar.contains(grid)).toBe(false);
     expect(document.querySelector('main')?.contains(grid)).toBe(true);
   });
diff --git a/apps/wbs/fe-01/src/testing/wbs-table-over-client.tsx b/apps/wbs/fe-01/src/testing/wbs-table-over-client.tsx
new file mode 100644
index 0000000..024fe5c
--- /dev/null
+++ b/apps/wbs/fe-01/src/testing/wbs-table-over-client.tsx
@@ -0,0 +1,60 @@
+import { type ReactNode, useEffect, useState } from 'react';
+
+import { WbsTable, type WbsTableProps } from '@/components/wbs/wbs-table';
+import type {
+  OpenProjectStream,
+  ProjectRuntime,
+  ProjectServices,
+} from '@/modules/project/contract';
+import { RETIREMENT_BUDGET_MS } from '@/runtime/lifetime-slot';
+import { installProjectRuntime } from '@/runtime/project-runtime';
+
+export interface WbsTableOverClientProps extends Omit<WbsTableProps, 'project'> {
+  readonly projectId: string;
+  /** The suite's fake client, composed — see `projectServicesOf`. */
+  readonly projectServices: ProjectServices;
+  /** Opens a live subscription; absent, the table is drawn without a socket. */
+  readonly subscribe?: OpenProjectStream;
+}
+
+/**
+ * The table as a suite draws it: over one project runtime per project, client
+ * and stream, installed by the production installer.
+ *
+ * What `ProjectPage`'s owner gives the table, less the owner's gate. The
+ * runtime is installed **synchronously in this component's effect**, so the
+ * table is on screen by the time Testing Library's `render` returns, exactly
+ * as every suite has always asserted; when any of the three props changes —
+ * a suite's "another project" or "another API" — the old runtime is withdrawn
+ * in the effect's cleanup, the instant React retires it, and given back after,
+ * and the new one is installed in the same commit.
+ *
+ * It does **not** hold the next runtime back until the last one's retirement
+ * has succeeded, and it never shows a fatal state: that is the project owner's
+ * job, proved by `runtime/project-runtime.model.test.ts` and the page's own
+ * suite, which draw through the real owner. A retirement that rejects here is
+ * left to reject, loudly, in the suite that caused it.
+ */
+export function WbsTableOverClient({
+  projectId,
+  projectServices,
+  subscribe,
+  ...table
+}: WbsTableOverClientProps): ReactNode {
+  const [project, setProject] = useState<ProjectRuntime | null>(null);
+  useEffect(() => {
+    let current = true;
+    const runtime = installProjectRuntime({
+      projectId,
+      services: projectServices,
+      subscribe,
+      isCurrent: () => current,
+    });
+    setProject(runtime.services);
+    return () => {
+      current = false;
+      void runtime.close({ timeoutMs: RETIREMENT_BUDGET_MS });
+    };
+  }, [projectId, projectServices, subscribe]);
+  return project === null ? null : <WbsTable project={project} {...table} />;
+}
```

### 7.7 `table-regions.ts` — slice 2, the two regions packet h's executor writes into, a script

Replaces, by anchor lines, the read hook's feed effect, reread callback, markers memo and writer memo
(everything between `useSnapshotChanges(plan, settle);` and the undo stack's JSDoc), and the table's
signature through its commands memo. Both regions hold `Proof:` comments on the real base — packet
g's `m1` in the markers memo, packet h's `t2` at the writer's `isActiveReader` and `t1` above the
commands memo's dependencies — whose words no diff here can know; the script removes whatever lines
stand between the anchors and refuses a missing or repeated anchor.

```ts
// Replaces the two regions of slice 2 that packet h's executor writes `Proof:`
// comments into — the table's commands memo and the read hook's feed, markers
// and writer — by their anchors, whatever comment lines stand between them.
// Takes the two files, in this order; prints one line per region; exits
// non-zero, having written nothing, when an anchor is missing or not unique.
import { readFileSync, writeFileSync } from 'node:fs';

const [readHook, table] = process.argv.slice(2);
if (readHook === undefined || table === undefined)
  throw new Error('usage: <use-plan-read.ts> <wbs-table.tsx>');

/** The index of the one line equal to `text`, refusing none and several. */
function onlyLine(lines: readonly string[], text: string, from = 0): number {
  const found = lines.flatMap((line, index) => (index >= from && line === text ? [index] : []));
  if (found.length !== 1)
    throw new Error(`expected one line ${JSON.stringify(text)}, found ${String(found.length)}`);
  const [index] = found;
  if (index === undefined) throw new Error('unreachable');
  return index;
}

/** The first line equal to `text` at or after `from`. */
function nextLine(lines: readonly string[], text: string, from: number): number {
  const index = lines.findIndex((line, at) => at >= from && line === text);
  if (index < 0) throw new Error(`no line ${JSON.stringify(text)} after ${String(from)}`);
  return index;
}

const hookLines = readFileSync(readHook, 'utf8').split('\n');
const settleAt = onlyLine(hookLines, '  useSnapshotChanges(plan, settle);');
const undoAt = onlyLine(
  hookLines,
  '   * One step along the undo stack, and the sentence that says what happened.',
);
if (hookLines[undoAt - 1] !== '  /**')
  throw new Error('the undo stack JSDoc does not open where expected');
const hookRegion = [
  '',
  '  /**',
  "   * Awaits this invalidation's covering outcome; failures remain in the owner",
  '   * snapshot. The runtime this callback was built for rereads only while it is',
  '   * current, so a reread asked from a project this reader has left reads',
  '   * nothing.',
  '   */',
  '  const refreshOrMarkStale = useCallback(',
  "    (scope: PlanReadScope = 'all'): Promise<void> =>",
  '      project.reread(',
  "        scope === 'tree'",
  "          ? ['tree']",
  "          : scope === 'tree-and-steps'",
  "            ? ['tree', 'steps']",
  '            : ALL_RESOURCES,',
  '      ),',
  '    [project],',
  '  );',
  '',
];
const removedFromHook = undoAt - 1 - (settleAt + 1);
hookLines.splice(settleAt + 1, removedFromHook, ...hookRegion);

const tableLines = readFileSync(table, 'utf8').split('\n');
const signatureAt = onlyLine(tableLines, 'export function WbsTable({');
const memoAt = onlyLine(tableLines, '  const commands = useMemo(', signatureAt);
const memoEnd = nextLine(tableLines, '  );', memoAt);
const tableRegion = [
  'export function WbsTable({',
  '  project,',
  '  projectName,',
  '  planImport,',
  '  toastApi: toastApiOverride,',
  '  savedPlansShelf,',
  '}: WbsTableProps) {',
  '  const projectId = project.projectId;',
  '  const today = useToday();',
  '  /**',
  "   * This project's commands, bound to it by its runtime. Everything below",
  '   * writes through these and never sees the client.',
  '   */',
  '  const commands = project.commands;',
];
const removedFromTable = memoEnd + 1 - signatureAt;
tableLines.splice(signatureAt, removedFromTable, ...tableRegion);

writeFileSync(readHook, hookLines.join('\n'));
writeFileSync(table, tableLines.join('\n'));
console.log(`read hook: ${String(removedFromHook)} lines replaced by ${String(hookRegion.length)}`);
console.log(`table: ${String(removedFromTable)} lines replaced by ${String(tableRegion.length)}`);
```

### 7.8 `contract.ts`, `use-plan-read.ts`, `wbs-table.tsx` and `project-page.tsx` — slice 2, the implementation

Applied after 7.7; its `use-plan-read.ts` and `wbs-table.tsx` hunks lie outside the two regions.

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index 6482f95..af6fb22 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -11,6 +11,7 @@ import {
 } from 'react';

 import { AppHeader } from '@/components/chrome/app-header';
+import { LifetimeFault } from '@/components/chrome/lifetime-fault';
 import type { Roster } from '@/components/presence/presence-panel';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
@@ -24,6 +25,7 @@ import {
   type ApplicationServicesState,
   useApplicationServicesReader,
 } from '@/runtime/application-services-context';
+import { createProjectOwner } from '@/runtime/project-runtime';

 import { useClosedByPointerOutside } from './close-on-outside-pointer';
 import { type BesideAnchorRect, HoverCard } from './hover-card';
@@ -558,6 +560,33 @@ export function ProjectPage({
   const [projects, setProjects] = useState<ProjectListEntry[]>([]);
   const [selected, setSelected] = useState<string | null>(null);
   const [error, setError] = useState<string | null>(null);
+  /**
+   * The owner of the selected project's runtime — its feed, its writer, its
+   * marker gestures and its commands, opened once per selected project and
+   * given back when the selection moves or this page goes.
+   *
+   * A lazy initializer is safe because the owner holds nothing until it is
+   * asked to open: Strict Mode's discarded second one leaks nothing. The
+   * runtime itself is only ever built by the effect below, never in render.
+   */
+  const [projectOwner] = useState(createProjectOwner);
+  const projectState = useSyncExternalStore(projectOwner.subscribe, projectOwner.snapshot);
+  /**
+   * Opens the selected project's runtime, and leaves it when the selection,
+   * the client or the stream changes, or the page goes.
+   *
+   * Every trigger reaches the one owner, so a switch, an unmount and Strict
+   * Mode's re-entry each withdraw the old runtime before anything else happens
+   * and retire it once; the next is published only after that retirement
+   * succeeded, and a retirement that fails leaves the owner fatal.
+   */
+  useEffect(() => {
+    if (selected === null) return;
+    void projectOwner.open(selected, { services: projectServices, subscribe });
+    return () => {
+      void projectOwner.leave();
+    };
+  }, [projectOwner, projectServices, selected, subscribe]);
   const toastApi = useToasts();
   /**
    * The rename in progress, or null while the picker is showing.
@@ -1200,14 +1229,28 @@ export function ProjectPage({
     </div>
   );

+  const header = (
+    <AppHeader
+      nav={nav}
+      project={projectControls}
+      presence={presence?.(roster)}
+      account={account}
+    />
+  );
+  if (projectState.status === 'fatal') {
+    // The project's runtime could not be given back, or built: the same sanitized
+    // report the page's own runtime shows, in place of the page's main, and no
+    // table drawn from services nobody owns.
+    return (
+      <>
+        {header}
+        <LifetimeFault fault={projectState.fault} />
+      </>
+    );
+  }
   return (
     <>
-      <AppHeader
-        nav={nav}
-        project={projectControls}
-        presence={presence?.(roster)}
-        account={account}
-      />
+      {header}
       {/*
         The rest of the window, and a column flex so the frame below can have
         what the toolbar does not. `min-h-0` is the load-bearing half: a flex
@@ -1226,24 +1269,27 @@ export function ProjectPage({
             {error}
           </p>
         )}
-        {selected !== null && (
+        {/* Drawn only while the owner publishes a runtime, and keyed by that
+        runtime's own project: in the render that moves the selection the owner
+        still publishes the previous project's, until the effect below withdraws
+        it, so the table stays the previous project's until then. */}
+        {projectState.status === 'live' && (
           <Profiler id="wbs-table" onRender={recordWbsScrollCommit}>
             <WbsTable
-              // Each project owns its rows and transient editor state.
-              // Proof: omitting this key left “Departed project row” in Name010
-              // in `starts a created project without the previous project’s row anchors`.
-              key={selected}
-              projectId={selected}
+              // Each project owns its rows and transient editor state. The owner
+              // usually publishes nothing between two projects' runtimes, which
+              // remounts the table by itself; the key is what keeps that true when
+              // the next runtime is drawn with no render in between.
+              key={projectState.services.projectId}
+              project={projectState.services}
               // The name the export's header and filename carry. Read from the
               // list rather than held twice: a rename lands in `projects` and the
               // next export says the new name.
               projectName={selectedProject?.name}
-              projectServices={projectServices}
               planImport={planImport}
               // Proof: omitting this page-owned API left the remounted table's
               // toast list empty after a successful import. Observed 2026-09-14.
               toastApi={toastApi}
-              subscribe={subscribe}
               // Rendered by the table only on a cards viewport, which is the
               // same answer `renderer` above gives — one hook, one store, so the
               // header's arm and this one are complementary and never both.
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index 52fdb48..8005b0b 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -1,17 +1,8 @@
 import type { DependencyReach } from '@wbs/domain/dependency-reach';
 import type * as React from 'react';
-import {
-  type ReactNode,
-  useCallback,
-  useEffect,
-  useMemo,
-  useRef,
-  useState,
-  useSyncExternalStore,
-} from 'react';
-
-import { ALL_RESOURCES, type DirectoryRead, type RefreshResource } from '@/lib/plan-refresh';
-import type { ProjectStream } from '@/lib/project-stream';
+import { type ReactNode, useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
+
+import { ALL_RESOURCES, type DirectoryRead } from '@/lib/plan-refresh';
 import type { AssignedPersonView } from '@/lib/wbs-api';
 import {
   DEFAULT_PERT_WEIGHTS_VIEW,
@@ -22,17 +13,12 @@ import {
   type SliceView,
   type StepView,
 } from '@/lib/wbs-api';
-import { type Channel, createChannel } from '@/modules/channel';
+import type { Channel } from '@/modules/channel';
 import type { PlanCommands } from '@/modules/plan-commands/contract';
-import type { PlanFeed } from '@/modules/plan-feed/contract';
-import {
-  createDeliveredPlan,
-  type DeliveredPlan,
-  type DeliveredPlanStore,
-} from '@/modules/plan-feed/delivered-plan-store';
-import { type BusyWrites, createBusy } from '@/modules/plan-writer/busy-store';
-import { createPlanWriter } from '@/modules/plan-writer/plan-writer.feature';
-import type { PlanRefusal, ProjectServices } from '@/modules/project/contract';
+import type { DeliveredPlan } from '@/modules/plan-feed/delivered-plan-store';
+import type { BusyWrites } from '@/modules/plan-writer/busy-store';
+import type { PlanRefusal, ProjectRuntime } from '@/modules/project/contract';
+import type { Store } from '@/modules/store';

 import { type CellCards } from './cell-card-store';
 import type { FocusIntent } from './live-editing';
@@ -46,16 +32,15 @@ import { useSnapshotChanges } from './use-snapshot-changes';
 import { toTree, type TreeRow } from './wbs-rows';

 export interface WbsTableProps {
-  projectId: string;
   /**
-   * The project's feed, marker gestures and commands, composed by the page over
-   * its one client — never the client itself (rule K2).
+   * The selected project's runtime, opened and left by its owner above the
+   * table — never the client, a port or the feed's refresh owner (rule K2).
    *
-   * Its identity is the client's: the page composes once per client, so the
-   * same services mean the same reader, and a new one is a new reader whose
-   * feed replaces the old one's.
+   * The table opens nothing and closes nothing: every service it writes
+   * through and every store it selects from is this runtime's, and a new
+   * runtime is a new reader.
    */
-  projectServices: ProjectServices;
+  project: ProjectRuntime;
   /** Page-owned archival import lifecycle; absent in isolated table tests. */
   planImport?: PlanImportControl;
   /** Page-owned production toast lifetime; absent in isolated table tests. */
@@ -68,15 +53,6 @@ export interface WbsTableProps {
    * in the app — see {@link UNNAMED_PROJECT} for what an export says without it.
    */
   projectName?: string;
-  /**
-   * Opens a live subscription. Optional so the table can be tested without a
-   * socket; supplied in the app.
-   */
-  subscribe?: (
-    projectId: string,
-    handlers: SubscriptionHandlers,
-    baseline: number,
-  ) => ProjectStream;
   /**
    * The saved-plan shelf, for the phone's `Plan actions` sheet — and rendered
    * **only** there, in the `cards` arm below.
@@ -190,24 +166,6 @@ export const NO_CHART_READ: ChartRead = {
   generation: 0,
 };

-/**
- * The project-owned stores and ports this table's services write through.
- *
- * Built once per mount, which is one project: `ProjectPage` keys the table by
- * the selected project. A lazy state initializer is safe here only because none
- * of them holds a resource or needs closing — StrictMode's discarded second
- * initializer leaks nothing. The project runtime of OpenSpec task 10 builds them
- * instead, and then this function goes.
- */
-function openProjectPorts() {
-  return {
-    plan: createDeliveredPlan(),
-    busy: createBusy(),
-    refusals: createChannel<PlanRefusal>(),
-    commandsIssued: createChannel<undefined>(),
-  };
-}
-
 /**
  * The rows each delivered tree draws, built once per tree however many places
  * ask: the table's render and the settling of the hover card below read the
@@ -247,7 +205,8 @@ function emptyDirectory(): DirectoryRead {
  * screen and a socket telling it when to read again — see {@link usePlanRead}
  * for the reading itself.
  */
-export function usePlanReadState({ projectId }: { projectId: string }) {
+export function usePlanReadState({ project }: { project: ProjectRuntime }) {
+  const projectId = project.projectId;
   /**
    * The project this render belongs to, readable by work that outlives the
    * render which started it.
@@ -260,8 +219,7 @@ export function usePlanReadState({ projectId }: { projectId: string }) {

   activeProject.current = projectId;

-  const [ports] = useState(openProjectPorts);
-  const delivered = useSyncExternalStore(ports.plan.subscribe, ports.plan.snapshot);
+  const delivered = useSyncExternalStore(project.plan.subscribe, project.plan.snapshot);
   const tree = delivered.tree;

   const workItems = useMemo(() => (tree === null ? [] : rowsOf(tree)), [tree]);
@@ -339,8 +297,8 @@ export function usePlanReadState({ projectId }: { projectId: string }) {
   );

   // Selected, never set here: the gestures raise and lower it through `busyWrites`.
-  const busy = useSyncExternalStore(ports.busy.subscribe, ports.busy.snapshot);
-  const busyWrites: BusyWrites = ports.busy;
+  const busy = useSyncExternalStore(project.busy.subscribe, project.busy.snapshot);
+  const busyWrites: BusyWrites = project.busy;

   const connected = delivered.connected;

@@ -419,7 +377,7 @@ export function usePlanReadState({ projectId }: { projectId: string }) {
    */
   const markers = delivered.markers;
   return {
-    plan: ports.plan,
+    plan: project.plan,
     markers,
     activeProject,
     workItems,
@@ -430,8 +388,8 @@ export function usePlanReadState({ projectId }: { projectId: string }) {
     treeFailureText,
     busy,
     busyWrites,
-    refusals: ports.refusals,
-    commandsIssued: ports.commandsIssued,
+    refusals: project.refusals,
+    commandsIssued: project.commandsIssued,
     connected,
     scheduleError,
     estimateMethod,
@@ -449,26 +407,29 @@ export function usePlanReadState({ projectId }: { projectId: string }) {
 }

 /**
- * Reading the plan, and everything that decides **when** to read it again: the
- * socket's events, a write's own answer, and the project changing under the
- * component.
+ * What the table does with the plan its project's runtime reads: the
+ * announcements it listens to, what a publication settles on screen, and the
+ * undo stack's own sentences.
  *
- * `refresh` takes a scope rather than always reading everything, because a step
- * rename and a tree replacement are different amounts of work and the socket
- * says which happened.
+ * It opens and closes nothing. The feed, the writer and the marker gestures are
+ * the runtime's, built once when the project was opened, and every "is this
+ * reader still on screen" question is the runtime's
+ * {@link ProjectRuntime.isCurrent}.
+ *
+ * `refreshOrMarkStale` takes a scope rather than always reading everything,
+ * because a step rename and a tree replacement are different amounts of work
+ * and the socket says which happened.
  */
 export function usePlanRead({
   setDrafts,
   projectId,
-  activeProject,
-  projectServices,
+  project,
   commands,
   plan,
   treeReadProject,
   rowPlacements,
   cellCards,
   pushToast,
-  subscribe,
   focusIntent,
   busyWrites,
   refusals,
@@ -476,32 +437,20 @@ export function usePlanRead({
 }: {
   setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
   projectId: string;
-  activeProject: React.RefObject<string>;
-  /**
-   * The project's services over the table's client. Its identity is the
-   * client's, and it is what every guard below compares where it compared the
-   * client before.
-   */
-  projectServices: ProjectServices;
+  /** The runtime the table is drawn from. */
+  project: ProjectRuntime;
   /** This project's commands, bound to it. */
   commands: PlanCommands;
-  plan: DeliveredPlanStore;
+  plan: Store<DeliveredPlan>;
   treeReadProject: React.RefObject<string | null>;
   rowPlacements: React.RefObject<ReadonlyMap<string, string>>;
   cellCards: CellCards;
   pushToast: (toast: Toast) => void;
-  subscribe:
-    | ((projectId: string, handlers: SubscriptionHandlers, baseline: number) => ProjectStream)
-    | undefined;
   focusIntent: React.RefObject<FocusIntent>;
   busyWrites: BusyWrites;
   refusals: Channel<PlanRefusal>;
   commandsIssued: Channel<undefined>;
 }) {
-  const feedRef = useRef<PlanFeed | null>(null);
-  const activeServices = useRef(projectServices);
-  activeServices.current = projectServices;
-
   // Joined before the feed below starts reading, which is a passive effect of
   // this same commit: see `useChannelListener`.
   useChannelListener(refusals, (refusal) => {
@@ -661,12 +610,10 @@ export function usePlanRead({
    */
   const stepStack = useCallback(
     async (direction: 'undo' | 'redo') => {
-      const owner = feedRef.current?.owner ?? null;
-      const isCurrent = () =>
-        owner !== null &&
-        feedRef.current?.owner === owner &&
-        activeProject.current === projectId &&
-        activeServices.current === projectServices;
+      // The runtime this step was asked of, and not whoever is on screen when its
+      // answer arrives: a project this reader has left says nothing and lowers
+      // nothing in the one that replaced it.
+      const isCurrent = project.isCurrent;
       busyWrites.raise();
       try {
         let outcome;
@@ -706,17 +653,9 @@ export function usePlanRead({
         if (isCurrent()) busyWrites.lower();
       }
     },
-    [
-      activeProject,
-      busyWrites,
-      commands,
-      projectId,
-      projectServices,
-      pushToast,
-      refreshOrMarkStale,
-    ],
+    [busyWrites, commands, project, pushToast, refreshOrMarkStale],
   );
-  return { refreshOrMarkStale, run: writer.run, stepStack, markers };
+  return { refreshOrMarkStale, run: project.writer.run, stepStack, markers: project.markers };
 }

 /**
diff --git a/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx b/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
index 55edea8..99174f9 100644
--- a/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
@@ -652,7 +652,7 @@ export function WbsTable({
     teamCapacities,
     priorityBands,
     people,
-  } = usePlanReadState({ projectId });
+  } = usePlanReadState({ project });
   const {
     expanded,
     setExpanded,
@@ -940,15 +940,13 @@ export function WbsTable({
   } = usePlanRead({
     setDrafts,
     projectId,
-    activeProject,
-    projectServices,
+    project,
     commands,
     plan,
     treeReadProject,
     rowPlacements,
     cellCards,
     pushToast,
-    subscribe,
     focusIntent,
     busyWrites,
     refusals,
diff --git a/apps/wbs/fe-01/src/modules/project/contract.ts b/apps/wbs/fe-01/src/modules/project/contract.ts
index ae8742c..610adf9 100644
--- a/apps/wbs/fe-01/src/modules/project/contract.ts
+++ b/apps/wbs/fe-01/src/modules/project/contract.ts
@@ -29,15 +29,14 @@ export type CalendarMarkersReader = Omit<CalendarMarkersHost, 'api'>;
  * What a plan screen may build for the project it shows: its feed, its marker
  * gestures and its commands — feature-services only (rule K2).
  *
- * Factories and not instances, because the table still owns when each is
- * opened and closed: the feed per reader effect, the markers and the commands
- * per reader memo. The project runtime of OpenSpec task 10 builds them once
- * per selected project instead. The HTTP client and the three private ports
- * cut from it are inside, and no member hands either out.
+ * Factories and not instances, because this is what a project runtime is
+ * built **from**: `runtime/project-runtime.ts` calls each once for the one
+ * project it opens, and nothing in delivery calls them. The HTTP client and
+ * the three private ports cut from it are inside, and no member hands either
+ * out.
  *
- * Its **identity** is the reader's API identity: a table that is handed a
- * different one has been handed a different client, and every stale-owner guard
- * that compared the client before compares this now.
+ * Its **identity** is the client's: the page composes once per client, and a
+ * new one makes its project owner open the selected project again over it.
  */
 export interface ProjectServices {
   /** Opens one reader's live plan, reading through the plan feed's routes. */
```

### 7.9 `spec.md` — slice 3, presence

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 41d3e5a7c..d7e582534 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -390,8 +390,8 @@ stores and listen to the channels, and what a reader sees SHALL NOT change.
 #### Scenario: The header selects presence from a store

 - **WHEN** the project's stream reports who is here or whether it is connected
-- **THEN** the page's presence store holds it and the header's presence slot is
-  handed it, starting from nobody and disconnected
+- **THEN** the selected project's runtime's presence store holds it and the
+  header's presence slot is handed it, starting from nobody and disconnected

 ### Requirement: The plan's modules reach the HTTP client only through their own ports

@@ -465,3 +465,11 @@ and store surfaces.
   the previous project's stream is closed once; and when a retirement fails, the
   sanitized report and its occurrence handle are shown in place of the page's
   main and the next project is never drawn
+
+#### Scenario: A project switch resets presence
+
+- **WHEN** the selected project's stream has said who is here and that it is
+  connected, and another project is selected
+- **THEN** from the old runtime's withdrawal on, the header's presence slot is
+  handed nobody and disconnected, and never the old project's list again, until
+  the next project's own stream says who is there
```

### 7.10 `project-page.test.tsx` — slice 3, one new example

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
index 91a90388d..c0994755b 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
@@ -992,6 +992,62 @@ describe('the header bar', () => {
     },
   );

+  itDom(
+    'hands the presence slot nobody in the next project until its own stream says',
+    async () => {
+      const sockets: SocketHandlers[] = [];
+      const streamDeps: ProjectStreamDeps = {
+        openSocket: (_url, handlers) => {
+          sockets.push(handlers);
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
+      await selectProject('p1');
+      await waitFor(() => {
+        expect(sockets).toHaveLength(1);
+      });
+      const first = sockets.at(0);
+      if (first === undefined) throw new Error('p1 opened no socket');
+      act(() => {
+        first.onOpen();
+        first.onMessage(JSON.stringify({ type: 'presence', users: ['kat', 'lee'] }));
+        first.onMessage(JSON.stringify({ type: 'resume_ack', replayed: { 'project:p1': 0 } }));
+      });
+      expect(asked.at(-1)).toEqual({ users: ['kat', 'lee'], connected: true });
+      const beforeSwitch = asked.length;
+
+      await selectProject('p2');
+      await waitFor(() => {
+        expect(sockets).toHaveLength(2);
+      });
+
+      // Only the render that moves the selection may still show p1's roster: from
+      // the withdrawal on, the header is handed nobody until p2's stream speaks.
+      const afterSwitch = asked.slice(beforeSwitch);
+      const reset = afterSwitch.findIndex(
+        (roster) => roster.users.length === 0 && !roster.connected,
+      );
+      expect(reset).toBeGreaterThanOrEqual(0);
+      expect(afterSwitch.slice(reset).filter((roster) => roster.users.length > 0)).toEqual([]);
+      expect(asked.at(-1)).toEqual({ users: [], connected: false });
+    },
+  );
+
   itDom('closes the selected project’s stream once the page goes', async () => {
     let opened = 0;
     let closed = 0;
```

### 7.11 `project-page.tsx`, `presence-store.ts`, the three READMEs, the lifetime map and `tasks.md` — slice 3

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index af6fb22b8..e303b2e47 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -19,8 +19,10 @@ import { type ProjectStreamDeps, subscribeToProject } from '@/lib/project-stream
 import type { Recalled } from '@/lib/remembered';
 import { cn } from '@/lib/utils';
 import { httpProjectApi, type ProjectApi, type ProjectListEntry } from '@/lib/wbs-api';
-import { createPresence } from '@/modules/plan-feed/presence-store';
+import type { Presence } from '@/modules/plan-feed/presence-store';
 import { projectServicesOver } from '@/modules/project/composition';
+import type { ProjectStreamHandlers } from '@/modules/project/contract';
+import type { Store } from '@/modules/store';
 import {
   type ApplicationServicesState,
   useApplicationServicesReader,
@@ -40,7 +42,7 @@ import {
 import { recordWbsScrollCommit } from './scroll-performance';
 import { useToasts } from './toasts';
 import { usePlanImport } from './use-plan-import';
-import { type SubscriptionHandlers, WbsTable } from './wbs-table';
+import { WbsTable } from './wbs-table';

 export interface ProjectPageProps {
   token: string;
@@ -80,7 +82,7 @@ export interface ProjectPageProps {
    *
    * The seam is here and not on `subscribe`, because the factory below **is**
    * the thing under test: it is the only place the stream's `onChange` and the
-   * table's `SubscriptionHandlers` are joined, and a test that replaced the
+   * project runtime's handlers are joined, and a test that replaced the
    * factory would be asserting about its own wiring. Handing the socket in
    * instead leaves every line of the composition production code, and is the
    * same bargain `api` makes three props up.
@@ -121,6 +123,15 @@ export function recallLastProject(services: ApplicationServicesState): Recalled<
  * asked for and what the rename field opens holding, and two literals that
  * must agree is one of them going stale.
  */
+/** Nobody, not connected: the honest answer before any socket has spoken. */
+const NOBODY: Presence = { users: [], connected: false };
+
+/** The presence the header is handed while no project runtime is published. */
+const NOBODY_HERE: Store<Presence> = {
+  subscribe: () => () => undefined,
+  snapshot: () => NOBODY,
+};
+
 const PLACEHOLDER_PROJECT_NAME = 'New project';

 /**
@@ -504,27 +515,8 @@ export function ProjectPage({
     () => savedPlansOverride ?? browserSavedPlansDeps(),
     [savedPlansOverride],
   );
-  /**
-   * Who else is in the selected project, and whether the socket saying so is
-   * up.
-   *
-   * Held here because this page renders both halves of the screen the answer
-   * is for: the header's panel and the `<main>` the table fills. The table
-   * opens the stream (it is the thing that has to refetch), so the roster
-   * arrives through the factory below rather than from a socket of the header's
-   * own.
-   *
-   * A plain store the stream writes into and the header selects from, so the
-   * factory is handed no React setter. One per page mount, exactly as the state
-   * it replaces was — it is **not** reset when the selection changes, and that
-   * is kept deliberately: which lifetime resets it is the project runtime's
-   * decision (OpenSpec tasks 10 and 11), not this packet's. A lazy initializer
-   * is safe because the store holds no resource.
-   */
-  const [projectPresence] = useState(createPresence);
-  const roster: Roster = useSyncExternalStore(projectPresence.subscribe, projectPresence.snapshot);
   const subscribe = useMemo(
-    () => (projectId: string, handlers: SubscriptionHandlers, baseline: number) =>
+    () => (projectId: string, handlers: ProjectStreamHandlers, baseline: number) =>
       subscribeToProject(
         {
           projectId,
@@ -535,21 +527,13 @@ export function ProjectPage({
           sinceSeq: baseline,
           hasBaseline: true,
           onChange: handlers.onChange,
-          onConnectionChange: (connected) => {
-            // Proof: on 2026-09-24, this line deleted failed `hands the presence slot who the project’s stream
-            // says is here, and its connection` on `expected { users: [ 'kat', 'lee' ], …(1) } to deeply equal
-            // { users: [ 'kat', 'lee' ], …(1) }`, `connected` staying `false` where `true` was expected.
-            projectPresence.reportConnection(connected);
-            handlers.onConnectionChange(connected);
-          },
-          // Proof: on 2026-09-24, `() => undefined` here failed `hands the presence slot who the project’s
-          // stream says is here, and its connection` on `expected { users: [], connected: false } to deeply
-          // equal { users: [ 'kat', 'lee' ], …(1) }`.
-          onPresence: projectPresence.reportUsers,
+          // The project's runtime tells its own presence, and the feed, from here.
+          onConnectionChange: handlers.onConnectionChange,
+          onPresence: handlers.onPresence,
         },
         streamDeps,
       ),
-    [projectPresence, streamDeps],
+    [streamDeps],
   );

   /**
@@ -571,6 +555,20 @@ export function ProjectPage({
    */
   const [projectOwner] = useState(createProjectOwner);
   const projectState = useSyncExternalStore(projectOwner.subscribe, projectOwner.snapshot);
+  /**
+   * Who else is in the selected project, and whether the socket saying so is
+   * up: the project runtime's own presence, which its stream writes into.
+   *
+   * **Reset by a project switch**, and that is the decision rather than an
+   * accident: while no runtime is published — the instant the old project is
+   * withdrawn, until the next one is live — the header is handed nobody,
+   * disconnected, and then the next project's own store, which starts from
+   * nobody until its own stream says who is there. A roster is one project's,
+   * so the previous project's list is never shown under the next one's name.
+   */
+  const presenceStore =
+    projectState.status === 'live' ? projectState.services.presence : NOBODY_HERE;
+  const roster: Roster = useSyncExternalStore(presenceStore.subscribe, presenceStore.snapshot);
   /**
    * Opens the selected project's runtime, and leaves it when the selection,
    * the client or the stream changes, or the page goes.
diff --git a/apps/wbs/fe-01/src/modules/calendar-markers/README.md b/apps/wbs/fe-01/src/modules/calendar-markers/README.md
index f87c05918..d2741e0a4 100644
--- a/apps/wbs/fe-01/src/modules/calendar-markers/README.md
+++ b/apps/wbs/fe-01/src/modules/calendar-markers/README.md
@@ -46,10 +46,11 @@ feed's `markers` resource comes out, and every answer a person sees arrives thro
 There is no `module.ts`: DI Bag 0.4.0 is installed but nothing in this application is composed
 through it yet, which is the rollout's lifetimes task, so `composition.ts` is a function, as
 `modules/plan-feed/composition.ts` is. Its one caller is the project composition root,
-`modules/project/composition.ts`, which hands it the page's one client as its routes. The plan read
-hook, `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, builds the gestures through the
-project's services and hands them the refresh owner the plan feed beside it holds; the four chart
-gestures reach it through `wbs-table.tsx`.
+`modules/project/composition.ts`, which hands it the page's one client as its routes. The project
+runtime, `apps/wbs/fe-01/src/runtime/project-runtime.ts`, builds the gestures once per selected
+project through the project's services and hands them the refresh owner of the plan feed it holds
+while it is current, and none once it has been withdrawn; the four chart gestures reach it through
+`wbs-table.tsx`.

 ## Checks

diff --git a/apps/wbs/fe-01/src/modules/plan-feed/README.md b/apps/wbs/fe-01/src/modules/plan-feed/README.md
index f562e8ae1..a38edce53 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/README.md
+++ b/apps/wbs/fe-01/src/modules/plan-feed/README.md
@@ -20,7 +20,8 @@ contract in `apps/wbs/fe-01/src/modules/store.ts`, which is rule F2.
 - `delivered-plan-store.ts` is the **store** the feed publishes into: every publication folded
   into the one snapshot a screen selects from, with the connection the stream last reported.
 - `presence-store.ts` is the **store** of who else has the project open and whether the socket
-  saying so is up. The page owns it today and the project's stream writes into it.
+  saying so is up. The project runtime owns one per selected project, and its stream writes into
+  it only while that runtime is current.

 Both stores are plain TypeScript over `modules/channel.ts`, keep their snapshot the same object
 until a member changes, tell each listener once per change, and never throw a lifecycle refusal.
@@ -51,8 +52,8 @@ connection change — so a reader that has gone is told nothing.
 Anything React holds, and any sentence. The rows, the chart payload, the vocabularies, the undo
 stack, the estimate drafts and the hover card belong to the plan read hook, which applies each
 delivery to them; a refusal travels as its **cause**, and the words for it are built where they
-are said. Gestures belong to the plan writer beside this module. Presence stays with the page that
-renders the header.
+are said. Gestures belong to the plan writer beside this module. Which presence the header shows is the
+page's choice: the current project runtime's, or nobody while none is published.

 ## How it is read

@@ -71,11 +72,11 @@ There is no `module.ts`: DI Bag 0.4.0 is installed but nothing in this applicati
 through it yet, which is the rollout's lifetimes task, so `composition.ts` is a function, as
 `modules/directory-management/composition.ts` is. Its one caller is the project composition root,
 `modules/project/composition.ts`, which hands it the page's one client as its routes. The plan read
-hook, `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, opens the feed through the project's
-services and wires it to the plan writer module beside it: the writer compares the owner's identity and sends its rereads back through the
-hook. The same hook builds the delivered plan once per table mount, and `project-page.tsx` builds
-the presence store once per page mount; the project runtime of OpenSpec task 10 builds both
-instead.
+runtime, `apps/wbs/fe-01/src/runtime/project-runtime.ts`, opens the feed once per selected project
+through the project's services, with the delivered plan and the presence it writes into, and
+wires it to the plan writer module beside it: the writer compares the owner's identity and sends
+its rereads through the runtime, which reads only while it is current. The runtime gives the feed
+back — owner disposed, stream unsubscribed — when the page's project owner retires it.

 ## Checks

diff --git a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
index 5cc67d497..1300bb3c1 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
@@ -26,8 +26,8 @@ export interface Presence {
  * every presence frame is a new list, and a frame is a change.
  *
  * Plain TypeScript with no lifetime of its own (rule F1): nothing closes it and
- * no call on it throws a lifecycle refusal. One store per selected project; the
- * page holds it today and the project runtime of OpenSpec task 10 takes it over.
+ * no call on it throws a lifecycle refusal. One store per selected project,
+ * held by that project's runtime (`runtime/project-runtime.ts`).
  */
 export interface PresenceStore extends Store<Presence> {
   readonly reportUsers: (users: readonly string[]) => void;
diff --git a/apps/wbs/fe-01/src/modules/project/README.md b/apps/wbs/fe-01/src/modules/project/README.md
index 4ab19defe..920424d94 100644
--- a/apps/wbs/fe-01/src/modules/project/README.md
+++ b/apps/wbs/fe-01/src/modules/project/README.md
@@ -21,9 +21,10 @@ Plain TypeScript, no React (rule F1 of the code organization design in

 ## What it does not own

-When anything is opened or closed. The table still opens its feed in an effect and builds its
-markers and commands in memos, per reader; the project runtime of OpenSpec task 10 of
-`adopt-frontend-lifetimes` builds them once per selected project instead. The project catalog —
+When anything is opened or closed. `contract.ts` also declares `ProjectRuntime`, the services of
+one selected project, and the source a runtime is built over; the runtime itself and its owner
+are `apps/wbs/fe-01/src/runtime/project-runtime.ts`, which calls these factories once per selected
+project and gives what they built back when the project is left. The project catalog —
 listing, creating, opening, renaming and importing projects — is the page's, on the same client,
 and is not a plan module's.

diff --git a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
index 6d7d36d68..b38a02399 100644
--- a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
+++ b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
@@ -102,6 +102,8 @@ Hazards:
 - a project provider around only `WbsTable` strands the roster and saved-plan shelf outside their owner;
 - awaiting an unbounded close before installing the replacement can leave the selected page permanently blank on a stuck disposer. The packet needs an explicit, tested transition policy using DI Bag's bounded-wait semantics, without claiming that a timed-out cleanup stopped.

+Update, observed <observed-date-j> (050.7j, OpenSpec task 10, not yet closed): the project owner is `ProjectPage`'s, built over one lifetime slot by `createProjectOwner` in `apps/wbs/fe-01/src/runtime/project-runtime.ts`, above the header and the table. Its effect opens a DI Bag project runtime per selected project — delivered plan, busy, presence, both channels, feed, marker gestures, writer and commands — withdraws it synchronously on a switch, an unmount or Strict Mode's re-entry, and retires it once; a failed retirement shows the sanitized fatal state in place of the page's main. The table receives `ProjectRuntime` and opens nothing. Presence now resets on a switch. Saved plans are not yet in the runtime: the shelf keeps its own keyed watch, and the saved-plans prerequisite above stands.
+
 ## Narrow context and K2 resolution

 Contexts contain readonly service interfaces, never construction inputs or infrastructure.
diff --git a/openspec/changes/adopt-frontend-lifetimes/tasks.md b/openspec/changes/adopt-frontend-lifetimes/tasks.md
index d810119f9..40b962ed4 100644
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -103,6 +103,16 @@
       feed's owner reads, stay task 10's.
 - [ ] 10. The project runtime owns feed, writer, markers and saved plans for one
       selected project, replacing the per-effect ownership under `WbsTable`.
+      Moved by 050-7-j, observed <observed-date-j>: one DI Bag project runtime
+      (`apps/wbs/fe-01/src/runtime/project-runtime.ts`) owns the selected
+      project's delivered plan, busy, presence, refusal and command-issued
+      channels, feed, marker gestures, writer and commands, and one project owner
+      in `ProjectPage` opens it per selected project, withdraws it the instant the
+      selection moves or the page goes, and retires it once; the table receives
+      `ProjectRuntime` and opens and closes nothing. Presence is now reset by a
+      project switch. This box stays unchecked for the one outcome still owed:
+      saved plans, whose shelf keeps its own keyed watch and has no feature facade
+      yet — the lifetime map's saved-plans prerequisite.
 - [ ] 11. Project switch, route unmount and Strict Mode re-entry each replace all
       project ownership; a stale completion changes nothing.
 - [ ] 12. Each module has its own isolated type check and its graph check, and every
```

## 8. Proofs

Every fault below was injected for real in the planner's rehearsal on 2026-09-24, on the final
rehearsal commit (the files each fault touches are the same bytes there as after the slice that owns
it): its named test watched failing, the file restored and compared, the test rerun green, before the
next fault. The executor repeats each one and writes the adjacent `Proof:` comment **only after
observing its own failure**, dated with its own observed date (`date -u +%F`) — never 2026-09-24,
never before the observation. Each slice runs **all** of its faults first and writes its comments
afterwards, so every fault patch below still applies.

**Where the comments may go.** A comment is written only into a file no later slice's patch touches.
`project-runtime.ts` is final after slice 1: slice 1 writes its comments there (twelve sites for
eighteen faults) and slice 2 adds `w1`'s, whose context lies in the markers factory, away from
every slice-1 site (section 9.1 checks `w1` against a copy with all twelve slice-1 sites filled);
that is why slice 2 owns `project-runtime.ts`. `project-page.tsx` is patched in slices 2
and 3, so all four of its faults are slice 3's.

**Each slice's faults are records of four lines** — id, file (from the repository root), suite (from
`apps/wbs/fe-01`) and the exact `-t` pattern — in the first `text` block of that slice's subsection.
Vitest's `-t` is a regular expression; no title below holds a metacharacter, and the typographic
apostrophes in five of them match themselves. Extract the records from this document rather than
retyping them:

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-j-project-runtime.md
section=8.1 # this slice's subsection: 8.1 for slice 1, 8.2 for slice 2, 8.3 for slice 3
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

Expected: 72 lines for slice 1, 4 for slice 2 and 16 for slice 3.

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
the first fault whose named test passes, **after** that file has been restored and compared — then
preamble rule 20 applies: re-read the table, redo that fault once by hand, and stop if it still
passes. Every command inside reads `/dev/null`, so nothing it runs can consume the records the loop
is reading. Extra failing tests are recorded, not a stop.

**The comment** names the injected fault and the observed failure, as a `//` line comment directly
above the line the table names, for example:

```ts
// Proof: on <observed date>, comparing only the slot's status here failed `keeps one runtime
// current, and nothing of a withdrawn one reaches anybody` after 1 run: r1 and r2 both current.
```

Faults that share a site share one comment block, one sentence each (`m1` and `m9`; `m4` and `m5`;
`m7` and `r2`; `m8` and `r1`; `k1` and `k2`; `m10` and `o3`). None of this packet's sites carries an existing `Proof:` comment.

**For the model faults**, the run number, the shrunk command sequence and the innermost cause the
table quotes are the evidence; they are seed-pinned and were identical in two rehearsal runs. A
different run number or sequence means the generator, seed or command set differs from what was
reviewed: record it, and stop only if the named test **passes**.

### 8.1 Slice 1 — the owner and the runtime (`apps/wbs/fe-01/src/runtime/project-runtime.ts`)

The records for `$TMPDIR/proofs.txt`:

```text
m1
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
m2
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
m3
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
m4
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
m5
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
m6
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
m7
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
m8
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
m9
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
m10
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
k1
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.test.ts
publishes the project’s feature and store surfaces, and nothing else
k2
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.test.ts
gives back the feed a half-built runtime had already opened
r1
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.test.ts
tells the project’s presence who its stream says is here, and whether it is up
r2
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.test.ts
tells the project’s presence who its stream says is here, and whether it is up
o1
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.test.ts
settles a request a newer one overtook, and builds nothing for it
o2
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.test.ts
shows a retirement that fails as the fatal state, and refuses the next project
o3
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.test.ts
gives back the feed a half-built runtime had already opened
o4
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/runtime/project-runtime.test.ts
is terminal, and still settles, when a half-built runtime cannot be released
```

Every model fault fails the model test, `Tests 1 failed (1)`, exit 1. Run, the shrunk command
sequence (after the scheduler's own record, which fast-check prints first) and the innermost cause,
as rehearsed twice on the r2 commits (the two new commands changed the generator, so every run
number differs from round 1's):

| Id    | Fault                                                                                      | Run | Shrunk sequence, times                                            | Innermost cause                                                                                                     | Comment above                                                             |
| ----- | ------------------------------------------------------------------------------------------ | --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `m1`  | a stale reader survives a switch: `isCurrent` compares the slot's status only              | 2   | `reenter(p1),open(p1),drain`, 2                                   | `drain: more than one runtime says it is current: expected [ 'r1', 'r2' ] to have a length of 1 but got 2`          | `return state.status === 'live' && state.services === built;`             |
| `m2`  | a late answer lands after retirement: the feed's reader test always yes                    | 2   | `open(p1),drain,leave,frame(0, change)`, 7                        | `teardown: r1's delivered plan changed after it was withdrawn: expected false to be true`                           | the feed factory's `isActiveReader: isCurrent,`                           |
| `m3`  | a withdrawn reader's reread reads                                                          | 6   | `reenter(p1),openBroken(p1),drain,open(p1),reread(0)`, 5          | `reread: withdrawn r2 sent a request: expected 1 to be +0`                                                          | `if (!isCurrent()) return;` in `reread`                                   |
| `m4`  | double retirement: the feed closed twice, by hand beside its disposal                      | 2   | `open(p1),leave,reenter(p1)`, 5                                   | `teardown: r1's feed closed 2 times, live=false: expected 2 to be 1`                                                | `feed.close();` in the feed's disposer                                    |
| `m5`  | a subscription leaks past retirement: the disposer closes nothing                          | 2   | `open(p1),leave,reenter(p1)`, 5                                   | `teardown: r1's feed closed 0 times, live=false: expected +0 to be 1`                                               | `feed.close();` in the feed's disposer (with `m4`)                        |
| `m6`  | a withdrawn reader's marker gesture writes: the owner handed out regardless                | 2   | `reenter(p1),open(p1),mark(0)`, 2                                 | `mark: withdrawn r1 sent a request: expected 1 to be +0`                                                            | `isCurrent() ? feed.owner : null,`                                        |
| `m7`  | a withdrawn project's connection still reaches its presence                                | 3   | `reenter(p1),openBroken(p1),drain,open(p1),frame(0, connect)`, 7  | `frame(r2, connect): r2's presence changed after it was withdrawn: expected false to be true`                       | `if (isCurrent()) presence.reportConnection(connected);`                  |
| `m8`  | a withdrawn project's roster still reaches its presence                                    | 6   | `reenter(p1),openBroken(p1),drain,open(p1),frame(0, presence)`, 5 | `frame(r2, presence): r2's presence changed after it was withdrawn: expected false to be true`                      | `if (isCurrent()) presence.reportUsers(users);`                           |
| `m9`  | `isCurrent` compares the project, not the runtime: the re-entrant reopen of one project    | 2   | `reenter(p1),open(p1),drain`, 1                                   | `drain: more than one runtime says it is current: expected [ 'r1', 'r2' ] to have a length of 1 but got 2`          | `return state.status === 'live' && state.services === built;` (with `m1`) |
| `m10` | a partial acquisition's refusal not recorded: the owner rethrows its own runtime's failure | 3   | `openBroken(p1),reread(0)`, 6                                     | `teardown refused: Error: a project transition was refused by the slot itself`, caused by `PartialAcquisitionError` | `refusedByRuntime.add(refusal);` in `installRecorded`                     |

`m9`'s counterexample runs through `reenter`: the notification that publishes `r1` asks for `p1`
again from inside it, and the sabotaged `isCurrent` answers yes for both runtimes of that project.
It is **not** re-entry-specific — the same sabotage fails on two plain `open(p1)` — and the shrinker
kept the re-entrant path because the generator reached it first; no `isCurrent` fault was found that
only re-entry exposes, because P2 checks withdrawal synchronously after every `open`, re-entrant or
not. `m10` is re-entry-free and is the partial-acquisition class's teeth.

The examples, each `Tests 1 failed \| 6 skipped (7)`, exit 1:

| Id   | Fault                                                                           | Suite › test                                                                                                 | Observed                                                                                                                                                                                                                 | Comment above                                                             |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `k1` | the feed published beside the feature surfaces                                  | `project-runtime.test.ts` › `publishes the project’s feature and store surfaces, and nothing else`           | `expected [ 'busy', 'commands', …(10) ] to deeply equal [ 'busy', 'commands', …(9) ]`                                                                                                                                    | `return acquireTransactionally(bag, () => ({`                             |
| `k2` | the transaction's close gives nothing back                                      | `project-runtime.test.ts` › `gives back the feed a half-built runtime had already opened`                    | `expected +0 to be 1` — the half-built runtime's feed never closed                                                                                                                                                       | `return acquireTransactionally(bag, () => ({` (with `k1`)                 |
| `r1` | the stream's roster not told to the presence                                    | `project-runtime.test.ts` › `tells the project’s presence who its stream says is here, and whether it is up` | `expected { users: [], connected: true } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`                                                                                                                              | `if (isCurrent()) presence.reportUsers(users);` (with `m8`)               |
| `r2` | the stream's connection not told to the presence                                | same                                                                                                         | `expected { users: [ 'kat', 'lee' ], …(1) } to deeply equal { users: [ 'kat', 'lee' ], …(1) }` — `connected` stayed `false`                                                                                              | `if (isCurrent()) presence.reportConnection(connected);` (with `m7`)      |
| `o1` | a superseded open rejects instead of settling                                   | `project-runtime.test.ts` › `settles a request a newer one overtook, and builds nothing for it`              | `promise rejected "Error: a project transition was refused b…" instead of resolving`, caused by `TransitionSupersededError: lifetime transition 1 was superseded by 2`                                                   | `if (refusal instanceof TransitionSupersededError) return;`               |
| `o2` | a refused retirement not recorded: the owner rethrows its own runtime's failure | `project-runtime.test.ts` › `shows a retirement that fails as the fatal state, and refuses the next project` | `promise rejected "Error: a project transition was refused b…" instead of resolving`, caused by `a project transition was refused by the slot itself` and `DI_BAG_CLEANUP_FAILED`                                        | `refusedByRuntime.add(refusal);` in `recorded`'s catch                    |
| `o3` | a partial acquisition's refusal not recorded (the `m10` fault)                  | `project-runtime.test.ts` › `gives back the feed a half-built runtime had already opened`                    | `Error: a project transition was refused by the slot itself`, caused by `PartialAcquisitionError`                                                                                                                        | `refusedByRuntime.add(refusal);` in `installRecorded` (with `m10`)        |
| `o4` | a partial acquisition's release refusal not recorded: the rewrap dropped        | `project-runtime.test.ts` › `is terminal, and still settles, when a half-built runtime cannot be released`   | `promise rejected "Error: a project transition was refused b…" instead of resolving`, caused by `a project transition was refused by the slot itself` and `DI_BAG_CLEANUP_FAILED` — the half-built feed's disposer threw | `? new PartialAcquisitionError(failure.cause, recorded(failure.release))` |

#### Proof m1 — a stale reader survives a switch: `isCurrent` compares the slot's status only

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..5f299a3 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -321,7 +321,7 @@ export function createProjectOwner({
           let built: ProjectRuntime | null = null;
           const isCurrent = (): boolean => {
             const state = slot.snapshot();
-            return state.status === 'live' && state.services === built;
+            return state.status === 'live';
           };
           const runtime = installRecorded({ projectId, ...source, isCurrent });
           built = runtime.services;
```

#### Proof m2 — a late answer lands after retirement: the feed's reader test always answers yes

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..0514b0b 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -124,7 +124,7 @@ export function installProjectRuntime({
             services.planFeedFor({
               projectId,
               subscribe: streamInto(presence),
-              isActiveReader: isCurrent,
+              isActiveReader: () => true,
               plan,
               refusals,
             }),
```

#### Proof m3 — a withdrawn reader's reread reads

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..e4539d5 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -143,7 +143,6 @@ export function installProjectRuntime({
       reread: DiBag.fromSyncFactory(
         ({ feed }: { feed: PlanFeed }) =>
           async (resources: readonly RefreshResource[]): Promise<void> => {
-            if (!isCurrent()) return;
             await feed.rereadResources(resources);
           },
       ),
```

#### Proof m4 — double retirement: the feed closed twice, by hand beside its disposal

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..266af7d 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -131,6 +131,7 @@ export function installProjectRuntime({
         ),
         (feed) => {
           feed.close();
+          feed.close();
         },
       ),
     })
```

#### Proof m5 — a subscription leaks past retirement: the feed's disposer closes nothing

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..6bc5ea1 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -130,7 +130,7 @@ export function installProjectRuntime({
             }),
         ),
         (feed) => {
-          feed.close();
+          void feed;
         },
       ),
     })
```

#### Proof m6 — a withdrawn reader's marker gesture writes: the refresh owner handed out regardless

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..801c57c 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -138,7 +138,7 @@ export function installProjectRuntime({
       readRefreshOwner: DiBag.fromSyncFactory(
         ({ feed }: { feed: PlanFeed }) =>
           () =>
-            isCurrent() ? feed.owner : null,
+            feed.owner,
       ),
       reread: DiBag.fromSyncFactory(
         ({ feed }: { feed: PlanFeed }) =>
```

#### Proof m7 — a withdrawn project's connection still reaches its presence

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..9ed0f3e 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -92,7 +92,7 @@ export function installProjectRuntime({
             {
               onChange: handlers.onChange,
               onConnectionChange: (connected) => {
-                if (isCurrent()) presence.reportConnection(connected);
+                presence.reportConnection(connected);
                 handlers.onConnectionChange(connected);
               },
               onPresence: (users) => {
```

#### Proof m8 — a withdrawn project's roster still reaches its presence

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..ff23dee 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -96,7 +96,7 @@ export function installProjectRuntime({
                 handlers.onConnectionChange(connected);
               },
               onPresence: (users) => {
-                if (isCurrent()) presence.reportUsers(users);
+                presence.reportUsers(users);
               },
             },
             baseline,
```

#### Proof m9 — `isCurrent` compares the project, not the runtime

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..fca37f8 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -321,7 +321,7 @@ export function createProjectOwner({
           let built: ProjectRuntime | null = null;
           const isCurrent = (): boolean => {
             const state = slot.snapshot();
-            return state.status === 'live' && state.services === built;
+            return state.status === 'live' && state.services.projectId === projectId;
           };
           const runtime = installRecorded({ projectId, ...source, isCurrent });
           built = runtime.services;
```

#### Proof m10 — a partial acquisition's refusal not recorded, seen by the model

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..6c73e7c 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -307,7 +307,6 @@ export function createProjectOwner({
         failure instanceof PartialAcquisitionError
           ? new PartialAcquisitionError(failure.cause, recorded(failure.release))
           : failure;
-      refusedByRuntime.add(refusal);
       throw refusal;
     }
     return { services: runtime.services, close: recorded(runtime.close) };
```

#### Proof k1 — the feed published beside the feature surfaces

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..1be5e29 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -202,6 +202,7 @@ export function installProjectRuntime({
     markers: bag.resolve('markers'),
     writer: bag.resolve('writer'),
     commands: bag.resolve('commands'),
+    feed: bag.resolve('feed'),
   }));
 }

```

#### Proof k2 — the transaction's close gives nothing back

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..f9317f3 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -190,7 +190,7 @@ export function installProjectRuntime({
       commands: DiBag.fromSyncFactory((): PlanCommands => services.planCommandsFor(projectId)),
     })
     .build();
-  return acquireTransactionally(bag, () => ({
+  return acquireTransactionally({ close: async () => undefined }, () => ({
     projectId,
     isCurrent,
     plan: bag.resolve('plan'),
```

#### Proof r1 — the stream's roster not told to the presence

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..777094d 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -96,7 +96,7 @@ export function installProjectRuntime({
                 handlers.onConnectionChange(connected);
               },
               onPresence: (users) => {
-                if (isCurrent()) presence.reportUsers(users);
+                void users;
               },
             },
             baseline,
```

#### Proof r2 — the stream's connection not told to the presence

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..af24607 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -92,7 +92,7 @@ export function installProjectRuntime({
             {
               onChange: handlers.onChange,
               onConnectionChange: (connected) => {
-                if (isCurrent()) presence.reportConnection(connected);
+                void connected;
                 handlers.onConnectionChange(connected);
               },
               onPresence: (users) => {
```

#### Proof o1 — a superseded open rejects instead of settling

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..b909b93 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -292,7 +292,6 @@ export function createProjectOwner({
     try {
       await transition;
     } catch (refusal: unknown) {
-      if (refusal instanceof TransitionSupersededError) return;
       if (refusedByRuntime.has(refusal)) return;
       throw new Error('a project transition was refused by the slot itself', { cause: refusal });
     }
```

#### Proof o2 — a refused retirement not recorded, so the owner rethrows its own runtime's failure

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..f76bf9e 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -274,7 +274,6 @@ export function createProjectOwner({
       try {
         await close(options);
       } catch (refusal: unknown) {
-        refusedByRuntime.add(refusal);
         throw refusal;
       }
     };
```

#### Proof o3 — a partial acquisition's refusal not recorded, seen by the half-built example

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..6c73e7c 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -307,7 +307,6 @@ export function createProjectOwner({
         failure instanceof PartialAcquisitionError
           ? new PartialAcquisitionError(failure.cause, recorded(failure.release))
           : failure;
-      refusedByRuntime.add(refusal);
       throw refusal;
     }
     return { services: runtime.services, close: recorded(runtime.close) };
```

#### Proof o4 — a partial acquisition's release refusal not recorded: the rewrap dropped

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..8111af6 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -305,7 +305,7 @@ export function createProjectOwner({
     } catch (failure: unknown) {
       const refusal =
         failure instanceof PartialAcquisitionError
-          ? new PartialAcquisitionError(failure.cause, recorded(failure.release))
+          ? failure
           : failure;
       refusedByRuntime.add(refusal);
       throw refusal;
```

### 8.2 Slice 2 — the runtime's marker wiring, through the real table

```text
w1
apps/wbs/fe-01/src/runtime/project-runtime.ts
src/components/wbs/plan-chart-seam.test.tsx
rereads a marker refused because a peer already deleted it
```

| Id   | Fault                            | Suite › test                                                                              | Observed                                                                                                                                                          | Comment above                                                                      |
| ---- | -------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `w1` | the markers' refusals go nowhere | `plan-chart-seam.test.tsx` › `rereads a marker refused because a peer already deleted it` | `1 failed \| 22 skipped (23)`; `the given combination of arguments (undefined and string) is invalid for this assertion` — no toast was there to hold `no longer` | the markers factory's `announceRefusal: refusals.publish,` in `project-runtime.ts` |

This is packet g's `m1` moved: the same fault, the same test, at the site the check now lives.

#### Proof w1 — the markers' refusals go nowhere

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index cb3386b..2dc06f2 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -161,7 +161,7 @@ export function installProjectRuntime({
             projectId,
             readRefreshOwner,
             isActiveReader: isCurrent,
-            announceRefusal: refusals.publish,
+            announceRefusal: () => undefined,
           }),
       ),
       writer: DiBag.fromSyncFactory(
```

### 8.3 Slice 3 — the page (`apps/wbs/fe-01/src/components/wbs/project-page.tsx`)

```text
q1
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
shows the sanitized report when a project will not let go, and never draws the next
q2
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
closes the selected project’s stream once the page goes
x1
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
hands the presence slot who the project’s stream says is here, and its connection
x2
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
hands the presence slot who the project’s stream says is here, and its connection
```

| Id   | Fault                                             | Suite › test                                                                                                    | Observed (`1 failed \| 75 skipped (76)` each)                                                                       | Comment above                                                                             |
| ---- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `q1` | a fatal project draws the page's main anyway      | `project-page.test.tsx` › `shows the sanitized report when a project will not let go, and never draws the next` | `expected null not to be null` — no `[data-lifetime-fault]`                                                         | `if (projectState.status === 'fatal') {`                                                  |
| `q2` | the owner's effect never leaves the project       | `project-page.test.tsx` › `closes the selected project’s stream once the page goes`                             | `expected +0 to be 1` — the socket was never closed                                                                 | the owner effect's `return () => {`, the line directly above `void projectOwner.leave();` |
| `x1` | the stream's roster never reaches the runtime     | `project-page.test.tsx` › `hands the presence slot who the project’s stream says is here, and its connection`   | `expected { users: [], connected: false } to deeply equal { users: [ 'kat', 'lee' ], …(1) }`                        | `onPresence: handlers.onPresence,`                                                        |
| `x2` | the stream's connection never reaches the runtime | same                                                                                                            | `expected { users: [ 'kat', 'lee' ], …(1) } to deeply equal { users: [ 'kat', 'lee' ], …(1) }` — still disconnected | `onConnectionChange: handlers.onConnectionChange,`                                        |

`x1` and `x2` are packet g's two page proofs moved to the lines that now carry the stream to the
runtime; the page's reset itself is proved by slice 3's red, not by a fault (section 3.8).

#### Proof q1 — a fatal project draws the page's main anyway

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index e303b2e..09ac1e8 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -1235,7 +1235,7 @@ export function ProjectPage({
       account={account}
     />
   );
-  if (projectState.status === 'fatal') {
+  if (projectState.status === 'fatal' && false) {
     // The project's runtime could not be given back, or built: the same sanitized
     // report the page's own runtime shows, in place of the page's main, and no
     // table drawn from services nobody owns.
```

#### Proof q2 — the owner's effect never leaves the project

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index e303b2e..c1835fa 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -581,9 +581,7 @@ export function ProjectPage({
   useEffect(() => {
     if (selected === null) return;
     void projectOwner.open(selected, { services: projectServices, subscribe });
-    return () => {
-      void projectOwner.leave();
-    };
+    return undefined;
   }, [projectOwner, projectServices, selected, subscribe]);
   const toastApi = useToasts();
   /**
```

#### Proof x1 — the stream's roster never reaches the runtime

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index e303b2e..6314d72 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -529,7 +529,7 @@ export function ProjectPage({
           onChange: handlers.onChange,
           // The project's runtime tells its own presence, and the feed, from here.
           onConnectionChange: handlers.onConnectionChange,
-          onPresence: handlers.onPresence,
+          onPresence: () => undefined,
         },
         streamDeps,
       ),
```

#### Proof x2 — the stream's connection never reaches the runtime

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index e303b2e..34dacd6 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -528,7 +528,7 @@ export function ProjectPage({
           hasBaseline: true,
           onChange: handlers.onChange,
           // The project's runtime tells its own presence, and the feed, from here.
-          onConnectionChange: handlers.onConnectionChange,
+          onConnectionChange: () => undefined,
           onPresence: handlers.onPresence,
         },
         streamDeps,
```

## 9. Verification

### 9.1 Every fenced diff and script applies, extracted from this document, in slice order

The requirement is not "these diffs were once correct" but "these diffs and the two scripts, as this
committed document spells them, apply in slice order, produce exactly the rehearsal's final tree,
and every fault patch applies to what they produce" — on the rehearsal base, **and** on that base
with packet h's executor comment sites filled in the files this packet patches. `fill=1` inserts a
two-line `// Proof:` comment above each of those sites, anchored on the line packet h's section 8
names: `t1` in `wbs-table.tsx` (`[projectServices, projectId],`), `t2` in `use-plan-read.ts` (the
writer memo's `isActiveReader: () =>`, the third of three) and `q1` in `project-page.tsx` (`const
projectServices = useMemo(() => projectServicesOver(api), [api]);`) — three sites, six lines; then,
after every patch, it fills this packet's own twelve slice-1 comment sites in `project-runtime.ts`
and checks that slice 2's `w1` still applies. The scratch tree gets a `node_modules` link so the
suites script's Prettier pass resolves; `.gitignore` excludes it.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-j-project-runtime.md
base=a687bf3892e1cd06500564d671325817c997e505
final=62bcab3305893f1c9cff8a0fbda2ae86de640060
test -f "$packet"
test -d node_modules
modules=$(pwd)/node_modules
# Inserts a two-line comment above the Nth line (default 1) whose trimmed text is exactly $2.
fill_above() {
  file=$1
  anchor=$2
  nth=${3:-1}
  test -f "$file"
  awk -v a="$anchor" -v n="$nth" '
    { t = $0; sub(/^ +/, "", t) }
    t == a { seen++ }
    t == a && seen == n {
      match($0, /^ */); ind = substr($0, 1, RLENGTH)
      print ind "// Proof: simulated, standing where an executor writes one; the words are"
      print ind "// not knowable from here."
    }
    { print }
  ' "$file" > "$file.filled"
  mv "$file.filled" "$file"
}
for fill in 0 1; do
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
  echo "fill=$fill extracted=$count"
  test "$count" -eq 9
  awk -v one="$work/suites-over-client.ts" -v two="$work/table-regions.ts" '
    /^## 7\. The code$/ { inside=1; next }
    /^## 8\. Proofs$/   { inside=0 }
    inside && /^```ts$/ { n++; capture=1; next }
    capture && /^```$/ { capture=0; next }
    capture && n == 1 { print > one }
    capture && n == 2 { print > two }
  ' "$packet"
  awk -v out="$work/mutations" '
    /^## 8\. Proofs$/ { inside=1; next }
    /^## 9\. Verification$/ { inside=0 }
    inside && /^#### Proof / { id=$3; next }
    inside && /^```diff$/ { f=sprintf("%s/%s.diff", out, id); capture=1; next }
    capture && /^```$/ { capture=0; next }
    capture { print >> f }
  ' "$packet"
  count=$(find "$work/mutations" -name '*.diff' | wc -l)
  echo "fill=$fill fault-patches=$count"
  test "$count" -eq 23
  # A real repository holding exactly the base tree, so --check has something to check against.
  git archive "$base" | tar -x -C "$work/tree"
  fe="$work/tree/apps/wbs/fe-01"
  if [ "$fill" -eq 1 ]; then
    fill_above "$fe/src/components/wbs/wbs-table.tsx" "[projectServices, projectId],"
    fill_above "$fe/src/components/wbs/use-plan-read.ts" "isActiveReader: () =>" 3
    fill_above "$fe/src/components/wbs/project-page.tsx" \
      "const projectServices = useMemo(() => projectServicesOver(api), [api]);"
    filled=$(cat "$fe/src/components/wbs/wbs-table.tsx" "$fe/src/components/wbs/use-plan-read.ts" \
      "$fe/src/components/wbs/project-page.tsx" | grep -c 'Proof: simulated')
    echo "fill=1 filled-sites=$filled"
    test "$filled" -eq 3
  fi
  git -C "$work/tree" init -q
  git -C "$work/tree" add -A
  git -C "$work/tree" -c user.email=x@example.invalid -c user.name=x commit -qm base
  ln -s "$modules" "$work/tree/node_modules"
  # --check and apply are SEPARATE commands: joined with && under set -e, a failed
  # check does not stop the shell and a later iteration can still reach the end.
  for n in 01 02 03 04; do
    git -C "$work/tree" apply --check "$work/patches/$n.diff"
    git -C "$work/tree" apply "$work/patches/$n.diff"
  done
  suites="src/components/ui/page-shortcuts.test.tsx"
  for name in gantt-panel optimization-integration plan-cards plan-cells plan-chart-seam \
    plan-dependencies plan-estimates plan-filter plan-keyboard plan-layout plan-read-and-write \
    plan-row-dependencies plan-row-render-cost plan-structure plan-table plan-toolbar; do
    suites="$suites src/components/wbs/$name.test.tsx"
  done
  # shellcheck disable=SC2086 # seventeen fixed paths without spaces
  (cd "$fe" && bun "$work/suites-over-client.ts" $suites | tail -n 1 \
    && GSETTINGS_BACKEND=memory bunx prettier --write $suites > /dev/null)
  git -C "$work/tree" apply --check "$work/patches/05.diff"
  git -C "$work/tree" apply "$work/patches/05.diff"
  (cd "$work/tree" && bun "$work/table-regions.ts" apps/wbs/fe-01/src/components/wbs/use-plan-read.ts \
    apps/wbs/fe-01/src/components/wbs/wbs-table.tsx)
  for n in 06 07 08 09; do
    git -C "$work/tree" apply --check "$work/patches/$n.diff"
    git -C "$work/tree" apply "$work/patches/$n.diff"
  done
  echo "fill=$fill all 9 applied, the suites script after 04 and the regions script after 05"
  for m in "$work"/mutations/*.diff; do
    git -C "$work/tree" apply --check "$m"
  done
  echo "fill=$fill all 23 fault patches check against the result"
  git -C "$work/tree" status --porcelain --untracked-files=all | wc -l
  if [ "$fill" -eq 0 ]; then
    mkdir "$work/final"
    git archive "$final" | tar -x -C "$work/final"
    diff -r --exclude=.git --exclude=node_modules "$work/tree" "$work/final"
    echo "fill=0 tree identical to $final"
  else
    runtime="$fe/src/runtime/project-runtime.ts"
    left=$(cat "$fe/src/components/wbs/wbs-table.tsx" "$fe/src/components/wbs/use-plan-read.ts" \
      "$fe/src/components/wbs/project-page.tsx" | grep -c 'Proof: simulated')
    echo "fill=1 simulated comments left=$left"
    test "$left" -eq 1
    for anchor in "return state.status === 'live' && state.services === built;" \
      "if (!isCurrent()) return;" "feed.close();" "isCurrent() ? feed.owner : null," \
      "if (isCurrent()) presence.reportConnection(connected);" \
      "if (isCurrent()) presence.reportUsers(users);" \
      "return acquireTransactionally(bag, () => ({" \
      "if (refusal instanceof TransitionSupersededError) return;"; do
      fill_above "$runtime" "$anchor"
    done
    fill_above "$runtime" "isActiveReader: isCurrent," 1
    # The two recorded refusals: `recorded`'s catch, then `installRecorded`'s.
    fill_above "$runtime" "refusedByRuntime.add(refusal);" 1
    fill_above "$runtime" "refusedByRuntime.add(refusal);" 2
    # The partial acquisition's rewrap, `o4`'s own site.
    fill_above "$runtime" "? new PartialAcquisitionError(failure.cause, recorded(failure.release))"
    test "$(grep -c 'Proof: simulated' "$runtime")" -eq 12
    git -C "$work/tree" apply --check "$work/mutations/w1.diff"
    echo "fill=1 w1 checks with all twelve slice-1 sites filled"
  fi
done
````

Observed on 2026-09-24, after the final Prettier `--check` of this document:

```text
fill=0 extracted=9
fill=0 fault-patches=23
suites=17 sites=256
read hook: 108 lines replaced by 19
table: 18 lines replaced by 14
fill=0 all 9 applied, the suites script after 04 and the regions script after 05
fill=0 all 23 fault patches check against the result
34
fill=0 tree identical to 62bcab3305893f1c9cff8a0fbda2ae86de640060
fill=1 extracted=9
fill=1 fault-patches=23
fill=1 filled-sites=3
suites=17 sites=256
read hook: 110 lines replaced by 19
table: 20 lines replaced by 14
fill=1 all 9 applied, the suites script after 04 and the regions script after 05
fill=1 all 23 fault patches check against the result
34
fill=1 simulated comments left=1
fill=1 w1 checks with all twelve slice-1 sites filled
```

`git apply --check` prints nothing on success, which is why the script's own `echo` lines are the
evidence and why every count is asserted rather than printed. The number printed after the fault
check is the paths changed against the base: thirty-four — every owned path of the three slices but
`verify.md`, which the executor writes. The `fill=0` tree is byte-identical to the rehearsal's final
commit (`diff -r` printed nothing), which holds the two `<observed-date-j>` placeholders slice 3
step 4 replaces. In the `fill=1` run the regions script replaced 110 and 20 lines — the base's 108
and 18 plus the two simulated comment lines in each region — the simulated `t2` and `t1` lines went
with their regions, `q1`'s survived in place, and every fault patch still checks.

**Replayed on the real packet h tree.** The round-1 reviewer ran this script's round-1 form on
`7a76f2f33` (packet h's lane merged, its real `Proof:` comments in place): all nine diffs applied in
order, the suites script printed `suites=17 sites=256`, the regions script printed `read hook: 111
lines replaced by 19` and `table: 21 lines replaced by 14` — h's real comments are three lines where
this script simulates two, and the anchors absorb either — and every fault patch checked. The round-2
reviewer replayed round 2's form on the dispatch base itself, `4f40a1ed7` (main after packet h's
PR 55, its tree identical to `7a76f2f33`): the same `111`/`21` region counts, all twenty-two fault
patches checked, 34 paths. Round 3 changes only one slice-1 test file, which h does not touch. The
planner still reruns it on the dispatch base before the first dispatch.

**A failed check stops the run**: the same two-line form as packets g and h, where the `&&` variant
was rehearsed printing its success line after `error: patch failed` and exiting 0.

Every **intermediate** tree typechecks: `wbs-fe-01:typecheck` exit 0 on each of the three rehearsal
commits, each committed with the hooks on. Exactly two trees do not: the red checkpoints of slices 1
and 2, each after that slice's contract and test side and before its implementation (section 6 gives
each one's diagnostics); slice 3's red is a runtime red only. A red is rebuilt only from the previous
slice's tree plus that slice's test side, never by reverse-applying patches on a later tree.

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
new requirement and its scenarios live in a document that already counted as one item.

### 9.3 Commands actually run, and what each reported

All on 2026-09-24, by this packet's author, on a rehearsal branch cut at `a687bf38` where each slice
was committed **with the hooks on** (lefthook passed for all three commits), not inside an executor
sandbox: `a70dab9e` (slice 1), `16a105ff` (slice 2) and `62bcab33` (slice 3), on the throwaway
branch `rehearse/050-7-j-r3` — round 2's slices (`fad97db2`, `d43101b9`, `49fae67f`, kept on
`rehearse/050-7-j-r2`) with round 2's review's seventh example added to slice 1; round 1's
(`0142dc1a`, `dc8b5706`, `fcb49202`) stay on `rehearse/050-7-j`. Each later slice differs from its
round-2 twin only by the one test file slice 1 carries forward. Each red was rebuilt from the previous slice's commit plus that slice's
contract and test side only; each fault was injected into the final commit, whose bytes in every
faulted file equal the owning slice's.

| Check                                   | Base `a687bf38` | Slice 1                      | Slice 2                      | Slice 3                       |
| --------------------------------------- | --------------- | ---------------------------- | ---------------------------- | ----------------------------- |
| sandbox node suite (files·tests)        | 51·687          | 53·695                       | 53·695                       | 53·695                        |
| preferences suite                       | 4·39            | 4·39                         | 4·39                         | 4·39                          |
| zoned (Auckland)                        | 2·3             | 2·3                          | 2·3                          | 2·3                           |
| runtime pair (slice 1's `s1-*-runtime`) | —               | 2·8                          | 2·8                          | 2·8                           |
| read-and-write suite                    | 88              | 88                           | 88                           | 88                            |
| page and router                         | 2·78            | 2·78                         | 2·80                         | 2·81                          |
| adopted set, serial                     | 20·1215         | 20·1215                      | 20·1217                      | 20·1218                       |
| red typecheck                           | —               | exit 1, 14 errors in 2 files | exit 1, 4 errors in 2 files  | none: a runtime red           |
| red Vitest                              | —               | 2 files failed, no tests     | `Tests 5 failed (5)`, 1 file | `1 failed \| 75 skipped (76)` |
| typecheck on the slice's commit         | 0               | 0                            | 0                            | 0                             |
| faults observed failing, file restored  | —               | 18 of 18                     | 1 of 1                       | 4 of 4                        |
| strict OpenSpec                         | 114 · 114 · 0   | 114 · 114 · 0                | 114 · 114 · 0                | 114 · 114 · 0                 |

(`51·687` is 51 files, 687 tests.) Every proof filter was run on the final tree first and matched
exactly one test — twenty-three faults over eleven distinct titles — and the twenty-three were then run
through section 8's own loop, each `status=1` with its table's `Tests` line, each restore
`cmp`-identical, each green rerun `status=0`. The ten model faults were run three times (r2 twice, r3 once), with identical
run numbers and shrunk sequences.

**What was tried and found unprovable** (section 3.8): the writer's `isActiveReader` inside the
runtime made `() => true` against `does not spend an old API success against its busy replacement`
— `1 passed \| 87 skipped (88)`; the undo stack's `project.isCurrent` made always-true against four
suites — `Tests 262 passed (262)`; the table's `key` removed against `starts a created project
without the previous project’s row anchors` — `1 passed \| 74 skipped (75)`; a header that keeps the
last runtime's presence while none is live against slice 3's new example — `1 passed`. None is
claimed.

On the final commit: `wbs-fe-01:lint` exit 0; `nx format:check --all` exit 0; `wbs-fe-01:typecheck`
exit 0; slice 2's builder `git grep` empty. Round 1's planner-only runs, on `fcb49202`: `wbs-fe-01:build` exit 0 (`✓ built in 891ms`); `tool-devsync:test` 366 pass, 0 fail; `wbs-fe-01:test:unit` 55 files, 717 tests and `wbs-fe-01:test` UTC 142 files, 3064 tests, zoned 2 · 3 — against the base's 53·710 and 140·3054, each exit 0 (section 9.4). Round 2 reran, on `49fae67f`: typecheck and lint exit 0, the adopted set 20·1218. Round 3 reran, on `62bcab33`: typecheck and lint exit 0, the sandbox node suite 53·695, the runtime pair 2·8. The whole targets, build and devsync were not rerun for rounds 2 and 3, which change slice 1's runtime files and add one example to an existing node-tier suite; each whole target is expected one test above round 1's.

### 9.4 Planner-only, with the expected relative delta

The sandbox cannot run these: three tests in two files spawn `bun` from Node, there is no browser, a
build writes outside the attempt's lane, and devsync writes Git objects.

| Check                                                                                                                                                                                            | Expected, relative to the base                                                                                                  | Planner's own rehearsal                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit`                                                                                                    | slice 1 **+ 2 files, + 8 tests**; slices 2 and 3 unchanged                                                                      | base 53 files, 710 tests; round 1 final 55 files, 717 tests; exit 0 both (round 3 expects 718; not rerun)                                            |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test`                                                                                                         | UTC: slice 1 **+ 2 files, + 8 tests**, slice 2 **+ 2 tests**, slice 3 **+ 1 test**. Auckland zoned unchanged                    | base UTC 140 files, 3054 tests, zoned 2 · 3; round 1 final UTC 142 files, 3064 tests, zoned 2 · 3; exit 0 both (round 3 expects 3065 UTC; not rerun) |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                                                                                                                    | exit 0 after each slice                                                                                                         | exit 0 on round 1's final commit, `✓ built in 891ms` (not rerun for round 2)                                                                         |
| `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, with the slice committed or staged                                                                   | unchanged; no project target, no module index block, no pre-namespacing path in any owned document                              | 366 pass, 0 fail, exit 0 on round 1's final commit, the slices committed; the packet commit's own devsync, round 2, in §15's commit                  |
| `CI=1 E2E_PORT_SHIFT=<a multiple of 300 clear of every live run, checked with ss -ltn> NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run wbs-fe-01:e2e -- <spec>` | exit 0, unchanged, after slices 2 and 3 — every spec that opens a project, since the table now appears once its runtime is live | **Pending planner verification.** Not run in this rehearsal.                                                                                         |
| the same target **unfiltered**, on its own shift, on the final integration commit                                                                                                                | exit 0. The batch README's "Integration verification" requires the whole frontend browser suite once a frontend change lands    | **Pending planner verification.** Not run, not waived.                                                                                               |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                       | exit 0 on the shared build host                                                                                                 | **Not run**; reported as pending, never as passed.                                                                                                   |

`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` is not decoration: `CLAUDECODE=1` changes Bun's test
output and fails thirteen unrelated tests in this repository.

### 9.5 What none of this proves

- No browser ran. The Chromium checks are the planner's and are pending, not waived.
- The table suites draw through a fixture that installs the runtime synchronously and does not gate
  on retirement; only `project-page.test.tsx`, `app-router.test.tsx` and the model test exercise the
  real owner.
- What the owner's model covers of lesson 16: a request re-entered from inside the owner's own
  notification (`reenter`) and a partial acquisition (`openBroken`), each with a sabotage red at a
  recorded run (`m9`, `m10`). What stays the slot model's alone: a disposal that rejects or outruns
  its budget (the owner's model closes through the real close behind one scheduled step and never
  fails), and a request issued from inside the installer. The owner's handling of a failed
  retirement is proved by the example `o2` only. No `isCurrent` fault was found that only
  re-entry exposes (§8.1, `m9`), and the snapshot-reading `settle` the review flagged survived the
  model (§3.3).
- The route-unmount and Strict Mode retirement failure is invisible: named residual (§3.8, §12).
- Four guards are carried, not proved (section 3.8): the writer's `isActiveReader` in the runtime,
  the undo stack's `isCurrent`, the table's `key`, and the header's "nobody" while no runtime is
  live.
- The `fill=1` run proves the patches and scripts survive comments **at** packet h's three named
  sites; the planner's rerun of section 9.1 on the real base is what proves the rest.

## 10. Stop conditions

Each is false on the real starting tree, checked on 2026-09-24.

1. Step 0a's status is not empty, or `base` differs from the slice note's SHA. Stop: the clone is not
   the tree this packet was reviewed against.
2. Step 0b extracts other than 9 patches, scripts of other than 42 and 87 lines, or other than 23
   fault patches. Stop: this document is not the one reviewed.
3. A patch fails `git apply --check`, the suites script prints any last line but `suites=17
sites=256` or exits non-zero, or the regions script prints anything but its two lines or exits
   non-zero. Stop and report the exact error; never hand-edit a file into shape.
4. A baseline (step 0c or a slice's step 1) exits non-zero. Stop, except for the known cases in 11.
5. A red checkpoint shows **no** failure, or different diagnostics than section 6 names. Either means
   the tests did not land as written.
6. An adopted-set green run differs from its step-1 number by anything but the slice's own additions
   (+2 in slice 2, +1 in slice 3). Stop.
7. A proof filter matches zero tests, or more than one. Stop.
8. A fault leaves its named test passing. Restore, re-read the table, redo once; if it still passes,
   stop — the check may not be where this packet says it is.
9. The strict OpenSpec block exits non-zero, or `passed` falls below step 0's number.
10. Slice 2's builder `git grep` prints anything. Stop: delivery still builds a project service.
11. **Known, not this packet's:** in `claims.db.test.ts`, `bounds terminal lock contention and
retries until a held write commits` failing; a single `Test timed out in 5000ms` in one of the
    twenty adopted files during a serial run on a loaded host; or a `DiBagCloseCancelledError`
    (`DI_BAG_CLOSE_TIMEOUT`) from the `live-application` fixture's own `afterEach` retirement. Record
    it, rerun **that file alone once**, and stop only if it fails again.
12. At hand-over, the status shows any path outside the slice's own list. Stop.
13. Anything asks for a `git` state change in the clone, a network call, a browser, or `--no-verify`.

## 11. Out of lane

- `runtime/lifetime-slot.ts`, `runtime/application-runtime.ts`, `runtime/application-*`: read only;
  `acquireTransactionally` is imported, not changed.
- Packet g's stores and channel (`modules/channel.ts`, `plan-writer/busy-store.ts`,
  `plan-feed/delivered-plan-store.ts`), their model tests, `use-channel-listener.ts`,
  `use-snapshot-changes.ts`; `presence-store.ts` only for its one JSDoc sentence.
- The plan feed, calendar markers, plan writer and plan commands modules' `.ts` files, and
  `modules/project/composition.ts` (packet h's executor writes into it), and
  `src/testing/project-services-of.ts`.
- `lib/*`, `app-router.tsx`, `components/chrome/*`, `saved-plans-panel.tsx`, every suite but the
  seventeen of slice 2 and `project-page.test.tsx`.
- `project.json`, the Vitest configs but `vitest.node-suites.ts`, `bun.lock`, `package.json`: no
  dependency is added, removed or bumped.

## 12. Hand-over to the next packet

- **Task 10's last outcome — saved plans.** The shelf (`saved-plans-panel.tsx`, `lib/saved-plan-*`)
  keeps its own `subscribeToProject` watch keyed by the selected project. A feature facade over its
  list, save, compare and watch, registered in `installProjectRuntime` beside the feed, with its
  watch given back by the runtime's close, is what ticks task 10. `ProjectRuntime` is the seam.
- **The fatal nobody sees (task 7 and task 11).** A project retirement that fails during route
  unmount or Strict Mode's cleanup resolves `leave()` as a modelled refusal, and no page is left to
  draw it and nothing logs it (§3.8). Route the project owner's terminal fault to the application's
  lifecycle report — a seam out of `application-bootstrap.tsx`'s `showFatal` — or have the session's
  retirement join the project's and report it, as the Log out requirement already wants for
  project-then-session retirement.
- **Task 11** inherits: the owner (`createProjectOwner`) and the page's effect, which already route
  switch, unmount and Strict Mode re-entry through one withdrawal; its tests should drive the page
  through the router for route unmount, wrap the page in `<StrictMode>`, and open the window between
  a commit and its passive effect so the undo stack's `isCurrent` and the table's `key` become
  provable (section 3.8). `plan-writer.feature.ts`'s note about a same-reader renewal wants
  rewording then, citing that `createPlanReading` opens its refresh owner exactly once per feed.
- **Task 7 (Log out)** can retire the project through the same owner before the session: the page's
  effect cleanup is the project half.
- **Task 13** can state "no delivery builds a project service" by symbol — `ProjectServices`'s
  members resolved from nowhere under `components/` — rather than slice 2's regex.

## 13. Assumptions recorded rather than asked

1. **Presence resets on a switch** (section 3.6). The brief left the decision to this packet.
2. **Task 10 stays unticked** because it names saved plans; the note records what moved. Ticking it
   with saved plans owed would be the dishonest reading.
3. **One slot per page mount**, built by `useState(createProjectOwner)`: the owner holds nothing
   until `open`, so Strict Mode's discarded initializer leaks nothing, and a page is the project's
   owner in the lifetime map.
4. **The runtime is not a sealed DI Bag module** with a label: it has no private binding worth
   sealing (every service but the feed's internals is published) and no host requirement a module
   label would name. Its graph is built by one installer, as the application's host graph is.
5. **The suites draw through a fixture** rather than through the page's owner: the owner is
   asynchronous by design and 256 sites assert synchronously after `render`; the fixture's
   difference — no gate, no fatal state — is stated in its JSDoc and in section 9.5.
6. **A new stream source is a new reader**, as a new client is; the one test that asserted the
   opposite is edited and retitled (section 3.7). Production never renews a stream under one
   project.
7. **Serial runs for the multi-file suites**, as the project's own `test` target runs them.

## 14. The brief, point by point

### 14.1 The non-negotiables of the commissioning brief

| Requirement                                                                                                                                                             | Where this packet meets it                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| a project runtime as a lifecycle with an owner, retirement and replacement on switch                                                                                    | §3.1–3.3: `createProjectOwner` over one slot; §3.4 the page's effect                                    |
| a written state machine (states, events, invariants)                                                                                                                    | §3.1                                                                                                    |
| `fc.asyncModelRun` model test; sabotages (stale reader after switch, late answer after retirement, double retirement, subscription leak) each failing at a recorded run | §8.1 `m1` (run 2), `m2` (2), `m4` (2), `m5` (2), plus `m3`, `m6`–`m10`; rehearsed twice, identical      |
| "Unknown is not OK"; production-path negatives with `Proof:` comments dated by the executor                                                                             | §8: twenty-three faults, each observed; §3.8 and §9.3 name what was tried and could not be proved       |
| no `any`, unchecked cast or `!` outside tests; names carry the domain; no product names in identifiers                                                                  | none in the production diffs; `createProjectOwner`, `installProjectRuntime`, `isCurrent`, `NOBODY_HERE` |
| module-identifier grammar                                                                                                                                               | N/A: no module identifier is added (§13.4)                                                              |
| presence decided, in the packet and the delta spec                                                                                                                      | §3.6; slice 3's scenario and the amended g scenario                                                     |
| task 10 honest                                                                                                                                                          | not ticked; dated note naming saved plans (§7.11)                                                       |
| rehearsal commits, one per slice, hooks on; reds observed on the previous slice plus the test side; faults run, restored, `cmp`                                         | §9.3                                                                                                    |
| exact planner commit subjects and shell-ready `owned.txt` blocks                                                                                                        | §6 each slice's step 9 and subject line                                                                 |
| relative counts; planner-only checks marked                                                                                                                             | §6 every expectation is step 0 ± the slice's own; §9.4                                                  |
| §9.1-style extraction proving each tree                                                                                                                                 | §9.1, `fill=0` identical to the final rehearsal commit; `fill=1` over h's sites                         |
| `legacy-root` exemption if a pre-namespacing path is cited                                                                                                              | none cited: every path is `apps/wbs/fe-01/…` or relative to it; devsync on the packet commit (§15)      |
| no absolute path outside Dispatch; `--driver claude` and `--require-ancestor <H3>` on every dispatch line                                                               | §6 Dispatch                                                                                             |

### 14.2 The batch-6 addendum's twenty points

| Point                       | Assessment                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reproduced red           | Met for all three slices: compiler and runtime reds (slices 1, 2) and a runtime red (slice 3), each rebuilt from the previous slice plus its test side, diagnostics pasted (§6).                                                                                                                                                      |
| 2. Typecheck and lint       | Met: both native per slice, exit 0 on each rehearsed commit, every slice committed with lefthook on (§9.3).                                                                                                                                                                                                                           |
| 3. Path counts              | Met: each hand-over lists the slice's exact paths (8, 26, 10); the planner's own commit adds only this document.                                                                                                                                                                                                                      |
| 4. Failure-visible commands | Met: every check records its own status and `expect-status.sh` asserts it; both scripts refuse on any unrecognised input.                                                                                                                                                                                                             |
| 5. HEAD-reading tests       | N/A: no project, target or CI path is renamed.                                                                                                                                                                                                                                                                                        |
| 6. Sandbox constraints      | Met: whole targets, build, devsync and Chromium are the planner's, with expected deltas (§9.4).                                                                                                                                                                                                                                       |
| 7. Known race               | Met: named, one rerun, no repair authority (§10.11).                                                                                                                                                                                                                                                                                  |
| 8. Names                    | Met: no product name in an identifier; no module id added.                                                                                                                                                                                                                                                                            |
| 9. Packet form and evidence | Met: three slices, each ending in a planner commit with its exact subject; relative baselines; production-path negatives with observed messages; the unprovable named, not skipped.                                                                                                                                                   |
| 10. Pins                    | Met: no pin touched.                                                                                                                                                                                                                                                                                                                  |
| 11. Pipeline exit handling  | Met: the fault `diff` form after one command; the filter count, the placeholder check and the builder check read single commands or captured output.                                                                                                                                                                                  |
| 12. Planner chaining        | Met: the extraction stops at the first failed check (§9.1).                                                                                                                                                                                                                                                                           |
| 13. Module index            | N/A with reason: no file is added to a module directory (`runtime/` and `testing/` are not modules), and the one `fe-01` module that carries a `module-index` block, `preferences`, is untouched.                                                                                                                                     |
| 14. Bun directory filters   | N/A: every suite runs through Vitest from `apps/wbs/fe-01`.                                                                                                                                                                                                                                                                           |
| 15. Interleaving property   | Met: the owner and its runtimes under `fc.scheduler`-ordered answers, frames, gestures and disposals (§3.1, §7.2).                                                                                                                                                                                                                    |
| 16. Model-based remedy      | Met, with its limit stated: `fc.asyncModelRun` against a reference model with re-entrant requests from inside the owner's notification and partial acquisitions among its commands, ten sabotages red at recorded runs (§8.1); a disposal that rejects or times out, and installer re-entry, are the slot model's alone (§3.1, §9.5). |
| 17. Seeded evidence         | N/A: no slice reads an earlier attempt's evidence.                                                                                                                                                                                                                                                                                    |
| 18. Symbol-based checks     | N/A: no code-shape checker is introduced; slice 2's `git grep` is a verification command, and task 13 owns the symbol-based rule (§12).                                                                                                                                                                                               |
| 19. Missing-file grep       | Met: every grep over a file follows a `test -f` or reads captured output.                                                                                                                                                                                                                                                             |
| 20. Honest limits           | Met: §3.8 and §9.5 — task 10 not ticked, four carried guards, the fixture's difference, what the owner's model does and does not generate, the invisible unmount-time fatal, the fill limits.                                                                                                                                         |

## 15. Ready to commit

| Slice | Paths                                                                                                                                                                                                                                                                                                                                                                               | Subject                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1     | `spec.md`, `verify.md`, `apps/wbs/fe-01/vitest.node-suites.ts`, `apps/wbs/fe-01/src/{modules/project/contract.ts,components/wbs/use-plan-read.ts}` — **5 modified**; `apps/wbs/fe-01/src/runtime/{project-runtime.ts,project-runtime.model.test.ts,project-runtime.test.ts}` — **3 new**                                                                                            | `feat(frontend): own the selected project's plan services in one project runtime`           |
| 2     | `spec.md`, `verify.md`, `apps/wbs/fe-01/src/modules/project/contract.ts`, `apps/wbs/fe-01/src/components/wbs/{use-plan-read.ts,wbs-table.tsx,project-page.tsx,project-page.test.tsx}`, `apps/wbs/fe-01/src/runtime/project-runtime.ts` (the `w1` comment), the seventeen suites of §6 step 0b — **25 modified**; `apps/wbs/fe-01/src/testing/wbs-table-over-client.tsx` — **1 new** | `refactor(frontend): draw the table from the selected project's runtime, owned by the page` |
| 3     | `spec.md`, `verify.md`, `tasks.md`, `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, `apps/wbs/fe-01/src/components/wbs/{project-page.tsx,project-page.test.tsx}`, `apps/wbs/fe-01/src/modules/{plan-feed,calendar-markers,project}/README.md`, `apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts` — **10 modified**                               | `refactor(frontend): hand the header the selected project's presence, reset on a switch`    |

(`spec.md`, `verify.md` and `tasks.md` are under `openspec/changes/adopt-frontend-lifetimes/`.) After the
last commit the host gate runs on the shared build host with the committed hash, and its printed
running-hash line and exit status are recorded. Anywhere else it is reported as not run, with the
reason — never as passed. The Chromium runs of §9.4 are reported the same way until they have happened.

## 16. Round 1, disposed

| Finding                                                             | Disposal                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 — slice 2's owned list omits `project-runtime.ts`        | Fixed: slice 2 owns 26 paths; step 9's list holds it (`-eq 26`); step 10 expects twenty-five ` M` and one `??`; §4.2 and §15 follow.                                                                                                                                                                                                                                          |
| Important 1 — the owner's model has no re-entry, partial or timeout | The stronger option: `reenter(p)` (an `open` from inside the owner's own notification) and `openBroken(p)` (a `PartialAcquisitionError` after the feed opened) join the model, with `m9` and `m10` red at recorded runs; §3.1, §9.5 and §14.2 row 16 say what stays the slot model's (a failing or expiring disposal, installer re-entry).                                    |
| Important 2 — `settle` classifies by a later snapshot               | Fixed: the owner records, by identity, every refusal its own runtimes raise (construction, partial release, retirement) and `settle` classifies by the refusal; "impossible" is gone from `open`'s JSDoc. New negatives `o2` (moved to the retirement record) and `o3`/`m10` (the construction record). The old form survived the extended model and that is recorded (§3.3). |
| Important 3 — a failed retirement on unmount is invisible           | Named residual, no code change (§3.8, §12): the bootstrap's report is local to `bootstrapApplication`, and a seam out of it is task 7/11's.                                                                                                                                                                                                                                   |
| Important 4 — dispatch waits for h's merge                          | Unchanged: Dispatch already says the base is main after h's lane merged, and §9.1 is rerun on that merge.                                                                                                                                                                                                                                                                     |
| Minor 1 — `q2`'s anchor                                             | Fixed: the line directly above `void projectOwner.leave();`.                                                                                                                                                                                                                                                                                                                  |
| Minor 2 — why the renewal case is gone                              | Recorded in §3.8: `createPlanReading` opens its refresh owner once per feed; §12 carries it to task 11.                                                                                                                                                                                                                                                                       |
| Minor 3 — the undo stack's simplified guard                         | Named in §3.8.                                                                                                                                                                                                                                                                                                                                                                |
| Minor 4 — §14.2 row 13                                              | Fixed: `preferences/README.md` carries a `module-index` block and is untouched.                                                                                                                                                                                                                                                                                               |
| Minor 5 — the awaited unsubscribes                                  | No change, as the review says.                                                                                                                                                                                                                                                                                                                                                |

## 17. Round 2, disposed

| Finding                                                        | Disposal                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Important 1 — the partial acquisition's rewrap has no negative | Fixed: a seventh example, `is terminal, and still settles, when a half-built runtime cannot be released` (the feed's close throws and the commands cannot be built), and fault `o4` — the rewrap replaced by `? failure` — observed red, with its own comment site above the rewrap, filled by §9.1 (twelve sites). Counts rippled: runtime pair 2·8, sandbox +8 tests, the examples' `(7)`, 72 record lines, 23 fault patches. |
| Minor 1 — §14.2 row 3                                          | Fixed: `(8, 26, 10)`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Minor 2 — §14.1's duplicated phrase                            | Fixed.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Minor 3 — `m9` is `m1`'s twin                                  | No change, as the review allows; §8.1 already says so.                                                                                                                                                                                                                                                                                                                                                                          |
