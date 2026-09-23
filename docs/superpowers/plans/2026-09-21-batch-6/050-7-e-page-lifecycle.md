# 050.7e The page-lifecycle retirement trigger, without hot-module replacement

|                     |                                                                                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item           | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **fifth packet**                                                                                                                                                                                    |
| Size class          | S                                                                                                                                                                                                                                                                                              |
| Predecessor         | [050.7d](050-7-d-withdrawal-and-page-lifecycle.md), merged: the withdrawal mechanism (`preferences.resource.ts`'s `ensureLive`), and Part 2's own scope statement and hand-over (its section 1 and section 11, item 1).                                                                        |
| Design              | This packet's own section 4. **No state, event or invariant in [the lifetime slot design record](050-7-lifetime-slot-design.md) changes.**                                                                                                                                                     |
| Reviewed source map | [050.7 frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md): tests 2 and 3's own page-hide/persisted-restoration half, and test 4 (test 1 was closed by 050.7a/c; test 3's own HMR half moves to 050-7-e2; tests 5–15 are session/project runtime, out of scope here). |
| Execution contract  | [batch 1 README](../2026-09-19-batch-1/README.md): "Execution contract", "Rules for every executor", "Standard blocks every packet uses", "Hidden constraints every frontend packet" — including the **three-round convergence rule** this response invokes in section 1.                      |
| Planning head       | `76f871d8` (`origin/main`, packet 050.7d merged)                                                                                                                                                                                                                                               |
| Reviews             | Nine rounds, `puni-plan/reviews-batch-6/050-7-e-page-lifecycle.review{1,2,3,4,5,6,7,8,9}.md` (outside this repository, historical reference only) — sections 13–21 are self-contained dispositions; nothing here requires reading those files.                                                 |

## 1. Goal, the HMR cut, and non-goals

**Why this packet no longer includes hot-module replacement.** The original goal covered three
behaviours: `pagehide`/persisted-`pageshow` retirement, HMR disposal of the bootstrap module, and
a retirement failure showing the sanitized fatal page. Three independent review rounds each found
a **different** HMR ownership race that the previous round's fix had not covered:

1. Round 1: HMR retained the old instance's own root and slot subscription, so a retirement
   failure after hot-reload drew and reported twice.
2. Round 2: fixing that (an `unsubscribe()` plus the slot's own ordinal-based supersession) still
   let a disposal rejection reach an already-superseded instance's own queued `attempt()`, because
   `lifetime-slot.ts` checks terminal refusal before its ordinal fence — two roots, two reports one
   way, zero reports the other.
3. Round 3: fixing _that_ with a bootstrap-generation ownership token still left one case open — a
   successor bootstrapping **after** an already-displayed failure leaked a root and duplicated a
   report, because transferring a token does not by itself transfer an already-mounted root or an
   already-logged occurrence.

The execution contract's own three-round convergence rule applies to exactly this shape of
finding — the same class of defect recurring under three different fixes. This response cuts HMR
from this packet rather than attempting a fourth ownership design under time pressure. Section 11
hands the behaviour to a new packet, **050-7-e2**, with the three reproduced races as its own
adversarial cases and a firm requirement: design and model-test the ownership state machine
**before** implementing it, not after a fourth review finds the next race.

**What this packet still does**, all of it proved exactly as before, none of it touched by the
cut:

1. **`pagehide` (persisted or not) retires the page's application runtime through the slot, and
   invalidates the mounted React root.**
2. **A persisted `pageshow` rebuilds through the same path the first draw used, into a genuinely
   fresh root, after — never racing — whichever retirement is still pending.**
3. **A retirement that rejects or outruns its budget leaves the slot fatal; the sanitized fatal
   page is rendered, and the rebuild is refused rather than raced against it** — including when the
   page is hidden and restored again after the fault is already showing: report deduplication
   (`reportedFault`) and draw deduplication (`drawnFault`) are separate, so a redraw never means a
   second console report.
4. **A bounded Chromium application-lifecycle case** (Important 2 of review 3): the real
   production `bootstrapApplication`, driven through a genuine back/forward-cache restoration under
   regular Chromium — section 4.7, with the exact planner command.

**Non-goals, each a measured finding:**

- **No hot-module replacement of the bootstrap module.** Cut, not deferred as an open question —
  section 11 states the design work 050-7-e2 has to finish before implementing it.
- **No change to `lifetime-slot.ts`, its model test's own state, event or invariant tables, or to
  `preferences.resource.ts`'s withdrawal mechanism.** Unchanged from every draft of this packet: the
  one file this packet's own production code touches is `application-bootstrap.tsx`.
- **No bookkeeping that tracks "the pending retirement".** `slot.replace` already queues behind
  whatever the slot is running; removed from an early working draft after being shown redundant by
  rehearsal (section 4.2).
- **No new user-visible behaviour beyond the sanitized fatal state 050.7c already ships.**
- **No server-side logout, and no session or project runtime.**
- **No claim that session, catalog or project restoration is complete.**

## 2. Read first

1. [050.7d](050-7-d-withdrawal-and-page-lifecycle.md) sections 1, 4 and 11 — the two-part split,
   the withdrawal mechanism this packet's design leans on, and item 1 of "what this packet leaves".
2. `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`'s "Application owner"
   section and its "Exact lifecycle tests for the implementation packet" tests 2–4 — quoted in full
   in section 3 below, with the HMR half of test 3 marked as this packet's own non-goal.
3. `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`, whole, current tree, **read-only and unmodified by
   this packet**: `accept()`, `transition()` (the `ahead` queue and the `ordinal !== newest` fence),
   and the terminal-refusal fields (`terminal.refusal`, `refusalSoFar()`). Section 4.3's own design
   reasoning is built directly from these.
4. `apps/wbs/fe-01/src/runtime/application-bootstrap.tsx`, whole, current tree (`76f871d8`) —
   `BootstrapDependencies`, `bootstrapApplication`'s existing `try`/`catch` around `slot.replace`,
   and its post-await fence. This packet's own slice modifies it (section 7.1 has the exact diff).
5. `apps/wbs/fe-01/src/app.tsx`'s `AppContent`: its `useEffect(() => { void fetchMe()… }, [])` — read
   for exactly one fact: React does not rerun a mount effect for a component tree it is only asked
   to render again; it reruns only across a real unmount-then-remount.
6. `apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx`, whole — the generated property
   this packet's own slice extends (section 7.4 has the exact diff).
7. `apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx`,
   `application-bootstrap.strictmode.test.tsx`, `apps/wbs/fe-01/e2e/lifetime-fault-probe.ts` and
   `apps/wbs/fe-01/src/main.tsx:11` — every existing caller of `bootstrapApplication`: the first
   three construct a `BootstrapDependencies` object literal by hand and need this packet's one new
   `eventTarget` field (section 3.3); `main.tsx` supplies no second argument at all and needs no
   change.
8. `openspec/changes/adopt-frontend-lifetimes/tasks.md` task 5's exact wording, and `verify.md`'s
   "Packet 050.7d, slice 3 — hand-over" section.

## 3. Verified facts

Every claim below was read or run in this packet's own worktree off `76f871d8`.

### 3.1 The frontend lifetime map's own words for tests 2–4

Quoted verbatim from `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`:

> …page hide initiates project, then session, then application retirement and
> **unmounts/invalidates the React root**. A persisted `pageshow` joins that same retirement
> promise and invokes the complete bootstrap path only after it succeeds: **build fresh
> runtimes/root/listeners**, restore the signed-in identity through `fetchMe`, preserve the
> browser address, and let catalog/directory/feed perform their normal arrival reads. Retirement
> rejection or bounded-wait expiry publishes the sanitized fatal state and starts no bootstrap;
> eventual cleanup completion does not silently resume it. Non-persisted navigation does not
> rebuild. Vite HMR disposal uses the same terminal retirement gate before the replacement
> module performs ordinary bootstrap.

> 2. **Application shutdown is shared across page hide and HMR.** …
> 3. **Persisted page restoration joins retirement before rebuilding.** Start at `/directory`,
>    dispatch a persisted `pagehide`, leave one disposer deferred, then dispatch `pageshow` with
>    `persisted: true`. Assert no application runtime, React root, listener, identity read or
>    project/session service is rebuilt while retirement is pending. Settle retirement
>    successfully and assert the complete bootstrap runs once… In rejection and budget-expiry
>    variants, assert the sanitized fatal state, zero bootstrap attempts, and continued
>    observation of late cleanup. …
> 4. **Application disposal failure is visible.** Make one owned disposer reject while another
>    records completion. Assert shutdown rejects with the DI Bag cleanup failure, the other
>    disposer still ran, and the sanitized lifecycle-failure reporter receives exactly one
>    correlated occurrence. … Page-hide tests assert initiation/reporting, not browser waiting.

**Test 2's own HMR half, and test 3's own "Vite HMR disposal uses the same terminal retirement
gate" clause, are this packet's own non-goal** (section 1) — handed to 050-7-e2 with the three
reproduced races as its adversarial cases (section 11). This packet closes the page-hide/
persisted-restoration half of both tests, and all of test 4 — including its own two-disposer
half: `application-bootstrap.test.tsx`'s own "a pagehide retirement failure is visible even though
another owned disposer still ran" (section 7.2) builds a real two-owned-resource DI Bag graph
through the page-hide path — `completing` resolved before `rejecting`, matching DI Bag's own
reverse-order disposal so the rejection precedes the completion this test proves — captures the
real `close()` promise `retire()` awaits, and asserts `DiBagCleanupError` specifically, that the
completing disposer actually ran, and that the console's own occurrence id matches the slot's own
fault: not only that _a_ failure reached the console, which the pre-existing single-disposer tests
already proved (review 7's own Important 2: an earlier draft resolved the two disposers in the
order that let a cleanup which stopped at the first failure still pass).

### 3.2 `lifetime-slot.ts`'s own idempotency and supersession, within a single instance

`accept()` (`lifetime-slot.ts`, current tree): `newest += 1; if (held !== null) { withdrawn = held;
held = null; publish({ status: 'retiring' }); } return newest;` — runs **synchronously** inside
`retire()`/`replace()`, before either returns a promise. **Without HMR, this packet needs exactly
one consequence of it**, proved directly against the finished code (section 6): a `pagehide`'s own
`retire()` and a queued `pageshow`'s own `replace()`, issued from this same single instance across
its own repeated lifecycle events, are still ordered and superseded exactly as any two requests are
— `TransitionSupersededError` handling in `attempt()`'s own `catch` is not dead code once HMR is
gone, because a single instance can still issue two overlapping transitions of its own (a
`pagehide` mid-flight when another `pagehide`/`pageshow` fires). **Terminal refusal before the
ordinal fence** (`refusalSoFar() !== null` checked before `ordinal !== newest` in `transition()`) is
the fact section 4.3 uses to explain why a persisted `pageshow` queued behind a failed retirement
is refused with that retirement's own fault, not with `TransitionSupersededError`.

### 3.3 Every existing caller of `bootstrapApplication` needs the one new field

`grep -rn "bootstrapApplication(" apps/wbs/fe-01/src apps/wbs/fe-01/e2e` on the unchanged tree finds
eight call sites that construct a `BootstrapDependencies` object literal by hand — across
`application-bootstrap.test.tsx` (six), `application-bootstrap.strictmode.test.tsx` (one) and
`apps/wbs/fe-01/e2e/lifetime-fault-probe.ts` (one) — plus the model test's own single call site;
every one of those nine needs `eventTarget` added once this packet makes it a required field
(section 4.4). **`apps/wbs/fe-01/src/main.tsx:11` is a tenth caller, named separately because it
supplies no object literal at all**: `void bootstrapApplication(el);`, one argument, so it runs
entirely on `PRODUCTION`'s own defaults and needs no edit here.

### 3.4 Numbers, rehearsed fresh in this response on `76f871d8` — historical, four separate commands

**These four commands are not interchangeable, and this packet states each one's own baseline
separately from here on** (review 5's own Critical 3: an earlier draft conflated them and derived
wrong deltas).

1. **Sandbox node subset, executor-available**: `(cd apps/wbs/fe-01 && bunx vitest run --config
vitest.node.config.ts --exclude playwright-config.test.ts --exclude
src/components/wbs/short-date.test.ts)` — the README's own "Frontend tests inside the sandbox"
   command, excluding the two files that spawn `bun` and fail with `spawnSync bun EPERM` inside an
   attempt. **Historical** reading, this response, on `76f871d8`: exit 0, `46 files / 674 tests`.
2. **Complete node tier, planner-only** (spawns `bun`; the two excluded files are inside it):
   `wbs-fe-01:test:unit`. **Historical** reading, this response, on `76f871d8`: exit 0, `48 files /
694 tests`.
3. **Complete jsdom-plus-zoned tier, planner-only** (same reason): `wbs-fe-01:test`. **Historical**
   reading, this response, on `76f871d8`: exit 0, `131 files / 2981 tests` (UTC config) plus `2
files / 3 tests` (zoned config), in 7m 22s (this round's own rerun: 8m 0s — both this response's
   own rehearsals, not the same run). `vitest.config.ts` includes every root-level `*.test.ts` —
   `playwright-config.test.ts` among them — so this tier's own count is **not** the sandbox subset's
   count plus a delta; it has its own baseline.
4. **Owned path, executor-available**: `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/
src/modules/preferences/)`. **Historical** reading, this response, on `76f871d8`: exit 0, `13 files
/ 99 tests`.

Also, executor-available: forced typecheck, exit 0. Strict OpenSpec block, exit 0, `114`/`114`/`0`.
`wbs-fe-01:build`, exit 0. Format check, exit 0. Planner-only: `tool-devsync:test`, `366 pass / 0
fail` — all **historical**, this response, on `76f871d8`.

**Every literal total in this section is historical, from this response's own rehearsal on
`76f871d8` — never the dispatch baseline itself (Important 2 of review 9).** This document is
authored ahead of dispatch; the actual comparison basis is whatever the tree reads at the moment
dispatch actually begins, which can differ from an authoring-time rehearsal (a merge, a sibling
packet, a dependency bump). Section 8's own final stop condition is therefore stated as a **delta**
from a baseline the **planner itself captures as its own first dispatch step**, on the actual
dispatch base, immediately before slice 1 begins — not as a fixed absolute this document predicts:

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/planner-baseline-test-unit.status"
log_file="$TMPDIR/evidence/planner-baseline-test-unit.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:test:unit --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/planner-baseline-test-whole.status"
log_file="$TMPDIR/evidence/planner-baseline-test-whole.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:test --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— run by the planner, on the actual dispatch base, before slice 1 begins; named `planner-baseline-
test-unit` and `planner-baseline-test-whole`. This response's own rehearsal of the identical
command on `76f871d8` (above, items 2–3) read `48 files / 694 tests` and `131 files / 2981 tests`
(UTC) plus `2 files / 3 tests` (zoned) — offered as what to expect, not as the gate itself.

Every later delta in section 6 and section 8 names which one of these four commands it is relative
to, and from which step onward — never a bare absolute, and never one command's own delta applied
to a different command's own count.

## 4. Design

### 4.1 Root invalidation: why restoration must mount fresh, not reuse

**The defect a real reviewer found in this packet's own first draft:** `attempt()` reused the
existing React root and rendered the same component tree into it on restoration. `App`'s own
`useEffect(() => { void fetchMe() …}, [])` is an empty-dependency mount effect, and React does not
rerun a mount effect for a tree it is only asked to render again — only a real unmount, then a real
remount, reruns it. A reused root therefore never re-fetches the signed-in identity on restoration.

**The fix.** `BootstrapDependencies['mount']` now returns a `BootstrapRoot` — `render` plus
`unmount` — and `bootstrapApplication` keeps an `invalidateRoot()` closure that calls the mounted
root's own `unmount()` (synchronously running the tree's own cleanup effects) and clears its own
`root` reference to `null`. `onPageHide` calls `invalidateRoot()` unconditionally, before starting
the retirement. The next `attempt()` (the one a persisted `pageshow` runs) calls the same
`rootFor()` every other draw uses; because `root` is `null`, it mounts a genuinely fresh one.

**Proved with a real root, not only a recording one** (section 7.2): a dedicated example test
mounts a real `App`-shaped tree through `react-dom/client`'s own `createRoot`, counts a probe
component's own mount-effect and cleanup-effect calls, and asserts that `pagehide` runs the cleanup
and a subsequent persisted `pageshow` runs the mount effect **again**, from zero.

### 4.2 Why "join the pending retirement" needs no bookkeeping at all

A working draft of this packet tracked the in-flight retirement as a value:
`let pendingRetirement: Promise<void> | null = null`. **Measured, not assumed, to be
unnecessary.** `slot.replace(acquire)` — called from a persisted `pageshow`'s handler with no
bookkeeping at all — reaches `transition()`, whose own `ahead = running; if (ahead !== null) await
ahead.catch(() => undefined);` queues it behind whatever transition (a `pagehide`'s own
`retire()`) is already running. This **is** "join the pending retirement before rebuilding" — the
slot's own serialization is the join. If that retirement's own disposal rejects or times out,
`refusalSoFar() !== null` makes the queued `replace()` throw **before** it ever calls `acquire()`,
so a rebuild queued behind a retirement that turns the slot fatal never builds anything, and
`attempt()`'s own existing `catch` reads `slot.snapshot()`, finds `fatal`, and shows the page. Both
were removed from a working draft and every test in this packet's own suite stayed green.

### 4.3 Supersession within one instance, and why no ownership mechanism is needed

Without a second instance, `TransitionSupersededError` handling in `attempt()`'s own `catch` still
has real, reachable work: a `pagehide`'s own `retire()` and a `pageshow`'s own queued `replace()`
are still two separate requests through the same slot, and the slot's own ordinal fence still
decides which one wins if they overlap. What HMR's own three-round ownership saga needed — a
generation token, because a **second bootstrap instance** could contest which one draws or reports
— has no counterpart here: there is exactly one instance, so there is exactly one thing that could
ever draw or report, and it always still owns the page it is running on. No token, no `hot`
dependency, no `hot.dispose` registration.

### 4.4 The injected event target

`BootstrapDependencies` gains one **required** field — `eventTarget: EventTarget` — rather than an
optional field defaulting to a `window` read inside `bootstrapApplication`'s own body, for the same
reason section 4.1's root does: a test drives page-lifecycle events deterministically instead of
dispatching them against the real document. `PRODUCTION` supplies the one real injection, once, at
the composition root: `eventTarget: window`.

### 4.5 What this guarantees, and what stays a limit

**Guaranteed**, and proved in section 6 and section 7 through the production `bootstrapApplication`:

- A `pagehide` retires the runtime's disposer and invalidates the mounted root every time.
- A persisted `pageshow` never rebuilds while a retirement it did not start is still settling,
  never rebuilds at all once that retirement has left the slot terminally fatal, and rebuilds into
  a genuinely fresh root — proved with a real mount effect, not only a status check — when it does
  succeed.
- A non-persisted `pageshow` never rebuilds.
- A page hidden while already fatal, and hidden again, redraws the same fault into a fresh root
  without reporting it a second time: `reportedFault` (console dedup, permanent) and `drawnFault`
  (render dedup, reset by `invalidateRoot()`) are separate for exactly this reason.

**Limits, stated rather than promised past:**

- A `pagehide` the browser never follows with a same-tab `pageshow` needs no later rejoin.
- A process the browser discards without ever delivering `pagehide` at all leaves nothing for
  `retire()` to observe.
- Root invalidation makes `App`'s own mount effects rerun; it does not itself prove that
  everything those effects reach into — session, catalog, project restoration — completes
  correctly.
- **This packet ships no Chromium spec that runs by default.** Section 4.7 records a real,
  reproduced back/forward-cache restoration under regular Chromium; running it is a deliberate
  planner action (`PLAYWRIGHT_CHROMIUM_REGULAR=1`), not part of the default gate.
- **No hot-module replacement.** Section 1 and section 11.

### 4.6 jsdom is not Chromium

Every test in section 7.2 and 7.4 runs under Vitest's jsdom environment, which never launches a
browser at all — `pageshow`/`pagehide` there are plain `Event` objects this file's own tests
construct and dispatch by hand (`pageShowEvent`/`pageHideEvent`), not real browser-delivered
back/forward-cache events. Section 4.7's own Chromium probe is the only place in this packet where
a real Chromium build ever runs; the two are complementary evidence, not substitutes for each
other, and a passing jsdom suite says nothing by itself about which Chromium build (or whether any
build at all) actually restores a page from its cache.

### 4.7 The Chromium probe, three rounds, and the bounded application case

**Round 1** (this packet's own first draft): a standalone Playwright script served two static
pages and recorded every `pagehide`/`pageshow`. `pageshow.persisted` stayed `false`. Review found
this insufficient: Playwright's own default Chromium launch disables the cache.

**Round 2**: the same probe with `ignoreDefaultArgs: ['--disable-back-forward-cache']` — still
`false` in both launches. A raw CDP session (`page.context().newCDPSession(page)`, the `Page`
domain, `Page.backForwardCacheNotUsed`) named the cause: `BackForwardCacheDisabledForDelegate`.
Review found this named the wrong scope: that reason names Chromium's own **headless-shell**
automation delegate specifically (`node_modules/playwright-core/lib/coreBundle.js:43370` selects
`chromium-headless-shell` for an ordinary headless launch, but the regular, non-headless-shell
build when `channel: 'chromium'` is supplied) — neither round above had passed that channel.

**Round 3**: the same served-pages probe, `channel: 'chromium'` plus `ignoreDefaultArgs:
['--disable-back-forward-cache']`, the same CDP session, reproduced three times:

```
events: ["A-pageshow-false","A-pagehide-true","A-pageshow-true"]
backForwardCacheNotUsed events: 0
```

`A-pageshow-true` is a real bfcache restoration, with **zero** `Page.backForwardCacheNotUsed`
events. Executable: Chrome for Testing, Playwright `chromium` channel build v1243 (basename `chrome`
under this host's own Playwright cache — the path itself stays in private evidence, not in this
packet, per Important 3); Playwright `1.63.0`.

**The bounded application case.** `apps/wbs/fe-01/e2e/lifetime-bfcache-probe.ts` (section 7.6)
drives the real production `bootstrapApplication` — the real `acquireApplicationRuntime` paired
with the real `applicationSlot` singleton (not a fresh slot: review 4's own Critical 4, see below),
against a routed two-page origin, counting how many times `acquire` actually ran and checking a
real write-then-read round trip through `remembered.ganttDetail` every time the slot reaches
`live`. `e2e/lifetime-bfcache.spec.ts` (section 7.7) navigates away and back with `page.goBack()`,
and asserts: the restored page's own `pageshow` carried `persisted: true`, the application runtime
was acquired a **second** time, and both the first publication and the restoration left it usable —
not only counted.

**The real defect review 4 found, and its fix.** The first draft of this probe paired
`acquireApplicationRuntime()` with a freshly created `LifetimeSlot`, reasoning that a fresh slot
kept the probe isolated. `acquireApplicationRuntime`'s own `isLive` is wired to the singleton
`applicationSlot` specifically (`application-runtime.ts`), not to whatever slot it is passed to —
so that pairing published services whose own `isLive()` read the singleton (`empty`) while the
probe's own fresh slot read `live`. Reproduced directly, isolated from every other test's own use
of the same singleton (`bunx vitest run -t "bad pairing"`, one Vitest file, one test):

```
probe slot live production slot empty
probe service write threw: Error: the page withdrew this preference store before the access completed
```

— the exact reproduction review 4 itself supplied. The fix pairs `acquireApplicationRuntime` with
`applicationSlot` itself; the same rehearsal, filtered to `-t "good pairing"`, writes and reads back
`true` with no throw. The probe's own `usableAtLive()` check (section 7.6) is what makes this
mismatch visible from the browser spec itself, not only from an isolated Vitest rehearsal: pairing
the wrong slot again would make `pageshowPersisted()`/`builds()` both still read correctly while
`usableAtLive()` read `[false, false]` instead of `[true, true]`.

**Why this stays gated, not part of the default gate.** CI already installs regular Chromium:
`.github/workflows/ci.yml`'s own `bunx playwright install --with-deps chromium` installs both
regular Chromium and `chromium-headless-shell` for that one argument (Playwright's own
`browsers.json` marks both `installByDefault`) — review 4's own correction of this packet's earlier
claim that only headless-shell was installed. `chromium-regular` stays opt-in as a **verification-
policy choice**, not an availability constraint: wiring a second browser channel into every ordinary
`bunx playwright test` run — CI's included — would run this one narrow bfcache regression on every
invocation of every other spec too, a scope decision this bounded packet does not make
unilaterally. `playwright.config.ts`'s own `chromium-regular` project (section 7.8) exists in
`projects` **only** when `PLAYWRIGHT_CHROMIUM_REGULAR=1` is set; the default `chromium` project's
own `testIgnore` excludes `lifetime-bfcache.spec.ts` either way. Both halves of that gate are now
asserted directly, with a watched negative, in `playwright-config.test.ts` (section 6, section 7.9).

**Task 5's own browser-verification obligation is discharged as verified, this response, not left
pending.** `apps/wbs/fe-01/project.json`'s own `e2e` target runs `bun run tools/dev/setup.ts`
before Playwright — that script copies each app's own `.env.example` to `.env` wherever one is
missing (`tools/dev/setup.ts`'s own `seedApp`), which is exactly the provisioning step this
packet's own third round assumed was out of reach. It is not: it is the target's own first command.

**Executable port selection — one bounded, authoritative procedure (Important 1 of review 7),
identical in this section and in section 6's own slice-3 planner block, checked free for all three
resulting ports before the run** (a multiple of 300 clears the collision checks
`playwright-config.test.ts` already asserts on). `ss` is checked separately from its output, that
output is inspected with Bash's own `[[ … =~ … ]]` — no pipeline, no `grep -q`, nothing that can
close a read end early — and the search is bounded, refusing rather than guessing once exhausted:

```bash
set -euo pipefail
shift=300
found=""
while [ "$shift" -le 3000 ]; do
  if ports_output=$(ss -ltn 2>&1); then status=0; else status=$?; fi
  if [ "$status" -ne 0 ]; then
    echo "ss failed to inspect listening ports (exit $status); refusing to guess port availability" >&2
    exit 1
  fi
  a=":$((3100 + shift)) "
  b=":$((3200 + shift)) "
  c=":$((4200 + shift)) "
  if [[ "$ports_output" =~ $a ]] || [[ "$ports_output" =~ $b ]] || [[ "$ports_output" =~ $c ]]; then
    shift=$((shift + 300))
    continue
  fi
  found="$shift"
  break
done
if [ -z "$found" ]; then
  echo "no free port shift found up to 3000" >&2
  exit 1
fi
echo "using E2E_PORT_SHIFT=$found"
bunx playwright install chromium
status_file="$TMPDIR/evidence/chromium-bfcache.status"
log_file="$TMPDIR/evidence/chromium-bfcache.log"
if CI=1 NX_DAEMON=false PLAYWRIGHT_CHROMIUM_REGULAR=1 E2E_PORT_SHIFT=$found \
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx nx run wbs-fe-01:e2e -- --project=chromium-regular e2e/lifetime-bfcache.spec.ts \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

**The old loop (`while ss -ltn | grep -qE ...`) and its first fix (`if ! printf '%s\n'
"$ports_output" | grep -qE ...`) both failed open.** The original: injecting `ss() { return 2; }`
still printed `accepted shift=300 despite ss exit 2` and exited 0 — `set -euo pipefail` does not
abort a failing `while` **condition**, and `grep -q` inside a pipeline can close its own read end
before the upstream command's status is what determines anything. The first fix still piped
through `grep -qE`, with the same shape of failure. Rehearsed against the procedure above, four
cases, this response:

1. **Ports free** (real `ss`, this host): `using E2E_PORT_SHIFT=300`, exit 0.
2. **Ports occupied at shift 300, free after** (a fake `ss` reporting one busy port every call):
   `using E2E_PORT_SHIFT=600`, exit 0 — the loop actually advances past the occupied candidate.
3. **`ss` missing or failing** (`ss() { return 127; }` and, separately, `return 2`): `ss failed to
inspect listening ports (exit 127); refusing to guess port availability`, exit 1 — **stops
   before any Nx invocation**, unlike either old loop.
4. **A large listening-port table (5000 synthetic lines) with one occupied candidate near the
   end**: `using E2E_PORT_SHIFT=600`, exit 0 in `0.07s` — the bounded `=~` match finds the
   occupied port and rejects shift 300 without a pipeline, regardless of how large the table is.
5. **Exhaustion** (every candidate port reported busy up to shift 3000): `no free port shift found
up to 3000`, exit 1.

— run from the repository root; `CI=1` makes `playwright.config.ts` refuse to reuse an existing
server and start its own three fresh ones. **Run for real, this response**, `shift=300` (all three
ports free): exit 0,

```
✓  1 [chromium-regular] › apps/wbs/fe-01/e2e/lifetime-bfcache.spec.ts:36:1 › a persisted pageshow
   rebuilds the application runtime after a real back/forward-cache restoration (2.2s)
  1 passed (8.8s)
```

— the standalone two-page experiment (round 3) established that regular Chromium under this exact
launch configuration restores from bfcache at all; this run is what establishes that this packet's
own production `bootstrapApplication`, driven through the real Nx target with its own three real
servers, does the same. Both typecheck and lint over these files are exit 0 (section 6).

## 5. File plan

No literal count is stated here — section 6's own "ready to commit" step in each slice lists its
own exact paths, which is the inventory that cannot drift out of step with what a slice actually
touches.

| File                                                                   | Change                                                                                                                                                                                                                                                                                                   | Owning slice |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.tsx`                 | Modify **twice**: slice 1 owns the whole of this packet's own production code (section 7.1); slice 2 owns four comment-only `Proof:` lines only, earned by temporarily mutating this already-committed file to rehearse mutation rows 5, 13, 14 and 15 (no behaviour change, diff in section 6 slice 2). | 1, then 2    |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx`            | Modify — the new `eventTarget`/`unmount` fields on every existing call site and fixture, plus the new `describe('the page-lifecycle retirement trigger', …)` block (section 7.2).                                                                                                                        | 1            |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.strictmode.test.tsx` | Modify — the new field on its one call site (section 7.5).                                                                                                                                                                                                                                               | 1            |
| `apps/wbs/fe-01/e2e/lifetime-fault-probe.ts`                           | Modify — the new field on its one call site (section 7.3).                                                                                                                                                                                                                                               | 1            |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx`      | Modify **twice**: slice 1 owns only its own `eventTarget`/`unmount` compatibility fields on its one call site; slice 2 owns the new command vocabulary (`pagehide`, `pageshow`), generated disposal outcomes and the fifth invariant (section 7.4 has both diffs).                                       | 1, then 2    |
| `apps/wbs/fe-01/e2e/lifetime-bfcache-probe.ts`                         | New — the bounded Chromium application probe (section 7.6).                                                                                                                                                                                                                                              | 3            |
| `apps/wbs/fe-01/e2e/lifetime-bfcache.spec.ts`                          | New — its own spec, gated to the `chromium-regular` project (section 7.7).                                                                                                                                                                                                                               | 3            |
| `apps/wbs/fe-01/playwright.config.ts`                                  | Modify — the gated `chromium-regular` project and the default project's own `testIgnore` (section 7.8).                                                                                                                                                                                                  | 3            |
| `apps/wbs/fe-01/playwright-config.test.ts`                             | Modify — assertions and watched negatives for the `chromium-regular` gate (section 7.9). **Executor runs only its own new describe block** (section 6, slice 3, Critical 2).                                                                                                                             | 3            |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                   | Modify — task 5's own note, split between what this packet closes and what 050-7-e2 still owes (section 9).                                                                                                                                                                                              | 3            |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                  | Modify **three times** — once per slice, each appending only that slice's own section (section 9).                                                                                                                                                                                                       | 1, 2, 3      |

No file this packet touches is shared with any other in-flight 050.7 packet.

## 6. Three slices — production and example tests, the model test, then browser files and hand-over

Fifteen mutation/restore/typecheck cycles plus new browser files exceed one size-S attempt; this
packet is bounded into three slices. Every command states whether the **executor** runs it or it
is **planner-only**, and from which step it applies. Every slow or fallible command is wrapped so
its own exit status is captured. Each slice captures its own starting status, runs its own
baselines, and appends its own `verify.md` section as one of its own owned paths.

### Slice 1 — production wiring, example tests, and every caller's own compatibility fix

**Prerequisite:** none.

**Owned paths:** `application-bootstrap.tsx`, `application-bootstrap.test.tsx`,
`application-bootstrap.strictmode.test.tsx`, `e2e/lifetime-fault-probe.ts`,
`application-bootstrap.model.test.tsx` (**compatibility fields only** — its own `eventTarget` and
`unmount` no-op on its one call site, not the generated command vocabulary, which is slice 2's own
scope), `openspec/changes/adopt-frontend-lifetimes/verify.md` (this slice's own section).

**Step 1, start — executor, pre-edit baselines (Important 3 of review 7: every baseline a later
stop condition compares against, collected fresh and named, not assumed from history).**

```bash
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
git status --short --untracked-files=all > "$TMPDIR/evidence/slice1-start-status.txt"
status_file="$TMPDIR/evidence/baseline-owned.status"
log_file="$TMPDIR/evidence/baseline-owned.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/ src/modules/preferences/) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice1-baseline-sandbox.status"
log_file="$TMPDIR/evidence/slice1-baseline-sandbox.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude \
  src/components/wbs/short-date.test.ts) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
report=$(mktemp "$TMPDIR/evidence/openspec-slice1-start.XXXXXX.json")
status_file="$TMPDIR/evidence/slice1-openspec-start.status"
if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report" \
  > /dev/null; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

— rehearsed this response, on the unchanged `76f871d8` tree: owned path exit 0, `13 files / 99
tests` (section 3.4's own owned-path baseline). Sandbox subset exit 0, `46 files / 674 tests`
(section 3.4's own sandbox baseline — this is the same command section 8's own sandbox stop
condition checks "at any point before slice 3's own step 3b", now confirmed at this slice's own
starting point rather than assumed unchanged from section 3.4). Strict OpenSpec exit 0, `114`/
`114`/`0`, predicate holds — the same figure section 8's own OpenSpec stop condition names as
"section 3.4's own pre-implementation baseline".

**Step 1a — red, executor, every test edit first, on the unchanged production tree.** Add the new
`eventTarget`/`unmount` fields to every call site in `application-bootstrap.test.tsx`,
`application-bootstrap.strictmode.test.tsx`, `e2e/lifetime-fault-probe.ts` **and**
`application-bootstrap.model.test.tsx` (its own one call site — the compatibility fields only, per
this slice's own owned paths above); add the new `describe('the page-lifecycle retirement
trigger', …)` block to `application-bootstrap.test.tsx` (section 7.2).

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice1-red.status"
log_file="$TMPDIR/evidence/slice1-red.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
```

— rehearsed fresh this response, against this exact test-file addition on the **unchanged**
`application-bootstrap.tsx`: **11 failed | 6 passed (17)**. The unchanged implementation never
reads `eventTarget` at all — every failure is missing retirement/unmount behaviour, not a missing
dependency field. First failure: `retires the runtime and invalidates the root when pagehide fires
(persisted=true, a flag this trigger never reads)` — `AssertionError: expected 'live' to be
'empty'`, because nothing in the unchanged code ever listens for `pagehide` at all.

**Step 1b — implement, executor.** Apply the `application-bootstrap.tsx` production diff (section
7.1).

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice1-green.status"
log_file="$TMPDIR/evidence/slice1-green.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/application-bootstrap.test.tsx src/runtime/application-bootstrap.model.test.tsx \
  src/runtime/application-bootstrap.strictmode.test.tsx src/main.test.tsx --reporter=verbose) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice1-tsc.status"
log_file="$TMPDIR/evidence/slice1-tsc.log"
if (cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice1-lint.status"
log_file="$TMPDIR/evidence/slice1-lint.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:lint --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice1-owned.status"
log_file="$TMPDIR/evidence/slice1-owned.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/ src/modules/preferences/) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice1-sandbox-confirm.status"
log_file="$TMPDIR/evidence/slice1-sandbox-confirm.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude \
  src/components/wbs/short-date.test.ts) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— **this exact intermediate tree, rehearsed fresh**: tsc exit 0 (Critical 1's own demand — this is
the actual checkpoint, not the final listing). `bunx vitest run application-bootstrap.test.tsx
application-bootstrap.model.test.tsx application-bootstrap.strictmode.test.tsx main.test.tsx
--reporter=verbose`: **20/20** (17 in `application-bootstrap.test.tsx`, the model test unchanged in
substance at this point, the strict-mode test, `main.test.tsx`). Lint exit 0. Owned path: `13 files
/ 110 tests` (**eleven** more than step 1's own `99`-test baseline — this is this slice's own final
owned-path figure, used from here on). Sandbox subset (Important 2 of review 9, a post-edit
confirmation against this same slice's own start figure): exit 0, `46 files / 674 tests` — unchanged
from step 1's own start baseline, confirming this slice's own production and test edits land
entirely outside the sandbox subset's own file set.

**The authoritative mutation inventory for this slice.** Every mutation is a complete, executable
edit against the finished tree, rehearsed alone and restored before the next (`git diff` empty
after each restore), each confirmed type-correct (`tsc --build --force`, exit 0 every time). No
fence-widening mutation is included: the disproved "widen the post-`replace` fence to admit
`fatal`" claim from an earlier round found nothing at 3000 runs and is not repeated. Every command
below runs from the repository root with an explicit subshell `cd`.

| #   | Fault                                                            | Exact edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Command                                                                                                                                              | Named failing assertion / observed result                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `onPageHide` drops `invalidateRoot()`                            | Remove the `invalidateRoot();` call, keep `startRetirement();`                                                                                                                                                                                                                                                                                                                                                                                                                                              | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose)`                                               | **6 failed \| 11 passed (17)** — `retires the runtime and invalidates the root when pagehide fires (persisted=true, …)`: `pagehide did not invalidate the mounted root: expected +0 to be 1`                                                                                                                          |
| 2   | `onPageHide` drops `startRetirement()`                           | Remove the `startRetirement();` call, keep `invalidateRoot();`                                                                                                                                                                                                                                                                                                                                                                                                                                              | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose)`                                               | **9 failed \| 8 passed (17)** — same case: `expected 'live' to be 'empty'` (the slot never retires at all)                                                                                                                                                                                                            |
| 3   | `isPersistedPageShow`'s final line widened                       | `return flagged.persisted === true;` → `return flagged.persisted === true \|\| true;`                                                                                                                                                                                                                                                                                                                                                                                                                       | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose)`                                               | **1 failed \| 16 passed (17)** — `a non-persisted pageshow does not rebuild`                                                                                                                                                                                                                                          |
| 4   | `TransitionSupersededError` branch dropped                       | `if (refusal instanceof TransitionSupersededError) return;` → `if (false) return;`                                                                                                                                                                                                                                                                                                                                                                                                                          | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose)`                                               | **1 failed \| 16 passed (17)** — `draws nothing at all when a newer request wins the slot`: `Error: the page's runtime was refused and the slot is empty`, caused by `TransitionSupersededError: lifetime transition 1 was superseded by 2`                                                                           |
| 6   | Slot subscription dropped                                        | Remove the whole `dependencies.slot.subscribe(...)` block                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose)`                                               | **1 failed \| 16 passed (17)** — `shows the fatal page when a retirement fails, without republishing anything`                                                                                                                                                                                                        |
| 7   | `reportedFault` dedup dropped                                    | `if (reportedFault !== fault) { reportedFault = fault; console.error(...); }` → unconditional `reportedFault = fault; console.error(...);`                                                                                                                                                                                                                                                                                                                                                                  | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose)`                                               | **4 failed \| 13 passed (17)** — `says nothing raw about a refused start, on the page or in the console`: `expected [ [ …(4) ], [ …(4) ] ] to have a length of 1 but got 2`                                                                                                                                           |
| 8   | `drawnFault` render dedup dropped                                | Remove `if (drawnFault === fault) return;`, keep the assignment                                                                                                                                                                                                                                                                                                                                                                                                                                             | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose)`                                               | **3 failed \| 14 passed (17)** — `renders the sanitized fatal page when the first runtime cannot be built`: `expected [ { …(10) }, { …(10) } ] to have a length of 1 but got 2`                                                                                                                                       |
| 9   | `invalidateRoot`'s own `drawnFault = null;` dropped              | Remove that one line, keep `root.unmount(); root = null;`                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose)`                                               | **1 failed \| 16 passed (17)** — `hiding and restoring an already-fatal page…`: `expected […] to have a length of 3 but got 2`                                                                                                                                                                                        |
| 10  | `reportedFault`/`drawnFault` collapsed into one `shown` variable | Complete replacement, in `showFatal` and `invalidateRoot` (exact code below)                                                                                                                                                                                                                                                                                                                                                                                                                                | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose)`                                               | **1 failed \| 16 passed (17)** — same case, the other way: `restoring the fatal page reported it again: expected 2 to be 1`                                                                                                                                                                                           |
| 11  | `root ??=` widened to an unconditional assignment                | `root ??= dependencies.mount(...)` → `root = dependencies.mount(...)`                                                                                                                                                                                                                                                                                                                                                                                                                                       | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose)`                                               | **1 failed \| 16 passed (17)** — `shows the fatal page when a retirement fails, without republishing anything`: `expected [ 'live', 'fatal' ] to deeply equal [ 'live' ]`                                                                                                                                             |
| 12  | Root created eagerly                                             | `let root: BootstrapRoot \| null = null;` → `= dependencies.mount(host, ROOT_FAULT_OPTIONS);`                                                                                                                                                                                                                                                                                                                                                                                                               | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose)`                                               | **7 failed \| 10 passed (17)** — `renders the app only once its runtime is live, with the root fault options`: `expected [ 'empty' ] to deeply equal [ 'live' ]`                                                                                                                                                      |
| —   | Unexpected retirement refusal is not silently swallowed          | See "The retained unexpected-refusal proof" below — its own committed test, not a scratch file                                                                                                                                                                                                                                                                                                                                                                                                              | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose -t "not silently swallowed")`                   | **1 failed \| 0 passed (1)** when the rethrow is swallowed: `expected […] to have a length of 1 but got 0`                                                                                                                                                                                                            |
| —   | Cleanup that stops after the first rejecting disposer            | In "a pagehide retirement failure is visible…", replace `close` with the exact code below — captures `closeOutcome.current` (review 9's own Important 1: a direct-return replacement without the capture reaches `setup: close() was never called` before either assertion), rejects with the correct `DiBagCleanupError` type (review 8's own Important 1: an error-type mutation must not mask the continued-cleanup assertion), and never calls `bag.close()`, so `completing`'s own disposer never runs | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx --reporter=verbose -t "a pagehide retirement failure is visible")` | **1 failed \| 0 passed (1)**, rehearsed fresh this response: `the other owned disposer never ran: expected false to be true` at the `otherDisposerRan` assertion — the earlier `DiBagCleanupError` assertion now passes, since the rejection keeps the right type — restored, then confirmed green again (`1 passed`) |

