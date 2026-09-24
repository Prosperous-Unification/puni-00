# 050.7 k — log out as a coordinated local exit

|             |                                                                                                                                                                                                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **fifteenth packet**                                                                                                                                                                                    |
| Size class  | S — two slices, each one executor attempt                                                                                                                                                                                                                                                          |
| Predecessor | 050.7i (`050-7-i-session-runtime.md`, beside this packet once it lands) — `createSessionOwner`, `SignedInApp`, and its section 12, "Hand-over to the next packet": "Log out becomes `await sessionOwner.leave()`, then render signed-out only if the owner is not `fatal`"                         |
| Advances    | OpenSpec task **7** of `adopt-frontend-lifetimes` — **ticked** in slice 2, every sentence met (section 3.7). Also closes packet j's named residual, "the fatal nobody sees" after a project page has gone (section 3.5).                                                                           |
| Revision    | Second: the round-1 review applied — a real-base mode for section 9.1, the dispatch base built by cherry-pick, lifetime-map tests 12 and 13 amended, eight minors.                                                                                                                                 |
| Schema      | OpenSpec change `adopt-frontend-lifetimes`, already `sdd-lean`. Two scenarios added to the existing requirement "Log out stays a local exit" (slice 1) and one to packet i's session requirement (slice 2); task 7 ticked with a dated note; one dated update to the lifetime map's session owner. |

## 1. Goal, non-goals, and the cut

**Goal.** Log out is a **lifecycle transition of the session owner**, not a React state change. The
account menu's `Log out` calls the owner's new **`exit()`** — which is its one `leave()`: the session
and its project are withdrawn in the same instant, the project is retired and then the session, each
under the retirement budget — and `SignedInApp` renders the signed-out state **only when that exit
settles `signed-out`**. No request is sent and nothing is revoked, so a reload still restores the
identity from its cookie. When the project's socket refuses, or never closes within the budget, the
owner is terminally `fatal` and the region draws the sanitized fatal state instead; nothing retired is
drawn again. A second log out, the region's own departure, a log out during a switch or a sign-in, all
join the one retirement and settle only once it has run.

**The failure is drawn, not logged — decided (section 3.5).** The session's fatal state is drawn by
`SignedInApp`, as packet i already does for a failed construction. The same component now also draws
the **project** owner's terminal fault in the region's place (`ProjectRetirementGate`), which closes
packet j's named residual: a project page that goes — a route change, Strict Mode's cleanup — gives
its project back from its effect cleanup after it is gone, and a socket that refused there left the
owner terminally `fatal` with nothing on screen.

**Non-goals.**

