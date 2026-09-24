# 050.7 m — every project ownership replaced, and a stale completion changes nothing

|             |                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **seventeenth packet**, the last of 050.7's task packets                                                                                                                                                                                                        |
| Size class  | S — two slices, each one executor attempt                                                                                                                                                                                                                                                                                                                  |
| Predecessor | 050.7k (`050-7-k-log-out.md`) and 050.7i, 050.7j, 050.7h — each one's section 12, "Hand-over to the next packet", and section 3.8, which hand task 11 the residuals section 3.1 lists; 050.7l (tasks 12 and 13) is authored in parallel on the same base and lands first                                                                                   |
| Advances    | OpenSpec task **11** of `adopt-frontend-lifetimes` — **ticked** in slice 2, every sentence met (section 3.5). Every residual the earlier packets handed task 11 is proved, deleted as unreachable, or named with an owner (section 3.1)                                                                                                                    |
| Revision    | First.                                                                                                                                                                                                                                                                                                                                                     |
| Schema      | OpenSpec change `adopt-frontend-lifetimes`, already `sdd-lean`. One requirement with six scenarios, added in slice 2 before packet j's "One project runtime owns the selected project's plan services"; task 11 ticked with a dated note; one dated update to the lifetime map, after its exact lifecycle tests. Slice 1 changes no behaviour and no spec. |

## 1. Goal, non-goals, and the cut

**Goal: teeth.** Task 11 says "Project switch, route unmount and Strict Mode re-entry each replace all
project ownership; a stale completion changes nothing." The ownership is already built — packet j's
project owner, packet i's session owner, packet k's region — and most of its guards are already proved
by the owners' model tests. What four packets left for this one is a list of guards that were
**carried without a production-path negative**, a Strict Mode re-entry nobody exercised, a route
unmount nobody drove through the router, and three records to reword. This packet gives every one of
them a negative that fails when the guard is removed, with a `Proof:` comment — or, where the guard
turns out to be unreachable in production, **deletes it and says why** (R5: no decorative check).

**What a reader sees change: nothing.** No behaviour changes. Two checks and one React key go because
nothing can reach them; one test seam (`SignedInApp`'s `projectApi`, the bargain `openOwner` already
makes) is added so the route can be driven over a project the test holds.

**Non-goals.**

- **Page hide's own session retirement** — packet k's and i's named residual, handed to task 11 in the
  commissioning list. It is **not** closed here, and that is a decision, not an omission (section 3.4):
  task 11's sentence names switch, route unmount and Strict Mode, and joining the session's retirement
  into the application's is a change to the application lifetime (task 5's, closed by amendment) with
  its own concurrency, which the batch addendum's point 16 says needs its own model. Named in
  section 12 with the shape it needs.
- **Saved plans** (task 10's last outcome): the shelf keeps its own keyed watch. Lifetime-map test 8's
  "saved-plan watch closes once" stays task 10's.
- **A model-based test.** No concurrency logic is added or changed: slice 1 removes a predicate that
  answered nothing its sibling did not, slice 2 removes a key and a guard nothing reaches and adds a
  test seam. The owners' models (`project-runtime.model.test.ts`, `session-runtime.model.test.ts`,
  `session-exit.model.test.ts`, `lifetime-slot.model.test.ts`) are not extended: no residual on the
  list is an interleaving they do not already generate (section 3.4).
- No dependency, `project.json`, `bun.lock`, tsconfig, module README or pin change;
  `lifetime-slot.ts`, `session-runtime.ts` and `application-*` are not touched.

**The cut, and why two slices.**

1. **The modules** — plain TypeScript, node-tier tests, no React: the plan writer's and the calendar
   markers' `isActiveReader` predicate is removed, because the refresh owner's identity — `null` from
   the instant the project runtime is withdrawn — answers everything it did; the writer's stale
   "same-reader renewal" notes go with it; `createProjectOwner`'s JSDoc says whose owner it is now.
   Three negatives prove the identity checks that remain.
2. **Delivery and the records** — five page cases in a new `project-replacement.test.tsx` (a switch
   mid-undo, the interval while the old project lets go, Strict Mode at the project page), three
   region cases in `app.test.tsx` through the real router (a route change, a route change that cannot
   give the project back, Strict Mode at the session), the table's key and the undo stack's busy
   guard deleted, the `projectApi` seam, the spec's requirement, task 11 ticked, the lifetime map's
   dated update. Eight negatives.

## 2. Read first

| File                                                                                   | Why                                                                                                             |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                           | Rules R1–R5 and the routing index.                                                                              |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                  | "Execution contract", "Standard blocks every packet uses" — the strict OpenSpec block and the fault form.       |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`             | "Project owner", "Exact lifecycle tests for the implementation packet" 8 to 11.                                 |
| `docs/superpowers/plans/2026-09-21-batch-6/050-7-{h,i,j,k}-*.md`, sections 3.8 and 12  | The residuals section 3.1 disposes of, in the words each packet handed them on.                                 |
| `apps/wbs/fe-01/src/runtime/project-runtime.ts`                                        | `installProjectRuntime`'s four guards; `readRefreshOwner` is `isCurrent() ? feed.owner : null`.                 |
| `apps/wbs/fe-01/src/modules/{plan-writer,calendar-markers}/*.ts`                       | The two hosts' `isActiveReader`, and the identity comparisons that stay.                                        |
| `apps/wbs/fe-01/src/components/wbs/{project-page.tsx,use-plan-read.ts}`, `src/app.tsx` | The page's effect and its `live` gate, the undo stack (`stepStack`), `SignedInApp` and `ProjectRetirementGate`. |

## 3. Design

### 3.1 The residual ledger

Every residual the earlier packets handed task 11, in their own words, and what this packet does with
it. "Proved" means a fault that removes the check fails a named test on a production path, observed in
this packet's rehearsal (section 8); "deleted" means the check was shown to decide nothing and is
removed, with the reason in section 3.2 and the observation in section 9.3.

| #   | Residual, as handed on                                                                                   | From           | Disposition                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | the feed's `isActiveReader` services comparison (`use-plan-read.ts`, operand changed without a negative) | h §3.8         | **Already proved**: packet j moved it into the runtime (`isActiveReader: isCurrent` in the feed's factory), fault `m2` of `project-runtime.model.test.ts`. Nothing to add.                                                             |
| 2   | `refreshResourcesOrMarkStale`'s comparison                                                               | h §3.8         | **Already proved**: now the runtime's `reread` guard, packet j's `m3`.                                                                                                                                                                 |
| 3   | the marker gestures' `isActiveReader` comparison                                                         | h §3.8         | **Deleted** (slice 1): the runtime's `readRefreshOwner` already answers `null` once withdrawn, so `readRefreshOwner() === owner` implies it. The identity check that stays is proved again (`c1`).                                     |
| 4   | the undo stack's `isCurrent` (`stepStack`)                                                               | h §3.8, j §3.8 | **Proved** (slice 2, `s1`, `s2`): the page's toasts outlive the table, so an undo answered after a switch would say its sentence over the next project. Its third use, `if (isCurrent()) busyWrites.lower()`, is **deleted**: see 3.2. |
| 5   | the writer's `isActiveReader: isCurrent` inside the runtime, "carried, not proved"                       | j §3.8         | **Deleted** (slice 1), for row 3's reason. The writer's two identity checks, both changed lines, are proved (`w1`, `w2`).                                                                                                              |
| 6   | the table's `key`, whose old `Proof:` became false                                                       | j §3.8         | **Deleted** (slice 2): the page draws no table between two runtimes, so every runtime already mounts a table of its own. What makes that true — the `live` gate — is proved (`t1`).                                                    |
| 7   | the header showing "nobody" during the switch gap — the reset proved, not the gap                        | j §3.8         | **Proved** (slice 2, `h1`), with the old project's retirement held open and its stream still talking.                                                                                                                                  |
| 8   | Strict Mode re-entry never exercised by a test                                                           | j §3.8, i §12  | **Exercised** at both owners under a real `<StrictMode>`: the project page (an oracle, `m1`) and the signed-in region (`n1`). Finding recorded in 3.2: the page's own re-entry opens nothing.                                          |
| 9   | route unmount, not driven through the router                                                             | j §12, k §3.5  | **Proved** through the real router (slice 2, `r1`): the directory link gives the project back once and keeps the session; a close that refuses there draws the region's fatal state (`g1`).                                            |
| 10  | the direct `session.projects.leave()` region example                                                     | k §12          | **Kept**, beside its route-driven twin: its `p1` proof names it, and a leave from any caller is still the gate's to draw. The twin carries `g1` at the same site.                                                                      |
| 11  | `plan-writer.feature.ts`'s stale "same-reader renewal" note                                              | i, j §3.8      | **Reworded** (slice 1): removed with the predicate it justified; the comment that replaces it says one owner per feed, never renewed.                                                                                                  |
| 12  | `createProjectOwner`'s JSDoc ("one page's", "safe in a lazy state initializer")                          | i §3.8         | **Reworded** (slice 1): the owner is one per session, handed to the page, retired before the session.                                                                                                                                  |
| 13  | page hide's own session retirement, and the unmount-time one, observed by nobody                         | i, k §12       | **Left, with an owner** (section 12): an application-lifetime change, not task 11's sentence. The other unmount-time retirements are observed: section 3.4.                                                                            |
| 14  | `ProjectPage`'s own terminal branch, shadowed under `SignedInApp`                                        | k §12          | **Left as it is**: it is not a guard but the page's own drawing when it is used without the region, which its suites do; packet j's `&& false` proof there still fails through them.                                                   |

### 3.2 The three deletions, and why nothing reaches them

**The reader predicate beside the refresh owner (rows 3 and 5).** Both hosts ask two questions about
a gesture's answer: is the refresh owner still the one the gesture began under, and is the reader
still on screen. The second existed because a covering read could once renew the owner under the same
reader. Packet j made one feed one owner: `createPlanReading` opens its refresh owner once per feed
(`modules/plan-feed/plan-feed.resource.ts`) and the runtime hands the hosts
`readRefreshOwner = () => (isCurrent() ? feed.owner : null)`. So, for any owner a gesture captured
non-null, `readRefreshOwner() === owner` is true only while `isCurrent()` is — the predicate beside it
can never be the one that answers no. Rehearsed on the unchanged tree: both wirings replaced by
`() => true` together, the twenty adopted suites, the project runtime's example and model suites and
`app.test.tsx` — **23 files, 1244 tests, all green**. The predicate goes from `PlanWriterHost` and
`CalendarMarkersHost`; the writer's busy lowering, which read it too, lowers unconditionally — row 4's
reason.

**The undo stack's and the writer's busy guard (row 4, and the writer's `finally`).** A gesture's busy
state is its own runtime's (`busy` is one store per `installProjectRuntime`). Once the runtime is
withdrawn the page draws no table from it, so whether a departed gesture lowers that busy is invisible;
it can never lower the next project's, which is another store. Rehearsed: with the guard gone, the
adopted set, the page cases and the model stay green. The two _other_ uses of the undo stack's
`isCurrent` are not in this class: they guard `pushToast`, and the toasts are the **page's**
(`toastApi={toastApi}` in `project-page.tsx`), handed to every table and outliving each one. With
either removed, an undo asked in `p1` and answered after the switch puts its sentence over `p2` —
`expected [ 'Undid: rename “Strip”' ] to deeply equal []`. They stay, and are proved.

**The table's key (row 6).** The page draws the table only while the owner publishes `live`. A switch
withdraws the old runtime **in the page's own effect**, synchronously; the slot publishes `retiring`;
the next runtime can be published only after an `await` on the old one's retirement. React renders the
store's change before that `await` can resume, so the page always renders a state with no table between
two runtimes, and each runtime mounts a new table. Rehearsed: with the key removed, "draws the next
project in a table of its own" still finds a new `<table>` element, and the adopted set is green. The
comment packet j wrote beside the key — "the key is what keeps that true when the next runtime is drawn
with no render in between" — describes a render that cannot happen; the key goes and the comment says
why none is needed. What _would_ break it is the page drawing a runtime it no longer publishes, which
fault `t1` does and two cases catch.

**Strict Mode at the project page (row 8), a finding rather than a deletion.** `ProjectPage` mounts with
`selected === null` (`useState<string | null>(null)`), and its effect returns before opening anything
when nothing is selected, so Strict Mode's mount-time setup-cleanup-setup opens nothing and leaves
nothing. The lifetime map's own mutation — "create the runtime in `useMemo`" — was rehearsed as opening
the project from a memo in render: under Strict Mode it still built **one** runtime per pick, because
the second request supersedes the first before it is built. The page's Strict Mode case is therefore an
**oracle**, and its negative is the page's cleanup (`m1`); the Strict Mode re-entry that replaces
ownership is the signed-in region's, where the first session request is left before it is built — the
case records `session left` before the one `session built` — and a region that opened only once (`n1`)
never draws the page.

### 3.3 The cases

All of them drive production code: the real project owner over the real installer (with, where a case
needs it, a close that waits or refuses), the real page, the real router and the real session owner.

| Case                                                                                                  | File                           | What it shows                                                                                                           | Negative          |
| ----------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------- |
| says nothing in the next project when an undo asked of the last one succeeds                          | `project-replacement.test.tsx` | no toast over `p2` for `p1`'s answer; `p2`'s Undo still enabled                                                         | `s1`              |
| says nothing in the next project when an undo asked of the last one is refused                        | `project-replacement.test.tsx` | the same for a refusal                                                                                                  | `s2`              |
| draws no table and hands the header nobody while the last project lets go                             | `project-replacement.test.tsx` | with `p1`'s retirement held and its stream still talking: no table, nobody, disconnected; then `p2`; socket closed once | `h1`, `t1` (also) |
| draws the next project in a table of its own                                                          | `project-replacement.test.tsx` | a new `<table>` element, the old one detached                                                                           | `t1`              |
| opens one runtime per pick under Strict Mode, and gives each back once                                | `project-replacement.test.tsx` | built `[p1, p2]`, given back `[p1]`, then `[p1, p2]` when the page goes; sockets 2 opened, 2 closed                     | `m1`              |
| gives the project back once when its route goes, keeps the session, and opens a new runtime on return | `app.test.tsx`                 | through the Directory and Plan links: one give-back, the same session object, a new project runtime                     | `r1`              |
| draws the fatal state in the region’s place when a route change cannot give the project back          | `app.test.tsx`                 | sanitized fatal page, no directory, no nav, session still `live`, nothing given back                                    | `g1`              |
| leaves the session Strict Mode first opened, and opens the project in the one it opens again          | `app.test.tsx`                 | `session left`, one `session built`, the project built in it                                                            | `n1`              |

Five of the eight pass on the unchanged tree — they are oracles of guards that were already there,
and their teeth are the faults. The three region cases need the `projectApi` seam and are the slice's
red (section 6).

### 3.4 Decisions

- **Page hide is not closed here** (row 13). On `pagehide` the bootstrap takes the React root down, so
  `SignedInApp`'s cleanup starts `leave()`, and the application slot's `retire()` starts beside it
  rather than after it. Joining them — the application's disposal awaiting the session's, failing when
  it fails — means an application runtime member a signed-in region can reach, a change to
  `application-bootstrap.tsx`'s retirement, and a new interleaving (the session's retirement against
  the application's and a persisted `pageshow`), which addendum point 16 says gets its own model. None
  of that is project ownership, and task 5 closed page hide by amendment. The other unmount-time
  retirements **are** observed: Strict Mode's cleanup leaves a session whose failure makes the owner
  terminally `fatal`, and the re-mount's `open` is then refused, so the region draws it; log out is
  packet k's exit; the application's own fatal page and the fault boundary each replace the region with
  a failure already on screen.
- **Delete, not re-key** (row 6). Keying the table by the runtime object would also be correct, and
  equally unprovable: no production path renders two runtimes back to back. R5 prefers no check to a
  check nothing can fail.
- **The seam is `SignedInApp`'s `projectApi`**, passed to `AppRouter`, whose `SignedInRegion` already
  carries it for the router's own suite: a route can only be driven over a project the test holds, and
  the production client needs a server. `app.tsx` is a composition root, which packet l's delivery
  check exempts; the region type's `projectApi` is already on its list of routes owed.
- **No new model** (non-goals). Every late completion the list names — a read, a frame, a reread, a
  marker — is already a command of `project-runtime.model.test.ts` against the runtime; what was
  missing was the page, where the toasts and the header live, and the router.

### 3.5 What this packet does and does not claim

- **Task 11 is met sentence by sentence.** "Project switch … replaces all project ownership": the
  runtime's feed, stream, writer, markers, commands, busy and presence go with it (packet j's model,
  P1–P7), and delivery holds nothing across the switch — the gap draws nothing (`t1`, `h1`) and the next
  project gets a new table. "Route unmount": through the router (`r1`), and visibly when it fails
  (`g1`). "Strict Mode re-entry": at the region (`n1`), and at the page, where it opens nothing (oracle,
  `m1`). "A stale completion changes nothing": an undo's success and refusal (`s1`, `s2`), a frame in the
  gap (`h1`), and the late read, frame, reread and marker of packet j's model. Ticked in slice 2.
- **Saved plans are not in it**: the shelf's watch is keyed by the selected project and closes by its
  own effect; lifetime-map test 8's saved-plan half stays task 10's.
- **Not proved, by construction**: a render of two runtimes back to back (section 3.2). The deletion
  rests on it, and the `t1` cases are what would fail if the page ever drew a runtime it no longer
  publishes.
- **No browser ran.** The Chromium project and directory flows are the planner's (section 9.4).

## 4. Verified facts

Every number is a fresh observation from this packet's own rehearsal on 2026-09-24 and 2026-09-25, on
the authoring base `59cfe22a4` — packet k's rehearsal tip, which is batch-6 integration `52876ae12`
(main with packets h, G, H, I and j's real lane) plus packet i's and packet k's rehearsed diffs — and on
two rehearsal commits over it. That base is **never dispatched**: the dispatch base is planning after
packet i's, packet k's and packet l's real lanes have landed, which differs from it by their executors'
`Proof:` comments, dated notes and `verify.md` entries, and by packet l's own spec requirement and task
notes (section 9.1 simulates what it can name and checks the rest against the real base).

### 4.1 The code as it stands

| Fact                                                                                                                                    | Where                                     |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `readRefreshOwner` is `() => (isCurrent() ? feed.owner : null)`; the writer and the markers are also handed `isActiveReader: isCurrent` | `runtime/project-runtime.ts`              |
| one refresh owner per feed: `const owner = openOwner();`, once                                                                          | `modules/plan-feed/plan-feed.resource.ts` |
| `busy` is one store per runtime, and `usePlanReadState` hands the table `project.busy`                                                  | `project-runtime.ts`, `use-plan-read.ts`  |
| the page hands the table its own toast API — `toastApi={toastApi}` — so toasts outlive each table                                       | `components/wbs/project-page.tsx`         |
| the table is drawn only while `projectState.status === 'live'`, keyed by `projectState.services.projectId`                              | `project-page.tsx`                        |
| `selected` starts `null`; the owner effect returns early while nothing is selected                                                      | `project-page.tsx`                        |
| `SignedInApp` opens in one effect and leaves in an unmount-only effect; `AppRouter` takes `projectApi?` and `SignedInApp` passes none   | `app.tsx`, `app-router.tsx`               |
| `ProjectRetirementGate` draws a **terminal** project fault in the region's place                                                        | `app.tsx`                                 |
| React 19.2.8, Vitest 5.0.0, `@tanstack/react-router` 1.170.24                                                                           | `node_modules/*/package.json`             |

### 4.2 The measured blast radius

`git diff --stat 59cfe22a4 7b753cf54`: **17 files changed, 732 insertions(+), 111 deletions(-)**
(slice 1: 9 files, 95+/94−; slice 2: 8 files, 637+/17−). With `verify.md`, which only the executor
writes, slice 1 owns 10 paths and slice 2 owns 9 (1 new).

| Tree             | Sandbox node suite | Module set (7 files, serial) | Session set (3 files, serial) | New page file | Adopted set (20 files) | Zoned |
| ---------------- | ------------------ | ---------------------------- | ----------------------------- | ------------- | ---------------------- | ----- |
| base `59cfe22a4` | 57·713             | 7·30                         | 3·70                          | —             | 20·1219                | 2·3   |
| after slice 1    | 57·714             | 7·31                         | —                             | —             | 20·1219                | —     |
| after slice 2    | 57·714             | —                            | 3·73                          | 1·5           | 20·1219                | 2·3   |

The **module set** is `src/modules/plan-writer`, `src/modules/calendar-markers`, `src/modules/project`,
`src/runtime/project-runtime.test.ts` and `src/runtime/project-runtime.model.test.ts`; the **session
set** is packet i's: `src/app.test.tsx`, `src/app-router.test.tsx`,
`src/components/directory/directory-page.test.tsx`; the **adopted set** is packet f2's twenty suites
that draw the table or the page. The adopted set takes about six minutes serially on a quiet host.

### 4.3 Planner observations on the base, not stop conditions

- Strict OpenSpec `{"items":114,"passed":114,"failed":0}` on the base and after slice 2's contract
  step: the requirement lives in a document that already counted as one item.
- The host ran at load average 12 to 14 during the rehearsal. One serial adopted-set run lost
  `plan-chart-seam.test.tsx` › `is pointed by a bar’s focus, and the pointer outranks it` to `Test timed