**The cleanup-suppression mutation's own exact replacement code** (review 9's own Important 1),
replacing the whole `close` property inside "a pagehide retirement failure is visible…"'s own
`acquire`:

```ts
close: () => {
  const outcome = Promise.reject(new DiBagCleanupError([]));
  closeOutcome.current = outcome;
  return outcome;
},
```

**Row 10's own complete replacement code**, in `application-bootstrap.tsx` (both edits applied
together, then restored):

```diff
-  let drawnFault: DisclosedFault | null = null;
+  let shown: DisclosedFault | null = null;
@@ inside invalidateRoot():
     root.unmount();
     root = null;
-    drawnFault = null;
+    shown = null;
@@ inside showFatal(fault):
-    if (reportedFault !== fault) {
-      reportedFault = fault;
-      console.error("the page's runtime failed", fault.sentence, fault.occurrenceId, fault.lost);
-    }
-    if (drawnFault === fault) return;
-    drawnFault = fault;
+    if (shown === fault) return;
+    shown = fault;
+    console.error("the page's runtime failed", fault.sentence, fault.occurrenceId, fault.lost);
```

**The retained unexpected-refusal proof, permanently in `application-bootstrap.test.tsx` (section
7.2), not a deleted scratch file.** `startRetirement()`'s own `.catch(...)` now rethrows a
retirement refusal that leaves the slot anywhere but `fatal` — a shape the real slot's own contract
never produces (`retire()` only ever rejects into a terminal `fatal` state; its own ordinal fence
sits after the `'retire'` branch's own early return, so `TransitionSupersededError` can never reach
it either). The retained test, `'a retirement refusal that leaves the slot anywhere but fatal is
not silently swallowed'`, builds a fake `LifetimeSlot` whose `retire()` rejects while its own
`snapshot()` still reads `live`, registers `process.on('unhandledRejection', …)` **inside the test
itself** (removed in its own `finally`, so nothing leaks to another test), dispatches `pagehide`,
and asserts the rethrown error and its own `cause` are the one thing observed. `window`'s own
`unhandledrejection` event does not see this rejection at all in this environment (it is thrown
from inside a `.catch()` running on Node's own microtask queue, not anything jsdom's event loop
reaches) — reproduced directly, which is why the test uses `process`, not `window`. Swallowing the
rethrow (reverting to the pre-round-4 bare `.catch(() => { … })`) makes this exact test fail:
`expected […] to have a length of 1 but got 0`, restored and confirmed green again afterward.

**The cleanup-suppression proof (review 7, Important 2; error type corrected, review 8, Important
1; promise capture restored, review 9, Important 1), rehearsed fresh this response.** The
two-disposer test's own strength depends on `completing` being resolved _before_ `rejecting`
(reverse-order disposal runs `rejecting` first), on capturing the actual `close()` promise
`retire()` awaits, on asserting `DiBagCleanupError` specifically, and on the mutation actually
exercising the **continued-cleanup** assertion (`otherDisposerRan`) rather than being caught earlier
by the error-type assertion or by setup itself — one mutation must not hide another check. An
earlier version of this mutant rejected with a plain `Error`, which failed at the
`toBeInstanceOf(DiBagCleanupError)` assertion before `otherDisposerRan` was ever reached, while its
own adjacent comment wrongly claimed the latter had failed — review 8 caught the mismatch. The next
version fixed the error type but was described only as "returns `Promise.reject(new
DiBagCleanupError([]))` directly", dropping the `closeOutcome.current` capture the test's own setup
check depends on — review 9 caught that a literal reading of that description reaches `setup:
close() was never called` before either assertion. Fixed: the exact replacement above captures
`closeOutcome.current`, rejects with `DiBagCleanupError` (so the first assertion passes), and never
calls `bag.close()` (so `completing`'s own disposer never runs), failing the test at the **second**
assertion: `the other owned disposer never ran: expected false to be true`. Restored, `git diff`
empty for this file, and the test confirmed green again (`1 passed`).

**Verify, executor: OpenSpec and build first, then append `verify.md`, then format last** (so
the format check also covers the file this slice itself just wrote):

```bash
set -euo pipefail
report=$(mktemp "$TMPDIR/evidence/openspec-validation.XXXXXX.json")
status_file="$TMPDIR/evidence/slice1-openspec.status"
if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report" \
  > /dev/null; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
status_file="$TMPDIR/evidence/slice1-build.status"
log_file="$TMPDIR/evidence/slice1-build.log"
if NX_DAEMON=false bunx nx run wbs-fe-01:build > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— rehearsed: OpenSpec `114`/`114`/`0`, predicate holds. Build exit 0.

Append this slice's own `verify.md` section (referencing the SHAs and counts above), **then**:

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice1-format.status"
log_file="$TMPDIR/evidence/slice1-format.log"
if NX_DAEMON=false bunx nx format:check --all > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— rehearsed: exit 0, over the model test's own compatibility edit and this slice's own already-
appended `verify.md` section.

**Ready to commit:** `apps/wbs/fe-01/src/runtime/application-bootstrap.tsx`,
`apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx`,
`apps/wbs/fe-01/src/runtime/application-bootstrap.strictmode.test.tsx`,
`apps/wbs/fe-01/e2e/lifetime-fault-probe.ts`,
`apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx` (compatibility fields only),
`openspec/changes/adopt-frontend-lifetimes/verify.md`.

```bash
set -euo pipefail
git status --short --untracked-files=all > "$TMPDIR/evidence/slice1-end-status.txt"
# every line must be one of the six paths above, already present in
# slice1-start-status.txt, or this packet's own plan document.
```

Subject: `feat(wbs-fe-01): retire and rebuild the page's runtime on pagehide and pageshow, without HMR`.

### Slice 2 — the model test's own generated commands and coverage

**Prerequisite:** slice 1, committed.

