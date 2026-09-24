# 050.7 i — the session runtime: one owner, keyed by user, for the directory and the project

|             |                                                                                                                                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **fourteenth packet**                                                                                                                               |
| Size class  | M — three slices, each one executor attempt                                                                                                                                                                                                    |
| Predecessor | 050.7j (`050-7-j-project-runtime.md`, beside this packet once it lands) — `createProjectOwner`, `installProjectRuntime` and `ProjectRuntime`, and its section 12, "Hand-over to the next packet"                                               |
| Advances    | OpenSpec task **6** of `adopt-frontend-lifetimes` — **ticked** in slice 3, every sentence met (section 3.8). Designed for task **7** (Log out, packet k): the session's retirement already retires its project first and fails when it cannot. |
| Revision    | Second: the round-1 review applied — two model commands (a sign-in from inside the owner's notification, an unbuildable sign-in), refusals classified by identity, the nested retirement budgets named, and a router identity probe.           |
| Schema      | OpenSpec change `adopt-frontend-lifetimes`, already `sdd-lean`. One new requirement with three scenarios, one per slice, inserted before "Log out stays a local exit"; task 6 ticked with a dated note.                                        |

## 1. Goal, non-goals, and the cut

**Goal.** The signed-in identity's services are **one DI Bag session runtime**, built outside React and
owned by **one session owner keyed by the user id**, which a new component, `SignedInApp` in
`app.tsx`, holds above the router. The runtime installs the **directory-management module** — now a
sealed, labelled DI Bag module whose `directory` resource is private — over a client cut from the
identity's credential, which is only that adapter's input; and it owns the session's **project
owner**, which `ProjectPage` receives through router context instead of building its own. An identity
for the user already opened replaces nothing, so the **router instance, the address and a mounted
route's state survive a same-session update**. Another user, or leaving, withdraws the session — and
its project in the same instant — synchronously; the session's retirement retires the project first
and fails when the project cannot be given back.

**Non-goals.**

- **Task 7, Log out.** `onSignOut` still calls `setSession(null)`; the session is now retired by
  `SignedInApp`'s unmount, after the signed-out form has rendered. Packet k makes Log out one awaited
  `leave()` of the session owner before the signed-out state renders (section 12).
- **The project catalog and the archival import.** `ProjectPage` still builds `httpProjectApi(token)`
  itself; the catalog has no feature facade (the lifetime map's prerequisite), and the header token
  still reaches the page through router context. Refusing it there is task 13's.
- **Tasks 10, 11, 12, 13**: saved plans, route and Strict Mode ownership tests, module indexes and
  isolated type checks, the architecture checks. No `module-index` block is added.
- **A lifecycle-failure reporter for the session.** Its fatal state is drawn, not logged.
- No dependency, `project.json`, `bun.lock` or pin changes.

**What a reader sees change**, and nothing else: the signed-in region appears a few microtasks after
the identity arrives rather than in the same commit ("Loading…" in between); a session that cannot be
built or given back shows the sanitized fatal state in place of the region; and the directory page,
left and entered again within one session, shows what the directory already held while its arrival
read runs, instead of an empty page.

**The cut, and why three slices.** Measured, not assumed (section 4.2):

1. **The runtime, its owner and the module**, plain TypeScript with node-tier tests and no React:
   `runtime/session-runtime.ts` (`installSessionRuntime`, `createSessionOwner`),
   `modules/directory-management/module.ts`, the directory resource's withdrawal guard, the owner's
   model test and seven examples, the module's five examples. Delivery does not change. This slice
   carries the state machine and its twelve model faults.
2. **The directory from the session**: `SignedInApp` owns the session owner; the router context
   carries the runtime; `DirectoryPage` takes `directory: DirectoryManagement`; the directory page's
   suite draws through a fixture, `DirectoryPageOverClient`; five app examples, one of them the
   router-survival proof.
3. **The project from the session**: `ProjectPage` takes `projectOwner`; its suites draw through
   `ProjectPageOverOwner`; one router example; the READMEs, the lifetime map, and task 6 ticked.

## 2. Read first

| File                                                                                                            | Why                                                                                                          |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, `LLM_README.md`                                                                                    | Rules R1–R5 and the routing index.                                                                           |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                                           | "Execution contract", "Standard blocks every packet uses" — the strict OpenSpec block and the fault form.    |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`                                      | "Session owner", "Replacement and cleanup policy", exact lifecycle tests 5–7 and 13: what this delivers.     |
| `docs/superpowers/plans/2026-09-21-batch-6/050-7-j-project-runtime.md`, sections 3 and 6–9 (its third revision) | The project owner this session owns, and the step-0, extraction and fault procedure this packet repeats.     |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`, `project-runtime.ts`                                             | The one serialized owner every lifetime uses; `createProjectOwner` and its `install` seam.                   |
| `apps/wbs/fe-01/src/modules/preferences/module.ts`, `module.test.ts`                                            | The sealed-module form the directory-management module repeats.                                              |
| `apps/wbs/fe-01/src/app.tsx`, `app-router.tsx`, `components/directory/directory-page.tsx`                       | The identity's two sources, the router created once, the directory page's per-mount directory this replaces. |

## 3. Design

### 3.1 The state machine

This section is the record the batch addendum's lesson 16 asks for; the owner's model test executes it
and names it in its JSDoc, and the same rules are JSDoc on `createSessionOwner`, `SessionRuntime` and
`sessionProjects` (R3).

**The owner** is one `LifetimeSlot<SessionRuntime>` per `SignedInApp` mount, plus **the key**: the
identity the newest request asked for (`wanted`), and that request's settlement (`latest`). Its states
are the slot's: `empty`, `constructing`, `live(r)`, `retiring`, `fatal(terminal)`. **A session
runtime** moves through `built → current → withdrawn → retired`, or `built → withdrawn → retired` when
a newer request overtook it, or `withdrawn → stuck` when its disposal fails or outruns the budget.
**Each project runtime** it owns is current only while its own owner publishes it **and** its session
is current.

| From                      | Event                                                                                                      | To                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| any                       | `open(u, c)` where `u` is `wanted`'s user                                                                  | nothing: the request joins `latest`; no runtime is built or withdrawn, whatever `c` is                |
| `empty`, `fatal` (not t.) | `open(u, c)`, another user                                                                                 | `constructing`; the runtime for `u` is installed over `clientFor(c)`, then `live(r)` if still newest  |
| `live(r)`                 | `open(v, c)` for another user, or `leave()` — **synchronously**                                            | `retiring`; `r` and every project runtime of `r` answer `isCurrent()` false from here on              |
| `retiring`                | `r`'s disposal: its project owner left, the project closed once, succeeded                                 | `constructing` for an `open`, `empty` for a `leave`                                                   |
| `retiring`                | `r`'s project could not be given back (`SessionProjectRetirementError`), or the disposal outran the budget | `fatal`, terminal; every later request is refused with the same state                                 |
| `constructing`            | the installation acquired and then threw a partial acquisition; its release succeeded                      | `fatal`, not terminal; the refusal was recorded, so the request settles; another user may build again |
| `constructing`            | that release rejected or outran the budget                                                                 | `fatal`, terminal; the release's refusal was recorded too                                             |
| any                       | a newer request overtook this one                                                                          | it builds nothing, or gives back what it built; it settles quietly                                    |
| any                       | a second `leave()`                                                                                         | queued behind the first; settles only after the retirement it joined has run                          |
| withdrawn `r`             | a directory answer lands, a reader reads or changes the directory, or opens a project                      | nothing reaches anybody, no request is sent, no project is built                                      |

**Events** the model generates: `signIn(u1|u2, ''|'t')`, `signOut`, `signInBroken(u1|u2)` — a sign-in
whose installation acquires the whole graph and then throws a `PartialAcquisitionError` whose release
(the real close) is counted — `reenter(u1|u2)` — a sign-in asked from inside the owner's own
notification, the first time it next says anything, as a component re-rendered by the owner's store
would — one scheduled answer, all answers (`drain`), a captured directory `read` and `gesture` (an added tag), and a captured `openProject(p1|p2)`
and `leaveProject` — each on any session runtime ever built, withdrawn or not. Each runtime gets its
own fake directory client whose people are named after its own user, so every request, answer and
close is attributed to the session that made it; each session's close waits on one scheduled step
before the real close runs, which opens the interval between withdrawal and disposal in which late
work can still arrive. Project runtimes are the real `installProjectRuntime`, reached through the
session's own wiring.

**Invariants**, each asserted by `session-runtime.model.test.ts` against its own records:

- **S1 — one current, keyed.** At most one session runtime answers `isCurrent()`, it is the one the
  owner publishes, and a published runtime is for the user last asked for.
- **S2 — withdrawal is instant, projects included.** From the synchronous return of an `open` for
  another user and of `leave`, no session runtime and no project runtime of any session answers
  `isCurrent()`.
- **S3 — nothing after withdrawal.** A withdrawn session's directory snapshot is the very object it
  was at withdrawal (or at construction, for one never published), whatever answers afterwards.
- **S4 — nothing sent for a departed reader.** A read or a change asked of a withdrawn session's
  directory sends no request.
- **S5 — no project outlives its session.** At every point, a project runtime is current only while
  its session is; when everything has settled, every retired session's project owner holds nothing
  and every project runtime it built was closed exactly once.
- **S6 — one retirement per session, and a trigger waits for it.** Every session but the live one was
  closed exactly once; a `leave()` settles only after every session built before it has finished
  closing.
- **S7 — the key.** No more sessions are built than there were requests naming a different user.
- **S8 — the latest wins.** When everything has settled the owner is `live` for the last user asked
  for, `fatal` and not terminal when that user's installation fails, or `empty` after a `leave`; a
  failed installation was released exactly once, and its request settled rather than rejected.

**What the model does not cover, and who does.** No **disposal** fails or outruns its budget in the
model: a rejecting retirement is the slot's own model's and the examples `fails the session’s
retirement when its project will not let go` (a rejecting project close) and `settles a half-built
session that cannot be released, …` (a rejecting release); a disposal that **expires** is the slot's
own model's (`lifetime-slot.model.test.ts`) and, for the session through a never-settling project,
packet k's (section 3.8).

Interleavings counted over the pinned run and asserted non-zero: an answer landing after its session
was withdrawn; a read, a gesture and a project open by a withdrawn session; a session withdrawn while
one of its projects was current; the same user signing in again; a switch while live; a `leave` with
nothing current; a sign-in from inside a notification; an unbuildable installation; a `leave` after
one.

### 3.2 The runtime — `installSessionRuntime`

One DI Bag graph per signed-in user, built synchronously and returned through
`acquireTransactionally`, exactly as the project runtime is:

| Binding                                                           | Built from                                                                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `directoryManagement` (the module's one export)                   | `installModule(directoryManagementModule)`: private `directory` = `createDirectory(directoryApi, isActiveReader)`          |
| `directoryApi`, `isActiveReader` (the module's host requirements) | the client the owner cut from the credential; the runtime's own `isCurrent`                                                |
| `projects` — **the one owned disposable**, `DiBag.withDisposal`   | `sessionProjects(...)` over `createProjectOwner`; disposal: `await projects.leave()`, then throw if it is terminally fatal |

`sessionProjects` wraps `createProjectOwner` twice: its `install` hands each project runtime
`isCurrent: () => isCurrent() && dependencies.isCurrent()`, so withdrawing the session withdraws its
project in the same instant; and its `open` builds nothing once the session is withdrawn. A project
owner that is fatal **but not terminal** — a construction failed and was released — holds nothing, so
it does not fail the session's retirement.

`SessionRuntime` publishes `userId`, `isCurrent`, `directory` and `projects` — the example
`publishes the session’s directory and its projects, and nothing else` enumerates exactly these four
(fault `k1`). No bag, client, credential or directory resource is reachable (rule K2).

**The directory resource's withdrawal guard.** `createDirectory(client, isActiveReader)` now takes the
owner's answer: `show` changes nothing, `read` sends nothing and `runWrite` runs nothing once it says
no (faults `m3`, `m4`, `m5`). Its two direct callers outside the module pass `() => true`, the
directory no lifetime owns: its own suite and the page suite's fixture.

### 3.3 The owner — `createSessionOwner`

`open(identity)` is `slot.replace(() => install({ userId, directoryApi: clientFor(credential),
isCurrent, installProject, budgetMs }))` **unless** `identity.userId === wanted?.userId`, when it
returns `latest` (faults `m1`, `m2`). `leave()` clears `wanted` and is `slot.retire()`, always queued,
never short-circuited (fault `m6`). Each runtime's `isCurrent` answers yes only while the slot is
`live` with that very runtime (fault `m10`).

**Refusals are classified by identity, as packet j's third revision classifies the project's.**
Every installation goes through `installRecorded`, which records a construction's throw — rewrapping
a `PartialAcquisitionError` so that its release's own refusal is recorded too — and wraps the
runtime's close in `recorded`, which records a rejected retirement. `settle` then returns for
`TransitionSupersededError` and for a recorded refusal, and rethrows anything else as the slot's own
fault. It never reads the slot's state after the await, which a request asked from inside a
notification may already have moved on (faults `o1`, `o2`, `o3`, `m12`). `install`, `clientFor`, `installProject` and the budget are injectable for
tests; production passes none of them.

`sessionFor(state, userId)` is the one reader of the owner's state for delivery: the published
runtime when it is that user's, `null` otherwise (fault `g1`). Between the render that hands
`SignedInApp` a new identity and the effect that asks the owner for it, the owner still publishes the
previous user's runtime, and a route's own effects run before its parent's — a page drawn from it
then would act on the previous user's directory and project owner.

### 3.4 Delivery: who receives what

| Consumer                                      | Before (base)                                                                     | After                                                                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppContent` (`app.tsx`)                      | renders the router, the hint layer and the account menu when a session exists     | renders `<SignedInApp session onSignOut>`; the startup check and the sign-in form are unchanged                                                                                       |
| `SignedInApp` (**new**, `app.tsx`)            | —                                                                                 | `useState(openOwner)`; an effect `open({ userId, credential })` on every identity; an unmount effect `leave()`; the region drawn only from `sessionFor`; `LifetimeFault` when `fatal` |
| `AppRouter`, `SignedInRegion`                 | `token`, `presence`, `account`, `projectApi?`, `directoryApi?`                    | `session: SessionRuntime` added; `directoryApi?` removed; the router is still created once, its context refreshed                                                                     |
| `DirectoryPage`                               | `token`, `api?`; `useDirectoryManagement(token, api)` built a directory per mount | `directory: DirectoryManagement`; `useDirectoryManagement(directory)` subscribes and reads on arrival                                                                                 |
| `ProjectPage`                                 | `useState(createProjectOwner)`                                                    | `projectOwner: ProjectOwner`, the session's, from the route                                                                                                                           |
| `modules/directory-management/composition.ts` | `directoryManagementOver`, `directoryManagementFor`                               | **deleted**: `module.ts` is the composition; the fixture builds its own                                                                                                               |

### 3.5 The suites' fixtures

- **`src/testing/directory-page-over-client.tsx`** — `DirectoryPageOverClient({ api, ...page })`
  builds one directory per mount over `api` with `() => true` for its reader, points it at a
  replacement client on a rerender, and draws `DirectoryPage` from it: what the page's own hook did
  before. Slice 2's **named fixture edit** turns every `<DirectoryPage token="t" api=` in
  `directory-page.test.tsx` (17 sites) into `<DirectoryPageOverClient api=`.
- **`src/testing/project-page-over-owner.tsx`** — `ProjectPageOverOwner(props)` builds one project
  owner per mount and draws `ProjectPage` with it: what the page itself did before. Slice 3's named
  fixture edit turns the 13 `<ProjectPage` sites of `project-page.test.tsx` and the one of
  `optimization-integration.test.tsx` into `<ProjectPageOverOwner`.

Neither withdraws anything; what a session adds is proved by the session runtime's suites, the app's
and the router's (section 9.5).

### 3.6 The decision: the project owner is the session's

The lifetime map puts the project "inside the current session" and requires "project retirement
always begins before session retirement". A project owner built by `ProjectPage` is retired by React's
unmount cleanup, in whatever order React runs it, and a session could let go while its project still
held a socket. **Decided: the session runtime owns the project owner** as its one owned disposable.
Three consequences, each with a fault: withdrawing the session withdraws its project in the same
instant (`m8`); the session's disposal leaves the project and awaits it (`m7`, `m11`) and fails when
it is terminally fatal (`d1`); a withdrawn session opens no project (`m9`). This is also the seam
packet k needs: Log out becomes `await sessionOwner.leave()` and a check that the owner is not
`fatal`, with no request and no second coordinator (section 12).

### 3.7 Existing behaviour, and the tests that hold it

The directory page's, the project page's, the optimization integration's and the router's suites
all run unchanged in substance: the only edits are the two named fixture edits, the router
suite's `regionAt` handing `AppRouter` a session (slice 2), and three imports. No `expect` line of an
existing test changes. The full `wbs-fe-01:test` target was run after slice 2 and on the final commit (section 9.3).

### 3.8 What this packet does and does not claim

- **Task 6 is met sentence by sentence**: keyed by user id (model S1, S7; faults `m1`, `m2`, `m10`;
  the example `keeps one runtime for one user whatever credential arrives, and replaces it for
another`); installs the directory module (`module.ts`, its suite, faults `l1`, `l2`; the runtime's
  surface, `k1`); the router instance and address survive a same-session update (the app example
  `keeps the router, the address and a draft for the same user, whatever credential arrives`, which
  records every router `createRouter` builds and asserts the one built first is still the only one
  after the same-user update — lifetime-map test 7's instance, asserted directly — and a second only
  for another user; fault `m2` injected on the final tree fails it — rehearsed, section 9.3). It is
  ticked in slice 3.
- **Double retirement** is prevented structurally by the slot's serialization (proved in
  `lifetime-slot.model.test.ts`); no line in this packet can close a session twice, so no fault can
  make the model's exactly-once close count fail without adding a second closer by hand. The fault the
  model can observe is the one that matters to packet k — a second trigger that does not wait for the
  retirement it joined (`m6`) — and S6 asserts both halves.
- **Nested equal budgets.** The session's disposer awaits `projects.leave()`, whose retirement runs
  under the project slot's `RETIREMENT_BUDGET_MS`, inside the session's own close under the same
  budget. A project that never settles therefore makes both `DiBagCloseCancelledError`s fire
  together: the session ends terminally fatal, correctly, but through the expired wait, not through
  `SessionProjectRetirementError` — fault `d1` covers only a **rejecting** project close. The timeout
  variant, lifetime-map test 14 through a never-settling socket, is packet k's.
- **Carried, not proved.** The directory route handing the page `session.directory` (a route that
  built its own directory would still pass every suite here: no suite swaps sessions under a mounted
  directory page); `SignedInApp`'s "Loading…" while no runtime is published.
- **Log out** is not coordinated yet: `setSession(null)` unmounts `SignedInApp`, whose cleanup starts
  the session's retirement after the form rendered. That is task 7's, packet k's.
- **The credential still reaches `ProjectPage`** as `token` for the catalog and the project services;
  the catalog facade is the map's prerequisite, and refusing a credential in delivery is task 13's.
- **`createProjectOwner`'s JSDoc** ("the owner of one page's selected project", "safe to build in a
  lazy state initializer") now describes the session's use; `project-runtime.ts` is packet j's and its
  executor writes its comments into it, so it is left for task 11 to reword.
- The directory page left and re-entered within one session now shows what the directory held while
  its arrival read runs; no test asserted the old empty page.

## 4. Verified facts

Every number is a **fresh observation from this packet's own rehearsal** on 2026-09-24, on `c9c99f0a`
— the authoring base `4756254d` (packet j's first rehearsal tree `fcb49202` merged with the planning
head `4eab0b38`) with packet j's **third-revision** runtime files (`project-runtime.ts`, its model test
and its examples, from `62bcab33`) laid on it, which is the only difference between j's first and third
rehearsal trees — and on three rehearsal commits over it, one per slice. The composition was checked
against j's third revision, not its first. None is a stop condition: each slice records its own baseline in step 0 and compares
relatively.

### 4.1 The code as it stands

| Fact                                                                                                                                                      | Where                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| the identity's only sources are `fetchMe` at startup (`token: ''`) and `AuthForm`'s login (`token` from the reply); nothing re-sends a same-user identity | `app.tsx`, `AppContent`; `components/auth/auth-form.tsx`        |
| `useDirectoryManagement(token, api)` builds a directory per page mount in a lazy state initializer and replaces its client in an effect                   | `modules/directory-management/view/use-directory-management.ts` |
| the header credential is sent as `x-wbs-token`, empty for a cookie-restored session                                                                       | `lib/wbs-api.ts`, `auth`                                        |
| `AppRouter` creates the router once in `useState` and refreshes its context every render                                                                  | `app-router.tsx`                                                |
| `ProjectPage` builds its project owner in `useState(createProjectOwner)` and opens and leaves it in one effect                                            | `components/wbs/project-page.tsx`                               |
| `createProjectOwner` accepts `install` and `budgetMs`; `ProjectRuntimeDependencies.isCurrent` is what the runtime publishes and every guard reads         | `runtime/project-runtime.ts`                                    |
| DI Bag 0.4.0 accepts an async disposer, runs it after `close()` returns, and rejects a throwing one with `DI_BAG_CLEANUP_FAILED`                          | `di-bag` `registration.d.ts`; example `o2`                      |
| React **19.2.8**, Vitest **5.0.0**, fast-check **4.9.0**; `-t` is a regular expression and no proof title here holds a metacharacter                      | `node_modules/*/package.json`                                   |

### 4.2 The measured blast radius

`git diff --stat c9c99f0a <slice 3 rehearsal>`: **29 files changed, 2017 insertions(+), 155 deletions(-)**; with `verify.md`, which only the executor
writes, the slices own 30 distinct paths. Slice 1 owns 14 (5 new), slice 2 owns 13 (1 new, 1 deleted), slice 3
owns 12 (1 new).

| Tree            | Sandbox node suite | Session set (3 files, serial) | Adopted set (20 files, serial) | Zoned |
| --------------- | ------------------ | ----------------------------- | ------------------------------ | ----- |
| base `c9c99f0a` | 53·695             | 3·59                          | 20·1218                        | 2·3   |
| after slice 1   | 56·708             | 3·59                          | 20·1218                        | 2·3   |
| after slice 2   | 56·709             | 3·64                          | 20·1218                        | 2·3   |
| after slice 3   | 56·709             | 3·65                          | 20·1219                        | 2·3   |

The **session set** is `src/app.test.tsx`, `src/app-router.test.tsx` and
`src/components/directory/directory-page.test.tsx`; the **adopted set** is packet f2's twenty files,
as packet j uses it (it includes `app-router.test.tsx`, so a router example counts in both).

### 4.3 Planner observations on the base, not stop conditions

- Preferences suite 4·39; strict OpenSpec `{"items":114,"passed":114,"failed":0}` on the base and after
  every slice — the new requirement lives in a document that already counted as one item.
- The adopted set takes about six minutes serially; every slice that runs it says so, and preamble
  rule 19 applies — poll the log, it is still running.
- The owner's model test runs 300 generated sequences in about 0.2 seconds.

## 5. File plan

Paths under `apps/wbs/fe-01/` unless they start with `openspec/` or `docs/`.

| File                                                                                                                        | Slice | Create/modify           | Responsibility                                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------- | --------------------------------------------------------------------------------------- |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`                                          | 1–3   | modify                  | the requirement (slice 1), then one scenario per slice, each before its code            |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                                                                       | all   | modify                  | one fresh entry per slice, appended                                                     |
| `src/runtime/session-runtime.ts`                                                                                            | 1, 2  | **create**              | sections 3.2 and 3.3 (1); `sessionFor` (2)                                              |
| `src/runtime/session-runtime.model.test.ts`, `src/runtime/session-runtime.test.ts`                                          | 1, 2  | **create**              | the model test (3.1) and seven examples (1); one example (2)                            |
| `src/modules/directory-management/module.ts`, `module.test.ts`                                                              | 1     | **create**              | the sealed module and its five examples                                                 |
| `src/modules/directory-management/contract.ts`                                                                              | 1     | modify                  | its requirements, label and module identifier                                           |
| `src/modules/directory/directory.resource.ts`, `contract.ts`                                                                | 1     | modify                  | the withdrawal guard and its JSDoc                                                      |
| `src/modules/directory/directory.resource.test.ts`, `src/modules/directory-management/directory-management.feature.test.ts` | 1     | modify                  | the new parameter, `() => true`, at every direct call (named edit, 12 sites)            |
| `src/modules/directory-management/composition.ts`                                                                           | 1, 2  | modify, then **delete** | the new parameter (1); gone, `module.ts` is the composition (2)                         |
| `vitest.node-suites.ts`                                                                                                     | 1     | modify                  | list the three DOM-free suites                                                          |
| `src/app.tsx`, `src/app.test.tsx`                                                                                           | 2     | modify                  | `SignedInApp`; five examples, the `login` mock and the router probe                     |
| `src/app-router.tsx`                                                                                                        | 2, 3  | modify                  | the session in router context, the directory from it (2); the project owner from it (3) |
| `src/app-router.test.tsx`                                                                                                   | 2, 3  | modify                  | `regionAt` hands a session (2); one example (3)                                         |
| `src/components/directory/directory-page.tsx`, `src/modules/directory-management/view/use-directory-management.ts`          | 2     | modify                  | the page takes the session's directory; the hook subscribes and reads on arrival        |
| `src/components/directory/directory-page.test.tsx`, `src/testing/directory-page-over-client.tsx`                            | 2     | modify, **create**      | the named fixture edit (17 sites) and its fixture                                       |
| `src/components/wbs/project-page.tsx`                                                                                       | 3     | modify                  | `projectOwner` from the session                                                         |
| `src/components/wbs/project-page.test.tsx`, `optimization-integration.test.tsx`, `src/testing/project-page-over-owner.tsx`  | 3     | modify, **create**      | the named fixture edit (14 sites) and its fixture                                       |
| `src/modules/{directory,directory-management}/README.md`                                                                    | 3     | modify                  | who builds and withdraws the directory now                                              |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`                                                  | 3     | modify                  | one dated update under "Session owner"                                                  |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                                                                        | 3     | modify                  | task 6 ticked, with a dated note                                                        |

Nothing else. Not `lifetime-slot.ts`, `application-runtime.ts`, `project-runtime.ts`, the project
modules, `wbs-table.tsx`, `use-plan-read.ts`, `lib/*`, `project.json`, `bun.lock` or `package.json`.

### Why the slices are cut where they are, and which hunks meet packet j's files

A test file that imports a module that does not exist yet stops compiling, and the commit hook lints
test files, so each slice lands its tests and its implementation together, the tests applied **first**
and a real red observed in between. Slice 1 is the whole lifecycle and its proofs, with no consumer.
Slice 2 cannot be smaller: once `DirectoryPage` takes the session's directory, the router must carry a
session and the app must own one. Slice 3 is the one decision with a delivery consequence (section 3.6)
and its records.

**Packet j's files** (the brief's `project-page.tsx`, `wbs-table.tsx`, `runtime/`, `modules/`):

- `project-page.tsx` — slice 3 only, four hunks: the `ProjectOwner` type import (line 30), the new
  `projectOwner` prop at the top of `ProjectPageProps`, the destructuring at the head of
  `ProjectPage`, and the owner's JSDoc and `useState(createProjectOwner)` line (~546–556), which it
  removes. None is within three lines of packet j's four comment sites (`q1` at
  `if (projectState.status === 'fatal') {`, `q2` at the owner effect's `return () => {`, `x1`/`x2` in the
  stream factory) or packet h's `q1` at `const projectServices = useMemo(...)`; section 9.1's `fill=1`
  run proves the hunks apply with all five filled.
- `project-page.test.tsx`, `optimization-integration.test.tsx` — slice 3's named fixture edit; the
  latter's import hunk sits beside packet j's `WbsTableOverClient` import.
- `runtime/` — only new files. `session-runtime.ts` imports `createProjectOwner`,
  `installProjectRuntime`, `ProjectOwner` and `ProjectRuntimeDependencies` from j's
  `project-runtime.ts`, which it does not change.
- `modules/` — `directory/` and `directory-management/` only, which no earlier 050.7 packet touches.
- `wbs-table.tsx` — not touched.

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

**0b. Two helpers, the patches, the fault patches and the two lists**, written into `$TMPDIR` so that
every later block — each its own shell — can use them.

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
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-i-session-runtime.md
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
test "$count" -eq 24
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
# The session set: the app, the router and the directory page, relative to apps/wbs/fe-01.
printf '%s\n' src/app.test.tsx src/app-router.test.tsx \
  src/components/directory/directory-page.test.tsx > "$TMPDIR/session.txt"
test "$(wc -l < "$TMPDIR/session.txt")" -eq 3
````

Expected: `patches=9`, `mutations=24`, exit 0. **Applying section 7.N** below always means exactly
this, never a hand edit:

```sh
set -euo pipefail
git apply --check "$TMPDIR/patches/NN.diff"
git apply "$TMPDIR/patches/NN.diff"
```

`--check` and the apply are separate commands on purpose: joined with `&&` under `set -e`, a failed
check would not stop the shell. `git apply` without `--index` writes only the working tree, which the
read-only `.git` allows — including slice 2's deletion of `composition.ts`; the `index` lines in the
diffs are informational. The nine diffs are numbered in section order: 7.1 is `01.diff`, 7.2 `02`,
and so on to 7.9 `09`.

**0c. The baselines every slice records**, before any edit:

```sh
set -euo pipefail
cd apps/wbs/fe-01
bash "$TMPDIR/run-check.sh" base-preferences env TZ=UTC bunx vitest run src/modules/preferences
bash "$TMPDIR/run-check.sh" base-sandbox bunx vitest run --config vitest.node.config.ts \
  --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
# shellcheck disable=SC2046 # three fixed paths without spaces
bash "$TMPDIR/run-check.sh" base-session env TZ=UTC bunx vitest run --no-file-parallelism \
  --maxWorkers=1 $(cat "$TMPDIR/session.txt")
bash "$TMPDIR/expect-status.sh" base-preferences 0
bash "$TMPDIR/expect-status.sh" base-sandbox 0
bash "$TMPDIR/expect-status.sh" base-session 0
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

### Slice 1 — the session runtime, its owner and the directory module, with the state machine's model test

Owns (14 paths): `spec.md`, `verify.md`, `apps/wbs/fe-01/vitest.node-suites.ts`, and under
`apps/wbs/fe-01/src/`: `modules/directory/{contract.ts,directory.resource.ts,directory.resource.test.ts}`,
`modules/directory-management/{composition.ts,contract.ts,directory-management.feature.test.ts}`, and
five new files — `modules/directory-management/{module.ts,module.test.ts}`,
`runtime/{session-runtime.ts,session-runtime.model.test.ts,session-runtime.test.ts}`.

- [ ] 1. Step 0. Expected: the session set passes (rehearsed 3·59).
- [ ] 2. **The contract first (R4).** Apply section 7.1 (the new requirement and its first scenario)
      and rerun the strict block. Expected: exit 0, `passed` equal to step 0's number (rehearsed
      114 → 114).
- [ ] 3. Apply section 7.2: the three new suites, and the named edit of the twelve direct
      `createDirectory(api)` calls in the resource's and the feature's suites to
      `createDirectory(api, () => true)`. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-red-vitest env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/runtime/session-runtime.model.test.ts src/runtime/session-runtime.test.ts \
    src/modules/directory-management/module.test.ts
  bash "$TMPDIR/expect-status.sh" s1-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s1-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 34 errors in 5 files.` — 15 in
  `module.test.ts` (its missing module and exports, and what follows from them), 11 × TS2554 in
  `directory.resource.test.ts` and 1 in `directory-management.feature.test.ts` (`Expected 1 arguments,
but got 2.`), 6 in `session-runtime.model.test.ts` (1 × TS2307, 5 × TS7006) and 1 in
  `session-runtime.test.ts`; the four that name the cause:

  ```text
  apps/wbs/fe-01/src/modules/directory-management/module.test.ts:7:43 - error TS2307: Cannot find module './module' or its corresponding type declarations.
  apps/wbs/fe-01/src/modules/directory/directory.resource.test.ts:12:42 - error TS2554: Expected 1 arguments, but got 2.
  apps/wbs/fe-01/src/runtime/session-runtime.model.test.ts:18:8 - error TS2307: Cannot find module './session-runtime' or its corresponding type declarations.
  apps/wbs/fe-01/src/runtime/session-runtime.test.ts:11:59 - error TS2307: Cannot find module './session-runtime' or its corresponding type declarations.
  ```

  and Vitest `status=1`, `Test Files 3 failed (3)`, `Tests no tests`, on `Failed to resolve import
"./session-runtime"` (twice) and `Failed to resolve import "./module"`.

- [ ] 4. Apply section 7.3: the resource's guard, the module and its contract, the runtime and its
      owner, `composition.ts`'s one call, and the three lines in `vitest.node-suites.ts`.
- [ ] 5. **Green checkpoint.**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-green-runtime env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/runtime/session-runtime.model.test.ts src/runtime/session-runtime.test.ts \
    src/modules/directory-management src/modules/directory
  bash "$TMPDIR/run-check.sh" s1-green-tiers env TZ=UTC bunx vitest run src/test-tiers.test.ts
  bash "$TMPDIR/run-check.sh" s1-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s1-green-typecheck s1-green-runtime s1-green-tiers s1-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: runtime 5 files, 37 tests (the model test, seven runtime examples, five module examples, and the two existing directory suites unchanged at 24); tiers 5 tests; sandbox = step 0 **+ 3 files,
  - 13 tests** (rehearsed 53·695 → 56·708).

- [ ] 6. Durable lint, from the repository root:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-lint env NX_DAEMON=false bunx nx run wbs-fe-01:lint
  bash "$TMPDIR/expect-status.sh" s1-lint 0
  ```

  An autofixable import-order or Prettier finding is fixed with `bunx eslint --fix <file>`, not
  reported as a stop (preamble rule 17).

- [ ] 7. The nineteen proofs of section 8.1 (`m1`–`m12` on the model, `k1`, `o1`, `o2`, `o3`, `d1` on the
      runtime's examples, `l1`, `l2` on the module's), with section 8's procedure: every fault
      observed first, then the `Proof:` comments at the sites the tables name.
- [ ] 8. Rerun `s1-final-runtime` (step 5's runtime command) and step 0c's three commands
      (`s1-final-*`): preferences and session set unchanged from step 0, sandbox as step 5.
- [ ] 9. Append this slice's `verify.md` entry (shape below), then owned-file Prettier over the
      fourteen paths, `--write` then `--check`, from this list, which step 10 reuses; then rerun the
      strict OpenSpec block — **after** the evidence edit.

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/src/modules/directory-management/composition.ts \
    apps/wbs/fe-01/src/modules/directory-management/contract.ts \
    apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.test.ts \
    apps/wbs/fe-01/src/modules/directory-management/module.test.ts \
    apps/wbs/fe-01/src/modules/directory-management/module.ts \
    apps/wbs/fe-01/src/modules/directory/contract.ts \
    apps/wbs/fe-01/src/modules/directory/directory.resource.test.ts \
    apps/wbs/fe-01/src/modules/directory/directory.resource.ts \
    apps/wbs/fe-01/src/runtime/session-runtime.model.test.ts \
    apps/wbs/fe-01/src/runtime/session-runtime.test.ts \
    apps/wbs/fe-01/src/runtime/session-runtime.ts \
    apps/wbs/fe-01/vitest.node-suites.ts \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md \
    > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 14
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

  Expected: the `diff` prints nothing and exits 0: nine ` M` paths and five `??`.

Planner commit subject:
`feat(frontend): own the signed-in user's directory and project in one session runtime`.

### Slice 2 — the directory from the signed-in user's session

Owns (13 paths): `spec.md`, `verify.md`, and under `apps/wbs/fe-01/src/`: `app.tsx`, `app.test.tsx`,
`app-router.tsx`, `app-router.test.tsx`, `components/directory/{directory-page.tsx,directory-page.test.tsx}`,
`modules/directory-management/view/use-directory-management.ts`,
`modules/directory-management/composition.ts` (**deleted**),
`runtime/{session-runtime.ts,session-runtime.test.ts}`, and `testing/directory-page-over-client.tsx`
(new).

- [ ] 1. Step 0, then the adopted set and the zoned suite:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046 # the list is twenty fixed paths without spaces
  bash "$TMPDIR/run-check.sh" s2-base-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s2-base-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/expect-status.sh" s2-base-adopted 0
  bash "$TMPDIR/expect-status.sh" s2-base-zoned 0
  ```

  Expected `status=0` for both. Rehearsed: adopted 20·1218 (about six minutes — poll the log, it
  is still running); zoned 2·3; step 0's session set 3·59.

- [ ] 2. **The contract first.** Apply section 7.4 (the scenario "The same user keeps the session, the
      router and the address") and rerun the strict block: exit 0, `passed` unchanged.
- [ ] 3. Apply section 7.5, the test side: the fixture, **the named fixture edit** of this slice — the
      seventeen `<DirectoryPage token="t" api=` sites of `directory-page.test.tsx` become
      `<DirectoryPageOverClient api=`, with the import — the router suite's `regionAt` handing
      `AppRouter` a session, the app suite's `login` and router-recording mocks and five examples, and the runtime's one new
      example. No other `expect` line changes. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s2-red-vitest env TZ=UTC bunx vitest run src/app.test.tsx
  bash "$TMPDIR/expect-status.sh" s2-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s2-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 22 errors in 6 files.` — 17 × TS2741 in
  `directory-page.test.tsx` (`Property 'token' is missing in type … but required in type
'DirectoryPageOverClientProps'`, one per site: the fixture's props still carry the page's old
  `token`), the fixture's TS2322 reported once per build project that includes `src/testing`, one
  TS2322 in `app-router.test.tsx` (`session` is not a `SignedInRegion` prop yet), one TS2339 in `app.test.tsx`
  (`Property 'SignedInApp' does not exist`) and one TS2724 in `session-runtime.test.ts` (`'"./session-runtime"' has no exported member named
'sessionFor'`); and Vitest `status=1`, `Tests 3 failed | 9 passed (12)` — `keeps the router, the
address and a draft …`, `shows the sanitized report …` and `gives the session back …`, each on
  `Element type is invalid: … got: undefined` (there is no `SignedInApp` yet). The two credential
  examples pass on this base: the old page already built its client from the token, and their
  production-path proof is `g4`.

- [ ] 4. Apply section 7.6: `sessionFor`, `SignedInApp`, the router's context, the directory page and
      its hook, and the deletion of `composition.ts`. Then confirm the file is gone:

  ```sh
  set -euo pipefail
  if test -e apps/wbs/fe-01/src/modules/directory-management/composition.ts
  then echo "composition.ts is still there" >&2; exit 1; fi
  ```

- [ ] 5. **Green checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s2-green-session env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 $(cat "$TMPDIR/session.txt")
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s2-green-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s2-green-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/run-check.sh" s2-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s2-green-typecheck s2-green-session s2-green-adopted s2-green-zoned \
    s2-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: session set = step 0 **+ 5 tests** (rehearsed 3·59 →
  3·64); adopted unchanged from step 1; zoned unchanged; sandbox = step 0 **+ 1 test**
  (56·708 → 56·709).

  And delivery no longer builds a directory:

  ```sh
  set -euo pipefail
  if git grep -nE "createDirectory\(|createDirectoryManagement\(|httpDirectoryApi\(" \
    -- apps/wbs/fe-01/src/components apps/wbs/fe-01/src/app.tsx apps/wbs/fe-01/src/app-router.tsx \
    apps/wbs/fe-01/src/modules/directory-management/view > "$TMPDIR/evidence/s2-builders.txt"
  then echo "delivery still builds a directory" >&2; cat "$TMPDIR/evidence/s2-builders.txt" >&2; exit 1
  else rc=$?; test "$rc" -eq 1; fi
  ```

  Expected: nothing printed, exit 0 (on this slice's base the same `git grep` lists two lines in
  `use-directory-management.ts`).

- [ ] 6. Durable lint (`s2-lint`), expected `status=0`.
- [ ] 7. The four proofs of section 8.2 (`g1` in `session-runtime.ts`, `g2`–`g4` in `app.tsx`).
- [ ] 8. Rerun the session set (`s2-final-session`) and step 0c's preferences and sandbox commands
      (`s2-final-*`): unchanged from step 5.
- [ ] 9. `verify.md` entry, then owned-file Prettier over the twelve paths that exist (the deleted
      `composition.ts` is in the owned list, not in the Prettier list), then the strict block:

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/src/app-router.test.tsx \
    apps/wbs/fe-01/src/app-router.tsx \
    apps/wbs/fe-01/src/app.test.tsx \
    apps/wbs/fe-01/src/app.tsx \
    apps/wbs/fe-01/src/components/directory/directory-page.test.tsx \
    apps/wbs/fe-01/src/components/directory/directory-page.tsx \
    apps/wbs/fe-01/src/modules/directory-management/view/use-directory-management.ts \
    apps/wbs/fe-01/src/runtime/session-runtime.test.ts \
    apps/wbs/fe-01/src/runtime/session-runtime.ts \
    apps/wbs/fe-01/src/testing/directory-page-over-client.tsx \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md \
    > "$TMPDIR/formatted.txt"
  test "$(wc -l < "$TMPDIR/formatted.txt")" -eq 12
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/formatted.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/formatted.txt")
  { cat "$TMPDIR/formatted.txt"
    echo apps/wbs/fe-01/src/modules/directory-management/composition.ts; } > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 13
  ```

  Expected: exit 0, and `All matched files use Prettier code style!` from the check.

- [ ] 10. Hand over, with slice 1 step 10's block unchanged. Expected: the `diff` prints nothing and
      exits 0 — eleven ` M` paths, one ` D`
      (`apps/wbs/fe-01/src/modules/directory-management/composition.ts`) and one `??`
      (`apps/wbs/fe-01/src/testing/directory-page-over-client.tsx`).

Planner commit subject:
`refactor(frontend): draw the directory from the signed-in user's session, kept across a same-user update`.

### Slice 3 — the project from the signed-in user's session, and the records

Owns (12 paths): `spec.md`, `verify.md`, `tasks.md` (all under
`openspec/changes/adopt-frontend-lifetimes/`),
`docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, and under
`apps/wbs/fe-01/src/`: `app-router.tsx`, `app-router.test.tsx`,
`components/wbs/{project-page.tsx,project-page.test.tsx,optimization-integration.test.tsx}`,
`modules/{directory,directory-management}/README.md`, and `testing/project-page-over-owner.tsx` (new).

- [ ] 1. Step 0, then the adopted set and the zoned suite, with slice 2 step 1's block (the check
      names `s3-base-adopted`, `s3-base-zoned`). Expected `status=0`. Rehearsed: adopted
      20·1218; zoned 2·3; step 0's session set 3·64.
- [ ] 2. **The contract first.** Apply section 7.7 (the scenario "The project page opens its project
      through the session") and rerun the strict block: exit 0, `passed` unchanged.
- [ ] 3. Apply section 7.8, the test side: the fixture, **the named fixture edit** of this slice — the
      thirteen `<ProjectPage` sites of `project-page.test.tsx` and the one of
      `optimization-integration.test.tsx` become `<ProjectPageOverOwner`, with the imports — and one
      router example. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s3-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s3-red-vitest env TZ=UTC bunx vitest run src/app-router.test.tsx
  bash "$TMPDIR/expect-status.sh" s3-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s3-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 2 errors in 2 files.` — the fixture's one
  TS2322, reported once per build project that includes `src/testing` (`projectOwner` is not a
  `ProjectPageProps` prop yet):

  ```text
  apps/wbs/fe-01/src/testing/project-page-over-owner.tsx:22:23 - error TS2322: Type '{ token: string; api?: ProjectApi | undefined; …
  ```

  and Vitest `status=1`, `Tests 1 failed | 5 passed (6)`, on `AssertionError: expected 'empty' to be
'p1'` — the page opened its project through an owner of its own, and the session's stayed empty.

- [ ] 4. Apply section 7.9 (the page, the router, the two READMEs, the lifetime map, `tasks.md`),
      then date the two notes by observation, never by copying a date from this packet:

  ```sh
  set -euo pipefail
  observed=$(date -u +%F)
  for note in openspec/changes/adopt-frontend-lifetimes/tasks.md \
    docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md; do
    test -f "$note"
    test "$(grep -c '<observed-date-i>' "$note")" -eq 1
    sed -i "s/<observed-date-i>/$observed/" "$note"
    grep -n "observed $observed" "$note"
    if grep -n '<observed-date-i>' "$note"; then echo "placeholder left in $note" >&2; exit 1; else rc=$?; test "$rc" -eq 1; fi
  done
  ```

  Expected: at least one line printed per file (packets h and j's notes may carry the same date),
  exit 0; task 6's box is `[x]`.

- [ ] 5. **Green checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s3-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  bash "$TMPDIR/run-check.sh" s3-format env NX_DAEMON=false bunx nx format:check --all
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s3-green-session env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 $(cat "$TMPDIR/session.txt")
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s3-green-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s3-green-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/run-check.sh" s3-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s3-green-typecheck s3-format s3-green-session s3-green-adopted s3-green-zoned \
    s3-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: session set = step 0 **+ 1** (3·64 → 3·65: the router
  example); adopted = step 1 **+ 1** (20·1218 → 20·1219, the same example); zoned unchanged;
  sandbox unchanged (56·709).

- [ ] 6. Durable lint (`s3-lint`), expected `status=0`.
- [ ] 7. The one proof of section 8.3 (`r1`, in `app-router.tsx`); the fault first, then the comment.
- [ ] 8. Rerun the session set (`s3-final-session`) and step 0c's preferences and sandbox commands
      (`s3-final-*`): unchanged from step 5.
- [ ] 9. `verify.md` entry. Then owned-file Prettier over the twelve paths from this list (step 10
      reuses it), `nx format:check --all` again (`s3-format-after`), and the strict OpenSpec block —
      all after the evidence edit. Never a repository-wide format **write**.

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/src/app-router.test.tsx \
    apps/wbs/fe-01/src/app-router.tsx \
    apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx \
    apps/wbs/fe-01/src/components/wbs/project-page.test.tsx \
    apps/wbs/fe-01/src/components/wbs/project-page.tsx \
    apps/wbs/fe-01/src/modules/directory-management/README.md \
    apps/wbs/fe-01/src/modules/directory/README.md \
    apps/wbs/fe-01/src/testing/project-page-over-owner.tsx \
    docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/tasks.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md \
    > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 12
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  ```

  Expected: exit 0, and `All matched files use Prettier code style!` from the check.

- [ ] 10. Hand over, with slice 1 step 10's block unchanged. Expected: the `diff` prints nothing and
      exits 0 — eleven ` M` paths and one `??` (`apps/wbs/fe-01/src/testing/project-page-over-owner.tsx`).

Planner commit subject:
`refactor(frontend): open the selected project through the signed-in session, and close task 6`.

### Verification record entries

Each slice appends one entry to `openspec/changes/adopt-frontend-lifetimes/verify.md`, headed
`## Packet 050.7i, slice N — <what the slice did>`, containing only its own observations: the attempt
id and starting hash; step 0's baselines as numbers; every command's status; the red checkpoint's own
diagnostics; the green counts; every proof of that slice with its observed message (for the model
faults, run number and shrunk command sequence); and what stayed **pending planner verification** —
`wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`, `wbs-fe-01:e2e`, `tool-devsync:test` and
the host gate. Evidence references are basenames relative to that attempt's evidence directory, never
absolute paths. Do not read, quote or restate an earlier entry.

### Dispatch

One attempt per slice, from the reviewed packet, with no network, driven by a Claude subagent. The
base of slice 1 is the planning lineage that contains packet h's and packet j's **real** lanes and
this packet — planning after both lanes merged, with this packet's branch merged in. That base differs
from the rehearsal base this packet was cut against (`c9c99f0a`, which already carries packet j's
third-revision runtime) by packet h's and packet j's executor
`Proof:` comments, their `verify.md` entries, their dated notes, and whatever packet j's review
changes: before the first dispatch the planner reruns section 9.1's script with `base=` set to that
real base (section 9.1 also records the run against a copy with every one of their comment sites in
the files this packet patches filled). This block holds the only absolute paths in this document.

```sh
# Slice 1, from the reviewed base; J3 is packet j's slice-3 planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-i-session-runtime 1 <reviewed-base-sha> \
  --driver claude \
  --batch batch-6 \
  --require-ancestor <J3> \
  --slice-note 'reviewed base <reviewed-base-sha>' \
  --preserve evidence

# Slices 2 and 3, each into the same clone once the previous slice is reviewed
# and committed; N is the slice, P the previous slice's planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-i-session-runtime N P \
  --driver claude \
  --batch batch-6 \
  --require-ancestor <J3> \
  --resume --require-ancestor P \
  --slice-note 'reviewed base P' \
  --preserve evidence
```

No `--seed`: no slice reads another attempt's evidence. No `--network`: nothing reaches a host.
`--slice-note` is load-bearing: it is the only channel by which the reviewed SHA reaches the executor
without passing through the clone, and step 0a reads it. `--driver claude` writes the prompt and
stops; the Claude subagent runs the slice and the planner collects the attempt.

## 7. The code

Nine fenced diffs, in slice order. Step 0b extracts them as `01.diff` … `09.diff`, and section 9.1
records the run that applies all of them, in this order, to a tree extracted from the rehearsal base
and proves the result byte-identical to the rehearsal's final commit. No diff adds a `Proof:` comment,
and none removes one.

### 7.1 `spec.md` — slice 1, the new requirement

Inserted before "Log out stays a local exit", whose context no other packet in flight edits: the session precedes its exit.

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index d7e582534..be3cb2a86 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -261,6 +261,35 @@ no access at all, as the requirement on degrading visibly already states.
   refused value only from that runtime's store, and while none is live answers
   that nothing is remembered without touching any store

+### Requirement: One session runtime per signed-in user owns the directory and the project
+
+fe-01 SHALL build the services of one signed-in identity - the directory
+management, installed from the directory-management module over a client cut
+from the identity's credential, and the owner of its selected project - as one
+DI Bag session runtime, outside React, through one session owner keyed by the
+user id. An identity for the user already asked for SHALL NOT replace the
+runtime, whatever its credential; an identity for another user, or leaving the
+session, SHALL withdraw the current runtime synchronously, before its disposal
+starts, and every project runtime it owns in the same instant. A withdrawn
+session runtime SHALL hand nothing on from a late directory answer, SHALL send
+nothing for a directory read or change asked of it, and SHALL open no project.
+Its retirement SHALL retire its project first, SHALL fail when that project
+cannot be given back, and a second trigger SHALL settle only once the retirement
+it joined has run. The runtime SHALL publish only its user id, its currency, its
+directory management and its project owner.
+
+#### Scenario: A late answer, a read, a change and a project after a user switch
+
+- **WHEN** one user's session runtime is current and another user signs in or
+  the session is left, and the old runtime's directory reads then answer, or a
+  reader still holding it reads, changes the directory or opens a project,
+  before or after its disposal
+- **THEN** no session runtime but the one the owner publishes answers that it
+  is current, no project of the old runtime is current from the withdrawal on,
+  the old runtime's directory stays exactly as it was when it was withdrawn, no
+  request is sent on its behalf, no project is opened for it, and once its
+  retirement has run every project runtime it built has been closed once
+
 ### Requirement: Log out stays a local exit

 The Log out action SHALL send no request to the server and SHALL retire the
```

### 7.2 `session-runtime.model.test.ts`, `session-runtime.test.ts`, `module.test.ts` (**new**) and the named edit of two suites — slice 1

The model test executes section 3.1: S1–S4 after every command, S2 after every withdrawal, S5 at every point and at teardown, S6–S8 at teardown and when a `signOut` settles. Its counters of commands run and of the interleavings reached are asserted non-zero after the pinned run (`seed: 20260924`, `numRuns: 300`, fast-check 4.9.0). The two existing suites change only by the new parameter, `() => true`, at their twelve direct `createDirectory(api)` calls.

```diff
diff --git a/apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.test.ts b/apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.test.ts
index fcb0e208e..9613ae0c2 100644
--- a/apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.test.ts
+++ b/apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.test.ts
@@ -9,7 +9,7 @@ import { createDirectoryManagement } from './directory-management.feature';
 const USED: DirectoryUsage = { projects: [], members: [{ id: 'p1', name: 'Kat' }] };

 const over = (api: ReturnType<typeof fakeDirectoryApi>) =>
-  createDirectoryManagement(createDirectory(api));
+  createDirectoryManagement(createDirectory(api, () => true));

 /** Counts how often a completion callback ran, which is the whole ordering claim. */
 function counter(): { note: () => void; ran: () => number } {
diff --git a/apps/wbs/fe-01/src/modules/directory-management/module.test.ts b/apps/wbs/fe-01/src/modules/directory-management/module.test.ts
new file mode 100644
index 000000000..a67193586
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/directory-management/module.test.ts
@@ -0,0 +1,76 @@
+import { DiBag } from 'di-bag';
+import { describe, expect, it } from 'vitest';
+
+import { fakeDirectoryApi, KAT } from '@/modules/directory/fake-directory-api';
+
+import { DIRECTORY_MANAGEMENT_LABEL, DIRECTORY_MANAGEMENT_MODULE_ID } from './contract';
+import { directoryManagementModule } from './module';
+
+/**
+ * A host graph over the two requirements the session runtime supplies.
+ *
+ * Written out here rather than taken from `runtime/session-runtime.ts`: this
+ * suite is about the module's seal, and the installer has its own.
+ */
+const hostOver = (api: ReturnType<typeof fakeDirectoryApi>, isActiveReader = () => true) =>
+  DiBag.createBuilder()
+    .installModule(directoryManagementModule)
+    .register({
+      directoryApi: DiBag.fromSyncFactory(() => api),
+      isActiveReader: DiBag.fromSyncFactory((): (() => boolean) => isActiveReader),
+    })
+    .build();
+
+describe('the directory-management module', () => {
+  it('publishes the directory’s gestures over the client its host supplied', async () => {
+    const api = fakeDirectoryApi();
+    const management = hostOver(api).resolve('directoryManagement');
+
+    await management.read();
+
+    expect(management.snapshot().people).toEqual([KAT]);
+    expect(api.readCount()).toBe(1);
+  });
+
+  it('keeps its directory resource out of a host graph', () => {
+    const host = hostOver(fakeDirectoryApi());
+
+    expect(() =>
+      (host as unknown as { resolve: (key: string) => unknown }).resolve('directory'),
+    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "directory" is not registered.');
+  });
+
+  it('names itself when a host omits the client', () => {
+    const partial = DiBag.createBuilder()
+      .installModule(directoryManagementModule)
+      .register({
+        isActiveReader: DiBag.fromSyncFactory((): (() => boolean) => () => true),
+      }) as unknown as { build: () => { resolve: (key: string) => unknown } };
+    const host = partial.build();
+
+    expect(() => host.resolve('directoryManagement')).toThrow(
+      `Cannot resolve "${DIRECTORY_MANAGEMENT_LABEL}/directory": dependency "directoryApi" is not registered.`,
+    );
+  });
+
+  it('withdraws the directory with its host’s reader', async () => {
+    const api = fakeDirectoryApi();
+    let active = true;
+    const management = hostOver(api, () => active).resolve('directoryManagement');
+    await management.read();
+    const shown = management.snapshot();
+
+    active = false;
+    await management.read();
+    management.addTag('legal', () => undefined);
+    await management.settled();
+
+    expect(api.readCount()).toBe(1);
+    expect(api.creates).toEqual([]);
+    expect(management.snapshot()).toBe(shown);
+  });
+
+  it('declares the identifier its module index will carry', () => {
+    expect(DIRECTORY_MANAGEMENT_MODULE_ID).toBe(`module.${DIRECTORY_MANAGEMENT_LABEL}`);
+  });
+});
diff --git a/apps/wbs/fe-01/src/modules/directory/directory.resource.test.ts b/apps/wbs/fe-01/src/modules/directory/directory.resource.test.ts
index 5d1f1dbfd..d121df5f3 100644
--- a/apps/wbs/fe-01/src/modules/directory/directory.resource.test.ts
+++ b/apps/wbs/fe-01/src/modules/directory/directory.resource.test.ts
@@ -9,7 +9,7 @@ const USED: DirectoryUsage = { projects: [], members: [{ id: 'p1', name: 'Kat' }

 test('a read installs all five vocabularies', async () => {
   const api = fakeDirectoryApi();
-  const directory = createDirectory(api);
+  const directory = createDirectory(api, () => true);

   expect(directory.snapshot().people).toEqual([]);
   await directory.read();
@@ -19,7 +19,7 @@ test('a read installs all five vocabularies', async () => {

 test('the snapshot is the same object until something changed', async () => {
   const api = fakeDirectoryApi();
-  const directory = createDirectory(api);
+  const directory = createDirectory(api, () => true);
   const before = directory.snapshot();

   expect(directory.snapshot()).toBe(before);
@@ -31,7 +31,7 @@ test('the snapshot is the same object until something changed', async () => {

 test('a refusal that says nothing new replaces no snapshot and wakes nobody', () => {
   const api = fakeDirectoryApi();
-  const directory = createDirectory(api);
+  const directory = createDirectory(api, () => true);
   let told = 0;
   directory.subscribe(() => {
     told += 1;
@@ -49,7 +49,7 @@ test('a refusal that says nothing new replaces no snapshot and wakes nobody', ()

 test('subscribers are told once a read has installed, and not after they drop', async () => {
   const api = fakeDirectoryApi();
-  const directory = createDirectory(api);
+  const directory = createDirectory(api, () => true);
   let told = 0;
   const drop = directory.subscribe(() => {
     told += 1;
@@ -73,7 +73,7 @@ test('only the newest read may install', async () => {
     new Promise<PersonView[]>((answer) => {
       pending.push(answer);
     });
-  const directory = createDirectory(api);
+  const directory = createDirectory(api, () => true);

   const first = directory.read();
   const second = directory.read();
@@ -91,7 +91,7 @@ test('only the newest read may install', async () => {

 test('a write raises busy, refetches, and lowers it', async () => {
   const api = fakeDirectoryApi();
-  const directory = createDirectory(api);
+  const directory = createDirectory(api, () => true);
   await directory.read();
   const before = api.readCount();

@@ -106,7 +106,7 @@ test('a write raises busy, refetches, and lowers it', async () => {

 test('a write that throws becomes a refusal, and still refetches', async () => {
   const api = fakeDirectoryApi();
-  const directory = createDirectory(api);
+  const directory = createDirectory(api, () => true);
   api.throwOnRemoval(new Error('offline'));
   await directory.read();
   const before = api.readCount();
@@ -122,7 +122,7 @@ test('a write that throws becomes a refusal, and still refetches', async () => {

 test('a refetch that throws becomes a refusal, and busy still falls', async () => {
   const api = fakeDirectoryApi();
-  const directory = createDirectory(api);
+  const directory = createDirectory(api, () => true);
   await directory.read();
   api.listPeople = () => Promise.reject(new Error('offline'));

@@ -134,7 +134,7 @@ test('a refetch that throws becomes a refusal, and busy still falls', async () =

 test('a removal is passed the cascade it was given', async () => {
   const api = fakeDirectoryApi();
-  const directory = createDirectory(api);
+  const directory = createDirectory(api, () => true);
   api.refuseRemovalWith(USED);

   await expect(directory.removeEntry('person', 'p1', false)).resolves.toEqual({
@@ -147,7 +147,7 @@ test('a removal is passed the cascade it was given', async () => {

 test('each kind renames through its own route', async () => {
   const api = fakeDirectoryApi();
-  const directory = createDirectory(api);
+  const directory = createDirectory(api, () => true);

   await directory.renameEntry('person', 'p1', 'Bo');
   await directory.renameEntry('team', 't1', 'Core');
@@ -160,7 +160,7 @@ test('each kind renames through its own route', async () => {

 test('a replaced client keeps everything the directory already held', async () => {
   const api = fakeDirectoryApi();
-  const directory = createDirectory(api);
+  const directory = createDirectory(api, () => true);
   await directory.read();
   expect(directory.snapshot().people).toEqual([KAT]);

diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.model.test.ts b/apps/wbs/fe-01/src/runtime/session-runtime.model.test.ts
new file mode 100644
index 000000000..d4831ea8f
--- /dev/null
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.model.test.ts
@@ -0,0 +1,708 @@
+import fc from 'fast-check';
+import { describe, expect, it } from 'vitest';
+
+import type { DirectoryApi, PersonView } from '@/lib/wbs-api';
+import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
+import type { DirectorySnapshot } from '@/modules/directory-management/contract';
+import { projectServicesOver } from '@/modules/project/composition';
+import type { ProjectRuntime, ProjectSource } from '@/modules/project/contract';
+import { fakeProjectApi } from '@/testing/fake-project-api';
+
+import { PartialAcquisitionError } from './lifetime-slot';
+import { installProjectRuntime } from './project-runtime';
+import {
+  createSessionOwner,
+  installSessionRuntime,
+  type SessionOwner,
+  type SessionRuntime,
+} from './session-runtime';
+
+/** One project runtime a session built, and how often it was given back. */
+interface BuiltProject {
+  readonly name: string;
+  readonly runtime: ProjectRuntime;
+  closes: number;
+}
+
+/**
+ * One session runtime the owner built, and everything the world did to it.
+ *
+ * Each runtime gets a client of its own, so every request and every answer is
+ * attributed to the session that made it, and its people are named after its
+ * own user — a directory holding anybody else's is a read that crossed a
+ * switch.
+ */
+interface Built {
+  readonly name: string;
+  userId: string;
+  readonly client: DirectoryApi;
+  runtime: SessionRuntime | null;
+  /** Requests its client received, reads and writes alike. */
+  calls: number;
+  /** How often its close was asked for, and whether one has finished. */
+  closes: number;
+  closed: boolean;
+  /** What its directory held when it was built, before anybody could see it. */
+  initial: DirectorySnapshot | null;
+  /** What it held at the instant it was withdrawn, or `null` while it has not been. */
+  frozen: DirectorySnapshot | null;
+  readonly projects: BuiltProject[];
+  /** Whether its installation acquires everything and then fails as a partial acquisition. */
+  readonly broken: boolean;
+  /** How often it was installed, and how often a failed installation was released. */
+  installs: number;
+  releases: number;
+}
+
+const ran: Record<string, number> = {};
+function note(kind: string): void {
+  ran[kind] = (ran[kind] ?? 0) + 1;
+}
+const COMMAND_KINDS: readonly string[] = [
+  'signIn',
+  'signOut',
+  'answer',
+  'drain',
+  'read',
+  'gesture',
+  'openProject',
+  'leaveProject',
+  'signInBroken',
+  'reenter',
+];
+const reached = {
+  answerLandedAfterWithdrawal: 0,
+  readByWithdrawn: 0,
+  gestureByWithdrawn: 0,
+  projectOpenedUnderWithdrawn: 0,
+  projectCurrentAtWithdrawal: 0,
+  sameUserAgain: 0,
+  switchedWhileLive: 0,
+  leftWhileNothingCurrent: 0,
+  reenteredFromListener: 0,
+  brokenInstalled: 0,
+  leftAfterBroken: 0,
+};
+
+/** The reference: who the app last asked for, and how often that changed. Nothing is read back from the owner. */
+interface SessionModel {
+  wanted: string | null;
+  /** Requests that named a user other than the one already asked for. */
+  userChanges: number;
+  /** Whether the user last asked for arrived with an installation that fails. */
+  broken: boolean;
+  /** Whether any installation has failed so far. */
+  anyBroken: boolean;
+}
+
+interface SessionWorld {
+  readonly owner: SessionOwner;
+  readonly scheduler: fc.Scheduler;
+  readonly built: Built[];
+  readonly byClient: Map<DirectoryApi, Built>;
+  readonly inflight: Promise<unknown>[];
+  next: number;
+  projectsBuilt: number;
+}
+
+/** The credential the model hands a sign-in whose installation it makes fail. */
+const BROKEN = 'broken';
+
+/** A fresh client for one runtime: every call counted, every read answered when the scheduler says. */
+function clientFor(world: SessionWorld, credential: string): DirectoryApi {
+  world.next += 1;
+  const base = fakeDirectoryApi();
+  const record: Built = {
+    name: `s${String(world.next)}`,
+    userId: '',
+    client: base,
+    runtime: null,
+    calls: 0,
+    closes: 0,
+    closed: false,
+    initial: null,
+    frozen: null,
+    projects: [],
+    broken: credential === BROKEN,
+    installs: 0,
+    releases: 0,
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
+  const own = (): PersonView[] => [
+    { id: record.userId, name: record.userId, kind: 'person', teamIds: [] },
+  ];
+  const client: DirectoryApi = {
+    ...base,
+    listPeople: () => gate('people', () => Promise.resolve(own())),
+    listTeams: () => gate('teams', () => base.listTeams()),
+    listTags: () => gate('tags', () => base.listTags()),
+    listServices: () => gate('services', () => base.listServices()),
+    listWorkItemTypes: () => gate('types', () => base.listWorkItemTypes()),
+    addTag: (name) => {
+      record.calls += 1;
+      return base.addTag(name);
+    },
+  };
+  world.built.push(record);
+  world.byClient.set(client, record);
+  return client;
+}
+
+/** A project source over a fresh client; project reads answer at once. */
+function projectSource(): ProjectSource {
+  return { services: projectServicesOver(fakeProjectApi()), subscribe: undefined };
+}
+
+/** Records, at the instant before a withdrawal is asked for, what the current session held. */
+function freezeTheCurrent(world: SessionWorld): void {
+  for (const record of world.built) {
+    const runtime = record.runtime;
+    if (runtime?.isCurrent() !== true) continue;
+    record.frozen = runtime.directory.snapshot();
+    if (record.projects.some((project) => project.runtime.isCurrent())) {
+      reached.projectCurrentAtWithdrawal += 1;
+    }
+  }
+}
+
+/** Every session runtime that answers that it is current. */
+function currentOf(world: SessionWorld): Built[] {
+  return world.built.filter((record) => record.runtime?.isCurrent() === true);
+}
+
+/** The invariants that hold at every observation point, whatever is still in flight. */
+function assertOwnership(world: SessionWorld, model: SessionModel, what: string): void {
+  const current = currentOf(world);
+  expect(
+    current.map((record) => record.name),
+    `${what}: more than one session says it is current`,
+  ).toHaveLength(Math.min(current.length, 1));
+  const state = world.owner.snapshot();
+  for (const record of current) {
+    expect(
+      state.status === 'live' && state.services === record.runtime,
+      `${what}: ${record.name} says it is current but is not the one published`,
+    ).toBe(true);
+  }
+  if (state.status === 'live') {
+    expect(
+      state.services.userId,
+      `${what}: the published session is not the user last asked for`,
+    ).toBe(model.wanted);
+  }
+  for (const record of world.built) {
+    const runtime = record.runtime;
+    if (runtime === null) continue;
+    for (const project of record.projects) {
+      if (!project.runtime.isCurrent()) continue;
+      expect(
+        runtime.isCurrent(),
+        `${what}: ${project.name} is current while its session ${record.name} is not`,
+      ).toBe(true);
+    }
+    if (runtime.isCurrent()) continue;
+    const expected = record.frozen ?? record.initial;
+    expect(
+      runtime.directory.snapshot() === expected,
+      `${what}: ${record.name}'s directory changed after it was withdrawn`,
+    ).toBe(true);
+  }
+}
+
+/** After a withdrawal: nothing of any session, or of any of its projects, is current. */
+function assertWithdrawn(world: SessionWorld, what: string): void {
+  expect(
+    currentOf(world).map((record) => record.name),
+    `${what}: a session is still current after withdrawal`,
+  ).toEqual([]);
+  const projects = world.built.flatMap((record) =>
+    record.projects.filter((project) => project.runtime.isCurrent()),
+  );
+  expect(
+    projects.map((project) => project.name),
+    `${what}: a project is still current after its session was withdrawn`,
+  ).toEqual([]);
+}
+
+type SessionCommand = fc.AsyncCommand<SessionModel, SessionWorld>;
+
+class SignIn implements SessionCommand {
+  constructor(
+    readonly userId: string,
+    readonly credential: string,
+  ) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: SessionModel, world: SessionWorld): Promise<void> {
+    note('signIn');
+    const another = model.wanted !== this.userId;
+    if (!another) reached.sameUserAgain += 1;
+    if (another && world.owner.snapshot().status === 'live') reached.switchedWhileLive += 1;
+    if (another) {
+      freezeTheCurrent(world);
+      model.userChanges += 1;
+    }
+    world.inflight.push(world.owner.open({ userId: this.userId, credential: this.credential }));
+    model.wanted = this.userId;
+    if (another) model.broken = false;
+    if (another) assertWithdrawn(world, `signIn(${this.userId})`);
+    assertOwnership(world, model, `signIn(${this.userId}, '${this.credential}')`);
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `signIn(${this.userId}, '${this.credential}')`;
+  }
+}
+
+class SignOut implements SessionCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(model: SessionModel, world: SessionWorld): Promise<void> {
+    note('signOut');
+    if (world.owner.snapshot().status !== 'live') reached.leftWhileNothingCurrent += 1;
+    freezeTheCurrent(world);
+    const before = world.built.filter((record) => record.runtime !== null);
+    const leaving = world.owner.leave();
+    if (model.anyBroken) reached.leftAfterBroken += 1;
+    model.wanted = null;
+    model.broken = false;
+    assertWithdrawn(world, 'signOut');
+    // A leave settles only once the retirement it joined has run: every session
+    // built before it has been given back by then, however many triggers asked.
+    world.inflight.push(
+      leaving.then(() => {
+        for (const record of before) {
+          expect(record.closed, `signOut settled before ${record.name}'s retirement had run`).toBe(
+            true,
+          );
+        }
+      }),
+    );
+    await Promise.resolve();
+  }
+  toString(): string {
+    return 'signOut';
+  }
+}
+
+/**
+ * A sign-in whose runtime cannot be built: its installation acquires the whole
+ * graph and then throws a partial acquisition, whose release is recorded.
+ */
+class SignInBroken implements SessionCommand {
+  constructor(readonly userId: string) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: SessionModel, world: SessionWorld): Promise<void> {
+    note('signInBroken');
+    const another = model.wanted !== this.userId;
+    if (another) {
+      freezeTheCurrent(world);
+      model.userChanges += 1;
+    }
+    world.inflight.push(world.owner.open({ userId: this.userId, credential: BROKEN }));
+    if (another) {
+      model.wanted = this.userId;
+      model.broken = true;
+      model.anyBroken = true;
+      assertWithdrawn(world, `signInBroken(${this.userId})`);
+    }
+    assertOwnership(world, model, `signInBroken(${this.userId})`);
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `signInBroken(${this.userId})`;
+  }
+}
+
+/**
+ * A reader that signs a user in from inside the owner's own notification — as
+ * a component re-rendered by the owner's store would — the next time the owner
+ * says anything.
+ */
+class ReenterFromListener implements SessionCommand {
+  constructor(readonly userId: string) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: SessionModel, world: SessionWorld): Promise<void> {
+    note('reenter');
+    let asked = false;
+    const stop = world.owner.subscribe(() => {
+      if (asked) return;
+      asked = true;
+      stop();
+      reached.reenteredFromListener += 1;
+      const another = model.wanted !== this.userId;
+      if (another) {
+        freezeTheCurrent(world);
+        model.userChanges += 1;
+      }
+      world.inflight.push(world.owner.open({ userId: this.userId, credential: '' }));
+      if (!another) return;
+      model.wanted = this.userId;
+      model.broken = false;
+      // A failure here is carried to the teardown, which awaits it: a listener's
+      // own throw would reach nobody.
+      try {
+        assertWithdrawn(world, `reenter(${this.userId})`);
+      } catch (refusal: unknown) {
+        world.inflight.push(
+          Promise.reject(refusal instanceof Error ? refusal : new Error(String(refusal))),
+        );
+      }
+    });
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `reenter(${this.userId})`;
+  }
+}
+
+/** One scheduled answer or step, in the order fast-check chooses. */
+class Answer implements SessionCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(model: SessionModel, world: SessionWorld): Promise<void> {
+    note('answer');
+    if (world.scheduler.count() > 0) await world.scheduler.waitNext(1);
+    else await Promise.resolve();
+    assertOwnership(world, model, 'answer');
+  }
+  toString(): string {
+    return 'answer';
+  }
+}
+
+/** Every answer still out, in the order fast-check chooses: a reader who waits. */
+class Drain implements SessionCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(model: SessionModel, world: SessionWorld): Promise<void> {
+    note('drain');
+    await world.scheduler.waitIdle();
+    assertOwnership(world, model, 'drain');
+  }
+  toString(): string {
+    return 'drain';
+  }
+}
+
+/** Picks one built session whatever its state: a captured reader does not know it was left. */
+function pick(world: SessionWorld, index: number): Built | null {
+  const candidates = world.built.filter((record) => record.runtime !== null);
+  if (candidates.length === 0) return null;
+  return candidates[index % candidates.length] ?? null;
+}
+
+/** A page that kept a session's directory, and reads it now — an arrival, a focus. */
+class Read implements SessionCommand {
+  constructor(readonly index: number) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: SessionModel, world: SessionWorld): Promise<void> {
+    note('read');
+    const record = pick(world, this.index);
+    const runtime = record?.runtime ?? null;
+    if (record === null || runtime === null) return;
+    const withdrawn = !runtime.isCurrent();
+    const before = record.calls;
+    world.inflight.push(runtime.directory.read().catch(runtime.directory.reportFailedRead));
+    if (withdrawn) {
+      reached.readByWithdrawn += 1;
+      expect(record.calls - before, `read: withdrawn ${record.name} sent a request`).toBe(0);
+    }
+    await Promise.resolve();
+    assertOwnership(world, model, `read(${record.name})`);
+  }
+  toString(): string {
+    return `read(${String(this.index)})`;
+  }
+}
+
+/** A page that kept a session's directory, and adds a tag through it now. */
+class Gesture implements SessionCommand {
+  constructor(readonly index: number) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: SessionModel, world: SessionWorld): Promise<void> {
+    note('gesture');
+    const record = pick(world, this.index);
+    const runtime = record?.runtime ?? null;
+    if (record === null || runtime === null) return;
+    const withdrawn = !runtime.isCurrent();
+    const before = record.calls;
+    runtime.directory.addTag('legal', () => undefined);
+    world.inflight.push(runtime.directory.settled());
+    if (withdrawn) {
+      reached.gestureByWithdrawn += 1;
+      expect(record.calls - before, `gesture: withdrawn ${record.name} sent a request`).toBe(0);
+    }
+    await Promise.resolve();
+    assertOwnership(world, model, `gesture(${record.name})`);
+  }
+  toString(): string {
+    return `gesture(${String(this.index)})`;
+  }
+}
+
+/** A project page that kept a session's project owner, and opens a project through it now. */
+class OpenProject implements SessionCommand {
+  constructor(
+    readonly index: number,
+    readonly projectId: string,
+  ) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: SessionModel, world: SessionWorld): Promise<void> {
+    note('openProject');
+    const record = pick(world, this.index);
+    const runtime = record?.runtime ?? null;
+    if (record === null || runtime === null) return;
+    if (!runtime.isCurrent()) reached.projectOpenedUnderWithdrawn += 1;
+    world.inflight.push(runtime.projects.open(this.projectId, projectSource()));
+    await Promise.resolve();
+    assertOwnership(world, model, `openProject(${record.name}, ${this.projectId})`);
+  }
+  toString(): string {
+    return `openProject(${String(this.index)}, ${this.projectId})`;
+  }
+}
+
+/** A project page that goes: its effect leaves the session's project. */
+class LeaveProject implements SessionCommand {
+  constructor(readonly index: number) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: SessionModel, world: SessionWorld): Promise<void> {
+    note('leaveProject');
+    const record = pick(world, this.index);
+    const runtime = record?.runtime ?? null;
+    if (record === null || runtime === null) return;
+    world.inflight.push(runtime.projects.leave());
+    await Promise.resolve();
+    assertOwnership(world, model, `leaveProject(${record.name})`);
+  }
+  toString(): string {
+    return `leaveProject(${String(this.index)})`;
+  }
+}
+
+const commandsArb = fc.commands<SessionModel, SessionWorld, false>(
+  [
+    fc
+      .tuple(fc.constantFrom('u1', 'u2'), fc.constantFrom('', 't'))
+      .map(([userId, credential]) => new SignIn(userId, credential)),
+    fc.constant(new SignOut()),
+    fc.constant(new Answer()),
+    fc.constant(new Answer()),
+    fc.constant(new Drain()),
+    fc.nat(6).map((index) => new Read(index)),
+    fc.nat(6).map((index) => new Gesture(index)),
+    fc
+      .tuple(fc.nat(6), fc.constantFrom('p1', 'p2'))
+      .map(([index, projectId]) => new OpenProject(index, projectId)),
+    fc.nat(6).map((index) => new LeaveProject(index)),
+    fc.constantFrom('u1', 'u2').map((userId) => new SignInBroken(userId)),
+    fc.constantFrom('u1', 'u2').map((userId) => new ReenterFromListener(userId)),
+  ],
+  { maxCommands: 24, size: 'max' },
+);
+
+/**
+ * The session owner, run against a reference model.
+ *
+ * The record this executes is section 3 of
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-i-session-runtime.md`.
+ */
+describe('the session owner, against a reference model', () => {
+  it('keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody', async () => {
+    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');
+
+    await fc.assert(
+      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
+        const model: SessionModel = {
+          wanted: null,
+          userChanges: 0,
+          broken: false,
+          anyBroken: false,
+        };
+        const world: SessionWorld = {
+          owner: createSessionOwner({
+            clientFor: (credential) => clientFor(world, credential),
+            install: (dependencies) => {
+              const record = world.byClient.get(dependencies.directoryApi);
+              if (record === undefined) throw new Error('a session was installed from no client');
+              record.userId = dependencies.userId;
+              record.installs += 1;
+              const installed = installSessionRuntime({
+                ...dependencies,
+                // The session's own wiring wraps this, so the project runtimes it
+                // builds are the real ones, attributed to the session that built them.
+                installProject: (projectDependencies) => {
+                  world.projectsBuilt += 1;
+                  const project = installProjectRuntime(projectDependencies);
+                  const built: BuiltProject = {
+                    name: `${record.name}.p${String(world.projectsBuilt)}`,
+                    runtime: project.services,
+                    closes: 0,
+                  };
+                  record.projects.push(built);
+                  return {
+                    services: project.services,
+                    close: async (options) => {
+                      built.closes += 1;
+                      await project.close(options);
+                    },
+                  };
+                },
+              });
+              if (record.broken) {
+                reached.brokenInstalled += 1;
+                // Everything was acquired, and then the construction failed: the
+                // release is the real close, counted, and nothing is published.
+                throw new PartialAcquisitionError(
+                  new Error(`${record.name} could not be built`),
+                  async (options) => {
+                    record.releases += 1;
+                    await installed.close(options);
+                  },
+                );
+              }
+              record.runtime = installed.services;
+              record.initial = installed.services.directory.snapshot();
+              // The real close, reached when the scheduler says: a retirement that
+              // takes time is what opens the interval between withdrawal and
+              // disposal, in which a late answer, a captured read or a gesture, or a
+              // page's late project, can still arrive.
+              return {
+                services: installed.services,
+                close: async (options) => {
+                  record.closes += 1;
+                  await scheduler.schedule(Promise.resolve(), `${record.name} retires`);
+                  await installed.close(options);
+                  record.closed = true;
+                },
+              };
+            },
+          }),
+          scheduler,
+          built: [],
+          byClient: new Map(),
+          inflight: [],
+          next: 0,
+          projectsBuilt: 0,
+        };
+        let failure: Error | null = null;
+        try {
+          await fc.asyncModelRun<SessionModel, SessionWorld, false, SessionModel>(
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
+          assertOwnership(world, model, 'teardown');
+          const state = world.owner.snapshot();
+          if (model.wanted === null && model.anyBroken) {
+            // A retirement asked of a slot that a failed construction left fatal
+            // holds nothing and changes nothing; which request was the last to
+            // build is the scheduler's choice. Either way nothing is held.
+            expect(
+              state.status === 'empty' || (state.status === 'fatal' && !state.terminal),
+              `teardown: left after an unbuildable session, but the owner is ${state.status}`,
+            ).toBe(true);
+          } else if (model.wanted === null) {
+            expect(state.status, 'teardown: left, but a session is still held').toBe('empty');
+          } else if (model.broken) {
+            expect(
+              state.status === 'fatal' && !state.terminal,
+              `teardown: the last user asked for cannot be built, but the owner is ${state.status}`,
+            ).toBe(true);
+          } else {
+            expect(
+              state.status === 'live' ? state.services.userId : state.status,
+              'teardown: the last user asked for is not the one live',
+            ).toBe(model.wanted);
+          }
+          const installs = world.built.reduce((sum, record) => sum + record.installs, 0);
+          expect(
+            installs,
+            'teardown: a session was built for a user already signed in',
+          ).toBeLessThanOrEqual(model.userChanges);
+          const live = state.status === 'live' ? state.services : null;
+          for (const record of world.built) {
+            if (record.broken) {
+              // Acquired, then given back by the transaction, once per installation.
+              expect(
+                record.releases,
+                `teardown: unbuildable ${record.name} was released ${String(record.releases)} times after ${String(record.installs)} installs`,
+              ).toBe(record.installs);
+              continue;
+            }
+            if (record.runtime === null) continue;
+            const isLive = record.runtime === live;
+            expect(
+              record.closes,
+              `teardown: ${record.name} was retired ${String(record.closes)} times, live=${String(isLive)}`,
+            ).toBe(isLive ? 0 : 1);
+            if (isLive) continue;
+            expect(
+              record.runtime.projects.snapshot().status,
+              `teardown: ${record.name} was retired while its project owner still held one`,
+            ).not.toBe('live');
+            for (const project of record.projects) {
+              expect(
+                project.closes,
+                `teardown: ${project.name} of retired ${record.name} was given back ${String(project.closes)} times`,
+              ).toBe(1);
+            }
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
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.test.ts b/apps/wbs/fe-01/src/runtime/session-runtime.test.ts
new file mode 100644
index 000000000..2fc4eb1cb
--- /dev/null
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.test.ts
@@ -0,0 +1,203 @@
+import { describe, expect, it } from 'vitest';
+
+import type { DirectoryApi } from '@/lib/wbs-api';
+import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
+import { projectServicesOver } from '@/modules/project/composition';
+import type { ProjectRuntime, ProjectSource } from '@/modules/project/contract';
+import { fakeProjectApi } from '@/testing/fake-project-api';
+
+import { PartialAcquisitionError, type RetirableRuntime } from './lifetime-slot';
+import { installProjectRuntime, type ProjectRuntimeDependencies } from './project-runtime';
+import { createSessionOwner, installSessionRuntime } from './session-runtime';
+
+/** A project source over a fresh fake client, with no socket. */
+const projectSource = (): ProjectSource => ({
+  services: projectServicesOver(fakeProjectApi()),
+  subscribe: undefined,
+});
+
+/** The real project installer, recording every close and what order things happened in. */
+function recordedProjects(
+  events: string[],
+  closeWith: () => Promise<void> = () => Promise.resolve(),
+) {
+  return (dependencies: ProjectRuntimeDependencies): RetirableRuntime<ProjectRuntime> => {
+    const installed = installProjectRuntime(dependencies);
+    events.push(`project ${dependencies.projectId} opened`);
+    return {
+      services: installed.services,
+      close: async (options) => {
+        events.push(`project ${dependencies.projectId} closed`);
+        await closeWith();
+        await installed.close(options);
+      },
+    };
+  };
+}
+
+/** A client per credential, remembering which credentials asked for one. */
+function clientsByCredential() {
+  const asked: string[] = [];
+  return {
+    asked,
+    clientFor: (credential: string): DirectoryApi => {
+      asked.push(credential);
+      return fakeDirectoryApi();
+    },
+  };
+}
+
+describe('the session runtime', () => {
+  it('publishes the session’s directory and its projects, and nothing else', async () => {
+    const runtime = installSessionRuntime({
+      userId: 'u1',
+      directoryApi: fakeDirectoryApi(),
+      isCurrent: () => true,
+      installProject: installProjectRuntime,
+      budgetMs: 1_000,
+    });
+
+    // Enumerated rather than trusted to the type: an object with one more member
+    // still satisfies `SessionRuntime`, and that member would reach the router.
+    expect(Object.keys(runtime.services).sort()).toEqual([
+      'directory',
+      'isCurrent',
+      'projects',
+      'userId',
+    ]);
+    await runtime.close({ timeoutMs: 1_000 });
+  });
+
+  it('keeps one runtime for one user whatever credential arrives, and replaces it for another', async () => {
+    const clients = clientsByCredential();
+    const owner = createSessionOwner({ clientFor: clients.clientFor, budgetMs: 1_000 });
+
+    await owner.open({ userId: 'u1', credential: '' });
+    const first = owner.snapshot();
+    if (first.status !== 'live') throw new Error(`u1 was not published: ${first.status}`);
+    await owner.open({ userId: 'u1', credential: 't' });
+
+    expect(owner.snapshot()).toBe(first);
+    expect(first.services.isCurrent()).toBe(true);
+    expect(clients.asked).toEqual(['']);
+
+    const switching = owner.open({ userId: 'u2', credential: '' });
+    expect(first.services.isCurrent()).toBe(false);
+    await switching;
+    const second = owner.snapshot();
+    expect(second.status === 'live' ? second.services.userId : second.status).toBe('u2');
+    expect(clients.asked).toEqual(['', '']);
+  });
+
+  it('retires the session’s project before the session, and opens none once it is withdrawn', async () => {
+    const events: string[] = [];
+    const owner = createSessionOwner({
+      clientFor: () => fakeDirectoryApi(),
+      installProject: recordedProjects(events),
+      budgetMs: 1_000,
+    });
+    await owner.open({ userId: 'u1', credential: '' });
+    const opened = owner.snapshot();
+    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
+    const session = opened.services;
+    await session.projects.open('p1', projectSource());
+    const project = session.projects.snapshot();
+    if (project.status !== 'live') throw new Error(`p1 was not published: ${project.status}`);
+
+    const leaving = owner.leave();
+    expect(project.services.isCurrent()).toBe(false);
+    await leaving;
+
+    expect(events).toEqual(['project p1 opened', 'project p1 closed']);
+    expect(session.projects.snapshot().status).toBe('empty');
+    expect(owner.snapshot().status).toBe('empty');
+
+    await session.projects.open('p2', projectSource());
+    expect(events).toEqual(['project p1 opened', 'project p1 closed']);
+    expect(session.projects.snapshot().status).toBe('empty');
+  });
+
+  it('fails the session’s retirement when its project will not let go', async () => {
+    const events: string[] = [];
+    const owner = createSessionOwner({
+      clientFor: () => fakeDirectoryApi(),
+      installProject: recordedProjects(events, () =>
+        Promise.reject(new Error('the socket would not close')),
+      ),
+      budgetMs: 1_000,
+    });
+    await owner.open({ userId: 'u1', credential: '' });
+    const opened = owner.snapshot();
+    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
+    await opened.services.projects.open('p1', projectSource());
+
+    await expect(owner.leave()).resolves.toBeUndefined();
+
+    const left = owner.snapshot();
+    expect(left.status === 'fatal' && left.terminal).toBe(true);
+    await expect(owner.open({ userId: 'u2', credential: '' })).resolves.toBeUndefined();
+    expect(owner.snapshot()).toBe(left);
+  });
+
+  it('settles a half-built session that cannot be released, and leaves the owner terminally fatal', async () => {
+    const owner = createSessionOwner({
+      clientFor: () => fakeDirectoryApi(),
+      install: () => {
+        throw new PartialAcquisitionError(new Error('the directory could not be built'), () =>
+          Promise.reject(new Error('and what it took could not be given back')),
+        );
+      },
+      budgetMs: 1_000,
+    });
+
+    await expect(owner.open({ userId: 'u1', credential: '' })).resolves.toBeUndefined();
+
+    const state = owner.snapshot();
+    expect(state.status === 'fatal' && state.terminal).toBe(true);
+  });
+
+  it('settles a request a newer one overtook, and builds nothing for it', async () => {
+    const clients = clientsByCredential();
+    const owner = createSessionOwner({ clientFor: clients.clientFor, budgetMs: 1_000 });
+
+    const overtaken = owner.open({ userId: 'u1', credential: 'first' });
+    const winner = owner.open({ userId: 'u2', credential: 'second' });
+
+    await expect(overtaken).resolves.toBeUndefined();
+    await winner;
+    expect(clients.asked).toEqual(['second']);
+  });
+
+  it('settles a second leave only once the retirement it joined has run', async () => {
+    const events: string[] = [];
+    let letGo: () => void = () => undefined;
+    const owner = createSessionOwner({
+      clientFor: () => fakeDirectoryApi(),
+      installProject: recordedProjects(
+        events,
+        () =>
+          new Promise<void>((resolve) => {
+            letGo = resolve;
+          }),
+      ),
+      budgetMs: 1_000,
+    });
+    await owner.open({ userId: 'u1', credential: '' });
+    const opened = owner.snapshot();
+    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
+    await opened.services.projects.open('p1', projectSource());
+
+    const first = owner.leave();
+    let secondSettled = false;
+    const second = owner.leave().then(() => {
+      secondSettled = true;
+    });
+    await Promise.resolve();
+    await Promise.resolve();
+
+    expect(secondSettled).toBe(false);
+    letGo();
+    await Promise.all([first, second]);
+    expect(owner.snapshot().status).toBe('empty');
+  });
+});
```

### 7.3 the resource's guard, `module.ts` (**new**), the contract, `session-runtime.ts` (**new**), `composition.ts` and `vitest.node-suites.ts` — slice 1

```diff
diff --git a/apps/wbs/fe-01/src/modules/directory-management/composition.ts b/apps/wbs/fe-01/src/modules/directory-management/composition.ts
index 8e01b3ebb..202624e93 100644
--- a/apps/wbs/fe-01/src/modules/directory-management/composition.ts
+++ b/apps/wbs/fe-01/src/modules/directory-management/composition.ts
@@ -14,7 +14,7 @@ import { createDirectoryManagement } from './directory-management.feature';
  * take this over; until then it is two lines.
  */
 export function directoryManagementOver(api: DirectoryApi): DirectoryManagement {
-  return createDirectoryManagement(createDirectory(api));
+  return createDirectoryManagement(createDirectory(api, () => true));
 }

 /** The same over the real client for one token. */
diff --git a/apps/wbs/fe-01/src/modules/directory-management/contract.ts b/apps/wbs/fe-01/src/modules/directory-management/contract.ts
index c4ef3a391..abe41850d 100644
--- a/apps/wbs/fe-01/src/modules/directory-management/contract.ts
+++ b/apps/wbs/fe-01/src/modules/directory-management/contract.ts
@@ -103,3 +103,32 @@ export interface DirectoryManagement extends Store<DirectorySnapshot> {
    */
   readonly confirmRemoval: (kind: DirectoryKind, id: string, whenGone: () => void) => void;
 }
+
+/**
+ * What a host must register to install this module: the client of the session
+ * the directory belongs to, and that session's own answer to whether its reader
+ * is still on screen.
+ *
+ * Requirements rather than private bindings, so that a host which forgets one
+ * is told which module asked — see {@link DIRECTORY_MANAGEMENT_LABEL}. There is
+ * no default for either: the client carries the session's credential, and a
+ * directory that cannot be withdrawn is one a signed-out reader could still
+ * read and write through.
+ */
+export interface DirectoryManagementRequirements {
+  readonly directoryApi: DirectoryApi;
+  readonly isActiveReader: () => boolean;
+}
+
+/**
+ * The DI Bag label this module's private bindings are named under.
+ *
+ * `frontend` is the runtime segment, not a ring: a module under an app is named
+ * by where it runs, so the wiki module identifier is
+ * {@link DIRECTORY_MANAGEMENT_MODULE_ID} and the label drops the `module.`
+ * prefix.
+ */
+export const DIRECTORY_MANAGEMENT_LABEL = 'frontend.directory-management';
+
+/** The wiki module identifier, which the module index will declare. */
+export const DIRECTORY_MANAGEMENT_MODULE_ID = 'module.frontend.directory-management';
diff --git a/apps/wbs/fe-01/src/modules/directory-management/module.ts b/apps/wbs/fe-01/src/modules/directory-management/module.ts
new file mode 100644
index 000000000..a06215225
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/directory-management/module.ts
@@ -0,0 +1,43 @@
+import { DiBag } from 'di-bag';
+
+import type { DirectoryApi } from '@/lib/wbs-api';
+import type { DirectoryResource } from '@/modules/directory/contract';
+import { createDirectory } from '@/modules/directory/directory.resource';
+
+import { DIRECTORY_MANAGEMENT_LABEL, type DirectoryManagement } from './contract';
+import { createDirectoryManagement } from './directory-management.feature';
+
+/**
+ * Directory management as a sealed DI Bag module: the one export delivery is
+ * allowed to see, over a directory resource no host can name.
+ *
+ * `directory` stays private, so rule K2 holds by construction: resolving it
+ * from a host answers `DI_BAG_MISSING_REGISTRATION`, and the page reaches the
+ * snapshot, the reads and the writes only through {@link DirectoryManagement}.
+ * Its two host requirements are named in `DirectoryManagementRequirements`; a
+ * host that forgets one is told which module asked, under
+ * {@link DIRECTORY_MANAGEMENT_LABEL}.
+ *
+ * Nothing here is disposable. The directory holds no socket and no timer; what
+ * makes it safe to leave behind is its host's `isActiveReader`, which withdraws
+ * it — nothing sent, nothing shown — the instant its session is.
+ */
+export const directoryManagementModule = DiBag.createBuilder()
+  .register({
+    directory: DiBag.fromSyncFactory(
+      ({
+        directoryApi,
+        isActiveReader,
+      }: {
+        directoryApi: DirectoryApi;
+        isActiveReader: () => boolean;
+      }): DirectoryResource => createDirectory(directoryApi, isActiveReader),
+    ),
+  })
+  .register({
+    directoryManagement: DiBag.fromSyncFactory(
+      ({ directory }: { directory: DirectoryResource }): DirectoryManagement =>
+        createDirectoryManagement(directory),
+    ),
+  })
+  .buildModule(['directoryManagement'], { label: DIRECTORY_MANAGEMENT_LABEL });
diff --git a/apps/wbs/fe-01/src/modules/directory/contract.ts b/apps/wbs/fe-01/src/modules/directory/contract.ts
index d244e6f93..3e29c374f 100644
--- a/apps/wbs/fe-01/src/modules/directory/contract.ts
+++ b/apps/wbs/fe-01/src/modules/directory/contract.ts
@@ -57,6 +57,11 @@ export interface DirectorySnapshot {
  *
  * **No socket.** This service opens no subscription. A reader sees somebody
  * else's change on the next read its caller asks for.
+ *
+ * **Withdrawn with its reader.** Built with its owner's `isActiveReader`, it
+ * sends nothing and shows nothing new once that answers no: the snapshot a
+ * withdrawn directory holds is the one it held at withdrawal, whatever answers
+ * afterwards.
  */
 export interface DirectoryResource extends Store<DirectorySnapshot> {
   /**
diff --git a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
index 582bc28e6..ef4dabda8 100644
--- a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
+++ b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
@@ -16,8 +16,21 @@ const NOTHING_YET: DirectorySnapshot = {
 /** The fields the store contract's stability rule is judged over, by identity. */
 const FIELDS = ['people', 'teams', 'tags', 'services', 'workItemTypes', 'busy', 'problem'] as const;

-/** Builds the directory over one client. Nothing is read until `read` is called. */
-export function createDirectory(client: DirectoryApi): DirectoryResource {
+/**
+ * Builds the directory over one client. Nothing is read until `read` is called.
+ *
+ * `isActiveReader` is the owner's answer to "is the reader this directory was
+ * built for still the one on screen", asked synchronously at the moment
+ * anything happens. Once it says no, the directory is **withdrawn**: a read or a
+ * write asked of it sends nothing, and an answer that lands afterwards — a late
+ * read, a write's refetch, a refusal — changes nothing a reader could see. The
+ * session runtime wires it to its own currency; a directory no lifetime owns is
+ * handed one that always says yes.
+ */
+export function createDirectory(
+  client: DirectoryApi,
+  isActiveReader: () => boolean,
+): DirectoryResource {
   // A `let` and not a parameter read directly, so `replaceClient` can point every
   // closure below at a different client without rebuilding any of them — which is
   // what keeps the snapshot across a replacement.
@@ -33,6 +46,7 @@ export function createDirectory(client: DirectoryApi): DirectoryResource {
    * a React render would fail the cached-snapshot check outright.
    */
   const show = (next: Partial<DirectorySnapshot>): void => {
+    if (!isActiveReader()) return;
     const merged: DirectorySnapshot = { ...shown, ...next };
     // Proof: deleting this early return made `a refusal that says nothing new
     // replaces no snapshot and wakes nobody` fail its object-identity assertion.
@@ -86,6 +100,7 @@ export function createDirectory(client: DirectoryApi): DirectoryResource {
   };

   const read = async (): Promise<void> => {
+    if (!isActiveReader()) return;
     const generation = latestRead + 1;
     latestRead = generation;
     const [foundPeople, foundTeams, foundTags, foundServices, foundWorkItemTypes] =
@@ -117,6 +132,7 @@ export function createDirectory(client: DirectoryApi): DirectoryResource {
   };

   const runWrite = (change: () => Promise<void>): Promise<void> => {
+    if (!isActiveReader()) return Promise.resolve();
     const ran = (async () => {
       show({ busy: true, problem: null });
       try {
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
new file mode 100644
index 000000000..f316694e4
--- /dev/null
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -0,0 +1,346 @@
+import { DiBag } from 'di-bag';
+
+import { type DirectoryApi, httpDirectoryApi } from '@/lib/wbs-api';
+import type { DirectoryManagement } from '@/modules/directory-management/contract';
+import { directoryManagementModule } from '@/modules/directory-management/module';
+import type { ProjectRuntime } from '@/modules/project/contract';
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
+import {
+  createProjectOwner,
+  installProjectRuntime,
+  type ProjectOwner,
+  type ProjectRuntimeDependencies,
+} from './project-runtime';
+
+/**
+ * Who is signed in, as the session runtime is keyed and built from it.
+ *
+ * `userId` is the **key**: the account's id, never its username, which a rename
+ * changes, and never the credential. `credential` is only an **adapter input** —
+ * the directory's client is built from it and nothing else reads it — and it is
+ * empty for an identity restored from the access cookie at startup, which a
+ * same-origin request carries by itself.
+ */
+export interface SessionIdentity {
+  readonly userId: string;
+  readonly credential: string;
+}
+
+/**
+ * The services of one signed-in identity, for as long as its runtime is the one
+ * published — and nothing else (rule K2).
+ *
+ * No bag, no client, no credential and no directory resource is reachable from
+ * here; the runtime's own suite enumerates this surface rather than trusting
+ * the type.
+ *
+ * **`isCurrent`** turns false the instant the owner withdraws this runtime —
+ * another user signing in, or the session being left — before its disposal
+ * starts, and never turns true again. The directory and every project runtime
+ * this session owns answer from it.
+ */
+export interface SessionRuntime {
+  readonly userId: string;
+  /** Whether this runtime is still the one its owner publishes. */
+  readonly isCurrent: () => boolean;
+  /** The account-wide directory, as the gestures a person names. */
+  readonly directory: DirectoryManagement;
+  /**
+   * The owner of this session's selected project: a project is opened through
+   * it, and only while this session is current, and the session's retirement
+   * retires it first.
+   */
+  readonly projects: ProjectOwner;
+}
+
+/** What one session runtime is installed from. */
+export interface SessionRuntimeDependencies {
+  readonly userId: string;
+  /** The client cut from the identity's credential; the directory's only way out. */
+  readonly directoryApi: DirectoryApi;
+  /**
+   * Whether this runtime is still the one its owner publishes, asked
+   * synchronously at the moment anything happens — the owner's answer, not the
+   * runtime's, because withdrawal happens in the owner.
+   */
+  readonly isCurrent: () => boolean;
+  /** How this session's project runtimes are installed. Production passes the real one. */
+  readonly installProject: (
+    dependencies: ProjectRuntimeDependencies,
+  ) => RetirableRuntime<ProjectRuntime>;
+  /** The bounded wait this session gives its project's retirement. */
+  readonly budgetMs: number;
+}
+
+/**
+ * A session whose selected project could not be given back.
+ *
+ * Thrown from the session's own disposal, so the session's retirement fails
+ * too: a session that let go while its project still held a socket would be
+ * the overlap this change exists to refuse. The project's own owner has already
+ * disclosed its fault; this one says only which lifetime it stopped.
+ */
+export class SessionProjectRetirementError extends Error {
+  constructor() {
+    super('the session could not retire its selected project');
+    this.name = 'SessionProjectRetirementError';
+  }
+}
+
+/**
+ * The project owner one session hands its pages.
+ *
+ * Two guards make "a project inside the current session" true rather than
+ * hoped for:
+ *
+ * - every project runtime it builds is current only while **both** its own
+ *   owner publishes it **and** this session is current, so withdrawing the
+ *   session withdraws its project in the same instant, before either disposal
+ *   starts;
+ * - an `open` asked of it once the session has been withdrawn builds nothing
+ *   and settles quietly, so a page's late effect cannot give a retired session
+ *   a project nobody will retire.
+ */
+function sessionProjects({
+  isCurrent,
+  installProject,
+  budgetMs,
+}: Pick<SessionRuntimeDependencies, 'isCurrent' | 'installProject' | 'budgetMs'>): ProjectOwner {
+  const owner = createProjectOwner({
+    install: (dependencies) =>
+      installProject({
+        ...dependencies,
+        isCurrent: () => isCurrent() && dependencies.isCurrent(),
+      }),
+    budgetMs,
+  });
+  return {
+    subscribe: owner.subscribe,
+    snapshot: owner.snapshot,
+    open: async (projectId, source) => {
+      if (!isCurrent()) return;
+      await owner.open(projectId, source);
+    },
+    leave: owner.leave,
+  };
+}
+
+/**
+ * Installs one signed-in identity's runtime: one DI Bag graph, built outside
+ * React, publishing {@link SessionRuntime} and nothing else.
+ *
+ * It installs the directory-management module over the identity's client,
+ * with this runtime's own `isCurrent` as the directory's reader test, and it
+ * owns the session's project owner.
+ *
+ * **The project owner is the graph's one owned disposable.** The session's
+ * disposal leaves it — retiring whatever project is current, and waiting for
+ * that retirement — before the session's own retirement is done, which is the
+ * ordering the lifetime map requires: project first, then session. A project
+ * that could not be given back fails the session's disposal with
+ * {@link SessionProjectRetirementError}; a project whose construction failed
+ * holds nothing, and does not.
+ *
+ * @throws `PartialAcquisitionError` when a service cannot be resolved, carrying
+ * the bounded close for whatever was acquired first.
+ */
+export function installSessionRuntime({
+  userId,
+  directoryApi,
+  isCurrent,
+  installProject,
+  budgetMs,
+}: SessionRuntimeDependencies): RetirableRuntime<SessionRuntime> {
+  const bag = DiBag.createBuilder()
+    .installModule(directoryManagementModule)
+    .register({
+      directoryApi: DiBag.fromSyncFactory((): DirectoryApi => directoryApi),
+      isActiveReader: DiBag.fromSyncFactory((): (() => boolean) => isCurrent),
+    })
+    .register({
+      projects: DiBag.withDisposal(
+        DiBag.fromSyncFactory((): ProjectOwner =>
+          sessionProjects({ isCurrent, installProject, budgetMs }),
+        ),
+        async (projects) => {
+          await projects.leave();
+          const left = projects.snapshot();
+          if (left.status === 'fatal' && left.terminal) throw new SessionProjectRetirementError();
+        },
+      ),
+    })
+    .build();
+  return acquireTransactionally(bag, () => ({
+    userId,
+    isCurrent,
+    directory: bag.resolve('directoryManagement'),
+    projects: bag.resolve('projects'),
+  }));
+}
+
+/**
+ * The one owner of the signed-in identity's runtime: which runtime is current,
+ * and the only way one is opened or left.
+ *
+ * A store (rule F2) over the runtime's {@link LifetimeState}, so the app draws
+ * the signed-in region only while a runtime is `live` for the identity it holds,
+ * and the sanitized fatal state when one could not be retired or built.
+ */
+export interface SessionOwner extends Store<LifetimeState<SessionRuntime>> {
+  /**
+   * Opens a runtime for this identity, **unless the newest request already
+   * asked for this user**, in which case it joins that request and changes
+   * nothing: the key is the user id, and a credential that differs for the
+   * same user replaces nothing.
+   *
+   * For another user it withdraws the current runtime, and with it its
+   * project, synchronously, and publishes the new one once that retirement
+   * has succeeded. Resolves when this request has published, was overtaken,
+   * or was refused — the last leaves the owner `fatal`, which is what the app
+   * shows.
+   */
+  readonly open: (identity: SessionIdentity) => Promise<void>;
+  /**
+   * Withdraws and retires whatever runtime is current — its project first —
+   * and settles only once that retirement has run: a second trigger queues
+   * behind the first and settles after it, with the same outcome.
+   */
+  readonly leave: () => Promise<void>;
+}
+
+/** What an owner is built from; production passes none of it. */
+export interface SessionOwnerDependencies {
+  /** How one runtime is installed. Defaults to {@link installSessionRuntime}. */
+  readonly install?: (dependencies: SessionRuntimeDependencies) => RetirableRuntime<SessionRuntime>;
+  /** How the directory's client is cut from a credential. Defaults to the real one. */
+  readonly clientFor?: (credential: string) => DirectoryApi;
+  /** How a project runtime is installed. Defaults to the real one. */
+  readonly installProject?: (
+    dependencies: ProjectRuntimeDependencies,
+  ) => RetirableRuntime<ProjectRuntime>;
+  /** The bounded wait for a retirement. Defaults to the one budget every lifetime has. */
+  readonly budgetMs?: number;
+}
+
+/**
+ * Builds the owner of one app's signed-in identity.
+ *
+ * One lifetime slot underneath, so every rule of `lifetime-slot.ts` holds for
+ * the session too. What this adds is the **key** and **identity**: a request
+ * for the user already asked for joins it instead of replacing anything, and
+ * each runtime is handed an `isCurrent` that answers yes only while the slot is
+ * `live` with that very runtime.
+ *
+ * Holds nothing until `open` is called, which is what makes it safe to build in
+ * a lazy state initializer that Strict Mode may run twice.
+ */
+export function createSessionOwner({
+  install = installSessionRuntime,
+  clientFor = httpDirectoryApi,
+  installProject = installProjectRuntime,
+  budgetMs = RETIREMENT_BUDGET_MS,
+}: SessionOwnerDependencies = {}): SessionOwner {
+  const slot = createLifetimeSlot<SessionRuntime>(budgetMs);
+  /** The identity the newest request asked for, or `null` after a leave. */
+  let wanted: SessionIdentity | null = null;
+  /** The newest request's settlement, which a request for the same user joins. */
+  let latest: Promise<void> = Promise.resolve();
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
+  /** Installs one runtime, recording every failure that can leave it. */
+  const installRecorded = (
+    dependencies: SessionRuntimeDependencies,
+  ): RetirableRuntime<SessionRuntime> => {
+    let runtime: RetirableRuntime<SessionRuntime>;
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
+  /**
+   * Settles one transition as a modelled outcome, classified by the refusal
+   * itself and not by the slot's state afterwards, which a later request — one
+   * a subscriber asked for from inside the notification, say — may already have
+   * moved on.
+   *
+   * Superseded is controlled cancellation; a refusal from this owner's own
+   * runtime has been published as `fatal`, sanitized, and that state is what
+   * anybody is shown. Anything else is a fault of the slot and is rethrown with
+   * its cause.
+   */
+  const settle = async (transition: Promise<unknown>): Promise<void> => {
+    try {
+      await transition;
+    } catch (refusal: unknown) {
+      if (refusal instanceof TransitionSupersededError) return;
+      if (refusedByRuntime.has(refusal)) return;
+      throw new Error('a session transition was refused by the slot itself', { cause: refusal });
+    }
+  };
+  return {
+    subscribe: slot.subscribe,
+    snapshot: slot.snapshot,
+    open: (identity) => {
+      if (identity.userId === wanted?.userId) return latest;
+      wanted = identity;
+      latest = settle(
+        slot.replace(() => {
+          let built: SessionRuntime | null = null;
+          const isCurrent = (): boolean => {
+            const state = slot.snapshot();
+            return state.status === 'live' && state.services === built;
+          };
+          const runtime = installRecorded({
+            userId: identity.userId,
+            directoryApi: clientFor(identity.credential),
+            isCurrent,
+            installProject,
+            budgetMs,
+          });
+          built = runtime.services;
+          return runtime;
+        }),
+      );
+      return latest;
+    },
+    leave: () => {
+      wanted = null;
+      latest = settle(slot.retire());
+      return latest;
+    },
+  };
+}
diff --git a/apps/wbs/fe-01/vitest.node-suites.ts b/apps/wbs/fe-01/vitest.node-suites.ts
index d07107bda..a3d7046f9 100644
--- a/apps/wbs/fe-01/vitest.node-suites.ts
+++ b/apps/wbs/fe-01/vitest.node-suites.ts
@@ -65,6 +65,7 @@ export const NODE_SUITES: readonly string[] = [
   'src/modules/calendar-markers/calendar-markers.resource.test.ts',
   'src/modules/channel.model.test.ts',
   'src/modules/directory-management/directory-management.feature.test.ts',
+  'src/modules/directory-management/module.test.ts',
   'src/modules/directory/directory.resource.test.ts',
   'src/modules/plan-commands/plan-commands.feature.test.ts',
   'src/modules/plan-feed/delivered-plan-store.model.test.ts',
@@ -87,6 +88,8 @@ export const NODE_SUITES: readonly string[] = [
   'src/runtime/lifetime-slot.test.ts',
   'src/runtime/project-runtime.model.test.ts',
   'src/runtime/project-runtime.test.ts',
+  'src/runtime/session-runtime.model.test.ts',
+  'src/runtime/session-runtime.test.ts',
   'src/test-tiers.test.ts',
   'src/testing/fake-project-api.test.ts',
   'src/testing/plan-fixture-command-results.test.ts',
```

### 7.4 `spec.md` — slice 2, the scenario for the router

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index be3cb2a86..4f3624daf 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -290,6 +290,17 @@ directory management and its project owner.
   request is sent on its behalf, no project is opened for it, and once its
   retirement has run every project runtime it built has been closed once

+#### Scenario: The same user keeps the session, the router and the address
+
+- **WHEN** a signed-in identity arrives from startup identity restoration or a
+  password login, and then an identity for the same user arrives with another
+  credential, or an identity for another user arrives
+- **THEN** the directory's client carries the credential the first identity
+  arrived with, the same user's arrival replaces nothing - the router instance,
+  the address and what a mounted route holds survive, and nothing is read
+  again - and another user's arrival draws the signed-in region again from that
+  user's own runtime, at the same address
+
 ### Requirement: Log out stays a local exit

 The Log out action SHALL send no request to the server and SHALL retire the
```

### 7.5 the test side of slice 2: `directory-page-over-client.tsx` (**new**), the named fixture edit, `regionAt`, five app examples and one runtime example

The seventeen `<DirectoryPage token="t" api=` sites become `<DirectoryPageOverClient api=` and nothing else in `directory-page.test.tsx` changes but its import; `regionAt` hands `AppRouter` a session over a fake directory; the app suite mocks `login` beside `me`, and wraps `@tanstack/react-router`'s `createRouter` to record every router built, which the router-survival example compares by identity.

```diff
diff --git a/apps/wbs/fe-01/src/app-router.test.tsx b/apps/wbs/fe-01/src/app-router.test.tsx
index fe3cd5ff8..78139f3c7 100644
--- a/apps/wbs/fe-01/src/app-router.test.tsx
+++ b/apps/wbs/fe-01/src/app-router.test.tsx
@@ -3,6 +3,9 @@ import { cleanup, screen, waitFor } from '@testing-library/react';
 import { afterEach, describe, expect, it } from 'vitest';

 import type { ProjectApi } from '@/lib/wbs-api';
+import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
+import { installProjectRuntime } from '@/runtime/project-runtime';
+import { installSessionRuntime, type SessionRuntime } from '@/runtime/session-runtime';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { refusingApi } from '@/testing/refusing-api';

@@ -66,10 +69,24 @@ function emptyProjects(): ProjectApi {
   });
 }

+/**
+ * A signed-in session's runtime over a fake directory, never withdrawn: these
+ * cases are about routing, and the session owner has its own suites.
+ */
+const signedIn = (): SessionRuntime =>
+  installSessionRuntime({
+    userId: 'u1',
+    directoryApi: fakeDirectoryApi(),
+    isCurrent: () => true,
+    installProject: installProjectRuntime,
+    budgetMs: 1_000,
+  }).services;
+
 /** The signed-in region entered at one address, the way a reload enters it. */
 const regionAt = (path: string) =>
   render(
     <AppRouter
+      session={signedIn()}
       token="t"
       presence={() => null}
       account={<span>account menu</span>}
diff --git a/apps/wbs/fe-01/src/app.test.tsx b/apps/wbs/fe-01/src/app.test.tsx
index f259378da..da60fd12b 100644
--- a/apps/wbs/fe-01/src/app.test.tsx
+++ b/apps/wbs/fe-01/src/app.test.tsx
@@ -1,24 +1,49 @@
-import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
+import type * as Router from '@tanstack/react-router';
+import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import type * as Api from '@/lib/api';
+import { ThemeProvider } from '@/lib/theme';
+import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
 import { browserStorage } from '@/modules/preferences/browser-storage.repository';
 import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
 import { ApplicationServicesProvider } from '@/runtime/application-services-context';
 import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';
+import { createSessionOwner, type SessionOwner } from '@/runtime/session-runtime';

 // fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
 const hasDom = typeof document !== 'undefined';
 const itDom = hasDom ? it : it.skip;

 const me = vi.hoisted(() => vi.fn<() => ReturnType<typeof Api.me>>());
+const login = vi.hoisted(() =>
+  vi.fn<(username: string, password: string) => ReturnType<typeof Api.login>>(),
+);
+
+/**
+ * Every router the signed-in region builds, by identity: `AppRouter` builds one
+ * in a lazy state initializer, so a region that kept its router built exactly
+ * one, and a region rebuilt for another user built a second.
+ */
+const routers = vi.hoisted((): unknown[] => []);
+
+vi.mock('@tanstack/react-router', async (importOriginal) => {
+  const actual = await importOriginal<typeof Router>();
+  const recordRouter: typeof actual.createRouter = (options) => {
+    const router = actual.createRouter(options);
+    routers.push(router);
+    return router;
+  };
+  return { ...actual, createRouter: recordRouter };
+});

 vi.mock('@/lib/api', async (importOriginal) => ({
   ...(await importOriginal<typeof Api>()),
   me,
+  login,
 }));

-const { App } = await import('./app');
+const { App, SignedInApp } = await import('./app');

 /**
  * A slot `live` over the production installer, its liveness predicate wired
@@ -260,3 +285,162 @@ describe('the theme control through the app', () => {
     }
   });
 });
+
+/**
+ * The signed-in user's session: keyed by the user id, built from whichever
+ * credential the identity arrived with, and handed to the router as one runtime
+ * that a same-user update does not replace.
+ */
+describe('the signed-in user’s session', () => {
+  const SCOPES: ('read' | 'write')[] = ['read', 'write'];
+  const KAT = { id: 'u1', username: 'kat', scopes: SCOPES };
+  const LEE = { id: 'u2', username: 'lee', scopes: SCOPES };
+
+  /** Answers every directory read empty, and keeps the credential each people read carried. */
+  const directoryServer = () => {
+    const credentials: (string | null)[] = [];
+    vi.stubGlobal(
+      'fetch',
+      vi.fn((path: string, init?: RequestInit) => {
+        const collection = path.split('/').at(-1) ?? 'unknown';
+        if (collection === 'people')
+          credentials.push(new Headers(init?.headers).get('x-wbs-token'));
+        return Promise.resolve(new Response(JSON.stringify({ [collection]: [] }), { status: 200 }));
+      }),
+    );
+    return credentials;
+  };
+
+  const signedInAs = (session: Api.Session, openOwner?: () => SessionOwner) => (
+    <ApplicationServicesProvider slot={servicesSlot}>
+      <ThemeProvider>
+        <SignedInApp session={session} onSignOut={() => undefined} openOwner={openOwner} />
+      </ThemeProvider>
+    </ApplicationServicesProvider>
+  );
+
+  const directoryShowing = async () => {
+    await waitFor(() => {
+      expect(screen.getByRole('heading', { name: 'Directory' })).toBeDefined();
+    });
+  };
+
+  itDom(
+    'builds a restored session’s directory from the empty credential the cookie leaves',
+    async () => {
+      window.history.replaceState({}, '', '/directory');
+      me.mockResolvedValue({
+        kind: 'success',
+        representation: 'json',
+        status: 200,
+        body: { user: KAT },
+        headers: new Headers(),
+      });
+      const credentials = directoryServer();
+
+      renderApp();
+
+      await directoryShowing();
+      await waitFor(() => {
+        expect(credentials).toEqual(['']);
+      });
+    },
+  );
+
+  itDom(
+    'builds a password session’s directory from the credential the login answered',
+    async () => {
+      window.history.replaceState({}, '', '/directory');
+      login.mockResolvedValue({
+        kind: 'success',
+        representation: 'json',
+        status: 200,
+        body: { token: 'tok', user: KAT },
+        headers: new Headers(),
+      });
+      const credentials = directoryServer();
+      renderApp();
+      await waitFor(() => {
+        expect(screen.getByRole('button', { name: 'Sign in with password' })).toBeDefined();
+      });
+
+      fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'kat' } });
+      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
+      fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }));
+
+      await directoryShowing();
+      await waitFor(() => {
+        expect(credentials).toEqual(['tok']);
+      });
+    },
+  );
+
+  itDom(
+    'keeps the router, the address and a draft for the same user, whatever credential arrives',
+    async () => {
+      window.history.replaceState({}, '', '/directory');
+      const credentials = directoryServer();
+      routers.length = 0;
+      const view = render(signedInAs({ token: '', user: KAT }));
+      await directoryShowing();
+      expect(routers).toHaveLength(1);
+      const router = routers[0];
+      fireEvent.change(screen.getByLabelText('New tag'), { target: { value: 'legal' } });
+
+      view.rerender(signedInAs({ token: 't', user: { ...KAT } }));
+      await act(async () => {
+        await Promise.resolve();
+      });
+
+      expect(screen.getByLabelText<HTMLInputElement>('New tag').value).toBe('legal');
+      expect(window.location.pathname).toBe('/directory');
+      expect(credentials).toEqual(['']);
+      expect(routers).toEqual([router]);
+
+      view.rerender(signedInAs({ token: '', user: LEE }));
+      await waitFor(() => {
+        expect(credentials).toEqual(['', '']);
+      });
+      await directoryShowing();
+      expect(screen.getByLabelText<HTMLInputElement>('New tag').value).toBe('');
+      expect(window.location.pathname).toBe('/directory');
+      expect(routers).toHaveLength(2);
+    },
+  );
+
+  itDom('shows the sanitized report when the session cannot be built', async () => {
+    directoryServer();
+    render(
+      signedInAs({ token: '', user: KAT }, () =>
+        createSessionOwner({
+          install: () => {
+            throw new Error('alice@example.com could not be built');
+          },
+        }),
+      ),
+    );
+
+    const fault = await waitFor(() => {
+      const shown = document.querySelector('[data-lifetime-fault]');
+      if (shown === null) throw new Error('no fatal state yet');
+      return shown;
+    });
+    expect(fault.textContent).not.toContain('alice@example.com');
+    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
+  });
+
+  itDom('gives the session back when the signed-in region goes', async () => {
+    window.history.replaceState({}, '', '/directory');
+    directoryServer();
+    const owner = createSessionOwner({ clientFor: () => fakeDirectoryApi(), budgetMs: 1_000 });
+    const view = render(signedInAs({ token: '', user: KAT }, () => owner));
+    await directoryShowing();
+    expect(owner.snapshot().status).toBe('live');
+
+    view.unmount();
+
+    await waitFor(() => {
+      expect(owner.snapshot().status).toBe('empty');
+    });
+  });
+});
diff --git a/apps/wbs/fe-01/src/components/directory/directory-page.test.tsx b/apps/wbs/fe-01/src/components/directory/directory-page.test.tsx
index cc865cc52..76f95b962 100644
--- a/apps/wbs/fe-01/src/components/directory/directory-page.test.tsx
+++ b/apps/wbs/fe-01/src/components/directory/directory-page.test.tsx
@@ -10,10 +10,9 @@ import type {
   PersonView,
   TeamView,
 } from '@/lib/wbs-api';
+import { DirectoryPageOverClient } from '@/testing/directory-page-over-client';
 import { personView } from '@/testing/views';

-import { DirectoryPage } from './directory-page';
-
 // fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
 const hasDom = typeof document !== 'undefined';
 const itDom = hasDom ? it : it.skip;
@@ -348,7 +347,7 @@ const TEAM_USAGE: DirectoryUsage = {

 const pageWith = (api: DirectoryApi) =>
   render(
-    <DirectoryPage token="t" api={api} nav={<span>nav slot</span>} account={<span>me</span>} />,
+    <DirectoryPageOverClient api={api} nav={<span>nav slot</span>} account={<span>me</span>} />,
   );

 /** Waits for the arrival read to have redrawn both panels. */
@@ -414,7 +413,7 @@ describe('the directory page', () => {
     const page = pageWith(fakeDirectory([KAT], [PLATFORM]));
     await drawn('Kat');
     page.rerender(
-      <DirectoryPage token="t" api={fakeDirectory([KAT], [PLATFORM])} nav={null} account={null} />,
+      <DirectoryPageOverClient api={fakeDirectory([KAT], [PLATFORM])} nav={null} account={null} />,
     );

     expect(subscribed).toHaveBeenCalledTimes(0);
@@ -718,7 +717,7 @@ describe('the directory page re-reads', () => {
     await drawn('Kat');

     page.rerender(
-      <DirectoryPage token="t" api={api} nav={<span>nav slot</span>} account={<span>me</span>} />,
+      <DirectoryPageOverClient api={api} nav={<span>nav slot</span>} account={<span>me</span>} />,
     );
     // Typing is a render per keystroke, and none of them is an arrival.
     fireEvent.change(screen.getByLabelText('Name of Kat'), { target: { value: 'Ka' } });
@@ -1121,7 +1120,7 @@ describe('the Tags section, and what it deliberately has not got', () => {
       [{ id: 't1', name: 'Platform' }],
     );
     api.putTags([{ id: 'g1', name: 'regulatory' }]);
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);

     const box = await screen.findByLabelText('Name of regulatory');
     const row = box.closest('li');
@@ -1146,7 +1145,7 @@ describe('the Tags section, and what it deliberately has not got', () => {
       [{ id: 't1', name: 'Platform' }],
     );
     api.putWorkItemTypes([{ id: 'w1', name: 'Bug' }]);
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);

     const box = await screen.findByLabelText('Name of Bug');
     const row = box.closest('li');
@@ -1178,7 +1177,7 @@ describe('the Tags section, and what it deliberately has not got', () => {
     // Proof: the sentence replaced by the Tags card's wording, watched failing on
     // the `Columns` mention being absent. Watched 2026-08-30.
     const api = fakeDirectory([], []);
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);

     const empty = await screen.findByText(/No types yet/);
     expect(empty.textContent).toMatch(/Columns/);
@@ -1187,7 +1186,7 @@ describe('the Tags section, and what it deliberately has not got', () => {

   itDom('adds a tag, and says why the plan had no column until now', async () => {
     const api = fakeDirectory([], []);
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);

     // The empty state names the consequence rather than just the emptiness: the
     // table's Tags column does not exist until a tag does, so a reader looking
@@ -1218,7 +1217,7 @@ describe('the Services section, and the removal that had to say which dimension
       [{ id: 't1', name: 'Platform', serviceIds: [] }],
     );
     api.putServices([{ id: 's1', name: 'Payments' }]);
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);

     const box = await screen.findByLabelText('Name of Payments');
     const row = box.closest('li');
@@ -1231,7 +1230,7 @@ describe('the Services section, and the removal that had to say which dimension

   itDom('adds a service, and says where the plan column comes from', async () => {
     const api = fakeDirectory([], []);
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);

     expect(await screen.findByText(/No services yet/)).toBeTruthy();

@@ -1252,7 +1251,7 @@ describe('the Services section, and the removal that had to say which dimension
     // `renameService` and not to the neighbour a line above it.
     const api = fakeDirectory([], []);
     api.putServices([{ id: 's1', name: 'Payements' }]);
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);

     const box = await screen.findByLabelText('Name of Payements');
     fireEvent.change(box, { target: { value: 'Payments' } });
@@ -1285,7 +1284,7 @@ describe('the Services section, and the removal that had to say which dimension
       ],
       members: [],
     });
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);
     await waitFor(() => {
       expect(screen.getByLabelText('Name of Payments')).toBeDefined();
     });
@@ -1318,7 +1317,7 @@ describe('the Services section, and the removal that had to say which dimension
       ],
       members: [],
     });
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);
     await waitFor(() => {
       expect(screen.getByLabelText('Name of regulatory')).toBeDefined();
     });
@@ -1344,7 +1343,7 @@ describe('the Services section, and the removal that had to say which dimension
       ],
       members: [],
     });
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);
     await waitFor(() => {
       expect(screen.getByLabelText('Name of Payments')).toBeDefined();
     });
@@ -1371,7 +1370,7 @@ describe('the ownership map, edited on the team row', () => {
       { id: 's1', name: 'Billing' },
       { id: 's2', name: 'Payments' },
     ]);
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);

     await waitFor(() => {
       expect(screen.getByLabelText('Platform no longer owns Billing')).toBeDefined();
@@ -1391,7 +1390,7 @@ describe('the ownership map, edited on the team row', () => {
       { id: 's1', name: 'Billing' },
       { id: 's2', name: 'Payments' },
     ]);
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);
     await waitFor(() => {
       expect(screen.getByLabelText('Platform no longer owns Billing')).toBeDefined();
     });
@@ -1423,7 +1422,7 @@ describe('the ownership map, edited on the team row', () => {
     // Absent means "leave it alone", and this is where that is pinned.
     const api = fakeDirectory([], [{ id: 't1', name: 'Platfrom', serviceIds: ['s1'] }]);
     api.putServices([{ id: 's1', name: 'Billing' }]);
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);

     const box = await screen.findByLabelText('Name of Platfrom');
     fireEvent.change(box, { target: { value: 'Platform' } });
@@ -1441,7 +1440,7 @@ describe('the ownership map, edited on the team row', () => {
     // realises the vocabulary is missing a word — and a create that did not
     // also claim it would leave the reader to find the new service and pick it.
     const api = fakeDirectory([], [{ id: 't1', name: 'Platform', serviceIds: [] }]);
-    render(<DirectoryPage token="t" api={api} nav={null} account={null} />);
+    render(<DirectoryPageOverClient api={api} nav={null} account={null} />);
     await waitFor(() => {
       expect(screen.getByLabelText('Name of Platform')).toBeDefined();
     });
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.test.ts b/apps/wbs/fe-01/src/runtime/session-runtime.test.ts
index 2fc4eb1cb..07f24a358 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.test.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.test.ts
@@ -8,7 +8,7 @@ import { fakeProjectApi } from '@/testing/fake-project-api';

 import { PartialAcquisitionError, type RetirableRuntime } from './lifetime-slot';
 import { installProjectRuntime, type ProjectRuntimeDependencies } from './project-runtime';
-import { createSessionOwner, installSessionRuntime } from './session-runtime';
+import { createSessionOwner, installSessionRuntime, sessionFor } from './session-runtime';

 /** A project source over a fresh fake client, with no socket. */
 const projectSource = (): ProjectSource => ({
@@ -200,4 +200,15 @@ describe('the session runtime', () => {
     await Promise.all([first, second]);
     expect(owner.snapshot().status).toBe('empty');
   });
+
+  it('hands a region drawn for one user nothing of another user’s session', async () => {
+    const owner = createSessionOwner({ clientFor: () => fakeDirectoryApi(), budgetMs: 1_000 });
+    await owner.open({ userId: 'u1', credential: '' });
+    const state = owner.snapshot();
+    if (state.status !== 'live') throw new Error(`u1 was not published: ${state.status}`);
+
+    expect(sessionFor(state, 'u1')).toBe(state.services);
+    expect(sessionFor(state, 'u2')).toBeNull();
+    expect(sessionFor({ status: 'retiring' }, 'u1')).toBeNull();
+  });
 });
diff --git a/apps/wbs/fe-01/src/testing/directory-page-over-client.tsx b/apps/wbs/fe-01/src/testing/directory-page-over-client.tsx
new file mode 100644
index 000000000..6a9603a3b
--- /dev/null
+++ b/apps/wbs/fe-01/src/testing/directory-page-over-client.tsx
@@ -0,0 +1,33 @@
+import { useEffect, useState } from 'react';
+
+import { DirectoryPage, type DirectoryPageProps } from '@/components/directory/directory-page';
+import type { DirectoryApi } from '@/lib/wbs-api';
+import { createDirectory } from '@/modules/directory/directory.resource';
+import { createDirectoryManagement } from '@/modules/directory-management/directory-management.feature';
+
+/** The page's own props, with the client it is drawn over in place of a session's directory. */
+export interface DirectoryPageOverClientProps extends Omit<DirectoryPageProps, 'directory'> {
+  api: DirectoryApi;
+}
+
+/**
+ * The directory page over one client, the way its suite has always drawn it.
+ *
+ * In the app the directory is the signed-in session's, built by the session
+ * runtime and handed down through router context. The page's suite draws the
+ * page on its own, so this builds one directory per mount over the client it is
+ * handed — never withdrawn, because no session owns it — and points it at a
+ * replacement client, keeping what it holds, when the suite rerenders with one.
+ * What a session adds, withdrawal above all, is proved by the session runtime's
+ * own suites, not here.
+ */
+export function DirectoryPageOverClient({
+  api,
+  ...page
+}: DirectoryPageOverClientProps): React.JSX.Element {
+  const [directory] = useState(() => createDirectoryManagement(createDirectory(api, () => true)));
+  useEffect(() => {
+    directory.replaceClient(api);
+  }, [directory, api]);
+  return <DirectoryPage directory={directory} {...page} />;
+}
```

### 7.6 `sessionFor`, `SignedInApp`, the router, the directory page and its hook, and `composition.ts` deleted — slice 2

```diff
diff --git a/apps/wbs/fe-01/src/app-router.tsx b/apps/wbs/fe-01/src/app-router.tsx
index d4f1bdd40..5b7b510c2 100644
--- a/apps/wbs/fe-01/src/app-router.tsx
+++ b/apps/wbs/fe-01/src/app-router.tsx
@@ -11,28 +11,30 @@ import { lazy, type ReactNode, Suspense, useMemo, useState } from 'react';
 import { PageNav } from '@/components/chrome/page-nav';
 import type { Roster } from '@/components/presence/presence-panel';
 import { ProjectPage } from '@/components/wbs/project-page';
-import type { DirectoryApi, ProjectApi } from '@/lib/wbs-api';
+import type { ProjectApi } from '@/lib/wbs-api';
+import type { SessionRuntime } from '@/runtime/session-runtime';

 /**
  * What the signed-in region is given by the gate above it.
  *
- * These are the session's, not any page's: the token every client is built
- * from, the presence slot that needs the account's own username, and the
- * account menu that signs out. They reach the pages as **router context**
- * rather than as props threaded through routes, because a route component
- * takes no props — anything else would be a closure captured at route-creation
- * time, which is a second place the session would live.
+ * These are the session's, not any page's: its runtime — the directory and the
+ * project owner, and nothing else of it — the token the project catalog's client
+ * is still built from, the presence slot that needs the account's own username,
+ * and the account menu that signs out. They reach the pages as **router
+ * context** rather than as props threaded through routes, because a route
+ * component takes no props — anything else would be a closure captured at
+ * route-creation time, which is a second place the session would live.
  */
 export interface SignedInRegion {
+  session: SessionRuntime;
   token: string;
   presence: (roster: Roster) => ReactNode;
   account: ReactNode;
   /**
-   * Injected in tests. Production leaves them out and each page builds the real
-   * client from `token`, exactly as `ProjectPage` already did.
+   * Injected in tests. Production leaves it out and the project page builds the
+   * real client from `token`, exactly as it already did.
    */
   projectApi?: ProjectApi;
-  directoryApi?: DirectoryApi;
 }

 /** The region, plus the navigation both pages draw and neither owns. */
@@ -88,7 +90,7 @@ const directoryRoute = createRoute({
   getParentRoute: () => rootRoute,
   path: '/directory',
   component: function DirectoryRoute() {
-    const { token, account, nav, directoryApi } = directoryRoute.useRouteContext();
+    const { session, account, nav } = directoryRoute.useRouteContext();
     return (
       // Nothing rather than a spinner: the chunk is fetched from the same
       // origin that just served the document, and a flash of "loading…"
@@ -96,7 +98,7 @@ const directoryRoute = createRoute({
       // page reads on arrival anyway, so its own empty states are what a reader
       // sees first.
       <Suspense fallback={null}>
-        <DirectoryPage token={token} api={directoryApi} nav={nav} account={account} />
+        <DirectoryPage directory={session.directory} nav={nav} account={account} />
       </Suspense>
     );
   },
@@ -138,16 +140,18 @@ declare module '@tanstack/react-router' {
  * The router instance is created once and its **context** is refreshed on every
  * render, because the account menu and the presence slot are elements the gate
  * rebuilds when the session changes. A router recreated with them would throw
- * the current address away on a re-render.
+ * the current address away on a re-render. The session's runtime is context
+ * too, and it is the same object for as long as the same user is signed in: the
+ * session owner replaces it only for another user.
  */
 export function AppRouter({
   history,
   ...region
 }: SignedInRegion & { history?: RouterHistory }): React.JSX.Element {
-  const { token, presence, account, projectApi, directoryApi } = region;
+  const { session, token, presence, account, projectApi } = region;
   const context = useMemo<RouteContext>(
-    () => ({ token, presence, account, projectApi, directoryApi, nav: <PageNav /> }),
-    [token, presence, account, projectApi, directoryApi],
+    () => ({ session, token, presence, account, projectApi, nav: <PageNav /> }),
+    [session, token, presence, account, projectApi],
   );
   const [router] = useState(() => createAppRouter(context, history));
   return <RouterProvider router={router} context={context} />;
diff --git a/apps/wbs/fe-01/src/app.tsx b/apps/wbs/fe-01/src/app.tsx
index b8a5f29c4..41ddc6ab1 100644
--- a/apps/wbs/fe-01/src/app.tsx
+++ b/apps/wbs/fe-01/src/app.tsx
@@ -1,14 +1,16 @@
-import { useEffect, useState } from 'react';
+import { useEffect, useState, useSyncExternalStore } from 'react';

 import { AppRouter } from '@/app-router';
 import { AuthForm } from '@/components/auth/auth-form';
 import { AccountMenu } from '@/components/chrome/account-menu';
 import { AppFaultBoundary } from '@/components/chrome/app-fault';
+import { LifetimeFault } from '@/components/chrome/lifetime-fault';
 import { PresencePanel } from '@/components/presence/presence-panel';
 import { HintLayer } from '@/components/wbs/hint';
 import { me as fetchMe, type Session } from '@/lib/api';
 import { failureMessage, unreachable } from '@/lib/http';
 import { ThemeProvider, useThemeChoice } from '@/lib/theme';
+import { createSessionOwner, sessionFor, type SessionOwner } from '@/runtime/session-runtime';

 /**
  * The document's whole app, inside the boundary that catches what it throws.
@@ -131,6 +133,65 @@ function AppContent() {
       </main>
     );

+  return (
+    <SignedInApp
+      session={session}
+      onSignOut={() => {
+        setSession(null);
+      }}
+    />
+  );
+}
+
+/** What the signed-in region is drawn from. */
+export interface SignedInAppProps {
+  /** The identity the gate let in: from the startup check, or from a password login. */
+  session: Session;
+  onSignOut: () => void;
+  /** Injected in tests; the app lets it default to the real owner. */
+  openOwner?: () => SessionOwner;
+}
+
+/**
+ * Everything a signed-in reader sees, drawn from the runtime of the user it is
+ * drawn for.
+ *
+ * **One session owner per mount**, keyed by the user id: the identity it is
+ * handed is opened in an effect, never in render, and an identity for the user
+ * already opened — the same account arriving with another credential — changes
+ * nothing, so the router below keeps its instance, its address and whatever a
+ * mounted route holds. Another user withdraws the previous runtime, and its
+ * project with it, before anything else happens. The owner holds nothing until
+ * it is asked to open, so Strict Mode's discarded initializer leaks nothing, and
+ * the region going gives the session back.
+ *
+ * The router is drawn only while the owner publishes **this** user's runtime —
+ * see {@link sessionFor} — and the sanitized fatal state when the runtime
+ * could not be built or given back.
+ */
+export function SignedInApp({
+  session,
+  onSignOut,
+  openOwner = createSessionOwner,
+}: SignedInAppProps): React.JSX.Element {
+  const [sessionOwner] = useState(openOwner);
+  const sessionState = useSyncExternalStore(sessionOwner.subscribe, sessionOwner.snapshot);
+  useEffect(() => {
+    void sessionOwner.open({ userId: session.user.id, credential: session.token });
+  }, [sessionOwner, session]);
+  useEffect(
+    () => () => {
+      void sessionOwner.leave();
+    },
+    [sessionOwner],
+  );
+  if (sessionState.status === 'fatal') return <LifetimeFault fault={sessionState.fault} />;
+  const services = sessionFor(sessionState, session.user.id);
+  if (services === null)
+    return (
+      <main className="bg-background text-muted-foreground min-h-full p-8 font-sans">Loading…</main>
+    );
+
   return (
     /*
      * The signed-in page is exactly one window tall, and that is what makes the
@@ -164,6 +225,7 @@ function AppContent() {
        * ADR 0004 has the alternatives.
        */}
       <AppRouter
+        session={services}
         token={session.token}
         presence={
           // The panel is presentational and the roster is the page's, because
@@ -174,14 +236,7 @@ function AppContent() {
           // TS2339 here and at AccountMenu below in the actual FE app typecheck.
           (roster) => <PresencePanel me={session.user.username} {...roster} />
         }
-        account={
-          <ThemedAccountMenu
-            username={session.user.username}
-            onSignOut={() => {
-              setSession(null);
-            }}
-          />
-        }
+        account={<ThemedAccountMenu username={session.user.username} onSignOut={onSignOut} />}
       />
     </div>
   );
diff --git a/apps/wbs/fe-01/src/components/directory/directory-page.tsx b/apps/wbs/fe-01/src/components/directory/directory-page.tsx
index c45d598e6..29810cb50 100644
--- a/apps/wbs/fe-01/src/components/directory/directory-page.tsx
+++ b/apps/wbs/fe-01/src/components/directory/directory-page.tsx
@@ -14,7 +14,6 @@ import {
 } from '@/components/ui/modal';
 import { CreatablePicker } from '@/components/wbs/creatable-picker';
 import {
-  type DirectoryApi,
   type DirectoryEffect,
   directoryRefusalSentence,
   type DirectoryUsage,
@@ -24,13 +23,12 @@ import {
   type ServiceView,
   type TeamView,
 } from '@/lib/wbs-api';
-import type { DirectoryKind } from '@/modules/directory-management/contract';
+import type { DirectoryKind, DirectoryManagement } from '@/modules/directory-management/contract';
 import { useDirectoryManagement } from '@/modules/directory-management/view/use-directory-management';

 export interface DirectoryPageProps {
-  token: string;
-  /** Injected in tests; the app lets it default to the real one. */
-  api?: DirectoryApi;
+  /** The signed-in session's directory, from router context. */
+  directory: DirectoryManagement;
   /** The two-page navigation, from router context. */
   nav?: ReactNode;
   /** The account menu, from router context. */
@@ -174,8 +172,8 @@ const TAP_PICKER = '[&_input]:h-11 [&_input]:rounded-md [&_input]:border [&_inpu
  * from what came back, so a refused change leaves the screen as it was with the
  * refusal on it.
  */
-export function DirectoryPage({ token, api: apiOverride, nav, account }: DirectoryPageProps) {
-  const { management, shown } = useDirectoryManagement(token, apiOverride);
+export function DirectoryPage({ directory: management, nav, account }: DirectoryPageProps) {
+  const shown = useDirectoryManagement(management);
   const { people, teams, tags, services, workItemTypes, busy, problem } = shown;

   const [newTag, setNewTag] = useState('');
diff --git a/apps/wbs/fe-01/src/modules/directory-management/composition.ts b/apps/wbs/fe-01/src/modules/directory-management/composition.ts
deleted file mode 100644
index 202624e93..000000000
--- a/apps/wbs/fe-01/src/modules/directory-management/composition.ts
+++ /dev/null
@@ -1,23 +0,0 @@
-import { type DirectoryApi, httpDirectoryApi } from '@/lib/wbs-api';
-import { createDirectory } from '@/modules/directory/directory.resource';
-
-import type { DirectoryManagement } from './contract';
-import { createDirectoryManagement } from './directory-management.feature';
-
-/**
- * The one place that sees both modules and the client at once.
- *
- * A composition site, which the design lets see everything because it installs
- * and supplies and holds no logic. It is here rather than in the view because
- * rule K2 says delivery imports a feature-service and nothing beneath it. The
- * application, session and project lifetimes of the rollout's last Task 6 row
- * take this over; until then it is two lines.
- */
-export function directoryManagementOver(api: DirectoryApi): DirectoryManagement {
-  return createDirectoryManagement(createDirectory(api, () => true));
-}
-
-/** The same over the real client for one token. */
-export function directoryManagementFor(token: string): DirectoryManagement {
-  return directoryManagementOver(httpDirectoryApi(token));
-}
diff --git a/apps/wbs/fe-01/src/modules/directory-management/view/use-directory-management.ts b/apps/wbs/fe-01/src/modules/directory-management/view/use-directory-management.ts
index f58829323..2f1fc0b72 100644
--- a/apps/wbs/fe-01/src/modules/directory-management/view/use-directory-management.ts
+++ b/apps/wbs/fe-01/src/modules/directory-management/view/use-directory-management.ts
@@ -1,42 +1,26 @@
-import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
+import { useEffect, useSyncExternalStore } from 'react';

-import { type DirectoryApi, httpDirectoryApi } from '@/lib/wbs-api';
-
-import { directoryManagementOver } from '../composition';
 import type { DirectoryManagement, DirectorySnapshot } from '../contract';

 /**
- * One directory for the life of a mount, its current snapshot, and the read that
- * fires on arrival and again whenever the client is replaced.
+ * The session's directory as a page shows it: its current snapshot, and the
+ * read that fires on arrival.
  *
  * `useSyncExternalStore` and not a `useState` an effect writes: the snapshot is
  * owned outside React, and a getter React compares is the contract for that.
  *
- * **Built once per mount, on purpose.** The page has always kept its
- * vocabularies in component state and its generation counter in a ref, so
- * replacing the injected client changed which client the next call used and
- * cleared nothing on screen. `useState` with a lazy initialiser reproduces that;
- * a `useMemo` keyed on the client would hand back an empty directory for the
- * length of the replacement's first read. The effect below installs the new
- * client and re-reads, which is what the page's own "Arrival." effect did when
- * its `read` callback changed identity.
- *
- * The client is `api` where one is handed in and the real one otherwise — the
- * page's bargain since the directory page shipped, kept here so tests go on
- * injecting a fake through the page's `api` prop.
+ * **The directory is the session's, not the page's.** It is built once per
+ * signed-in user by the session runtime and handed down through router
+ * context, so a page that is left and entered again finds what the directory
+ * already held and reads again on arrival, rather than starting empty. Nothing
+ * here builds, replaces or gives one back.
  */
-export function useDirectoryManagement(
-  token: string,
-  api?: DirectoryApi,
-): { management: DirectoryManagement; shown: DirectorySnapshot } {
-  const client = useMemo(() => api ?? httpDirectoryApi(token), [api, token]);
-  const [management] = useState(() => directoryManagementOver(client));
+export function useDirectoryManagement(management: DirectoryManagement): DirectorySnapshot {
   const shown = useSyncExternalStore(management.subscribe, management.snapshot);

   useEffect(() => {
-    management.replaceClient(client);
     void management.read().catch(management.reportFailedRead);
-  }, [management, client]);
+  }, [management]);

-  return { management, shown };
+  return shown;
 }
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694e4..c4f2c3eaa 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -63,6 +63,24 @@ export interface SessionRuntime {
   readonly projects: ProjectOwner;
 }

+/**
+ * The runtime a region drawn for `userId` may use: the published one, when it is
+ * that user's, and nothing otherwise.
+ *
+ * Between the render that hands a region a new identity and the effect that asks
+ * the owner for it, the owner still publishes the previous user's runtime. A
+ * region that drew from it then would hand the previous user's directory and
+ * project owner to a page rendering for the next user — and a page's own effects
+ * run before its parent's, so it would act on them before anything was
+ * withdrawn.
+ */
+export function sessionFor(
+  state: LifetimeState<SessionRuntime>,
+  userId: string,
+): SessionRuntime | null {
+  return state.status === 'live' && state.services.userId === userId ? state.services : null;
+}
+
 /** What one session runtime is installed from. */
 export interface SessionRuntimeDependencies {
   readonly userId: string;
```

### 7.7 `spec.md` — slice 3, the scenario for the project page

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 4f3624daf..f121c71c9 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -301,6 +301,12 @@ directory management and its project owner.
   again - and another user's arrival draws the signed-in region again from that
   user's own runtime, at the same address

+#### Scenario: The project page opens its project through the session
+
+- **WHEN** a project is selected on the project page of a signed-in session
+- **THEN** its runtime is opened through that session runtime's own project
+  owner, and not through an owner of the page's own
+
 ### Requirement: Log out stays a local exit

 The Log out action SHALL send no request to the server and SHALL retire the
```

### 7.8 the test side of slice 3: `project-page-over-owner.tsx` (**new**), the named fixture edit and one router example

The thirteen `<ProjectPage` sites of `project-page.test.tsx` and the one of `optimization-integration.test.tsx` become `<ProjectPageOverOwner`, with their imports; Prettier re-wrapped none of them.

```diff
diff --git a/apps/wbs/fe-01/src/app-router.test.tsx b/apps/wbs/fe-01/src/app-router.test.tsx
index 78139f3c7..2a1d20bee 100644
--- a/apps/wbs/fe-01/src/app-router.test.tsx
+++ b/apps/wbs/fe-01/src/app-router.test.tsx
@@ -206,4 +206,44 @@ describe('the signed-in region, routed', () => {
     );
     expect(screen.getByRole('link', { name: 'Plan' }).getAttribute('aria-current')).toBeNull();
   });
+
+  /**
+   * The project page opens its project through the session's own owner, which
+   * is what lets the session's retirement retire the project first.
+   */
+  itDom(
+    'opens the selected project through the signed-in session’s own project owner',
+    async () => {
+      const session = signedIn();
+      const oneProject = emptyProjects();
+      oneProject.listProjects = () =>
+        Promise.resolve([
+          {
+            id: 'p1',
+            name: 'Rewire the shed',
+            restricted: false,
+            startDate: null,
+            lastOpenedAt: null,
+            ownerName: 'kat',
+            createdAt: 0,
+          },
+        ]);
+      oneProject.openProject = () => Promise.resolve();
+      render(
+        <AppRouter
+          session={session}
+          token="t"
+          presence={() => null}
+          account={<span>account menu</span>}
+          projectApi={oneProject}
+          history={createMemoryHistory({ initialEntries: ['/'] })}
+        />,
+      );
+
+      await waitFor(() => {
+        const opened = session.projects.snapshot();
+        expect(opened.status === 'live' ? opened.services.projectId : opened.status).toBe('p1');
+      });
+    },
+  );
 });
diff --git a/apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx b/apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx
index caed21b2b..83c601dc6 100644
--- a/apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx
@@ -6,10 +6,10 @@ import type { ProjectStreamDeps, SocketHandlers } from '@/lib/project-stream';
 import type { PlanOptimizationView } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { ProjectPageOverOwner } from '@/testing/project-page-over-owner';
 import { projectServicesOf } from '@/testing/project-services-of';
 import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

-import { ProjectPage } from './project-page';
 import type { SavedPlansPanelDeps } from './saved-plans-panel';
 import { type SubscriptionHandlers } from './wbs-table';

@@ -710,7 +710,12 @@ describe('project optimization in the plan', () => {
       const socket = fakeSocket();

       render(
-        <ProjectPage token="t" api={api} savedPlansDeps={SHELF_OFF} streamDeps={socket.deps} />,
+        <ProjectPageOverOwner
+          token="t"
+          api={api}
+          savedPlansDeps={SHELF_OFF}
+          streamDeps={socket.deps}
+        />,
       );
       await waitFor(() => {
         expect(indicatorWords()).toContain('Priority-first: Optimizing…');
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
index c0994755b..8cb9a9850 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
@@ -32,11 +32,12 @@ import {
 import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';
 import { fakeProjectApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { ProjectPageOverOwner } from '@/testing/project-page-over-owner';
 import { recordCalls } from '@/testing/record-calls';
 import { refusingApi } from '@/testing/refusing-api';
 import { planRead } from '@/testing/views';

-import { ProjectPage, recallLastProject, rememberLastProject } from './project-page';
+import { recallLastProject, rememberLastProject } from './project-page';
 import type { SavedPlansPanelDeps } from './saved-plans-panel';

 // fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
@@ -332,7 +333,7 @@ const fakeSavedPlansDeps = (
 });

 const pageWith = (api: ProjectApi, savedPlansDeps: SavedPlansPanelDeps = fakeSavedPlansDeps()) =>
-  render(<ProjectPage token="t" api={api} savedPlansDeps={savedPlansDeps} />);
+  render(<ProjectPageOverOwner token="t" api={api} savedPlansDeps={savedPlansDeps} />);

 const picker = () => screen.getByLabelText<HTMLInputElement>('Project');

@@ -530,7 +531,7 @@ describe('opening an imported project', () => {
     });

     view.rerender(
-      <ProjectPage token="t" api={replacement} savedPlansDeps={fakeSavedPlansDeps()} />,
+      <ProjectPageOverOwner token="t" api={replacement} savedPlansDeps={fakeSavedPlansDeps()} />,
     );
     await act(async () => {
       finishImport(IMPORTED);
@@ -573,7 +574,7 @@ describe('opening an imported project', () => {
       importFile();

       view.rerender(
-        <ProjectPage token="t" api={replacement} savedPlansDeps={fakeSavedPlansDeps()} />,
+        <ProjectPageOverOwner token="t" api={replacement} savedPlansDeps={fakeSavedPlansDeps()} />,
       );
       await act(async () => {
         finishRead();
@@ -611,7 +612,7 @@ describe('opening an imported project', () => {
     });

     view.rerender(
-      <ProjectPage token="t" api={replacement} savedPlansDeps={fakeSavedPlansDeps()} />,
+      <ProjectPageOverOwner token="t" api={replacement} savedPlansDeps={fakeSavedPlansDeps()} />,
     );
     await act(async () => {
       finishCatalogue([
@@ -856,7 +857,7 @@ describe('the header bar', () => {

   itDom('gives the header the slots the app fills, in the bar itself', async () => {
     render(
-      <ProjectPage
+      <ProjectPageOverOwner
         token="t"
         api={fakeProjects(TWO)}
         presence={() => <p>who is here</p>}
@@ -883,7 +884,7 @@ describe('the header bar', () => {
    */
   itDom('carries the navigation beside the project controls', async () => {
     render(
-      <ProjectPage
+      <ProjectPageOverOwner
         token="t"
         api={fakeProjects(TWO)}
         nav={<nav aria-label="Pages">the two pages</nav>}
@@ -915,7 +916,7 @@ describe('the header bar', () => {
     // roster 2026-09-02.
     const asked: { users: readonly string[]; connected: boolean }[] = [];
     render(
-      <ProjectPage
+      <ProjectPageOverOwner
         token="t"
         api={fakeProjects(TWO)}
         presence={(roster) => {
@@ -955,7 +956,7 @@ describe('the header bar', () => {
       };
       const asked: { users: readonly string[]; connected: boolean }[] = [];
       render(
-        <ProjectPage
+        <ProjectPageOverOwner
           token="t"
           api={fakeProjects(TWO)}
           streamDeps={streamDeps}
@@ -1007,7 +1008,7 @@ describe('the header bar', () => {
       };
       const asked: { users: readonly string[]; connected: boolean }[] = [];
       render(
-        <ProjectPage
+        <ProjectPageOverOwner
           token="t"
           api={fakeProjects(TWO)}
           streamDeps={streamDeps}
@@ -1065,7 +1066,9 @@ describe('the header bar', () => {
       cancel: () => undefined,
       random: () => 0,
     };
-    const view = render(<ProjectPage token="t" api={fakeProjects(TWO)} streamDeps={streamDeps} />);
+    const view = render(
+      <ProjectPageOverOwner token="t" api={fakeProjects(TWO)} streamDeps={streamDeps} />,
+    );
     await selectProject('p2');
     await waitFor(() => {
       expect(opened).toBe(1);
@@ -1096,7 +1099,7 @@ describe('the header bar', () => {
         cancel: () => undefined,
         random: () => 0,
       };
-      render(<ProjectPage token="t" api={fakeProjects(TWO)} streamDeps={streamDeps} />);
+      render(<ProjectPageOverOwner token="t" api={fakeProjects(TWO)} streamDeps={streamDeps} />);
       await selectProject('p1');
       await waitFor(() => {
         expect(opened).toBe(1);
@@ -1493,7 +1496,7 @@ describe('the remembered project, over the runtime live when it is used', () =>
   const pageUnder = (slot: LifetimeSlot<ApplicationServices>, api: ProjectApi) =>
     render(
       <ApplicationServicesProvider slot={slot}>
-        <ProjectPage token="t" api={api} savedPlansDeps={fakeSavedPlansDeps()} />
+        <ProjectPageOverOwner token="t" api={api} savedPlansDeps={fakeSavedPlansDeps()} />
       </ApplicationServicesProvider>,
     );

@@ -2074,7 +2077,7 @@ describe('the hover card follows the list, not a stale pointer', () => {
   itDom('remeasures during list scroll without rerendering the project page', async () => {
     let pageRenders = 0;
     render(
-      <ProjectPage
+      <ProjectPageOverOwner
         token="t"
         api={fakeProjects(TWO)}
         presence={() => {
diff --git a/apps/wbs/fe-01/src/testing/project-page-over-owner.tsx b/apps/wbs/fe-01/src/testing/project-page-over-owner.tsx
new file mode 100644
index 000000000..5dc71d712
--- /dev/null
+++ b/apps/wbs/fe-01/src/testing/project-page-over-owner.tsx
@@ -0,0 +1,23 @@
+import { useState } from 'react';
+
+import { ProjectPage, type ProjectPageProps } from '@/components/wbs/project-page';
+import { createProjectOwner } from '@/runtime/project-runtime';
+
+/** The page's own props, without the project owner a session hands it. */
+export type ProjectPageOverOwnerProps = Omit<ProjectPageProps, 'projectOwner'>;
+
+/**
+ * The project page with a project owner of its own, the way its suites have
+ * always drawn it.
+ *
+ * In the app the owner is the signed-in session's, handed down through router
+ * context, and the session's retirement retires it first. The page's suites
+ * draw the page on its own, so this builds one owner per mount — exactly what
+ * the page itself built before the session owned it — and keeps it across a
+ * rerender. What the session adds is proved by the session runtime's own suites
+ * and by the router's, not here.
+ */
+export function ProjectPageOverOwner(props: ProjectPageOverOwnerProps): React.JSX.Element {
+  const [projectOwner] = useState(createProjectOwner);
+  return <ProjectPage projectOwner={projectOwner} {...props} />;
+}
```

### 7.9 `project-page.tsx`, `app-router.tsx`, the two READMEs, the lifetime map and `tasks.md` — slice 3

The two `<observed-date-i>` placeholders are replaced by slice 3 step 4, by observation.

```diff
diff --git a/apps/wbs/fe-01/src/app-router.tsx b/apps/wbs/fe-01/src/app-router.tsx
index 5b7b510c2..47cded860 100644
--- a/apps/wbs/fe-01/src/app-router.tsx
+++ b/apps/wbs/fe-01/src/app-router.tsx
@@ -57,9 +57,16 @@ const projectRoute = createRoute({
   getParentRoute: () => rootRoute,
   path: '/',
   component: function ProjectRoute() {
-    const { token, presence, account, nav, projectApi } = projectRoute.useRouteContext();
+    const { session, token, presence, account, nav, projectApi } = projectRoute.useRouteContext();
     return (
-      <ProjectPage token={token} api={projectApi} presence={presence} account={account} nav={nav} />
+      <ProjectPage
+        projectOwner={session.projects}
+        token={token}
+        api={projectApi}
+        presence={presence}
+        account={account}
+        nav={nav}
+      />
     );
   },
 });
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index e303b2e47..234ee328a 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -27,7 +27,7 @@ import {
   type ApplicationServicesState,
   useApplicationServicesReader,
 } from '@/runtime/application-services-context';
-import { createProjectOwner } from '@/runtime/project-runtime';
+import type { ProjectOwner } from '@/runtime/project-runtime';

 import { useClosedByPointerOutside } from './close-on-outside-pointer';
 import { type BesideAnchorRect, HoverCard } from './hover-card';
@@ -46,6 +46,17 @@ import { WbsTable } from './wbs-table';

 export interface ProjectPageProps {
   token: string;
+  /**
+   * The owner of the selected project's runtime: the signed-in session's, from
+   * router context.
+   *
+   * The session's and not this page's, because the session's retirement has to
+   * retire the project first — a page's own owner would be given back whenever
+   * React happened to run its cleanup, and a session could let go while its
+   * project still held a socket. The page opens and leaves through it; the
+   * session refuses an open once it has been withdrawn.
+   */
+  projectOwner: ProjectOwner;
   /** Injected in tests; the app lets it default to the real one. */
   api?: ProjectApi;
   /**
@@ -485,6 +496,7 @@ function SavedPlanShelf({

 export function ProjectPage({
   token,
+  projectOwner,
   api: apiOverride,
   savedPlansDeps: savedPlansOverride,
   presence,
@@ -545,15 +557,11 @@ export function ProjectPage({
   const [selected, setSelected] = useState<string | null>(null);
   const [error, setError] = useState<string | null>(null);
   /**
-   * The owner of the selected project's runtime — its feed, its writer, its
-   * marker gestures and its commands, opened once per selected project and
-   * given back when the selection moves or this page goes.
-   *
-   * A lazy initializer is safe because the owner holds nothing until it is
-   * asked to open: Strict Mode's discarded second one leaks nothing. The
-   * runtime itself is only ever built by the effect below, never in render.
+   * The selected project's runtime — its feed, its writer, its marker gestures
+   * and its commands — as the session's project owner publishes it: opened
+   * once per selected project by the effect below, never in render, and given
+   * back when the selection moves, this page goes, or the session is left.
    */
-  const [projectOwner] = useState(createProjectOwner);
   const projectState = useSyncExternalStore(projectOwner.subscribe, projectOwner.snapshot);
   /**
    * Who else is in the selected project, and whether the socket saying so is
diff --git a/apps/wbs/fe-01/src/modules/directory-management/README.md b/apps/wbs/fe-01/src/modules/directory-management/README.md
index 85cd3babf..72d0baf7d 100644
--- a/apps/wbs/fe-01/src/modules/directory-management/README.md
+++ b/apps/wbs/fe-01/src/modules/directory-management/README.md
@@ -27,14 +27,21 @@ drafts, the boxes being typed into, the open confirmation and the chip focus —

 ## Relationships

-The exported types are in `contract.ts`; the service is `directory-management.feature.ts`;
-`composition.ts` is the one site that sees this module, the resource module and the HTTP client at
-once; `view/use-directory-management.ts` is the React adapter its one host reads it through. That
-host is `apps/wbs/fe-01/src/components/directory/directory-page.tsx`. There is no `module.ts` yet:
-DI Bag is not installed.
+The exported types are in `contract.ts`; the service is `directory-management.feature.ts`.
+`module.ts` is the sealed DI Bag module: it exports `directoryManagement`, keeps the `directory`
+resource private under the `frontend.directory-management` label, and requires `directoryApi` and
+`isActiveReader` from its host. That host is the session runtime,
+`apps/wbs/fe-01/src/runtime/session-runtime.ts`, which installs it once per signed-in user over the
+client cut from that user's credential and withdraws it with the session. Delivery receives
+`DirectoryManagement` through router context; `view/use-directory-management.ts` is the React
+adapter its one page, `apps/wbs/fe-01/src/components/directory/directory-page.tsx`, reads it through.
+The page's suite draws the page over a client of its own with
+`apps/wbs/fe-01/src/testing/directory-page-over-client.tsx`.
+
+This module carries no `module-index` block yet; adding one is OpenSpec task 12's.

 ## Checks

-The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's own suite is
-`directory-management.feature.test.ts`. The behaviour this extraction preserves is proved by
+The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's own suites are
+`directory-management.feature.test.ts` and `module.test.ts`. The behaviour this extraction preserves is proved by
 `apps/wbs/fe-01/src/components/directory/directory-page.test.tsx`, in the `test` target.
diff --git a/apps/wbs/fe-01/src/modules/directory/README.md b/apps/wbs/fe-01/src/modules/directory/README.md
index 5586fb380..1ca47f62a 100644
--- a/apps/wbs/fe-01/src/modules/directory/README.md
+++ b/apps/wbs/fe-01/src/modules/directory/README.md
@@ -16,6 +16,8 @@ exposes the one store contract in `apps/wbs/fe-01/src/modules/store.ts`, which i
   the directory's own words, refetch either way, lower busy.
 - Which route each of the five kinds renames and removes through.
 - Pointing at a replacement client without losing what it already holds.
+- Withdrawal: built with its owner's `isActiveReader`, it sends nothing and shows nothing new once
+  that answers no, so a signed-out or replaced session's directory keeps what it held.

 ## What it does not own

@@ -25,9 +27,9 @@ optimistic, and nothing here opens a socket.

 ## Relationships

-The exported types are in `contract.ts`; the service is `directory.resource.ts`. There is no
-`module.ts` yet: DI Bag is not installed, so the host builds the service with a plain factory
-call, from `apps/wbs/fe-01/src/modules/directory-management/composition.ts`. The plan pickers are
+The exported types are in `contract.ts`; the service is `directory.resource.ts`. It has no
+`module.ts` of its own: the directory-management module registers it as its private `directory`
+binding, in `apps/wbs/fe-01/src/modules/directory-management/module.ts`. The plan pickers are
 expected to share this resource, which is why it is a module of its own rather than a private
 member of the feature.

diff --git a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
index b38a02399..605673642 100644
--- a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
+++ b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
@@ -88,6 +88,8 @@ Hazards:
 - an identity change that only swaps clients retains the previous user's stable snapshot;
 - the current `useDirectoryManagement` lazy state initializer is safe only because its service has no disposal. A disposable runtime created there would be closed by StrictMode's first cleanup and reused by its second setup.

+Update, observed <observed-date-i> (050.7i, OpenSpec task 6): the session owner is `SignedInApp`'s, in `apps/wbs/fe-01/src/app.tsx`, built over one lifetime slot by `createSessionOwner` in `apps/wbs/fe-01/src/runtime/session-runtime.ts` and keyed by `session.user.id`: an identity for the user already opened replaces nothing, so the router keeps its instance, its address and its mounted route. Each session runtime installs the sealed directory-management module over `httpDirectoryApi(credential)` — the credential is only that adapter's input — and owns the session's project owner, which `ProjectPage` now receives through router context instead of building its own. Withdrawing a session withdraws its project in the same instant; its retirement leaves the project first and fails when the project cannot be given back, so Log out (task 7) can be one `leave()` of the session owner. The project catalog, the archival import and the header token still reach `ProjectPage` directly: the catalog facade remains a prerequisite.
+
 ### Project owner

 `ProjectPage.selected` is the project identity. Selection currently remounts `WbsTable` with `key={selected}` and separately keys the saved-plan shelf. After the blocking store/port extraction above, the project owner must encompass every project consumer: header roster, saved-plan shelf, and table. Its effect asks the host coordinator for a fresh runtime for each non-null selected ID within the current session generation, publishes narrow services only while that runtime is current, and clears publication before joining close. API object identity is not a project key. Null selection, route change to `/directory`, project switch, credential-generation replacement, session replacement/local exit, page shutdown, and owner unmount all call the same coordinator retirement operation.
diff --git a/openspec/changes/adopt-frontend-lifetimes/tasks.md b/openspec/changes/adopt-frontend-lifetimes/tasks.md
index 40b962ed4..6f92c2413 100644
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -69,8 +69,18 @@
       run through the real `wbs-fe-01:e2e` Nx target, `CI=1`, a checked-free
       port shift: one test, passing (section 4.7 has the exact command and
       output).
-- [ ] 6. The session runtime is keyed by user id and installs the directory
+- [x] 6. The session runtime is keyed by user id and installs the directory
       module; the router instance and address survive a same-session update.
+      Closed by 050-7-i, observed <observed-date-i>: `createSessionOwner`
+      (`apps/wbs/fe-01/src/runtime/session-runtime.ts`) keys one DI Bag session
+      runtime by the user id, the credential only building the directory's
+      client; the runtime installs the sealed `frontend.directory-management`
+      module and owns the session's project owner, retiring it first.
+      `SignedInApp` in `app.tsx` owns it, and a same-user identity replaces
+      nothing, so the router instance, the address and a mounted route's state
+      survive. The catalog and the header token still reach `ProjectPage`: the
+      catalog facade is the lifetime map's prerequisite, and refusing a token
+      in delivery is task 13's.
 - [ ] 7. Log out is a coordinated local exit: no request, project then session
       retirement, and the fatal state when either fails.
 - [x] 8. The project prerequisites: plan snapshot, connection, roster and busy
```

## 8. Proofs

Every fault below was injected for real in the planner's rehearsal on 2026-09-24, on the rehearsal
commit of the slice that owns it: its named test watched failing, the file restored and compared, the
test rerun green, before the next fault. The executor repeats each one and writes the adjacent
`Proof:` comment **only after observing its own failure**, dated with its own observed date
(`date -u +%F`) — never 2026-09-24, never before the observation. Each slice runs **all** of its
faults first and writes its comments afterwards, so every fault patch below still applies.

**Where the comments may go.** Slice 1's comments go into `session-runtime.ts`,
`directory.resource.ts` and `module.ts`. Slice 2 patches `session-runtime.ts` again, but only to insert
`sessionFor` above the installer's dependencies, away from every slice-1 site; section 9.1 checks
slice 2's diffs and its `g1` against a copy with every slice-1 site filled. Slice 2's comments go into
`session-runtime.ts` (`g1`) and `app.tsx`; slice 3's one into `app-router.tsx`, which no later slice
touches.

**Each slice's faults are records of four lines** — id, file (from the repository root), suite (from
`apps/wbs/fe-01`) and the exact `-t` pattern — in the first `text` block of that slice's subsection.
Vitest's `-t` is a regular expression; no title below holds a metacharacter, and the typographic
apostrophes and the dash in some of them match themselves. Extract the records from this document
rather than retyping them:

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-i-session-runtime.md
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

Expected: 76 lines for slice 1, 16 for slice 2 and 4 for slice 3.

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

Expected: one line per fault with the `Tests …` line its table gives, and exit 0. The loop stops at the
first fault whose named test passes, **after** that file has been restored and compared — then
preamble rule 20 applies: re-read the table, redo that fault once by hand, and stop if it still
passes. Every command inside reads `/dev/null`, so nothing it runs can consume the records the loop is
reading. Extra failing tests are recorded, not a stop.

**The comment** names the injected fault and the observed failure, as a `//` line comment directly
above the line the table names, for example:

```ts
// Proof: on <observed date>, joining any request while a user was wanted failed `keys one runtime
// by user, …` after 3 runs: s1 was still current after u1's unbuildable sign-in.
```

Faults that share a site share one comment block, one sentence each (`m1` and `m2`; `m7` and `d1`;
`m11` and `k1`; `l1` and `l2`). `m12` and `o2` stand above two different
`refusedByRuntime.add(refusal);` lines — `installRecorded`'s and `recorded`'s — which the tables tell
apart. In JSX (`r1`) the comment is a `//` line inside the opening tag, above
the attribute. None of these sites carries an existing `Proof:` comment.

**For the model faults**, the run number, the shrunk command sequence and the innermost cause the table
quotes are the evidence; they are seed-pinned and were identical in two rehearsal runs. A different run
number or sequence means the generator, seed or command set differs from what was reviewed: record it,
and stop only if the named test **passes**.

### 8.1 Slice 1 — the owner, the runtime, the resource's guard and the module

The records for `$TMPDIR/proofs.txt`:

```text
m1
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
m2
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
m3
apps/wbs/fe-01/src/modules/directory/directory.resource.ts
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
m4
apps/wbs/fe-01/src/modules/directory/directory.resource.ts
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
m5
apps/wbs/fe-01/src/modules/directory/directory.resource.ts
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
m6
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
m7
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
m8
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
m9
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
m10
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
m11
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
m12
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
k1
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.test.ts
publishes the session’s directory and its projects, and nothing else
o1
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.test.ts
settles a request a newer one overtook, and builds nothing for it
o2
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.test.ts
fails the session’s retirement when its project will not let go
o3
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.test.ts
settles a half-built session that cannot be released, and leaves the owner terminally fatal
d1
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.test.ts
fails the session’s retirement when its project will not let go
l1
apps/wbs/fe-01/src/modules/directory-management/module.ts
src/modules/directory-management/module.test.ts
names itself when a host omits the client
l2
apps/wbs/fe-01/src/modules/directory-management/module.ts
src/modules/directory-management/module.test.ts
keeps its directory resource out of a host graph
```

Every model fault fails the model test, `Tests 1 failed (1)`, exit 1. Run, the shrunk command
sequence (after the scheduler's own record, which fast-check prints first) and the innermost cause, as
rehearsed twice:

| Id    | Fault                                                                                           | Run | Shrunk sequence, times                                               | Innermost cause                                                                                                         | Comment above                                                 |
| ----- | ----------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `m1`  | a directory read surviving a user switch: any signed-in user joins the request already made     | 3   | `signIn(u2, ''),signInBroken(u1)`, 2                                 | `signInBroken(u1): a session is still current after withdrawal: expected [ 's1' ] to deeply equal []`                   | `if (identity.userId === wanted?.userId) return latest;`      |
| `m2`  | the owner keyed on the credential as well as the user                                           | 10  | `signIn(u1, ''),signInBroken(u1),read(0)`, 6                         | `teardown: the last user asked for is not the one live: expected 'fatal' to be 'u1'`                                    | the same line (with `m1`)                                     |
| `m3`  | a late answer after retirement: `show` changes a withdrawn directory                            | 2   | `signIn(u2, ''),read(0),signIn(u1, ''),reenter(u1)`, 6               | `teardown: s1's directory changed after it was withdrawn: expected false to be true`                                    | the first `if (!isActiveReader()) return;`, in `show`         |
| `m4`  | a withdrawn session's read sends: the guard in `read` removed                                   | 1   | `signIn(u1, ''),signOut,read(0)`, 4                                  | `read: withdrawn s1 sent a request: expected 5 to be +0`                                                                | the second `if (!isActiveReader()) return;`, in `read`        |
| `m5`  | a withdrawn session's change sends: the guard in `runWrite` removed                             | 1   | `signIn(u1, ''),signIn(u2, ''),gesture(0)`, 5                        | `gesture: withdrawn s1 sent a request: expected 1 to be +0`                                                             | `if (!isActiveReader()) return Promise.resolve();`            |
| `m6`  | double retirement: a `leave` that arrives mid-transition is dropped instead of queued behind it | 1   | `signIn(u1, ''),signIn(u2, ''),signOut,drain`, 5                     | `drain: the published session is not the user last asked for: expected 'u2' to be null`                                 | `wanted = null;` in `leave`                                   |
| `m7`  | a project outliving its session: the disposal never leaves the project                          | 14  | `signIn(u1, ''),openProject(0, p1),signInBroken(u2),gesture(0)`, 7   | `teardown: s1 was retired while its project owner still held one: expected 'live' not to be 'live'`                     | `await projects.leave();`                                     |
| `m8`  | a project current under a withdrawn session: the session half of its reader test dropped        | 14  | `signIn(u1, ''),openProject(0, p1),signInBroken(u2)`, 5              | `signInBroken(u2): a project is still current after its session was withdrawn: expected [ 's1.p1' ] to deeply equal []` | `isCurrent: () => isCurrent() && dependencies.isCurrent(),`   |
| `m9`  | a withdrawn session opens a project                                                             | 3   | `signIn(u2, ''),signInBroken(u1),drain,openProject(0, p1),drain`, 11 | `teardown: s1 was retired while its project owner still held one: expected 'live' not to be 'live'`                     | `if (!isCurrent()) return;` in `sessionProjects`              |
| `m10` | a stale session survives a switch: `isCurrent` compares the slot's status only                  | 2   | `signIn(u2, ''),signIn(u1, ''),reenter(u1)`, 6                       | `teardown: more than one session says it is current: expected [ 's1', 's2' ] to have a length of 1 but got 2`           | `return state.status === 'live' && state.services === built;` |
| `m11` | the transaction's close gives nothing back, so the project outlives its session                 | 14  | `signIn(u1, ''),openProject(0, p1),signInBroken(u2),gesture(0)`, 7   | `teardown: s1 was retired while its project owner still held one: expected 'live' not to be 'live'`                     | `return acquireTransactionally(bag, () => ({`                 |
| `m12` | a failed construction's refusal not recorded: the owner rethrows its own runtime's failure      | 2   | `signInBroken(u1),reenter(u1)`, 4                                    | `teardown refused: Error: a session transition was refused by the slot itself`                                          | `refusedByRuntime.add(refusal);` in `installRecorded`         |

The examples, each exit 1:

| Id   | Fault                                                                           | Suite › test                                                                                                              | Observed                                                                                                                                                                                                                                                      | Comment above                                                                   |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `k1` | the client published beside the session's services                              | `session-runtime.test.ts` › `publishes the session’s directory and its projects, and nothing else`                        | `1 failed \| 6 skipped (7)`; `expected [ 'directory', 'directoryApi', …(3) ] to deeply equal [ 'directory', 'isCurrent', …(2) ]`                                                                                                                              | `return acquireTransactionally(bag, () => ({` (with `m11`)                      |
| `o1` | a superseded open rejects instead of settling                                   | `session-runtime.test.ts` › `settles a request a newer one overtook, and builds nothing for it`                           | `1 failed \| 6 skipped (7)`; `promise rejected "Error: a session transition was refused b…" instead of resolving`, caused by `a session transition was refused by the slot itself` and `TransitionSupersededError: lifetime transition 1 was superseded by 2` | `if (refusal instanceof TransitionSupersededError) return;`                     |
| `o2` | a refused retirement not recorded: the owner rethrows its own runtime's failure | `session-runtime.test.ts` › `fails the session’s retirement when its project will not let go`                             | `1 failed \| 6 skipped (7)`; `promise rejected "Error: a session transition was refused b…" instead of resolving`, caused by `a session transition was refused by the slot itself` and `DI_BAG_CLEANUP_FAILED`                                                | `refusedByRuntime.add(refusal);` in `recorded`'s catch                          |
| `o3` | a partial acquisition's release refusal not recorded: the rewrap dropped        | `session-runtime.test.ts` › `settles a half-built session that cannot be released, and leaves the owner terminally fatal` | `1 failed \| 6 skipped (7)`; `promise rejected "Error: a session transition was refused b…" instead of resolving`, caused by `a session transition was refused by the slot itself` and `and what it took could not be given back`                             | `? new PartialAcquisitionError(failure.cause, recorded(failure.release))`       |
| `d1` | a project that will not let go does not fail its session                        | `session-runtime.test.ts` › `fails the session’s retirement when its project will not let go`                             | `1 failed \| 6 skipped (7)`; `expected false to be true` — the session was left `empty`, not terminally `fatal`                                                                                                                                               | `await projects.leave();` (with `m7`)                                           |
| `l1` | the module built without its label                                              | `module.test.ts` › `names itself when a host omits the client`                                                            | `1 failed \| 4 skipped (5)`; `expected [Function] to throw error including 'Cannot resolve "frontend.directory-ma…' but got 'DI_BAG_MISSING_DEPENDENCY: Cannot res…'` — no label in the message                                                               | `.buildModule(['directoryManagement'], { label: DIRECTORY_MANAGEMENT_LABEL });` |
| `l2` | the resource exported beside the feature                                        | `module.test.ts` › `keeps its directory resource out of a host graph`                                                     | `1 failed \| 4 skipped (5)`; `expected [Function] to throw an error` — the resource resolved from the host                                                                                                                                                    | the same line (with `l1`)                                                       |

#### Proof m1 — a directory read surviving a user switch: any signed-in user joins the request already made

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..1f22a1e 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -315,7 +315,7 @@ export function createSessionOwner({
     subscribe: slot.subscribe,
     snapshot: slot.snapshot,
     open: (identity) => {
-      if (identity.userId === wanted?.userId) return latest;
+      if (wanted !== null) return latest;
       wanted = identity;
       latest = settle(
         slot.replace(() => {
```

#### Proof m2 — the owner keyed on the credential as well as the user

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..8ecbb5c 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -315,7 +315,7 @@ export function createSessionOwner({
     subscribe: slot.subscribe,
     snapshot: slot.snapshot,
     open: (identity) => {
-      if (identity.userId === wanted?.userId) return latest;
+      if (identity.userId === wanted?.userId && identity.credential === wanted.credential) return latest;
       wanted = identity;
       latest = settle(
         slot.replace(() => {
```

#### Proof m3 — a late answer after retirement: `show` changes a withdrawn directory

```diff
diff --git a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
index ef4dabd..3b634d3 100644
--- a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
+++ b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
@@ -46,7 +46,6 @@ export function createDirectory(
    * a React render would fail the cached-snapshot check outright.
    */
   const show = (next: Partial<DirectorySnapshot>): void => {
-    if (!isActiveReader()) return;
     const merged: DirectorySnapshot = { ...shown, ...next };
     // Proof: deleting this early return made `a refusal that says nothing new
     // replaces no snapshot and wakes nobody` fail its object-identity assertion.
```

#### Proof m4 — a withdrawn session's read sends: the guard in `read` removed

```diff
diff --git a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
index ef4dabd..61ac9a2 100644
--- a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
+++ b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
@@ -100,7 +100,6 @@ export function createDirectory(
   };

   const read = async (): Promise<void> => {
-    if (!isActiveReader()) return;
     const generation = latestRead + 1;
     latestRead = generation;
     const [foundPeople, foundTeams, foundTags, foundServices, foundWorkItemTypes] =
```

#### Proof m5 — a withdrawn session's change sends: the guard in `runWrite` removed

```diff
diff --git a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
index ef4dabd..709cbd4 100644
--- a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
+++ b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
@@ -132,7 +132,6 @@ export function createDirectory(
   };

   const runWrite = (change: () => Promise<void>): Promise<void> => {
-    if (!isActiveReader()) return Promise.resolve();
     const ran = (async () => {
       show({ busy: true, problem: null });
       try {
```

#### Proof m6 — double retirement: a `leave` that arrives mid-transition is dropped instead of queued behind it

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..d2e2343 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -338,6 +338,7 @@ export function createSessionOwner({
       return latest;
     },
     leave: () => {
+      if (slot.snapshot().status !== 'live') return Promise.resolve();
       wanted = null;
       latest = settle(slot.retire());
       return latest;
```

#### Proof m7 — a project outliving its session: the disposal never leaves the project

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..a1defb7 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -173,7 +173,6 @@ export function installSessionRuntime({
           sessionProjects({ isCurrent, installProject, budgetMs }),
         ),
         async (projects) => {
-          await projects.leave();
           const left = projects.snapshot();
           if (left.status === 'fatal' && left.terminal) throw new SessionProjectRetirementError();
         },
```

#### Proof m8 — a project current under a withdrawn session: the session half of its reader test dropped

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..bf86e8b 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -120,7 +120,7 @@ function sessionProjects({
     install: (dependencies) =>
       installProject({
         ...dependencies,
-        isCurrent: () => isCurrent() && dependencies.isCurrent(),
+        isCurrent: dependencies.isCurrent,
       }),
     budgetMs,
   });
```

#### Proof m9 — a withdrawn session opens a project

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..e22b179 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -128,7 +128,6 @@ function sessionProjects({
     subscribe: owner.subscribe,
     snapshot: owner.snapshot,
     open: async (projectId, source) => {
-      if (!isCurrent()) return;
       await owner.open(projectId, source);
     },
     leave: owner.leave,
```

#### Proof m10 — a stale session survives a switch: `isCurrent` compares the slot's status only

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..c698f55 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -322,7 +322,7 @@ export function createSessionOwner({
           let built: SessionRuntime | null = null;
           const isCurrent = (): boolean => {
             const state = slot.snapshot();
-            return state.status === 'live' && state.services === built;
+            return state.status === 'live';
           };
           const runtime = installRecorded({
             userId: identity.userId,
```

#### Proof m11 — the transaction's close gives nothing back, so the project outlives its session

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..15b8383 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -180,7 +180,7 @@ export function installSessionRuntime({
       ),
     })
     .build();
-  return acquireTransactionally(bag, () => ({
+  return acquireTransactionally({ close: async () => undefined }, () => ({
     userId,
     isCurrent,
     directory: bag.resolve('directoryManagement'),
```

#### Proof m12 — a failed construction's refusal not recorded: the owner rethrows its own runtime's failure

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..5d28df9 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -286,7 +286,6 @@ export function createSessionOwner({
         failure instanceof PartialAcquisitionError
           ? new PartialAcquisitionError(failure.cause, recorded(failure.release))
           : failure;
-      refusedByRuntime.add(refusal);
       throw refusal;
     }
     return { services: runtime.services, close: recorded(runtime.close) };
```

#### Proof k1 — the client published beside the session's services

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..59a7964 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -185,6 +185,7 @@ export function installSessionRuntime({
     isCurrent,
     directory: bag.resolve('directoryManagement'),
     projects: bag.resolve('projects'),
+    directoryApi: bag.resolve('directoryApi'),
   }));
 }

```

#### Proof o1 — a superseded open rejects instead of settling

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..b8e09da 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -306,7 +306,6 @@ export function createSessionOwner({
     try {
       await transition;
     } catch (refusal: unknown) {
-      if (refusal instanceof TransitionSupersededError) return;
       if (refusedByRuntime.has(refusal)) return;
       throw new Error('a session transition was refused by the slot itself', { cause: refusal });
     }
```

#### Proof o2 — a refused retirement not recorded: the owner rethrows its own runtime's failure

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..43a2bec 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -270,7 +270,6 @@ export function createSessionOwner({
       try {
         await close(options);
       } catch (refusal: unknown) {
-        refusedByRuntime.add(refusal);
         throw refusal;
       }
     };
```

#### Proof o3 — a partial acquisition's release refusal not recorded: the rewrap dropped

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..10984c7 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -283,9 +283,7 @@ export function createSessionOwner({
       runtime = install(dependencies);
     } catch (failure: unknown) {
       const refusal =
-        failure instanceof PartialAcquisitionError
-          ? new PartialAcquisitionError(failure.cause, recorded(failure.release))
-          : failure;
+        failure;
       refusedByRuntime.add(refusal);
       throw refusal;
     }
```

#### Proof d1 — a project that will not let go does not fail its session

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index f316694..5686f1c 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -175,7 +175,6 @@ export function installSessionRuntime({
         async (projects) => {
           await projects.leave();
           const left = projects.snapshot();
-          if (left.status === 'fatal' && left.terminal) throw new SessionProjectRetirementError();
         },
       ),
     })
```

#### Proof l1 — the module built without its label

```diff
diff --git a/apps/wbs/fe-01/src/modules/directory-management/module.ts b/apps/wbs/fe-01/src/modules/directory-management/module.ts
index a062152..e6875a2 100644
--- a/apps/wbs/fe-01/src/modules/directory-management/module.ts
+++ b/apps/wbs/fe-01/src/modules/directory-management/module.ts
@@ -40,4 +40,4 @@ export const directoryManagementModule = DiBag.createBuilder()
         createDirectoryManagement(directory),
     ),
   })
-  .buildModule(['directoryManagement'], { label: DIRECTORY_MANAGEMENT_LABEL });
+  .buildModule(['directoryManagement']);
```

#### Proof l2 — the resource exported beside the feature

```diff
diff --git a/apps/wbs/fe-01/src/modules/directory-management/module.ts b/apps/wbs/fe-01/src/modules/directory-management/module.ts
index a062152..7dd8a3b 100644
--- a/apps/wbs/fe-01/src/modules/directory-management/module.ts
+++ b/apps/wbs/fe-01/src/modules/directory-management/module.ts
@@ -40,4 +40,4 @@ export const directoryManagementModule = DiBag.createBuilder()
         createDirectoryManagement(directory),
     ),
   })
-  .buildModule(['directoryManagement'], { label: DIRECTORY_MANAGEMENT_LABEL });
+  .buildModule(['directoryManagement', 'directory'], { label: DIRECTORY_MANAGEMENT_LABEL });
```

### 8.2 Slice 2 — the region's reader and `SignedInApp`

```text
g1
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.test.ts
hands a region drawn for one user nothing of another user’s session
g2
apps/wbs/fe-01/src/app.tsx
src/app.test.tsx
shows the sanitized report when the session cannot be built
g3
apps/wbs/fe-01/src/app.tsx
src/app.test.tsx
gives the session back when the signed-in region goes
g4
apps/wbs/fe-01/src/app.tsx
src/app.test.tsx
builds a password session’s directory from the credential the login answered
```

| Id   | Fault                                                        | Suite › test                                                                                      | Observed                                                                                               | Comment above                                                                                 |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `g1` | the region's reader hands out whatever is live, for any user | `session-runtime.test.ts` › `hands a region drawn for one user nothing of another user’s session` | `1 failed \| 7 skipped (8)`; `expected { userId: 'u1', …(3) } to be null`                              | `return state.status === 'live' && state.services.userId === userId ? state.services : null;` |
| `g2` | a fatal session draws the region anyway                      | `app.test.tsx` › `shows the sanitized report when the session cannot be built`                    | `1 failed \| 11 skipped (12)`; `Error: no fatal state yet` — no `[data-lifetime-fault]` was ever drawn | `if (sessionState.status === 'fatal') return <LifetimeFault fault={sessionState.fault} />;`   |
| `g3` | the region going never leaves the session                    | `app.test.tsx` › `gives the session back when the signed-in region goes`                          | `1 failed \| 11 skipped (12)`; `expected 'live' to be 'empty'` — the session was never given back      | `void sessionOwner.leave();`                                                                  |
| `g4` | the credential never reaches the directory's client          | `app.test.tsx` › `builds a password session’s directory from the credential the login answered`   | `1 failed \| 11 skipped (12)`; `expected [ '' ] to deeply equal [ 'tok' ]`                             | `void sessionOwner.open({ userId: session.user.id, credential: session.token });`             |

#### Proof g1 — the region's reader hands out whatever is live, for any user

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index c4f2c3e..934e3b4 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -78,7 +78,7 @@ export function sessionFor(
   state: LifetimeState<SessionRuntime>,
   userId: string,
 ): SessionRuntime | null {
-  return state.status === 'live' && state.services.userId === userId ? state.services : null;
+  return state.status === 'live' ? state.services : null;
 }

 /** What one session runtime is installed from. */
```

#### Proof g2 — a fatal session draws the region anyway

```diff
diff --git a/apps/wbs/fe-01/src/app.tsx b/apps/wbs/fe-01/src/app.tsx
index 41ddc6a..25d758e 100644
--- a/apps/wbs/fe-01/src/app.tsx
+++ b/apps/wbs/fe-01/src/app.tsx
@@ -185,7 +185,7 @@ export function SignedInApp({
     },
     [sessionOwner],
   );
-  if (sessionState.status === 'fatal') return <LifetimeFault fault={sessionState.fault} />;
+  if (sessionState.status === 'fatal' && false) return <LifetimeFault fault={sessionState.fault} />;
   const services = sessionFor(sessionState, session.user.id);
   if (services === null)
     return (
```

#### Proof g3 — the region going never leaves the session

```diff
diff --git a/apps/wbs/fe-01/src/app.tsx b/apps/wbs/fe-01/src/app.tsx
index 41ddc6a..086403e 100644
--- a/apps/wbs/fe-01/src/app.tsx
+++ b/apps/wbs/fe-01/src/app.tsx
@@ -180,9 +180,7 @@ export function SignedInApp({
     void sessionOwner.open({ userId: session.user.id, credential: session.token });
   }, [sessionOwner, session]);
   useEffect(
-    () => () => {
-      void sessionOwner.leave();
-    },
+    () => () => undefined,
     [sessionOwner],
   );
   if (sessionState.status === 'fatal') return <LifetimeFault fault={sessionState.fault} />;
```

#### Proof g4 — the credential never reaches the directory's client

```diff
diff --git a/apps/wbs/fe-01/src/app.tsx b/apps/wbs/fe-01/src/app.tsx
index 41ddc6a..6467f5c 100644
--- a/apps/wbs/fe-01/src/app.tsx
+++ b/apps/wbs/fe-01/src/app.tsx
@@ -177,7 +177,7 @@ export function SignedInApp({
   const [sessionOwner] = useState(openOwner);
   const sessionState = useSyncExternalStore(sessionOwner.subscribe, sessionOwner.snapshot);
   useEffect(() => {
-    void sessionOwner.open({ userId: session.user.id, credential: session.token });
+    void sessionOwner.open({ userId: session.user.id, credential: '' });
   }, [sessionOwner, session]);
   useEffect(
     () => () => {
```

### 8.3 Slice 3 — the route hands the page the session's project owner

```text
r1
apps/wbs/fe-01/src/app-router.tsx
src/app-router.test.tsx
opens the selected project through the signed-in session’s own project owner
```

| Id   | Fault                                               | Suite › test                                                                                           | Observed                                                                                                  | Comment above                     |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `r1` | the route hands the page a project owner of its own | `app-router.test.tsx` › `opens the selected project through the signed-in session’s own project owner` | `1 failed \| 5 skipped (6)`; `expected 'empty' to be 'p1'` — the session's owner never opened the project | `projectOwner={session.projects}` |

#### Proof r1 — the route hands the page a project owner of its own

```diff
diff --git a/apps/wbs/fe-01/src/app-router.tsx b/apps/wbs/fe-01/src/app-router.tsx
index 47cded8..eb04183 100644
--- a/apps/wbs/fe-01/src/app-router.tsx
+++ b/apps/wbs/fe-01/src/app-router.tsx
@@ -12,6 +12,7 @@ import { PageNav } from '@/components/chrome/page-nav';
 import type { Roster } from '@/components/presence/presence-panel';
 import { ProjectPage } from '@/components/wbs/project-page';
 import type { ProjectApi } from '@/lib/wbs-api';
+import { createProjectOwner } from '@/runtime/project-runtime';
 import type { SessionRuntime } from '@/runtime/session-runtime';

 /**
@@ -60,7 +61,7 @@ const projectRoute = createRoute({
     const { session, token, presence, account, nav, projectApi } = projectRoute.useRouteContext();
     return (
       <ProjectPage
-        projectOwner={session.projects}
+        projectOwner={createProjectOwner()}
         token={token}
         api={projectApi}
         presence={presence}
```

## 9. Verification

### 9.1 Every fenced diff applies, extracted from this document, in slice order

The requirement is not "these diffs were once correct" but "these diffs, as this committed document
spells them, apply in slice order, produce exactly the rehearsal's final tree, and every fault patch
applies to the tree its slice leaves" — on the rehearsal base, **and** on that base with the other
packets' executor output simulated in the files this packet patches. `fill=1` inserts a two-line
`// Proof:` comment above each of packet h's and packet j's five comment sites in `project-page.tsx`
(h's `q1` at `const projectServices = useMemo(() => projectServicesOver(api), [api]);`, j's `q1` at
`if (projectState.status === 'fatal') {`, `q2` at the page's second `return () => {`, `x1` and `x2` in
the stream factory) and dates their `<observed-date>` and `<observed-date-j>` notes in `tasks.md` and
the lifetime map; then, after slice 1's diffs and before slice 2's, it fills this packet's own
fifteen slice-1 comment sites, which slice 2 patches around. No script, no Prettier and no
`node_modules` are needed: every change is a diff.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-i-session-runtime.md
base=c9c99f0acce38c93ee70d15cf54563816b2c4a0b
final=4999d56cefa77e10c5307bb829d2c490a3f3d148
test -f "$packet"
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
# Checks every fault patch named on the command line against the tree.
check_faults() {
  for id in "$@"; do git -C "$work/tree" apply --check "$work/mutations/$id.diff"; done
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
  test "$count" -eq 24
  # A real repository holding exactly the base tree, so --check has something to check against.
  git archive "$base" | tar -x -C "$work/tree"
  fe="$work/tree/apps/wbs/fe-01"
  page="$fe/src/components/wbs/project-page.tsx"
  if [ "$fill" -eq 1 ]; then
    # Packet h's q1 and packet j's q1, q2, x1 and x2, the five executor comment sites in
    # the one file of theirs this packet patches; q2 is the page's second `return () => {`.
    fill_above "$page" "const projectServices = useMemo(() => projectServicesOver(api), [api]);"
    fill_above "$page" "if (projectState.status === 'fatal') {"
    fill_above "$page" "return () => {" 2
    fill_above "$page" "onPresence: handlers.onPresence,"
    fill_above "$page" "onConnectionChange: handlers.onConnectionChange,"
    test "$(grep -c 'Proof: simulated' "$page")" -eq 5
    # Their dated notes, as their executors leave them.
    for note in "$work/tree/openspec/changes/adopt-frontend-lifetimes/tasks.md" \
      "$work/tree/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md"; do
      sed -i 's/<observed-date>/2026-09-25/; s/<observed-date-j>/2026-09-25/' "$note"
    done
    echo "fill=1 filled-sites=5, dated notes filled"
  fi
  git -C "$work/tree" init -q
  git -C "$work/tree" add -A
  git -C "$work/tree" -c user.email=x@example.invalid -c user.name=x commit -qm base
  # --check and apply are SEPARATE commands: joined with && under set -e, a failed
  # check does not stop the shell and a later iteration can still reach the end.
  for n in 01 02 03; do
    git -C "$work/tree" apply --check "$work/patches/$n.diff"
    git -C "$work/tree" apply "$work/patches/$n.diff"
  done
  check_faults m1 m2 m3 m4 m5 m6 m7 m8 m9 m10 m11 m12 k1 o1 o2 o3 d1 l1 l2
  echo "fill=$fill slice 1 applied, its 19 fault patches check"
  if [ "$fill" -eq 1 ]; then
    runtime="$fe/src/runtime/session-runtime.ts"
    for anchor in "if (identity.userId === wanted?.userId) return latest;" "wanted = null;" \
      "await projects.leave();" "isCurrent: () => isCurrent() && dependencies.isCurrent()," \
      "if (!isCurrent()) return;" "return state.status === 'live' && state.services === built;" \
      "return acquireTransactionally(bag, () => ({" \
      "if (refusal instanceof TransitionSupersededError) return;" \
      "? new PartialAcquisitionError(failure.cause, recorded(failure.release))"; do
      fill_above "$runtime" "$anchor"
    done
    # `recorded`'s catch and `installRecorded`'s: the second filled first, so the first stays first.
    fill_above "$runtime" "refusedByRuntime.add(refusal);" 2
    fill_above "$runtime" "refusedByRuntime.add(refusal);" 1
    resource="$fe/src/modules/directory/directory.resource.ts"
    fill_above "$resource" "if (!isActiveReader()) return;" 1
    fill_above "$resource" "if (!isActiveReader()) return;" 2
    fill_above "$resource" "if (!isActiveReader()) return Promise.resolve();"
    fill_above "$fe/src/modules/directory-management/module.ts" \
      ".buildModule(['directoryManagement'], { label: DIRECTORY_MANAGEMENT_LABEL });"
    test "$(cat "$runtime" "$resource" "$fe/src/modules/directory-management/module.ts" \
      | grep -c 'Proof: simulated')" -eq 15
    echo "fill=1 fifteen slice-1 sites filled"
  fi
  for n in 04 05 06; do
    git -C "$work/tree" apply --check "$work/patches/$n.diff"
    git -C "$work/tree" apply "$work/patches/$n.diff"
  done
  check_faults g1 g2 g3 g4
  echo "fill=$fill slice 2 applied, its 4 fault patches check"
  for n in 07 08 09; do
    git -C "$work/tree" apply --check "$work/patches/$n.diff"
    git -C "$work/tree" apply "$work/patches/$n.diff"
  done
  check_faults r1
  echo "fill=$fill slice 3 applied, its 1 fault patch checks"
  git -C "$work/tree" status --porcelain --untracked-files=all | wc -l
  if [ "$fill" -eq 0 ]; then
    mkdir "$work/final"
    git archive "$final" | tar -x -C "$work/final"
    diff -r --exclude=.git "$work/tree" "$work/final"
    echo "fill=0 tree identical to $final"
  else
    echo "fill=1 simulated comments left in the page=$(grep -c 'Proof: simulated' "$page")"
    test "$(grep -c 'Proof: simulated' "$page")" -eq 5
  fi
done
````

Observed on 2026-09-24, after the final Prettier `--check` of this document:

```text
fill=0 extracted=9
fill=0 fault-patches=24
fill=0 slice 1 applied, its 19 fault patches check
fill=0 slice 2 applied, its 4 fault patches check
fill=0 slice 3 applied, its 1 fault patch checks
29
fill=0 tree identical to 4999d56cefa77e10c5307bb829d2c490a3f3d148
fill=1 extracted=9
fill=1 fault-patches=24
fill=1 filled-sites=5, dated notes filled
fill=1 slice 1 applied, its 19 fault patches check
fill=1 fifteen slice-1 sites filled
fill=1 slice 2 applied, its 4 fault patches check
fill=1 slice 3 applied, its 1 fault patch checks
29
fill=1 simulated comments left in the page=5
```

`git apply --check` prints nothing on success, which is why the script's own `echo` lines are the
evidence and why every count is asserted rather than printed. The number printed after slice 3 is the
paths changed against the base: twenty-nine — every owned path of the three slices but `verify.md`,
which the executor writes, counting the deleted `composition.ts`. The `fill=0` tree is byte-identical
to the rehearsal's final commit (`diff -r` printed nothing), which holds the two `<observed-date-i>`
placeholders slice 3 step 4 replaces. In the `fill=1` run all five simulated comments of packets h and
j in `project-page.tsx` survive in place, their dated notes did not disturb slice 3's hunks, and slice
2's diffs and faults apply around this packet's own fifteen filled slice-1 sites.

**A failed check stops the run**: the same two-line form as packets g, h and j.

Every **intermediate** tree typechecks: `wbs-fe-01:typecheck` exit 0 on each of the three rehearsal
commits, each committed with the hooks on. Exactly three trees do not: the red checkpoints, each the
previous slice's commit plus that slice's contract and test side (section 6 gives each one's
diagnostics). A red is rebuilt only that way, never by reverse-applying patches on a later tree.

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
Rehearsed on the base and after every slice: `{"items":114,"passed":114,"failed":0}` each time.

### 9.3 Commands actually run, and what each reported

All on 2026-09-24, by this packet's author, on a rehearsal branch cut at `c9c99f0a` where each slice was
committed **with the hooks on** (lefthook's format, lint, wiki and secrets checks passed for all three
commits), not inside an executor sandbox: `ccd978d2` (slice 1), `0370c69c` (slice 2) and `4999d56c` (slice 3), on
the throwaway branch `rehearse/050-7-i-r2` (its first commit, `c9c99f0a`, lays packet j's third-revision runtime files on the authoring base; the first revision's rehearsal, `rehearse/050-7-i`, is kept). Each red was rebuilt from the previous slice's commit plus
that slice's contract and test side only; each fault was injected into the commit of the slice that
owns it.

| Check                                  | Base `c9c99f0a` | Slice 1                      | Slice 2                      | Slice 3                     |
| -------------------------------------- | --------------- | ---------------------------- | ---------------------------- | --------------------------- |
| sandbox node suite (files·tests)       | 53·695          | 56·708                       | 56·709                       | 56·709                      |
| preferences suite                      | 4·39            | 4·39                         | 4·39                         | 4·39                        |
| session set, serial                    | 3·59            | 3·59                         | 3·64                         | 3·65                        |
| adopted set, serial                    | 20·1218         | 20·1218                      | 20·1218                      | 20·1219                     |
| zoned (Auckland)                       | 2·3             | 2·3                          | 2·3                          | 2·3                         |
| red typecheck                          | —               | exit 1, 34 errors in 5 files | exit 1, 22 errors in 6 files | exit 1, 2 errors in 2 files |
| red Vitest                             | —               | 3 files failed, no tests     | `3 failed \| 9 passed (12)`  | `1 failed \| 5 passed (6)`  |
| typecheck on the slice's commit        | 0               | 0                            | 0                            | 0                           |
| faults observed failing, file restored | —               | 19 of 19                     | 4 of 4                       | 1 of 1                      |
| strict OpenSpec                        | 114 · 114 · 0   | 114 · 114 · 0                | 114 · 114 · 0                | 114 · 114 · 0               |

(`53·694` is 53 files, 694 tests.) Every proof filter was run first and matched exactly one test, and
the twenty-four faults were then run through section 8's own loop on their slice's commit, each
`status=1` with its table's `Tests` line, each restore `cmp`-identical, each green rerun `status=0`.
The twelve model faults were run twice, with identical run numbers and shrunk sequences.

**Also observed**: `m2` injected on the final commit fails, beside the model test, the example `keeps
one runtime for one user whatever credential arrives, and replaces it for another` and the app example
`keeps the router, the address and a draft for the same user, whatever credential arrives`
(`expected '' to be 'legal'` — the router was rebuilt and the draft lost), which is the router-survival
sentence of task 6 failing through the production path.

**What was tried and found unprovable** (section 3.8): a directory route that builds its own
directory instead of taking `session.directory` — every suite here passes, because none replaces the
session under a mounted directory page; a session disposer that leaves its project twice — the
project's slot joins the second leave and nothing is observable. Neither is claimed.

On the final commit, as the planner: `wbs-fe-01:lint` exit 0; `nx format:check --all` exit 0;
`wbs-fe-01:typecheck` exit 0; slice 2's builder `git grep` empty; `wbs-fe-01:build` exit 0 (`✓ built in 816ms`); `tool-devsync:test` 366 pass, 0 fail on the committed rehearsal branch; `wbs-fe-01:test:unit` 58 files, 732 tests and `wbs-fe-01:test` UTC 145 files, 3085 tests, zoned 2 · 3, each exit 0 (section 9.4). The base figures there are derived — the final counts less this packet's own additions — not rerun on `c9c99f0a`.

### 9.4 Planner-only, with the expected relative delta

The sandbox cannot run these: three tests in two files spawn `bun` from Node, there is no browser, a
build writes outside the attempt's lane, and devsync writes Git objects.

| Check                                                                                                                                                                                            | Expected, relative to the base                                                                                                                                        | Planner's own rehearsal                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit`                                                                                                    | slice 1 **+ 3 files, + 13 tests**; slice 2 **+ 1 test**; slice 3 unchanged                                                                                            | final commit 58 files, 732 tests, exit 0; base derived as 55 · 718 (final less + 3 files, + 14 tests)                      |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test`                                                                                                         | UTC: slice 1 **+ 3 files, + 13 tests**, slice 2 **+ 6 tests**, slice 3 **+ 1 test**. Auckland zoned unchanged                                                         | final commit UTC 145 files, 3085 tests, zoned 2 · 3, exit 0; base derived as 142 · 3065 (final less + 3 files, + 20 tests) |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                                                                                                                    | exit 0 after each slice                                                                                                                                               | exit 0 on the final commit, `✓ built in 816ms`                                                                             |
| `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, with the slice committed or staged                                                                   | unchanged; no project target, no module index block, no pre-namespacing path in any owned document                                                                    | 366 pass, 0 fail, exit 0 on the final commit, the slices committed                                                         |
| `CI=1 E2E_PORT_SHIFT=<a multiple of 300 clear of every live run, checked with ss -ltn> NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run wbs-fe-01:e2e -- <spec>` | exit 0, unchanged, after slices 2 and 3 — the login specs and every spec that opens the directory or a project, since the region now appears once the session is live | **Pending planner verification.** Not run in this rehearsal.                                                               |
| the same target **unfiltered**, on its own shift, on the final integration commit                                                                                                                | exit 0. The batch README's "Integration verification" requires the whole frontend browser suite once a frontend change lands                                          | **Pending planner verification.** Not run, not waived.                                                                     |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                       | exit 0 on the shared build host                                                                                                                                       | **Not run**; reported as pending, never as passed.                                                                         |

`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` is not decoration: `CLAUDECODE=1` changes Bun's test
output and fails thirteen unrelated tests in this repository.

### 9.5 What none of this proves

- No browser ran. The Chromium checks — the login flow above all, now that the region waits for the
  session — are the planner's and are pending, not waived.
- The directory page's and the project page's suites draw through fixtures that own their directory
  and project owner per mount and never withdraw them; only the session runtime's suites, the app's
  five examples and the router's example exercise the real session.
- The model's disposal is the real one behind one scheduled step; it never fails and never times out.
  Failure is the slot's own model's and the example `fails the session’s retirement when its project
will not let go` and `settles a half-built session that cannot be released, …`; expiry is the
  slot's model's, and the session's timeout variant — nested equal budgets, section 3.8 — is packet k's.
- **Absolute counts on the real base.** This rehearsal's base already carries packet j's third-revision
  runtime, so its sandbox base (53·695) is what the real base should show; the review of the first
  revision measured the real base one example higher than that revision's rehearsal. Every expectation
  in section 6 is relative, and the deltas are what hold.
- No production event sends a same-user identity today; the app example drives `SignedInApp` with one
  directly, which is the component the app renders.
- The `fill=1` run proves the patches survive comments **at** packet h's and packet j's five named
  sites in `project-page.tsx` and their dated notes; the planner's rerun of section 9.1 on the real
  base is what proves the rest, including packet j's review changes.

## 10. Stop conditions

Each is false on the rehearsal tree, checked on 2026-09-24.

1. Step 0a's status is not empty, or `base` differs from the slice note's SHA. Stop: the clone is not
   the tree this packet was reviewed against.
2. Step 0b extracts other than 9 patches or other than 24 fault patches. Stop: this document is not the
   one reviewed.
3. A patch fails `git apply --check`. Stop and report the exact error; never hand-edit a file into
   shape.
4. A baseline (step 0c or a slice's step 1) exits non-zero. Stop, except for the known cases in 11.
5. A red checkpoint shows **no** failure, or different diagnostics than section 6 names. Either means
   the tests did not land as written.
6. A session-set or adopted-set green run differs from its step-0 or step-1 number by anything but the
   slice's own additions. Stop.
7. A proof filter matches zero tests, or more than one. Stop.
8. A fault leaves its named test passing. Restore, re-read the table, redo once; if it still passes,
   stop — the check may not be where this packet says it is.
9. The strict OpenSpec block exits non-zero, or `passed` falls below step 0's number.
10. Slice 2's builder `git grep` prints anything, or `composition.ts` still exists after step 4. Stop.
11. **Known, not this packet's:** in `claims.db.test.ts`, `bounds terminal lock contention and
retries until a held write commits` failing; a single `Test timed out in 5000ms` in one of the
    adopted or session files during a serial run on a loaded host; or a `DiBagCloseCancelledError`
    (`DI_BAG_CLOSE_TIMEOUT`) from the `live-application` fixture's own `afterEach` retirement. Record
    it, rerun **that file alone once**, and stop only if it fails again.
12. At hand-over, the status shows any path outside the slice's own list. Stop.
13. Anything asks for a `git` state change in the clone, a network call, a browser, or `--no-verify`.

## 11. Out of lane

- `runtime/lifetime-slot.ts`, `runtime/application-*`, `runtime/project-runtime.ts`: read only;
  `acquireTransactionally`, `createProjectOwner` and `installProjectRuntime` are imported, not changed.
- The project modules (`modules/project`, `plan-feed`, `plan-writer`, `plan-commands`,
  `calendar-markers`), `modules/channel.ts`, `modules/store.ts`, `modules/preferences`.
- `lib/*`, `components/auth/*`, `components/chrome/*`, `wbs-table.tsx`, `use-plan-read.ts`,
  `saved-plans-panel.tsx`, `main.tsx`, every suite not named in section 5.
- `project.json`, the Vitest configs but `vitest.node-suites.ts`, `bun.lock`, `package.json`: no
  dependency is added, removed or bumped.

## 12. Hand-over to the next packet

- **Task 7, Log out (packet k).** `SignedInApp` holds the session owner. Log out becomes: the account
  menu's `onSignOut` calls `await sessionOwner.leave()` — which withdraws the session and its project
  at once, leaves the project, awaits its retirement, then retires the session, and settles only when
  that has run, however many triggers ask — and hands the signed-out state up **only if**
  `sessionOwner.snapshot().status !== 'fatal'`; otherwise `SignedInApp` already draws `LifetimeFault`.
  No request is sent anywhere on that path. The unmount cleanup's own `leave()` then joins the same
  retirement. What k must add: the ordering (retire before `setSession(null)`), its tests through the
  real account menu, and the failure variant through a project whose close rejects (the example
  `fails the session’s retirement when its project will not let go` is its node-tier twin).
- **Task 11** inherits the project owner as the session's: route unmount still leaves it through
  `ProjectPage`'s effect, and a Strict Mode test should wrap `SignedInApp`. `createProjectOwner`'s
  JSDoc wants rewording then (section 3.8).
- **Task 13** can refuse the header token in `SignedInRegion` once the catalog has a facade, and can
  state "no delivery builds a directory" by symbol rather than slice 2's regex.
- **Task 12** can give `modules/directory-management` its `module-index` block: `module.ts` and
  `DIRECTORY_MANAGEMENT_MODULE_ID` are in place.

## 13. Assumptions recorded rather than asked

1. **The project owner belongs to the session** (section 3.6). The brief asked for a session runtime k
   can retire project-then-session with; owning it is the only way the order is not left to React.
2. **"The directory module" is the directory-management module**, sealed with the `directory`
   resource private: the feature is the resource's only importer today, and the resource keeps its own
   module directory for the plan pickers the README expects.
3. **The key is the user id of the newest request**, not of the published runtime: a same-user request
   joins the newest one, even while it is still retiring or constructing, and after a failed
   construction the same user is not retried until the region remounts (the fatal page's reload).
4. **`SignedInApp` is exported from `app.tsx`** and takes an `openOwner` test seam, the same bargain
   `ProjectPage`'s `api` makes: production passes nothing.
5. **The directory survives a route change within one session.** Re-entering the directory page shows
   what it held and reads again, instead of starting empty.
6. **The model's clients are fakes with scheduled reads; its project runtimes are real.** A session's
   own wiring is what reaches them, so the project guards under test are production's.
7. **Serial runs for the multi-file suites**, as the project's own `test` target runs them.

## 14. The brief, point by point

### 14.1 The non-negotiables of the commissioning brief

| Requirement                                                                                                                                                                          | Where this packet meets it                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| the session runtime as a lifecycle keyed by user id, installing the directory module; router instance and address survive a same-session update                                      | §3.1–3.4; `createSessionOwner`, `directoryManagementModule`, `SignedInApp`; the app example of §9.3                                   |
| designed so packet k can retire project then session with no request                                                                                                                 | §3.6 and §12: one `leave()`                                                                                                           |
| a written state machine (states, events, invariants)                                                                                                                                 | §3.1                                                                                                                                  |
| `fc.asyncModelRun` model test; four sabotages at least: a directory read surviving a user switch, a late answer after retirement, double retirement, a project outliving its session | §8.1: `m1` (run 3), `m3` (2), `m6` (1, the double trigger; §3.8 on the double disposal), `m7` (14), plus eight more                   |
| "Unknown is not OK"; production-path negatives with `Proof:` comments dated by the executor                                                                                          | §8: twenty-four faults, each observed; §3.8 and §9.3 name what was tried and could not be proved                                      |
| no `any`, unchecked cast or `!` outside tests; verb-object names, predicate booleans; no product names in identifiers                                                                | none in the production diffs; `createSessionOwner`, `installSessionRuntime`, `sessionFor`, `isCurrent`, `isActiveReader`              |
| module-identifier grammar                                                                                                                                                            | `module.frontend.directory-management`, label `frontend.directory-management` (§7.3)                                                  |
| task 6 ticked only if every sentence is met; residuals with owners                                                                                                                   | §3.8; ticked in slice 3 with a dated note; residuals to tasks 7, 11, 12, 13                                                           |
| rehearsal commits, one per slice, hooks on; reds on the previous slice plus the test side; faults run, restored, `cmp`                                                               | §9.3                                                                                                                                  |
| exact planner commit subjects and `owned.txt` per slice; relative counts; planner-only list                                                                                          | §6 each slice's step 9 and subject; §9.4                                                                                              |
| §9.1-style extraction with a fill simulation for packets h's and j's comment sites                                                                                                   | §9.1, `fill=0` identical to the final rehearsal commit; `fill=1` over their five sites and dated notes, and this packet's own fifteen |
| `legacy-root` exemption only if a pre-namespacing path is cited                                                                                                                      | none cited: every path is `apps/wbs/fe-01/…` or relative to it                                                                        |
| no absolute path outside Dispatch; `--driver claude` and `--require-ancestor <J3>` on every dispatch line                                                                            | §6 Dispatch                                                                                                                           |
| which hunks touch packet j's files                                                                                                                                                   | §5, "Why the slices are cut where they are"                                                                                           |

### 14.2 The batch-6 addendum's twenty points

| Point                       | Assessment                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reproduced red           | Met for all three slices: compiler and runtime reds, each rebuilt from the previous slice plus its test side, diagnostics pasted (§6).                                                                                                                                                                                                                                                                    |
| 2. Typecheck and lint       | Met: both native per slice, exit 0 on each rehearsed commit, every slice committed with lefthook on (§9.3).                                                                                                                                                                                                                                                                                               |
| 3. Path counts              | Met: each hand-over lists the slice's exact paths (14, 13, 12); the planner's own commit adds only this document.                                                                                                                                                                                                                                                                                         |
| 4. Failure-visible commands | Met: every check records its own status and `expect-status.sh` asserts it.                                                                                                                                                                                                                                                                                                                                |
| 5. HEAD-reading tests       | N/A: no project, target or CI path is renamed.                                                                                                                                                                                                                                                                                                                                                            |
| 6. Sandbox constraints      | Met: whole targets, build, devsync and Chromium are the planner's, with expected deltas (§9.4).                                                                                                                                                                                                                                                                                                           |
| 7. Known race               | Met: named, one rerun, no repair authority (§10.11).                                                                                                                                                                                                                                                                                                                                                      |
| 8. Names                    | Met: no product name in an identifier; the module id follows the grammar.                                                                                                                                                                                                                                                                                                                                 |
| 9. Packet form and evidence | Met: three slices, each ending in a planner commit with its exact subject; relative baselines; production-path negatives with observed messages; the unprovable named, not skipped.                                                                                                                                                                                                                       |
| 10. Pins                    | Met: no pin touched.                                                                                                                                                                                                                                                                                                                                                                                      |
| 11. Pipeline exit handling  | Met: the fault `diff` form after one command; the filter count, the placeholder check and the builder check read single commands or captured output.                                                                                                                                                                                                                                                      |
| 12. Planner chaining        | Met: the extraction stops at the first failed check (§9.1).                                                                                                                                                                                                                                                                                                                                               |
| 13. Module index            | N/A with reason: no `fe-01` module carries a `module-index` block yet; task 12 adds them, and `module.ts` does not need one to be sealed.                                                                                                                                                                                                                                                                 |
| 14. Bun directory filters   | N/A: every suite runs through Vitest from `apps/wbs/fe-01`.                                                                                                                                                                                                                                                                                                                                               |
| 15. Interleaving property   | Met: the owner, its sessions and their projects under `fc.scheduler`-ordered answers, gestures, project opens, disposals, sign-ins from inside a notification and unbuildable sign-ins (§3.1, §7.2).                                                                                                                                                                                                      |
| 16. Model-based remedy      | Met: `fc.asyncModelRun` against a reference model, with re-entrant sign-ins from inside the owner's notification and partial acquisitions with a recorded release among its commands, and twelve sabotages at recorded runs (§8.1). A failing or expiring **disposal** is not a model command: it is the slot's own model's and two examples' here, and the session's timeout is packet k's (§3.1, §3.8). |
| 17. Seeded evidence         | N/A: no slice reads an earlier attempt's evidence.                                                                                                                                                                                                                                                                                                                                                        |
| 18. Symbol-based checks     | N/A: no code-shape checker is introduced; slice 2's `git grep` is a verification command, and task 13 owns the symbol-based rule (§12).                                                                                                                                                                                                                                                                   |
| 19. Missing-file grep       | Met: every grep over a file follows a `test -f` or reads captured output.                                                                                                                                                                                                                                                                                                                                 |
| 20. Honest limits           | Met: §3.8 and §9.5 — the fixtures, the unfailing model disposal, the absent same-user event, the double-disposal fault that cannot be observed, the fill limits.                                                                                                                                                                                                                                          |

## 15. Ready to commit

| Slice | Paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Subject                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1     | `spec.md`, `verify.md`, `apps/wbs/fe-01/vitest.node-suites.ts`, `apps/wbs/fe-01/src/modules/directory/{contract.ts,directory.resource.ts,directory.resource.test.ts}`, `apps/wbs/fe-01/src/modules/directory-management/{composition.ts,contract.ts,directory-management.feature.test.ts}` — **9 modified**; `…/directory-management/{module.ts,module.test.ts}`, `apps/wbs/fe-01/src/runtime/{session-runtime.ts,session-runtime.model.test.ts,session-runtime.test.ts}` — **5 new** | `feat(frontend): own the signed-in user's directory and project in one session runtime`                    |
| 2     | `spec.md`, `verify.md`, `apps/wbs/fe-01/src/{app.tsx,app.test.tsx,app-router.tsx,app-router.test.tsx}`, `…/components/directory/{directory-page.tsx,directory-page.test.tsx}`, `…/directory-management/view/use-directory-management.ts`, `…/runtime/{session-runtime.ts,session-runtime.test.ts}` — **11 modified**; `…/directory-management/composition.ts` — **deleted**; `…/testing/directory-page-over-client.tsx` — **1 new**                                                   | `refactor(frontend): draw the directory from the signed-in user's session, kept across a same-user update` |
| 3     | `spec.md`, `verify.md`, `tasks.md`, `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, `apps/wbs/fe-01/src/{app-router.tsx,app-router.test.tsx}`, `…/components/wbs/{project-page.tsx,project-page.test.tsx,optimization-integration.test.tsx}`, `…/modules/{directory,directory-management}/README.md` — **11 modified**; `…/testing/project-page-over-owner.tsx` — **1 new**                                                                               | `refactor(frontend): open the selected project through the signed-in session, and close task 6`            |

(`spec.md`, `verify.md` and `tasks.md` are under `openspec/changes/adopt-frontend-lifetimes/`; `…` is
`apps/wbs/fe-01/src`.) After the last commit the host gate runs on the shared build host with the
committed hash, and its printed running-hash line and exit status are recorded. Anywhere else it is
reported as not run, with the reason — never as passed. The Chromium runs of §9.4 are reported the same
way until they have happened.