out in 5000ms`; the file alone passed three times after it, on the slice tree and on the base
  (section 10, stop condition 11).

## 5. File plan

Paths under `apps/wbs/fe-01/` unless they start with `openspec/` or `docs/`.

| File                                                                               | Slice | Create/modify | Responsibility                                                                                      |
| ---------------------------------------------------------------------------------- | ----- | ------------- | --------------------------------------------------------------------------------------------------- |
| `src/modules/calendar-markers/contract.ts`                                         | 1     | modify        | `CalendarMarkersHost` loses `isActiveReader`; `readRefreshOwner`'s JSDoc says `null` once withdrawn |
| `src/modules/calendar-markers/calendar-markers.feature.ts`                         | 1     | modify        | `isCurrent` is the identity alone                                                                   |
| `src/modules/calendar-markers/calendar-markers.feature.test.ts`                    | 1     | modify        | the host's `leave` answers no owner, as a withdrawal does; `isActiveReader` gone from two hosts     |
| `src/modules/plan-writer/contract.ts`                                              | 1     | modify        | `PlanWriterHost` loses `isActiveReader`; `busy` lowered however a gesture ended                     |
| `src/modules/plan-writer/plan-writer.feature.ts`                                   | 1     | modify        | identity alone; the renewal notes go; `busy.lower()` unconditional                                  |
| `src/modules/plan-writer/plan-writer.test.ts`                                      | 1     | modify        | `isActiveReader` gone from the hosts; the busy case replaced by two reader-left cases               |
| `src/modules/plan-writer/busy-store.ts`                                            | 1     | modify        | JSDoc only                                                                                          |
| `src/modules/project/composition.test.ts`                                          | 1     | modify        | `isActiveReader` gone from the markers' host                                                        |
| `src/runtime/project-runtime.ts`                                                   | 1     | modify        | two wirings gone; `installProjectRuntime`'s and `createProjectOwner`'s JSDoc                        |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` | 2     | modify        | one requirement, six scenarios                                                                      |
| `src/components/wbs/project-replacement.test.tsx`                                  | 2     | **create**    | five page cases                                                                                     |
| `src/app.test.tsx`                                                                 | 2     | modify        | one `StrictMode` import, three region cases in a new `describe`                                     |
| `src/app.tsx`                                                                      | 2     | modify        | `SignedInApp`'s `projectApi` seam, passed to `AppRouter`                                            |
| `src/components/wbs/project-page.tsx`                                              | 2     | modify        | the key and its comment gone; two comments                                                          |
| `src/components/wbs/use-plan-read.ts`                                              | 2     | modify        | the undo stack's busy guard gone; its comment                                                       |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                               | 2     | modify        | task 11 ticked, with a dated note                                                                   |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`         | 2     | modify        | one dated update before "Planning constraints and open implementation facts"                        |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                              | 1, 2  | modify        | one fresh entry per slice, appended                                                                 |

Nothing else. Not `lifetime-slot.ts`, `session-runtime.ts`, `application-*`, `app-router.tsx`,
`plan-feed/*`, any module README or `tsconfig.json`, `project.json`, `bun.lock` or `package.json`.

### Which hunks meet other packets' files, and why they apply after their executors

- **Packet l** (authored in parallel on this same base, landing before this packet) also touches
  `spec.md` (a requirement appended at the end of the file), `tasks.md` (task 3 ticked with a note, and
  notes after tasks 12 and 13), the lifetime map (a dated update after packet h's, in "Narrow context
  and K2 resolution") and `verify.md`. This packet's spec requirement is inserted **before** packet j's
  requirement, mid-file; its task hunk changes task 11 only, whose trailing context is task 12's first
  three lines, which packet l's rehearsal leaves as they are; its map update goes after the exact
  lifecycle tests, before "## Planning constraints". Packet l also adds a `tsconfig.json` and a README
  `module-index` block to `modules/plan-writer` and `modules/calendar-markers`; this packet edits only
  the `.ts` files beside them, and adds no module file. Packet l's `plan-writer` README speaks of "the
  three ownership moments … documented on the writer"; after slice 1 the writer documents two, which
  the planner may want packet l's wording to follow (out of this packet's lane).
- **Packet i and packet k** comment `app.tsx` — i at `g2` (`if (sessionState.status === 'fatal') …`),
  `g3` (`void sessionOwner.leave();`), `g4` (`void sessionOwner.open(…)`); k at `a1` (the `account=`
  attribute), `a2` (`if (exit === 'signed-out') onSignedOut();`), `p1` (the gate's
  `if (projectState.status === 'fatal' && projectState.terminal)`) — and date `<observed-date-i>`,
  `<observed-date-k>` in `tasks.md` and the map. This packet's `app.tsx` hunks keep three lines of
  context clear of all six lines; two of its faults **replace** a line one of them comments (`g1` at
  `p1`'s, `n1` at `g4`'s): every fault patch is zero-context and applied with `git apply
--unidiff-zero`, which locates the removed line wherever a comment above pushed it.
- **Packet j** landed for real in the base: its comments in `project-runtime.ts`, `project-page.tsx`
  and `use-plan-read.ts` are already there, and this packet's context includes some of them verbatim.

Section 9.1's `fill=1` run proves all of it against a copy with every one of packet i's and k's sites
filled, their notes dated, and packet l's rehearsed spec and task edits simulated; `fill=real` proves it
against the real base.

## 6. Slices

Each slice is one executor attempt and ends at a checkpoint: the executor stops and reports, and the
planner reviews and commits before the next slice is dispatched. Every block below is real `sh`, run
from the repository root unless it says `cd`. Every frontend command runs from `apps/wbs/fe-01`, one at
a time — never two Vitest runs at once, and every multi-file run with `--no-file-parallelism
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

**0b. Two helpers, the patches, the fault patches and the three lists**, written into `$TMPDIR` so that
every later block — each its own shell — can use them.

````sh
set -euo pipefail
cat > "$TMPDIR/run-check.sh" <<'EOF'
#!/usr/bin/env bash
# Runs one check into $TMPDIR/evidence/<name>.log, appends its own exit status,
# and prints the summary lines. Never fails itself: the status line is the result.
set -uo pipefail
name=$1
shift
log="$TMPDIR/evidence/$name.log"
if "$@" > "$log" 2>&1; then status=0; else status=$?; fi
echo "status=$status" >> "$log"
test -f "$log"
if summary=$(grep -E "Test Files|Tests  |Errors  |error TS|Found [0-9]+ error|^status=" "$log"); then
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
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-m-project-replacement.md
test -f "$packet"
mkdir -p "$TMPDIR/patches" "$TMPDIR/mutations"
# Section 7's fenced diffs, in document order, as 01.diff … 06.diff.
awk -v out="$TMPDIR/patches" '
  /^## 7\. The code$/ { inside=1; next }
  /^## 8\. Proofs$/   { inside=0 }
  inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(find "$TMPDIR/patches" -name '*.diff' | wc -l)
echo "patches=$count"
test "$count" -eq 6
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
test "$count" -eq 11
# The module set, packet i's session set and packet f2's adopted set, relative to apps/wbs/fe-01.
printf '%s\n' src/modules/plan-writer src/modules/calendar-markers src/modules/project \
  src/runtime/project-runtime.test.ts src/runtime/project-runtime.model.test.ts > "$TMPDIR/modules.txt"
printf '%s\n' src/app.test.tsx src/app-router.test.tsx \
  src/components/directory/directory-page.test.tsx > "$TMPDIR/session.txt"
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
test "$(wc -l < "$TMPDIR/session.txt")" -eq 3
test "$(wc -l < "$TMPDIR/adopted.txt")" -eq 20
````

Expected: `patches=6`, `mutations=11`, exit 0. **Applying section 7.N** below always means exactly
this, never a hand edit:

```sh
set -euo pipefail
git apply --check "$TMPDIR/patches/NN.diff"
git apply "$TMPDIR/patches/NN.diff"
```

`--check` and the apply are separate commands on purpose: joined with `&&` under `set -e`, a failed
check would not stop the shell. `git apply` without `--index` writes only the working tree, which the
read-only `.git` allows; the `index` lines in the diffs are informational. The six diffs are numbered
in section order: 7.1 is `01.diff`, 7.2 `02`, and so on to 7.6 `06`.

**0c. The baselines every slice records**, before any edit:

```sh
set -euo pipefail
cd apps/wbs/fe-01
bash "$TMPDIR/run-check.sh" base-sandbox bunx vitest run --config vitest.node.config.ts \
  --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
# shellcheck disable=SC2046 # fixed paths without spaces
bash "$TMPDIR/run-check.sh" base-modules env TZ=UTC bunx vitest run --no-file-parallelism \
  --maxWorkers=1 $(cat "$TMPDIR/modules.txt")
# shellcheck disable=SC2046
bash "$TMPDIR/run-check.sh" base-session env TZ=UTC bunx vitest run --no-file-parallelism \
  --maxWorkers=1 $(cat "$TMPDIR/session.txt")
bash "$TMPDIR/run-check.sh" base-zoned env TZ=Pacific/Auckland bunx vitest run \
  --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
for check in base-sandbox base-modules base-session base-zoned; do
  bash "$TMPDIR/expect-status.sh" "$check" 0
done
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
orientation only (section 9.3 has them per slice). On the real base packet l's new suites may move the
sandbox count; the slice's delta is what is checked.

In the sandbox the executor never runs `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e` or `tool-devsync:test`; section 9.4 gives each to the planner with its expected
relative delta.

### Slice 1 — the refresh owner's identity is the only reader test

Owns (10 paths): `verify.md`, and under `apps/wbs/fe-01/src/`:
`modules/calendar-markers/{contract.ts,calendar-markers.feature.ts,calendar-markers.feature.test.ts}`,
`modules/plan-writer/{contract.ts,plan-writer.feature.ts,plan-writer.test.ts,busy-store.ts}`,
`modules/project/composition.test.ts` and `runtime/project-runtime.ts`.