**Owned paths:** `application-bootstrap.model.test.tsx` (its own feature expansion, on top of
slice 1's already-compatible version — this slice **changes** that owned-path file without adding
another test **case**: the file stays one `it()` regardless of its own internal generated-command
vocabulary); `application-bootstrap.tsx`, **for proof comments only** (Important 4 of review 7):
mutations 5, 13, 14 and 15 below inject faults into this already-committed production file to
prove this slice's own new coverage actually catches them, so this slice is explicitly authorized
to mutate it temporarily — every mutation restored byte-for-byte (`git diff` empty) before the
next — and to commit the four small, permanent `Proof:` comments those rehearsals earn, adjacent
to the exact lines each mutation touches (the diff below is comment-only: no behaviour changes);
`openspec/changes/adopt-frontend-lifetimes/verify.md` (this slice's own section).

**Step 2, start — executor, pre-edit baselines.**

```bash
set -euo pipefail
git status --short --untracked-files=all > "$TMPDIR/evidence/slice2-start-status.txt"
status_file="$TMPDIR/evidence/slice2-baseline-owned.status"
log_file="$TMPDIR/evidence/slice2-baseline-owned.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/ src/modules/preferences/) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice2-baseline-sandbox.status"
log_file="$TMPDIR/evidence/slice2-baseline-sandbox.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude \
  src/components/wbs/short-date.test.ts) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
report=$(mktemp "$TMPDIR/evidence/openspec-slice2-start.XXXXXX.json")
status_file="$TMPDIR/evidence/slice2-openspec-start.status"
if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report" \
  > /dev/null; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

— rehearsed this response, on slice 1's own finished tree: owned path exit 0, `13 files / 110
tests` — slice 1's own owned-path count, unchanged by this slice's own edit (below), which is
exactly the point this baseline exists to show. Sandbox subset exit 0, `46 files / 674 tests` —
unchanged from slice 1's own starting figure, this slice touching nothing the sandbox subset
covers. Strict OpenSpec exit 0, `114`/`114`/`0`, predicate holds — unchanged from slice 1's own
starting figure.

**Regenerated against slice 1's own committed tree, not the original baseline** (Critical 1):
rewrite `application-bootstrap.model.test.tsx`'s command vocabulary in one pass, on top of slice
1's own compatibility fields — `unmount` stays as unchanged context, and slice 1's own
`eventTarget: new EventTarget()` becomes the named local `eventTarget,` this slice's own diff
introduces (section 7.4 has both diffs, applied one after the other, not each against the original
baseline): `pagehide` and `pageshow` (with a generated `persisted` flag) commands; a generated
`disposal: 'settles' | 'rejects' | 'never'` on `bootstrap` and `replace`; a fifth invariant ("a
runtime live before a pagehide trigger was still the one live at the end"); and four coverage
counters, each asserted `> 0` across the whole 300-run pinned property.

**Rehearsed sequentially, this response**: `diff -u` slice 1's own model-test diff against
`76f871d8`, `patch`-applied it to a scratch copy of the baseline, confirmed the byte-identical
result to slice 1's own committed tree; `diff -u` this slice's own diff **against that same
scratch copy**, `patch`-applied it on top, confirmed the byte-identical result to this slice's own
finished tree. `tsc --build --force` over the intermediate (post-slice-1, pre-slice-2) tree: exit
0 (already recorded in slice 1's own step 1b; this slice changes nothing that check depends on
until its own diff lands).

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice2-run.status"
log_file="$TMPDIR/evidence/slice2-run.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/application-bootstrap.model.test.tsx --reporter=verbose) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice2-tsc.status"
log_file="$TMPDIR/evidence/slice2-tsc.log"
if (cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice2-lint.status"
log_file="$TMPDIR/evidence/slice2-lint.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:lint --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice2-owned.status"
log_file="$TMPDIR/evidence/slice2-owned.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/ src/modules/preferences/) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice2-sandbox-confirm.status"
log_file="$TMPDIR/evidence/slice2-sandbox-confirm.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude \
  src/components/wbs/short-date.test.ts) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— rehearsed: exit 0, 300 runs, seed `20260924`, all four coverage assertions passed. tsc exit 0,
lint exit 0. Owned path unchanged at `13 files / 110 tests` — matching this slice's own start
baseline above exactly. Sandbox subset (Important 2 of review 9, a post-edit confirmation against
this same slice's own start figure): exit 0, `46 files / 674 tests` — unchanged from step 2's own
start baseline, confirming the model test's own generated-command expansion and the four
comment-only production lines land entirely outside the sandbox subset's own file set.

**Four more mutations, rehearsed the same way, each restored before the next — these four, and
only these four, need this slice's own extended model, which is why they are not in slice 1's own
table:**

| #   | Fault                                 | Exact edit                                                                           | Command                                                                                                      | Observed                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | Post-`replace` status fence dropped   | `if (dependencies.slot.snapshot().status !== 'live') return;` → `if (false) return;` | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.model.test.tsx --reporter=verbose)` | Property failed after 5 tests, seed `20260924`, shrunk 4 times: `[{"kind":"bootstrap","disposal":"settles"},{"kind":"retireFromListener"},{"kind":"pageshow","persisted":false}]` — `the app was drawn while the slot was retiring`                                                           |
| 13  | `pagehide` listener never registered  | Remove the `addEventListener('pagehide', onPageHide)` call                           | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.model.test.tsx --reporter=verbose)` | Property failed after 175 tests, seed `20260924`, shrunk 0 times: `[{"kind":"bootstrap","disposal":"settles"},{"kind":"settle"},{"kind":"pagehide"}]` — invariant 5                                                                                                                           |
| 14  | `pageshow` bypasses the slot          | Complete replacement of `onPageShow`'s own body (exact code below)                   | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.model.test.tsx --reporter=verbose)` | Property failed after 3 tests, seed `20260924`, shrunk 6 times: `[{"kind":"bootstrap","disposal":"settles"},{"kind":"pageshow","persisted":true},{"kind":"retire"},{"kind":"bootstrap","disposal":"settles"}]` — `the app was drawn while the slot was empty`                                 |
| 15  | The catch branch also renders the app | Complete replacement of `attempt()`'s own `catch` (exact code below)                 | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.model.test.tsx --reporter=verbose)` | Property failed after 87 tests, seed `20260924`, shrunk 4 times: `[{"kind":"bootstrap","disposal":"never"},{"kind":"settle"},{"kind":"bootstrap","disposal":"settles"},{"kind":"replace","disposal":"settles"},{"kind":"retireFromListener"}]` — `the app was drawn while the slot was fatal` |

**Row 14's own complete replacement code**, replacing the whole `onPageShow` function body:

```diff
   const onPageShow = (event: Event): void => {
     if (!isPersistedPageShow(event)) return;
-    void attempt();
+    dependencies.acquire();
+    const Tree = dependencies.app;
+    rootFor().render(
+      <StrictMode>
+        <ApplicationServicesProvider slot={dependencies.slot}>
+          <Tree />
+        </ApplicationServicesProvider>
+      </StrictMode>,
+    );
   };
```

**Row 15's own complete replacement code**, inside `attempt()`'s own `catch` block. `Tree` here is
declared **inside the catch block's own scope**, not the `const Tree = dependencies.app;` that
already exists later in the function after the live-state fence — the two do not conflict, because
a `catch (refusal) { … }` block is its own lexical scope. Confirmed by the `tsc --build --force`
exit 0 recorded above:

```diff
       showFatal(refused.fault);
+      const Tree = dependencies.app;
+      rootFor().render(
+        <StrictMode>
+          <ApplicationServicesProvider slot={dependencies.slot}>
+            <Tree />
+          </ApplicationServicesProvider>
+        </StrictMode>,
+      );
       return;
     }
```

**`application-bootstrap.tsx`'s own comment-only diff (Important 4 of review 7), applied on top
of slice 1's finished tree — four `Proof:` comments, one adjacent to each of rows 5, 13, 14 and
15's own exact lines, no behaviour change:**

```diff
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
@@ -234,6 +234,10 @@
         });
       }
       showFatal(refused.fault);
+      // Proof: on 2026-09-23, also rendering the app tree here (Tree declared
+      // in this block's own scope) failed the extended generated-command
+      // property (slice 2) after 87 tests, seed 20260924, shrunk 4 times:
+      // "the app was drawn while the slot was fatal".
       return;
     }
     // The fence after the await: a retirement — including one a subscriber asked for
@@ -252,6 +256,11 @@
     // the test that can then break it.
     // Proof: on 2026-09-22, removing this fence let the model draw the app while
     // the slot was `retiring` (1 failed, 11 passed).
+    // Proof: on 2026-09-23, against this file's own extended generated-command
+    // property (slice 2), the same removal ("if (false) return;") failed
+    // "only ever draws the page from the runtime the slot publishes" after 5
+    // tests, seed 20260924, shrunk 4 times: "the app was drawn while the slot
+    // was retiring".
     if (dependencies.slot.snapshot().status !== 'live') return;
     const Tree = dependencies.app;
     rootFor().render(
@@ -325,11 +334,20 @@
    * `replace` (and never calls `acquire`) through the same terminal check
    * every other request meets, before {@link attempt}'s own `catch` shows the
    * fault this module already subscribed to.
+   * Proof: on 2026-09-23, replacing this body with a direct `acquire()` and
+   * render — bypassing `attempt()` and the slot entirely — failed the
+   * extended generated-command property (slice 2) after 3 tests, seed
+   * 20260924, shrunk 6 times: "the app was drawn while the slot was empty".
    */
   const onPageShow = (event: Event): void => {
     if (!isPersistedPageShow(event)) return;
     void attempt();
   };
+  // Proof: on 2026-09-23, removing this registration failed the extended
+  // generated-command property (slice 2) after 175 tests, seed 20260924,
+  // shrunk 0 times: "a runtime live before a pagehide trigger was still the
+  // one live at the end" — a `pagehide` this module never heard left the
+  // prior runtime published forever.
   dependencies.eventTarget.addEventListener('pagehide', onPageHide);
   dependencies.eventTarget.addEventListener('pageshow', onPageShow);

```

**Rehearsed this response**: `diff -u` slice 1's own finished `application-bootstrap.tsx` against
this comment-only version, `patch`-applied it to a scratch copy of slice 1's own tree, confirmed
byte-identical to this finished result. `tsc --build --force` over the result: exit 0 (comments
cannot change what typechecks, but this confirms the patch itself introduced no stray syntax).
`bunx vitest run application-bootstrap.test.tsx application-bootstrap.model.test.tsx
--reporter=verbose`: **18/18** — the 17 pre-existing cases plus the model test's own one property,
both still green with the comments in place, confirming the four `Proof:` comments landed exactly
where the four rehearsals above ran, not somewhere that drifted while writing them up.

**Append this slice's own `verify.md` section first, then run its remaining checks** (format
runs last, so it checks the file this slice itself just wrote):

```bash
set -euo pipefail
report=$(mktemp "$TMPDIR/evidence/slice2-openspec.XXXXXX.json")
status_file="$TMPDIR/evidence/slice2-openspec.status"
if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report" \
  > /dev/null; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
status_file="$TMPDIR/evidence/slice2-build.status"
log_file="$TMPDIR/evidence/slice2-build.log"
if NX_DAEMON=false bunx nx run wbs-fe-01:build > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice2-format.status"
log_file="$TMPDIR/evidence/slice2-format.log"
if NX_DAEMON=false bunx nx format:check --all > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— rehearsed: OpenSpec `114`/`114`/`0`, predicate holds. Build exit 0. Format check exit 0, over
this slice's own already-appended `verify.md` section as well as the model test.

**Ready to commit:** `apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx`,
`apps/wbs/fe-01/src/runtime/application-bootstrap.tsx` (comment-only), `openspec/changes/
adopt-frontend-lifetimes/verify.md`.

```bash
set -euo pipefail
git status --short --untracked-files=all > "$TMPDIR/evidence/slice2-end-status.txt"
# every line must be one of the three paths above, already present in
# slice2-start-status.txt, or this packet's own plan document.
```

Subject: `test(wbs-fe-01): model the page-lifecycle triggers over generated interleavings`.

### Slice 3 — the bounded Chromium application case, and hand-over

**Prerequisite:** slice 2, committed.

**Owned paths:** `e2e/lifetime-bfcache-probe.ts` (new), `e2e/lifetime-bfcache.spec.ts` (new),
`playwright.config.ts`, `playwright-config.test.ts` (**only its own new describe block, added
before applying the `playwright.config.ts` diff — see Critical 2 below**),
`openspec/changes/adopt-frontend-lifetimes/tasks.md`,
`openspec/changes/adopt-frontend-lifetimes/verify.md` (this slice's own section).

**Step 3, start — executor, pre-edit baselines.**

```bash
set -euo pipefail
git status --short --untracked-files=all > "$TMPDIR/evidence/slice3-start-status.txt"
status_file="$TMPDIR/evidence/slice3-baseline-sandbox.status"
log_file="$TMPDIR/evidence/slice3-baseline-sandbox.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude \
  src/components/wbs/short-date.test.ts) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
report=$(mktemp "$TMPDIR/evidence/openspec-slice3-start.XXXXXX.json")
status_file="$TMPDIR/evidence/slice3-openspec-start.status"
if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report" \
  > /dev/null; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

— rehearsed this response, on slice 2's own finished tree: sandbox subset exit 0, `46 files / 674
tests` (section 3.4's own sandbox-subset baseline, unchanged going in). Strict OpenSpec exit 0,
`114`/`114`/`0`, predicate holds — also unchanged.

**Step 3a — red, executor, the new `playwright-config.test.ts` cases first, before
`playwright.config.ts` changes.** Add the whole `describe('the chromium-regular project gate', …)`
block (section 7.9) to `playwright-config.test.ts`, without touching `playwright.config.ts` yet.

**This file is not run whole inside the sandbox.** `playwright-config.test.ts` also contains the
README's own named exception — `'lets a shifted browser login reach authentication through the
configured backend origin'` calls `execFileSync('bun', …)` and fails with `spawnSync bun EPERM`
inside an attempt (the batch-1 README's own "Frontend tests inside the sandbox" block, and
preamble rules 4a/15). The executor runs **only** the new describe block:

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice3-config-red.status"
log_file="$TMPDIR/evidence/slice3-config-red.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run playwright-config.test.ts --reporter=verbose -t 'the chromium-regular project gate') \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
```

— rehearsed fresh, against these three new cases before `playwright.config.ts` gains
`chromium-regular` at all: **2 failed | 1 passed (3)** — `playwright.config.ts:263` already
declares exactly one project, named `chromium`, so `'does not exist when
PLAYWRIGHT_CHROMIUM_REGULAR is unset — the default gate'` already passes both of its own
assertions (`toHaveLength(1)` and the name check) on the unchanged config. The two that fail:
`'exists, gated to the bfcache spec, only when a planner opts in'` (`expect(projects).toHaveLength(2)`
→ `expected 2 to be 1`, `chromium-regular` not found yet) and `'the default project excludes the
bfcache spec either way'` (`expect(matches(defaultProject.testIgnore, …)).toBe(true)` → `expected
false to be true`, no `testIgnore` yet).