- **Server-side sign-out.** `POST /api/auth/logout` stays uncalled (the proposal's non-goal).
- **A console report for session or project faults.** The application bootstrap's `showFatal` stays
  local to `application-bootstrap.tsx`; no seam out of it is made (section 3.5).
- **Page hide's own session retirement.** `pagehide` takes the React root down, so `SignedInApp`'s
  unmount cleanup starts `leave()` and nobody observes how it ends. Named residual, no open task
  owns it (section 12).
- **Route unmount and Strict Mode driven through the router**: task 11's. This packet's region
  example leaves the project the way the page's cleanup does, directly (section 3.7).
- **A "Signing out…" line.** While a log out retires, the region shows the same "Loading…" line it
  shows while a sign-in builds (section 13).
- No dependency, `project.json`, `bun.lock` or pin changes; `lifetime-slot.ts`,
  `project-runtime.ts`, `application-*` are not touched.

**What a reader sees change**, and nothing else: after `Log out` the region shows "Loading…" until the
project and the session have let go — microseconds normally, at most one retirement budget — and then
the sign-in form, as before; a log out whose project will not let go shows the sanitized fatal page
with its Reload instead of the form; and a project that cannot be given back after its page has gone
shows the same page in the signed-in region's place.

**The cut, and why two slices.**

1. **The owner's exit and its model**, plain TypeScript with node-tier tests and no React:
   `SessionOwner.exit` and `SessionExit` in `runtime/session-runtime.ts`, the log-out model test
   `session-exit.model.test.ts` (new), three examples in `session-runtime.test.ts`, one line in
   `vitest.node-suites.ts`. Delivery does not change. This slice carries the state machine and its
   seven model faults.
2. **The region**: `SignedInApp` takes `onSignedOut` and wires `Log out` to `exit()`;
   `ProjectRetirementGate` draws a terminal project fault; five app examples through the real account
   menu, one of them through the whole `App`; task 7 ticked; the lifetime map's dated update.

## 2. Read first

| File                                                                                      | Why                                                                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, `LLM_README.md`                                                              | Rules R1–R5 and the routing index.                                                                                 |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                     | "Execution contract", "Standard blocks every packet uses" — the strict OpenSpec block and the fault form.          |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`                | "Session owner" (the local-exit paragraphs), "Replacement and cleanup policy", exact lifecycle tests 6, 13 and 14. |
| `docs/superpowers/plans/2026-09-21-batch-6/050-7-i-session-runtime.md`, sections 3 and 12 | The owner this packet extends, its state machine, and the hand-over this packet takes.                             |
| `apps/wbs/fe-01/src/runtime/session-runtime.ts`, `lifetime-slot.ts`                       | `createSessionOwner`, `leave`, the nested budgets; the slot's `retire` from `fatal` (section 3.1).                 |
| `apps/wbs/fe-01/src/app.tsx`, `components/chrome/account-menu.tsx`, `lifetime-fault.tsx`  | `SignedInApp`, the `Log out` item, the fatal page.                                                                 |

## 3. Design

### 3.1 The state machine

This section is the record the batch addendum's lesson 16 asks for; `session-exit.model.test.ts`
executes it and names it in its JSDoc, and the rules are JSDoc on `SessionOwner.exit`, `SessionExit`,
`SignedInApp` and `ProjectRetirementGate` (R3).

**The owner** is packet i's: one lifetime slot, `wanted` (the identity the newest request asked for),
`latest`. `exit()` adds no state of its own: it is `await leave()` — which sets `wanted = null` and
queues `slot.retire()` — followed by a **classification** of what the owner then holds. **A log out**
moves through `asked → withdrawn → project retiring → session retiring → settled(outcome)`; the
region moves `drawn → Loading… → signed-out form | fatal page`.

| From (owner)                              | Event                                                                                   | To                                                                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `live(r)`, `r` with a project `p` live    | `Log out` → `exit()` — **synchronously**                                                | `retiring`; `r` and `p` answer `isCurrent()` false; the region stops drawing them; no request is sent                                                      |
| `retiring`                                | `r`'s disposal: `p`'s owner leaves, `p` closes, then the session's own graph closes     | `empty`; the exit settles `signed-out` if nobody has been asked for since, `overtaken` if a sign-in has                                                    |
| `retiring`                                | `p`'s close rejects (`SessionProjectRetirementError` from the session's disposer)       | `fatal`, terminal; the exit settles `fatal`; the region draws the fatal page                                                                               |
| `retiring`                                | `p`'s socket never closes: the session's wait expires first (the project's runs inside) | `fatal`, terminal, **at one budget**; the exit settles `fatal`; the late disposal stays observed by the slot and publishes nothing when it ends            |
| any                                       | a second `exit()`, or the region's unmount `leave()`, while one retires                 | queued behind it; each settles after it has run, with its outcome (`fatal` stays `fatal`; an `empty` owner settles `signed-out` at once)                   |
| `retiring` or `constructing` for a switch | `exit()` during a user switch or a sign-in still building                               | the switch's request is superseded and builds nothing; one retirement runs; the exit settles `signed-out`                                                  |
| `fatal`, not terminal                     | `exit()` after a sign-in that could not be built                                        | stays `fatal` — the slot publishes `empty` only from `retiring` — and the exit settles `fatal`: the page's Reload is the way on (**decided**, section 3.4) |
| `fatal`, terminal                         | `exit()`                                                                                | refused with the recorded refusal; the exit settles `fatal`                                                                                                |
| any                                       | a sign-in asked after `exit()` and before its retirement has run                        | the exit settles `overtaken`: rendering signed-out would undo that sign-in                                                                                 |
| `live(r)` with `p` fatal and terminal     | (not a log out) `p`'s page went and `p`'s close failed                                  | the session stays `live`; `ProjectRetirementGate` draws `p`'s fault in the region's place                                                                  |

**Events** the model generates, each against the real owner, the real session runtime and the real
project runtimes: `signIn(u1|u2)`, `signInBroken(u1|u2)` — an installation that acquires the whole
graph and then throws a `PartialAcquisitionError` — `logOut`, `reenterLogOut` — a log out asked from
inside the owner's own notification, the next time it says anything, as a re-rendered component
would — `leave` (the region going by itself), `openProject(i, p1|p2, settles|rejects|hangs)` on any
session ever built, a captured directory `read(i)` on any session, one scheduled step (`answer`), all
of them (`drain`), and `elapse` — the fake clock passed the retirement budget four times over, with
every step run between. A project's close ends as its mode says: it lets go; its socket refuses; or its
socket is a DI Bag graph whose disposer **never settles**, so only the bounded wait ends it — the
controlled timeout lifetime-map test 14 asks for. Each session's and each project's close waits on one
scheduled step first, which opens the interval between withdrawal and disposal. Only a project's plan
read (`tree`) waits for the scheduler, so one late answer is what a withdrawn project must drop.

**Invariants**, each asserted by the model against its own records, never against the owner's say-so:

- **L1 — no request.** A session the model has withdrawn — by a log out, a leave or another user —
  sends nothing for a read asked of it afterwards; this is L1's teeth (`x1`), with the two app
  examples' recorded `fetch` paths, one through the real owner and `httpDirectoryApi`. The model also
  compares the request counts across the synchronous part of `exit()`, which can only see a request
  issued before `leave()`'s first await.
- **L2 — project, then session.** A session's close never resolves while a project it built has not
  been given back.
- **L3 — no late project answer.** From the instant its session is withdrawn, a project's delivered
  plan stays the very object it was then, whatever answers afterwards.
- **L4 — bounded.** Once every step has run and the clock has passed the budget four times over,
  every log out asked before has settled; at the teardown, every open, leave and read has too. The
  model proves the bound within four budgets; **one** budget is the example `e2`'s (unsettled at 999
  ms, `fatal` at 1 001 ms) and the app example's at 50 ms.
- **L5 — `signed-out` is earned.** A log out settles `signed-out` only when every session published
  before it was asked has been given back, with every project it built, and no sign-in was asked for
  while its retirement was still running.
- **L6 — failure is `fatal`.** A log out any of whose sessions or projects failed to let go settles
  `fatal`; a log out settles `fatal` only when something failed (a close, or an installation); it
  settles `overtaken` only when a sign-in was asked for after it.
- **L7 — once.** At the teardown every session but the live one was retired exactly once.

Interleavings counted over the pinned run and asserted non-zero: a log out with a project open; one
while the owner was retiring; one while a sign-in was in flight; a second log out while one was
unsettled; a sign-in while a log out was unsettled; a project answer landing after its session was
withdrawn; a read of a withdrawn session; a project close that timed out and one that refused; a log
out from inside a notification; one after an unbuildable sign-in; and each of the three outcomes.

**Why `overtaken` is judged only while the retirement runs.** The exit reads `wanted` once its
`leave()` has settled; a sign-in that arrives after that read but before the settlement reaches the
model's callback is legitimately not seen. The model therefore flags a sign-in only while a session
the log out has to see go has not gone, and clears the flag when a later log out or leave asks for
nobody again. Its first rehearsal judged against the model's `wanted` at settlement, and shrank to two
false counterexamples in which the owner was right (section 9.3).

### 3.2 The exit — `SessionOwner.exit`

```ts
exit: async () => {
  await owner.leave();
  if (slot.snapshot().status === 'fatal') return 'fatal';
  return wanted === null ? 'signed-out' : 'overtaken';
},
```

`leave()` is packet i's: withdraw synchronously, queue one retirement, settle once it has run, every
refusal of this owner's own runtimes recorded and settled rather than rethrown. `exit()` only reads
what the owner holds afterwards. The object literal becomes `const owner: SessionOwner = { … }` so
that `exit` can call `owner.leave()`; nothing else in `createSessionOwner` changes.

`SessionExit` is exported beside it: `'signed-out' | 'fatal' | 'overtaken'`, each case's meaning in
its JSDoc. `exit()` rejects only with a fault of the slot itself, which `leave()` already rethrows
with its cause — never for a refusal of the owner's runtimes (packet i's `settle`). `open()` can
reject that way too (packet i's round-2 review: a throwing `clientFor` runs outside
`installRecorded`); the exit does not depend on `open()` settling — it queues behind it.

### 3.3 The region — `SignedInApp` and `ProjectRetirementGate`

| Consumer                          | Before (base)                                                          | After                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppContent` (`app.tsx`)          | `<SignedInApp session onSignOut={() => setSession(null)} />`           | `onSignedOut={() => setSession(null)}` — the same body, called later                                                                               |
| `SignedInApp`                     | the account menu's `onSignOut` is the prop: `setSession(null)` at once | `signOut`: `void sessionOwner.exit().then((exit) => { if (exit === 'signed-out') onSignedOut(); })`; the router wrapped in `ProjectRetirementGate` |
| `ProjectRetirementGate` (**new**) | —                                                                      | subscribes to the session's `projects`; draws `LifetimeFault` for a **terminal** project fault, its children otherwise                             |
| `AccountMenu`                     | `onSignOut()` on `Log out`                                             | unchanged                                                                                                                                          |

Why the order holds without React's help: `exit()` withdraws synchronously, so the owner publishes
`retiring` before `SignedInApp` renders again; the region, the router and the project page are then
not drawn ("Loading…"), and the project page's own cleanup `leave()` joins the project slot's
retirement that the session's disposer started. `onSignedOut` — `setSession(null)` — runs only after
the exit settled, and `SignedInApp`'s own unmount `leave()` then finds the owner `empty` and settles.

`signOut` is defined after the early returns, next to the final `return`, and the router's JSX is
re-indented by the gate: both placed away from packet i's `g2`–`g4` comment sites (section 9.1).

### 3.4 Decisions

- **The failure is drawn, not logged.** Task 7 asks for "the fatal state", and the fatal page is
  visible, carries the occurrence handle, and is what packet i draws for a failed construction. A
  console line would need a seam out of `application-bootstrap.tsx`'s `showFatal`, which is the
  application lifetime's; the lifetime map's single non-React reporter stays unbuilt. R5 is met —
  nothing is defaulted or swallowed, the owner is terminally `fatal`, nothing retired is republished,
  and the region draws the sanitized report and occurrence handle — but once the reader presses
  Reload no record remains, unlike the application's `console.error`. Slice 2's dated map update
  therefore **amends lifetime-map tests 12 and 13** for the project and the session: reporter
  occurrence not emitted, drawn instead, the non-React reporter unbuilt with no open task.
- **A terminal project fault is drawn by the region.** Packet j left "the fatal nobody sees" to task 7
  or task 11. With the project owner the session's (packet i), `SignedInApp` holds it and can draw it;
  a non-terminal project fault (a construction that failed and holds nothing) stays the project
  page's own to draw, because that page is still mounted.
- **Log out after an unbuildable sign-in stays fatal** (packet i's round-2 review, Minor 2). The owner
  is `fatal`, not terminal; `retire()` publishes `empty` only from `retiring`, so the state stays and
  `exit()` settles `fatal`. The region draws that page already — its account menu is not on screen —
  so no production gesture reaches this; the owner's contract says what happens anyway, and the example
  `settles fatal after a sign-in that could not be built, and keeps the fatal state` holds it.
- **The nested equal budgets stay.** The project's wait runs inside the session's disposer, under the
  same `RETIREMENT_BUDGET_MS`, started microtasks later; a never-closing socket therefore ends the log
  out at **one** budget, through the session's own `DiBagCloseCancelledError`, and the project's own
  expiry follows and turns the session's late disposal `failed`. The log out is **bounded twice**:
  unbinding either wait alone leaves the model green (rehearsed, section 9.3), so the fault `x4`
  unbinds both.

### 3.5 What this packet does and does not claim

- **Task 7 is met sentence by sentence.** "A coordinated local exit": `exit()` is the owner's one
  retirement, joined by every trigger (model L5, L6; faults `x5`, `x6`, `x7`). "No request": L1
  (fault `x1`), the example's request count, and two app examples' `fetch` paths. "Project then
  session retirement": L2 (fault `x2`), the example's event order (`e1`), the app example's event order
  with the signed-out state last (`a1`). "The fatal state when either fails": a refusing project
  (`a2`; the model's `x6`), a never-closing one within the budget (`e2`, the app example at 50 ms),
  and a sign-in that could not be built (`e3`).
  Ticked in slice 2.
- **A session disposer that fails on its own has no production source**: the session graph's one
  owned disposable is its project owner. Lifetime-map test 13's "session directory/catalog disposer"
  does not exist; the session fails through its project or its budget, and both are proved.
- **Carried, not proved**: that the region draws nothing of the session between the click and the
  settlement — `sessionFor` returns `null` for `retiring`, packet i's `g1` — and that `AccountMenu`
  calls `onSignOut` (its own suite).
- **Not driven through the router**: the region example leaves the project by calling
  `session.projects.leave()`, which is what the project page's effect cleanup does; driving the route
  change is task 11's.
- **`ProjectPage`'s own fatal branch** is now shadowed, under `SignedInApp`, for a terminal fault; it
  still draws a non-terminal one, and its own suites still reach both through their fixture.

## 4. Verified facts

Every number is a fresh observation from this packet's own rehearsal on 2026-09-24, on the authoring
base `2e237e20e` — batch-6 integration `52876ae12` (main with packet h merged, plus packet j's real
lane) with packet i's nine rehearsed diffs applied by packet i's own section 9.1 extraction (`fill=0`:
nine patches, twenty-four fault patches, all checked, twenty-nine paths) and committed once — and on two
rehearsal commits over it. That base is **never dispatched**: the dispatch base is planning after
packet i's real lane has landed, which differs from it by packet i's executor `Proof:` comments, dated
notes and `verify.md` entries (section 9.1 simulates all three).

### 4.1 The code as it stands

| Fact                                                                                                                                      | Where                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Log out today is `onSignOut={() => setSession(null)}`; `SignedInApp`'s unmount then calls `void sessionOwner.leave()` after the form drew | `app.tsx`, `AppContent` and `SignedInApp` |
| No frontend caller sends `POST /api/auth/logout`; the account menu only calls `onSignOut()`                                               | `components/chrome/account-menu.tsx`      |
| `leave()` sets `wanted = null` and is `settle(slot.retire())`; a second one queues behind the first                                       | `runtime/session-runtime.ts`              |
| The session's one owned disposable is its project owner; its disposer awaits `projects.leave()` and throws when it is terminally fatal    | `installSessionRuntime`                   |
| `retire()` publishes `empty` only when the slot is `retiring`; from a non-terminal `fatal` it changes nothing                             | `runtime/lifetime-slot.ts`, `transition`  |
| DI Bag 0.4.0's bounded close uses `setTimeout` and `performance.now()`; `timeoutMs` must be finite and positive                           | `di-bag/dist/startup.js`                  |
| React 19.2.8, Vitest 5.0.0, fast-check 4.9.0                                                                                              | `node_modules/*/package.json`             |

### 4.2 The measured blast radius

`git diff --stat 2e237e20e 59cfe22a4`: **9 files changed, 1274 insertions(+), 24 deletions(-)**; with `verify.md`, which only the executor writes,
the slices own 10 distinct paths — slice 1 owns 6 (1 new), slice 2 owns 6.

| Tree             | Sandbox node suite | Runtime set (3 files) | Session set (3 files, serial) | Adopted set (20 files) | Zoned | Preferences |
| ---------------- | ------------------ | --------------------- | ----------------------------- | ---------------------- | ----- | ----------- |
| base `2e237e20e` | 56·709             | 2·9                   | 3·65                          | 20·1219                | 2·3   | 4·39        |
| after slice 1    | 57·713             | 3·13                  | 3·65                          | —                      | 2·3   | 4·39        |
| after slice 2    | 57·713             | 3·13                  | 3·70                          | 20·1219                | 2·3   | 4·39        |

The **runtime set** is `src/runtime/session-exit.model.test.ts`, `session-runtime.test.ts` and
`session-runtime.model.test.ts`; the **session set** is packet i's: `src/app.test.tsx`,
`src/app-router.test.tsx`, `src/components/directory/directory-page.test.tsx`. The adopted set is not
a slice check here: no file this packet touches is imported by it at run time except
`session-runtime.ts` through `app-router.test.tsx`, whose change adds a member and no behaviour; it was
run once on the final rehearsal commit.

### 4.3 Planner observations on the base, not stop conditions

- Strict OpenSpec `{"items":114,"passed":114,"failed":0}` on the base and after every step that
  touches `spec.md`: the scenarios live in a document that already counted as one item.
- The log-out model runs 300 generated sequences in under a second of test time on the fake clock.

## 5. File plan

Paths under `apps/wbs/fe-01/` unless they start with `openspec/` or `docs/`.

| File                                                                               | Slice | Create/modify | Responsibility                                                              |
| ---------------------------------------------------------------------------------- | ----- | ------------- | --------------------------------------------------------------------------- |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` | 1, 2  | modify        | two log-out scenarios (1); the region's project scenario (2)                |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                              | 1, 2  | modify        | one fresh entry per slice, appended                                         |
| `src/runtime/session-runtime.ts`                                                   | 1     | modify        | `SessionOwner.exit`, `SessionExit`; the object literal named `owner`        |
| `src/runtime/session-exit.model.test.ts`                                           | 1     | **create**    | the model test (section 3.1)                                                |
| `src/runtime/session-runtime.test.ts`                                              | 1     | modify        | three examples in a new `log out` block, two imports                        |
| `vitest.node-suites.ts`                                                            | 1     | modify        | list the new DOM-free suite                                                 |
| `src/app.tsx`                                                                      | 2     | modify        | `onSignedOut`, `signOut`, `ProjectRetirementGate`                           |
| `src/app.test.tsx`                                                                 | 2     | modify        | the named edit (`onSignOut` → `onSignedOut` in `signedInAs`), five examples |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                               | 2     | modify        | task 7 ticked, with a dated note                                            |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`         | 2     | modify        | one dated update after "Local exit calls the host coordinator…"             |

Nothing else. Not `lifetime-slot.ts`, `project-runtime.ts`, `application-*`, `account-menu.tsx`,
`lifetime-fault.tsx`, `app-router.tsx`, `project-page.tsx`, `lib/*`, `project.json`, `bun.lock` or
`package.json`.

### Which hunks meet packet i's files, and why they apply after its executor

Packet i's executor writes `// Proof:` comments above named lines of `session-runtime.ts` (eleven
slice-1 sites and `g1`) and `app.tsx` (`g2`–`g4`), and dates `<observed-date-i>` in `tasks.md` and
the lifetime map. This packet's hunks keep three lines of context clear of every one of those lines:
`exit` is inserted after `leave`'s closing brace, below `wanted = null;` by three lines; the
`return {` → `const owner: SessionOwner = {` hunk ends on `open: (identity) => {`, the line above
`i`'s `m1` site; `signOut` sits after the "Loading…" return; the lifetime-map paragraph goes after
"Local exit calls the host coordinator…", not after packet i's dated one. Two of this packet's faults
**replace** a line packet i comments (`x2` at `await projects.leave();`, `x3` at
`isCurrent: () => isCurrent() && dependencies.isCurrent(),`): they are zero-context patches, applied
with `git apply --unidiff-zero`, which locates the one removed line wherever the comment above pushed
it. Section 9.1's `fill=1` run proves all of it against a copy with every one of packet i's sites
filled and its notes dated.

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
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-k-log-out.md
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
test "$count" -eq 13
# The runtime set and packet i's session set, relative to apps/wbs/fe-01.
printf '%s\n' src/runtime/session-exit.model.test.ts src/runtime/session-runtime.test.ts \
  src/runtime/session-runtime.model.test.ts > "$TMPDIR/runtime.txt"
printf '%s\n' src/app.test.tsx src/app-router.test.tsx \
  src/components/directory/directory-page.test.tsx > "$TMPDIR/session.txt"
test "$(wc -l < "$TMPDIR/session.txt")" -eq 3
````

Expected: `patches=6`, `mutations=13`, exit 0. **Applying section 7.N** below always means exactly
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
bash "$TMPDIR/run-check.sh" base-preferences env TZ=UTC bunx vitest run src/modules/preferences
bash "$TMPDIR/run-check.sh" base-sandbox bunx vitest run --config vitest.node.config.ts \
  --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
# shellcheck disable=SC2046 # three fixed paths without spaces
bash "$TMPDIR/run-check.sh" base-session env TZ=UTC bunx vitest run --no-file-parallelism \
  --maxWorkers=1 $(cat "$TMPDIR/session.txt")
bash "$TMPDIR/run-check.sh" base-zoned env TZ=Pacific/Auckland bunx vitest run \
  --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
for check in base-preferences base-sandbox base-session base-zoned; do
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
orientation only (section 9.3 has them per slice).

In the sandbox the executor never runs `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e` or `tool-devsync:test`; section 9.4 gives each to the planner with its expected
relative delta.

### Slice 1 — the owner's local exit, with the log-out state machine's model test

Owns (6 paths): `spec.md`, `verify.md`, `apps/wbs/fe-01/vitest.node-suites.ts`, and under
`apps/wbs/fe-01/src/runtime/`: `session-runtime.ts`, `session-runtime.test.ts` and one new file,
`session-exit.model.test.ts`.

- [ ] 1. Step 0. Expected: the session set passes (rehearsed 3·65), sandbox rehearsed 56·709.
- [ ] 2. **The contract first (R4).** Apply section 7.1 (two scenarios under "Log out stays a local
      exit") and rerun the strict block. Expected: exit 0, `passed` equal to step 0's number
      (rehearsed 114 → 114).
- [ ] 3. Apply section 7.2: the model test and the three examples. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-red-vitest env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/runtime/session-exit.model.test.ts src/runtime/session-runtime.test.ts
  bash "$TMPDIR/expect-status.sh" s1-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s1-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 9 errors in 2 files.` — in each file
  one TS2305 (`Module '"./session-runtime"' has no exported member 'SessionExit'.`), TS2339
  (`Property 'exit' does not exist on type 'SessionOwner'.`) at every `exit()` call (one in the model
  test, four in the examples) and one TS7006 per callback parameter that follows from it (two):

  ```text
  apps/wbs/fe-01/src/runtime/session-exit.model.test.ts:17:8 - error TS2305: Module '"./session-runtime"' has no exported member 'SessionExit'.
  apps/wbs/fe-01/src/runtime/session-exit.model.test.ts:344:31 - error TS2339: Property 'exit' does not exist on type 'SessionOwner'.
  apps/wbs/fe-01/src/runtime/session-runtime.test.ts:15:8 - error TS2305: Module '"./session-runtime"' has no exported member 'SessionExit'.
  apps/wbs/fe-01/src/runtime/session-runtime.test.ts:256:24 - error TS2339: Property 'exit' does not exist on type 'SessionOwner'.
  ```

  and Vitest `status=1`, `Test Files 2 failed (2)`, `Tests 4 failed | 8 passed (12)`: the model test on
  `TypeError: world.owner.exit is not a function`, the three new examples on `TypeError: owner.exit is
not a function`; packet i's eight examples pass.

- [ ] 4. Apply section 7.3: `exit` and `SessionExit` in `session-runtime.ts`, and the one line in
      `vitest.node-suites.ts`.
- [ ] 5. **Green checkpoint.**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046 # three fixed paths without spaces
  bash "$TMPDIR/run-check.sh" s1-green-runtime env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 $(cat "$TMPDIR/runtime.txt")
  bash "$TMPDIR/run-check.sh" s1-green-tiers env TZ=UTC bunx vitest run src/test-tiers.test.ts
  bash "$TMPDIR/run-check.sh" s1-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s1-green-typecheck s1-green-runtime s1-green-tiers s1-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: runtime 3 files, 13 tests (the log-out model, packet i's model, and
  packet i's eight examples with this packet's three); tiers 5 tests; sandbox = step 0
  **plus 1 file and 4 tests** (rehearsed 56·709 → 57·713).

- [ ] 6. Durable lint, from the repository root:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-lint env NX_DAEMON=false bunx nx run wbs-fe-01:lint
  bash "$TMPDIR/expect-status.sh" s1-lint 0
  ```

  An autofixable import-order or Prettier finding is fixed with `bunx eslint --fix <file>`, not
  reported as a stop (preamble rule 17).

- [ ] 7. The ten proofs of section 8.1 (`x1`–`x7` on the model, `e1`–`e3` on the examples), with
      section 8's procedure: every fault observed first, then the `Proof:` comments at the sites the
      tables name.
- [ ] 8. Rerun `s1-final-runtime` (step 5's runtime command) and step 0c's four commands
      (`s1-final-*`): preferences, session set and zoned unchanged from step 0, sandbox as step 5.
- [ ] 9. Append this slice's `verify.md` entry (shape below), then owned-file Prettier over the six
      paths, `--write` then `--check`, from this list, which step 10 reuses; then rerun the strict
      OpenSpec block — **after** the evidence edit.

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/src/runtime/session-exit.model.test.ts \
    apps/wbs/fe-01/src/runtime/session-runtime.test.ts \
    apps/wbs/fe-01/src/runtime/session-runtime.ts \
    apps/wbs/fe-01/vitest.node-suites.ts \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md \
    > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 6
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

  Expected: the `diff` prints nothing and exits 0: five ` M` paths and one `??` — on the real base,
  where `verify.md` already exists with packet i's entries. (On the authoring base it would be a second
  `??`; that base is never dispatched.)

Planner commit subject:
`feat(frontend): give the session owner a local exit that retires the project and then the session`.

### Slice 2 — log out through the region, and the records

Owns (6 paths): `spec.md`, `verify.md`, `tasks.md` (all under
`openspec/changes/adopt-frontend-lifetimes/`),
`docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, and
`apps/wbs/fe-01/src/{app.tsx,app.test.tsx}`.

- [ ] 1. Step 0. Expected: session set rehearsed 3·65, sandbox 57·713.
- [ ] 2. **The contract first.** Apply section 7.4 (the scenario "A project given back after its page
      has gone fails visibly") and rerun the strict block: exit 0, `passed` unchanged.
- [ ] 3. Apply section 7.5, the test side: **the named edit** — `signedInAs`'s one
      `onSignOut={() => undefined}` becomes `onSignedOut={() => undefined}` — the new imports, and the
      `log out` block's five examples. No other `expect` line changes. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s2-red-vitest env TZ=UTC bunx vitest run src/app.test.tsx
  bash "$TMPDIR/expect-status.sh" s2-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s2-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 2 errors in the same file, starting
at: apps/wbs/fe-01/src/app.test.tsx:325` — two TS2322, `… is not assignable to type
'IntrinsicAttributes & SignedInAppProps'.` (`onSignedOut` is not a prop yet), at `signedInAs` and at
  the `log out` block's `regionOf`; and Vitest `status=1`, `Tests 4 failed | 13 passed (17)`: `signs
out once …` on `expected [] to include 'signed out'`, the two fatal-page examples and the region
  example on `Error: no fatal state yet`, with `Errors 3 errors` — three unhandled `TypeError:
onSignOut is not a function`, the old prop missing when the menu is clicked. `returns to the sign-in
form through the app, …` **passes** on this base: the app already signed out locally at once, and
  the example is the behaviour oracle, not a proof.

- [ ] 4. Apply section 7.6 (`app.tsx`, `tasks.md`, the lifetime map), then date the two notes by
      observation, never by copying a date from this packet:

  ```sh
  set -euo pipefail
  observed=$(date -u +%F)
  for note in openspec/changes/adopt-frontend-lifetimes/tasks.md \
    docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md; do
    test -f "$note"
    test "$(grep -c '<observed-date-k>' "$note")" -eq 1
    sed -i "s/<observed-date-k>/$observed/" "$note"
    grep -n "observed $observed" "$note"
    if grep -n '<observed-date-k>' "$note"; then echo "placeholder left in $note" >&2; exit 1; else rc=$?; test "$rc" -eq 1; fi
  done
  ```

  Expected: at least one line printed per file (other packets' notes may carry the same date), exit 0;
  task 7's box is `[x]`.

- [ ] 5. **Green checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  bash "$TMPDIR/run-check.sh" s2-format env NX_DAEMON=false bunx nx format:check --all
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s2-green-session env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 $(cat "$TMPDIR/session.txt")
  bash "$TMPDIR/run-check.sh" s2-green-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/run-check.sh" s2-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s2-green-typecheck s2-format s2-green-session s2-green-zoned s2-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: session set = step 0 **+ 5 tests** (rehearsed 3·65 → 3·70); zoned
  unchanged; sandbox unchanged (57·713) — `app.test.tsx` is a jsdom suite.

- [ ] 6. Durable lint (`s2-lint`), expected `status=0`.
- [ ] 7. The three proofs of section 8.2 (`a1`, `a2`, `p1`, all in `app.tsx`).
- [ ] 8. Rerun the session set (`s2-final-session`) and step 0c's preferences and sandbox commands
      (`s2-final-*`): unchanged from step 5.
- [ ] 9. `verify.md` entry. Then owned-file Prettier over the six paths from this list (step 10
      reuses it), `nx format:check --all` again (`s2-format-after`), and the strict OpenSpec block —
      all after the evidence edit. Never a repository-wide format **write**.

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/src/app.test.tsx \
    apps/wbs/fe-01/src/app.tsx \
    docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/tasks.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md \
    > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 6
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  ```

  Expected: exit 0, and `All matched files use Prettier code style!` from the check.

- [ ] 10. Hand over, with slice 1 step 10's block unchanged. Expected: the `diff` prints nothing and
      exits 0 — six ` M` paths.

Planner commit subject:
`feat(frontend): log out through the session owner's local exit, and close task 7`.

### Verification record entries

Each slice appends one entry to `openspec/changes/adopt-frontend-lifetimes/verify.md`, headed
`## Packet 050.7k, slice N — <what the slice did>`, containing only its own observations: the attempt
id and starting hash; step 0's baselines as numbers; every command's status; the red checkpoint's own
diagnostics; the green counts; every proof of that slice with its observed message (for the model
faults, run number and shrunk command sequence); and what stayed **pending planner verification** —
`wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`, `wbs-fe-01:e2e`, `tool-devsync:test` and
the host gate. Evidence references are basenames relative to that attempt's evidence directory, never
absolute paths. Do not read, quote or restate an earlier entry.

### Dispatch

One attempt per slice, from the reviewed packet, with no network, driven by a Claude subagent. The
base of slice 1 is planning after packet i's three slices are committed, plus this packet's commit
(`f26e3aff0` or the then-current one) **cherry-picked** — one added file. Never merge the plan
branch: its parent is the undispatched authoring base, and a merge conflicts in six paths. It differs
from the authoring base this packet was rehearsed on (`2e237e20e`, packet i's rehearsed diffs on
integration `52876ae12`, a commit that is never dispatched) by packet i's executor `Proof:` comments,
its dated notes and its `verify.md` entries, and by whatever packet i's dispatch review changes:
before the first dispatch the planner runs section 9.1's script with `REAL_BASE=<reviewed-base-sha>`,
whose `fill=real` output is the dispatch evidence. This block
holds the only absolute paths in this document.

```sh
# Slice 1, from the reviewed base; I3 is packet i's slice-3 planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-k-log-out 1 <reviewed-base-sha> \
  --driver claude \
  --batch batch-6 \
  --require-ancestor <I3> \
  --slice-note 'reviewed base <reviewed-base-sha>' \
  --preserve evidence

# Slice 2, into the same clone once slice 1 is reviewed and committed; P is
# slice 1's planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-k-log-out 2 P \
  --driver claude \
  --batch batch-6 \
  --require-ancestor <I3> \
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
and proves the result byte-identical to the rehearsal's final commit. No diff adds a `Proof:` comment,
and none removes one.

### 7.1 `spec.md` — slice 1, two log-out scenarios

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index f121c71c9..6bc7c6b41 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -326,6 +326,22 @@ state SHALL be shown instead.
 - **THEN** the signed-out state does not render, no retired service is
   republished, and the fatal state is shown

+#### Scenario: Log out whose project never lets go
+
+- **WHEN** Log out is activated and the selected project's disposal has not
+  settled when the retirement's bounded wait expires
+- **THEN** Log out settles within that wait, the signed-out state does not
+  render, the fatal state is shown, and the disposal's later completion
+  publishes nothing
+
+#### Scenario: Log out asked again, during a sign-in, or after one that failed
+
+- **WHEN** Log out is activated while a log out, a user switch or a sign-in is
+  still retiring or building, or after a sign-in that could not be built
+- **THEN** one retirement runs, every log out settles only once it has run, a
+  sign-in asked for after the log out is not undone by it, and after a sign-in
+  that could not be built the fatal state stays
+
 ### Requirement: A restored page rebuilds only after retirement succeeds

 A persisted page-hide SHALL begin retirement of the project, session and
```

### 7.2 `session-exit.model.test.ts` (**new**) and three examples in `session-runtime.test.ts` — slice 1

The model test is section 3.1 executed. It runs on Vitest's fake clock (`setTimeout`, `clearTimeout`
and `performance`, which DI Bag's bounded close reads), clears it at the start of every generated run,
and never awaits an open, a leave or a log out: each is followed by a flag, so a hung one fails the
teardown instead of hanging it. Failures found inside callbacks are collected and rethrown at the next
observation.

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-exit.model.test.ts b/apps/wbs/fe-01/src/runtime/session-exit.model.test.ts
new file mode 100644
index 000000000..16f389f6e
--- /dev/null
+++ b/apps/wbs/fe-01/src/runtime/session-exit.model.test.ts
@@ -0,0 +1,779 @@
+import { DiBag, DiBagCloseCancelledError } from 'di-bag';
+import fc from 'fast-check';
+import { describe, expect, it, vi } from 'vitest';
+
+import type { DirectoryApi, PersonView } from '@/lib/wbs-api';
+import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
+import type { DeliveredPlan } from '@/modules/plan-feed/delivered-plan-store';
+import { projectServicesOver } from '@/modules/project/composition';
+import type { ProjectRuntime, ProjectServices, ProjectSource } from '@/modules/project/contract';
+import { fakeProjectApi } from '@/testing/fake-project-api';
+
+import { PartialAcquisitionError } from './lifetime-slot';
+import { installProjectRuntime } from './project-runtime';
+import {
+  createSessionOwner,
+  installSessionRuntime,
+  type SessionExit,
+  type SessionOwner,
+  type SessionRuntime,
+} from './session-runtime';
+
+/** The retirement budget the model's owner is built with, on the fake clock. */
+const BUDGET_MS = 1_000;
+
+/** How a project's close ends: it lets go, its socket refuses, or its socket never closes. */
+type CloseMode = 'settles' | 'rejects' | 'hangs';
+
+/** One project runtime a session built, and how its retirement went. */
+interface ProjectRecord {
+  readonly name: string;
+  readonly mode: CloseMode;
+  runtime: ProjectRuntime | null;
+  /** What its delivered plan held when it was built. */
+  initial: DeliveredPlan | null;
+  /** What it held at the instant its session was withdrawn, or `null` while it has not been. */
+  frozen: DeliveredPlan | null;
+  closes: number;
+  /** Its close resolved: everything it held was given back. */
+  given: boolean;
+  /** Its close rejected, or its bounded wait expired. */
+  failed: boolean;
+  /** The session that asked for it. */
+  readonly session: SessionRecord;
+}
+
+/** One session runtime the owner built, and everything the world did to it. */
+interface SessionRecord {
+  readonly name: string;
+  userId: string;
+  runtime: SessionRuntime | null;
+  /** Requests its directory's client received. */
+  calls: number;
+  closes: number;
+  /** Its close resolved. */
+  closed: boolean;
+  /** Its close rejected or outran its wait. */
+  failed: boolean;
+  /** Whether a request the model made has withdrawn it: another user, a log out, a leave. */
+  withdrawn: boolean;
+  readonly projects: ProjectRecord[];
+  readonly broken: boolean;
+}
+
+/** One log out, from the moment it was asked until it settled. */
+interface ExitRecord {
+  readonly name: string;
+  /** Every session published before it was asked: the ones it has to see retired. */
+  readonly before: readonly SessionRecord[];
+  settled: boolean;
+  outcome: SessionExit | null;
+  /**
+   * Whether a sign-in was asked for while this log out's retirement was still
+   * running, with no log out or leave after it yet: the log out cannot have
+   * decided before that sign-in, so it must not settle signed-out.
+   */
+  overtaken: boolean;
+  /** Whether any sign-in was asked for after this log out, whenever. */
+  signInAfter: boolean;
+}
+
+const ran: Record<string, number> = {};
+function note(kind: string): void {
+  ran[kind] = (ran[kind] ?? 0) + 1;
+}
+const COMMAND_KINDS: readonly string[] = [
+  'signIn',
+  'signInBroken',
+  'logOut',
+  'reenterLogOut',
+  'leave',
+  'openProject',
+  'read',
+  'answer',
+  'drain',
+  'elapse',
+];
+const reached = {
+  loggedOutWithProjectOpen: 0,
+  loggedOutWhileRetiring: 0,
+  loggedOutDuringSignIn: 0,
+  secondLogOut: 0,
+  signInDuringLogOut: 0,
+  lateProjectAnswer: 0,
+  readAfterWithdrawal: 0,
+  logOutFatal: 0,
+  projectTimedOut: 0,
+  projectRejected: 0,
+  reenteredLogOut: 0,
+  logOutOvertaken: 0,
+  logOutSignedOut: 0,
+  logOutAfterBroken: 0,
+};
+
+/** The reference: who the app last asked for. Nothing is read back from the owner. */
+interface ExitModel {
+  wanted: string | null;
+}
+
+interface ExitWorld {
+  readonly owner: SessionOwner;
+  readonly scheduler: fc.Scheduler;
+  readonly sessions: SessionRecord[];
+  readonly byClient: Map<DirectoryApi, SessionRecord>;
+  readonly bySource: Map<ProjectServices, ProjectRecord>;
+  readonly exits: ExitRecord[];
+  /** Every open, leave and read still out, as flags: a hung one must not hang the teardown. */
+  readonly tracked: { readonly what: string; settled: boolean }[];
+  /** Every failure found inside a callback, reported by the teardown. */
+  readonly faults: Error[];
+  /** Every close that failed and every installation that was broken. */
+  failures: number;
+  next: number;
+}
+
+/** The credential the model hands a sign-in whose installation it makes fail. */
+const BROKEN = 'broken';
+
+/** Carries a failure found inside a callback to the teardown, which reports it. */
+function fault(world: ExitWorld, what: unknown): void {
+  world.faults.push(what instanceof Error ? what : new Error(String(what)));
+}
+
+/** Follows a promise by a flag, never by awaiting it: a hung log out must not hang the model. */
+function track(world: ExitWorld, what: string, running: Promise<unknown>): void {
+  const entry = { what, settled: false };
+  world.tracked.push(entry);
+  running.then(
+    () => {
+      entry.settled = true;
+    },
+    (refusal: unknown) => {
+      entry.settled = true;
+      fault(world, refusal);
+    },
+  );
+}
+
+/** A socket whose own disposal never settles, inside a graph with a bounded close. */
+function socketThatNeverCloses() {
+  const socket = DiBag.createBuilder()
+    .register({
+      socket: DiBag.withDisposal(
+        DiBag.fromSyncFactory((): string => 'open'),
+        () => new Promise<void>(() => undefined),
+      ),
+    })
+    .build();
+  socket.resolve('socket');
+  return socket;
+}
+
+/** A fresh client for one session: every read answered when the scheduler says. */
+function clientFor(world: ExitWorld, credential: string): DirectoryApi {
+  world.next += 1;
+  const base = fakeDirectoryApi();
+  const record: SessionRecord = {
+    name: `s${String(world.next)}`,
+    userId: '',
+    runtime: null,
+    calls: 0,
+    closes: 0,
+    closed: false,
+    failed: false,
+    withdrawn: false,
+    projects: [],
+    broken: credential === BROKEN,
+  };
+  const gate = <T>(route: string, answer: () => Promise<T>): Promise<T> => {
+    record.calls += 1;
+    return world.scheduler.schedule(answer(), `${record.name} ${route}`);
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
+  };
+  world.sessions.push(record);
+  world.byClient.set(client, record);
+  return client;
+}
+
+/** A project source over a fresh client whose plan read answers when the scheduler says. */
+function projectSource(
+  world: ExitWorld,
+  session: SessionRecord,
+  projectId: string,
+  mode: CloseMode,
+): ProjectSource {
+  const base = fakeProjectApi();
+  const record: ProjectRecord = {
+    name: `${session.name}.${projectId}.${mode}`,
+    mode,
+    runtime: null,
+    initial: null,
+    frozen: null,
+    closes: 0,
+    given: false,
+    failed: false,
+    session,
+  };
+  const gate = <T>(route: string, answer: () => Promise<T>): Promise<T> =>
+    world.scheduler.schedule(answer(), `${record.name} ${route}`).then((value) => {
+      if (session.withdrawn) reached.lateProjectAnswer += 1;
+      return value;
+    });
+  // Only the plan's own read waits for the scheduler: it is the answer that
+  // delivers a plan, and one late answer is what a withdrawn project must drop.
+  const client: typeof base = { ...base, tree: (id) => gate('tree', () => base.tree(id)) };
+  const services = projectServicesOver(client);
+  world.bySource.set(services, record);
+  return { services, subscribe: undefined };
+}
+
+/**
+ * Marks every session built so far withdrawn, as the request about to be made
+ * will, and records what each of their projects held at this instant.
+ */
+function withdrawAll(world: ExitWorld): void {
+  for (const session of world.sessions) {
+    if (session.runtime === null || session.withdrawn) continue;
+    session.withdrawn = true;
+    for (const project of session.projects) {
+      if (project.runtime === null) continue;
+      if (project.runtime.isCurrent()) reached.loggedOutWithProjectOpen += 1;
+      project.frozen = project.runtime.plan.snapshot();
+    }
+  }
+}
+
+/** Requests every session's directory client has received so far. */
+function callsSoFar(world: ExitWorld): number {
+  return world.sessions.reduce((sum, session) => sum + session.calls, 0);
+}
+
+/** The invariants that hold at every observation point, whatever is still in flight. */
+function assertExit(world: ExitWorld, what: string): void {
+  for (const session of world.sessions) {
+    if (!session.withdrawn) continue;
+    for (const project of session.projects) {
+      if (project.runtime === null) continue;
+      expect(
+        project.runtime.plan.snapshot() === (project.frozen ?? project.initial),
+        `${what}: ${project.name}'s plan changed after its session ${session.name} was withdrawn`,
+      ).toBe(true);
+    }
+  }
+  if (world.faults.length > 0) throw world.faults[0];
+}
+
+/** Judges one log out at the moment it settled. */
+function judge(world: ExitWorld, exit: ExitRecord): void {
+  const failedBefore = exit.before.some(
+    (session) => session.failed || session.projects.some((project) => project.failed),
+  );
+  if (exit.outcome === 'signed-out') {
+    reached.logOutSignedOut += 1;
+    for (const session of exit.before) {
+      expect(
+        session.closed,
+        `${exit.name} settled signed-out before ${session.name} was given back`,
+      ).toBe(true);
+      for (const project of session.projects) {
+        if (project.runtime === null) continue;
+        expect(
+          project.given,
+          `${exit.name} settled signed-out before ${project.name} was given back`,
+        ).toBe(true);
+      }
+    }
+    expect(
+      exit.overtaken,
+      `${exit.name} settled signed-out though a sign-in was asked for while it retired`,
+    ).toBe(false);
+  }
+  if (failedBefore) {
+    expect(exit.outcome, `${exit.name}: a session it retired failed, yet it settled`).toBe('fatal');
+  }
+  if (exit.outcome === 'fatal') {
+    reached.logOutFatal += 1;
+    expect(world.failures, `${exit.name} settled fatal though nothing failed`).toBeGreaterThan(0);
+  }
+  if (exit.outcome === 'overtaken') {
+    reached.logOutOvertaken += 1;
+    expect(exit.signInAfter, `${exit.name} settled overtaken though nobody signed in since`).toBe(
+      true,
+    );
+  }
+}
+
+/** Whether a log out's retirement is still running: a session it has to see go has not gone. */
+function isRetiring(exit: ExitRecord): boolean {
+  return !exit.settled && exit.before.some((session) => !session.closed && !session.failed);
+}
+
+/** Asks for a log out, as the account menu does, and follows it to its settlement. */
+function logOut(world: ExitWorld, model: ExitModel, name: string): void {
+  if (world.owner.snapshot().status === 'retiring') reached.loggedOutWhileRetiring += 1;
+  if (world.exits.some((exit) => !exit.settled)) reached.secondLogOut += 1;
+  if (
+    model.wanted !== null &&
+    world.tracked.some((entry) => !entry.settled && entry.what.startsWith('open'))
+  )
+    reached.loggedOutDuringSignIn += 1;
+  if (world.sessions.some((session) => session.broken)) reached.logOutAfterBroken += 1;
+  for (const exit of world.exits) if (!exit.settled) exit.overtaken = false;
+  const before = world.sessions.filter((session) => session.runtime !== null && !session.closed);
+  withdrawAll(world);
+  const calls = callsSoFar(world);
+  const exit: ExitRecord = {
+    name,
+    before,
+    settled: false,
+    outcome: null,
+    overtaken: false,
+    signInAfter: false,
+  };
+  world.exits.push(exit);
+  const exiting = world.owner.exit();
+  expect(callsSoFar(world), `${name}: the log out itself sent a request`).toBe(calls);
+  model.wanted = null;
+  exiting.then(
+    (outcome) => {
+      exit.settled = true;
+      exit.outcome = outcome;
+      try {
+        judge(world, exit);
+      } catch (refusal: unknown) {
+        fault(world, refusal);
+      }
+    },
+    (refusal: unknown) => {
+      exit.settled = true;
+      fault(world, refusal);
+    },
+  );
+}
+
+type ExitCommand = fc.AsyncCommand<ExitModel, ExitWorld>;
+
+class SignIn implements ExitCommand {
+  constructor(
+    readonly userId: string,
+    readonly broken: boolean,
+  ) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: ExitModel, world: ExitWorld): Promise<void> {
+    note(this.broken ? 'signInBroken' : 'signIn');
+    const another = model.wanted !== this.userId;
+    if (another) {
+      for (const exit of world.exits) {
+        if (!exit.settled) {
+          exit.signInAfter = true;
+          reached.signInDuringLogOut += 1;
+        }
+        if (isRetiring(exit)) exit.overtaken = true;
+      }
+      withdrawAll(world);
+    }
+    track(
+      world,
+      `open(${this.userId})`,
+      world.owner.open({ userId: this.userId, credential: this.broken ? BROKEN : '' }),
+    );
+    model.wanted = this.userId;
+    assertExit(world, this.toString());
+    await Promise.resolve();
+  }
+  toString(): string {
+    return this.broken ? `signInBroken(${this.userId})` : `signIn(${this.userId})`;
+  }
+}
+
+class LogOut implements ExitCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(model: ExitModel, world: ExitWorld): Promise<void> {
+    note('logOut');
+    logOut(world, model, `logOut#${String(world.exits.length + 1)}`);
+    assertExit(world, 'logOut');
+    await Promise.resolve();
+  }
+  toString(): string {
+    return 'logOut';
+  }
+}
+
+/**
+ * A log out asked from inside the owner's own notification, the next time it
+ * says anything — as a component re-rendered by the owner's store would.
+ */
+class ReenterLogOut implements ExitCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(model: ExitModel, world: ExitWorld): Promise<void> {
+    note('reenterLogOut');
+    let asked = false;
+    const stop = world.owner.subscribe(() => {
+      if (asked) return;
+      asked = true;
+      stop();
+      reached.reenteredLogOut += 1;
+      try {
+        logOut(world, model, `reenterLogOut#${String(world.exits.length + 1)}`);
+      } catch (refusal: unknown) {
+        fault(world, refusal);
+      }
+    });
+    await Promise.resolve();
+  }
+  toString(): string {
+    return 'reenterLogOut';
+  }
+}
+
+/** The signed-in region going by itself: its unmount gives the session back. */
+class Leave implements ExitCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(model: ExitModel, world: ExitWorld): Promise<void> {
+    note('leave');
+    for (const exit of world.exits) if (!exit.settled) exit.overtaken = false;
+    withdrawAll(world);
+    track(world, 'leave', world.owner.leave());
+    model.wanted = null;
+    assertExit(world, 'leave');
+    await Promise.resolve();
+  }
+  toString(): string {
+    return 'leave';
+  }
+}
+
+/** Picks one built session whatever its state: a captured reader does not know it was left. */
+function pick(world: ExitWorld, index: number): SessionRecord | null {
+  const candidates = world.sessions.filter((session) => session.runtime !== null);
+  if (candidates.length === 0) return null;
+  return candidates[index % candidates.length] ?? null;
+}
+
+/** A project page that kept a session's project owner, and opens a project through it now. */
+class OpenProject implements ExitCommand {
+  constructor(
+    readonly index: number,
+    readonly projectId: string,
+    readonly mode: CloseMode,
+  ) {}
+  check(): boolean {
+    return true;
+  }
+  async run(_model: ExitModel, world: ExitWorld): Promise<void> {
+    note('openProject');
+    const session = pick(world, this.index);
+    const runtime = session?.runtime ?? null;
+    if (session === null || runtime === null) return;
+    track(
+      world,
+      `project(${session.name})`,
+      runtime.projects.open(
+        this.projectId,
+        projectSource(world, session, this.projectId, this.mode),
+      ),
+    );
+    assertExit(world, this.toString());
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `openProject(${String(this.index)}, ${this.projectId}, ${this.mode})`;
+  }
+}
+
+/** A page that kept a session's directory, and reads it now — an arrival, a focus. */
+class Read implements ExitCommand {
+  constructor(readonly index: number) {}
+  check(): boolean {
+    return true;
+  }
+  async run(_model: ExitModel, world: ExitWorld): Promise<void> {
+    note('read');
+    const session = pick(world, this.index);
+    const runtime = session?.runtime ?? null;
+    if (session === null || runtime === null) return;
+    const before = session.calls;
+    track(
+      world,
+      `read(${session.name})`,
+      runtime.directory.read().catch(runtime.directory.reportFailedRead),
+    );
+    if (session.withdrawn) {
+      reached.readAfterWithdrawal += 1;
+      expect(session.calls - before, `read: withdrawn ${session.name} sent a request`).toBe(0);
+    }
+    assertExit(world, `read(${session.name})`);
+    await Promise.resolve();
+  }
+  toString(): string {
+    return `read(${String(this.index)})`;
+  }
+}
+
+/** One scheduled answer or step, in the order fast-check chooses. */
+class Answer implements ExitCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(_model: ExitModel, world: ExitWorld): Promise<void> {
+    note('answer');
+    if (world.scheduler.count() > 0) await world.scheduler.waitNext(1);
+    else await Promise.resolve();
+    assertExit(world, 'answer');
+  }
+  toString(): string {
+    return 'answer';
+  }
+}
+
+/** Every answer and step still out, in the order fast-check chooses: a reader who waits. */
+class Drain implements ExitCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(_model: ExitModel, world: ExitWorld): Promise<void> {
+    note('drain');
+    await world.scheduler.waitIdle();
+    assertExit(world, 'drain');
+  }
+  toString(): string {
+    return 'drain';
+  }
+}
+
+/**
+ * Lets every step run and the clock pass the retirement budget, more than
+ * once: a session's wait and its project's inside it. Nothing may still be
+ * retiring for a log out after that.
+ */
+async function letBudgetsPass(world: ExitWorld): Promise<void> {
+  for (let round = 0; round < 4; round += 1) {
+    await world.scheduler.waitIdle();
+    await vi.advanceTimersByTimeAsync(BUDGET_MS + 1);
+  }
+  await world.scheduler.waitIdle();
+}
+
+/** The retirement budget, passed: every log out asked before it has settled. */
+class Elapse implements ExitCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(_model: ExitModel, world: ExitWorld): Promise<void> {
+    note('elapse');
+    const asked = [...world.exits];
+    await letBudgetsPass(world);
+    for (const exit of asked) {
+      expect(exit.settled, `elapse: ${exit.name} had not settled after the budget passed`).toBe(
+        true,
+      );
+    }
+    assertExit(world, 'elapse');
+  }
+  toString(): string {
+    return 'elapse';
+  }
+}
+
+const commandsArb = fc.commands<ExitModel, ExitWorld, false>(
+  [
+    fc.constantFrom('u1', 'u2').map((userId) => new SignIn(userId, false)),
+    fc.constantFrom('u1', 'u2').map((userId) => new SignIn(userId, true)),
+    fc.constant(new LogOut()),
+    fc.constant(new LogOut()),
+    fc.constant(new ReenterLogOut()),
+    fc.constant(new Leave()),
+    fc
+      .tuple(
+        fc.nat(4),
+        fc.constantFrom('p1', 'p2'),
+        fc.constantFrom<CloseMode>('settles', 'settles', 'rejects', 'hangs'),
+      )
+      .map(([index, projectId, mode]) => new OpenProject(index, projectId, mode)),
+    fc.nat(4).map((index) => new Read(index)),
+    fc.constant(new Answer()),
+    fc.constant(new Answer()),
+    fc.constant(new Drain()),
+    fc.constant(new Elapse()),
+  ],
+  { maxCommands: 20, size: 'max' },
+);
+
+/**
+ * Log out, the session owner's local exit, run against a reference model.
+ *
+ * The record this executes is section 3 of
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-k-log-out.md`.
+ */
+describe('log out, against a reference model', () => {
+  it('retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go', async () => {
+    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
+    try {
+      await fc.assert(
+        fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
+          vi.clearAllTimers();
+          const model: ExitModel = { wanted: null };
+          const world: ExitWorld = {
+            owner: createSessionOwner({
+              budgetMs: BUDGET_MS,
+              clientFor: (credential) => clientFor(world, credential),
+              install: (dependencies) => {
+                const record = world.byClient.get(dependencies.directoryApi);
+                if (record === undefined) throw new Error('a session was installed from no client');
+                record.userId = dependencies.userId;
+                const installed = installSessionRuntime({
+                  ...dependencies,
+                  // The session's own wiring wraps this, so the project runtimes are
+                  // the real ones, reached through the session's own guards.
+                  installProject: (projectDependencies) => {
+                    const project = world.bySource.get(projectDependencies.services);
+                    if (project === undefined)
+                      throw new Error('a project was installed from no source');
+                    const built = installProjectRuntime(projectDependencies);
+                    project.runtime = built.services;
+                    project.initial = built.services.plan.snapshot();
+                    record.projects.push(project);
+                    return {
+                      services: built.services,
+                      close: async (options) => {
+                        project.closes += 1;
+                        await scheduler.schedule(Promise.resolve(), `${project.name} retires`);
+                        try {
+                          await built.close(options);
+                          if (project.mode === 'rejects') {
+                            reached.projectRejected += 1;
+                            throw new Error(`${project.name}'s socket would not close`);
+                          }
+                          if (project.mode === 'hangs')
+                            await socketThatNeverCloses().close(options);
+                        } catch (refusal: unknown) {
+                          if (refusal instanceof DiBagCloseCancelledError)
+                            reached.projectTimedOut += 1;
+                          project.failed = true;
+                          world.failures += 1;
+                          throw refusal;
+                        }
+                        project.given = true;
+                      },
+                    };
+                  },
+                });
+                if (record.broken) {
+                  world.failures += 1;
+                  throw new PartialAcquisitionError(
+                    new Error(`${record.name} could not be built`),
+                    (options) => installed.close(options),
+                  );
+                }
+                record.runtime = installed.services;
+                return {
+                  services: installed.services,
+                  close: async (options) => {
+                    record.closes += 1;
+                    await scheduler.schedule(Promise.resolve(), `${record.name} retires`);
+                    try {
+                      await installed.close(options);
+                    } catch (refusal: unknown) {
+                      record.failed = true;
+                      world.failures += 1;
+                      throw refusal;
+                    }
+                    for (const project of record.projects) {
+                      if (!project.given) {
+                        fault(
+                          world,
+                          `${record.name} was given back before its project ${project.name}`,
+                        );
+                      }
+                    }
+                    record.closed = true;
+                  },
+                };
+              },
+            }),
+            scheduler,
+            sessions: [],
+            byClient: new Map(),
+            bySource: new Map(),
+            exits: [],
+            tracked: [],
+            faults: [],
+            failures: 0,
+            next: 0,
+          };
+          let failure: Error | null = null;
+          try {
+            await fc.asyncModelRun<ExitModel, ExitWorld, false, ExitModel>(
+              () => ({ model, real: world }),
+              commands,
+            );
+          } catch (caught: unknown) {
+            failure = caught instanceof Error ? caught : new Error(String(caught));
+          }
+          // Teardown: every step runs, the clock passes the budget, and nothing
+          // may be left out; its failure is reported beside the property's own.
+          const unreported: string[] = [];
+          try {
+            await letBudgetsPass(world);
+            for (const exit of world.exits) {
+              expect(exit.settled, `teardown: ${exit.name} never settled`).toBe(true);
+            }
+            for (const entry of world.tracked) {
+              expect(entry.settled, `teardown: ${entry.what} never settled`).toBe(true);
+            }
+            assertExit(world, 'teardown');
+            const state = world.owner.snapshot();
+            for (const session of world.sessions) {
+              if (session.runtime === null) continue;
+              const isLive = state.status === 'live' && state.services === session.runtime;
+              expect(
+                session.closes,
+                `teardown: ${session.name} was retired ${String(session.closes)} times, live=${String(isLive)}`,
+              ).toBe(isLive ? 0 : 1);
+            }
+          } catch (caught: unknown) {
+            unreported.push(String(caught));
+          }
+          if (unreported.length === 0) {
+            if (failure !== null) throw failure;
+            return;
+          }
+          if (failure === null) throw new Error(`teardown refused: ${unreported.join(' | ')}`);
+          throw new Error(
+            `the property failed and its teardown refused: ${unreported.join(' | ')}`,
+            { cause: failure },
+          );
+        }),
+        { seed: 20260924, numRuns: 300 },
+      );
+    } finally {
+      vi.useRealTimers();
+    }
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
index 07f24a358..7c4afb904 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.test.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.test.ts
@@ -1,4 +1,5 @@
-import { describe, expect, it } from 'vitest';
+import { DiBag } from 'di-bag';
+import { describe, expect, it, vi } from 'vitest';

 import type { DirectoryApi } from '@/lib/wbs-api';
 import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
@@ -8,7 +9,12 @@ import { fakeProjectApi } from '@/testing/fake-project-api';

 import { PartialAcquisitionError, type RetirableRuntime } from './lifetime-slot';
 import { installProjectRuntime, type ProjectRuntimeDependencies } from './project-runtime';
-import { createSessionOwner, installSessionRuntime, sessionFor } from './session-runtime';
+import {
+  createSessionOwner,
+  installSessionRuntime,
+  type SessionExit,
+  sessionFor,
+} from './session-runtime';

 /** A project source over a fresh fake client, with no socket. */
 const projectSource = (): ProjectSource => ({
@@ -212,3 +218,119 @@ describe('the session runtime', () => {
     expect(sessionFor({ status: 'retiring' }, 'u1')).toBeNull();
   });
 });
+
+describe('log out', () => {
+  it('settles signed out once the project and then the session have let go, and sends nothing', async () => {
+    const events: string[] = [];
+    const client = fakeDirectoryApi();
+    const owner = createSessionOwner({
+      clientFor: () => client,
+      install: (dependencies) => {
+        const installed = installSessionRuntime(dependencies);
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
+        return {
+          services: installed.services,
+          close: async (options) => {
+            await installed.close(options);
+            events.push(`project ${dependencies.projectId} given back`);
+          },
+        };
+      },
+      budgetMs: 1_000,
+    });
+    await owner.open({ userId: 'u1', credential: '' });
+    const opened = owner.snapshot();
+    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
+    await opened.services.projects.open('p1', projectSource());
+    const sent = client.log.length;
+
+    await expect(owner.exit()).resolves.toBe('signed-out');
+
+    expect(events).toEqual(['project p1 given back', 'session given back']);
+    expect(client.log.length).toBe(sent);
+    expect(owner.snapshot().status).toBe('empty');
+  });
+
+  it('settles fatal at the budget when the project’s socket never closes, and stays fatal once it does', async () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
+    try {
+      let letGo: () => void = () => undefined;
+      const socket = DiBag.createBuilder()
+        .register({
+          socket: DiBag.withDisposal(
+            DiBag.fromSyncFactory((): string => 'open'),
+            () =>
+              new Promise<void>((resolve) => {
+                letGo = resolve;
+              }),
+          ),
+        })
+        .build();
+      socket.resolve('socket');
+      const owner = createSessionOwner({
+        clientFor: () => fakeDirectoryApi(),
+        installProject: (dependencies) => {
+          const installed = installProjectRuntime(dependencies);
+          return {
+            services: installed.services,
+            close: async (options) => {
+              await installed.close(options);
+              await socket.close(options);
+            },
+          };
+        },
+        budgetMs: 1_000,
+      });
+      await owner.open({ userId: 'u1', credential: '' });
+      const opened = owner.snapshot();
+      if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
+      await opened.services.projects.open('p1', projectSource());
+
+      let settled: SessionExit | null = null;
+      void owner.exit().then((exit) => {
+        settled = exit;
+      });
+      await vi.advanceTimersByTimeAsync(999);
+      expect(settled).toBeNull();
+      await vi.advanceTimersByTimeAsync(2);
+
+      expect(settled).toBe('fatal');
+      const left = owner.snapshot();
+      expect(left.status === 'fatal' && left.terminal).toBe(true);
+      letGo();
+      await vi.advanceTimersByTimeAsync(0);
+      expect(owner.snapshot()).toBe(left);
+      await expect(owner.exit()).resolves.toBe('fatal');
+      await owner.open({ userId: 'u2', credential: '' });
+      expect(owner.snapshot()).toBe(left);
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+
+  it('settles fatal after a sign-in that could not be built, and keeps the fatal state', async () => {
+    const owner = createSessionOwner({
+      clientFor: () => fakeDirectoryApi(),
+      install: () => {
+        throw new Error('the directory could not be built');
+      },
+      budgetMs: 1_000,
+    });
+    await owner.open({ userId: 'u1', credential: '' });
+    const refused = owner.snapshot();
+    expect(refused.status === 'fatal' && !refused.terminal).toBe(true);
+
+    await expect(owner.exit()).resolves.toBe('fatal');
+
+    expect(owner.snapshot()).toBe(refused);
+  });
+});
```

### 7.3 `session-runtime.ts` and `vitest.node-suites.ts` — slice 1

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index c4f2c3eaa..91ec80a6a 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -234,8 +234,34 @@ export interface SessionOwner extends Store<LifetimeState<SessionRuntime>> {
    * behind the first and settles after it, with the same outcome.
    */
   readonly leave: () => Promise<void>;
+  /**
+   * Log out: a **local exit**, which sends no request and revokes nothing, so a
+   * reload can still restore the identity from its cookie.
+   *
+   * It is {@link leave} and nothing more: the session and its project are
+   * withdrawn in the same instant, the project is retired and then the
+   * session, each under the retirement budget, and this settles only once that
+   * retirement has run — however many log outs, or the region's own departure,
+   * asked for it. What it settles with is what the region may do next; see
+   * {@link SessionExit}.
+   */
+  readonly exit: () => Promise<SessionExit>;
 }

+/**
+ * How one log out ended, as the region that asked for it acts on it.
+ *
+ * - `signed-out` — the session and its project were withdrawn and retired, in
+ *   that order, and nobody has been asked for since: the signed-out state may
+ *   render.
+ * - `fatal` — a retirement failed or outran its wait, or the owner was already
+ *   fatal: it publishes the sanitized fatal state, which the region draws
+ *   instead, and the withdrawn services are never published again.
+ * - `overtaken` — a sign-in asked for after this log out is the owner's now;
+ *   rendering the signed-out state would undo it.
+ */
+export type SessionExit = 'signed-out' | 'fatal' | 'overtaken';
+
 /** What an owner is built from; production passes none of it. */
 export interface SessionOwnerDependencies {
   /** How one runtime is installed. Defaults to {@link installSessionRuntime}. */
@@ -329,7 +355,7 @@ export function createSessionOwner({
       throw new Error('a session transition was refused by the slot itself', { cause: refusal });
     }
   };
-  return {
+  const owner: SessionOwner = {
     subscribe: slot.subscribe,
     snapshot: slot.snapshot,
     open: (identity) => {
@@ -360,5 +386,11 @@ export function createSessionOwner({
       latest = settle(slot.retire());
       return latest;
     },
+    exit: async () => {
+      await owner.leave();
+      if (slot.snapshot().status === 'fatal') return 'fatal';
+      return wanted === null ? 'signed-out' : 'overtaken';
+    },
   };
+  return owner;
 }
diff --git a/apps/wbs/fe-01/vitest.node-suites.ts b/apps/wbs/fe-01/vitest.node-suites.ts
index a3d7046f9..3e9ffd782 100644
--- a/apps/wbs/fe-01/vitest.node-suites.ts
+++ b/apps/wbs/fe-01/vitest.node-suites.ts
@@ -88,6 +88,7 @@ export const NODE_SUITES: readonly string[] = [
   'src/runtime/lifetime-slot.test.ts',
   'src/runtime/project-runtime.model.test.ts',
   'src/runtime/project-runtime.test.ts',
+  'src/runtime/session-exit.model.test.ts',
   'src/runtime/session-runtime.model.test.ts',
   'src/runtime/session-runtime.test.ts',
   'src/test-tiers.test.ts',
```

### 7.4 `spec.md` — slice 2, the region's project scenario

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 6bc7c6b41..a19b2244f 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -307,6 +307,13 @@ directory management and its project owner.
 - **THEN** its runtime is opened through that session runtime's own project
   owner, and not through an owner of the page's own

+#### Scenario: A project given back after its page has gone fails visibly
+
+- **WHEN** the session's project is left by its page going - a route change or
+  Strict Mode's cleanup - and its disposal rejects or outruns its wait
+- **THEN** the signed-in region is replaced by the fatal state, which carries
+  only the sanitized report and its occurrence handle
+
 ### Requirement: Log out stays a local exit

 The Log out action SHALL send no request to the server and SHALL retire the
```

### 7.5 `app.test.tsx` — slice 2, the named edit and five examples

```diff
diff --git a/apps/wbs/fe-01/src/app.test.tsx b/apps/wbs/fe-01/src/app.test.tsx
index da60fd12b..cd4996f01 100644
--- a/apps/wbs/fe-01/src/app.test.tsx
+++ b/apps/wbs/fe-01/src/app.test.tsx
@@ -1,15 +1,23 @@
 import type * as Router from '@tanstack/react-router';
 import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
+import { DiBag } from 'di-bag';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import type * as Api from '@/lib/api';
 import { ThemeProvider } from '@/lib/theme';
 import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
 import { browserStorage } from '@/modules/preferences/browser-storage.repository';
+import { projectServicesOver } from '@/modules/project/composition';
 import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
 import { ApplicationServicesProvider } from '@/runtime/application-services-context';
 import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';
-import { createSessionOwner, type SessionOwner } from '@/runtime/session-runtime';
+import { installProjectRuntime } from '@/runtime/project-runtime';
+import {
+  createSessionOwner,
+  installSessionRuntime,
+  type SessionOwner,
+} from '@/runtime/session-runtime';
+import { fakeProjectApi } from '@/testing/fake-project-api';

 // fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
 const hasDom = typeof document !== 'undefined';
@@ -314,7 +322,7 @@ describe('the signed-in user’s session', () => {
   const signedInAs = (session: Api.Session, openOwner?: () => SessionOwner) => (
     <ApplicationServicesProvider slot={servicesSlot}>
       <ThemeProvider>
-        <SignedInApp session={session} onSignOut={() => undefined} openOwner={openOwner} />
+        <SignedInApp session={session} onSignedOut={() => undefined} openOwner={openOwner} />
       </ThemeProvider>
     </ApplicationServicesProvider>
   );
@@ -444,3 +452,226 @@ describe('the signed-in user’s session', () => {
     });
   });
 });
+
+/**
+ * Log out, through the account menu the reader clicks: a local exit that sends
+ * nothing, retires the session's project and then the session, and hands the
+ * signed-out state up only once both have let go — the fatal state otherwise.
+ */
+describe('log out', () => {
+  const KAT = { id: 'u1', username: 'kat', scopes: ['read', 'write'] as ('read' | 'write')[] };
+
+  /** Every request the page sends, by path. */
+  const requestsSent = () => {
+    const paths: string[] = [];
+    vi.stubGlobal(
+      'fetch',
+      vi.fn((path: string) => {
+        paths.push(path);
+        const collection = path.split('/').at(-1) ?? 'unknown';
+        return Promise.resolve(new Response(JSON.stringify({ [collection]: [] }), { status: 200 }));
+      }),
+    );
+    return paths;
+  };
+
+  /**
+   * An owner over fake clients that records, in order, what was given back; the
+   * project's close ends however `closeSocket` says.
+   */
+  const recordingOwner = (
+    events: string[],
+    closeSocket: (options: { timeoutMs: number }) => Promise<void> = () => Promise.resolve(),
+    budgetMs = 1_000,
+  ): SessionOwner =>
+    createSessionOwner({
+      clientFor: () => fakeDirectoryApi(),
+      install: (dependencies) => {
+        const installed = installSessionRuntime(dependencies);
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
+        return {
+          services: installed.services,
+          close: async (options) => {
+            await installed.close(options);
+            await closeSocket(options);
+            events.push('project given back');
+          },
+        };
+      },
+      budgetMs,
+    });
+
+  const regionOf = (owner: SessionOwner, onSignedOut: () => void) => (
+    <ApplicationServicesProvider slot={servicesSlot}>
+      <ThemeProvider>
+        <SignedInApp
+          session={{ token: '', user: KAT }}
+          onSignedOut={onSignedOut}
+          openOwner={() => owner}
+        />
+      </ThemeProvider>
+    </ApplicationServicesProvider>
+  );
+
+  /** Draws the region at the directory, and opens a project through its session. */
+  const signedInWithProject = async (owner: SessionOwner, onSignedOut: () => void) => {
+    window.history.replaceState({}, '', '/directory');
+    render(regionOf(owner, onSignedOut));
+    await waitFor(() => {
+      expect(screen.getByRole('heading', { name: 'Directory' })).toBeDefined();
+    });
+    const opened = owner.snapshot();
+    if (opened.status !== 'live') throw new Error(`u1 was not published: ${opened.status}`);
+    await act(async () => {
+      await opened.services.projects.open('p1', {
+        services: projectServicesOver(fakeProjectApi()),
+        subscribe: undefined,
+      });
+    });
+    expect(opened.services.projects.snapshot().status).toBe('live');
+    return opened.services;
+  };
+
+  const logOut = () => {
+    fireEvent.click(screen.getByRole('button', { name: 'kat' }));
+    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
+  };
+
+  const fatalShown = () =>
+    waitFor(() => {
+      const shown = document.querySelector('[data-lifetime-fault]');
+      if (shown === null) throw new Error('no fatal state yet');
+      return shown;
+    });
+
+  itDom(
+    'signs out once the project and then the session have let go, and sends nothing',
+    async () => {
+      const paths = requestsSent();
+      const events: string[] = [];
+      await signedInWithProject(recordingOwner(events), () => events.push('signed out'));
+      const sent = paths.length;
+
+      logOut();
+
+      await waitFor(() => {
+        expect(events).toContain('signed out');
+      });
+      expect(events).toEqual(['project given back', 'session given back', 'signed out']);
+      expect(paths.slice(sent)).toEqual([]);
+    },
+  );
+
+  itDom(
+    'shows the fatal state instead of signing out when the project will not let go',
+    async () => {
+      requestsSent();
+      const events: string[] = [];
+      const owner = recordingOwner(events, () =>
+        Promise.reject(new Error('alice@example.com: the socket would not close')),
+      );
+      await signedInWithProject(owner, () => events.push('signed out'));
+
+      logOut();
+
+      const fault = await fatalShown();
+      // A second log out joins the first and settles after it, with its outcome.
+      await act(async () => {
+        await expect(owner.exit()).resolves.toBe('fatal');
+      });
+      expect(events).not.toContain('signed out');
+      expect(fault.textContent).not.toContain('alice@example.com');
+      expect(screen.queryByRole('heading', { name: 'Directory' })).toBeNull();
+    },
+  );
+
+  itDom('shows the fatal state at the budget when the project’s socket never closes', async () => {
+    requestsSent();
+    const events: string[] = [];
+    const socket = DiBag.createBuilder()
+      .register({
+        socket: DiBag.withDisposal(
+          DiBag.fromSyncFactory((): string => 'open'),
+          () => new Promise<void>(() => undefined),
+        ),
+      })
+      .build();
+    socket.resolve('socket');
+    const owner = recordingOwner(events, (options) => socket.close(options), 50);
+    await signedInWithProject(owner, () => events.push('signed out'));
+
+    logOut();
+
+    await fatalShown();
+    await act(async () => {
+      await expect(owner.exit()).resolves.toBe('fatal');
+    });
+    expect(events).toEqual([]);
+  });
+
+  itDom(
+    'draws the fatal state in the region’s place when its project cannot be given back outside a log out',
+    async () => {
+      requestsSent();
+      const events: string[] = [];
+      const owner = recordingOwner(events, () =>
+        Promise.reject(new Error('the socket would not close')),
+      );
+      const session = await signedInWithProject(owner, () => events.push('signed out'));
+
+      // What the project page's own cleanup does when its route goes.
+      await act(async () => {
+        await session.projects.leave();
+      });
+
+      await fatalShown();
+      expect(screen.queryByRole('heading', { name: 'Directory' })).toBeNull();
+      expect(owner.snapshot().status).toBe('live');
+      expect(events).toEqual([]);
+    },
+  );
+
+  itDom(
+    'returns to the sign-in form through the app, and a reload restores the identity',
+    async () => {
+      window.history.replaceState({}, '', '/directory');
+      me.mockResolvedValue({
+        kind: 'success',
+        representation: 'json',
+        status: 200,
+        body: { user: KAT },
+        headers: new Headers(),
+      });
+      const paths = requestsSent();
+      const first = renderApp();
+      await waitFor(() => {
+        expect(screen.getByRole('heading', { name: 'Directory' })).toBeDefined();
+      });
+      const sent = paths.length;
+
+      logOut();
+
+      await waitFor(() => {
+        expect(screen.getByRole('link', { name: 'Continue with SSO' })).toBeDefined();
+      });
+      expect(paths.slice(sent)).toEqual([]);
+      expect(window.location.pathname).toBe('/directory');
+
+      // A reload is a fresh document: the cookie the log out left alone restores the identity.
+      first.unmount();
+      renderApp();
+      await waitFor(() => {
+        expect(screen.getByRole('heading', { name: 'Directory' })).toBeDefined();
+      });
+    },
+  );
+});
```

### 7.6 `app.tsx`, `tasks.md` and the lifetime map — slice 2

```diff
diff --git a/apps/wbs/fe-01/src/app.tsx b/apps/wbs/fe-01/src/app.tsx
index 41ddc6ab1..09a8e4d94 100644
--- a/apps/wbs/fe-01/src/app.tsx
+++ b/apps/wbs/fe-01/src/app.tsx
@@ -1,4 +1,4 @@
-import { useEffect, useState, useSyncExternalStore } from 'react';
+import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';

 import { AppRouter } from '@/app-router';
 import { AuthForm } from '@/components/auth/auth-form';
@@ -10,6 +10,7 @@ import { HintLayer } from '@/components/wbs/hint';
 import { me as fetchMe, type Session } from '@/lib/api';
 import { failureMessage, unreachable } from '@/lib/http';
 import { ThemeProvider, useThemeChoice } from '@/lib/theme';
+import type { ProjectOwner } from '@/runtime/project-runtime';
 import { createSessionOwner, sessionFor, type SessionOwner } from '@/runtime/session-runtime';

 /**
@@ -136,7 +137,7 @@ function AppContent() {
   return (
     <SignedInApp
       session={session}
-      onSignOut={() => {
+      onSignedOut={() => {
         setSession(null);
       }}
     />
@@ -147,7 +148,12 @@ function AppContent() {
 export interface SignedInAppProps {
   /** The identity the gate let in: from the startup check, or from a password login. */
   session: Session;
-  onSignOut: () => void;
+  /**
+   * Called once a log out has retired the session's project and then the
+   * session, and only then: the signed-out state it renders is the last thing a
+   * log out does, never the first.
+   */
+  onSignedOut: () => void;
   /** Injected in tests; the app lets it default to the real owner. */
   openOwner?: () => SessionOwner;
 }
@@ -168,10 +174,19 @@ export interface SignedInAppProps {
  * The router is drawn only while the owner publishes **this** user's runtime —
  * see {@link sessionFor} — and the sanitized fatal state when the runtime
  * could not be built or given back.
+ *
+ * **Log out is the owner's local exit** ({@link SessionOwner.exit}): the account
+ * menu's `Log out` withdraws the session and its project at once, so the region
+ * stops drawing them before anything is closed, sends no request, and hands the
+ * signed-out state up through `onSignedOut` only when the project and then the
+ * session have both let go. When either could not — a socket that refused or
+ * never closed within the retirement budget — the owner is `fatal` and this draws
+ * that instead; nothing retired is drawn again, and the page's Reload is the way
+ * on.
  */
 export function SignedInApp({
   session,
-  onSignOut,
+  onSignedOut,
   openOwner = createSessionOwner,
 }: SignedInAppProps): React.JSX.Element {
   const [sessionOwner] = useState(openOwner);
@@ -191,6 +206,11 @@ export function SignedInApp({
     return (
       <main className="bg-background text-muted-foreground min-h-full p-8 font-sans">Loading…</main>
     );
+  const signOut = (): void => {
+    void sessionOwner.exit().then((exit) => {
+      if (exit === 'signed-out') onSignedOut();
+    });
+  };

   return (
     /*
@@ -224,20 +244,48 @@ export function SignedInApp({
        * in continues to the page that was asked for: nothing rewrote it.
        * ADR 0004 has the alternatives.
        */}
-      <AppRouter
-        session={services}
-        token={session.token}
-        presence={
-          // The panel is presentational and the roster is the page's, because
-          // it arrives on the table's own socket — one connection per browser
-          // since 2026-09-02. What the session contributes is the username the
-          // panel marks as "you".
-          // Proof: renaming the shared login response username to displayName produced
-          // TS2339 here and at AccountMenu below in the actual FE app typecheck.
-          (roster) => <PresencePanel me={session.user.username} {...roster} />
-        }
-        account={<ThemedAccountMenu username={session.user.username} onSignOut={onSignOut} />}
-      />
+      <ProjectRetirementGate projects={services.projects}>
+        <AppRouter
+          session={services}
+          token={session.token}
+          presence={
+            // The panel is presentational and the roster is the page's, because
+            // it arrives on the table's own socket — one connection per browser
+            // since 2026-09-02. What the session contributes is the username the
+            // panel marks as "you".
+            // Proof: renaming the shared login response username to displayName produced
+            // TS2339 here and at AccountMenu below in the actual FE app typecheck.
+            (roster) => <PresencePanel me={session.user.username} {...roster} />
+          }
+          account={<ThemedAccountMenu username={session.user.username} onSignOut={signOut} />}
+        />
+      </ProjectRetirementGate>
     </div>
   );
 }
+
+/**
+ * The router of one live session, until the session's project could not be
+ * given back — and from then on the sanitized fatal state in its place.
+ *
+ * A project page draws its own project's fatal state while it is mounted. This
+ * is for the retirements nobody is left to draw: the project page going — a
+ * route change, Strict Mode's cleanup — gives the project back from its own
+ * effect cleanup, after the page is gone, and a socket that refuses or outruns
+ * the budget there would otherwise leave the owner terminally `fatal` with
+ * nothing on screen saying so. Only a **terminal** fault is drawn here: a
+ * project whose construction failed holds nothing, and the page that asked for
+ * it is still there to say so.
+ */
+function ProjectRetirementGate({
+  projects,
+  children,
+}: {
+  projects: ProjectOwner;
+  children: ReactNode;
+}): ReactNode {
+  const projectState = useSyncExternalStore(projects.subscribe, projects.snapshot);
+  if (projectState.status === 'fatal' && projectState.terminal)
+    return <LifetimeFault fault={projectState.fault} />;
+  return children;
+}
diff --git a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
index bc10a5260..87f9872b0 100644
--- a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
+++ b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
@@ -79,6 +79,8 @@ The existing `AccountMenu` “Log out” action is a **local exit** in 050.7. To

 Local exit calls the host coordinator before clearing local state: the coordinator invalidates project publication, joins/closes the project, invalidates session publication, joins/closes the session, and only after successful retirement commits the local signed-out UI state. A retirement failure or timeout refuses that local transition and publishes the sanitized fatal/public-report state described below. It never republishes the withdrawn old project/session services, even though the still-valid remote cookie may authenticate a later full reload. Project selection effects likewise call the coordinator, so route unmount, switch, local exit and page hide — which is also how a document replacement retires the page — converge on the same current handle and promise. This supplies the project-before-session control path that independent nested effect cleanup cannot guarantee. Authoritative logout is separate observable auth work and remains outside 050.7.

+Update, observed <observed-date-k> (050.7k, OpenSpec task 7): the coordinator is the session owner itself. Log out is `SessionOwner.exit` in `apps/wbs/fe-01/src/runtime/session-runtime.ts` — the owner's one `leave()`, which withdraws the session and its project in the same instant, retires the project and then the session, and settles once, however many triggers asked — and `SignedInApp` in `apps/wbs/fe-01/src/app.tsx` renders the signed-out state only when it settles `signed-out`. No request is sent and nothing is revoked. A refusing or never-closing socket makes the session terminally fatal within one retirement budget (the project's wait runs inside the session's, and the session's expires first), and the sanitized fatal state is drawn in the region's place; so is a project that cannot be given back after its page has gone. The failure is drawn, not logged, so tests 12 and 13 below are amended for the project and the session: their reporter occurrence is not emitted and the sanitized report and occurrence handle are drawn instead; the non-React lifecycle-failure reporter stays unbuilt, and no open task owns it. Page hide's own session retirement is still observed by nobody.
+
 Keep the router instance stable. `AppRouter` intentionally creates it once and refreshes its context because recreating it loses the current address. Router context may carry the narrow session delivery services required by lazy routes plus the existing presentational `account`, `presence`, and `nav`; it must no longer carry `token`, `ProjectApi`, `DirectoryApi`, or a bag once extraction is complete.

 Hazards:
diff --git a/openspec/changes/adopt-frontend-lifetimes/tasks.md b/openspec/changes/adopt-frontend-lifetimes/tasks.md
index 63755406e..9512b89c9 100644
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -81,8 +81,20 @@
       survive. The catalog and the header token still reach `ProjectPage`: the
       catalog facade is the lifetime map's prerequisite, and refusing a token
       in delivery is task 13's.
-- [ ] 7. Log out is a coordinated local exit: no request, project then session
+- [x] 7. Log out is a coordinated local exit: no request, project then session
       retirement, and the fatal state when either fails.
+      Closed by 050-7-k, observed <observed-date-k>: the account menu's Log out is
+      `SessionOwner.exit` (`apps/wbs/fe-01/src/runtime/session-runtime.ts`),
+      which is the owner's one `leave()` — the session and its project withdrawn
+      in one instant, the project retired and then the session, each under the
+      retirement budget — and sends no request and revokes nothing, so a reload
+      restores the identity. `SignedInApp` in `app.tsx` hands the signed-out
+      state up only when both let go, and otherwise draws the sanitized fatal
+      state: a socket that refuses, or never closes within the budget. A project
+      that cannot be given back after its page has gone is drawn in the signed-in
+      region's place too. The failure is drawn, not logged; page hide's own
+      session retirement is still not observed by anybody, which no open task
+      owns.
 - [x] 8. The project prerequisites: plan snapshot, connection, roster and busy
       state move into project-owned stores, and the command register and refusal
       publication move behind narrow ports.
```

## 8. Proofs

Every fault below was injected for real in the planner's rehearsal on 2026-09-24, on the rehearsal
commit of the slice that owns it: its named test watched failing, the file restored and compared, the
test rerun green, before the next fault. The executor repeats each one and writes the adjacent
`Proof:` comment **only after observing its own failure**, dated with its own observed date
(`date -u +%F`) — never copied from this document, never before the observation. Each slice runs **all** of its
faults first and writes its comments afterwards, so every fault patch below still applies.

**Where the comments may go.** Slice 1's go into `session-runtime.ts`, slice 2's into `app.tsx`;
neither slice patches the other's file. Two of slice 1's sites already carry packet i's comment block
(`x2`, `e1` at `await projects.leave();`, beside i's `m7` and `d1`; `x3` at
`isCurrent: () => isCurrent() && dependencies.isCurrent(),`, beside i's `m8`): write the new sentence
as `//` lines **directly above the named line, below the block already there**, so the two form one
block. Faults that share a site share one comment block, one sentence each (`x1` and `x5`; `x2` and
`e1`; `x4` and `e2`; `x6` and `e3`). In JSX (`a1`) the comment is a `//` line inside the opening tag,
above the attribute.

**Applying a fault patch** always uses `git apply --unidiff-zero`, for every fault: `x2` and `x3` are
zero-context patches, because packet i's executor has put a comment of unknown length directly above
the one line each replaces; for the others, which carry context, the flag changes nothing.

**Each slice's faults are records of four lines** — id, file (from the repository root), suite (from
`apps/wbs/fe-01`) and the exact `-t` pattern — in the first `text` block of that slice's subsection.
Vitest's `-t` is a regular expression; no title below holds a metacharacter, and the typographic
apostrophes and dashes in some of them match themselves. Extract the records from this document
rather than retyping them:

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-k-log-out.md
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

Expected: 40 lines for slice 1 and 12 for slice 2.

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

**The comment** names the injected fault and the observed failure, as a `//` line comment directly
above the line the table names, for example:

```ts
// Proof: on <observed date>, unbinding both waits made `retires the project and then the session,
// …` fail after 75 runs: "teardown: leave never settled" — a socket that never closes hung it.
```

**For `x2` and `x3`**, whose lines already carry packet i's `m7`/`d1` and `m8` proofs, the sentence
says what this model adds: "the log-out model finds it too, at run N, via a user switch" (`x2`) or
"… via a leave" (`x3`) — the same withdrawal and retirement a log out makes. The log-out-specific
teeth are `x1`, `x5`, `x6`, `x7`, and `e1`–`e3`, `a1`, `a2`, `p1`.

**For the model faults**, the run number, the shrunk command sequence and the innermost cause the table
quotes are the evidence; they are seed-pinned and were identical in two rehearsal runs. A different run
number or sequence means the generator, seed or command set differs from what was reviewed: record it,
and stop only if the named test **passes**.

### 8.1 Slice 1 — the owner's exit (`apps/wbs/fe-01/src/runtime/session-runtime.ts`)

The records for `$TMPDIR/proofs.txt`:

```text
x1
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
x2
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
x3
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
x4
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
x5
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
x6
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
x7
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
e1
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.test.ts
settles signed out once the project and then the session have let go, and sends nothing
e2
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.test.ts
settles fatal at the budget when the project’s socket never closes, and stays fatal once it does
e3
apps/wbs/fe-01/src/runtime/session-runtime.ts
src/runtime/session-runtime.test.ts
settles fatal after a sign-in that could not be built, and keeps the fatal state
```

Every model fault fails the model test, `Tests 1 failed (1)`, exit 1. Run, the shrunk command sequence
(after the scheduler's own record, which fast-check prints first) and the innermost cause, as
rehearsed twice:

| Id   | Fault                                                                                            | Run | Shrunk sequence, times                                       | Innermost cause                                                                                          | Comment above                                                |
| ---- | ------------------------------------------------------------------------------------------------ | --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `x1` | a request sent during log out: the project left by its own await while the session stays current | 18  | `reenterLogOut,signIn(u1),read(0)`, 10                       | `read: withdrawn s1 sent a request: expected 5 to be +0`                                                 | `await owner.leave();` in `exit`                             |
| `x2` | the session retired before its project: the disposer no longer awaits the project's leave        | 50  | `signIn(u1),openProject(0, p1, settles),signIn(u2),drain`, 6 | `s1 was given back before its project s1.p1.settles`                                                     | `await projects.leave();` (below packet i's block)           |
| `x3` | a late project answer after log out: the project's currency no longer asks its session           | 59  | `signIn(u1),openProject(0, p1, settles),leave,drain`, 9      | `drain: s1.p1.settles's plan changed after its session s1 was withdrawn: expected false to be true`      | `isCurrent: () => isCurrent() && dependencies.isCurrent(),`  |
| `x4` | a log out that hangs on a never-closing socket: neither nested wait is bounded                   | 75  | `signIn(u1),openProject(0, p1, hangs),leave,answer`, 6       | `teardown: leave never settled: expected false to be true`                                               | `const slot = createLifetimeSlot<SessionRuntime>(budgetMs);` |
| `x5` | a log out mid-transition answers at once instead of joining the retirement                       | 3   | `signIn(u1),leave,logOut`, 7                                 | `logOut#1 settled signed-out before s1 was given back: expected false to be true`                        | `await owner.leave();` in `exit` (with `x1`)                 |
| `x6` | a refused retirement reported signed-out: the `fatal` check dropped                              | 58  | `signIn(u1),openProject(0, p1, rejects),logOut,drain`, 5     | `logOut#1 settled signed-out before s1 was given back: expected false to be true`                        | `if (slot.snapshot().status === 'fatal') return 'fatal';`    |
| `x7` | a log out that undoes a later sign-in: `wanted` ignored                                          | 43  | `signIn(u1),logOut,signInBroken(u1)`, 4                      | `logOut#1 settled signed-out though a sign-in was asked for while it retired: expected true to be false` | `return wanted === null ? 'signed-out' : 'overtaken';`       |

`x2`, `x3` and `x4` shrink to a user switch or a `leave` rather than a `logOut`: each is the same
withdrawal and retirement a log out makes (`exit()` is `leave()`), and fast-check keeps the shortest
sequence it found.

The examples, each exit 1:

| Id   | Fault (patch) | Suite › test                                                                                                                   | Observed                                                                                                                   | Comment above                                                            |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `e1` | `x2`'s        | `session-runtime.test.ts` › `settles signed out once the project and then the session have let go, and sends nothing`          | `1 failed \| 10 skipped (11)`; `expected [ 'session given back', …(1) ] to deeply equal [ 'project p1 given back', …(1) ]` | `await projects.leave();` (with `x2`)                                    |
| `e2` | `x4`'s        | `session-runtime.test.ts` › `settles fatal at the budget when the project’s socket never closes, and stays fatal once it does` | `1 failed \| 10 skipped (11)`; `expected null to be 'fatal'` — nothing settled after the budget                            | `const slot = createLifetimeSlot<SessionRuntime>(budgetMs);` (with `x4`) |
| `e3` | `x6`'s        | `session-runtime.test.ts` › `settles fatal after a sign-in that could not be built, and keeps the fatal state`                 | `1 failed \| 10 skipped (11)`; `expected 'signed-out' to be 'fatal'`                                                       | `if (slot.snapshot().status === 'fatal') return 'fatal';` (with `x6`)    |

#### Proof x1 — a request sent during log out: the project left by its own await while the session stays current

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index 91ec80a6a..fc383fa66 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -387,6 +387,8 @@ export function createSessionOwner({
       return latest;
     },
     exit: async () => {
+      const current = slot.snapshot();
+      if (current.status === 'live') await current.services.projects.leave();
       await owner.leave();
       if (slot.snapshot().status === 'fatal') return 'fatal';
       return wanted === null ? 'signed-out' : 'overtaken';
```

#### Proof x2 — the session retired before its project: the disposer no longer awaits the project’s leave

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index 91ec80a6a..98693dda8 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -194 +194 @@ export function installSessionRuntime({
-          await projects.leave();
+          void projects.leave();
```

#### Proof x3 — a late project answer after log out: the project’s currency no longer asks its session

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index 91ec80a6a..3893a3f42 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -141 +141 @@ function sessionProjects({
-        isCurrent: () => isCurrent() && dependencies.isCurrent(),
+        isCurrent: dependencies.isCurrent,
```

#### Proof x4 — a log out that hangs on a never-closing socket: neither nested wait is bounded

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index 91ec80a6a..aabc5586b 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -294,7 +294,7 @@ export function createSessionOwner({
   installProject = installProjectRuntime,
   budgetMs = RETIREMENT_BUDGET_MS,
 }: SessionOwnerDependencies = {}): SessionOwner {
-  const slot = createLifetimeSlot<SessionRuntime>(budgetMs);
+  const slot = createLifetimeSlot<SessionRuntime>(2 ** 31 - 1);
   /** The identity the newest request asked for, or `null` after a leave. */
   let wanted: SessionIdentity | null = null;
   /** The newest request's settlement, which a request for the same user joins. */
@@ -373,7 +373,7 @@ export function createSessionOwner({
             directoryApi: clientFor(identity.credential),
             isCurrent,
             installProject,
-            budgetMs,
+            budgetMs: 2 ** 31 - 1,
           });
           built = runtime.services;
           return runtime;
```

#### Proof x5 — a log out mid-transition answers at once instead of joining the retirement

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index 91ec80a6a..a7803bf4b 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -387,6 +387,7 @@ export function createSessionOwner({
       return latest;
     },
     exit: async () => {
+      if (slot.snapshot().status !== 'live') return 'signed-out';
       await owner.leave();
       if (slot.snapshot().status === 'fatal') return 'fatal';
       return wanted === null ? 'signed-out' : 'overtaken';
```

#### Proof x6 — a refused retirement reported signed out: the fatal check dropped

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index 91ec80a6a..c0cca0695 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -388,7 +388,6 @@ export function createSessionOwner({
     },
     exit: async () => {
       await owner.leave();
-      if (slot.snapshot().status === 'fatal') return 'fatal';
       return wanted === null ? 'signed-out' : 'overtaken';
     },
   };
```

#### Proof x7 — a log out that undoes a later sign-in: wanted ignored

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index 91ec80a6a..456ae9a3a 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -389,7 +389,7 @@ export function createSessionOwner({
     exit: async () => {
       await owner.leave();
       if (slot.snapshot().status === 'fatal') return 'fatal';
-      return wanted === null ? 'signed-out' : 'overtaken';
+      return 'signed-out';
     },
   };
   return owner;
```

#### Proof e1 — x2’s patch, against the example

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index 91ec80a6a..98693dda8 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -194 +194 @@ export function installSessionRuntime({
-          await projects.leave();
+          void projects.leave();
```

#### Proof e2 — x4’s patch, against the example

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index 91ec80a6a..aabc5586b 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -294,7 +294,7 @@ export function createSessionOwner({
   installProject = installProjectRuntime,
   budgetMs = RETIREMENT_BUDGET_MS,
 }: SessionOwnerDependencies = {}): SessionOwner {
-  const slot = createLifetimeSlot<SessionRuntime>(budgetMs);
+  const slot = createLifetimeSlot<SessionRuntime>(2 ** 31 - 1);
   /** The identity the newest request asked for, or `null` after a leave. */
   let wanted: SessionIdentity | null = null;
   /** The newest request's settlement, which a request for the same user joins. */
@@ -373,7 +373,7 @@ export function createSessionOwner({
             directoryApi: clientFor(identity.credential),
             isCurrent,
             installProject,
-            budgetMs,
+            budgetMs: 2 ** 31 - 1,
           });
           built = runtime.services;
           return runtime;
```

#### Proof e3 — x6’s patch, against the example

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
index 91ec80a6a..c0cca0695 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -388,7 +388,6 @@ export function createSessionOwner({
     },
     exit: async () => {
       await owner.leave();
-      if (slot.snapshot().status === 'fatal') return 'fatal';
       return wanted === null ? 'signed-out' : 'overtaken';
     },
   };
```

### 8.2 Slice 2 — the region (`apps/wbs/fe-01/src/app.tsx`)

```text
a1
apps/wbs/fe-01/src/app.tsx
src/app.test.tsx
signs out once the project and then the session have let go, and sends nothing
a2
apps/wbs/fe-01/src/app.tsx
src/app.test.tsx
shows the fatal state instead of signing out when the project will not let go
p1
apps/wbs/fe-01/src/app.tsx
src/app.test.tsx
draws the fatal state in the region’s place when its project cannot be given back outside a log out
```

| Id   | Fault                                                               | Suite › test                                                                                                           | Observed                                                                                                  | Comment above                                                                          |
| ---- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `a1` | the old wiring: `Log out` signs out at once, before anything let go | `app.test.tsx` › `signs out once the project and then the session have let go, and sends nothing`                      | `1 failed \| 16 skipped (17)`; `expected [ 'signed out' ] to deeply equal [ 'project given back', …(2) ]` | `account={<ThemedAccountMenu username={session.user.username} onSignOut={signOut} />}` |
| `a2` | signed out whatever the exit settled                                | `app.test.tsx` › `shows the fatal state instead of signing out when the project will not let go`                       | `1 failed \| 16 skipped (17)`; `expected [ 'signed out' ] to not include 'signed out'`                    | `if (exit === 'signed-out') onSignedOut();`                                            |
| `p1` | a terminal project fault not drawn by the region                    | `app.test.tsx` › `draws the fatal state in the region’s place when its project cannot be given back outside a log out` | `1 failed \| 16 skipped (17)`; `Error: no fatal state yet` — the directory stayed on screen               | `if (projectState.status === 'fatal' && projectState.terminal)`                        |

Also observed: `a1` over the whole suite fails three examples (both fatal-page examples too, since the
recorder `onSignedOut` never retires anything), `a2` two (`… socket never closes` as well).

#### Proof a1 — the old wiring: Log out signs out at once, before anything let go

```diff
diff --git a/apps/wbs/fe-01/src/app.tsx b/apps/wbs/fe-01/src/app.tsx
index 09a8e4d94..036a6df76 100644
--- a/apps/wbs/fe-01/src/app.tsx
+++ b/apps/wbs/fe-01/src/app.tsx
@@ -257,7 +257,7 @@ export function SignedInApp({
             // TS2339 here and at AccountMenu below in the actual FE app typecheck.
             (roster) => <PresencePanel me={session.user.username} {...roster} />
           }
-          account={<ThemedAccountMenu username={session.user.username} onSignOut={signOut} />}
+          account={<ThemedAccountMenu username={session.user.username} onSignOut={onSignedOut} />}
         />
       </ProjectRetirementGate>
     </div>
```

#### Proof a2 — signed out whatever the exit settled

```diff
diff --git a/apps/wbs/fe-01/src/app.tsx b/apps/wbs/fe-01/src/app.tsx
index 09a8e4d94..01f5ccb1e 100644
--- a/apps/wbs/fe-01/src/app.tsx
+++ b/apps/wbs/fe-01/src/app.tsx
@@ -208,7 +208,7 @@ export function SignedInApp({
     );
   const signOut = (): void => {
     void sessionOwner.exit().then((exit) => {
-      if (exit === 'signed-out') onSignedOut();
+      onSignedOut();
     });
   };

```

#### Proof p1 — a terminal project fault not drawn by the region

```diff
diff --git a/apps/wbs/fe-01/src/app.tsx b/apps/wbs/fe-01/src/app.tsx
index 09a8e4d94..b319a9085 100644
--- a/apps/wbs/fe-01/src/app.tsx
+++ b/apps/wbs/fe-01/src/app.tsx
@@ -285,7 +285,5 @@ function ProjectRetirementGate({
   children: ReactNode;
 }): ReactNode {
   const projectState = useSyncExternalStore(projects.subscribe, projects.snapshot);
-  if (projectState.status === 'fatal' && projectState.terminal)
-    return <LifetimeFault fault={projectState.fault} />;
   return children;
 }
```

## 9. Verification

### 9.1 Every fenced diff applies, extracted from this document, in slice order

The requirement is not "these diffs were once correct" but "these diffs, as this committed document
spells them, apply in slice order, produce exactly the rehearsal's final tree, and every fault patch
applies to the tree its slice leaves" — on the authoring base, on that base with packet i's executor
output simulated, **and on the real dispatch base**. The script has three modes:

- `fill=0` — the authoring base; the result must be byte-identical to the rehearsal's final commit.
- `fill=1` — the authoring base with a two-line `// Proof:` comment inserted above each of packet i's
  fifteen comment sites as its rehearsal placed them, in `session-runtime.ts` (its eleven slice-1
  runtime sites and `g1`) and `app.tsx` (`g2`, `g3`, `g4`), and its `<observed-date-i>` notes dated.
- `fill=real` — the base named by `REAL_BASE`: planning after packet i's three slices, plus this
  packet's commit cherry-picked (section 6, Dispatch). Nothing is filled: packet i's real comments are
  there, and not all where the rehearsal put them — its executor wrote `o3` as `? // Proof: …` inside
  the ternary, so that simulated anchor counts 0 there, and `<observed-date-i>` is already dated. The
  result must change exactly the nine owned paths; the seven files packet i's executor never comments
  must equal the rehearsal's final bytes (the two notes compared with every `observed` date
  normalised); and `session-runtime.ts` and `app.tsx` must equal them once every `//` comment and all
  whitespace are stripped from both sides. **This mode's output is the dispatch evidence**: the
  planner runs it with `REAL_BASE=<the reviewed base SHA>` before the first dispatch and records it
  beside the review. Unset, the mode prints that it was skipped and proves nothing.

No script, no Prettier and no `node_modules` are needed: every change is a diff.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-k-log-out.md
base=2e237e20ec0715cdaf4423d7de2a9bdb60ffa11b
final=59cfe22a42c5471fa1f3aa714a722faabce9e8d5
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
# Checks every fault patch named on the command line against the tree.
check_faults() {
  for id in "$@"; do git -C "$work/tree" apply --unidiff-zero --check "$work/mutations/$id.diff"; done
}
# A file with every // comment and all whitespace removed: equal code, whatever the comments.
code_of() { sed -e 's#[[:space:]]*//.*$##' "$1" | tr -d '[:space:]'; }
# A note with every "observed <date>" normalised, placeholder or date.
dates_of() { sed -E 's/observed (<observed-date-[a-z]+>|[0-9]{4}-[0-9]{2}-[0-9]{2})/observed D/g' "$1"; }
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
  test "$count" -eq 13
  git archive "$from" | tar -x -C "$work/tree"
  fe="$work/tree/apps/wbs/fe-01"
  if [ "$fill" = 1 ]; then
    runtime="$fe/src/runtime/session-runtime.ts"
    # Packet i's eleven slice-1 runtime sites, as its own section 9.1 fills them, and g1.
    for anchor in "if (identity.userId === wanted?.userId) return latest;" "wanted = null;" \
      "await projects.leave();" "isCurrent: () => isCurrent() && dependencies.isCurrent()," \
      "if (!isCurrent()) return;" "return state.status === 'live' && state.services === built;" \
      "return acquireTransactionally(bag, () => ({" \
      "if (refusal instanceof TransitionSupersededError) return;" \
      "? new PartialAcquisitionError(failure.cause, recorded(failure.release))" \
      "return state.status === 'live' && state.services.userId === userId ? state.services : null;"; do
      fill_above "$runtime" "$anchor"
    done
    fill_above "$runtime" "refusedByRuntime.add(refusal);" 2
    fill_above "$runtime" "refusedByRuntime.add(refusal);" 1
    test "$(grep -c 'Proof: simulated' "$runtime")" -eq 12
    app="$fe/src/app.tsx"
    fill_above "$app" "if (sessionState.status === 'fatal') return <LifetimeFault fault={sessionState.fault} />;"
    fill_above "$app" "void sessionOwner.leave();"
    fill_above "$app" "void sessionOwner.open({ userId: session.user.id, credential: session.token });"
    test "$(grep -c 'Proof: simulated' "$app")" -eq 3
    for note in "$work/tree/openspec/changes/adopt-frontend-lifetimes/tasks.md" \
      "$work/tree/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md"; do
      test "$(grep -c '<observed-date-i>' "$note")" -eq 1
      sed -i 's/<observed-date-i>/2026-09-25/' "$note"
    done
    echo "fill=1 filled-sites=15, packet i's dated notes filled"
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
  check_faults x1 x2 x3 x4 x5 x6 x7 e1 e2 e3
  echo "fill=$fill slice 1 applied, its 10 fault patches check"
  for n in 04 05 06; do
    git -C "$work/tree" apply --check "$work/patches/$n.diff"
    git -C "$work/tree" apply "$work/patches/$n.diff"
  done
  check_faults a1 a2 p1
  echo "fill=$fill slice 2 applied, its 3 fault patches check"
  git -C "$work/tree" status --porcelain --untracked-files=all | wc -l
  mkdir "$work/final"
  git archive "$final" | tar -x -C "$work/final"
  if [ "$fill" = 0 ]; then
    diff -r --exclude=.git "$work/tree" "$work/final"
    echo "fill=0 tree identical to $final"
  elif [ "$fill" = 1 ]; then
    echo "fill=1 simulated comments left: $(cat "$fe/src/runtime/session-runtime.ts" "$fe/src/app.tsx" | grep -c 'Proof: simulated')"
  else
    git -C "$work/tree" status --porcelain --untracked-files=all | cut -c4- | sort > "$work/changed.txt"
    printf '%s\n' apps/wbs/fe-01/src/app.test.tsx apps/wbs/fe-01/src/app.tsx \
      apps/wbs/fe-01/src/runtime/session-exit.model.test.ts \
      apps/wbs/fe-01/src/runtime/session-runtime.test.ts \
      apps/wbs/fe-01/src/runtime/session-runtime.ts apps/wbs/fe-01/vitest.node-suites.ts \
      docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md \
      openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
      openspec/changes/adopt-frontend-lifetimes/tasks.md | sort > "$work/owned.txt"
    diff "$work/owned.txt" "$work/changed.txt"
    echo "fill=real changed exactly the nine owned paths"
    for f in apps/wbs/fe-01/src/app.test.tsx apps/wbs/fe-01/src/runtime/session-exit.model.test.ts \
      apps/wbs/fe-01/src/runtime/session-runtime.test.ts apps/wbs/fe-01/vitest.node-suites.ts \
      openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md; do
      cmp "$work/tree/$f" "$work/final/$f"
    done
    for f in openspec/changes/adopt-frontend-lifetimes/tasks.md \
      docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md; do
      diff <(dates_of "$work/tree/$f") <(dates_of "$work/final/$f")
    done
    echo "fill=real seven uncommented files equal the rehearsal's"
    for f in apps/wbs/fe-01/src/runtime/session-runtime.ts apps/wbs/fe-01/src/app.tsx; do
      test "$(code_of "$work/tree/$f")" = "$(code_of "$work/final/$f")"
    done
    echo "fill=real session-runtime.ts and app.tsx equal the rehearsal's but for comments"
  fi
done
````

Observed on 2026-09-24, after the final Prettier `--check` of this document, with
`REAL_BASE=50e4e7e48` — a stand-in for the real dispatch base built for this run only (not on any
branch): packet i's real slice-2 lane head `e46c8d3d9`, packet i's slice-3 diffs 07–09 from its own
packet applied, and its two notes dated:

```text
fill=0 extracted=6
fill=0 fault-patches=13
fill=0 slice 1 applied, its 10 fault patches check
fill=0 slice 2 applied, its 3 fault patches check
9
fill=0 tree identical to 59cfe22a42c5471fa1f3aa714a722faabce9e8d5
fill=1 extracted=6
fill=1 fault-patches=13
fill=1 filled-sites=15, packet i's dated notes filled
fill=1 slice 1 applied, its 10 fault patches check
fill=1 slice 2 applied, its 3 fault patches check
9
fill=1 simulated comments left: 15
fill=real extracted=6
fill=real fault-patches=13
fill=real slice 1 applied, its 10 fault patches check
fill=real slice 2 applied, its 3 fault patches check
9
fill=real changed exactly the nine owned paths
fill=real seven uncommented files equal the rehearsal's
fill=real session-runtime.ts and app.tsx equal the rehearsal's but for comments
```

`git apply --check` prints nothing on success, which is why the script's own `echo` lines are the
evidence and why every count is asserted rather than printed. The number printed after slice 2 is the
paths changed against the base: nine — every owned path of the two slices but `verify.md`, which the
executor writes. The `fill=0` tree is byte-identical to the rehearsal's final commit (`diff -r` printed
nothing), which holds the two `<observed-date-k>` placeholders slice 2 step 4 replaces. In the
`fill=1` run all fifteen simulated comments of packet i survive in place, its dated notes did not
disturb slice 2's hunks, and `x2` and `x3` locate their one line below a simulated comment. The
`fill=real` run is the same against packet i's own words: `x2` and `x3` find their line under i's real
`m7`/`d1` and `m8` blocks.

**A failed check stops the run**: the same two-line form as packets g to j.

Every **intermediate** tree typechecks: `wbs-fe-01:typecheck` exit 0 on both rehearsal commits, each
committed with the hooks on. Exactly two trees do not: the red checkpoints, each the previous slice's
commit plus that slice's contract and test side (section 6 gives each one's diagnostics).

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
Rehearsed on the base and after both slices' contract steps: `{"items":114,"passed":114,"failed":0}`.

### 9.3 Commands actually run, and what each reported

All on 2026-09-24, by this packet's author, on the throwaway branch `rehearse/050-7-k` cut at the
authoring base `2e237e20`, each slice committed **with the hooks on** (lefthook's wiki, secrets,
format and lint checks passed for both): `3e272003` (slice 1) and `4b375ea5` (slice 2), and
`59cfe22a` on top, the round-1 review's one sentence in the lifetime map (slice 2's diff 7.6 carries
it; the final tree section 9.1 compares against is `59cfe22a`). Each red was
rebuilt from the previous slice's commit plus that slice's contract and test side only; each fault was
injected into the tree of the slice that owns it. The authoring base itself was built by packet i's
section 9.1 extraction (`fill=0`) against integration `52876ae12`: `extracted=9`, `fault-patches=24`,
slices 1 to 3 applied with 19, 4 and 1 fault patches checking, 29 paths — every one of packet i's
hunks held on packet j's real code; packet i's model and examples passed there (3 files, 14 tests)
and so did the session set (3·65) and `wbs-fe-01:typecheck`.

| Check                                  | Base `2e237e20` | Slice 1                     | Slice 2                                          |
| -------------------------------------- | --------------- | --------------------------- | ------------------------------------------------ |
| sandbox node suite (files·tests)       | 56·709          | 57·713                      | 57·713                                           |
| runtime set, serial                    | 2·9             | 3·13                        | 3·13                                             |
| session set, serial                    | 3·65            | 3·65                        | 3·70                                             |
| preferences suite                      | 4·39            | 4·39                        | 4·39                                             |
| zoned (Auckland)                       | 2·3             | 2·3                         | 2·3                                              |
| adopted set, serial                    | 20·1219         | —                           | 20·1219                                          |
| red typecheck                          | —               | exit 1, 9 errors in 2 files | exit 1, 2 errors in 1 file                       |
| red Vitest                             | —               | `4 failed \| 8 passed (12)` | `4 failed \| 13 passed (17)`, 3 unhandled errors |
| typecheck and lint on the slice's tree | 0               | 0, 0                        | 0, 0; `nx format:check --all` 0                  |
| faults observed failing, file restored | —               | 10 of 10                    | 3 of 3                                           |
| strict OpenSpec                        | 114 · 114 · 0   | 114 · 114 · 0               | 114 · 114 · 0                                    |

Every proof filter matched exactly one test. The seven model faults were run twice, with identical run
numbers and shrunk sequences; each restore was `cmp`-identical and each green rerun passed.

**What was tried and found unprovable, and why** (section 3.4): unbinding only the session's own wait
(`createLifetimeSlot<SessionRuntime>(2 ** 31 - 1)`) left the model **passing** — the project's wait
inside it still ends the log out, through `SessionProjectRetirementError`; unbinding only the budget
the session hands its project left the property holding too, and the test failed only on its reach
counter, `the pinned run never reached projectTimedOut` — the session's own wait ended every log out
first. Neither alone is a fault; `x4` unbinds both. The model's first form judged `overtaken` against
the model's `wanted` at settlement and a sign-in at any time before settlement; it shrank to
`signIn(u1),logOut,signIn(u1),reenterLogOut,drain` and to a sequence ending
`reenterLogOut,logOut,signIn(u1),logOut,answer`, in both of which the owner was right and the model
was not (section 3.1's last paragraph).

**Also observed**: `x5` injected fails, beside the model, the examples `settles fatal at the budget …`
and `settles fatal after a sign-in …` (`expected 'signed-out' to be 'fatal'`); `x1` and `x7` leave the
three examples passing — the model is their only witness.

### 9.4 Planner-only, with the expected relative delta

The sandbox cannot run these: three tests in two files spawn `bun` from Node, there is no browser, a
build writes outside the attempt's lane, and devsync writes Git objects.

| Check                                                                                                                                                                                            | Expected, relative to the base                                                                                               | Planner's own rehearsal                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit`                                                                                                    | slice 1 **+ 1 file, + 4 tests**; slice 2 unchanged                                                                           | **Not run.** Pending planner verification.                   |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test`                                                                                                         | UTC: slice 1 **+ 1 file, + 4 tests**, slice 2 **+ 5 tests**. Auckland zoned unchanged                                        | **Not run.** Pending planner verification.                   |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                                                                                                                    | exit 0 after each slice                                                                                                      | **Not run.** Pending planner verification.                   |
| `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, with the slice committed or staged                                                                   | unchanged; no project target, no module index block, no pre-namespacing path in any owned document                           | run by `planner-commit.sh` on this packet's own commit only  |
| `CI=1 E2E_PORT_SHIFT=<a multiple of 300 clear of every live run, checked with ss -ltn> NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run wbs-fe-01:e2e -- <spec>` | exit 0, unchanged, after slice 2 — the login specs and every spec that clicks `Log out`                                      | **Pending planner verification.** Not run in this rehearsal. |
| the same target **unfiltered**, on its own shift, on the final integration commit                                                                                                                | exit 0. The batch README's "Integration verification" requires the whole frontend browser suite once a frontend change lands | **Pending planner verification.** Not run, not waived.       |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                       | exit 0 on the shared build host                                                                                              | **Not run**; reported as pending, never as passed.           |

`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` is not decoration: `CLAUDECODE=1` changes Bun's test
output and fails thirteen unrelated tests in this repository.

### 9.5 What none of this proves

- No browser ran. The Chromium log-out path — the menu, the "Loading…" interval, the form returning,
  a reload restoring the cookie session — is the planner's and is pending, not waived.
- The model's clock is fake and its budget 1 000 ms; production's is 5 000 ms of real time. The app
  example runs the never-closing socket on real timers at a 50 ms budget, once.
- The region example leaves the project the way the page's cleanup does, directly; no example drives
  a route change or Strict Mode through the router (task 11).
- No production gesture reaches a log out from a `fatal` owner, or a sign-in during a log out: the
  account menu is not drawn in either state. The model and the examples exercise the owner's contract
  there, not a reader's path.
- `signOut` is `void sessionOwner.exit().then(…)` with no rejection path: a fault of the slot itself
  becomes an unhandled rejection with nothing drawn — the same shape as packet i's
  `void sessionOwner.open(…)`, whose `open` may reject (packet i's round-2 review). Neither is a
  refusal of the owner's runtimes, which settle.
- The authoring base carries packet i's **rehearsed** diffs; section 9.1's `fill=real` run on the real
  base after packet i's lane lands is what proves the rest, including any change its dispatch review
  makes.

## 10. Stop conditions

Each is false on the rehearsal tree, checked on 2026-09-24.

1. Step 0a's status is not empty, or `base` differs from the slice note's SHA. Stop: the clone is not
   the tree this packet was reviewed against.
2. Step 0b extracts other than 6 patches or other than 13 fault patches. Stop: this document is not the
   one reviewed.
3. A patch fails `git apply --check`. Stop and report the exact error; never hand-edit a file into
   shape.
4. A baseline (step 0c) exits non-zero. Stop, except for the known cases in 11.
5. A red checkpoint shows **no** failure, or different diagnostics than section 6 names. Either means
   the tests did not land as written.
6. A session-set or sandbox green run differs from its step-0 number by anything but the slice's own
   additions. Stop.
7. A proof filter matches zero tests, or more than one. Stop.
8. A fault leaves its named test passing. Restore, re-read the table, redo once; if it still passes,
   stop — the check may not be where this packet says it is.
9. The strict OpenSpec block exits non-zero, or `passed` falls below step 0's number.
10. `SignedInApp` is found drawing anything but "Loading…" between a click on `Log out` and the exit's
    settlement in any example output, or an example reports a request after the click. Stop.
11. **Known, not this packet's:** a single `Test timed out in 5000ms` in one of the session files
    during a serial run on a loaded host; or a `DiBagCloseCancelledError` (`DI_BAG_CLOSE_TIMEOUT`) from
    a fixture's own `afterEach` retirement. Record it, rerun **that file alone once**, and stop only if
    it fails again.
12. At hand-over, the status shows any path outside the slice's own list. Stop.
13. Anything asks for a `git` state change in the clone, a network call, a browser, or `--no-verify`.

## 11. Out of lane

- `runtime/lifetime-slot.ts`, `runtime/project-runtime.ts`, `runtime/application-*`: read only.
  `x4` injects into `session-runtime.ts` alone, even though the waits it unbinds are the slot's.
- `components/chrome/*` (the account menu and the fatal page are used, not changed),
  `components/wbs/project-page.tsx`, `app-router.tsx`, `lib/*`, `main.tsx`, every suite not named in
  section 5.
- `project.json`, the Vitest configs but `vitest.node-suites.ts`, `bun.lock`, `package.json`: no
  dependency is added, removed or bumped.

## 12. Hand-over to the next packet

- **Task 11** inherits `ProjectRetirementGate`: its route-unmount and Strict Mode tests, driven
  through the router, should end in the gate's fatal page when the project's close fails, and may
  then drop this packet's direct `session.projects.leave()` example. `ProjectPage`'s own terminal
  branch is shadowed under `SignedInApp` and can be narrowed to the non-terminal case there.
- **Page hide's own session retirement** — the named residual this packet does not close, and no open
  task owns: `pagehide` invalidates the React root, `SignedInApp`'s unmount cleanup starts `leave()`,
  and the application's retirement does not join it. The lifetime map wants application retirement
  to begin only after both child retirements were started **and joined**; that needs the application
  bootstrap to reach the session owner, which is an application-lifetime change. Recorded for the
  planner to assign.
- **The lifetime map's single non-React lifecycle-failure reporter** stays unbuilt: session and
  project faults are drawn, not logged (section 3.4), and the map's tests 12 and 13 are amended to say
  so, with no open task. A later change that adds a seam out of `application-bootstrap.tsx` can report
  them there.
- **Task 13** can state "log out sends no request" by symbol — no `fetch` or client reachable from
  `exit` — rather than by this packet's recorded `fetch` paths.

## 13. Assumptions recorded rather than asked

1. **Log out is the owner's, not a coordinator's** (section 3.2): the lifetime map's "host
   coordinator" is the session owner, because the project owner is the session's (packet i's
   decision), and a second coordinator would be a second place retirement order lives.
2. **The failure is drawn, not logged** (section 3.4).
3. **After an unbuildable sign-in, log out stays fatal** (section 3.4): no production gesture reaches
   it, and clearing a fatal page by a gesture its own page does not offer would be new behaviour.
4. **"Loading…" during a log out**, not a new "Signing out…" line: the interval is microseconds
   unless a socket hangs, and a new visible string is a reader-visible change the proposal does not
   ask for.
5. **`onSignOut` is renamed `onSignedOut` on `SignedInApp`** (R2): it is now called after the exit,
   not at the click; `AccountMenu`'s own `onSignOut`, the gesture, keeps its name.
6. **The model's clients are fakes with scheduled answers; its runtimes are real** — the session's and
   the project's own wiring is what reaches them, so the guards under test are production's.
7. **Serial runs for the multi-file suites**, as the project's own `test` target runs them.

## 14. The brief, point by point

### 14.1 The non-negotiables of the commissioning brief

| Requirement                                                                                                                                                                                                                       | Where this packet meets it                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| authoring base from packet i's section 9.1 extraction (`fill=0`) on the real j code, committed once, never dispatched                                                                                                             | `2e237e20` (section 4, section 9.3); every hunk held                                                                             |
| log out as a lifecycle transition: a written state machine — signed-in with a project → project retiring → session retiring → signed-out; the fatal branches; mid-transition; during a sign-in; a second log out — and invariants | section 3.1, L1–L7                                                                                                               |
| `fc.asyncModelRun` model; four sabotages at least: a request during log out, session before project, a late project answer after log out, a hang beyond the budget, each at a recorded run                                        | section 8.1: `x1` (run 18), `x2` (50), `x3` (59), `x4` (75), plus `x5`, `x6`, `x7`                                               |
| the fatal log out's failure visible; decide drawn or reported; close packet j's "invisible unmount-time fatal" if the design does                                                                                                 | drawn (section 3.4); `ProjectRetirementGate` closes j's residual (`p1`)                                                          |
| production-path negatives with `Proof:` comments dated by the executor                                                                                                                                                            | section 8: thirteen faults, each observed; section 9.3 names what was tried and could not be proved                              |
| no `any`, unchecked cast or `!` outside tests; verb-object names, predicate booleans; module-identifier grammar; no product names; Twilight Burokrat spelling                                                                     | none in the production diffs; `exit`, `signOut`, `onSignedOut`, `isRetiring` (test); no module identifier added; no product name |
| task 7 ticked only if every sentence is met; residuals with owners                                                                                                                                                                | section 3.5; ticked in slice 2 with a dated note; residuals to task 11, task 13, and one with no open owner (section 12)         |
| rehearsal on `rehearse/050-7-k`, one commit per slice, hooks on; reds observed; faults run, restored, `cmp`                                                                                                                       | section 9.3                                                                                                                      |
| exact planner commit subjects and `owned.txt` per slice; relative counts (unit, jsdom UTC and zoned, adopted set); planner-only list                                                                                              | section 6 each slice's step 9 and subject; sections 4.2, 9.3, 9.4                                                                |
| section 9.1-style extraction with a fill simulation for packet i's comment sites                                                                                                                                                  | section 9.1, `fill=0` identical to the final rehearsal commit; `fill=1` over packet i's fifteen sites and dated notes            |
| no absolute path outside Dispatch; `--driver claude` and `--require-ancestor <I3>` on every dispatch line                                                                                                                         | section 6 Dispatch                                                                                                               |
| packet i's round-2 facts: log out from a non-terminal fatal; `open` may reject                                                                                                                                                    | section 3.1 and 3.4 (stays fatal, example `e3`'s test); section 3.2 (the exit queues behind `open`, never assumes it settles)    |

### 14.2 The batch-6 addendum's twenty points

| Point                       | Assessment                                                                                                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reproduced red           | Met for both slices: compiler and runtime reds, each rebuilt from the previous slice plus its test side, diagnostics pasted (section 6).                                                                                                                               |
| 2. Typecheck and lint       | Met: both native per slice, exit 0 on each rehearsed commit, every slice committed with lefthook on (section 9.3).                                                                                                                                                     |
| 3. Path counts              | Met: each hand-over lists the slice's exact paths (6, 6); the planner's own commit adds only this document.                                                                                                                                                            |
| 4. Failure-visible commands | Met: every check records its own status and `expect-status.sh` asserts it.                                                                                                                                                                                             |
| 5. HEAD-reading tests       | N/A: no project, target or CI path is renamed.                                                                                                                                                                                                                         |
| 6. Sandbox constraints      | Met: whole targets, build, devsync and Chromium are the planner's, with expected deltas (section 9.4).                                                                                                                                                                 |
| 7. Known race               | Met: named, one rerun, no repair authority (section 10.11).                                                                                                                                                                                                            |
| 8. Names                    | Met: no product name in an identifier; no module identifier added.                                                                                                                                                                                                     |
| 9. Packet form and evidence | Met: two slices, each ending in a planner commit with its exact subject; relative baselines; production-path negatives with observed messages; the unprovable named, not skipped.                                                                                      |
| 10. Pins                    | Met: no pin touched.                                                                                                                                                                                                                                                   |
| 11. Pipeline exit handling  | Met: the fault `diff` form after one command; the filter count and the placeholder check read single commands or captured output.                                                                                                                                      |
| 12. Planner chaining        | Met: the extraction stops at the first failed check (section 9.1).                                                                                                                                                                                                     |
| 13. Module index            | N/A: no module directory is created or changed.                                                                                                                                                                                                                        |
| 14. Bun directory filters   | N/A: every suite runs through Vitest from `apps/wbs/fe-01`.                                                                                                                                                                                                            |
| 15. Interleaving property   | Met: the owner, its sessions and their projects under `fc.scheduler`-ordered answers and closes, with log outs, leaves, sign-ins, broken sign-ins, reads and project opens interleaved, on a fake clock (section 3.1).                                                 |
| 16. Model-based remedy      | Met: `fc.asyncModelRun` against a reference model, with **re-entrant** log outs from inside the owner's notification, **partial acquisitions** (`signInBroken`), and **controlled timeouts** (a never-settling socket and `elapse`), seven sabotages at recorded runs. |
| 17. Seeded evidence         | N/A: no slice reads an earlier attempt's evidence.                                                                                                                                                                                                                     |
| 18. Symbol-based checks     | N/A: no code-shape checker is introduced; task 13 owns the symbol rule (section 12).                                                                                                                                                                                   |
| 19. Missing-file grep       | Met: every grep over a file follows a `test -f` or reads captured output.                                                                                                                                                                                              |
| 20. Honest limits           | Met: sections 3.5 and 9.5 — the fake clock, the direct project leave, the unreachable gestures, the single-wait faults that cannot fail, the rehearsed rather than real packet i base.                                                                                 |

## 15. Ready to commit

| Slice | Paths                                                                                                                                                                                                                           | Subject                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1     | `spec.md`, `verify.md`, `apps/wbs/fe-01/vitest.node-suites.ts`, `apps/wbs/fe-01/src/runtime/{session-runtime.ts,session-runtime.test.ts}` — **5 modified**; `apps/wbs/fe-01/src/runtime/session-exit.model.test.ts` — **1 new** | `feat(frontend): give the session owner a local exit that retires the project and then the session` |
| 2     | `spec.md`, `verify.md`, `tasks.md`, `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, `apps/wbs/fe-01/src/{app.tsx,app.test.tsx}` — **6 modified**                                                    | `feat(frontend): log out through the session owner's local exit, and close task 7`                  |

(`spec.md`, `verify.md` and `tasks.md` are under `openspec/changes/adopt-frontend-lifetimes/`.) After
the last commit the host gate runs on the shared build host with the committed hash, and its printed
running-hash line and exit status are recorded. Anywhere else it is reported as not run, with the
reason — never as passed. The Chromium runs of section 9.4 are reported the same way until they have
happened.