- [ ] 1. Step 0. Expected: module set rehearsed 7·30, session set 3·70, sandbox 57·713, zoned 2·3.
- [ ] 2. **The deletion's evidence first**, on the unchanged tree: in `runtime/project-runtime.ts`,
      replace the markers' and the writer's `isActiveReader: isCurrent,` — both, together — by
      `isActiveReader: () => true,` and run the production-path suites; then restore and compare.

  ```sh
  set -euo pipefail
  file=apps/wbs/fe-01/src/runtime/project-runtime.ts
  test -f "$file"
  cp "$file" "$TMPDIR/u12.passing"
  test "$(grep -c '^            isActiveReader: isCurrent,$' "$file")" -eq 2
  sed -i 's/^            isActiveReader: isCurrent,$/            isActiveReader: () => true,/' "$file"
  test "$(grep -c '^            isActiveReader: () => true,$' "$file")" -eq 2
  diff -u "$TMPDIR/u12.passing" "$file" > "$TMPDIR/evidence/u12.patch" || test $? -eq 1
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046 # fixed paths without spaces
  bash "$TMPDIR/run-check.sh" s1-u12 env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 $(cat "$TMPDIR/adopted.txt") src/runtime/project-runtime.test.ts \
    src/runtime/project-runtime.model.test.ts src/app.test.tsx
  cd ../../..
  cp "$TMPDIR/u12.passing" "$file"
  cmp "$file" "$TMPDIR/u12.passing"
  bash "$TMPDIR/expect-status.sh" s1-u12 0
  ```

  Expected, and rehearsed: `status=0`, `Test Files 23 passed (23)`, `Tests 1244 passed (1244)` — the
  adopted set's count plus the runtime pair's and `app.test.tsx`'s; the sed matches exactly the two
  wirings (the feed's, indented deeper, is untouched). **A failing test here is a stop**: the
  predicate would then be reachable, and deleting it wrong. A single `Test timed out in 5000ms` is
  condition 11 of section 10. (`|| test $? -eq 1` follows one command.)

- [ ] 3. Apply section 7.1, the test side. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-red-vitest env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/modules/plan-writer/plan-writer.test.ts \
    src/modules/calendar-markers/calendar-markers.feature.test.ts src/modules/project/composition.test.ts
  bash "$TMPDIR/expect-status.sh" s1-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s1-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 5 errors in 3 files.`, every one a
  TS2741, `Property 'isActiveReader' is missing in type '…' but required in type
'CalendarMarkersHost'` (two, `calendar-markers.feature.test.ts:80` and `:175`), `… 'PlanWriterHost'`
  (two, `plan-writer.test.ts:45` and `:84`) and `… 'CalendarMarkersReader'` (one,
  `composition.test.ts:68`); Vitest `status=1`, `Tests 9 failed | 7 passed (16)`, every failure
  `TypeError: isActiveReader is not a function` — the hosts no longer pass it and the modules still
  call it.

- [ ] 4. Apply section 7.2, the production side.
- [ ] 5. **Green checkpoint.**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046 # fixed paths without spaces
  bash "$TMPDIR/run-check.sh" s1-green-modules env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 $(cat "$TMPDIR/modules.txt")
  bash "$TMPDIR/run-check.sh" s1-green-tiers env TZ=UTC bunx vitest run src/test-tiers.test.ts
  bash "$TMPDIR/run-check.sh" s1-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s1-green-adopted env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  for check in s1-green-typecheck s1-green-modules s1-green-tiers s1-green-sandbox s1-green-adopted; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: module set = step 0 **plus 1 test** (rehearsed 7·30 → 7·31: one
  writer case replaced by two); sandbox = step 0 **plus 1 test** (57·713 → 57·714); the adopted set
  unchanged in files and tests (20·1219) — the production-path proof that nothing the predicate did is
  missed. On the real base `wbs-fe-01:typecheck` also runs packet l's `typecheck:module`, which
  compiles each of the two modules alone: it must pass too.

- [ ] 6. Durable lint, from the repository root:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-lint env NX_DAEMON=false bunx nx run wbs-fe-01:lint
  bash "$TMPDIR/expect-status.sh" s1-lint 0
  ```

  An autofixable import-order or Prettier finding is fixed with `bunx eslint --fix <file>`, not
  reported as a stop (preamble rule 17).

- [ ] 7. The three proofs of section 8.1 (`w1`, `w2`, `c1`), with section 8's procedure: every fault
      observed first, then the `Proof:` comments at the sites the table names.
- [ ] 8. Rerun `s1-final-modules` (step 5's module command) and step 0c's sandbox, session and zoned
      commands (`s1-final-*`): session set and zoned unchanged from step 0, the others as step 5.
- [ ] 9. Append this slice's `verify.md` entry (shape below), then owned-file Prettier over the ten
      paths, `--write` then `--check`, from this list, which step 10 reuses; then rerun the strict
      OpenSpec block — **after** the evidence edit.

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.test.ts \
    apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts \
    apps/wbs/fe-01/src/modules/calendar-markers/contract.ts \
    apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts \
    apps/wbs/fe-01/src/modules/plan-writer/contract.ts \
    apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts \
    apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts \
    apps/wbs/fe-01/src/modules/project/composition.test.ts \
    apps/wbs/fe-01/src/runtime/project-runtime.ts \
    openspec/changes/adopt-frontend-lifetimes/verify.md \
    > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 10
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

  Expected: the `diff` prints nothing and exits 0: ten ` M` paths.

Planner commit subject:
`refactor(frontend): drop the reader predicate the refresh owner's identity already answers`.

### Slice 2 — a project given back whole, through the page, the router and Strict Mode

Owns (9 paths): `spec.md`, `verify.md`, `tasks.md` (all under
`openspec/changes/adopt-frontend-lifetimes/`),
`docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, and under
`apps/wbs/fe-01/src/`: `app.tsx`, `app.test.tsx`, `components/wbs/project-page.tsx`,
`components/wbs/use-plan-read.ts` and one new file, `components/wbs/project-replacement.test.tsx`.

- [ ] 1. Step 0. Expected: session set rehearsed 3·70, sandbox 57·714, zoned 2·3.
- [ ] 2. **The contract first (R4).** Apply section 7.3 (the requirement "Every trigger gives a
      project back whole, and a late answer changes nothing") and rerun the strict block. Expected:
      exit 0, `passed` equal to step 0's number (rehearsed 114 → 114).
- [ ] 3. Apply section 7.4: the new page file and the region cases. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s2-red-vitest env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/app.test.tsx src/components/wbs/project-replacement.test.tsx
  bash "$TMPDIR/expect-status.sh" s2-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s2-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 1 error in
apps/wbs/fe-01/src/app.test.tsx:744` — TS2322, `… is not assignable to type 'IntrinsicAttributes &
SignedInAppProps'.` (`projectApi` is not a prop yet); Vitest `status=1`, `Tests 3 failed | 22 passed
(25)`: the three region cases on `AssertionError: expected null not to be null` — without the seam
  the page lists projects through its own client, whose stubbed answer is empty, so `p1` is never on
  offer. **The five page cases pass on this tree**: they are oracles of guards already there, and
  section 8.2's faults are their red.

- [ ] 4. Apply section 7.5 (`app.tsx`, `project-page.tsx`, `use-plan-read.ts`) and section 7.6
      (`tasks.md`, the lifetime map), then date the two notes by observation, never by copying a date
      from this packet:

  ```sh
  set -euo pipefail
  observed=$(date -u +%F)
  for note in openspec/changes/adopt-frontend-lifetimes/tasks.md \
    docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md; do
    test -f "$note"
    test "$(grep -c '<observed-date-m>' "$note")" -eq 1
    sed -i "s/<observed-date-m>/$observed/" "$note"
    grep -n "observed $observed" "$note"
    if grep -n '<observed-date-m>' "$note"; then echo "placeholder left in $note" >&2; exit 1; else rc=$?; test "$rc" -eq 1; fi
  done
  ```

  Expected: at least one line printed per file (other packets' notes may carry the same date), exit 0;
  task 11's box is `[x]`.

- [ ] 5. **Green checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  bash "$TMPDIR/run-check.sh" s2-format env NX_DAEMON=false bunx nx format:check --all
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s2-green-session env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 $(cat "$TMPDIR/session.txt") src/components/wbs/project-replacement.test.tsx
  bash "$TMPDIR/run-check.sh" s2-green-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/run-check.sh" s2-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s2-green-adopted env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  for check in s2-green-typecheck s2-format s2-green-session s2-green-zoned s2-green-sandbox \
    s2-green-adopted; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: the session run = step 0's session set **plus 1 file and 8 tests**
  (rehearsed 3·70 → 4·78: three region cases, and the new file's five); zoned and sandbox unchanged —
  both new suites are jsdom suites; the adopted set unchanged (20·1219), which with the key and the
  busy guard gone is the production-path evidence that neither was reached.

- [ ] 6. Durable lint (`s2-lint`), expected `status=0`.
- [ ] 7. The eight proofs of section 8.2 (`s1`, `s2`, `h1`, `t1`, `m1`, `r1`, `g1`, `n1`).
- [ ] 8. Rerun the step-5 session command (`s2-final-session`) and step 0c's sandbox command
      (`s2-final-sandbox`): unchanged from step 5.
- [ ] 9. `verify.md` entry. Then owned-file Prettier over the nine paths from this list (step 10
      reuses it), `nx format:check --all` again (`s2-format-after`), and the strict OpenSpec block —
      all after the evidence edit. Never a repository-wide format **write**.

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/src/app.test.tsx \
    apps/wbs/fe-01/src/app.tsx \
    apps/wbs/fe-01/src/components/wbs/project-page.tsx \
    apps/wbs/fe-01/src/components/wbs/project-replacement.test.tsx \
    apps/wbs/fe-01/src/components/wbs/use-plan-read.ts \
    docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/tasks.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md \
    > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 9
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  ```

  Expected: exit 0, and `All matched files use Prettier code style!` from the check.

- [ ] 10. Hand over, with slice 1 step 10's block unchanged. Expected: the `diff` prints nothing and
      exits 0 — eight ` M` paths and one `??`, `project-replacement.test.tsx`.

Planner commit subject:
`refactor(frontend): give a project back whole on a switch, a route change and Strict Mode, and close task 11`.

### Verification record entries

Each slice appends one entry to `openspec/changes/adopt-frontend-lifetimes/verify.md`, headed
`## Packet 050.7m, slice N — <what the slice did>`, containing only its own observations: the attempt
id and starting hash; step 0's baselines as numbers; every command's status; slice 1's deletion
evidence (`s1-u12`); the red checkpoint's own diagnostics; the green counts; every proof of that slice
with its observed message; and what stayed **pending planner verification** — `wbs-fe-01:test`,
`wbs-fe-01:test:unit`, `wbs-fe-01:build`, `wbs-fe-01:e2e`, `tool-devsync:test` and the host gate.
Evidence references are basenames relative to that attempt's evidence directory, never absolute paths.
Do not read, quote or restate an earlier entry.

### Dispatch

One attempt per slice, from the reviewed packet, with no network, driven by a Claude subagent. The
base of slice 1 is planning after packet i's, packet k's and packet l's real lanes have landed, plus
this plan branch's commits since the authoring base **cherry-picked in order** (`git cherry-pick
59cfe22a4..<plan-branch head>` — the authoring base's own commits are packet i's and k's rehearsals and
must never reach planning; never merge the plan branch). It differs from the authoring base by those
three packets' executor `Proof:` comments, dated notes and `verify.md` entries, packet l's own spec,
task and map text, and whatever their dispatch reviews changed: before the first dispatch the planner
runs section 9.1's script with `REAL_BASE=<reviewed-base-sha>`, whose `fill=real` output is the
dispatch evidence. This block holds the only absolute paths in this document.

```sh
# Slice 1, from the reviewed base; LN is packet l's last slice's planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-m-project-replacement 1 <reviewed-base-sha> \
  --driver claude \
  --batch batch-6 \
  --require-ancestor <LN> \
  --slice-note 'reviewed base <reviewed-base-sha>' \
  --preserve evidence

# Slice 2, into the same clone once slice 1 is reviewed and committed; P is
# slice 1's planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-m-project-replacement 2 P \
  --driver claude \
  --batch batch-6 \
  --require-ancestor <LN> \
  --resume --require-ancestor P \
  --slice-note 'reviewed base P' \
  --preserve evidence
```

No `--seed`: no slice reads another attempt's evidence. No `--network`: nothing reaches a host.
`--slice-note` is load-bearing: it is the only channel by which the reviewed SHA reaches the executor
without passing through the clone, and step 0a reads it. `--driver claude` writes the prompt and
stops; the Claude subagent runs the slice and the planner collects the attempt.

## 7. The code

Six fenced diffs, in slice order. Step 0b extracts them as `01.diff` … `06.diff`, and section 9.1
records the run that applies all of them, in this order, to a tree extracted from the authoring base
and proves the result byte-identical to the rehearsal's final commit. No diff adds a `Proof:` comment;
the ones they remove are the deleted checks' own (section 3.2) and packet j's comment beside the key,
which had become false.

### 7.1 The modules' suites — slice 1, the test side

The two hosts lose `isActiveReader`; the markers' `leave` answers no owner, as the runtime does once
withdrawn; the writer's busy case — whose premise, a busy state shared with a replacement, no longer
exists — becomes two reader-left cases.

```diff
diff --git a/apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.test.ts b/apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.test.ts
index 3e08ffc01..f9996bcf8 100644
--- a/apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.test.ts
+++ b/apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.test.ts
@@ -35,7 +35,7 @@ interface Reader {
   readonly owner: PlanRefresh;
   /** Puts a different owner in place, as a new project's effect does. */
   replaceOwner: (next: PlanRefresh | null) => void;
-  /** Takes the screen away without replacing the owner, as a render does. */
+  /** Withdraws the reader, as its owner does: from then on it answers no owner at all. */
   leave: () => void;
 }

@@ -66,7 +66,6 @@ function readerOver(routes: Partial<CalendarMarkerRoutes> = {}): Reader {
   const refusals: unknown[] = [];
   const owner = fakeOwner(asked);
   let installed: PlanRefresh | null = owner;
-  let active = true;
   const api: CalendarMarkerRoutes = { ...recordingRoutes(asked), ...routes };
   return {
     asked,
@@ -76,13 +75,12 @@ function readerOver(routes: Partial<CalendarMarkerRoutes> = {}): Reader {
       installed = next;
     },
     leave: () => {
-      active = false;
+      installed = null;
     },
     host: {
       projectId: 'p1',
       api,
       readRefreshOwner: () => installed,
-      isActiveReader: () => active,
       announceRefusal: ({ cause }) => {
         refusals.push(cause);
       },
@@ -184,7 +182,6 @@ describe('the calendar markers a reader may put on the chart', () => {
         },
       },
       readRefreshOwner: () => installed,
-      isActiveReader: () => true,
       announceRefusal: () => undefined,
     });

diff --git a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts
index 69fd23082..b7b40cae9 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts
@@ -44,7 +44,6 @@ function recordingHost(): {
     busyChanges,
     host: {
       readRefreshOwner: () => owner,
-      isActiveReader: () => true,
       rereadResources: (resources) => {
         rereads.push(resources);
         return Promise.resolve();
@@ -84,7 +83,6 @@ describe('the plan writer', () => {
     let owner = fakeFeedOwner();
     const writer = createPlanWriter({
       readRefreshOwner: () => owner,
-      isActiveReader: () => true,
       rereadResources: (resources) => {
         rereads.push(resources);
         return Promise.resolve();
@@ -124,26 +122,45 @@ describe('the plan writer', () => {
     expect(said).toEqual(['command issued', 'request sent']);
   });

-  it('leaves the project busy when its reader left before the answer arrived', async () => {
+  it('refuses, rereads nothing and still lowers busy when its reader left before the answer', async () => {
     const recorded = recordingHost();
     const busy = createBusy();
-    let reading = true;
-    const writer = createPlanWriter({
-      ...recorded.host,
-      isActiveReader: () => reading,
-      busy,
-    });
+    let owner: PlanRefresh | null = fakeFeedOwner();
+    const writer = createPlanWriter({ ...recorded.host, readRefreshOwner: () => owner, busy });

-    await writer.run(async (write) => {
+    const outcome = await writer.run(async (write) => {
       await write.perform(['tree'], () => {
-        // Another API replaced this reader's while the request was in flight,
-        // and that reader raised busy for a gesture of its own.
-        reading = false;
+        // The reader's runtime was withdrawn while the request was in flight:
+        // from then on it answers no refresh owner at all.
+        owner = null;
         return Promise.resolve('renamed');
       });
     });

-    expect(busy.snapshot()).toBe(true);
+    expect(outcome).toBe('refused');
     expect(recorded.rereads).toEqual([]);
+    expect(busy.snapshot()).toBe(false);
+  });
+
+  it('refuses a gesture whose reader left during its covering read', async () => {
+    const recorded = recordingHost();
+    let owner: PlanRefresh | null = fakeFeedOwner();
+    const writer = createPlanWriter({
+      ...recorded.host,
+      readRefreshOwner: () => owner,
+      rereadResources: (resources) => {
+        recorded.rereads.push(resources);
+        // Withdrawn while its covering read was reading.
+        owner = null;
+        return Promise.resolve();
+      },
+    });
+
+    const outcome = await writer.run(async (write) => {
+      await write.perform(['tree'], () => Promise.resolve('renamed'));
+    });
+
+    expect(outcome).toBe('refused');
+    expect(recorded.rereads).toEqual([['tree']]);
   });
 });
diff --git a/apps/wbs/fe-01/src/modules/project/composition.test.ts b/apps/wbs/fe-01/src/modules/project/composition.test.ts
index b73fab6b3..283a67c29 100644
--- a/apps/wbs/fe-01/src/modules/project/composition.test.ts
+++ b/apps/wbs/fe-01/src/modules/project/composition.test.ts
@@ -68,7 +68,6 @@ describe('the project composition root', () => {
     const markers = services.calendarMarkersFor({
       projectId: 'p1',
       readRefreshOwner: () => feed.owner,
-      isActiveReader: () => true,
       announceRefusal: (refusal) => {
         throw new Error(`refused: ${String(refusal.cause)}`);
       },
```

### 7.2 The modules and the runtime — slice 1, the production side

```diff
diff --git a/apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts b/apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts
index 113a8deb5..04256dab1 100644
--- a/apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts
+++ b/apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts
@@ -8,14 +8,14 @@ import type { CalendarMarkerEdit, CalendarMarkers, CalendarMarkersHost } from '.
  * The **feature**-service delivery sees (rule K2), and the only place that
  * knows **who** a write belongs to. Every gesture is the same three acts — send
  * it, say what was refused, read the dirtied resources again — and the two
- * guards below are what keep a departed reader out of all three.
+ * guards below, both over the refresh owner's identity, are what keep a departed
+ * reader out of all three.
  */
 // @capability plan-refresh
 export function createCalendarMarkers({
   projectId,
   api,
   readRefreshOwner,
-  isActiveReader,
   announceRefusal,
 }: CalendarMarkersHost): CalendarMarkers {
   const writes = createCalendarMarkerWrites({ projectId, api });
@@ -25,13 +25,12 @@ export function createCalendarMarkers({
     if (owner === null) return;
     /**
      * Still this reader's write: the owner it started against is still the one
-     * installed, and the screen still holds the project and API it opened.
-     * Both, because they fail at different moments — the owner is replaced by
-     * an effect, the project and API by a render before it.
+     * answered. A reader replaced and a reader withdrawn both fail it, because
+     * the host answers `null` from the withdrawal on — see
+     * {@link CalendarMarkersHost.readRefreshOwner}.
      */
     // Proof: on 2026-09-21, omitting the owner comparison made the replaced-owner test announce marker_not_found.
-    // Proof: on 2026-09-21, omitting the active-reader comparison made the left-screen test announce marker_not_found.
-    const isCurrent = (): boolean => readRefreshOwner() === owner && isActiveReader();
+    const isCurrent = (): boolean => readRefreshOwner() === owner;
     try {
       await writes.send(edit);
     } catch (cause) {
diff --git a/apps/wbs/fe-01/src/modules/calendar-markers/contract.ts b/apps/wbs/fe-01/src/modules/calendar-markers/contract.ts
index 2b206f243..d7a4c5552 100644
--- a/apps/wbs/fe-01/src/modules/calendar-markers/contract.ts
+++ b/apps/wbs/fe-01/src/modules/calendar-markers/contract.ts
@@ -78,15 +78,17 @@ export interface CalendarMarkerRefusal {
 export interface CalendarMarkersHost extends CalendarMarkerPorts {
   /**
    * The refresh owner this reader is currently reading through, or `null`
-   * before the first one exists.
+   * before the first one exists and from the instant the reader is withdrawn.
    *
    * Its **identity** is what makes a write this reader's: the same object it
-   * started against, still installed. {@link PlanFeed.owner} is what answers
-   * this today.
+   * started against, still answered. That is the whole test, and no second
+   * "is the reader still on screen" question is asked beside it: a feed opens
+   * its refresh owner once, and the project runtime answers `null` here from
+   * the moment its owner withdraws it (`readRefreshOwner` in
+   * `runtime/project-runtime.ts`), so a reader that left and a reader replaced
+   * fail the same comparison.
    */
   readonly readRefreshOwner: () => PlanRefresh | null;
-  /** Whether the screen still holds the project and API this reader opened. */
-  readonly isActiveReader: () => boolean;
   /** Announces one refusal to whoever says things to the reader. */
   readonly announceRefusal: (refusal: CalendarMarkerRefusal) => void;
 }
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
index 1d02ecb19..7e6ac28a2 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
@@ -5,15 +5,13 @@ import type { Store } from '@/modules/store';
  * Whether this project is waiting for be-01 on one of its reader's gestures —
  * the shared busy state the toolbar and the cells read.
  *
- * A gesture raises it when it starts and lowers it when it ends, **if its
- * reader is still the one on screen**. That condition is the gesture's to test,
- * not this store's: it is the same question the gesture already asks before it
- * spends its answer, `isActiveReader()` in `plan-writer.feature.ts`, and the
- * reason is the one the busy-replacement cases prove — a departed reader's
- * answer must not clear its replacement's pending rename. What this store owns
- * is the value and the telling: a boolean, stable by value, and a listener is
- * told once for each change and never when a raise finds it already raised or a
- * lower finds it already lowered.
+ * A gesture raises it when it starts and lowers it when it ends, however it
+ * ended. One of these belongs to each project runtime and to nothing else, so
+ * a departed reader's answer lowers only its own runtime's, which nobody draws
+ * any more, and can never clear its replacement's pending rename. What this
+ * store owns is the value and the telling: a boolean, stable by value, and a
+ * listener is told once for each change and never when a raise finds it already
+ * raised or a lower finds it already lowered.
  *
  * Notification goes through {@link createChannel}, so a listener that raises or
  * lowers from inside its own notification is told again afterwards rather than
@@ -21,8 +19,8 @@ import type { Store } from '@/modules/store';
  *
  * Plain TypeScript and no lifetime of its own (rule F1): it holds no resource,
  * nothing closes it, and no call on it ever throws a lifecycle refusal. Its
- * owner today is the table's mount, one per project; the project runtime of
- * OpenSpec task 10 takes it over.
+ * owner is the project runtime (`runtime/project-runtime.ts`), one per selected
+ * project.
  */
 export interface Busy extends Store<boolean> {
   readonly raise: () => void;
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/contract.ts b/apps/wbs/fe-01/src/modules/plan-writer/contract.ts
index 7329da50b..6e58807db 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/contract.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/contract.ts
@@ -20,9 +20,8 @@ export interface PlanWriteRefusal {
 /**
  * What the plan writer needs from whoever is hosting it.
  *
- * Two kinds of member, and no React in either. The first three are **read** at
- * the moment a gesture asks, not at the moment the writer is built: the feed
- * owner can be renewed under the same reader by a covering read, and the reader
+ * Two kinds of member, and no React in either. The first two are **read** at
+ * the moment a gesture asks, not at the moment the writer is built: the reader
  * can leave for another project between a request and its answer. The last
  * three are the project's own **store and ports** — the writer raises and
  * lowers busy through one and says what happened through the other two, and
@@ -30,28 +29,25 @@ export interface PlanWriteRefusal {
  */
 export interface PlanWriterHost {
   /**
-   * The plan feed owner as it stands now, or null while none is installed.
+   * The plan feed owner as it stands now: null while none is installed, and
+   * null from the instant the reader is withdrawn.
    *
    * Its **identity** is all that is read — a gesture compares the owner it began
-   * under against the owner that exists when its answer arrives. The writer calls
-   * no member of it; rereads go through {@link PlanWriterHost.rereadResources}.
+   * under against the owner answered when its answer arrives, and that is the
+   * whole of "is this still the reader's gesture". A feed opens its refresh
+   * owner once and never renews it, and the project runtime answers `null` here
+   * once its owner has withdrawn it (`readRefreshOwner` in
+   * `runtime/project-runtime.ts`), so a reader that left and a reader replaced
+   * fail the same comparison. The writer calls no member of it; rereads go
+   * through {@link PlanWriterHost.rereadResources}.
    */
   readRefreshOwner: () => PlanRefresh | null;
-  /**
-   * Whether this writer still owns the screen: the same project and the same API
-   * the gesture was issued against.
-   *
-   * Separate from the owner above because the two guards disagree on purpose. A
-   * covering read may renew the feed owner for the same logical reader, and that
-   * renewal must not cost the reader its own gesture's outcome or leave it busy.
-   */
-  isActiveReader: () => boolean;
   /** Awaits the covering outcome of an invalidation; failures stay in the feed's own snapshot. */
   rereadResources: (resources: readonly RefreshResource[]) => Promise<void>;
   /**
    * The project's busy state: raised when a gesture starts, and lowered when it
-   * ends only if {@link PlanWriterHost.isActiveReader} still answers yes — the
-   * reader that raised it owns it; a different API or project does not.
+   * ends, however it ended. It is one project runtime's own, so a gesture whose
+   * reader has left lowers only a busy state nobody draws any more.
    */
   busy: BusyWrites;
   /**
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
index 9b511edfa..d09589432 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
@@ -11,15 +11,15 @@ import { ALL_RESOURCES } from '@/lib/plan-refresh';
 import type { PlanWriter, PlanWriterHost } from './contract';

 /**
- * Builds the writer for one reader: one project, one API, one busy state.
+ * Builds the writer for one reader: one project runtime's refresh owner, its
+ * reread and its busy state.
  *
- * A plain factory and not a DI Bag module, because DI Bag is not installed in
- * this application yet. The module directory is shaped so that adding one later
- * moves no policy.
+ * A plain factory rather than a DI Bag module of its own: the project runtime
+ * registers it as one binding (`installProjectRuntime` in
+ * `runtime/project-runtime.ts`), so the module moves no policy into a graph.
  */
 export function createPlanWriter({
   readRefreshOwner,
-  isActiveReader,
   rereadResources,
   busy,
   commandsIssued,
@@ -63,7 +63,8 @@ export function createPlanWriter({
       // Proof: guarding only projectId leaked one refusal toast into the new API
       // owner in `does not toast an old API mutation refusal into its replacement`.
       const owner = readRefreshOwner();
-      const isCurrent = () => owner !== null && readRefreshOwner() === owner && isActiveReader();
+      /** Still this reader's gesture: the owner it began under is the one still answered. */
+      const isCurrent = () => owner !== null && readRefreshOwner() === owner;
       // Read here, synchronously, because this is the moment the gesture
       // happened. The intent compares it against where the focus is when the
       // refetch lands, and everything between the two is the window in which
@@ -118,30 +119,17 @@ export function createPlanWriter({
         // Watched, 2026-09-20.
         if (!isCurrent()) return 'refused';
         if (completed.length > 0) await rereadResources(completed);
-        // A covering read may renew the coordinator for the same reader, so
-        // its identity cannot decide this outcome. A live owner and the
-        // project/API pair can:
-        // Proof: removing this pair check let an old Arrange success toast
-        // into the API that replaced it while its tree read was held; replacing
-        // it with `isCurrent()` suppressed the valid toast after a same-reader
-        // subscription renewal. Watched in the two covering-read Arrange cases,
-        // 2026-09-13.
-        // Proof: omitting the null-owner check issued a second create with
-        // afterId `w1` in `abandons queued adds when unmounted during their covering read`.
-        if (readRefreshOwner() === null || !isActiveReader()) return 'refused';
+        // Asked again after the covering read, which the reader may have left
+        // while it was reading. One owner per feed, never renewed, so its
+        // identity decides this outcome as it decided the one above.
+        if (!isCurrent()) return 'refused';
         return 'landed';
       } finally {
-        // A covering read may renew the coordinator while retaining the same
-        // logical reader. That reader owns this busy state; a different API or
-        // project does not.
-        // Proof: requiring captured coordinator identity left the renewed
-        // reader busy forever. Dropping the API half let the departed owner
-        // clear its replacement's pending rename. Watched in the renewal and
-        // busy-replacement cases, 2026-09-14.
-        // Proof: on 2026-09-24, lowering without the `isActiveReader()` guard
-        // failed `leaves the project busy when its reader left before the answer
-        // arrived` on `expected false to be true`.
-        if (isActiveReader()) busy.lower();
+        // Lowered however the gesture ended, and with nothing asked of the
+        // reader: busy is this project runtime's own, so a gesture whose reader
+        // has left lowers only a busy state nobody draws any more, and never
+        // the next project's.
+        busy.lower();
       }
     },
   };
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
index a2d9cbdce..2ef93f92e 100644
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -63,7 +63,10 @@ export interface ProjectRuntimeDependencies extends ProjectSource {
  *   once this runtime has been withdrawn;
  * - the refresh owner the writer and the marker gestures compare is `null`
  *   once it has, so a gesture begun after that sends nothing and one begun
- *   before it spends nothing against a replacement;
+ *   before it spends nothing against a replacement. It is the **only** reader
+ *   test either is handed: the feed opens its refresh owner once and never
+ *   renews it, so a second "is the reader still on screen" predicate beside
+ *   this identity would decide nothing it does not;
  * - a reread asked of it after that reads nothing;
  * - its stream tells its presence nothing more, so the roster of a project
  *   that has been left is never changed after it was left.
@@ -191,7 +194,6 @@ export function installProjectRuntime({
           services.calendarMarkersFor({
             projectId,
             readRefreshOwner,
-            isActiveReader: isCurrent,
             // Proof: on 2026-09-24, `() => undefined` here failed `rereads a marker refused because
             // a peer already deleted it`: no toast was there to hold `no longer`.
             announceRefusal: refusals.publish,
@@ -213,7 +215,6 @@ export function installProjectRuntime({
         }): PlanWriter =>
           createPlanWriter({
             readRefreshOwner,
-            isActiveReader: isCurrent,
             rereadResources: reread,
             busy,
             commandsIssued,
@@ -276,7 +277,9 @@ export interface ProjectOwnerDependencies {
 }

 /**
- * Builds the owner of one page's selected project.
+ * Builds the owner of a selected project: in the app, one per signed-in
+ * session, which hands it to the project page and retires it before itself
+ * (`sessionProjects` in `session-runtime.ts`).
  *
  * One lifetime slot underneath, so every rule of `lifetime-slot.ts` holds for
  * the project too: withdrawal is synchronous, transitions run one at a time in
@@ -289,8 +292,10 @@ export interface ProjectOwnerDependencies {
  * runtime replaced by another project's is not current even though the slot is
  * live again.
  *
- * Holds nothing until `open` is called, which is what makes it safe to build in
- * a lazy state initializer that Strict Mode may run twice.
+ * Holds nothing until `open` is called, so building one opens and acquires
+ * nothing: a session installed and given back before its page ever opened a
+ * project leaves nothing behind, and neither does a test fixture's discarded
+ * initializer.
  */
 export function createProjectOwner({
   install = installProjectRuntime,
```

### 7.3 `spec.md` — slice 2, the requirement

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index a19b2244f..f4ee5ca0e 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -500,6 +500,65 @@ route's own promise. What a reader sees SHALL NOT change.
   same client, a new client replaces all three, and the table is never handed
   the client itself

+### Requirement: Every trigger gives a project back whole, and a late answer changes nothing
+
+fe-01 SHALL give the selected project's runtime back in full, through the one
+project owner the session hands the project page, whenever the page moves to
+another project or leaves its route, and whenever Strict Mode re-enters the
+signed-in region; nothing a left project still has on its way — an undo's
+answer, a refusal, a stream frame — SHALL change what the page shows
+afterwards. While a left project is being given back the page SHALL draw no
+table and hand the header's presence slot nobody, disconnected, and each
+project runtime SHALL be drawn in a table of its own. A route change SHALL
+keep the session runtime, and a project it cannot give back SHALL be drawn as
+the sanitized fatal state in the signed-in region's place. The page mounts with
+nothing selected, so Strict Mode's re-entry into the page opens nothing; its
+re-entry into the signed-in region SHALL leave the session it first asked for,
+and the page SHALL open its project in the one runtime asked for afterwards.
+
+#### Scenario: An undo answered after its project was left
+
+- **WHEN** an undo is asked of one project, another project is selected, and
+  the undo's answer — a success or a refusal — then arrives
+- **THEN** the page shows no toast for it, and the next project's undo stays
+  available
+
+#### Scenario: The interval while a left project lets go
+
+- **WHEN** another project is selected while the left project's retirement has
+  not finished, and the left project's stream still says who is here
+- **THEN** no table is drawn and the header is handed nobody, disconnected; and
+  once the retirement has run the next project is drawn in a new table and the
+  left project's stream has been closed once
+
+#### Scenario: The project page under Strict Mode
+
+- **WHEN** the project page is drawn under Strict Mode, a project is picked and
+  then another, and the page goes
+- **THEN** exactly one runtime is built for each pick, and each is given back
+  once, its stream closed once
+
+#### Scenario: The project's route is left and entered again
+
+- **WHEN** a project is open on the project page and the reader follows the
+  link to the directory, and then back
+- **THEN** the project is given back once, the session runtime is the same one
+  throughout, and a new project runtime is opened on the return
+
+#### Scenario: A route change that cannot give the project back
+
+- **WHEN** the reader leaves the project's route and the project's close refuses
+- **THEN** the signed-in region is replaced by the sanitized fatal state, the
+  session stays published, and nothing is given back twice
+
+#### Scenario: The signed-in region under Strict Mode
+
+- **WHEN** the signed-in region is drawn under Strict Mode and a project is then
+  picked
+- **THEN** the session Strict Mode's first mount asked for is left before it is
+  built and builds nothing, and the project is opened in the one session
+  runtime built afterwards
+
 ### Requirement: One project runtime owns the selected project's plan services

 fe-01 SHALL build the plan services of one selected project - its delivered plan,
```

### 7.4 The page's and the region's cases — slice 2, the test side

```diff
diff --git a/apps/wbs/fe-01/src/app.test.tsx b/apps/wbs/fe-01/src/app.test.tsx
index cd4996f01..da1a0b3a9 100644
--- a/apps/wbs/fe-01/src/app.test.tsx
+++ b/apps/wbs/fe-01/src/app.test.tsx
@@ -1,6 +1,7 @@
 import type * as Router from '@tanstack/react-router';
 import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
 import { DiBag } from 'di-bag';
+import { StrictMode } from 'react';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import type * as Api from '@/lib/api';
@@ -675,3 +676,190 @@ describe('log out', () => {
     },
   );
 });
+
+/**
+ * Task 11 through the router and the region: a route change gives the page's
+ * project back once and keeps the session, a project that cannot be given back
+ * there is drawn as the fatal state in the region's place, and Strict Mode's
+ * re-entry into the region replaces the session before any project is opened.
+ */
+describe('the selected project, through the router', () => {
+  const KAT = { id: 'u1', username: 'kat', scopes: ['read', 'write'] as ('read' | 'write')[] };
+
+  /**
+   * An owner over fake clients that records, in order, every session and project
+   * runtime it builds and gives back; a project's close ends as `closeProject`
+   * says.
+   */
+  const recordingOwner = (
+    events: string[],
+    closeProject: () => Promise<void> = () => Promise.resolve(),
+  ): SessionOwner =>
+    createSessionOwner({
+      clientFor: () => fakeDirectoryApi(),
+      install: (dependencies) => {
+        const installed = installSessionRuntime(dependencies);
+        events.push('session built');
+        return {
+          services: installed.services,
+          close: async (options) => {
+            await installed.close(options);
+            events.push('session given back');
+          },
+        };
+      },
+      installProject: (dependencies) => {
+        const installed = installProjectRuntime(dependencies);
+        events.push(`project ${dependencies.projectId} built`);
+        return {
+          services: installed.services,
+          close: async (options) => {
+            await installed.close(options);
+            await closeProject();
+            events.push(`project ${dependencies.projectId} given back`);
+          },
+        };
+      },
+      budgetMs: 1_000,
+    });
+
+  /** The region at `path`, over one project the case holds. */
+  const regionAt = (path: string, owner: SessionOwner) => {
+    window.history.replaceState({}, '', path);
+    // Every request the shelf and the socket make answers empty: none of them is what these cases count.
+    vi.stubGlobal(
+      'fetch',
+      vi.fn((url: string) => {
+        const collection = url.split('/').at(-1) ?? 'unknown';
+        return Promise.resolve(new Response(JSON.stringify({ [collection]: [] }), { status: 200 }));
+      }),
+    );
+    return (
+      <ApplicationServicesProvider slot={servicesSlot}>
+        <ThemeProvider>
+          <SignedInApp
+            session={{ token: '', user: KAT }}
+            onSignedOut={() => undefined}
+            openOwner={() => owner}
+            projectApi={fakeProjectApi()}
+          />
+        </ThemeProvider>
+      </ApplicationServicesProvider>
+    );
+  };
+
+  const pickProject = async (id: string) => {
+    await waitFor(() => {
+      expect(screen.getByLabelText('Project')).toBeDefined();
+    });
+    fireEvent.focus(screen.getByLabelText('Project'));
+    await waitFor(() => {
+      expect(document.getElementById(`project-option-${id}`)).not.toBeNull();
+    });
+    const option = document.getElementById(`project-option-${id}`);
+    if (option === null) throw new Error(`no option for ${id}`);
+    fireEvent.click(option);
+  };
+
+  const liveSession = (owner: SessionOwner) => {
+    const state = owner.snapshot();
+    if (state.status !== 'live') throw new Error(`no session is published: ${state.status}`);
+    return state.services;
+  };
+
+  itDom(
+    'gives the project back once when its route goes, keeps the session, and opens a new runtime on return',
+    async () => {
+      const events: string[] = [];
+      const owner = recordingOwner(events);
+      render(regionAt('/', owner));
+      await pickProject('p1');
+      await waitFor(() => {
+        expect(events).toContain('project p1 built');
+      });
+      const session = liveSession(owner);
+
+      fireEvent.click(screen.getByRole('link', { name: 'Directory' }));
+
+      await waitFor(() => {
+        expect(screen.getByRole('heading', { name: 'Directory' })).toBeDefined();
+      });
+      await waitFor(() => {
+        expect(events).toContain('project p1 given back');
+      });
+      expect(liveSession(owner)).toBe(session);
+      expect(session.projects.snapshot().status).toBe('empty');
+
+      fireEvent.click(screen.getByRole('link', { name: 'Plan' }));
+
+      await waitFor(() => {
+        expect(events.filter((event) => event === 'project p1 built')).toHaveLength(2);
+      });
+      expect(events).toEqual([
+        'session built',
+        'project p1 built',
+        'project p1 given back',
+        'project p1 built',
+      ]);
+      expect(liveSession(owner)).toBe(session);
+    },
+  );
+
+  itDom(
+    'draws the fatal state in the region’s place when a route change cannot give the project back',
+    async () => {
+      const events: string[] = [];
+      const owner = recordingOwner(events, () =>
+        Promise.reject(new Error('alice@example.com: the socket would not close')),
+      );
+      render(regionAt('/', owner));
+      await pickProject('p1');
+      await waitFor(() => {
+        expect(events).toContain('project p1 built');
+      });
+
+      fireEvent.click(screen.getByRole('link', { name: 'Directory' }));
+
+      const fault = await waitFor(() => {
+        const shown = document.querySelector('[data-lifetime-fault]');
+        if (shown === null) throw new Error('no fatal state yet');
+        return shown;
+      });
+      expect(fault.textContent).not.toContain('alice@example.com');
+      expect(screen.queryByRole('heading', { name: 'Directory' })).toBeNull();
+      expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
+      expect(owner.snapshot().status).toBe('live');
+      expect(events).toEqual(['session built', 'project p1 built']);
+    },
+  );
+
+  /**
+   * Strict Mode mounts the region, runs its cleanup — the session left — and
+   * mounts it again. The first request is overtaken by that leave before it is
+   * built, so it builds nothing, and the region is drawn, and its project
+   * opened, from the one runtime the second mount asked for.
+   */
+  itDom(
+    'leaves the session Strict Mode first opened, and opens the project in the one it opens again',
+    async () => {
+      const events: string[] = [];
+      const owner = recordingOwner(events);
+      const traced: SessionOwner = {
+        ...owner,
+        leave: () => {
+          events.push('session left');
+          return owner.leave();
+        },
+      };
+      render(<StrictMode>{regionAt('/', traced)}</StrictMode>);
+      await pickProject('p1');
+      await waitFor(() => {
+        expect(events).toContain('project p1 built');
+      });
+
+      expect(events).toEqual(['session left', 'session built', 'project p1 built']);
+      const opened = liveSession(owner).projects.snapshot();
+      expect(opened.status === 'live' ? opened.services.projectId : opened.status).toBe('p1');
+    },
+  );
+});
diff --git a/apps/wbs/fe-01/src/components/wbs/project-replacement.test.tsx b/apps/wbs/fe-01/src/components/wbs/project-replacement.test.tsx
new file mode 100644
index 000000000..d95021dcd
--- /dev/null
+++ b/apps/wbs/fe-01/src/components/wbs/project-replacement.test.tsx
@@ -0,0 +1,348 @@
+import { act, fireEvent, screen, waitFor } from '@testing-library/react';
+import { StrictMode } from 'react';
+import { beforeEach, describe, expect, it } from 'vitest';
+
+import type { Roster } from '@/components/presence/presence-panel';
+import type { ProjectStreamDeps, SocketHandlers } from '@/lib/project-stream';
+import type { ProjectListEntry, UndoResult } from '@/lib/wbs-api';
+import type { ProjectRuntime } from '@/modules/project/contract';
+import {
+  createProjectOwner,
+  installProjectRuntime,
+  type ProjectOwner,
+} from '@/runtime/project-runtime';
+import { fakeProjectApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+
+import { ProjectPage } from './project-page';
+import type { SavedPlansPanelDeps } from './saved-plans-panel';
+
+// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
+const hasDom = typeof document !== 'undefined';
+const itDom = hasDom ? it : it.skip;
+
+publishApplicationRuntimeForEachTest();
+
+const entry = (id: string, name: string): ProjectListEntry => ({
+  id,
+  name,
+  restricted: false,
+  startDate: null,
+  lastOpenedAt: null,
+  ownerName: 'kat',
+  createdAt: 1_780_000_000_000,
+});
+
+/** A node without saved plans: the shelf is task 10's, and not what these cases replace. */
+const NO_SHELF: SavedPlansPanelDeps = {
+  available: () => Promise.resolve(false),
+  list: () => Promise.reject(new Error('no saved plans on this node')),
+  subscribe: () => ({ unsubscribe: () => undefined }),
+  save: () => Promise.reject(new Error('no saved plans on this node')),
+  compare: () => Promise.reject(new Error('no saved plans on this node')),
+  rename: () => Promise.reject(new Error('no saved plans on this node')),
+};
+
+/**
+ * Two projects over the plan fixture, with something to undo, and every undo
+ * held until the case answers it — so a project can be left while its answer
+ * is still on the way.
+ */
+function twoProjects() {
+  const api = fakeProjectApi();
+  api.stack.undoable = true;
+  api.listProjects = () =>
+    Promise.resolve([entry('p1', 'Rewire the shed'), entry('p2', 'Paint the fence')]);
+  const undos: { answer: (outcome: UndoResult) => void; refuse: (cause: Error) => void }[] = [];
+  api.undo = () =>
+    new Promise<UndoResult>((answer, refuse) => {
+      undos.push({ answer, refuse });
+    });
+  return { api, undos };
+}
+
+/** A socket per project the page subscribes to, and how many of them were closed. */
+function recordedSockets() {
+  const opened: SocketHandlers[] = [];
+  let closed = 0;
+  const streamDeps: ProjectStreamDeps = {
+    openSocket: (_url, handlers) => {
+      opened.push(handlers);
+      return {
+        send: () => undefined,
+        close: () => {
+          closed += 1;
+        },
+      };
+    },
+    schedule: () => 0,
+    cancel: () => undefined,
+    random: () => 0,
+  };
+  return { opened, closed: () => closed, streamDeps };
+}
+
+/**
+ * The production owner over the production installer, recording each runtime
+ * it builds and holding each retirement until the case lets it go.
+ */
+function recordingOwner({ hold = false }: { hold?: boolean } = {}) {
+  const built: ProjectRuntime[] = [];
+  const given: string[] = [];
+  const releases: (() => void)[] = [];
+  const owner: ProjectOwner = createProjectOwner({
+    install: (dependencies) => {
+      const installed = installProjectRuntime(dependencies);
+      built.push(installed.services);
+      return {
+        services: installed.services,
+        close: async (options) => {
+          if (hold) await new Promise<void>((release) => releases.push(release));
+          await installed.close(options);
+          given.push(installed.services.projectId);
+        },
+      };
+    },
+    budgetMs: 1_000,
+  });
+  return { owner, built, given, releases };
+}
+
+async function selectProject(id: string) {
+  await waitFor(() => {
+    expect(screen.getByLabelText('Project')).toBeDefined();
+  });
+  fireEvent.focus(screen.getByLabelText('Project'));
+  await waitFor(() => {
+    expect(document.getElementById(`project-option-${id}`)).not.toBeNull();
+  });
+  const option = document.getElementById(`project-option-${id}`);
+  if (option === null) throw new Error(`no option for ${id}`);
+  fireEvent.click(option);
+}
+
+const liveProject = (owner: ProjectOwner): string => {
+  const state = owner.snapshot();
+  return state.status === 'live' ? state.services.projectId : state.status;
+};
+
+const tableDrawn = () =>
+  waitFor(() => {
+    const grid = document.querySelector('[data-grid]');
+    if (grid === null) throw new Error('no table drawn yet');
+    return grid;
+  });
+
+const toastTexts = (): string[] =>
+  [...document.querySelectorAll('[data-toast-text]')].map((node) => node.textContent);
+
+/** Opens `p1`, asks it for an undo, and moves to `p2` while that undo is still unanswered. */
+async function leaveMidUndo(owner: ProjectOwner, undos: unknown[]) {
+  await selectProject('p1');
+  await tableDrawn();
+  await waitFor(() => {
+    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
+  });
+  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
+  await waitFor(() => {
+    expect(undos).toHaveLength(1);
+  });
+  await selectProject('p2');
+  await waitFor(() => {
+    expect(liveProject(owner)).toBe('p2');
+  });
+  await tableDrawn();
+  await waitFor(() => {
+    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
+  });
+}
+
+/** The first of `list`, which the case has already waited for, or a loud failure. */
+function firstOf<T>(list: readonly T[], what: string): T {
+  const first = list.at(0);
+  if (first === undefined) throw new Error(`no ${what} yet`);
+  return first;
+}
+
+/** Lets every answer already on its way arrive, and React draw what it changed. */
+const settle = () =>
+  act(async () => {
+    await new Promise((resolve) => setTimeout(resolve, 0));
+  });
+
+beforeEach(() => {
+  localStorage.clear();
+});
+
+/**
+ * Task 11: a project switch, and Strict Mode's re-entry, each replace all of
+ * the selected project's ownership, and nothing a left project still has on
+ * its way changes what the next one shows.
+ */
+describe('replacing the selected project', () => {
+  /**
+   * The toasts are the page's, handed to the table, so they outlive it: an
+   * answer to an undo asked in `p1` lands in the page that now shows `p2`
+   * unless the undo stack asks its own runtime first.
+   */
+  itDom(
+    'says nothing in the next project when an undo asked of the last one succeeds',
+    async () => {
+      const { api, undos } = twoProjects();
+      const { owner } = recordingOwner();
+      render(<ProjectPage token="t" api={api} projectOwner={owner} savedPlansDeps={NO_SHELF} />);
+      await leaveMidUndo(owner, undos);
+
+      firstOf(undos, 'undo').answer({ ok: true, done: 'rename “Strip”', detail: null });
+      await settle();
+
+      expect(toastTexts()).toEqual([]);
+      expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
+    },
+  );
+
+  itDom(
+    'says nothing in the next project when an undo asked of the last one is refused',
+    async () => {
+      const { api, undos } = twoProjects();
+      const { owner } = recordingOwner();
+      render(<ProjectPage token="t" api={api} projectOwner={owner} savedPlansDeps={NO_SHELF} />);
+      await leaveMidUndo(owner, undos);
+
+      firstOf(undos, 'undo').refuse(new Error('forbidden'));
+      await settle();
+
+      expect(toastTexts()).toEqual([]);
+      expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(false);
+    },
+  );
+
+  /**
+   * The interval between the withdrawal and the next runtime's publication,
+   * held open: the old project's retirement waits for the case. Nothing of
+   * either project is drawn in it, and a frame the old stream still delivers
+   * changes nothing on screen.
+   */
+  itDom('draws no table and hands the header nobody while the last project lets go', async () => {
+    const { api } = twoProjects();
+    const { owner, releases, given } = recordingOwner({ hold: true });
+    const sockets = recordedSockets();
+    const asked: Roster[] = [];
+    render(
+      <ProjectPage
+        token="t"
+        api={api}
+        projectOwner={owner}
+        savedPlansDeps={NO_SHELF}
+        streamDeps={sockets.streamDeps}
+        presence={(roster) => {
+          asked.push(roster);
+          return null;
+        }}
+      />,
+    );
+    await selectProject('p1');
+    await tableDrawn();
+    await waitFor(() => {
+      expect(sockets.opened).toHaveLength(1);
+    });
+    const first = firstOf(sockets.opened, 'socket for p1');
+    act(() => {
+      first.onOpen();
+      first.onMessage(JSON.stringify({ type: 'presence', users: ['kat', 'lee'] }));
+      first.onMessage(JSON.stringify({ type: 'resume_ack', replayed: { 'project:p1': 0 } }));
+    });
+    expect(asked.at(-1)).toEqual({ users: ['kat', 'lee'], connected: true });
+
+    await selectProject('p2');
+    await waitFor(() => {
+      expect(releases).toHaveLength(1);
+    });
+    act(() => {
+      first.onMessage(JSON.stringify({ type: 'presence', users: ['zed'] }));
+    });
+    await settle();
+
+    expect(owner.snapshot().status).toBe('retiring');
+    expect(document.querySelector('[data-grid]')).toBeNull();
+    expect(asked.at(-1)).toEqual({ users: [], connected: false });
+
+    await act(async () => {
+      firstOf(releases, 'retirement')();
+      await Promise.resolve();
+    });
+    await waitFor(() => {
+      expect(liveProject(owner)).toBe('p2');
+    });
+    await tableDrawn();
+    expect(given).toEqual(['p1']);
+    expect(sockets.closed()).toBe(1);
+  });
+
+  /**
+   * A new runtime is a new reader, and so a new table: nothing the last
+   * project's table held — rows, drafts, focus — is carried into the next. The
+   * table is drawn only while a runtime is published, and every replacement
+   * withdraws the old one before the next is built, so the page draws the
+   * interval between them and the next table mounts afresh.
+   */
+  itDom('draws the next project in a table of its own', async () => {
+    const { api } = twoProjects();
+    const { owner } = recordingOwner();
+    render(<ProjectPage token="t" api={api} projectOwner={owner} savedPlansDeps={NO_SHELF} />);
+    await selectProject('p1');
+    const first = await tableDrawn();
+
+    await selectProject('p2');
+    await waitFor(() => {
+      expect(liveProject(owner)).toBe('p2');
+    });
+    const next = await tableDrawn();
+
+    expect(next).not.toBe(first);
+    expect(first.isConnected).toBe(false);
+  });
+
+  /**
+   * Strict Mode runs the page's render twice and its mount effects twice. The
+   * page mounts with nothing selected, so its re-entry opens nothing; what it
+   * must not do is open a project from a render, which Strict Mode's second
+   * render would open again.
+   */
+  itDom('opens one runtime per pick under Strict Mode, and gives each back once', async () => {
+    const { api } = twoProjects();
+    const { owner, built, given } = recordingOwner();
+    const sockets = recordedSockets();
+    const view = render(
+      <StrictMode>
+        <ProjectPage
+          token="t"
+          api={api}
+          projectOwner={owner}
+          savedPlansDeps={NO_SHELF}
+          streamDeps={sockets.streamDeps}
+        />
+      </StrictMode>,
+    );
+    await selectProject('p1');
+    await tableDrawn();
+    await selectProject('p2');
+    await waitFor(() => {
+      expect(liveProject(owner)).toBe('p2');
+    });
+    await tableDrawn();
+    await settle();
+
+    expect(built.map((runtime) => runtime.projectId)).toEqual(['p1', 'p2']);
+    expect(given).toEqual(['p1']);
+    expect(sockets.opened).toHaveLength(2);
+    expect(sockets.closed()).toBe(1);
+
+    view.unmount();
+    await waitFor(() => {
+      expect(owner.snapshot().status).toBe('empty');
+    });
+    expect(given).toEqual(['p1', 'p2']);
+    expect(sockets.closed()).toBe(2);
+  });
+});
```

### 7.5 `app.tsx`, `project-page.tsx`, `use-plan-read.ts` — slice 2, the production side

```diff
diff --git a/apps/wbs/fe-01/src/app.tsx b/apps/wbs/fe-01/src/app.tsx
index 09a8e4d94..2cd30dbc2 100644
--- a/apps/wbs/fe-01/src/app.tsx
+++ b/apps/wbs/fe-01/src/app.tsx
@@ -10,6 +10,7 @@ import { HintLayer } from '@/components/wbs/hint';
 import { me as fetchMe, type Session } from '@/lib/api';
 import { failureMessage, unreachable } from '@/lib/http';
 import { ThemeProvider, useThemeChoice } from '@/lib/theme';
+import type { ProjectApi } from '@/lib/wbs-api';
 import type { ProjectOwner } from '@/runtime/project-runtime';
 import { createSessionOwner, sessionFor, type SessionOwner } from '@/runtime/session-runtime';

@@ -156,6 +157,12 @@ export interface SignedInAppProps {
   onSignedOut: () => void;
   /** Injected in tests; the app lets it default to the real owner. */
   openOwner?: () => SessionOwner;
+  /**
+   * The project page's client, injected in tests so a route can be driven over
+   * a project the test holds; the app passes none, and the page builds the real
+   * one from the session's credential.
+   */
+  projectApi?: ProjectApi;
 }

 /**
@@ -188,6 +195,7 @@ export function SignedInApp({
   session,
   onSignedOut,
   openOwner = createSessionOwner,
+  projectApi,
 }: SignedInAppProps): React.JSX.Element {
   const [sessionOwner] = useState(openOwner);
   const sessionState = useSyncExternalStore(sessionOwner.subscribe, sessionOwner.snapshot);
@@ -248,6 +256,7 @@ export function SignedInApp({
         <AppRouter
           session={services}
           token={session.token}
+          projectApi={projectApi}
           presence={
             // The panel is presentational and the roster is the page's, because
             // it arrives on the table's own socket — one connection per browser
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index ece582ef7..61b2d885e 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -590,10 +590,11 @@ export function ProjectPage({
    * Opens the selected project's runtime, and leaves it when the selection,
    * the client or the stream changes, or the page goes.
    *
-   * Every trigger reaches the one owner, so a switch, an unmount and Strict
-   * Mode's re-entry each withdraw the old runtime before anything else happens
-   * and retire it once; the next is published only after that retirement
-   * succeeded, and a retirement that fails leaves the owner fatal.
+   * Every trigger reaches the one owner, so a switch and an unmount each
+   * withdraw the old runtime before anything else happens and retire it once;
+   * the next is published only after that retirement succeeded, and a
+   * retirement that fails leaves the owner fatal. Strict Mode's re-entry finds
+   * nothing selected — the page mounts with no selection — and opens nothing.
    */
   useEffect(() => {
     if (selected === null) return;
@@ -1289,18 +1290,15 @@ export function ProjectPage({
             {error}
           </p>
         )}
-        {/* Drawn only while the owner publishes a runtime, and keyed by that
-        runtime's own project: in the render that moves the selection the owner
-        still publishes the previous project's, until the effect below withdraws
-        it, so the table stays the previous project's until then. */}
+        {/* Drawn only while the owner publishes a runtime. In the render that
+        moves the selection the owner still publishes the previous project's,
+        until the page's effect withdraws it; from that withdrawal nothing is
+        drawn here until the next runtime is live, so every runtime is drawn in a
+        table of its own — its rows and transient editor state with it — and no
+        key is needed to say so. */}
         {projectState.status === 'live' && (
           <Profiler id="wbs-table" onRender={recordWbsScrollCommit}>
             <WbsTable
-              // Each project owns its rows and transient editor state. The owner
-              // usually publishes nothing between two projects' runtimes, which
-              // remounts the table by itself; the key is what keeps that true when
-              // the next runtime is drawn with no render in between.
-              key={projectState.services.projectId}
               project={projectState.services}
               // The name the export's header and filename carry. Read from the
               // list rather than held twice: a rename lands in `projects` and the
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index 8005b0ba9..18a9dfbb7 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -611,8 +611,9 @@ export function usePlanRead({
   const stepStack = useCallback(
     async (direction: 'undo' | 'redo') => {
       // The runtime this step was asked of, and not whoever is on screen when its
-      // answer arrives: a project this reader has left says nothing and lowers
-      // nothing in the one that replaced it.
+      // answer arrives. The toasts are the page's and outlive this table, so a
+      // project this reader has left must say nothing into them: the page would
+      // show it over the project that replaced it.
       const isCurrent = project.isCurrent;
       busyWrites.raise();
       try {
@@ -650,7 +651,9 @@ export function usePlanRead({
         }
         await refreshOrMarkStale();
       } finally {
-        if (isCurrent()) busyWrites.lower();
+        // Lowered whoever is reading now: this busy state is the runtime's own,
+        // so a project this reader has left lowers only a busy nobody draws.
+        busyWrites.lower();
       }
     },
     [busyWrites, commands, project, pushToast, refreshOrMarkStale],
```

### 7.6 `tasks.md` and the lifetime map — slice 2, the records

```diff
diff --git a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
index 87f9872b0..e679c9bf8 100644
--- a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
+++ b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
@@ -167,6 +167,8 @@ These are focused production-wiring tests. Each safety assertion needs its R5 mu

 Focused test homes supported by current boundaries are `main.test.tsx`/`index-bootstrap.test.ts` for application ownership, `app.test.tsx` and `app-router.test.tsx` for session identity/router behavior, `project-page.test.tsx` for selection and route ownership, `directory-page.test.tsx` for directory continuity, and `plan-read-and-write.test.tsx` plus module tests for feed/write/command stale-owner behavior. Do not replace the existing tests: they are the before/after behavioral oracle.

+Update, observed <observed-date-m> (050.7m, OpenSpec task 11): exact lifecycle tests 8 to 11 are met as follows. Test 8's switch, without the saved-plan watch, which is not yet the runtime's (task 10): `apps/wbs/fe-01/src/components/wbs/project-replacement.test.tsx` holds a left project's retirement open and finds no table drawn and the header handed nobody, then the next project in a new table and the old socket closed once — so the table needs, and has, no key. Test 9 through the router: `app.test.tsx` follows the directory link from an open project and back; the project is given back once, the session runtime is the same object throughout, and a new project runtime opens on return; a close that refuses there draws the fatal state in the region's place. Test 10: the project page mounts with nothing selected, so Strict Mode's re-entry into it opens nothing — opening from a render instead was rehearsed and still built one runtime per pick, the second request superseding the first before it was built — and its Strict Mode case proves one runtime per pick, each given back once; the re-entry that replaces ownership is the signed-in region's, whose first session request is left before it is built. Test 11: an undo answered after a switch, succeeding or refused, puts no toast into the page, whose toasts outlive the table; a late read, frame, reread and marker are the project runtime's model's. The writer's and the marker gestures' `isActiveReader` was removed rather than proved: the refresh owner's identity, `null` once the runtime is withdrawn, answers everything it did, and replacing it with `() => true` changed no outcome in any suite.
+
 ## Planning constraints and open implementation facts

 - Runtime identifiers are intentionally absent pending the user's grammar choice.
diff --git a/openspec/changes/adopt-frontend-lifetimes/tasks.md b/openspec/changes/adopt-frontend-lifetimes/tasks.md
index 9512b89c9..f9a3a55ce 100644
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -135,8 +135,21 @@
       project switch. This box stays unchecked for the one outcome still owed:
       saved plans, whose shelf keeps its own keyed watch and has no feature facade
       yet — the lifetime map's saved-plans prerequisite.
-- [ ] 11. Project switch, route unmount and Strict Mode re-entry each replace all
+- [x] 11. Project switch, route unmount and Strict Mode re-entry each replace all
       project ownership; a stale completion changes nothing.
+      Closed by 050-7-m, observed <observed-date-m>: a switch withdraws the old
+      runtime in the page's own effect, and the page draws no table and hands the
+      header nobody until the next is live, so every runtime is drawn in a table of
+      its own and the table carries no key; an undo answered in a project the reader
+      has left says nothing into the page's toasts, which outlive the table
+      (`components/wbs/project-replacement.test.tsx`). Following the directory link
+      gives the project back once through the page's cleanup and keeps the session;
+      a project that cannot be given back there is drawn as the fatal state in the
+      region's place; Strict Mode's re-entry into the region leaves the session it
+      first asked for, and into the page opens nothing, the page mounting with
+      nothing selected (`app.test.tsx`). The writer's and the marker gestures'
+      second reader predicate is gone: the refresh owner's identity, `null` from
+      the withdrawal on, answers everything it did.
 - [ ] 12. Each module has its own isolated type check and its graph check, and every
       module directory carries a validated wiki index and a `contract.ts`. The
       preferences module's public `preferences` resource — kept only for
```

## 8. Proofs

Every fault below was injected for real in the planner's rehearsal on 2026-09-25, on the rehearsal
commit of the slice that owns it: its named test watched failing, the file restored and compared, the
test rerun green, before the next fault. The executor repeats each one and writes the adjacent
`Proof:` comment **only after observing its own failure**, dated with its own observed date
(`date -u +%F`) — never copied from this document, never before the observation. Each slice runs **all**
of its faults first and writes its comments afterwards, so every fault patch below still applies.

**Where the comments may go.** Slice 1's go into `plan-writer.feature.ts` and
`calendar-markers.feature.ts`; slice 2's into `use-plan-read.ts`, `project-page.tsx` and `app.tsx`.
Three of slice 2's sites already carry another packet's comment block — `m1` and `r1` at the page's
`return () => {` (packet j's cleanup proof), `g1` at the gate's
`if (projectState.status === 'fatal' && projectState.terminal)` (packet k's `p1`), `n1` at
`void sessionOwner.open({ userId: session.user.id, credential: session.token });` (packet i's `g4`) —
and `c1`'s line carries a proof of 2026-09-21: write the new sentence as `//` lines **directly above the
named line, below the block already there**, so the two form one block. `m1` and `r1` share one patch
and one comment block, one sentence each. `t1`'s line is a JSX child, so its comment is a JSX comment,
`{/* Proof: … */}`, directly above `{projectState.status === 'live' && (`.

**Applying a fault patch** always uses `git apply --unidiff-zero`: every patch below is zero-context,
each hunk replacing whole lines it names, so a comment of unknown length above a line does not move the
patch off it.

**Each slice's faults are records of four lines** — id, file (from the repository root), suite (from
`apps/wbs/fe-01`) and the exact `-t` pattern — in the first `text` block of that slice's subsection.
Vitest's `-t` is a regular expression; no title below holds a metacharacter, and the typographic
apostrophes in some of them match themselves. Extract the records from this document rather than
retyping them:

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-m-project-replacement.md
section=8.1 # this slice's subsection: 8.1 for slice 1, 8.2 for slice 2
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

Expected: 12 lines for slice 1 and 32 for slice 2.

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

**Then every fault, in order** — save the passing bytes, inject, write the patch, run the named test,
restore, compare, and only then assert; then rerun it green:

```sh
set -euo pipefail
while IFS= read -r id && IFS= read -r file && IFS= read -r suite && IFS= read -r title; do
  test -f "$file"
  cp "$file" "$TMPDIR/$id.passing"
  git apply --unidiff-zero --check "$TMPDIR/mutations/$id.diff" < /dev/null
  git apply --unidiff-zero "$TMPDIR/mutations/$id.diff" < /dev/null
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

Expected: one line per fault with the `Tests …` line its table gives, and exit 0. The loop stops at the
first fault whose named test passes, **after** that file has been restored and compared — then
preamble rule 20 applies: re-read the table, redo that fault once by hand, and stop if it still
passes. Every command inside reads `/dev/null`, so nothing it runs can consume the records the loop is
reading. Extra failing tests are recorded, not a stop.

**The comment** names the injected fault and the observed failure, as `//` lines directly above the
line the table names (a JSX comment for `t1`), for example:

```ts
// Proof: on <observed date>, removing this return put `Undid: rename “Strip”` over the next project
// in `says nothing in the next project when an undo asked of the last one succeeds`.
```

### 8.1 Slice 1 — the identity checks that stay

The records for `$TMPDIR/proofs.txt`:

```text
w1
apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
src/components/wbs/plan-table.test.tsx
abandons queued adds when unmounted during their covering read
w2
apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
src/modules/plan-writer/plan-writer.test.ts
refuses a completed gesture whose feed owner was replaced under it
c1
apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts
src/modules/calendar-markers/calendar-markers.feature.test.ts
says nothing and rereads nothing once the reader has left the screen
```

Each exit 1:

| Id   | Fault                                                                                     | Suite › test                                                                                                | Observed                                                                                                                             | Comment above                                                                                |
| ---- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `w1` | the writer's check after its covering read removed: a reader that left meanwhile "landed" | `plan-table.test.tsx` › `abandons queued adds when unmounted during their covering read`                    | `1 failed \| 46 skipped (47)`; `expected [ …(2) ] to deeply equal [ [ 'p1', { parentId: null, …(2) } ] ]` — a second create was sent | the second `if (!isCurrent()) return 'refused';`, after `await rereadResources(completed);`  |
| `w2` | the writer's `isCurrent` without the identity: `owner !== null` alone                     | `plan-writer.test.ts` › `refuses a completed gesture whose feed owner was replaced under it`                | `1 failed \| 4 skipped (5)`; `expected 'landed' to be 'refused'`                                                                     | `const isCurrent = () => owner !== null && readRefreshOwner() === owner;` (below its JSDoc)  |
| `c1` | the marker gestures' `isCurrent` answering always yes                                     | `calendar-markers.feature.test.ts` › `says nothing and rereads nothing once the reader has left the screen` | `1 failed \| 6 skipped (7)`; `expected [ Error: marker_not_found ] to deeply equal []`                                               | `const isCurrent = (): boolean => readRefreshOwner() === owner;` (below the 2026-09-21 line) |

Also observed, not a stop: `w1` fails `plan-writer.test.ts` › `refuses a gesture whose reader left
during its covering read` too (`expected 'landed' to be 'refused'`); `w2` fails that suite's two new
reader-left cases too; `c1` fails the markers' two "another owner has taken its place" cases too.
`w1` is named on the table's suite because that is the production path: the fixture installs the real
runtime, whose `readRefreshOwner` answers `null` from the unmount on.

#### Proof w1 — the writer's check after its covering read removed

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
--- a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
@@ -124,2 +124,1 @@
-        // identity decides this outcome as it decided the one above.
-        if (!isCurrent()) return 'refused';
+        // identity decides this outcome as it decided the one above.
```

#### Proof w2 — the writer's gesture test without the owner's identity

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
--- a/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/plan-writer.feature.ts
@@ -67,1 +67,1 @@
-      const isCurrent = () => owner !== null && readRefreshOwner() === owner;
+      const isCurrent = () => owner !== null;
```

#### Proof c1 — the marker gestures' test answering always yes

```diff
diff --git a/apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts b/apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts
--- a/apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts
+++ b/apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts
@@ -33,1 +33,1 @@
-    const isCurrent = (): boolean => readRefreshOwner() === owner;
+    const isCurrent = (): boolean => true;
```

### 8.2 Slice 2 — the page, the router and Strict Mode

```text
s1
apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
src/components/wbs/project-replacement.test.tsx
says nothing in the next project when an undo asked of the last one succeeds
s2
apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
src/components/wbs/project-replacement.test.tsx
says nothing in the next project when an undo asked of the last one is refused
h1
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-replacement.test.tsx
draws no table and hands the header nobody while the last project lets go
t1
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-replacement.test.tsx
draws the next project in a table of its own
m1
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-replacement.test.tsx
opens one runtime per pick under Strict Mode, and gives each back once
r1
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/app.test.tsx
gives the project back once when its route goes, keeps the session, and opens a new runtime on return
g1
apps/wbs/fe-01/src/app.tsx
src/app.test.tsx
draws the fatal state in the region’s place when a route change cannot give the project back
n1
apps/wbs/fe-01/src/app.tsx
src/app.test.tsx
leaves the session Strict Mode first opened, and opens the project in the one it opens again
```

Each exit 1:

| Id   | Fault                                                                                | Suite › test                                                                                                             | Observed                                                                                                                                     | Comment above                                                                                              |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `s1` | the undo stack's check before a success removed                                      | `project-replacement.test.tsx` › `says nothing in the next project when an undo asked of the last one succeeds`          | `1 failed \| 4 skipped (5)`; `expected [ 'Undid: rename “Strip”' ] to deeply equal []`                                                       | the `if (!isCurrent()) return;` directly above `if (outcome.ok) {`                                         |
| `s2` | the undo stack's check before a refusal removed                                      | `project-replacement.test.tsx` › `says nothing in the next project when an undo asked of the last one is refused`        | `1 failed \| 4 skipped (5)`; `expected [ Array(1) ] to deeply equal []` — the refusal's sentence over `p2`                                   | the `if (!isCurrent()) return;` directly below `} catch (thrown: unknown) {`                               |
| `h1` | the header handed the last live runtime's presence through the gap                   | `project-replacement.test.tsx` › `draws no table and hands the header nobody while the last project lets go`             | `1 failed \| 4 skipped (5)`; `expected { users: [ 'kat', 'lee' ], …(1) } to deeply equal { users: [], connected: false }`                    | `const presenceStore =`                                                                                    |
| `t1` | the table drawn from the last live runtime through the gap                           | `project-replacement.test.tsx` › `draws the next project in a table of its own`                                          | `1 failed \| 4 skipped (5)`; `expected <table data-grid="true" …(2)>…(3)</table> not to be <table data-grid="true" …(2)>…(3)</table>`        | `{projectState.status === 'live' && (` — a JSX comment                                                     |
| `m1` | the page's effect cleanup gone (`return undefined`)                                  | `project-replacement.test.tsx` › `opens one runtime per pick under Strict Mode, and gives each back once`                | `1 failed \| 4 skipped (5)`; `expected 'live' to be 'empty'` — `p2` never given back when the page went                                      | `return () => {` in the owner effect (below packet j's block)                                              |
| `r1` | `m1`'s patch, through the router                                                     | `app.test.tsx` › `gives the project back once when its route goes, keeps the session, and opens a new runtime on return` | `1 failed \| 19 skipped (20)`; `expected [ 'session built', 'project p1 built' ] to include 'project p1 given back'`                         | the same block as `m1`                                                                                     |
| `g1` | the region's gate removed (packet k's `p1` patch)                                    | `app.test.tsx` › `draws the fatal state in the region’s place when a route change cannot give the project back`          | `1 failed \| 19 skipped (20)`; `Error: no fatal state yet`                                                                                   | `if (projectState.status === 'fatal' && projectState.terminal)` (below packet k's block)                   |
| `n1` | the region opening its session only once per mount, the classic Strict Mode shortcut | `app.test.tsx` › `leaves the session Strict Mode first opened, and opens the project in the one it opens again`          | `1 failed \| 19 skipped (20)`; `TestingLibraryElementError: Unable to find a label with the text of: Project` — the region stayed "Loading…" | `void sessionOwner.open({ userId: session.user.id, credential: session.token });` (below packet i's block) |

Also observed, not a stop: `t1` fails the gap case too (`expected <table data-grid="true" …(2)>…(3)</table>
to be null`); `m1` fails `project-page.test.tsx` › `closes the selected project’s stream once the page
goes` too (packet j's proof of the same line). `n1` passes every non-Strict-Mode case of the file:
without Strict Mode's second mount the one open is the only one. `m1` is **not** a Strict Mode fault —
none exists at the page (section 3.2) — and is named for the Strict Mode case because it is what that
case would catch.

#### Proof s1 — the undo stack's check before a success removed

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -631,2 +631,1 @@
-        if (!isCurrent()) return;
-        if (outcome.ok) {
+        if (outcome.ok) {
```

#### Proof s2 — the undo stack's check before a refusal removed

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -623,2 +623,1 @@
-        } catch (thrown: unknown) {
-          if (!isCurrent()) return;
+        } catch (thrown: unknown) {
```

#### Proof h1 — the header handed the last live runtime's presence through the gap

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -586,2 +586,3 @@
-  const presenceStore =
-    projectState.status === 'live' ? projectState.services.presence : NOBODY_HERE;
+  const lastPresence = useRef(NOBODY_HERE);
+  if (projectState.status === 'live') lastPresence.current = projectState.services.presence;
+  const presenceStore = lastPresence.current;
```

#### Proof t1 — the table drawn from the last live runtime through the gap

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -574,1 +574,3 @@
-  const projectState = useSyncExternalStore(projectOwner.subscribe, projectOwner.snapshot);
+  const projectState = useSyncExternalStore(projectOwner.subscribe, projectOwner.snapshot);
+  const drawn = useRef(projectState.status === 'live' ? projectState.services : null);
+  if (projectState.status === 'live') drawn.current = projectState.services;
@@ -1299,1 +1301,1 @@
-        {projectState.status === 'live' && (
+        {drawn.current !== null && (
@@ -1302,1 +1304,1 @@
-              project={projectState.services}
+              project={drawn.current}
```

#### Proof m1 — the page's effect cleanup gone

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -604,4 +604,2 @@
-    return () => {
-      void projectOwner.leave();
-    };
-  }, [projectOwner, projectServices, selected, subscribe]);
+    return undefined;
+  }, [projectOwner, projectServices, selected, subscribe]);
```

#### Proof r1 — the page's effect cleanup gone, through the router

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -604,4 +604,2 @@
-    return () => {
-      void projectOwner.leave();
-    };
-  }, [projectOwner, projectServices, selected, subscribe]);
+    return undefined;
+  }, [projectOwner, projectServices, selected, subscribe]);
```

#### Proof g1 — the region's gate removed

```diff
diff --git a/apps/wbs/fe-01/src/app.tsx b/apps/wbs/fe-01/src/app.tsx
--- a/apps/wbs/fe-01/src/app.tsx
+++ b/apps/wbs/fe-01/src/app.tsx
@@ -297,3 +297,1 @@
-  if (projectState.status === 'fatal' && projectState.terminal)
-    return <LifetimeFault fault={projectState.fault} />;
-  return children;
+  return children;
```

#### Proof n1 — the region opening its session only once per mount

```diff
diff --git a/apps/wbs/fe-01/src/app.tsx b/apps/wbs/fe-01/src/app.tsx
--- a/apps/wbs/fe-01/src/app.tsx
+++ b/apps/wbs/fe-01/src/app.tsx
@@ -1,1 +1,1 @@
-import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
+import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
@@ -200,1 +200,2 @@
-  const [sessionOwner] = useState(openOwner);
+  const [sessionOwner] = useState(openOwner);
+  const opened = useRef(false);
@@ -203,1 +204,2 @@
-    void sessionOwner.open({ userId: session.user.id, credential: session.token });
+    if (!opened.current) void sessionOwner.open({ userId: session.user.id, credential: session.token });
+    opened.current = true;
```

## 9. Verification

### 9.1 Every fenced diff applies, extracted from this document, in slice order

The requirement is not "these diffs were once correct" but "these diffs, as this committed document
spells them, apply in slice order, produce exactly the rehearsal's final tree, and every fault patch
applies to the tree its slice leaves" — on the authoring base, on that base with the other packets'
executor output simulated, **and on the real dispatch base**. The script has three modes:

- `fill=0` — the authoring base; the result must be byte-identical to the rehearsal's final commit.
- `fill=1` — the authoring base with a two-line `// Proof:` comment inserted above each of packet i's
  and packet k's six comment sites in `app.tsx` (`g2`, `g3`, `g4`, `a1`, `a2`, `p1`), their
  `<observed-date-i>` and `<observed-date-k>` notes dated, and packet l's rehearsed edits simulated as far
  as they can be named: a requirement appended to `spec.md`, task 3 ticked and notes added after tasks 12
  and 13 in `tasks.md`, a dated paragraph after packet h's in the lifetime map.
- `fill=real` — the base named by `REAL_BASE`: planning after packets i, k and l, plus this plan branch's
  commits cherry-picked (section 6, Dispatch). Nothing is filled. The result must change exactly the
  seventeen owned paths; the five test files must equal the rehearsal's final bytes; the nine production
  files must equal them once every `//` comment and every blank line are stripped and every run of
  whitespace is squeezed to one space, on both sides — whitespace added where there was none, or
  removed, fails the mode, inside a string literal too; a run's length does not; and the three records,
  which packet l also edits, must carry exactly this packet's delta — the lines its diffs add and remove,
  every `observed` date normalised — and nothing else of this packet's. **This mode's output is the
  dispatch evidence**: the planner runs it with `REAL_BASE=<the reviewed base SHA>` before the first
  dispatch and records it beside the review. Unset, the mode prints that it was skipped and proves
  nothing. A failing `fill=real` after packet l's review is a re-rehearsal of the affected slice, never a
  waiver.

No script, no Prettier and no `node_modules` are needed: every change is a diff.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-m-project-replacement.md
base=59cfe22a42c5471fa1f3aa714a722faabce9e8d5
final=7b753cf54f2d2e7f60557b5c9a5502c815f08995
real_base=${REAL_BASE:-}
test -f "$packet"
# Inserts a two-line comment above the Nth line (default 1) whose trimmed text is exactly $2.
fill_above() {
  file=$1
  anchor=$2
  nth=${3:-1}
  test -f "$file"
  test "$(awk -v a="$anchor" '{ t = $0; sub(/^ +/, "", t) } t == a { n++ } END { print n + 0 }' "$file")" -ge "$nth"
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
# Inserts the given lines after the one line whose text is exactly $2.
insert_after() {
  file=$1
  anchor=$2
  shift 2
  test -f "$file"
  test "$(awk -v a="$anchor" '$0 == a { n++ } END { print n + 0 }' "$file")" -eq 1
  printf '%s\n' "$@" > "$file.lines"
  awk -v a="$anchor" -v lines="$file.lines" '
    { print }
    $0 == a { while ((getline l < lines) > 0) print l }
  ' "$file" > "$file.filled"
  mv "$file.filled" "$file"
}
# Checks every fault patch named on the command line against the tree.
check_faults() {
  for id in "$@"; do git -C "$work/tree" apply --unidiff-zero --check "$work/mutations/$id.diff"; done
}
# A file with every // comment and blank line removed and whitespace squeezed: equal code, whatever the comments.
code_of() { sed -e 's#[[:space:]]*//.*$##' -e '/^[[:space:]]*$/d' "$1" | tr -s '[:space:]' ' '; }
# A note with every "observed <date>" normalised, placeholder or date.
dates_of() { sed -E 's/observed (<observed-date-[a-z]+>|[0-9]{4}-[0-9]{2}-[0-9]{2})/observed D/g' "$1"; }
# The lines a change removes and adds, in order, dates normalised: the change, whatever surrounds it.
delta_of() {
  dates_of "$1" > "$work/delta.a"
  dates_of "$2" > "$work/delta.b"
  if diff -U0 "$work/delta.a" "$work/delta.b" > "$work/delta.d"; then :; else test $? -eq 1; fi
  sed -n -e '/^---/d' -e '/^+++/d' -e '/^[-+]/p' "$work/delta.d"
}
for fill in 0 1 real; do
  from=$base
  if [ "$fill" = real ]; then
    if [ -z "$real_base" ]; then echo "fill=real skipped: REAL_BASE unset, not dispatch evidence"; continue; fi
    from=$real_base
  fi
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
  test "$count" -eq 6
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
  test "$count" -eq 11
  git archive "$from" | tar -x -C "$work/tree"
  fe="$work/tree/apps/wbs/fe-01"
  if [ "$fill" = 1 ]; then
    app="$fe/src/app.tsx"
    for anchor in "if (sessionState.status === 'fatal') return <LifetimeFault fault={sessionState.fault} />;" \
      "void sessionOwner.leave();" \
      "void sessionOwner.open({ userId: session.user.id, credential: session.token });" \
      "account={<ThemedAccountMenu username={session.user.username} onSignOut={signOut} />}" \
      "if (exit === 'signed-out') onSignedOut();" \
      "if (projectState.status === 'fatal' && projectState.terminal)"; do
      fill_above "$app" "$anchor"
    done
    test "$(grep -c 'Proof: simulated' "$app")" -eq 6
    tasks="$work/tree/openspec/changes/adopt-frontend-lifetimes/tasks.md"
    map="$work/tree/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md"
    spec="$work/tree/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md"
    for note in "$tasks" "$map"; do
      test "$(grep -c '<observed-date-[ik]>' "$note")" -eq 2
      sed -i -E 's/<observed-date-[ik]>/2026-09-25/' "$note"
    done
    # Packet l, as its rehearsal edits these three records.
    sed -i 's/^- \[ \] 3\. The page/- [x] 3. The page/' "$tasks"
    test "$(grep -c '^- \[x\] 3\. The page' "$tasks")" -eq 1
    insert_after "$tasks" "      trusted pilot mappings are preserved untouched." \
      "      Moved by 050-7-l, observed 2026-09-25: simulated, standing where packet l's" \
      "      note on task 12 goes."
    insert_after "$tasks" "      bag, credential, broad client, repository or resource in delivery." \
      "      Moved by 050-7-l, observed 2026-09-25: simulated, standing where packet l's" \
      "      note on task 13 goes."
    printf '%s\n' '' '### Requirement: Simulated, standing where packet l appends its own' '' \
      'fe-01 SHALL be simulated.' '' '#### Scenario: Simulated' '' '- **WHEN** simulated' \
      '- **THEN** simulated' >> "$spec"
    h_update=$(grep '^Update, observed 2026-09-24 (050.7h, OpenSpec task 9)' "$map")
    insert_after "$map" "$h_update" "" \
      "Update, observed 2026-09-25 (050.7l, OpenSpec tasks 12 and 13): simulated, standing where packet l's goes."
    echo "fill=1 filled-sites=6, packets i and k dated, packet l's three records simulated"
  fi
  git -C "$work/tree" init -q
  git -C "$work/tree" add -A
  git -C "$work/tree" -c user.email=x@example.invalid -c user.name=x commit -qm base
  # --check and apply are SEPARATE commands: joined with && under set -e, a failed
  # check does not stop the shell and a later iteration can still reach the end.
  for n in 01 02; do
    git -C "$work/tree" apply --check "$work/patches/$n.diff"
    git -C "$work/tree" apply "$work/patches/$n.diff"
  done
  check_faults w1 w2 c1
  echo "fill=$fill slice 1 applied, its 3 fault patches check"
  for n in 03 04 05 06; do
    git -C "$work/tree" apply --check "$work/patches/$n.diff"
    git -C "$work/tree" apply "$work/patches/$n.diff"
  done
  check_faults s1 s2 h1 t1 m1 r1 g1 n1
  echo "fill=$fill slice 2 applied, its 8 fault patches check"
  git -C "$work/tree" status --porcelain --untracked-files=all | wc -l
  mkdir "$work/final"
  git archive "$final" | tar -x -C "$work/final"
  if [ "$fill" = 0 ]; then
    diff -r --exclude=.git "$work/tree" "$work/final"
    echo "fill=0 tree identical to $final"
  elif [ "$fill" = 1 ]; then
    echo "fill=1 simulated comments left: $(grep -c 'Proof: simulated' "$fe/src/app.tsx")"
  else
    git -C "$work/tree" status --porcelain --untracked-files=all | cut -c4- | sort > "$work/changed.txt"
    m=apps/wbs/fe-01/src/modules
    tests="$m/calendar-markers/calendar-markers.feature.test.ts $m/plan-writer/plan-writer.test.ts
      $m/project/composition.test.ts apps/wbs/fe-01/src/app.test.tsx
      apps/wbs/fe-01/src/components/wbs/project-replacement.test.tsx"
    code="$m/calendar-markers/contract.ts $m/calendar-markers/calendar-markers.feature.ts
      $m/plan-writer/contract.ts $m/plan-writer/plan-writer.feature.ts $m/plan-writer/busy-store.ts
      apps/wbs/fe-01/src/runtime/project-runtime.ts apps/wbs/fe-01/src/app.tsx
      apps/wbs/fe-01/src/components/wbs/project-page.tsx apps/wbs/fe-01/src/components/wbs/use-plan-read.ts"
    records="openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
      openspec/changes/adopt-frontend-lifetimes/tasks.md
      docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md"
    # shellcheck disable=SC2086 # three fixed lists of paths without spaces
    printf '%s\n' $tests $code $records | sort > "$work/owned.txt"
    test "$(wc -l < "$work/owned.txt")" -eq 17
    diff "$work/owned.txt" "$work/changed.txt"
    echo "fill=real changed exactly the seventeen owned paths"
    for f in $tests; do cmp "$work/tree/$f" "$work/final/$f"; done
    echo "fill=real five test files equal the rehearsal's"
    for f in $code; do test "$(code_of "$work/tree/$f")" = "$(code_of "$work/final/$f")"; done
    echo "fill=real nine production files equal the rehearsal's but for comments"
    for f in $records; do
      git show "$base:$f" > "$work/authored.md"
      git show "$real_base:$f" > "$work/real.md"
      mine=$(delta_of "$work/authored.md" "$work/final/$f")
      landed=$(delta_of "$work/real.md" "$work/tree/$f")
      test -n "$mine"
      test "$landed" = "$mine"
    done
    echo "fill=real three records carry exactly this packet's delta"
  fi
done
````

Observed on 2026-09-25, after the final Prettier `--check` of this document, with the packet read from
this working tree and `REAL_BASE=647e2e003` — **a proxy**, packet l's rehearsal tip (`ff4c6f6d3`,
`0c6819634`, `647e2e003` on the authoring base, branch `rehearse/050-7-l`), the only one of the three
lanes this packet waits for whose edits to the shared records exist yet. It proves the l overlap
against packet l's own words; packets i's and k's real lanes are proved only by `fill=1`'s simulation
until the planner reruns the mode on the reviewed planning base:

```text
fill=0 extracted=6
fill=0 fault-patches=11
fill=0 slice 1 applied, its 3 fault patches check
fill=0 slice 2 applied, its 8 fault patches check
17
fill=0 tree identical to 7b753cf54f2d2e7f60557b5c9a5502c815f08995
fill=1 extracted=6
fill=1 fault-patches=11
fill=1 filled-sites=6, packets i and k dated, packet l's three records simulated
fill=1 slice 1 applied, its 3 fault patches check
fill=1 slice 2 applied, its 8 fault patches check
17
fill=1 simulated comments left: 6
fill=real extracted=6
fill=real fault-patches=11
fill=real slice 1 applied, its 3 fault patches check
fill=real slice 2 applied, its 8 fault patches check
17
fill=real changed exactly the seventeen owned paths
fill=real five test files equal the rehearsal's
fill=real nine production files equal the rehearsal's but for comments
fill=real three records carry exactly this packet's delta
```

`git apply --check` prints nothing on success, which is why the script's own `echo` lines are the
evidence and why every count is asserted rather than printed. The number printed after slice 2 is the
paths changed against the base: seventeen — every owned path of the two slices but `verify.md`, which
the executor writes. The `fill=0` tree is byte-identical to the rehearsal's final commit (`diff -r`
printed nothing), which holds the two `<observed-date-m>` placeholders slice 2 step 4 replaces. Prettier
strips the single space of a blank context line inside the fenced diffs; `git apply` reads such a line
as the blank context line it was, which `fill=0`'s identity proves.

**A failed check stops the run**: the same script with `REAL_BASE` set to this packet's own slice-1
rehearsal commit, a base the diffs cannot fit, exited 1 at the first `git apply --check` (`error: patch
failed: apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts:44`).

**Beyond the script, on the same proxy**: the six diffs applied to a detached checkout of `647e2e003`
gave `wbs-fe-01:typecheck` exit 0 — which there runs packet l's `typecheck:module`, compiling
`calendar-markers` and `plan-writer` alone — `wbs-fe-01:lint` exit 0, packet l's
`src/delivery-boundaries.test.ts` 1·1 passing (no route added to or gone from its list of routes owed),
the strict OpenSpec block 114 · 114 · 0 with packet l's requirement beside this one, the sandbox suite
57·714, and the session set, the new page file, the module set and the runtime pair 11·109.

Every **intermediate** tree typechecks: `wbs-fe-01:typecheck` exit 0 on both rehearsal commits, each
committed with the hooks on. Exactly two trees do not: the red checkpoints, each the previous slice's
commit plus that slice's test side (section 6 gives each one's diagnostics).

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
Rehearsed on the base and after slice 2's contract step: `{"items":114,"passed":114,"failed":0}`.

### 9.3 Commands actually run, and what each reported

All on 2026-09-24 and 2026-09-25, by this packet's author, on the throwaway branch `rehearse/050-7-m`
cut at the authoring base `59cfe22a`, each slice committed **with the hooks on** (lefthook's wiki,
secrets, format and lint checks passed for both): `ae5a1585` (slice 1) and `7b753cf5` (slice 2). Each
red was rebuilt from the previous slice's commit plus that slice's test side only; each fault was
injected into the final tree, whose slice-1 files are slice 1's.

| Check                                  | Base `59cfe22a`                               | Slice 1                                       | Slice 2                                              |
| -------------------------------------- | --------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| sandbox node suite (files·tests)       | 57·713                                        | 57·714                                        | 57·714                                               |
| module set, serial                     | 7·30                                          | 7·31                                          | —                                                    |
| session set, serial                    | 3·70                                          | —                                             | 3·73, and the new page file 1·5 (run together: 4·78) |
| adopted set, serial                    | 20·1219                                       | 20·1219 (one load timeout, rerun alone: 1·23) | 20·1219                                              |
| zoned (Auckland)                       | 2·3                                           | —                                             | 2·3                                                  |
| deletion evidence (`s1-u12`)           | 23·1244, both wirings `() => true`, all green | —                                             | —                                                    |
| red typecheck                          | —                                             | exit 1, 5 errors in 3 files, all TS2741       | exit 1, 1 error, TS2322 at `app.test.tsx:744`        |
| red Vitest                             | —                                             | `9 failed \| 7 passed (16)`                   | `3 failed \| 22 passed (25)`                         |
| typecheck and lint on the slice's tree | 0                                             | 0, 0                                          | 0, 0; `nx format:check --all` 0                      |
| faults observed failing, file restored | —                                             | 3 of 3                                        | 8 of 8                                               |
| strict OpenSpec                        | 114 · 114 · 0                                 | 114 · 114 · 0                                 | 114 · 114 · 0                                        |

Every proof filter matched exactly one test. The eleven faults were run twice — once by hand while the
cases were written and once by section 8's own loop over the records extracted from this document, on
the final commit — with the same observed lines; each restore was `cmp`-identical and each green rerun
passed.

**What was tried and found unprovable, and why** (section 3.2): the two `isActiveReader` wirings
replaced by `() => true` left every production-path suite green (`s1-u12`), so the predicate was
deleted rather than given a negative nothing could make fail; the table's key removed left `draws the
next project in a table of its own` passing, so it was deleted; the undo stack's busy guard removed
left the adopted set and the page cases green, so it was deleted; opening the project from a memo in
render — the lifetime map's own Strict Mode mutation — under Strict Mode still built one runtime per
pick, `[p1, p2]`, because the second request superseded the first before it was built, so the page's
Strict Mode case has no Strict-Mode-specific fault and says so. A first draft of the region's Strict
Mode case expected `session built, session given back, session built`; it observed one `session
built`: the first request is overtaken by Strict Mode's leave before the slot builds it. The case now
records the leave and asserts the one build.

**Also observed**: `m1` fails `project-page.test.tsx` › `closes the selected project’s stream once the
page goes` too (`Tests 1 failed | 75 skipped (76)`), packet j's proof of the same line.

### 9.4 Planner-only, with the expected relative delta

The sandbox cannot run these: three tests in two files spawn `bun` from Node, there is no browser, a
build writes outside the attempt's lane, and devsync writes Git objects.

| Check                                                                                                                                                                                            | Expected, relative to the base                                                                                                | Planner's own rehearsal                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit`                                                                                                    | slice 1 **+ 1 test**; slice 2 unchanged                                                                                       | **Not run.** Pending planner verification.                   |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test`                                                                                                         | UTC: slice 1 **+ 1 test**, slice 2 **+ 1 file, + 8 tests**. Auckland zoned unchanged                                          | **Not run.** Pending planner verification.                   |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                                                                                                                    | exit 0 after each slice                                                                                                       | **Not run.** Pending planner verification.                   |
| `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, with the slice committed or staged                                                                   | unchanged; no project target, no module file, no pre-namespacing path in any owned document                                   | run by `planner-commit.sh` on this packet's own commit only  |
| `CI=1 E2E_PORT_SHIFT=<a multiple of 300 clear of every live run, checked with ss -ltn> NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run wbs-fe-01:e2e -- <spec>` | exit 0, unchanged, after slice 2 — every spec that picks a project, switches projects or follows the Directory and Plan links | **Pending planner verification.** Not run in this rehearsal. |
| the same target **unfiltered**, on its own shift, on the final integration commit                                                                                                                | exit 0. The batch README's "Integration verification" requires the whole frontend browser suite once a frontend change lands  | **Pending planner verification.** Not run, not waived.       |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                       | exit 0 on the shared build host                                                                                               | **Not run**; reported as pending, never as passed.           |

`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` is not decoration: `CLAUDECODE=1` changes Bun's test
output and fails thirteen unrelated tests in this repository.

### 9.5 What none of this proves

- No browser ran. The Chromium switch, the Directory link and the return, and Strict Mode's development
  double mount in a real page are the planner's and are pending, not waived.
- That React always renders the gap between two runtimes is **observed**, not proved from React's
  contract: the key's deletion rests on it (section 3.2), and `t1`'s two cases are what fail if the page
  ever draws a runtime it no longer publishes.
- The page's Strict Mode case is an oracle: no Strict-Mode-only fault exists at the page, and `m1` would
  fail without Strict Mode too. The Strict Mode fault with teeth is the region's (`n1`).
- Page hide's own session retirement stays unobserved (section 12).
- The authoring base carries packets i's and k's **rehearsed** diffs and none of packet l's; section 9.1's
  `fill=real` on the real base is what proves the rest — rehearsed here against packet l's rehearsal tip
  only (section 9.3), and rerun by the planner on the reviewed planning base.

## 10. Stop conditions

Each is false on the rehearsal tree, checked on 2026-09-25.

1. Step 0a's status is not empty, or `base` differs from the slice note's SHA. Stop: the clone is not
   the tree this packet was reviewed against.
2. Step 0b extracts other than 6 patches or other than 11 fault patches. Stop: this document is not the
   one reviewed.
3. A patch fails `git apply --check`. Stop and report the exact error; never hand-edit a file into
   shape.
4. A baseline (step 0c) exits non-zero. Stop, except for the known cases in 11.
5. Slice 1's deletion evidence (`s1-u12`) shows a failing test other than condition 11's. Stop: the
   predicate is reachable and must not be deleted.
6. A red checkpoint shows **no** failure, or different diagnostics than section 6 names. Either means
   the tests did not land as written.
7. A green run differs from its step-0 number by anything but the slice's own additions, or the adopted
   set's count moves. Stop.
8. A proof filter matches zero tests, or more than one. Stop.
9. A fault leaves its named test passing. Restore, re-read the table, redo once; if it still passes,
   stop — the check may not be where this packet says it is.
10. The strict OpenSpec block exits non-zero, or `passed` falls below step 0's number.
11. **Known, not this packet's:** a single `Test timed out in 5000ms` in one file of a serial run on a
    loaded host (rehearsed once: `plan-chart-seam.test.tsx` › `is pointed by a bar’s focus, and the
pointer outranks it`); or a `DiBagCloseCancelledError` (`DI_BAG_CLOSE_TIMEOUT`) from a fixture's own
    `afterEach` retirement. Record it, rerun **that file alone once**, and stop only if it fails again.
12. At hand-over, the status shows any path outside the slice's own list. Stop.
13. Anything asks for a `git` state change in the clone, a network call, a browser, or `--no-verify`.

## 11. Out of lane

- `runtime/lifetime-slot.ts`, `runtime/session-runtime.ts`, `runtime/application-*`: read only.
- `modules/plan-feed/*` — the feed's own `isActiveReader` stays; it is packet j's `m2` and is not
  redundant (the feed has no refresh-owner comparison to lean on).
- Every module `README.md` and `tsconfig.json`, `project.json`, `docs/wiki-policy/*`,
  `docs/code-organization/*`, `src/delivery-boundaries.test.ts`: packet l's.
- `app-router.tsx`, `components/chrome/*`, `lib/*`, `main.tsx`, `testing/*`, every suite not named in
  section 5, the Vitest configs, `bun.lock`, `package.json`: no dependency is added, removed or bumped.

## 12. Hand-over to the next packet

After this packet 050.7 owes, and no task of it is this packet's:

- **Task 10's last outcome — saved plans.** Packet j's hand-over stands: a feature facade over the
  shelf's list, save, compare and watch, registered in `installProjectRuntime` beside the feed, with
  its watch given back by the runtime's close. Lifetime-map test 8's saved-plan half goes with it.
- **Tasks 12's and 13's remainders**, as packet l's notes name them (the six unsealed modules' graph
  checks; the routes still owed to the catalog facade and the shelf).
- **Task 3** is packet l's to close (the preferences module's wiki index).
- **Page hide's own session retirement — named residual, no open task owns it; recorded for the
  planner to assign as an application-lifetime change.** On `pagehide` the bootstrap's
  `invalidateRoot()` unmounts the tree, `SignedInApp`'s cleanup starts `sessionOwner.leave()`, and the
  application slot's `retire()` starts beside it without waiting; on a persisted `pagehide` a
  restoration can rebuild while the old session's project is still closing, and a session retirement
  that fails there is seen by nobody. The shape it needs: a narrow application-owned port a signed-in
  region reaches through the application's context (not a bag: rule K2), into which the region's
  unmount hands its `leave()` settlement; the application runtime's disposal awaits every settlement
  handed to it under its own budget and fails — terminally, drawn as the fatal page on restoration —
  when one failed; `startRetirement` is unchanged because the unmount happens first. It needs its own
  OpenSpec delta (it changes "A restored page rebuilds only after retirement succeeds") and, being a new
  interleaving of three retirements and a `pageshow`, a model extension of
  `application-bootstrap.model.test.tsx` (addendum point 16).
- **The lifetime map's single non-React lifecycle-failure reporter** stays unbuilt (packet k's amended
  tests 12 and 13).

## 13. Assumptions recorded rather than asked

1. **Delete, not prove, a check nothing can fail** (section 3.2): rule R5's own words, and the brief's.
   Each deletion carries its rehearsed evidence — the production-path suites green with the check
   neutralised — and the checks that stay beside it are re-proved.
2. **Page hide stays out** (section 3.4): task 11's sentence does not name it, and closing it is an
   application-lifetime change with its own model.
3. **The page's Strict Mode case is an oracle** (section 3.2): the brief asks that Strict Mode re-entry
   be _exercised_ at both owners, and it is; at the page, no fault specific to Strict Mode exists, and
   the packet says so instead of inventing one.
4. **`SignedInApp` takes a `projectApi` test seam**, the bargain packet i made with `openOwner`:
   production passes nothing.
5. **Packet k's direct-leave example stays** beside its route-driven twin, because packet k's `p1`
   proof names it.
6. **The writer lowers busy unconditionally** once its predicate is gone: its busy is its runtime's own.
   The alternative — lower only while the owner's identity holds — would be the same decorative check in
   another spelling.
7. **Serial runs for the multi-file suites**, as the project's own `test` target runs them.

## 14. The brief, point by point

### 14.1 The non-negotiables of the commissioning brief

| Requirement                                                                                                                                                                                                             | Where this packet meets it                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| task 11 plus every residual handed to it (h's four guards; j's four carried guards and Strict Mode; i's page hide, the renewal note, `createProjectOwner`'s JSDoc; k's route-driven tests and the direct-leave example) | section 3.1's fourteen rows, each proved, deleted or left with an owner                                                                                           |
| teeth: every guard a production-path negative with a `Proof:` comment, or deleted as unreachable with the reason                                                                                                        | eleven faults (section 8); three deletions with their evidence (section 3.2, slice 1 step 2, section 9.3)                                                         |
| Strict Mode re-entry exercised by a real `<StrictMode>` test at the project and the session owners                                                                                                                      | `opens one runtime per pick under Strict Mode, …` (the project page) and `leaves the session Strict Mode first opened, …` (the region)                            |
| route unmount driven through the router, not a direct call                                                                                                                                                              | the Directory and Plan links in `app.test.tsx` (`r1`, `g1`)                                                                                                       |
| a model-based test only for new concurrency logic                                                                                                                                                                       | none added: no concurrency logic changes (section 1, 3.4)                                                                                                         |
| no `any`, unchecked cast or `!` outside tests; module-identifier grammar; no product names; Twilight Burokrat spelling; never `--no-verify`; no pin change                                                              | none in the diffs; no module identifier added; no product name; both rehearsal commits through lefthook                                                           |
| tick task 11 only if every sentence is met; name what stays open                                                                                                                                                        | section 3.5; ticked in slice 2 with a dated note; section 12                                                                                                      |
| rehearsal on `rehearse/050-7-m`, one commit per slice, hooks on; every red observed; every fault run, diagnostic recorded, restored, `cmp`                                                                              | section 9.3                                                                                                                                                       |
| exact planner commit subjects and `owned.txt` per slice; relative counts; planner-only list                                                                                                                             | section 6 each slice's step 9 and subject; sections 4.2, 9.3, 9.4                                                                                                 |
| the three-mode section 9.1 script, with packet k's hardened `code_of`                                                                                                                                                   | section 9.1: `fill=0`, `fill=1` (i's and k's six sites, their notes, l's three records simulated), `fill=real` (tests `cmp`, code by `code_of`, records by delta) |
| stay out of packet l's files, and say which hunks meet them                                                                                                                                                             | section 5, "Which hunks meet other packets' files"                                                                                                                |
| no absolute path outside the Dispatch block; `--driver claude` and `--require-ancestor <l slice-N planner commit>` on every dispatch line                                                                               | section 6 Dispatch (`<LN>`)                                                                                                                                       |

### 14.2 The batch-6 addendum's twenty points

| Point                       | Assessment                                                                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reproduced red           | Met: slice 1's compiler and runtime reds, slice 2's for the seam, each rebuilt from the previous slice plus its test side, diagnostics pasted; the five page oracles' reds are their faults, each observed on the unchanged guard's removal. |
| 2. Typecheck and lint       | Met: both native per slice, exit 0 on each rehearsed commit, both committed with lefthook on (section 9.3).                                                                                                                                  |
| 3. Path counts              | Met: each hand-over lists the slice's exact paths (10, 9); the planner's own commit adds only this document.                                                                                                                                 |
| 4. Failure-visible commands | Met: every check records its own status and `expect-status.sh` asserts it.                                                                                                                                                                   |
| 5. HEAD-reading tests       | N/A: no project, target or CI path is renamed.                                                                                                                                                                                               |
| 6. Sandbox constraints      | Met: whole targets, build, devsync and Chromium are the planner's, with expected deltas (section 9.4).                                                                                                                                       |
| 7. Known race               | Met: named, one rerun, no repair authority (section 10.11).                                                                                                                                                                                  |
| 8. Names                    | Met: no product name in an identifier; no module identifier added.                                                                                                                                                                           |
| 9. Packet form and evidence | Met: two slices, each ending in a planner commit with its exact subject; relative baselines; production-path negatives with observed messages; the unprovable named, not skipped.                                                            |
| 10. Pins                    | Met: no pin touched.                                                                                                                                                                                                                         |
| 11. Pipeline exit handling  | Met: every `\|\| test $? -eq 1` follows one command; `delta_of` writes its `diff` before reading it.                                                                                                                                         |
| 12. Planner chaining        | Met: the extraction stops at the first failed check (section 9.1).                                                                                                                                                                           |
| 13. Module index            | N/A with reason: no file is added to a module directory; the new suite is under `components/wbs`.                                                                                                                                            |
| 14. Bun directory filters   | N/A: every suite runs through Vitest from `apps/wbs/fe-01`.                                                                                                                                                                                  |
| 15. Interleaving property   | N/A with reason: no owner, queue or retirement logic is written or changed; the owners' existing properties stand (section 3.4).                                                                                                             |
| 16. Model-based remedy      | N/A: no review round has found a race here; page hide, which would need one, is handed on with that requirement (section 12).                                                                                                                |
| 17. Seeded evidence         | N/A: no slice reads an earlier attempt's evidence.                                                                                                                                                                                           |
| 18. Symbol-based checks     | N/A: no code-shape checker is introduced.                                                                                                                                                                                                    |
| 19. Missing-file grep       | Met: every grep over a file follows a `test -f` or reads captured output.                                                                                                                                                                    |
| 20. Honest limits           | Met: sections 3.5 and 9.5 — the observed-not-proved gap render, the page's oracle, page hide, the proxy real base.                                                                                                                           |

## 15. Ready to commit

| Slice | Paths                                                                                                                                                                                                                                                                                                                                                                               | Subject                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1     | `verify.md`, `apps/wbs/fe-01/src/modules/calendar-markers/{contract.ts,calendar-markers.feature.ts,calendar-markers.feature.test.ts}`, `apps/wbs/fe-01/src/modules/plan-writer/{contract.ts,plan-writer.feature.ts,plan-writer.test.ts,busy-store.ts}`, `apps/wbs/fe-01/src/modules/project/composition.test.ts`, `apps/wbs/fe-01/src/runtime/project-runtime.ts` — **10 modified** | `refactor(frontend): drop the reader predicate the refresh owner's identity already answers`                   |
| 2     | `spec.md`, `verify.md`, `tasks.md`, `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, `apps/wbs/fe-01/src/{app.tsx,app.test.tsx}`, `apps/wbs/fe-01/src/components/wbs/{project-page.tsx,use-plan-read.ts}` — **8 modified**; `apps/wbs/fe-01/src/components/wbs/project-replacement.test.tsx` — **1 new**                                                 | `refactor(frontend): give a project back whole on a switch, a route change and Strict Mode, and close task 11` |

(`spec.md`, `verify.md` and `tasks.md` are under `openspec/changes/adopt-frontend-lifetimes/`.) After
the last commit the host gate runs on the shared build host with the committed hash, and its printed
running-hash line and exit status are recorded. Anywhere else it is reported as not run, with the
reason — never as passed. The Chromium runs of section 9.4 are reported the same way until they have
happened.