**Step 3b — implement, executor.** Apply the `playwright.config.ts` diff (section 7.8): the gated
`chromium-regular` project and the default project's own `testIgnore`. Add
`e2e/lifetime-bfcache-probe.ts` and `e2e/lifetime-bfcache.spec.ts` (sections 7.6, 7.7).

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice3-tsc.status"
log_file="$TMPDIR/evidence/slice3-tsc.log"
if (cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice3-lint.status"
log_file="$TMPDIR/evidence/slice3-lint.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:lint --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice3-config-green.status"
log_file="$TMPDIR/evidence/slice3-config-green.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run playwright-config.test.ts --reporter=verbose -t 'the chromium-regular project gate') \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— rehearsed: tsc exit 0, lint exit 0, the three new cases: **3 passed (3)**.

**Four mutations, each with a named assertion, rehearsed and restored:**

| #   | Fault                                                  | Exact edit                                                                                             | Command                                                                                                                                             | Named failing assertion                                                                                                                                |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 16  | Opt-in guard removed                                   | `...(process.env['PLAYWRIGHT_CHROMIUM_REGULAR'] === '1' ? [...] : [])` → the array unconditionally     | `(cd apps/wbs/fe-01 && bunx vitest run playwright-config.test.ts --reporter=verbose -t 'does not exist when PLAYWRIGHT_CHROMIUM_REGULAR is unset')` | `'does not exist when PLAYWRIGHT_CHROMIUM_REGULAR is unset — the default gate'`: `expect(projects).toHaveLength(1)` → `expected 2 to be 1`             |
| 17  | Default project's own `testIgnore` removed             | Delete the `testIgnore: /lifetime-bfcache\.spec\.ts/,` line from the `chromium` project                | `(cd apps/wbs/fe-01 && bunx vitest run playwright-config.test.ts --reporter=verbose -t 'the default project excludes')`                             | `'the default project excludes the bfcache spec either way'`: `expect(matches(defaultProject.testIgnore, …)).toBe(true)` → `expected false to be true` |
| 18  | `chromium-regular`'s own `testMatch` corrupted         | `/lifetime-bfcache\.spec\.ts/` → `/never-matches-anything\.spec\.ts/`                                  | `(cd apps/wbs/fe-01 && bunx vitest run playwright-config.test.ts --reporter=verbose -t 'exists, gated to the bfcache spec')`                        | `'exists, gated to the bfcache spec, only when a planner opts in'`: `expect(matches(regular.testMatch, …)).toBe(true)` → `expected false to be true`   |
| 19  | `chromium-regular`'s own `channel: 'chromium'` removed | `use: { ...devices['Desktop Chrome'], channel: 'chromium' }` → `use: { ...devices['Desktop Chrome'] }` | `(cd apps/wbs/fe-01 && bunx vitest run playwright-config.test.ts --reporter=verbose -t 'exists, gated to the bfcache spec')`                        | Same case: `expect(regular.use?.channel).toBe('chromium')` → `expected undefined to be 'chromium'`                                                     |

**Verify, executor, this slice's own remaining checks — OpenSpec, build, and the post-edit
sandbox-subset confirmation:**

```bash
set -euo pipefail
report=$(mktemp "$TMPDIR/evidence/openspec-validation-slice3.XXXXXX.json")
status_file="$TMPDIR/evidence/slice3-openspec.status"
if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report" \
  > /dev/null; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
status_file="$TMPDIR/evidence/slice3-build.status"
log_file="$TMPDIR/evidence/slice3-build.log"
if NX_DAEMON=false bunx nx run wbs-fe-01:build > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice3-sandbox-confirm.status"
log_file="$TMPDIR/evidence/slice3-sandbox-confirm.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude \
  src/components/wbs/short-date.test.ts) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— rehearsed: OpenSpec `114`/`114`/`0`, predicate holds. Build exit 0. Sandbox subset: exit 0, `46
files / 674 tests` — this slice's own start-of-step baseline, exactly, confirming the whole file's
own new cases never entered this command's own count (it excludes the file they are in).

**Step 3c — executor.** Check task 5 in `openspec/changes/adopt-frontend-lifetimes/tasks.md` with
the closing note in section 9 — **the checkbox stays unchecked**, since its own wording names
hot-reload disposal, which this packet does not close. Append this slice's own `verify.md` section,
**then**:

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice3-format.status"
log_file="$TMPDIR/evidence/slice3-format.log"
if NX_DAEMON=false bunx nx format:check --all > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— rehearsed: exit 0, over every file this slice touched, including its own `verify.md` and
`tasks.md` edits.

**Ready to commit:** `apps/wbs/fe-01/e2e/lifetime-bfcache-probe.ts`,
`apps/wbs/fe-01/e2e/lifetime-bfcache.spec.ts`, `apps/wbs/fe-01/playwright.config.ts`,
`apps/wbs/fe-01/playwright-config.test.ts`, `openspec/changes/adopt-frontend-lifetimes/tasks.md`,
`openspec/changes/adopt-frontend-lifetimes/verify.md`.

**Planner-only, after this slice is committed — separate commands, separate baselines (section
3.4), the same bounded port-selection procedure as section 4.7 (Important 1 of review 7: one
procedure, not two independently maintained copies):**

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/devsync.status"
log_file="$TMPDIR/evidence/devsync.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"

status_file="$TMPDIR/evidence/test-unit.status"
log_file="$TMPDIR/evidence/test-unit.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:test:unit --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"

status_file="$TMPDIR/evidence/test-whole.status"
log_file="$TMPDIR/evidence/test-whole.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:test --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"

bunx playwright install chromium
shift=300
found=""
while [ "$shift" -le 3000 ]; do
  if ports_output=$(ss -ltn 2>&1); then status=0; else status=$?; fi
  if [ "$status" -ne 0 ]; then
    echo "ss failed to inspect listening ports (exit $status); refusing to guess port availability" >&2
    exit 1
  fi
  a=":$((3100 + shift)) "
  b=":$((3200 + shift)) "
  c=":$((4200 + shift)) "
  if [[ "$ports_output" =~ $a ]] || [[ "$ports_output" =~ $b ]] || [[ "$ports_output" =~ $c ]]; then
    shift=$((shift + 300))
    continue
  fi
  found="$shift"
  break
done
if [ -z "$found" ]; then
  echo "no free port shift found up to 3000" >&2
  exit 1
fi
echo "using E2E_PORT_SHIFT=$found"
status_file="$TMPDIR/evidence/chromium-bfcache.status"
log_file="$TMPDIR/evidence/chromium-bfcache.log"
if CI=1 NX_DAEMON=false PLAYWRIGHT_CHROMIUM_REGULAR=1 E2E_PORT_SHIFT=$found \
  env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx nx run wbs-fe-01:e2e -- --project=chromium-regular e2e/lifetime-bfcache.spec.ts \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

**Byte-identical to section 4.7's own script.** Both old loops (the bare `while ss -ltn | grep -qE
...`, and its first, still-piped fix) failed open — section 4.7 has the full reproduction and the
five rehearsed cases (free, occupied-then-free, missing/failing `ss`, a large listening-port table
with one occupied candidate, and exhaustion). Not repeated here.

— rehearsed this response, all four exit 0: `tool-devsync:test` — `366 pass / 0 fail`, unchanged.
`wbs-fe-01:test:unit` — `48 files / 697 tests` (`+3` over its own `694`-test baseline, section
3.4). `wbs-fe-01:test` — `131 files / 2995 tests` (UTC) plus `2 files / 3 tests` (zoned) (`+14` over
its own `2981`-test baseline, in 7m 43s — a fresh run, not the earlier asserted one). The bfcache
run: `shift=300` (all three ports free on this host), one test, `1 passed (8.8s)` — section 4.7 has
the full output. **This planner-only rehearsal, on this response's own worktree, is not the same as
verification on the executor's own resulting tree** — section 10, item 4.

```bash
set -euo pipefail
git status --short --untracked-files=all > "$TMPDIR/evidence/slice3-end-status.txt"
```

Subject: `feat(wbs-fe-01): add a bounded, opt-in Chromium application-lifecycle case`.

## 7. The code

Every diff below is `git diff 76f871d8 <the tree this response finishes on>` for that one file,
except 7.4's own first part, which is slice 1's own diff against baseline (its compatibility
fields only) — its own second part is slice 2's diff over slice 1's tree, matching how the two
slices actually apply it in sequence.

### 7.1 `application-bootstrap.tsx` — the production diff

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx b/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
index 098703ad..0691a6e9 100644
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
@@ -14,16 +14,31 @@ import {
 import { ApplicationServicesProvider } from './application-services-context';
 import { type Acquire, type LifetimeSlot, TransitionSupersededError } from './lifetime-slot';

+/** What this bootstrap draws into, and what lets it take a tree back down. */
+export interface BootstrapRoot {
+  readonly render: (tree: ReactNode) => void;
+  /** Unmounts synchronously — a component's own cleanup effects run inside this call. */
+  readonly unmount: () => void;
+}
+
 /** What the page's bootstrap is wired from; production passes none of it. */
 export interface BootstrapDependencies {
   /** How the page's runtime is built. Defaults to the production installation. */
   readonly acquire: Acquire<ApplicationServices>;
   /** The slot that owns it. Defaults to the page's one slot. */
   readonly slot: LifetimeSlot<ApplicationServices>;
-  /** React's root factory, so a test can watch what this renders into it. */
-  readonly mount: (host: Element, options: RootOptions) => { render: (tree: ReactNode) => void };
+  /** React's root factory, so a test can watch what this renders into it, and unmounts it. */
+  readonly mount: (host: Element, options: RootOptions) => BootstrapRoot;
   /** The tree drawn once the runtime is live; the production entry supplies the real `App`. */
   readonly app: ComponentType;
+  /**
+   * Where `pagehide` and `pageshow` are heard.
+   *
+   * Injected rather than read off `window` inside this function, so a test drives
+   * page-lifecycle events deterministically instead of dispatching them against the
+   * real document. Production passes `window`, once, here.
+   */
+  readonly eventTarget: EventTarget;
 }

 const PRODUCTION: BootstrapDependencies = {
@@ -31,8 +46,27 @@ const PRODUCTION: BootstrapDependencies = {
   slot: applicationSlot,
   mount: (host, options) => createRoot(host, options),
   app: App,
+  eventTarget: window,
 };

+/**
+ * True for a `pageshow` restored from the back/forward cache, whatever the
+ * event's own concrete type turns out to be in a given environment.
+ *
+ * A user-defined type guard over `'persisted' in event` rather than an
+ * `instanceof PageTransitionEvent` check: jsdom, and this file's own tests,
+ * dispatch a plain `Event` carrying the flag, and both are real `pageshow`
+ * deliveries as far as this module is concerned.
+ */
+function isPersistedPageShow(event: Event): event is Event & { readonly persisted: boolean } {
+  if (!('persisted' in event)) return false;
+  // The boundary: the `in` check just above is what makes this narrowing safe —
+  // `Event` itself declares no `persisted` member, so nothing shorter than a
+  // property probe can ask the question this guard exists to answer.
+  const flagged = event as Event & { readonly persisted: unknown };
+  return flagged.persisted === true;
+}
+
 /**
  * Everything between an empty document and a rendering page.
  *
@@ -50,6 +84,36 @@ const PRODUCTION: BootstrapDependencies = {
  * that report instead of the app. It never reads the refusal itself, which is why
  * the state is read back from the slot rather than caught as a value.
  *
+ * `pagehide` (its own `persisted` flag intentionally unread — a `pagehide` never
+ * rebuilds, so nothing distinguishes the two cases) retires the runtime through
+ * the slot **and invalidates the mounted root**, so a later persisted `pageshow`
+ * never inherits it: the map's own words are "unmounts/invalidates the React
+ * root" and "build fresh runtimes/root/listeners", and reusing a mounted tree
+ * would leave `App`'s own `fetchMe` effect (an empty-dependency `useEffect`)
+ * never rerun, because React does not remount a tree it is only asked to update
+ * again.
+ *
+ * **This module is a single, page-lifetime instance — there is exactly one of it
+ * for as long as the page exists, and its own root and reporting are never
+ * contested by another instance.** It has no `import.meta.hot` dependency and
+ * no hot-module-replacement handling: see
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-e-page-lifecycle.md`
+ * (section 1 and section 11) for why, and for what a later packet has to
+ * design and model-test before adding HMR support here.
+ *
+ * **What this guarantees and what stays a limit:** every `pageshow` this module
+ * hears while its own listener is still attached is answered — restore, or (for
+ * `persisted: false`) ignored. A browser that discards the page without ever
+ * delivering `pagehide` — a crash, a killed tab — leaves nothing for `retire()`
+ * to observe; DI Bag's own disposers never run, and nothing here can make that
+ * promise for a process that no longer exists. A `pagehide` the browser does not
+ * follow with a same-tab `pageshow` is retirement with no later rejoin, which is
+ * exactly ordinary navigation or a closed tab and needs none. **What restoration
+ * does not itself prove**: this packet's own root-invalidation fix makes `App`'s
+ * mount effects rerun, which is what re-fetches the signed-in identity — but the
+ * session, catalog and project runtimes those effects reach into are later
+ * packets' own scope, not proved complete here.
+ *
  * @throws when the slot refuses without becoming fatal, which its own contract
  * makes impossible: an unreachable union reaches nobody silently.
  */
@@ -58,15 +122,17 @@ export async function bootstrapApplication(
   dependencies: BootstrapDependencies = PRODUCTION,
 ): Promise<void> {
   /**
-   * The React root, created on **first draw** and never before.
+   * The React root, created on **first draw** and never before, and taken back
+   * down — synchronously, running the tree's own cleanup effects — by
+   * {@link invalidateRoot} rather than ever reused across a retirement.
    *
    * The design document's "the bootstrap awaits the first `replace` before creating
    * the React root" is a real ordering and not a preference: a root that exists
    * while the runtime is still being acquired is a root a later edit can render
    * into. Nothing here mounts one until there is something true to draw.
    */
-  let root: { render: (tree: ReactNode) => void } | null = null;
-  const rootFor = (): { render: (tree: ReactNode) => void } => {
+  let root: BootstrapRoot | null = null;
+  const rootFor = (): BootstrapRoot => {
     // Proof: on 2026-09-22, creating the root eagerly made its mount status
     // `empty` instead of `live` (5 failed, 7 passed).
     // Proof: on 2026-09-22, assigning here unconditionally mounted a second root
@@ -74,16 +140,51 @@ export async function bootstrapApplication(
     root ??= dependencies.mount(host, ROOT_FAULT_OPTIONS);
     return root;
   };
-  /** The fault already on screen, so one refusal is shown and logged once. */
-  let shown: DisclosedFault | null = null;
+  /**
+   * The fault the *current* root, if any, has drawn — reset whenever the root
+   * is taken down, so a later redraw of the same fault (root invalidated, then
+   * restored) draws again rather than finding a stale match. Distinct from
+   * `reportedFault` below: this is about the screen, not the console.
+   */
+  let drawnFault: DisclosedFault | null = null;
+  /**
+   * Takes the mounted root down, if there is one, so the next draw — a
+   * persisted `pageshow`'s rebuild, or a later fatal report — mounts fresh
+   * rather than rendering into a tree `App`'s own mount effects already ran
+   * for. Called from `pagehide` unconditionally: the map's own "unmounts/
+   * invalidates the React root".
+   */
+  const invalidateRoot = (): void => {
+    if (root === null) return;
+    root.unmount();
+    root = null;
+    // Proof: on 2026-09-23, dropping this reset made 'hiding and restoring an
+    // already-fatal page…' fail: the redraw after restoration never ran,
+    // because `drawnFault` still matched the fault the root just taken down
+    // had already drawn.
+    drawnFault = null;
+  };
+  /**
+   * The fault already logged, so one refusal is reported once — **not** once
+   * per root. Separate from `drawnFault`: hiding and restoring an already-
+   * reported fatal page must redraw it without reporting it a second time.
+   */
+  let reportedFault: DisclosedFault | null = null;
   const showFatal = (fault: DisclosedFault): void => {
     // Proof: on 2026-09-22, dropping this guard drew and logged one refusal twice
     // (2 failed, 10 passed).
-    if (shown === fault) return;
-    shown = fault;
-    // Proof: on 2026-09-22, logging the caught refusal beside this disclosure put
-    // a value rather than disclosed strings in the console (1 failed, 11 passed).
-    console.error("the page's runtime failed", fault.sentence, fault.occurrenceId, fault.lost);
+    if (reportedFault !== fault) {
+      reportedFault = fault;
+      // Proof: on 2026-09-22, logging the caught refusal beside this disclosure put
+      // a value rather than disclosed strings in the console (1 failed, 11 passed).
+      console.error("the page's runtime failed", fault.sentence, fault.occurrenceId, fault.lost);
+    }
+    // Proof: on 2026-09-23, collapsing `drawnFault`/`reportedFault` back into one
+    // `shown` variable (reset by `invalidateRoot`, as a single guard would have to
+    // be for the redraw above to run at all) made 'hiding and restoring an
+    // already-fatal page…' fail the other way: it reported the same fault twice.
+    if (drawnFault === fault) return;
+    drawnFault = fault;
     // Proof: on 2026-09-22, dropping this render left the fatal page with no tree;
     // its expected length 1 was 0 (2 failed, 10 passed).
     // Proof: on 2026-09-22, putting alice@example.com in the sentence exposed it
@@ -93,61 +194,144 @@ export async function bootstrapApplication(
   // Every later fatal state reaches the page through the slot rather than through a
   // second policy: a retirement that rejects or outruns its wait is a disclosure
   // boundary exactly as a refused construction is, and the map requires the same
-  // sanitized report for both.
+  // sanitized report for both. This module never releases this subscription: it is
+  // the page's only instance, for the page's whole life, so there is nothing for it
+  // to leak into.
   // Proof: on 2026-09-22, dropping this subscription left a failed retirement
   // with one rendered tree instead of two (1 failed, 11 passed).
   dependencies.slot.subscribe(() => {
     const state = dependencies.slot.snapshot();
     if (state.status === 'fatal') showFatal(state.fault);
   });
-  try {
-    await dependencies.slot.replace(dependencies.acquire);
-  } catch (refusal: unknown) {
-    // A newer request won: controlled cancellation, which the slot models rather
-    // than treats as a fault. Whoever won owns the page now, so this bootstrap
-    // draws nothing at all — not the app, and not a fatal page it has no fault for.
-    // Proof: on 2026-09-22, dropping this branch made the losing bootstrap reject
-    // with 'the slot is empty' instead of drawing nothing (2 failed, 10 passed).
-    if (refusal instanceof TransitionSupersededError) return;
-    // Nothing else about the refusal is read: the slot disclosed it already, and a
-    // value this function could read is a value it could render. Only its type is.
-    const refused = dependencies.slot.snapshot();
-    if (refused.status !== 'fatal') {
-      // The cause is attached and never read here: this Error ends the bootstrap, it
-      // is not disclosed to anybody, and `preserve-caught-error` is right that
-      // dropping the refusal would lose the only account of what happened.
-      throw new Error(`the page's runtime was refused and the slot is ${refused.status}`, {
+
+  /**
+   * One attempt to publish a runtime and draw from it: the first call this
+   * bootstrap ever makes, and every rebuild a persisted `pageshow` asks for
+   * afterward. Factored out rather than inlined twice, so both share the one
+   * fence below it and the one refusal handling above it.
+   */
+  const attempt = async (): Promise<void> => {
+    try {
+      await dependencies.slot.replace(dependencies.acquire);
+    } catch (refusal: unknown) {
+      // A newer request won: controlled cancellation, which the slot models rather
+      // than treats as a fault — reachable from this single instance's own repeated
+      // pagehide/pageshow cycles (a `pagehide`'s own `retire()` outranking a
+      // `pageshow`'s still-queued `replace()`), not from a second instance: this
+      // module has exactly one.
+      // Proof: on 2026-09-22, dropping this branch made the losing bootstrap reject
+      // with 'the slot is empty' instead of drawing nothing (2 failed, 10 passed).
+      if (refusal instanceof TransitionSupersededError) return;
+      // Nothing else about the refusal is read: the slot disclosed it already, and a
+      // value this function could read is a value it could render. Only its type is.
+      const refused = dependencies.slot.snapshot();
+      if (refused.status !== 'fatal') {
+        // The cause is attached and never read here: this Error ends the bootstrap, it
+        // is not disclosed to anybody, and `preserve-caught-error` is right that
+        // dropping the refusal would lose the only account of what happened.
+        throw new Error(`the page's runtime was refused and the slot is ${refused.status}`, {
+          cause: refusal,
+        });
+      }
+      showFatal(refused.fault);
+      return;
+    }
+    // The fence after the await: a retirement — including one a subscriber asked for
+    // while this transition was settling — withdraws publication **synchronously**, so
+    // a bootstrap that drew the app here without looking would draw it from a runtime
+    // the page has already given up. Nothing is drawn instead: whoever won owns the
+    // page now.
+    //
+    // It compares the **status** and not the identity of the services this transition
+    // returned, and that is rule R5 rather than laziness: a slot that reached `live`
+    // holding somebody else's runtime between this `await` and this line is not
+    // reachable — transitions are serialized and every replacement passes through
+    // `retiring`, which this catches — so an identity check here could not be made to
+    // fail by any fault (measured: removing that half left all 11 cases green). The
+    // packet that publishes these services through a React context adds it back with
+    // the test that can then break it.
+    // Proof: on 2026-09-22, removing this fence let the model draw the app while
+    // the slot was `retiring` (1 failed, 11 passed).
+    if (dependencies.slot.snapshot().status !== 'live') return;
+    const Tree = dependencies.app;
+    rootFor().render(
+      <StrictMode>
+        {/* Proof: on 2026-09-22, acquiring inside this tree made the Strict Mode
+        runtime count 3 instead of 1 (1 failed, 11 passed). */}
+        <ApplicationServicesProvider slot={dependencies.slot}>
+          <Tree />
+        </ApplicationServicesProvider>
+      </StrictMode>,
+    );
+  };
+
+  /**
+   * Retires the current runtime for `pagehide`.
+   *
+   * The caller does not wait for this to settle, and does not need to: this
+   * function's own rejection handler is not a bare silencer — it reads the
+   * slot's own post-rejection snapshot and shows the fatal state directly
+   * through the same {@link showFatal} the subscription and `attempt()`'s own
+   * `catch` use, so a retirement failure is reported exactly once regardless
+   * of which of the three paths observes it first.
+   *
+   * `retire()`'s own contract (`lifetime-slot.ts`) rejects in exactly one
+   * modelled way: leaving the slot terminally fatal. Unlike `replace()`, its
+   * own ordinal fence sits *after* a `retire` request's own early return, so
+   * `TransitionSupersededError` can never reach here — there is nothing for
+   * this function to distinguish it from. A rejection that leaves the slot
+   * anywhere else is not a modelled outcome at all, and is rethrown with its
+   * own cause rather than swallowed, exactly as `attempt()`'s own catch
+   * refuses to guess at an unrecognised refusal.
+   * Proof: on 2026-09-23, `application-bootstrap.test.tsx`'s own "a retirement
+   * refusal that leaves the slot anywhere but fatal is not silently swallowed"
+   * — a fake slot whose `retire()` rejects while its own `snapshot()` still
+   * reads `live`, a shape the real slot's own contract never produces —
+   * observes this `throw` through `process.on('unhandledRejection', …)`.
+   * Reverting it to the earlier bare swallow fails that same test: `expected
+   * […] to have a length of 1 but got 0`.
+   */
+  const startRetirement = (): void => {
+    dependencies.slot.retire().catch((refusal: unknown) => {
+      const state = dependencies.slot.snapshot();
+      if (state.status === 'fatal') {
+        showFatal(state.fault);
+        return;
+      }
+      throw new Error(`pagehide's own retirement was refused and the slot is ${state.status}`, {
         cause: refusal,
       });
-    }
-    showFatal(refused.fault);
-    return;
-  }
-  // The fence after the await: a retirement — including one a subscriber asked for
-  // while this transition was settling — withdraws publication **synchronously**, so
-  // a bootstrap that drew the app here without looking would draw it from a runtime
-  // the page has already given up. Nothing is drawn instead: whoever won owns the
-  // page now.
-  //
-  // It compares the **status** and not the identity of the services this transition
-  // returned, and that is rule R5 rather than laziness: a slot that reached `live`
-  // holding somebody else's runtime between this `await` and this line is not
-  // reachable — transitions are serialized and every replacement passes through
-  // `retiring`, which this catches — so an identity check here could not be made to
-  // fail by any fault (measured: removing that half left all 11 cases green). The
-  // packet that publishes these services through a React context adds it back with
-  // the test that can then break it.
-  // Proof: on 2026-09-22, removing this fence let the model draw the app while
-  // the slot was `retiring` (1 failed, 11 passed).
-  if (dependencies.slot.snapshot().status !== 'live') return;
-  const Tree = dependencies.app;
-  rootFor().render(
-    <StrictMode>
-      {/* Proof: on 2026-09-22, acquiring inside this tree made the Strict Mode
-      runtime count 3 instead of 1 (1 failed, 11 passed). */}
-      <ApplicationServicesProvider slot={dependencies.slot}>
-        <Tree />
-      </ApplicationServicesProvider>
-    </StrictMode>,
-  );
+    });
+  };
+
+  const onPageHide = (): void => {
+    // Proof: on 2026-09-23, dropping this call left the mounted tree in place
+    // across a persisted restore, so `App`'s own mount effect (an
+    // empty-dependency `useEffect`) never reran on rebuild.
+    invalidateRoot();
+    startRetirement();
+  };
+  /**
+   * A persisted `pageshow`: rebuild through the same {@link attempt} the first
+   * draw used.
+   *
+   * **No bookkeeping joins this to a `pagehide`'s own retirement, because none
+   * is needed.** `dependencies.slot.replace` queues behind whatever transition
+   * the slot is already running — that is the slot's own serialization
+   * (`docs/superpowers/plans/2026-09-21-batch-6/050-7-lifetime-slot-design.md`),
+   * not a promise this module tracks — so a `replace` issued here sits
+   * behind an in-flight `pagehide` retirement exactly as "join, then rebuild"
+   * asks, and a slot a failed retirement left terminally fatal refuses this
+   * `replace` (and never calls `acquire`) through the same terminal check
+   * every other request meets, before {@link attempt}'s own `catch` shows the
+   * fault this module already subscribed to.
+   */
+  const onPageShow = (event: Event): void => {
+    if (!isPersistedPageShow(event)) return;
+    void attempt();
+  };
+  dependencies.eventTarget.addEventListener('pagehide', onPageHide);
+  dependencies.eventTarget.addEventListener('pageshow', onPageShow);
+
+  await attempt();
 }
```

### 7.2 `application-bootstrap.test.tsx` — the diff

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx b/apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx
index d14ccd8e..c2cd4c7a 100644
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx
@@ -1,4 +1,5 @@
-import { DiBag } from 'di-bag';
+import { waitFor } from '@testing-library/react';
+import { DiBag, DiBagCleanupError } from 'di-bag';
 import { act, isValidElement, type ReactNode, useEffect } from 'react';
 import { createRoot } from 'react-dom/client';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
@@ -49,6 +50,8 @@ interface RecordedRoot {
    * and every assertion would still pass.
    */
   readonly mountStatuses: () => readonly string[];
+  /** How many times a root this fixture built was later invalidated. */
+  readonly unmounts: () => number;
 }

 /**
@@ -57,18 +60,22 @@ interface RecordedRoot {
  * The success path renders the whole `App`, whose first effect fetches the signed-in
  * identity; committing it here would test the app rather than the bootstrap. What is
  * under test is **which** tree is rendered and **when** — after the runtime is live,
- * never before.
+ * never before — and, since restoration must invalidate and remount rather than
+ * reuse (map: "unmounts/invalidates the React root"), **how many separate roots**
+ * were built and taken down.
  */
 function recordingRoot(slot: LifetimeSlot<ApplicationServices>): RecordedRoot {
   const options: unknown[] = [];
   const trees: ReactNode[] = [];
   const statuses: string[] = [];
   const mountStatuses: string[] = [];
+  let unmounts = 0;
   return {
     options: () => options,
     trees: () => trees,
     statuses: () => statuses,
     mountStatuses: () => mountStatuses,
+    unmounts: () => unmounts,
     mount: (_host, rootOptions) => {
       options.push(rootOptions);
       mountStatuses.push(slot.snapshot().status);
@@ -77,13 +84,17 @@ function recordingRoot(slot: LifetimeSlot<ApplicationServices>): RecordedRoot {
           trees.push(tree);
           statuses.push(slot.snapshot().status);
         },
+        unmount: () => {
+          unmounts += 1;
+        },
       };
     },
   };
 }

 /** The element a recorded render was given, as a typed element or null. */
-const elementType = (tree: ReactNode): unknown => (isValidElement(tree) ? tree.type : null);
+const elementType = (tree: ReactNode | undefined): unknown =>
+  isValidElement(tree) ? tree.type : null;

 /** A refusal carrying exactly what must never reach a reader or a console. */
 const SECRET = 'alice@example.com';
@@ -141,6 +152,7 @@ describe('the page’s bootstrap', () => {
       mount: root.mount,
       app: FakeApp,
       acquire: () => installApplicationRuntime({ openStore: fakeBrowserStorage }),
+      eventTarget: new EventTarget(),
     });

     expect(root.options()).toEqual([ROOT_FAULT_OPTIONS]);
@@ -160,6 +172,7 @@ describe('the page’s bootstrap', () => {
       mount: root.mount,
       app: FakeApp,
       acquire: refusingAcquisition(),
+      eventTarget: new EventTarget(),
     });

     expect(root.trees()).toHaveLength(1);
@@ -177,6 +190,7 @@ describe('the page’s bootstrap', () => {
       mount: root.mount,
       app: FakeApp,
       acquire: refusingAcquisition(),
+      eventTarget: new EventTarget(),
     });

     // Every line, not only the one this code wrote, and the disclosure assertions
@@ -218,6 +232,7 @@ describe('the page’s bootstrap', () => {
       mount: root.mount,
       app: FakeApp,
       acquire,
+      eventTarget: new EventTarget(),
     });
     const winner = slot.replace(acquire);

@@ -245,6 +260,7 @@ describe('the page’s bootstrap', () => {
           },
         };
       },
+      eventTarget: new EventTarget(),
     });

     await expect(slot.retire()).rejects.toThrow('would not let go');
@@ -299,6 +315,7 @@ describe('the context this bootstrap publishes', () => {
           acquire,
           mount: (element, options) => createRoot(element, options),
           app: Probe,
+          eventTarget: new EventTarget(),
         });
       });

@@ -311,3 +328,623 @@ describe('the context this bootstrap publishes', () => {
     },
   );
 });
+
+/** A `pageshow` carrying the bfcache-restoration flag this file's own tests need. */
+function pageShowEvent(persisted: boolean): Event {
+  const event = new Event('pageshow');
+  Object.defineProperty(event, 'persisted', { value: persisted });
+  return event;
+}
+
+/** A `pagehide`, optionally carrying the flag the design says this trigger ignores. */
+function pageHideEvent(persisted: boolean): Event {
+  const event = new Event('pagehide');
+  Object.defineProperty(event, 'persisted', { value: persisted });
+  return event;
+}
+
+describe('the page-lifecycle retirement trigger', () => {
+  itDom.each([true, false])(
+    'retires the runtime and invalidates the root when pagehide fires (persisted=%s, a flag this trigger never reads)',
+    async (persisted) => {
+      const slot = createLifetimeSlot<ApplicationServices>(50);
+      const root = recordingRoot(slot);
+      const eventTarget = new EventTarget();
+
+      await bootstrapApplication(document.createElement('div'), {
+        slot,
+        mount: root.mount,
+        app: FakeApp,
+        acquire: () => installApplicationRuntime({ openStore: fakeBrowserStorage }),
+        eventTarget,
+      });
+      expect(slot.snapshot().status).toBe('live');
+
+      eventTarget.dispatchEvent(pageHideEvent(persisted));
+
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('empty');
+      });
+      expect(root.unmounts(), 'pagehide did not invalidate the mounted root').toBe(1);
+    },
+  );
+
+  itDom('a non-persisted pageshow does not rebuild', async () => {
+    const slot = createLifetimeSlot<ApplicationServices>(50);
+    const root = recordingRoot(slot);
+    const eventTarget = new EventTarget();
+    let builds = 0;
+    const acquire = () => {
+      builds += 1;
+      return installApplicationRuntime({ openStore: fakeBrowserStorage });
+    };
+
+    await bootstrapApplication(document.createElement('div'), {
+      slot,
+      mount: root.mount,
+      app: FakeApp,
+      acquire,
+      eventTarget,
+    });
+
+    eventTarget.dispatchEvent(new Event('pagehide'));
+    await waitFor(() => {
+      expect(slot.snapshot().status).toBe('empty');
+    });
+    eventTarget.dispatchEvent(pageShowEvent(false));
+    // A real macrotask, not a fixed count of microtask turns: nothing here
+    // blocks a wrongly-triggered rebuild the way the deferred-close tests
+    // below do, so only draining the whole queue tells "did not rebuild"
+    // apart from "rebuilt, but this assertion ran first" (watched: a
+    // two-microtask wait passed on a mutant that always rebuilt).
+    await new Promise((resolve) => setTimeout(resolve, 20));
+
+    expect(builds).toBe(1);
+    expect(slot.snapshot().status).toBe('empty');
+    expect(root.trees()).toHaveLength(1);
+  });
+
+  itDom(
+    'a persisted pageshow joins the pending retirement before rebuilding, into a fresh root',
+    async () => {
+      const slot = createLifetimeSlot<ApplicationServices>(50);
+      const root = recordingRoot(slot);
+      const eventTarget = new EventTarget();
+      let builds = 0;
+      const closeRelease: { current: (() => void) | null } = { current: null };
+      const acquire = (): RetirableRuntime<ApplicationServices> => {
+        builds += 1;
+        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
+        if (builds > 1) return installed;
+        return {
+          services: installed.services,
+          close: () =>
+            new Promise<void>((resolve) => {
+              // A readonly-typed outer holder with a mutable field, not a bare
+              // `let`: TypeScript infers a `let` reassigned from inside this
+              // closure as `never` at every later narrowed read (reproduced
+              // in isolation, `microsoft/TypeScript`-known), so this test
+              // reads and writes `closeRelease.current` instead.
+              closeRelease.current = resolve;
+            }),
+        };
+      };
+
+      await bootstrapApplication(document.createElement('div'), {
+        slot,
+        mount: root.mount,
+        app: FakeApp,
+        acquire,
+        eventTarget,
+      });
+      expect(builds).toBe(1);
+      expect(root.mountStatuses()).toEqual(['live']);
+
+      eventTarget.dispatchEvent(new Event('pagehide'));
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('retiring');
+      });
+      expect(root.unmounts(), 'pagehide did not invalidate the root').toBe(1);
+
+      eventTarget.dispatchEvent(pageShowEvent(true));
+      // The join has to sit behind the still-open close: two turns of the
+      // microtask queue are enough for a bootstrap that skipped the join to
+      // have already rebuilt, and not enough for the real one to have moved.
+      await Promise.resolve();
+      await Promise.resolve();
+      expect(builds, 'rebuilt before the pending retirement had settled').toBe(1);
+      expect(
+        root.mountStatuses(),
+        'mounted a second root before the retirement had settled',
+      ).toEqual(['live']);
+
+      if (closeRelease.current === null) throw new Error('setup: the first close was never called');
+      const release = closeRelease.current;
+      release();
+
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('live');
+      });
+      expect(builds).toBe(2);
+      // A genuinely fresh root, not the invalidated one — two mounts, never
+      // a render into a root `pagehide` already took down.
+      expect(root.mountStatuses()).toEqual(['live', 'live']);
+      expect(root.trees()).toHaveLength(2);
+      expect(elementType(root.trees()[1])).not.toBe(LifetimeFault);
+    },
+  );
+
+  itDom(
+    'a persisted pageshow queued behind a pagehide retirement is refused, with no rebuild acquisition, when that retirement rejects',
+    async () => {
+      const slot = createLifetimeSlot<ApplicationServices>(50);
+      const root = recordingRoot(slot);
+      const eventTarget = new EventTarget();
+      let builds = 0;
+      const closeRelease: { current: ((error: Error) => void) | null } = { current: null };
+      const acquire = (): RetirableRuntime<ApplicationServices> => {
+        builds += 1;
+        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
+        if (builds > 1) return installed;
+        return {
+          services: installed.services,
+          close: () =>
+            new Promise<void>((_resolve, reject) => {
+              closeRelease.current = reject;
+            }),
+        };
+      };
+
+      await bootstrapApplication(document.createElement('div'), {
+        slot,
+        mount: root.mount,
+        app: FakeApp,
+        acquire,
+        eventTarget,
+      });
+      expect(builds).toBe(1);
+
+      eventTarget.dispatchEvent(new Event('pagehide'));
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('retiring');
+      });
+
+      // Queued while the retirement is still pending — the "then rejection"
+      // case, not a `pageshow` arriving after the slot is already fatal.
+      eventTarget.dispatchEvent(pageShowEvent(true));
+      await Promise.resolve();
+      await Promise.resolve();
+      expect(builds, 'the queued rebuild acquired before the retirement even settled').toBe(1);
+
+      if (closeRelease.current === null) throw new Error('setup: the first close was never called');
+      const reject = closeRelease.current;
+      reject(new Error(`the store of ${SECRET} would not let go`));
+
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('fatal');
+      });
+      expect(builds, 'the queued rebuild acquired after the retirement rejected').toBe(1);
+      expect(elementType(root.trees().at(-1))).toBe(LifetimeFault);
+      expect(logged.mock.calls.length, 'more than one report reached the console').toBe(1);
+      expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);
+    },
+  );
+
+  itDom(
+    'a persisted pageshow queued behind a pagehide retirement is refused when that retirement times out, and its late completion is observed without reviving anything',
+    async () => {
+      const slot = createLifetimeSlot<ApplicationServices>(20);
+      const root = recordingRoot(slot);
+      const eventTarget = new EventTarget();
+      let builds = 0;
+      const closeRelease: { current: (() => void) | null } = { current: null };
+      const acquire = (): RetirableRuntime<ApplicationServices> => {
+        builds += 1;
+        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
+        if (builds > 1) return installed;
+        // A real DI Bag graph, not a raw promise this test races itself: the
+        // slot's own `disposeWithdrawn` calls `close({ timeoutMs })` directly
+        // and trusts the callee to enforce it — only DI Bag's own bounded
+        // `close()` actually does, and only its own `DiBagCloseCancelledError`
+        // is what `lifetime-slot.ts`'s `lateCleanupOf` recognises, which is
+        // what makes `slot.lateOutcome()` observable at all.
+        const bag = DiBag.createBuilder()
+          .register({
+            owned: DiBag.withDisposal(
+              DiBag.fromSyncFactory((): ApplicationServices => installed.services),
+              () =>
+                new Promise<void>((resolve) => {
+                  closeRelease.current = resolve;
+                }),
+            ),
+          })
+          .build();
+        const services = bag.resolve('owned');
+        return { services, close: (options) => bag.close(options) };
+      };
+
+      await bootstrapApplication(document.createElement('div'), {
+        slot,
+        mount: root.mount,
+        app: FakeApp,
+        acquire,
+        eventTarget,
+      });
+      expect(builds).toBe(1);
+
+      eventTarget.dispatchEvent(new Event('pagehide'));
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('retiring');
+      });
+
+      eventTarget.dispatchEvent(pageShowEvent(true));
+      await Promise.resolve();
+      await Promise.resolve();
+      expect(builds, 'the queued rebuild acquired before the budget expired').toBe(1);
+
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('fatal');
+      });
+      expect(builds, 'the queued rebuild acquired after the budget expired').toBe(1);
+      expect(elementType(root.trees().at(-1))).toBe(LifetimeFault);
+      expect(logged.mock.calls.length).toBe(1);
+      expect(slot.lateOutcome()).toBe('pending');
+
+      if (closeRelease.current === null) {
+        throw new Error('setup: the never-settling close was never called');
+      }
+      const release = closeRelease.current;
+      release();
+
+      await waitFor(() => {
+        expect(slot.lateOutcome()).toBe('settled');
+      });
+      // Late completion is observed, never silently resumed: still fatal,
+      // still exactly one runtime ever acquired, still one report.
+      expect(slot.snapshot().status).toBe('fatal');
+      expect(builds).toBe(1);
+      expect(logged.mock.calls.length, 'late completion re-reported or rebuilt').toBe(1);
+    },
+  );
+
+  itDom(
+    'a pagehide retirement failure is visible even though another owned disposer still ran',
+    async () => {
+      // The map's own test 4, through the page-hide path specifically: one
+      // owned disposer rejects while another records completion, and the DI
+      // Bag cleanup failure, the other disposer's own completion, and one
+      // correlated occurrence are all asserted — not only that *a* failure
+      // reached the console.
+      //
+      // `completing` is resolved *before* `rejecting`: DI Bag disposes in
+      // **reverse** resolve order (`node_modules/di-bag/dist/acquisition.js`),
+      // so this makes `rejecting`'s own disposer run first and `completing`'s
+      // own disposer run second — after the rejection, not before it. With
+      // the order reversed (`rejecting` resolved first), a cleanup that
+      // stopped at the first failure would still have already run
+      // `completing`'s own disposer, and this test would not have noticed —
+      // exactly the gap review 6 found, and the shape the watched fault below
+      // reproduces.
+      const slot = createLifetimeSlot<ApplicationServices>(50);
+      const root = recordingRoot(slot);
+      const eventTarget = new EventTarget();
+      const otherDisposerRan: { current: boolean } = { current: false };
+      const closeOutcome: { current: Promise<void> | null } = { current: null };
+      const acquire = (): RetirableRuntime<ApplicationServices> => {
+        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
+        const bag = DiBag.createBuilder()
+          .register({
+            completing: DiBag.withDisposal(
+              DiBag.fromSyncFactory((): ApplicationServices => installed.services),
+              () => {
+                otherDisposerRan.current = true;
+                return Promise.resolve();
+              },
+            ),
+            rejecting: DiBag.withDisposal(
+              DiBag.fromSyncFactory((): string => 'the store it took'),
+              () => Promise.reject(new Error(`the store of ${SECRET} would not let go`)),
+            ),
+          })
+          .build();
+        const services = bag.resolve('completing');
+        bag.resolve('rejecting');
+        return {
+          services,
+          // The real production `close`, captured on its own way out so this
+          // test can assert on the exact promise `retire()` awaits — not a
+          // second, parallel call to `bag.close()`, which would run the
+          // disposers twice.
+          close: (options) => {
+            const outcome = bag.close(options);
+            closeOutcome.current = outcome;
+            return outcome;
+          },
+        };
+      };
+
+      await bootstrapApplication(document.createElement('div'), {
+        slot,
+        mount: root.mount,
+        app: FakeApp,
+        acquire,
+        eventTarget,
+      });
+
+      eventTarget.dispatchEvent(new Event('pagehide'));
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('fatal');
+      });
+
+      if (closeOutcome.current === null) throw new Error('setup: close() was never called');
+      await expect(closeOutcome.current).rejects.toBeInstanceOf(DiBagCleanupError);
+      // Proof: on 2026-09-23, replacing `close` with a hand-rolled version
+      // that rejects without ever calling `completing`'s own disposer (a
+      // cleanup that stops at the first failure, the exact defect the
+      // resolve-order comment above exists to catch) failed exactly this
+      // assertion: `the other owned disposer never ran: expected false to be
+      // true`.
+      expect(otherDisposerRan.current, 'the other owned disposer never ran').toBe(true);
+
+      const state = slot.snapshot();
+      if (state.status !== 'fatal') throw new Error('unreachable: just waited for fatal');
+      expect(elementType(root.trees().at(-1))).toBe(LifetimeFault);
+      expect(
+        logged.mock.calls.length,
+        'more than one correlated occurrence reached the console',
+      ).toBe(1);
+      // One correlated occurrence, not merely one console call: the same
+      // fault the slot itself now holds is the one the console reported.
+      expect(logged.mock.calls[0]?.[2]).toBe(state.fault.occurrenceId);
+      expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);
+    },
+  );
+
+  itDom(
+    'shows the fatal page in a fresh root when a pagehide retirement fails, and refuses to rebuild on the next persisted pageshow',
+    async () => {
+      const slot = createLifetimeSlot<ApplicationServices>(50);
+      const root = recordingRoot(slot);
+      const eventTarget = new EventTarget();
+      let builds = 0;
+      const acquire = (): RetirableRuntime<ApplicationServices> => {
+        builds += 1;
+        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
+        return {
+          services: installed.services,
+          close: async () => {
+            await Promise.reject(new Error(`the store of ${SECRET} would not let go`));
+          },
+        };
+      };
+
+      await bootstrapApplication(document.createElement('div'), {
+        slot,
+        mount: root.mount,
+        app: FakeApp,
+        acquire,
+        eventTarget,
+      });
+      expect(builds).toBe(1);
+
+      eventTarget.dispatchEvent(new Event('pagehide'));
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('fatal');
+      });
+      expect(
+        root.unmounts(),
+        'pagehide did not invalidate the root before the retirement failed',
+      ).toBe(1);
+      expect(root.trees()).toHaveLength(2);
+      expect(elementType(root.trees()[1])).toBe(LifetimeFault);
+      // A fresh root for the fatal page: `pagehide` already invalidated the
+      // first one before this retirement even settled.
+      expect(root.mountStatuses()).toEqual(['live', 'fatal']);
+      expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);
+
+      eventTarget.dispatchEvent(pageShowEvent(true));
+      // A real macrotask: see the comment on the same wait in 'a non-persisted
+      // pageshow does not rebuild'.
+      await new Promise((resolve) => setTimeout(resolve, 20));
+
+      expect(builds, 'rebuilt into a slot a failed retirement had already left fatal').toBe(1);
+      expect(root.trees()).toHaveLength(2);
+    },
+  );
+
+  itDom(
+    'a persisted pageshow rebuilds into a genuinely fresh root: the old tree unmounts, the new one mounts fresh',
+    async () => {
+      const slot = createLifetimeSlot<ApplicationServices>(50);
+      const host = document.createElement('div');
+      document.body.append(host);
+      const counts = { mounts: 0, unmounts: 0 };
+      const Probe = (): null => {
+        useEffect(() => {
+          counts.mounts += 1;
+          return () => {
+            counts.unmounts += 1;
+          };
+        }, []);
+        return null;
+      };
+      const eventTarget = new EventTarget();
+      const acquire = () => installApplicationRuntime({ openStore: fakeBrowserStorage });
+
+      await act(async () => {
+        await bootstrapApplication(host, {
+          slot,
+          acquire,
+          mount: (element, options) => createRoot(element, options),
+          app: Probe,
+          eventTarget,
+        });
+      });
+      // `<StrictMode>` double-invokes a mount effect in development (setup,
+      // cleanup, setup again), so the first bootstrap's own count is not
+      // necessarily 1 — it is whatever one real mount produces, and this
+      // test's own signal is that a *second* real mount doubles it again,
+      // not the literal number. `application-bootstrap.strictmode.test.tsx`
+      // is the file that pins the count for one mount on its own.
+      const mountsAfterFirstBoot = counts.mounts;
+      expect(mountsAfterFirstBoot, 'the first bootstrap never mounted anything').toBeGreaterThan(0);
+      expect(
+        counts.unmounts,
+        'the first bootstrap already ran a cleanup with nothing torn down',
+      ).toBe(mountsAfterFirstBoot - 1);
+
+      act(() => {
+        eventTarget.dispatchEvent(new Event('pagehide'));
+      });
+      // The tree's own cleanup ran the instant the root was invalidated —
+      // synchronously with `unmount()`, not deferred to a later render. This
+      // is what a reused root cannot do: React does not remount a tree it is
+      // only asked to render again, so `App`'s own `fetchMe` effect (an
+      // empty-dependency `useEffect`) would never rerun without this.
+      expect(counts.unmounts, 'pagehide did not unmount the old tree').toBe(mountsAfterFirstBoot);
+
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('empty');
+      });
+
+      act(() => {
+        eventTarget.dispatchEvent(pageShowEvent(true));
+      });
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('live');
+      });
+
+      // A genuinely fresh mount: the effect ran again from zero a second
+      // time (StrictMode's own setup/cleanup/setup doubling it again, exactly
+      // as the first bootstrap's own mount did), which is exactly what a
+      // reused, merely re-rendered root could never produce.
+      expect(counts.mounts, 'the rebuilt tree was not a fresh mount').toBe(
+        2 * mountsAfterFirstBoot,
+      );
+      document.body.removeChild(host);
+    },
+  );
+
+  itDom(
+    'hiding and restoring an already-fatal page redraws the same fault once, without reporting it twice',
+    async () => {
+      const slot = createLifetimeSlot<ApplicationServices>(50);
+      const root = recordingRoot(slot);
+      const eventTarget = new EventTarget();
+      const acquire = (): RetirableRuntime<ApplicationServices> => {
+        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
+        return {
+          services: installed.services,
+          close: async () => {
+            await Promise.reject(new Error(`the store of ${SECRET} would not let go`));
+          },
+        };
+      };
+
+      await bootstrapApplication(document.createElement('div'), {
+        slot,
+        mount: root.mount,
+        app: FakeApp,
+        acquire,
+        eventTarget,
+      });
+
+      // The first pagehide: retirement fails, the page goes fatal — the
+      // usual two renders (the initial app, then the fatal page) in the one
+      // root this bootstrap had so far.
+      eventTarget.dispatchEvent(new Event('pagehide'));
+      await waitFor(() => {
+        expect(slot.snapshot().status).toBe('fatal');
+      });
+      expect(root.trees()).toHaveLength(2);
+      expect(elementType(root.trees()[1])).toBe(LifetimeFault);
+      expect(root.unmounts(), 'the first pagehide did not invalidate the live root').toBe(1);
+
+      // A second pagehide — the browser hides the already-broken page again,
+      // an ordinary sequence with no HMR involved (tab hidden, restored to the
+      // same fault, hidden again). The slot is already terminally fatal, so
+      // this `retire()` is refused immediately — through `startRetirement`'s
+      // own catch, not a subscription notification for a *new* transition —
+      // but it still invalidates the root that was showing the fault, and its
+      // own refusal redraws that same fault into a fresh one: nothing here
+      // waits for a persisted `pageshow` to do that.
+      eventTarget.dispatchEvent(new Event('pagehide'));
+      await waitFor(() => {
+        expect(root.unmounts(), 'the second pagehide did not invalidate the fatal root').toBe(2);
+      });
+      await waitFor(() => {
+        expect(root.trees()).toHaveLength(3);
+      });
+      expect(elementType(root.trees()[2])).toBe(LifetimeFault);
+
+      // A persisted pageshow: refused immediately too (the slot is still
+      // terminally fatal), and finds the fault already redrawn — no further
+      // render, and no further report.
+      eventTarget.dispatchEvent(pageShowEvent(true));
+      await new Promise((resolve) => setTimeout(resolve, 20));
+      expect(root.trees()).toHaveLength(3);
+      expect(root.mountStatuses()).toEqual(['live', 'fatal', 'fatal']);
+      // Reported once, not three times, across the whole sequence.
+      expect(logged.mock.calls.length, 'restoring the fatal page reported it again').toBe(1);
+      expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);
+    },
+  );
+
+  itDom(
+    'a retirement refusal that leaves the slot anywhere but fatal is not silently swallowed',
+    async () => {
+      // The real slot's own contract (`lifetime-slot.ts`) never produces this
+      // shape: `retire()` rejects only into a terminally fatal slot. This fake
+      // one rejects while its own `snapshot()` still reads `live`, to exercise
+      // `startRetirement`'s own "not a modelled outcome" branch directly,
+      // rather than trying to coax the real slot into an unreachable state.
+      const fakeServices = installApplicationRuntime({ openStore: fakeBrowserStorage }).services;
+      const fakeSlot: LifetimeSlot<ApplicationServices> = {
+        subscribe: () => () => undefined,
+        snapshot: () => ({ status: 'live', services: fakeServices }),
+        replace: () => Promise.resolve(fakeServices),
+        retire: () => Promise.reject(new Error('an unmodelled retirement failure')),
+        lateCleanup: () => null,
+        lateOutcome: () => 'none',
+      };
+      // A `process`-level listener, not `window`'s own `unhandledrejection`:
+      // this rejection is thrown from inside a `.catch()` callback running on
+      // Node's own microtask queue, not from anything jsdom's own event loop
+      // ever sees — reproduced directly (watched 2026-09-23): the same
+      // scenario against `window.addEventListener('unhandledrejection', …)`
+      // left that listener silent while Vitest's own top-level reporter still
+      // printed the rejection as an "Unhandled Error", attributed to this
+      // test by name. Registering here, and only here, keeps this test the
+      // one thing that observes it — nothing is left registered for another
+      // test to trip over.
+      const seen: unknown[] = [];
+      const onRejection = (reason: unknown): void => {
+        seen.push(reason);
+      };
+      process.on('unhandledRejection', onRejection);
+      try {
+        const eventTarget = new EventTarget();
+        await bootstrapApplication(document.createElement('div'), {
+          slot: fakeSlot,
+          mount: () => ({ render: () => undefined, unmount: () => undefined }),
+          app: FakeApp,
+          acquire: () => {
+            throw new Error('unreachable: the fake slot never calls acquire');
+          },
+          eventTarget,
+        });
+        eventTarget.dispatchEvent(new Event('pagehide'));
+        await new Promise((resolve) => setTimeout(resolve, 20));
+        expect(seen, 'the unexpected refusal never surfaced').toHaveLength(1);
+        const surfaced = seen[0];
+        expect(surfaced).toBeInstanceOf(Error);
+        expect(String(surfaced)).toContain(
+          "pagehide's own retirement was refused and the slot is live",
+        );
+        expect(String((surfaced as Error).cause)).toContain('an unmodelled retirement failure');
+      } finally {
+        process.removeListener('unhandledRejection', onRejection);
+      }
+    },
+  );
+});
```

### 7.3 `lifetime-fault-probe.ts` — the diff

```diff
diff --git a/apps/wbs/fe-01/e2e/lifetime-fault-probe.ts b/apps/wbs/fe-01/e2e/lifetime-fault-probe.ts
index ea439bc9..364e3070 100644
--- a/apps/wbs/fe-01/e2e/lifetime-fault-probe.ts
+++ b/apps/wbs/fe-01/e2e/lifetime-fault-probe.ts
@@ -70,6 +70,7 @@ async function proveTheFatalPageDisclosesNothingRaw(): Promise<LifetimeFaultProo
     slot: createLifetimeSlot<ApplicationServices>(1_000),
     mount: (element, options) => createRoot(element, options),
     app: App,
+    eventTarget: window,
   });
   const deadline = Date.now() + 10_000;
   while (host.querySelector('[data-lifetime-fault]') === null) {
```

### 7.4 `application-bootstrap.model.test.tsx` — two diffs, slice 1 then slice 2

**Slice 1's own diff** — compatibility fields only, against `76f871d8`:

```diff
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx
@@ -117,6 +117,7 @@
                   services: held.status === 'live' ? held.services : null,
                 });
               },
+              unmount: () => undefined,
             };
           };

@@ -128,6 +129,7 @@
                   slot,
                   mount,
                   app: FakeApp,
+                  eventTarget: new EventTarget(),
                 }).then(
                   () => {
                     bootstrapOutcomes.push('resolved');
```

**Slice 2's own diff** — against slice 1's own already-committed tree (Critical 1: not against
`76f871d8` a second time, which would re-add `unmount`/`eventTarget` and fail to apply). `unmount`
stays unchanged context; slice 1's own inline `eventTarget: new EventTarget()` becomes this slice's
own named local `eventTarget,`:

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx b/apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx
index eb3ad627..c71d4c42 100644
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx
@@ -1,3 +1,4 @@
+import { DiBag } from 'di-bag';
 import fc from 'fast-check';
 import { isValidElement, type ReactNode } from 'react';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
@@ -7,7 +8,7 @@ import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';

 import { bootstrapApplication } from './application-bootstrap';
 import { type ApplicationServices, installApplicationRuntime } from './application-runtime';
-import { createLifetimeSlot, type LifetimeSlot } from './lifetime-slot';
+import { type Acquire, createLifetimeSlot, type LifetimeSlot } from './lifetime-slot';

 /** What the page was asked to draw, and what the slot held at that instant. */
 interface Rendered {
@@ -18,24 +19,49 @@ interface Rendered {
   readonly services: ApplicationServices | null;
 }

+/** How a generated runtime's bounded close behaves once something retires it. */
+type Disposal = 'settles' | 'rejects' | 'never';
+
 /** A generated event against one page's bootstrap. */
 type Command =
-  | { readonly kind: 'bootstrap' }
+  | { readonly kind: 'bootstrap'; readonly disposal: Disposal }
   | { readonly kind: 'retire' }
-  | { readonly kind: 'replace' }
+  | { readonly kind: 'replace'; readonly disposal: Disposal }
   | { readonly kind: 'retireFromListener' }
-  | { readonly kind: 'settle' };
+  | { readonly kind: 'settle' }
+  | { readonly kind: 'pagehide' }
+  | { readonly kind: 'pageshow'; readonly persisted: boolean };
+
+const disposalArb: fc.Arbitrary<Disposal> = fc.constantFrom('settles', 'rejects', 'never');

 const commandArb: fc.Arbitrary<Command> = fc.oneof(
-  { arbitrary: fc.constant<Command>({ kind: 'bootstrap' }), weight: 3 },
+  {
+    arbitrary: fc.record({ kind: fc.constant('bootstrap' as const), disposal: disposalArb }),
+    weight: 3,
+  },
   { arbitrary: fc.constant<Command>({ kind: 'retire' }), weight: 2 },
-  { arbitrary: fc.constant<Command>({ kind: 'replace' }), weight: 2 },
+  {
+    arbitrary: fc.record({ kind: fc.constant('replace' as const), disposal: disposalArb }),
+    weight: 2,
+  },
   { arbitrary: fc.constant<Command>({ kind: 'retireFromListener' }), weight: 2 },
   { arbitrary: fc.constant<Command>({ kind: 'settle' }), weight: 2 },
+  { arbitrary: fc.constant<Command>({ kind: 'pagehide' }), weight: 2 },
+  {
+    arbitrary: fc.record({ kind: fc.constant('pageshow' as const), persisted: fc.boolean() }),
+    weight: 2,
+  },
 );

 const FakeApp = (): null => null;

+/** A `pageshow` carrying the bfcache-restoration flag, for the `pageshow` command. */
+function pageShowEvent(persisted: boolean): Event {
+  const event = new Event('pageshow');
+  Object.defineProperty(event, 'persisted', { value: persisted });
+  return event;
+}
+
 /** React writes nothing here, but the bootstrap logs every fatal state it shows. */
 const muteConsoleError = () =>
   vi.spyOn(console, 'error').mockImplementation(() => {
@@ -57,20 +83,44 @@ afterEach(() => {
  *
  * The bootstrap is lifecycle code: it awaits a transition and then renders, and
  * anything can happen in between — a retirement, another replacement, a subscriber
- * that retires from inside a notification. Two named examples cannot cover that, so
- * the orders are `fc.scheduler()`'s to choose and the invariants are stated over
- * **what the page was drawn from** rather than over a sequence somebody predicted.
+ * that retires from inside a notification, a `pagehide`, a persisted `pageshow`.
+ * Two named examples cannot cover that, so the orders are `fc.scheduler()`'s to
+ * choose and the invariants are stated over **what the page was drawn from**
+ * rather than over a sequence somebody predicted.
  *
  * The slot is the real one, the installer is the production one over a fake browser
  * store, and the root records instead of committing: what is under test is which
- * tree is rendered and against which published runtime.
+ * tree is rendered and against which published runtime. `pagehide` and `pageshow`
+ * are driven through the same injected `eventTarget` every production bootstrap
+ * takes, never through a global `window`.
+ *
+ * Every `retire`/`replace` this property issues — whether from its own explicit
+ * `'retire'`/`'replace'` commands or triggered indirectly by dispatching
+ * `pagehide`/`pageshow` — is captured into `pending` through {@link trackedSlot},
+ * so `await Promise.all(pending)` genuinely waits for an event-triggered
+ * transition (including a `'never'` disposal's own real, DI-Bag-enforced budget
+ * timeout) before the property reads any invariant.
  */
 describe("the page's bootstrap, under generated interleavings", () => {
   it('only ever draws the page from the runtime the slot publishes', async () => {
+    /**
+     * Coverage over the **whole pinned run**, not one iteration: a property
+     * whose commands are generated but never actually reach the state they
+     * claim to exercise proves nothing about it. Declared outside the
+     * property body so every run's own counts accumulate, and asserted once
+     * `fc.assert` returns that each of the new events fired at least once,
+     * and that at least one of them retired a runtime that was genuinely
+     * `live` at the instant it fired.
+     */
+    let pagehideCount = 0;
+    let pageshowPersistedCount = 0;
+    let pageshowNonPersistedCount = 0;
+    let triggeredWhileLive = 0;
+
     await fc.assert(
       fc.asyncProperty(
         fc.scheduler(),
-        fc.array(commandArb, { minLength: 2, maxLength: 6 }),
+        fc.array(commandArb, { minLength: 2, maxLength: 8 }),
         async (scheduler, commands) => {
           const slot: LifetimeSlot<ApplicationServices> =
             createLifetimeSlot<ApplicationServices>(1);
@@ -78,16 +128,7 @@ describe("the page's bootstrap, under generated interleavings", () => {
           /** The status the slot held each time a root was created, in order. */
           const mounted: string[] = [];
           const pending: Promise<unknown>[] = [];
-          /**
-           * What each bootstrap ended as.
-           *
-           * Recorded rather than swallowed: a bootstrap that **rejects** is a finding —
-           * supersession and a fatal state are outcomes it handles — and a test that
-           * discarded every rejection could not tell a handled cancellation from an
-           * unhandled one.
-           */
           const bootstrapOutcomes: string[] = [];
-          /** Set when a listener should retire what is current, once. */
           let listenerRetires = false;
           slot.subscribe(() => {
             if (!listenerRetires) return;
@@ -95,14 +136,78 @@ describe("the page's bootstrap, under generated interleavings", () => {
             pending.push(slot.retire().then(undefined, () => undefined));
           });

-          const acquire = () => {
-            const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
-            return {
-              services: installed.services,
-              close: async (options: { timeoutMs: number }) => {
-                await scheduler.schedule(Promise.resolve(), 'dispose the page runtime');
-                await installed.close(options);
-              },
+          /**
+           * The slot every `bootstrapApplication` call in this run is given —
+           * never `slot` itself — so a `retire`/`replace` this property
+           * triggers only *indirectly*, by dispatching a `pagehide`/
+           * `pageshow` event, is captured into `pending` exactly as one this
+           * property calls directly already is. Without this, the property
+           * could return and read its own invariants while an event-triggered
+           * transition — a `'never'` disposal's own real budget timeout among
+           * them — was still settling underneath it.
+           */
+          const trackedSlot: LifetimeSlot<ApplicationServices> = {
+            subscribe: (listener) => slot.subscribe(listener),
+            snapshot: () => slot.snapshot(),
+            retire: () => {
+              const outcome = slot.retire();
+              pending.push(outcome.then(undefined, () => undefined));
+              return outcome;
+            },
+            replace: (acquire) => {
+              const outcome = slot.replace(acquire);
+              pending.push(outcome.then(undefined, () => undefined));
+              return outcome;
+            },
+            lateCleanup: () => slot.lateCleanup(),
+            lateOutcome: () => slot.lateOutcome(),
+          };
+
+          /**
+           * Every `bootstrap` command shares one event target, exactly as the
+           * production module load does — this is what lets a `pagehide`/
+           * `pageshow` command reach every bootstrap this run has started so
+           * far.
+           */
+          const eventTarget = new EventTarget();
+
+          /**
+           * A generated runtime whose bounded close settles, rejects or never
+           * settles, under the scheduler — the same three shapes
+           * `lifetime-slot.model.test.ts` generates, so a `pagehide` command
+           * here can retire into any of DI Bag's own real outcomes.
+           */
+          const buildAcquire = (disposal: Disposal): Acquire<ApplicationServices> => {
+            if (disposal === 'settles') {
+              // The real production graph: its own disposer is a synchronous
+              // store revocation that can neither reject nor hang, exactly as
+              // `lifetime-slot.model.test.ts`'s own `buildInstalled` relies on.
+              return () => installApplicationRuntime({ openStore: fakeBrowserStorage });
+            }
+            // A generated graph whose own DI Bag disposer rejects or never
+            // settles, under the scheduler. DI Bag's own bounded `close()` is
+            // what enforces the slot's 1ms budget here — never a raw promise
+            // this file races itself, which is exactly the bug a first draft
+            // had: a close that ignored `options.timeoutMs` hung every 'never'
+            // run past this test's own 120s timeout.
+            return () => {
+              const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
+              const bag = DiBag.createBuilder()
+                .register({
+                  owned: DiBag.withDisposal(
+                    DiBag.fromSyncFactory((): ApplicationServices => installed.services),
+                    async () => {
+                      if (disposal === 'never') return new Promise<void>(() => undefined);
+                      await scheduler.schedule(
+                        Promise.reject(new Error('the page runtime refused to dispose')),
+                        'dispose the page runtime',
+                      );
+                    },
+                  ),
+                })
+                .build();
+              const services = bag.resolve('owned');
+              return { services, close: (options) => bag.close(options) };
             };
           };

@@ -121,15 +226,42 @@ describe("the page's bootstrap, under generated interleavings", () => {
             };
           };

+          /**
+           * What was live just before a `pagehide` command fires, so the
+           * property can assert afterward that it did not stay live — this
+           * file's own `'a runtime live before a pagehide trigger was still
+           * the one live at the end'` invariant's own record.
+           */
+          const preTriggerLive: ApplicationServices[] = [];
+          /**
+           * Whether a `bootstrap` command has run yet in this sequence —
+           * `pagehide`/`pageshow` only have a listener to reach once one has:
+           * a bare `slot.replace()` with no bootstrap registers nothing, so a
+           * runtime it published staying live across a `pagehide` is correct,
+           * not a finding (measured: without this guard, the shrunk
+           * counterexample `[{"kind":"replace","disposal":"settles"},
+           * {"kind":"settle"},{"kind":"pagehide"}]` failed invariant 5 on
+           * exactly that non-scenario).
+           */
+          let hasBootstrapped = false;
+          const noteTrigger = (): void => {
+            if (!hasBootstrapped) return;
+            const state = slot.snapshot();
+            if (state.status !== 'live') return;
+            triggeredWhileLive += 1;
+            preTriggerLive.push(state.services);
+          };
+
           for (const command of commands) {
             if (command.kind === 'bootstrap') {
+              hasBootstrapped = true;
               pending.push(
                 bootstrapApplication(globalThis.document.createElement('div'), {
-                  acquire,
-                  slot,
+                  acquire: buildAcquire(command.disposal),
+                  slot: trackedSlot,
                   mount,
                   app: FakeApp,
-                  eventTarget: new EventTarget(),
+                  eventTarget,
                 }).then(
                   () => {
                     bootstrapOutcomes.push('resolved');
@@ -142,11 +274,31 @@ describe("the page's bootstrap, under generated interleavings", () => {
             } else if (command.kind === 'retire') {
               pending.push(slot.retire().then(undefined, () => undefined));
             } else if (command.kind === 'replace') {
-              pending.push(slot.replace(acquire).then(undefined, () => undefined));
+              pending.push(
+                slot.replace(buildAcquire(command.disposal)).then(undefined, () => undefined),
+              );
             } else if (command.kind === 'retireFromListener') {
               listenerRetires = true;
+            } else if (command.kind === 'pagehide') {
+              pagehideCount += 1;
+              noteTrigger();
+              eventTarget.dispatchEvent(new Event('pagehide'));
+            } else if (command.kind === 'pageshow') {
+              if (command.persisted) pageshowPersistedCount += 1;
+              else pageshowNonPersistedCount += 1;
+              eventTarget.dispatchEvent(pageShowEvent(command.persisted));
             } else if (scheduler.count() > 0) {
               await scheduler.waitNext(1);
+            } else {
+              // Building a fresh runtime touches no scheduled promise at all
+              // (`Acquire<S>` is synchronous; only a disposal calls
+              // `scheduler.schedule`), so a `settle` command with nothing yet
+              // scheduled still has to yield once, or an initial `bootstrap`
+              // never advances past its own single microtask hop before a
+              // later command in the same sequence reads the slot's status —
+              // exactly why `triggeredWhileLive` read 0 on every one of 300
+              // runs before this `else` existed.
+              await Promise.resolve();
             }
           }

@@ -181,9 +333,35 @@ describe("the page's bootstrap, under generated interleavings", () => {
               'constructing',
             );
           }
+          // 5. A runtime that was live the instant a `pagehide` command fired is
+          //    not the runtime still live once every command has drained: the
+          //    trigger retired it (and, if the slot rebuilt, a later
+          //    `bootstrap`/`replace`/`pageshow` published a fresh one in its
+          //    place), it never just sat there unaffected.
+          const finalState = slot.snapshot();
+          if (finalState.status === 'live') {
+            expect(
+              preTriggerLive,
+              'a runtime live before a pagehide trigger was still the one live at the end',
+            ).not.toContain(finalState.services);
+          }
         },
       ),
-      { seed: 20260924, numRuns: 200 },
+      { seed: 20260924, numRuns: 300 },
     );
+
+    expect(pagehideCount, 'the pinned run never issued a pagehide').toBeGreaterThan(0);
+    expect(
+      pageshowPersistedCount,
+      'the pinned run never issued a persisted pageshow',
+    ).toBeGreaterThan(0);
+    expect(
+      pageshowNonPersistedCount,
+      'the pinned run never issued a non-persisted pageshow',
+    ).toBeGreaterThan(0);
+    expect(
+      triggeredWhileLive,
+      'the pinned run never fired a pagehide while a runtime was genuinely live',
+    ).toBeGreaterThan(0);
   }, 120_000);
 });
```

Rehearsed sequentially, this response: `patch`-applying slice 1's own diff (above) to a scratch
copy of `76f871d8`'s file reproduces slice 1's own committed tree byte-for-byte; `patch`-applying
this diff on top of that same scratch copy reproduces this slice's own finished tree
byte-for-byte. `tsc --build --force` over the intermediate, post-slice-1 tree: exit 0.

### 7.5 `application-bootstrap.strictmode.test.tsx` — the diff

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-bootstrap.strictmode.test.tsx b/apps/wbs/fe-01/src/runtime/application-bootstrap.strictmode.test.tsx
index 69f447a8..5430326b 100644
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.strictmode.test.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.strictmode.test.tsx
@@ -95,6 +95,7 @@ describe('the page under Strict Mode', () => {
           slot,
           mount: (element, options) => createRoot(element, options),
           app: App,
+          eventTarget: new EventTarget(),
         });
       });

```

### 7.6 `lifetime-bfcache-probe.ts` — new file

```diff
diff --git a/apps/wbs/fe-01/e2e/lifetime-bfcache-probe.ts b/apps/wbs/fe-01/e2e/lifetime-bfcache-probe.ts
new file mode 100644
index 00000000..8a4d8696
--- /dev/null
+++ b/apps/wbs/fe-01/e2e/lifetime-bfcache-probe.ts
@@ -0,0 +1,90 @@
+import { createRoot } from 'react-dom/client';
+
+import { bootstrapApplication } from '@/runtime/application-bootstrap';
+import { acquireApplicationRuntime, applicationSlot } from '@/runtime/application-runtime';
+
+/**
+ * What the spec reads back after driving the page through a real
+ * navigate-away-and-back cycle.
+ *
+ * Left on `window` rather than returned from a promise: a real back/forward-cache
+ * restoration resumes this exact JS context (the whole point of the probe), so
+ * the spec reads this global again after `page.goBack()` rather than awaiting
+ * anything that a fresh navigation would have discarded.
+ */
+export interface LifetimeBfcacheProbe {
+  /** How many times `acquireApplicationRuntime` actually ran. */
+  readonly builds: () => number;
+  /** Every `pageshow.persisted` this page's own listener observed, in order. */
+  readonly pageshowPersisted: () => boolean[];
+  /**
+   * Whether a write-then-read round trip through `remembered.ganttDetail`
+   * succeeded, once per time the slot reached `live` — so once for the first
+   * build, and again after a persisted restore rebuilds it.
+   */
+  readonly usableAtLive: () => boolean[];
+}
+
+const builds: { count: number } = { count: 0 };
+const pageshowPersisted: boolean[] = [];
+const usableAtLive: boolean[] = [];
+
+// Not the bootstrap's own listener — a second one, registered directly on this
+// probe's own page, purely as independent evidence that a real `pageshow` (not
+// a synthetic jsdom one) actually carried `persisted: true`. The bootstrap's
+// own listener is the one this probe is proving, so this file does not read
+// its outcome through it.
+window.addEventListener('pageshow', (event: PageTransitionEvent) => {
+  pageshowPersisted.push(event.persisted);
+});
+
+// Reads `applicationSlot` directly rather than only counting acquisitions:
+// `acquireApplicationRuntime`'s own `isLive` is wired to this exact singleton
+// (`application-runtime.ts`'s own `acquireApplicationRuntime`), so a service
+// this subscription cannot read as live is a service every one of its own
+// members already refuses. Recording this at the instant the slot reaches
+// `live` — not inside `acquire()`, which runs *before* the slot publishes —
+// is what makes the check meaningful: a write attempted mid-construction
+// would always find the slot not yet live and prove nothing.
+applicationSlot.subscribe(() => {
+  const state = applicationSlot.snapshot();
+  if (state.status !== 'live') return;
+  try {
+    state.services.remembered.ganttDetail.write(true);
+    usableAtLive.push(state.services.remembered.ganttDetail.read() === true);
+  } catch {
+    usableAtLive.push(false);
+  }
+});
+
+const Probe = (): null => null;
+
+const host = document.createElement('div');
+document.body.append(host);
+
+// `applicationSlot`, the real production singleton — not a fresh slot. A
+// fresh slot paired with `acquireApplicationRuntime` publishes services whose
+// own `isLive` still reads the singleton, which this probe never touches: a
+// mismatch reproduced directly (restored below in `usableAtLive`'s own
+// comment) as `applicationSlot.snapshot().status === 'empty'` while the
+// probe's own slot read `live`, so every access threw "the page withdrew this
+// preference store before the access completed". This page owns nothing else
+// that could read `applicationSlot`, so using the real one here is exactly as
+// isolated as a fresh one would have been, and it is the one the real
+// `isLive` check actually reads.
+void bootstrapApplication(host, {
+  acquire: () => {
+    builds.count += 1;
+    return acquireApplicationRuntime();
+  },
+  slot: applicationSlot,
+  mount: (element, options) => createRoot(element, options),
+  app: Probe,
+  eventTarget: window,
+});
+
+(globalThis as unknown as { lifetimeBfcacheProbe: LifetimeBfcacheProbe }).lifetimeBfcacheProbe = {
+  builds: () => builds.count,
+  pageshowPersisted: () => pageshowPersisted,
+  usableAtLive: () => usableAtLive,
+};
```

### 7.7 `lifetime-bfcache.spec.ts` — new file

```diff
diff --git a/apps/wbs/fe-01/e2e/lifetime-bfcache.spec.ts b/apps/wbs/fe-01/e2e/lifetime-bfcache.spec.ts
new file mode 100644
index 00000000..d0228661
--- /dev/null
+++ b/apps/wbs/fe-01/e2e/lifetime-bfcache.spec.ts
@@ -0,0 +1,121 @@
+import { expect, test } from '@playwright/test';
+
+import { buildBrowserProbeBundle } from './browser-probe-bundle';
+// A type-only import: Playwright loads a spec in Node, so a value imported from
+// the probe would execute it here, before a browser exists.
+import type { LifetimeBfcacheProbe } from './lifetime-bfcache-probe';
+
+/**
+ * Regular Chromium, not `chromium-headless-shell` — the default project's own
+ * channel — and Playwright's own bfcache-disabling launch switch removed.
+ *
+ * `chromium-headless-shell` refuses every back/forward-cache restoration as an
+ * automation-delegate policy independent of `--disable-back-forward-cache`
+ * (`node_modules/playwright-core/lib/coreBundle.js` selects it for an ordinary
+ * headless launch; `channel: 'chromium'` selects the regular, non-headless-shell
+ * build instead). Verified against a standalone served-pages probe under this
+ * exact configuration: `pageshow.persisted` read `true`, reproduced three times,
+ * with zero `Page.backForwardCacheNotUsed` CDP events — this file is that same
+ * configuration, driving the real production bootstrap instead of two static
+ * pages.
+ *
+ * CI already installs regular Chromium alongside `chromium-headless-shell`
+ * (`.github/workflows/ci.yml`'s own `bunx playwright install --with-deps
+ * chromium` installs both — Playwright's own `browsers.json` marks both
+ * `installByDefault` for that one argument); this spec's own project stays
+ * opt-in as a verification-policy choice (`playwright.config.ts`'s own
+ * comment), not because the channel is unavailable.
+ */
+test.use({
+  launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
+});
+
+/** An origin nothing serves, fulfilled by the route below — two pages on it. */
+const origin = 'https://lifetime-bfcache-probe.invalid';
+
+test('a persisted pageshow rebuilds the application runtime after a real back/forward-cache restoration', async ({
+  page,
+}) => {
+  test.setTimeout(120_000);
+
+  const bundle = await buildBrowserProbeBundle('e2e/lifetime-bfcache-probe.ts');
+  await page.route('**/*', async (route) => {
+    const url = route.request().url();
+    if (url === `${origin}/a`) {
+      await route.fulfill({
+        status: 200,
+        contentType: 'text/html',
+        body:
+          '<!doctype html><meta charset="utf-8"><title>a</title>' +
+          `<script type="module">${bundle.code}</script>` +
+          '<a id="go" href="/b">go</a>',
+      });
+      return;
+    }
+    if (url === `${origin}/b`) {
+      await route.fulfill({
+        status: 200,
+        contentType: 'text/html',
+        body: '<!doctype html><meta charset="utf-8"><title>b</title>back with browser.goBack()',
+      });
+      return;
+    }
+    await route.abort('blockedbyclient');
+  });
+
+  await page.goto(`${origin}/a`);
+  const readBuilds = async (): Promise<number> =>
+    await page.evaluate(() =>
+      (
+        globalThis as unknown as { lifetimeBfcacheProbe: LifetimeBfcacheProbe }
+      ).lifetimeBfcacheProbe.builds(),
+    );
+  await expect.poll(readBuilds, 'the probe never acquired its first runtime').toBe(1);
+
+  await page.click('#go');
+  await page.waitForURL('**/b');
+  // `waitUntil: 'commit'` rather than the default `'load'`: a bfcache-restored
+  // page never fires a fresh `load` event, so the default wait would time out
+  // on exactly the restoration this spec is proving happens (watched: 30000ms
+  // exceeded, waiting for "load", against this exact configuration).
+  await page.goBack({ waitUntil: 'commit' });
+  // `expect(page).toHaveURL(...)`, not `waitForURL`: Playwright's own
+  // `waitForURL` calls `waitForLoadState(waitUntil ?? 'load', ...)` even when
+  // the URL already matches (`playwright-core/lib/coreBundle.js`), so it is
+  // not a bare address assertion — it is a second, undocumented wait for
+  // `load`, which a bfcache restoration never fires. `toHaveURL` polls the
+  // address alone.
+  await expect(page).toHaveURL(`${origin}/a`);
+
+  const readPersisted = async (): Promise<boolean[]> =>
+    await page.evaluate(() =>
+      (
+        globalThis as unknown as { lifetimeBfcacheProbe: LifetimeBfcacheProbe }
+      ).lifetimeBfcacheProbe.pageshowPersisted(),
+    );
+  const readUsable = async (): Promise<boolean[]> =>
+    await page.evaluate(() =>
+      (
+        globalThis as unknown as { lifetimeBfcacheProbe: LifetimeBfcacheProbe }
+      ).lifetimeBfcacheProbe.usableAtLive(),
+    );
+
+  await expect
+    .poll(readPersisted, 'the restoration never delivered a persisted pageshow')
+    .toContain(true);
+  await expect
+    .poll(readBuilds, 'a persisted pageshow did not rebuild the application runtime')
+    .toBe(2);
+  // Not just that a second build ran — that its own services are readable and
+  // writable, both after the first publication and after this restoration.
+  // Pairing `acquireApplicationRuntime` with a slot other than the real
+  // `applicationSlot` its own `isLive` reads would make every access here
+  // throw "the page withdrew this preference store before the access
+  // completed" while `builds()` still read correctly — this is the assertion
+  // that catches that mismatch, not `builds()` alone.
+  const usable = await readUsable();
+  expect(usable, 'the application runtime was not usable after every live publication').toEqual([
+    true,
+    true,
+  ]);
+});
```

### 7.8 `playwright.config.ts` — the diff

```diff
diff --git a/apps/wbs/fe-01/playwright.config.ts b/apps/wbs/fe-01/playwright.config.ts
index b9044388..b9b2027b 100644
--- a/apps/wbs/fe-01/playwright.config.ts
+++ b/apps/wbs/fe-01/playwright.config.ts
@@ -263,6 +263,14 @@ export default defineConfig({
   projects: [
     {
       name: 'chromium',
+      // `chromium-regular` owns `lifetime-bfcache.spec.ts`: it needs the
+      // regular Chromium channel this default project's own
+      // `chromium-headless-shell` build cannot restore a page from
+      // back/forward cache under (050-7-e's own plan document, section 4.7).
+      // Excluded here rather than left to collide with that project's own
+      // `testMatch`, which would otherwise also pick it up and fail it under
+      // the wrong browser.
+      testIgnore: /lifetime-bfcache\.spec\.ts/,
       use: {
         ...devices['Desktop Chrome'],
         // After the spread, not in the top-level `use`: a project's options
@@ -277,6 +285,26 @@ export default defineConfig({
         viewport: { width: 1400, height: 900 },
       },
     },
+    // `chromium-regular` (`lifetime-bfcache.spec.ts`) is added to `projects`
+    // only when a planner opts in with `PLAYWRIGHT_CHROMIUM_REGULAR=1` —
+    // never unconditionally. CI already installs regular Chromium alongside
+    // `chromium-headless-shell` (`.github/workflows/ci.yml`'s own `bunx
+    // playwright install --with-deps chromium` installs both), so this is a
+    // verification-policy choice, not an availability one: this file's own
+    // `webServer`/`e2e` target run unconditionally in CI, and an
+    // always-present project here would run this one narrow bfcache
+    // regression on every ordinary `bunx playwright test` invocation — a
+    // scope decision this packet does not make unilaterally. See this
+    // packet's own plan document, section 4.7, for the exact command.
+    ...(process.env['PLAYWRIGHT_CHROMIUM_REGULAR'] === '1'
+      ? [
+          {
+            name: 'chromium-regular',
+            testMatch: /lifetime-bfcache\.spec\.ts/,
+            use: { ...devices['Desktop Chrome'], channel: 'chromium' },
+          },
+        ]
+      : []),
   ],
   // Every port and every cross-tier URL below comes from `portShift`, and none
   // of them is written twice: an environment variable that moved a listener
```

### 7.9 `playwright-config.test.ts` — the diff

```diff
diff --git a/apps/wbs/fe-01/playwright-config.test.ts b/apps/wbs/fe-01/playwright-config.test.ts
index cb79e1a1..1591f9a0 100644
--- a/apps/wbs/fe-01/playwright-config.test.ts
+++ b/apps/wbs/fe-01/playwright-config.test.ts
@@ -49,6 +49,39 @@ function serversOf(config: { webServer?: unknown }): WebServerEntry[] {
   return webServer as WebServerEntry[];
 }

+interface ProjectEntry {
+  name?: string;
+  testIgnore?: RegExp | RegExp[];
+  testMatch?: RegExp | RegExp[];
+  use?: { channel?: string };
+}
+
+/**
+ * Loads the config with `PLAYWRIGHT_CHROMIUM_REGULAR` set or absent — the one
+ * environment variable that decides whether `chromium-regular` exists in
+ * `projects` at all (`playwright.config.ts`, section 4.7 of the 050-7-e plan).
+ */
+async function loadConfigWithChromiumRegular(set: boolean) {
+  vi.resetModules();
+  delete process.env['E2E_PORT_SHIFT'];
+  if (set) process.env['PLAYWRIGHT_CHROMIUM_REGULAR'] = '1';
+  else delete process.env['PLAYWRIGHT_CHROMIUM_REGULAR'];
+  const { default: config } = await import('./playwright.config');
+  return config;
+}
+
+function projectsOf(config: { projects?: unknown }): ProjectEntry[] {
+  const { projects } = config;
+  if (!Array.isArray(projects)) throw new Error('the config declares no projects to assert on');
+  return projects as ProjectEntry[];
+}
+
+const matches = (pattern: RegExp | RegExp[] | undefined, value: string): boolean => {
+  if (pattern === undefined) return false;
+  const patterns = Array.isArray(pattern) ? pattern : [pattern];
+  return patterns.some((one) => one.test(value));
+};
+
 describe('the browser gate’s port shift', () => {
   beforeEach(() => {
     vi.spyOn(process, 'cwd').mockReturnValue(repoRoot);
@@ -244,6 +277,65 @@ describe('the browser gate’s port shift', () => {
   });
 });

+describe('the chromium-regular project gate', () => {
+  beforeEach(() => {
+    vi.spyOn(process, 'cwd').mockReturnValue(repoRoot);
+  });
+  afterEach(() => {
+    vi.restoreAllMocks();
+    delete process.env['PLAYWRIGHT_CHROMIUM_REGULAR'];
+  });
+
+  it('does not exist when PLAYWRIGHT_CHROMIUM_REGULAR is unset — the default gate', async () => {
+    const projects = projectsOf(await loadConfigWithChromiumRegular(false));
+
+    // Proof: on 2026-09-23, adding `chromium-regular` to `projects`
+    // unconditionally (removing the `PLAYWRIGHT_CHROMIUM_REGULAR === '1'`
+    // guard in `playwright.config.ts`) made this assertion fail: `expected 2
+    // to be 1` — the exact shape a silent gate regression would take, since
+    // every ordinary `bunx playwright test` run — CI's included — would then
+    // also run this one narrow bfcache regression under the regular Chromium
+    // channel, not because that channel is unavailable (CI installs it), but
+    // because that scope decision belongs to a planner, not to every run.
+    expect(projects).toHaveLength(1);
+    expect(projects.map((project) => project.name)).toEqual(['chromium']);
+  });
+
+  it('exists, gated to the bfcache spec, only when a planner opts in', async () => {
+    const projects = projectsOf(await loadConfigWithChromiumRegular(true));
+    const regular = projects.find((project) => project.name === 'chromium-regular');
+
+    expect(projects).toHaveLength(2);
+    if (regular === undefined) throw new Error('chromium-regular was not added');
+    // Proof: on 2026-09-23, corrupting this project's own `testMatch` to a
+    // pattern matching nothing made this assertion fail: `expected false to
+    // be true` — the project would exist but never actually select the spec
+    // it owns.
+    expect(matches(regular.testMatch, 'e2e/lifetime-bfcache.spec.ts')).toBe(true);
+    expect(matches(regular.testMatch, 'e2e/dark-mode.spec.ts')).toBe(false);
+    // Proof: on 2026-09-23, dropping `channel: 'chromium'` from this
+    // project's own `use` made this assertion fail: `expected undefined to
+    // be 'chromium'` — the project would exist and match the right spec, but
+    // launch the default (headless-shell) channel that cannot restore from
+    // bfcache at all, silently defeating the whole point of the project.
+    expect(regular.use?.channel).toBe('chromium');
+  });
+
+  it('the default project excludes the bfcache spec either way', async () => {
+    for (const config of [
+      await loadConfigWithChromiumRegular(false),
+      await loadConfigWithChromiumRegular(true),
+    ]) {
+      const [defaultProject] = projectsOf(config);
+      // Proof: on 2026-09-23, removing the default project's own
+      // `testIgnore` made this assertion fail: `expected false to be true` —
+      // the default `chromium` project (headless-shell) would then also try
+      // to run the bfcache spec itself and fail it under the wrong browser.
+      expect(matches(defaultProject.testIgnore, 'e2e/lifetime-bfcache.spec.ts')).toBe(true);
+    }
+  });
+});
+
 describe('the packaged browser gate', () => {
   const roots: string[] = [];

```

## 8. Stop conditions

Every condition below names its own command (section 3.4's own four), its own baseline, and the
exact point in the slice sequence it applies from — never a bare absolute, and never one command's
own delta checked against a different command's own count. None of these were observed true when
checked, at the point each one applies:

- `git diff --stat apps/wbs/fe-01/src/runtime/lifetime-slot.ts
apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts` is non-empty, at any point. (False — both
  untouched throughout.)
- **Once slice 1's own step 1b (implement) is complete**, `(cd apps/wbs/fe-01 && bunx vitest run
src/runtime/application-bootstrap.test.tsx)` exits non-zero, or reports fewer than `17` tests.
  (False: exit 0, `17 passed (17)`. **Before** step 1b — on the unchanged tree, with only the test
  file edited — this file legitimately reports `11 failed | 6 passed (17)`, and that is step 1a's
  own expected red, not a stop condition; the starting tree before any test edit reports its
  original `6 passed (6)`, also not a stop.)
- **Each slice's own sandbox-subset count** (`(cd apps/wbs/fe-01 && bunx vitest run --config
vitest.node.config.ts --exclude playwright-config.test.ts --exclude
src/components/wbs/short-date.test.ts)`) changes at all, **within that same attempt**, between that
  same slice's own pre-edit "start" figure (`slice1-baseline-sandbox`, `slice2-baseline-sandbox`,
  `slice3-baseline-sandbox`, section 6) and its own post-edit confirmation
  (`slice1-sandbox-confirm`, `slice2-sandbox-confirm`, `slice3-sandbox-confirm`, section 6, Important
  2 of review 9) — never checked against a bare historical absolute carried over from an earlier
  response. This packet's own node-tier change lands entirely inside the one file the sandbox
  subset excludes, so all six checked points — three pre-edit, three post-edit — must read the same
  figure. (False at every one of the six: `674` throughout.)
- `wbs-fe-01:typecheck`, `wbs-fe-01:lint`, or `nx format:check --all` exits non-zero on the tree as
  committed, at any slice. (False for all three, every time.)
- **Slice 1's own owned-path count** (`(cd apps/wbs/fe-01 && bunx vitest run src/runtime/
src/modules/preferences/)`) does not read unchanged file count and exactly 11 additional tests
  over slice 1's own named "start" figure (`baseline-owned`, section 6, `99` tests) once slice 1's
  own step 1b is complete.
  **Slice 2's own owned-path count** changes at all from slice 2's own named "start" figure
  (`slice2-baseline-owned`, section 6, `110` tests) once slice 2 is complete — it must not, because
  slice 2 changes an existing collected test, `application-bootstrap.model.test.tsx`, without adding
  a test **case** (Minor 1 of review 7), and adds four comment-only lines to
  `application-bootstrap.tsx` — no behaviour, so no case either. Slice 3 touches no owned-path file,
  so this same count must still hold unchanged after slice 3. (False at every checked point: `+11`
  exactly once slice 1 lands, unchanged at `110` through slices 2 and 3.)

  | Owned-path files delta | Owned-path tests delta | Relative to                 |
  | ---------------------- | ---------------------- | --------------------------- |
  | `0`                    | `+11`                  | slice 1's own start (`99`)  |
  | `0`                    | `+0`                   | slice 2's own start (`110`) |

- **Each slice's own strict-OpenSpec figure** (the README's own exact block, section 6, verbatim)
  exits non-zero, produces anything other than one JSON object with integer `passed`/`failed`
  counts, or its `passed`/`items` figure changes at all, **within that same attempt**, from that
  same slice's own named "start" figure (`openspec-slice1-start`, `openspec-slice2-start`,
  `openspec-slice3-start`, section 6) — never from section 3.4's own historical figure read as an
  absolute. (False: `114`/`114`/`0`, unchanged, checked at every slice's own start **and** end — six
  named runs across the three slices, section 6, closing review 7's Important 3.)
- The extended model test's own coverage counters (`pagehideCount`, `pageshowPersistedCount`,
  `pageshowNonPersistedCount`, `triggeredWhileLive`) complete 300 runs with any one of them `=== 0`.
  (False: each is `> 0`.)
- Any mutation in section 6's own inventory (rows 1–19) leaves its own named test(s) or invariant
  passing, or fails to typecheck. (False: each fails exactly the named test(s) or invariant, and
  every mutant is type-correct.)
- `bunx playwright test --config apps/wbs/fe-01/playwright.config.ts` (no `--project`, no
  `PLAYWRIGHT_CHROMIUM_REGULAR`) tries to launch the regular `chromium` channel. (False:
  `chromium-regular` is added to `projects` only when that environment variable is set to `1`, and
  the default `chromium` project's own `testIgnore` excludes `lifetime-bfcache.spec.ts` either way —
  both halves asserted directly and with a watched negative in `playwright-config.test.ts`, section
  6, section 7.9.)
- **Once slice 3 is complete**, `wbs-fe-01:test:unit` reports a file count other than the
  planner's own `planner-baseline-test-unit` figure (section 3.4, captured at actual dispatch, not
  this document's own historical `694`) or a test count other than that same figure **plus 3** — or
  `wbs-fe-01:test` reports a file count other than the planner's own `planner-baseline-test-whole`
  figure (section 3.4, not this document's own historical `2981`) or a UTC test count other than
  that same figure **plus 14**, or its own zoned file/test counts at all (zoned stays unchanged).
  Both are planner-only (section 3.4): the pre-implementation baseline is the planner's own first
  dispatch step, captured on the actual dispatch base before slice 1 begins, and the post-slice-3
  total is the same command rerun after slice 3 lands — the delta is always this same dispatch's own
  before/after pair, never this document's own authoring-time rehearsal checked against a later
  dispatch's total. (This response's own historical rehearsal, section 3.4: unit tests unchanged in
  file count, `+3` tests; whole-target UTC unchanged in file count, `+14` tests; zoned unchanged —
  consistent with the required deltas, offered as illustration only.)

## 9. `verify.md` sections and `tasks.md`'s own appended note

Each of this packet's own three slices (section 6) appends its own `verify.md` section, in that
same slice's own commit — slice 3's own section is the one that also carries this note and checks
(or, here, deliberately does not check) task 5.

**`tasks.md`'s own appended note.** Task 5's own checkbox **stays unchecked**: its own wording
names "hot-reload disposal" as part of the same item, and this packet cuts HMR entirely rather than
closing it. Appended instead, without checking the box:

```text
- [ ] 5. Page hide, hot-reload disposal and persisted restoration join one
      application retirement; restoration rebuilds only after it succeeds.
      Page hide and persisted restoration are closed by 050-7-e: `pagehide`
      retires the runtime through the slot and invalidates the mounted React
      root; a persisted `pageshow` rebuilds through the same path, joining
      whatever retirement is already pending with no bookkeeping of its own
      (the slot's own serialization is the join); a retirement that rejects
      or times out leaves the sanitized fatal page showing, redrawn without a
      second report across a hide-and-restore of an already-fatal page. Hot-
      reload disposal is this packet's own explicit non-goal after three
      review rounds each found a further HMR ownership race — see
      `docs/superpowers/plans/2026-09-21-batch-6/050-7-e-page-lifecycle.md`,
      sections 1 and 11 — and is handed to 050-7-e2, which checks this box
      once it lands. A bounded Chromium application-lifecycle case exists
      (`e2e/lifetime-bfcache-probe.ts`, `lifetime-bfcache.spec.ts`) and was
      run through the real `wbs-fe-01:e2e` Nx target, `CI=1`, a checked-free
      port shift: one test, passing (section 4.7 has the exact command and
      output).
```

## 10. What this packet leaves, in dependency order

1. **050-7-e2 — hot-module replacement of the bootstrap module.** Section 11 has the full
   hand-over: the three reproduced races as adversarial cases, and the requirement that the
   ownership state machine is designed and model-tested before implementation.
2. **050-7-f through 050-7-j — the session runtime, the project runtime, log out, the project
   prerequisites, and the boundary/module-index checks (tasks 6–13).**
3. **The five call sites, `modules/preferences/composition.ts`'s deletion, OpenSpec task 12's K2
   debt disposition.**
4. **Verifying the bounded Chromium application case against the executor's own resulting
   tree.** Section 4.7 and section 6's own slice 3 record a real, passing run — `1 passed (8.8s)`
   — but that run was this response's own planner-style rehearsal, on this response's own
   worktree, not a run against whatever tree the dispatched executor actually produces. The planner
   still runs it again, after slice 3 lands, against that tree specifically, before treating this
   case as verified for the packet as merged.
5. **Whether the session, catalog and project runtimes' own restoration is complete.**

## 11. Hand-over to 050-7-e2: hot-module replacement, with an ownership state machine designed first

**Do not implement HMR support for this bootstrap again without first writing down, as a state
machine, who owns drawing and reporting at every point a successor can appear — including after a
failure is already on screen — and proving that machine against generated interleavings before any
implementation exists.** Three rounds of "fix the bug the reviewer found" each produced a
narrower bug the same shape of reasoning could not see in advance. The state machine needs at
least these states and transitions, each with a name, not only a token:

- **Unchallenged** — the only instance so far; owns drawing and reporting unconditionally.
- **Superseded-pending** — a successor has bootstrapped; this instance's own still-in-flight work
  (a queued `attempt()`, a pending `retire()`) must reach a fence and stop, exactly as supersession
  already proves for a single instance's own repeated triggers.
- **Superseded-reporting** — a successor exists, but this instance's own retirement failure landed
  before the successor's own first render; this instance is still the one that reports it, because
  nobody else observed it land.
- **Handed-off** — a successor has both bootstrapped _and_ rendered (or shown its own fatal state);
  this instance's own root, if still mounted, is explicitly torn down as part of the hand-off, not
  left for whichever `showFatal` call happens to run next.

**The three reproduced races, as this packet's own adversarial cases for 050-7-e2's own model
test:**

1. Bootstrap → HMR → replacement bootstrap → the _old_ instance's own pending retirement fails.
   (Round 1's own finding: two roots, two reports.)
2. Bootstrap → pagehide → queued persisted `pageshow` → HMR → replacement bootstrap → the pagehide's
   own retirement rejects. (Round 2's own finding: `lifetime-slot.ts`'s terminal-refusal-before-
   ordinal-fence lets the raw refusal reach an already-superseded `attempt()`'s own `catch`.)
3. Bootstrap → HMR → disposal rejection → failure displayed → successor bootstrap. (Round 3's own
   finding, in that exact order: the _old_ instance's own retirement fails and its fatal page is
   already showing **before** any successor exists, and only then does a successor bootstrap. An
   ownership token alone does not release that already-mounted root or dedupe against the
   occurrence it already logged — the exact gap **Handed-off** above exists to close. Review 4's
   own Important 5 found an earlier draft of this hand-over had substituted a different ordering
   — replacement renders, then the old retirement fails — which is not the race review 3 reported;
   this is.)

Each needs a rejection and a timeout variant, generated over interleavings (not only as named
examples), with a watched negative for whatever mechanism 050-7-e2 designs — the same discipline
this packet applied to root invalidation and the report/draw split, applied one level deeper.

## 12. Assumptions recorded rather than asked

- **`pagehide`'s own `persisted` flag is intentionally unread by this trigger, and both values are
  tested.**
- **`import.meta.hot` is not read at all any more.** `main.tsx` needs no code change either way —
  verified by inspection.
- **One of the two sandbox-excluded files, `playwright-config.test.ts`, is directly modified by
  this packet — the other, `short-date.test.ts`, is unaffected.** Section 6's own slice 3 runs
  only the new describe block inside the modified file, never the whole file, inside the sandbox;
  the whole file (including the new cases) is planner-only, alongside the target that already
  needed the planner for this exact reason.
- **`apps/wiki/cli/src/admission/claims.db.test.ts`'s own known contention flake is out of scope,
  with a narrow recovery instruction, not a blanket exemption.** This packet's own file plan never
  touches that file or anything it reads. If a planner's own whole-suite run hits its named
  failure — `bounds terminal lock contention and retries until a held write commits` — record the
  exact failure and rerun that one file once; every other failure remains a stop, and this packet
  is not what is being verified when that flake is what reran.

## 13. Disposition of review 1

**Sections 13–17 are historical.** Every red/green count, mutation number, and file inventory
quoted inside a numbered disposition below is what that round's own rehearsal observed _at the
time_ — later rounds renumbered mutations, split slices, and (review 7) corrected at least one
count that had never actually been rehearsed against the unchanged tree. Section 6's own
executable steps and section 8's own stop conditions are the only current, authoritative source;
where a figure below disagrees with them, section 6/section 8 wins and the entry here is marked
superseded, with a pointer to the current step.

Every finding, restated in full.

### Critical

1. **Restoration does not perform the required complete bootstrap — FIXED, section 4.1.** Root
   invalidation; proved with a real mount effect.
2. **HMR retains the old bootstrap's root and fatal subscription — SUPERSEDED BY THE CUT, section 1.** The mechanism this fixed (`unsubscribe()`) no longer exists at all: there is no HMR, and no
   second subscription to leak.
3. **Node-tier deltas and the red count both wrong — FIXED, section 6, section 8.** This response's
   own final counts (`15` example cases, `+9` owned-path) are rehearsed fresh rather than carried
   forward.
4. **Slice 3 could not access the evidence it had to publish — FIXED, section 6.** One slice, one
   commit, in this final cut.

### Important

1. **The Chromium justification was unsupported — FIXED, section 4.7.** Now reproduced with the
   correct channel, and turned into a bounded application case rather than only a static-page probe.
2. **Coverage counted event issuance, not state traversal — FIXED, section 7.4.**
3. **Listener-removal assertions could pass with the wrong listener removed — MOOT AFTER THE CUT,
   section 6.** No listener is ever removed in the without-HMR design.
4. **A mandatory sabotage needed invented code — FIXED, section 6's own mutation inventory.**

### Minor

1–3. **Factual references, parameter names and the known-flake disposition — FIXED, unchanged in
substance from round 1's own response.**

## 14. Disposition of review 2

### Critical

1. **HMR supersession does not suppress pending failure handling — SUPERSEDED BY THE CUT, section
   1, section 11.** This was the ownership-token design review 3 found a further gap in; cutting
   HMR removes the whole mechanism rather than patching it a third time.
2. **Restoring an already-fatal page leaves it blank — FIXED, section 4.5, section 6 rows 9–10.**
   Still true and still proved in the without-HMR design: `reportedFault`/`drawnFault`.
3. **Mandatory proof instructions disagreed with the implementation — FIXED, section 6.** One
   authoritative table this time, no fence-widening claim.

### Important

1. **The Chromium experiment did not justify permanently dropping browser verification — FIXED,
   section 4.7.**
2. **Baseline and stop-count instructions were inconsistent — FIXED, section 3.4, section 8.**
3. **A mandatory input was unavailable at the stated path — FIXED, section 2.**

### Minor

1. **Stale references — FIXED.** `main.tsx:11` named separately (section 3.3); the ownership-token
   design this note referred to no longer exists (section 1).

## 15. Disposition of review 3

### Critical

1. **Delayed HMR takeover leaks the fatal root and reports the same occurrence twice — FIXED BY
   CUTTING HMR, section 1, section 11.** Not patched a fourth time: the execution contract's own
   three-round convergence rule applies, and the whole mechanism — token, `hot`, `hot.dispose` — is
   removed. `bootstrapApplication` is a single, page-lifetime instance; section 4.3 states why that
   makes an ownership mechanism unnecessary rather than merely fixed. 050-7-e2 owns the redesign,
   with the three reproduced races as its own adversarial cases (section 11).
2. **Mandatory negatives could not be executed as claimed — FIXED, section 6.** One authoritative
   mutation inventory: fifteen rows, each a complete executable edit, a named test or command, and
   an observed result. No fence-widening mutation. Unsubscription accounting is moot (Important 1's
   own disposition, section 6) rather than mis-specified, because there is no more subscription to
   release.
3. **Final listings contradicted mandatory expected counts — FIXED, section 6, section 8.** Every
   count in this response (`15` example cases, `+9` owned, node tier unchanged) is rehearsed fresh
   against the final tree in this same response, not copied from an earlier round.

### Important

1. **Retirement requests were not counted — MOOT AFTER THE CUT, section 6.** The finding was about
   `hot.dispose`'s own `removeEventListener` calls; there is no teardown path left to instrument.
2. **Browser verification remained an undefined follow-up — FIXED, section 4.7.** A bounded
   application case exists, with an owner (the two new files) and an exact command; task 5's own
   checkbox stays unchecked and the browser run itself stays pending planner verification — neither
   claimed complete.
3. **A private host path was included in packet text — FIXED, section 4.7.** Executable basename,
   build and version only; the absolute cache path stays in this response's own private evidence.

### Minor

1. **Several factual explanations contradicted the final design — FIXED.** No `ImportMetaHot`/
   `ViteHotContext` reference remains at all (section 1 removes the whole mechanism). `main.tsx:11`
   is its own numbered caller (section 3.3). Supersession is now described relative to a single
   instance's own repeated triggers, never as a cross-instance guarantee (section 3.2, section 4.3).
   Section 4.6 states plainly that jsdom never launches Chromium at all.

## 16. Disposition of review 4

### Critical

1. **The executor encounters an immediate stop and an impossible expected red result — FIXED,
   section 6, section 8.** The red rehearsed fresh in this response, against this exact test
   addition on the unchanged production tree: `9 failed | 6 passed (15)`, first failure named with
   its own diagnostic (`retires the runtime and invalidates the root when pagehide fires
(persisted=true, …)`: `expected 'live' to be 'empty'`). Every count in section 6 and section 8 is
   now stated relative to an explicit baseline and an explicit point in the slice sequence, never a
   bare absolute that could misfire on the starting tree.
2. **Several "complete executable edits" remained descriptions — FIXED, section 6.** Rows 10, 14
   and 15 each carry the actual replacement code, confirmed to compile (row 15's own `Tree` is
   declared inside the `catch` block's own scope, distinct from the later top-level declaration —
   the two do not conflict). Rows 1, 2, 7 and 8 each name the specific failing test and its own
   diagnostic, not only a file and an aggregate count. Every row states one exact command.
3. **The purported strict OpenSpec check accepted malformed and failing reports — FIXED, section 6.** Replaced with the README's own exact block: one saved report, `length == 1`, object type,
   integer `failed`/`passed`, `failed == 0`, `passed > 0`. Rehearsed this response: `114`/`114`/`0`,
   predicate holds.
4. **The browser probe could pass with an unusable application runtime — FIXED, section 4.7,
   7.6–7.7.** `acquireApplicationRuntime()`'s own `isLive` reads the singleton `applicationSlot`
   unconditionally; the probe now passes that same singleton as its own slot, and asserts a real
   write-then-read round trip through `remembered.ganttDetail` every time the slot reaches `live` —
   after the first publication and after restoration, not only a build count. The mismatched-slot
   wiring was rehearsed and watched fail, isolated from every other test's own use of the singleton:
   `probe slot live production slot empty` / `probe service write threw: Error: the page withdrew
this preference store before the access completed` — the reviewer's own exact reproduction.

### Important

1. **The planner invocation repeated the documented missing-environment failure — FIXED, section
   4.7, section 6.** Replaced with the `wbs-fe-01:e2e` Nx target itself, `CI=1` (refuses server
   reuse), `NX_DAEMON=false`, `PLAYWRIGHT_CHROMIUM_REGULAR=1`, a checked-free `E2E_PORT_SHIFT`
   (a multiple of 300), and the project/spec filter, with the expected one-test result stated and
   the run itself kept pending planner verification.
2. **The browser-exclusion rationale contradicted CI and the installed Playwright implementation —
   FIXED, section 4.7.** Corrected: CI's own `bunx playwright install --with-deps chromium` installs
   both regular Chromium and `chromium-headless-shell`. The project stays opt-in as an explicit
   verification-policy choice — a scope decision about running one narrow regression on every
   ordinary invocation, not an availability constraint. Assertions and a watched negative for the
   gate now exist in `playwright-config.test.ts` (section 6, section 7.9).
3. **The single slice omitted work and mixed executor and planner checks — FIXED, section 6.** Split
   into three slices; every command states executor or planner-only; every slow or fallible command
   is wrapped with the `if cmd >"$log" 2>&1; then status=0; else status=$?; fi` pattern; explicit
   steps add the two browser files and the `playwright.config.ts`/`playwright-config.test.ts` diffs.
4. **New catches silently discarded unexpected failures — FIXED, section 4, section 6, section
   7.1.** `startRetirement()` now rethrows an unexpected (non-fatal) refusal with its own cause,
   proved observable through `process.on('unhandledRejection', …)`, silent when reverted. The
   browser spec's own broad `waitForURL('**/a').catch(() => {})` is removed; the bounded wait now
   asserts the restoration directly, with no swallowed failure.
5. **The hand-over lost the precise round-3 race — FIXED, section 11.** Case 3 now reads exactly:
   bootstrap → HMR → disposal rejection → failure displayed → successor bootstrap — the reviewer's
   own cited ordering, not a substituted one.

### Minor

1. **The path count was wrong — FIXED, section 5.** Ten owned paths, enumerated in the table rather
   than repeated as a literal count elsewhere.
2. **The known-flake assumption was missing its recovery instruction — FIXED, section 12.** Records
   the exact named failure and the rerun-once policy, not only that the file is out of scope.
3. **Planning history was copied into production JSDoc — FIXED, section 7.1.** The top-of-file
   comment now states the operational invariant and its limits only, and links this plan document
   (sections 1 and 11) for the review history and the HMR hand-over rather than reciting them.

## 17. Disposition of review 5

### Critical

1. **The first implementation checkpoint could not pass — FIXED, section 6, section 5.** Slice 1
   now owns `application-bootstrap.model.test.tsx`'s own compatibility fields (`eventTarget`,
   `unmount`), applied explicitly alongside sections 7.3 and 7.5, before the model test's own
   feature expansion (slice 2). The actual intermediate tree — production diff, all four example
   files, and the compatibility-only model test — was typechecked fresh this response: exit 0.
   Mutation row 5 (the post-`replace` fence, whose own counterexample needs the `pageshow`
   command) moved to slice 2's own table, where that command exists.
2. **The executor was instructed to repeat the known sandbox failure — FIXED, section 6, section 12.** Slice 3's own step 3a runs only `-t 'the chromium-regular project gate'` against
   `playwright-config.test.ts`, never the whole file, which contains the README's own named sandbox
   exception. The whole file is planner-only. Section 12 no longer claims both sandbox-excluded
   files are unaffected by this packet. **SUPERSEDED, section 6, step 3a**: the red this item
   claimed (`3 failed | 0 passed (3)`) was never actually rehearsed against the unchanged
   `playwright.config.ts`, which already declares one `chromium` project — review 7 found this;
   the current, rehearsed red is `2 failed | 1 passed (3)`, named in section 6's own step 3a.
3. **The count requirements rejected correct execution — FIXED, section 3.4, section 6, section 8.** Four named commands, four named baselines, stated separately: sandbox node subset `+0`
   (`674` throughout — its own exclusion is exactly why), complete node tier `+3` (`694` → `697`,
   planner-only), complete jsdom tier `+14` (`2981` → `2995`, planner-only, a fresh run — not `+9`
   or `+12`, because this response also added the retained unexpected-refusal test and the map's
   own two-disposer test), owned path `+11` (`99` → `110`, executor-available). Every stop
   condition now names which command and from which step.

### Important

1. **Slice evidence and ownership instructions contradicted each other — FIXED, section 6.** Each
   slice captures its own starting status, runs its own owned/focused baselines, includes
   `verify.md` in its own owned paths, and runs format, build and OpenSpec validation itself
   (executor-available, per the execution contract) — only the whole node/jsdom tiers, the whole
   `playwright-config.test.ts` file, `tool-devsync:test` and the browser run are planner-only.
2. **The unexpected-refusal safety check had no replayable proof — FIXED, section 6, section
   7.2.** The fake-slot test is retained, permanently, in `application-bootstrap.test.tsx` — an
   owned path, run by the slice's own command — using `process.on('unhandledRejection', …)`
   registered and removed inside the test itself; no child process needed, since the rejection
   surfaces on Node's own microtask queue in this environment, not through anything a spawned
   process would be needed to observe. Swallowing the rethrow fails this exact test: `expected […]
to have a length of 1 but got 0`.
3. **The browser instructions remained unreliable — FIXED, section 4.7, section 6, section 7.7.**
   `await page.waitForURL('**/a')` after `goBack` is replaced with `await expect(page).toHaveURL(...)`
   — `waitForURL` calls `waitForLoadState('load', …)` even when the address already matches, per
   `playwright-core`'s own bundle, which is exactly the wait a bfcache restoration never satisfies.
   Port selection is now executable shell, checked free for all three resulting ports. **The
   application probe was actually run**, through the real `wbs-fe-01:e2e` Nx target — `CI=1`,
   `E2E_PORT_SHIFT=300` (checked free), `--project=chromium-regular` — and passed: `1 passed
(8.8s)`. `tools/dev/setup.ts`, already the target's own first command, provisions the three
   `.env` files a prior round assumed were out of reach.
4. **The configuration rationale and R5 evidence remained incomplete — FIXED, section 6, section
   7.8, section 7.9.** Every remaining "not installed"/"nobody installed" comment, in both the
   production config and its own test, is corrected to state the real reason (a verification-policy
   choice, CI already installs the regular channel). Three more mutations, each with its own named
   assertion: the default project's own `testIgnore` removed, `chromium-regular`'s own `testMatch`
   corrupted, and its own `channel: 'chromium'` removed — alongside the existing opt-in-guard
   mutation.
5. **Commands lacked their own working directory, and two rows lacked named failures — FIXED,
   section 6.** Every `bunx vitest run src/runtime/...` command is now `(cd apps/wbs/fe-01 &&
...)`. Rows 11 and 12 each name their own failing test and assertion.
6. **"All of test 4" was not demonstrated — FIXED, section 3.1, section 7.2.** Added the map's own
   two-disposer DI Bag fixture through the page-hide path — one disposer rejecting, one recording
   completion — asserting both the correlated fatal report and that the completing disposer
   actually ran, as its own permanent test rather than a narrowed claim.

### Minor

1. **Path bookkeeping was inaccurate — FIXED, section 5.** No literal count; an explicit
   per-slice "owning slice" column, and each slice's own exact owned-path list in section 6.
2. **The configuration comments pointed to the wrong section — FIXED, section 7.8.** Both
   references now name section 4.7.

## 18. Disposition of review 6

### Critical

1. **Slice 2's diff did not apply after slice 1 — FIXED, section 7.4, section 6.** Regenerated
   against slice 1's own tree: `unmount` stays context, slice 1's own inline `eventTarget: new
EventTarget()` becomes this slice's own named local `eventTarget`. Rehearsed sequentially this
   response: `patch`-applying slice 1's own diff to a scratch copy of `76f871d8`'s file, then this
   diff on top of that same copy, reproduces both slice 1's own committed tree and this slice's own
   finished tree byte-for-byte; `tsc --build --force` over the intermediate tree: exit 0.
2. **The expected red result for step 3a was impossible — FIXED, section 6.** Rehearsed fresh
   against the unchanged config: `2 failed | 1 passed (3)` — `playwright.config.ts` already
   declares one project named `chromium`, so the default-gate assertions already pass; only the
   opt-in-exists and default-project-excludes cases fail, both named with their own diagnostic.

### Important

1. **Per-slice baselines and verification were still missing — FIXED, section 6.** Slice 1's own
   OpenSpec check and build now run before appending `verify.md`, with format last (over the
   appended file too). Slice 2 gets its own pre-edit owned-path baseline and its own OpenSpec/
   build/format block, same ordering. Slice 3 gets an explicit pre-edit sandbox-subset baseline and
   a post-edit sandbox-subset confirmation (still `674`, since this slice's own new cases land only
   in the one file that command excludes). Every "step-0" reference is replaced with the actual
   named baseline (section 3.4 or the specific step that captured it).
2. **Port selection failed open — FIXED, section 6.** Replaced with an explicit `if ports_output=$(ss
-ltn 2>&1); then … else …; fi` check, inspected without an early-closing pipeline, bounded at
   `shift <= 3000`, and an explicit `exit 1` when exhausted. Rehearsed three cases this response: an
   injected `ss() { return 2; }` against the **old** loop printed `accepted shift=300 despite ss
exit 2` and exited 0 (the reviewer's own exact reproduction); against the **fixed** loop, the
   same injection stops with `ss failed to inspect listening ports (exit 2); refusing to guess port
availability` and exit 1, before any Nx invocation. Occupied-then-free ports (a fake `ss`
   reporting one busy port, then a free one) correctly advances to `shift=600`. Real, free ports on
   this host: `accepted shift=300`.
3. **"All of test 4" remained unproved — CLAIMED FIXED, section 3.1, section 7.2, but review 7
   found the packet's own section 7.2 listing had not actually been updated to match this
   paragraph** (`completing`/`rejecting` were still in the old order, `close` still returned
   `bag.close(options)` directly, with none of the assertions below) — the code evidence for this
   round's commit was correct, but the packet text was not regenerated from it. Genuinely fixed in
   section 19. `completing` is now resolved before `rejecting`, so DI Bag's own reverse-order
   disposal runs `rejecting` first and `completing` second — after the rejection, not before it.
   The test now captures the production `close()` promise directly and asserts it rejects with
   `DiBagCleanupError`, and compares the logged occurrence id with the slot's own fatal fault. A
   hand-rolled `close` that rejects without ever running `completing`'s own disposer — simulating
   exactly the "stops at the first failure" defect the reviewer named — fails this exact test: `the
other owned disposer never ran: expected false to be true`.

### Minor

1. **Browser verification status contradicted the current disposition — FIXED, section 10.** Item
   4 now distinguishes the real, passing planner-style rehearsal this response ran (`1 passed
(8.8s)`) from verification against the executor's own resulting tree, which the planner still
   runs after slice 3 lands.
2. **Inventory statements were wrong — FIXED, section 6.** Both mutation-table introductions now
   say "four". Slice 2's own owned-path entry states it changes an existing owned-path file
   without adding another test case.

## 19. Disposition of review 7

Review verdict: READY AFTER FIXES, no criticals. One round-6 report claim was false: the
two-disposer test was fixed in the evidence commit's code but the packet's own section 7.2 listing
was never regenerated to match, so the packet still showed the broken resolve order and the
missing assertions. Fixed this round, with every finding re-verified by `grep -n` against the
finished packet before being reported.

### Important

1. **Port inspection still accepted failure as availability — FIXED, section 4.7, section 6.**
   Both copies (section 4.7's own standalone script and section 6 slice 3's planner block) now run
   the identical, single procedure: `ss` checked separately with `if ports_output=$(ss -ltn
2>&1); then … else status=$?; fi`, its captured output inspected with Bash's own `[[ "$ports_output"
=~ $pattern ]]` — no pipeline, no `grep -q`, nothing that can close a read end early — bounded at
   `shift <= 3000`, refusing on exhaustion. Rehearsed five cases this response: real free ports
   (`using E2E_PORT_SHIFT=300`); a fake `ss` reporting one port busy, advancing to `600`; `ss()
{ return 127; }` stopping before any Nx invocation with `ss failed to inspect listening ports
(exit 127); refusing to guess port availability`; a synthetic 5000-line `ss` listing with one
   occupied candidate near the end, correctly rejecting `300` and accepting `600` in `0.07s`
   (proving the bounded match, not a pipeline, is what finds it); and every candidate port reported
   busy up to `3000`, correctly refusing with `no free port shift found up to 3000`.
2. **The two-disposer correction was absent from the actual packet listing — FIXED, section 3.1,
   section 6 (new mutation row), section 7.2. Also, this round's own diff for section 7.2 was itself
   corrupt (`git apply --check` failed), and the mutant this item describes masked the check it was
   meant to prove — both caught by review 8, genuinely fixed in section 20.** Section 7.2's own diff
   for `application-bootstrap.test.tsx` now resolves `completing` before `rejecting` (matching DI
   Bag's own reverse-order disposal, so `rejecting`'s own disposer runs first and `completing`'s
   runs second, after the rejection), captures the real `close()` promise `retire()` awaits (not a
   second, parallel `bag.close()` call), asserts it rejects with `DiBagCleanupError`, and compares
   the logged occurrence id with the slot's own fatal fault (`logged.mock.calls[0]?.[2]` against
   `state.fault.occurrenceId`). Slice 1's own mutation table gains a new row: replacing `close` with
   a hand-rolled version that rejects directly, without ever calling `bag.close()` (so
   `completing`'s own disposer never runs), rehearsed fresh this response and failing exactly at the
   `DiBagCleanupError` assertion — `expected Error to be an instance of DiBagCleanupError` —
   restored and confirmed green again. **Review 8 found this mutant changes the rejection's own
   type as well as suppressing cleanup, so it fails at the earlier `DiBagCleanupError` assertion
   before `otherDisposerRan` is ever reached — the wrong assertion for what the adjacent comment
   claimed. Section 20 has the corrected mutant, which preserves the `DiBagCleanupError` type and
   fails at `otherDisposerRan` instead.**
3. **Historical counts substituted for attempt baselines — FIXED, section 6.** Each slice's own
   "start" step now runs a pre-edit sandbox-subset run and a pre-edit strict-OpenSpec run, named
   and rehearsed fresh this response, in addition to its own pre-edit owned-path run: slice 1 on
   the unchanged `76f871d8` tree, slice 2 on slice 1's own finished tree, slice 3 on slice 2's own
   finished tree — all three read `46 files / 674 tests` and `114`/`114`/`0`, confirming section
   3.4's own baseline held at every slice boundary rather than being assumed to. Section 8's own
   OpenSpec stop condition now names six checked points (start and end of each slice) instead of
   two.
4. **Slice 2's required proof comments fell outside its own commit inventory — FIXED, section 6.**
   `application-bootstrap.tsx` is now in slice 2's own "Owned paths", explicitly for proof comments
   only: slice 2 is authorized to mutate it temporarily to rehearse mutation rows 5, 13, 14 and 15
   (restored byte-for-byte before the next, `git diff` empty each time) and commits a small,
   comment-only diff adding the four `Proof:` comments those rehearsals earn, adjacent to the exact
   lines each mutation touches. Rehearsed this response: the comment-only diff applies cleanly on
   slice 1's own finished tree, `tsc --build --force` exits 0, and both
   `application-bootstrap.test.tsx` and `application-bootstrap.model.test.tsx` stay green (`18/18`)
   with the comments in place. Row 15's own observed count is also corrected: a fresh rehearsal
   this response reads `Property failed after 87 tests`, not the `86` recorded in round 6 — no
   mutation is asserted anywhere in this packet by a count that was not re-observed this response.

### Minor

1. **Historical dispositions still contradicted executable instructions — FIXED, section 13,
   section 17, section 8.** Section 13 gains a preface marking sections 13–17 historical, with
   section 6/section 8 as the only current, authoritative source. Section 17 item 2's own `3
failed | 0 passed (3)` claim is marked superseded, pointing at section 6's own corrected `2 failed
| 1 passed (3)`. Section 8's own owned-path stop condition now states that slice 2 changes an
   existing collected test and adds four comment-only lines to a production file, neither of which
   is a new test case, rather than claiming slice 2 touches no owned-path file at all.
2. **Step 3c was duplicated — FIXED, section 6.** The task-note checkbox edit now appears once,
   immediately before the verify.md append and the final format check.

### Verified, independently, this response

- Every finding above closed by an edit at the location named, `grep -n` against the finished
  packet after editing, not before.
- `git diff 76f871d8 -- apps/wbs/fe-01` is empty at the end of this round's own rehearsal, same as
  every prior round: only this document differs from the planning head.

## 20. Disposition of review 8

Review verdict: READY AFTER FIXES, one Critical and two Important findings. Per the coordinator's
own instruction, every fenced diff in the packet was extracted and checked with `git apply --check`
in slice order against the correct predecessor tree before any other work this round — see the
self-check below.

### Self-check: every fenced diff, `git apply --check`, in slice order

Against the unchanged `76f871d8` tree (slice 1's own predecessor):

- `application-bootstrap.tsx` (§7.1): exit 0.
- `application-bootstrap.test.tsx` (§7.2): **exit 128, `corrupt patch at line 11`** — confirmed the
  reviewer's own finding before any fix.
- `e2e/lifetime-fault-probe.ts` (§7.3): exit 0.
- `application-bootstrap.model.test.tsx`, slice 1's own compatibility diff (§7.4): exit 0.
- `application-bootstrap.strictmode.test.tsx` (§7.5): exit 0.

Slice 1's own real diffs applied for real (not `--check`) to build the true slice-1-finished tree;
`application-bootstrap.test.tsx` reconstructed from the evidence commit's own known-good content
since its packet diff would not apply; `git diff` against that reconstructed file regenerated a
correct 735-line replacement, verified to `patch`-apply against the unchanged tree and reproduce
the reconstructed file byte-for-byte.

Against slice 1's own finished tree:

- `application-bootstrap.model.test.tsx`, slice 2's own feature diff (§7.4): exit 0.
- `application-bootstrap.tsx`, slice 2's own comment-only diff (§6): **exit 128, `corrupt patch at
line 46`** — confirmed. Regenerated as a 46-line diff from the actual four `Proof:` comments
  applied for real to the working tree; verified with `patch --dry-run` (the checked-out git index
  was at baseline, not slice 1's own tree, so `git apply --check` alone could not target the right
  predecessor — `patch` against a scratch copy of slice 1's own finished file confirmed it) and by
  applying for real and diffing the result against the known finished file: byte-identical.

Against slice 2's own finished tree:

- `e2e/lifetime-bfcache-probe.ts` (§7.6, new file): exit 0.
- `e2e/lifetime-bfcache.spec.ts` (§7.7, new file): exit 0.
- `playwright.config.ts` (§7.8): exit 0.
- `playwright-config.test.ts` (§7.9): exit 0.

All eleven diffs applied for real, in this order, produced a tree that typechecks clean (`tsc
--build --force`: exit 0) and both corrected diffs are now the ones embedded in the packet, replacing
the corrupt ones verbatim.

### Important

1. **The disposal proof still tested the wrong fact — CLAIMED FIXED, section 6, section 7.2,
   section 19, but review 9 found the "returns `Promise.reject(new DiBagCleanupError([]))` directly"
   description, read literally, drops the `closeOutcome.current` capture the test's own setup check
   depends on, reaching `setup: close() was never called` before either assertion — genuinely fixed
   in section 21.** The cleanup-suppression mutant previously rejected with a plain `Error`,
   changing the rejection's own type as well as suppressing cleanup, so it failed at the earlier
   `rejects.toBeInstanceOf(DiBagCleanupError)` assertion — never reaching `otherDisposerRan` at all
   — while its own adjacent comment (and the mutation table's own "Observed" column) claimed the
   `otherDisposerRan` assertion had failed. Fixed: the mutant now returns `Promise.reject(new
DiBagCleanupError([]))` directly, without calling `bag.close()`, preserving the exact type the
   first assertion expects. Rehearsed fresh this response: the test fails at the **second**
   assertion, `the other owned disposer never ran: expected false to be true`; restored, `git diff`
   empty, confirmed green again (`1 passed`). The table row, its adjacent prose and section 19's own
   historical entry are all updated with this observation.
2. **Stop conditions still compared against historical absolutes — FIXED, section 3.4, section 8.**
   Section 3.4 gains two named, rehearsed-fresh planner pre-implementation whole-target baselines
   (`planner-baseline-test-unit`: `48 files / 694 tests`; `planner-baseline-test-whole`: `131 files /
2981 tests` UTC plus `2 files / 3 tests` zoned, `8m 0s`, exit 0 — both rehearsed on the unchanged
   tree this response). Section 8's own sandbox-subset, owned-path and OpenSpec stop conditions now
   name each slice's own "start" evidence file instead of section 3.4's historical figure read as an
   absolute; the owned-path condition states the required delta explicitly per slice (`+11` over
   slice 1's own `99`-test start, `+0` over slice 2's own `110`-test start); the final planner
   condition compares `wbs-fe-01:test:unit`/`wbs-fe-01:test` against this same response's own named
   pre-implementation baselines, not a bare `694`/`2981`.

### Verified, independently, this response

- Every fenced diff in the packet re-extracted and `git apply --check`ed (or `patch --dry-run`ed
  where the git index could not supply the right predecessor) in slice order, against the correct
  tree at each step, both before and after the fix — not asserted from memory.
- `git diff 76f871d8 -- apps/wbs/fe-01` is empty at the end of this round's own rehearsal: only this
  document differs from the planning head.

## 21. Disposition of review 9

Review verdict: READY AFTER FIXES, four small findings, the last before dispatch review.

### Important

1. **The cleanup-suppression mutant could still fail at setup instead of proving continued cleanup
   — FIXED, section 6 (new code block), section 7.2, section 20.** The round-8 description
   ("returns `Promise.reject(new DiBagCleanupError([]))` directly") did not spell out the
   `closeOutcome.current` capture the test's own setup check depends on; a literal direct-return
   replacement reaches `setup: close() was never called` before either assertion. Fixed: the exact
   replacement code is now given verbatim, capturing `closeOutcome.current` before returning.
   Rehearsed fresh this response: `AssertionError: the other owned disposer never ran: expected
false to be true` at `application-bootstrap.test.tsx:687`, the `DiBagCleanupError` assertion
   passing first; restored, `git diff` empty, confirmed green again (`1 passed`).
2. **Historical totals still controlled planner acceptance, and slices 1–2 lacked post-edit
   sandbox runs — FIXED, section 3.4, section 6, section 8.** Section 3.4's own four numbered items
   and its planner block now label every literal total "historical, this response, on `76f871d8`" —
   never the dispatch baseline. Section 8's own final stop condition is now stated as a pure delta
   against the planner's own dispatch-time baseline (`planner-baseline-test-unit` /
   `planner-baseline-test-whole`, captured as the planner's own first dispatch step, on the actual
   dispatch base, before slice 1 begins) — unit tests same file count plus 3, UTC tests same file
   count plus 14, zoned unchanged — with this response's own historical rehearsal offered only as
   illustration. Slices 1 and 2 each gain a post-edit sandbox-subset confirmation
   (`slice1-sandbox-confirm`, `slice2-sandbox-confirm`), rehearsed fresh this response against the
   correct intermediate tree: `46 files / 674 tests` at both points, matching each slice's own
   pre-edit start figure exactly. Section 8's own sandbox-subset condition now names six checked
   points — three pre-edit, three post-edit — instead of assuming the figure holds between them.

### Minor

1. **The owned-path stop condition specified the wrong file delta — FIXED, section 8.** "exactly
   `+11` files/tests" is now "unchanged file count and exactly 11 additional tests", matching the
   adjacent table (`0` files, `+11` tests) and the fact that no owned-path test _file_ is added.
2. **Section 20's own opening disposition misreported round 8's severity — FIXED, section 20.**
   "no criticals in the reviewer's own numbering (... reinterpretation)" is now "one Critical and
   two Important findings", matching `review8.md`'s own `## Critical` heading.

### Verified, independently, this response

- The exact mutant code the reviewer supplied was applied verbatim to a reconstructed slice-1
  tree, rehearsed, and produced the required failure before being restored.
- Both sandbox-subset post-edit confirmations were rehearsed fresh against reconstructed
  slice-1-finished and slice-2-finished trees, not carried forward from an earlier round.
- `git diff 76f871d8 -- apps/wbs/fe-01` is empty at the end of this round's own rehearsal: only
  this document differs from the planning head.
